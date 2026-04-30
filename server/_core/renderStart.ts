import "dotenv/config";

process.on("uncaughtException", (error) => {
  console.error("[RenderStart] Uncaught exception during API startup", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[RenderStart] Unhandled rejection during API startup", reason);
  process.exit(1);
});

console.log("[RenderStart] Starting TruckFixr API", {
  nodeVersion: process.version,
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
  hasJwtSecret: Boolean(process.env.JWT_SECRET),
});

await import("./index");
