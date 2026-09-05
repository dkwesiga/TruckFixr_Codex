import { describe, expect, it } from "vitest";
import { rankSupplierOptions, type SupplierOptionForRanking } from "./recommendation";

function option(overrides: Partial<SupplierOptionForRanking>): SupplierOptionForRanking {
  return {
    id: overrides.id ?? Math.random(),
    priceCents: null,
    freightCents: null,
    etaAt: null,
    warrantyText: null,
    returnable: null,
    stockStatus: null,
    fitmentState: "not_confirmed",
    ...overrides,
  };
}

describe("rankSupplierOptions", () => {
  it("never ranks a cheaper but unconfirmed-fit option ahead of a confirmed-fit option", () => {
    const cheapUnconfirmed = option({ id: "cheap", priceCents: 1000, fitmentState: "not_confirmed" });
    const pricierConfirmed = option({ id: "confirmed", priceCents: 5000, fitmentState: "confirmed" });

    const ranked = rankSupplierOptions([cheapUnconfirmed, pricierConfirmed]);
    expect(ranked[0].id).toBe("confirmed");
    expect(ranked[1].id).toBe("cheap");
  });

  it("never ranks a cheaper ambiguous-fit option ahead of a likely-fit option", () => {
    const cheapAmbiguous = option({ id: "ambiguous", priceCents: 500, fitmentState: "ambiguous" });
    const pricierLikely = option({ id: "likely", priceCents: 4000, fitmentState: "likely" });

    const ranked = rankSupplierOptions([cheapAmbiguous, pricierLikely]);
    expect(ranked[0].id).toBe("likely");
  });

  it("uses total landed cost (price + freight) to break ties within the same fitment tier", () => {
    const cheaperLanded = option({
      id: "cheaper-landed",
      priceCents: 1000,
      freightCents: 0,
      fitmentState: "confirmed",
    });
    const pricierLanded = option({
      id: "pricier-landed",
      priceCents: 900,
      freightCents: 500,
      fitmentState: "confirmed",
    });

    const ranked = rankSupplierOptions([pricierLanded, cheaperLanded]);
    expect(ranked[0].id).toBe("cheaper-landed");
    expect(ranked[0].totalCostCents).toBe(1000);
    expect(ranked[1].totalCostCents).toBe(1400);
  });

  it("prefers a known cost over an unknown cost within the same fitment tier", () => {
    const unknownCost = option({ id: "unknown", priceCents: null, fitmentState: "confirmed" });
    const knownCost = option({ id: "known", priceCents: 999999, fitmentState: "confirmed" });

    const ranked = rankSupplierOptions([unknownCost, knownCost]);
    expect(ranked[0].id).toBe("known");
  });

  it("assigns sequential ranks starting at 1", () => {
    const ranked = rankSupplierOptions([
      option({ id: "a", fitmentState: "confirmed" }),
      option({ id: "b", fitmentState: "likely" }),
      option({ id: "c", fitmentState: "not_confirmed" }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
