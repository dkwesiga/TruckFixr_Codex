import { useEffect, useMemo, useState, type FormEvent } from "react";
import AppLogo from "@/components/AppLogo";
import PasswordChecklist from "@/components/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { trpc } from "@/lib/trpc";
import { splitFullName, validateTruckFixrPassword } from "../../../shared/passwordPolicy";
import { Eye, EyeOff, Ticket } from "lucide-react";
import { toast } from "sonner";

export default function AccessPilotCode() {
  const [pilotCode, setPilotCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validationRequested, setValidationRequested] = useState(false);
  const utils = trpc.useUtils();

  const codeQuery = trpc.access.validatePilotCode.useQuery(
    { code: submittedCode },
    { enabled: validationRequested && submittedCode.trim().length > 0 }
  );

  const validatedCode = codeQuery.data;
  const nameParts = useMemo(() => splitFullName(fullName), [fullName]);
  const passwordValidation = useMemo(
    () =>
      validateTruckFixrPassword({
        password,
        confirmPassword,
        email,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        companyName: companyName || validatedCode?.companyName || "",
      }),
    [companyName, confirmPassword, email, nameParts.firstName, nameParts.lastName, password, validatedCode?.companyName]
  );

  useEffect(() => {
    if (validatedCode?.companyName && !companyName) {
      setCompanyName(validatedCode.companyName);
    }
  }, [companyName, validatedCode?.companyName]);

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setValidationRequested(true);
    setSubmittedCode(pilotCode.trim().toUpperCase());
    try {
      const result = await utils.access.validatePilotCode.fetch({ code: pilotCode.trim() });
      if (!result.valid) {
        setMessage("That pilot code is invalid or already used.");
        toast.error("That pilot code is invalid or already used.");
        return;
      }
      if (!companyName.trim()) {
        setCompanyName(result.companyName ?? "");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That pilot code was not recognized.");
      toast.error("That pilot code was not recognized.");
    }
  };

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
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
          accessMode: "pilot",
          companyName: companyName || validatedCode?.companyName || "",
          pilotCode: pilotCode.trim(),
        }),
      });
      const payload = await readApiPayload(response, {
        htmlErrorMessage:
          "TruckFixr received an HTML page instead of the pilot signup response. Check the live API base URL configuration.",
      });
      if (!response.ok) {
        throw new Error((payload as any).error || "Unable to redeem pilot code");
      }

      if ((payload as any)?.requiresVerification) {
        setMessage("Please verify your email to unlock full pilot access.");
        toast.success("Please verify your email to unlock full pilot access.");
      } else {
        setMessage("Pilot access activated. Redirecting to your profile...");
        toast.success("Pilot access activated.");
        window.location.href = "/profile";
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to redeem pilot code";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSignup =
    Boolean(validatedCode?.valid) &&
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    passwordValidation.isValid &&
    !isSubmitting;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="mb-8 flex items-center">
          <AppLogo variant="full" imageClassName="h-10 w-auto" />
        </a>
        <Card className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Enter your TruckFixr pilot code</p>
          <h1 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.04em] text-[#00263F] sm:text-4xl">
            Pilot access is for selected fleets and existing customers invited by TruckFixr.
          </h1>
          <form onSubmit={submitCode} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pilot-code">Pilot code *</Label>
              <Input
                id="pilot-code"
                value={pilotCode}
                onChange={(event) => setPilotCode(event.target.value)}
                placeholder="TFX-PILOT-XXXXXXX"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pilot-company">Company name</Label>
              <Input
                id="pilot-company"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Brampton Transit Inc."
              />
            </div>
            <Button type="submit" className="rounded-full bg-[#00263F] px-5 font-bold text-white hover:bg-[#0B3C5D]">
              <Ticket className="mr-2 h-4 w-4" />
              Validate Code
            </Button>
          </form>

          {validatedCode?.valid ? (
            <form onSubmit={handleSignup} className="mt-8 space-y-5 border-t border-slate-200 pt-6">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Pilot code validated for {validatedCode.companyName || "your fleet"}. Enter your details to create the company account.
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pilot-full-name">Full name *</Label>
                  <Input id="pilot-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pilot-email">Email *</Label>
                  <Input id="pilot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pilot-password">Password *</Label>
                  <Input
                    id="pilot-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3C5D]"
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showPassword ? "Hide password" : "Show password"}
                  </button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pilot-confirm-password">Confirm password *</Label>
                  <Input
                    id="pilot-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3C5D]"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showConfirmPassword ? "Hide password" : "Show password"}
                  </button>
                </div>
              </div>
              <PasswordChecklist validation={passwordValidation} />
              {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}
              <Button type="submit" className="w-full rounded-full bg-[#E32636] py-6 font-bold text-white" disabled={!canSignup}>
                {isSubmitting ? "Submitting..." : "Create Pilot Account"}
              </Button>
            </form>
          ) : validationRequested ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {message ?? "That pilot code was not recognized."}
            </div>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
