import { useState } from "react";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const OUTCOMES = ["confirmed", "adjusted", "no_change", "insufficient_evidence", "escalated"];

function slaLabel(dueAt: string | Date | null): { text: string; overdue: boolean } {
  if (!dueAt) return { text: "—", overdue: false };
  const due = new Date(dueAt).getTime();
  const mins = Math.round((due - Date.now()) / 60000);
  if (mins < 0) return { text: `${Math.abs(mins)}m overdue`, overdue: true };
  return { text: `${mins}m left`, overdue: false };
}

export default function CaseReviewQueue() {
  const list = trpc.caseReview.list.useQuery(undefined, { refetchInterval: 60_000 });
  const [outcome, setOutcome] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const refresh = () => list.refetch();
  const claim = trpc.caseReview.claim.useMutation({ onSuccess: refresh });
  const complete = trpc.caseReview.complete.useMutation({ onSuccess: refresh });
  const escalate = trpc.caseReview.escalate.useMutation({ onSuccess: refresh });

  const items = list.data ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Case review queue</h1>
            <p className="text-sm text-slate-500">
              Critical safety cases are targeted for review within one business hour (Mon–Fri, 8:00–18:00 ET).
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={list.isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", list.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No cases in the queue.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">SLA</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it: any) => {
                  const sla = slaLabel(it.slaDueAt);
                  const done = it.status === "review_completed";
                  return (
                    <tr key={it.id} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">{it.id}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          {it.category === "critical_safety" && (
                            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden="true" />
                          )}
                          {it.category.replace(/_/g, " ")}
                        </div>
                        {it.guestCaseId ? (
                          <div className="text-xs text-slate-400">guest #{it.guestCaseId}</div>
                        ) : null}
                        {it.afterHours ? <div className="text-xs text-amber-600">after hours</div> : null}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-bold",
                            it.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
                          )}
                        >
                          {it.priority}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{it.status.replace(/_/g, " ")}</td>
                      <td className="px-3 py-3">
                        {done ? (
                          <span className={cn("text-xs font-semibold", it.slaMet ? "text-green-600" : "text-red-600")}>
                            {it.slaMet ? "SLA met" : "SLA missed"}
                          </span>
                        ) : (
                          <span className={cn("inline-flex items-center gap-1 text-xs", sla.overdue ? "text-red-600" : "text-slate-500")}>
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {sla.text}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {done ? (
                          <span className="text-xs text-slate-400">{it.outcome ?? "completed"}</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            {it.status === "review_required" && (
                              <Button size="sm" variant="outline" onClick={() => claim.mutate({ id: it.id })}>
                                Claim
                              </Button>
                            )}
                            <select
                              value={outcome[it.id] ?? OUTCOMES[0]}
                              onChange={(e) => setOutcome((o) => ({ ...o, [it.id]: e.target.value }))}
                              className="h-8 rounded border border-slate-300 px-2 text-xs"
                            >
                              {OUTCOMES.map((o) => (
                                <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
                              ))}
                            </select>
                            <Input
                              value={notes[it.id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                              placeholder="Notes"
                              className="h-8 w-40 text-xs"
                            />
                            <Button
                              size="sm"
                              onClick={() =>
                                complete.mutate({
                                  id: it.id,
                                  outcome: outcome[it.id] ?? OUTCOMES[0],
                                  reviewerNotes: notes[it.id] || undefined,
                                })
                              }
                            >
                              Complete
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => escalate.mutate({ id: it.id, reason: notes[it.id] || "manual escalation" })}
                            >
                              Escalate
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
