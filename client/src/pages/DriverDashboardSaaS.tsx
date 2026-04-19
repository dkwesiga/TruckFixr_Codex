import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuthContext } from "@/hooks/useAuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import VehicleCaptureFlow from "@/components/VehicleCaptureFlow";
import { getBrowserStorage, loadInspectionDraft } from "@/lib/inspectionDrafts";
import { trackEvent, trackInspectionStarted } from "@/lib/analytics";
import { saveLastDriverVehicleContext } from "@/lib/driverVehicleContext";
import { trpc } from "@/lib/trpc";
import {
  loadDriverVehicles,
  saveDriverVehicles,
  type DriverVehicleRecord,
} from "@/lib/driverVehicles";
import { formatDistanceKm } from "@/lib/vehicleDisplay";
import { AlertCircle, CheckCircle2, Eye, Gauge, LogOut, Plus, SearchCode, ShieldCheck, Stethoscope, Truck } from "lucide-react";

type DriverVehicle = DriverVehicleRecord;

type InspectionReport = {
  title: string;
  completedAt: string;
  summary: string;
  findings: string[];
};

type RecentActivityItem = {
  id: number;
  type: "inspection" | "defect";
  title: string;
  detail: string;
  report?: InspectionReport;
};

const recentActivity: RecentActivityItem[] = [
  {
    id: 1,
    type: "inspection",
    title: "Inspection Completed",
    detail: "Today at 8:30 AM - No issues reported",
    report: {
      title: "Pre-trip inspection report",
      completedAt: "Today at 8:30 AM",
      summary: "12 checklist items completed with no defects flagged.",
      findings: [
        "Exterior, lights, tires, brakes, and engine checks all passed.",
        "No active warning lights reported by the driver.",
        "Truck was cleared for dispatch.",
      ],
    },
  },
  { id: 2, type: "defect", title: "Defect Reported", detail: "Yesterday at 2:15 PM - Tire wear detected" },
];

function badgeClasses(value: string) {
  switch (value) {
    case "Operational":
    case "Ready":
    case "Cleared":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "Needs Review":
    case "Attention":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function DriverDashboardContent() {
  const { user, logout } = useAuthContext();
  const [, navigate] = useLocation();
  const [vehicles, setVehicles] = useState<DriverVehicle[]>(() => loadDriverVehicles());
  const [activeVehicleId, setActiveVehicleId] = useState(() => loadDriverVehicles()[0]?.id ?? 42);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<InspectionReport | null>(null);
  const storage = useMemo(() => getBrowserStorage(), []);
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const trackPilotEventMutation = trpc.subscriptions.trackPilotEvent.useMutation();
  const persistVehicles = (nextVehicles: DriverVehicle[]) => {
    setVehicles(nextVehicles);
    saveDriverVehicles(nextVehicles);
  };

  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0];
  const activeFleetId = subscriptionQuery.data?.activeFleetId ?? 1;
  const pilotAccess = subscriptionQuery.data?.pilotAccess ?? null;
  const latestInspection = recentActivity.find((item) => item.type === "inspection");
  const pendingDrafts = useMemo(
    () =>
      vehicles
        .map((vehicle) => ({
          vehicle,
          draft: loadInspectionDraft(storage, vehicle.id),
        }))
        .filter(
          (entry) =>
            entry.draft &&
            (entry.draft.data.stepIndex > 0 || Object.keys(entry.draft.data.responses).length > 0)
        ),
    [storage, vehicles]
  );
  const pendingDraftForActiveVehicle = pendingDrafts.find(
    (entry) => entry.vehicle.id === activeVehicleId
  )?.draft;
  const alternateVehicle = vehicles.find((vehicle) => vehicle.id !== activeVehicleId) ?? null;

  const activeVehicleDisplay = useMemo(() => {
    const yearPrefix = activeVehicle.year ? `${activeVehicle.year} ` : "";
    return `${yearPrefix}${activeVehicle.make} ${activeVehicle.model}`.trim();
  }, [activeVehicle.make, activeVehicle.model, activeVehicle.year]);

  const initials = useMemo(() => {
    const name = user?.name?.trim() || "Driver";
    return name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  }, [user?.name]);

  const readinessLabel = activeVehicle.status === "Operational" ? "Ready" : "Attention";

  useEffect(() => {
    if (!pilotAccess || pilotAccess.status !== "active") return;
    if (
      !pilotAccess.isExpiringSoon &&
      pilotAccess.vehiclesUsed < Math.max(1, pilotAccess.maxVehicles - 1)
    ) {
      return;
    }

    const eventKey = `truckfixr:pilot-prompt:${pilotAccess.codeId}:driver`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(eventKey)) {
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(eventKey, "shown");
    }

    trackEvent("upgrade_prompt_shown", {
      source: "driver_dashboard",
      fleet_id: activeFleetId,
      code_id: pilotAccess.codeId,
    });
    void trackPilotEventMutation.mutateAsync({
      eventType: "upgrade_prompt_shown",
      fleetId: activeFleetId,
      metadata: {
        source: "driver_dashboard",
      },
    });
  }, [activeFleetId, pilotAccess, trackPilotEventMutation]);

  const startInspection = (vehicle: DriverVehicle) => {
    trackInspectionStarted(Date.now(), vehicle.id, { source: "driver_dashboard", vehicle_label: vehicle.label, flow: "daily_inspection" });
    setActiveVehicleId(vehicle.id);
    saveLastDriverVehicleContext({
      id: vehicle.id,
      fleetId: activeFleetId,
      label: vehicle.label,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      engineMake: vehicle.engineMake,
    });
    window.location.href = `/inspection?vehicle=${encodeURIComponent(String(vehicle.id))}&fleet=${encodeURIComponent(String(activeFleetId))}&mode=daily`;
  };

  const startDiagnosis = (vehicle: DriverVehicle) => {
    trackEvent("driver_diagnosis_started", { source: "driver_dashboard", vehicle_id: vehicle.id, vehicle_label: vehicle.label });
    setActiveVehicleId(vehicle.id);
    saveLastDriverVehicleContext({
      id: vehicle.id,
      fleetId: activeFleetId,
      label: vehicle.label,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      engineMake: vehicle.engineMake,
    });
    window.location.href = `/diagnosis?vehicle=${encodeURIComponent(String(vehicle.id))}&fleet=${encodeURIComponent(String(activeFleetId))}&label=${encodeURIComponent(vehicle.label)}&vin=${encodeURIComponent(vehicle.vin)}`;
  };

  return (
    <div className="app-shell min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="section-label">Driver dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Daily readiness workflow</h1>
            <p className="mt-2 text-sm text-slate-600">See your current truck, complete today&apos;s inspection, and start diagnosis when something feels off.</p>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={isAddVehicleOpen} onOpenChange={setIsAddVehicleOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full bg-blue-600 text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Add Vehicle</Button>
              </DialogTrigger>
              <DialogContent className="rounded-[24px] border-slate-200 sm:max-w-xl">
                <VehicleCaptureFlow
                  fleetId={activeFleetId}
                  source="vehicles"
                  onCancel={() => setIsAddVehicleOpen(false)}
                  onSaved={(vehicle) => {
                    const nextVehicles = [vehicle, ...vehicles.filter((item) => item.id !== vehicle.id)];
                    persistVehicles(nextVehicles);
                    setActiveVehicleId(vehicle.id);
                    setIsAddVehicleOpen(false);
                  }}
                />
              </DialogContent>
            </Dialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-full border-slate-200 bg-white px-2">
                  <Avatar className="h-7 w-7 border border-slate-200"><AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">{initials}</AvatarFallback></Avatar>
                  <div className="hidden text-left sm:block"><p className="text-sm font-medium text-slate-900">{user?.name || "Driver"}</p></div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl border-slate-200 p-2">
                <div className="px-2 py-2">
                  <p className="text-sm font-semibold text-slate-900">{user?.name || "Driver"}</p>
                  <p className="text-xs text-slate-500">{user?.email || "Signed in"}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/profile")}>
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-xl text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="saas-card overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-[linear-gradient(145deg,rgba(239,246,255,0.96),rgba(255,255,255,0.96),rgba(236,253,245,0.92))] px-7 py-7">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(activeVehicle.status)}`}>{activeVehicle.status}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(readinessLabel)}`}>Today&apos;s readiness: {readinessLabel}</span>
                  </div>
                  <div>
                    <p className="section-label">Current truck</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{activeVehicle.label}</h2>
                    <p className="mt-2 text-sm text-slate-600">{activeVehicleDisplay}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                        ["Plate", activeVehicle.licensePlate],
                        ["Engine model", activeVehicle.engineMake || "Not set"],
                        ["Distance", formatDistanceKm(activeVehicle.mileage)],
                      ["Last inspection", latestInspection?.detail.split(" - ")[0] ?? "Not available"],
                      ["VIN", activeVehicle.vin],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-950">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[320px] lg:grid-cols-1">
                  <Button className="h-12 rounded-2xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => startInspection(activeVehicle)}><SearchCode className="h-4 w-4" />{pendingDraftForActiveVehicle ? "Resume Pending Inspection" : "Start Daily Inspection"}</Button>
                  <Button variant="outline" className="h-12 rounded-2xl border-slate-200 bg-white" onClick={() => startDiagnosis(activeVehicle)}><Stethoscope className="h-4 w-4" />Start Diagnosis</Button>
                  <Button variant="outline" className="h-12 rounded-2xl border-slate-200 bg-white" onClick={() => setIsAddVehicleOpen(true)}><Plus className="h-4 w-4" />Add Vehicle</Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 px-7 py-6 md:grid-cols-3">
              {[
                { icon: ShieldCheck, label: "What needs attention", value: "Complete the pre-trip workflow before dispatch." },
                { icon: Gauge, label: "Last completed activity", value: latestInspection?.detail || "No recent inspection logged." },
                { icon: AlertCircle, label: "Next best action", value: "Start diagnosis immediately if the truck feels unsafe or warning lights appear." },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800"><item.icon className="h-4 w-4 text-blue-600" />{item.label}</div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.value}</p>
                </div>
              ))}
            </div>
            {pendingDraftForActiveVehicle ? (
              <div className="border-t border-amber-200 bg-amber-50/80 px-7 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Pending inspection found for {activeVehicle.label}</p>
                    <p className="mt-1 text-sm text-amber-800">
                      You already started this daily inspection. Resume it, or choose another vehicle to begin a separate inspection.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button className="rounded-xl bg-amber-600 text-white hover:bg-amber-700" onClick={() => startInspection(activeVehicle)}>
                      Resume inspection
                    </Button>
                    {alternateVehicle ? (
                      <Button
                        variant="outline"
                        className="rounded-xl border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                        onClick={() => setActiveVehicleId(alternateVehicle.id)}
                      >
                        Start with another vehicle
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="rounded-xl border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                        onClick={() => setIsAddVehicleOpen(true)}
                      >
                        Add another vehicle
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-6">
            {pilotAccess?.status === "active" ? (
              <Card className="metric-card border-0">
                <CardHeader className="pb-3">
                  <CardDescription className="text-sm text-slate-500">Pilot Access</CardDescription>
                  <CardTitle className="text-2xl font-semibold text-slate-950">Pilot Access Active</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-sm text-slate-600">
                  <p>Expires {new Date(pilotAccess.expiresAt).toLocaleDateString()}</p>
                  <p>Vehicles used: {pilotAccess.vehiclesUsed} / {pilotAccess.maxVehicles}</p>
                  <p>Users enabled: {pilotAccess.usersUsed} / {pilotAccess.maxUsers}</p>
                  <Button variant="outline" className="mt-3 w-full rounded-xl" onClick={() => navigate("/profile")}>
                    Upgrade Plan
                  </Button>
                </CardContent>
              </Card>
            ) : null}
            <Card className="metric-card border-0">
              <CardHeader className="pb-3"><CardDescription className="text-sm text-slate-500">Assigned vehicles</CardDescription><CardTitle className="text-3xl font-semibold text-slate-950">{vehicles.length}</CardTitle></CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">One dashboard for your truck list, inspections, and diagnosis starts.</CardContent>
            </Card>
            <Card className="metric-card border-0">
              <CardHeader className="pb-3"><CardDescription className="text-sm text-slate-500">Today&apos;s readiness</CardDescription><CardTitle className="text-3xl font-semibold text-slate-950">{readinessLabel}</CardTitle></CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">{activeVehicle.status === "Operational" ? "Truck looks ready for the daily inspection workflow." : "Resolve flagged concerns before heading out."}</CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="saas-card border-0 p-0">
            <CardHeader className="border-b border-slate-200 px-7 py-6">
              <CardTitle className="text-2xl font-semibold text-slate-950">Your vehicles</CardTitle>
              <CardDescription className="text-sm text-slate-600">Choose the truck you are working on, then inspect or diagnose from the same place.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 px-7 py-6 md:grid-cols-2">
              {vehicles.map((vehicle) => {
                const isActive = vehicle.id === activeVehicleId;
                const vehicleDisplay = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
                return (
                  <div key={vehicle.id} className={`rounded-[22px] border p-5 transition-all ${isActive ? "border-blue-200 bg-blue-50/70 shadow-[0_18px_40px_-30px_rgba(37,99,235,0.6)]" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Truck className="h-4 w-4" /></div>
                          <div>
                            <p className="font-semibold text-slate-950">{vehicle.label}</p>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{vehicle.licensePlate}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm text-slate-600">{vehicle.engineMake ? `${vehicleDisplay} | ${vehicle.engineMake}` : vehicleDisplay}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isActive ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">Current</span> : null}
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(vehicle.status)}`}>{vehicle.status}</span>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Distance</p><p className="mt-2 text-sm font-semibold text-slate-950">{formatDistanceKm(vehicle.mileage)}</p></div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-3"><p className="text-xs uppercase tracking-[0.16em] text-slate-400">Readiness</p><p className="mt-2 text-sm font-semibold text-slate-950">{vehicle.status === "Operational" ? "Ready" : "Check before trip"}</p></div>
                    </div>
                    <div className="mt-5 flex gap-3">
                      <Button className="flex-1 rounded-2xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => startInspection(vehicle)}>Inspect</Button>
                      <Button variant="outline" className="flex-1 rounded-2xl border-slate-200 bg-white" onClick={() => startDiagnosis(vehicle)}>Diagnose</Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="saas-card border-0 p-0">
            <CardHeader className="border-b border-slate-200 px-7 py-6">
              <CardTitle className="text-2xl font-semibold text-slate-950">Recent activity</CardTitle>
              <CardDescription className="text-sm text-slate-600">Review what happened recently before starting your next task.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-7 py-6">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">{activity.type === "inspection" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}</div>
                      <div>
                        <p className="font-semibold text-slate-950">{activity.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{activity.detail}</p>
                      </div>
                    </div>
                    {activity.type === "inspection" && activity.report ? <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white" onClick={() => setSelectedReport(activity.report ?? null)}><Eye className="h-4 w-4" />View Report</Button> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Dialog open={Boolean(selectedReport)} onOpenChange={(open) => { if (!open) setSelectedReport(null); }}>
          <DialogContent className="rounded-[24px] border-slate-200 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedReport?.title ?? "Inspection Report"}</DialogTitle>
              <DialogDescription>{selectedReport?.completedAt}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-medium text-slate-900">{selectedReport?.summary}</p></div>
              <div className="space-y-2">{selectedReport?.findings.map((finding) => <div key={finding} className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-700">{finding}</div>)}</div>
            </div>
            <DialogFooter><Button onClick={() => setSelectedReport(null)} className="rounded-xl">Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

export default function DriverDashboardSaaS() {
  return (
    <RoleBasedRoute requiredRoles={["driver"]}>
      <DriverDashboardContent />
    </RoleBasedRoute>
  );
}
