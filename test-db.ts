import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { fleets } from "./drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from './server/_core/env';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  try {
    // Try to run the query that failed
    const result = await db.select().from(fleets).where(eq(fleets.id, 1)).limit(1);
    console.log("Query succeeded:", result);
  } catch (error) {
    console.error("Query failed:", error);
  } finally {
    await pool.end();
  }
}

main();
