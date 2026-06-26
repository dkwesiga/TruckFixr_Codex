# Batch — Inspection/Defect Photo Privacy Proof (TFX-CR-0031 / TFX-CR-0035)

Status: Proof harness ready. Runtime proof pending a classified staging/local target.
Author: Codex · Date: 2026-06-14

This is the repeatable proof you (founder) run against an **explicitly classified**
staging or local Supabase/Postgres target. This sandbox cannot reach a classified
target (the `db-target-guard` correctly refuses unclassified remotes), so the
runtime evidence must be produced where a real target is available.

---

## 0. Architecture reality this proof must account for

The live photo flow does **not** currently rely on Supabase Storage RLS:

1. **Upload** — `inspections.uploadEvidencePhoto` (`server/routers/inspections.ts:1124`)
   checks `verifyVehicleInspectionAccess` + inspection ownership, builds a
   fleet-scoped key (`inspection-evidence/company-{fleetId}/…`), and uploads via
   the **Forge storage proxy** (`server/storage.ts` → `BUILT_IN_FORGE_API_*`),
   not the Supabase Storage client.
2. **Read** — the client renders the returned `imageUrl`/`photoUrls` **directly**
   (`client/src/pages/VerifiedInspection.tsx`, `DriverInspectionNSC.tsx`). There
   is no app-layer endpoint that re-checks fleet membership on read.
3. **Supabase Storage policies** — `supabase/migrations/20260527113000_storage_privacy_policies.sql`
   are **inert** for this flow because objects are not written/read through the
   Supabase Storage client with the end-user's JWT.

Therefore photo-read privacy today depends on **either**:
- (Forge URLs) the download URL being unguessable / non-enumerable / expiring, **or**
- (inline data URLs) the `inspectionPhotos` / `defects` table RLS, since the bytes
  live in the DB row.

The proof below tests the **actual** paths, not the inert Supabase Storage policies.

---

## 1. Preconditions

- Target DB classified as `local` or `staging` by `scripts/verify/db-target-guard.ts`
  (set `DATABASE_URL` + the env classification the guard requires).
- Two distinct fleets seeded: **Company A** (fleetId = `A`) and **Company B** (`B`),
  each with one owner/manager + one driver + one vehicle.
- App running against that target.

Record the environment classification output before any write:
```
node -e "import('./scripts/verify/db-target-guard.ts')"   # or the existing wrapper
```

## 2. Upload authorization (app-layer) — must DENY cross-fleet

For each case, call `inspections.uploadEvidencePhoto` (authenticated as the actor):

| # | Actor | fleetId | vehicleId | Expect |
|---|-------|---------|-----------|--------|
| 2.1 | Company A driver | A | A-vehicle | **200 OK**, key starts `inspection-evidence/company-A/` |
| 2.2 | Company B driver | A | A-vehicle | **403 FORBIDDEN** |
| 2.3 | Company A driver | A | B-vehicle | **403 FORBIDDEN** (vehicle not in fleet) |
| 2.4 | Company A driver | A | A-vehicle, inspectionId=B-inspection | **403 FORBIDDEN** (inspection ownership check) |

Pass = 2.1 succeeds with a `company-A/` scoped key; 2.2–2.4 all rejected.

## 3. Submitted-photo isolation (DB row RLS) — must DENY cross-fleet read

After Company A submits an inspection with photos:

```sql
-- As Company B's app user context (set current_app_user_id() to a B user):
SELECT count(*) FROM "inspectionPhotos"
WHERE "fleetId" = <A>;             -- Expect: 0 rows visible
SELECT count(*) FROM defects
WHERE "fleetId" = <A>;             -- Expect: 0 rows visible
-- As Company A user context: the same queries return the real counts.
```

Pass = B sees 0; A sees the real rows. (This is the inline-data-URL protection.)

## 4. Forge download-URL exposure — must NOT be publicly enumerable

For an uploaded Forge URL captured in 2.1:

| # | Action | Expect |
|---|--------|--------|
| 4.1 | `GET <forge url>` with **no auth/cookies** | If this returns the image, privacy depends solely on URL secrecy — **flag as a gap** for a signed/expiring or access-controlled read path. |
| 4.2 | Mutate the key segment `company-A` → `company-B` in the URL and GET | **404 / denied** (no path traversal across tenants). |
| 4.3 | Re-request the same download URL after its TTL (if any) | Confirm whether URLs expire. Record the TTL or "no expiry". |

Record the 4.1 result explicitly — it decides whether an access-controlled
read endpoint (Section 6) is required before broad pilot.

## 5. Orphan cleanup

- Delete an inspection/defect that had photos; confirm the associated
  `inspectionPhotos` rows (and any Forge objects, if deletion is wired) are removed
  or scheduled for cleanup. Record current behavior (today there is no Forge
  object GC — note as a gap if objects persist).

## 6. Decision gate (fill in after running)

- [ ] 4.1 returned the image without auth → **MUST** add an access-controlled
      read endpoint that re-checks fleet access and returns a short-lived URL,
      and switch the client to fetch through it. (Recommended MVP fix; no
      Supabase Storage re-platform required.)
- [ ] 4.1 denied without auth and 4.3 shows expiry → Forge URLs are signed;
      current model is acceptable for pilot. Keep Supabase Storage migration as a
      documented future option.

---

## Result log (paste evidence here)

```
DB classification:
2.1: 2.2: 2.3: 2.4:
3 (B sees / A sees):
4.1: 4.2: 4.3:
5 (orphan cleanup):
Decision (Section 6):
```
