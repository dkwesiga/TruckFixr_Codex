import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { findLocalUserByOpenId, shouldUseLocalUsers, upsertLocalUser } from "./_core/localUsers";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: Pool | null = null;
let _authSchemaReady: Promise<void> | null = null;

function createPoolConfig(connectionString: string) {
  const usesSupabase = /supabase\.com/i.test(connectionString);

  return {
    connectionString,
    ssl: usesSupabase ? { rejectUnauthorized: false } : undefined,
  };
}

async function ensureAuthSchema(pool: Pool) {
  if (_authSchemaReady) {
    await _authSchemaReady;
    return;
  }

  _authSchemaReady = (async () => {
    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE user_role AS ENUM ('owner', 'manager', 'driver');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY,
        "openId" varchar(64) NOT NULL,
        "name" text,
        "email" varchar(320),
        "passwordHash" text,
        "loginMethod" varchar(64),
        "role" user_role NOT NULL DEFAULT 'driver',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "lastSignedIn" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "users_openId_unique"
      ON "users" ("openId");
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique"
      ON "users" ("email");
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE vehicle_status AS ENUM ('active', 'maintenance', 'retired');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE inspection_status AS ENUM ('in_progress', 'submitted', 'reviewed');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE defect_severity AS ENUM ('low', 'medium', 'high', 'critical');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE defect_status AS ENUM ('open', 'acknowledged', 'assigned', 'resolved');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE compliance_status AS ENUM ('green', 'yellow', 'red');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE tadis_urgency AS ENUM ('Monitor', 'Attention', 'Critical');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE tadis_recommended_action AS ENUM ('Keep Running', 'Inspect Soon', 'Stop Now');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "fleets" (
        "id" serial PRIMARY KEY,
        "name" varchar(255) NOT NULL,
        "ownerId" integer NOT NULL,
        "planId" integer DEFAULT 1,
        "premiumTadis" boolean DEFAULT false,
        "trialEndsAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "vehicles" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "vin" varchar(17) NOT NULL,
        "licensePlate" varchar(20) NOT NULL,
        "make" varchar(100),
        "model" varchar(100),
        "year" integer,
        "mileage" integer DEFAULT 0,
        "engineHours" integer DEFAULT 0,
        "configuration" jsonb,
        "complianceStatus" compliance_status NOT NULL DEFAULT 'green',
        "status" vehicle_status DEFAULT 'active',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "configuration" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "complianceStatus" compliance_status NOT NULL DEFAULT 'green';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "inspections" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "vehicleId" integer NOT NULL,
        "driverId" integer NOT NULL,
        "templateId" integer,
        "status" inspection_status DEFAULT 'in_progress',
        "complianceStatus" compliance_status NOT NULL DEFAULT 'green',
        "results" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "submittedAt" timestamp,
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "vehicleId" integer;
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "driverId" integer;
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "templateId" integer;
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "status" inspection_status DEFAULT 'in_progress';
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "complianceStatus" compliance_status NOT NULL DEFAULT 'green';
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "results" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "submittedAt" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "inspections"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS "inspections_id_seq";
    `);

    await pool.query(`
      ALTER SEQUENCE "inspections_id_seq"
      OWNED BY "inspections"."id";
    `);

    await pool.query(`
      DO $$
      DECLARE
        inspection_id_data_type text;
        inspection_items_id_data_type text;
        inspection_defects_id_data_type text;
        next_sequence_value bigint;
        inspection_items_fk_name text;
        inspection_defects_fk_name text;
      BEGIN
        SELECT data_type
        INTO inspection_id_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inspections'
          AND column_name = 'id';

        IF inspection_id_data_type IS NULL THEN
          RETURN;
        END IF;

        SELECT data_type
        INTO inspection_items_id_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inspection_items'
          AND column_name = 'inspection_id';

        IF inspection_items_id_data_type IS NOT NULL THEN
          SELECT constraint_name
          INTO inspection_items_fk_name
          FROM information_schema.key_column_usage
          WHERE table_schema = 'public'
            AND table_name = 'inspection_items'
            AND column_name = 'inspection_id'
            AND position_in_unique_constraint IS NOT NULL
          LIMIT 1;

          IF inspection_items_fk_name IS NOT NULL THEN
            EXECUTE format(
              'ALTER TABLE "inspection_items" DROP CONSTRAINT IF EXISTS %I',
              inspection_items_fk_name
            );
          END IF;

          IF inspection_items_id_data_type NOT IN ('smallint', 'integer', 'bigint') THEN
            EXECUTE '
              UPDATE "inspection_items"
              SET "inspection_id" = NULL
              WHERE "inspection_id" IS NOT NULL
                AND trim("inspection_id"::text) !~ ''^\d+$''
            ';

            EXECUTE '
              ALTER TABLE "inspection_items"
              ALTER COLUMN "inspection_id" TYPE integer
              USING CASE
                WHEN "inspection_id" IS NULL THEN NULL
                ELSE trim("inspection_id"::text)::integer
              END
            ';
          END IF;
        END IF;

        SELECT data_type
        INTO inspection_defects_id_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inspection_defects'
          AND column_name = 'inspection_id';

        IF inspection_defects_id_data_type IS NOT NULL THEN
          SELECT constraint_name
          INTO inspection_defects_fk_name
          FROM information_schema.key_column_usage
          WHERE table_schema = 'public'
            AND table_name = 'inspection_defects'
            AND column_name = 'inspection_id'
            AND position_in_unique_constraint IS NOT NULL
          LIMIT 1;

          IF inspection_defects_fk_name IS NOT NULL THEN
            EXECUTE format(
              'ALTER TABLE "inspection_defects" DROP CONSTRAINT IF EXISTS %I',
              inspection_defects_fk_name
            );
          END IF;

          IF inspection_defects_id_data_type NOT IN ('smallint', 'integer', 'bigint') THEN
            EXECUTE '
              UPDATE "inspection_defects"
              SET "inspection_id" = NULL
              WHERE "inspection_id" IS NOT NULL
                AND trim("inspection_id"::text) !~ ''^\d+$''
            ';

            EXECUTE '
              ALTER TABLE "inspection_defects"
              ALTER COLUMN "inspection_id" TYPE integer
              USING CASE
                WHEN "inspection_id" IS NULL THEN NULL
                ELSE trim("inspection_id"::text)::integer
              END
            ';
          END IF;
        END IF;

        EXECUTE '
          SELECT COALESCE(
            MAX(
              CASE
                WHEN trim("id"::text) ~ ''^\d+$'' THEN trim("id"::text)::bigint
                ELSE NULL
              END
            ),
            0::bigint
          )
          FROM "inspections"
        '
        INTO next_sequence_value;

        PERFORM setval(
          '"inspections_id_seq"',
          GREATEST(next_sequence_value, 1),
          true
        );

        IF inspection_id_data_type NOT IN ('smallint', 'integer', 'bigint') THEN
          EXECUTE '
            UPDATE "inspections"
            SET "id" = nextval(''"inspections_id_seq"'')::text
            WHERE "id" IS NULL
               OR trim("id"::text) !~ ''^\d+$''
          ';

          EXECUTE '
            ALTER TABLE "inspections"
            ALTER COLUMN "id" TYPE integer
            USING trim("id"::text)::integer
          ';
        ELSE
          EXECUTE '
            UPDATE "inspections"
            SET "id" = nextval(''"inspections_id_seq"'')
            WHERE "id" IS NULL
          ';
        END IF;

        EXECUTE '
          ALTER TABLE "inspections"
          ALTER COLUMN "id" SET DEFAULT nextval(''"inspections_id_seq"'')
        ';

        EXECUTE '
          SELECT COALESCE(MAX("id")::bigint, 0::bigint)
          FROM "inspections"
        '
        INTO next_sequence_value;

        PERFORM setval(
          '"inspections_id_seq"',
          GREATEST(next_sequence_value, 1),
          true
        );

        IF inspection_items_id_data_type IS NOT NULL THEN
          EXECUTE '
            ALTER TABLE "inspection_items"
            ADD CONSTRAINT "inspection_items_inspection_id_fkey"
            FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id")
            ON DELETE SET NULL
          ';
        END IF;

        IF inspection_defects_id_data_type IS NOT NULL THEN
          EXECUTE '
            ALTER TABLE "inspection_defects"
            ADD CONSTRAINT "inspection_defects_inspection_id_fkey"
            FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id")
            ON DELETE SET NULL
          ';
        END IF;
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "defects" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "vehicleId" integer NOT NULL,
        "inspectionId" integer,
        "driverId" integer NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "category" varchar(100),
        "severity" defect_severity DEFAULT 'medium',
        "complianceStatus" compliance_status NOT NULL DEFAULT 'green',
        "status" defect_status DEFAULT 'open',
        "photoUrls" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "defects"
      ADD COLUMN IF NOT EXISTS "complianceStatus" compliance_status NOT NULL DEFAULT 'green';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "tadisAlerts" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "defectId" integer NOT NULL,
        "urgency" tadis_urgency NOT NULL,
        "recommendedAction" tadis_recommended_action NOT NULL,
        "likelyCause" text,
        "reasoning" text,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
    `);
  })().catch((error) => {
    _authSchemaReady = null;
    throw error;
  });

  await _authSchemaReady;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = new Pool(createPoolConfig(process.env.DATABASE_URL));
      await ensureAuthSchema(_pool);
      _db = drizzle(_pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _pool = null;
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (shouldUseLocalUsers(db)) {
    await upsertLocalUser(user);
    return;
  }

  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'owner';
      updateSet.role = 'owner';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet,
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (shouldUseLocalUsers(db)) {
    return findLocalUserByOpenId(openId);
  }

  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
