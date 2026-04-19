import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trackSignup, trackLogin } from "@/lib/analytics";
import { SUBSCRIPTION_PLANS, type SubscriptionTier } from "../../../shared/subscription";

export default function EmailAuth() {
  const [location, setLocation] = useLocation();
  const [isSignup, setIsSignup] = useState(location === "/signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>("free");
  const [usePilotAccess, setUsePilotAccess] = useState(false);
  const [pilotCode, setPilotCode] = useState("");
  const [pilotCompanyName, setPilotCompanyName] = useState("");
  const [pilotCodeError, setPilotCodeError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState("");
  const [inviteContext, setInviteContext] = useState<{
    managerName: string;
    managerEmail: string;
    pilotCode: string;
    companyName: string;
  } | null>(null);
  const isGoogleAuthEnabled = Boolean(import.meta.env.VITE_OAUTH_SERVER_URL);
  const utils = trpc.useUtils();
  const activateFreeMutation = trpc.subscriptions.activateFree.useMutation();
  const createCheckoutMutation = trpc.subscriptions.createCheckoutSession.useMutation();
  const redeemPilotAccessMutation = trpc.subscriptions.redeemPilotAccess.useMutation();
  const publicPlans = Object.values(SUBSCRIPTION_PLANS).filter((plan) => plan.publicSelectable);

  useEffect(() => {
    setIsSignup(location === "/signup");
  }, [location]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    const inviteEmail = params.get("email") ?? "";
    const managerEmail = params.get("managerEmail") ?? "";
    const managerName = params.get("managerName") ?? "";
    const invitedPilotCode = params.get("pilotCode") ?? "";
    const companyName = params.get("companyName") ?? "";

    if (invite === "driver") {
      setIsSignup(true);
      if (inviteEmail) {
        setEmail(inviteEmail);
      }
      if (invitedPilotCode) {
        setUsePilotAccess(true);
        setPilotCode(invitedPilotCode);
      }
      if (companyName) {
        setPilotCompanyName(companyName);
      }
      setInviteContext({
        managerName,
        managerEmail,
        pilotCode: invitedPilotCode,
        companyName,
      });
    }
  }, []);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const params = new URLSearchParams(hash);
    const type = params.get("type");
    const accessToken = params.get("access_token") ?? "";

    if (type === "recovery" && accessToken) {
      setIsRecoveryMode(true);
      setIsSignup(false);
      setRecoveryAccessToken(accessToken);
    }
  }, []);

  // Use fetch for API endpoints that set cookies
  const handleSignup = async (email: string, password: string, name: string) => {
    const response = await fetch('/api/email/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Signup failed');
    }
    return response.json();
  };

  const handleSignin = async (email: string, password: string) => {
    const response = await fetch('/api/email/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Signin failed');
    }
    return response.json();
  };

  const handleForgotPassword = async (email: string) => {
    const response = await fetch('/api/email/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to send password reset email');
    }
    return payload;
  };

  const handleResetPassword = async (accessToken: string, password: string) => {
    const response = await fetch('/api/email/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, password }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Unable to reset password');
    }
    return payload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setPilotCodeError("");

    try {
      if (isRecoveryMode) {
        if (password !== confirmPassword) {
          toast.error("Passwords do not match");
          setIsLoading(false);
          return;
        }

        await handleResetPassword(recoveryAccessToken, password);
        toast.success("Password updated. Please sign in with your new password.");
        setIsRecoveryMode(false);
        setRecoveryAccessToken("");
        setPassword("");
        setConfirmPassword("");
        if (typeof window !== "undefined") {
          window.history.replaceState({}, document.title, "/auth/email");
        }
        return;
      }

      if (isSignup) {
        if (!name.trim()) {
          toast.error("Please enter your name");
          setIsLoading(false);
          return;
        }
        await handleSignup(email, password, name);
        await utils.auth.me.invalidate();
        await utils.auth.me.fetch();
        trackSignup('email', { email, name });
        if (usePilotAccess) {
          const redemption = await redeemPilotAccessMutation.mutateAsync({
            code: pilotCode,
            companyName: pilotCompanyName,
          });
          toast.success(
            `Pilot Access activated through ${redemption.pilotAccess?.fleetName || "your fleet"}. Redirecting to profile setup...`
          );
          setTimeout(() => {
            window.location.href = '/profile';
          }, 600);
        } else if (selectedTier === "free") {
          await activateFreeMutation.mutateAsync();
          toast.success("Account created! Redirecting to profile setup...");
          setTimeout(() => {
            window.location.href = '/profile';
          }, 600);
        } else {
          const checkout = await createCheckoutMutation.mutateAsync({
            tier: selectedTier === "fleet" ? "fleet" : "pro",
            successPath: "/profile?subscription=success",
            cancelPath: "/pricing?subscription=cancelled",
          });

          if (!checkout.checkoutUrl) {
            throw new Error("Stripe checkout could not be started.");
          }

          toast.success(`Account created! Redirecting to ${SUBSCRIPTION_PLANS[selectedTier].label} checkout...`);
          window.location.href = checkout.checkoutUrl;
        }
      } else {
        const result = await handleSignin(email, password);
        if (result.success) {
          await utils.auth.me.invalidate();
          const authenticatedUser = await utils.auth.me.fetch();

          if (!authenticatedUser) {
            throw new Error("Sign-in completed, but your session was not restored. Please try again.");
          }

          trackLogin('email', { email });
          toast.success("Signed in successfully!");
          // Redirect based on the authenticated user so we don't rely on stale response data.
          const redirectPath =
            authenticatedUser.role === 'manager' || authenticatedUser.role === 'owner'
              ? '/manager'
              : '/driver';
          // Use full page reload to ensure session cookie is recognized and auth context updates
          setTimeout(() => {
            window.location.href = redirectPath;
          }, 500);
        }
      }
    } catch (error: any) {
      // Extract the error message from tRPC error
      const errorMessage = error?.data?.zodError?.[0]?.message || 
                          error?.message || 
                          "Authentication failed";
      if (usePilotAccess && isSignup) {
        setPilotCodeError(errorMessage);
      }
      toast.error(errorMessage);
      console.error('[Auth Error]', { error, errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {isRecoveryMode ? "Reset Password" : isSignup ? "Create Account" : "Sign In"}
            </h1>
            <p className="text-slate-600">
              {isRecoveryMode
                ? "Create a new password to finish recovery"
                : isSignup
                ? "Join TruckFixr to manage your fleet"
                : "Welcome back to TruckFixr"}
            </p>
          </div>

          {inviteContext && !isRecoveryMode ? (
            <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">Driver invite ready</p>
              <p className="mt-1">
                {inviteContext.managerName || inviteContext.managerEmail || "Your manager"} invited you to TruckFixr.
              </p>
              {inviteContext.pilotCode ? (
                <p className="mt-1">
                  This invite includes Pilot Access code <span className="font-semibold">{inviteContext.pilotCode}</span>
                  {inviteContext.companyName ? ` for ${inviteContext.companyName}` : ""}.
                </p>
              ) : null}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isRecoveryMode && isSignup && (
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            {!isRecoveryMode && (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="password">{isRecoveryMode ? "New Password" : "Password"}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              {(isSignup || isRecoveryMode) && (
                <p className="text-xs text-slate-500 mt-1">
                  Must be at least 8 characters
                </p>
              )}
            </div>

            {isRecoveryMode && (
              <div>
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}

            {!isRecoveryMode && isSignup && (
              <div>
                <Label>Select Plan</Label>
                <div className="mt-2 grid gap-3">
                  {publicPlans.map((plan) => (
                    <button
                      key={plan.tier}
                      type="button"
                      onClick={() => setSelectedTier(plan.tier)}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        selectedTier === plan.tier
                          ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{plan.label}</p>
                          <p className="mt-1 text-xs text-slate-600">{plan.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            {plan.monthlyPriceUsd === 0 ? "Free" : `$${plan.monthlyPriceUsd}/mo`}
                          </p>
                          <p className="text-xs text-slate-500">
                            {plan.limits.vehicleCount === null ? "Unlimited vehicles" : `${plan.limits.vehicleCount} vehicles`}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Free plans continue directly. Paid plans go to Stripe checkout before activation.
                </p>
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setUsePilotAccess((current) => {
                        const next = !current;
                        if (next) {
                          setSelectedTier("free");
                        } else {
                          setPilotCode("");
                          setPilotCompanyName("");
                          setPilotCodeError("");
                        }
                        return next;
                      });
                    }}
                    className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                  >
                    {usePilotAccess ? "Hide Pilot Access redemption" : "Have a Pilot Access code?"}
                  </button>
                  {usePilotAccess ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <Label htmlFor="pilot-code">Pilot Access code</Label>
                        <Input
                          id="pilot-code"
                          value={pilotCode}
                          onChange={(e) => setPilotCode(e.target.value.toUpperCase())}
                          placeholder="TRUCKFIXR-PILOT"
                          className="mt-2"
                          required={usePilotAccess}
                        />
                      </div>
                      <div>
                        <Label htmlFor="pilot-company">Fleet / company name</Label>
                        <Input
                          id="pilot-company"
                          value={pilotCompanyName}
                          onChange={(e) => setPilotCompanyName(e.target.value)}
                          placeholder="Acme Logistics"
                          className="mt-2"
                          required={usePilotAccess}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        Pilot Access is available only through a valid code and activates before you enter the app.
                      </p>
                      {pilotCodeError ? (
                        <p className="text-xs font-medium text-red-600">{pilotCodeError}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading
                ? "Loading..."
                : isRecoveryMode
                  ? "Update Password"
                  : isSignup
                  ? usePilotAccess
                    ? "Create Account & Activate Pilot Access"
                    : "Create Account"
                  : "Sign In"}
            </Button>
          </form>

          {!isRecoveryMode && !isSignup && (
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    toast.error("Enter your email first, then try Forgot Password.");
                    return;
                  }

                  try {
                    const result = await handleForgotPassword(email);
                    toast.success(result.message || "Password reset email sent.");
                  } catch (error: any) {
                    toast.error(error?.message || "Unable to send password reset email");
                  }
                }}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              {isRecoveryMode ? "Remembered it?" : isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  if (isRecoveryMode) {
                    setIsRecoveryMode(false);
                    setRecoveryAccessToken("");
                    setPassword("");
                    setConfirmPassword("");
                    if (typeof window !== "undefined") {
                      window.history.replaceState({}, document.title, "/auth/email");
                    }
                    return;
                  }
                  const nextIsSignup = !isSignup;
                  setIsSignup(nextIsSignup);
                  setEmail("");
                  setPassword("");
                  setConfirmPassword("");
                  setName("");
                  setSelectedTier("free");
                  setUsePilotAccess(false);
                  setPilotCode("");
                  setPilotCompanyName("");
                  setPilotCodeError("");
                  setLocation(nextIsSignup ? "/signup" : "/auth/email");
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                {isRecoveryMode ? "Back to Sign In" : isSignup ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>

          {!isRecoveryMode && (
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center mb-4">
              Or continue with Google
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!isGoogleAuthEnabled}
              onClick={() => {
                if (!isGoogleAuthEnabled) {
                  toast.error("Google sign-in is not configured for this environment");
                  return;
                }
                window.location.href = "/api/oauth/login";
              }}
            >
              {isGoogleAuthEnabled ? "Google" : "Google Unavailable"}
            </Button>
            {!isGoogleAuthEnabled && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Add <code>OAUTH_SERVER_URL</code> and <code>VITE_OAUTH_SERVER_URL</code> to enable Google sign-in.
              </p>
            )}
          </div>
          )}
        </div>
      </Card>
    </div>
  );
}
