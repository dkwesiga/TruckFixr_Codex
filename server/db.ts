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
      DO $$
      BEGIN
        CREATE TYPE subscription_tier AS ENUM ('free', 'pilot', 'pro', 'fleet');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'pilot';
    `);

    await pool.query(`
      ALTER TYPE subscription_tier ADD VALUE IF NOT EXISTS 'pilot_access';
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE billing_cadence AS ENUM ('monthly', 'annual');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE billing_status AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE pilot_access_code_status AS ENUM ('active', 'expired', 'revoked');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE pilot_access_redemption_status AS ENUM ('active', 'expired', 'revoked', 'converted');
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
        "emailVerified" boolean NOT NULL DEFAULT false,
        "role" user_role NOT NULL DEFAULT 'driver',
        "managerEmail" varchar(320),
        "managerUserId" integer,
        "subscriptionTier" subscription_tier NOT NULL DEFAULT 'free',
        "billingStatus" billing_status NOT NULL DEFAULT 'active',
        "stripeCustomerId" varchar(255),
        "stripeSubscriptionId" varchar(255),
        "currentPeriodStart" timestamp,
        "currentPeriodEnd" timestamp,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        "lastSignedIn" timestamp NOT NULL DEFAULT now(),
        "lastAuthAt" timestamp
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "aiRequestLogs" (
        "id" serial PRIMARY KEY,
        "companyId" integer NOT NULL,
        "assetId" varchar(64) NOT NULL,
        "diagnosticSessionId" varchar(128) NOT NULL,
        "callType" varchar(32) NOT NULL,
        "provider" varchar(32),
        "model" varchar(255),
        "estimatedInputCharacters" integer,
        "estimatedInputTokens" integer,
        "messageCount" integer,
        "maxTokens" integer,
        "temperature" numeric(4,2),
        "responseFormatEnabled" boolean NOT NULL DEFAULT false,
        "simpleTadisMode" boolean NOT NULL DEFAULT false,
        "truncationApplied" boolean NOT NULL DEFAULT false,
        "status" varchar(32) NOT NULL,
        "errorCode" varchar(64),
        "errorMessage" text,
        "fallbackUsed" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now()
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
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "emailVerified" boolean NOT NULL DEFAULT false;
    `);

    await pool.query(`
      UPDATE "users"
      SET "emailVerified" = true
      WHERE "emailVerified" = false
        AND ("loginMethod" IS NULL OR "loginMethod" = 'email');
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "managerEmail" varchar(320);
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "managerUserId" integer;
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "subscriptionTier" subscription_tier NOT NULL DEFAULT 'free';
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "billingCadence" billing_cadence NOT NULL DEFAULT 'monthly';
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "billingStatus" billing_status NOT NULL DEFAULT 'active';
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "stripeCustomerId" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "stripePriceId" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "currentPeriodStart" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "currentPeriodEnd" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "trialStart" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "trialEnd" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false;
    `);

    await pool.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "lastAuthAt" timestamp;
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
        CREATE TYPE asset_type AS ENUM ('tractor', 'straight_truck', 'trailer', 'other');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE company_membership_status AS ENUM ('pending', 'active', 'inactive', 'removed');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE company_invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE company_join_request_status AS ENUM ('pending', 'approved', 'denied', 'cancelled');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE TYPE asset_record_status AS ENUM ('active', 'inactive', 'draft', 'archived');
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
        CREATE TYPE maintenance_type AS ENUM ('repair', 'preventive', 'inspection');
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
        "companyEmail" varchar(320),
        "companyPhone" varchar(50),
        "address" text,
        "inviteCode" varchar(32),
        "subscriptionOwnerUserId" integer,
        "activeVehicleLimit" integer,
        "subscriptionStatus" billing_status NOT NULL DEFAULT 'active',
        "planId" integer DEFAULT 1,
        "premiumTadis" boolean DEFAULT false,
        "trialEndsAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "companyEmail" varchar(320);
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "companyPhone" varchar(50);
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "address" text;
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "inviteCode" varchar(32);
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "subscriptionOwnerUserId" integer;
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "activeVehicleLimit" integer;
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "subscriptionStatus" billing_status NOT NULL DEFAULT 'active';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "vehicles" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "assignedDriverId" integer,
        "unitNumber" varchar(50),
        "vin" varchar(17) NOT NULL,
        "licensePlate" varchar(20) NOT NULL,
        "make" varchar(100),
        "engineMake" varchar(100),
        "model" varchar(100),
        "year" integer,
        "mileage" integer DEFAULT 0,
        "engineHours" integer DEFAULT 0,
        "configuration" jsonb,
        "complianceStatus" compliance_status NOT NULL DEFAULT 'green',
        "status" vehicle_status DEFAULT 'active',
        "assetRecordStatus" asset_record_status NOT NULL DEFAULT 'active',
        "createdByUserId" integer,
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
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "assignedDriverId" integer;
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "unitNumber" varchar(50);
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "licensePlate" varchar(20);
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "engineMake" varchar(100);
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "mileage" integer DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "engineHours" integer DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "complianceStatus" compliance_status NOT NULL DEFAULT 'green';
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "status" vehicle_status DEFAULT 'active';
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "assetType" asset_type NOT NULL DEFAULT 'tractor';
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "assetRecordStatus" asset_record_status NOT NULL DEFAULT 'active';
    `);

    await pool.query(`
      ALTER TABLE "vehicles"
      ADD COLUMN IF NOT EXISTS "createdByUserId" integer;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "vehicleAssignments" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "vehicleId" integer NOT NULL,
        "driverUserId" integer NOT NULL,
        "assignedByUserId" integer NOT NULL,
        "accessType" varchar(32) NOT NULL DEFAULT 'permanent',
        "startsAt" timestamp NOT NULL DEFAULT now(),
        "expiresAt" timestamp,
        "status" varchar(32) NOT NULL DEFAULT 'active',
        "notes" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "companyMemberships" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "userId" integer NOT NULL,
        "role" user_role NOT NULL,
        "status" company_membership_status NOT NULL DEFAULT 'active',
        "approvedByUserId" integer,
        "joinedAt" timestamp NOT NULL DEFAULT now(),
        "removedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "companyInvitations" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "email" varchar(320) NOT NULL,
        "name" varchar(255),
        "role" user_role NOT NULL,
        "inviteToken" varchar(128) NOT NULL,
        "status" company_invitation_status NOT NULL DEFAULT 'pending',
        "invitedByUserId" integer NOT NULL,
        "expiresAt" timestamp NOT NULL,
        "assignedVehicleIds" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "companyJoinRequests" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "userId" integer NOT NULL,
        "inviteCode" varchar(32),
        "note" text,
        "status" company_join_request_status NOT NULL DEFAULT 'pending',
        "reviewedByUserId" integer,
        "reviewedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "vehicleAccessRequests" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "vehicleId" integer,
        "requestedVehicleIdentifier" varchar(255),
        "requestedByDriverId" integer NOT NULL,
        "reason" varchar(64) NOT NULL,
        "note" text,
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "reviewedByUserId" integer,
        "reviewedAt" timestamp,
        "managerNote" text,
        "accessTypeGranted" varchar(32),
        "expiresAt" timestamp,
        "requestedFromUserId" integer,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      DO $$
      BEGIN
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
      EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN undefined_file THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_owner_id_fkey";
      EXCEPTION
        WHEN undefined_table THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'vehicles'
            AND column_name = 'owner_id'
        ) THEN
          EXECUTE 'ALTER TABLE "vehicles" ALTER COLUMN "owner_id" DROP NOT NULL';
        END IF;
      EXCEPTION
        WHEN undefined_table THEN NULL;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      DECLARE
        vehicle_id_data_type text;
      BEGIN
        SELECT data_type
        INTO vehicle_id_data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicles'
          AND column_name = 'id';

        IF vehicle_id_data_type IN ('character varying', 'text') THEN
          EXECUTE 'ALTER TABLE "vehicles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text';
        END IF;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      DECLARE
        target_table text;
        vehicle_id_type text;
      BEGIN
        FOREACH target_table IN ARRAY ARRAY[
          'vehicleAssignments',
          'inspections',
          'inspectionChecklistResponses',
          'inspectionPhotos',
          'randomProofRequests',
          'inspectionFlags',
          'aiTriageRecords',
          'repairOutcomes',
          'inAppAlerts',
          'maintenanceLogs',
          'defects',
          'diagnosticReviewQueue'
        ]
        LOOP
          SELECT data_type
          INTO vehicle_id_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = target_table
            AND column_name = 'vehicleId';

          IF vehicle_id_type IN ('smallint', 'integer', 'bigint') THEN
            EXECUTE format('ALTER TABLE %I ALTER COLUMN "vehicleId" TYPE varchar(64) USING trim("vehicleId"::text)', target_table);
          END IF;
        END LOOP;
      END
      $$;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'vehicles'
            AND column_name = 'license_plate'
        ) THEN
          EXECUTE 'UPDATE "vehicles" SET "licensePlate" = COALESCE("licensePlate", "license_plate")';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'vehicles'
            AND column_name = 'current_mileage'
        ) THEN
          EXECUTE 'UPDATE "vehicles" SET "mileage" = COALESCE("mileage", "current_mileage", 0)';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'vehicles'
            AND column_name = 'compliance_status'
        ) THEN
          EXECUTE '
            UPDATE "vehicles"
            SET "complianceStatus" = COALESCE(
              "complianceStatus",
              CASE upper("compliance_status"::text)
                WHEN ''RED'' THEN ''red''::compliance_status
                WHEN ''YELLOW'' THEN ''yellow''::compliance_status
                ELSE ''green''::compliance_status
              END
            )
          ';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'vehicles'
            AND column_name = 'created_at'
        ) THEN
          EXECUTE 'UPDATE "vehicles" SET "createdAt" = COALESCE("createdAt", "created_at", now())';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'vehicles'
            AND column_name = 'updated_at'
        ) THEN
          EXECUTE 'UPDATE "vehicles" SET "updatedAt" = COALESCE("updatedAt", "updated_at", now())';
        END IF;

        EXECUTE 'UPDATE "vehicles" SET "fleetId" = COALESCE("fleetId", 1)';
      END
      $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" serial PRIMARY KEY,
        "userId" integer NOT NULL,
        "fleetId" integer,
        "stripeCustomerId" varchar(255),
        "stripeSubscriptionId" varchar(255),
        "stripePriceId" varchar(255),
        "tier" subscription_tier NOT NULL DEFAULT 'free',
        "billingCadence" billing_cadence NOT NULL DEFAULT 'monthly',
        "billingStatus" billing_status NOT NULL DEFAULT 'active',
        "currentPeriodStart" timestamp,
        "currentPeriodEnd" timestamp,
        "trialStart" timestamp,
        "trialEnd" timestamp,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "userId" integer;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "stripeCustomerId" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "stripePriceId" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "tier" subscription_tier NOT NULL DEFAULT 'free';
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "billingCadence" billing_cadence NOT NULL DEFAULT 'monthly';
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "billingStatus" billing_status NOT NULL DEFAULT 'active';
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "currentPeriodStart" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "currentPeriodEnd" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "trialStart" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "trialEnd" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false;
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "pilotAccessCodes" (
        "id" serial PRIMARY KEY,
        "code" varchar(128) NOT NULL,
        "fleetName" varchar(255),
        "status" pilot_access_code_status NOT NULL DEFAULT 'active',
        "maxUsers" integer NOT NULL DEFAULT 1,
        "maxVehicles" integer NOT NULL DEFAULT 3,
        "activationDurationDays" integer NOT NULL DEFAULT 14,
        "hardExpiryDate" timestamp,
        "activatedAt" timestamp,
        "expiresAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "pilotAccessCodes_code_unique"
      ON "pilotAccessCodes" ("code");
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "fleetName" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "status" pilot_access_code_status NOT NULL DEFAULT 'active';
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "maxUsers" integer NOT NULL DEFAULT 1;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "maxVehicles" integer NOT NULL DEFAULT 3;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "activationDurationDays" integer NOT NULL DEFAULT 14;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "hardExpiryDate" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "activatedAt" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "expiresAt" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessCodes"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "fleets"
      ADD COLUMN IF NOT EXISTS "salesStatus" varchar(64) DEFAULT 'none';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "fleetQuoteRequests" (
        "id" serial PRIMARY KEY,
        "userId" integer,
        "fleetId" integer,
        "companyName" varchar(255) NOT NULL,
        "contactName" varchar(255) NOT NULL,
        "email" varchar(320) NOT NULL,
        "phone" varchar(50),
        "vehicleCount" integer NOT NULL DEFAULT 0,
        "driverCount" integer NOT NULL DEFAULT 0,
        "mainNeeds" text NOT NULL,
        "notes" text,
        "status" varchar(64) NOT NULL DEFAULT 'pending_fleet_review',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "adminAlerts" (
        "id" serial PRIMARY KEY,
        "userId" integer,
        "fleetId" integer,
        "type" varchar(100) NOT NULL,
        "title" varchar(255) NOT NULL,
        "body" text,
        "metadata" jsonb,
        "status" varchar(64) NOT NULL DEFAULT 'open',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "pilotAccessRedemptions" (
        "id" serial PRIMARY KEY,
        "codeId" integer NOT NULL,
        "userId" integer NOT NULL,
        "fleetId" integer NOT NULL,
        "activatedAt" timestamp NOT NULL,
        "expiresAt" timestamp NOT NULL,
        "status" pilot_access_redemption_status NOT NULL DEFAULT 'active',
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "codeId" integer;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "userId" integer;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "activatedAt" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "expiresAt" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "status" pilot_access_redemption_status NOT NULL DEFAULT 'active';
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessRedemptions"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "pilotAccessEvents" (
        "id" serial PRIMARY KEY,
        "userId" integer,
        "fleetId" integer,
        "codeId" integer,
        "eventType" varchar(100) NOT NULL,
        "eventMetadata" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessEvents"
      ADD COLUMN IF NOT EXISTS "userId" integer;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessEvents"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessEvents"
      ADD COLUMN IF NOT EXISTS "codeId" integer;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessEvents"
      ADD COLUMN IF NOT EXISTS "eventType" varchar(100);
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessEvents"
      ADD COLUMN IF NOT EXISTS "eventMetadata" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "pilotAccessEvents"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "aiUsageLogs" (
        "id" serial PRIMARY KEY,
        "userId" integer NOT NULL,
        "fleetId" integer,
        "vehicleId" integer,
        "usageType" varchar(100) NOT NULL,
        "provider" varchar(100),
        "model" varchar(150),
        "promptTokens" integer NOT NULL DEFAULT 0,
        "completionTokens" integer NOT NULL DEFAULT 0,
        "totalTokens" integer NOT NULL DEFAULT 0,
        "latencyMs" integer,
        "estimatedCostUsd" numeric(10, 6),
        "metadata" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "userId" integer;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "vehicleId" integer;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "usageType" varchar(100);
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "provider" varchar(100);
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "model" varchar(150);
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "promptTokens" integer NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "completionTokens" integer NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "totalTokens" integer NOT NULL DEFAULT 0;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "latencyMs" integer;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "estimatedCostUsd" numeric(10, 6);
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "metadata" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "aiUsageLogs"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
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
          EXECUTE 'ALTER TABLE "inspection_items" DROP CONSTRAINT IF EXISTS "inspection_items_inspection_id_fkey"';

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
          EXECUTE 'ALTER TABLE "inspection_defects" DROP CONSTRAINT IF EXISTS "inspection_defects_inspection_id_fkey"';

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
      DO $$
      BEGIN
        ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_vehicle_id_fkey";
        ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_inspector_id_fkey";

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'inspections'
            AND column_name = 'vehicle_id'
        ) THEN
          EXECUTE 'ALTER TABLE "inspections" ALTER COLUMN "vehicle_id" DROP NOT NULL';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'inspections'
            AND column_name = 'inspector_id'
        ) THEN
          EXECUTE 'ALTER TABLE "inspections" ALTER COLUMN "inspector_id" DROP NOT NULL';
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
      CREATE TABLE IF NOT EXISTS "activityLogs" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "userId" integer NOT NULL,
        "action" varchar(255) NOT NULL,
        "entityType" varchar(100),
        "entityId" integer,
        "details" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "userId" integer;
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "action" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "entityType" varchar(100);
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "entityId" integer;
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "details" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "activityLogs"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "maintenanceLogs" (
        "id" serial PRIMARY KEY,
        "fleetId" integer NOT NULL,
        "vehicleId" integer NOT NULL,
        "defectId" integer,
        "type" maintenance_type NOT NULL,
        "description" text,
        "cost" numeric(10, 2),
        "completedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "vehicleId" integer;
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "defectId" integer;
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "type" maintenance_type;
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "description" text;
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "cost" numeric(10, 2);
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "completedAt" timestamp;
    `);

    await pool.query(`
      ALTER TABLE "maintenanceLogs"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "diagnosticReviewQueue" (
        "id" serial PRIMARY KEY,
        "fleetId" integer,
        "vehicleId" integer NOT NULL,
        "reviewType" varchar(64) NOT NULL,
        "status" varchar(64) NOT NULL DEFAULT 'review_pending',
        "summary" text,
        "baselineTopCause" varchar(255),
        "finalTopCause" varchar(255),
        "confidenceDelta" numeric(8, 2),
        "evidenceSnapshot" jsonb,
        "baselineRanking" jsonb,
        "finalRanking" jsonb,
        "rationale" jsonb,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "fleetId" integer;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "vehicleId" integer;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "reviewType" varchar(64);
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "status" varchar(64) NOT NULL DEFAULT 'review_pending';
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "summary" text;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "baselineTopCause" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "finalTopCause" varchar(255);
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "confidenceDelta" numeric(8, 2);
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "evidenceSnapshot" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "baselineRanking" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "finalRanking" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "rationale" jsonb;
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
    `);

    await pool.query(`
      ALTER TABLE "diagnosticReviewQueue"
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now();
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

    const textFields = ["name", "email", "loginMethod", "managerEmail"] as const;
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

    if (user.managerUserId !== undefined) {
      values.managerUserId = user.managerUserId;
      updateSet.managerUserId = user.managerUserId;
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

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (shouldUseLocalUsers(db)) {
    return undefined;
  }

  if (!db) {
    console.warn("[Database] Cannot get user by email: database not available");
    return undefined;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
