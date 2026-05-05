import { useMemo, useState, type FormEvent } from "react";
import AppLogo from "@/components/AppLogo";
import PasswordChecklist from "@/components/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { trpc } from "@/lib/trpc";
import { splitFullName, validateTruckFixrPassword } from "../../../shared/passwordPolicy";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AccessDriverInvite() {
  const [location] = useLocation();
  const token = useMemo(() => new URLSearchParams(location.split("?")[1] ?? "").get("token") ?? "", [location]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const invitationQuery = trpc.access.getDriverInvitation.useQuery({ token }, { enabled: token.length >= 10 });
  const invitation = invitationQuery.data?.invitation ?? null;
  const nameParts = useMemo(() => splitFullName(fullName), [fullName]);
  const passwordValidation = useMemo(
    () =>
      validateTruckFixrPassword({
        password,
        confirmPassword,
        email,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        companyName: invitation?.companyName ?? "",
      }),
    [confirmPassword, email, fullName, invitation?.companyName, nameParts.firstName, nameParts.lastName, password]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(getApiUrl("/api/email/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          name: fullName,
          accessMode: "driver_invite",
          inviteToken: token,
          companyName: invitation?.companyName ?? undefined,
        }),
      });
      const payload = await readApiPayload(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the invitation response. Check the live API base URL configuration.",
      });
      if (!response.ok) {
        throw new Error((payload as any).error || "Unable to accept invitation");
      }

      if ((payload as any)?.requiresVerification) {
        setMessage("Please verify your email to finish accepting your invitation.");
        toast.success("Please verify your email to finish accepting your invitation.");
      } else {
        setMessage("Invitation accepted. Redirecting to your driver dashboard...");
        toast.success("Invitation accepted.");
        window.location.href = "/driver";
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to accept invitation";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = Boolean(invitation?.valid) && fullName.trim().length > 0 && email.trim().length > 0 && passwordValidation.isValid && !isSubmitting;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="mb-8 flex items-center">
          <AppLogo variant="full" imageClassName="h-10 w-auto" />
        </a>
        <Card className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Accept driver invitation</p>
          <h1 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.04em] text-[#00263F] sm:text-4xl">
            You have been invited to join TruckFixr Fleet AI.
          </h1>
          {invitation?.valid ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p className="font-semibold">{invitation.companyName || "Your company"} invited you on TruckFixr.</p>
              <p className="mt-1">Confirm your details below to accept the invitation and enter your driver dashboard.</p>
            </div>
          ) : token ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              This invitation link is invalid or expired.
            </div>
          ) : null}

          {invitation?.valid ? (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-full-name">Full name *</Label>
                  <Input id="invite-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email *</Label>
                  <Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-password">Password *</Label>
                  <Input
                    id="invite-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3C5D]" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showPassword ? "Hide password" : "Show password"}
                  </button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-confirm-password">Confirm password *</Label>
                  <Input
                    id="invite-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                  <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3C5D]" onClick={() => setShowConfirmPassword((current) => !current)}>
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showConfirmPassword ? "Hide password" : "Show password"}
                  </button>
                </div>
              </div>
              <PasswordChecklist validation={passwordValidation} />
              {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}
              <Button type="submit" className="w-full rounded-full bg-[#E32636] py-6 font-bold text-white" disabled={!canSubmit}>
                {isSubmitting ? "Submitting..." : "Accept Invitation"}
              </Button>
            </form>
          ) : (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <ShieldCheck className="h-5 w-5 text-[#0B3C5D]" />
              If you already have an account, you can still sign in from the Access page.
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
