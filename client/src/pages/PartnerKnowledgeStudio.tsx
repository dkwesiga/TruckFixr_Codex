import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type RiskLevel = "low" | "medium" | "high" | "critical";

type PromoteFormState = {
  codeSystem: string;
  code: string;
  category: string;
  title: string;
  riskLevel: RiskLevel;
  recommendedChecksText: string;
  summaryNotes: string;
};

function emptyForm(): PromoteFormState {
  return {
    codeSystem: "J1939",
    code: "",
    category: "aftertreatment/emissions",
    title: "",
    riskLevel: "medium",
    recommendedChecksText: "",
    summaryNotes: "",
  };
}

function parseChecks(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function PartnerKnowledgeStudioInner() {
  const fleetsQuery = trpc.fleet.list.useQuery();
  const partnerFleet = useMemo(
    () => (fleetsQuery.data ?? []).find((fleet: any) => fleet.isPartner) ?? null,
    [fleetsQuery.data]
  );
  const fleetId = partnerFleet?.id as number | undefined;

  const utils = trpc.useUtils();
  const [openOutcomeId, setOpenOutcomeId] = useState<number | null>(null);
  const [form, setForm] = useState<PromoteFormState>(emptyForm());

  const outcomesQuery = trpc.partner.listPromotableOutcomes.useQuery(
    { fleetId: fleetId ?? 0 },
    { enabled: Boolean(fleetId) }
  );

  const promote = trpc.partner.promoteOutcomeToReference.useMutation({
    onSuccess: async (result) => {
      toast.success(
        `Proposed for the knowledge base (reference #${result.referenceId}). A TruckFixr curator will review it before it reaches diagnosis.`
      );
      setOpenOutcomeId(null);
      setForm(emptyForm());
      if (fleetId) {
        await utils.partner.listPromotableOutcomes.invalidate({ fleetId });
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const outcomes = outcomesQuery.data ?? [];

  function openFor(outcome: any) {
    setOpenOutcomeId(outcome.id);
    setForm({
      ...emptyForm(),
      title: outcome.confirmedFault?.slice(0, 120) ?? "",
    });
  }

  function submit(outcomeId: number) {
    if (!fleetId) return;
    promote.mutate({
      fleetId,
      outcomeId,
      reference: {
        codeSystem: form.codeSystem.trim(),
        code: form.code.trim(),
        category: form.category.trim(),
        title: form.title.trim(),
        riskLevel: form.riskLevel,
        recommendedChecks: parseChecks(form.recommendedChecksText),
        summaryNotes: form.summaryNotes.trim() || undefined,
      },
    });
  }

  if (fleetsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!partnerFleet || !fleetId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Partner shops only
            </CardTitle>
            <CardDescription>
              This workspace is for TruckFixr partner repair shops. Your account is not linked to a
              partner shop, so there is nothing to contribute here.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BookOpenCheck className="h-6 w-6 text-primary" />
            Knowledge Base Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {partnerFleet.name} — turn your confirmed repairs into shared diagnostic knowledge.
            Every proposal is reviewed by a TruckFixr curator before it helps another fleet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/partner/cases/new">
            <Button size="sm">
              <Wrench className="mr-2 h-4 w-4" />
              New case
            </Button>
          </a>
          <a href="/app/fleet-health">
            <Button size="sm" variant="outline">
              Cases &amp; repair outcomes
            </Button>
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => outcomesQuery.refetch()}
            disabled={outcomesQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${outcomesQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="mb-6 border-amber-200 bg-amber-50/60">
        <CardContent className="flex gap-3 py-4 text-sm text-amber-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Keep proposals <strong>generalizable</strong>. Never include a customer name, VIN, plate,
            phone, or repair-order number — those are blocked automatically and knowledge-base
            references must describe the fault and fix, not the truck.
          </p>
        </CardContent>
      </Card>

      {outcomesQuery.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : outcomes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No confirmed outcomes are waiting to be proposed. Record a repair outcome after running
            triage and it will appear here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {outcomes.map((outcome: any) => {
            const isOpen = openOutcomeId === outcome.id;
            const parts = Array.isArray(outcome.partsReplaced) ? outcome.partsReplaced : [];
            return (
              <Card key={outcome.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    {outcome.confirmedFault}
                  </CardTitle>
                  <CardDescription>
                    Fix: {outcome.repairPerformed}
                    {parts.length > 0 ? ` · Parts: ${parts.join(", ")}` : ""}
                    {outcome.aiDiagnosisCorrect && outcome.aiDiagnosisCorrect !== "unknown"
                      ? ` · AI diagnosis: ${outcome.aiDiagnosisCorrect}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!isOpen ? (
                    <Button size="sm" onClick={() => openFor(outcome)}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Propose for knowledge base
                    </Button>
                  ) : (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`code-system-${outcome.id}`}>Code system</Label>
                          <Input
                            id={`code-system-${outcome.id}`}
                            value={form.codeSystem}
                            placeholder="J1939, OBD-II, MID/PID…"
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, codeSystem: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`code-${outcome.id}`}>Fault code</Label>
                          <Input
                            id={`code-${outcome.id}`}
                            value={form.code}
                            placeholder="SPN 4364 FMI 18"
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, code: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`category-${outcome.id}`}>Category</Label>
                          <Input
                            id={`category-${outcome.id}`}
                            value={form.category}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, category: event.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`risk-${outcome.id}`}>Risk level</Label>
                          <select
                            id={`risk-${outcome.id}`}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={form.riskLevel}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                riskLevel: event.target.value as RiskLevel,
                              }))
                            }
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`title-${outcome.id}`}>Reference title</Label>
                        <Input
                          id={`title-${outcome.id}`}
                          value={form.title}
                          placeholder="SCR efficiency derate on DEF dosing failure"
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, title: event.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`checks-${outcome.id}`}>
                          Recommended checks (one per line)
                        </Label>
                        <Textarea
                          id={`checks-${outcome.id}`}
                          rows={3}
                          value={form.recommendedChecksText}
                          placeholder={"Inspect DEF dosing valve\nCheck DEF quality"}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              recommendedChecksText: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`notes-${outcome.id}`}>
                          Generalizable notes (optional)
                        </Label>
                        <Textarea
                          id={`notes-${outcome.id}`}
                          rows={2}
                          value={form.summaryNotes}
                          placeholder="Extra context that applies to any truck with this fault."
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, summaryNotes: event.target.value }))
                          }
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => submit(outcome.id)}
                          disabled={promote.isPending}
                        >
                          {promote.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 h-4 w-4" />
                          )}
                          Submit for review
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOpenOutcomeId(null);
                            setForm(emptyForm());
                          }}
                          disabled={promote.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PartnerKnowledgeStudio() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <PartnerKnowledgeStudioInner />
    </RoleBasedRoute>
  );
}
