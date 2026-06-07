-- =============================================================================
-- DRAFT — Batch 5 (Weekly Rec 5 / TFX-CR-0003)
-- repairOutcomes normalization for durable, query-able, SAME-FLEET confirmed-
-- outcome retrieval (TADIS learning loop / data moat).
--
-- STATUS: PROPOSED / NOT APPLIED.
--   * This file intentionally lives in reports/ (NOT drizzle/) so it is never
--     auto-run by the app or migration tooling.
--   * Apply ONLY to a verified local/staging Supabase/Postgres target, prove a
--     fresh-db replay (see Rec 3 / TFX-CR-0032), then promote to
--     drizzle/0029_repair_outcome_normalization.sql.
--   * All statements are additive + idempotent (safe to replay). No existing
--     column is altered or dropped.
--
-- WHY: server/routers/diagnostics.ts `getStoredSolvedCaseSignals` (lines ~128-153)
-- currently re-derives confirmed cause, confirmed fix, symptom signals, and fault
-- codes by parsing the loose `activityLogs.metadata` JSON blob. The structured
-- `repairOutcomes` table already stores confirmedFault / repairPerformed /
-- partsReplaced / aiDiagnosisCorrect / diagnosticCaseId, but lacks a durable cause
-- taxonomy link, normalized symptom signals, and normalized fault codes — and lacks
-- indexes for efficient same-fleet, cause-keyed retrieval at scale.
-- =============================================================================

-- --- New normalized columns (nullable; backfill is a separate, staged step) ----

-- Durable link to the TADIS cause taxonomy (e.g. 'oil_coolant_cross_contamination').
-- Replaces inferHistoricalCauseId(...) string inference at retrieval time.
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "confirmedCauseId" varchar(128);

-- Normalized symptom signals captured at confirmation time (string[]).
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "symptomSignals" jsonb;

-- Normalized confirmed fault codes at confirmation time (string[]).
ALTER TABLE "repairOutcomes"
  ADD COLUMN IF NOT EXISTS "faultCodes" jsonb;

-- --- Indexes for same-fleet retrieval (matches existing query shapes) ----------

-- WHERE "fleetId" = ? ORDER BY "createdAt" DESC  (diagnostics.ts similar-case load)
CREATE INDEX IF NOT EXISTS "repairOutcomes_fleet_createdAt_idx"
  ON "repairOutcomes" ("fleetId", "createdAt" DESC);

-- Same-fleet per-vehicle history lookups.
CREATE INDEX IF NOT EXISTS "repairOutcomes_fleet_vehicle_idx"
  ON "repairOutcomes" ("fleetId", "vehicleId");

-- Same-fleet, cause-keyed retrieval for TADIS confirmed similar-case matching.
CREATE INDEX IF NOT EXISTS "repairOutcomes_fleet_cause_idx"
  ON "repairOutcomes" ("fleetId", "confirmedCauseId");

-- =============================================================================
-- PAIRED APPLICATION CHANGES (implement WITH this migration, not before a DB target)
-- =============================================================================
-- 1. drizzle/schema.ts: add confirmedCauseId (varchar 128), symptomSignals (jsonb),
--    faultCodes (jsonb) to the repairOutcomes pgTable definition.
-- 2. Outcome-confirmation write path (the mutation that inserts repairOutcomes):
--    also persist confirmedCauseId (from the ranked diagnosis cause taxonomy),
--    normalized symptomSignals, and normalized faultCodes.
-- 3. diagnostics.ts retrieval: build `source:"historical"` similar cases from these
--    repairOutcomes columns FIRST; only fall back to activityLogs.metadata JSON for
--    legacy rows. Keep all retrieval strictly fleet-scoped (WHERE fleetId = ?).
-- 4. Optional one-time backfill (staging-validated): populate confirmedCauseId for
--    existing rows via inferHistoricalCauseId(confirmedFault + repairPerformed).
--
-- ACCEPTANCE CRITERIA (TFX-CR-0003):
--  * Confirm a repair outcome -> verify normalized (non-JSON) storage in repairOutcomes
--    -> verify it is retrieved as a similar solved case within the SAME fleet only on a
--    later diagnosis.
--  * Cross-fleet retrieval proven impossible.
--  * aiDiagnosisCorrect feedback persisted with reusable structure.
--  * Fresh-db replay (Rec 3) boots with these columns/indexes present.
-- =============================================================================
