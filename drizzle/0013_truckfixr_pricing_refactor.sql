-- TruckFixr pricing refactor: company billing, trailer allowances, and asset gating

ALTER TYPE "billing_status" ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE "billing_status" ADD VALUE IF NOT EXISTS 'custom';

ALTER TABLE "fleets"
  ADD COLUMN IF NOT EXISTS "planName" varchar(64) NOT NULL DEFAULT 'free_trial',
  ADD COLUMN IF NOT EXISTS "billingInterval" varchar(16) NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS "billingStatus" "billing_status" NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS "poweredVehicleLimit" integer,
  ADD COLUMN IF NOT EXISTS "includedTrailerLimit" integer,
  ADD COLUMN IF NOT EXISTS "paidExtraTrailerQuantity" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalActiveTrailerLimit" integer,
  ADD COLUMN IF NOT EXISTS "aiSessionMonthlyLimit" integer,
  ADD COLUMN IF NOT EXISTS "aiSessionsUsedCurrentPeriod" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiSessionsResetAt" timestamp,
  ADD COLUMN IF NOT EXISTS "trialStartedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "subscriptionRenewsAt" timestamp,
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" varchar(255),
  ADD COLUMN IF NOT EXISTS "isTrial" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isPaidPilot" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "paidPilotStartedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "paidPilotEndsAt" timestamp;

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "assetCategory" varchar(32) NOT NULL DEFAULT 'powered_vehicle',
  ADD COLUMN IF NOT EXISTS "vehicleType" varchar(64),
  ADD COLUMN IF NOT EXISTS "isPoweredVehicle" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isTrailer" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "trailerLinkStatus" varchar(32),
  ADD COLUMN IF NOT EXISTS "linkedPoweredVehicleId" varchar(64);
