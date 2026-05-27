type DatabaseTargetKind = "local" | "staging" | "production" | "unknown_remote";

type VerificationRisk = "test_writes" | "migration";

export type DatabaseTarget = {
  kind: DatabaseTargetKind;
  host: string;
  source: "env" | "url";
};

function readBooleanEnv(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeDeclaredTarget(value: string | undefined): DatabaseTargetKind | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "local") return "local";
  if (normalized === "staging" || normalized === "stage" || normalized === "preview") return "staging";
  if (normalized === "production" || normalized === "prod") return "production";
  return null;
}

export function classifyDatabaseTarget(databaseUrl: string): DatabaseTarget {
  const declared = normalizeDeclaredTarget(process.env.TFX_DATABASE_TARGET);
  let host = "unparseable";

  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    if (!declared) {
      return { kind: "unknown_remote", host, source: "url" };
    }
  }

  if (declared) {
    return { kind: declared, host, source: "env" };
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
  if (localHosts.has(host) || host.endsWith(".local")) {
    return { kind: "local", host, source: "url" };
  }

  return { kind: "unknown_remote", host, source: "url" };
}

export function assertDatabaseVerificationAllowed(input: {
  databaseUrl: string;
  scriptName: string;
  risk: VerificationRisk;
}) {
  const target = classifyDatabaseTarget(input.databaseUrl);

  if (target.kind === "local") {
    return target;
  }

  if (target.kind === "staging" && readBooleanEnv("ALLOW_STAGING_DB_VERIFY_WRITES")) {
    return target;
  }

  if (target.kind === "production" && readBooleanEnv("ALLOW_PRODUCTION_DB_VERIFY_WRITES")) {
    return target;
  }

  const action =
    input.risk === "migration"
      ? "apply schema changes"
      : "write temporary verification rows";
  const approvalHint =
    target.kind === "production"
      ? "Set ALLOW_PRODUCTION_DB_VERIFY_WRITES=true only after Dickson approves the named production verification."
      : "Set TFX_DATABASE_TARGET=staging and ALLOW_STAGING_DB_VERIFY_WRITES=true for a safe staging database, or use a local database.";

  throw new Error(
    [
      `[${input.scriptName}] Refusing to ${action} against database target "${target.kind}" (${target.host}).`,
      "Daily review defaults allow repo-only/local/staging verification, not unclassified remote database writes.",
      approvalHint,
    ].join(" ")
  );
}
