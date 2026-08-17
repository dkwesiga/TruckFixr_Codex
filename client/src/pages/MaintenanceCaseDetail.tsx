import { useMemo, useState } from "react";
import AppLogo from "@/components/AppLogo";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import RepairDocumentsSection from "@/components/RepairDocumentsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import {
  allowedTransitions,
  isCriticalAction,
  MAINTENANCE_ACTIONS,
  MAINTENANCE_SEVERITIES,
  SAFETY_DISCLAIMERS,
  type CaseStatus,
  type MaintenanceAction,
} from "@shared/maintenance/caseWorkflow";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  CONFIRMATION_EVIDENCE_TYPES,
  EVIDENCE_SOURCES,
  VERIFICATION_METHODS,
} from "@shared/tadis/outcomeLifecycle";

const OUTCOME_STATE_BADGE: Record<string, string> = {
  unknown: "bg-slate-100 text-slate-600 border-slate-200",
  reported: "bg-blue-50 text-blue-700 border-blue-200",
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  failed: "bg-red-50 text-red-700 border-red-200",
};

function caseIdFromPath(): number {
  const match = window.location.pathname.match(/\/app\/case\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  attention: "bg-amber-100 text-amber-800 border-amber-200",
  stable: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

function actionLabel(a: string): string {
  return a.replace(/_/g, " ");
}

function MaintenanceCaseDetailContent() {
  const caseId = useMemo(caseIdFromPath, []);
  useSeoMeta({ title: "Maintenance case | TruckFixr", description: "Case detail." });

  const utils = trpc.useUtils();
  const query = trpc.maintenanceCases.get.useQuery(
    { caseId },
    { enabled: caseId > 0, retry: false }
  );

  const invalidate = () => void utils.maintenanceCases.get.invalidate({ caseId });
  const onErr = (e: { message: string }) => toast.error(e.message);

  const transition = trpc.maintenanceCases.transition.useMutation({
    onSuccess: () => { toast.success("Status updated."); invalidate(); },
    onError: onErr,
  });
  const approve = trpc.maintenanceCases.approveDecision.useMutation({
    onSuccess: () => { toast.success("Decision approved."); invalidate(); },
    onError: onErr,
  });
  const override = trpc.maintenanceCases.criticalOverride.useMutation({
    onSuccess: () => { toast.success("Override recorded."); invalidate(); setOverrideReason(""); },
    onError: onErr,
  });
  const addDecision = trpc.maintenanceCases.addDecision.useMutation({
    onSuccess: () => { toast.success("Decision recorded."); invalidate(); },
    onError: onErr,
  });
  const startCycle = trpc.maintenanceCases.startCycle.useMutation({
    onSuccess: () => { toast.success("Repair cycle started."); invalidate(); },
    onError: onErr,
  });
  const markStage = trpc.maintenanceCases.markCycleStage.useMutation({
    onSuccess: () => { toast.success("Stage updated."); invalidate(); },
    onError: onErr,
  });
  const returnToService = trpc.maintenanceCases.returnToService.useMutation({
    onSuccess: (r) => { toast.success(`Returned to service${r?.downtimeHours != null ? ` (${r.downtimeHours}h downtime)` : ""}.`); invalidate(); },
    onError: onErr,
  });
  const completeCycle = trpc.maintenanceCases.completeCycle.useMutation({
    onSuccess: () => { toast.success("Cycle completed."); invalidate(); },
    onError: onErr,
  });
  const reopen = trpc.maintenanceCases.reopen.useMutation({
    onSuccess: () => { toast.success("Case reopened."); invalidate(); setReopenReason(""); },
    onError: onErr,
  });
  const assign = trpc.maintenanceCases.assign.useMutation({
    onSuccess: () => { toast.success("Assignment updated."); invalidate(); },
    onError: onErr,
  });
  const reportOutcome = trpc.maintenanceCases.reportOutcome.useMutation({
    onSuccess: () => { toast.success("Outcome reported."); invalidate(); setOutcomeForm({ confirmedFault: "", repairPerformed: "", evidenceSource: "shop_verified" }); },
    onError: onErr,
  });
  const verifyOutcome = trpc.maintenanceCases.verifyOutcome.useMutation({
    onSuccess: () => { toast.success("Outcome verified."); invalidate(); },
    onError: onErr,
  });
  const confirmOutcome = trpc.maintenanceCases.confirmOutcome.useMutation({
    onSuccess: () => { toast.success("Outcome confirmed."); invalidate(); },
    onError: onErr,
  });
  const markOutcomeFailed = trpc.maintenanceCases.markOutcomeFailed.useMutation({
    onSuccess: () => { toast.success("Outcome marked failed — kept as evidence for future diagnosis."); invalidate(); setFailureNotes(""); },
    onError: onErr,
  });

  const [nextStatus, setNextStatus] = useState<string>("");
  const [overrideAction, setOverrideAction] = useState<MaintenanceAction>("schedule_service");
  const [overrideReason, setOverrideReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [closure, setClosure] = useState<"resolved" | "partially_resolved" | "not_resolved">("resolved");
  const [manualSeverity, setManualSeverity] = useState("attention");
  const [manualAction, setManualAction] = useState<MaintenanceAction>("schedule_service");
  const [outcomeForm, setOutcomeForm] = useState({ confirmedFault: "", repairPerformed: "", evidenceSource: "shop_verified" });
  const [verificationMethod, setVerificationMethod] = useState<string>(VERIFICATION_METHODS[0]);
  const [confirmationEvidenceType, setConfirmationEvidenceType] = useState<string>(CONFIRMATION_EVIDENCE_TYPES[0]);
  const [failureNotes, setFailureNotes] = useState("");

  if (query.isLoading) {
    return <PageShell><Skeleton className="h-96 w-full" /></PageShell>;
  }
  const data = query.data;
  const c = data?.case;
  if (!c) {
    return (
      <PageShell>
        <Card><CardContent className="py-12 text-center text-sm text-slate-500">
          Case not found or not accessible.
        </CardContent></Card>
      </PageShell>
    );
  }

  const currentDecision = data.decisions.find((d) => d.isCurrent);
  const activeCycle = data.cycles.find((cy) => cy.active);
  const status = c.status as CaseStatus;
  const transitions = allowedTransitions(status);
  const isCritical = currentDecision?.severity === "critical";
  const needsApproval =
    currentDecision &&
    currentDecision.approvalRequirement === "manager_approval" &&
    currentDecision.approvalState === "pending";

  return (
    <PageShell>
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-['Manrope'] text-xl font-black text-slate-900">{c.reference}</h1>
            <Badge variant="outline" className="capitalize">{status.replace(/_/g, " ")}</Badge>
            {c.severity ? (
              <Badge variant="outline" className={SEVERITY_BADGE[c.severity] ?? ""}>{c.severity}</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Vehicle {c.vehicleId} · opened via {c.origin}
          </p>
        </div>
        <a href="/app/fleet-health"><Button variant="ghost" size="sm">Fleet Health</Button></a>
      </div>

      {c.summary ? <p className="mt-3 text-sm text-slate-700">{c.summary}</p> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Left: decision + status */}
        <div className="space-y-4 lg:col-span-2">
          {/* Current decision */}
          <Card>
            <CardHeader><CardTitle className="text-base">Current decision</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!currentDecision ? (
                <p className="text-sm text-slate-500">No decision recorded yet.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline" className={SEVERITY_BADGE[currentDecision.severity] ?? ""}>
                      {currentDecision.severity}
                    </Badge>
                    <span className="text-slate-600">
                      {actionLabel(currentDecision.finalAction ?? currentDecision.proposedAction ?? "")}
                    </span>
                    <Badge variant="outline">{currentDecision.approvalState}</Badge>
                    <span className="text-xs text-slate-400">v{currentDecision.version}</span>
                  </div>
                  {currentDecision.rationale ? (
                    <p className="text-sm text-slate-600">{currentDecision.rationale}</p>
                  ) : null}

                  {needsApproval ? (
                    <Button size="sm" disabled={approve.isPending}
                      onClick={() => approve.mutate({ caseId })}>
                      {approve.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      Approve decision
                    </Button>
                  ) : null}

                  {isCritical ? (
                    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="flex items-start gap-1.5 text-xs font-medium text-red-800">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        {SAFETY_DISCLAIMERS.critical}
                      </p>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Override action</Label>
                        <Select value={overrideAction} onValueChange={(v) => setOverrideAction(v as MaintenanceAction)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MAINTENANCE_ACTIONS.map((a) => (
                              <SelectItem key={a} value={a}>
                                {actionLabel(a)}{isCriticalAction(a) ? " (critical)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Textarea
                          placeholder="Reason for overriding this recommendation (required)"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                        />
                        <Button size="sm" variant="destructive" disabled={override.isPending || !overrideReason.trim()}
                          onClick={() => override.mutate({ caseId, finalAction: overrideAction, overrideReason })}>
                          Record critical override
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {/* Add a manual decision */}
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Record a decision</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={manualSeverity} onValueChange={setManualSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={manualAction} onValueChange={(v) => setManualAction(v as MaintenanceAction)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MAINTENANCE_ACTIONS.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="outline" disabled={addDecision.isPending}
                  onClick={() => addDecision.mutate({ caseId, severity: manualSeverity as never, proposedAction: manualAction })}>
                  Record decision
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Repair cycles */}
          <Card>
            <CardHeader><CardTitle className="text-base">Repair cycles</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.cycles.length === 0 ? (
                <p className="text-sm text-slate-500">No repair cycles yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.cycles.map((cy) => (
                    <li key={cy.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-slate-400" />
                        Cycle {cy.cycleNumber}
                        {cy.active ? <Badge variant="outline" className="bg-blue-50 text-blue-700">active</Badge> : null}
                        {cy.closureResult ? <span className="text-xs text-slate-500">{cy.closureResult.replace(/_/g, " ")}</span> : null}
                      </span>
                      {cy.downtimeHours != null ? (
                        <span className="text-xs text-slate-500">{cy.downtimeHours}h down</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {activeCycle ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={markStage.isPending}
                    onClick={() => markStage.mutate({ caseId, stage: "out_of_service" })}>Out of service</Button>
                  <Button size="sm" variant="outline" disabled={markStage.isPending}
                    onClick={() => markStage.mutate({ caseId, stage: "repair_started" })}>Repair started</Button>
                  <Button size="sm" variant="outline" disabled={markStage.isPending}
                    onClick={() => markStage.mutate({ caseId, stage: "awaiting_parts" })}>Awaiting parts</Button>
                  <Button size="sm" variant="outline" disabled={markStage.isPending}
                    onClick={() => markStage.mutate({ caseId, stage: "ready_for_return" })}>Ready for return</Button>
                  <Button size="sm" variant="outline" disabled={returnToService.isPending}
                    onClick={() => returnToService.mutate({ caseId })}>Return to service</Button>
                  <div className="flex items-center gap-2">
                    <Select value={closure} onValueChange={(v) => setClosure(v as typeof closure)}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="resolved">resolved</SelectItem>
                        <SelectItem value="partially_resolved">partially resolved</SelectItem>
                        <SelectItem value="not_resolved">not resolved</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={completeCycle.isPending}
                      onClick={() => completeCycle.mutate({ caseId, closureResult: closure })}>Complete cycle</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" disabled={startCycle.isPending}
                  onClick={() => startCycle.mutate({ caseId })}>Start repair cycle</Button>
              )}
            </CardContent>
          </Card>

          {/* Outcome lifecycle: Unknown -> Reported -> Verified -> Confirmed, or -> Failed */}
          <Card>
            <CardHeader><CardTitle className="text-base">Outcome</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data.outcomes ?? []).length === 0 ? null : (
                <ul className="space-y-2">
                  {(data.outcomes ?? []).map((o: any) => (
                    <li key={o.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={OUTCOME_STATE_BADGE[o.outcomeState] ?? ""}>
                          {o.outcomeState}
                        </Badge>
                        {o.evidenceQualityTier ? (
                          <Badge variant="outline">
                            quality: {o.evidenceQualityTier} ({o.evidenceQualityScore ?? "—"})
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-slate-700">
                        <strong>Fault:</strong> {o.confirmedFault}
                      </p>
                      <p className="text-slate-700">
                        <strong>Repair:</strong> {o.repairPerformed}
                      </p>

                      {(o.outcomeState === "unknown" || o.outcomeState === "reported") ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                          <Select value={verificationMethod} onValueChange={setVerificationMethod}>
                            <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {VERIFICATION_METHODS.map((m) => (
                                <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={verifyOutcome.isPending}
                            onClick={() => verifyOutcome.mutate({ outcomeId: o.id, verificationMethod: verificationMethod as never })}>
                            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Verify (technician only)
                          </Button>
                        </div>
                      ) : null}

                      {o.outcomeState === "verified" ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                          <Select value={confirmationEvidenceType} onValueChange={setConfirmationEvidenceType}>
                            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CONFIRMATION_EVIDENCE_TYPES.map((m) => (
                                <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" disabled={confirmOutcome.isPending}
                            onClick={() => confirmOutcome.mutate({ outcomeId: o.id, confirmationEvidenceType: confirmationEvidenceType as never })}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirm
                          </Button>
                        </div>
                      ) : null}

                      {o.outcomeState !== "failed" ? (
                        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                          <Input
                            className="h-8 flex-1"
                            placeholder="Failure notes (e.g. comeback within a week)"
                            value={failureNotes}
                            onChange={(e) => setFailureNotes(e.target.value)}
                          />
                          <Button size="sm" variant="destructive" disabled={markOutcomeFailed.isPending || !failureNotes.trim()}
                            onClick={() => markOutcomeFailed.mutate({ outcomeId: o.id, failureNotes })}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Mark failed
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-red-700">{o.failureNotes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Report an outcome</p>
                <Textarea placeholder="Confirmed fault" value={outcomeForm.confirmedFault}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, confirmedFault: e.target.value }))} />
                <Textarea placeholder="Repair performed" value={outcomeForm.repairPerformed}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, repairPerformed: e.target.value }))} />
                <Select value={outcomeForm.evidenceSource} onValueChange={(v) => setOutcomeForm((f) => ({ ...f, evidenceSource: v }))}>
                  <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_SOURCES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={reportOutcome.isPending || !outcomeForm.confirmedFault.trim() || !outcomeForm.repairPerformed.trim()}
                  onClick={() => reportOutcome.mutate({
                    caseId,
                    vehicleId: c.vehicleId,
                    confirmedFault: outcomeForm.confirmedFault,
                    repairPerformed: outcomeForm.repairPerformed,
                    evidenceSource: outcomeForm.evidenceSource as never,
                  })}>
                  Report outcome
                </Button>
                <p className="text-xs text-slate-400">
                  Reporting does not require technician authority. Only an authorized technician can Verify.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Repair documents (Phase 4) */}
          <RepairDocumentsSection caseId={caseId} />

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle className="text-base">Case activity</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2">
                {data.timeline.map((t, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="whitespace-nowrap text-xs text-slate-400">
                      {new Date(t.at).toLocaleString()}
                    </span>
                    <span className="text-slate-700">{t.summary}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Right: status / assignment / reopen */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {transitions.length === 0 ? (
                <p className="text-sm text-slate-500">No transitions available.</p>
              ) : (
                <>
                  <Select value={nextStatus} onValueChange={setNextStatus}>
                    <SelectTrigger><SelectValue placeholder="Move to…" /></SelectTrigger>
                    <SelectContent>
                      {transitions.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="w-full" disabled={!nextStatus || transition.isPending}
                    onClick={() => transition.mutate({ caseId, toStatus: nextStatus as never })}>
                    <ArrowRight className="mr-1 h-3.5 w-3.5" /> Apply
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-slate-600">
                Manager: {c.assignedManagerUserId ?? "unassigned"}<br />
                Maintenance: {c.assignedMaintenanceUserId ?? "unassigned"}
              </p>
              <AssignControls caseId={caseId} onAssign={(m, mx) => assign.mutate({ caseId, managerUserId: m, maintenanceUserId: mx })} pending={assign.isPending} />
            </CardContent>
          </Card>

          {(status === "closed" || status === "completed" || status === "cancelled") ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Reopen</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Textarea placeholder="Reason for reopening (required)" value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)} />
                <Button size="sm" variant="outline" disabled={reopen.isPending || !reopenReason.trim()}
                  onClick={() => reopen.mutate({ caseId, reason: reopenReason })}>Reopen case</Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <p className="mt-8 flex items-start gap-1.5 text-xs leading-5 text-slate-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {SAFETY_DISCLAIMERS.full}
      </p>
    </PageShell>
  );
}

function AssignControls({
  onAssign,
  pending,
}: {
  caseId: number;
  onAssign: (managerUserId: number | null, maintenanceUserId: number | null | undefined) => void;
  pending: boolean;
}) {
  const [manager, setManager] = useState("");
  const [maint, setMaint] = useState("");
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Manager user id</Label>
        <Input value={manager} onChange={(e) => setManager(e.target.value)} inputMode="numeric" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Maintenance user id</Label>
        <Input value={maint} onChange={(e) => setMaint(e.target.value)} inputMode="numeric" />
      </div>
      <Button size="sm" variant="outline" className="col-span-2" disabled={pending}
        onClick={() =>
          onAssign(
            manager ? Number(manager) : null,
            maint ? Number(maint) : null
          )
        }>
        Update assignment
      </Button>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3 sm:px-6">
          <a href="/" aria-label="TruckFixr home"><AppLogo imageClassName="h-8 w-auto" /></a>
          <h1 className="font-['Manrope'] text-lg font-black text-slate-900">Maintenance case</h1>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

export default function MaintenanceCaseDetail() {
  return (
    // "driver" is included because Service Advisors/Technicians are
    // capability-granted driver-role members (§4) — the actual per-action
    // authorization (e.g. only a Technician grant can Verify) is enforced
    // server-side, not by this route guard.
    <RoleBasedRoute requiredRoles={["owner", "manager", "driver"]}>
      <MaintenanceCaseDetailContent />
    </RoleBasedRoute>
  );
}
