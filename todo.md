# TruckFixr Fleet AI - MVP Feature Tracker

## Core Infrastructure
- [x] Database schema (fleets, vehicles, users, inspections, defects, tadis_alerts, maintenance_logs, plans, features)
- [x] Role-based routing middleware (owner/manager vs driver)
- [x] Authentication service (signup, login, password reset via OAuth)
- [ ] Supabase RLS policies for multi-tenant isolation
- [x] TruckFixr logo integration
- [x] Navy Blue & Orange theme applied

## Landing Page & Public Pages
- [x] Landing page hero section with CTA
- [x] Features section
- [x] How-it-works section
- [x] Pricing preview section
- [x] FAQ section
- [x] Public layout and navigation

## Authentication & Onboarding
- [x] Login page (via Manus OAuth)
- [x] Signup page (via Manus OAuth)
- [x] Email signup form with password validation
- [x] Email signin form with credentials
- [x] Password hashing (SHA-256)
- [x] Session management for email users
- [ ] Password reset flow
- [ ] Onboarding wizard (7-step flow)
  - [ ] Fleet creation step
  - [ ] Truck setup step
  - [ ] Team invitations step
  - [ ] Inspection template configuration
  - [ ] First inspection walkthrough
  - [ ] First triage example
  - [ ] Morning summary preview
- [ ] Onboarding progress tracking UI

## Manager Experience
- [x] Manager dashboard layout (shell)
- [x] Morning Fleet Summary widget
- [ ] Prioritized Action Queue
- [ ] Open defects by severity
- [ ] Recent activity feed
- [ ] Fleet management (view trucks, drivers)
- [ ] Truck detail page with tabs (Overview, Inspections, Defects, Maintenance Logs)
- [ ] Defect detail page with TADIS analysis
- [ ] Issue triage form
- [ ] Action log and manager actions (acknowledge, assign, resolve)
- [ ] Settings page (fleet, team, billing)

## Driver Experience
- [x] Driver dashboard/home (shell)
- [ ] Assigned truck selection
- [x] Daily inspection flow (step-by-step)
- [x] Inspection item input components
- [x] Defect reporting form
- [ ] Photo upload for defects
- [x] Submission confirmation screen
- [x] Mobile-first responsive design

## TADIS Service Layer
- [x] TADIS engine core logic (rule-based scoring)
- [x] TADIS types and interfaces (TadisInput, TadisOutput)
- [ ] LLM integration for likely cause and reasoning
- [x] TADIS API endpoint (via defects.create procedure)
- [ ] Vehicle health summary context
- [x] History-aware adjustment logic

## Billing & Monetization
- [x] Pricing page (Starter, Growth, Fleet tiers)
- [x] Premium TADIS add-on positioning
- [x] Onboarding package upsell
- [ ] Stripe plan selection UI
- [ ] Trial-to-paid upgrade flow
- [ ] Feature entitlement gating
- [ ] Stripe webhook handler stub
- [ ] Subscription management UI

## Analytics & Monitoring
- [x] PostHog event tracking setup
- [x] Key events: signup, fleet_created, truck_added, inspection_submitted, defect_created, action_taken
- [ ] Dashboard analytics views
- [ ] Issue response time tracking

## Testing & Deployment
- [ ] Unit tests for TADIS logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for critical flows
- [ ] Performance testing
- [ ] Security audit (RLS, auth, data isolation)
- [ ] Launch-readiness checklist verification

## Landing Page & Signup
- [x] Add signup CTA button to landing page hero
- [x] Create demo profile with owner role and full privileges
- [x] Provide demo credentials for testing

## User Profile & Onboarding
- [x] Create user profile page after signup
- [x] Add profile form (name, email, company, role)
- [x] Redirect to profile page after email signup
- [x] Add initial fleet creation on profile page
- [ ] Team member invitation during onboarding
