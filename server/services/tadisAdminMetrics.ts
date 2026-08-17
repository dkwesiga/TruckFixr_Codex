import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

export type TadisAdminMetricsFilters = {
  fromDate?: Date;
  toDate?: Date;
  fleetId?: number | null;
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// node-postgres query results carry rows under `.rows`; a query with zero
// matches still returns `.rows: []`, never undefined.
async function execRows<T = Record<string, unknown>>(db: Db, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return ((result as unknown as { rows?: T[] }).rows ?? []) as T[];
}

async function execOne<T = Record<string, unknown>>(db: Db, query: SQL): Promise<T | null> {
  const rows = await execRows<T>(db, query);
  return rows[0] ?? null;
}

// §18.A Platform Usage — "meaningful active" is a core product action, never
// a bare login. A user counts as meaningfully active in the window if they
// created/updated a case, recorded a Resolution, or touched an Outcome.
async function getUsageMetrics(db: Db, filters: TadisAdminMetricsFilters) {
  const fromDate = filters.fromDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toDate = filters.toDate ?? new Date();

  const registeredUsersRow = await execOne<{ count: number }>(db, sql`select count(*)::int as count from "users"`);
  const meaningfulActiveRow = await execOne<{ count: number }>(
    db,
    sql`
      select count(distinct actor)::int as count from (
        select "createdByUserId" as actor from "maintenanceCases" where "updatedAt" between ${fromDate} and ${toDate}
        union
        select "createdByUserId" as actor from "maintenanceDecisions" where "createdAt" between ${fromDate} and ${toDate}
        union
        select "recordedByUserId" as actor from "repairOutcomes" where "updatedAt" between ${fromDate} and ${toDate}
        union
        select "verifiedByUserId" as actor from "repairOutcomes" where "verifiedAt" between ${fromDate} and ${toDate}
      ) as actors where actor is not null
    `
  );
  const casesCreatedRow = await execOne<{ count: number }>(
    db,
    sql`select count(*)::int as count from "maintenanceCases" where "createdAt" between ${fromDate} and ${toDate}`
  );
  const resolutionsRow = await execOne<{ count: number }>(
    db,
    sql`select count(*)::int as count from "maintenanceDecisions" where "createdAt" between ${fromDate} and ${toDate}`
  );
  const technicianReviewsRow = await execOne<{ count: number }>(
    db,
    sql`select count(*)::int as count from "technicianReviews" where "createdAt" between ${fromDate} and ${toDate}`
  );
  const usersByRole = await execRows<{ role: string; count: number }>(
    db,
    sql`select "role"::text as role, count(*)::int as count from "users" group by "role"`
  );

  return {
    registeredUsers: Number(registeredUsersRow?.count ?? 0),
    meaningfulActiveUsers: Number(meaningfulActiveRow?.count ?? 0),
    casesCreated: Number(casesCreatedRow?.count ?? 0),
    resolutionsCreated: Number(resolutionsRow?.count ?? 0),
    technicianReviews: Number(technicianReviewsRow?.count ?? 0),
    usersByRole: usersByRole.map((row) => ({ role: row.role, count: Number(row.count) })),
    windowFrom: fromDate,
    windowTo: toDate,
  };
}

// §18.B TADIS Learning Analytics
async function getLearningMetrics(db: Db) {
  const outcomeStateCounts = await execRows<{ state: string; count: number }>(
    db,
    sql`select "outcomeState"::text as state, count(*)::int as count from "repairOutcomes" group by "outcomeState"`
  );
  const stateMap = new Map(outcomeStateCounts.map((row) => [row.state, Number(row.count)]));

  const totalResolutionsRow = await execOne<{ count: number }>(db, sql`select count(*)::int as count from "maintenanceDecisions"`);
  const totalOutcomesRow = await execOne<{ count: number }>(db, sql`select count(*)::int as count from "repairOutcomes"`);

  const eligibilityCounts = await execRows<{ status: string; count: number }>(
    db,
    sql`select "eligibilityStatus"::text as status, count(*)::int as count from "tadisLearningRecords" group by "eligibilityStatus"`
  );
  const eligibilityMap = new Map(eligibilityCounts.map((row) => [row.status, Number(row.count)]));

  const caseEligibilityCounts = await execRows<{ eligibility: string; count: number }>(
    db,
    sql`select "tadisEligibility"::text as eligibility, count(*)::int as count from "maintenanceCases" group by "tadisEligibility"`
  );
  const caseEligibilityMap = new Map(caseEligibilityCounts.map((row) => [row.eligibility, Number(row.count)]));

  const avgQualityRow = await execOne<{ avg: number | null }>(
    db,
    sql`select avg("evidenceQualityScore")::float as avg from "repairOutcomes" where "evidenceQualityScore" is not null`
  );
  const qualityTierCounts = await execRows<{ tier: string; count: number }>(
    db,
    sql`
      select "evidenceQualityTier"::text as tier, count(*)::int as count from "repairOutcomes"
      where "evidenceQualityTier" is not null group by "evidenceQualityTier"
    `
  );
  const recordOriginRow = await execOne<{ historical: number; live: number }>(
    db,
    sql`
      select
        count(*) filter (where "recordOrigin" = 'historical_import')::int as historical,
        count(*) filter (where "recordOrigin" = 'live')::int as live
      from "maintenanceCases"
    `
  );

  const totalResolutions = Number(totalResolutionsRow?.count ?? 0);
  const totalOutcomes = Number(totalOutcomesRow?.count ?? 0);
  const verified = (stateMap.get("verified") ?? 0) + (stateMap.get("confirmed") ?? 0);
  const confirmed = stateMap.get("confirmed") ?? 0;

  return {
    totalResolutions,
    totalOutcomes,
    outcomesByState: {
      unknown: stateMap.get("unknown") ?? 0,
      reported: stateMap.get("reported") ?? 0,
      verified: stateMap.get("verified") ?? 0,
      confirmed: stateMap.get("confirmed") ?? 0,
      failed: stateMap.get("failed") ?? 0,
    },
    // Zero/unknown data must never silently produce a misleading ratio (§C).
    resolutionToOutcomeConversion: totalResolutions > 0 ? Number((totalOutcomes / totalResolutions).toFixed(3)) : null,
    resolutionToVerifiedConversion: totalResolutions > 0 ? Number((verified / totalResolutions).toFixed(3)) : null,
    verifiedToConfirmedConversion: verified > 0 ? Number((confirmed / verified).toFixed(3)) : null,
    tadisCandidates: eligibilityMap.get("candidate") ?? 0,
    tadisPromotedLearningRecords: eligibilityMap.get("promoted") ?? 0,
    tadisExcludedRecords: eligibilityMap.get("excluded") ?? 0,
    casesByEligibility: {
      notAssessed: caseEligibilityMap.get("not_assessed") ?? 0,
      operationalRecord: caseEligibilityMap.get("operational_record") ?? 0,
      tadisCandidate: caseEligibilityMap.get("tadis_candidate") ?? 0,
      tadisLearningRecord: caseEligibilityMap.get("tadis_learning_record") ?? 0,
      excluded: caseEligibilityMap.get("excluded") ?? 0,
    },
    averageQualityScore: avgQualityRow?.avg ?? null,
    qualityTierDistribution: qualityTierCounts.map((row) => ({ tier: row.tier, count: Number(row.count) })),
    historicalVsLive: {
      historical: Number(recordOriginRow?.historical ?? 0),
      live: Number(recordOriginRow?.live ?? 0),
    },
  };
}

// §18.C Operational Quality. Averages computed only over rows where BOTH
// timestamps exist, and the sample size is always returned alongside the
// average so a small n doesn't masquerade as a stable metric.
async function getOperationalQualityMetrics(db: Db) {
  const caseToResolutionRow = await execOne<{ avg_hours: number | null; sample_size: number }>(
    db,
    sql`
      select
        avg(extract(epoch from (d."createdAt" - c."openedAt")) / 3600)::float as avg_hours,
        count(*)::int as sample_size
      from "maintenanceDecisions" d
      join "maintenanceCases" c on c.id = d."caseId" and d.version = 1
    `
  );

  const verificationRow = await execOne<{ avg_hours: number | null; sample_size: number }>(
    db,
    sql`
      select
        avg(extract(epoch from ("verifiedAt" - "reportedAt")) / 3600)::float as avg_hours,
        count(*)::int as sample_size
      from "repairOutcomes" where "verifiedAt" is not null and "reportedAt" is not null
    `
  );

  const confirmationRow = await execOne<{ avg_hours: number | null; sample_size: number }>(
    db,
    sql`
      select
        avg(extract(epoch from ("confirmedAt" - "verifiedAt")) / 3600)::float as avg_hours,
        count(*)::int as sample_size
      from "repairOutcomes" where "confirmedAt" is not null and "verifiedAt" is not null
    `
  );

  const repeatFailureRow = await execOne<{ repeat_count: number; total: number }>(
    db,
    sql`
      select
        count(*) filter (where "repeatFailure" = true)::int as repeat_count,
        count(*)::int as total
      from "repairOutcomes" where "outcomeState" in ('verified', 'confirmed', 'failed')
    `
  );

  const unresolvedRow = await execOne<{ count: number }>(
    db,
    sql`select count(*)::int as count from "maintenanceCases" where "status" not in ('closed', 'cancelled', 'completed')`
  );

  const repeatCount = Number(repeatFailureRow?.repeat_count ?? 0);
  const repeatTotal = Number(repeatFailureRow?.total ?? 0);

  return {
    caseToFirstResolutionHours: {
      average: caseToResolutionRow?.avg_hours ?? null,
      sampleSize: Number(caseToResolutionRow?.sample_size ?? 0),
    },
    repairToVerificationHours: {
      average: verificationRow?.avg_hours ?? null,
      sampleSize: Number(verificationRow?.sample_size ?? 0),
    },
    verificationToConfirmationHours: {
      average: confirmationRow?.avg_hours ?? null,
      sampleSize: Number(confirmationRow?.sample_size ?? 0),
    },
    repeatComebackRate: repeatTotal > 0 ? Number((repeatCount / repeatTotal).toFixed(3)) : null,
    unresolvedCases: Number(unresolvedRow?.count ?? 0),
  };
}

// §18.D Basic tenant analytics
async function getTenantMetrics(db: Db) {
  const rows = await execRows<{
    fleetId: number;
    fleetName: string;
    tenantType: string;
    planName: string | null;
    vehicleCount: number;
    userCount: number;
    caseCount: number;
    verifiedOutcomeCount: number;
  }>(
    db,
    sql`
      select
        f.id as "fleetId",
        f.name as "fleetName",
        coalesce(pp."tenantType", case when f."isPartner" then 'repair_shop' else 'fleet' end) as "tenantType",
        f."planName" as "planName",
        (select count(*)::int from "vehicles" v where v."fleetId" = f.id) as "vehicleCount",
        (select count(*)::int from "companyMemberships" cm where cm."fleetId" = f.id and cm.status = 'active') as "userCount",
        (select count(*)::int from "maintenanceCases" mc where mc."fleetId" = f.id) as "caseCount",
        (select count(*)::int from "repairOutcomes" ro where ro."fleetId" = f.id and ro."outcomeState" in ('verified', 'confirmed')) as "verifiedOutcomeCount"
      from "fleets" f
      left join "partnerProfiles" pp on pp."fleetId" = f.id
      where f."accountType" = 'production'
      order by "caseCount" desc
      limit 50
    `
  );

  return rows.map((row) => ({
    fleetId: Number(row.fleetId),
    fleetName: String(row.fleetName ?? ""),
    tenantType: String(row.tenantType ?? "fleet"),
    planName: row.planName ? String(row.planName) : null,
    vehicleCount: Number(row.vehicleCount ?? 0),
    userCount: Number(row.userCount ?? 0),
    caseCount: Number(row.caseCount ?? 0),
    verifiedOutcomeCount: Number(row.verifiedOutcomeCount ?? 0),
  }));
}

// §21 ROI foundation. Actual vs. estimated is always kept distinct — never
// presented as an audited saving unless estimateSource = 'actual'.
async function getRoiMetrics(db: Db) {
  const row = await execOne<{
    estimated_downtime_hours: number | null;
    actual_downtime_hours: number | null;
    estimated_tow_avoided_cents: number | null;
    estimated_road_call_avoided_cents: number | null;
    sample_size: number;
  }>(
    db,
    sql`
      select
        sum("estimatedDowntimeAvoidedHours") filter (where "estimateSource" != 'actual')::float as estimated_downtime_hours,
        sum("estimatedDowntimeAvoidedHours") filter (where "estimateSource" = 'actual')::float as actual_downtime_hours,
        sum("estimatedTowAvoidedCents")::bigint as estimated_tow_avoided_cents,
        sum("estimatedRoadCallAvoidedCents")::bigint as estimated_road_call_avoided_cents,
        count(*) filter (where "estimateSource" is not null)::int as sample_size
      from "repairOutcomes"
    `
  );

  return {
    estimatedDowntimeAvoidedHours: row?.estimated_downtime_hours ?? null,
    actualDowntimeAvoidedHours: row?.actual_downtime_hours ?? null,
    estimatedTowAvoidedCents: row?.estimated_tow_avoided_cents ?? null,
    estimatedRoadCallAvoidedCents: row?.estimated_road_call_avoided_cents ?? null,
    recordsWithImpactData: Number(row?.sample_size ?? 0),
  };
}

export async function getTadisAdminMetrics(filters: TadisAdminMetricsFilters = {}) {
  const db = await getDb();
  if (!db) {
    return {
      usage: null,
      learning: null,
      operationalQuality: null,
      tenants: [],
      roi: null,
      unavailable: true as const,
    };
  }

  const [usage, learning, operationalQuality, tenants, roi] = await Promise.all([
    getUsageMetrics(db, filters),
    getLearningMetrics(db),
    getOperationalQualityMetrics(db),
    getTenantMetrics(db),
    getRoiMetrics(db),
  ]);

  return { usage, learning, operationalQuality, tenants, roi, unavailable: false as const };
}
