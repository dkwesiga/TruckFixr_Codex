import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { emailAuthRouter } from "./routers/emailAuth";
import { fleetRouter } from "./routers/fleet";
import { vehiclesRouter } from "./routers/vehicles";
import { defectsRouter } from "./routers/defects";
import { diagnosticsRouter } from "./routers/diagnostics";
import { inspectionsRouter } from "./routers/inspections";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  emailAuth: emailAuthRouter,
  fleet: fleetRouter,
  vehicles: vehiclesRouter,
  defects: defectsRouter,
  diagnostics: diagnosticsRouter,
  inspections: inspectionsRouter,
});

export type AppRouter = typeof appRouter;
