import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { AlertTriangle, Bot, Building2, CalendarDays, Car, CheckCircle2, ClipboardCheck, CreditCard, FileDown, Search, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

type Timeframe = "today" | "yesterday" | "last_7_days" | "last_30_days" | "last_90_days" | "mtd" | "qtd" | "ytd" | "all_time" | "custom";
type AccountType = "production" | "demo" | "internal_test" | "archived" | "all";

const chartColors = ["#0f172a", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "mtd", label: "Month-to-date" },
  { value: "qtd", label: "Quarter-to-date" },
  { value: "ytd", label: "Year-to-date" },
  { value: "all_time", label: "All-time" },
  { value: "custom", label: "Custom" },
];

function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number);
}

function formatCurrency(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(number);
}

function formatDate(value: unknown) {
  if (!value) return "No activity";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "No activity";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" | "blue" | "purple" }) {
  const classes = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>{value}</span>;
}

function riskTone(value?: string) {
  if (value === "healthy") return "green" as const;
  if (value === "high_priority" || value === "billing_risk" || value === "compliance_risk") return "red" as const;
  if (value === "inactive" || value === "diagnostic_follow_up_risk") return "amber" as const;
  return "blue" as const;
}

function KpiCard(props: { title: string; value: string | number; detail: string; icon: ComponentType<{ className?: string }> }) {
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
        <p className="mt-3 text-sm text-slate-500">{props.detail}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

function MetricSelect(props: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{props.label}</Label>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function FleetTable({ title, description, rows, empty }: { title: string; description: string; rows: any[]; empty: string }) {
  const [, navigate] = useLocation();
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">{empty}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="pb-3 pr-4 font-semibold">Fleet</th>
                  <th className="pb-3 pr-4 font-semibold">Plan</th>
                  <th className="pb-3 pr-4 font-semibold">Users</th>
                  <th className="pb-3 pr-4 font-semibold">Assets</th>
                  <th className="pb-3 pr-4 font-semibold">Inspections</th>
                  <th className="pb-3 pr-4 font-semibold">Diagnostics</th>
                  <th className="pb-3 pr-4 font-semibold">Last active</th>
                  <th className="pb-3 pr-4 font-semibold">Risk</th>
                  <th className="pb-3 font-semibold">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.fleetId}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => navigate(`/admin/fleets/${row.fleetId}`)}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-950">{row.fleetName}</div>
                      <div className="mt-1 flex gap-2">
                        <Badge value={row.accountType} tone={row.accountType === "production" ? "green" : "amber"} />
                        <Badge value={row.billingStatus} tone={row.billingStatus === "active" ? "green" : row.billingStatus === "past_due" ? "red" : "slate"} />
                      </div>
                    </td>
                    <td className="py-3 pr-4">{row.planLabel}</td>
                    <td className="py-3 pr-4">{row.activeUsers}</td>
                    <td className="py-3 pr-4">{row.poweredVehicles} / {row.trailers}</td>
                    <td className="py-3 pr-4">{row.inspectionsCompleted}</td>
                    <td className="py-3 pr-4">{row.diagnosticsStarted}</td>
                    <td className="py-3 pr-4">{formatDate(row.lastActiveAt)}</td>
                    <td className="py-3 pr-4"><Badge value={String(row.riskStatus).replaceAll("_", " ")} tone={riskTone(row.riskStatus)} /></td>
                    <td className="py-3"><Badge value={String(row.followUpStatus).replaceAll("_", " ")} tone="blue" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function AdminMetricsDashboard() {
  const [filters, setFilters] = useState({
    timeframe: "last_30_days" as Timeframe,
    accountType: "production" as AccountType,
    from: "",
    to: "",
    plan: "all",
    billingStatus: "all",
    riskStatus: "all",
    followUpStatus: "all",
    search: "",
  });
  const [exportRequest, setExportRequest] = useState<"fleets" | "at_risk" | "investor" | null>(null);

  const queryInput = useMemo(() => ({
    ...filters,
    from: filters.from || undefined,
    to: filters.to || undefined,
    plan: filters.plan === "all" ? undefined : filters.plan,
    billingStatus: filters.billingStatus === "all" ? undefined : filters.billingStatus,
    riskStatus: filters.riskStatus as any,
    followUpStatus: filters.followUpStatus as any,
  }), [filters]);

  const metricsQuery = trpc.admin.metrics.useQuery(queryInput, { keepPreviousData: true } as any);
  const exportQuery = trpc.admin.exportCsv.useQuery(
    { variant: exportRequest ?? "fleets", filters: queryInput },
    { enabled: Boolean(exportRequest), retry: false } as any
  );

  useEffect(() => {
    if (!exportQuery.data || !exportRequest) return;
    downloadCsv(exportQuery.data.fileName, exportQuery.data.csv);
    setExportRequest(null);
  }, [exportQuery.data, exportRequest]);

  useEffect(() => {
    if (exportQuery.error) {
      toast.error(exportQuery.error.message);
      setExportRequest(null);
    }
  }, [exportQuery.error]);

  const data = metricsQuery.data;
  const kpis = data?.kpis;
  const tables = data?.tables;
  const billing = data?.billing;
  const compliance = data?.compliance;
  const diagnostics = data?.diagnostics;
  const investor = data?.investor;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Internal Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">TruckFixr Admin Metrics Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Track production fleet usage, billing traction, inspection compliance, diagnostic quality, and founder follow-up priorities.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data?.admin.canExport ? (
              <>
                <Button variant="outline" onClick={() => setExportRequest("fleets")}><FileDown className="mr-2 h-4 w-4" />Fleet CSV</Button>
                <Button variant="outline" onClick={() => setExportRequest("at_risk")}><FileDown className="mr-2 h-4 w-4" />At-risk CSV</Button>
                <Button variant="outline" onClick={() => setExportRequest("investor")}><FileDown className="mr-2 h-4 w-4" />Investor CSV</Button>
              </>
            ) : null}
            <Button onClick={() => void metricsQuery.refetch()}>Refresh</Button>
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-8">
            <MetricSelect
              label="Date range"
              value={filters.timeframe}
              onChange={(value) => setFilters((current) => ({ ...current, timeframe: value as Timeframe }))}
              options={timeframeOptions}
            />
            <MetricSelect
              label="Account type"
              value={filters.accountType}
              onChange={(value) => setFilters((current) => ({ ...current, accountType: value as AccountType }))}
              options={[
                { value: "production", label: "Production" },
                { value: "demo", label: "Demo" },
                { value: "internal_test", label: "Internal Test" },
                { value: "archived", label: "Archived" },
                { value: "all", label: "All" },
              ]}
            />
            <MetricSelect
              label="Plan"
              value={filters.plan}
              onChange={(value) => setFilters((current) => ({ ...current, plan: value }))}
              options={[
                { value: "all", label: "All plans" },
                { value: "free_trial", label: "Free Trial" },
                { value: "owner_operator", label: "Owner-Operator" },
                { value: "small_fleet", label: "Small Fleet" },
                { value: "fleet_growth", label: "Fleet Growth" },
                { value: "fleet_pro", label: "Fleet Pro" },
                { value: "custom_fleet", label: "Custom Fleet" },
              ]}
            />
            <MetricSelect
              label="Billing"
              value={filters.billingStatus}
              onChange={(value) => setFilters((current) => ({ ...current, billingStatus: value }))}
              options={[
                { value: "all", label: "All billing" },
                { value: "trialing", label: "Trialing" },
                { value: "active", label: "Active" },
                { value: "past_due", label: "Past due" },
                { value: "canceled", label: "Canceled" },
                { value: "expired", label: "Expired" },
              ]}
            />
            <MetricSelect
              label="Risk"
              value={filters.riskStatus}
              onChange={(value) => setFilters((current) => ({ ...current, riskStatus: value }))}
              options={[
                { value: "all", label: "All risk" },
                { value: "healthy", label: "Healthy" },
                { value: "needs_onboarding", label: "Needs onboarding" },
                { value: "inactive", label: "Inactive" },
                { value: "billing_risk", label: "Billing risk" },
                { value: "compliance_risk", label: "Compliance risk" },
                { value: "diagnostic_follow_up_risk", label: "Diagnostic risk" },
                { value: "high_priority", label: "High priority" },
              ]}
            />
            <MetricSelect
              label="Follow-up"
              value={filters.followUpStatus}
              onChange={(value) => setFilters((current) => ({ ...current, followUpStatus: value }))}
              options={[
                { value: "all", label: "All follow-up" },
                { value: "healthy", label: "Healthy" },
                { value: "needs_onboarding", label: "Needs onboarding" },
                { value: "follow_up_needed", label: "Follow-up needed" },
                { value: "at_risk", label: "At risk" },
                { value: "converted", label: "Converted" },
                { value: "churned", label: "Churned" },
              ]}
            />
            <div className="space-y-1.5 xl:col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Search fleets</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  className="pl-9"
                  placeholder="Fleet or company name"
                />
              </div>
            </div>
            {filters.timeframe === "custom" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">From</Label>
                  <Input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">To</Label>
                  <Input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {metricsQuery.error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{metricsQuery.error.message}</CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Active Fleets" value={formatNumber(kpis?.activeFleets)} detail="Meaningful activity in selected period." icon={Building2} />
          <KpiCard title="Active Users" value={formatNumber(kpis?.activeUsers)} detail="Login or operational activity." icon={Users} />
          <KpiCard title="Inspections Completed" value={formatNumber(kpis?.inspectionsCompleted)} detail="Submitted inspection records." icon={ClipboardCheck} />
          <KpiCard title="AI Diagnostics Started" value={formatNumber(kpis?.aiDiagnosticsStarted)} detail="Diagnostic sessions with AI activity." icon={Bot} />
          <KpiCard title="Powered + Trailers" value={`${formatNumber(kpis?.poweredVehicles)} / ${formatNumber(kpis?.trailers)}`} detail="Active assets under management." icon={Car} />
          <KpiCard title="Trials / Pilots / Paid" value={`${formatNumber(kpis?.trials)} / ${formatNumber(kpis?.paidPilots)} / ${formatNumber(kpis?.paidCustomers)}`} detail="Account status breakdown." icon={CalendarDays} />
          <KpiCard title="MRR" value={formatCurrency(kpis?.monthlyRecurringRevenue)} detail={`${formatCurrency(kpis?.arrRunRate)} ARR run-rate.`} icon={CreditCard} />
          <KpiCard title="At-Risk Fleets" value={formatNumber(kpis?.atRiskFleets)} detail="Needs founder/admin follow-up." icon={AlertTriangle} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <ChartCard title="Usage Trends" description="Daily active fleets, active users, inspections, and AI diagnostics.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.trends ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="activeFleets" stroke="#0f172a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="activeUsers" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="inspectionsCompleted" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="diagnosticsStarted" stroke="#d97706" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Growth Trends" description="New fleets, users, powered vehicles, and trailers.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.trends ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="newFleets" fill="#0f172a" />
                <Bar dataKey="newUsers" fill="#2563eb" />
                <Bar dataKey="poweredVehiclesAdded" fill="#059669" />
                <Bar dataKey="trailersAdded" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section id="billing" className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Billing Snapshot</CardTitle>
              <CardDescription>Read-only Stripe-synced billing traction. Billing management remains in Stripe/customer portal flows.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Free trials", billing?.freeTrials],
                ["Paid pilots", billing?.paidPilots],
                ["Paid customers", billing?.paidCustomers],
                ["MRR", formatCurrency(billing?.monthlyRecurringRevenue)],
                ["ARR run-rate", formatCurrency(billing?.arrRunRate)],
                ["Trial to paid", `${billing?.trialToPaidConversion ?? 0}%`],
                ["Pilot to paid", `${billing?.pilotToPaidConversion ?? 0}%`],
                ["Past due / canceled", `${billing?.pastDueAccounts ?? 0} / ${billing?.canceledAccounts ?? 0}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <ChartCard title="Plan Distribution" description="Customer count by current plan.">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={billing?.planDistribution ?? []} dataKey="value" nameKey="name" outerRadius={95} label>
                  {(billing?.planDistribution ?? []).map((_: any, index: number) => (
                    <Cell key={index} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section id="compliance" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Compliance Summary</CardTitle>
              <CardDescription>Estimated inspection compliance and defect follow-up.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                ["Inspections due", compliance?.expectedInspections],
                ["Completed", compliance?.completedInspections],
                ["Missed", compliance?.missedInspections],
                ["Failed", compliance?.failedInspections],
                ["Defects reported", compliance?.defectsReported],
                ["Unresolved defects", compliance?.unresolvedDefects],
                ["Critical defects", compliance?.criticalDefects],
                ["Completion rate", `${compliance?.inspectionCompletionRate ?? 0}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <ChartCard title="Inspection Completion Rate" description="Estimated daily completion rate based on assigned active assets.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.trends ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="inspectionCompletionRate" stroke="#059669" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section id="diagnostics" className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>AI Diagnostics Summary</CardTitle>
              <CardDescription>Usage and quality signals for structured diagnostic triage.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {[
                ["Sessions started", diagnostics?.sessionsStarted],
                ["Sessions completed", diagnostics?.sessionsCompleted],
                ["Avg confidence", `${diagnostics?.averageConfidenceScore ?? 0}%`],
                ["Low confidence", diagnostics?.lowConfidenceDiagnostics],
                ["Unresolved cases", diagnostics?.unresolvedCases],
                ["Resolved cases", diagnostics?.resolvedCases],
                ["Mechanic confirmed", diagnostics?.mechanicConfirmedOutcomes],
                ["AI match rate", `${diagnostics?.aiToConfirmedCauseMatchRate ?? 0}%`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <ChartCard title="Diagnostic Confidence Trend" description="Average diagnostic confidence by day where available.">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.trends ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="averageDiagnosticConfidence" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <FleetTable
          title="At-Risk Fleets"
          description="Prioritized by inactivity, billing, compliance, diagnostic follow-up, and onboarding signals."
          rows={tables?.atRiskFleets ?? []}
          empty="No at-risk fleets found for this filter."
        />
        <div className="grid gap-6 xl:grid-cols-2">
          <FleetTable
            title="Top Active Fleets"
            description="Fleets with the most users, inspections, and diagnostic activity."
            rows={tables?.topActiveFleets ?? []}
            empty="No fleet activity found for this date range."
          />
          <FleetTable
            title="Inactive Fleets"
            description="Fleets with no recent meaningful operational activity."
            rows={tables?.inactiveFleets ?? []}
            empty="No inactive fleets found."
          />
        </div>

        <Card id="investor" className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Investor Snapshot</CardTitle>
            <CardDescription>Aggregated production-only KPIs. Demo, internal test, archived accounts, notes, and driver personal data are excluded.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total fleets created", investor?.totalFleetsCreated],
              ["Active fleets - 30d", investor?.activeFleetsLast30Days],
              ["Active users - 30d", investor?.activeUsersLast30Days],
              ["Powered vehicles", investor?.poweredVehiclesUnderManagement],
              ["Trailers", investor?.trailersUnderManagement],
              ["Inspections completed", investor?.inspectionsCompleted],
              ["AI diagnostics completed", investor?.aiDiagnosticsCompleted],
              ["Paid customers", investor?.paidCustomers],
              ["MRR", formatCurrency(investor?.monthlyRecurringRevenue)],
              ["30-day growth", `${investor?.growth30DayRate ?? 0}%`],
              ["90-day growth", `${investor?.growth90DayRate ?? 0}%`],
              ["Trial/Pilot conversion", `${investor?.trialToPaidConversion ?? 0}% / ${investor?.pilotToPaidConversion ?? 0}%`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <FleetTable
          title="Fleet List"
          description="Fleet-level metrics only. User-level details are limited to authorized drill-down pages."
          rows={tables?.fleetRows ?? []}
          empty="No fleets match these filters."
        />
      </div>
    </AdminLayout>
  );
}
