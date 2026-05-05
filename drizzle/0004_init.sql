ALTER TABLE "activityLogs" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "activityLogs" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "defectActions" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "defectActions" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "defects" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "defects" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "features" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "features" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "fleets" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "fleets" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inspectionTemplates" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "inspectionTemplates" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inspections" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "inspections" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "maintenanceLogs" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "maintenanceLogs" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "onboardingSteps" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "onboardingSteps" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "planFeatures" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "planFeatures" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "plans" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tadisAlerts" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "tadisAlerts" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "lastSignedIn" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "lastSignedIn" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "vehicles" ALTER COLUMN "createdAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "passwordHash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_openId_unique" UNIQUE("openId");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");