ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ownerOperatorMode" boolean NOT NULL DEFAULT false;
