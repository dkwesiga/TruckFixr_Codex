type OwnerOperatorUser = {
  role?: string | null;
  ownerOperatorMode?: boolean | null;
};

export function isOwnerOperatorEnabled(user?: OwnerOperatorUser | null) {
  return user?.role === "owner" && user.ownerOperatorMode === true;
}

export function canUseDriverWorkflows(user?: OwnerOperatorUser | null) {
  if (!user) return false;
  if (user.role === "driver" || user.role === "manager") return true;
  return isOwnerOperatorEnabled(user);
}

