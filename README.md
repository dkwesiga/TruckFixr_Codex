# TruckFixr Codex

TruckFixr is a fleet operations platform for reducing truck downtime with:

- daily inspections
- AI-assisted diagnostics
- fleet visibility for managers
- compliance-aware defect tracking

## Stack

- React + Vite
- Tailwind CSS
- tRPC
- Drizzle ORM
- PostgreSQL / Supabase

## Local development

1. Install dependencies with `pnpm install`
2. Copy `.env.example` to `.env`
3. Fill in the required environment variables
4. Start the app with `pnpm dev`

The client runs on `http://localhost:3000/`.

## Render deployment

This repo now includes `render.yaml` for a single Render web service deployment.

Suggested Render flow:

1. In Render, create a new Blueprint from this GitHub repo.
2. Let Render read `render.yaml`.
3. Set the required secret env vars before the first deploy:
   - `APP_BASE_URL`
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `VITE_SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Add optional env vars for email, Stripe, VIN decoding, and AI providers only if you want those features live in production.

Render build/start commands from the blueprint:

- build: `corepack enable && pnpm install --frozen-lockfile && pnpm build`
- start: `corepack enable && pnpm start`

## Quality checks

- `pnpm check`
- `pnpm test`

## Notes

- `.env` is intentionally not committed
- VIN decoding uses the NHTSA API
- email delivery can be enabled with Resend
- multi-provider AI orchestration supports OpenAI, Anthropic, and Gemini
