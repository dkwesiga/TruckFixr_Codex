import { describe, expect, it } from "vitest";

import {
  compareEstimateToInvoice,
  hasUnresolvedHighVariance,
  type DocumentFinancials,
} from "./documentComparison";

function doc(overrides: Partial<DocumentFinancials> = {}): DocumentFinancials {
  return {
    currency: "CAD",
    subtotalCents: 100_000,
    taxCents: 13_000,
    totalCents: 113_000,
    labourHours: 4,
    lineItems: [
      { description: "Labour", kind: "labour", quantity: 4, unitPriceCents: 15_000, totalCents: 60_000 },
      { description: "Brake chamber", kind: "part", quantity: 1, unitPriceCents: 40_000, totalCents: 40_000 },
    ],
    ...overrides,
  };
}

describe("compareEstimateToInvoice", () => {
  it("finds nothing when estimate and invoice match", () => {
    const result = compareEstimateToInvoice(doc(), doc());
    expect(result.comparable).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("refuses to compare across currencies without a rate", () => {
    const result = compareEstimateToInvoice(doc({ currency: "CAD" }), doc({ currency: "USD" }));
    expect(result.comparable).toBe(false);
    expect(result.totals).toBeNull();
    expect(result.findings[0].code).toBe("currency_mismatch");
  });

  it("flags a verify-level total variance above the base thresholds", () => {
    // +$300 and +26.5%: crosses 10% and $250 but delta ($300) < $1000 high-amount.
    const invoice = doc({ subtotalCents: 130_000, taxCents: 13_000, totalCents: 143_000 });
    const result = compareEstimateToInvoice(doc(), invoice);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("total_variance");
    expect(hasUnresolvedHighVariance(result)).toBe(false);
  });

  it("flags a HIGH total variance above both high thresholds (>=20% and >=$1000)", () => {
    const estimate = doc({ subtotalCents: 300_000, taxCents: 0, totalCents: 300_000, lineItems: [] });
    const invoice = doc({ subtotalCents: 420_000, taxCents: 0, totalCents: 420_000, lineItems: [] });
    const result = compareEstimateToInvoice(estimate, invoice);
    expect(result.findings.map((f) => f.code)).toContain("high_total_variance");
    expect(hasUnresolvedHighVariance(result)).toBe(true);
  });

  it("does not flag a total change below the amount threshold even if percent is high", () => {
    // Tiny totals: 1000c -> 1200c is +20% but only +200c (< 25000c amount threshold).
    const est = doc({ subtotalCents: 1000, taxCents: 0, totalCents: 1000, lineItems: [] });
    const inv = doc({ subtotalCents: 1200, taxCents: 0, totalCents: 1200, lineItems: [] });
    const result = compareEstimateToInvoice(est, inv);
    expect(result.findings.some((f) => f.code.includes("total_variance"))).toBe(false);
  });

  it("respects the tax tolerance", () => {
    const within = compareEstimateToInvoice(doc(), doc({ taxCents: 13_150 })); // +150c <= 200c
    expect(within.findings.some((f) => f.code === "tax_mismatch")).toBe(false);
    const outside = compareEstimateToInvoice(doc(), doc({ taxCents: 13_300 })); // +300c > 200c
    expect(outside.findings.some((f) => f.code === "tax_mismatch")).toBe(true);
  });

  it("flags labour-hours variance at/above 2 hours", () => {
    const result = compareEstimateToInvoice(doc({ labourHours: 4 }), doc({ labourHours: 6.5 }));
    expect(result.findings.some((f) => f.code === "labour_hours_variance")).toBe(true);
  });

  it("flags an invoice-only repair line", () => {
    const invoice = doc({
      lineItems: [
        ...doc().lineItems,
        { description: "DEF doser", kind: "part", quantity: 1, unitPriceCents: 30_000, totalCents: 30_000 },
      ],
    });
    const result = compareEstimateToInvoice(doc(), invoice);
    expect(result.findings.some((f) => f.code === "invoice_only_repair")).toBe(true);
  });

  it("flags removed, quantity, and unit-price changes", () => {
    const estimate = doc();
    const invoice = doc({
      lineItems: [
        { description: "Labour", kind: "labour", quantity: 6, unitPriceCents: 16_000, totalCents: 96_000 },
        // Brake chamber removed
      ],
    });
    const result = compareEstimateToInvoice(estimate, invoice);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain("quantity_change");
    expect(codes).toContain("unit_price_change");
    expect(codes).toContain("removed_line");
  });

  it("detects a duplicate line on the invoice", () => {
    const invoice = doc({
      lineItems: [
        { description: "Shop supplies", kind: "fee", quantity: 1, unitPriceCents: 5_000, totalCents: 5_000 },
        { description: "Shop supplies", kind: "fee", quantity: 1, unitPriceCents: 5_000, totalCents: 5_000 },
      ],
    });
    const result = compareEstimateToInvoice(doc({ lineItems: [] }), invoice);
    expect(result.findings.some((f) => f.code === "duplicate_line")).toBe(true);
  });
});
