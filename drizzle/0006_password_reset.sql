-- Add password reset token table
CREATE TABLE IF NOT EXISTS "passwordResetTokens" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "token" varchar(255) NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "usedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "passwordResetTokens_token_unique"
ON "passwordResetTokens" ("token");

CREATE INDEX IF NOT EXISTS "passwordResetTokens_userId_index"
ON "passwordResetTokens" ("userId");

-- Enable RLS
ALTER TABLE "passwordResetTokens" ENABLE ROW LEVEL SECURITY;

-- Policy: user can only use their own token
DROP POLICY IF EXISTS "passwordResetTokens_select_policy" ON "passwordResetTokens";
CREATE POLICY "passwordResetTokens_select_policy" ON "passwordResetTokens"
  FOR SELECT USING ("userId" = auth.uid()::integer);

DROP POLICY IF EXISTS "passwordResetTokens_insert_policy" ON "passwordResetTokens";
CREATE POLICY "passwordResetTokens_insert_policy" ON "passwordResetTokens"
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "passwordResetTokens_update_policy" ON "passwordResetTokens";
CREATE POLICY "passwordResetTokens_update_policy" ON "passwordResetTokens"
  FOR UPDATE USING ("userId" = auth.uid()::integer);