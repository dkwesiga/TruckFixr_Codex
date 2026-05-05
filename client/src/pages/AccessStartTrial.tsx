import { useMemo, useState, type FormEvent } from "react";
import AppLogo from "@/components/AppLogo";
import PasswordChecklist from "@/components/PasswordChecklist";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { splitFullName, validateTruckFixrPassword } from "../../../shared/passwordPolicy";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function AccessStartTrial() {
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    fleetSize: "",
    vehicleTypes: "",
    location: "",
    biggestMaintenanceChallenge: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const nameParts = useMemo(() => splitFullName(form.fullName), [form.fullName]);
  const passwordValidation = useMemo(
    () =>
      validateTruckFixrPassword({
        password: form.password,
        confirmPassword: form.confirmPassword,
        email: form.email,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        companyName: form.companyName,
        phone: form.phone,
      }),
    [form.companyName, form.confirmPassword, form.email, form.password, form.phone, nameParts.firstName, nameParts.lastName]
  );

  const canSubmit =
    form.fullName.trim().length > 0 &&
    form.companyName.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.biggestMaintenanceChallenge.trim().length >= 10 &&
    passwordValidation.isValid &&
    !isSubmitting;

  const setField = (field: keyof typeof form, value: string) => {
    setMessage(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

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
          email: form.email,
          password: form.password,
          name: form.fullName,
          accessMode: "trial",
          companyName: form.companyName,
          companyPhone: form.phone,
          fleetSize: form.fleetSize,
          biggestMaintenanceChallenge: form.biggestMaintenanceChallenge,
          vehicleTypes: form.vehicleTypes,
          location: form.location,
        }),
      });
      const payload = await readApiPayload(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the trial signup response. Check the live API base URL configuration.",
      });

      if (!response.ok) {
        throw new Error((payload as any).error || "Unable to start trial");
      }

      if ((payload as any)?.requiresVerification) {
        setMessage("Please verify your email to activate your trial.");
        toast.success("Please verify your email to activate your trial.");
      } else {
        setMessage("Thank you. Your trial request is active and you can continue into TruckFixr.");
        toast.success("Trial account created.");
        window.location.href = "/profile";
      }
      setForm({
        fullName: "",
        companyName: "",
        email: "",
        password: "",
        confirmPassword: "",
        phone: "",
        fleetSize: "",
        vehicleTypes: "",
        location: "",
        biggestMaintenanceChallenge: "",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "We could not submit your request. Please try again or contact info@truckfixr.com.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="mb-8 flex items-center">
          <AppLogo variant="full" imageClassName="h-10 w-auto" />
        </a>
        <Card className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Start your 30-day TruckFixr trial</p>
          <h1 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.04em] text-[#00263F] sm:text-4xl">
            Try TruckFixr Fleet AI with a small fleet. No credit card required.
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#42474E]">
            TruckFixr helps your team capture inspection issues, driver reports, fault codes, and maintenance decisions in one place.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trial-full-name">Full name *</Label>
                <Input id="trial-full-name" value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-company-name">Company name *</Label>
                <Input id="trial-company-name" value={form.companyName} onChange={(event) => setField("companyName", event.target.value)} required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trial-email">Email *</Label>
                <Input id="trial-email" type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-phone">Phone</Label>
                <Input id="trial-phone" value={form.phone} onChange={(event) => setField("phone", event.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trial-password">Password *</Label>
                <Input
                  id="trial-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setField("password", event.target.value)}
                  required
                />
                <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3C5D]" onClick={() => setShowPassword((current) => !current)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-confirm-password">Confirm password *</Label>
                <Input
                  id="trial-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(event) => setField("confirmPassword", event.target.value)}
                  required
                />
                <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#0B3C5D]" onClick={() => setShowConfirmPassword((current) => !current)}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showConfirmPassword ? "Hide password" : "Show password"}
                </button>
              </div>
            </div>
            <PasswordChecklist validation={passwordValidation} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trial-fleet-size">Fleet size *</Label>
                <Input id="trial-fleet-size" value={form.fleetSize} onChange={(event) => setField("fleetSize", event.target.value)} placeholder="3-5 vehicles" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trial-location">Location</Label>
                <Input id="trial-location" value={form.location} onChange={(event) => setField("location", event.target.value)} placeholder="Ontario, Canada" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-vehicle-types">Vehicle types</Label>
              <Input id="trial-vehicle-types" value={form.vehicleTypes} onChange={(event) => setField("vehicleTypes", event.target.value)} placeholder="Tractors, straight trucks, trailers" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-challenge">Biggest maintenance challenge *</Label>
              <Textarea
                id="trial-challenge"
                value={form.biggestMaintenanceChallenge}
                onChange={(event) => setField("biggestMaintenanceChallenge", event.target.value)}
                minLength={10}
                className="min-h-28"
                required
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Please verify your email to activate your trial.
            </div>
            {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div> : null}
            <Button type="submit" className="w-full rounded-full bg-[#E32636] py-6 font-bold text-white" disabled={!canSubmit}>
              {isSubmitting ? "Submitting..." : "Start Trial"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
