import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getMyGuidePath,
  getQuickStartGuideForRole,
} from "@/lib/quickStartGuides";
import { trpc } from "@/lib/trpc";
import { BookOpenCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

type QuickStartBannerProps = {
  role?: string | null;
};

const bannerCopy = {
  driver:
    "Complete your Driver Quick Start Guide to learn how to view your assigned vehicle, complete inspections, report issues, and use AI diagnostics safely.",
  "owner-operator":
    "Complete your Owner Operator Quick Start Guide to add your vehicle, complete inspections, run diagnostics, and track maintenance follow-up.",
  "fleet-manager":
    "Complete your Fleet Manager Quick Start Guide to assign drivers, review inspections, monitor defects, and manage maintenance follow-up.",
  "fleet-owner":
    "Complete your Fleet Owner Quick Start Guide to review your fleet dashboard, manage users, monitor compliance status, and track uptime risk.",
};

export default function QuickStartBanner({ role }: QuickStartBannerProps) {
  const guide = getQuickStartGuideForRole(role);
  const [, navigate] = useLocation();
  const dismissKey = useMemo(
    () => (guide ? `truckfixr:quick-start-dismissed:${guide.slug}` : ""),
    [guide]
  );
  const [dismissed, setDismissed] = useState(false);
  const progressQuery = trpc.quickStart.getMine.useQuery(
    { manualSlug: guide?.slug ?? "driver" },
    { enabled: Boolean(guide) }
  );

  useEffect(() => {
    if (!dismissKey || typeof window === "undefined") return;
    setDismissed(window.sessionStorage.getItem(dismissKey) === "true");
  }, [dismissKey]);

  if (!guide || dismissed || progressQuery.isLoading) return null;

  const progress = Array.isArray(progressQuery.data) ? null : progressQuery.data;
  if (progress?.manualCompletedAt) return null;

  return (
    <Card className="rounded-lg border-red-100 bg-white shadow-sm">
      <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {guide.slug === "driver"
                ? "Welcome to TruckFixr Fleet AI."
                : guide.slug === "owner-operator"
                  ? "Set up your TruckFixr workflow."
                  : guide.slug === "fleet-manager"
                    ? "Set up your fleet workflow."
                    : "Get visibility into your fleet."}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              {bannerCopy[guide.slug]}
            </p>
          </div>
        </div>
        <div className="quick-start-app-only flex flex-wrap gap-3">
          <Button
            className="rounded-full bg-[var(--fleet-secondary-container)] hover:bg-[var(--fleet-secondary)]"
            onClick={() => navigate(getMyGuidePath())}
          >
            Open My Quick Start Guide
          </Button>
          <Button
            variant="outline"
            className="rounded-full bg-white"
            onClick={() => {
              if (dismissKey && typeof window !== "undefined") {
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
