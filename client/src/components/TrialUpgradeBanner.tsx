import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { TRUCKFIXR_PLANS } from "@shared/truckfixrPricing";

// Nudges an existing free-trial fleet toward the paid Fleet AI Pilot
// (fleet_growth: CAD $99/mo). Links to the full Pricing page rather than
// duplicating the Stripe checkout call site here.
export default function TrialUpgradeBanner() {
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const dismissKey = "truckfixr:trial-upgrade-dismissed";

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.sessionStorage.getItem(dismissKey) === "true");
  }, []);

  const isTrial = subscriptionQuery.data?.companyPlanKey === "free_trial";
  const trialEnd = subscriptionQuery.data?.trialEnd ?? null;
  const daysLeft = useMemo(() => {
    if (!trialEnd) return null;
    const ms = new Date(trialEnd).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }, [trialEnd]);

  if (subscriptionQuery.isLoading || !isTrial || dismissed) return null;

  const pilotPlan = TRUCKFIXR_PLANS.fleet_growth;

  return (
    <Card className="rounded-lg border-amber-100 bg-white shadow-sm">
      <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {daysLeft != null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your free trial` : "You're on the free trial"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Upgrade to the {pilotPlan.name} — CAD ${pilotPlan.priceCadMonthly}/month for up to{" "}
              {pilotPlan.poweredVehicleLimit} vehicles, unlimited inspections, and full AI triage.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            className="rounded-full bg-[var(--fleet-secondary-container)] hover:bg-[var(--fleet-secondary)]"
            onClick={() => navigate("/pricing")}
          >
            Upgrade now
          </Button>
          <Button
            variant="outline"
            className="rounded-full bg-white"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.sessionStorage.setItem(dismissKey, "true");
              }
              setDismissed(true);
            }}
          >
            <X className="h-4 w-4" />
            Dismiss for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
