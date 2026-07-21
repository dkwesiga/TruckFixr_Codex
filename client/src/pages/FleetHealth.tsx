import { useState } from "react";
import AppLogo from "@/components/AppLogo";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Gauge,
  Inbox,
  Loader2,
  ShieldAlert,
  Wrench,
} from "lucide-react";

type Classification = "critical" | "attention" | "stable";

const CLASS_STYLES: Record<
  Classification,
  { label: string; badge: string; ring: string; text: string }
> = {
  critical: {
    label: "Critical",
    badge: "bg-red-100 text-red-700 border-red-200",
    ring: "border-l-red-500",
    text: "text-red-700",
  },
  attention: {
    label: "Attention",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    ring: "border-l-amber-500",
    text: "text-amber-800",
  },
  stable: {
    label: "Stable",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    ring: "border-l-emerald-500",
    text: "text-emerald-700",
  },
};

const SAFETY_DISCLAIMER =
  "Decision support only. Confirm safety-critical actions with qualified personnel.";

function IndicatorTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof AlertTriangle;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function vehicleLabel(v: {
  unitNumber: string | null;
  vin: string | null;
  makeModel: string | null;
  vehicleId: string;
}) {
  if (v.unitNumber) return `Unit ${v.unitNumber}`;
  if (v.makeModel) return v.makeModel;
  if (v.vin) return `VIN ${v.vin.slice(-6)}`;
  return v.vehicleId;
}

function VehicleRow({
  vehicle,
  onAcknowledge,
  acknowledging,
}: {
  vehicle: {
    vehicleId: string;
    unitNumber: string | null;
    vin: string | null;
    makeModel: string | null;
    displayClassification: Classification;
    overridden: boolean;
    topReason: string | null;
    score: {
      total: number;
      classification: Classification;
      components: Array<{ ruleKey: string; points: number; explanation: string }>;
      dataQualityWarnings: string[];
    };
  };
  onAcknowledge: (vehicleId: string) => void;
  acknowledging: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = CLASS_STYLES[vehicle.displayClassification];

  return (
    <div
      className={`rounded-xl border border-l-4 border-slate-200 bg-white ${style.ring}`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900">
              {vehicleLabel(vehicle)}
            </h3>
            <Badge variant="outline" className={style.badge}>
              {style.label}
            </Badge>
            {vehicle.overridden ? (
              <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
                Manager override
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm text-slate-600">
            {vehicle.topReason ?? "No active attention factors."}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <div className="text-right">
            <span className={`text-2xl font-bold tabular-nums ${style.text}`}>
              {vehicle.score.total}
            </span>
            <span className="ml-1 text-xs text-slate-400">/100</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            aria-expanded={open}
          >
            Why?
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-slate-100 px-4 py-3">
          {vehicle.score.components.length === 0 ? (
            <p className="text-sm text-slate-500">
              No scoring factors are currently active for this vehicle.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {vehicle.score.components.map((c) => (
                <li
                  key={c.ruleKey}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="text-slate-700">{c.explanation}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-500">
                    +{c.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {vehicle.score.dataQualityWarnings.length > 0 ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {vehicle.score.dataQualityWarnings[0]}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={acknowledging}
              onClick={() => onAcknowledge(vehicle.vehicleId)}
            >
              {acknowledging ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              Acknowledge
            </Button>
            <a href={`/truck/${vehicle.vehicleId}`}>
              <Button size="sm" variant="ghost">
                Open vehicle
              </Button>
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FleetHealthContent() {
  useSeoMeta({
    title: "Fleet Health | TruckFixr",
    description: "Which vehicles need attention, why, and what to do next.",
  });

  const capabilitiesQuery = trpc.fleetMaintenance.capabilities.useQuery(undefined, {
    retry: false,
  });
  const capabilities = capabilitiesQuery.data?.capabilities;
  const dashboardEnabled =
    capabilities?.pilotEligible === true && capabilities?.fleetHealthDashboard === true;

  const summaryQuery = trpc.fleetMaintenance.fleetHealthSummary.useQuery(undefined, {
    enabled: dashboardEnabled,
    retry: false,
  });

  const utils = trpc.useUtils();
  const acknowledge = trpc.fleetMaintenance.acknowledgeScore.useMutation({
    onSuccess: () => {
      void utils.fleetMaintenance.fleetHealthSummary.invalidate();
    },
  });

  const summary = summaryQuery.data;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" aria-label="TruckFixr home">
              <AppLogo imageClassName="h-8 w-auto" />
            </a>
            <div className="flex items-center gap-2">
              <h1 className="font-['Manrope'] text-lg font-black text-slate-900">
                Fleet Health
              </h1>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Pilot
              </span>
            </div>
          </div>
          <a href="/manager">
            <Button variant="ghost" size="sm">
              Back to dashboard
            </Button>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
        {capabilitiesQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !dashboardEnabled ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <ShieldAlert className="h-10 w-10 text-slate-400" />
              <div>
                <p className="font-semibold text-slate-900">
                  Fleet Health is not enabled for your fleet yet
                </p>
                <p className="mt-1 max-w-md text-sm text-slate-500">
                  This is part of the TruckFixr maintenance pilot. Your TruckFixr
                  contact can enable it for your fleet.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary indicators */}
            <section aria-label="Fleet summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <IndicatorTile
                label="Critical"
                value={summary?.indicators.critical ?? 0}
                icon={AlertTriangle}
                tone="text-red-500"
              />
              <IndicatorTile
                label="Attention"
                value={summary?.indicators.attention ?? 0}
                icon={Gauge}
                tone="text-amber-500"
              />
              <IndicatorTile
                label="Stable"
                value={summary?.indicators.stable ?? 0}
                icon={CheckCircle2}
                tone="text-emerald-500"
              />
              <IndicatorTile
                label="Overdue PM"
                value={summary?.indicators.overduePm ?? 0}
                icon={Wrench}
                tone="text-slate-500"
              />
              <IndicatorTile
                label="Critical defects"
                value={summary?.indicators.criticalDefects ?? 0}
                icon={ShieldAlert}
                tone="text-red-500"
              />
              <IndicatorTile
                label="Events to review"
                value={summary?.indicators.reviewRequiredEvents ?? 0}
                icon={Inbox}
                tone="text-slate-500"
              />
            </section>

            <Tabs defaultValue="priorities" className="mt-6">
              <TabsList>
                <TabsTrigger value="priorities">Vehicle priorities</TabsTrigger>
                <TabsTrigger value="review">Events to review</TabsTrigger>
              </TabsList>

              <TabsContent value="priorities" className="mt-4">
                {summaryQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : (summary?.vehicles.length ?? 0) === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                      <ClipboardList className="h-8 w-8 text-slate-400" />
                      <p className="font-medium text-slate-900">No vehicles to show</p>
                      <p className="text-sm text-slate-500">
                        Add vehicles and events to see fleet health prioritization.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {summary!.vehicles.map((v) => (
                      <VehicleRow
                        key={v.vehicleId}
                        vehicle={v as never}
                        acknowledging={
                          acknowledge.isPending &&
                          acknowledge.variables?.vehicleId === v.vehicleId
                        }
                        onAcknowledge={(vehicleId) =>
                          acknowledge.mutate({ vehicleId })
                        }
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="review" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {summary?.indicators.reviewRequiredEvents ?? 0} event
                      {(summary?.indicators.reviewRequiredEvents ?? 0) === 1 ? "" : "s"} awaiting review
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600">
                      Free-text and unrecognized events default to “review required”
                      and do not affect scoring until a manager accepts them. Review
                      them under Settings → Integrations.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <p className="mt-8 text-xs leading-5 text-slate-400">{SAFETY_DISCLAIMER}</p>
          </>
        )}
      </main>
    </div>
  );
}

export default function FleetHealth() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <FleetHealthContent />
    </RoleBasedRoute>
  );
}
