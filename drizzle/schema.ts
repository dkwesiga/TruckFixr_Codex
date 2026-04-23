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
const defectSeverityEnum = pgEnum("defect_severity", ["low", "medium", "high", "critical"]);
const defectStatusEnum = pgEnum("defect_status", ["open", "acknowledged", "assigned", "resolved"]);
const inspectionStatusEnum = pgEnum("inspection_status", ["in_progress", "submitted", "reviewed"]);
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
  complianceStatus: complianceStatusEnum("complianceStatus").default("green").notNull(),
  results: jsonb("results"),
  createdAt: dateTimestamp().defaultNow().notNull(),
  submittedAt: dateTimestamp(),
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

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleetId").notNull(),
  assignedDriverId: integer("assignedDriverId"),
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
  createdAt: dateTimestamp().defaultNow().notNull(),
  updatedAt: dateTimestamp().defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
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
