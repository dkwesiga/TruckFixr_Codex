# TruckFixr Codex

TruckFixr is a fleet operations platform for inspections, AI diagnostics, compliance tracking, subscriptions, and manager visibility.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express + tRPC
- Database/Auth/Storage: Supabase
- Payments: Stripe
- Email: Resend

## Repo Structure

- Frontend app root: `client/`
- Backend app root: `server/`
- Shared code: `shared/`
- Server entrypoint: `server/_core/index.ts`
- Frontend entrypoint: `client/src/main.tsx`

## Scripts

- `pnpm dev`
  Runs the combined local development server on `http://localhost:3000`
- `pnpm build:client`
  Builds the static frontend into `dist/public`
- `pnpm build:server`
  Bundles the backend into `dist/index.js`
- `pnpm build`
  Builds both frontend and backend
- `pnpm start:server`
  Starts the production backend bundle
- `pnpm test`
  Runs the test suite

## Local Development

1. Copy `.env.example` to `.env`
2. Fill in the env vars you need
3. Run `pnpm install`
4. Run `pnpm dev`

Local development serves the frontend and backend from the same origin, so `VITE_API_BASE_URL` can stay blank locally.

## Public Homepage, SEO, and Demo Leads

The public homepage at `/` is intentionally crawlable at initial load. The app shell includes semantic marketing content, metadata, `robots.txt`, and `sitemap.xml` so search engines can index the core homepage copy even before the React bundle finishes loading.

### Demo Request Flow

- Primary CTA: `Book a Demo`
- Demo requests post to the public `leads.submitDemoRequest` tRPC mutation
- Submissions are stored in `lead_submissions`
- Notification email: `info@truckfixr.com`
- The demo form is on the homepage under the `#book-demo` section

### Helpful URLs

- Homepage: `/`
- Pricing: `/pricing`
- Demo form: `/#book-demo`

## Render Deployment

This repo now uses a Render Blueprint in [render.yaml](C:\Users\dkwes\TruckFixr\Codex\render.yaml) for a split deployment:

- `truckfixr-web`
  Render Static Site for the React/Vite frontend
- `truckfixr-api`
  Render Web Service for the Node/Express backend

### Build and Start Commands

Frontend static site:

- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build:client`
- Publish path: `dist/public`

Backend web service:

- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm build:server`
- Start command: `corepack enable && pnpm start:server`
- Health check path: `/healthz`

### Production Behavior

- The backend binds to `0.0.0.0` and uses `process.env.PORT`
- The backend is proxy-aware via `app.set("trust proxy", 1)`
- The backend exposes `/healthz` for Render health checks
- The backend no longer assumes it serves the frontend in production
- The frontend uses `VITE_API_BASE_URL` for API calls in production instead of hardcoded same-origin paths

### Realtime Notes

- No dedicated custom WebSocket server is currently defined in this repo
- Render Web Services are still the correct backend type if you add WebSockets later
- Current realtime-style features should remain simple with a single backend service plus Supabase-powered state/data updates
- For future horizontal scaling, keep live event state externalized in Supabase or another shared store instead of in-memory socket state

## Required Environment Variables

### Frontend

- `VITE_API_BASE_URL`
- `VITE_APP_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_OAUTH_SERVER_URL`

Optional frontend env vars:

- `VITE_POSTHOG_API_KEY`
- `VITE_POSTHOG_API_HOST`
- `VITE_ANALYTICS_ENDPOINT`
- `VITE_ANALYTICS_WEBSITE_ID`
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_FRONTEND_FORGE_API_KEY`

### Backend

- `APP_BASE_URL`
- `JWT_SECRET`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional backend env vars:

- `SUPABASE_ANON_KEY`
- `OAUTH_SERVER_URL`
- `NHTSA_API_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `FLEET_MANAGER_EMAIL`
- `OWNER_OPEN_ID`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_FALLBACK_MODEL`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `DIAGNOSTIC_CONFIDENCE_THRESHOLD`
- `DIAGNOSTIC_NEW_CAUSE_MIN_CONFIDENCE`
- `DIAGNOSTIC_TIMEOUT_MS`
- `DIAGNOSTIC_INTAKE_MAX_TOKENS`
- `DIAGNOSTIC_REVIEW_MAX_TOKENS`
- `SIMPLE_TADIS_MODE` set to `true` to force the minimal classifier/diagnosis path during provider stabilization
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_FLEET_MONTHLY`
- `ADMIN_EMAILS`
- `SALES_NOTIFICATION_EMAIL`

Diagnostic LLM defaults:

- provider: OpenRouter only
- primary model: `openrouter/free`
- fallback model: `openrouter/free`
- clarification confidence threshold: `85`
- intake completion cap: `320`
- review completion cap: `380`
- OpenRouter 402 credit-limit responses automatically retry with a smaller affordable `max_tokens` budget when possible

## Render Checklist

1. Create a new Blueprint in Render from this repo.
2. Let Render create both services from `render.yaml`.
3. Confirm `truckfixr.com` and `www.truckfixr.com` are attached to `truckfixr-web`, not `truckfixr-api`.
4. Set `APP_BASE_URL` on `truckfixr-api` to the frontend public URL, for example `https://truckfixr.com`.
5. Set `VITE_API_BASE_URL` on `truckfixr-web` to the backend public URL.
   Use the Render API service URL or a separate API domain such as `https://api.truckfixr.com`.
6. Add Supabase, Stripe, Resend, and the OpenRouter secret to `truckfixr-api`.
7. Add frontend Vite env vars to `truckfixr-web`.
8. In Stripe, point the webhook endpoint to `https://<your-backend-domain>/api/stripe/webhook`.
9. Deploy both services.
10. Confirm:
   - frontend loads
   - `/healthz` returns `200`
   - login/signup works across the split domains
   - tRPC requests succeed with credentials
   - Stripe webhook reaches the backend

## Quality Checks

- `pnpm check`
- `pnpm test`

## Demo Asset Workflow

TruckFixr includes a developer-only demo asset workflow for presentation screenshots and a basic demo video package.

### Safety Rules

- Demo seeding is allowed only when `DEMO_CAPTURE_ENV` is set to `local`, `staging`, or `demo`
- Production demo seeding is blocked unless `ALLOW_DEMO_PRODUCTION_SEED=true` is explicitly set
- The workflow uses fictional demo data only
- Demo exports are written to `exports/demo-assets`
- Downloadable copies are also synced to `client/public/demo-assets` when the framework allows it

### Required Environment Variables

- `DEMO_CAPTURE_ENV=local|staging|demo`
- `LOCAL_BASE_URL=http://localhost:3000`
- `STAGING_BASE_URL=https://your-staging-url.com`

Optional but useful:

- `ALLOW_DEMO_PRODUCTION_SEED=true` only for a protected demo sandbox
- `ALLOW_DEMO_REMOTE_SEED=true` only when the target database is a controlled staging/demo database
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
- `CHROME_PATH`
- `GOOGLE_CHROME_PATH`

### Available Commands

- `pnpm demo:seed`
  Seeds the fictional Brampton Transit Inc. demo fleet
- `pnpm screenshots:local`
  Seeds demo data and captures local desktop/mobile screenshots
- `pnpm screenshots:staging`
  Seeds demo data and captures staging desktop/mobile screenshots
- `pnpm demo:video`
  Captures the silent demo MP4 flow
- `pnpm demo:assets`
  Runs the full workflow: seed, screenshots, video, captions, gallery, metadata, ZIP

### Generated Output

The workflow writes files like:

- `exports/demo-assets/desktop/*.png`
- `exports/demo-assets/mobile/*.png`
- `exports/demo-assets/extra-routes/*`
- `exports/demo-assets/screenshot-gallery.html`
- `exports/demo-assets/demo-metadata.json`
- `exports/demo-assets/demo-script.md`
- `exports/demo-assets/captions.srt`
- `exports/demo-assets/truckfixr-demo-video.mp4`
- `exports/demo-assets/truckfixr-demo-assets.zip`

Supported downloadable copies are synced to:

- `client/public/demo-assets`

### Verification Checklist

1. Confirm `DEMO_CAPTURE_ENV` is set before running any demo command.
2. Confirm the demo seed creates Brampton Transit Inc. only.
3. Confirm no real customer data is modified.
4. Confirm desktop screenshots are created.
5. Confirm mobile screenshots are created.
6. Confirm the gallery opens from `exports/demo-assets/screenshot-gallery.html`.
7. Confirm the ZIP file exists.
8. Confirm the MP4 file exists.
9. Confirm captions and demo script are generated.
10. Confirm extra routes are listed separately in metadata when unavailable.
