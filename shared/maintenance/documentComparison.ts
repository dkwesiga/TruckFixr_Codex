// Deterministic estimate-to-invoice comparison. Pure, integer-minor-units only.
// This code makes NO judgement about overbilling — it surfaces "Items to verify"
// with concrete evidence. AI (if any) extracts; this deterministic code compares.

import { DOCUMENT_REVIEW_THRESHOLDS as T } from "./documentLimits";

export interface DocumentLineItem {
  description: string;
  kind: "labour" | "part" | "fee";
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface DocumentFinancials {
  currency: string; // ISO 4217, e.g. "CAD"
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  labourHours?: number | null;
  lineItems: DocumentLineItem[];
}

export type FindingSeverity = "info" | "verify" | "high";

export interface ComparisonFinding {
  code:
    | "currency_mismatch"
    | "total_variance"
    | "high_total_variance"
    | "subtotal_variance"
    | "tax_mismatch"
    | "labour_hours_variance"
    | "added_line"
    | "removed_line"
    | "quantity_change"
    | "unit_price_change"
    | "duplicate_line"
    | "invoice_only_repair";
  severity: FindingSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface ComparisonResult {
  comparable: boolean; // false when currencies differ with no rate
  currency: string | null;
  findings: ComparisonFinding[];
  totals: {
    estimateTotalCents: number;
    invoiceTotalCents: number;
    deltaCents: number;
    deltaPercent: number | null;
  } | null;
}

function normalizeKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

function pctChange(from: number, to: number): number | null {
  if (from === 0) return to === 0 ? 0 : null;
  return (to - from) / Math.abs(from);
}

// Detect duplicate line items within a single document (same description + unit
// price appearing more than once).
function findDuplicateLines(doc: DocumentFinancials, label: string): ComparisonFinding[] {
  const seen = new Map<string, number>();
  for (const item of doc.lineItems) {
    const key = `${normalizeKey(item.description)}|${item.unitPriceCents}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const findings: ComparisonFinding[] = [];
  for (const [key, count] of seen) {
    if (count > 1) {
      findings.push({
        code: "duplicate_line",
        severity: "verify",
        message: `Possible duplicate line on the ${label} (${count}×).`,
        details: { key, count, document: label },
      });
    }
  }
  return findings;
}

export function compareEstimateToInvoice(
  estimate: DocumentFinancials,
  invoice: DocumentFinancials
): ComparisonResult {
  // Currency restriction: never compare amounts across currencies without a rate.
  if (estimate.currency !== invoice.currency) {
    return {
      comparable: false,
      currency: null,
      findings: [
        {
          code: "currency_mismatch",
          severity: "verify",
          message: `Estimate is in ${estimate.currency} but the invoice is in ${invoice.currency}. Amounts were not compared (no exchange rate provided).`,
          details: { estimateCurrency: estimate.currency, invoiceCurrency: invoice.currency },
        },
      ],
      totals: null,
    };
  }

  const findings: ComparisonFinding[] = [];
  const currency = estimate.currency;

  // ---- Total variance ----
  const deltaCents = invoice.totalCents - estimate.totalCents;
  const totalPct = pctChange(estimate.totalCents, invoice.totalCents);
  const absDelta = Math.abs(deltaCents);

  const highByPct = totalPct != null && Math.abs(totalPct) >= T.highVariancePercent;
  const highByAmt = absDelta >= T.highVarianceAmountCents;
  const flagByPct = totalPct != null && Math.abs(totalPct) >= T.totalVariancePercent;
  const flagByAmt = absDelta >= T.totalVarianceAmountCents;

  if (highByPct && highByAmt) {
    findings.push({
      code: "high_total_variance",
      severity: "high",
      message: `Invoice total differs from the estimate by ${(totalPct! * 100).toFixed(1)}% (${deltaCents} cents).`,
      details: { deltaCents, totalPct },
    });
  } else if (flagByPct && flagByAmt) {
    findings.push({
      code: "total_variance",
      severity: "verify",
      message: `Invoice total differs from the estimate by ${(totalPct! * 100).toFixed(1)}% (${deltaCents} cents).`,
      details: { deltaCents, totalPct },
    });
  }

  // ---- Subtotal variance (flag when it crosses the base amount threshold) ----
  const subtotalDelta = invoice.subtotalCents - estimate.subtotalCents;
  if (Math.abs(subtotalDelta) >= T.totalVarianceAmountCents) {
    findings.push({
      code: "subtotal_variance",
      severity: "verify",
      message: `Subtotal differs by ${subtotalDelta} cents.`,
      details: { subtotalDelta },
    });
  }

  // ---- Tax mismatch (only outside tolerance; do not assume all charges taxable) ----
  if (Math.abs(invoice.taxCents - estimate.taxCents) > T.taxToleranceCents) {
    findings.push({
      code: "tax_mismatch",
      severity: "verify",
      message: `Tax differs by ${invoice.taxCents - estimate.taxCents} cents (beyond the ${T.taxToleranceCents}-cent tolerance).`,
      details: { estimateTaxCents: estimate.taxCents, invoiceTaxCents: invoice.taxCents },
    });
  }

  // ---- Labour hours variance ----
  if (estimate.labourHours != null && invoice.labourHours != null) {
    const hoursDelta = invoice.labourHours - estimate.labourHours;
    if (Math.abs(hoursDelta) >= T.labourHoursVariance) {
      findings.push({
        code: "labour_hours_variance",
        severity: "verify",
        message: `Labour hours differ by ${hoursDelta}.`,
        details: { estimateHours: estimate.labourHours, invoiceHours: invoice.labourHours },
      });
    }
  }

  // ---- Line-level diff (matched by normalized description) ----
  const estByKey = new Map(estimate.lineItems.map((i) => [normalizeKey(i.description), i]));
  const invByKey = new Map(invoice.lineItems.map((i) => [normalizeKey(i.description), i]));

  for (const [key, inv] of invByKey) {
    const est = estByKey.get(key);
    if (!est) {
      findings.push({
        code: inv.kind === "labour" || inv.kind === "part" ? "invoice_only_repair" : "added_line",
        severity: inv.totalCents >= T.addedLineItemAmountCents ? "verify" : "info",
        message: `Line on the invoice not present on the estimate: "${inv.description}" (${inv.totalCents} cents).`,
        details: { description: inv.description, totalCents: inv.totalCents },
      });
      continue;
    }
    if (inv.quantity !== est.quantity) {
      findings.push({
        code: "quantity_change",
        severity: "verify",
        message: `Quantity changed for "${inv.description}": ${est.quantity} → ${inv.quantity}.`,
        details: { description: inv.description, from: est.quantity, to: inv.quantity },
      });
    }
    if (inv.unitPriceCents !== est.unitPriceCents) {
      findings.push({
        code: "unit_price_change",
        severity: "verify",
        message: `Unit price changed for "${inv.description}": ${est.unitPriceCents} → ${inv.unitPriceCents} cents.`,
        details: { description: inv.description, from: est.unitPriceCents, to: inv.unitPriceCents },
      });
    }
  }

  for (const [key, est] of estByKey) {
    if (!invByKey.has(key)) {
      findings.push({
        code: "removed_line",
        severity: "info",
        message: `Line on the estimate not present on the invoice: "${est.description}".`,
        details: { description: est.description },
      });
    }
  }

  findings.push(...findDuplicateLines(invoice, "invoice"));

  return {
    comparable: true,
    currency,
    findings,
    totals: {
      estimateTotalCents: estimate.totalCents,
      invoiceTotalCents: invoice.totalCents,
      deltaCents,
      deltaPercent: totalPct,
    },
  };
}

// Whether any finding is a HIGH-severity variance (blocks delegated authorization).
export function hasUnresolvedHighVariance(result: ComparisonResult): boolean {
  return result.findings.some((f) => f.severity === "high");
}
