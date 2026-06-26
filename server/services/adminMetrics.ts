import { and, eq, inArray } from "drizzle-orm";
import {
  adminFleetNotes,
  aiQualityReviews,
  aiRequestLogs,
  aiTriageRecords,
  companyInvitations,
  companyMemberships,
  defects,
  fleets,
  inspections,
  repairOutcomes,
  subscriptions,
  users,
  vehicleAssignments,
  vehicles,
} from "../../drizzle/schema";
import { TRUCKFIXR_PLANS, type PlanKey } from "../../shared/truckfixrPricing";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { isStaffAdminUser } from "../_core/trpc";

export type InternalAdminRole = "super_admin" | "admin" | "read_only_viewer";
export type AccountType = "production" | "demo" | "internal_test" | "archived";
export type AdminFollowUpStatus =
  | "healthy"
  | "needs_onboarding"
  | "follow_up_needed"
  | "at_risk"
  | "converted"
  | "churned";
export type FleetRiskStatus =
  | "healthy"
  | "needs_onboarding"
  | "inactive"
  | "billing_risk"
  | "compliance_risk"
  | "diagnostic_follow_up_risk"
  | "high_priority";

export type AdminMetricsFilters = {
  timeframe?: "today" | "yesterday" | "last_7_days" | "last_30_days" | "last_90_days" | "mtd" | "qtd" | "ytd" | "all_time" | "custom";
  from?: string;
  to?: string;
  accountType?: AccountType | "all";
  plan?: string;
  billingStatus?: string;
  riskStatus?: FleetRiskStatus | "all";
  followUpStatus?: AdminFollowUpStatus | "all";
  search?: string;
};

type StaffUser = {
  id: number;
  email?: string | null;
  role?: string | null;
  internalAdminRole?: string | null;
};

const productionAccountTypes = new Set<AccountType>(["production"]);
const nonActiveBillingStatuses = new Set(["canceled", "expired", "incomplete_expired", "unpaid"]);
const riskPriority: Record<FleetRiskStatus, number> = {
  healthy: 0,
  needs_onboarding: 1,
  inactive: 2,
  billing_risk: 3,
  compliance_risk: 4,
  diagnostic_follow_up_risk: 5,
  high_priority: 6,
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDate(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithin(date: unknown, range: { from: Date | null; to: Date | null }) {
  const value = toDate(date);
  if (!value) return false;
  if (range.from && value < range.from) return false;
  if (range.to && value > range.to) return false;
  return true;
}

function maxDate(...values: unknown[]) {
  const dates = values.map(toDate).filter((date): date is Date => Boolean(date));
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function dateKey(value: unknown) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "unknown";
}

function formatDate(value: unknown) {
  return toDate(value)?.toISOString() ?? null;
}

function daysBetweenInclusive(from: Date | null, to: Date | null) {
  if (!from || !to) return 30;
  return Math.max(1, Math.ceil((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000));
}

function resolveDateRange(filters: AdminMetricsFilters) {
  const now = new Date();
  const today = startOfDay(now);
  const timeframe = filters.timeframe ?? "last_30_days";

  if (timeframe === "custom") {
    return {
      from: filters.from ? startOfDay(new Date(filters.from)) : null,
      to: filters.to ? endOfDay(new Date(filters.to)) : endOfDay(now),
      label: "Custom range",
      timeframe,
    };
  }

  if (timeframe === "all_time") {
    return { from: null, to: endOfDay(now), label: "All time", timeframe };
  }

  if (timeframe === "today") {
    return { from: today, to: endOfDay(now), label: "Today", timeframe };
  }

  if (timeframe === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: endOfDay(yesterday), label: "Yesterday", timeframe };
  }

  if (timeframe === "mtd") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now), label: "Month to date", timeframe };
  }

  if (timeframe === "qtd") {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    return { from: new Date(now.getFullYear(), quarterMonth, 1), to: endOfDay(now), label: "Quarter to date", timeframe };
  }

  if (timeframe === "ytd") {
    return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now), label: "Year to date", timeframe };
  }

  const days = timeframe === "last_7_days" ? 7 : timeframe === "last_90_days" ? 90 : 30;
  return {
    from: addDays(today, -(days - 1)),
    to: endOfDay(now),
    label: `Last ${days} days`,
    timeframe,
  };
}

function normalizeAccountType(fleet: typeof fleets.$inferSelect): AccountType {
  const value = String(fleet.accountType || "").trim() as AccountType;
  if (value === "production" || value === "demo" || value === "internal_test" || value === "archived") {
    return value;
  }
  return fleet.isDemoAccount ? "demo" : "production";
}

function normalizePlanName(value: unknown) {
  const plan = String(value || "free_trial").trim() || "free_trial";
  return plan;
}

function planLabel(value: unknown) {
  const planKey = normalizePlanName(value) as PlanKey;
  return TRUCKFIXR_PLANS[planKey]?.name ?? normalizePlanName(value).replaceAll("_", " ");
}

export function getInternalAdminRole(user: StaffUser | null | undefined): InternalAdminRole | null {
  const explicit = user?.internalAdminRole as InternalAdminRole | null | undefined;
  if (explicit === "super_admin" || explicit === "admin" || explicit === "read_only_viewer") {
    return explicit;
  }

  const configuredEmails = new Set(
    ENV.adminEmails
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
  const email = user?.email?.trim().toLowerCase();
  if (email && configuredEmails.has(email)) return "super_admin";

  if (!ENV.isProduction && isStaffAdminUser(user)) return "admin";
  return null;
}

export function assertAdminCanWrite(role: InternalAdminRole) {
  return role === "super_admin" || role === "admin";
}

export function assertAdminCanExport(role: InternalAdminRole) {
  return role === "super_admin";
}

export function canViewAdminPii(role: InternalAdminRole) {
  return role === "super_admin" || role === "admin";
}

export function redactEmailAddress(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 1) {
    return "***";
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const visibleLocal = local.slice(0, 2);
  return `${visibleLocal}${"*".repeat(Math.max(local.length - visibleLocal.length, 1))}@${domain}`;
}

export function redactVin(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.length <= 6) {
    return `${trimmed.slice(0, 1)}***${trimmed.slice(-1)}`;
  }

  return `${trimmed.slice(0, 3)}***${trimmed.slice(-4)}`;
}

function isTrailer(row: typeof vehicles.$inferSelect) {
  return row.isTrailer || row.assetCategory === "trailer" || String(row.assetType).includes("trailer");
}

function isPowered(row: typeof vehicles.$inferSelect) {
  return !isTrailer(row) && row.isPoweredVehicle !== false;
}

function isActiveAsset(row: typeof vehicles.$inferSelect) {
  return row.status !== "retired" && row.assetRecordStatus !== "inactive";
}

export function calculateFleetMrr(fleet: typeof fleets.$inferSelect) {
  if (normalizeAccountType(fleet) === "archived" || nonActiveBillingStatuses.has(String(fleet.billingStatus))) {
    return 0;
  }

  const plan = TRUCKFIXR_PLANS[normalizePlanName(fleet.planName) as PlanKey];
  if (!plan) return 0;
  const interval = String(fleet.billingInterval || plan.billingInterval);
  const base =
    interval === "annual"
      ? (plan.priceCadAnnual ?? 0) / 12
      : interval === "monthly"
        ? plan.priceCadMonthly ?? 0
        : 0;
  const trailerAddOns = (fleet.paidExtraTrailerQuantity ?? 0) * (plan.extraTrailerPriceCadMonthly ?? 0);
  return Math.round((base + trailerAddOns) * 100) / 100;
}

function buildDailySeries(range: { from: Date | null; to: Date | null }) {
  const from = range.from ?? addDays(startOfDay(range.to ?? new Date()), -29);
  const to = range.to ?? endOfDay(new Date());
  const days = Math.min(120, daysBetweenInclusive(from, to));
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(startOfDay(from), index);
    return {
      date: day.toISOString().slice(0, 10),
      activeFleets: 0,
      activeUsers: 0,
      inspectionsCompleted: 0,
      diagnosticsStarted: 0,
      diagnosticsCompleted: 0,
      newFleets: 0,
      newUsers: 0,
      poweredVehiclesAdded: 0,
      trailersAdded: 0,
      inspectionCompletionRate: 0,
      averageDiagnosticConfidence: 0,
    };
  });
}

function extractDiagnosticTokens(records: Array<typeof aiTriageRecords.$inferSelect>) {
  const symptoms = new Map<string, number>();
  const faultCodes = new Map<string, number>();
  const causes = new Map<string, number>();
  const actions = new Map<string, number>();

  for (const record of records) {
    if (record.mostLikelyCause) {
      causes.set(record.mostLikelyCause, (causes.get(record.mostLikelyCause) ?? 0) + 1);
    }
    if (record.recommendedAction) {
      actions.set(record.recommendedAction, (actions.get(record.recommendedAction) ?? 0) + 1);
    }

    const raw = record.rawResult as any;
    const possibleSymptoms = [
      raw?.symptom,
      raw?.symptom_area,
      raw?.issue_category,
      ...(Array.isArray(raw?.symptoms) ? raw.symptoms : []),
    ].filter(Boolean);
    for (const item of possibleSymptoms) {
      const key = String(item).trim();
      if (key) symptoms.set(key, (symptoms.get(key) ?? 0) + 1);
    }

    const possibleCodes = [
      raw?.fault_code,
      raw?.faultCode,
      ...(Array.isArray(raw?.faultCodes) ? raw.faultCodes : []),
    ].filter(Boolean);
    for (const item of possibleCodes) {
      const key = String(item).trim().toUpperCase();
      if (key) faultCodes.set(key, (faultCodes.get(key) ?? 0) + 1);
    }
  }

  const top = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));

  return {
    topSymptoms: top(symptoms),
    topFaultCodes: top(faultCodes),
    topSuggestedCauses: top(causes),
    recommendationMix: top(actions),
  };
}

function deriveRisk(input: {
  fleet: typeof fleets.$inferSelect;
  lastActiveAt: Date | null;
  poweredVehicles: number;
  trailers: number;
  activeUsers: number;
  inspectionsCompleted: number;
  expectedInspections: number;
  unresolvedDefects: number;
  criticalDefects: number;
  diagnosticsStarted: number;
  lowConfidenceDiagnostics: number;
  unresolvedDiagnostics: number;
}) {
  const reasons: string[] = [];
  let riskStatus = "healthy" as FleetRiskStatus;
  const daysInactive = input.lastActiveAt
    ? Math.floor((Date.now() - input.lastActiveAt.getTime()) / 86_400_000)
    : 999;
  const completionRate =
    input.expectedInspections > 0
      ? Math.round((input.inspectionsCompleted / input.expectedInspections) * 100)
      : 0;

  const bump = (next: FleetRiskStatus, reason: string) => {
    if (riskPriority[next] > riskPriority[riskStatus]) riskStatus = next;
    reasons.push(reason);
  };

  if (input.poweredVehicles + input.trailers === 0 || input.activeUsers === 0 || input.inspectionsCompleted === 0) {
    bump("needs_onboarding", "Setup incomplete: add assets, drivers, or first inspection.");
  }
  if (daysInactive >= 14) {
    bump("inactive", `No meaningful activity in ${daysInactive === 999 ? "the selected data" : `${daysInactive} days`}.`);
  }
  if (
    ["past_due", "canceled", "unpaid", "expired", "incomplete_expired"].includes(String(input.fleet.billingStatus)) ||
    (input.fleet.trialEndsAt && input.fleet.trialEndsAt < new Date() && input.fleet.billingStatus === "trialing") ||
    (input.fleet.paidPilotEndsAt && input.fleet.paidPilotEndsAt < new Date() && input.fleet.isPaidPilot)
  ) {
    bump("billing_risk", `Billing status is ${input.fleet.billingStatus}.`);
  }
  if ((input.expectedInspections > 0 && completionRate < 60) || input.criticalDefects > 0) {
    bump("compliance_risk", input.criticalDefects > 0 ? "Unresolved critical defects need follow-up." : "Low estimated inspection completion rate.");
  }
  if (input.unresolvedDiagnostics > 0 || input.lowConfidenceDiagnostics > 0) {
    bump("diagnostic_follow_up_risk", "Diagnostics need confirmation or follow-up.");
  }
  if (
    (riskStatus === "billing_risk" && daysInactive >= 7) ||
    (input.criticalDefects > 0 && daysInactive >= 7) ||
    (input.fleet.trialEndsAt && input.fleet.trialEndsAt.getTime() - Date.now() < 3 * 86_400_000 && input.inspectionsCompleted === 0)
  ) {
    bump("high_priority", "Multiple risk signals require founder/admin follow-up.");
  }

  return {
    riskStatus,
    riskReason: input.fleet.riskReason || reasons[0] || "Fleet is active, current, and no major follow-up signals are present.",
    suggestedFollowUp:
      riskStatus === "healthy"
        ? "Monitor normally."
        : riskStatus === "needs_onboarding"
          ? "Help complete setup and first inspection."
          : riskStatus === "billing_risk"
            ? "Review billing status and contact account owner."
            : riskStatus === "compliance_risk"
              ? "Ask manager about missed inspections or defects."
              : riskStatus === "diagnostic_follow_up_risk"
                ? "Review unresolved or low-confidence diagnostics."
                : "Prioritize direct founder/admin outreach.",
  };
}

async function loadMetricRows() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [
    fleetRows,
    userRows,
    membershipRows,
    invitationRows,
    vehicleRows,
    assignmentRows,
    inspectionRows,
    defectRows,
    triageRows,
    aiLogRows,
    qualityRows,
    repairRows,
    subscriptionRows,
    noteRows,
  ] = await Promise.all([
    db.select().from(fleets),
    db.select().from(users),
    db.select().from(companyMemberships),
    db.select().from(companyInvitations),
    db.select().from(vehicles),
    db.select().from(vehicleAssignments),
    db.select().from(inspections),
    db.select().from(defects),
    db.select().from(aiTriageRecords),
    db.select().from(aiRequestLogs),
    db.select().from(aiQualityReviews),
    db.select().from(repairOutcomes),
    db.select().from(subscriptions),
    db.select().from(adminFleetNotes),
  ]);

  return {
    db,
    fleetRows,
    userRows,
    membershipRows,
    invitationRows,
    vehicleRows,
    assignmentRows,
    inspectionRows,
    defectRows,
    triageRows,
    aiLogRows,
    qualityRows,
    repairRows,
    subscriptionRows,
    noteRows,
  };
}

function buildMetricsFromRows(filters: AdminMetricsFilters, rows: Awaited<ReturnType<typeof loadMetricRows>>) {
  const range = resolveDateRange(filters);
  const accountType = filters.accountType ?? "production";
  const query = filters.search?.trim().toLowerCase() ?? "";

  const selectedFleets = rows.fleetRows.filter((fleet) => {
    const fleetAccountType = normalizeAccountType(fleet);
    if (accountType === "all") {
      // include all account types
    } else if (fleetAccountType !== accountType) {
      return false;
    } else if (!productionAccountTypes.has(fleetAccountType) && !filters.accountType) {
      return false;
    }

    if (filters.plan && filters.plan !== "all" && normalizePlanName(fleet.planName) !== filters.plan) return false;
    if (filters.billingStatus && filters.billingStatus !== "all" && String(fleet.billingStatus) !== filters.billingStatus) return false;
    if (query && ![fleet.name, fleet.companyEmail, fleet.planName].some((value) => String(value || "").toLowerCase().includes(query))) return false;
    return true;
  });
  const selectedFleetIds = new Set(selectedFleets.map((fleet) => fleet.id));

  const usersById = new Map(rows.userRows.map((user) => [user.id, user]));
  const fleetVehicles = rows.vehicleRows.filter((vehicle) => selectedFleetIds.has(vehicle.fleetId));
  const fleetAssignments = rows.assignmentRows.filter((assignment) => selectedFleetIds.has(assignment.fleetId));
  const fleetInspections = rows.inspectionRows.filter((inspection) => selectedFleetIds.has(inspection.fleetId));
  const rangeInspections = fleetInspections.filter((inspection) => isWithin(inspection.submittedAt ?? inspection.updatedAt, range));
  const fleetDefects = rows.defectRows.filter((defect) => selectedFleetIds.has(defect.fleetId));
  const rangeDefects = fleetDefects.filter((defect) => isWithin(defect.createdAt ?? defect.updatedAt, range));
  const fleetTriage = rows.triageRows.filter((record) => selectedFleetIds.has(record.fleetId));
  const rangeTriage = fleetTriage.filter((record) => isWithin(record.createdAt, range));
  const fleetAiLogs = rows.aiLogRows.filter((log) => selectedFleetIds.has(log.companyId));
  const rangeAiLogs = fleetAiLogs.filter((log) => isWithin(log.createdAt, range));
  const fleetQuality = rows.qualityRows.filter((record) => record.fleetId != null && selectedFleetIds.has(record.fleetId));
  const rangeQuality = fleetQuality.filter((record) => isWithin(record.createdAt, range));

  const activeFleetIds = new Set<number>();
  const activeUserIds = new Set<number>();
  const markFleetActivity = (fleetId: number | null | undefined) => {
    if (fleetId != null && selectedFleetIds.has(fleetId)) activeFleetIds.add(fleetId);
  };
  const markUserActivity = (userId: number | null | undefined) => {
    if (userId != null) activeUserIds.add(userId);
  };

  for (const inspection of rangeInspections) {
    markFleetActivity(inspection.fleetId);
    markUserActivity(inspection.driverId);
  }
  for (const record of rangeTriage) markFleetActivity(record.fleetId);
  for (const defect of rangeDefects) {
    markFleetActivity(defect.fleetId);
    markUserActivity(defect.driverId);
  }
  for (const vehicle of fleetVehicles.filter((vehicle) => isWithin(vehicle.createdAt ?? vehicle.updatedAt, range))) {
    markFleetActivity(vehicle.fleetId);
    markUserActivity(vehicle.createdByUserId);
  }
  for (const assignment of fleetAssignments.filter((assignment) => isWithin(assignment.createdAt ?? assignment.updatedAt, range))) {
    markFleetActivity(assignment.fleetId);
    markUserActivity(assignment.driverUserId);
    markUserActivity(assignment.assignedByUserId);
  }
  for (const user of rows.userRows.filter((user) => isWithin(user.lastAuthAt ?? user.lastSignedIn, range))) {
    const memberships = rows.membershipRows.filter((membership) => membership.userId === user.id && selectedFleetIds.has(membership.fleetId));
    if (memberships.length > 0) markUserActivity(user.id);
    for (const membership of memberships) markFleetActivity(membership.fleetId);
  }

  const periodDays = daysBetweenInclusive(range.from, range.to);
  const activeAssignedAssets = fleetVehicles.filter((vehicle) => {
    if (!isActiveAsset(vehicle)) return false;
    if (vehicle.assignedDriverId) return true;
    return fleetAssignments.some((assignment) => assignment.vehicleId === vehicle.id && assignment.status === "active");
  });
  const expectedInspections = activeAssignedAssets.length * periodDays;
  const missedInspections = Math.max(0, expectedInspections - rangeInspections.length);
  const inspectionCompletionRate = expectedInspections > 0 ? Math.round((rangeInspections.length / expectedInspections) * 100) : 0;

  const diagnosticSessionIds = new Set(rangeAiLogs.map((log) => log.diagnosticSessionId).filter(Boolean));
  const diagnosticsStarted = diagnosticSessionIds.size || rangeTriage.length;
  const diagnosticsCompleted = rangeTriage.length;
  const lowConfidenceDiagnostics = rangeTriage.filter((record) => record.confidenceScore < 60).length + rangeQuality.filter((record) => (record.finalDiagnosisConfidence ?? 100) < 60).length;
  const unresolvedDiagnostics = rangeTriage.filter((record) => !rows.repairRows.some((repair) => repair.diagnosticCaseId === String(record.id) || repair.diagnosticCaseId === record.defectId?.toString())).length;
  const averageConfidenceValues = [
    ...rangeTriage.map((record) => record.confidenceScore),
    ...rangeQuality.map((record) => record.finalDiagnosisConfidence ?? record.classificationConfidence ?? 0),
  ].filter((value) => value > 0);
  const averageDiagnosticConfidence = averageConfidenceValues.length
    ? Math.round(averageConfidenceValues.reduce((sum, value) => sum + value, 0) / averageConfidenceValues.length)
    : 0;

  const completedTrials = selectedFleets.filter((fleet) => fleet.trialStartedAt || fleet.isTrial || fleet.trialEndsAt);
  const paidCustomers = selectedFleets.filter((fleet) => String(fleet.billingStatus) === "active" && normalizePlanName(fleet.planName) !== "free_trial" && !fleet.isPaidPilot);
  const paidPilots = selectedFleets.filter((fleet) => fleet.isPaidPilot || String(fleet.billingInterval) === "pilot");
  const monthlyRecurringRevenue = selectedFleets.reduce((sum, fleet) => sum + calculateFleetMrr(fleet), 0);
  const planDistributionMap = new Map<string, number>();
  const accountStatusMap = new Map<string, number>();
  for (const fleet of selectedFleets) {
    const plan = planLabel(fleet.planName);
    planDistributionMap.set(plan, (planDistributionMap.get(plan) ?? 0) + 1);
    const status = fleet.isPaidPilot ? "Paid pilot" : fleet.isTrial || fleet.billingStatus === "trialing" ? "Trial" : String(fleet.billingStatus);
    accountStatusMap.set(status, (accountStatusMap.get(status) ?? 0) + 1);
  }

  const fleetRows = selectedFleets.map((fleet) => {
    const vehicleRows = fleetVehicles.filter((vehicle) => vehicle.fleetId === fleet.id);
    const poweredVehicles = vehicleRows.filter((vehicle) => isPowered(vehicle) && isActiveAsset(vehicle)).length;
    const trailers = vehicleRows.filter((vehicle) => isTrailer(vehicle) && isActiveAsset(vehicle)).length;
    const fleetMemberships = rows.membershipRows.filter((membership) => membership.fleetId === fleet.id && membership.status === "active");
    const activeFleetUsers = new Set(fleetMemberships.map((membership) => membership.userId));
    const fleetInspectionsInRange = rangeInspections.filter((inspection) => inspection.fleetId === fleet.id);
    const fleetTriageInRange = rangeTriage.filter((record) => record.fleetId === fleet.id);
    const fleetDefectsAll = fleetDefects.filter((defect) => defect.fleetId === fleet.id);
    const unresolvedDefects = fleetDefectsAll.filter((defect) => !["resolved", "dismissed"].includes(String(defect.status))).length;
    const criticalDefects = fleetDefectsAll.filter((defect) => defect.severity === "critical" && !["resolved", "dismissed"].includes(String(defect.status))).length;
    const activeAssignedFleetAssets = activeAssignedAssets.filter((vehicle) => vehicle.fleetId === fleet.id);
    const fleetExpectedInspections = activeAssignedFleetAssets.length * periodDays;
    const lastActivity = maxDate(
      fleet.lastActiveAt,
      ...fleetInspections.filter((inspection) => inspection.fleetId === fleet.id).map((inspection) => inspection.submittedAt ?? inspection.updatedAt),
      ...fleetTriage.filter((record) => record.fleetId === fleet.id).map((record) => record.createdAt),
      ...vehicleRows.map((vehicle) => vehicle.updatedAt ?? vehicle.createdAt),
      ...fleetDefectsAll.map((defect) => defect.updatedAt ?? defect.createdAt)
    );
    const risk = deriveRisk({
      fleet,
      lastActiveAt: lastActivity,
      poweredVehicles,
      trailers,
      activeUsers: activeFleetUsers.size,
      inspectionsCompleted: fleetInspectionsInRange.length,
      expectedInspections: fleetExpectedInspections,
      unresolvedDefects,
      criticalDefects,
      diagnosticsStarted: fleetTriageInRange.length,
      lowConfidenceDiagnostics: fleetTriageInRange.filter((record) => record.confidenceScore < 60).length,
      unresolvedDiagnostics: fleetTriageInRange.length,
    });
    const completionRate = fleetExpectedInspections > 0
      ? Math.round((fleetInspectionsInRange.length / fleetExpectedInspections) * 100)
      : 0;

    return {
      fleetId: fleet.id,
      fleetName: fleet.name,
      accountType: normalizeAccountType(fleet),
      plan: normalizePlanName(fleet.planName),
      planLabel: planLabel(fleet.planName),
      billingStatus: String(fleet.billingStatus),
      activeUsers: activeFleetUsers.size,
      poweredVehicles,
      trailers,
      inspectionsCompleted: fleetInspectionsInRange.length,
      diagnosticsStarted: fleetTriageInRange.length,
      lastActiveAt: formatDate(lastActivity),
      daysInactive: lastActivity ? Math.max(0, Math.floor((Date.now() - lastActivity.getTime()) / 86_400_000)) : null,
      riskStatus: risk.riskStatus,
      riskReason: risk.riskReason,
      suggestedFollowUp: risk.suggestedFollowUp,
      followUpStatus: (fleet.adminFollowUpStatus || "healthy") as AdminFollowUpStatus,
      nextFollowUpAt: formatDate(fleet.nextFollowUpAt),
      adminOwnerId: fleet.adminOwnerId,
      adminOwnerName: fleet.adminOwnerId ? usersById.get(fleet.adminOwnerId)?.name ?? usersById.get(fleet.adminOwnerId)?.email ?? null : null,
      setupStatus: fleet.onboardingStatus || (poweredVehicles > 0 && activeFleetUsers.size > 0 ? "active" : "not_started"),
      inspectionCompletionRate: completionRate,
      expectedInspections: fleetExpectedInspections,
      missedInspections: Math.max(0, fleetExpectedInspections - fleetInspectionsInRange.length),
      unresolvedDefects,
      criticalDefects,
      mrr: calculateFleetMrr(fleet),
      createdAt: formatDate(fleet.createdAt),
    };
  }).filter((row) => {
    if (filters.riskStatus && filters.riskStatus !== "all" && row.riskStatus !== filters.riskStatus) return false;
    if (filters.followUpStatus && filters.followUpStatus !== "all" && row.followUpStatus !== filters.followUpStatus) return false;
    return true;
  });

  const filteredFleetIds = new Set(fleetRows.map((row) => row.fleetId));
  const filteredRangeInspections = rangeInspections.filter((inspection) => filteredFleetIds.has(inspection.fleetId));
  const filteredRangeTriage = rangeTriage.filter((record) => filteredFleetIds.has(record.fleetId));

  const trends = buildDailySeries(range);
  const trendMap = new Map(trends.map((entry) => [entry.date, entry]));
  const dailyActiveFleets = new Map<string, Set<number>>();
  const dailyActiveUsers = new Map<string, Set<number>>();
  for (const inspection of filteredRangeInspections) {
    const key = dateKey(inspection.submittedAt ?? inspection.updatedAt);
    const day = trendMap.get(key);
    if (day) day.inspectionsCompleted += 1;
    if (!dailyActiveFleets.has(key)) dailyActiveFleets.set(key, new Set());
    dailyActiveFleets.get(key)!.add(inspection.fleetId);
    if (!dailyActiveUsers.has(key)) dailyActiveUsers.set(key, new Set());
    dailyActiveUsers.get(key)!.add(inspection.driverId);
  }
  for (const record of filteredRangeTriage) {
    const day = trendMap.get(dateKey(record.createdAt));
    if (day) {
      day.diagnosticsCompleted += 1;
      day.averageDiagnosticConfidence = record.confidenceScore;
    }
  }
  for (const log of rangeAiLogs.filter((log) => filteredFleetIds.has(log.companyId))) {
    const key = dateKey(log.createdAt);
    const day = trendMap.get(key);
    if (day && log.callType === "classifier") day.diagnosticsStarted += 1;
    if (!dailyActiveFleets.has(key)) dailyActiveFleets.set(key, new Set());
    dailyActiveFleets.get(key)!.add(log.companyId);
  }
  for (const fleet of selectedFleets.filter((fleet) => filteredFleetIds.has(fleet.id) && isWithin(fleet.createdAt, range))) {
    const day = trendMap.get(dateKey(fleet.createdAt));
    if (day) day.newFleets += 1;
  }
  for (const user of rows.userRows.filter((user) => isWithin(user.createdAt, range))) {
    const memberships = rows.membershipRows.filter((membership) => membership.userId === user.id && filteredFleetIds.has(membership.fleetId));
    if (memberships.length > 0) {
      const key = dateKey(user.createdAt);
      const day = trendMap.get(key);
      if (day) day.newUsers += 1;
    }
  }
  for (const vehicle of fleetVehicles.filter((vehicle) => filteredFleetIds.has(vehicle.fleetId) && isWithin(vehicle.createdAt, range))) {
    const day = trendMap.get(dateKey(vehicle.createdAt));
    if (!day) continue;
    if (isTrailer(vehicle)) day.trailersAdded += 1;
    else day.poweredVehiclesAdded += 1;
  }
  for (const [key, ids] of Array.from(dailyActiveFleets.entries())) {
    const day = trendMap.get(key);
    if (day) day.activeFleets = ids.size;
  }
  for (const [key, ids] of Array.from(dailyActiveUsers.entries())) {
    const day = trendMap.get(key);
    if (day) day.activeUsers = ids.size;
  }
  for (const day of trends) {
    const dailyExpected = Math.max(0, activeAssignedAssets.filter((vehicle) => filteredFleetIds.has(vehicle.fleetId)).length);
    day.inspectionCompletionRate = dailyExpected > 0 ? Math.round((day.inspectionsCompleted / dailyExpected) * 100) : 0;
  }

  const unresolvedDefects = fleetDefects.filter((defect) => filteredFleetIds.has(defect.fleetId) && !["resolved", "dismissed"].includes(String(defect.status)));
  const criticalDefects = unresolvedDefects.filter((defect) => defect.severity === "critical");
  const failedInspections = filteredRangeInspections.filter((inspection) => inspection.complianceStatus !== "green" || inspection.overallVehicleResult !== "no_defect");
  const resolvedDefects = fleetDefects.filter((defect) => filteredFleetIds.has(defect.fleetId) && defect.status === "resolved");
  const averageDefectResolveHours = resolvedDefects.length
    ? Math.round(
        resolvedDefects.reduce((sum, defect) => {
          const created = toDate(defect.createdAt)?.getTime() ?? 0;
          const updated = toDate(defect.updatedAt)?.getTime() ?? created;
          return sum + Math.max(0, updated - created) / 3_600_000;
        }, 0) / resolvedDefects.length
      )
    : 0;

  const filteredFleetRows = fleetRows.sort((a, b) => {
    if (riskPriority[b.riskStatus] !== riskPriority[a.riskStatus]) {
      return riskPriority[b.riskStatus] - riskPriority[a.riskStatus];
    }
    return b.inspectionsCompleted + b.diagnosticsStarted - (a.inspectionsCompleted + a.diagnosticsStarted);
  });
  const atRiskFleets = filteredFleetRows.filter((row) => row.riskStatus !== "healthy").slice(0, 12);
  const inactiveFleets = filteredFleetRows.filter((row) => (row.daysInactive ?? 999) >= 7).slice(0, 12);
  const topActiveFleets = [...fleetRows]
    .sort((a, b) => b.inspectionsCompleted + b.diagnosticsStarted + b.activeUsers - (a.inspectionsCompleted + a.diagnosticsStarted + a.activeUsers))
    .slice(0, 12);

  const currentProductionRows = rows.fleetRows.filter((fleet) => normalizeAccountType(fleet) === "production");
  const investorFleetIds = new Set(currentProductionRows.map((fleet) => fleet.id));
  const investorThirtyDayRange = resolveDateRange({ timeframe: "last_30_days" });
  const investorNinetyDayRange = resolveDateRange({ timeframe: "last_90_days" });
  const investor30ActiveFleetIds = new Set(
    rows.inspectionRows
      .filter((inspection) => investorFleetIds.has(inspection.fleetId) && isWithin(inspection.submittedAt ?? inspection.updatedAt, investorThirtyDayRange))
      .map((inspection) => inspection.fleetId)
  );
  const investor90ActiveFleetIds = new Set(
    rows.inspectionRows
      .filter((inspection) => investorFleetIds.has(inspection.fleetId) && isWithin(inspection.submittedAt ?? inspection.updatedAt, investorNinetyDayRange))
      .map((inspection) => inspection.fleetId)
  );
  const investor30NewFleets = currentProductionRows.filter((fleet) => isWithin(fleet.createdAt, investorThirtyDayRange)).length;
  const investor90NewFleets = currentProductionRows.filter((fleet) => isWithin(fleet.createdAt, investorNinetyDayRange)).length;

  const diagnosticsTokens = extractDiagnosticTokens(filteredRangeTriage);

  return {
    filters: {
      ...filters,
      timeframe: range.timeframe,
      from: formatDate(range.from),
      to: formatDate(range.to),
      accountType,
    },
    kpis: {
      activeFleets: activeFleetIds.size,
      activeUsers: activeUserIds.size,
      inspectionsCompleted: filteredRangeInspections.length,
      aiDiagnosticsStarted: diagnosticsStarted,
      aiDiagnosticsCompleted: diagnosticsCompleted,
      poweredVehicles: fleetVehicles.filter((vehicle) => filteredFleetIds.has(vehicle.fleetId) && isPowered(vehicle) && isActiveAsset(vehicle)).length,
      trailers: fleetVehicles.filter((vehicle) => filteredFleetIds.has(vehicle.fleetId) && isTrailer(vehicle) && isActiveAsset(vehicle)).length,
      trials: selectedFleets.filter((fleet) => (fleet.isTrial || fleet.billingStatus === "trialing") && filteredFleetIds.has(fleet.id)).length,
      paidPilots: paidPilots.filter((fleet) => filteredFleetIds.has(fleet.id)).length,
      paidCustomers: paidCustomers.filter((fleet) => filteredFleetIds.has(fleet.id)).length,
      monthlyRecurringRevenue,
      arrRunRate: Math.round(monthlyRecurringRevenue * 12 * 100) / 100,
      atRiskFleets: atRiskFleets.length,
    },
    trends,
    billing: {
      freeTrials: selectedFleets.filter((fleet) => (fleet.isTrial || fleet.billingStatus === "trialing") && filteredFleetIds.has(fleet.id)).length,
      paidPilots: paidPilots.filter((fleet) => filteredFleetIds.has(fleet.id)).length,
      paidCustomers: paidCustomers.filter((fleet) => filteredFleetIds.has(fleet.id)).length,
      monthlyRecurringRevenue,
      arrRunRate: Math.round(monthlyRecurringRevenue * 12 * 100) / 100,
      trialToPaidConversion: completedTrials.length ? Math.round((paidCustomers.length / completedTrials.length) * 100) : 0,
      pilotToPaidConversion: paidPilots.length ? Math.round((paidCustomers.length / paidPilots.length) * 100) : 0,
      pastDueAccounts: selectedFleets.filter((fleet) => fleet.billingStatus === "past_due" && filteredFleetIds.has(fleet.id)).length,
      canceledAccounts: selectedFleets.filter((fleet) => fleet.billingStatus === "canceled" && filteredFleetIds.has(fleet.id)).length,
      planDistribution: Array.from(planDistributionMap.entries()).map(([name, value]) => ({ name, value })),
      accountStatusBreakdown: Array.from(accountStatusMap.entries()).map(([name, value]) => ({ name, value })),
    },
    compliance: {
      expectedInspections,
      completedInspections: filteredRangeInspections.length,
      missedInspections,
      failedInspections: failedInspections.length,
      defectsReported: rangeDefects.filter((defect) => filteredFleetIds.has(defect.fleetId)).length,
      unresolvedDefects: unresolvedDefects.length,
      criticalDefects: criticalDefects.length,
      averageDefectResolveHours,
      inspectionCompletionRate,
      riskFleets: atRiskFleets.filter((fleet) => fleet.riskStatus === "compliance_risk" || fleet.riskStatus === "high_priority"),
    },
    diagnostics: {
      sessionsStarted: diagnosticsStarted,
      sessionsCompleted: diagnosticsCompleted,
      averageConfidenceScore: averageDiagnosticConfidence,
      lowConfidenceDiagnostics,
      unresolvedCases: unresolvedDiagnostics,
      resolvedCases: rows.repairRows.filter((repair) => repair.diagnosticCaseId && repair.fleetId && filteredFleetIds.has(repair.fleetId)).length,
      mechanicConfirmedOutcomes: rows.repairRows.filter((repair) => repair.confirmationState?.includes("mechanic") && filteredFleetIds.has(repair.fleetId)).length,
      aiToConfirmedCauseMatchRate: rows.repairRows.length
        ? Math.round((rows.repairRows.filter((repair) => repair.aiDiagnosisCorrect === "yes").length / rows.repairRows.length) * 100)
        : 0,
      ...diagnosticsTokens,
    },
    investor: {
      totalFleetsCreated: currentProductionRows.length,
      activeFleetsLast30Days: investor30ActiveFleetIds.size,
      activeUsersLast30Days: rows.userRows.filter((user) => isWithin(user.lastAuthAt ?? user.lastSignedIn, investorThirtyDayRange)).length,
      poweredVehiclesUnderManagement: rows.vehicleRows.filter((vehicle) => investorFleetIds.has(vehicle.fleetId) && isPowered(vehicle) && isActiveAsset(vehicle)).length,
      trailersUnderManagement: rows.vehicleRows.filter((vehicle) => investorFleetIds.has(vehicle.fleetId) && isTrailer(vehicle) && isActiveAsset(vehicle)).length,
      inspectionsCompleted: rows.inspectionRows.filter((inspection) => investorFleetIds.has(inspection.fleetId)).length,
      aiDiagnosticsCompleted: rows.triageRows.filter((record) => investorFleetIds.has(record.fleetId)).length,
      paidCustomers: currentProductionRows.filter((fleet) => String(fleet.billingStatus) === "active" && normalizePlanName(fleet.planName) !== "free_trial").length,
      monthlyRecurringRevenue: currentProductionRows.reduce((sum, fleet) => sum + calculateFleetMrr(fleet), 0),
      growth30DayRate: currentProductionRows.length ? Math.round((investor30NewFleets / currentProductionRows.length) * 100) : 0,
      growth90DayRate: currentProductionRows.length ? Math.round((investor90NewFleets / currentProductionRows.length) * 100) : 0,
      trialToPaidConversion: completedTrials.length ? Math.round((paidCustomers.length / completedTrials.length) * 100) : 0,
      pilotToPaidConversion: paidPilots.length ? Math.round((paidCustomers.length / paidPilots.length) * 100) : 0,
      activeFleetsLast90Days: investor90ActiveFleetIds.size,
    },
    tables: {
      fleetRows: filteredFleetRows,
      topActiveFleets,
      inactiveFleets,
      atRiskFleets,
    },
  };
}

export async function getAdminMetrics(filters: AdminMetricsFilters) {
  return buildMetricsFromRows(filters, await loadMetricRows());
}

export async function getAdminFleetDetail(
  fleetId: number,
  filters: AdminMetricsFilters,
  options?: { viewerRole?: InternalAdminRole | null }
) {
  const rows = await loadMetricRows();
  const metrics = buildMetricsFromRows({ ...filters, accountType: "all" }, rows);
  const fleet = rows.fleetRows.find((item) => item.id === fleetId);
  if (!fleet) return null;
  const revealPii = options?.viewerRole ? canViewAdminPii(options.viewerRole) : true;

  const row = metrics.tables.fleetRows.find((item) => item.fleetId === fleetId);
  const fleetVehicles = rows.vehicleRows.filter((vehicle) => vehicle.fleetId === fleetId);
  const fleetMemberships = rows.membershipRows.filter((membership) => membership.fleetId === fleetId);
  const fleetInvitations = rows.invitationRows.filter((invite) => invite.fleetId === fleetId);
  const fleetUsers = fleetMemberships
    .map((membership) => {
      const user = rows.userRows.find((item) => item.id === membership.userId);
      return user
        ? {
            id: user.id,
            name: user.name,
            email: revealPii ? user.email : redactEmailAddress(user.email),
            role: membership.role,
            membershipStatus: membership.status,
            lastActiveAt: formatDate(user.lastAuthAt ?? user.lastSignedIn),
            assignedAssets: rows.assignmentRows
              .filter((assignment) => assignment.fleetId === fleetId && assignment.driverUserId === user.id && assignment.status === "active")
              .map((assignment) => assignment.vehicleId),
          }
        : null;
    })
    .filter(Boolean);
  const fleetInspections = rows.inspectionRows.filter((inspection) => inspection.fleetId === fleetId);
  const fleetDefects = rows.defectRows.filter((defect) => defect.fleetId === fleetId);
  const fleetTriage = rows.triageRows.filter((record) => record.fleetId === fleetId);
  const fleetQuality = rows.qualityRows.filter((record) => record.fleetId === fleetId);
  const tokens = extractDiagnosticTokens(fleetTriage);
  const notes = rows.noteRows
    .filter((note) => note.fleetId === fleetId)
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .map((note) => {
      const author = rows.userRows.find((user) => user.id === note.createdByUserId);
        return {
          id: note.id,
          note: note.note,
          noteType: note.noteType,
          createdAt: formatDate(note.createdAt),
          createdByName:
            author?.name ??
            (revealPii ? author?.email : null) ??
            (revealPii ? "TruckFixr admin" : "Internal admin"),
        };
      });

  return {
    summary: {
      fleetId: fleet.id,
      name: fleet.name,
      accountType: normalizeAccountType(fleet),
      plan: normalizePlanName(fleet.planName),
      planLabel: planLabel(fleet.planName),
      billingStatus: String(fleet.billingStatus),
      billingInterval: String(fleet.billingInterval),
      createdAt: formatDate(fleet.createdAt),
      trialStartedAt: formatDate(fleet.trialStartedAt),
      trialEndsAt: formatDate(fleet.trialEndsAt),
      paidPilotStartedAt: formatDate(fleet.paidPilotStartedAt),
      paidPilotEndsAt: formatDate(fleet.paidPilotEndsAt),
      lastActiveAt: row?.lastActiveAt ?? null,
      riskStatus: row?.riskStatus ?? fleet.riskStatus,
      riskReason: row?.riskReason ?? fleet.riskReason,
      suggestedFollowUp: row?.suggestedFollowUp ?? null,
      followUpStatus: row?.followUpStatus ?? fleet.adminFollowUpStatus,
      nextFollowUpAt: row?.nextFollowUpAt ?? formatDate(fleet.nextFollowUpAt),
      adminOwnerId: fleet.adminOwnerId,
      mrr: calculateFleetMrr(fleet),
    },
    usage: {
      activeUsers: row?.activeUsers ?? 0,
      inspectionsCompleted: row?.inspectionsCompleted ?? 0,
      diagnosticsStarted: row?.diagnosticsStarted ?? 0,
      setupCompletion:
        row?.setupStatus === "complete" || fleet.setupCompletedAt
          ? 100
          : Math.round((((row?.poweredVehicles ?? 0) > 0 ? 1 : 0) + ((row?.activeUsers ?? 0) > 0 ? 1 : 0) + ((row?.inspectionsCompleted ?? 0) > 0 ? 1 : 0)) / 3 * 100),
      lastInspectionAt: formatDate(maxDate(...fleetInspections.map((inspection) => inspection.submittedAt))),
      lastDiagnosticAt: formatDate(maxDate(...fleetTriage.map((record) => record.createdAt))),
    },
    assets: {
      poweredVehicles: fleetVehicles.filter((vehicle) => isPowered(vehicle)).length,
      trailers: fleetVehicles.filter((vehicle) => isTrailer(vehicle)).length,
      activeAssets: fleetVehicles.filter(isActiveAsset).length,
      inactiveAssets: fleetVehicles.filter((vehicle) => !isActiveAsset(vehicle)).length,
      recentlyAddedAssets: fleetVehicles
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
        .slice(0, 8)
        .map((vehicle) => ({
          id: vehicle.id,
          unitNumber: vehicle.unitNumber,
          vin: revealPii ? vehicle.vin : redactVin(vehicle.vin),
          assetType: vehicle.assetType,
          status: vehicle.status,
          createdAt: formatDate(vehicle.createdAt),
        })),
    },
    users: {
      members: fleetUsers,
      invitations: fleetInvitations.map((invite) => ({
        id: invite.id,
        email: revealPii ? invite.email : redactEmailAddress(invite.email),
        name: invite.name,
        role: invite.role,
        status: invite.status,
        createdAt: formatDate(invite.createdAt),
      })),
    },
    inspections: {
      completed: fleetInspections.length,
      missed: row?.missedInspections ?? 0,
      failed: fleetInspections.filter((inspection) => inspection.complianceStatus !== "green" || inspection.overallVehicleResult !== "no_defect").length,
      defectsReported: fleetDefects.length,
      unresolvedDefects: fleetDefects.filter((defect) => !["resolved", "dismissed"].includes(String(defect.status))).length,
      criticalDefects: fleetDefects.filter((defect) => defect.severity === "critical" && !["resolved", "dismissed"].includes(String(defect.status))).length,
      inspectionCompletionRate: row?.inspectionCompletionRate ?? 0,
    },
    diagnostics: {
      sessionsStarted: fleetTriage.length,
      sessionsCompleted: fleetTriage.length,
      lowConfidenceCases: fleetTriage.filter((record) => record.confidenceScore < 60).length + fleetQuality.filter((record) => (record.finalDiagnosisConfidence ?? 100) < 60).length,
      unresolvedCases: fleetTriage.filter((record) => !rows.repairRows.some((repair) => repair.fleetId === fleetId && repair.diagnosticCaseId === String(record.id))).length,
      ...tokens,
    },
    subscription: {
      isTrial: fleet.isTrial,
      isPaidPilot: fleet.isPaidPilot,
      plan: normalizePlanName(fleet.planName),
      billingInterval: fleet.billingInterval,
      billingStatus: fleet.billingStatus,
      mrr: calculateFleetMrr(fleet),
      renewalDate: formatDate(fleet.subscriptionRenewsAt),
      syncedSubscriptions: rows.subscriptionRows.filter((subscription) => subscription.fleetId === fleetId),
    },
    notes,
  };
}

export async function addAdminFleetNote(input: {
  fleetId: number;
  createdByUserId: number;
  note: string;
  noteType?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [note] = await db
    .insert(adminFleetNotes)
    .values({
      fleetId: input.fleetId,
      createdByUserId: input.createdByUserId,
      note: input.note,
      noteType: input.noteType ?? "general",
      updatedAt: new Date(),
    })
    .returning();
  return note;
}

export async function updateAdminFleetFollowUp(input: {
  fleetId: number;
  followUpStatus?: AdminFollowUpStatus;
  riskStatus?: FleetRiskStatus;
  riskReason?: string | null;
  nextFollowUpAt?: Date | null;
  adminOwnerId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [fleet] = await db
    .update(fleets)
    .set({
      ...(input.followUpStatus ? { adminFollowUpStatus: input.followUpStatus } : {}),
      ...(input.riskStatus ? { riskStatus: input.riskStatus } : {}),
      ...(input.riskReason !== undefined ? { riskReason: input.riskReason } : {}),
      ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
      ...(input.adminOwnerId !== undefined ? { adminOwnerId: input.adminOwnerId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(fleets.id, input.fleetId))
    .returning();
  return fleet;
}

export async function updateAdminFleetAccountType(fleetId: number, accountType: AccountType) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [fleet] = await db
    .update(fleets)
    .set({
      accountType,
      isDemoAccount: accountType === "demo",
      updatedAt: new Date(),
    })
    .where(eq(fleets.id, fleetId))
    .returning();
  return fleet;
}

function csvEscape(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

export async function getAdminFleetExport(filters: AdminMetricsFilters, variant: "fleets" | "at_risk" | "investor") {
  const metrics = await getAdminMetrics(filters);
  if (variant === "investor") {
    return toCsv([metrics.investor as unknown as Record<string, unknown>]);
  }

  const source = variant === "at_risk" ? metrics.tables.atRiskFleets : metrics.tables.fleetRows;
  return toCsv(
    source.map((row) => ({
      fleetId: row.fleetId,
      fleetName: row.fleetName,
      accountType: row.accountType,
      plan: row.plan,
      billingStatus: row.billingStatus,
      activeUsers: row.activeUsers,
      poweredVehicles: row.poweredVehicles,
      trailers: row.trailers,
      inspectionsCompleted: row.inspectionsCompleted,
      diagnosticsStarted: row.diagnosticsStarted,
      lastActiveAt: row.lastActiveAt,
      riskStatus: row.riskStatus,
      riskReason: row.riskReason,
      followUpStatus: row.followUpStatus,
      nextFollowUpAt: row.nextFollowUpAt,
      mrr: row.mrr,
    }))
  );
}
