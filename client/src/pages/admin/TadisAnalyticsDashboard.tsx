import type { ComponentType } from "react";
import {
  Activity,
  BadgeCheck,
  ClipboardList,
  Database,
  Gauge,
  RefreshCw,
  ShieldQuestion,
  Sparkles,
  Users,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

function Kpi(props: { title: string; value: string | number; detail?: string; icon: ComponentType<{ className?: string }> }) {
  const Icon = props.icon;
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{props.title}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{props.value}</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Icon className="h-5 w-5" />
          </span>
        </div>
        {props.detail ? <p className="mt-3 text-sm text-slate-500">{props.detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function formatHours(value: number | null | undefined, sampleSize?: number) {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return sampleSize != null ? `${rounded}h (n=${sampleSize})` : `${rounded}h`;
}

export default function TadisAnalyticsDashboard() {
  const metricsQuery = trpc.admin.tadisMetrics.useQuery(undefined, { retry: false });
  const data = metricsQuery.data;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">TADIS Knowledge &amp; Usage</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Mr Diesel closed-loop pipeline: platform usage, TADIS learning growth, operational quality, and
              tenant activity. Zero-data cells show "—" rather than a misleading average.
            </p>
          </div>
          <Button variant="outline" onClick={() => void metricsQuery.refetch()} disabled={metricsQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${metricsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {metricsQuery.isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : metricsQuery.error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{metricsQuery.error.message}</CardContent>
          </Card>
        ) : !data || data.unavailable ? (
          <Card><CardContent className="py-10 text-center text-sm text-slate-500">Metrics unavailable.</CardContent></Card>
        ) : (
          <>
            {/* A. Platform usage */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Platform usage (last 30 days)</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi title="Registered users" value={data.usage?.registeredUsers ?? "—"} icon={Users} />
                <Kpi
                  title="Meaningful active users"
                  value={data.usage?.meaningfulActiveUsers ?? "—"}
                  detail="Created/updated a case, resolution, or outcome — not a bare login."
                  icon={Activity}
                />
                <Kpi title="Cases created" value={data.usage?.casesCreated ?? "—"} icon={ClipboardList} />
                <Kpi title="Resolutions recorded" value={data.usage?.resolutionsCreated ?? "—"} icon={Sparkles} />
              </div>
            </section>

            {/* B. TADIS learning analytics */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">TADIS learning</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <Kpi title="Total Resolutions" value={data.learning?.totalResolutions ?? "—"} icon={ClipboardList} />
                <Kpi title="Total Outcomes" value={data.learning?.totalOutcomes ?? "—"} icon={BadgeCheck} />
                <Kpi
                  title="Resolution → Verified"
                  value={formatPercent(data.learning?.resolutionToVerifiedConversion)}
                  icon={Gauge}
                />
                <Kpi
                  title="Verified → Confirmed"
                  value={formatPercent(data.learning?.verifiedToConfirmedConversion)}
                  icon={Gauge}
                />
                <Kpi
                  title="Avg. quality score"
                  value={data.learning?.averageQualityScore != null ? Math.round(data.learning.averageQualityScore) : "—"}
                  detail="0-100, see shared/tadis/qualityScore.ts"
                  icon={ShieldQuestion}
                />
              </div>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Outcomes by state</CardTitle>
                  <CardDescription>Failed outcomes are kept as negative evidence, never discarded.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {data.learning ? (
                    Object.entries(data.learning.outcomesByState).map(([state, count]) => (
                      <Badge key={state} variant="outline" className="text-sm">
                        {state}: {count}
                      </Badge>
                    ))
                  ) : null}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">TADIS candidates &amp; promotion</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-slate-700">
                    <p>Candidates: {data.learning?.tadisCandidates ?? 0}</p>
                    <p>Promoted learning records: {data.learning?.tadisPromotedLearningRecords ?? 0}</p>
                    <p>Excluded: {data.learning?.tadisExcludedRecords ?? 0}</p>
                    <p className="pt-2 text-xs text-slate-500">
                      Historical import: {data.learning?.historicalVsLive.historical ?? 0} · Live: {data.learning?.historicalVsLive.live ?? 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Cases by TADIS eligibility</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-slate-700">
                    <p>Operational record: {data.learning?.casesByEligibility.operationalRecord ?? 0}</p>
                    <p>TADIS candidate: {data.learning?.casesByEligibility.tadisCandidate ?? 0}</p>
                    <p>TADIS learning record: {data.learning?.casesByEligibility.tadisLearningRecord ?? 0}</p>
                    <p>Excluded: {data.learning?.casesByEligibility.excluded ?? 0}</p>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* C. Operational quality */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Operational quality</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi
                  title="Case → 1st Resolution"
                  value={formatHours(data.operationalQuality?.caseToFirstResolutionHours.average, data.operationalQuality?.caseToFirstResolutionHours.sampleSize)}
                  icon={Gauge}
                />
                <Kpi
                  title="Report → Verification"
                  value={formatHours(data.operationalQuality?.repairToVerificationHours.average, data.operationalQuality?.repairToVerificationHours.sampleSize)}
                  icon={Gauge}
                />
                <Kpi
                  title="Verification → Confirmation"
                  value={formatHours(data.operationalQuality?.verificationToConfirmationHours.average, data.operationalQuality?.verificationToConfirmationHours.sampleSize)}
                  icon={Gauge}
                />
                <Kpi
                  title="Repeat/comeback rate"
                  value={formatPercent(data.operationalQuality?.repeatComebackRate)}
                  detail={`${data.operationalQuality?.unresolvedCases ?? 0} unresolved cases`}
                  icon={ShieldQuestion}
                />
              </div>
            </section>

            {/* D. Tenant analytics */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Tenants</h2>
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="overflow-x-auto p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Tenant</th>
                        <th className="px-4 py-2">Type</th>
                        <th className="px-4 py-2">Plan</th>
                        <th className="px-4 py-2">Vehicles</th>
                        <th className="px-4 py-2">Users</th>
                        <th className="px-4 py-2">Cases</th>
                        <th className="px-4 py-2">Verified outcomes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.tenants ?? []).map((t) => (
                        <tr key={t.fleetId} className="border-t border-slate-100">
                          <td className="px-4 py-2 font-medium text-slate-900">{t.fleetName}</td>
                          <td className="px-4 py-2"><Badge variant="outline">{t.tenantType}</Badge></td>
                          <td className="px-4 py-2 text-slate-600">{t.planName ?? "—"}</td>
                          <td className="px-4 py-2 text-slate-600">{t.vehicleCount}</td>
                          <td className="px-4 py-2 text-slate-600">{t.userCount}</td>
                          <td className="px-4 py-2 text-slate-600">{t.caseCount}</td>
                          <td className="px-4 py-2 text-slate-600">{t.verifiedOutcomeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </section>

            {/* ROI foundation */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">ROI foundation</h2>
              <p className="text-xs text-slate-500">
                Estimates only unless explicitly measured — never presented as an audited saving.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi title="Est. downtime avoided" value={data.roi?.estimatedDowntimeAvoidedHours != null ? `${Math.round(data.roi.estimatedDowntimeAvoidedHours)}h` : "—"} icon={Database} />
                <Kpi title="Actual downtime avoided" value={data.roi?.actualDowntimeAvoidedHours != null ? `${Math.round(data.roi.actualDowntimeAvoidedHours)}h` : "—"} icon={Database} />
                <Kpi title="Est. tow avoided" value={data.roi?.estimatedTowAvoidedCents != null ? `$${Math.round(data.roi.estimatedTowAvoidedCents / 100)}` : "—"} icon={Database} />
                <Kpi title="Records with impact data" value={data.roi?.recordsWithImpactData ?? 0} icon={Database} />
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
