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

## Quality checks

- `pnpm check`
- `pnpm test`

## Notes

- `.env` is intentionally not committed
- VIN decoding uses the NHTSA API
- email delivery can be enabled with Resend
- multi-provider AI orchestration supports OpenAI, Anthropic, and Gemini
