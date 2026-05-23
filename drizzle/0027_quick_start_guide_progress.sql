CREATE TABLE IF NOT EXISTS "quickStartGuideProgress" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "fleetId" integer,
  "role" varchar(64) NOT NULL,
  "manualSlug" varchar(80) NOT NULL,
  "manualViewedAt" timestamp,
  "manualCompletedAt" timestamp,
  "completionSource" varchar(64),
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "quickStartGuideProgress_user_manual_idx"
  ON "quickStartGuideProgress" ("userId", "manualSlug", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "quickStartGuideProgress_fleet_role_idx"
  ON "quickStartGuideProgress" ("fleetId", "role", "manualSlug");

CREATE UNIQUE INDEX IF NOT EXISTS "quickStartGuideProgress_user_fleet_manual_unique"
  ON "quickStartGuideProgress" ("userId", COALESCE("fleetId", 0), "manualSlug");

ALTER TABLE "quickStartGuideProgress" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    DROP POLICY IF EXISTS "quickStartGuideProgress_service_role_full_access" ON "quickStartGuideProgress";
    CREATE POLICY "quickStartGuideProgress_service_role_full_access"
      ON "quickStartGuideProgress"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON TABLE "quickStartGuideProgress" FROM anon;
    REVOKE ALL ON SEQUENCE "quickStartGuideProgress_id_seq" FROM anon;
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON TABLE "quickStartGuideProgress" FROM authenticated;
    REVOKE ALL ON SEQUENCE "quickStartGuideProgress_id_seq" FROM authenticated;
  END IF;
END $$;
