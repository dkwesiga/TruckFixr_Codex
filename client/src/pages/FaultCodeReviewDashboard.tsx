import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";

type ReviewStatus = "needs_review" | "approved" | "rejected" | "archived";
type RiskLevel = "low" | "medium" | "high" | "critical";

type ReferenceFormState = {
  sourceId: string;
  codeSystem: string;
  code: string;
  normalizedCode: string;
  category: string;
  title: string;
  summary: string;
  recommendedChecksText: string;
  riskLevel: RiskLevel;
  metadataText: string;
};

const emptyForm: ReferenceFormState = {
  sourceId: "",
  codeSystem: "SPN_FMI",
  code: "",
  normalizedCode: "",
  category: "aftertreatment/emissions",
  title: "",
  summary: "",
  recommendedChecksText: "",
  riskLevel: "medium",
  metadataText: "",
};

const statusLabels: Record<ReviewStatus, string> = {
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  archived: "Archived",
};

const statusStyles: Record<ReviewStatus, string> = {
  needs_review: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  archived: "border-slate-200 bg-slate-100 text-slate-700",
};

const riskStyles: Record<RiskLevel, string> = {
  low: "bg-emerald-50 text-emerald-700",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-800",
  critical: "bg-red-50 text-red-800",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function parseMetadata(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function StatTile(props: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone: string;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{props.label}</p>
        <span className={`flex size-9 items-center justify-center rounded-lg ${props.tone}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{props.value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status as ReviewStatus;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
        statusStyles[normalized] ?? statusStyles.needs_review
      }`}
    >
      {statusLabels[normalized] ?? status}
    </span>
  );
}

function RiskPill({ risk }: { risk: string }) {
  const normalized = risk as RiskLevel;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${riskStyles[normalized] ?? riskStyles.medium}`}>
      {risk}
    </span>
  );
}

export default function FaultCodeReviewDashboard() {
  const { isAuthenticated, user } = useAuthContext();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReviewStatus | "all">("needs_review");
  const [category, setCategory] = useState("all");
  const [riskLevel, setRiskLevel] = useState<RiskLevel | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<ReferenceFormState>(emptyForm);
  const [reviewNotes, setReviewNotes] = useState("");
  const [sourceForm, setSourceForm] = useState({
    title: "",
    sourceType: "public_oem_bulletin",
    urlOrPath: "",
    metadataText: "",
  });

  const canLoadDashboard =
    isAuthenticated && (user?.role === "owner" || user?.role === "manager");

  const dashboardQuery = trpc.faultCodeReferences.dashboard.useQuery({
    search,
    status,
    category,
    riskLevel,
    limit: 150,
  }, {
    enabled: canLoadDashboard,
  });
  const detailQuery = trpc.faultCodeReferences.detail.useQuery(
    { id: selectedId ?? 0 },
    { enabled: canLoadDashboard && Boolean(selectedId) && !isCreating }
  );

  const upsertReference = trpc.faultCodeReferences.upsertReference.useMutation({
    onSuccess: async (reference) => {
      toast.success("Fault-code reference saved");
      setIsCreating(false);
      setSelectedId(reference.id);
      await utils.faultCodeReferences.dashboard.invalidate();
      await utils.faultCodeReferences.detail.invalidate({ id: reference.id });
    },
    onError: (error) => toast.error(error.message),
  });

  const transitionStatus = trpc.faultCodeReferences.transitionReviewStatus.useMutation({
    onSuccess: async (reference) => {
      toast.success(`Reference marked ${statusLabels[reference.reviewStatus as ReviewStatus] ?? reference.reviewStatus}`);
      setReviewNotes("");
      await utils.faultCodeReferences.dashboard.invalidate();
      await utils.faultCodeReferences.detail.invalidate({ id: reference.id });
    },
    onError: (error) => toast.error(error.message),
  });

  const createSource = trpc.faultCodeReferences.createSource.useMutation({
    onSuccess: async () => {
      toast.success("Source added");
      setSourceForm({
        title: "",
        sourceType: "public_oem_bulletin",
        urlOrPath: "",
        metadataText: "",
      });
      await utils.faultCodeReferences.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const references = dashboardQuery.data?.references ?? [];
  const categories = dashboardQuery.data?.categories ?? [];
  const sources = dashboardQuery.data?.sources ?? [];
  const detail = detailQuery.data?.reference;
  const approvals = detailQuery.data?.approvals ?? [];

  useEffect(() => {
    if (selectedId || isCreating || references.length === 0) return;
    setSelectedId(references[0].id);
  }, [isCreating, references, selectedId]);

  useEffect(() => {
    if (!detail || isCreating) return;
    setForm({
      sourceId: detail.sourceId ? String(detail.sourceId) : "",
      codeSystem: detail.codeSystem,
      code: detail.code,
      normalizedCode: detail.normalizedCode,
      category: detail.category,
      title: detail.title,
      summary: detail.summary,
      recommendedChecksText: detail.recommendedChecks.join("\n"),
      riskLevel: (detail.riskLevel as RiskLevel) || "medium",
      metadataText: detail.metadata ? JSON.stringify(detail.metadata, null, 2) : "",
    });
  }, [detail, isCreating]);

  const selectedReference = useMemo(
    () => references.find((reference) => reference.id === selectedId) ?? null,
    [references, selectedId]
  );

  function startCreateReference() {
    setSelectedId(null);
    setIsCreating(true);
    setForm(emptyForm);
    setReviewNotes("");
  }

  function saveReference() {
    let metadata: Record<string, unknown> | null = null;
    try {
      metadata = parseMetadata(form.metadataText);
    } catch {
      toast.error("Metadata must be valid JSON");
      return;
    }

    upsertReference.mutate({
      id: isCreating ? undefined : selectedId ?? undefined,
      sourceId: form.sourceId ? Number(form.sourceId) : null,
      codeSystem: form.codeSystem,
      code: form.code,
      normalizedCode: form.normalizedCode || normalizeCode(form.code),
      category: form.category,
      title: form.title,
      summary: form.summary,
      recommendedChecks: form.recommendedChecksText
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
      riskLevel: form.riskLevel,
      metadata,
    });
  }

  function createNewSource() {
    let metadata: Record<string, unknown> | null = null;
    try {
      metadata = parseMetadata(sourceForm.metadataText);
    } catch {
      toast.error("Source metadata must be valid JSON");
      return;
    }

    createSource.mutate({
      title: sourceForm.title,
      sourceType: sourceForm.sourceType,
      urlOrPath: sourceForm.urlOrPath || null,
      metadata,
    });
  }

  function transition(nextStatus: ReviewStatus) {
    if (!selectedId) return;
    transitionStatus.mutate({
      id: selectedId,
      nextStatus,
      notes: reviewNotes,
    });
  }

  const stats = dashboardQuery.data?.stats;
  const activeDetailStatus = (detail?.reviewStatus ?? selectedReference?.reviewStatus ?? "needs_review") as ReviewStatus;
  const dashboardBlocked = Boolean(dashboardQuery.error) && !dashboardQuery.data;
  const statFallback = dashboardBlocked ? "—" : 0;

  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Database className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Fault-Code Review</p>
                <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">
                  Technical reference database
                </h1>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              TruckFixr staff can review imported or internally confirmed heavy-duty fault-code references before
              they can influence customer-facing AI diagnosis. Only approved records are used for fleet users.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button onClick={startCreateReference}>
              <Plus className="mr-2 size-4" />
              New reference
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile icon={FileText} label="Total references" value={stats?.total ?? statFallback} tone="bg-slate-100 text-slate-700" />
          <StatTile icon={AlertTriangle} label="Needs review" value={stats?.needsReview ?? statFallback} tone="bg-amber-100 text-amber-800" />
          <StatTile icon={ShieldCheck} label="Approved" value={stats?.approved ?? statFallback} tone="bg-emerald-100 text-emerald-800" />
          <StatTile icon={XCircle} label="Rejected" value={stats?.byStatus?.rejected ?? statFallback} tone="bg-red-100 text-red-800" />
          <StatTile icon={Archive} label="Archived" value={stats?.byStatus?.archived ?? statFallback} tone="bg-slate-200 text-slate-800" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Review Queue</CardTitle>
                <CardDescription>
                  Filter by status, system category, risk, or code. Fleet users never receive needs-review records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px_150px]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search code, title, summary, category"
                      className="pl-9"
                    />
                  </label>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as ReviewStatus | "all")}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
                  >
                    <option value="needs_review">Needs review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="archived">Archived</option>
                    <option value="all">All statuses</option>
                  </select>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
                  >
                    <option value="all">All categories</option>
                    {categories.map((item) => (
                      <option key={item.category} value={item.category}>
                        {item.category} ({item.count})
                      </option>
                    ))}
                  </select>
                  <select
                    value={riskLevel}
                    onChange={(event) => setRiskLevel(event.target.value as RiskLevel | "all")}
                    className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
                  >
                    <option value="all">All risk</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="hidden grid-cols-[130px_minmax(220px,1fr)_150px_120px_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 lg:grid">
                    <span>Code</span>
                    <span>Reference</span>
                    <span>Category</span>
                    <span>Risk</span>
                    <span>Status</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {references.map((reference) => {
                      const selected = reference.id === selectedId && !isCreating;
                      return (
                        <button
                          key={reference.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(reference.id);
                            setIsCreating(false);
                          }}
                          className={`grid w-full gap-3 px-4 py-4 text-left transition hover:bg-blue-50/60 lg:grid-cols-[130px_minmax(220px,1fr)_150px_120px_120px] ${
                            selected ? "bg-blue-50" : "bg-white"
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-slate-950">{reference.code}</p>
                            <p className="mt-1 text-xs text-slate-500">{reference.codeSystem}</p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{reference.title}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{reference.summary}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              Source: {reference.sourceTitle || "No source linked"}
                            </p>
                          </div>
                          <p className="text-sm text-slate-700">{reference.category}</p>
                          <div>
                            <RiskPill risk={reference.riskLevel} />
                          </div>
                          <div>
                            <StatusPill status={reference.reviewStatus} />
                          </div>
                        </button>
                      );
                    })}
                    {dashboardBlocked ? (
                      <div className="bg-white px-4 py-10 text-center text-sm text-slate-500">
                        Sign in with a TruckFixr staff administrator account to load the review queue.
                      </div>
                    ) : references.length === 0 ? (
                      <div className="bg-white px-4 py-10 text-center text-sm text-slate-500">
                        No fault-code references match the current filters.
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{isCreating ? "Create Reference" : "Reference Inspector"}</CardTitle>
                    <CardDescription>
                      Edit the reviewed technical record and manage approval state.
                    </CardDescription>
                  </div>
                  {!isCreating ? <StatusPill status={activeDetailStatus} /> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isCreating && !detail && detailQuery.isLoading ? (
                  <p className="text-sm text-slate-500">Loading reference...</p>
                ) : null}

                {isCreating || detail ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Code system</span>
                        <Input
                          value={form.codeSystem}
                          onChange={(event) => setForm((current) => ({ ...current, codeSystem: event.target.value }))}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Risk</span>
                        <select
                          value={form.riskLevel}
                          onChange={(event) => setForm((current) => ({ ...current, riskLevel: event.target.value as RiskLevel }))}
                          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Code</span>
                        <Input
                          value={form.code}
                          onChange={(event) => {
                            const code = event.target.value;
                            setForm((current) => ({
                              ...current,
                              code,
                              normalizedCode: current.normalizedCode || normalizeCode(code),
                            }));
                          }}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Normalized</span>
                        <Input
                          value={form.normalizedCode}
                          onChange={(event) => setForm((current) => ({ ...current, normalizedCode: event.target.value }))}
                        />
                      </label>
                    </div>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Category</span>
                      <Input
                        value={form.category}
                        onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                        placeholder="aftertreatment/emissions"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Title</span>
                      <Input
                        value={form.title}
                        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Summary</span>
                      <Textarea
                        value={form.summary}
                        onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                        className="min-h-24"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Recommended checks</span>
                      <Textarea
                        value={form.recommendedChecksText}
                        onChange={(event) => setForm((current) => ({ ...current, recommendedChecksText: event.target.value }))}
                        placeholder="One check per line"
                        className="min-h-28"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Source</span>
                      <select
                        value={form.sourceId}
                        onChange={(event) => setForm((current) => ({ ...current, sourceId: event.target.value }))}
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-sm"
                      >
                        <option value="">No source linked</option>
                        {sources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.title} ({source.sourceType})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Metadata JSON</span>
                      <Textarea
                        value={form.metadataText}
                        onChange={(event) => setForm((current) => ({ ...current, metadataText: event.target.value }))}
                        placeholder='{"symptomKeywords":["derate"],"sourceNotes":"..."}'
                        className="min-h-24 font-mono text-xs"
                      />
                    </label>
                    <Button onClick={saveReference} disabled={upsertReference.isPending} className="w-full">
                      <Save className="mr-2 size-4" />
                      {isCreating ? "Create for review" : "Save technical record"}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Select a reference to inspect or create a new one.</p>
                )}
              </CardContent>
            </Card>

            {!isCreating && detail ? (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Review Decision</CardTitle>
                  <CardDescription>
                    Approving makes this reference available to customer-facing diagnosis.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    placeholder="Reviewer notes, source verification, or reason for rejection"
                    className="min-h-24"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => transition("approved")}
                      disabled={transitionStatus.isPending}
                      className="bg-emerald-700 hover:bg-emerald-800"
                    >
                      <CheckCircle2 className="mr-2 size-4" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => transition("rejected")}
                      disabled={transitionStatus.isPending}
                    >
                      <XCircle className="mr-2 size-4" />
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => transition("needs_review")}
                      disabled={transitionStatus.isPending}
                    >
                      <AlertTriangle className="mr-2 size-4" />
                      Reopen
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => transition("archived")}
                      disabled={transitionStatus.isPending}
                    >
                      <Archive className="mr-2 size-4" />
                      Archive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Add Source</CardTitle>
                <CardDescription>
                  Public/imported sources start as needs-review metadata.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={sourceForm.title}
                  onChange={(event) => setSourceForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Source title"
                />
                <Input
                  value={sourceForm.sourceType}
                  onChange={(event) => setSourceForm((current) => ({ ...current, sourceType: event.target.value }))}
                  placeholder="public_oem_bulletin"
                />
                <Input
                  value={sourceForm.urlOrPath}
                  onChange={(event) => setSourceForm((current) => ({ ...current, urlOrPath: event.target.value }))}
                  placeholder="URL or internal case path"
                />
                <Textarea
                  value={sourceForm.metadataText}
                  onChange={(event) => setSourceForm((current) => ({ ...current, metadataText: event.target.value }))}
                  placeholder='{"publisher":"NHTSA","date":"2026-05-07"}'
                  className="min-h-20 font-mono text-xs"
                />
                <Button variant="outline" onClick={createNewSource} disabled={createSource.isPending} className="w-full">
                  <Plus className="mr-2 size-4" />
                  Add source
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Starter Seed Workflow</CardTitle>
                <CardDescription>
                  Load the local starter set, then approve only the records you validate for your fleets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
                  pnpm seed:fault-codes
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <p>1. Run the seed command with a configured `DATABASE_URL` to add the starter aftertreatment, air, oil, coolant, and derate records.</p>
                  <p>2. Sign in here as a TruckFixr staff administrator and keep the filter on <span className="font-medium text-slate-900">Needs review</span>.</p>
                  <p>3. Open each record, confirm the source link, refine the summary or checks if needed, add reviewer notes, and then approve or reject it.</p>
                  <p>Only approved records are used in customer-facing diagnosis. Seeded imports remain `needs_review` until you review them here.</p>
                </div>
              </CardContent>
            </Card>

            {!isCreating && detail ? (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Source and History</CardTitle>
                  <CardDescription>Reviewer audit trail for this record.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{detail.sourceTitle || "No source linked"}</p>
                        <p className="mt-1 text-xs text-slate-500">{detail.sourceType || "No source type"}</p>
                      </div>
                      {detail.sourceReviewStatus ? <StatusPill status={detail.sourceReviewStatus} /> : null}
                    </div>
                    {detail.sourceUrlOrPath ? (
                      <a
                        href={detail.sourceUrlOrPath}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-words text-xs font-medium text-blue-700 hover:text-blue-900"
                      >
                        {detail.sourceUrlOrPath}
                      </a>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    {approvals.map((approval) => (
                      <div key={approval.id} className="border-l-2 border-slate-200 pl-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {approval.previousStatus || "new"} to {approval.nextStatus}
                          </p>
                          <span className="text-xs text-slate-500">{formatDate(approval.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {approval.reviewerName || approval.reviewerEmail || `User ${approval.reviewerUserId}`}
                        </p>
                        {approval.notes ? <p className="mt-2 text-sm text-slate-700">{approval.notes}</p> : null}
                      </div>
                    ))}
                    {approvals.length === 0 ? (
                      <p className="text-sm text-slate-500">No review history yet.</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </aside>
        </section>

        {dashboardQuery.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {dashboardQuery.error.message}
          </div>
        ) : null}
      </div>
      </div>
    </RoleBasedRoute>
  );
}
