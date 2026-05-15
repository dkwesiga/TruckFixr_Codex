# TruckFixr Demo Seed Guide

## Warning

- This seed is for local or controlled staging/demo environments only.
- Never use real customer data, real customer emails, real phone numbers, or real VINs.
- All demo users share a temporary password and should never exist in production without explicit override controls.

## Required Environment Variables

- `ALLOW_DEMO_SEED=true`
- `DATABASE_URL=...`

## Optional Safety Overrides

- `ALLOW_DEMO_REMOTE_SEED=true`
  Use only when the target database is a controlled staging or demo database.
- `ALLOW_DEMO_PRODUCTION_SEED=true`
  Use only for an intentionally isolated demo sandbox. The seed blocks production by default.

## Optional Supabase Auth Support

- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

If both are present, the seed creates or updates matching Supabase Auth users with auto-confirm enabled and no welcome email flow. If they are not present, the demo accounts still work through the app's local email-auth fallback using the same seeded email/password.

## Commands

- `pnpm seed:demo`
  Creates or refreshes the three demo companies and all related demo records.
- `pnpm seed:demo:rollback`
  Removes only the demo companies, demo users, and demo records created by this seed.
- `pnpm validate:demo-seed`
  Checks company counts, user roles, assignments, vehicles, operational records, separation rules, and rollback targeting.

## Shared Demo Password

- `DemoPass123!`

## Demo Companies

### Maple Route Logistics Ltd.

- Segment: General freight / tractors and trailers
- Location: Brampton, Ontario
- Address: `1200 Dispatch Crescent, Brampton, ON D5M 0A1`
- Phone: `905-555-0101`
- Story: Dispatch risk, DEF/aftertreatment warning, trailer safety inspection risk

Users

- Owner: `owner.maple@truckfixr-demo.example.com` — Olivia Brooks
- Fleet Manager: `manager.maple@truckfixr-demo.example.com` — Marcus Reed
- Driver: `driver1.maple@truckfixr-demo.example.com` — Daniel Mensah
- Driver: `driver2.maple@truckfixr-demo.example.com` — Peter Collins

Assigned vehicles

- Daniel Mensah: `MRL-101`, `MRL-T202`
- Peter Collins: `MRL-102`, `MRL-T201`

### Peel Community Transport Inc.

- Segment: Passenger transport / buses
- Location: Mississauga, Ontario
- Address: `88 Community Shuttle Drive, Mississauga, ON P5L 0E2`
- Phone: `905-555-0202`
- Story: Repeated brake/air inspection defects, daily inspection compliance risk

Users

- Owner: `owner.peel@truckfixr-demo.example.com` — Aisha Patel
- Fleet Manager: `manager.peel@truckfixr-demo.example.com` — Samuel Thompson
- Driver: `driver1.peel@truckfixr-demo.example.com` — Grace Williams
- Driver: `driver2.peel@truckfixr-demo.example.com` — Kevin Brown

Assigned vehicles

- Grace Williams: `PCT-B301`, `PCT-401`, temporary access to `PCT-T502`
- Kevin Brown: `PCT-B302`, `PCT-402`, `PCT-T501`

### NorthStone Construction Fleet Ltd.

- Segment: Construction fleet / dump, straight truck, day cab, service truck
- Location: Vaughan, Ontario
- Address: `405 Quarry Line, Vaughan, ON N5R 0K3`
- Phone: `905-555-0303`
- Story: Hydraulic/PTO issue, overdue PM, recurring no-start/battery issue

Users

- Owner: `owner.northstone@truckfixr-demo.example.com` — Michael Chen
- Fleet Manager: `manager.northstone@truckfixr-demo.example.com` — Elena Rodriguez
- Driver: `driver1.northstone@truckfixr-demo.example.com` — Robert Singh
- Driver: `driver2.northstone@truckfixr-demo.example.com` — James Walker

Assigned vehicles

- Robert Singh: `NSF-601`, `NSF-602`, `NSF-T701`, temporary access to `NSF-606`
- James Walker: `NSF-603`, `NSF-604`, `NSF-605`, `NSF-606`, temporary access to `NSF-602`

## Vehicle Mix

- Total demo vehicles: `18`
- Maple Route Logistics Ltd.: `4`
- Peel Community Transport Inc.: `6`
- NorthStone Construction Fleet Ltd.: `8`

Coverage includes:

- sleeper tractors
- day cab tractors
- dry van trailers
- reefer trailers
- straight trucks
- buses
- dump truck representation
- box truck representation
- service truck representation

All VINs in the seed are synthetic demo VINs. They should not be treated as real decodeable VINs.

## Seeded Operational Data

The seed populates enough history to drive realistic dashboards and demo flows:

- Ontario daily trip inspections
- passed inspections
- flagged inspections
- missed inspections
- open and resolved defects
- AI diagnostic sessions and manager summaries
- maintenance reminders and overdue PM records
- completed repair outcomes
- trailer compliance reminders
- inspection proof-photo placeholders
- VIN, odometer, invoice, annual safety, and service-document placeholder metadata

## Recommended Demo Paths

### Demo Path 1: Maple Route Logistics Ltd.

- Sign in as `manager.maple@truckfixr-demo.example.com`
- Open `MRL-101` to show the urgent DEF / aftertreatment derate risk
- Show `MRL-T201` for the trailer compliance reminder and annual safety follow-up
- Walk through how the manager spots dispatch risk before the unit leaves

### Demo Path 2: Peel Community Transport Inc.

- Sign in as `manager.peel@truckfixr-demo.example.com`
- Open `PCT-B301` to show repeated brake / air inspection defects
- Review daily trip inspection records and the open maintenance follow-up
- Explain how the repeated issue changes repair priority and compliance risk

### Demo Path 3: NorthStone Construction Fleet Ltd.

- Sign in as `manager.northstone@truckfixr-demo.example.com`
- Open `NSF-601` to show the hydraulic / PTO concern
- Open `NSF-605` to show the overdue PM and recurring no-start trend
- Open `NSF-T702` to show the out-of-service derate scenario

### Owner Demo Path

- Sign in as the relevant owner user
- Review company overview, vehicle counts, user roster, and subscription context
- Confirm the owner stays scoped to a single company

### Driver Demo Path

- Sign in as one of the demo driver users
- Confirm only assigned vehicles are visible
- Submit or review a daily trip inspection
- Show how a driver-reported issue becomes manager action

## Validation Notes

`pnpm validate:demo-seed` checks:

- 3 demo companies exist
- each company has exactly 1 owner, 1 manager, and 2 drivers
- total demo users = 12
- total demo vehicles = 18
- the fleets split 4 / 6 / 8
- each driver has assigned vehicles
- trailers are separate assets
- operational records exist for inspections, defects, diagnostics, maintenance, repairs, and compliance storytelling
- runtime helper checks prevent cross-company access
- driver visibility stays limited to assigned vehicles
- rollback targets only demo fleets and demo-domain users

## Notes About Company Separation

- The seed writes data with direct database access for setup, which is expected for administrative seeding.
- Validation checks runtime company separation using the same company and vehicle access helpers the app uses during normal requests.
- This does not replace a full Supabase JWT/RLS integration test. If you need database-policy proof under real Supabase JWT claims, run an additional staging verification pass with normal signed-in requests.
