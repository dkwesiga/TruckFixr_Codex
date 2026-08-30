-- Stripe webhook idempotency ledger. Replaces the in-process Set dedupe in
-- server/_core/stripeBillingRoutes.ts, which doesn't survive a restart or
-- hold across multiple server instances. The event id is the primary key,
-- so a duplicate delivery is rejected by the DB constraint.
CREATE TABLE IF NOT EXISTS "stripeWebhookEvents" (
  "id" varchar(255) PRIMARY KEY,
  "type" varchar(255) NOT NULL,
  "receivedAt" timestamp NOT NULL DEFAULT now()
);

-- Lock it down like every other service-role-only table (see
-- 0056_repair_shop_workflow_phase1.sql for the same pattern): RLS on,
-- access via the service-role connection only.
ALTER TABLE "stripeWebhookEvents" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    DROP POLICY IF EXISTS "stripeWebhookEvents_service_role_full_access" ON "stripeWebhookEvents";
    CREATE POLICY "stripeWebhookEvents_service_role_full_access" ON "stripeWebhookEvents"
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
