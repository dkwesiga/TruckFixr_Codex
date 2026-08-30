import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EarlyWarningList, type EarlyWarning } from "@/components/EarlyWarnings";
import { formatDistanceKm } from "@/lib/vehicleDisplay";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle, Loader2, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function severityBadge(severity: string | null | undefined) {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
    case "moderate":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function TruckDetailContent() {
  const [activeTab, setActiveTab] = useState("overview");
  const [, navigate] = useLocation();
  const vehicleId = useMemo(() => {
    const match = window.location.pathname.match(/\/truck\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }, []);

  const overviewQuery = trpc.defects.getVehicleOverview.useQuery(
    { vehicleId },
    { enabled: Boolean(vehicleId) }
  );

  const data = overviewQuery.data;
  const vehicle = data?.vehicle;
  const openIssues = data?.openIssues ?? [];
  const allIssues = data?.allIssues ?? [];
  const activeWarnings = (data?.activeWarnings ?? []) as EarlyWarning[];
  const latestTriage = data?.latestTriage ?? null;
  const repairHistory = data?.repairHistory ?? [];
  const recurringIssues = activeWarnings.filter(
    (warning) => warning.warningType === "repeat_symptom" || warning.warningType === "recurring_after_repair"
  );

  const utils = trpc.useUtils();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSymptoms, setReportSymptoms] = useState("");

  const createDefect = trpc.defects.create.useMutation({
    onSuccess: () => {
      toast.success("Issue reported.");
      setReportOpen(false);
      setReportTitle("");
      setReportDescription("");
      setReportSymptoms("");
      void utils.defects.getVehicleOverview.invalidate({ vehicleId });
    },
    onError: (error) => toast.error(error.message),
  });

  function submitReport() {
    if (!vehicle || !reportTitle.trim()) return;
    createDefect.mutate({
      fleetId: vehicle.fleetId,
      vehicleId,
      title: reportTitle.trim(),
      description: reportDescription.trim() || undefined,
      symptoms: reportSymptoms
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  if (vehicleId && !data && !overviewQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading vehicle…
      </div>
    );
  }
  if (overviewQuery.isError || !vehicle) {
    const message = !vehicleId
      ? "No vehicle specified."
      : overviewQuery.isError
        ? overviewQuery.error.message || "Something went wrong loading this vehicle."
        : "Vehicle not found.";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-slate-600">
        <p>{message}</p>
        <Button variant="outline" onClick={() => navigate("/manager")}>
          Back to Fleet
        </Button>
      </div>
    );
  }

  const title = vehicle.unitNumber || vehicle.licensePlate || vehicle.vin;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-start justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="mt-1 text-slate-600">
              {[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || vehicle.vin}
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/manager")}>
            Back to Fleet
          </Button>
        </div>
      </header>

      {/* Quick stats */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-4 lg:px-8">
          <div>
            <p className="mb-1 text-sm text-slate-600">License Plate</p>
            <p className="font-semibold text-slate-900">{vehicle.licensePlate || "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-600">Active warnings</p>
            <p className="font-semibold text-slate-900">{activeWarnings.length}</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-600">Open issues</p>
            <p className="font-semibold text-slate-900">{openIssues.length}</p>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-600">Distance</p>
            <p className="font-semibold text-slate-900">{formatDistanceKm(vehicle.mileage ?? 0)}</p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="warnings">Early warnings</TabsTrigger>
            <TabsTrigger value="repairs">Repair history</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Vehicle information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm text-slate-600">VIN</p>
                  <p className="font-medium text-slate-900">{vehicle.vin}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-slate-600">Engine hours</p>
                  <p className="font-medium text-slate-900">
                    {(vehicle.engineHours ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-slate-600">Engine make</p>
                  <p className="font-medium text-slate-900">{vehicle.engineMake || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-sm text-slate-600">Operational state</p>
                  <p className="font-medium capitalize text-slate-900">
                    {(vehicle.operationalState ?? "active").replace(/_/g, " ")}
                  </p>
                </div>
              </CardContent>
            </Card>

            {latestTriage ? (
              <Card className="border-2 border-blue-200 bg-blue-50/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-blue-600" />
                    Latest AI triage
                  </CardTitle>
                  <CardDescription>Most recent triage for this vehicle.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold capitalize text-slate-900">{latestTriage.severity}</span>
                    {" · "}
                    {(latestTriage.recommendedAction ?? "").replace(/_/g, " ")} · {latestTriage.confidenceScore}%
                    confidence
                  </p>
                  {latestTriage.managerSummary ? <p>{latestTriage.managerSummary}</p> : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Active early warnings
                </CardTitle>
                <CardDescription>Rule-based signals needing attention.</CardDescription>
              </CardHeader>
              <CardContent>
                <EarlyWarningList
                  warnings={activeWarnings}
                  onSelect={(warning) =>
                    warning.defectId ? navigate(`/defect/${warning.defectId}`) : undefined
                  }
                />
              </CardContent>
            </Card>

            {recurringIssues.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Recurring / repeated issues</CardTitle>
                  <CardDescription>Patterns worth watching before they recur.</CardDescription>
                </CardHeader>
                <CardContent>
                  <EarlyWarningList warnings={recurringIssues} />
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* Issues */}
          <TabsContent value="issues" className="mt-6 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Issues</CardTitle>
                  <CardDescription>All reported issues for this vehicle.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setReportOpen(true)}>
                  Report issue
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {allIssues.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No issues reported.
                  </div>
                ) : (
                  allIssues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => navigate(`/defect/${issue.id}`)}
                      className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{issue.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(issue.createdAt).toLocaleDateString()} ·{" "}
                            {(issue.status ?? "open").replace(/_/g, " ")}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${severityBadge(
                            issue.severity
                          )}`}
                        >
                          {issue.severity ?? "medium"}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Early warnings */}
          <TabsContent value="warnings" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Active early warnings</CardTitle>
                <CardDescription>Deterministic rule-based signals.</CardDescription>
              </CardHeader>
              <CardContent>
                <EarlyWarningList
                  warnings={activeWarnings}
                  onSelect={(warning) =>
                    warning.defectId ? navigate(`/defect/${warning.defectId}`) : undefined
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Repair history */}
          <TabsContent value="repairs" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Repair history</CardTitle>
                <CardDescription>Confirmed repair outcomes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {repairHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No repair outcomes recorded.
                  </div>
                ) : (
                  repairHistory.map((repair) => (
                    <div key={repair.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900">{repair.confirmedFault}</p>
                        <span className="flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle className="h-3.5 w-3.5" /> {repair.aiDiagnosisCorrect}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{repair.repairPerformed}</p>
                      {asStringArray(repair.partsReplaced).length > 0 ? (
                        <p className="mt-2 text-xs text-slate-600">
                          Parts: {asStringArray(repair.partsReplaced).join(", ")}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                        {new Date(repair.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report issue</DialogTitle>
            <DialogDescription>
              Capture a problem on this vehicle for triage before repair and reporting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-title">What's wrong</Label>
              <Input
                id="report-title"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="e.g. Check engine light + derate on the highway"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-description">Details (optional)</Label>
              <Textarea
                id="report-description"
                rows={3}
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-symptoms">Symptoms (one per line, optional)</Label>
              <Textarea
                id="report-symptoms"
                rows={3}
                value={reportSymptoms}
                onChange={(e) => setReportSymptoms(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={createDefect.isPending || !reportTitle.trim()}
              onClick={submitReport}
            >
              {createDefect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TruckDetail() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <TruckDetailContent />
    </RoleBasedRoute>
  );
}
