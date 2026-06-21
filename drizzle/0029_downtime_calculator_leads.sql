-- Fleet Downtime Cost Calculator leads.
--
-- Captures leads submitted from the public downtime calculator (landing-page
-- modal and the /fleet-downtime-cost-calculator page). Inputs and the
-- server-recalculated downtime estimate are stored together.
--
-- This migration is written for Postgres / Supabase. TruckFixr applies it with
-- the rest of the Drizzle migrations (`pnpm db:push`); it can also be run by
-- hand against the database. It is intentionally idempotent.

CREATE TABLE IF NOT EXISTS "downtime_calculator_leads" (
  "id" serial PRIMARY KEY,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  -- Lead contact details
  "name" varchar(255) NOT NULL,
  "email" varchar(320) NOT NULL,
  "phone" varchar(50),
  "company" varchar(255) NOT NULL,
  "role" varchar(255) NOT NULL,
  "fleet_size" integer NOT NULL,
  "vehicle_types" text,
  "current_maintenance_workflow" varchar(64),
  "biggest_downtime_issue" text,
  -- Calculator inputs (as submitted)
  "affected_vehicles_per_month" integer,
  "average_downtime_days" numeric,
  "revenue_per_vehicle_per_day" numeric,
  "driver_labour_cost_per_day" numeric,
  "repair_decision_delay_days" numeric,
  "repeat_repair_events_per_month" integer,
  -- Server-recalculated results
  "downtime_cost_per_vehicle_per_day" numeric,
  "monthly_direct_downtime_cost" numeric,
  "decision_delay_cost" numeric,
  "repeat_repair_risk_cost" numeric,
  "estimated_monthly_downtime_exposure" numeric,
  "estimated_annual_downtime_exposure" numeric,
  "workflow_risk_score" integer,
  "workflow_risk_band" varchar(32),
  -- Attribution
  "source" varchar(64) NOT NULL DEFAULT 'fleet_downtime_cost_calculator',
  "page_path" varchar(255),
  "user_agent" text,
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "downtime_calculator_leads_created_at_idx"
  ON "downtime_calculator_leads" ("createdAt");
CREATE INDEX IF NOT EXISTS "downtime_calculator_leads_email_idx"
  ON "downtime_calculator_leads" ("email");
CREATE INDEX IF NOT EXISTS "downtime_calculator_leads_company_idx"
  ON "downtime_calculator_leads" ("company");
CREATE INDEX IF NOT EXISTS "downtime_calculator_leads_fleet_size_idx"
  ON "downtime_calculator_leads" ("fleet_size");
CREATE INDEX IF NOT EXISTS "downtime_calculator_leads_workflow_risk_score_idx"
  ON "downtime_calculator_leads" ("workflow_risk_score");

-- Row-Level Security.
--
-- Calculator leads are private. All writes happen through the trusted backend
-- (tRPC `downtimeCalculator.submit`), which connects with the service role.
-- Public/anon and authenticated Supabase API clients must NOT be able to read
-- or write this table: enabling RLS with no anon/authenticated policy denies
-- them by default. The service_role policy below mirrors the project-wide
-- convention in 0012_enable_public_table_rls.sql.
ALTER TABLE "downtime_calculator_leads" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_role_full_access" ON "downtime_calculator_leads";
    CREATE POLICY "service_role_full_access"
      ON "downtime_calculator_leads"
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
