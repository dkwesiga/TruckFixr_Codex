import { useAuthContext } from "@/hooks/useAuthContext";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiUrl } from "@/lib/api";
import { toast } from "sonner";

interface RoleBasedRouteProps {
  children: React.ReactNode;
  requiredRoles?: ("owner" | "manager" | "driver" | "owner_operator")[];
  fallback?: React.ReactNode;
}

export function RoleBasedRoute({
  children,
  requiredRoles,
  fallback,
}: RoleBasedRouteProps) {
  const { user, isLoading, isAuthenticated, logout } = useAuthContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    const key = "truckfixr:last-activity-at";
    const timeoutMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const storedActivityAt = Number(window.localStorage.getItem(key) ?? "");
    const hasStoredActivity = Number.isFinite(storedActivityAt) && storedActivityAt > 0;
    const sessionStartedAtValue = user?.lastAuthAt ?? user?.lastSignedIn ?? null;
    const sessionStartedAt = sessionStartedAtValue ? new Date(sessionStartedAtValue).getTime() : NaN;

    if (!hasStoredActivity) {
      window.localStorage.setItem(key, String(now));
      return;
    }

    if (Number.isFinite(sessionStartedAt) && sessionStartedAt > 0 && storedActivityAt < sessionStartedAt) {
      window.localStorage.setItem(key, String(now));
      return;
    }

    if (now - storedActivityAt > timeoutMs) {
      toast.error("Your session has expired for security. Please sign in again.");
      void logout();
      return;
    }

    const markActivity = () => {
      window.localStorage.setItem(key, String(Date.now()));
    };
    markActivity();
    window.addEventListener("click", markActivity);
    window.addEventListener("keydown", markActivity);
    window.addEventListener("touchstart", markActivity);
    return () => {
      window.removeEventListener("click", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, [isAuthenticated, logout, user?.lastAuthAt, user?.lastSignedIn]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback || null;
  }

  if (user && user.emailVerified === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check your email to verify your account</CardTitle>
            <CardDescription>
              Verify your email before accessing dashboards, vehicles, inspections, diagnostics, billing, or reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={async () => {
                await fetch(getApiUrl("/api/email/resend-verification"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: user.email }),
                }).catch(() => null);
                toast.success("If verification is required, a verification link has been sent.");
              }}
            >
              Resend verification email
            </Button>
            <Button variant="outline" className="w-full" onClick={logout}>
              Log out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role as any)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
