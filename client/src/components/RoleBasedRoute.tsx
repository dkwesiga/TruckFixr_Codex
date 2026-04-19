import { useAuthContext } from "@/hooks/useAuthContext";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface RoleBasedRouteProps {
  children: React.ReactNode;
  requiredRoles?: ("owner" | "manager" | "driver")[];
  fallback?: React.ReactNode;
}

export function RoleBasedRoute({
  children,
  requiredRoles,
  fallback,
}: RoleBasedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuthContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, setLocation]);

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
