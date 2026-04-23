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
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `DIAGNOSTIC_CONFIDENCE_THRESHOLD`
- `DIAGNOSTIC_NEW_CAUSE_MIN_CONFIDENCE`
- `DIAGNOSTIC_TIMEOUT_MS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_ANNUAL`
- `STRIPE_PRICE_FLEET_MONTHLY`
- `ADMIN_EMAILS`
- `SALES_NOTIFICATION_EMAIL`

## Render Checklist

1. Create a new Blueprint in Render from this repo.
2. Let Render create both services from `render.yaml`.
3. Set `APP_BASE_URL` on `truckfixr-api` to the frontend public URL.
4. Set `VITE_API_BASE_URL` on `truckfixr-web` to the backend public URL.
5. Add Supabase, Stripe, Resend, and AI provider secrets to `truckfixr-api`.
6. Add frontend Vite env vars to `truckfixr-web`.
7. In Stripe, point the webhook endpoint to `https://<your-backend-domain>/api/stripe/webhook`.
8. Deploy both services.
9. Confirm:
   - frontend loads
   - `/healthz` returns `200`
   - login/signup works across the split domains
   - tRPC requests succeed with credentials
   - Stripe webhook reaches the backend

## Quality Checks

- `pnpm check`
- `pnpm test`
