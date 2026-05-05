import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";
import { Check, ChevronRight, Info, LogOut, Menu } from "lucide-react";
import { toast } from "sonner";
import {
  formatTruckFixrCad,
  getPublicTruckFixrPlans,
  getTruckFixrPlanPrice,
  TRUCKFIXR_PLANS,
  type BillingInterval,
  type PlanKey,
} from "../../../shared/truckfixrPricing";

type PricingAction = "signup" | "pilot" | "checkout" | "quote";

const featureRows = [
  ["Powered vehicles included", "1", "Up to 5", "Up to 10", "Up to 20", "Custom"],
  ["Active trailers included", "1", "Up to 5", "Up to 10", "Up to 20", "Custom"],
  ["Extra active trailers", "$5/month each", "$5/month each", "$5/month each", "$5/month each", "$5/month each"],
  ["Unlimited users", "Yes", "Yes", "Yes", "Yes", "Yes"],
  ["Unlimited inspections", "Yes", "Yes", "Yes", "Yes", "Yes"],
  ["AI diagnostic sessions / month", "20", "75", "150", "300", "Custom"],
  ["VIN decoding", "Yes", "Yes", "Yes", "Yes", "Yes"],
  ["Trailer linking", "Yes", "Yes", "Yes", "Yes", "Yes"],
  ["Driver assignments", "Basic", "Yes", "Yes", "Yes", "Yes"],
  ["Fleet dashboard", "Basic", "Basic", "Full", "Advanced", "Custom"],
  ["CSV/exportable data", "No", "No", "Yes", "Yes", "Yes"],
  ["Priority support", "No", "No", "No", "Yes", "Yes"],
] as const;

const faqItems = [
  {
    question: "Are prices in Canadian dollars?",
    answer: "Yes. All prices are in CAD. HST and taxes are calculated separately at checkout.",
  },
  {
    question: "Do I pay per driver?",
    answer: "No. TruckFixr includes unlimited users. Pricing is based on active powered vehicles and trailer allowance.",
  },
  {
    question: "Does a trailer count as a vehicle?",
    answer: "No. Plans are based on active powered vehicles. Each powered vehicle includes one active trailer allowance.",
  },
  {
    question: "What if I have more trailers than trucks?",
    answer: "Extra active trailers are $5 CAD/month each. You can add them beyond the included allowance.",
  },
  {
    question: "Can trailers be inspected separately?",
    answer: "Yes. Active trailers can have their own inspection records, defect reports, maintenance history, and diagnostic sessions.",
  },
  {
    question: "Do trailer diagnostics count against my AI limit?",
    answer: "Yes. AI diagnostic sessions are shared across active powered vehicles and active trailers in your account.",
  },
  {
    question: "Do you offer annual billing?",
    answer: "Yes. Annual billing gives you 2 months free.",
  },
];

export default function Pricing() {
  const { user, logout } = useAuthContext();
  const [, navigate] = useLocation();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
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

  const plans = useMemo(() => getPublicTruckFixrPlans(), []);
  const comparisonPlans = useMemo(() => plans.filter((plan) => plan.planKey !== "free_trial"), [plans]);
  const quoteMutation = trpc.subscriptions.requestFleetQuote.useMutation();
  const checkoutMutation = trpc.subscriptions.createCheckoutSession.useMutation();
  const pilotMutation = trpc.subscriptions.createPilotCheckoutSession.useMutation();

  const handleCheckout = async (planKey: PlanKey) => {
    try {
      const plan = TRUCKFIXR_PLANS[planKey];
      if (planKey === "free_trial") {
        navigate("/signup");
        return;
      }

      if (planKey === "custom_fleet") {
        window.location.href = "#fleet-quote";
        return;
      }

      if (planKey === "fleet_growth") {
        const result = await pilotMutation.mutateAsync({
          successPath: "/profile?subscription=success",
          cancelPath: "/pricing?subscription=cancelled",
        });
        if (!result.checkoutUrl) {
          throw new Error("Fleet Pilot checkout could not be started.");
        }
        window.location.href = result.checkoutUrl;
        return;
      }

      const result = await checkoutMutation.mutateAsync({
        planKey,
        billingInterval: billingInterval === "annual" ? "annual" : "monthly",
        extraTrailerQuantity: 0,
        successPath: "/profile?subscription=success",
        cancelPath: "/pricing?subscription=cancelled",
      });

      if (!result.checkoutUrl) {
        throw new Error(`${plan.name} checkout could not be started.`);
      }

      window.location.href = result.checkoutUrl;
    } catch (error: any) {
      toast.error(error?.message || "Unable to start checkout");
    }
  };

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(17,24,39,0.08),_transparent_40%),linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <AppLogo variant="icon" imageClassName="h-full w-full" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">TruckFixr Fleet AI</p>
              <p className="text-sm text-slate-600">Powered vehicles + active trailers pricing</p>
            </div>
          </a>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="hidden rounded-full text-slate-700 md:inline-flex"
              onClick={() => navigate("/pricing#pricing")}
            >
              Pricing
            </Button>
            <Button
              variant="ghost"
              className="hidden rounded-full text-slate-700 md:inline-flex"
              onClick={() => navigate("/pricing#faq")}
            >
              FAQ
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-full border-slate-200 bg-white px-4">
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
                    <DropdownMenuItem className="cursor-pointer rounded-xl text-destructive focus:text-destructive" onClick={logout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/auth/email")}>
                      Sign In
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/signup")}>
                      Sign Up
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/")}>
                      Home
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-14 pt-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:pt-20">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-red-700 shadow-sm">
              TruckFixr Fleet AI
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Pricing built for powered vehicles, active trailers, and the AI that keeps small fleets moving
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                TruckFixr Fleet AI is built for small fleets that cannot afford avoidable downtime. Plans are based on active powered vehicles.
                Each powered vehicle includes one active trailer allowance, and extra active trailers are $5 CAD/month each.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full bg-slate-950 px-5" onClick={() => navigate("/signup")}>
                Start Free Trial
              </Button>
              <Button variant="outline" className="rounded-full border-slate-200 px-5" onClick={() => navigate("/auth/email")}>
                Sign In
              </Button>
              <Button variant="ghost" className="rounded-full text-slate-700" onClick={() => (window.location.href = "#pricing")}>
                View plans
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                "Unlimited users",
                "Unlimited inspections for active powered vehicles and active trailers",
                "Monthly AI diagnostic sessions shared across the account",
              ].map((value) => (
                <div key={value} className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 shadow-sm">
                  <Check className="mb-3 h-4 w-4 text-emerald-600" />
                  {value}
                </div>
              ))}
            </div>
          </div>

          <Card className="rounded-3xl border-slate-200 shadow-xl shadow-slate-200/60">
            <CardHeader className="space-y-3">
              <CardTitle className="text-2xl">Monthly or annual</CardTitle>
              <CardDescription>
                All prices are in CAD. HST/taxes are calculated separately at checkout. Annual billing gives 2 months free.
              </CardDescription>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                {(["monthly", "annual"] as BillingInterval[]).map((interval) => (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => setBillingInterval(interval)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      billingInterval === interval ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {interval === "monthly" ? "Monthly" : "Annual"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {plans.map((plan) => {
                const price = getTruckFixrPlanPrice(plan.planKey, billingInterval === "annual" ? "annual" : "monthly");
                const isRecommended = plan.planKey === "fleet_growth";
                const periodLabel =
                  plan.billingInterval === "trial"
                    ? "/ trial"
                    : plan.planKey === "custom_fleet"
                      ? "/ custom"
                      : billingInterval === "annual" && plan.priceCadAnnual !== null
                        ? "/ year"
                        : "/ month";
                return (
                  <div
                    key={plan.planKey}
                    className={`rounded-2xl border p-4 ${isRecommended ? "border-red-200 bg-red-50/70" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{plan.name}</p>
                        <p className="text-sm text-slate-600">{plan.publicNote}</p>
                      </div>
                      {isRecommended ? (
                        <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                          Most Popular
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-3xl font-black tracking-tight text-slate-950">{formatTruckFixrCad(price)}</span>
                      <span className="pb-1 text-sm text-slate-600">{periodLabel}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Includes {plan.poweredVehicleLimit} powered vehicle{plan.poweredVehicleLimit === 1 ? "" : "s"} and {plan.includedTrailerLimit} active trailer{plan.includedTrailerLimit === 1 ? "" : "s"}.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        className="rounded-full bg-slate-950 px-4"
                        onClick={() => handleCheckout(plan.planKey)}
                        disabled={checkoutMutation.isPending || pilotMutation.isPending}
                      >
                        {plan.cta}
                      </Button>
                      {plan.planKey === "custom_fleet" ? null : (
                        <Button
                          variant="ghost"
                          className="rounded-full text-slate-700"
                          onClick={() => {
                            window.location.href = "#faq";
                          }}
                        >
                          Learn more
                        </Button>
                      )}
                    </div>
                    <div className="mt-4 flex items-start gap-3 text-sm text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>Extra active trailers are $5 CAD/month each beyond the included allowance.</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <section id="pricing" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="mb-8 max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-700">Pricing</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Straightforward pricing for small fleets</h2>
              <p className="mt-4 text-slate-600">
                Invite your whole team at no extra cost. Track inspections, AI diagnostics, and trailer activity without paying per driver or per inspection.
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
              <div className="grid grid-cols-[1.4fr_repeat(5,minmax(0,1fr))] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <div>Feature</div>
                {comparisonPlans.map((plan) => (
                  <div key={plan.planKey} className={plan.recommended ? "text-red-700" : ""}>
                    {plan.name}
                  </div>
                ))}
              </div>
              <div className="divide-y divide-slate-200 bg-white">
                {featureRows.map(([label, ...values]) => (
                  <div key={label} className="grid grid-cols-[1.4fr_repeat(5,minmax(0,1fr))] px-4 py-4 text-sm">
                    <div className="font-medium text-slate-900">{label}</div>
                    {values.map((value, index) => (
                      <div key={`${label}-${index}`} className="text-slate-600">
                        {value}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Need a fleet quote?</CardTitle>
                <CardDescription>
                  For 21+ powered vehicles or custom trailer-heavy fleets, contact us and we&apos;ll help you choose the right setup.
                  Support requests and fleet plan requests go to <a className="font-semibold text-slate-950 underline" href="mailto:info@truckfixr.com">info@truckfixr.com</a>.
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
                      if (event.target.value.trim()) saveCompanyName(event.target.value);
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
                  <Label htmlFor="fleet-vehicles">Powered vehicles</Label>
                  <Input
                    id="fleet-vehicles"
                    type="number"
                    className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                    value={fleetQuote.vehicleCount}
                    onChange={(event) => setFleetQuote((current) => ({ ...current, vehicleCount: Number(event.target.value || 0) }))}
                  />
                </div>
                <div>
                  <Label htmlFor="fleet-drivers">Drivers</Label>
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
                    placeholder="Example: powered vehicle limits, trailer tracking, and AI diagnostics"
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
                  <Button className="rounded-full bg-slate-950 px-5" onClick={handleFleetQuote} disabled={quoteMutation.isPending}>
                    {quoteMutation.isPending ? "Sending..." : "Request Fleet quote"}
                  </Button>
                  <p className="text-sm text-slate-500">
                    We&apos;ll save your request, notify the TruckFixr team at info@truckfixr.com, and confirm by email.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card id="faq" className="rounded-3xl border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Frequently asked questions</CardTitle>
                <CardDescription>Clear answers for TruckFixr Fleet AI pricing and trailer handling.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {faqItems.map((faq) => (
                  <div key={faq.question} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-950">{faq.question}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-950 py-16 text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-300">Ready to start?</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Start with a free trial, move into Fleet Pilot, and scale powered vehicles + trailers as you grow.
              </h2>
              <p className="mt-4 text-slate-300">
                All prices are CAD, taxes are separate, and every plan includes unlimited users and unlimited inspections for active assets.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button className="rounded-full bg-white px-5 text-slate-950 hover:bg-slate-100" onClick={() => navigate("/signup")}>
                Start Free Trial
              </Button>
              <Button variant="outline" className="rounded-full border-slate-700 px-5 text-white hover:bg-white/10" onClick={() => handleCheckout("fleet_growth")}>
                Start 30-Day Fleet Pilot
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
