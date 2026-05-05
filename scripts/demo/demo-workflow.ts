import { eq } from "drizzle-orm";
import { writeFile, mkdir, rm, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../../server/db";
import { hashPassword } from "../../server/_core/localUsers";
import {
  adminAlerts,
  aiRequestLogs,
  aiTriageRecords,
  companyMemberships,
  defects,
  fleets,
  inAppAlerts,
  inspectionChecklistResponses,
  inspectionFlags,
  inspectionPhotos,
  inspections,
  maintenanceLogs,
  randomProofRequests,
  repairOutcomes,
  subscriptions,
  users,
  vehicleAccessRequests,
  vehicleAssignments,
  vehicles,
  diagnosticReviewQueue,
} from "../../drizzle/schema";
import {
  DEMO_DIAGNOSIS_CASES,
  DEMO_FLEET_SEED,
  buildPlaceholderSvgDataUri,
  assertSafeDemoMode,
  assertSafeDemoDatabaseTarget,
  makeDemoPlate,
  makeDemoUnitNumber,
  makeDemoVehicleId,
} from "../../shared/demoAssets";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type DemoManifest = {
  environment: string;
  capturedAt: string;
  fleet: {
    id: number;
    name: string;
    inviteCode: string;
  };
  users: {
    ownerId: number;
    managerId: number;
    driverId: number;
  };
  vehicles: {
    poweredVehicleIds: string[];
    trailerIds: string[];
    primaryPoweredVehicleId: string;
    primaryTrailerId: string;
    absVehicleId: string;
    defVehicleId: string;
    airLeakVehicleId: string;
    maintenanceHistoryVehicleId: string;
  };
  inspections: {
    absInspectionId: number;
    defInspectionId: number;
    airLeakInspectionId: number;
    maintenanceInspectionId: number;
  };
  defects: {
    absDefectId: number;
    defDefectId: number;
    airLeakDefectId: number;
    maintenanceDefectId: number;
  };
  routes: Record<string, string>;
};

type DemoUserRow = {
  id: number;
  email: string | null;
  openId: string;
};

function getOutputRoot() {
  return join(process.cwd(), "exports", "demo-assets");
}

export function getPublicDemoRoot() {
  return join(process.cwd(), "client", "public", "demo-assets");
}

function demoLogoCaption(label: string) {
  return `${label} - TruckFixr demo proof`;
}

async function ensureDirSafe(path: string) {
  await mkdir(path, { recursive: true });
}

async function writeJson(path: string, value: unknown) {
  await ensureDirSafe(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function selectSingle<T>(promise: Promise<T[]>): Promise<T | null> {
  const rows = await promise;
  return rows[0] ?? null;
}

async function upsertUserRow(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    openId: string;
    email: string;
    name: string;
    role: "owner" | "manager" | "driver";
    password: string;
    managerEmail?: string | null;
    managerUserId?: number | null;
  }
): Promise<DemoUserRow> {
  const passwordHash = await hashPassword(input.password);
  await db
    .insert(users)
    .values({
      openId: input.openId,
      name: input.name,
      email: input.email,
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
      currentPeriodStart: null,
      currentPeriodEnd: null,
      trialStart: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      lastAuthAt: new Date(),
      lastSignedIn: new Date(),
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
        lastAuthAt: new Date(),
        lastSignedIn: new Date(),
        updatedAt: new Date(),
      },
    });

  const user = await selectSingle(
    db.select({ id: users.id, email: users.email, openId: users.openId }).from(users).where(eq(users.email, input.email)).limit(1)
  );

  if (!user) {
    throw new Error(`Unable to seed demo user ${input.email}`);
  }

  return user;
}

async function upsertFleetRow(
  db: Awaited<ReturnType<typeof getDb>>,
  ownerId: number,
  input: {
    name: string;
    companyEmail: string;
    companyPhone: string;
    address: string;
    inviteCode: string;
  }
) {
  const existing = await selectSingle(
    db.select().from(fleets).where(eq(fleets.name, input.name)).limit(1)
  );

  const row = {
    ownerId,
    companyEmail: input.companyEmail,
    companyPhone: input.companyPhone,
    address: input.address,
    inviteCode: input.inviteCode,
    subscriptionOwnerUserId: ownerId,
    activeVehicleLimit: DEMO_FLEET_SEED.poweredVehicleCount,
    subscriptionStatus: "active" as const,
    billingInterval: "monthly",
    billingStatus: "active" as const,
    poweredVehicleLimit: DEMO_FLEET_SEED.poweredVehicleCount,
    includedTrailerLimit: DEMO_FLEET_SEED.trailerCount,
    paidExtraTrailerQuantity: 0,
    totalActiveTrailerLimit: DEMO_FLEET_SEED.trailerCount,
    aiSessionMonthlyLimit: 999,
    aiSessionsUsedCurrentPeriod: 0,
    aiSessionsResetAt: new Date(),
    premiumTadis: true,
    trialStartedAt: null,
    trialEndsAt: null,
    subscriptionStartedAt: new Date(),
    subscriptionRenewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    isTrial: false,
    isPaidPilot: false,
    paidPilotStartedAt: null,
    paidPilotEndsAt: null,
    salesStatus: "demo",
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(fleets).set(row).where(eq(fleets.id, existing.id));
    return { ...existing, ...row };
  }

  const [inserted] = await db
    .insert(fleets)
    .values({
      name: input.name,
      ...row,
      createdAt: new Date(),
    })
    .returning();

  if (!inserted) {
    throw new Error("Unable to create demo fleet");
  }

  return inserted;
}

async function clearDemoFleetRows(db: Awaited<ReturnType<typeof getDb>>, fleetId: number) {
  const tableDeletes: Array<Promise<unknown>> = [
    db.delete(inspectionChecklistResponses).where(eq(inspectionChecklistResponses.fleetId, fleetId)),
    db.delete(inspectionPhotos).where(eq(inspectionPhotos.fleetId, fleetId)),
    db.delete(randomProofRequests).where(eq(randomProofRequests.fleetId, fleetId)),
    db.delete(inspectionFlags).where(eq(inspectionFlags.fleetId, fleetId)),
    db.delete(aiTriageRecords).where(eq(aiTriageRecords.fleetId, fleetId)),
    db.delete(repairOutcomes).where(eq(repairOutcomes.fleetId, fleetId)),
    db.delete(maintenanceLogs).where(eq(maintenanceLogs.fleetId, fleetId)),
    db.delete(inAppAlerts).where(eq(inAppAlerts.fleetId, fleetId)),
    db.delete(adminAlerts).where(eq(adminAlerts.fleetId, fleetId)),
    db.delete(diagnosticReviewQueue).where(eq(diagnosticReviewQueue.fleetId, fleetId)),
    db.delete(vehicleAccessRequests).where(eq(vehicleAccessRequests.fleetId, fleetId)),
    db.delete(vehicleAssignments).where(eq(vehicleAssignments.fleetId, fleetId)),
    db.delete(subscriptions).where(eq(subscriptions.fleetId, fleetId)),
    db.delete(aiRequestLogs).where(eq(aiRequestLogs.companyId, fleetId)),
    db.delete(defects).where(eq(defects.fleetId, fleetId)),
    db.delete(inspections).where(eq(inspections.fleetId, fleetId)),
    db.delete(vehicles).where(eq(vehicles.fleetId, fleetId)),
    db.delete(companyMemberships).where(eq(companyMemberships.fleetId, fleetId)),
  ];

  for (const deletion of tableDeletes) {
    await deletion;
  }
}

function buildDemoVehicleRows(fleetId: number, ownerId: number, managerId: number, driverId: number) {
  const rows = [];
  const locations = ["Brampton Depot", "Mississauga Yard", "Hamilton Satellite"];
  const poweredVehicleTypes = [
    { assetType: "tractor", vehicleType: "tractor", make: "Volvo", model: "VNL", engineMake: "Volvo" },
    { assetType: "straight_truck", vehicleType: "straight_truck", make: "Isuzu", model: "NRR", engineMake: "Isuzu" },
    { assetType: "bus", vehicleType: "bus", make: "New Flyer", model: "Xcelsior", engineMake: "Cummins" },
    { assetType: "van", vehicleType: "van", make: "Ford", model: "Transit", engineMake: "Ford" },
  ] as const;
  const trailerTypes = [
    { assetType: "trailer", vehicleType: "dry_van", make: "Great Dane", model: "Dry Van" },
    { assetType: "trailer", vehicleType: "reefer", make: "Utility", model: "Reefer" },
    { assetType: "trailer", vehicleType: "flatbed", make: "Fontaine", model: "Flatbed" },
    { assetType: "trailer", vehicleType: "dump_trailer", make: "Mac", model: "Dump Trailer" },
    { assetType: "trailer", vehicleType: "tanker", make: "Polar", model: "Tanker" },
    { assetType: "trailer", vehicleType: "utility_trailer", make: "Wabash", model: "Utility Trailer" },
    { assetType: "trailer", vehicleType: "other_trailer", make: "Brenner", model: "Equipment Trailer" },
  ] as const;

  const poweredVehicleIds: string[] = [];
  const trailerIds: string[] = [];

  for (let index = 1; index <= DEMO_FLEET_SEED.poweredVehicleCount; index += 1) {
    const template = poweredVehicleTypes[(index - 1) % poweredVehicleTypes.length];
    const id = makeDemoVehicleId(index);
    poweredVehicleIds.push(id);
    rows.push({
      id,
      fleetId,
      assignedDriverId: index <= 2 ? driverId : null,
      assetType: template.assetType,
      assetCategory: "powered_vehicle",
      vehicleType: template.vehicleType,
      isPoweredVehicle: true,
      isTrailer: false,
      unitNumber: makeDemoUnitNumber(index),
      vin: `1HGBH41JXMN${String(index).padStart(6, "0")}`,
      licensePlate: makeDemoPlate(index),
      make: template.make,
      engineMake: template.engineMake,
      model: template.model,
      year: 2020 + (index % 5),
      mileage: 82000 + index * 71,
      engineHours: 4200 + index * 11,
      configuration: {
        location: locations[(index - 1) % locations.length],
        demo: true,
      },
      complianceStatus: index === 1 ? "yellow" : index === 2 ? "red" : "green",
      status: "active",
      assetRecordStatus: "active",
      trailerLinkStatus: null,
      linkedPoweredVehicleId: null,
      createdByUserId: ownerId,
      createdAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
  }

  for (let index = 1; index <= DEMO_FLEET_SEED.trailerCount; index += 1) {
    const template = trailerTypes[(index - 1) % trailerTypes.length];
    const id = `demo-trailer-${String(index).padStart(3, "0")}`;
    trailerIds.push(id);
    const linkedPoweredVehicleId = index <= 10 ? poweredVehicleIds[index - 1] : null;
    rows.push({
      id,
      fleetId,
      assignedDriverId: index === 1 ? driverId : null,
      assetType: template.assetType,
      assetCategory: "trailer",
      vehicleType: template.vehicleType,
      isPoweredVehicle: false,
      isTrailer: true,
      unitNumber: `TR-${String(index).padStart(3, "0")}`,
      vin: `2HGBH41JXMN${String(index).padStart(6, "0")}`,
      licensePlate: `TRL-${String(index).padStart(4, "0")}`,
      make: template.make,
      engineMake: null,
      model: template.model,
      year: 2019 + (index % 4),
      mileage: 12000 + index * 31,
      engineHours: 0,
      configuration: {
        location: locations[(index - 1) % locations.length],
        demo: true,
      },
      complianceStatus: index === 2 ? "yellow" : "green",
      status: "active",
      assetRecordStatus: "active",
      trailerLinkStatus: linkedPoweredVehicleId ? "linked" : "unlinked_active",
      linkedPoweredVehicleId,
      createdByUserId: ownerId,
      createdAt: new Date(Date.now() - index * 12 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
  }

  return { rows, poweredVehicleIds, trailerIds };
}

function buildInspectionResult(label: string, status: "green" | "yellow" | "red", notes: string) {
  return {
    workflow: "verified_daily",
    label,
    status,
    notes,
  };
}

async function seedInspectionSet(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    fleetId: number;
    vehicleId: string;
    driverId: number;
    defectTitle: string;
    defectDescription: string;
    inspectionDate: Date;
    result: "no_defect" | "defect_reported" | "critical_defect";
    complianceStatus: "green" | "yellow" | "red";
    integrityScore: number;
    requestedProofItems: string[];
    photoLabel: string;
    demoCaseKey: keyof typeof DEMO_DIAGNOSIS_CASES;
  }
) {
  const startedAt = new Date(input.inspectionDate.getTime() - 12 * 60 * 1000);
  const submittedAt = new Date(input.inspectionDate.getTime() + 8 * 60 * 1000);
  const [inspectionRow] = await db
    .insert(inspections)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      templateId: null,
      status: "submitted",
      inspectionDate: input.inspectionDate,
      startedAt,
      durationSeconds: 580,
      overallVehicleResult: input.result,
      notes: input.defectDescription,
      locationStatus: "granted",
      startLatitude: "43.6789",
      startLongitude: "-79.7661",
      startLocationAccuracy: "18.5",
      startLocationCapturedAt: startedAt,
      submitLatitude: "43.6791",
      submitLongitude: "-79.7655",
      submitLocationAccuracy: "20.1",
      submitLocationCapturedAt: submittedAt,
      integrityScore: input.integrityScore,
      complianceStatus: input.complianceStatus,
      results: buildInspectionResult(input.demoCaseKey, input.complianceStatus, input.defectDescription),
      createdAt: startedAt,
      submittedAt,
      updatedAt: submittedAt,
    })
    .returning();

  if (!inspectionRow) {
    throw new Error("Unable to seed demo inspection");
  }

  await db.insert(inspectionChecklistResponses).values([
    {
      inspectionId: inspectionRow.id,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      checklistItemId: "dashboard_warning_lights",
      checklistItemLabel: "Dashboard warning lights",
      category: "dashboard",
      result: input.complianceStatus === "green" ? "pass" : "issue_found",
      defectDescription: input.defectDescription,
      severity: input.complianceStatus === "red" ? "critical" : "moderate",
      note: input.defectDescription,
      unableToTakePhoto: false,
      unableToTakePhotoReason: null,
      createdAt: startedAt,
      updatedAt: submittedAt,
    },
    {
      inspectionId: inspectionRow.id,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      checklistItemId: "tires_and_wheels",
      checklistItemLabel: "Tires and wheels",
      category: "rolling_stock",
      result: "pass",
      defectDescription: null,
      severity: null,
      note: "Tread depth and sidewalls reviewed.",
      unableToTakePhoto: false,
      unableToTakePhotoReason: null,
      createdAt: startedAt,
      updatedAt: submittedAt,
    },
  ]);

  await db.insert(randomProofRequests).values(
    input.requestedProofItems.map((proofItem, index) => ({
      inspectionId: inspectionRow.id,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      proofItem,
      photoSubmitted: index === 0,
      photoUrl: index === 0 ? buildPlaceholderSvgDataUri(demoLogoCaption(proofItem)) : null,
      complianceStatus: index === 0 ? "submitted" : "failed_upload",
      createdAt: startedAt,
      updatedAt: submittedAt,
    }))
  );

  await db.insert(inspectionPhotos).values({
    inspectionId: inspectionRow.id,
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    driverId: input.driverId,
    checklistItemId: "dashboard_warning_lights",
    photoType: "defect",
    imageUrl: buildPlaceholderSvgDataUri(demoLogoCaption(input.photoLabel)),
    source: "upload",
    notes: input.defectDescription,
    uploadedAt: submittedAt,
  });

  const [defectRow] = await db
    .insert(defects)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      inspectionId: inspectionRow.id,
      driverId: input.driverId,
      title: input.defectTitle,
      description: input.defectDescription,
      category: input.demoCaseKey === "air_leak" ? "air_brake_system" : input.demoCaseKey === "def_derate" ? "aftertreatment" : "electrical",
      severity: input.complianceStatus === "red" ? "critical" : "moderate",
      complianceStatus: input.complianceStatus,
      status: input.complianceStatus === "green" ? "resolved" : "open",
      latestFollowUpStatus: input.complianceStatus === "green" ? "repaired" : "still_present",
      latestFollowUpAt: submittedAt,
      resolvedByUserId: input.complianceStatus === "green" ? input.driverId : null,
      resolvedAt: input.complianceStatus === "green" ? submittedAt : null,
      aiRecommendation: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.driver_action,
      aiConfidenceScore: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.confidence_score,
      aiSummary: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.manager_summary,
      photoUrls: [buildPlaceholderSvgDataUri(input.photoLabel)],
      createdAt: startedAt,
      updatedAt: submittedAt,
    })
    .returning();

  if (!defectRow) {
    throw new Error("Unable to seed demo defect");
  }

  await db.insert(aiTriageRecords).values({
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    inspectionId: inspectionRow.id,
    defectId: defectRow.id,
    mostLikelyCause: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.top_most_likely_cause,
    severity: input.complianceStatus,
    confidenceScore: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.confidence_score,
    recommendedAction: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.driver_action,
    driverMessage: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.driver_message,
    managerSummary: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.manager_summary,
    clarifyingQuestions: [],
    safetyWarning: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.risk_summary,
    suggestedNextSteps: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.recommended_tests,
    rawResult: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result,
    createdAt: submittedAt,
  });

  if (input.complianceStatus === "red") {
    await db.insert(inspectionFlags).values({
      inspectionId: inspectionRow.id,
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      flagType: "critical_defect",
      severity: "high",
      message: `${input.defectTitle} requires immediate review before dispatch.`,
      createdAt: submittedAt,
    });

    await db.insert(inAppAlerts).values({
      fleetId: input.fleetId,
      userId: input.driverId,
      vehicleId: input.vehicleId,
      inspectionId: inspectionRow.id,
      defectId: defectRow.id,
      alertType: "critical_defect",
      severity: "high",
      title: input.defectTitle,
      message: input.defectDescription,
      status: "open",
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });

    await db.insert(adminAlerts).values({
      userId: input.driverId,
      fleetId: input.fleetId,
      type: "critical_defect",
      title: input.defectTitle,
      body: input.defectDescription,
      metadata: {
        inspectionId: inspectionRow.id,
        vehicleId: input.vehicleId,
        demoCaseKey: input.demoCaseKey,
      },
      status: "open",
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });

    await db.insert(diagnosticReviewQueue).values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      reviewType: "demo_diagnostic",
      status: "review_pending",
      summary: input.defectDescription,
      baselineTopCause: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.top_most_likely_cause,
      finalTopCause: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.top_most_likely_cause,
      confidenceDelta: 0,
      evidenceSnapshot: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result,
      baselineRanking: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.possible_causes,
      finalRanking: DEMO_DIAGNOSIS_CASES[input.demoCaseKey].result.final_llm_ranking,
      rationale: {
        mode: "demo",
        label: input.photoLabel,
      },
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });
  }

  return { inspectionId: inspectionRow.id, defectId: defectRow.id };
}

async function seedMaintenanceOutcome(
  db: Awaited<ReturnType<typeof getDb>>,
  input: {
    fleetId: number;
    vehicleId: string;
    driverId: number;
    defectTitle: string;
    defectDescription: string;
    completedAt: Date;
  }
) {
  const [inspectionRow] = await db
    .insert(inspections)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      templateId: null,
      status: "submitted",
      inspectionDate: input.completedAt,
      startedAt: new Date(input.completedAt.getTime() - 25 * 60 * 1000),
      durationSeconds: 900,
      overallVehicleResult: "no_defect",
      notes: input.defectDescription,
      locationStatus: "granted",
      startLatitude: "43.6820",
      startLongitude: "-79.7670",
      startLocationAccuracy: "12.1",
      startLocationCapturedAt: input.completedAt,
      submitLatitude: "43.6825",
      submitLongitude: "-79.7664",
      submitLocationAccuracy: "13.8",
      submitLocationCapturedAt: input.completedAt,
      integrityScore: 96,
      complianceStatus: "green",
      results: {
        workflow: "verified_daily",
        label: "maintenance_demo",
        notes: input.defectDescription,
      },
      createdAt: input.completedAt,
      submittedAt: input.completedAt,
      updatedAt: input.completedAt,
    })
    .returning();

  if (!inspectionRow) {
    throw new Error("Unable to seed maintenance inspection");
  }

  const [defectRow] = await db
    .insert(defects)
    .values({
      fleetId: input.fleetId,
      vehicleId: input.vehicleId,
      inspectionId: inspectionRow.id,
      driverId: input.driverId,
      title: input.defectTitle,
      description: input.defectDescription,
      category: "cooling_system",
      severity: "minor",
      complianceStatus: "green",
      status: "resolved",
      latestFollowUpStatus: "repaired",
      latestFollowUpAt: input.completedAt,
      resolvedByUserId: input.driverId,
      resolvedAt: input.completedAt,
      aiRecommendation: "Replace defective hose clamp and retorque after road test",
      aiConfidenceScore: 94,
      aiSummary: "Resolved maintenance case used to populate service history.",
      createdAt: input.completedAt,
      updatedAt: input.completedAt,
    })
    .returning();

  if (!defectRow) {
    throw new Error("Unable to seed maintenance defect");
  }

  await db.insert(repairOutcomes).values({
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    defectId: defectRow.id,
    recordedByUserId: input.driverId,
    confirmedFault: input.defectTitle,
    repairPerformed: "Replaced hose clamp and resealed the cooling line",
    partsReplaced: ["Hose clamp", "Coolant line seal"],
    aiDiagnosisCorrect: "yes",
    downtimeStart: new Date(input.completedAt.getTime() - 8 * 60 * 60 * 1000),
    downtimeEnd: input.completedAt,
    returnedToServiceAt: input.completedAt,
    repairNotes: input.defectDescription,
    createdAt: input.completedAt,
    updatedAt: input.completedAt,
  });

  await db.insert(maintenanceLogs).values({
    fleetId: input.fleetId,
    vehicleId: input.vehicleId,
    defectId: defectRow.id,
    type: "repair",
    description: "Resolved cooling line service history entry for demo maintenance timeline.",
    cost: "118.50",
    completedAt: input.completedAt,
    createdAt: input.completedAt,
  });

  return { inspectionId: inspectionRow.id, defectId: defectRow.id };
}

export async function seedDemoData() {
  assertSafeDemoMode();
  assertSafeDemoDatabaseTarget();
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection is required for demo seeding.");
  }

  const environment = process.env.DEMO_CAPTURE_ENV?.trim() || "local";
  const capturedAt = new Date().toISOString();

  const owner = await upsertUserRow(db, {
    openId: "demo-owner-brampton",
    email: DEMO_FLEET_SEED.ownerEmail,
    name: "Avery Patel",
    role: "owner",
    password: DEMO_FLEET_SEED.password,
  });
  const manager = await upsertUserRow(db, {
    openId: "demo-manager-brampton",
    email: DEMO_FLEET_SEED.managerEmail,
    name: "Morgan Ellis",
    role: "manager",
    password: DEMO_FLEET_SEED.password,
    managerEmail: DEMO_FLEET_SEED.ownerEmail,
    managerUserId: owner.id,
  });
  const driver = await upsertUserRow(db, {
    openId: "demo-driver-brampton",
    email: DEMO_FLEET_SEED.driverEmail,
    name: "Jordan Singh",
    role: "driver",
    password: DEMO_FLEET_SEED.password,
    managerEmail: DEMO_FLEET_SEED.managerEmail,
    managerUserId: manager.id,
  });

  const fleet = await upsertFleetRow(db, owner.id, DEMO_FLEET_SEED);

  await clearDemoFleetRows(db, fleet.id);

  await db.insert(companyMemberships).values([
    {
      fleetId: fleet.id,
      userId: owner.id,
      role: "owner",
      status: "active",
      approvedByUserId: owner.id,
      joinedAt: new Date(),
      removedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      fleetId: fleet.id,
      userId: manager.id,
      role: "manager",
      status: "active",
      approvedByUserId: owner.id,
      joinedAt: new Date(),
      removedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      fleetId: fleet.id,
      userId: driver.id,
      role: "driver",
      status: "active",
      approvedByUserId: manager.id,
      joinedAt: new Date(),
      removedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  await db.insert(subscriptions).values({
    userId: owner.id,
    fleetId: fleet.id,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePriceId: null,
    tier: "fleet",
    billingCadence: "monthly",
    billingStatus: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const { rows: vehicleRows, poweredVehicleIds, trailerIds } = buildDemoVehicleRows(
    fleet.id,
    owner.id,
    manager.id,
    driver.id
  );

  await db.insert(vehicles).values(vehicleRows);

  await db.insert(vehicleAssignments).values([
    {
      fleetId: fleet.id,
      vehicleId: poweredVehicleIds[0],
      driverUserId: driver.id,
      driverInvitationId: null,
      assignedByUserId: manager.id,
      accessType: "permanent",
      startsAt: new Date(),
      expiresAt: null,
      status: "active",
      notes: "Primary unit for the demo driver.",
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      fleetId: fleet.id,
      vehicleId: trailerIds[0],
      driverUserId: driver.id,
      driverInvitationId: null,
      assignedByUserId: manager.id,
      accessType: "permanent",
      startsAt: new Date(),
      expiresAt: null,
      status: "active",
      notes: "Linked trailer for the demo driver.",
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      fleetId: fleet.id,
      vehicleId: poweredVehicleIds[1],
      driverUserId: driver.id,
      driverInvitationId: null,
      assignedByUserId: manager.id,
      accessType: "temporary",
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      status: "active",
      notes: "Temporary shared assignment for a tractor/trailer pairing.",
      revokedAt: null,
      revokedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const absCase = await seedInspectionSet(db, {
    fleetId: fleet.id,
    vehicleId: poweredVehicleIds[0],
    driverId: driver.id,
    defectTitle: "ABS warning light",
    defectDescription: DEMO_DIAGNOSIS_CASES.abs_warning.result.driver_message,
    inspectionDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
    result: "defect_reported",
    complianceStatus: "yellow",
    integrityScore: 87,
    requestedProofItems: ["dashboard", "left front tire"],
    photoLabel: "ABS warning proof",
    demoCaseKey: "abs_warning",
  });

  const defCase = await seedInspectionSet(db, {
    fleetId: fleet.id,
    vehicleId: poweredVehicleIds[1],
    driverId: driver.id,
    defectTitle: "DEF / emissions derate warning",
    defectDescription: DEMO_DIAGNOSIS_CASES.def_derate.result.driver_message,
    inspectionDate: new Date(Date.now() - 26 * 60 * 60 * 1000),
    result: "critical_defect",
    complianceStatus: "red",
    integrityScore: 82,
    requestedProofItems: ["dashboard", "rear tires"],
    photoLabel: "DEF warning proof",
    demoCaseKey: "def_derate",
  });

  const airLeakCase = await seedInspectionSet(db, {
    fleetId: fleet.id,
    vehicleId: poweredVehicleIds[2],
    driverId: driver.id,
    defectTitle: "Air brake system leak",
    defectDescription: DEMO_DIAGNOSIS_CASES.air_leak.result.driver_message,
    inspectionDate: new Date(Date.now() - 72 * 60 * 60 * 1000),
    result: "critical_defect",
    complianceStatus: "red",
    integrityScore: 91,
    requestedProofItems: ["dashboard", "trailer connection"],
    photoLabel: "Air leak proof",
    demoCaseKey: "air_leak",
  });

  const maintenanceHistory = await seedMaintenanceOutcome(db, {
    fleetId: fleet.id,
    vehicleId: poweredVehicleIds[20],
    driverId: driver.id,
    defectTitle: "Coolant line seepage",
    defectDescription: "Cooling line clamp was replaced and the unit returned to service.",
    completedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
  });

  await db.insert(randomProofRequests).values({
    inspectionId: absCase.inspectionId,
    fleetId: fleet.id,
    vehicleId: poweredVehicleIds[0],
    driverId: driver.id,
    proofItem: "dashboard",
    photoSubmitted: true,
    photoUrl: buildPlaceholderSvgDataUri("Dashboard verification"),
    complianceStatus: "submitted",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(vehicleAccessRequests).values({
    fleetId: fleet.id,
    vehicleId: poweredVehicleIds[3],
    requestedVehicleIdentifier: "Brampton trailer swap - Unit BRM-004",
    requestedByDriverId: driver.id,
    reason: "trailer_swap",
    note: "Need short-term access for a demo transfer.",
    status: "pending",
    reviewedByUserId: null,
    reviewedAt: null,
    managerNote: null,
    accessTypeGranted: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const manifest: DemoManifest = {
    environment,
    capturedAt,
    fleet: {
      id: fleet.id,
      name: fleet.name,
      inviteCode: fleet.inviteCode,
    },
    users: {
      ownerId: owner.id,
      managerId: manager.id,
      driverId: driver.id,
    },
    vehicles: {
      poweredVehicleIds,
      trailerIds,
      primaryPoweredVehicleId: poweredVehicleIds[0],
      primaryTrailerId: trailerIds[0],
      absVehicleId: poweredVehicleIds[0],
      defVehicleId: poweredVehicleIds[1],
      airLeakVehicleId: poweredVehicleIds[2],
      maintenanceHistoryVehicleId: poweredVehicleIds[20],
    },
    inspections: {
      absInspectionId: absCase.inspectionId,
      defInspectionId: defCase.inspectionId,
      airLeakInspectionId: airLeakCase.inspectionId,
      maintenanceInspectionId: maintenanceHistory.inspectionId,
    },
    defects: {
      absDefectId: absCase.defectId,
      defDefectId: defCase.defectId,
      airLeakDefectId: airLeakCase.defectId,
      maintenanceDefectId: maintenanceHistory.defectId,
    },
    routes: {
      landing: "/",
      login: "/auth/email",
      signup: "/signup",
      pricing: "/pricing",
      ownerDashboard: "/manager",
      fleetOverview: "/manager",
      vehicleList: "/manager",
      addVehicle: "/manager",
      vehicleProfile: `/truck/${poweredVehicleIds[0]}`,
      driverAssignment: "/manager",
      dailyInspection: `/inspection?vehicle=${encodeURIComponent(poweredVehicleIds[0])}&fleet=${encodeURIComponent(String(fleet.id))}&mode=daily`,
      defectFlagged: `/defect/${airLeakCase.defectId}`,
      diagnosisIntake: `/diagnosis?vehicle=${encodeURIComponent(poweredVehicleIds[0])}&fleet=${encodeURIComponent(String(fleet.id))}&label=${encodeURIComponent("Unit BRM-001")}&vin=${encodeURIComponent(vehicleRows[0].vin)}&demoCase=abs_warning`,
      diagnosisResult: `/diagnosis?vehicle=${encodeURIComponent(poweredVehicleIds[1])}&fleet=${encodeURIComponent(String(fleet.id))}&label=${encodeURIComponent("Unit BRM-002")}&vin=${encodeURIComponent(vehicleRows[1].vin)}&demoCase=def_derate`,
      triage: `/diagnosis?vehicle=${encodeURIComponent(poweredVehicleIds[2])}&fleet=${encodeURIComponent(String(fleet.id))}&label=${encodeURIComponent("Unit BRM-003")}&vin=${encodeURIComponent(vehicleRows[2].vin)}&demoCase=air_leak`,
      maintenanceHistory: `/truck/${poweredVehicleIds[20]}`,
      complianceTracking: "/manager",
      settingsSubscription: "/profile",
      driverLogin: "/auth/email",
      assignedVehicle: "/driver",
      mobileInspection: `/inspection?vehicle=${encodeURIComponent(poweredVehicleIds[0])}&fleet=${encodeURIComponent(String(fleet.id))}&mode=daily`,
      mobileDefect: `/defect/${defCase.defectId}`,
      mobileDiagnosisIntake: `/diagnosis?vehicle=${encodeURIComponent(poweredVehicleIds[2])}&fleet=${encodeURIComponent(String(fleet.id))}&label=${encodeURIComponent("Unit BRM-003")}&vin=${encodeURIComponent(vehicleRows[2].vin)}&demoCase=air_leak`,
      mobileSafetyWarning: `/diagnosis?vehicle=${encodeURIComponent(poweredVehicleIds[2])}&fleet=${encodeURIComponent(String(fleet.id))}&label=${encodeURIComponent("Unit BRM-003")}&vin=${encodeURIComponent(vehicleRows[2].vin)}&demoCase=air_leak`,
      mobileDiagnosticResult: `/diagnosis?vehicle=${encodeURIComponent(poweredVehicleIds[1])}&fleet=${encodeURIComponent(String(fleet.id))}&label=${encodeURIComponent("Unit BRM-002")}&vin=${encodeURIComponent(vehicleRows[1].vin)}&demoCase=def_derate`,
    },
  };

  const manifestPath = join(getOutputRoot(), "demo-manifest.json");
  await ensureDirSafe(dirname(manifestPath));
  await writeJson(manifestPath, manifest);

  return manifest;
}

export async function syncPublicDemoAssets() {
  const sourceRoot = getOutputRoot();
  const targetRoot = getPublicDemoRoot();
  await ensureDirSafe(targetRoot);
  await cp(sourceRoot, targetRoot, { recursive: true });
}

export async function ensureDemoWorkflowReady() {
  await ensureDirSafe(getOutputRoot());
  await ensureDirSafe(getPublicDemoRoot());
}

export { getOutputRoot };
