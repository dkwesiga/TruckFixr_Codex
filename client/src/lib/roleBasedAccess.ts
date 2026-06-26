export type RoleBasedUser = {
  role?: string | null;
  ownerOperatorMode?: boolean | null;
};

export type RequiredRole = "owner" | "manager" | "driver" | "owner_operator";

function isOwnerOperatorEnabled(user?: RoleBasedUser | null) {
  return user?.role === "owner" && user.ownerOperatorMode === true;
}

export function hasRoleBasedAccess(input: {
  user: RoleBasedUser | null | undefined;
  requiredRoles?: RequiredRole[] | null;
}) {
  const { user, requiredRoles } = input;

  if (!requiredRoles?.length) {
    return true;
  }

  if (!user?.role) {
    return false;
  }

  if (requiredRoles.includes(user.role as RequiredRole)) {
    return true;
  }

  const requiresDriverAccess = requiredRoles.includes("driver");
  const requiresOwnerOperatorAccess = requiredRoles.includes("owner_operator");

  return (
    user.role === "owner" &&
    isOwnerOperatorEnabled(user as { role?: string | null; ownerOperatorMode?: boolean | null }) &&
    (requiresDriverAccess || requiresOwnerOperatorAccess)
  );
}
