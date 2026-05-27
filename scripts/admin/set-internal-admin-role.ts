import "dotenv/config";
import { Pool } from "pg";
import { classifyDatabaseTarget } from "../verify/db-target-guard";

type InternalAdminRole = "super_admin" | "admin" | "read_only_viewer";

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      args.set("dryRun", true);
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      args.set(key, value);
      index += 1;
    }
  }

  return {
    email: String(args.get("email") ?? "").trim().toLowerCase(),
    role: String(args.get("role") ?? "").trim() as InternalAdminRole,
    dryRun: args.get("dryRun") === true,
  };
}

function isAllowedRole(value: string): value is InternalAdminRole {
  return value === "super_admin" || value === "admin" || value === "read_only_viewer";
}

function readBooleanEnv(name: string) {
  return /^(1|true|yes)$/i.test(process.env[name]?.trim() ?? "");
}

function assertWriteAllowed(databaseUrl: string) {
  const target = classifyDatabaseTarget(databaseUrl);

  if (target.kind === "local") {
    return target;
  }

  if (target.kind === "staging" && readBooleanEnv("ALLOW_STAGING_DB_VERIFY_WRITES")) {
    return target;
  }

  if (target.kind === "production" && readBooleanEnv("ALLOW_PRODUCTION_ADMIN_WRITE")) {
    return target;
  }

  throw new Error(
    [
      `[set-internal-admin-role] Refusing to write against database target "${target.kind}" (${target.host}).`,
      "Set TFX_DATABASE_TARGET=production and ALLOW_PRODUCTION_ADMIN_WRITE=true only for an explicitly approved production admin-role change.",
    ].join(" ")
  );
}

async function main() {
  const { email, role, dryRun } = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  if (!email) {
    throw new Error("Use --email <address>.");
  }

  if (!isAllowedRole(role)) {
    throw new Error("Use --role super_admin|admin|read_only_viewer.");
  }

  const target = classifyDatabaseTarget(databaseUrl);
  if (!dryRun) {
    assertWriteAllowed(databaseUrl);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: /supabase\.com/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const existing = await pool.query(
      `
        SELECT "id", "email", "role", "internalAdminRole", "updatedAt"
        FROM "users"
        WHERE lower("email") = $1
        LIMIT 1
      `,
      [email]
    );

    if (existing.rowCount === 0) {
      throw new Error(`No user found for ${email}.`);
    }

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: "dry_run",
            databaseTarget: target.kind,
            user: existing.rows[0],
          },
          null,
          2
        )
      );
      return;
    }

    const updated = await pool.query(
      `
        UPDATE "users"
        SET "internalAdminRole" = $2,
            "updatedAt" = NOW()
        WHERE lower("email") = $1
        RETURNING "id", "email", "role", "internalAdminRole", "updatedAt"
      `,
      [email, role]
    );

    console.log(
      JSON.stringify(
        {
          mode: "write",
          databaseTarget: target.kind,
          user: updated.rows[0],
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
