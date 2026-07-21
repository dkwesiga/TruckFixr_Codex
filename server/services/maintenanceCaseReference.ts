import { sql } from "drizzle-orm";
import { formatCaseReference } from "@shared/maintenance/caseWorkflow";

type Db = { execute: (query: unknown) => Promise<unknown> };

// Generate the next globally-unique, immutable case reference MC-{YEAR}-{seq}
// using a PostgreSQL sequence. Never counts rows (gap-tolerant, race-free).
export async function nextCaseReference(db: Db, now = new Date()): Promise<string> {
  const result = (await db.execute(
    sql`SELECT nextval('maintenance_case_seq') AS seq`
  )) as { rows?: Array<{ seq: string | number }> } | Array<{ seq: string | number }>;

  // node-postgres via drizzle returns { rows: [...] }; be defensive either way.
  const rows = Array.isArray(result) ? result : (result.rows ?? []);
  const seqValue = rows[0]?.seq ?? 0;
  const sequence = typeof seqValue === "string" ? parseInt(seqValue, 10) : Number(seqValue);
  return formatCaseReference(now.getFullYear(), sequence);
}
