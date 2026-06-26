import { useEffect, useMemo, useState } from "react";
import AppLogo from "@/components/AppLogo";
import PasswordChecklist from "@/components/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trackSignup, trackLogin } from "@/lib/analytics";
import { splitFullName, validateTruckFixrPassword } from "../../../shared/passwordPolicy";
import { Eye, EyeOff } from "lucide-react";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";
import { useAuthContext } from "@/hooks/useAuthContext";

function getDashboardPath(user: { role?: string | null; internalAdminRole?: string | null }) {
  if (user.internalAdminRole) return "/admin/metrics";
  if (user.role === "manager" || user.role === "owner") return "/manager";
  return "/driver";
}

export default function EmailAuth() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: isAuthLoading } = useAuthContext();
  const [isSignup, setIsSignup] = useState(location === "/signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [usePilotAccess, setUsePilotAccess] = useState(false);
  const [pilotCode, setPilotCode] = useState("");
  const [pilotCompanyName, setPilotCompanyName] = useState(loadCompanyName());
  const [pilotCodeError, setPilotCodeError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [recoveryAccessToken, setRecoveryAccessToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [inviteContext, setInviteContext] = useState<{
    managerName: string;
    managerEmail: string;
    pilotCode: string;
    companyName: string;
  } | null>(null);
  const activateFreeMutation = trpc.subscriptions.activateFree.useMutation();
  const redeemPilotAccessMutation = trpc.subscriptions.redeemPilotAccess.useMutation();
  const nameParts = useMemo(() => splitFullName(name), [name]);
  const passwordValidation = useMemo(
    () =>
      validateTruckFixrPassword({
        password,
        confirmPassword: isSignup || isRecoveryMode ? confirmPassword : undefined,
        email,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        companyName: pilotCompanyName,
      }),
    [confirmPassword, email, isRecoveryMode, isSignup, nameParts.firstName, nameParts.lastName, password, pilotCompanyName]
  );
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    !isLoading &&
    (isForgotPasswordMode
      ? isEmailValid
      : isRecoveryMode
        ? passwordValidation.isValid
        : isSignup
          ? isEmailValid && passwordValidation.isValid && name.trim().length > 0
      : isEmailValid && password.length > 0);

  const markSessionActivity = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("truckfixr:last-activity-at", String(Date.now()));
  };

  useEffect(() => {
    setIsSignup(location === "/signup");
    setIsForgotPasswordMode(location === "/forgot-password");
  }, [location]);

  // Wait for auth.me to settle; a cold PWA launch may have a valid session
  // cookie that has not been restored yet.
  useEffect(() => {
    if (isAuthLoading || !user) return;
    setLocation(getDashboardPath(user));
  }, [isAuthLoading, setLocation, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    const inviteEmail = params.get("email") ?? "";
    const managerEmail = params.get("managerEmail") ?? "";
    const managerName = params.get("managerName") ?? "";
    const invitedPilotCode = params.get("pilotCode") ?? "";
    const companyName = params.get("companyName") ?? "";

    if (invitedPilotCode) {
      setUsePilotAccess(true);
      setPilotCode(invitedPilotCode);
    }
    if (companyName) {
      setPilotCompanyName(companyName);
      saveCompanyName(companyName);
    }

    if (invite === "driver") {
      setIsSignup(true);
      if (inviteEmail) {
        setEmail(inviteEmail);
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
    if (pilotCompanyName.trim()) {
      saveCompanyName(pilotCompanyName);
    }
  }, [pilotCompanyName]);

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
    const response = await fetch(getApiUrl('/api/email/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    const payload = await readApiPayload(response, {
      htmlErrorMessage: "TruckFixr received an HTML page instead of the signup API response. Check the live API base URL configuration.",
    });
    if (!response.ok) {
      throw new Error((payload as any).error || 'Signup failed');
    }
    return payload;
  };

  const handleSignin = async (email: string, password: string) => {
    const response = await fetch(getApiUrl('/api/email/signin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const payload = await readApiPayload(response, {
      htmlErrorMessage: "TruckFixr received an HTML page instead of the signin API response. Check the live API base URL configuration.",
    });
    if (!response.ok) {
      throw new Error((payload as any).error || 'Signin failed');
    }
    return payload;
  };

  const handleForgotPassword = async (email: string) => {
    const response = await fetch(getApiUrl('/api/email/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const payload = await readApiPayload(response).catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as any).error || 'Unable to send password reset email');
    }
    return payload;
  };

  const handleResetPassword = async (accessToken: string, password: string) => {
    const response = await fetch(getApiUrl('/api/email/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, password }),
    });
    const payload = await readApiPayload(response).catch(() => ({}));
    if (!response.ok) {
      throw new Error((payload as any).error || 'Unable to reset password');
    }
    return payload;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setPilotCodeError("");

    try {
      if (isForgotPasswordMode) {
        await handleForgotPassword(email);
        toast.success("If an account exists for this email, a password reset link has been sent.");
        setIsForgotPasswordMode(false);
        setIsLoading(false);
        return;
      }

      if (isRecoveryMode) {
        if (!passwordValidation.isValid) {
          toast.error(passwordValidation.errors[0] ?? "Password does not meet TruckFixr security requirements.");
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
        if (!passwordValidation.isValid) {
          toast.error(passwordValidation.errors[0] ?? "Password does not meet TruckFixr security requirements.");
          setIsLoading(false);
          return;
        }
        const signupResult = await handleSignup(email, password, name);
        const postSignupPath = inviteContext ? "/profile" : "/onboarding";
        if ((signupResult as any)?.requiresVerification) {
          toast.success("Check your email to verify your account before signing in.");
          setIsSignup(false);
          setPassword("");
          setConfirmPassword("");
          setLocation("/auth/email");
          setIsLoading(false);
          return;
        }
        markSessionActivity();
        trackSignup('email', { email, name });
        if (usePilotAccess) {
          const redemption = await redeemPilotAccessMutation.mutateAsync({
            code: pilotCode,
            companyName: pilotCompanyName,
          });
          toast.success(
            `Pilot Access activated through ${redemption.pilotAccess?.fleetName || "your fleet"}. Redirecting to your next setup step...`
          );
          setTimeout(() => {
            window.location.href = postSignupPath;
          }, 600);
        } else {
          await activateFreeMutation.mutateAsync();
          toast.success("Account created! Redirecting to first-time setup...");
          setTimeout(() => {
            window.location.href = postSignupPath;
          }, 600);
        }
      } else {
        const result = await handleSignin(email, password);
        if (result.success) {
          markSessionActivity();
          trackLogin('email', { email });
          const authenticatedUser = result.user as
            | {
                role?: string | null;
                internalAdminRole?: string | null;
              }
            | undefined;

          if (!authenticatedUser) {
            throw new Error("Sign-in completed, but the authenticated user payload was missing. Please try again.");
          }

          window.location.assign("/dashboard");
        }
      }
    } catch (error: any) {
      // Extract the error message from tRPC error
      const rawErrorMessage = error?.data?.zodError?.[0]?.message || error?.message || "Authentication failed";
      const errorMessage =
        isForgotPasswordMode
          ? "If an account exists for this email, a password reset link has been sent."
        : !isSignup && !isRecoveryMode
          ? rawErrorMessage.includes("Too many failed")
            ? rawErrorMessage
            : "Invalid email or password. Please try again or reset your password."
          : rawErrorMessage;
      if (usePilotAccess && isSignup) {
        setPilotCodeError(errorMessage);
      }
      if (isForgotPasswordMode) {
        toast.success(errorMessage);
      } else {
        toast.error(errorMessage);
      }
      console.error('[Auth Error]', { error, errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p className="text-sm font-medium text-slate-600">Restoring your TruckFixr session…</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="mb-5 flex justify-center">
              <AppLogo imageClassName="h-14" frameClassName="p-2.5" href="/" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              {isForgotPasswordMode ? "Reset Password" : isRecoveryMode ? "Reset Password" : isSignup ? "Create Account" : "Sign In"}
            </h1>
            <p className="text-slate-600">
              {isForgotPasswordMode
                ? "Enter your email and we'll send reset instructions"
                : isRecoveryMode
                ? "Create a new password to finish recovery"
                : isSignup
                ? "Create your TruckFixr account, then we’ll walk you through fleet setup, your first truck, and your first inspection."
                : "Welcome back to TruckFixr."}
            </p>
          </div>

          {inviteContext && !isRecoveryMode ? (
            <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">Driver invite ready</p>
              <p className="mt-1">
                {inviteContext.managerName || inviteContext.managerEmail || "Your manager"} invited you to TruckFixr. This invite will be confirmed by email before access is granted.
              </p>
              {inviteContext.pilotCode ? (
                <p className="mt-1">
                  This invite includes Pilot Access code <span className="font-semibold">{inviteContext.pilotCode}</span>
                  {inviteContext.companyName ? ` for ${inviteContext.companyName}` : ""}.
                </p>
              ) : null}
            </div>
          ) : null}

          {isSignup && !inviteContext ? (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Start simple</p>
              <p className="mt-1">
                New self-serve accounts begin on a free trial so you can create your fleet, add your first truck, and test the workflow before choosing a paid plan.
              </p>
              <p className="mt-2">
                Need pricing details first? <a href="/pricing" className="font-semibold text-blue-700 hover:text-blue-800">View plans</a>.
              </p>
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
                  className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
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
                  className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
              </div>
            )}

            {!isForgotPasswordMode && (
            <div>
              <Label htmlFor="password">{isRecoveryMode ? "New Password" : "Password"}</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPassword ? "Hide password" : "Show password"}
              </button>
            </div>
            )}

            {(isRecoveryMode || isSignup) && (
              <div>
                <Label htmlFor="confirm-password">{isRecoveryMode ? "Confirm New Password" : "Confirm Password"}</Label>
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showConfirmPassword ? "Hide password" : "Show password"}
                </button>
                <PasswordChecklist validation={passwordValidation} />
              </div>
            )}

            {!isRecoveryMode && isSignup && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Pilot or invite-based access</p>
                <p className="mt-1 text-xs text-slate-500">
                  Only use this if TruckFixr gave you a pilot code or sent you an invitation-based setup path.
                </p>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setUsePilotAccess((current) => {
                        const next = !current;
                        if (!next) {
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
                          className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                          required={usePilotAccess}
                        />
                      </div>
                      <div>
                        <Label htmlFor="pilot-company">Fleet / company name</Label>
                        <Input
                          id="pilot-company"
                          value={pilotCompanyName}
                          onChange={(e) => {
                            setPilotCompanyName(e.target.value);
                            if (e.target.value.trim()) {
                              saveCompanyName(e.target.value);
                            }
                          }}
                          placeholder="Acme Logistics"
                          className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                          required={usePilotAccess}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        Pilot Access is available only through a valid code and activates access before you enter the app.
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
              disabled={!canSubmit}
            >
              {isLoading
                ? "Loading..."
                : isForgotPasswordMode
                  ? "Send Reset Link"
                  : isRecoveryMode
                  ? "Update Password"
                  : isSignup
                  ? usePilotAccess
                    ? "Create Account & Activate Pilot Access"
                    : "Create Account & Start Setup"
                  : "Sign In"}
            </Button>
          </form>

          {!isRecoveryMode && !isSignup && !isForgotPasswordMode && (
            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={() => setIsForgotPasswordMode(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Forgot Password?
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              {isRecoveryMode || isForgotPasswordMode ? "Remembered it?" : isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  if (isRecoveryMode || isForgotPasswordMode) {
                    setIsRecoveryMode(false);
                    setIsForgotPasswordMode(false);
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
                  setUsePilotAccess(false);
                  setPilotCode("");
                  setPilotCompanyName("");
                  setPilotCodeError("");
                  setLocation(nextIsSignup ? "/signup" : "/auth/email");
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                {isRecoveryMode || isForgotPasswordMode ? "Back to Sign In" : isSignup ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
