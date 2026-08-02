import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import InstallAppPrompt from "./components/InstallAppPrompt";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazyWithChunkRecovery } from "./lib/chunkRecovery";
import { useAuthContext } from "./hooks/useAuthContext";
import { useLocation } from "wouter";

const NotFound = lazyWithChunkRecovery(() => import("./pages/NotFound"));
const FleetReadinessLanding = lazyWithChunkRecovery(
  () => import("./pages/FleetReadinessLanding")
);
const FleetReadinessLandingV2 = lazyWithChunkRecovery(
  () => import("./pages/FleetReadinessLandingV2")
);
const FleetReadinessLandingV3 = lazyWithChunkRecovery(
  () => import("./pages/FleetReadinessLandingV3")
);
const FleetReviewBooking = lazyWithChunkRecovery(
  () => import("./pages/FleetReviewBooking")
);
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
const PartnerKnowledgeStudio = lazyWithChunkRecovery(
  () => import("./pages/PartnerKnowledgeStudio")
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
const Resources = lazyWithChunkRecovery(() => import("./pages/Resources"));
const ResourceOntarioDailyInspection = lazyWithChunkRecovery(
  () => import("./pages/ResourceOntarioDailyInspection")
);
const ResourceAnnualInspectionChecklist = lazyWithChunkRecovery(
  () => import("./pages/ResourceAnnualInspectionChecklist")
);
const MaintenancePlanning = lazyWithChunkRecovery(
  () => import("./pages/MaintenancePlanning")
);
const FleetHealth = lazyWithChunkRecovery(() => import("./pages/FleetHealth"));
const FleetIntegrations = lazyWithChunkRecovery(
  () => import("./pages/FleetIntegrations")
);
const MaintenanceCaseDetail = lazyWithChunkRecovery(
  () => import("./pages/MaintenanceCaseDetail")
);
const Offline = lazyWithChunkRecovery(() => import("./pages/Offline"));
const Privacy = lazyWithChunkRecovery(() => import("./pages/Privacy"));
const Terms = lazyWithChunkRecovery(() => import("./pages/Terms"));
const TryOneCase = lazyWithChunkRecovery(() => import("./pages/TryOneCase"));
const PilotApply = lazyWithChunkRecovery(() => import("./pages/PilotApply"));
const PilotAccept = lazyWithChunkRecovery(() => import("./pages/PilotAccept"));
const CaseReviewQueue = lazyWithChunkRecovery(
  () => import("./pages/admin/CaseReviewQueue")
);
const OneCaseFunnel = lazyWithChunkRecovery(
  () => import("./pages/admin/OneCaseFunnel")
);

// Internal, gated Maintenance Planning area. The route is only registered when
// this Vite build flag is set, so normal pilot users never reach it. The page
// itself is additionally wrapped in RoleBasedRoute (owner/manager). This app is
// Vite + tRPC (not Next.js), so the flag uses the VITE_ prefix.
const MAINTENANCE_PLANNING_ENABLED =
  import.meta.env.VITE_ENABLE_MAINTENANCE_PLANNING === "true";

// Fleet Health & Maintenance pilot dashboard. Route registration is gated by a
// Vite build flag (defence in depth); the page is additionally wrapped in
// RoleBasedRoute (owner/manager) and every data query is gated server-side by
// the per-fleet `fleet_maintenance_pilot` + `fleet_health_dashboard` flags,
// which fail closed. Default on for the pilot build so enabled fleets reach it.
const FLEET_HEALTH_ENABLED =
  import.meta.env.VITE_ENABLE_FLEET_HEALTH !== "false";

// Public guest "/try-one-case" acquisition flow. Gated by a Vite build flag
// (fail-closed) that mirrors the server-side ENABLE_GUEST_WORKFLOW gate; guests
// have no fleet, so this is a global flag rather than a per-fleet fleetFeatures.
const TRY_ONE_CASE_ENABLED =
  import.meta.env.VITE_ENABLE_TRY_ONE_CASE === "true";

// Public-launch gate (client mirror of the server gate in shared/publicLaunch.ts).
// One flag drives BOTH surfaces so they can never disagree: when public launch is
// approved, `/` serves the restructured V2 homepage AND the funnel presents
// publicly (no invite). Off by default → current landing + invite-only funnel.
// Flip VITE_PUBLIC_LAUNCH_APPROVED to "true" only alongside the api-side
// PUBLIC_LAUNCH_APPROVED + PUBLIC_LAUNCH_SIGNOFF + CASE_REVIEWER_EMAIL; unset it
// to roll back instantly.
const PUBLIC_LAUNCH_APPROVED =
  import.meta.env.VITE_PUBLIC_LAUNCH_APPROVED === "true";
// Preview flag for the V3 landing (preventive + predictive). When set, `/` serves
// V3 so it can be previewed at the URL while V2 stays the approved public default.
// Flip this to "true" to promote V3 once approved; unset to roll back to V2.
const HOMEPAGE_V3_ENABLED =
  import.meta.env.VITE_HOMEPAGE_V3 === "true";
const HomePage = HOMEPAGE_V3_ENABLED
  ? FleetReadinessLandingV3
  : PUBLIC_LAUNCH_APPROVED
    ? FleetReadinessLandingV2
    : FleetReadinessLanding;

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-6">
      <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        Loading TruckFixr...
      </div>
    </div>
  );
}

function DashboardRedirect() {
  const { user, isLoading } = useAuthContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login?next=%2Fdashboard");
      return;
    }
    if (user.internalAdminRole) {
      setLocation("/admin/metrics");
      return;
    }
    setLocation(user.role === "manager" || user.role === "owner" ? "/manager" : "/driver");
  }, [isLoading, setLocation, user]);

  return <RouteFallback />;
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
        <Route path={"/login"} component={EmailAuth} />
        <Route path={"/signup"} component={EmailAuth} />
        <Route path={"/forgot-password"} component={EmailAuth} />
        <Route path={"/auth/email"} component={EmailAuth} />
        <Route path={"/dashboard"} component={DashboardRedirect} />
        <Route path={"/offline"} component={Offline} />
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
        {/* Unlisted preview of the V3 landing — lets it be reviewed at /landing-v3
            while `/` stays on the approved homepage. Promote by flipping
            VITE_HOMEPAGE_V3. */}
        <Route path={"/landing-v3"} component={FleetReadinessLandingV3} />
        {/* Primary conversion path: founder-led Fleet Maintenance Review. */}
        <Route path={"/fleet-review"} component={FleetReviewBooking} />
        {TRY_ONE_CASE_ENABLED ? (
          <Route path={"/try-one-case"} component={TryOneCase} />
        ) : null}
        {TRY_ONE_CASE_ENABLED ? (
          <Route path={"/pilot-apply"} component={PilotApply} />
        ) : null}
        {TRY_ONE_CASE_ENABLED ? (
          <Route path={"/pilot/accept"} component={PilotAccept} />
        ) : null}
        <Route path={"/pricing"} component={Pricing} />
        <Route path={"/privacy"} component={Privacy} />
        <Route path={"/terms"} component={Terms} />
        <Route
          path={"/fleet-downtime-cost-calculator"}
          component={FleetDowntimeCostCalculator}
        />
        <Route path={"/resources"} component={Resources} />
        <Route
          path={"/resources/ontario-daily-inspection-guide"}
          component={ResourceOntarioDailyInspection}
        />
        <Route
          path={"/resources/annual-inspection-planning-checklist"}
          component={ResourceAnnualInspectionChecklist}
        />
        {MAINTENANCE_PLANNING_ENABLED ? (
          <Route
            path={"/app/maintenance-planning"}
            component={MaintenancePlanning}
          />
        ) : null}
        {FLEET_HEALTH_ENABLED ? (
          <Route path={"/app/fleet-health"} component={FleetHealth} />
        ) : null}
        {FLEET_HEALTH_ENABLED ? (
          <Route path={"/app/integrations"} component={FleetIntegrations} />
        ) : null}
        {FLEET_HEALTH_ENABLED ? (
          <Route path={"/app/case/:id"} component={MaintenanceCaseDetail} />
        ) : null}
        <Route path={"/admin"} component={AdminMetricsDashboard} />
        <Route path={"/admin/metrics"} component={AdminMetricsDashboard} />
        <Route path={"/admin/fleets"} component={AdminMetricsDashboard} />
        <Route path={"/admin/fleets/:fleetId"} component={AdminFleetDetail} />
        <Route path={"/admin/billing"} component={AdminBillingDashboard} />
        <Route path={"/admin/case-review"} component={CaseReviewQueue} />
        <Route path={"/admin/one-case-funnel"} component={OneCaseFunnel} />
        <Route
          path={"/admin/fault-codes"}
          component={FaultCodeReviewDashboard}
        />
        <Route path={"/partner/knowledge"} component={PartnerKnowledgeStudio} />
        <Route path={"/404"} component={NotFound} />
        <Route path={"/"} component={HomePage} />
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
          <InstallAppPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
