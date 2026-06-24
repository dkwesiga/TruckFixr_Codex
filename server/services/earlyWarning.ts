// Rule-based early warning engine (TruckFixr V1.0).
//
// Deterministic, non-AI rules that flag vehicles whose issue history suggests
// they need attention before they become costly downtime. Warnings are stored
// in "earlyWarningFlags" and reconciled per vehicle: each evaluation computes
// the set of warnings that *should* be active right now, refreshes/inserts
// those, and deactivates any previously-active flag whose condition no longer
// holds (so closing an issue clears its warnings automatically).
//
// Rules (V1.0):
//   1. repeat_symptom        - same issue title reported 2+ times in 30 days
//   2. repeat_fault_code     - same fault code reported 2+ times in 30 days
//   3. high_severity_defect  - an open high/critical defect exists
//   4. multiple_open_issues  - vehicle has 3+ open issues
//   5. safety_keyword        - open issue mentions a safety-critical system
//   6. overdue_open_issue    - issue open for more than 7 days
//   7. recurring_after_repair- resolved issue returns within 30 days

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { defects, earlyWarningFlags } from "../../drizzle/schema";

const OPEN_STATUSES = new Set([
  "open",
  "acknowledged",
  "assigned",
  "monitoring",
  "repair_required",
]);
const CLOSED_STATUSES = new Set(["resolved", "dismissed"]);

const SAFETY_KEYWORDS = [
  "brake",
  "steering",
  "suspension",
  "tire",
  "tyre",
  "air leak",
  "overheat",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;
const SEVEN_DAYS_MS = 7 * DAY_MS;

type WarningSeverity = "low" | "medium" | "high" | "critical";

type DesiredWarning = {
  dedupeKey: string;
  warningType: string;
  warningReason: string;
  severity: WarningSeverity;
  defectId: number | null;
  metadata?: Record<string, unknown>;
};

type DefectRow = typeof defects.$inferSelect;

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function mapDefectSeverity(severity: string | null | undefined): WarningSeverity {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "low":
    case "minor":
      return "low";
    default:
      return "medium";
  }
}

function maxSeverity(a: WarningSeverity, b: WarningSeverity): WarningSeverity {
  const order: WarningSeverity[] = ["low", "medium", "high", "critical"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function isOpen(defect: DefectRow): boolean {
  return OPEN_STATUSES.has(defect.status ?? "open");
}

function defectFaultCodes(defect: DefectRow): string[] {
  return Array.isArray(defect.faultCodes)
    ? (defect.faultCodes as unknown[]).map((c) => String(c).trim()).filter(Boolean)
    : [];
}

function matchedSafetyKeyword(defect: DefectRow): string | null {
  const haystack = `${normalizeText(defect.title)} ${normalizeText(defect.description)} ${normalizeText(defect.category)}`;
  return SAFETY_KEYWORDS.find((keyword) => haystack.includes(keyword)) ?? null;
}

/**
 * Compute the set of warnings that should currently be active for a vehicle,
 * given all of its defects.
 */
export function computeDesiredWarnings(allDefects: DefectRow[], now: Date = new Date()): DesiredWarning[] {
  const desired = new Map<string, DesiredWarning>();
  const add = (warning: DesiredWarning) => {
    const existing = desired.get(warning.dedupeKey);
    if (!existing) {
      desired.set(warning.dedupeKey, warning);
    } else {
      existing.severity = maxSeverity(existing.severity, warning.severity);
    }
  };

  const openDefects = allDefects.filter(isOpen);
  const recentDefects = allDefects.filter(
    (d) => now.getTime() - new Date(d.createdAt).getTime() <= THIRTY_DAYS_MS
  );

  // Rule 4: 3+ open issues.
  if (openDefects.length >= 3) {
    add({
      dedupeKey: "multiple_open_issues",
      warningType: "multiple_open_issues",
      warningReason: `Vehicle has ${openDefects.length} open issues awaiting resolution.`,
      severity: "high",
      defectId: null,
      metadata: { openCount: openDefects.length },
    });
  }

  // Rule 1: same issue title reported 2+ times in 30 days.
  const titleCounts = new Map<string, { count: number; severity: WarningSeverity; label: string }>();
  for (const defect of recentDefects) {
    const key = normalizeText(defect.title);
    if (!key) continue;
    const entry = titleCounts.get(key) ?? {
      count: 0,
      severity: "low" as WarningSeverity,
      label: defect.title,
    };
    entry.count += 1;
    entry.severity = maxSeverity(entry.severity, mapDefectSeverity(defect.severity));
    titleCounts.set(key, entry);
  }
  for (const [key, entry] of titleCounts) {
    if (entry.count >= 2) {
      add({
        dedupeKey: `repeat_symptom:${key}`,
        warningType: "repeat_symptom",
        warningReason: `"${entry.label}" reported ${entry.count} times in the last 30 days.`,
        severity: maxSeverity("medium", entry.severity),
        defectId: null,
        metadata: { count: entry.count },
      });
    }
  }

  // Rule 2: same fault code reported 2+ times in 30 days.
  const faultCounts = new Map<string, number>();
  for (const defect of recentDefects) {
    for (const code of defectFaultCodes(defect)) {
      faultCounts.set(code, (faultCounts.get(code) ?? 0) + 1);
    }
  }
  for (const [code, count] of faultCounts) {
    if (count >= 2) {
      add({
        dedupeKey: `repeat_fault_code:${code.toLowerCase()}`,
        warningType: "repeat_fault_code",
        warningReason: `Fault code ${code} reported ${count} times in the last 30 days.`,
        severity: "high",
        defectId: null,
        metadata: { code, count },
      });
    }
  }

  // Per-open-defect rules: high severity (3), safety keyword (5), overdue (6).
  for (const defect of openDefects) {
    const severity = mapDefectSeverity(defect.severity);
    if (severity === "high" || severity === "critical") {
      add({
        dedupeKey: `high_severity_defect:${defect.id}`,
        warningType: "high_severity_defect",
        warningReason: `Open ${severity} defect: ${defect.title}.`,
        severity,
        defectId: defect.id,
      });
    }

    const keyword = matchedSafetyKeyword(defect);
    if (keyword) {
      add({
        dedupeKey: `safety_keyword:${defect.id}`,
        warningType: "safety_keyword",
        warningReason: `Open issue mentions a safety-critical system (${keyword}): ${defect.title}.`,
        severity: maxSeverity("high", severity),
        defectId: defect.id,
        metadata: { keyword },
      });
    }

    const ageMs = now.getTime() - new Date(defect.createdAt).getTime();
    if (ageMs > SEVEN_DAYS_MS) {
      const days = Math.floor(ageMs / DAY_MS);
      add({
        dedupeKey: `overdue_open_issue:${defect.id}`,
        warningType: "overdue_open_issue",
        warningReason: `Issue open for ${days} days without resolution: ${defect.title}.`,
        severity: maxSeverity("medium", severity),
        defectId: defect.id,
        metadata: { ageDays: days },
      });
    }
  }

  // Rule 7: resolved issue returns within 30 days (recurrence).
  const resolvedByTitle = new Map<string, Date>();
  for (const defect of allDefects) {
    if (!CLOSED_STATUSES.has(defect.status ?? "")) continue;
    const key = normalizeText(defect.title);
    if (!key) continue;
    const resolvedAt = defect.resolvedAt ?? defect.closedAt ?? defect.updatedAt;
    if (!resolvedAt) continue;
    const prev = resolvedByTitle.get(key);
    if (!prev || new Date(resolvedAt).getTime() > prev.getTime()) {
      resolvedByTitle.set(key, new Date(resolvedAt));
    }
  }
  for (const defect of openDefects) {
    const key = normalizeText(defect.title);
    const resolvedAt = resolvedByTitle.get(key);
    if (!resolvedAt) continue;
    const created = new Date(defect.createdAt).getTime();
    if (created > resolvedAt.getTime() && created - resolvedAt.getTime() <= THIRTY_DAYS_MS) {
      add({
        dedupeKey: `recurring_after_repair:${key}`,
        warningType: "recurring_after_repair",
        warningReason: `"${defect.title}" returned within 30 days of a previous resolution.`,
        severity: "high",
        defectId: defect.id,
        metadata: { previousResolvedAt: resolvedAt.toISOString() },
      });
    }
  }

  return [...desired.values()];
}

/**
 * Evaluate all early-warning rules for one vehicle and reconcile the stored
 * flags. Safe to call repeatedly (idempotent); never throws into the caller.
 */
export async function evaluateEarlyWarnings(input: {
  fleetId: number;
  vehicleId: number | string;
}): Promise<{ activated: number; cleared: number } | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const vehicleId = String(input.vehicleId);
    const allDefects = await db
      .select()
      .from(defects)
      .where(eq(defects.vehicleId, vehicleId));

    const now = new Date();
    const desired = computeDesiredWarnings(allDefects, now);
    const desiredByKey = new Map(desired.map((w) => [w.dedupeKey, w]));

    const activeFlags = await db
      .select()
      .from(earlyWarningFlags)
      .where(
        and(
          eq(earlyWarningFlags.vehicleId, vehicleId),
          eq(earlyWarningFlags.isActive, true)
        )
      );
    const activeByKey = new Map(
      activeFlags
        .filter((f) => f.dedupeKey)
        .map((f) => [f.dedupeKey as string, f])
    );

    let activated = 0;
    let cleared = 0;

    // Insert new warnings or refresh existing active ones.
    for (const warning of desired) {
      const existing = activeByKey.get(warning.dedupeKey);
      if (existing) {
        await db
          .update(earlyWarningFlags)
          .set({
            warningReason: warning.warningReason,
            severity: warning.severity,
            defectId: warning.defectId,
            metadata: warning.metadata ?? null,
            updatedAt: now,
          })
          .where(eq(earlyWarningFlags.id, existing.id));
      } else {
        await db.insert(earlyWarningFlags).values({
          fleetId: input.fleetId,
          vehicleId,
          defectId: warning.defectId,
          warningType: warning.warningType,
          warningReason: warning.warningReason,
          severity: warning.severity,
          dedupeKey: warning.dedupeKey,
          metadata: warning.metadata ?? null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        activated += 1;
      }
    }

    // Deactivate active flags whose condition no longer holds.
    for (const flag of activeFlags) {
      if (!flag.dedupeKey || !desiredByKey.has(flag.dedupeKey)) {
        await db
          .update(earlyWarningFlags)
          .set({ isActive: false, resolvedAt: now, updatedAt: now })
          .where(eq(earlyWarningFlags.id, flag.id));
        cleared += 1;
      }
    }

    return { activated, cleared };
  } catch (error) {
    console.warn("[EarlyWarning] Evaluation failed:", error);
    return null;
  }
}
