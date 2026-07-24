// Invite-code gate for the public "/try-one-case" guest funnel (invite-only phase).
// Pure + fail-closed: when no codes are configured, NO code is valid, so enabling
// the workflow without configuring invites keeps the funnel unreachable rather
// than accidentally opening a safety-relevant tool to the public.

export function parseInviteCodes(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean);
}

export function isInviteValid(
  code: string | undefined | null,
  configured: string[]
): boolean {
  if (configured.length === 0) return false; // fail-closed
  const candidate = code?.trim().toLowerCase();
  if (!candidate) return false;
  return configured.includes(candidate);
}
