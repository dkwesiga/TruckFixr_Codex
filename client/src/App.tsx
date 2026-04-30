import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import VerifiedInspection from "./pages/VerifiedInspection";
import LandingSaaS from "./pages/LandingSaaS";

const Home = lazy(() => import("./pages/Home"));
const ManagerDashboardSaaS = lazy(() => import("./pages/ManagerDashboardFixed"));
const DriverDashboardSaaS = lazy(() => import("./pages/DriverDashboardSaaS"));
const DriverDiagnosis = lazy(() => import("./pages/DriverDiagnosis"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const DefectDetail = lazy(() => import("./pages/DefectDetail"));
const TruckDetail = lazy(() => import("./pages/TruckDetail"));
const Pricing = lazy(() => import("./pages/Pricing"));
const EmailAuth = lazy(() => import("./pages/EmailAuth"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const AdminBillingDashboard = lazy(() => import("./pages/AdminBillingDashboard"));
const InspectionReportDvir = lazy(() => import("./pages/InspectionReportDvir"));

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
        <Route path={"/signup"} component={EmailAuth} />
        <Route path={"/auth/email"} component={EmailAuth} />
        <Route path={"/profile"} component={UserProfile} />
        <Route path={"/app"} component={Home} />
        <Route path={"/onboarding"} component={Onboarding} />
        <Route path={"/manager"} component={ManagerDashboardSaaS} />
        <Route path={"/driver"} component={DriverDashboardSaaS} />
        <Route path={"/diagnosis"} component={DriverDiagnosis} />
        <Route path={"/inspection"} component={VerifiedInspection} />
        <Route path={"/inspection-report/:id"} component={InspectionReportDvir} />
        <Route path={"/defect/:id"} component={DefectDetail} />
        <Route path={"/truck/:id"} component={TruckDetail} />
        <Route path={"/pricing"} component={Pricing} />
        <Route path={"/admin/billing"} component={AdminBillingDashboard} />
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
