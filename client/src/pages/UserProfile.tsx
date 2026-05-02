import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PasswordChecklist from "@/components/PasswordChecklist";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/hooks/useAuthContext";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";
import {
  formatCad,
  SUBSCRIPTION_PLANS,
  type BillingCadence,
  type SubscriptionTier,
} from "../../../shared/billing";
import { splitFullName, validateTruckFixrPassword } from "../../../shared/passwordPolicy";
import { Eye, EyeOff } from "lucide-react";

export default function UserProfile() {
  const { user } = useAuthContext();
  const [location] = useLocation();
  const utils = trpc.useUtils();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    company: loadCompanyName(),
    role: (user?.role || "driver") as "driver" | "owner_operator" | "manager" | "owner",
    managerEmail: user?.managerEmail || "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"profile" | "fleet">("profile");
  const [pilotCode, setPilotCode] = useState("");
  const [pilotCompanyName, setPilotCompanyName] = useState(loadCompanyName());
  const [billingCadence, setBillingCadence] = useState<BillingCadence>("monthly");
  const [driverInvite, setDriverInvite] = useState({
    name: "",
    email: "",
  });
  const [securityForm, setSecurityForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [showSecurityPasswords, setShowSecurityPasswords] = useState(false);
  const [showSecurityCard, setShowSecurityCard] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [fleetQuote, setFleetQuote] = useState({
    companyName: formData.company,
    contactName: formData.name,
    email: formData.email,
    phone: "",
    vehicleCount: 25,
    driverCount: 10,
    mainNeeds: "",
    notes: "",
  });

  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const createFleetMutation = trpc.fleet.create.useMutation();
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const createCheckoutMutation = trpc.subscriptions.createCheckoutSession.useMutation();
  const createPortalMutation = trpc.subscriptions.createPortalSession.useMutation();
  const redeemPilotAccessMutation = trpc.subscriptions.redeemPilotAccess.useMutation();
  const requestFleetQuoteMutation = trpc.subscriptions.requestFleetQuote.useMutation();
  const downgradeQuery = trpc.subscriptions.validateDowngrade.useQuery(
    { targetTier: "free" },
    { enabled: Boolean(user) }
  );
  const managerReportsQuery = trpc.inspections.getManagerReports.useQuery(
    { limit: 8 },
    { enabled: user?.role === "manager" || user?.role === "owner" }
  );
  const inviteDriverMutation = trpc.auth.createManagedDriverInvite.useMutation();
  const profileNameParts = splitFullName(formData.name || user?.name || "");
  const passwordValidation = validateTruckFixrPassword({
    password: securityForm.newPassword,
    confirmPassword: securityForm.confirmNewPassword,
    email: user?.email,
    firstName: profileNameParts.firstName,
    lastName: profileNameParts.lastName,
    companyName: formData.company,
  });

  useEffect(() => {
    if (!user) return;

    setFormData((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: user.email || "",
      role: user.role,
      managerEmail: current.managerEmail || user.managerEmail || "",
      company: current.company || loadCompanyName(),
    }));
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("security") === "1") {
      setShowSecurityCard(true);
    }
  }, [location]);

  useEffect(() => {
    setFleetQuote((current) => ({
      ...current,
      companyName: current.companyName || formData.company,
      contactName: current.contactName || formData.name,
      email: current.email || formData.email,
    }));
  }, [formData.company, formData.email, formData.name]);

  useEffect(() => {
    if (formData.company.trim()) {
      saveCompanyName(formData.company);
    }
  }, [formData.company]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") === "success") {
      toast.success("Subscription activated successfully.");
    }
    if (params.get("subscription") === "cancelled") {
      toast.error("Subscription checkout was cancelled.");
    }
  }, [location]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate form
      if (!formData.name.trim()) {
        toast.error("Please enter your name");
        setIsLoading(false);
        return;
      }

      if ((formData.role === "manager" || formData.role === "owner") && !formData.company.trim()) {
        toast.error("Please enter your company name");
        setIsLoading(false);
        return;
      }

      if (formData.company.trim()) {
        saveCompanyName(formData.company);
      }

      if (formData.role === "driver" && !formData.managerEmail.trim()) {
        toast.error("Please enter your manager's email");
        setIsLoading(false);
        return;
      }

      const updatedUser = await updateProfileMutation.mutateAsync({
        name: formData.name.trim(),
        role: formData.role,
        managerEmail:
          formData.role === "driver" ? formData.managerEmail.trim().toLowerCase() : undefined,
      });

      await utils.auth.me.invalidate();

      if (updatedUser.managerConnection?.status === "linked") {
        toast.success(updatedUser.managerConnection.message);
      } else if (updatedUser.managerConnection?.status === "invited") {
        toast.success(updatedUser.managerConnection.message);
      } else if (
        updatedUser.managerConnection?.status === "invite_failed" ||
        updatedUser.managerConnection?.status === "invite_skipped"
      ) {
        toast.error(updatedUser.managerConnection.message);
      }

      if (updatedUser.role === "driver") {
        toast.success("Profile updated! Redirecting to your dashboard...");
        setTimeout(() => {
          window.location.href = "/driver";
        }, 500);
        return;
      }

      setStep("fleet");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFleetCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create initial fleet
      const fleet = await createFleetMutation.mutateAsync({
        name: `${formData.company} Fleet`,
      });

      if (formData.company.trim()) {
        saveCompanyName(formData.company);
      }

      toast.success("Fleet created successfully!");

      // Track event
      if ((window as any).posthog) {
        (window as any).posthog.capture("fleet_created", {
          fleet_name: fleet.name,
          company: formData.company,
        });
      }

      await utils.auth.me.invalidate();
      // Redirect to manager dashboard
      setTimeout(() => {
        window.location.href = "/manager";
      }, 1000);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create fleet");
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    const redirectPath = formData.role === "driver" ? "/driver" : "/manager";
    window.location.href = redirectPath;
  };

  const handleUpgrade = async (tier: SubscriptionTier) => {
    try {
      if (tier === "fleet") {
        if (fleetQuote.companyName.trim()) {
          saveCompanyName(fleetQuote.companyName);
        }
        await requestFleetQuoteMutation.mutateAsync({
          companyName: fleetQuote.companyName || formData.company || "Fleet request",
          contactName: fleetQuote.contactName || formData.name || "TruckFixr contact",
          email: fleetQuote.email || formData.email,
          phone: fleetQuote.phone || undefined,
          vehicleCount: fleetQuote.vehicleCount,
          driverCount: fleetQuote.driverCount,
          mainNeeds:
            fleetQuote.mainNeeds ||
            "Looking for Fleet plan support, advanced reporting, and operational visibility.",
          notes: fleetQuote.notes || undefined,
        });
        toast.success("Fleet quote request sent. Our team will follow up shortly.");
        return;
      }

      const result = await createCheckoutMutation.mutateAsync({
        tier: "pro",
        billingCadence,
        successPath: "/profile?subscription=success",
        cancelPath: "/profile?subscription=cancelled",
      });
      if (!result.checkoutUrl) {
        throw new Error("Checkout session could not be created.");
      }
      window.location.href = result.checkoutUrl;
    } catch (error: any) {
      toast.error(error?.message || "Unable to start checkout");
    }
  };

  const handleManageBilling = async () => {
    try {
      const result = await createPortalMutation.mutateAsync({ returnPath: "/profile" });
      if (!result.portalUrl) {
        throw new Error("Billing portal could not be created.");
      }
      window.location.href = result.portalUrl;
    } catch (error: any) {
      toast.error(error?.message || "Unable to open billing portal");
    }
  };

  const handleRedeemPilotAccess = async () => {
    try {
      await redeemPilotAccessMutation.mutateAsync({
        code: pilotCode,
        companyName: pilotCompanyName,
      });
      setPilotCode("");
      setPilotCompanyName("");
      await subscriptionQuery.refetch();
      toast.success("Pilot Access activated successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Pilot Access could not be activated");
    }
  };

  const handleInviteDriver = async () => {
    try {
      if (!driverInvite.name.trim()) {
        toast.error("Enter the driver's name");
        return;
      }

      if (!driverInvite.email.trim()) {
        toast.error("Enter the driver's email");
        return;
      }

      const result = await inviteDriverMutation.mutateAsync({
        name: driverInvite.name.trim(),
        email: driverInvite.email.trim(),
      });

      setDriverInvite({ name: "", email: "" });
      toast.success(result.invitation.message, {
        description: result.invitation.pilotCode
          ? `Pilot Access code ${result.invitation.pilotCode} was included in the invite link. The invite was emailed to the driver for confirmation.`
          : "The invite was emailed to the driver for confirmation.",
      });
    } catch (error: any) {
      toast.error(error?.message || "Unable to invite driver");
    }
  };

  const handleChangePassword = async () => {
    if (!securityForm.currentPassword) {
      toast.error("Enter your current password.");
      return;
    }
    if (!passwordValidation.isValid) {
      toast.error(passwordValidation.errors[0] ?? "Password does not meet TruckFixr security requirements.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch(getApiUrl("/api/email/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(securityForm),
      });
      const payload = await readApiPayload(response).catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as any).error || "Unable to update password");
      }
      setSecurityForm({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
      toast.success("Your password has been updated successfully.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to update password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const subscription = subscriptionQuery.data;
  const visiblePlans = Object.values(SUBSCRIPTION_PLANS).filter(
    (plan) => plan.publicSelectable || plan.tier === subscription?.selectedPlan.tier
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 py-8 lg:flex-row lg:items-start">
        <Card className="w-full lg:max-w-md">
          {step === "profile" ? (
            <>
              <CardHeader>
                <CardTitle>Profile & Settings</CardTitle>
                <CardDescription>
                  Manage your account details, role, and startup setup for TruckFixr.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Your name"
                  required
                  className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    disabled
                    className="bg-slate-100"
                  />
                  <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Company Name
                  </label>
                <Input
                  type="text"
                  value={formData.company}
                  onChange={(e) =>
                    setFormData({ ...formData, company: e.target.value })
                  }
                  placeholder={
                    formData.role === "driver"
                      ? "Your company name (optional)"
                      : "Your company name"
                  }
                  required={formData.role === "manager" || formData.role === "owner"}
                  className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as any })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    <option value="driver">Driver</option>
                    <option value="owner_operator">Owner Operator</option>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>

                {formData.role === "driver" ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Manager Email
                    </label>
                    <Input
                      type="email"
                      value={formData.managerEmail}
                      onChange={(e) =>
                        setFormData({ ...formData, managerEmail: e.target.value })
                      }
                      placeholder="manager@fleetcompany.com"
                      required
                      className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      We’ll link your profile to this manager if they already have a TruckFixr account. Otherwise, we’ll save the address and send them an invite when email delivery is available.
                    </p>
                  </div>
                ) : null}

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={isLoading}
                  >
                    {isLoading
                      ? "Loading..."
                      : formData.role === "driver"
                        ? "Save & Continue"
                        : "Continue"}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Create Your First Fleet</CardTitle>
                <CardDescription>
                  Set up your fleet to start managing trucks and inspections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFleetCreate} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700">
                    <strong>Fleet Name:</strong> {formData.company} Fleet
                  </p>
                  <p className="text-sm text-slate-600 mt-2">
                    You can manage multiple fleets and add more trucks later.
                  </p>
                </div>

                  <div className="space-y-2">
                    <Button
                      type="submit"
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      disabled={isLoading || createFleetMutation.isPending}
                    >
                      {isLoading || createFleetMutation.isPending
                        ? "Creating Fleet..."
                        : "Create Fleet"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleSkip}
                      disabled={isLoading || createFleetMutation.isPending}
                    >
                      Skip for Now
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <div className="flex w-full flex-col gap-6">
          <Card className="w-full">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>Hidden until you choose to change your password.</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSecurityCard((current) => !current)}
                >
                  {showSecurityCard ? "Hide password form" : "Change password"}
                </Button>
              </div>
            </CardHeader>
            {showSecurityCard ? (
              <CardContent className="space-y-4">
                {[
                  ["currentPassword", "Current password"],
                  ["newPassword", "New password"],
                  ["confirmNewPassword", "Confirm new password"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
                    <div className="flex gap-2">
                      <Input
                        type={showSecurityPasswords ? "text" : "password"}
                        value={securityForm[key as keyof typeof securityForm]}
                        onChange={(event) =>
                          setSecurityForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        placeholder={label}
                        className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={showSecurityPasswords ? "Hide password" : "Show password"}
                        onClick={() => setShowSecurityPasswords((current) => !current)}
                      >
                        {showSecurityPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
                <PasswordChecklist validation={passwordValidation} />
                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={
                    isChangingPassword ||
                    !securityForm.currentPassword ||
                    !passwordValidation.isValid
                  }
                  onClick={handleChangePassword}
                >
                  {isChangingPassword ? "Updating..." : "Update password"}
                </Button>
              </CardContent>
            ) : (
              <CardContent className="pt-0 text-sm text-slate-600">
                Use the button above when you want to update your password.
              </CardContent>
            )}
          </Card>

          <Card className="w-full">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Subscription Management</CardTitle>
                  <CardDescription>
                    View your current plan, billing state, and feature limits.
                  </CardDescription>
                </div>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                  {subscription?.selectedPlan.label ?? "Free"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current tier</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {subscription?.selectedPlan.label ?? "Free"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Billing status: {subscription?.billingStatus ?? "active"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Billing cadence</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {subscription?.billingCadence === "annual" ? "Annual" : "Monthly"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Next renewal: {subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "Not scheduled"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Billable usage</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    Diagnostics: {subscription?.effectivePlan.limits.diagnosticsPerMonth ?? "Unlimited"} / month
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Active vehicles: {subscription?.entitlements?.usage.activeVehicleCount ?? 0}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Billable vehicles: {subscription?.entitlements?.billableVehicleCount ?? 0}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Linked drivers: {subscription?.entitlements?.usage.managedDriverCount ?? 0}
                  </p>
                </div>
              </div>

              {subscription?.trialEnd ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Trial status: {subscription.billingStatus === "trialing" ? "Active trial" : "Not trialing"}.
                  {` `}
                  Trial end: {new Date(subscription.trialEnd).toLocaleDateString()}.
                </div>
              ) : null}

              {subscription?.restrictedBecauseOfBilling ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Your billing needs attention. Update payment method to restore paid-plan access.
                </div>
              ) : null}

              {subscription?.pilotAccess?.status === "expired" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Pilot Access has expired. Your plan is now Free. Upgrade to Pro or Fleet to keep premium workflows active.
                </div>
              ) : null}

              {subscription?.pilotAccess ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-blue-700">
                        {subscription.pilotAccess.status === "active" ? "Pilot Access Active" : "Pilot Access Status"}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {subscription.pilotAccess.fleetName}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Expiry date: {new Date(subscription.pilotAccess.expiresAt).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Vehicles used: {subscription.pilotAccess.vehiclesUsed} / {subscription.pilotAccess.maxVehicles}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Users enabled: {subscription.pilotAccess.usersUsed} / {subscription.pilotAccess.maxUsers}
                      </p>
                    </div>
                    <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleUpgrade("pro")}>
                      Upgrade to Pro
                    </Button>
                  </div>
                </div>
              ) : null}

              {subscription?.selectedPlan.tier === "free" ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Have a Pilot Access code?</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Redeem a valid code to activate a temporary Pilot Access trial for your fleet.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Pilot Access code
                      </label>
                      <Input
                        value={pilotCode}
                        onChange={(e) => setPilotCode(e.target.value.toUpperCase())}
                        placeholder="TRUCKFIXR-PILOT"
                        className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Fleet / company name
                      </label>
                      <Input
                        value={pilotCompanyName}
                        onChange={(e) => {
                          setPilotCompanyName(e.target.value);
                          if (e.target.value.trim()) {
                            saveCompanyName(e.target.value);
                          }
                        }}
                        placeholder={formData.company || "Acme Logistics"}
                        className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      className="bg-slate-900 hover:bg-slate-800"
                      onClick={handleRedeemPilotAccess}
                      disabled={redeemPilotAccessMutation.isPending}
                    >
                      {redeemPilotAccessMutation.isPending ? "Activating..." : "Redeem Pilot Access"}
                    </Button>
                    <p className="text-sm text-slate-500">
                      Pilot Access is available only for new or Free accounts.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                  {(["monthly", "annual"] as BillingCadence[]).map((cadence) => (
                    <button
                      key={cadence}
                      type="button"
                      onClick={() => setBillingCadence(cadence)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        billingCadence === cadence
                          ? "bg-slate-950 text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {cadence === "monthly" ? "Monthly" : "Annual"}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-slate-500">
                  Pro billing is based on active vehicles only. Archived vehicles do not count.
                </p>
              </div>

              {downgradeQuery.data && !downgradeQuery.data.canDowngrade ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Free downgrade requirements</p>
                  <ul className="mt-2 space-y-1">
                    {downgradeQuery.data.requiredActions.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                {visiblePlans.map((plan) => {
                  const isCurrent = subscription?.selectedPlan.tier === plan.tier;
                  const priceLabel =
                    plan.tier === "free"
                      ? "CAD $0"
                      : plan.tier === "pro"
                        ? billingCadence === "annual"
                          ? `${formatCad(plan.annualPriceCad ?? 0)} / active vehicle / year`
                          : `${formatCad(plan.monthlyPriceCad ?? 0)} / active vehicle / month`
                        : plan.publicPriceAnchor;
                  return (
                    <div key={plan.tier} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-sm font-semibold text-slate-900">{plan.label}</p>
                      <p className="mt-1 text-xs text-slate-600">{plan.description}</p>
                      <p className="mt-3 text-lg font-semibold text-slate-950">
                        {priceLabel}
                      </p>
                      <ul className="mt-3 space-y-1 text-xs text-slate-600">
                        <li>Diagnostics: {plan.limits.diagnosticsPerMonth ?? "Unlimited"}</li>
                        <li>Active vehicles: {plan.limits.activeVehicleCount ?? "Unlimited"}</li>
                        <li>Driver accounts: {plan.limits.driverCount ?? "Included"}</li>
                        <li>{plan.features.fleetReporting ? "Fleet reporting enabled" : "Fleet reporting locked"}</li>
                      </ul>
                      <div className="mt-4">
                        {isCurrent ? (
                          <Button variant="outline" className="w-full" disabled>
                            Current plan
                          </Button>
                        ) : plan.tier === "free" ? (
                          <Button variant="outline" className="w-full" onClick={handleManageBilling}>
                            Downgrade / Cancel
                          </Button>
                        ) : (
                          <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => handleUpgrade(plan.tier)}>
                            {plan.tier === "fleet" ? "Request Fleet plan" : `Upgrade to ${plan.label}`}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleManageBilling} disabled={!subscription?.stripeConfigured}>
                  Manage billing
                </Button>
                <p className="text-sm text-slate-500">
                  Restricted features explain why access is blocked and route back to checkout when needed.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Need Fleet instead?</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Fleet is best for larger or more operationally complex fleets. Send a quote request and our team will follow up.
                    </p>
                  </div>
                  <Button
                    className="bg-slate-900 hover:bg-slate-800"
                    onClick={() => handleUpgrade("fleet")}
                    disabled={requestFleetQuoteMutation.isPending}
                  >
                    {requestFleetQuoteMutation.isPending ? "Sending..." : "Request Fleet quote"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {(user.role === "manager" || user.role === "owner") ? (
            <Card id="inspection-reports" className="w-full">
              <CardHeader>
                <CardTitle>Invite Drivers</CardTitle>
                <CardDescription>
                  Send drivers an account-creation link that keeps them linked to this manager.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Driver name
                    </label>
                    <Input
                      value={driverInvite.name}
                      onChange={(e) => setDriverInvite((current) => ({ ...current, name: e.target.value }))}
                      placeholder="Dixon K"
                      className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Driver email
                    </label>
                    <Input
                      type="email"
                      value={driverInvite.email}
                      onChange={(e) => setDriverInvite((current) => ({ ...current, email: e.target.value }))}
                      placeholder="driver@fleet.com"
                      className="border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p>
                    TruckFixr will email the driver a signup link so they can confirm the invite and join your profile.
                  </p>
                  {subscription?.pilotAccess?.status === "active" ? (
                    <p className="mt-2">
                      The invite will also carry your Pilot Access code <span className="font-semibold text-slate-900">{subscription.pilotAccess.code}</span> for {subscription.pilotAccess.fleetName}.
                    </p>
                  ) : null}
                </div>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleInviteDriver}
                  disabled={inviteDriverMutation.isPending}
                >
                  {inviteDriverMutation.isPending ? "Sending invite..." : "Invite driver"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {(user.role === "manager" || user.role === "owner") ? (
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Inspection Reports</CardTitle>
                <CardDescription>
                  Reports submitted by drivers assigned to your vehicles land here and in your email inbox.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(managerReportsQuery.data ?? []).length > 0 ? (
                  managerReportsQuery.data?.map((report: any) => (
                    <div key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{report.title}</p>
                        <span className="text-xs text-slate-500">
                          {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{report.message}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No inspection reports received yet.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
