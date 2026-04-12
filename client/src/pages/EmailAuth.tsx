import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trackSignup, trackLogin } from "@/lib/analytics";

export default function EmailAuth() {
  const [location, setLocation] = useLocation();
  const [isSignup, setIsSignup] = useState(location === "/signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isGoogleAuthEnabled = Boolean(import.meta.env.VITE_OAUTH_SERVER_URL);
  const utils = trpc.useUtils();

  useEffect(() => {
    setIsSignup(location === "/signup");
  }, [location]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignup) {
        if (!name.trim()) {
          toast.error("Please enter your name");
          setIsLoading(false);
          return;
        }
        const result = await handleSignup(email, password, name);
        trackSignup('email', { email, name });
        toast.success("Account created! Redirecting to profile setup...");
        // Redirect to profile page after signup
        setTimeout(() => {
          window.location.href = '/profile';
        }, 1000);
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
              {isSignup ? "Create Account" : "Sign In"}
            </h1>
            <p className="text-slate-600">
              {isSignup
                ? "Join TruckFixr to manage your fleet"
                : "Welcome back to TruckFixr"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
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

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              {isSignup && (
                <p className="text-xs text-slate-500 mt-1">
                  Must be at least 8 characters
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading
                ? "Loading..."
                : isSignup
                  ? "Create Account"
                  : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  const nextIsSignup = !isSignup;
                  setIsSignup(nextIsSignup);
                  setEmail("");
                  setPassword("");
                  setName("");
                  setLocation(nextIsSignup ? "/signup" : "/auth/email");
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                {isSignup ? "Sign In" : "Sign Up"}
              </button>
            </p>
          </div>

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
        </div>
      </Card>
    </div>
  );
}
