import { describe, expect, it } from "vitest";
import { compareOptions, isOptionExpired, type SupplierOptionForRanking } from "./recommendation";

function option(overrides: Partial<SupplierOptionForRanking>): SupplierOptionForRanking {
  return {
    id: overrides.id ?? Math.random(),
    currency: "CAD",
    priceCents: null,
    freightCents: null,
    coreChargeCents: null,
    condition: null,
    availabilityState: null,
    etaType: null,
    etaAt: null,
    etaLeadTimeDays: null,
    warrantyText: null,
    returnable: null,
    quoteExpiresAt: null,
    fitmentState: "not_confirmed",
    ...overrides,
  };
}

describe("compareOptions — hard gates", () => {
  it("hard-gates a not_confirmed option instead of letting price rank it against a confirmed fit", () => {
    const cheapUnconfirmed = option({ id: "cheap", priceCents: 1000, fitmentState: "not_confirmed" });
    const pricierConfirmed = option({ id: "confirmed", priceCents: 5000, fitmentState: "confirmed" });

    const result = compareOptions([cheapUnconfirmed, pricierConfirmed]);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].id).toBe("confirmed");
    expect(result.hardGated).toHaveLength(1);
    expect(result.hardGated[0].id).toBe("cheap");
    expect(result.hardGated[0].hardGateReasons[0].code).toBe("fitment_not_eligible");
    expect(result.recommended?.id).toBe("confirmed");
  });

  it("hard-gates an ambiguous (conflicting-evidence) option the same way", () => {
    const ambiguous = option({ id: "ambiguous", priceCents: 500, fitmentState: "ambiguous" });
    const likely = option({ id: "likely", priceCents: 4000, fitmentState: "likely" });

    const result = compareOptions([ambiguous, likely]);
    expect(result.ranked.map((o) => o.id)).toEqual(["likely"]);
    expect(result.hardGated.map((o) => o.id)).toEqual(["ambiguous"]);
  });

  it("hard-gates an unavailable option even with confirmed fitment", () => {
    const unavailable = option({
      id: "unavailable",
      priceCents: 100,
      fitmentState: "confirmed",
      availabilityState: "unavailable",
    });
    const available = option({ id: "available", priceCents: 9999, fitmentState: "likely" });

    const result = compareOptions([unavailable, available]);
    expect(result.recommended?.id).toBe("available");
    expect(result.hardGated.map((o) => o.id)).toEqual(["unavailable"]);
  });

  it("hard-gates an expired quote", () => {
    const expired = option({
      id: "expired",
      priceCents: 100,
      fitmentState: "confirmed",
      quoteExpiresAt: new Date("2020-01-01T00:00:00Z"),
    });
    const current = option({ id: "current", priceCents: 9999, fitmentState: "likely" });

    const result = compareOptions([expired, current], new Date("2026-01-01T00:00:00Z"));
    expect(result.recommended?.id).toBe("current");
    expect(result.hardGated[0].hardGateReasons.map((r) => r.code)).toContain("quote_expired");
  });

  it("a hard-gated option can be reported alongside eligible ones without being 'the recommendation'", () => {
    const onlyOption = option({ id: "only", priceCents: 100, fitmentState: "not_confirmed" });
    const result = compareOptions([onlyOption]);
    expect(result.recommended).toBeNull();
    expect(result.ranked).toHaveLength(0);
    expect(result.hardGated).toHaveLength(1);
  });
});

describe("compareOptions — soft ranking within the eligible set", () => {
  it("uses estimated acquisition cost (price + freight + core charge) to break ties within the same fitment tier", () => {
    const pricierLanded = option({
      id: "pricier-landed",
      priceCents: 900,
      freightCents: 500,
      coreChargeCents: 0,
      fitmentState: "confirmed",
    });
    const cheaperLanded = option({
      id: "cheaper-landed",
      priceCents: 1000,
      freightCents: 0,
      coreChargeCents: 0,
      fitmentState: "confirmed",
    });

    const { ranked } = compareOptions([pricierLanded, cheaperLanded]);
    expect(ranked[0].id).toBe("cheaper-landed");
    expect(ranked[0].estimatedAcquisitionCostCents).toBe(1000);
    expect(ranked[1].estimatedAcquisitionCostCents).toBe(1400);
  });

  it("includes core charge in the estimated acquisition cost", () => {
    const withCore = option({ id: "with-core", priceCents: 1000, coreChargeCents: 300, fitmentState: "confirmed" });
    const { ranked } = compareOptions([withCore]);
    expect(ranked[0].estimatedAcquisitionCostCents).toBe(1300);
  });

  it("prefers a known cost over an unknown cost within the same fitment tier", () => {
    const unknownCost = option({ id: "unknown", priceCents: null, fitmentState: "confirmed" });
    const knownCost = option({ id: "known", priceCents: 999999, fitmentState: "confirmed" });

    const { ranked } = compareOptions([unknownCost, knownCost]);
    expect(ranked[0].id).toBe("known");
  });

  it("does not let ETA/warranty/returnability override the primary cost ordering, only break ties", () => {
    const cheaperNoEta = option({ id: "cheaper", priceCents: 1000, fitmentState: "confirmed" });
    const pricierSameDay = option({
      id: "pricier-same-day",
      priceCents: 2000,
      fitmentState: "confirmed",
      etaType: "same_day_delivery",
    });
    const { ranked } = compareOptions([pricierSameDay, cheaperNoEta]);
    // Cost still wins first — ETA only breaks a tie in cost, not a difference.
    expect(ranked[0].id).toBe("cheaper");
  });

  it("uses ETA to break a cost tie", () => {
    const sameCostNoEta = option({ id: "no-eta", priceCents: 1000, fitmentState: "confirmed" });
    const sameCostSameDay = option({
      id: "same-day",
      priceCents: 1000,
      fitmentState: "confirmed",
      etaType: "same_day_delivery",
    });
    const { ranked } = compareOptions([sameCostNoEta, sameCostSameDay]);
    expect(ranked[0].id).toBe("same-day");
  });

  it("assigns sequential ranks starting at 1 across the eligible set only", () => {
    const { ranked } = compareOptions([
      option({ id: "a", fitmentState: "confirmed" }),
      option({ id: "b", fitmentState: "likely" }),
      option({ id: "c", fitmentState: "not_confirmed" }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe("compareOptions — currency safety", () => {
  it("never numerically compares prices in different currencies, and flags the mismatch", () => {
    const cadOption = option({ id: "cad", priceCents: 5000, currency: "CAD", fitmentState: "confirmed" });
    const usdOption = option({ id: "usd", priceCents: 100, currency: "USD", fitmentState: "confirmed" });

    const { ranked, primaryCurrency } = compareOptions([cadOption, usdOption]);
    expect(primaryCurrency).toBe("CAD");
    const usdRanked = ranked.find((r) => r.id === "usd")!;
    expect(usdRanked.currencyMismatch).toBe(true);
    // The far-cheaper-looking USD price must not simply outrank CAD on raw
    // numbers — its cost is treated as unknown for comparison purposes.
    expect(ranked[0].id).toBe("cad");
  });

  it("still ranks a currency-mismatched option by fitment tier normally", () => {
    const cadConfirmed = option({ id: "cad", priceCents: 5000, currency: "CAD", fitmentState: "likely" });
    const usdConfirmed = option({ id: "usd", priceCents: 100, currency: "USD", fitmentState: "confirmed" });
    const { ranked } = compareOptions([cadConfirmed, usdConfirmed]);
    expect(ranked[0].id).toBe("usd");
  });
});

describe("isOptionExpired", () => {
  it("treats a null expiry as not expired", () => {
    expect(isOptionExpired(null)).toBe(false);
  });

  it("treats a past date as expired and a future date as not expired", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(isOptionExpired(new Date("2026-01-01T00:00:00Z"), now)).toBe(true);
    expect(isOptionExpired(new Date("2026-12-01T00:00:00Z"), now)).toBe(false);
  });
});
