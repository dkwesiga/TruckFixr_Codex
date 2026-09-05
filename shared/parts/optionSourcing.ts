// Sourcing abstraction (Parts Intelligence Phase 2 §4). A `PartOptionSource`
// gathers candidate supplier options for a requirement and returns them
// already normalized into `NormalizedSupplierOption` — the same shape
// `addSupplierOption` persists, so a future real supplier-API adapter is a
// drop-in replacement for `manualEntrySource`/`mockPartOptionSource` below,
// never a parallel write path or a rewrite of comparison/approval logic.
//
// No live source exists in this phase — no supplier API, no scraping, no
// browser automation. `manualEntrySource` is what the router actually uses
// today (a human types in what a supplier quoted); `mockPartOptionSource` is
// for tests only. See docs/architecture/parts-acquisition.md.

import type { AvailabilityState, EtaType, PartCondition } from "./recommendation";

export interface PartOptionSourcingContext {
  partRequirementId: number;
  vehicleId?: string | null;
  candidatePartId?: number | null;
  /** Identifiers already known for the candidate, if any — never invented by a source. */
  oemPartNumber?: string | null;
  manufacturerPartNumber?: string | null;
}

export interface NormalizedSupplierOption {
  supplierName: string;
  supplierContact?: string | null;
  supplierLocation?: string | null;
  externalSupplierId?: string | null;
  quotedPartNumber?: string | null;
  conditionType?: PartCondition | null;
  priceCents?: number | null;
  currency?: string | null;
  freightCents?: number | null;
  coreChargeCents?: number | null;
  stockStatus?: string | null;
  availabilityState?: AvailabilityState | null;
  etaType?: EtaType | null;
  etaAt?: Date | null;
  etaLeadTimeDays?: number | null;
  warrantyText?: string | null;
  returnable?: boolean | null;
  quoteReference?: string | null;
  quoteExpiresAt?: Date | null;
  /** The supplier's own, unverified fitment statement — never TruckFixr's own conclusion. */
  fitmentClaim?: string | null;
  notes?: string | null;
}

export interface PartOptionSource {
  /** A short, stable name for this source — persisted as-is nowhere yet, but useful for logging/debugging which adapter produced an option. */
  name: string;
  sourcePartOptions(context: PartOptionSourcingContext): Promise<NormalizedSupplierOption[]>;
}

/**
 * The source actually used today: a human enters what a supplier told them.
 * There is nothing to "gather" — this exists so the router's addSupplierOption
 * path and any future automated source share the same interface, rather than
 * the manual path being a special case outside the abstraction.
 */
export function manualEntrySource(options: NormalizedSupplierOption[]): PartOptionSource {
  return {
    name: "manual_entry",
    async sourcePartOptions() {
      return options;
    },
  };
}

/**
 * Deterministic, fixed-output source for tests only — proves the sourcing ->
 * normalization -> comparison pipeline works end-to-end without depending on
 * any external system.
 */
export function mockPartOptionSource(fixedOptions: NormalizedSupplierOption[]): PartOptionSource {
  return {
    name: "mock",
    async sourcePartOptions() {
      return fixedOptions;
    },
  };
}

// Future adapters (not implemented — see docs/architecture/parts-acquisition.md):
//   - an approved supplier API/catalog integration,
//   - internal historical-supplier-data lookup (past options captured for
//     similar parts/vehicles, resurfaced as a starting point — still requires
//     a human or a deterministic rule to decide freshness, never assumed
//     current),
//   - a future agent-assisted search, itself constrained by
//     .claude/rules/ai-safety.md's parts AI boundary (may extract/normalize,
//     never fabricate price/stock/warranty/ETA/supplier identity/part numbers).
