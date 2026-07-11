-- Guard against duplicate partner provenance source rows.
--
-- ensurePartnerSourceId is find-or-create; without a uniqueness constraint two
-- concurrent first promotions from the same partner shop could each insert a
-- source row. This partial unique index makes the database the arbiter; the
-- router inserts with ON CONFLICT DO NOTHING and re-selects on conflict.

CREATE UNIQUE INDEX IF NOT EXISTS "faultCodeReferenceSources_partner_fleet_unique"
  ON "faultCodeReferenceSources" ("sourceType", ("metadata"->>'partnerFleetId'))
  WHERE "sourceType" = 'partner_shop';
