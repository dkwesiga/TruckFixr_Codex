import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import LandingSaaS from "./pages/LandingSaaS";
import Home from "./pages/Home";
import ManagerDashboardSaaS from "./pages/ManagerDashboardSaaS";
import DriverDashboardSaaS from "./pages/DriverDashboardSaaS";
import DriverDiagnosis from "./pages/DriverDiagnosis";
import Onboarding from "./pages/Onboarding";
import DriverInspectionNSC from "./pages/DriverInspectionNSC";
import DefectDetail from "./pages/DefectDetail";
import TruckDetail from "./pages/TruckDetail";
import Pricing from "./pages/Pricing";
import EmailAuth from "./pages/EmailAuth";
import UserProfile from "./pages/UserProfile";

function Router() {
  return (
    <Switch>
      <Route path={"/signup"} component={EmailAuth} />
      <Route path={"/auth/email"} component={EmailAuth} />
      <Route path={"/profile"} component={UserProfile} />
      <Route path={"/app"} component={Home} />
      <Route path={"/onboarding"} component={Onboarding} />
      <Route path={"/manager"} component={ManagerDashboardSaaS} />
      <Route path={"/driver"} component={DriverDashboardSaaS} />
      <Route path={"/diagnosis"} component={DriverDiagnosis} />
      <Route path={"/inspection"} component={DriverInspectionNSC} />
      <Route path={"/defect/:id"} component={DefectDetail} />
      <Route path={"/truck/:id"} component={TruckDetail} />
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/404"} component={NotFound} />
      <Route path={"/"} component={LandingSaaS} />
      <Route component={NotFound} />
    </Switch>
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
