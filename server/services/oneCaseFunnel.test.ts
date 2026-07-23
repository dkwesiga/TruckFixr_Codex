import { describe, expect, it } from "vitest";

import { aggregateFunnel } from "./oneCaseFunnel";

describe("aggregateFunnel", () => {
  it("counts known funnel events and groups by source and readiness", () => {
    const result = aggregateFunnel([
      { event: "try_one_case_clicked", intakeSource: "web" },
      { event: "case_submitted", intakeSource: "web", readiness: "service_soon" },
      { event: "case_submitted", intakeSource: "whatsapp_manual", readiness: "stop" },
      { event: "contact_gate_completed", intakeSource: "web" },
      { event: "outcome_confirmed", intakeSource: "web" },
      { event: "not_a_funnel_event", intakeSource: "web" },
    ]);

    expect(result.counts.case_submitted).toBe(2);
    expect(result.counts.try_one_case_clicked).toBe(1);
    expect(result.counts.contact_gate_completed).toBe(1);
    expect(result.counts.outcome_confirmed).toBe(1);
    // Unknown events are still counted in the total/source but not in a funnel step.
    expect(result.total).toBe(6);
    expect(result.bySource.web).toBe(5);
    expect(result.bySource.whatsapp_manual).toBe(1);
    expect(result.byReadiness.service_soon).toBe(1);
    expect(result.byReadiness.stop).toBe(1);
  });

  it("returns a zeroed funnel for no events", () => {
    const r = aggregateFunnel([]);
    expect(r.total).toBe(0);
    expect(r.counts.case_submitted).toBe(0);
  });
});
