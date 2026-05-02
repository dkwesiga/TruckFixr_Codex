import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/hooks/useAuthContext";
import { toast } from "sonner";
import { Check, Info, LogOut, Menu } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";
import {
  calculateProPricing,
  formatCad,
  getPublicPlans,
  PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES,
  type BillingCadence,
} from "../../../shared/billing";

const orderedPlans = getPublicPlans();

export default function Pricing() {
  const { user, logout } = useAuthContext();
  const [, navigate] = useLocation();
  const [billingCadence, setBillingCadence] = useState<BillingCadence>("monthly");
  const [activeVehicles, setActiveVehicles] = useState(5);
  const [promoCode, setPromoCode] = useState("");
  const [promoCompanyName, setPromoCompanyName] = useState(loadCompanyName());
  const [fleetQuote, setFleetQuote] = useState({
    companyName: loadCompanyName(),
    contactName: "",
    email: "",
    phone: "",
    vehicleCount: 25,
    driverCount: 10,
    mainNeeds: "",
    notes: "",
  });
  const quoteMutation = trpc.subscriptions.requestFleetQuote.useMutation();
  const redeemPilotAccessMutation = trpc.subscriptions.redeemPilotAccess.useMutation();

  const calculator = useMemo(
    () => calculateProPricing({ activeVehicleCount: activeVehicles, cadence: billingCadence }),
    [activeVehicles, billingCadence]
  );

  const handleFleetQuote = async () => {
    try {
      if (fleetQuote.companyName.trim()) {
        saveCompanyName(fleetQuote.companyName);
      }
      await quoteMutation.mutateAsync(fleetQuote);
      toast.success("Fleet quote request sent. Our team will follow up shortly.");
      setFleetQuote((current) => ({ ...current, mainNeeds: "", notes: "" }));
    } catch (error: any) {
      toast.error(error?.message || "Unable to submit Fleet quote request");
    }
  };

  const handlePromoCode = async () => {
    const normalizedCode = promoCode.trim();
    if (!normalizedCode) {
      toast.error("Enter a promo code first.");
      return;
    }

    if (!user) {
      const params = new URLSearchParams();
      params.set("pilotCode", normalizedCode);
      if (promoCompanyName.trim()) {
        params.set("companyName", promoCompanyName.trim());
      }
      window.location.href = `/signup?${params.toString()}`;
      return;
    }

    try {
      await redeemPilotAccessMutation.mutateAsync({
        code: normalizedCode,
        companyName: promoCompanyName.trim() || undefined,
      });
      toast.success("Promo code applied. Your subscription was updated.");
      setPromoCode("");
      setPromoCompanyName("");
    } catch (error: any) {
      toast.error(error?.message || "Unable to apply promo code");
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)]">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <a href="/" className="inline-flex shrink-0 items-center">
              <AppLogo variant="icon" imageClassName="h-full w-full" />
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-full border-slate-200 bg-white px-3">
                  <Menu className="h-4 w-4" />
                  Menu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl border-slate-200 p-2">
                {user ? (
                  <>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate(user.role === "driver" ? "/driver" : "/manager")}>
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/profile")}>
                      Profile & Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/")}>
                      <Info className="mr-2 h-4 w-4" />
                      About TruckFixr
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-xl text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/")}>
                      Home
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/auth/email")}>
                      Sign In
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/signup")}>
                      Sign Up
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/")}>
                      <Info className="mr-2 h-4 w-4" />
                      About TruckFixr
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
              Active-vehicle pricing
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
              Pricing built for small fleets that need diagnostics, inspections, and compliance every day
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              TruckFixr charges by active vehicles only. Owner and driver access are included, and archived vehicles do not count toward billing.
            </p>
          </div>
          <div className="mt-8 inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            {(["monthly", "annual"] as BillingCadence[]).map((cadence) => (
              <button
                key={cadence}
                type="button"
                onClick={() => setBillingCadence(cadence)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  billingCadence === cadence
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {cadence === "monthly" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
          {billingCadence === "annual" ? (
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Annual billing saves 15% on Pro.
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-3">
          {orderedPlans.map((plan) => {
            const isPro = plan.tier === "pro";
            const priceLabel =
              plan.tier === "free"
                ? "CAD $0"
                : plan.tier === "pro"
                  ? billingCadence === "annual"
                    ? `${formatCad(plan.annualPriceCad ?? 0)} / active vehicle / year`
                    : `${formatCad(plan.monthlyPriceCad ?? 0)} / active vehicle / month`
                  : plan.publicPriceAnchor;

            return (
              <Card
                key={plan.tier}
                className={`border-slate-200 shadow-sm ${isPro ? "border-blue-600 ring-2 ring-blue-100" : ""}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{plan.label}</CardTitle>
                    {isPro ? (
                      <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                        Best for 5-25 vehicles
                      </span>
                    ) : null}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <p className="text-3xl font-bold text-slate-950">{priceLabel}</p>
                    {plan.tier === "pro" ? (
                      <p className="mt-2 text-sm text-slate-600">
                        5 active vehicle minimum. Includes 14-day free trial and owner + driver access.
                      </p>
                    ) : null}
                    {plan.tier === "fleet" ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Sales-assisted onboarding for growing or more operationally complex fleets.
                      </p>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <Button
                    className="w-full"
                    variant={isPro ? "default" : "outline"}
                    onClick={() => {
                      window.location.href = plan.tier === "fleet" ? "#fleet-quote" : "/signup";
                    }}
                  >
                    {plan.tier === "free"
                      ? "Start Free"
                      : plan.tier === "pro"
                        ? "Start Pro trial"
                        : "Request Fleet quote"}
                  </Button>

                  <div className="space-y-3 text-sm text-slate-700">
                    <div className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>
                        {plan.tier === "free"
                          ? "Up to 2 active vehicles"
                          : plan.tier === "pro"
                            ? "Billing based on active vehicles only"
                            : "Advanced reporting and fleet-level visibility"}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>
                        {plan.tier === "free"
                          ? "Up to 2 driver accounts"
                          : "Owner + driver access included"}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>Diagnostics, inspections/compliance, and maintenance included</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>Archived vehicles do not count toward billing</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Pro pricing calculator</CardTitle>
              <CardDescription>
                Estimate your Pro bill using active vehicles only. Pro has a {PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES}-vehicle minimum.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="active-vehicles">Active vehicles</Label>
                <Input
                  id="active-vehicles"
                  type="number"
                  min={1}
                  value={activeVehicles}
                  onChange={(event) => setActiveVehicles(Number(event.target.value || PRO_MINIMUM_BILLABLE_ACTIVE_VEHICLES))}
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Per active vehicle</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {formatCad(calculator.perVehicleMonthlyCad)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">Monthly base rate</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Billable vehicles</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {calculator.billableVehicleCount}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">Minimum billing starts at 5</p>
                </div>
              </div>
              {billingCadence === "monthly" ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-blue-700">Estimated monthly total</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">
                    {formatCad(calculator.monthlyTotalCad)}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-700">Estimated annual billing</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">
                    {formatCad(calculator.annualTotalCad)}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Effective monthly equivalent: {formatCad(calculator.monthlyEquivalentCad)}. Savings: {formatCad(calculator.annualSavingsCad)}.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>What changes with paid plans</CardTitle>
              <CardDescription>
                The MVP keeps billing simple and operational.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>Free remains usable for up to 2 active vehicles and 2 driver accounts.</p>
              <p>Pro is the self-serve plan for small fleets and includes a 14-day free trial.</p>
              <p>Fleet is the path for larger or more complex operations that need a guided rollout.</p>
              <p>Drivers are included. TruckFixr does not bill per seat.</p>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Have a promo code?</CardTitle>
              <CardDescription>
                Apply a promo or Pilot Access code here to update your subscription path.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <Label htmlFor="promo-code">Promo code</Label>
                <Input
                  id="promo-code"
                  className="mt-2"
                  value={promoCode}
                  onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                  placeholder="Enter your code"
                />
              </div>
              <div>
                <Label htmlFor="promo-company">Fleet or company name</Label>
                <Input
                  id="promo-company"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={promoCompanyName}
                  onChange={(event) => {
                    setPromoCompanyName(event.target.value);
                    if (event.target.value.trim()) {
                      saveCompanyName(event.target.value);
                    }
                  }}
                  placeholder="Optional"
                />
              </div>
              <Button
                className="bg-slate-950 hover:bg-slate-800"
                onClick={handlePromoCode}
                disabled={redeemPilotAccessMutation.isPending}
              >
                {user
                  ? redeemPilotAccessMutation.isPending
                    ? "Applying..."
                    : "Apply code"
                  : "Continue with code"}
              </Button>
              <p className="text-sm text-slate-500 md:col-span-3">
                {user
                  ? "If the code is valid, TruckFixr will update your plan immediately."
                  : "We’ll carry the code into signup so you can continue with the right subscription flow."}
              </p>
            </CardContent>
          </Card>
        </section>

        <section id="fleet-quote">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Request a Fleet quote</CardTitle>
              <CardDescription>
                Fleet starts at CAD $299/month and is handled with a sales-assisted setup.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="fleet-company">Company name</Label>
                <Input
                  id="fleet-company"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.companyName}
                  onChange={(event) => {
                    setFleetQuote((current) => ({ ...current, companyName: event.target.value }));
                    if (event.target.value.trim()) {
                      saveCompanyName(event.target.value);
                    }
                  }}
                />
              </div>
              <div>
                <Label htmlFor="fleet-contact">Contact name</Label>
                <Input
                  id="fleet-contact"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.contactName}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, contactName: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="fleet-email">Email</Label>
                <Input
                  id="fleet-email"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.email}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, email: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="fleet-phone">Phone</Label>
                <Input
                  id="fleet-phone"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.phone}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, phone: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="fleet-vehicles">Number of vehicles</Label>
                <Input
                  id="fleet-vehicles"
                  type="number"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.vehicleCount}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, vehicleCount: Number(event.target.value || 0) }))}
                />
              </div>
              <div>
                <Label htmlFor="fleet-drivers">Number of drivers</Label>
                <Input
                  id="fleet-drivers"
                  type="number"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.driverCount}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, driverCount: Number(event.target.value || 0) }))}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="fleet-needs">Main needs / challenges</Label>
                <Input
                  id="fleet-needs"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.mainNeeds}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, mainNeeds: event.target.value }))}
                  placeholder="Example: daily inspections, AI diagnostics, and better fleet visibility"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="fleet-notes">Optional notes</Label>
                <Input
                  id="fleet-notes"
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                  value={fleetQuote.notes}
                  onChange={(event) => setFleetQuote((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <Button
                  className="bg-slate-950 hover:bg-slate-800"
                  onClick={handleFleetQuote}
                  disabled={quoteMutation.isPending}
                >
                  {quoteMutation.isPending ? "Sending..." : "Request Fleet quote"}
                </Button>
                <p className="text-sm text-slate-500">
                  We’ll save your request, notify the TruckFixr team, and confirm by email.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
