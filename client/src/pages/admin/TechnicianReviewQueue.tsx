import { useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

const ACTIVE_STATUSES = [
  "paid",
  "missing_evidence",
  "call_proposed",
  "review_ready",
  "under_review",
];

function slaLabel(dueAt: string | Date | null): { text: string; overdue: boolean } {
  if (!dueAt) return { text: "—", overdue: false };
  const due = new Date(dueAt).getTime();
  const mins = Math.round((due - Date.now()) / 60000);
  if (mins < 0) return { text: `${Math.abs(mins)}m overdue`, overdue: true };
  return { text: `${mins}m left`, overdue: false };
}

export default function TechnicianReviewQueue() {
  const list = trpc.technicianReviews.list.useQuery(
    { statuses: ACTIVE_STATUSES as never },
    { refetchInterval: 60_000 }
  );
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [limitations, setLimitations] = useState<Record<number, string>>({});

  const refresh = () => list.refetch();
  const requestMissingEvidence = trpc.technicianReviews.requestMissingEvidence.useMutation({ onSuccess: refresh });
  const markReviewReady = trpc.technicianReviews.markReviewReady.useMutation({ onSuccess: refresh });
  const claim = trpc.technicianReviews.claim.useMutation({ onSuccess: refresh });
  const complete = trpc.technicianReviews.complete.useMutation({ onSuccess: refresh });
  const deliver = trpc.technicianReviews.deliver.useMutation({ onSuccess: refresh });
  const refund = trpc.technicianReviews.refund.useMutation({ onSuccess: refresh });

  const items = list.data ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Technician review queue</h1>
            <p className="text-sm text-slate-500">
              Paid ($99 CAD) reviews. SLA is two business hours (Mon–Sat, 9:00–18:00 ET) from Review Ready — payment alone does not start the clock.
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={list.isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", list.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No active paid reviews.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">SLA</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it: any) => {
                  const sla = slaLabel(it.slaDueAt);
                  return (
                    <tr key={it.id} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs text-slate-500">
                        {it.id}
                        {it.guestCaseId ? (
                          <div className="text-xs text-slate-400">guest #{it.guestCaseId}</div>
                        ) : null}
                        {it.afterHours ? <div className="text-xs text-amber-600">after hours</div> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{it.status.replace(/_/g, " ")}</td>
                      <td className="px-3 py-3">
                        <span className={cn("inline-flex items-center gap-1 text-xs", sla.overdue ? "text-red-600" : "text-slate-500")}>
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {it.status === "review_ready" || it.status === "under_review" ? sla.text : "not started"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {it.status === "paid" && (
                            <>
                              <Input
                                value={notes[it.id] ?? ""}
                                onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                                placeholder="Missing evidence notes"
                                className="h-8 w-48 text-xs"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  requestMissingEvidence.mutate({ id: it.id, notes: notes[it.id] || "Please provide additional evidence." })
                                }
                              >
                                Request evidence
                              </Button>
                              <Button size="sm" onClick={() => markReviewReady.mutate({ id: it.id })}>
                                Mark Review Ready
                              </Button>
                            </>
                          )}
                          {(it.status === "missing_evidence" || it.status === "call_proposed") && (
                            <Button size="sm" onClick={() => markReviewReady.mutate({ id: it.id })}>
                              Mark Review Ready
                            </Button>
                          )}
                          {it.status === "review_ready" && (
                            <Button size="sm" onClick={() => claim.mutate({ id: it.id })}>
                              Start review
                            </Button>
                          )}
                          {it.status === "under_review" && (
                            <div className="flex w-full flex-col gap-2">
                              <Textarea
                                value={limitations[it.id] ?? ""}
                                onChange={(e) => setLimitations((l) => ({ ...l, [it.id]: e.target.value }))}
                                placeholder="Limitations statement (required to complete)"
                                className="h-16 w-64 text-xs"
                              />
                              <Button
                                size="sm"
                                onClick={() =>
                                  complete.mutate({
                                    id: it.id,
                                    findings: {},
                                    limitationsText:
                                      limitations[it.id] ||
                                      "Decision support only; not a guaranteed diagnosis or substitute for physical inspection.",
                                  })
                                }
                              >
                                Complete review
                              </Button>
                            </div>
                          )}
                          {it.status === "reviewed" && (
                            <Button size="sm" onClick={() => deliver.mutate({ id: it.id })}>
                              Deliver
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => refund.mutate({ id: it.id, reason: notes[it.id] || "manual_refund" })}
                          >
                            Refund
                          </Button>
                        </div>
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
