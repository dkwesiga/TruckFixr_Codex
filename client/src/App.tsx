import { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazyWithChunkRecovery } from "./lib/chunkRecovery";

const NotFound = lazyWithChunkRecovery(() => import("./pages/NotFound"));
const LandingSaaS = lazyWithChunkRecovery(() => import("./pages/LandingSaaS"));
const VerifiedInspection = lazyWithChunkRecovery(
  () => import("./pages/VerifiedInspection")
);
const Home = lazyWithChunkRecovery(() => import("./pages/Home"));
const ManagerDashboard = lazyWithChunkRecovery(
  () => import("./pages/ManagerDashboard")
);
const DriverDashboardSaaS = lazyWithChunkRecovery(
  () => import("./pages/DriverDashboardSaaS")
);
const DriverDiagnosis = lazyWithChunkRecovery(
  () => import("./pages/DriverDiagnosis")
);
const Onboarding = lazyWithChunkRecovery(() => import("./pages/Onboarding"));
const DefectDetail = lazyWithChunkRecovery(
  () => import("./pages/DefectDetail")
);
const TruckDetail = lazyWithChunkRecovery(() => import("./pages/TruckDetail"));
const Pricing = lazyWithChunkRecovery(() => import("./pages/Pricing"));
const EmailAuth = lazyWithChunkRecovery(() => import("./pages/EmailAuth"));
const UserProfile = lazyWithChunkRecovery(() => import("./pages/UserProfile"));
const AdminBillingDashboard = lazyWithChunkRecovery(
  () => import("./pages/AdminBillingDashboard")
);
const FaultCodeReviewDashboard = lazyWithChunkRecovery(
  () => import("./pages/FaultCodeReviewDashboard")
);
const AdminMetricsDashboard = lazyWithChunkRecovery(
  () => import("./pages/AdminMetricsDashboard")
);
const AdminFleetDetail = lazyWithChunkRecovery(
  () => import("./pages/AdminFleetDetail")
);
const InspectionReportDvir = lazyWithChunkRecovery(
  () => import("./pages/InspectionReportDvir")
);
const DriverInspectionNSC = lazyWithChunkRecovery(
  () => import("./pages/DriverInspectionNSC")
);
const AccessGateway = lazyWithChunkRecovery(
  () => import("./pages/AccessGateway")
);
const AccessStartTrial = lazyWithChunkRecovery(
  () => import("./pages/AccessStartTrial")
);
const AccessPilotCode = lazyWithChunkRecovery(
  () => import("./pages/AccessPilotCode")
);
const AccessDriverInvite = lazyWithChunkRecovery(
  () => import("./pages/AccessDriverInvite")
);
const PilotRedirect = lazyWithChunkRecovery(
  () => import("./pages/PilotRedirect")
);
const QuickStartGuides = lazyWithChunkRecovery(
  () => import("./pages/QuickStartGuides")
);
const FleetDowntimeCostCalculator = lazyWithChunkRecovery(
  () => import("./pages/FleetDowntimeCostCalculator")
);

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-6">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        Loading TruckFixr...
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path={"/access/start-trial"} component={AccessStartTrial} />
        <Route path={"/access/pilot-code"} component={AccessPilotCode} />
        <Route path={"/access/driver-invite"} component={AccessDriverInvite} />
        <Route path={"/access"} component={AccessGateway} />
        <Route path={"/pilot"} component={PilotRedirect} />
        <Route path={"/signup"} component={EmailAuth} />
        <Route path={"/auth/email"} component={EmailAuth} />
        <Route path={"/profile"} component={UserProfile} />
        <Route path={"/app"} component={Home} />
        <Route path={"/onboarding"} component={Onboarding} />
        <Route path={"/onboarding/guides"} component={QuickStartGuides} />
        <Route path={"/onboarding/my-guide"} component={QuickStartGuides} />
        <Route path={"/onboarding/driver"} component={QuickStartGuides} />
        <Route
          path={"/onboarding/owner-operator"}
          component={QuickStartGuides}
        />
        <Route
          path={"/onboarding/fleet-manager"}
          component={QuickStartGuides}
        />
        <Route path={"/onboarding/fleet-owner"} component={QuickStartGuides} />
        <Route path={"/quick-start-guides"} component={QuickStartGuides} />
        <Route
          path={"/quick-start-guides/my-guide"}
          component={QuickStartGuides}
        />
        <Route
          path={"/quick-start-guides/driver"}
          component={QuickStartGuides}
        />
        <Route
          path={"/quick-start-guides/owner-operator"}
          component={QuickStartGuides}
        />
        <Route
          path={"/quick-start-guides/fleet-manager"}
          component={QuickStartGuides}
        />
        <Route
          path={"/quick-start-guides/fleet-owner"}
          component={QuickStartGuides}
        />
        <Route path={"/manager"} component={ManagerDashboard} />
        <Route path={"/driver"} component={DriverDashboardSaaS} />
        <Route path={"/diagnosis"} component={DriverDiagnosis} />
        <Route path={"/inspection"} component={DriverInspectionNSC} />
        <Route path={"/inspection/verified"} component={VerifiedInspection} />
        <Route
          path={"/inspection-report/:id"}
          component={InspectionReportDvir}
        />
        <Route path={"/defect/:id"} component={DefectDetail} />
        <Route path={"/truck/:id"} component={TruckDetail} />
        <Route path={"/pricing"} component={Pricing} />
        <Route
          path={"/fleet-downtime-cost-calculator"}
          component={FleetDowntimeCostCalculator}
        />
        <Route path={"/admin"} component={AdminMetricsDashboard} />
        <Route path={"/admin/metrics"} component={AdminMetricsDashboard} />
        <Route path={"/admin/fleets"} component={AdminMetricsDashboard} />
        <Route path={"/admin/fleets/:fleetId"} component={AdminFleetDetail} />
        <Route path={"/admin/billing"} component={AdminBillingDashboard} />
        <Route
          path={"/admin/fault-codes"}
          component={FaultCodeReviewDashboard}
        />
        <Route path={"/404"} component={NotFound} />
        <Route path={"/"} component={LandingSaaS} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
