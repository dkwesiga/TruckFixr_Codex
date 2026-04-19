import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import { SUBSCRIPTION_PLANS } from "../../../shared/subscription";

export default function Pricing() {
  const orderedPlans = [
    SUBSCRIPTION_PLANS.free,
    SUBSCRIPTION_PLANS.pro,
    SUBSCRIPTION_PLANS.fleet,
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-slate-900">Simple subscription tiers for the MVP</h1>
          <p className="mt-2 text-lg text-slate-600">
            Start free for inspections and compliance, then upgrade when diagnostics and fleet usage grow.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          {orderedPlans.map((plan) => (
            <Card
              key={plan.tier}
              className={plan.tier === "pro" ? "relative border-2 border-blue-600" : ""}
            >
              {plan.tier === "pro" ? (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-sm font-semibold text-white">
                  Most popular
                </div>
              ) : null}
              <CardHeader className={plan.tier === "pro" ? "pt-8" : ""}>
                <CardTitle>{plan.label}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-slate-900">
                    {plan.monthlyPriceUsd === 0 ? "Free" : `$${plan.monthlyPriceUsd}`}
                  </span>
                  {plan.monthlyPriceUsd > 0 ? <span className="ml-2 text-slate-600">/month</span> : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button
                  className="w-full"
                  variant={plan.tier === "pro" ? "default" : "outline"}
                  onClick={() => {
                    window.location.href = "/signup";
                  }}
                >
                  {plan.tier === "free" ? "Start Free" : `Choose ${plan.label}`}
                </Button>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span className="text-sm text-slate-700">
                      Diagnostics: {plan.limits.diagnosticsPerMonth ?? "Unlimited"} per month
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span className="text-sm text-slate-700">
                      Vehicles: {plan.limits.vehicleCount ?? "Unlimited"}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span className="text-sm text-slate-700">
                      Inspections, maintenance, and compliance tracking included
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span className="text-sm text-slate-700">
                      {plan.features.advancedDiagnosticHistory
                        ? "Advanced diagnostic history enabled"
                        : "Advanced diagnostic history locked"}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span className="text-sm text-slate-700">
                      {plan.features.fleetReporting
                        ? "Fleet-level visibility and reporting enabled"
                        : "Fleet-level visibility available on higher tiers"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
