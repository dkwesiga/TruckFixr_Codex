import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { parts } from "../../drizzle/schema";
import { normalizePartNumber } from "@shared/parts/partNumberNormalization";

// Deterministic part-identity resolution (Parts Intelligence Phase 1). No AI
// call, no external supplier API — this only matches identifiers the caller
// already supplied against the shared `parts` catalog, or records a NEW
// catalog entry from a number the caller explicitly provided. It never
// invents an OEM number, a cross-reference, or a supersession — an
// unresolved candidate stays unresolved (`partId: null`), which is a valid,
// honest result, not an error. See .claude/skills/truckfixr-parts-fitment/SKILL.md.

export interface IdentifyPartCandidateInput {
  oemPartNumber?: string | null;
  manufacturerPartNumber?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  category?: string | null;
}

export type PartIdentificationMatchType =
  | "existing_catalog_match"
  | "created_from_provided_number"
  | "unresolved";

export interface IdentifyPartCandidateResult {
  partId: number | null;
  matchType: PartIdentificationMatchType;
}

async function findExistingPart(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  oemNormalized: string | null,
  mfrNormalized: string | null
) {
  if (!oemNormalized && !mfrNormalized) return null;

  const candidates = await db.select().from(parts);
  for (const candidate of candidates) {
    const candidateOem = normalizePartNumber(candidate.oemPartNumber);
    const candidateMfr = normalizePartNumber(candidate.manufacturerPartNumber);
    if (oemNormalized && candidateOem === oemNormalized) return candidate;
    if (mfrNormalized && candidateMfr === mfrNormalized) return candidate;

    const crossRefs = Array.isArray(candidate.crossReferences)
      ? (candidate.crossReferences as Array<{ number?: string }>)
      : [];
    for (const ref of crossRefs) {
      const refNormalized = normalizePartNumber(ref?.number);
      if (
        (oemNormalized && refNormalized === oemNormalized) ||
        (mfrNormalized && refNormalized === mfrNormalized)
      ) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Resolve a part candidate against the shared catalog. Never fabricates a
 * number: if neither an OEM nor a manufacturer part number is supplied, the
 * result is `unresolved` regardless of how detailed the free-text
 * description is (a description is not an identifier).
 */
export async function identifyPartCandidate(
  input: IdentifyPartCandidateInput
): Promise<IdentifyPartCandidateResult> {
  const db = await getDb();
  if (!db) return { partId: null, matchType: "unresolved" };

  const oemNormalized = normalizePartNumber(input.oemPartNumber);
  const mfrNormalized = normalizePartNumber(input.manufacturerPartNumber);

  const existing = await findExistingPart(db, oemNormalized, mfrNormalized);
  if (existing) {
    return { partId: existing.id, matchType: "existing_catalog_match" };
  }

  if (!oemNormalized && !mfrNormalized) {
    return { partId: null, matchType: "unresolved" };
  }

  // A real, caller-supplied number with no existing catalog match: record it
  // as a new catalog entry using exactly what was given — never inferring a
  // manufacturer/category/cross-reference that wasn't provided.
  const [created] = await db
    .insert(parts)
    .values({
      manufacturer: input.manufacturer ?? null,
      oemPartNumber: input.oemPartNumber ?? null,
      manufacturerPartNumber: input.manufacturerPartNumber ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
    })
    .returning();

  return { partId: created?.id ?? null, matchType: "created_from_provided_number" };
}

export async function getPart(partId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(parts).where(eq(parts.id, partId)).limit(1);
  return row ?? null;
}
