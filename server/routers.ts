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
import { downtimeCalculatorRouter } from "./routers/downtimeCalculator";
import { accessRouter } from "./routers/access";
import { faultCodeReferencesRouter } from "./routers/faultCodeReferences";
import { supportRecoveryRouter } from "./routers/supportRecovery";
import { adminRouter } from "./routers/admin";
import { quickStartRouter } from "./routers/quickStart";
import { notificationsRouter } from "./routers/notifications";
import { partnerRouter } from "./routers/partner";
import { fleetMaintenanceRouter } from "./routers/fleetMaintenance";

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
  downtimeCalculator: downtimeCalculatorRouter,
  access: accessRouter,
  faultCodeReferences: faultCodeReferencesRouter,
  supportRecovery: supportRecoveryRouter,
  admin: adminRouter,
  quickStart: quickStartRouter,
  notifications: notificationsRouter,
  partner: partnerRouter,
  fleetMaintenance: fleetMaintenanceRouter,
});

export type AppRouter = typeof appRouter;
