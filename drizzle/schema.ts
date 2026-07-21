import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const defectActionTypeEnum = pgEnum("defect_action_type", [
  "acknowledge",
  "assign",
  "resolve",
  "comment",
]);
const complianceStatusEnum = pgEnum("compliance_status", [
  "green",
  "yellow",
  "red",
]);
const defectSeverityEnum = pgEnum("defect_severity", [
  "low",
  "minor",
  "medium",
  "moderate",
  "high",
  "critical",
]);
const defectStatusEnum = pgEnum("defect_status", [
  "open",
  "acknowledged",
  "assigned",
  "monitoring",
  "repair_required",
  "resolved",
  "dismissed",
]);
const inspectionStatusEnum = pgEnum("inspection_status", [
  "in_progress",
  "submitted",
  "reviewed",
  "completed",
  "incomplete",
  "flagged",
  "needs_review",
]);
const maintenanceTypeEnum = pgEnum("maintenance_type", [
  "repair",
  "preventive",
  "inspection",
]);
const pilotAccessCodeStatusEnum = pgEnum("pilot_access_code_status", [
  "active",
  "expired",
  "revoked",
]);
const pilotAccessRedemptionStatusEnum = pgEnum(
  "pilot_access_redemption_status",
  ["active", "expired", "revoked", "converted"]
);
const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free",
  "pilot",
  "pilot_access",
  "pro",
  "fleet",
]);
const billingCadenceEnum = pgEnum("billing_cadence", ["monthly", "annual"]);
const billingStatusEnum = pgEnum("billing_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "expired",
  "custom",
]);
const tadisUrgencyEnum = pgEnum("tadis_urgency", [
  "Monitor",
  "Attention",
  "Critical",
]);
const tadisRecommendedActionEnum = pgEnum("tadis_recommended_action", [
  "Keep Running",
  "Inspect Soon",
  "Stop Now",
]);
const userRoleEnum = pgEnum("user_role", ["owner", "manager", "driver"]);
const vehicleStatusEnum = pgEnum("vehicle_status", [
  "active",
  "maintenance",
  "retired",
]);
const assetTypeEnum = pgEnum("asset_type", [
  "tractor",
  "straight_truck",
  "trailer",
  "truck",
  "bus",
  "van",
  "reefer_trailer",
  "flatbed_trailer",
  "dry_van_trailer",
  "other",
]);
const companyMembershipStatusEnum = pgEnum("company_membership_status", [
  "pending",
  "active",
  "inactive",
  "removed",
]);
const companyInvitationStatusEnum = pgEnum("company_invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
const companyJoinRequestStatusEnum = pgEnum("company_join_request_status", [
  "pending",
  "approved",
  "denied",
  "cancelled",
]);
const assetRecordStatusEnum = pgEnum("asset_record_status", [
  "active",
  "inactive",
  "draft",
  "archived",
]);
const leadInterestTypeEnum = pgEnum("lead_interest_type", [
  "book_a_demo",
  "beta_access",
  "pilot_inquiry",
  "general_inquiry",
]);
const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "converted",
  "closed",
  "spam",
]);

const dateTimestamp = () => timestamp({ mode: "date" });

export const activityLogs = pgTable("activityLogs", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entityType", { length: 100 }),
  entityId: integer("entityId"),
  details: jsonb("details"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const defectActions = pgTable("defectActions", {
  id: serial("id").primaryKey(),
  defectId: integer("defectId"),
  managerId: integer("managerId").notNull(),
  actionType: defectActionTypeEnum("actionType").notNull(),
  notes: text("notes"),
  assignedTo: integer("assignedTo"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const defects = pgTable("defects", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  inspectionId: integer("inspectionId"),
  driverId: integer("driverId").notNull(),
  clientDraftId: varchar("clientDraftId", { length: 128 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  severity: defectSeverityEnum("severity").default("medium"),
  complianceStatus: complianceStatusEnum("complianceStatus")
    .default("green")
    .notNull(),
  status: defectStatusEnum("status").default("open"),
  managerReviewStatus: varchar("managerReviewStatus", { length: 32 })
    .default("submitted")
    .notNull(),
  managerReviewStatusUpdatedAt: dateTimestamp(),
  isBlockingOperationally: boolean("isBlockingOperationally")
    .default(false)
    .notNull(),
  escalatedFromMinor: boolean("escalatedFromMinor").default(false).notNull(),
  latestManagerDecision: varchar("latestManagerDecision", { length: 32 }),
  latestDriverInstruction: text("latestDriverInstruction"),
  latestManagerActionByUserId: integer("latestManagerActionByUserId"),
  latestManagerActionAt: dateTimestamp(),
  latestFollowUpStatus: varchar("latestFollowUpStatus", { length: 64 }),
  latestFollowUpAt: dateTimestamp(),
  resolvedByUserId: integer("resolvedByUserId"),
  resolvedAt: dateTimestamp(),
  aiRecommendation: varchar("aiRecommendation", { length: 100 }),
  aiConfidenceScore: integer("aiConfidenceScore"),
  aiSummary: text("aiSummary"),
  // Issue-record fields (V1.0 Early Warning & Repair Decision Workflow).
  sourceType: varchar("sourceType", { length: 32 })
    .default("manual_report")
    .notNull(),
  sourceRecordId: varchar("sourceRecordId", { length: 128 }),
  trailerId: varchar("trailerId", { length: 64 }),
  symptoms: jsonb("symptoms"),
  faultCodes: jsonb("faultCodes"),
  safetyRelated: boolean("safetyRelated").default(false).notNull(),
  recommendedAction: varchar("recommendedAction", { length: 32 }),
  closedAt: dateTimestamp(),
  photoUrls: jsonb("photoUrls"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const features = pgTable("features", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const fleets = pgTable("fleets", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: integer("ownerId").notNull(),
  companyEmail: varchar("companyEmail", { length: 320 }),
  companyPhone: varchar("companyPhone", { length: 50 }),
  address: text("address"),
  inviteCode: varchar("inviteCode", { length: 32 }),
  subscriptionOwnerUserId: integer("subscriptionOwnerUserId"),
  activeVehicleLimit: integer("activeVehicleLimit"),
  subscriptionStatus: billingStatusEnum("subscriptionStatus")
    .default("active")
    .notNull(),
  planId: integer("planId").default(1),
  planName: varchar("planName", { length: 64 }).default("free_trial").notNull(),
  billingInterval: varchar("billingInterval", { length: 16 })
    .default("trial")
    .notNull(),
  billingStatus: billingStatusEnum("billingStatus")
    .default("trialing")
    .notNull(),
  poweredVehicleLimit: integer("poweredVehicleLimit"),
  includedTrailerLimit: integer("includedTrailerLimit"),
  paidExtraTrailerQuantity: integer("paidExtraTrailerQuantity")
    .default(0)
    .notNull(),
  totalActiveTrailerLimit: integer("totalActiveTrailerLimit"),
  aiSessionMonthlyLimit: integer("aiSessionMonthlyLimit"),
  aiSessionsUsedCurrentPeriod: integer("aiSessionsUsedCurrentPeriod")
    .default(0)
    .notNull(),
  aiSessionsResetAt: dateTimestamp(),
  trialStartedAt: dateTimestamp(),
  premiumTadis: boolean("premiumTadis").default(false),
  driverModeEnabled: boolean("driverModeEnabled").default(false).notNull(),
  trialEndsAt: dateTimestamp(),
  subscriptionStartedAt: dateTimestamp(),
  subscriptionRenewsAt: dateTimestamp(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  isTrial: boolean("isTrial").default(false).notNull(),
  isPaidPilot: boolean("isPaidPilot").default(false).notNull(),
  paidPilotStartedAt: dateTimestamp(),
  paidPilotEndsAt: dateTimestamp(),
  salesStatus: varchar("salesStatus", { length: 64 }).default("none"),
  accountType: varchar("accountType", { length: 32 })
    .default("production")
    .notNull(),
  isDemoAccount: boolean("isDemoAccount").default(false).notNull(),
  lastActiveAt: dateTimestamp(),
  setupCompletedAt: dateTimestamp(),
  onboardingStatus: varchar("onboardingStatus", { length: 64 })
    .default("not_started")
    .notNull(),
  adminFollowUpStatus: varchar("adminFollowUpStatus", { length: 64 })
    .default("healthy")
    .notNull(),
  riskStatus: varchar("riskStatus", { length: 64 })
    .default("healthy")
    .notNull(),
  riskReason: text("riskReason"),
  nextFollowUpAt: dateTimestamp(),
  adminOwnerId: integer("adminOwnerId"),
  // Partner repair shops (e.g. Mr Diesel Inc) are modeled as ordinary tenants
  // flagged here. Only partner tenants may promote their confirmed repair
  // outcomes into the shared curated fault-code knowledge base.
  isPartner: boolean("isPartner").default(false).notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const adminFleetNotes = pgTable("adminFleetNotes", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  note: text("note").notNull(),
  noteType: varchar("noteType", { length: 64 }).default("general").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionTemplates = pgTable("inspectionTemplates", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  items: jsonb("items"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspections = pgTable("inspections", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  driverId: integer("driverId").notNull(),
  inspectionSessionId: varchar("inspectionSessionId", { length: 128 }),
  linkedVehicleId: varchar("linkedVehicleId", { length: 64 }),
  combinedStage: varchar("combinedStage", { length: 16 }),
  templateId: integer("templateId"),
  status: inspectionStatusEnum("status").default("in_progress"),
  inspectionDate: dateTimestamp(),
  startedAt: dateTimestamp(),
  durationSeconds: integer("durationSeconds"),
  overallVehicleResult: varchar("overallVehicleResult", { length: 64 }).default(
    "no_defect"
  ),
  reportOutcome: varchar("reportOutcome", { length: 32 })
    .default("clean")
    .notNull(),
  highestDefectSeverity: varchar("highestDefectSeverity", { length: 16 })
    .default("none")
    .notNull(),
  managerReviewRequired: boolean("managerReviewRequired")
    .default(false)
    .notNull(),
  provisionalDriverGuidance: text("provisionalDriverGuidance"),
  latestManagerDecision: varchar("latestManagerDecision", { length: 32 }),
  latestManagerInstruction: text("latestManagerInstruction"),
  latestManagerReviewedByUserId: integer("latestManagerReviewedByUserId"),
  latestManagerReviewedAt: dateTimestamp(),
  supersededByInspectionId: integer("supersededByInspectionId"),
  supersededAt: dateTimestamp(),
  notes: text("notes"),
  locationStatus: varchar("locationStatus", { length: 64 }).default(
    "unavailable"
  ),
  startLatitude: numeric("startLatitude", { precision: 10, scale: 7 }),
  startLongitude: numeric("startLongitude", { precision: 10, scale: 7 }),
  startLocationAccuracy: numeric("startLocationAccuracy", {
    precision: 10,
    scale: 2,
  }),
  startLocationCapturedAt: dateTimestamp(),
  submitLatitude: numeric("submitLatitude", { precision: 10, scale: 7 }),
  submitLongitude: numeric("submitLongitude", { precision: 10, scale: 7 }),
  submitLocationAccuracy: numeric("submitLocationAccuracy", {
    precision: 10,
    scale: 2,
  }),
  submitLocationCapturedAt: dateTimestamp(),
  integrityScore: integer("integrityScore").default(100),
  complianceStatus: complianceStatusEnum("complianceStatus")
    .default("green")
    .notNull(),
  results: jsonb("results"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  submittedAt: dateTimestamp(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionChecklistResponses = pgTable(
  "inspectionChecklistResponses",
  {
    id: serial("id").primaryKey(),
    inspectionId: integer("inspectionId").notNull(),
    fleetId: integer("fleetId").notNull(),
    vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
    driverId: integer("driverId").notNull(),
    checklistItemId: varchar("checklistItemId", { length: 120 }).notNull(),
    checklistItemLabel: varchar("checklistItemLabel", {
      length: 255,
    }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    result: varchar("result", { length: 32 }).notNull(),
    defectDescription: text("defectDescription"),
    severity: defectSeverityEnum("severity"),
    note: text("note"),
    unableToTakePhoto: boolean("unableToTakePhoto").default(false).notNull(),
    unableToTakePhotoReason: text("unableToTakePhotoReason"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  }
);

export const inspectionPhotos = pgTable("inspectionPhotos", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspectionId").notNull(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  driverId: integer("driverId").notNull(),
  checklistItemId: varchar("checklistItemId", { length: 120 }),
  photoType: varchar("photoType", { length: 64 }).default("defect").notNull(),
  imageUrl: text("imageUrl").notNull(),
  source: varchar("source", { length: 32 }).default("upload").notNull(),
  notes: text("notes"),
  uploadedAt: dateTimestamp().defaultNow().notNull(),
});

export const randomProofRequests = pgTable("randomProofRequests", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspectionId").notNull(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  driverId: integer("driverId").notNull(),
  proofItem: varchar("proofItem", { length: 120 }).notNull(),
  photoSubmitted: boolean("photoSubmitted").default(false).notNull(),
  photoUrl: text("photoUrl"),
  complianceStatus: varchar("complianceStatus", { length: 32 })
    .default("skipped")
    .notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionFlags = pgTable("inspectionFlags", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspectionId").notNull(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  driverId: integer("driverId").notNull(),
  flagType: varchar("flagType", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 32 }).notNull(),
  message: text("message").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionReviewQueueItems = pgTable(
  "inspectionReviewQueueItems",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId").notNull(),
    inspectionId: integer("inspectionId"),
    defectId: integer("defectId"),
    vehicleId: varchar("vehicleId", { length: 64 }),
    inspectionSessionId: varchar("inspectionSessionId", { length: 128 }),
    parentQueueItemId: integer("parentQueueItemId"),
    queueType: varchar("queueType", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).default("new").notNull(),
    headlineStatus: varchar("headlineStatus", { length: 32 })
      .default("review_needed")
      .notNull(),
    priority: varchar("priority", { length: 16 }).default("normal").notNull(),
    highestSeverity: varchar("highestSeverity", { length: 16 })
      .default("none")
      .notNull(),
    managerDecisionRequired: boolean("managerDecisionRequired")
      .default(false)
      .notNull(),
    requiresDriverInstruction: boolean("requiresDriverInstruction")
      .default(false)
      .notNull(),
    provisionalGuidanceSnapshot: text("provisionalGuidanceSnapshot"),
    latestManagerDecision: varchar("latestManagerDecision", { length: 32 }),
    latestDriverInstruction: text("latestDriverInstruction"),
    latestInternalNote: text("latestInternalNote"),
    agingState: varchar("agingState", { length: 32 }).default("new").notNull(),
    openedDetailsAt: dateTimestamp(),
    firstSeenAt: dateTimestamp(),
    reviewStartedAt: dateTimestamp(),
    decisionMadeAt: dateTimestamp(),
    reviewedAt: dateTimestamp(),
    reviewedByUserId: integer("reviewedByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  }
);

export const inspectionReviewActions = pgTable("inspectionReviewActions", {
  id: serial("id").primaryKey(),
  queueItemId: integer("queueItemId").notNull(),
  inspectionId: integer("inspectionId").notNull(),
  defectId: integer("defectId"),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  managerUserId: integer("managerUserId").notNull(),
  actionType: varchar("actionType", { length: 32 }).notNull(),
  driverInstructionNote: text("driverInstructionNote"),
  internalNote: text("internalNote"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const combinedInspectionSessions = pgTable(
  "combinedInspectionSessions",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId").notNull(),
    inspectionSessionId: varchar("inspectionSessionId", { length: 128 })
      .notNull()
      .unique(),
    truckVehicleId: varchar("truckVehicleId", { length: 64 }),
    trailerVehicleId: varchar("trailerVehicleId", { length: 64 }),
    truckInspectionId: integer("truckInspectionId"),
    trailerInspectionId: integer("trailerInspectionId"),
    groupedQueueItemId: integer("groupedQueueItemId"),
    headlineStatus: varchar("headlineStatus", { length: 32 })
      .default("review_needed")
      .notNull(),
    completionState: varchar("completionState", { length: 64 })
      .default("truck_pending_trailer_pending")
      .notNull(),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  }
);

export const aiTriageRecords = pgTable("aiTriageRecords", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  inspectionId: integer("inspectionId"),
  defectId: integer("defectId"),
  mostLikelyCause: text("mostLikelyCause"),
  severity: varchar("severity", { length: 32 }).notNull(),
  confidenceScore: integer("confidenceScore").default(0).notNull(),
  recommendedAction: varchar("recommendedAction", { length: 100 }).notNull(),
  driverMessage: text("driverMessage"),
  managerSummary: text("managerSummary"),
  clarifyingQuestions: jsonb("clarifyingQuestions"),
  safetyWarning: text("safetyWarning"),
  suggestedNextSteps: jsonb("suggestedNextSteps"),
  rawResult: jsonb("rawResult"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const aiRequestLogs = pgTable("aiRequestLogs", {
  id: serial("id").primaryKey(),
  companyId: integer("companyId").notNull(),
  assetId: varchar("assetId", { length: 64 }).notNull(),
  diagnosticSessionId: varchar("diagnosticSessionId", {
    length: 128,
  }).notNull(),
  callType: varchar("callType", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 32 }),
  model: varchar("model", { length: 255 }),
  estimatedInputCharacters: integer("estimatedInputCharacters"),
  estimatedInputTokens: integer("estimatedInputTokens"),
  messageCount: integer("messageCount"),
  maxTokens: integer("maxTokens"),
  temperature: numeric("temperature", { precision: 4, scale: 2 }),
  responseFormatEnabled: boolean("responseFormatEnabled")
    .default(false)
    .notNull(),
  simpleTadisMode: boolean("simpleTadisMode").default(false).notNull(),
  truncationApplied: boolean("truncationApplied").default(false).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  errorCode: varchar("errorCode", { length: 64 }),
  errorMessage: text("errorMessage"),
  fallbackUsed: boolean("fallbackUsed").default(false).notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const faultCodeReferenceSources = pgTable("faultCodeReferenceSources", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  sourceType: varchar("sourceType", { length: 80 }).notNull(),
  urlOrPath: text("urlOrPath"),
  importedAt: dateTimestamp().defaultNow().notNull(),
  reviewStatus: varchar("reviewStatus", { length: 32 })
    .default("needs_review")
    .notNull(),
  reviewerUserId: integer("reviewerUserId"),
  approvedAt: dateTimestamp(),
  metadata: jsonb("metadata"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const faultCodeReferences = pgTable("faultCodeReferences", {
  id: serial("id").primaryKey(),
  sourceId: integer("sourceId"),
  codeSystem: varchar("codeSystem", { length: 64 }).notNull(),
  code: varchar("code", { length: 128 }).notNull(),
  normalizedCode: varchar("normalizedCode", { length: 128 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  summary: text("summary").notNull(),
  recommendedChecks: jsonb("recommendedChecks"),
  riskLevel: varchar("riskLevel", { length: 32 }).default("medium").notNull(),
  reviewStatus: varchar("reviewStatus", { length: 32 })
    .default("needs_review")
    .notNull(),
  reviewerUserId: integer("reviewerUserId"),
  approvedAt: dateTimestamp(),
  archivedAt: dateTimestamp(),
  metadata: jsonb("metadata"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const faultCodeReferenceApprovals = pgTable(
  "faultCodeReferenceApprovals",
  {
    id: serial("id").primaryKey(),
    referenceId: integer("referenceId").notNull(),
    reviewerUserId: integer("reviewerUserId").notNull(),
    previousStatus: varchar("previousStatus", { length: 32 }),
    nextStatus: varchar("nextStatus", { length: 32 }).notNull(),
    notes: text("notes"),
    createdAt: dateTimestamp().defaultNow().notNull(),
  }
);

export const aiQualityReviews = pgTable("aiQualityReviews", {
  id: serial("id").primaryKey(),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 128 }).notNull(),
  fleetId: integer("fleetId"),
  userId: integer("userId"),
  vehicleId: varchar("vehicleId", { length: 64 }),
  planType: varchar("planType", { length: 64 }),
  modelUsed: varchar("modelUsed", { length: 255 }),
  providerUsed: varchar("providerUsed", { length: 64 }),
  fallbackModelUsed: varchar("fallbackModelUsed", { length: 255 }),
  fallbackUsed: boolean("fallbackUsed").default(false).notNull(),
  caseType: varchar("caseType", { length: 64 }).notNull(),
  escalationReason: text("escalationReason"),
  classificationConfidence: integer("classificationConfidence"),
  finalDiagnosisConfidence: integer("finalDiagnosisConfidence"),
  referenceLookupUsed: boolean("referenceLookupUsed").default(false).notNull(),
  referenceMatchStatus: varchar("referenceMatchStatus", { length: 64 })
    .default("none")
    .notNull(),
  clarificationCount: integer("clarificationCount").default(0).notNull(),
  totalAiCalls: integer("totalAiCalls").default(0).notNull(),
  estimatedPromptTokens: integer("estimatedPromptTokens").default(0).notNull(),
  estimatedCompletionTokens: integer("estimatedCompletionTokens")
    .default(0)
    .notNull(),
  estimatedTotalTokens: integer("estimatedTotalTokens").default(0).notNull(),
  estimatedCostUsd: numeric("estimatedCostUsd", { precision: 10, scale: 6 }),
  finalSafeToDriveDecision: varchar("finalSafeToDriveDecision", { length: 64 }),
  confirmedOutcomeStatus: varchar("confirmedOutcomeStatus", { length: 64 }),
  managerConfirmed: boolean("managerConfirmed").default(false).notNull(),
  mechanicConfirmed: boolean("mechanicConfirmed").default(false).notNull(),
  adminComparisonUsed: boolean("adminComparisonUsed").default(false).notNull(),
  metadata: jsonb("metadata"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const diagnosticModelComparisons = pgTable(
  "diagnosticModelComparisons",
  {
    id: serial("id").primaryKey(),
    diagnosticCaseId: varchar("diagnosticCaseId", { length: 128 }).notNull(),
    fleetId: integer("fleetId"),
    vehicleId: varchar("vehicleId", { length: 64 }),
    requestedByUserId: integer("requestedByUserId").notNull(),
    lowCostModel: varchar("lowCostModel", { length: 255 }),
    advancedModel: varchar("advancedModel", { length: 255 }),
    lowCostOutput: jsonb("lowCostOutput"),
    advancedOutput: jsonb("advancedOutput"),
    selectedOutput: varchar("selectedOutput", { length: 32 }),
    estimatedCostUsd: numeric("estimatedCostUsd", { precision: 10, scale: 6 }),
    createdAt: dateTimestamp().defaultNow().notNull(),
  }
);

export const repairOutcomes = pgTable("repairOutcomes", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  defectId: integer("defectId"),
  diagnosticCaseId: varchar("diagnosticCaseId", { length: 128 }),
  recordedByUserId: integer("recordedByUserId").notNull(),
  confirmedFault: text("confirmedFault").notNull(),
  repairPerformed: text("repairPerformed").notNull(),
  partsReplaced: jsonb("partsReplaced"),
  aiDiagnosisCorrect: varchar("aiDiagnosisCorrect", { length: 32 })
    .default("unknown")
    .notNull(),
  confirmationState: varchar("confirmationState", { length: 64 })
    .default("manager_confirmed")
    .notNull(),
  source: varchar("source", { length: 64 })
    .default("inspection_repair_outcome")
    .notNull(),
  downtimeStart: dateTimestamp(),
  downtimeEnd: dateTimestamp(),
  returnedToServiceAt: dateTimestamp(),
  repairNotes: text("repairNotes"),
  // Provenance for partner outcomes promoted into the curated knowledge base.
  // Links this outcome to the faultCodeReferences candidate it seeded so a bad
  // reference can be traced back to (and retracted from) its origin repair.
  promotedReferenceId: integer("promotedReferenceId"),
  promotedAt: dateTimestamp(),
  promotedByUserId: integer("promotedByUserId"),
  // ---- Repair outcome v2 (all optional; existing payloads stay valid) ----
  maintenanceCaseId: integer("maintenanceCaseId"),
  repairCycleId: integer("repairCycleId"),
  systemCategory: varchar("systemCategory", { length: 64 }),
  componentCategory: varchar("componentCategory", { length: 64 }),
  confirmedCauseCode: varchar("confirmedCauseCode", { length: 64 }),
  confirmedFaultCode: varchar("confirmedFaultCode", { length: 64 }),
  repairType: varchar("repairType", { length: 48 }),
  couldContinueAtAssessment: varchar("couldContinueAtAssessment", { length: 32 }),
  diagnosisCorrectness: varchar("diagnosisCorrectness", { length: 32 }),
  agreementClassification: varchar("agreementClassification", { length: 48 }),
  repairResult: varchar("repairResult", { length: 32 }),
  repeatFailure: boolean("repeatFailure"),
  actualDowntimeHours: numeric("actualDowntimeHours", { precision: 10, scale: 2 }),
  actualRepairCostCents: integer("actualRepairCostCents"),
  vehicleReturnedToServiceAt: dateTimestamp(),
  technicianNotes: text("technicianNotes"),
  submittedByUserId: integer("submittedByUserId"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inAppAlerts = pgTable("inAppAlerts", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  userId: integer("userId"),
  vehicleId: varchar("vehicleId", { length: 64 }),
  inspectionId: integer("inspectionId"),
  defectId: integer("defectId"),
  alertType: varchar("alertType", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 32 }).default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  status: varchar("status", { length: 32 }).default("open").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const maintenanceLogs = pgTable("maintenanceLogs", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  defectId: integer("defectId"),
  type: maintenanceTypeEnum("type").notNull(),
  description: text("description"),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  completedAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const onboardingSteps = pgTable("onboardingSteps", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  stepName: varchar("stepName", { length: 100 }).notNull(),
  completed: boolean("completed").default(false),
  completedAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const quickStartGuideProgress = pgTable("quickStartGuideProgress", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  fleetId: integer("fleetId"),
  role: varchar("role", { length: 64 }).notNull(),
  manualSlug: varchar("manualSlug", { length: 80 }).notNull(),
  manualViewedAt: dateTimestamp(),
  manualCompletedAt: dateTimestamp(),
  completionSource: varchar("completionSource", { length: 64 }),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const planFeatures = pgTable("planFeatures", {
  id: serial("id").primaryKey(),
  planId: integer("planId").notNull(),
  featureId: integer("featureId").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  truckLimit: integer("truckLimit"),
  monthlyPrice: numeric("monthlyPrice", { precision: 10, scale: 2 }),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const pilotAccessCodes = pgTable("pilotAccessCodes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 128 }).notNull().unique(),
  fleetName: varchar("fleetName", { length: 255 }),
  status: pilotAccessCodeStatusEnum("status").default("active").notNull(),
  maxUsers: integer("maxUsers").default(1).notNull(),
  maxVehicles: integer("maxVehicles").default(3).notNull(),
  activationDurationDays: integer("activationDurationDays")
    .default(14)
    .notNull(),
  hardExpiryDate: timestamp("hardExpiryDate", { mode: "date" }),
  activatedAt: timestamp("activatedAt", { mode: "date" }),
  expiresAt: timestamp("expiresAt", { mode: "date" }),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const pilotAccessRedemptions = pgTable("pilotAccessRedemptions", {
  id: serial("id").primaryKey(),
  codeId: integer("codeId").notNull(),
  userId: integer("userId").notNull(),
  fleetId: integer("fleetId").notNull(),
  activatedAt: timestamp("activatedAt", { mode: "date" }).notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  status: pilotAccessRedemptionStatusEnum("status").default("active").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const pilotAccessEvents = pgTable("pilotAccessEvents", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  fleetId: integer("fleetId"),
  codeId: integer("codeId"),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  eventMetadata: jsonb("eventMetadata"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const driverInvitations = pgTable("driverInvitations", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  firstName: varchar("firstName", { length: 255 }).notNull(),
  lastName: varchar("lastName", { length: 255 }).notNull(),
  invitedByUserId: integer("invitedByUserId").notNull(),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const tadisAlerts = pgTable("tadisAlerts", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  defectId: integer("defectId").notNull(),
  urgency: tadisUrgencyEnum("urgency").notNull(),
  recommendedAction: tadisRecommendedActionEnum("recommendedAction").notNull(),
  likelyCause: text("likelyCause"),
  reasoning: text("reasoning"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const earlyWarningFlags = pgTable("earlyWarningFlags", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  defectId: integer("defectId"),
  warningType: varchar("warningType", { length: 64 }).notNull(),
  warningReason: text("warningReason").notNull(),
  severity: varchar("severity", { length: 32 }).default("medium").notNull(),
  dedupeKey: varchar("dedupeKey", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  metadata: jsonb("metadata"),
  resolvedByUserId: integer("resolvedByUserId"),
  resolvedAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  role: userRoleEnum("role").default("driver").notNull(),
  ownerOperatorMode: boolean("ownerOperatorMode").default(false).notNull(),
  internalAdminRole: varchar("internalAdminRole", { length: 32 }),
  managerEmail: varchar("managerEmail", { length: 320 }),
  managerUserId: integer("managerUserId"),
  subscriptionTier: subscriptionTierEnum("subscriptionTier")
    .default("free")
    .notNull(),
  billingCadence: billingCadenceEnum("billingCadence")
    .default("monthly")
    .notNull(),
  billingStatus: billingStatusEnum("billingStatus").default("active").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  currentPeriodStart: dateTimestamp(),
  currentPeriodEnd: dateTimestamp(),
  trialStart: dateTimestamp(),
  trialEnd: dateTimestamp(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
  lastSignedIn: dateTimestamp().defaultNow().notNull(),
  lastAuthAt: dateTimestamp(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const companyMemberships = pgTable("companyMemberships", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  userId: integer("userId").notNull(),
  role: userRoleEnum("role").notNull(),
  status: companyMembershipStatusEnum("status").default("active").notNull(),
  approvedByUserId: integer("approvedByUserId"),
  joinedAt: dateTimestamp().defaultNow().notNull(),
  removedAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const companyInvitations = pgTable("companyInvitations", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  role: userRoleEnum("role").notNull(),
  inviteToken: varchar("inviteToken", { length: 128 }).notNull(),
  status: companyInvitationStatusEnum("status").default("pending").notNull(),
  invitedByUserId: integer("invitedByUserId").notNull(),
  expiresAt: dateTimestamp().notNull(),
  assignedVehicleIds: jsonb("assignedVehicleIds"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const companyJoinRequests = pgTable("companyJoinRequests", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  userId: integer("userId").notNull(),
  inviteCode: varchar("inviteCode", { length: 32 }),
  note: text("note"),
  status: companyJoinRequestStatusEnum("status").default("pending").notNull(),
  reviewedByUserId: integer("reviewedByUserId"),
  reviewedAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const vehicles = pgTable("vehicles", {
  id: varchar("id", { length: 64 }).primaryKey(),
  fleetId: integer("fleetId").notNull(),
  assignedDriverId: integer("assignedDriverId"),
  assetType: assetTypeEnum("assetType").default("tractor").notNull(),
  assetCategory: varchar("assetCategory", { length: 32 })
    .default("powered_vehicle")
    .notNull(),
  vehicleType: varchar("vehicleType", { length: 64 }),
  isPoweredVehicle: boolean("isPoweredVehicle").default(true).notNull(),
  isTrailer: boolean("isTrailer").default(false).notNull(),
  unitNumber: varchar("unitNumber", { length: 50 }),
  vin: varchar("vin", { length: 17 }).notNull(),
  licensePlate: varchar("licensePlate", { length: 20 }).notNull(),
  make: varchar("make", { length: 100 }),
  engineMake: varchar("engineMake", { length: 100 }),
  model: varchar("model", { length: 100 }),
  year: integer("year"),
  mileage: integer("mileage").default(0),
  engineHours: integer("engineHours").default(0),
  configuration: jsonb("configuration"),
  complianceStatus: complianceStatusEnum("complianceStatus")
    .default("green")
    .notNull(),
  status: vehicleStatusEnum("status").default("active"),
  operationalState: varchar("operationalState", { length: 32 })
    .default("active")
    .notNull(),
  operationalDecisionInspectionId: integer("operationalDecisionInspectionId"),
  operationalDecisionDefectId: integer("operationalDecisionDefectId"),
  operationalDecisionByUserId: integer("operationalDecisionByUserId"),
  operationalDecisionAt: dateTimestamp(),
  operationalInstruction: text("operationalInstruction"),
  lastCleanInspectionId: integer("lastCleanInspectionId"),
  lastCleanInspectionAt: dateTimestamp(),
  assetRecordStatus: assetRecordStatusEnum("assetRecordStatus")
    .default("active")
    .notNull(),
  trailerLinkStatus: varchar("trailerLinkStatus", { length: 32 }),
  linkedPoweredVehicleId: varchar("linkedPoweredVehicleId", { length: 64 }),
  createdByUserId: integer("createdByUserId"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const vehicleAssignments = pgTable("vehicleAssignments", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  driverUserId: integer("driverUserId"),
  driverInvitationId: integer("driverInvitationId"),
  assignedByUserId: integer("assignedByUserId").notNull(),
  accessType: varchar("accessType", { length: 32 })
    .default("permanent")
    .notNull(),
  startsAt: dateTimestamp().defaultNow().notNull(),
  expiresAt: dateTimestamp(),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  notes: text("notes"),
  revokedAt: dateTimestamp(),
  revokedByUserId: integer("revokedByUserId"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const vehicleAccessRequests = pgTable("vehicleAccessRequests", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: varchar("vehicleId", { length: 64 }),
  requestedVehicleIdentifier: varchar("requestedVehicleIdentifier", {
    length: 255,
  }),
  requestedByDriverId: integer("requestedByDriverId").notNull(),
  reason: varchar("reason", { length: 64 }).notNull(),
  note: text("note"),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  reviewedByUserId: integer("reviewedByUserId"),
  reviewedAt: dateTimestamp(),
  managerNote: text("managerNote"),
  accessTypeGranted: varchar("accessTypeGranted", { length: 32 }),
  expiresAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  fleetId: integer("fleetId"),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  tier: subscriptionTierEnum("tier").default("free").notNull(),
  billingCadence: billingCadenceEnum("billingCadence")
    .default("monthly")
    .notNull(),
  billingStatus: billingStatusEnum("billingStatus").default("active").notNull(),
  currentPeriodStart: dateTimestamp(),
  currentPeriodEnd: dateTimestamp(),
  trialStart: dateTimestamp(),
  trialEnd: dateTimestamp(),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const fleetQuoteRequests = pgTable("fleetQuoteRequests", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  fleetId: integer("fleetId"),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  vehicleCount: integer("vehicleCount").default(0).notNull(),
  driverCount: integer("driverCount").default(0).notNull(),
  mainNeeds: text("mainNeeds").notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 64 })
    .default("pending_fleet_review")
    .notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const leadSubmissions = pgTable("lead_submissions", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  fleetSize: varchar("fleet_size", { length: 64 }).notNull(),
  vehicleTypes: text("vehicle_types"),
  location: varchar("location", { length: 255 }),
  biggestMaintenanceChallenge: text("biggest_maintenance_challenge").notNull(),
  interestType: leadInterestTypeEnum("interest_type")
    .default("book_a_demo")
    .notNull(),
  preferredDemoTime: varchar("preferred_demo_time", { length: 255 }),
  sourcePage: varchar("source_page", { length: 255 }),
  utmSource: varchar("utm_source", { length: 255 }),
  utmMedium: varchar("utm_medium", { length: 255 }),
  utmCampaign: varchar("utm_campaign", { length: 255 }),
  utmContent: varchar("utm_content", { length: 255 }),
  utmTerm: varchar("utm_term", { length: 255 }),
  referrer: text("referrer"),
  status: leadStatusEnum("status").default("new").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

// Leads from the public Fleet Downtime Cost Calculator. Stored server-side only;
// see drizzle/0029_downtime_calculator_leads.sql for RLS (no public read).
export const downtimeCalculatorLeads = pgTable("downtime_calculator_leads", {
  id: serial("id").primaryKey(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  fleetSize: integer("fleet_size").notNull(),
  vehicleTypes: text("vehicle_types"),
  currentMaintenanceWorkflow: varchar("current_maintenance_workflow", {
    length: 64,
  }),
  biggestDowntimeIssue: text("biggest_downtime_issue"),
  affectedVehiclesPerMonth: integer("affected_vehicles_per_month"),
  averageDowntimeDays: numeric("average_downtime_days"),
  revenuePerVehiclePerDay: numeric("revenue_per_vehicle_per_day"),
  driverLabourCostPerDay: numeric("driver_labour_cost_per_day"),
  repairDecisionDelayDays: numeric("repair_decision_delay_days"),
  repeatRepairEventsPerMonth: integer("repeat_repair_events_per_month"),
  downtimeCostPerVehiclePerDay: numeric("downtime_cost_per_vehicle_per_day"),
  monthlyDirectDowntimeCost: numeric("monthly_direct_downtime_cost"),
  decisionDelayCost: numeric("decision_delay_cost"),
  repeatRepairRiskCost: numeric("repeat_repair_risk_cost"),
  estimatedMonthlyDowntimeExposure: numeric(
    "estimated_monthly_downtime_exposure"
  ),
  estimatedAnnualDowntimeExposure: numeric(
    "estimated_annual_downtime_exposure"
  ),
  workflowRiskScore: integer("workflow_risk_score"),
  workflowRiskBand: varchar("workflow_risk_band", { length: 32 }),
  source: varchar("source", { length: 64 })
    .default("fleet_downtime_cost_calculator")
    .notNull(),
  pagePath: varchar("page_path", { length: 255 }),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
});

export const adminAlerts = pgTable("adminAlerts", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  fleetId: integer("fleetId"),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  metadata: jsonb("metadata"),
  status: varchar("status", { length: 64 }).default("open").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const supportRecoveryActions = pgTable("supportRecoveryActions", {
  id: serial("id").primaryKey(),
  actionType: varchar("actionType", { length: 100 }).notNull(),
  staffUserId: integer("staffUserId").notNull(),
  targetFleetId: integer("targetFleetId"),
  targetUserId: integer("targetUserId"),
  targetVehicleId: varchar("targetVehicleId", { length: 64 }),
  targetInspectionId: integer("targetInspectionId"),
  targetDiagnosticCaseId: varchar("targetDiagnosticCaseId", { length: 128 }),
  targetMembershipId: integer("targetMembershipId"),
  targetPilotCodeId: integer("targetPilotCodeId"),
  reason: text("reason").notNull(),
  beforeState: jsonb("beforeState"),
  afterState: jsonb("afterState"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const aiUsageLogs = pgTable("aiUsageLogs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  fleetId: integer("fleetId"),
  vehicleId: varchar("vehicleId", { length: 64 }),
  usageType: varchar("usageType", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 100 }),
  model: varchar("model", { length: 150 }),
  promptTokens: integer("promptTokens").default(0).notNull(),
  completionTokens: integer("completionTokens").default(0).notNull(),
  totalTokens: integer("totalTokens").default(0).notNull(),
  latencyMs: integer("latencyMs"),
  estimatedCostUsd: numeric("estimatedCostUsd", { precision: 10, scale: 6 }),
  metadata: jsonb("metadata"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const diagnosticReviewQueue = pgTable("diagnosticReviewQueue", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId"),
  vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
  reviewType: varchar("reviewType", { length: 64 }).notNull(),
  status: varchar("status", { length: 64 }).default("review_pending").notNull(),
  summary: text("summary"),
  baselineTopCause: varchar("baselineTopCause", { length: 255 }),
  finalTopCause: varchar("finalTopCause", { length: 255 }),
  confidenceDelta: numeric("confidenceDelta", { precision: 8, scale: 2 }),
  evidenceSnapshot: jsonb("evidenceSnapshot"),
  baselineRanking: jsonb("baselineRanking"),
  finalRanking: jsonb("finalRanking"),
  rationale: jsonb("rationale"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("passwordResetTokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 255 }).notNull(),
  expiresAt: dateTimestamp().notNull(),
  usedAt: dateTimestamp(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

// =====================================================================
// Fleet Health & Maintenance Decision Workflow (feature-flagged pilot)
// All tables below are additive. Every business record carries fleetId
// so tenant isolation is enforced server-side. No defaults enable any
// pilot capability; feature checks fail closed.
// =====================================================================

// General-purpose per-fleet feature flags. Distinct from the global
// `features` catalog and `planFeatures`: this table gates pilot
// capabilities per tenant. Default disabled; absence means disabled.
export const fleetFeatures = pgTable(
  "fleetFeatures",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    featureKey: varchar("featureKey", { length: 100 }).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    valueJson: jsonb("valueJson"),
    createdByUserId: integer("createdByUserId"),
    updatedByUserId: integer("updatedByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("fleetFeatures_fleet_key_unique").on(
      table.fleetId,
      table.featureKey
    ),
    index("fleetFeatures_fleet_idx").on(table.fleetId),
    index("fleetFeatures_key_idx").on(table.featureKey),
  ]
);

// Narrow, fleet-scoped operational grants for selected members. This is
// NOT a membership role (owner/manager/driver are preserved). It grants
// specific maintenance capabilities to an existing member without
// elevating them to manager/owner or internal-admin.
export const maintenancePermissions = pgTable(
  "maintenancePermissions",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    userId: integer("userId").notNull(),
    // JSON array of capability keys (see shared/maintenance/permissions.ts).
    capabilitiesJson: jsonb("capabilitiesJson").notNull(),
    active: boolean("active").default(true).notNull(),
    grantedByUserId: integer("grantedByUserId"),
    revokedByUserId: integer("revokedByUserId"),
    revokedAt: dateTimestamp(),
    notes: text("notes"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("maintenancePermissions_fleet_user_unique").on(
      table.fleetId,
      table.userId
    ),
    index("maintenancePermissions_fleet_idx").on(table.fleetId),
    index("maintenancePermissions_user_idx").on(table.userId),
  ]
);

export type FleetFeature = typeof fleetFeatures.$inferSelect;
export type InsertFleetFeature = typeof fleetFeatures.$inferInsert;
export type MaintenancePermission = typeof maintenancePermissions.$inferSelect;
export type InsertMaintenancePermission =
  typeof maintenancePermissions.$inferInsert;

// Normalized, provider-neutral vehicle events. Structured accepted events may
// affect operational scoring; free-text/unknown default to review_required and
// never enter scoring or diagnosis before a human accepts them. Raw payloads
// are retained minimally and never loaded in ordinary list queries.
export const vehicleEvents = pgTable(
  "vehicleEvents",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceEventId: varchar("sourceEventId", { length: 128 }),
    eventType: varchar("eventType", { length: 48 }).notNull(),
    eventTimestamp: dateTimestamp().notNull(),
    odometerKm: numeric("odometerKm", { precision: 12, scale: 3 }),
    engineHours: numeric("engineHours", { precision: 12, scale: 2 }),
    dtcCode: varchar("dtcCode", { length: 32 }),
    dtcStatus: varchar("dtcStatus", { length: 32 }),
    severity: varchar("severity", { length: 32 }),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    trustStatus: varchar("trustStatus", { length: 32 })
      .default("review_required")
      .notNull(),
    reviewedByUserId: integer("reviewedByUserId"),
    reviewedAt: dateTimestamp(),
    reviewNotes: text("reviewNotes"),
    idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
    normalizedPayloadJson: jsonb("normalizedPayloadJson"),
    rawPayloadJson: jsonb("rawPayloadJson"),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("vehicleEvents_fleet_idem_unique").on(
      table.fleetId,
      table.idempotencyKey
    ),
    index("vehicleEvents_fleet_vehicle_idx").on(table.fleetId, table.vehicleId),
    index("vehicleEvents_fleet_type_idx").on(table.fleetId, table.eventType),
    index("vehicleEvents_trust_idx").on(table.fleetId, table.trustStatus),
  ]
);

// Fleet-level preventive-maintenance templates. Require at least one interval
// (enforced in application code). Missing data must not create false overdue.
export const pmTemplates = pgTable(
  "pmTemplates",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description"),
    intervalKm: integer("intervalKm"),
    intervalEngineHours: integer("intervalEngineHours"),
    intervalDays: integer("intervalDays"),
    warningKm: integer("warningKm"),
    warningEngineHours: integer("warningEngineHours"),
    warningDays: integer("warningDays"),
    whicheverComesFirst: boolean("whicheverComesFirst").default(true).notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [index("pmTemplates_fleet_idx").on(table.fleetId)]
);

export const pmAssignments = pgTable(
  "pmAssignments",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
    pmTemplateId: integer("pmTemplateId")
      .notNull()
      .references(() => pmTemplates.id, { onDelete: "cascade" }),
    overrideIntervalKm: integer("overrideIntervalKm"),
    overrideIntervalEngineHours: integer("overrideIntervalEngineHours"),
    overrideIntervalDays: integer("overrideIntervalDays"),
    overrideWarningKm: integer("overrideWarningKm"),
    overrideWarningEngineHours: integer("overrideWarningEngineHours"),
    overrideWarningDays: integer("overrideWarningDays"),
    lastCompletedDate: dateTimestamp(),
    lastCompletedOdometerKm: numeric("lastCompletedOdometerKm", {
      precision: 12,
      scale: 3,
    }),
    lastCompletedEngineHours: numeric("lastCompletedEngineHours", {
      precision: 12,
      scale: 2,
    }),
    active: boolean("active").default(true).notNull(),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pmAssignments_vehicle_template_unique").on(
      table.fleetId,
      table.vehicleId,
      table.pmTemplateId
    ),
    index("pmAssignments_fleet_vehicle_idx").on(table.fleetId, table.vehicleId),
  ]
);

// Score snapshots are persisted only on material change / classification change
// / acknowledgement / override — never on every page load.
export const attentionScoreSnapshots = pgTable(
  "attentionScoreSnapshots",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
    total: integer("total").notNull(),
    classification: varchar("classification", { length: 16 }).notNull(),
    componentsJson: jsonb("componentsJson"),
    dataQualityWarningsJson: jsonb("dataQualityWarningsJson"),
    reason: varchar("reason", { length: 48 }).notNull(),
    calculatedAt: dateTimestamp().notNull(),
    createdAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    index("attentionScoreSnapshots_fleet_vehicle_idx").on(
      table.fleetId,
      table.vehicleId
    ),
  ]
);

// One current operational display override + acknowledgement per vehicle.
// Overrides never alter score components, diagnosis, or case creation.
export const attentionScoreOverrides = pgTable(
  "attentionScoreOverrides",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
    acknowledgedByUserId: integer("acknowledgedByUserId"),
    acknowledgedAt: dateTimestamp(),
    acknowledgementNote: text("acknowledgementNote"),
    overrideClassification: varchar("overrideClassification", { length: 16 }),
    overrideReason: text("overrideReason"),
    overrideByUserId: integer("overrideByUserId"),
    overrideAt: dateTimestamp(),
    active: boolean("active").default(true).notNull(),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("attentionScoreOverrides_vehicle_unique").on(
      table.fleetId,
      table.vehicleId
    ),
  ]
);

export type VehicleEvent = typeof vehicleEvents.$inferSelect;
export type InsertVehicleEvent = typeof vehicleEvents.$inferInsert;
export type PmTemplate = typeof pmTemplates.$inferSelect;
export type InsertPmTemplate = typeof pmTemplates.$inferInsert;
export type PmAssignment = typeof pmAssignments.$inferSelect;
export type InsertPmAssignment = typeof pmAssignments.$inferInsert;
export type AttentionScoreSnapshot = typeof attentionScoreSnapshots.$inferSelect;
export type AttentionScoreOverride = typeof attentionScoreOverrides.$inferSelect;

// =====================================================================
// Phase 3: Maintenance Cases, append-only Decisions, and Repair Cycles.
// The case reference sequence (maintenance_case_seq) is created in the
// migration; references are generated server-side (never by counting rows).
// =====================================================================

// Central Maintenance Case. Exactly one fleet and one primary vehicle/asset.
export const maintenanceCases = pgTable(
  "maintenanceCases",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    reference: varchar("reference", { length: 32 }).notNull(),
    vehicleId: varchar("vehicleId", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).default("reported").notNull(),
    title: varchar("title", { length: 255 }),
    summary: text("summary"),
    severity: varchar("severity", { length: 16 }),
    // How the case was created + optional source links (any may be null).
    origin: varchar("origin", { length: 32 }).notNull(),
    diagnosticSessionId: varchar("diagnosticSessionId", { length: 128 }),
    sourceDefectId: integer("sourceDefectId"),
    sourceInspectionId: integer("sourceInspectionId"),
    sourceEventId: integer("sourceEventId"),
    // Pointer to the current decision version.
    currentDecisionId: integer("currentDecisionId"),
    assignedManagerUserId: integer("assignedManagerUserId"),
    assignedMaintenanceUserId: integer("assignedMaintenanceUserId"),
    expectedCompletionAt: dateTimestamp(),
    openedAt: dateTimestamp().defaultNow().notNull(),
    closedAt: dateTimestamp(),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("maintenanceCases_reference_unique").on(table.reference),
    index("maintenanceCases_fleet_status_idx").on(table.fleetId, table.status),
    index("maintenanceCases_fleet_vehicle_idx").on(table.fleetId, table.vehicleId),
    index("maintenanceCases_assigned_manager_idx").on(table.assignedManagerUserId),
  ]
);

// Append-only decision versions. Exactly one is current per case.
export const maintenanceDecisions = pgTable(
  "maintenanceDecisions",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    caseId: integer("caseId")
      .notNull()
      .references(() => maintenanceCases.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    source: varchar("source", { length: 32 }).notNull(), // ai | manual
    originalRecommendationJson: jsonb("originalRecommendationJson"),
    proposedAction: varchar("proposedAction", { length: 48 }),
    finalAction: varchar("finalAction", { length: 48 }),
    severity: varchar("severity", { length: 16 }).notNull(),
    confidence: integer("confidence"),
    rationale: text("rationale"),
    likelyCausesJson: jsonb("likelyCausesJson"),
    immediateChecksJson: jsonb("immediateChecksJson"),
    evidenceJson: jsonb("evidenceJson"),
    approvalRequirement: varchar("approvalRequirement", { length: 32 }).notNull(),
    approvalState: varchar("approvalState", { length: 24 }).default("pending").notNull(),
    approvedByUserId: integer("approvedByUserId"),
    approvedAt: dateTimestamp(),
    overrideState: varchar("overrideState", { length: 24 }),
    overrideReason: text("overrideReason"),
    supersededDecisionId: integer("supersededDecisionId"),
    diagnosticSessionId: varchar("diagnosticSessionId", { length: 128 }),
    model: varchar("model", { length: 150 }),
    promptVersion: varchar("promptVersion", { length: 64 }),
    isCurrent: boolean("isCurrent").default(true).notNull(),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("maintenanceDecisions_case_version_unique").on(table.caseId, table.version),
    index("maintenanceDecisions_case_idx").on(table.caseId),
    index("maintenanceDecisions_current_idx").on(table.caseId, table.isCurrent),
  ]
);

// Repair cycles. Multiple per case; only one active at a time.
export const repairCycles = pgTable(
  "repairCycles",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    caseId: integer("caseId")
      .notNull()
      .references(() => maintenanceCases.id, { onDelete: "cascade" }),
    cycleNumber: integer("cycleNumber").notNull(),
    active: boolean("active").default(true).notNull(),
    startedAt: dateTimestamp().defaultNow().notNull(),
    outOfServiceAt: dateTimestamp(),
    repairStartedAt: dateTimestamp(),
    expectedCompletionAt: dateTimestamp(),
    awaitingPartsSince: dateTimestamp(),
    readyForReturnAt: dateTimestamp(),
    returnedToServiceAt: dateTimestamp(),
    completedAt: dateTimestamp(),
    closureResult: varchar("closureResult", { length: 24 }), // resolved | partially_resolved | not_resolved
    outcomeId: integer("outcomeId"),
    approvedEstimateCents: integer("approvedEstimateCents"),
    finalInvoiceCents: integer("finalInvoiceCents"),
    downtimeHours: numeric("downtimeHours", { precision: 10, scale: 2 }),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("repairCycles_case_cycle_unique").on(table.caseId, table.cycleNumber),
    index("repairCycles_case_idx").on(table.caseId),
    index("repairCycles_fleet_active_idx").on(table.fleetId, table.active),
  ]
);

export type MaintenanceCase = typeof maintenanceCases.$inferSelect;
export type InsertMaintenanceCase = typeof maintenanceCases.$inferInsert;
export type MaintenanceDecision = typeof maintenanceDecisions.$inferSelect;
export type InsertMaintenanceDecision = typeof maintenanceDecisions.$inferInsert;
export type RepairCycle = typeof repairCycles.$inferSelect;
export type InsertRepairCycle = typeof repairCycles.$inferInsert;

// =====================================================================
// Phase 4: Repair documents + repair authorization.
// Private storage keys are server-generated; raw text retention is minimal.
// =====================================================================
export const repairDocuments = pgTable(
  "repairDocuments",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    caseId: integer("caseId")
      .notNull()
      .references(() => maintenanceCases.id, { onDelete: "cascade" }),
    repairCycleId: integer("repairCycleId"),
    documentType: varchar("documentType", { length: 24 }).default("unknown").notNull(),
    originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
    // Server-generated private storage key (never client-supplied).
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    mimeType: varchar("mimeType", { length: 64 }).notNull(),
    checksumSha256: varchar("checksumSha256", { length: 64 }).notNull(),
    uploadedByUserId: integer("uploadedByUserId"),
    processingState: varchar("processingState", { length: 24 }).default("uploaded").notNull(),
    extractionAttempts: integer("extractionAttempts").default(0).notNull(),
    // Raw text retention minimized; normalized structured fields for comparison.
    extractedRawText: text("extractedRawText"),
    normalizedFieldsJson: jsonb("normalizedFieldsJson"),
    extractionProvider: varchar("extractionProvider", { length: 64 }),
    extractionModel: varchar("extractionModel", { length: 150 }),
    schemaVersion: varchar("schemaVersion", { length: 32 }),
    region: varchar("region", { length: 64 }),
    consentAtUpload: boolean("consentAtUpload").default(false).notNull(),
    confidence: integer("confidence"),
    uncertaintyJson: jsonb("uncertaintyJson"),
    correctionsJson: jsonb("correctionsJson"),
    supersededDocumentId: integer("supersededDocumentId"),
    duplicateOfDocumentId: integer("duplicateOfDocumentId"),
    isApprovedEstimate: boolean("isApprovedEstimate").default(false).notNull(),
    isFinalInvoice: boolean("isFinalInvoice").default(false).notNull(),
    deletedAt: dateTimestamp(),
    deletedByUserId: integer("deletedByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [
    index("repairDocuments_case_idx").on(table.caseId),
    index("repairDocuments_fleet_checksum_idx").on(table.fleetId, table.checksumSha256),
    index("repairDocuments_state_idx").on(table.fleetId, table.processingState),
  ]
);

export const repairAuthorizations = pgTable(
  "repairAuthorizations",
  {
    id: serial("id").primaryKey(),
    fleetId: integer("fleetId")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    caseId: integer("caseId")
      .notNull()
      .references(() => maintenanceCases.id, { onDelete: "cascade" }),
    repairCycleId: integer("repairCycleId"),
    limitCents: integer("limitCents"),
    approvedAmountCents: integer("approvedAmountCents"),
    currency: varchar("currency", { length: 8 }).default("CAD").notNull(),
    state: varchar("state", { length: 24 }).default("pending").notNull(),
    approverUserId: integer("approverUserId"),
    approvedAt: dateTimestamp(),
    note: text("note"),
    createdByUserId: integer("createdByUserId"),
    createdAt: dateTimestamp().defaultNow().notNull(),
    updatedAt: dateTimestamp().defaultNow().notNull(),
  },
  (table) => [index("repairAuthorizations_case_idx").on(table.caseId)]
);

export type RepairDocument = typeof repairDocuments.$inferSelect;
export type InsertRepairDocument = typeof repairDocuments.$inferInsert;
export type RepairAuthorization = typeof repairAuthorizations.$inferSelect;
export type InsertRepairAuthorization = typeof repairAuthorizations.$inferInsert;
