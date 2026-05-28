type OwnerOperatorUser = {
  id?: number | null;
  name?: string | null;
  role?: string | null;
  ownerOperatorMode?: boolean | null;
};

export const OWNER_OPERATOR_SELF_ASSIGNMENT_PREFIX =
  "OWNER_OPERATOR_SELF_ASSIGNMENT:";

export type OwnerOperatorSelfAssignmentMetadata = {
  ownerOperatorUserId: number;
  ownerOperatorName: string | null;
  previousDriverUserId: number | null;
  previousDriverName: string | null;
  assignedAt: string;
};

export function isOwnerOperatorEnabled(user?: OwnerOperatorUser | null) {
  return user?.role === "owner" && user.ownerOperatorMode === true;
}

export function isDriverLikeUser(user?: OwnerOperatorUser | null) {
  if (!user) return false;
  if (user.role === "driver") return true;
  return isOwnerOperatorEnabled(user);
}

export function buildOwnerOperatorSelfAssignmentNote(
  metadata: OwnerOperatorSelfAssignmentMetadata
) {
  return `${OWNER_OPERATOR_SELF_ASSIGNMENT_PREFIX}${JSON.stringify(metadata)}`;
}

export function parseOwnerOperatorSelfAssignmentNote(note?: string | null) {
  if (!note?.startsWith(OWNER_OPERATOR_SELF_ASSIGNMENT_PREFIX)) {
    return null;
  }

  const payload = note.slice(OWNER_OPERATOR_SELF_ASSIGNMENT_PREFIX.length);
  try {
    const parsed = JSON.parse(payload) as OwnerOperatorSelfAssignmentMetadata;
    if (
      typeof parsed.ownerOperatorUserId !== "number" ||
      typeof parsed.assignedAt !== "string"
    ) {
      return null;
    }

    return {
      ownerOperatorUserId: parsed.ownerOperatorUserId,
      ownerOperatorName: parsed.ownerOperatorName ?? null,
      previousDriverUserId: parsed.previousDriverUserId ?? null,
      previousDriverName: parsed.previousDriverName ?? null,
      assignedAt: parsed.assignedAt,
    };
  } catch {
    return null;
  }
}

export function isOwnerOperatorSelfAssignmentNote(note?: string | null) {
  return parseOwnerOperatorSelfAssignmentNote(note) != null;
}
