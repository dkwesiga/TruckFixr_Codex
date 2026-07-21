import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { fleetFeatures } from "../../drizzle/schema";
import {
  ALL_FLEET_MAINTENANCE_FEATURE_KEYS,
  FLEET_MAINTENANCE_CAPABILITY_FLAGS,
  FLEET_MAINTENANCE_UMBRELLA_FLAG,
  type FleetMaintenanceCapabilityFlag,
} from "@shared/maintenance/featureKeys";
import { logMaintenanceActivity } from "./maintenanceActivityLog";

// -----------------------------------------------------------------------------
// Per-fleet feature flags. Backend checks are authoritative and fail CLOSED:
// no database, no row, or enabled=false all resolve to "disabled". The umbrella
// flag (`fleet_maintenance_pilot`) establishes eligibility only; it never
// implies any capability is on. Capabilities must be explicitly enabled.
// -----------------------------------------------------------------------------

export type FleetFeatureRecord = {
  fleetId: number;
  featureKey: string;
  enabled: boolean;
  valueJson: unknown;
};

export async function getFleetFeature(
  fleetId: number,
  featureKey: string
): Promise<FleetFeatureRecord | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select({
      fleetId: fleetFeatures.fleetId,
      featureKey: fleetFeatures.featureKey,
      enabled: fleetFeatures.enabled,
      valueJson: fleetFeatures.valueJson,
    })
    .from(fleetFeatures)
    .where(
      and(
        eq(fleetFeatures.fleetId, fleetId),
        eq(fleetFeatures.featureKey, featureKey)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function isFleetFeatureEnabled(
  fleetId: number,
  featureKey: string
): Promise<boolean> {
  const row = await getFleetFeature(fleetId, featureKey);
  return row?.enabled === true;
}

export async function getFleetFeatureConfig<T = unknown>(
  fleetId: number,
  featureKey: string
): Promise<T | null> {
  const row = await getFleetFeature(fleetId, featureKey);
  if (!row || row.enabled !== true) return null;
  return (row.valueJson as T) ?? null;
}

// A capability is effective only when BOTH the umbrella pilot flag AND the
// capability flag are enabled. This is the single source of truth used by
// routers and services.
export async function isFleetCapabilityEnabled(
  fleetId: number,
  capabilityKey: FleetMaintenanceCapabilityFlag
): Promise<boolean> {
  const [umbrella, capability] = await Promise.all([
    isFleetFeatureEnabled(fleetId, FLEET_MAINTENANCE_UMBRELLA_FLAG),
    isFleetFeatureEnabled(fleetId, capabilityKey),
  ]);
  return umbrella && capability;
}

export class FleetFeatureDisabledError extends TRPCError {
  constructor(featureKey: string) {
    super({
      code: "FORBIDDEN",
      message: `This capability is not enabled for your fleet (${featureKey}).`,
    });
  }
}

// Throws FORBIDDEN when the capability is not effectively enabled. Requires the
// umbrella flag too, unless `requireUmbrella` is explicitly false (used when
// checking the umbrella flag itself).
export async function requireFleetFeature(
  fleetId: number,
  featureKey: string,
  opts: { requireUmbrella?: boolean } = {}
): Promise<void> {
  const requireUmbrella = opts.requireUmbrella ?? true;

  if (featureKey === FLEET_MAINTENANCE_UMBRELLA_FLAG) {
    if (!(await isFleetFeatureEnabled(fleetId, FLEET_MAINTENANCE_UMBRELLA_FLAG))) {
      throw new FleetFeatureDisabledError(FLEET_MAINTENANCE_UMBRELLA_FLAG);
    }
    return;
  }

  if (requireUmbrella) {
    const umbrella = await isFleetFeatureEnabled(
      fleetId,
      FLEET_MAINTENANCE_UMBRELLA_FLAG
    );
    if (!umbrella) {
      throw new FleetFeatureDisabledError(FLEET_MAINTENANCE_UMBRELLA_FLAG);
    }
  }

  if (!(await isFleetFeatureEnabled(fleetId, featureKey))) {
    throw new FleetFeatureDisabledError(featureKey);
  }
}

export type FleetMaintenanceCapabilities = {
  pilotEligible: boolean;
  fleetHealthDashboard: boolean;
  vehicleAttentionScore: boolean;
  normalizedVehicleEvents: boolean;
  integrationIngestion: boolean;
  pmSchedules: boolean;
  repairOutcomeCaptureV2: boolean;
  maintenanceCases: boolean;
  repairDocumentReview: boolean;
  pilotMetrics: boolean;
};

// Single batched read of every pilot flag for a fleet. Every capability is
// gated behind the umbrella flag so a disabled pilot reports everything off.
export async function getFleetMaintenanceCapabilities(
  fleetId: number
): Promise<FleetMaintenanceCapabilities> {
  const db = await getDb();
  const disabled: FleetMaintenanceCapabilities = {
    pilotEligible: false,
    fleetHealthDashboard: false,
    vehicleAttentionScore: false,
    normalizedVehicleEvents: false,
    integrationIngestion: false,
    pmSchedules: false,
    repairOutcomeCaptureV2: false,
    maintenanceCases: false,
    repairDocumentReview: false,
    pilotMetrics: false,
  };
  if (!db) return disabled;

  const rows = await db
    .select({
      featureKey: fleetFeatures.featureKey,
      enabled: fleetFeatures.enabled,
    })
    .from(fleetFeatures)
    .where(eq(fleetFeatures.fleetId, fleetId));

  const enabledKeys = new Set(
    rows.filter((r) => r.enabled === true).map((r) => r.featureKey)
  );

  const pilotEligible = enabledKeys.has(FLEET_MAINTENANCE_UMBRELLA_FLAG);
  if (!pilotEligible) return disabled;

  const on = (key: FleetMaintenanceCapabilityFlag) => enabledKeys.has(key);
  const c = FLEET_MAINTENANCE_CAPABILITY_FLAGS;

  return {
    pilotEligible: true,
    fleetHealthDashboard: on(c.fleetHealthDashboard),
    vehicleAttentionScore: on(c.vehicleAttentionScore),
    normalizedVehicleEvents: on(c.normalizedVehicleEvents),
    integrationIngestion: on(c.integrationIngestion),
    pmSchedules: on(c.pmSchedules),
    repairOutcomeCaptureV2: on(c.repairOutcomeCaptureV2),
    maintenanceCases: on(c.maintenanceCases),
    repairDocumentReview: on(c.repairDocumentReview),
    pilotMetrics: on(c.pilotMetrics),
  };
}

// Upsert a feature flag for a fleet and log the change. `actorUserId` is the
// user (fleet or internal admin) making the change; it is recorded for audit.
export async function setFleetFeature(input: {
  fleetId: number;
  featureKey: string;
  enabled: boolean;
  valueJson?: unknown;
  actorUserId: number;
}): Promise<FleetFeatureRecord | null> {
  if (
    !(ALL_FLEET_MAINTENANCE_FEATURE_KEYS as readonly string[]).includes(
      input.featureKey
    )
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown fleet feature key: ${input.featureKey}`,
    });
  }

  const db = await getDb();
  if (!db) return null;

  const now = new Date();
  const existing = await getFleetFeature(input.fleetId, input.featureKey);

  if (existing) {
    const [updated] = await db
      .update(fleetFeatures)
      .set({
        enabled: input.enabled,
        valueJson:
          input.valueJson === undefined
            ? existing.valueJson
            : (input.valueJson as never),
        updatedByUserId: input.actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(fleetFeatures.fleetId, input.fleetId),
          eq(fleetFeatures.featureKey, input.featureKey)
        )
      )
      .returning({
        fleetId: fleetFeatures.fleetId,
        featureKey: fleetFeatures.featureKey,
        enabled: fleetFeatures.enabled,
        valueJson: fleetFeatures.valueJson,
      });

    await logMaintenanceActivity({
      fleetId: input.fleetId,
      userId: input.actorUserId,
      action: "fleet_feature_changed",
      entityType: "fleetFeature",
      details: {
        featureKey: input.featureKey,
        enabled: input.enabled,
        previousEnabled: existing.enabled,
      },
    });

    return updated ?? existing;
  }

  const [created] = await db
    .insert(fleetFeatures)
    .values({
      fleetId: input.fleetId,
      featureKey: input.featureKey,
      enabled: input.enabled,
      valueJson: (input.valueJson ?? null) as never,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      fleetId: fleetFeatures.fleetId,
      featureKey: fleetFeatures.featureKey,
      enabled: fleetFeatures.enabled,
      valueJson: fleetFeatures.valueJson,
    });

  await logMaintenanceActivity({
    fleetId: input.fleetId,
    userId: input.actorUserId,
    action: "fleet_feature_changed",
    entityType: "fleetFeature",
    details: {
      featureKey: input.featureKey,
      enabled: input.enabled,
      previousEnabled: false,
    },
  });

  return created ?? null;
}
