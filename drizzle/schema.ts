import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

const defectActionTypeEnum = pgEnum("defect_action_type", [
  "acknowledge",
  "assign",
  "resolve",
  "comment",
]);
const complianceStatusEnum = pgEnum("compliance_status", ["green", "yellow", "red"]);
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
const maintenanceTypeEnum = pgEnum("maintenance_type", ["repair", "preventive", "inspection"]);
const pilotAccessCodeStatusEnum = pgEnum("pilot_access_code_status", [
  "active",
  "expired",
  "revoked",
]);
const pilotAccessRedemptionStatusEnum = pgEnum("pilot_access_redemption_status", [
  "active",
  "expired",
  "revoked",
  "converted",
]);
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
]);
const tadisUrgencyEnum = pgEnum("tadis_urgency", ["Monitor", "Attention", "Critical"]);
const tadisRecommendedActionEnum = pgEnum("tadis_recommended_action", [
  "Keep Running",
  "Inspect Soon",
  "Stop Now",
]);
const userRoleEnum = pgEnum("user_role", ["owner", "manager", "driver"]);
const vehicleStatusEnum = pgEnum("vehicle_status", ["active", "maintenance", "retired"]);
const assetTypeEnum = pgEnum("asset_type", ["tractor", "straight_truck", "trailer", "other"]);
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
  defectId: integer("defectId").notNull(),
  managerId: integer("managerId").notNull(),
  actionType: defectActionTypeEnum("actionType").notNull(),
  notes: text("notes"),
  assignedTo: integer("assignedTo"),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const defects = pgTable("defects", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
  inspectionId: integer("inspectionId"),
  driverId: integer("driverId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  severity: defectSeverityEnum("severity").default("medium"),
  complianceStatus: complianceStatusEnum("complianceStatus").default("green").notNull(),
  status: defectStatusEnum("status").default("open"),
  latestFollowUpStatus: varchar("latestFollowUpStatus", { length: 64 }),
  latestFollowUpAt: dateTimestamp(),
  resolvedByUserId: integer("resolvedByUserId"),
  resolvedAt: dateTimestamp(),
  aiRecommendation: varchar("aiRecommendation", { length: 100 }),
  aiConfidenceScore: integer("aiConfidenceScore"),
  aiSummary: text("aiSummary"),
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
  subscriptionStatus: billingStatusEnum("subscriptionStatus").default("active").notNull(),
  planId: integer("planId").default(1),
  premiumTadis: boolean("premiumTadis").default(false),
  trialEndsAt: dateTimestamp(),
  salesStatus: varchar("salesStatus", { length: 64 }).default("none"),
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
  vehicleId: integer("vehicleId").notNull(),
  driverId: integer("driverId").notNull(),
  templateId: integer("templateId"),
  status: inspectionStatusEnum("status").default("in_progress"),
  inspectionDate: dateTimestamp(),
  startedAt: dateTimestamp(),
  durationSeconds: integer("durationSeconds"),
  overallVehicleResult: varchar("overallVehicleResult", { length: 64 }).default("no_defect"),
  notes: text("notes"),
  locationStatus: varchar("locationStatus", { length: 64 }).default("unavailable"),
  startLatitude: numeric("startLatitude", { precision: 10, scale: 7 }),
  startLongitude: numeric("startLongitude", { precision: 10, scale: 7 }),
  startLocationAccuracy: numeric("startLocationAccuracy", { precision: 10, scale: 2 }),
  startLocationCapturedAt: dateTimestamp(),
  submitLatitude: numeric("submitLatitude", { precision: 10, scale: 7 }),
  submitLongitude: numeric("submitLongitude", { precision: 10, scale: 7 }),
  submitLocationAccuracy: numeric("submitLocationAccuracy", { precision: 10, scale: 2 }),
  submitLocationCapturedAt: dateTimestamp(),
  integrityScore: integer("integrityScore").default(100),
  complianceStatus: complianceStatusEnum("complianceStatus").default("green").notNull(),
  results: jsonb("results"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  submittedAt: dateTimestamp(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionChecklistResponses = pgTable("inspectionChecklistResponses", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspectionId").notNull(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
  driverId: integer("driverId").notNull(),
  checklistItemId: varchar("checklistItemId", { length: 120 }).notNull(),
  checklistItemLabel: varchar("checklistItemLabel", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  result: varchar("result", { length: 32 }).notNull(),
  defectDescription: text("defectDescription"),
  severity: defectSeverityEnum("severity"),
  note: text("note"),
  unableToTakePhoto: boolean("unableToTakePhoto").default(false).notNull(),
  unableToTakePhotoReason: text("unableToTakePhotoReason"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionPhotos = pgTable("inspectionPhotos", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspectionId").notNull(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
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
  vehicleId: integer("vehicleId").notNull(),
  driverId: integer("driverId").notNull(),
  proofItem: varchar("proofItem", { length: 120 }).notNull(),
  photoSubmitted: boolean("photoSubmitted").default(false).notNull(),
  photoUrl: text("photoUrl"),
  complianceStatus: varchar("complianceStatus", { length: 32 }).default("skipped").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inspectionFlags = pgTable("inspectionFlags", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspectionId").notNull(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
  driverId: integer("driverId").notNull(),
  flagType: varchar("flagType", { length: 100 }).notNull(),
  severity: varchar("severity", { length: 32 }).notNull(),
  message: text("message").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
});

export const aiTriageRecords = pgTable("aiTriageRecords", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
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

export const repairOutcomes = pgTable("repairOutcomes", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
  defectId: integer("defectId").notNull(),
  recordedByUserId: integer("recordedByUserId").notNull(),
  confirmedFault: text("confirmedFault").notNull(),
  repairPerformed: text("repairPerformed").notNull(),
  partsReplaced: jsonb("partsReplaced"),
  aiDiagnosisCorrect: varchar("aiDiagnosisCorrect", { length: 32 }).default("unknown").notNull(),
  downtimeStart: dateTimestamp(),
  downtimeEnd: dateTimestamp(),
  returnedToServiceAt: dateTimestamp(),
  repairNotes: text("repairNotes"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const inAppAlerts = pgTable("inAppAlerts", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  userId: integer("userId"),
  vehicleId: integer("vehicleId"),
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
  vehicleId: integer("vehicleId").notNull(),
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
  activationDurationDays: integer("activationDurationDays").default(14).notNull(),
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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("driver").notNull(),
  managerEmail: varchar("managerEmail", { length: 320 }),
  managerUserId: integer("managerUserId"),
  subscriptionTier: subscriptionTierEnum("subscriptionTier").default("free").notNull(),
  billingCadence: billingCadenceEnum("billingCadence").default("monthly").notNull(),
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
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  assignedDriverId: integer("assignedDriverId"),
  assetType: assetTypeEnum("assetType").default("tractor").notNull(),
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
  complianceStatus: complianceStatusEnum("complianceStatus").default("green").notNull(),
  status: vehicleStatusEnum("status").default("active"),
  assetRecordStatus: assetRecordStatusEnum("assetRecordStatus").default("active").notNull(),
  createdByUserId: integer("createdByUserId"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const vehicleAssignments = pgTable("vehicleAssignments", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId").notNull(),
  driverUserId: integer("driverUserId").notNull(),
  assignedByUserId: integer("assignedByUserId").notNull(),
  accessType: varchar("accessType", { length: 32 }).default("permanent").notNull(),
  startsAt: dateTimestamp().defaultNow().notNull(),
  expiresAt: dateTimestamp(),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  notes: text("notes"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const vehicleAccessRequests = pgTable("vehicleAccessRequests", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  vehicleId: integer("vehicleId"),
  requestedVehicleIdentifier: varchar("requestedVehicleIdentifier", { length: 255 }),
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
  billingCadence: billingCadenceEnum("billingCadence").default("monthly").notNull(),
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
  status: varchar("status", { length: 64 }).default("pending_fleet_review").notNull(),
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
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

export const aiUsageLogs = pgTable("aiUsageLogs", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  fleetId: integer("fleetId"),
  vehicleId: integer("vehicleId"),
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
  vehicleId: integer("vehicleId").notNull(),
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
