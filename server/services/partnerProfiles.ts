import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { partnerProfiles } from "../../drizzle/schema";

export const CONTRIBUTION_POLICIES = [
  "private_only",
  "deidentified_learning",
  "broad_contribution",
] as const;
export type ContributionPolicy = (typeof CONTRIBUTION_POLICIES)[number];

// Find-or-create a partner shop's profile. Mr Diesel's default (§13):
// tenant-private raw records + de-identified TADIS learning contribution.
export async function ensurePartnerProfile(input: {
  fleetId: number;
  businessName?: string | null;
  defaultContributionPolicy?: ContributionPolicy;
}) {
  const db = await getDb();
  if (!db) return null;

  const [existing] = await db
    .select()
    .from(partnerProfiles)
    .where(eq(partnerProfiles.fleetId, input.fleetId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(partnerProfiles)
    .values({
      fleetId: input.fleetId,
      tenantType: "repair_shop",
      businessName: input.businessName ?? null,
      contributionPolicy: input.defaultContributionPolicy ?? "deidentified_learning",
    })
    .returning();
  return created;
}

export async function getPartnerProfile(fleetId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(partnerProfiles)
    .where(eq(partnerProfiles.fleetId, fleetId))
    .limit(1);
  return row ?? null;
}

export async function setContributionPolicy(input: {
  fleetId: number;
  contributionPolicy: ContributionPolicy;
  actorUserId: number;
}) {
  const db = await getDb();
  if (!db) return null;
  await ensurePartnerProfile({ fleetId: input.fleetId });
  const [updated] = await db
    .update(partnerProfiles)
    .set({
      contributionPolicy: input.contributionPolicy,
      contributionPolicySetByUserId: input.actorUserId,
      contributionPolicySetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(partnerProfiles.fleetId, input.fleetId))
    .returning();
  return updated;
}
