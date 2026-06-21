-- Privacy-first funnel events.
--
-- Captures redacted, anonymous product/funnel events (no names, emails, phones,
-- VINs, plates, or other PII) so TruckFixr can measure demo conversion,
-- activation, and diagnosis drop-off without a third-party analytics SDK.
-- Written only by the trusted backend (POST /api/events); not publicly readable.
--
-- Postgres / Supabase. Idempotent.

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" serial PRIMARY KEY,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "name" varchar(120) NOT NULL,
  "session_id" varchar(64),
  "path" varchar(255),
  "role" varchar(32),
  "fleet_id" integer,
  "properties" jsonb
);

CREATE INDEX IF NOT EXISTS "analytics_events_name_created_idx"
  ON "analytics_events" ("name", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_session_idx"
  ON "analytics_events" ("session_id");

-- Row-Level Security: events are backend-written and not publicly readable.
-- Enabling RLS with no anon/authenticated policy denies them by default; the
-- service_role policy mirrors the project convention (0012).
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_role_full_access" ON "analytics_events";
    CREATE POLICY "service_role_full_access"
      ON "analytics_events"
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
