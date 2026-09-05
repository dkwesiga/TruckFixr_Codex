// Pure normalization for part-number matching (Parts Intelligence Phase 1).
// No DB, no AI — this only reshapes a string the caller already provided so
// two representations of the same number ("RE-12345", "re12345") compare
// equal. It never generates, guesses, or completes a part number.

/**
 * Normalize a part number for equality comparison: trim, uppercase, and
 * strip common separators (spaces, hyphens, dots). Returns null for empty/
 * missing input rather than an empty string, so callers can distinguish
 * "no number given" from "matched an empty string".
 */
export function normalizePartNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase().replace(/[\s\-.]/g, "");
  return normalized.length > 0 ? normalized : null;
}

export function partNumbersMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizePartNumber(a);
  const nb = normalizePartNumber(b);
  return na !== null && nb !== null && na === nb;
}
