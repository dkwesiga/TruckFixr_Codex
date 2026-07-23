import { AdminLayout } from "@/components/admin/AdminLayout";
import { trpc } from "@/lib/trpc";

const STEPS: Array<[string, string]> = [
  ["homepage_viewed", "Homepage views"],
  ["fleet_health_dashboard_viewed", "Dashboard views"],
  ["try_one_case_clicked", "CTA clicks"],
  ["case_form_started", "Case starts"],
  ["preliminary_assessment_viewed", "Preliminary results"],
  ["contact_gate_completed", "Contact completed"],
  ["case_submitted", "Cases submitted"],
  ["decision_card_viewed", "Decisions viewed"],
  ["critical_escalation_triggered", "Escalations"],
  ["human_review_completed", "Reviews completed"],
  ["outcome_confirmed", "Outcomes confirmed"],
  ["pilot_interest_submitted", "Pilot applications"],
  ["pilot_qualified", "Pilot qualified"],
  ["pilot_payment_completed", "Payments"],
];

export default function OneCaseFunnel() {
  const funnel = trpc.caseReview.funnel.useQuery({ sinceDays: 30 });
  const qa = trpc.caseReview.weeklyQa.useQuery();

  const counts = (funnel.data?.counts ?? {}) as Record<string, number>;
  const bySource = (funnel.data?.bySource ?? {}) as Record<string, number>;
  const top = Math.max(1, ...STEPS.map(([k]) => counts[k] ?? 0));

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">One-Case Funnel</h1>
          <p className="text-sm text-slate-500">Last 30 days. Analytics contain no personal or free-text data.</p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Funnel</h2>
          <div className="space-y-2">
            {STEPS.map(([key, label]) => {
              const n = counts[key] ?? 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-sm text-slate-600">{label}</div>
                  <div className="h-5 flex-1 rounded bg-slate-100">
                    <div className="h-5 rounded bg-[#2D7DE0]" style={{ width: `${(n / top) * 100}%` }} />
                  </div>
                  <div className="w-12 text-right text-sm font-semibold tabular-nums text-slate-800">{n}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">By intake source</h2>
            <ul className="space-y-1 text-sm">
              {Object.entries(bySource).map(([s, n]) => (
                <li key={s} className="flex justify-between">
                  <span className="text-slate-600">{s}</span>
                  <span className="font-semibold tabular-nums">{n}</span>
                </li>
              ))}
              {Object.keys(bySource).length === 0 && <li className="text-slate-400">No events yet.</li>}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Weekly QA queue
            </h2>
            <ul className="space-y-1 text-sm">
              {(qa.data?.flagged ?? []).map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span className="font-mono text-xs text-slate-500">#{f.id}</span>
                  <span className="text-right text-slate-600">{f.reasons.join(", ").replace(/_/g, " ")}</span>
                </li>
              ))}
              {(qa.data?.flagged ?? []).length === 0 && <li className="text-slate-400">No flagged cases.</li>}
            </ul>
            {(qa.data?.routineSample ?? []).length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                + {qa.data?.routineSample.length} routine cases sampled for QA.
              </p>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
