import { useMemo } from "react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";
import { getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { useSeoMeta } from "@/lib/useSeoMeta";
import {
  getSampleComplianceForVehicle,
  recommendBundlingLabel,
  type BundlingLabel,
  type SampleCompliance,
} from "@/lib/maintenancePlanningSampleData";
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  ClipboardList,
  Loader2,
  Repeat,
  ShieldAlert,
  Wrench,
} from "lucide-react";

// Internal, feature-flagged area. Pending Issues use REAL defect data; the
// Inspection & Compliance Status widget uses clearly-labeled SAMPLE data
// because vehicle inspection-expiry fields are not in the schema yet.

type DefectRow = {
  id: number;
  vehicleId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  severity?: string | null;
  status?: string | null;
  safetyRelated?: boolean | null;
  isBlockingOperationally?: boolean | null;
  symptoms?: unknown;
  faultCodes?: unknown;
  photoUrls?: unknown;
  recommendedAction?: string | null;
  createdAt?: string | Date | null;
};

type VehicleRow = {
  id: string;
  unitNumber?: string | null;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
};

const LABEL_STYLES: Record<BundlingLabel, string> = {
  "Do Not Operate": "bg-red-100 text-red-700 border-red-200",
  "Fix Now": "bg-orange-100 text-orange-700 border-orange-200",
  "Bundle With Next Service": "bg-blue-100 text-blue-700 border-blue-200",
  Monitor: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

const COMPLIANCE_STATE_STYLES = {
  current: "bg-emerald-100 text-emerald-700",
  due_soon: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-700",
} as const;

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object" && "code" in (item as object)
            ? String((item as { code: unknown }).code)
            : null
      )
      .filter((item): item is string => Boolean(item));
  }
  return [];
}

function hasPhotos(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-purple-700">
      Sample data
    </span>
  );
}

function ComplianceWidget({ compliance }: { compliance: SampleCompliance }) {
  const statePill = COMPLIANCE_STATE_STYLES[compliance.state];
  const stateLabel =
    compliance.state === "current"
      ? "Current"
      : compliance.state === "due_soon"
        ? "Due soon"
        : "Overdue";
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-['Manrope'] text-sm font-bold text-slate-900">
          <CalendarClock className="h-4 w-4 text-slate-500" />
          Inspection &amp; compliance status
        </p>
        <SampleBadge />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-slate-500">Daily inspection</p>
          <p className="mt-1 font-semibold text-slate-900">
            {compliance.dailyInspection === "complete" ? "Complete" : "Missing"}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Annual inspection</p>
          <p className="mt-1 font-semibold text-slate-900">
            {compliance.annualInspectionDate}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Semi-annual</p>
          <p className="mt-1 font-semibold text-slate-900">
            {compliance.semiAnnualInspectionDate ?? "N/A"}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Status</p>
          <span
            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${statePill}`}
          >
            {stateLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function MaintenancePlanningContent() {
  useSeoMeta({
    title: "Maintenance Planning | TruckFixr",
    description: "Internal maintenance planning workspace.",
  });

  const { user } = useAuthContext();
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const companyQuery = trpc.company.getCurrent.useQuery(undefined, {
    retry: false,
  });

  const userFleetId = (user as { fleetId?: unknown } | null)?.fleetId;
  const fallbackFleetId =
    typeof userFleetId === "number" && Number.isFinite(userFleetId)
      ? userFleetId
      : null;
  const companyFleetId =
    typeof companyQuery.data?.company?.id === "number"
      ? companyQuery.data.company.id
      : null;
  const fleetId =
    subscriptionQuery.data?.activeFleetId ?? companyFleetId ?? fallbackFleetId;
  const resolvedFleetId =
    typeof fleetId === "number" && fleetId > 0 ? fleetId : null;

  const vehiclesQuery = trpc.vehicles.listByFleet.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { enabled: resolvedFleetId != null }
  );
  const defectsQuery = trpc.defects.listByFleet.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { enabled: resolvedFleetId != null }
  );

  const vehicles = (vehiclesQuery.data ?? []) as unknown as VehicleRow[];
  const defects = (defectsQuery.data ?? []) as unknown as DefectRow[];

  const groups = useMemo(() => {
    const byVehicle = new Map<string, DefectRow[]>();
    for (const defect of defects) {
      const list = byVehicle.get(defect.vehicleId) ?? [];
      list.push(defect);
      byVehicle.set(defect.vehicleId, list);
    }
    return vehicles.map((vehicle, index) => {
      const vehicleDefects = byVehicle.get(vehicle.id) ?? [];
      const openDefects = vehicleDefects.filter(
        (d) => d.status !== "resolved" && d.status !== "dismissed"
      );
      const compliance = getSampleComplianceForVehicle(vehicle.id, index);
      const recommendation = recommendBundlingLabel(vehicleDefects, compliance);
      // Repeat-issue detection: same category/title appearing more than once.
      const seen = new Map<string, number>();
      for (const d of vehicleDefects) {
        const key = (d.category ?? d.title ?? "").toLowerCase().trim();
        if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      const repeatKeys = new Set(
        Array.from(seen.entries())
          .filter(([, n]) => n > 1)
          .map(([k]) => k)
      );
      return {
        vehicle,
        compliance,
        recommendation,
        openDefects,
        repeatKeys,
      };
    });
  }, [vehicles, defects]);

  const isLoading =
    subscriptionQuery.isLoading ||
    companyQuery.isLoading ||
    vehiclesQuery.isLoading ||
    defectsQuery.isLoading;

  const totalOpen = groups.reduce((sum, g) => sum + g.openDefects.length, 0);

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
                Maintenance Planning
              </h1>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Internal
              </span>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-full text-xs font-bold"
          >
            <a href="/manager">Back to dashboard</a>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
          <span className="font-bold">Internal preview.</span> Pending issues use
          your fleet&apos;s real defect data. The inspection &amp; compliance
          values are <span className="font-bold">sample data</span> for layout
          and workflow review only — vehicle inspection dates are not yet stored.
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Vehicles</p>
            <p className="font-['Manrope'] text-2xl font-black">
              {vehicles.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">Open pending issues</p>
            <p className="font-['Manrope'] text-2xl font-black">{totalOpen}</p>
          </div>
        </div>

        <h2 className="mt-8 flex items-center gap-2 font-['Manrope'] text-xl font-black text-slate-900">
          <ClipboardList className="h-5 w-5 text-slate-500" />
          Pending issues by vehicle
        </h2>

        {isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading fleet data…
          </div>
        ) : resolvedFleetId == null ? (
          <p className="mt-6 text-sm text-slate-500">
            No fleet is currently associated with your account.
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">
            No vehicles found for this fleet yet.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {groups.map(
              ({ vehicle, compliance, recommendation, openDefects, repeatKeys }) => {
                const label = getVehicleDisplayLabel({
                  label: vehicle.unitNumber,
                  vin: vehicle.vin,
                  vehicleId: vehicle.id,
                });
                const subtitle = [vehicle.year, vehicle.make, vehicle.model]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <section
                    key={vehicle.id}
                    className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-['Manrope'] text-base font-black text-slate-900">
                          {label}
                        </p>
                        {subtitle ? (
                          <p className="text-xs text-slate-500">{subtitle}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${LABEL_STYLES[recommendation.label]}`}
                        >
                          {recommendation.label === "Do Not Operate" ? (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          ) : recommendation.label ===
                            "Bundle With Next Service" ? (
                            <Wrench className="h-3.5 w-3.5" />
                          ) : null}
                          {recommendation.label}
                        </span>
                        <span className="max-w-xs text-right text-[11px] leading-4 text-slate-500">
                          {recommendation.rationale}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <ComplianceWidget compliance={compliance} />
                    </div>

                    <div className="mt-4">
                      {openDefects.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          No open issues for this vehicle.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {openDefects.map((defect) => {
                            const faultCodes = toStringArray(defect.faultCodes);
                            const symptoms = toStringArray(defect.symptoms);
                            const key = (defect.category ?? defect.title ?? "")
                              .toLowerCase()
                              .trim();
                            const isRepeat = repeatKeys.has(key);
                            const severity = (defect.severity ??
                              "medium") as string;
                            return (
                              <li
                                key={defect.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.medium}`}
                                  >
                                    {severity}
                                  </span>
                                  <a
                                    href={`/defect/${defect.id}`}
                                    className="font-semibold text-slate-900 hover:underline"
                                  >
                                    {defect.title}
                                  </a>
                                  {defect.safetyRelated ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                                      <AlertTriangle className="h-3 w-3" /> Safety
                                    </span>
                                  ) : null}
                                  {isRepeat ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                      <Repeat className="h-3 w-3" /> Repeat
                                    </span>
                                  ) : null}
                                  {hasPhotos(defect.photoUrls) ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                      <Camera className="h-3 w-3" /> Photo
                                    </span>
                                  ) : null}
                                </div>
                                {defect.category ? (
                                  <p className="mt-1 text-xs text-slate-500 capitalize">
                                    {defect.category}
                                  </p>
                                ) : null}
                                {faultCodes.length > 0 || symptoms.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    {faultCodes.map((code) => (
                                      <span
                                        key={`fc-${code}`}
                                        className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200"
                                      >
                                        {code}
                                      </span>
                                    ))}
                                    {symptoms.map((symptom) => (
                                      <span
                                        key={`sx-${symptom}`}
                                        className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200"
                                      >
                                        {symptom}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>
                );
              }
            )}
          </div>
        )}

        <p className="mt-10 text-xs leading-5 text-slate-400">
          Smart Repair Bundling suggestions are planning aids only. They are not a
          safety determination and do not replace certified inspections or the
          judgment of a qualified technician.
        </p>
      </main>
    </div>
  );
}

export default function MaintenancePlanning() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <MaintenancePlanningContent />
    </RoleBasedRoute>
  );
}
