import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getDb } from "../../server/db";
import { ENV } from "../../server/_core/env";
import { hashPassword } from "../../server/_core/localUsers";
import {
  activityLogs,
  adminAlerts,
  aiQualityReviews,
  aiRequestLogs,
  aiTriageRecords,
  aiUsageLogs,
  companyInvitations,
  companyJoinRequests,
  companyMemberships,
  defects,
  diagnosticModelComparisons,
  diagnosticReviewQueue,
  driverInvitations,
  fleets,
  inAppAlerts,
  inspectionChecklistResponses,
  inspectionFlags,
  inspectionPhotos,
  inspections,
  maintenanceLogs,
  onboardingSteps,
  randomProofRequests,
  repairOutcomes,
  subscriptions,
  tadisAlerts,
  users,
  vehicleAccessRequests,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";
import { canManageCompanyOperations } from "../../server/services/companyAccess";
import {
  canViewVehicle,
  listDriverAccessibleVehiclesAcrossFleets,
} from "../../server/services/vehicleAccess";
import { buildPlaceholderSvgDataUri } from "../../shared/demoAssets";
import {
  DEMO_COMPANIES,
  DEMO_COMPANY_EMAILS,
  DEMO_COMPANY_NAMES,
  DEMO_EMAIL_DOMAIN,
  DEMO_INVITE_CODES,
  DEMO_SEED_KEY,
  DEMO_SHARED_PASSWORD,
  DEMO_USER_EMAILS,
  type DemoBusinessStatus,
  type DemoCompanyKey,
  type DemoCompanySeed,
  type DemoRole,
  type DemoUserSeed,
  type DemoVehicleSeed,
} from "./demoSeedConfig";

type DemoDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type SeededUser = {
  id: number;
  openId: string;
  email: string;
  role: DemoRole;
};

type InspectionResultStatus = "safe" | "needs_review" | "flagged";

type InspectionSeedResult = {
  inspectionId: number;
  defectId: number | null;
};

type ValidationCheck = {
  name: string;
  ok: boolean;
  details: string;
};

type CompanySeedSummary = {
  companyKey: DemoCompanyKey;
  fleetId: number;
  vehicleCount: number;
  userIds: number[];
};

type DemoSeedSummary = {
  authMode: "supabase_admin" | "local_email";
  companies: Array<{
    companyKey: DemoCompanyKey;
    name: string;
    fleetId: number;
    users: Array<{ email: string; id: number; role: DemoRole }>;
    vehicles: Array<{ id: string; unitNumber: string; businessStatus: DemoBusinessStatus }>;
  }>;
  password: string;
  manifestPath: string;
};

type SupabaseAdminUser = {
  id: string;
  email?: string | null;
};

const DEMO_OUTPUT_PATH = join(process.cwd(), "exports", "demo-seed", "demo-seed-manifest.json");
const MILLIS_IN_DAY = 24 * 60 * 60 * 1000;

function now() {
  return new Date();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toOpenId(supabaseUserId: string | null) {
  return supabaseUserId ? `supabase_${supabaseUserId}` : "";
}

function getAuthMode() {
  return ENV.supabaseUrl && ENV.supabaseServiceRoleKey ? "supabase_admin" : "local_email";
}

function getDemoBaseTimestamp(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * MILLIS_IN_DAY);
}

function buildDocumentUrl(companyKey: DemoCompanyKey, unitNumber: string, name: string) {
  return `https://truckfixr-demo.invalid/${companyKey}/${unitNumber.toLowerCase()}/${name}`;
}

function buildVehicleConfig(company: DemoCompanySeed, vehicle: DemoVehicleSeed) {
  const isTrailer = vehicle.assetType === "trailer";
  const isBus = vehicle.vehicleType === "bus";
  const isServiceTruck = vehicle.bodyStyle === "service_truck";

  return {
    airBrakes: true,
    hydraulicBrakes: isBus || isServiceTruck,
    trailerAttached: vehicle.assetType === "tractor",
    couplingSystem: vehicle.assetType === "tractor" || isTrailer,
    airSuspension: true,
    steeringAssist: true,
    emergencyEquipment: true,
    clearanceLights: true,
    demoSeedKey: DEMO_SEED_KEY,
    demoCompany: company.key,
    demoBusinessStatus: vehicle.businessStatus,
    demoIssue: vehicle.demoIssue ?? null,
    demoSegment: company.segment,
    syntheticVin: true,
    syntheticVinNotice:
      "Synthetic demo VIN for TruckFixr seed data only. It may not decode through NHTSA or OEM services.",
    fuelLabel: vehicle.fuelLabel,
    bodyStyle: vehicle.bodyStyle ?? null,
    cabStyle: vehicle.cabStyle ?? null,
    documents: [
      {
        type: "vin_photo",
        label: "VIN photo placeholder",
        url: buildDocumentUrl(company.key, vehicle.unitNumber, "vin-photo.jpg"),
      },
      {
        type: "odometer_photo",
        label: "Odometer photo placeholder",
        url: buildDocumentUrl(company.key, vehicle.unitNumber, "odometer-photo.jpg"),
      },
      {
        type: "annual_safety_certificate",
        label: "Annual safety certificate placeholder",
        url: buildDocumentUrl(company.key, vehicle.unitNumber, "annual-safety-certificate.pdf"),
      },
      {
        type: "aftertreatment_service_document",
        label: "Aftertreatment service document placeholder",
        url: buildDocumentUrl(company.key, vehicle.unitNumber, "aftertreatment-service-note.pdf"),
      },
    ],
  };
}

function mapVehicleState(businessStatus: DemoBusinessStatus) {
  switch (businessStatus) {
    case "active_road_ready":
      return { status: "active" as const, complianceStatus: "green" as const };
    case "maintenance_due_soon":
      return { status: "maintenance" as const, complianceStatus: "yellow" as const };
    case "overdue_maintenance":
      return { status: "maintenance" as const, complianceStatus: "red" as const };
    case "urgent_repair_do_not_dispatch":
      return { status: "maintenance" as const, complianceStatus: "red" as const };
    case "out_of_service":
      return { status: "retired" as const, complianceStatus: "red" as const };
    case "compliance_risk":
      return { status: "active" as const, complianceStatus: "yellow" as const };
  }
}

function getPlanLimits(company: DemoCompanySeed) {
  switch (company.planName) {
    case "small_fleet":
      return {
        poweredVehicleLimit: 10,
        includedTrailerLimit: 8,
        totalActiveTrailerLimit: 8,
        aiSessionMonthlyLimit: 250,
      };
    case "fleet_growth":
      return {
        poweredVehicleLimit: 20,
        includedTrailerLimit: 12,
        totalActiveTrailerLimit: 12,
        aiSessionMonthlyLimit: 500,
      };
    case "fleet_pro":
      return {
        poweredVehicleLimit: 35,
        includedTrailerLimit: 20,
        totalActiveTrailerLimit: 20,
        aiSessionMonthlyLimit: 1000,
      };
  }
}

function createManagerSummary(input: {
  unitNumber: string;
  headline: string;
  recommendedAction: string;
  driveGuidance: string;
}) {
  return `${input.unitNumber}: ${input.headline} Recommended action: ${input.recommendedAction} Guidance: ${input.driveGuidance}`;
}

function buildProofPhoto(companyKey: DemoCompanyKey, label: string) {
  return buildPlaceholderSvgDataUri(`${companyKey.toUpperCase()} ${label}`);
}

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function writeJson(path: string, value: unknown) {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertDemoSeedEnabled() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seed is blocked until ALLOW_DEMO_SEED=true is set.");
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_PRODUCTION_SEED !== "true") {
    throw new Error(
      "Demo seed is blocked in production unless ALLOW_DEMO_PRODUCTION_SEED=true is explicitly set."
    );
  }
}

function assertSafeDemoDatabaseTarget() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for demo seeding.");
  }

  let hostname = "";
  try {
    hostname = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL is invalid.");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(hostname) && process.env.ALLOW_DEMO_REMOTE_SEED !== "true") {
    throw new Error(
      "Demo seed is blocked for remote DATABASE_URL targets unless ALLOW_DEMO_REMOTE_SEED=true is set."
    );
  }
}

async function requestSupabaseAdmin<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  const baseUrl = ENV.supabaseUrl.replace(/\/$/, "");
  const apiKey = ENV.supabaseServiceRoleKey;
  if (!baseUrl || !apiKey) {
    throw new Error("Supabase admin auth is not configured.");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload &&
        typeof payload === "object" &&
        (payload as Record<string, unknown>).msg) ||
      (payload &&
        typeof payload === "object" &&
        (payload as Record<string, unknown>).message) ||
      response.statusText;
    throw new Error(`Supabase admin auth request failed: ${String(message)}`);
  }

  return payload as T;
}

async function findSupabaseAdminUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const payload = await requestSupabaseAdmin<{ users?: SupabaseAdminUser[] }>(
    "/auth/v1/admin/users?page=1&per_page=1000",
    { method: "GET" }
  );

  return (
    payload.users?.find(
      (user) => normalizeEmail(user.email ?? "") === normalizedEmail
    ) ?? null
  );
}

async function upsertSupabaseAdminUser(user: DemoUserSeed) {
  const existing = await findSupabaseAdminUserByEmail(user.email);
  const body = {
    email: normalizeEmail(user.email),
    password: DEMO_SHARED_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: user.name,
      name: user.name,
      demo_seed_key: DEMO_SEED_KEY,
      demo: true,
    },
    app_metadata: {
      demo_seed_key: DEMO_SEED_KEY,
      demo: true,
    },
  };

  if (existing?.id) {
    const updated = await requestSupabaseAdmin<SupabaseAdminUser>(
      `/auth/v1/admin/users/${existing.id}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      }
    );
    return updated;
  }

  const created = await requestSupabaseAdmin<SupabaseAdminUser>(
    "/auth/v1/admin/users",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return created;
}

async function deleteSupabaseAdminUserByEmail(email: string) {
  const existing = await findSupabaseAdminUserByEmail(email);
  if (!existing?.id) return false;
  await requestSupabaseAdmin<Record<string, never>>(
    `/auth/v1/admin/users/${existing.id}`,
    { method: "DELETE" }
  );
  return true;
}

async function upsertUserRow(
  db: DemoDb,
  input: DemoUserSeed & {
    openId: string;
    managerEmail?: string | null;
    managerUserId?: number | null;
  }
): Promise<SeededUser> {
  const passwordHash = await hashPassword(DEMO_SHARED_PASSWORD);
  const normalizedEmail = normalizeEmail(input.email);

  await db
    .insert(users)
    .values({
      openId: input.openId,
      name: input.name,
      email: normalizedEmail,
      passwordHash,
      loginMethod: "email",
      emailVerified: true,
      role: input.role,
      managerEmail: input.managerEmail ?? null,
      managerUserId: input.managerUserId ?? null,
      subscriptionTier: "fleet",
      billingCadence: "monthly",
      billingStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      lastSignedIn: now(),
      lastAuthAt: now(),
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        openId: input.openId,
        name: input.name,
        passwordHash,
        loginMethod: "email",
        emailVerified: true,
        role: input.role,
        managerEmail: input.managerEmail ?? null,
        managerUserId: input.managerUserId ?? null,
        subscriptionTier: "fleet",
        billingCadence: "monthly",
        billingStatus: "active",
        cancelAtPeriodEnd: false,
        lastSignedIn: now(),
        lastAuthAt: now(),
        updatedAt: now(),
      },
    });

  const [row] = await db
    .select({ id: users.id, openId: users.openId, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!row?.id || !row.email) {
    throw new Error(`Unable to upsert demo user ${normalizedEmail}`);
  }

  return {
    id: row.id,
    openId: row.openId,
    email: row.email,
    role: row.role as DemoRole,
  };
}

async function upsertFleetRow(db: DemoDb, company: DemoCompanySeed, ownerId: number) {
  const existing = (
    await db.select().from(fleets).where(eq(fleets.name, company.name)).limit(1)
  )[0];
  const planLimits = getPlanLimits(company);
  const vehicleCount = company.vehicles.filter((vehicle) => vehicle.assetType !== "trailer").length;
  const trailerCount = company.vehicles.filter((vehicle) => vehicle.assetType === "trailer").length;

  const payload = {
    name: company.name,
    ownerId,
    companyEmail: company.companyEmail,
    companyPhone: company.companyPhone,
    address: company.address,
    inviteCode: company.inviteCode,
    subscriptionOwnerUserId: ownerId,
    activeVehicleLimit: vehicleCount + trailerCount,
    subscriptionStatus: "active" as const,
    planName: company.planName,
    billingInterval: "monthly",
    billingStatus: "active" as const,
    poweredVehicleLimit: planLimits.poweredVehicleLimit,
    includedTrailerLimit: planLimits.includedTrailerLimit,
    paidExtraTrailerQuantity: 0,
    totalActiveTrailerLimit: planLimits.totalActiveTrailerLimit,
    aiSessionMonthlyLimit: planLimits.aiSessionMonthlyLimit,
    aiSessionsUsedCurrentPeriod: 0,
    aiSessionsResetAt: now(),
    premiumTadis: true,
    trialStartedAt: null,
    trialEndsAt: null,
    subscriptionStartedAt: now(),
    subscriptionRenewsAt: new Date(Date.now() + 30 * MILLIS_IN_DAY),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    isTrial: false,
    isPaidPilot: false,
    paidPilotStartedAt: null,
    paidPilotEndsAt: null,
    salesStatus: "demo",
    updatedAt: now(),
  };

  if (existing?.id) {
    const [updated] = await db
      .update(fleets)
      .set(payload)
      .where(eq(fleets.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(fleets)
    .values({
      ...payload,
      createdAt: now(),
    })
    .returning();

  if (!created) {
    throw new Error(`Unable to create demo fleet ${company.name}`);
  }

  return created;
}

async function clearFleetScopedDemoData(db: DemoDb, fleetId: number) {
  const ignoreMissingRelation = async (operation: Promise<unknown>) => {
    try {
      await operation;
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "cause" in error &&
        (error as { cause?: { code?: string } }).cause?.code
          ? (error as { cause?: { code?: string } }).cause?.code
          : undefined;

      if (code === "42P01") {
        return;
      }
      throw error;
    }
  };

  const deletions = [
    db.delete(companyInvitations).where(eq(companyInvitations.fleetId, fleetId)),
    db.delete(companyJoinRequests).where(eq(companyJoinRequests.fleetId, fleetId)),
    db.delete(driverInvitations).where(eq(driverInvitations.fleetId, fleetId)),
    db.delete(onboardingSteps).where(eq(onboardingSteps.fleetId, fleetId)),
    db.delete(inspectionChecklistResponses).where(eq(inspectionChecklistResponses.fleetId, fleetId)),
    db.delete(inspectionPhotos).where(eq(inspectionPhotos.fleetId, fleetId)),
    db.delete(randomProofRequests).where(eq(randomProofRequests.fleetId, fleetId)),
    db.delete(inspectionFlags).where(eq(inspectionFlags.fleetId, fleetId)),
    db.delete(aiTriageRecords).where(eq(aiTriageRecords.fleetId, fleetId)),
    db.delete(aiQualityReviews).where(eq(aiQualityReviews.fleetId, fleetId)),
    db.delete(diagnosticModelComparisons).where(eq(diagnosticModelComparisons.fleetId, fleetId)),
    db.delete(repairOutcomes).where(eq(repairOutcomes.fleetId, fleetId)),
    db.delete(maintenanceLogs).where(eq(maintenanceLogs.fleetId, fleetId)),
    db.delete(inAppAlerts).where(eq(inAppAlerts.fleetId, fleetId)),
    db.delete(adminAlerts).where(eq(adminAlerts.fleetId, fleetId)),
    db.delete(diagnosticReviewQueue).where(eq(diagnosticReviewQueue.fleetId, fleetId)),
    db.delete(vehicleAccessRequests).where(eq(vehicleAccessRequests.fleetId, fleetId)),
    db.delete(vehicleAssignments).where(eq(vehicleAssignments.fleetId, fleetId)),
    db.delete(subscriptions).where(eq(subscriptions.fleetId, fleetId)),
    db.delete(aiRequestLogs).where(eq(aiRequestLogs.companyId, fleetId)),
    db.delete(aiUsageLogs).where(eq(aiUsageLogs.fleetId, fleetId)),
    db.delete(tadisAlerts).where(eq(tadisAlerts.fleetId, fleetId)),
    db.delete(defects).where(eq(defects.fleetId, fleetId)),
    db.delete(inspections).where(eq(inspections.fleetId, fleetId)),
    db.delete(activityLogs).where(eq(activityLogs.fleetId, fleetId)),
    db.delete(vehicles).where(eq(vehicles.fleetId, fleetId)),
    db.delete(companyMemberships).where(eq(companyMemberships.fleetId, fleetId)),
  ];

  for (const deletion of deletions) {
    await ignoreMissingRelation(deletion);
  }
}

async function createMemberships(
  db: DemoDb,
  fleetId: number,
  owner: SeededUser,
  manager: SeededUser,
  drivers: SeededUser[]
) {
  const joinedAt = now();
  await db.insert(companyMemberships).values([
    {
      fleetId,
      userId: owner.id,
      role: "owner",
      status: "active",
      approvedByUserId: owner.id,
      joinedAt,
      createdAt: joinedAt,
      updatedAt: joinedAt,
    },
    {
      fleetId,
      userId: manager.id,
      role: "manager",
      status: "active",
      approvedByUserId: owner.id,
      joinedAt,
      createdAt: joinedAt,
      updatedAt: joinedAt,
    },
    ...drivers.map((driver) => ({
      fleetId,
      userId: driver.id,
      role: "driver" as const,
      status: "active" as const,
      approvedByUserId: manager.id,
      joinedAt,
      createdAt: joinedAt,
      updatedAt: joinedAt,
    })),
  ]);
}

async function createVehiclesForCompany(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  createdByUserId: number,
  usersByEmail: Map<string, SeededUser>
) {
  const rows = company.vehicles.map((vehicle, index) => {
    const driverId = vehicle.primaryDriverEmail
      ? usersByEmail.get(normalizeEmail(vehicle.primaryDriverEmail))?.id ?? null
      : null;
    const state = mapVehicleState(vehicle.businessStatus);
    return {
      id: vehicle.id,
      fleetId,
      assignedDriverId: driverId,
      assetType: vehicle.assetType,
      assetCategory: vehicle.assetType === "trailer" ? "trailer" : "powered_vehicle",
      vehicleType: vehicle.vehicleType,
      isPoweredVehicle: vehicle.assetType !== "trailer",
      isTrailer: vehicle.assetType === "trailer",
      unitNumber: vehicle.unitNumber,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      engineMake: vehicle.engineMake ?? null,
      model: vehicle.model,
      year: vehicle.year,
      mileage: vehicle.mileage ?? 0,
      engineHours: vehicle.engineHours ?? 0,
      configuration: buildVehicleConfig(company, vehicle),
      complianceStatus: state.complianceStatus,
      status: state.status,
      assetRecordStatus: "active" as const,
      trailerLinkStatus:
        vehicle.assetType === "trailer"
          ? vehicle.linkedPoweredVehicleId
            ? "linked"
            : "unlinked_active"
          : null,
      linkedPoweredVehicleId: vehicle.linkedPoweredVehicleId ?? null,
      createdByUserId,
      createdAt: new Date(Date.now() - (index + 1) * 60 * 60 * 1000),
      updatedAt: now(),
    };
  });

  await db.insert(vehicles).values(rows);
}

async function createAssignmentsForCompany(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  managerId: number,
  usersByEmail: Map<string, SeededUser>
) {
  const createdAt = now();
  const assignments: Array<typeof vehicleAssignments.$inferInsert> = [];

  for (const vehicle of company.vehicles) {
    const primaryDriver = vehicle.primaryDriverEmail
      ? usersByEmail.get(normalizeEmail(vehicle.primaryDriverEmail))
      : null;
    if (!primaryDriver) continue;
    assignments.push({
      fleetId,
      vehicleId: vehicle.id,
      driverUserId: primaryDriver.id,
      assignedByUserId: managerId,
      accessType: "permanent",
      startsAt: createdAt,
      status: "active",
      notes: `Demo seed permanent assignment for ${vehicle.unitNumber}`,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const temporaryAssignments: Record<DemoCompanyKey, Array<{ vehicleId: string; email: string; note: string }>> = {
    maple: [
      {
        vehicleId: "demo-maple-mrl-t202",
        email: "driver2.maple@truckfixr-demo.example.com",
        note: "Temporary reefer repositioning coverage",
      },
    ],
    peel: [
      {
        vehicleId: "demo-peel-pct-401",
        email: "driver2.peel@truckfixr-demo.example.com",
        note: "Temporary community route handoff",
      },
      {
        vehicleId: "demo-peel-pct-t502",
        email: "driver1.peel@truckfixr-demo.example.com",
        note: "Temporary reefer check assignment",
      },
    ],
    northstone: [
      {
        vehicleId: "demo-northstone-nsf-602",
        email: "driver2.northstone@truckfixr-demo.example.com",
        note: "Temporary day-cab coverage for site transfer",
      },
      {
        vehicleId: "demo-northstone-nsf-606",
        email: "driver1.northstone@truckfixr-demo.example.com",
        note: "Temporary service call coverage",
      },
    ],
  };

  for (const temp of temporaryAssignments[company.key]) {
    const driver = usersByEmail.get(normalizeEmail(temp.email));
    if (!driver) continue;
    assignments.push({
      fleetId,
      vehicleId: temp.vehicleId,
      driverUserId: driver.id,
      assignedByUserId: managerId,
      accessType: "temporary",
      startsAt: createdAt,
      expiresAt: new Date(Date.now() + 5 * MILLIS_IN_DAY),
      status: "active",
      notes: temp.note,
      createdAt,
      updatedAt: createdAt,
    });
  }

  for (const assignment of assignments) {
    await db.execute(sql`
      insert into "vehicleAssignments" (
        "fleetId",
        "vehicleId",
        "driverUserId",
        "assignedByUserId",
        "accessType",
        "startsAt",
        "expiresAt",
        "status",
        "notes",
        "createdAt",
        "updatedAt"
      ) values (
        ${assignment.fleetId},
        ${assignment.vehicleId},
        ${assignment.driverUserId},
        ${assignment.assignedByUserId},
        ${assignment.accessType},
        ${assignment.startsAt},
        ${assignment.expiresAt ?? null},
        ${assignment.status},
        ${assignment.notes ?? null},
        ${assignment.createdAt ?? now()},
        ${assignment.updatedAt ?? now()}
      )
    `);
  }
}

async function createInspection(
  db: DemoDb,
  input: {
    fleetId: number;
    vehicleId: string;
    driverId: number;
    submittedAt: Date;
    overallVehicleResult: string;
    complianceStatus: "green" | "yellow" | "red";
    integrityScore: number;
    verifiedStatus: InspectionResultStatus;
    notes: string;
    issueCategory?: string;
    issueLabel?: string;
    issueSeverity?: "minor" | "moderate" | "high" | "critical";
    proofLabel?: string;
  }
) {
  const startedAt = new Date(input.submittedAt.getTime() - 11 * 60 * 1000);
  const proofLabel = input.proofLabel ?? "inspection proof";
  const issueCategory = input.issueCategory ?? "dashboard_warning_lights";
  const issueLabel = input.issueLabel ?? "No active issue reported";

  const [inspection] = await db
    .insert(inspections)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      templateId: null,
      status: "submitted",
      inspectionDate: input.submittedAt,
      startedAt,
      durationSeconds: 630,
      overallVehicleResult: input.overallVehicleResult,
      notes: input.notes,
      locationStatus: "granted",
      startLatitude: "43.7001000",
      startLongitude: "-79.7001000",
      startLocationAccuracy: "12.5",
      startLocationCapturedAt: startedAt,
      submitLatitude: "43.7003000",
      submitLongitude: "-79.6998000",
      submitLocationAccuracy: "10.8",
      submitLocationCapturedAt: input.submittedAt,
      integrityScore: input.integrityScore,
      complianceStatus: input.complianceStatus,
      results: {
        workflow: "ontario_daily_trip_inspection",
        verifiedStatus: input.verifiedStatus,
        jurisdiction: "Ontario, Canada",
        proofPhotos: [
          {
            label: proofLabel,
            photoUrl: buildProofPhoto("maple", proofLabel),
          },
        ],
        notes: input.notes,
      },
      createdAt: startedAt,
      submittedAt: input.submittedAt,
      updatedAt: input.submittedAt,
    })
    .returning();

  if (!inspection) {
    throw new Error(`Unable to create inspection for ${input.vehicleId}`);
  }

  await db.insert(inspectionChecklistResponses).values([
    {
      inspectionId: inspection.id,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      checklistItemId: "dashboard-warning-lights",
      checklistItemLabel: "Dashboard warning lights",
      category: "dashboard_warning_lights",
      result: input.issueSeverity ? "issue_found" : "pass",
      defectDescription: input.issueSeverity ? input.notes : null,
      severity: input.issueSeverity ?? null,
      note: input.issueSeverity ? input.notes : "No warning light concerns reported.",
      unableToTakePhoto: false,
      unableToTakePhotoReason: null,
      createdAt: startedAt,
      updatedAt: input.submittedAt,
    },
    {
      inspectionId: inspection.id,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      checklistItemId: issueCategory,
      checklistItemLabel: issueLabel,
      category: issueCategory as any,
      result: input.issueSeverity ? "issue_found" : "pass",
      defectDescription: input.issueSeverity ? input.notes : null,
      severity: input.issueSeverity ?? null,
      note: input.notes,
      unableToTakePhoto: false,
      unableToTakePhotoReason: null,
      createdAt: startedAt,
      updatedAt: input.submittedAt,
    },
  ]);

  await db.insert(randomProofRequests).values({
    inspectionId: inspection.id,
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    proofItem: "odometer_photo",
    photoSubmitted: true,
    photoUrl: buildProofPhoto("peel", proofLabel),
    complianceStatus: "submitted",
    createdAt: startedAt,
    updatedAt: input.submittedAt,
  });

  await db.insert(inspectionPhotos).values({
    inspectionId: inspection.id,
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    checklistItemId: issueCategory,
    photoType: "defect",
    imageUrl: buildProofPhoto("northstone", proofLabel),
    source: "upload",
    notes: input.notes,
    uploadedAt: input.submittedAt,
  });

  return inspection;
}

async function createDefectCase(
  db: DemoDb,
  input: {
    company: DemoCompanySeed;
    fleetId: number;
    vehicleId: string;
    vehicleUnitNumber: string;
    driverId: number;
    managerId: number;
    inspectionId: number | null;
    createdAt: Date;
    title: string;
    description: string;
    category: string;
    severity: "minor" | "moderate" | "high" | "critical";
    complianceStatus: "green" | "yellow" | "red";
    status: "open" | "resolved";
    likelyCause: string;
    confidenceScore: number;
    recommendedAction: string;
    driveGuidance: string;
    managerSummary: string;
    faultCodes: string[];
    symptoms: string[];
    nextSteps: string[];
    includeManagerQueue?: boolean;
    createDiagnosticReview?: boolean;
    createInspectionFlag?: boolean;
  }
) {
  const resolvedAt = input.status === "resolved" ? input.createdAt : null;
  const [defect] = await db
    .insert(defects)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      inspectionId: input.inspectionId,
      driverId: input.driverId,
      title: input.title,
      description: input.description,
      category: input.category,
      severity: input.severity,
      complianceStatus: input.complianceStatus,
      status: input.status,
      latestFollowUpStatus: input.status === "resolved" ? "repaired" : "still_present",
      latestFollowUpAt: input.createdAt,
      resolvedByUserId: input.status === "resolved" ? input.managerId : null,
      resolvedAt,
      aiRecommendation: input.recommendedAction,
      aiConfidenceScore: input.confidenceScore,
      aiSummary: input.managerSummary,
      photoUrls: [buildDocumentUrl(input.company.key, input.vehicleUnitNumber, "inspection-defect-photo.jpg")],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .returning();

  if (!defect) {
    throw new Error(`Unable to create defect for ${input.vehicleId}`);
  }

  await db.insert(aiTriageRecords).values({
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    inspectionId: input.inspectionId,
    defectId: defect.id,
    mostLikelyCause: input.likelyCause,
    severity: input.complianceStatus,
    confidenceScore: input.confidenceScore,
    recommendedAction: input.recommendedAction,
    driverMessage: input.driveGuidance,
    managerSummary: input.managerSummary,
    clarifyingQuestions: [],
    safetyWarning: input.driveGuidance,
    suggestedNextSteps: input.nextSteps,
    rawResult: {
      likely_causes: [{ cause: input.likelyCause, probability: input.confidenceScore }],
      symptoms: input.symptoms,
      faultCodes: input.faultCodes,
      recommended_action: input.recommendedAction,
      drive_guidance: input.driveGuidance,
      severity: input.complianceStatus,
      demo_seed_key: DEMO_SEED_KEY,
    },
    createdAt: input.createdAt,
  });

  await db.insert(aiRequestLogs).values({
    companyId: input.fleetId,
    assetId: input.vehicleId,
    diagnosticSessionId: `${DEMO_SEED_KEY}:${input.vehicleId}:${input.createdAt.getTime()}`,
    callType: "demo_seed",
    provider: "seed",
    model: "truckfixr-demo-seed",
    estimatedInputCharacters: input.description.length,
    estimatedInputTokens: Math.max(32, Math.round(input.description.length / 4)),
    messageCount: 1,
    maxTokens: 512,
    temperature: "0.20",
    responseFormatEnabled: true,
    simpleTadisMode: false,
    truncationApplied: false,
    status: "completed",
    errorCode: null,
    errorMessage: null,
    fallbackUsed: false,
    createdAt: input.createdAt,
  });

  if (input.createDiagnosticReview) {
    await db.insert(diagnosticReviewQueue).values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      reviewType: "demo_diagnostic",
      status: "review_pending",
      summary: input.description,
      baselineTopCause: input.likelyCause,
      finalTopCause: input.likelyCause,
      confidenceDelta: "0.00",
      evidenceSnapshot: {
        symptoms: input.symptoms,
        faultCodes: input.faultCodes,
      },
      baselineRanking: [{ cause: input.likelyCause, probability: input.confidenceScore }],
      finalRanking: [{ cause_name: input.likelyCause, probability: input.confidenceScore }],
      rationale: {
        demo_seed_key: DEMO_SEED_KEY,
        recommendedAction: input.recommendedAction,
      },
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  }

  if (input.createInspectionFlag && input.inspectionId != null) {
    await db.insert(inspectionFlags).values({
      inspectionId: input.inspectionId,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      flagType: "major_defect",
      severity: input.severity === "critical" ? "critical" : "high",
      message: input.description,
      createdAt: input.createdAt,
    });
  }

  await db.insert(inAppAlerts).values({
    fleetId: input.fleetId,
    userId: input.managerId,
    vehicleId: input.vehicleId,
    inspectionId: input.inspectionId,
    defectId: defect.id,
    alertType: "demo_operational_risk",
    severity: input.complianceStatus === "red" ? "critical" : "warning",
    title: input.title,
    message: input.managerSummary,
    status: "open",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });

  await db.insert(adminAlerts).values({
    userId: input.managerId,
    fleetId: input.fleetId,
    type: "demo_operational_risk",
    title: input.title,
    body: input.description,
    metadata: {
      demoSeedKey: DEMO_SEED_KEY,
      vehicleId: input.vehicleId,
      vehicleUnitNumber: input.vehicleUnitNumber,
      faultCodes: input.faultCodes,
      symptoms: input.symptoms,
    },
    status: "open",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });

  if (input.includeManagerQueue) {
    await db.insert(activityLogs).values({
      fleetId: input.fleetId,
      userId: input.managerId,
      action: "diagnostic_summary_shared",
      entityType: "defect",
      entityId: defect.id,
      details: {
        vehicleId: input.vehicleId,
        defectId: defect.id,
        summary: createManagerSummary({
          unitNumber: input.vehicleUnitNumber,
          headline: input.title,
          recommendedAction: input.recommendedAction,
          driveGuidance: input.driveGuidance,
        }),
        output: {
          likely_causes: [{ cause: input.likelyCause, probability: input.confidenceScore }],
          possible_causes: [{ cause: input.likelyCause, probability: input.confidenceScore }],
          recommended_action: input.recommendedAction,
          manager_summary: input.managerSummary,
        },
        symptoms: input.symptoms,
        faultCodes: input.faultCodes,
        sharedByDriverId: input.driverId,
        requiresManagerAction: true,
        demoSeedKey: DEMO_SEED_KEY,
      },
      createdAt: input.createdAt,
    });
  }

  return defect;
}

async function createRepairAndMaintenance(
  db: DemoDb,
  input: {
    fleetId: number;
    vehicleId: string;
    defectId: number | null;
    recordedByUserId: number;
    createdAt: Date;
    confirmedFault: string;
    repairPerformed: string;
    repairNotes: string;
    partsReplaced?: string[];
    cost?: string;
    maintenanceType?: "repair" | "preventive" | "inspection";
    aiDiagnosisCorrect?: "yes" | "partially" | "no" | "unknown";
  }
) {
  if (input.defectId != null) {
    await db.insert(repairOutcomes).values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      defectId: input.defectId,
      recordedByUserId: input.recordedByUserId,
      confirmedFault: input.confirmedFault,
      repairPerformed: input.repairPerformed,
      partsReplaced: input.partsReplaced ?? [],
      aiDiagnosisCorrect: input.aiDiagnosisCorrect ?? "yes",
      downtimeStart: new Date(input.createdAt.getTime() - 5 * 60 * 60 * 1000),
      downtimeEnd: input.createdAt,
      returnedToServiceAt: input.createdAt,
      repairNotes: input.repairNotes,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  }

  await db.insert(maintenanceLogs).values({
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    defectId: input.defectId,
    type: input.maintenanceType ?? "repair",
    description: input.repairPerformed,
    cost: input.cost ?? null,
    completedAt: input.createdAt,
    createdAt: input.createdAt,
  });
}

async function createOpenMaintenanceLog(
  db: DemoDb,
  input: {
    fleetId: number;
    vehicleId: string;
    createdAt: Date;
    type: "repair" | "preventive" | "inspection";
    description: string;
  }
) {
  await db.insert(maintenanceLogs).values({
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    defectId: null,
    type: input.type,
    description: input.description,
    cost: null,
    completedAt: null,
    createdAt: input.createdAt,
  });
}

async function seedRoutineInspections(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  usersByEmail: Map<string, SeededUser>
) {
  const skipToday = new Set<string>([
    "demo-maple-mrl-t201",
    "demo-peel-pct-402",
    "demo-northstone-nsf-t702",
  ]);

  for (const [index, vehicle] of company.vehicles.entries()) {
    if (skipToday.has(vehicle.id)) continue;
    const driver = vehicle.primaryDriverEmail
      ? usersByEmail.get(normalizeEmail(vehicle.primaryDriverEmail))
      : null;
    if (!driver) continue;

    const submittedAt = new Date(Date.now() - (index + 1) * 35 * 60 * 1000);
    const isYellow = vehicle.businessStatus === "maintenance_due_soon" || vehicle.businessStatus === "compliance_risk";
    const isRed =
      vehicle.businessStatus === "urgent_repair_do_not_dispatch" ||
      vehicle.businessStatus === "overdue_maintenance";

    await createInspection(db, {
      fleetId,
      vehicleId: vehicle.id,
      driverId: driver.id,
      submittedAt,
      overallVehicleResult: isRed ? "defect_reported" : "no_defect",
      complianceStatus: isRed ? "red" : isYellow ? "yellow" : "green",
      integrityScore: isRed ? 61 : isYellow ? 83 : 96,
      verifiedStatus: isRed ? "flagged" : isYellow ? "needs_review" : "safe",
      notes: isRed
        ? `${vehicle.unitNumber} reported an operational concern during Ontario daily trip inspection.`
        : isYellow
          ? `${vehicle.unitNumber} passed trip inspection but still needs follow-up scheduling.`
          : `${vehicle.unitNumber} passed Ontario daily trip inspection with no active defect.`,
      issueCategory: isRed || isYellow ? "other" : "lights_reflectors",
      issueLabel: isRed || isYellow ? "Operational follow-up required" : "Lights and reflectors",
      issueSeverity: isRed ? "high" : isYellow ? "minor" : undefined,
      proofLabel: `${vehicle.unitNumber} proof photo`,
    });
  }
}

async function seedMapleCompany(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  usersByEmail: Map<string, SeededUser>
) {
  const manager = usersByEmail.get("manager.maple@truckfixr-demo.example.com");
  const driver1 = usersByEmail.get("driver1.maple@truckfixr-demo.example.com");
  const driver2 = usersByEmail.get("driver2.maple@truckfixr-demo.example.com");
  if (!manager || !driver1 || !driver2) throw new Error("Missing Maple demo users");

  await seedRoutineInspections(db, company, fleetId, usersByEmail);

  const urgentInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-101",
    driverId: driver1.id,
    submittedAt: new Date(Date.now() - 40 * 60 * 1000),
    overallVehicleResult: "not_safe_to_operate",
    complianceStatus: "red",
    integrityScore: 58,
    verifiedStatus: "flagged",
    notes:
      "Ontario daily trip inspection found active DEF warning, reduced-power message, and derate risk. Do not dispatch.",
    issueCategory: "dashboard_warning_lights",
    issueLabel: "Dashboard warning lights",
    issueSeverity: "critical",
    proofLabel: "MRL-101 defect photo",
  });

  await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-maple-mrl-101",
    vehicleUnitNumber: "MRL-101",
    driverId: driver1.id,
    managerId: manager.id,
    inspectionId: urgentInspection.id,
    createdAt: urgentInspection.submittedAt ?? now(),
    title: "DEF / aftertreatment derate risk",
    description:
      "Driver reported active DEF warning, reduced power, and concern that the unit could enter a roadside derate. Ontario dispatch hold recommended.",
    category: "aftertreatment",
    severity: "critical",
    complianceStatus: "red",
    status: "open",
    likelyCause: "Possible NOx sensor, DEF quality, or DPF restriction fault",
    confidenceScore: 91,
    recommendedAction: "Do not dispatch. Scan aftertreatment faults and verify DEF quality before moving the unit.",
    driveGuidance: "Do not dispatch until scanned. Tow if derate worsens or road speed is restricted.",
    managerSummary:
      "MRL-101 has a high-risk aftertreatment alert and should be held from dispatch until DEF quality and NOx/DPF faults are verified.",
    faultCodes: ["SPN 1761", "SPN 4364"],
    symptoms: ["DEF lamp active", "Reduced-power warning", "Driver concerned about derate"],
    nextSteps: [
      "Scan aftertreatment module and SCR faults",
      "Verify DEF concentration and contamination risk",
      "Inspect NOx sensor readings and DPF differential pressure",
    ],
    includeManagerQueue: true,
    createDiagnosticReview: true,
    createInspectionFlag: true,
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-101",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    type: "inspection",
    description:
      "Ontario emissions / aftertreatment follow-up opened. Do not dispatch until DEF quality and NOx sensor readings are confirmed.",
  });

  const reeferRepairInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-t202",
    driverId: driver1.id,
    submittedAt: getDemoBaseTimestamp(8),
    overallVehicleResult: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 88,
    verifiedStatus: "needs_review",
    notes: "Reefer trailer reported intermittent marker lamp and service reminder during pre-trip.",
    issueCategory: "lights_reflectors",
    issueLabel: "Lights and reflectors",
    issueSeverity: "moderate",
    proofLabel: "MRL-T202 marker lamp",
  });

  const reeferDefect = await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-maple-mrl-t202",
    vehicleUnitNumber: "MRL-T202",
    driverId: driver1.id,
    managerId: manager.id,
    inspectionId: reeferRepairInspection.id,
    createdAt: reeferRepairInspection.submittedAt ?? getDemoBaseTimestamp(8),
    title: "Trailer lighting and reefer PM follow-up",
    description:
      "Marker lamp wiring needed repair and reefer service interval was coming due. Unit stayed in service after repair scheduling.",
    category: "lighting",
    severity: "moderate",
    complianceStatus: "yellow",
    status: "resolved",
    likelyCause: "Marker lamp harness wear and reefer PM interval reached",
    confidenceScore: 84,
    recommendedAction: "Repair marker lamp harness and complete reefer PM.",
    driveGuidance: "Safe to return to yard and complete service before next long trip.",
    managerSummary:
      "MRL-T202 had a trailer lighting concern and reefer service reminder; work was completed and documented.",
    faultCodes: [],
    symptoms: ["Marker light intermittent", "Reefer service due soon"],
    nextSteps: ["Repair trailer marker lamp wiring", "Complete reefer PM and document service"],
  });

  await createRepairAndMaintenance(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-t202",
    defectId: reeferDefect.id,
    recordedByUserId: manager.id,
    createdAt: new Date((reeferRepairInspection.submittedAt ?? getDemoBaseTimestamp(8)).getTime() + 3 * 60 * 60 * 1000),
    confirmedFault: "Trailer marker lamp harness damage",
    repairPerformed:
      "Repaired trailer lighting harness, verified lamps, and completed reefer service with emissions note placeholder.",
    repairNotes:
      `Invoice placeholder: ${buildDocumentUrl(company.key, "MRL-T202", "repair-invoice.pdf")}`,
    partsReplaced: ["Marker lamp pigtail", "Reefer fuel filter"],
    cost: "486.00",
    maintenanceType: "repair",
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-t201",
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    type: "inspection",
    description:
      "Annual safety certificate renewal is due. Ontario MTO compliance reminder remains open for this trailer.",
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-t202",
    createdAt: new Date(Date.now() - 90 * 60 * 1000),
    type: "preventive",
    description:
      "Reefer service due soon. Placeholder document available for aftertreatment and reefer maintenance notes.",
  });

  const mapleT201Driver = driver2.id;
  await createInspection(db, {
    fleetId,
    vehicleId: "demo-maple-mrl-t201",
    driverId: mapleT201Driver,
    submittedAt: getDemoBaseTimestamp(3),
    overallVehicleResult: "no_defect",
    complianceStatus: "yellow",
    integrityScore: 91,
    verifiedStatus: "needs_review",
    notes:
      "Trailer passed trip inspection three days ago, but annual safety certificate is approaching expiry and needs scheduling.",
    issueCategory: "coupling",
    issueLabel: "Coupling and trailer connection",
    issueSeverity: "minor",
    proofLabel: "MRL-T201 prior inspection",
  });
}

async function seedPeelCompany(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  usersByEmail: Map<string, SeededUser>
) {
  const manager = usersByEmail.get("manager.peel@truckfixr-demo.example.com");
  const driver1 = usersByEmail.get("driver1.peel@truckfixr-demo.example.com");
  const driver2 = usersByEmail.get("driver2.peel@truckfixr-demo.example.com");
  if (!manager || !driver1 || !driver2) throw new Error("Missing Peel demo users");

  await seedRoutineInspections(db, company, fleetId, usersByEmail);

  const oldBrakeInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-peel-pct-b301",
    driverId: driver1.id,
    submittedAt: getDemoBaseTimestamp(6),
    overallVehicleResult: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 80,
    verifiedStatus: "needs_review",
    notes:
      "Bus reported slow air build and minor air leak note during prior Ontario daily trip inspection.",
    issueCategory: "brakes_air_system",
    issueLabel: "Brakes and air system",
    issueSeverity: "moderate",
    proofLabel: "PCT-B301 prior air issue",
  });

  const oldBrakeDefect = await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-peel-pct-b301",
    vehicleUnitNumber: "PCT-B301",
    driverId: driver1.id,
    managerId: manager.id,
    inspectionId: oldBrakeInspection.id,
    createdAt: oldBrakeInspection.submittedAt ?? getDemoBaseTimestamp(6),
    title: "Brake / air system leak previously repaired",
    description:
      "Previous daily trip inspection noted slow air build and a minor air leak around the service chamber plumbing.",
    category: "brake_air_system",
    severity: "moderate",
    complianceStatus: "yellow",
    status: "resolved",
    likelyCause: "Brake chamber fitting leak",
    confidenceScore: 86,
    recommendedAction: "Repair air fitting and confirm pressure hold test.",
    driveGuidance: "Keep the unit local until pressure hold is verified.",
    managerSummary:
      "Prior brake and air defect on PCT-B301 was repaired, but the unit is trending toward repeat inspection failures.",
    faultCodes: [],
    symptoms: ["Slow air build", "Minor air leak"],
    nextSteps: ["Repair air fitting", "Perform air pressure hold test"],
  });

  await createRepairAndMaintenance(db, {
    fleetId,
    vehicleId: "demo-peel-pct-b301",
    defectId: oldBrakeDefect.id,
    recordedByUserId: manager.id,
    createdAt: new Date((oldBrakeInspection.submittedAt ?? getDemoBaseTimestamp(6)).getTime() + 3 * 60 * 60 * 1000),
    confirmedFault: "Brake chamber fitting leak",
    repairPerformed:
      "Replaced leaking brake chamber fitting, checked air line routing, and logged Ontario bus brake follow-up.",
    repairNotes:
      `Repair invoice placeholder: ${buildDocumentUrl(company.key, "PCT-B301", "repair-invoice.pdf")}`,
    partsReplaced: ["Brake chamber fitting", "Air line section"],
    cost: "342.00",
  });

  const currentBrakeInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-peel-pct-b301",
    driverId: driver1.id,
    submittedAt: new Date(Date.now() - 75 * 60 * 1000),
    overallVehicleResult: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 76,
    verifiedStatus: "needs_review",
    notes:
      "Driver reported another brake/air warning during Ontario daily trip inspection. Repeated defect now needs priority maintenance.",
    issueCategory: "brakes_air_system",
    issueLabel: "Brakes and air system",
    issueSeverity: "high",
    proofLabel: "PCT-B301 repeat brake issue",
  });

  await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-peel-pct-b301",
    vehicleUnitNumber: "PCT-B301",
    driverId: driver1.id,
    managerId: manager.id,
    inspectionId: currentBrakeInspection.id,
    createdAt: currentBrakeInspection.submittedAt ?? now(),
    title: "Repeated brake / air system daily inspection defect",
    description:
      "Repeated brake and air warning indicates an unresolved or recurring issue on the bus. Maintenance priority has increased.",
    category: "brake_air_system",
    severity: "high",
    complianceStatus: "yellow",
    status: "open",
    likelyCause: "Recurring air leak or brake chamber issue",
    confidenceScore: 88,
    recommendedAction: "Schedule brake and air inspection before the next full service run.",
    driveGuidance: "Limit service until air system pressure-hold and brake chamber checks are completed.",
    managerSummary:
      "PCT-B301 has a repeated brake and air system inspection defect. Review before assigning full passenger service.",
    faultCodes: [],
    symptoms: ["Brake warning on inspection", "Air build concern", "Recurring defect history"],
    nextSteps: ["Pressure hold test", "Brake chamber inspection", "Air line soap test"],
    includeManagerQueue: true,
    createDiagnosticReview: true,
    createInspectionFlag: true,
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-peel-pct-b301",
    createdAt: new Date(Date.now() - 50 * 60 * 1000),
    type: "inspection",
    description:
      "Ontario bus brake inspection follow-up due. Repeated daily trip inspection defect remains open until repair is confirmed.",
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-peel-pct-402",
    createdAt: new Date(Date.now() - 3 * MILLIS_IN_DAY),
    type: "preventive",
    description:
      "Overdue PM: oil and filter service, brake inspection, and fleet maintenance interval reset pending.",
  });

  await createInspection(db, {
    fleetId,
    vehicleId: "demo-peel-pct-402",
    driverId: driver2.id,
    submittedAt: getDemoBaseTimestamp(2),
    overallVehicleResult: "no_defect",
    complianceStatus: "yellow",
    integrityScore: 85,
    verifiedStatus: "needs_review",
    notes:
      "Vehicle passed inspection two days ago but preventive maintenance interval is already overdue and still unscheduled.",
    issueCategory: "other",
    issueLabel: "Other issue",
    issueSeverity: "minor",
    proofLabel: "PCT-402 prior inspection",
  });

  const trailerLightInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-peel-pct-t501",
    driverId: driver2.id,
    submittedAt: getDemoBaseTimestamp(7),
    overallVehicleResult: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 87,
    verifiedStatus: "needs_review",
    notes:
      "Dry-van trailer had a rear clearance lamp issue noted during pre-trip and was repaired the same day.",
    issueCategory: "lights_reflectors",
    issueLabel: "Lights and reflectors",
    issueSeverity: "moderate",
    proofLabel: "PCT-T501 trailer lamp",
  });

  const trailerLightDefect = await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-peel-pct-t501",
    vehicleUnitNumber: "PCT-T501",
    driverId: driver2.id,
    managerId: manager.id,
    inspectionId: trailerLightInspection.id,
    createdAt: trailerLightInspection.submittedAt ?? getDemoBaseTimestamp(7),
    title: "Trailer lighting repair completed",
    description:
      "Rear clearance lamp wiring was repaired and the trailer returned to service after the same-shift check.",
    category: "lighting",
    severity: "moderate",
    complianceStatus: "yellow",
    status: "resolved",
    likelyCause: "Trailer marker light wiring damage",
    confidenceScore: 82,
    recommendedAction: "Repair wiring and recheck lamp function.",
    driveGuidance: "Return to service after lamp function is verified.",
    managerSummary:
      "PCT-T501 had a trailer lighting issue that was repaired and documented for maintenance history.",
    faultCodes: [],
    symptoms: ["Rear clearance lamp out"],
    nextSteps: ["Repair lamp wiring", "Verify lamp function"],
  });

  await createRepairAndMaintenance(db, {
    fleetId,
    vehicleId: "demo-peel-pct-t501",
    defectId: trailerLightDefect.id,
    recordedByUserId: manager.id,
    createdAt: new Date((trailerLightInspection.submittedAt ?? getDemoBaseTimestamp(7)).getTime() + 2 * 60 * 60 * 1000),
    confirmedFault: "Trailer clearance lamp wiring damage",
    repairPerformed: "Repaired trailer wiring and verified rear lamp operation.",
    repairNotes:
      `Certificate placeholder: ${buildDocumentUrl(company.key, "PCT-T501", "annual-safety-certificate.pdf")}`,
    partsReplaced: ["Clearance lamp pigtail"],
    cost: "124.00",
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-peel-pct-t502",
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    type: "preventive",
    description:
      "Reefer service due soon. Placeholder invoice and service note references are attached in configuration metadata.",
  });
}

async function seedNorthStoneCompany(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  usersByEmail: Map<string, SeededUser>
) {
  const manager = usersByEmail.get("manager.northstone@truckfixr-demo.example.com");
  const driver1 = usersByEmail.get("driver1.northstone@truckfixr-demo.example.com");
  const driver2 = usersByEmail.get("driver2.northstone@truckfixr-demo.example.com");
  if (!manager || !driver1 || !driver2) throw new Error("Missing NorthStone demo users");

  await seedRoutineInspections(db, company, fleetId, usersByEmail);

  const hydraulicInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-601",
    driverId: driver1.id,
    submittedAt: new Date(Date.now() - 55 * 60 * 1000),
    overallVehicleResult: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 73,
    verifiedStatus: "needs_review",
    notes:
      "Hydraulic oil leak and PTO hesitation observed during pre-trip. Unit can move in yard only until repaired.",
    issueCategory: "fluid_leaks",
    issueLabel: "Fluid leaks",
    issueSeverity: "high",
    proofLabel: "NSF-601 hydraulic leak",
  });

  await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-northstone-nsf-601",
    vehicleUnitNumber: "NSF-601",
    driverId: driver1.id,
    managerId: manager.id,
    inspectionId: hydraulicInspection.id,
    createdAt: hydraulicInspection.submittedAt ?? now(),
    title: "Hydraulic leak / PTO issue",
    description:
      "Dump body hydraulic system showed visible seepage and PTO hesitation before the route. Construction dispatch should confirm repair timing.",
    category: "hydraulic",
    severity: "high",
    complianceStatus: "yellow",
    status: "open",
    likelyCause: "Hydraulic hose seepage or PTO engagement fault",
    confidenceScore: 86,
    recommendedAction: "Inspect hydraulic hoses, PTO engagement, and fluid level before site dispatch.",
    driveGuidance: "Use for yard movement only until hydraulic leak source is confirmed.",
    managerSummary:
      "NSF-601 has a hydraulic/PTO concern that should be cleared before full construction duty.",
    faultCodes: [],
    symptoms: ["Hydraulic seepage", "PTO hesitation", "Dump body response delay"],
    nextSteps: ["Inspect hose routing", "Check PTO engagement", "Pressure-test hydraulic circuit"],
    includeManagerQueue: true,
    createDiagnosticReview: true,
    createInspectionFlag: true,
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-601",
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    type: "repair",
    description:
      "Hydraulic hose and PTO inspection opened. Keep unit on short-haul yard moves until repair is complete.",
  });

  const noStartOldInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-605",
    driverId: driver2.id,
    submittedAt: getDemoBaseTimestamp(9),
    overallVehicleResult: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 79,
    verifiedStatus: "needs_review",
    notes:
      "Previous no-start complaint required a battery replacement and charging system verification.",
    issueCategory: "dashboard_warning_lights",
    issueLabel: "Dashboard warning lights",
    issueSeverity: "moderate",
    proofLabel: "NSF-605 battery issue prior",
  });

  const noStartOldDefect = await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-northstone-nsf-605",
    vehicleUnitNumber: "NSF-605",
    driverId: driver2.id,
    managerId: manager.id,
    inspectionId: noStartOldInspection.id,
    createdAt: noStartOldInspection.submittedAt ?? getDemoBaseTimestamp(9),
    title: "Previous no-start repaired",
    description:
      "Battery replacement restored operation, but the unit has continued trending toward charging-system complaints.",
    category: "electrical",
    severity: "moderate",
    complianceStatus: "yellow",
    status: "resolved",
    likelyCause: "Weak battery",
    confidenceScore: 81,
    recommendedAction: "Replace battery and verify charging output.",
    driveGuidance: "Return to service after battery and charging test pass.",
    managerSummary:
      "NSF-605 had a prior no-start event resolved with battery replacement. Trend monitoring remains advisable.",
    faultCodes: [],
    symptoms: ["No-start event", "Low cranking voltage"],
    nextSteps: ["Replace battery", "Verify alternator output"],
  });

  await createRepairAndMaintenance(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-605",
    defectId: noStartOldDefect.id,
    recordedByUserId: manager.id,
    createdAt: new Date((noStartOldInspection.submittedAt ?? getDemoBaseTimestamp(9)).getTime() + 4 * 60 * 60 * 1000),
    confirmedFault: "Weak battery",
    repairPerformed: "Replaced batteries and verified charging voltage under load.",
    repairNotes:
      `Invoice placeholder: ${buildDocumentUrl(company.key, "NSF-605", "battery-replacement-invoice.pdf")}`,
    partsReplaced: ["Battery set"],
    cost: "612.00",
  });

  const currentNoStartInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-605",
    driverId: driver2.id,
    submittedAt: new Date(Date.now() - 95 * 60 * 1000),
    overallVehicleResult: "defect_reported",
    complianceStatus: "red",
    integrityScore: 66,
    verifiedStatus: "flagged",
    notes:
      "Recurring no-start and low-voltage complaint came back during morning inspection. Unit also has overdue PM.",
    issueCategory: "dashboard_warning_lights",
    issueLabel: "Dashboard warning lights",
    issueSeverity: "high",
    proofLabel: "NSF-605 current no-start",
  });

  await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-northstone-nsf-605",
    vehicleUnitNumber: "NSF-605",
    driverId: driver2.id,
    managerId: manager.id,
    inspectionId: currentNoStartInspection.id,
    createdAt: currentNoStartInspection.submittedAt ?? now(),
    title: "Recurring no-start / charging system issue",
    description:
      "Unit failed to crank consistently again and now has overdue PM. Review battery, cabling, and alternator output before return to service.",
    category: "electrical",
    severity: "high",
    complianceStatus: "red",
    status: "open",
    likelyCause: "Recurring charging system or battery cable fault",
    confidenceScore: 89,
    recommendedAction: "Perform charging-system test and inspect battery cables before dispatch.",
    driveGuidance: "Hold from dispatch until cranking and charging checks pass.",
    managerSummary:
      "NSF-605 is showing a recurring no-start trend plus overdue PM. Maintenance attention is now urgent.",
    faultCodes: ["P0562"],
    symptoms: ["No-start", "Low voltage", "Recurring issue"],
    nextSteps: ["Battery conductance test", "Alternator load test", "Inspect ground and power cables"],
    includeManagerQueue: true,
    createDiagnosticReview: true,
    createInspectionFlag: true,
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-605",
    createdAt: new Date(Date.now() - 80 * 60 * 1000),
    type: "preventive",
    description:
      "Overdue PM remains open with oil/filter service and charging-system inspection outstanding.",
  });

  await createOpenMaintenanceLog(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-606",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    type: "preventive",
    description:
      "Service truck PM due soon. Oil, filter, and brake inspection reminder opened for next maintenance window.",
  });

  await createRepairAndMaintenance(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-606",
    defectId: null,
    recordedByUserId: manager.id,
    createdAt: getDemoBaseTimestamp(12),
    confirmedFault: "Scheduled PM service",
    repairPerformed: "Completed PM service with oil, filters, and documented inspection note.",
    repairNotes:
      `PM invoice placeholder: ${buildDocumentUrl(company.key, "NSF-606", "pm-service-invoice.pdf")}`,
    partsReplaced: ["Oil filter", "Fuel filter"],
    cost: "298.00",
    maintenanceType: "preventive",
    aiDiagnosisCorrect: "unknown",
  });

  const outOfServiceInspection = await createInspection(db, {
    fleetId,
    vehicleId: "demo-northstone-nsf-t702",
    driverId: driver2.id,
    submittedAt: getDemoBaseTimestamp(1),
    overallVehicleResult: "not_safe_to_operate",
    complianceStatus: "red",
    integrityScore: 52,
    verifiedStatus: "flagged",
    notes:
      "Engine derate remained unresolved during the last check. Unit is out of service until advanced diagnostics are complete.",
    issueCategory: "dashboard_warning_lights",
    issueLabel: "Dashboard warning lights",
    issueSeverity: "critical",
    proofLabel: "NSF-T702 derate alert",
  });

  await createDefectCase(db, {
    company,
    fleetId,
    vehicleId: "demo-northstone-nsf-t702",
    vehicleUnitNumber: "NSF-T702",
    driverId: driver2.id,
    managerId: manager.id,
    inspectionId: outOfServiceInspection.id,
    createdAt: outOfServiceInspection.submittedAt ?? getDemoBaseTimestamp(1),
    title: "Out-of-service engine derate alert",
    description:
      "Active derate alert remains unresolved. Unit is parked until aftertreatment root cause is confirmed and repaired.",
    category: "aftertreatment",
    severity: "critical",
    complianceStatus: "red",
    status: "open",
    likelyCause: "Aftertreatment derate fault requiring advanced diagnostics",
    confidenceScore: 92,
    recommendedAction: "Keep unit parked and complete full engine and aftertreatment diagnostics.",
    driveGuidance: "Out of service. Do not move beyond shop positioning.",
    managerSummary:
      "NSF-T702 is out of service with an unresolved engine derate and must stay parked until diagnostics finish.",
    faultCodes: ["SPN 5246", "SPN 4364"],
    symptoms: ["Engine derate", "Active aftertreatment warning"],
    nextSteps: ["Advanced scan", "Check DPF restriction", "Verify NOx and dosing data"],
    includeManagerQueue: true,
    createDiagnosticReview: true,
    createInspectionFlag: true,
  });
}

async function seedCompanyOperationalData(
  db: DemoDb,
  company: DemoCompanySeed,
  fleetId: number,
  usersByEmail: Map<string, SeededUser>
) {
  if (company.key === "maple") {
    await seedMapleCompany(db, company, fleetId, usersByEmail);
    return;
  }
  if (company.key === "peel") {
    await seedPeelCompany(db, company, fleetId, usersByEmail);
    return;
  }
  await seedNorthStoneCompany(db, company, fleetId, usersByEmail);
}

async function seedDemoCompany(
  db: DemoDb,
  company: DemoCompanySeed,
  authMode: "supabase_admin" | "local_email"
) {
  const ownerSeed = company.users.find((user) => user.role === "owner");
  const managerSeed = company.users.find((user) => user.role === "manager");
  const driverSeeds = company.users.filter((user) => user.role === "driver");
  if (!ownerSeed || !managerSeed || driverSeeds.length !== 2) {
    throw new Error(`Invalid demo company config for ${company.name}`);
  }

  const ownerAuthUser =
    authMode === "supabase_admin" ? await upsertSupabaseAdminUser(ownerSeed) : null;
  const owner = await upsertUserRow(db, {
    ...ownerSeed,
    openId: ownerAuthUser?.id ? toOpenId(ownerAuthUser.id) : `email_${normalizeEmail(ownerSeed.email)}`,
  });

  const managerAuthUser =
    authMode === "supabase_admin" ? await upsertSupabaseAdminUser(managerSeed) : null;
  const manager = await upsertUserRow(db, {
    ...managerSeed,
    openId: managerAuthUser?.id
      ? toOpenId(managerAuthUser.id)
      : `email_${normalizeEmail(managerSeed.email)}`,
    managerEmail: owner.email,
    managerUserId: owner.id,
  });

  const drivers: SeededUser[] = [];
  for (const driverSeed of driverSeeds) {
    const authUser =
      authMode === "supabase_admin" ? await upsertSupabaseAdminUser(driverSeed) : null;
    const driver = await upsertUserRow(db, {
      ...driverSeed,
      openId: authUser?.id ? toOpenId(authUser.id) : `email_${normalizeEmail(driverSeed.email)}`,
      managerEmail: manager.email,
      managerUserId: manager.id,
    });
    drivers.push(driver);
  }

  const usersByEmail = new Map<string, SeededUser>(
    [owner, manager, ...drivers].map((user) => [normalizeEmail(user.email), user])
  );

  const fleet = await upsertFleetRow(db, company, owner.id);
  await clearFleetScopedDemoData(db, fleet.id);
  await createMemberships(db, fleet.id, owner, manager, drivers);
  await createVehiclesForCompany(db, company, fleet.id, owner.id, usersByEmail);
  await createAssignmentsForCompany(db, company, fleet.id, manager.id, usersByEmail);
  await seedCompanyOperationalData(db, company, fleet.id, usersByEmail);

  return {
    companyKey: company.key,
    fleetId: fleet.id,
    vehicleCount: company.vehicles.length,
    userIds: [owner.id, manager.id, ...drivers.map((driver) => driver.id)],
  } satisfies CompanySeedSummary;
}

async function fetchDemoUsers(db: DemoDb) {
  return db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      openId: users.openId,
      name: users.name,
    })
    .from(users)
    .where(inArray(users.email, DEMO_USER_EMAILS.map(normalizeEmail)));
}

async function fetchDemoFleets(db: DemoDb) {
  return db
    .select()
    .from(fleets)
    .where(
      or(
        inArray(fleets.name, DEMO_COMPANY_NAMES),
        inArray(fleets.companyEmail, DEMO_COMPANY_EMAILS),
        inArray(fleets.inviteCode, DEMO_INVITE_CODES)
      )
    );
}

async function buildSeedSummary(db: DemoDb, authMode: "supabase_admin" | "local_email"): Promise<DemoSeedSummary> {
  const demoUsers = await fetchDemoUsers(db);
  const userMap = new Map(demoUsers.map((user) => [normalizeEmail(user.email ?? ""), user]));
  const demoFleets = await fetchDemoFleets(db);

  const summary: DemoSeedSummary = {
    authMode,
    password: DEMO_SHARED_PASSWORD,
    manifestPath: DEMO_OUTPUT_PATH,
    companies: DEMO_COMPANIES.map((company) => {
      const fleet = demoFleets.find((row) => row.name === company.name);
      return {
        companyKey: company.key,
        name: company.name,
        fleetId: fleet?.id ?? 0,
        users: company.users.map((user) => {
          const row = userMap.get(normalizeEmail(user.email));
          return {
            email: user.email,
            id: row?.id ?? 0,
            role: user.role,
          };
        }),
        vehicles: company.vehicles.map((vehicle) => ({
          id: vehicle.id,
          unitNumber: vehicle.unitNumber,
          businessStatus: vehicle.businessStatus,
        })),
      };
    }),
  };

  await writeJson(DEMO_OUTPUT_PATH, summary);
  return summary;
}

function buildManagerRecord(user: { id: number; role: string; email?: string | null }) {
  return {
    id: user.id,
    role: user.role,
    email: user.email ?? null,
  };
}

export async function seedDemoData() {
  assertDemoSeedEnabled();
  assertSafeDemoDatabaseTarget();
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection is required for demo seeding.");
  }

  const authMode = getAuthMode();
  for (const company of DEMO_COMPANIES) {
    await seedDemoCompany(db, company, authMode);
  }

  return buildSeedSummary(db, authMode);
}

export async function rollbackDemoData() {
  assertDemoSeedEnabled();
  assertSafeDemoDatabaseTarget();
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection is required for demo rollback.");
  }

  const demoFleets = await fetchDemoFleets(db);
  for (const fleet of demoFleets) {
    await clearFleetScopedDemoData(db, fleet.id);
    await db.delete(fleets).where(eq(fleets.id, fleet.id));
  }

  const demoUsers = await fetchDemoUsers(db);
  const demoUserIds = demoUsers.map((user) => user.id);
  if (demoUserIds.length > 0) {
    await db
      .delete(subscriptions)
      .where(
        or(
          inArray(subscriptions.userId, demoUserIds),
          inArray(subscriptions.fleetId, demoFleets.map((fleet) => fleet.id))
        )
      )
      .catch(() => undefined);
    await db.delete(companyMemberships).where(inArray(companyMemberships.userId, demoUserIds)).catch(() => undefined);
    await db.delete(users).where(inArray(users.id, demoUserIds));
  }

  if (ENV.supabaseUrl && ENV.supabaseServiceRoleKey) {
    for (const email of DEMO_USER_EMAILS) {
      await deleteSupabaseAdminUserByEmail(email);
    }
  }

  return {
    deletedFleetCount: demoFleets.length,
    deletedUserCount: demoUsers.length,
    deletedSupabaseAuthUsers: Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey),
  };
}

export async function validateDemoSeed() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection is required for demo validation.");
  }

  const checks: ValidationCheck[] = [];
  const demoUsers = await fetchDemoUsers(db);
  const demoFleets = await fetchDemoFleets(db);
  const fleetIds = demoFleets.map((fleet) => fleet.id);
  const vehiclesByFleet =
    fleetIds.length > 0
      ? await db.select().from(vehicles).where(inArray(vehicles.fleetId, fleetIds))
      : [];
  const membershipsByFleet =
    fleetIds.length > 0
      ? await db.select().from(companyMemberships).where(inArray(companyMemberships.fleetId, fleetIds))
      : [];
  const assignmentsByFleet =
    fleetIds.length > 0
      ? await db.select().from(vehicleAssignments).where(inArray(vehicleAssignments.fleetId, fleetIds))
      : [];
  const inspectionsByFleet =
    fleetIds.length > 0
      ? await db.select().from(inspections).where(inArray(inspections.fleetId, fleetIds))
      : [];
  const defectsByFleet =
    fleetIds.length > 0
      ? await db.select().from(defects).where(inArray(defects.fleetId, fleetIds))
      : [];
  const diagnosticsByFleet =
    fleetIds.length > 0
      ? await db.select().from(aiTriageRecords).where(inArray(aiTriageRecords.fleetId, fleetIds))
      : [];
  const maintenanceByFleet =
    fleetIds.length > 0
      ? await db.select().from(maintenanceLogs).where(inArray(maintenanceLogs.fleetId, fleetIds))
      : [];
  const repairsByFleet =
    fleetIds.length > 0
      ? await db.select().from(repairOutcomes).where(inArray(repairOutcomes.fleetId, fleetIds))
      : [];
  const flagsByFleet =
    fleetIds.length > 0
      ? await db.select().from(inspectionFlags).where(inArray(inspectionFlags.fleetId, fleetIds))
      : [];

  checks.push({
    name: "demo_companies_exist",
    ok: demoFleets.length === 3,
    details: `Expected 3 demo companies, found ${demoFleets.length}.`,
  });

  checks.push({
    name: "demo_users_exist",
    ok: demoUsers.length === 12,
    details: `Expected 12 demo users, found ${demoUsers.length}.`,
  });

  checks.push({
    name: "demo_vehicles_exist",
    ok: vehiclesByFleet.length === 18,
    details: `Expected 18 demo vehicles, found ${vehiclesByFleet.length}.`,
  });

  for (const company of DEMO_COMPANIES) {
    const fleet = demoFleets.find((row) => row.name === company.name);
    const fleetMemberships = membershipsByFleet.filter((row) => row.fleetId === fleet?.id && row.status === "active");
    const roleCount = (role: DemoRole) => fleetMemberships.filter((row) => row.role === role).length;
    const fleetVehicles = vehiclesByFleet.filter((vehicle) => vehicle.fleetId === fleet?.id);
    checks.push({
      name: `${company.key}_membership_shape`,
      ok: roleCount("owner") === 1 && roleCount("manager") === 1 && roleCount("driver") === 2,
      details: `${company.name} expected 1 owner, 1 manager, 2 drivers; found ${roleCount("owner")}/${roleCount("manager")}/${roleCount("driver")}.`,
    });
    checks.push({
      name: `${company.key}_vehicle_count`,
      ok: fleetVehicles.length === company.vehicles.length,
      details: `${company.name} expected ${company.vehicles.length} vehicles, found ${fleetVehicles.length}.`,
    });
  }

  const demoDriverIds = demoUsers.filter((user) => user.role === "driver").map((user) => user.id);
  const activeAssignmentCountByDriver = new Map<number, number>();
  for (const assignment of assignmentsByFleet.filter((row) => row.status === "active" && row.driverUserId != null)) {
    activeAssignmentCountByDriver.set(
      assignment.driverUserId!,
      (activeAssignmentCountByDriver.get(assignment.driverUserId!) ?? 0) + 1
    );
  }
  checks.push({
    name: "drivers_have_assignments",
    ok: demoDriverIds.every((driverId) => (activeAssignmentCountByDriver.get(driverId) ?? 0) > 0),
    details: "Every demo driver should have at least one active vehicle assignment.",
  });

  const trailerCount = vehiclesByFleet.filter((vehicle) => vehicle.isTrailer).length;
  checks.push({
    name: "trailers_are_separate_assets",
    ok: trailerCount === 5,
    details: `Expected 5 trailer assets with independent records, found ${trailerCount}.`,
  });

  checks.push({
    name: "operational_records_exist",
    ok:
      inspectionsByFleet.length >= 15 &&
      defectsByFleet.length >= 7 &&
      diagnosticsByFleet.length >= 5 &&
      maintenanceByFleet.length >= 8 &&
      repairsByFleet.length >= 4 &&
      flagsByFleet.length >= 3,
    details:
      "Expected seeded inspections, defects, diagnostics, maintenance logs, repair outcomes, and inspection flags across the demo fleets.",
  });

  const recurringVehicles = new Set<string>();
  const defectCountByVehicle = new Map<string, number>();
  for (const defect of defectsByFleet) {
    defectCountByVehicle.set(defect.vehicleId, (defectCountByVehicle.get(defect.vehicleId) ?? 0) + 1);
  }
  for (const [vehicleId, count] of defectCountByVehicle) {
    if (count >= 2) recurringVehicles.add(vehicleId);
  }
  checks.push({
    name: "dashboard_outliers_seeded",
    ok:
      recurringVehicles.size >= 2 &&
      vehiclesByFleet.some((vehicle) => vehicle.status === "retired") &&
      defectsByFleet.some((defect) => defect.status !== "resolved" && defect.complianceStatus === "red") &&
      maintenanceByFleet.some((log) => log.completedAt == null),
    details:
      "Expected recurring issues, an out-of-service unit, open red defects, and open maintenance reminders for dashboard storytelling.",
  });

  const targetRollbackFleetsAreExact = demoFleets.every(
    (fleet) =>
      DEMO_COMPANY_NAMES.includes(fleet.name) &&
      DEMO_COMPANY_EMAILS.includes(fleet.companyEmail ?? "") &&
      DEMO_INVITE_CODES.includes(fleet.inviteCode ?? "")
  );
  const targetRollbackUsersAreDemoOnly = demoUsers.every((user) =>
    normalizeEmail(user.email ?? "").endsWith(`@${DEMO_EMAIL_DOMAIN}`)
  );
  checks.push({
    name: "rollback_scope_is_demo_only",
    ok: targetRollbackFleetsAreExact && targetRollbackUsersAreDemoOnly,
    details:
      "Rollback selectors should only match the configured demo fleet names/emails/invite codes and demo-domain user emails.",
  });

  const mapleManager = demoUsers.find((user) => user.email === "manager.maple@truckfixr-demo.example.com");
  const peelManager = demoUsers.find((user) => user.email === "manager.peel@truckfixr-demo.example.com");
  const mapleDriver = demoUsers.find((user) => user.email === "driver1.maple@truckfixr-demo.example.com");
  const peelVehicle = vehiclesByFleet.find((vehicle) => vehicle.id === "demo-peel-pct-b302");
  const mapleVehicle = vehiclesByFleet.find((vehicle) => vehicle.id === "demo-maple-mrl-102");
  if (mapleManager && peelManager && mapleDriver && peelVehicle && mapleVehicle) {
    const mapleManagerCanSeePeelVehicle = await canViewVehicle({
      user: buildManagerRecord(mapleManager),
      vehicleId: peelVehicle.id,
    });
    const peelManagerCanManageMapleFleet = await canManageCompanyOperations({
      fleetId: mapleVehicle.fleetId,
      user: buildManagerRecord(peelManager),
    });
    const mapleDriverAccessibleVehicles = await listDriverAccessibleVehiclesAcrossFleets({
      driverUserId: mapleDriver.id,
    });
    const mapleDriverVehicleIds = new Set(mapleDriverAccessibleVehicles.map((vehicle) => vehicle.id));
    const mapleAssignedVehicleIds = new Set(
      assignmentsByFleet
        .filter((assignment) => assignment.driverUserId === mapleDriver.id && assignment.status === "active")
        .map((assignment) => assignment.vehicleId)
    );
    const driverScopeOkay =
      mapleDriverAccessibleVehicles.length > 0 &&
      Array.from(mapleDriverVehicleIds).every((vehicleId) => mapleAssignedVehicleIds.has(vehicleId));

    checks.push({
      name: "runtime_company_separation",
      ok:
        mapleManagerCanSeePeelVehicle === false &&
        peelManagerCanManageMapleFleet === false &&
        driverScopeOkay,
      details:
        "Runtime helper checks should prevent cross-company visibility and keep drivers scoped to assigned units only.",
    });
  } else {
    checks.push({
      name: "runtime_company_separation",
      ok: false,
      details: "Unable to resolve seeded manager/driver/vehicle rows for access validation.",
    });
  }

  const failedChecks = checks.filter((check) => !check.ok);
  return {
    ok: failedChecks.length === 0,
    checks,
    authMode: getAuthMode(),
  };
}
