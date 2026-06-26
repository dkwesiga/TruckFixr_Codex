ALTER TABLE "inspections"
ADD COLUMN IF NOT EXISTS "inspectionSessionId" varchar(128);

ALTER TABLE "defects"
ADD COLUMN IF NOT EXISTS "managerReviewStatus" varchar(32) NOT NULL DEFAULT 'submitted';

ALTER TABLE "defects"
ADD COLUMN IF NOT EXISTS "managerReviewStatusUpdatedAt" timestamp;
