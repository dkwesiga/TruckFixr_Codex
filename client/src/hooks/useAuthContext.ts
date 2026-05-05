import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import type { User } from "../../../drizzle/schema";
import { identifyUser, trackLogout, setUserProperties } from "@/lib/analytics";

export function useAuthContext() {
  const { data: user, isLoading, error } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (user) {
      // Identify user in analytics
      identifyUser(String(user.id), {
        email: user.email,
        name: user.name,
        role: user.role,
        loginMethod: user.loginMethod,
      });
      // Set user properties for segmentation
      setUserProperties({
        email: user.email,
        name: user.name,
        role: user.role,
        login_method: user.loginMethod,
        last_signed_in: user.lastSignedIn,
      });
    }
  }, [user]);

  const logout = async () => {
    trackLogout();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("truckfixr:last-activity-at");
    }
    await logoutMutation.mutateAsync();
    window.location.href = "/";
  };

  return {
    user: user as User | null,
    isLoading,
    error,
    isAuthenticated,
    logout,
  };
}
