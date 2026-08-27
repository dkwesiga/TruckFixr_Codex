import { useState } from "react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Stethoscope } from "lucide-react";
import { VERIFICATION_METHODS } from "@shared/tadis/outcomeLifecycle";
import type { CaseStatus } from "@shared/maintenance/caseWorkflow";

type LikelyCause = { cause: string; rank: number; rationale: string };
type NextDiagnosticStep = { type: "question" | "test" | "check" | "measurement"; instruction: string; reason: string };

type CurrentDecision = {
  confidence: number | null;
  confidenceStatus?: string | null;
  likelyCausesJson?: unknown;
  nextDiagnosticStepJson?: unknown;
  evidenceSummary?: string | null;
  safetySummary?: string | null;
  immediateChecksJson?: unknown;
  rationale?: string | null;
} | undefined;

type FollowUp = { id: number; result: string; note: string | null; recordedAt: string | Date };

const CONFIDENCE_TARGET = 85;

function asLikelyCauses(v: unknown): LikelyCause[] {
  return Array.isArray(v) ? (v as LikelyCause[]) : [];
}
function asNextStep(v: unknown): NextDiagnosticStep | null {
  return v && typeof v === "object" ? (v as NextDiagnosticStep) : null;
}
function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export default function RepairShopWorkflowSection({
  caseId,
  status,
  summary,
  currentDecision,
  followUps,
  onChanged,
}: {
  caseId: number;
  status: CaseStatus;
  summary?: string | null;
  currentDecision: CurrentDecision;
  followUps: FollowUp[];
  onChanged: () => void;
}) {
  const onErr = (e: { message: string }) => toast.error(e.message);
  const [answer, setAnswer] = useState("");
  const [complaint, setComplaint] = useState("");

  const advanceTriage = trpc.maintenanceCases.advanceTriage.useMutation({
    onSuccess: () => { setAnswer(""); onChanged(); },
    onError: onErr,
  });
  const completeTriage = trpc.maintenanceCases.completeTriage.useMutation({
    onSuccess: () => { toast.success("Triage marked complete."); onChanged(); },
    onError: onErr,
  });
  const startRepair = trpc.maintenanceCases.startRepair.useMutation({
    onSuccess: () => { toast.success("Repair started."); onChanged(); },
    onError: onErr,
  });
  const recordOutcome = trpc.maintenanceCases.recordRepairOutcome.useMutation({
    onSuccess: () => { toast.success("Repair outcome recorded. Follow up in 3 days."); onChanged(); },
    onError: onErr,
  });
  const recordFollowUp = trpc.maintenanceCases.recordFollowUp.useMutation({
    onSuccess: () => { toast.success("Follow-up recorded."); setFollowUpNote(""); onChanged(); },
    onError: onErr,
  });
  const createReturnJob = trpc.maintenanceCases.createReturnJob.useMutation({
    onSuccess: () => { toast.success("Return job created."); setComplaint(""); onChanged(); },
    onError: onErr,
  });

  const [outcomeForm, setOutcomeForm] = useState({
    confirmedFault: "",
    rootCause: "",
    rootCauseConfirmed: false,
    repairPerformed: "",
    partsReplaced: "",
    verificationMethod: VERIFICATION_METHODS[0] as string,
    verificationNotes: "",
    shopConfidence: "90",
    repairNotes: "",
  });
  const [followUpResult, setFollowUpResult] = useState<"resolved" | "partially_resolved" | "not_resolved" | "returned">("resolved");
  const [followUpNote, setFollowUpNote] = useState("");

  const confidence = currentDecision?.confidence ?? null;
  const confidenceStatus = currentDecision?.confidenceStatus ?? null;
  const likelyCauses = asLikelyCauses(currentDecision?.likelyCausesJson).sort((a, b) => a.rank - b.rank);
  const nextStep = asNextStep(currentDecision?.nextDiagnosticStepJson);
  const remainingVerification = asStringList(currentDecision?.immediateChecksJson);

  const showTriage = status === "reported" || status === "triaging";
  const showTriageSummary = status === "decision_pending" || status === "in_repair" || status === "awaiting_follow_up" || status === "closed";
  const showRepairOutcomeForm = status === "in_repair";
  const showFollowUpForm = status === "awaiting_follow_up";
  const showReturnJobAction = status === "return_job" || status === "closed";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stethoscope className="h-4 w-4" /> Repair-shop diagnostic workflow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700">
            <strong>Customer complaint:</strong> {summary}
          </p>
        ) : null}

        {showTriage ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700">Diagnostic confidence:</span>
              {confidence != null ? (
                <Badge variant="outline" className={confidence >= CONFIDENCE_TARGET ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}>
                  {confidence}% (target &gt;{CONFIDENCE_TARGET}%)
                </Badge>
              ) : (
                <span className="text-slate-500">Not started</span>
              )}
              {confidenceStatus === "insufficient" ? (
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                  Insufficient evidence to reach &gt;{CONFIDENCE_TARGET}% confidence
                </Badge>
              ) : null}
            </div>

            {currentDecision?.safetySummary ? (
              <p className="flex items-start gap-1.5 text-xs text-slate-600">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {currentDecision.safetySummary}
              </p>
            ) : null}

            {likelyCauses.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-700">Likely causes (not a confirmed diagnosis)</p>
                <ol className="list-decimal space-y-1 pl-4 text-sm text-slate-700">
                  {likelyCauses.map((c) => (
                    <li key={c.rank}>
                      {c.cause} <span className="text-xs text-slate-500">— {c.rationale}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {nextStep ? (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Next {nextStep.type}</p>
                <p className="text-sm text-slate-800">{nextStep.instruction}</p>
                <p className="text-xs text-slate-500">{nextStep.reason}</p>
                <Textarea
                  placeholder="Enter the result / answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={advanceTriage.isPending || !answer.trim()}
                  onClick={() => advanceTriage.mutate({ caseId, answer })}
                >
                  {advanceTriage.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Submit &amp; continue
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" disabled={advanceTriage.isPending} onClick={() => advanceTriage.mutate({ caseId })}>
                {advanceTriage.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {confidence == null ? "Start diagnostic triage" : "Re-evaluate"}
              </Button>
            )}

            {status === "triaging" && confidence != null && !nextStep ? (
              <Button size="sm" disabled={completeTriage.isPending} onClick={() => completeTriage.mutate({ caseId })}>
                Mark triage complete
              </Button>
            ) : null}
          </div>
        ) : null}

        {showTriageSummary && (confidence != null || likelyCauses.length > 0) ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <p className="text-xs font-semibold text-slate-700">Triage summary</p>
            {confidence != null ? <p>Confidence: {confidence}% (target &gt;{CONFIDENCE_TARGET}%)</p> : null}
            {likelyCauses.length > 0 ? (
              <p>Top causes: {likelyCauses.map((c) => c.cause).join("; ")}</p>
            ) : null}
            {currentDecision?.evidenceSummary ? <p className="text-slate-600">{currentDecision.evidenceSummary}</p> : null}
            {remainingVerification.length > 0 ? (
              <p className="text-slate-600">Remaining checks: {remainingVerification.join("; ")}</p>
            ) : null}
            {currentDecision?.rationale ? <p className="text-xs text-slate-500">{currentDecision.rationale}</p> : null}
          </div>
        ) : null}

        {status === "decision_pending" ? (
          <Button size="sm" disabled={startRepair.isPending} onClick={() => startRepair.mutate({ caseId })}>
            Start repair
          </Button>
        ) : null}

        {showRepairOutcomeForm ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">Repair outcome</p>
            <Textarea placeholder="Actual fault found" value={outcomeForm.confirmedFault}
              onChange={(e) => setOutcomeForm((f) => ({ ...f, confirmedFault: e.target.value }))} />
            <Textarea placeholder="Root cause (leave blank if not confirmed)" value={outcomeForm.rootCause}
              onChange={(e) => setOutcomeForm((f) => ({ ...f, rootCause: e.target.value, rootCauseConfirmed: Boolean(e.target.value.trim()) }))} />
            <Textarea placeholder="Repair performed" value={outcomeForm.repairPerformed}
              onChange={(e) => setOutcomeForm((f) => ({ ...f, repairPerformed: e.target.value }))} />
            <Input placeholder="Parts replaced (comma-separated, or leave blank for none)" value={outcomeForm.partsReplaced}
              onChange={(e) => setOutcomeForm((f) => ({ ...f, partsReplaced: e.target.value }))} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={outcomeForm.verificationMethod} onValueChange={(v) => setOutcomeForm((f) => ({ ...f, verificationMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VERIFICATION_METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0">Shop confidence (0-100)</Label>
                <Input type="number" min={0} max={100} value={outcomeForm.shopConfidence}
                  onChange={(e) => setOutcomeForm((f) => ({ ...f, shopConfidence: e.target.value }))} />
              </div>
            </div>
            <Textarea placeholder="Confirming test / measurement / evidence notes" value={outcomeForm.verificationNotes}
              onChange={(e) => setOutcomeForm((f) => ({ ...f, verificationNotes: e.target.value }))} />
            <Button
              size="sm"
              disabled={
                recordOutcome.isPending ||
                !outcomeForm.confirmedFault.trim() ||
                !outcomeForm.repairPerformed.trim()
              }
              onClick={() =>
                recordOutcome.mutate({
                  caseId,
                  confirmedFault: outcomeForm.confirmedFault,
                  rootCause: outcomeForm.rootCause.trim() || undefined,
                  rootCauseConfirmed: outcomeForm.rootCauseConfirmed,
                  repairPerformed: outcomeForm.repairPerformed,
                  partsReplaced: outcomeForm.partsReplaced
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean),
                  verificationMethod: outcomeForm.verificationMethod as never,
                  verificationNotes: outcomeForm.verificationNotes || undefined,
                  shopConfidence: Math.max(0, Math.min(100, Number(outcomeForm.shopConfidence) || 0)),
                })
              }
            >
              Record repair outcome
            </Button>
          </div>
        ) : null}

        {showFollowUpForm ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">3-day follow-up</p>
            <Select value={followUpResult} onValueChange={(v) => setFollowUpResult(v as typeof followUpResult)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="partially_resolved">Partially resolved</SelectItem>
                <SelectItem value="not_resolved">Not resolved</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
            <Textarea placeholder="Follow-up note (optional)" value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
            <Button size="sm" disabled={recordFollowUp.isPending}
              onClick={() => recordFollowUp.mutate({ caseId, result: followUpResult, note: followUpNote || undefined })}>
              Record follow-up
            </Button>
          </div>
        ) : null}

        {followUps.length > 0 ? (
          <ul className="space-y-1 text-xs text-slate-500">
            {followUps.map((f) => (
              <li key={f.id}>
                {new Date(f.recordedAt).toLocaleDateString()} — {f.result.replace(/_/g, " ")}
                {f.note ? `: ${f.note}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        {showReturnJobAction ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700">Same problem returned?</p>
            <Textarea placeholder="Describe the returning complaint" value={complaint} onChange={(e) => setComplaint(e.target.value)} />
            <Button size="sm" variant="outline" disabled={createReturnJob.isPending || !complaint.trim()}
              onClick={() => createReturnJob.mutate({ originalCaseId: caseId, complaint })}>
              Create linked return job
            </Button>
            <p className="text-xs text-slate-400">
              Creates a new, separate case linked to this one — this case's history is never changed.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
