import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Textarea } from "@/components/ui/textarea";
import { EarlyWarningList, type EarlyWarning } from "@/components/EarlyWarnings";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Sparkles,
  ShieldAlert,
  Ban,
  XCircle,
  Wrench,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type DecisionValue =
  | "monitor"
  | "schedule_repair"
  | "pull_from_service"
  | "emergency_attention"
  | "dismiss_no_action";

const DECISIONS: {
  value: DecisionValue;
  label: string;
  icon: typeof CheckCircle;
  variant: "default" | "outline" | "destructive";
}[] = [
  { value: "monitor", label: "Monitor", icon: Clock, variant: "outline" },
  { value: "schedule_repair", label: "Schedule Repair", icon: Wrench, variant: "outline" },
  { value: "pull_from_service", label: "Pull From Service", icon: Ban, variant: "outline" },
  { value: "emergency_attention", label: "Mark as Emergency", icon: ShieldAlert, variant: "destructive" },
  { value: "dismiss_no_action", label: "Dismiss / No Action", icon: XCircle, variant: "outline" },
];

function statusBadgeClasses(status: string) {
  switch (status) {
    case "resolved":
      return "bg-emerald-100 text-emerald-800";
    case "repair_required":
      return "bg-red-100 text-red-800";
    case "assigned":
    case "monitoring":
      return "bg-amber-100 text-amber-800";
    case "dismissed":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
}

function DefectDetailContent() {
  const [, navigate] = useLocation();
  const defectId = useMemo(() => {
    const match = window.location.pathname.match(/\/defect\/(\d+)/);
    return match ? Number(match[1]) : 1;
  }, []);
  const defectQuery = trpc.defects.getById.useQuery({ defectId });
  const utils = trpc.useUtils();
  const [managerNote, setManagerNote] = useState("");
  const [repairForm, setRepairForm] = useState({
    confirmedFault: "",
    repairPerformed: "",
    partsReplaced: "",
    aiDiagnosisCorrect: "unknown" as "yes" | "partially" | "no" | "unknown",
    repairNotes: "",
  });
  const [estimateForm, setEstimateForm] = useState({
    repairActionRequested: "",
    estimatedParts: "",
    labourNotes: "",
    preferredShop: "",
    estimatedCost: "",
  });

  const invalidate = async () => {
    await utils.defects.getById.invalidate({ defectId });
  };

  const runTriageMutation = trpc.defects.runTriage.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("AI triage complete");
    },
    onError: (error) => toast.error(error.message || "Unable to run AI triage"),
  });
  const recordDecisionMutation = trpc.defects.recordDecision.useMutation({
    onSuccess: async (result) => {
      await invalidate();
      toast.success(`Decision recorded: ${result.decision.replace(/_/g, " ")}`);
    },
    onError: (error) => toast.error(error.message || "Unable to record decision"),
  });
  const recordRepairOutcomeMutation = trpc.inspections.recordRepairOutcome.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Repair outcome recorded");
    },
    onError: (error) => toast.error(error.message || "Unable to record repair outcome"),
  });
  const updateStatusMutation = trpc.defects.updateStatus.useMutation({
    onSuccess: async () => {
      await invalidate();
      toast.success("Repair request saved");
    },
    onError: (error) => toast.error(error.message || "Unable to save repair request"),
  });

  const data = defectQuery.data;
  const defect = data?.defect;
  const triage = data?.latestTriage ?? null;
  const decisions = data?.decisions ?? [];
  const repairHistory = data?.repairHistory ?? [];
  const earlyWarnings = (data?.earlyWarnings ?? []) as EarlyWarning[];

  const recordDecision = (decision: DecisionValue) => {
    void recordDecisionMutation.mutateAsync({
      defectId,
      decision,
      notes: managerNote.trim() || undefined,
    });
  };

  const submitRepairOutcome = async () => {
    if (!repairForm.confirmedFault.trim() || !repairForm.repairPerformed.trim()) {
      toast.error("Enter the confirmed fault and repair performed.");
      return;
    }
    await recordRepairOutcomeMutation.mutateAsync({
      defectId,
      confirmedFault: repairForm.confirmedFault.trim(),
      repairPerformed: repairForm.repairPerformed.trim(),
      partsReplaced: repairForm.partsReplaced
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
      aiDiagnosisCorrect: repairForm.aiDiagnosisCorrect,
      returnedToServiceAt: new Date().toISOString(),
      repairNotes: repairForm.repairNotes.trim() || undefined,
      resolveDefect: true,
    });
  };

  const submitEstimate = async () => {
    if (!estimateForm.repairActionRequested.trim()) {
      toast.error("Describe the repair action requested.");
      return;
    }
    const noteLines = [
      `Repair action requested: ${estimateForm.repairActionRequested.trim()}`,
      estimateForm.estimatedParts.trim() && `Estimated parts: ${estimateForm.estimatedParts.trim()}`,
      estimateForm.labourNotes.trim() && `Labour notes: ${estimateForm.labourNotes.trim()}`,
      estimateForm.preferredShop.trim() && `Preferred shop/mechanic: ${estimateForm.preferredShop.trim()}`,
      estimateForm.estimatedCost.trim() && `Estimated cost: ${estimateForm.estimatedCost.trim()}`,
    ].filter(Boolean);
    await updateStatusMutation.mutateAsync({
      defectId,
      notes: `Repair estimate / action request\n${noteLines.join("\n")}`,
    });
    setEstimateForm({
      repairActionRequested: "",
      estimatedParts: "",
      labourNotes: "",
      preferredShop: "",
      estimatedCost: "",
    });
  };

  if (defectQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading issue…
      </div>
    );
  }
  // Distinguish a genuine "not found" (deleted/reset defect) from a server-side
  // failure loading it — otherwise a backend error looks identical to a missing
  // record and hides the real problem.
  if (defectQuery.isError && defectQuery.error?.data?.code !== "NOT_FOUND") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center text-slate-600">
        <div className="max-w-md space-y-2">
          <p className="text-lg font-semibold text-slate-900">We couldn&apos;t load this issue</p>
          <p className="text-sm">
            Something went wrong fetching it. This is a temporary problem on our side, not a
            missing issue — please try again.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void defectQuery.refetch()}>Try again</Button>
          <Button variant="outline" onClick={() => navigate("/manager")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }
  if (!defect) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center text-slate-600">
        <div className="max-w-md space-y-2">
          <p className="text-lg font-semibold text-slate-900">This issue is no longer available</p>
          <p className="text-sm">
            It may have been resolved, removed, or reset (for example, when demo data is
            refreshed). The link you followed points to an issue that no longer exists.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/manager")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const symptoms = asStringArray(defect.symptoms);
  const faultCodes = asStringArray(defect.faultCodes);
  const nextSteps = triage ? asStringArray(triage.suggestedNextSteps) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Issue detail
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{defect.title}</h1>
            <p className="mt-1 text-sm text-slate-600">
              Vehicle {defect.vehicleId} · Reported {new Date(defect.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/truck/${defect.vehicleId}`)}>
              View vehicle
            </Button>
            <Button variant="outline" onClick={() => navigate("/manager")}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Issue summary */}
            <Card>
              <CardHeader>
                <CardTitle>Issue summary</CardTitle>
                <CardDescription>Source, reporter, and reported details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-1 text-sm text-slate-600">Description</p>
                  <p className="text-slate-900">{defect.description || "No description provided"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Source</p>
                    <p className="font-medium capitalize text-slate-900">
                      {(defect.sourceType ?? "manual_report").replace(/_/g, " ")}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Reported by</p>
                    <p className="font-medium text-slate-900">Driver {defect.driverId}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Severity</p>
                    <p className="font-medium capitalize text-slate-900">{defect.severity ?? "medium"}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Status</p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClasses(
                        defect.status ?? "open"
                      )}`}
                    >
                      {(defect.status ?? "open").replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
                {(symptoms.length > 0 || faultCodes.length > 0 || defect.safetyRelated) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {defect.safetyRelated ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                        <ShieldAlert className="h-3.5 w-3.5" /> Safety-related
                      </span>
                    ) : null}
                    {symptoms.map((symptom) => (
                      <span
                        key={symptom}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                      >
                        {symptom}
                      </span>
                    ))}
                    {faultCodes.map((code) => (
                      <span
                        key={code}
                        className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI triage */}
            <Card className={triage ? "border-2 border-blue-200 bg-blue-50/60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-blue-600" />
                      AI triage
                    </CardTitle>
                    <CardDescription>
                      Manager-triggered, decision-support only.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => runTriageMutation.mutate({ defectId })}
                    disabled={runTriageMutation.isPending}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {runTriageMutation.isPending
                      ? "Running…"
                      : triage
                        ? "Re-run AI triage"
                        : "Run AI triage"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!triage ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
                    No AI triage yet. Review the issue, then run AI triage for a
                    severity, recommended action, and likely causes.
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div className="rounded-lg border border-blue-200 bg-blue-100/70 p-3">
                        <p className="text-xs font-semibold uppercase text-blue-700">Severity</p>
                        <p className="text-lg font-bold capitalize text-blue-900">{triage.severity}</p>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-100/70 p-3">
                        <p className="text-xs font-semibold uppercase text-blue-700">Action</p>
                        <p className="text-lg font-bold text-blue-900">
                          {(triage.recommendedAction ?? "").replace(/_/g, " ")}
                        </p>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-100/70 p-3">
                        <p className="text-xs font-semibold uppercase text-blue-700">Confidence</p>
                        <p className="text-lg font-bold text-blue-900">{triage.confidenceScore}%</p>
                      </div>
                    </div>
                    {triage.mostLikelyCause ? (
                      <div>
                        <p className="mb-1 text-sm font-semibold text-slate-900">Likely cause</p>
                        <p className="text-slate-700">{triage.mostLikelyCause}</p>
                      </div>
                    ) : null}
                    {triage.managerSummary ? (
                      <div>
                        <p className="mb-1 text-sm font-semibold text-slate-900">Manager summary</p>
                        <p className="text-slate-700">{triage.managerSummary}</p>
                      </div>
                    ) : null}
                    {nextSteps.length > 0 ? (
                      <div>
                        <p className="mb-2 text-sm font-semibold text-slate-900">Recommended next steps</p>
                        <ol className="space-y-1.5">
                          {nextSteps.map((step, idx) => (
                            <li key={idx} className="flex gap-2 text-sm text-slate-700">
                              <span className="font-semibold text-slate-900">{idx + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {triage.safetyWarning ? (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{triage.safetyWarning}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Active early warnings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Active early warnings
                </CardTitle>
                <CardDescription>Rule-based signals for this vehicle.</CardDescription>
              </CardHeader>
              <CardContent>
                <EarlyWarningList warnings={earlyWarnings} />
              </CardContent>
            </Card>

            {/* Repair history */}
            <Card>
              <CardHeader>
                <CardTitle>Repair history</CardTitle>
                <CardDescription>Confirmed repair outcomes for this issue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {repairHistory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No repair outcomes recorded yet.
                  </div>
                ) : (
                  repairHistory.map((repair) => (
                    <div key={repair.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <p className="font-semibold text-slate-900">{repair.confirmedFault}</p>
                      <p className="mt-1 text-sm text-slate-700">{repair.repairPerformed}</p>
                      {asStringArray(repair.partsReplaced).length > 0 ? (
                        <p className="mt-2 text-xs text-slate-600">
                          Parts: {asStringArray(repair.partsReplaced).join(", ")}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                        {new Date(repair.createdAt).toLocaleDateString()} · AI diagnosis{" "}
                        {repair.aiDiagnosisCorrect}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Decision history */}
            <Card>
              <CardHeader>
                <CardTitle>Decision history</CardTitle>
                <CardDescription>Manager actions on this issue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {decisions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No manager decisions recorded yet.
                  </div>
                ) : (
                  decisions.map((decision) => (
                    <div key={decision.id} className="flex gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium capitalize text-slate-900">
                          {decision.actionType}
                        </p>
                        {decision.notes ? (
                          <p className="whitespace-pre-line text-sm text-slate-700">{decision.notes}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(decision.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: decisions + repair */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Manager decision</CardTitle>
                <CardDescription>Choose the next action for this issue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="managerNote">Decision note (optional)</Label>
                  <Textarea
                    id="managerNote"
                    value={managerNote}
                    onChange={(event) => setManagerNote(event.target.value)}
                    placeholder="Note for the driver or mechanic"
                  />
                </div>
                {DECISIONS.map((decision) => {
                  const Icon = decision.icon;
                  return (
                    <Button
                      key={decision.value}
                      className="w-full justify-start"
                      variant={decision.variant}
                      disabled={recordDecisionMutation.isPending}
                      onClick={() => recordDecision(decision.value)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {decision.label}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Repair estimate / action request placeholder */}
            <Card>
              <CardHeader>
                <CardTitle>Repair estimate / action request</CardTitle>
                <CardDescription>
                  Lightweight request — not parts ordering. Saved to decision history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="repairAction">Repair action requested</Label>
                  <Input
                    id="repairAction"
                    value={estimateForm.repairActionRequested}
                    onChange={(event) =>
                      setEstimateForm((current) => ({ ...current, repairActionRequested: event.target.value }))
                    }
                    placeholder="Replace front brake pads"
                  />
                </div>
                <div>
                  <Label htmlFor="estimatedParts">Estimated parts needed</Label>
                  <Input
                    id="estimatedParts"
                    value={estimateForm.estimatedParts}
                    onChange={(event) =>
                      setEstimateForm((current) => ({ ...current, estimatedParts: event.target.value }))
                    }
                    placeholder="brake pads, rotors"
                  />
                </div>
                <div>
                  <Label htmlFor="labourNotes">Estimated labour notes</Label>
                  <Textarea
                    id="labourNotes"
                    value={estimateForm.labourNotes}
                    onChange={(event) =>
                      setEstimateForm((current) => ({ ...current, labourNotes: event.target.value }))
                    }
                    placeholder="~3 hours, hoist required"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="preferredShop">Preferred shop / mechanic</Label>
                    <Input
                      id="preferredShop"
                      value={estimateForm.preferredShop}
                      onChange={(event) =>
                        setEstimateForm((current) => ({ ...current, preferredShop: event.target.value }))
                      }
                      placeholder="Main St. Diesel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="estimatedCost">Estimated cost</Label>
                    <Input
                      id="estimatedCost"
                      value={estimateForm.estimatedCost}
                      onChange={(event) =>
                        setEstimateForm((current) => ({ ...current, estimatedCost: event.target.value }))
                      }
                      placeholder="$650"
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={submitEstimate}
                >
                  Save repair request
                </Button>
              </CardContent>
            </Card>

            {/* Repair outcome */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-slate-700" />
                  Record repair outcome
                </CardTitle>
                <CardDescription>Resolves the issue and feeds future AI context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="confirmedFault">Confirmed fault</Label>
                  <Input
                    id="confirmedFault"
                    value={repairForm.confirmedFault}
                    onChange={(event) =>
                      setRepairForm((current) => ({ ...current, confirmedFault: event.target.value }))
                    }
                    placeholder="Leaking oil cooler"
                  />
                </div>
                <div>
                  <Label htmlFor="repairPerformed">Repair performed</Label>
                  <Textarea
                    id="repairPerformed"
                    value={repairForm.repairPerformed}
                    onChange={(event) =>
                      setRepairForm((current) => ({ ...current, repairPerformed: event.target.value }))
                    }
                    placeholder="Replaced oil cooler and pressure-tested"
                  />
                </div>
                <div>
                  <Label htmlFor="partsReplaced">Parts replaced</Label>
                  <Input
                    id="partsReplaced"
                    value={repairForm.partsReplaced}
                    onChange={(event) =>
                      setRepairForm((current) => ({ ...current, partsReplaced: event.target.value }))
                    }
                    placeholder="oil cooler, coolant, oil filter"
                  />
                </div>
                <div>
                  <Label htmlFor="aiAccuracy">Was AI diagnosis correct?</Label>
                  <select
                    id="aiAccuracy"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={repairForm.aiDiagnosisCorrect}
                    onChange={(event) =>
                      setRepairForm((current) => ({
                        ...current,
                        aiDiagnosisCorrect: event.target.value as typeof repairForm.aiDiagnosisCorrect,
                      }))
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="partially">Partially</option>
                    <option value="no">No</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <Textarea
                  value={repairForm.repairNotes}
                  onChange={(event) =>
                    setRepairForm((current) => ({ ...current, repairNotes: event.target.value }))
                  }
                  placeholder="Repair notes"
                />
                <Button
                  className="w-full"
                  disabled={recordRepairOutcomeMutation.isPending}
                  onClick={submitRepairOutcome}
                >
                  {recordRepairOutcomeMutation.isPending ? "Saving…" : "Record repair outcome"}
                </Button>
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                AI triage is decision-support only and does not replace a qualified
                mechanic's inspection.
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DefectDetail() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <DefectDetailContent />
    </RoleBasedRoute>
  );
}
