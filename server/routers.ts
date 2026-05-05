import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { emailAuthRouter } from "./routers/emailAuth";
import { fleetRouter } from "./routers/fleet";
import { vehiclesRouter } from "./routers/vehicles";
import { defectsRouter } from "./routers/defects";
import { diagnosticsRouter } from "./routers/diagnostics";
import { inspectionsRouter } from "./routers/inspections";
import { subscriptionsRouter } from "./routers/subscriptions";
import { vehicleAccessRouter } from "./routers/vehicleAccess";
import { companyRouter } from "./routers/company";
import { leadsRouter } from "./routers/leads";
import { accessRouter } from "./routers/access";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  emailAuth: emailAuthRouter,
  fleet: fleetRouter,
  vehicles: vehiclesRouter,
  defects: defectsRouter,
  diagnostics: diagnosticsRouter,
  inspections: inspectionsRouter,
  subscriptions: subscriptionsRouter,
  vehicleAccess: vehicleAccessRouter,
  company: companyRouter,
  leads: leadsRouter,
  access: accessRouter,
});

export type AppRouter = typeof appRouter;
