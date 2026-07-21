import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  externalAiConsent,
  fleets,
  pilotSettings,
  vehicles,
} from "../../drizzle/schema";
import { ENV } from "../_core/env";
import {
  evaluatePilotReadiness,
  type ReadinessResult,
} from "@shared/maintenance/pilotReadiness";
import { getFleetMaintenanceCapabilities } from "./fleetFeatures";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

export async function getPilotSettings(fleetId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(pilotSettings).where(eq(pilotSettings.fleetId, fleetId)).limit(1);
  return row ?? null;
}

// Internal admins configure pilot settings. Owners/managers get visibility only.
export async function upsertPilotSettings(input: {
  fleetId: number;
  actorUserId: number;
  patch: Partial<{
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    primaryManagerUserId: number | null;
    backupManagerUserId: number | null;
    enrolledVehicleIds: string[];
    notificationRecipients: number[];
    baseline: Record<string, unknown>;
    authorizationPolicy: Record<string, unknown>;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const existing = await getPilotSettings(input.fleetId);
  const p = input.patch;
  const values = {
    status: p.status ?? existing?.status ?? "not_started",
    startDate: p.startDate === undefined ? existing?.startDate ?? null : p.startDate,
    endDate: p.endDate === undefined ? existing?.endDate ?? null : p.endDate,
    primaryManagerUserId:
      p.primaryManagerUserId === undefined ? existing?.primaryManagerUserId ?? null : p.primaryManagerUserId,
    backupManagerUserId:
      p.backupManagerUserId === undefined ? existing?.backupManagerUserId ?? null : p.backupManagerUserId,
    enrolledVehicleIdsJson: (p.enrolledVehicleIds ?? existing?.enrolledVehicleIdsJson ?? null) as never,
    notificationRecipientsJson: (p.notificationRecipients ?? existing?.notificationRecipientsJson ?? null) as never,
    baselineJson: (p.baseline ?? existing?.baselineJson ?? null) as never,
    authorizationPolicyJson: (p.authorizationPolicy ?? existing?.authorizationPolicyJson ?? null) as never,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(pilotSettings).set(values).where(eq(pilotSettings.id, existing.id));
  } else {
    await db.insert(pilotSettings).values({ fleetId: input.fleetId, createdByUserId: input.actorUserId, ...values });
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "pilot_settings_changed",
    entityType: "pilotSettings",
    details: { status: values.status },
  });

  return getPilotSettings(input.fleetId);
}

export async function getConsent(fleetId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(externalAiConsent).where(eq(externalAiConsent.fleetId, fleetId)).limit(1);
  return row ?? null;
}

// Consent authority (§37): owners grant/withdraw; internal admins record with
// evidence but may not impersonate fleet consent (source distinguishes them).
export async function setConsent(input: {
  fleetId: number;
  actorUserId: number;
  action: "grant" | "withdraw";
  source: "fleet_owner" | "internal_admin";
  purpose?: string | null;
  provider?: string | null;
  model?: string | null;
  regionDisclosure?: string | null;
  disclosureVersion?: string | null;
  expiresAt?: Date | null;
  evidence?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const now = new Date();
  const existing = await getConsent(input.fleetId);
  const status = input.action === "grant" ? "granted" : "withdrawn";

  const values = {
    status,
    purpose: input.purpose ?? existing?.purpose ?? null,
    consentAt: input.action === "grant" ? now : existing?.consentAt ?? null,
    withdrawnAt: input.action === "withdraw" ? now : null,
    expiresAt: input.expiresAt === undefined ? existing?.expiresAt ?? null : input.expiresAt,
    consentingUserId: input.source === "fleet_owner" ? input.actorUserId : existing?.consentingUserId ?? null,
    internalRecorderUserId: input.source === "internal_admin" ? input.actorUserId : existing?.internalRecorderUserId ?? null,
    source: input.source,
    evidenceJson: (input.evidence ?? existing?.evidenceJson ?? null) as never,
    provider: input.provider ?? existing?.provider ?? null,
    model: input.model ?? existing?.model ?? null,
    regionDisclosure: input.regionDisclosure ?? existing?.regionDisclosure ?? null,
    disclosureVersion: input.disclosureVersion ?? existing?.disclosureVersion ?? null,
    updatedAt: now,
  };

  if (existing) {
    await db.update(externalAiConsent).set(values).where(eq(externalAiConsent.id, existing.id));
  } else {
    await db.insert(externalAiConsent).values({ fleetId: input.fleetId, ...values });
  }

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "ai_consent_changed",
    entityType: "externalAiConsent",
    details: { status, source: input.source },
  });

  return getConsent(input.fleetId);
}

// Whether external AI processing is currently permitted (granted + not expired).
export function isConsentActive(consent: { status: string; expiresAt: Date | null } | null, now = new Date()): boolean {
  if (!consent || consent.status !== "granted") return false;
  if (consent.expiresAt && new Date(consent.expiresAt).getTime() < now.getTime()) return false;
  return true;
}

function storageConfigured(): boolean {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function diagnosisConfigured(): boolean {
  return Boolean(
    ENV.openRouterApiKey || ENV.openAiApiKey || ENV.anthropicApiKey || ENV.geminiApiKey
  );
}

// Gather inputs from settings/features/consent/vehicles and evaluate readiness.
export async function computePilotReadiness(fleetId: number): Promise<ReadinessResult> {
  const db = await getDb();
  const [settings, consent, capabilities] = await Promise.all([
    getPilotSettings(fleetId),
    getConsent(fleetId),
    getFleetMaintenanceCapabilities(fleetId),
  ]);

  let enrolledCount = 0;
  if (settings?.enrolledVehicleIdsJson && Array.isArray(settings.enrolledVehicleIdsJson)) {
    enrolledCount = (settings.enrolledVehicleIdsJson as unknown[]).length;
  } else if (db) {
    const rows = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.fleetId, fleetId));
    enrolledCount = rows.length;
  }

  const hasValidDates =
    settings?.startDate != null &&
    settings?.endDate != null &&
    new Date(settings.startDate).getTime() < new Date(settings.endDate).getTime();

  const authPolicy = (settings?.authorizationPolicyJson ?? {}) as { fleetLimitCents?: number | null };

  return evaluatePilotReadiness({
    hasValidDates: !!hasValidDates,
    hasPrimaryAuthorizedManager: settings?.primaryManagerUserId != null,
    hasEnrolledVehicle: enrolledCount > 0,
    diagnosisAvailable: diagnosisConfigured(),
    requiredFeaturesEnabled: capabilities.pilotEligible && capabilities.maintenanceCases,
    documentsEnabled: capabilities.repairDocumentReview,
    storageOperational: storageConfigured(),
    externalProcessingEnabled: capabilities.repairDocumentReview,
    consentDecisionMade: consent != null && consent.status !== "none",
    hasBackupManager: settings?.backupManagerUserId != null,
    baselineComplete: settings?.baselineJson != null,
    hasAuthorizationLimit: authPolicy?.fleetLimitCents != null,
  });
}
