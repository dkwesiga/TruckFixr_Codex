DO $$
BEGIN
  CREATE TYPE lead_interest_type AS ENUM ('book_a_demo', 'beta_access', 'pilot_inquiry', 'general_inquiry');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'closed', 'spam');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "lead_submissions" (
  "id" serial PRIMARY KEY,
  "full_name" varchar(255) NOT NULL,
  "company_name" varchar(255) NOT NULL,
  "email" varchar(320) NOT NULL,
  "phone" varchar(50),
  "fleet_size" varchar(64) NOT NULL,
  "vehicle_types" text,
  "location" varchar(255),
  "biggest_maintenance_challenge" text NOT NULL,
  "interest_type" lead_interest_type NOT NULL DEFAULT 'book_a_demo',
  "preferred_demo_time" varchar(255),
  "source_page" varchar(255),
  "utm_source" varchar(255),
  "utm_medium" varchar(255),
  "utm_campaign" varchar(255),
  "utm_content" varchar(255),
  "utm_term" varchar(255),
  "referrer" text,
  "status" lead_status NOT NULL DEFAULT 'new',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
