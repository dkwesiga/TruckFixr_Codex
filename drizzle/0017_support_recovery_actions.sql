-- Staff-only support recovery audit trail.
--
-- These records make early pilot recovery actions auditable and reversible by
-- preserving before/after snapshots for company, driver, vehicle, pilot-code,
-- and billing-support corrections.

CREATE TABLE IF NOT EXISTS "supportRecoveryActions" (
  "id" serial PRIMARY KEY,
  "actionType" varchar(100) NOT NULL,
  "staffUserId" integer NOT NULL,
  "targetFleetId" integer,
  "targetUserId" integer,
  "targetVehicleId" varchar(64),
  "targetInspectionId" integer,
  "targetDiagnosticCaseId" varchar(128),
  "targetMembershipId" integer,
  "targetPilotCodeId" integer,
  "reason" text NOT NULL,
  "beforeState" jsonb,
  "afterState" jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "supportRecoveryActions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supportRecoveryActions_service_role_full_access" ON "supportRecoveryActions";
CREATE POLICY "supportRecoveryActions_service_role_full_access" ON "supportRecoveryActions"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
