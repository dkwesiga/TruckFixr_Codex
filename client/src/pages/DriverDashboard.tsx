import { useMemo, useState } from "react";
import { useAuthContext } from "@/hooks/useAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { trackEvent, trackInspectionStarted, trackVehicleAdded } from "@/lib/analytics";
import { saveLastDriverVehicleContext } from "@/lib/driverVehicleContext";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { createTemporaryDriverVehicleId } from "@/lib/driverVehicles";
import { formatDistanceKm, getFallbackUnitNumber, getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Eye, Plus, SearchCode, Stethoscope, Truck } from "lucide-react";

type DriverVehicle = {
  id: number;
  fleetId: number;
  label: string;
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year: number | null;
  mileage: number;
  status: "Operational" | "Needs Review";
  type: string;
};

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

const initialVehicles: DriverVehicle[] = [
  {
    id: 42,
    fleetId: 1,
    label: getVehicleDisplayLabel({ vin: "1XPWD49X91D487964", vehicleId: 42 }),
    vin: "1XPWD49X91D487964",
    licensePlate: "ABC-1234",
    make: "Peterbilt",
    model: "579",
    year: 2022,
    mileage: 245320,
    status: "Operational",
    type: "truck",
  },
];

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
  {
    id: 2,
    type: "defect",
    title: "Defect Reported",
    detail: "Yesterday at 2:15 PM - Tire wear detected",
  },
  {
    id: 3,
    type: "inspection",
    title: "Inspection Completed",
    detail: "2 days ago at 7:45 AM - No issues reported",
    report: {
      title: "Morning inspection report",
      completedAt: "2 days ago at 7:45 AM",
      summary: "Routine driver inspection completed before leaving the yard.",
      findings: [
        "All safety items checked before departure.",
        "Driver logged a clean pre-trip status.",
        "No follow-up maintenance was required.",
      ],
    },
  },
];

function DriverDashboardContent() {
  const { user, logout } = useAuthContext();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [activeVehicleId, setActiveVehicleId] = useState(initialVehicles[0].id);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);

  const isOwnerOperator = user?.role === "owner_operator" || user?.role === "owner" || user?.role === "manager";

  const [selectedReport, setSelectedReport] = useState<InspectionReport | null>(null);
  const [isDecodingVin, setIsDecodingVin] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    label: "",
    vin: "",
    licensePlate: "",
    make: "",
    model: "",
    year: "",
    type: "truck",
  });

  const activeVehicle =
    vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0];

  const activeVehicleDisplay = useMemo(() => {
    const yearPrefix = activeVehicle.year ? `${activeVehicle.year} ` : "";
    return `${yearPrefix}${activeVehicle.make} ${activeVehicle.model}`.trim();
  }, [activeVehicle.make, activeVehicle.model, activeVehicle.year]);

  const startInspection = (vehicle: DriverVehicle) => {
    trackInspectionStarted(Date.now(), vehicle.id, {
      source: "driver_dashboard",
      vehicle_label: vehicle.label,
      flow: "daily_inspection",
    });
    setActiveVehicleId(vehicle.id);
    saveLastDriverVehicleContext({
      id: vehicle.id,
      fleetId: vehicle.fleetId,
      label: vehicle.label,
      vin: vehicle.vin,
    });
    window.location.href = `/inspection?vehicle=${encodeURIComponent(String(vehicle.id))}&fleet=${encodeURIComponent(String(vehicle.fleetId))}&mode=daily`;
  };

  const startDiagnosis = (vehicle: DriverVehicle) => {
    trackEvent("driver_diagnosis_started", {
      source: "driver_dashboard",
      vehicle_id: vehicle.id,
      vehicle_label: vehicle.label,
    });
    setActiveVehicleId(vehicle.id);
    saveLastDriverVehicleContext({
      id: vehicle.id,
      fleetId: vehicle.fleetId,
      label: vehicle.label,
      vin: vehicle.vin,
    });
    window.location.href = `/diagnosis?vehicle=${encodeURIComponent(String(vehicle.id))}&fleet=${encodeURIComponent(String(vehicle.fleetId))}&label=${encodeURIComponent(vehicle.label)}&vin=${encodeURIComponent(vehicle.vin)}`;
  };

  const decodeVin = async () => {
    const vin = vehicleForm.vin.trim().toUpperCase();

    if (vin.length !== 17) {
      toast.error("Enter a full 17-character VIN to decode it.");
      return;
    }

    setIsDecodingVin(true);

    try {
      const response = await fetch(getApiUrl(`/api/vehicles/decode-vin/${encodeURIComponent(vin)}`));
      const payload = await readApiPayload<Record<string, any>>(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the VIN decode API response. Check the live API base URL configuration.",
      });

      if (!response.ok) {
        throw new Error(payload.error || "VIN decode failed");
      }

      setVehicleForm((current) => {
        const nextMake = payload.make || current.make;
        const nextModel = payload.model || current.model;
        const nextYear = payload.year ? String(payload.year) : current.year;
        const nextType = payload.type || payload.vehicle_type || current.type;

        const generatedLabel = getVehicleDisplayLabel({
          label: current.label || "",
          vin,
          vehicleId: vehicles.length + 1,
        });

        return {
          ...current,
          vin,
          label: generatedLabel,
          make: nextMake,
          model: nextModel,
          year: nextYear,
          type: nextType,
        };
      });

      toast.success("VIN decoded and vehicle fields populated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "VIN decode failed";
      toast.error(message);
    } finally {
      setIsDecodingVin(false);
    }
  };

  const handleAddVehicle = () => {
    const label = getVehicleDisplayLabel({
      label: vehicleForm.label,
      vin: vehicleForm.vin,
      vehicleId: vehicles.length + 1,
    }).trim();
    const vin = vehicleForm.vin.trim().toUpperCase();
    const licensePlate = vehicleForm.licensePlate.trim();
    const make = vehicleForm.make.trim();
    const model = vehicleForm.model.trim();
    const year = vehicleForm.year.trim();

    if (!label || !vin || !licensePlate || !make || !model || !vehicleForm.type) {
      toast.error("Fill in all vehicle details before adding it.");
      return;
    }

    const nextVehicle: DriverVehicle = {
      id: createTemporaryDriverVehicleId(),
      fleetId: 1,
      label,
      vin,
      licensePlate,
      make,
      model,
      year: year ? Number(year) : null,
      mileage: 0,
      status: "Operational",
      type: vehicleForm.type,
    };

    setVehicles((current) => [nextVehicle, ...current]);
    setActiveVehicleId(nextVehicle.id);
    setVehicleForm({
      label: "",
      vin: "",
      licensePlate: "",
      make: "",
      model: "",
      year: "",
      type: "truck",
    });
    setIsAddVehicleOpen(false);

    trackVehicleAdded(nextVehicle.id, 1, {
      source: "driver_dashboard",
      vehicle_label: nextVehicle.label,
      vin: nextVehicle.vin,
      vehicle_type: nextVehicle.type,
    });
    toast.success(`${nextVehicle.label} added to your dashboard.`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{isOwnerOperator ? "My Fleet Health" : "Driver Dashboard"}</h1>
            <p className="text-sm text-slate-600">Hello, {user?.name}</p>
          </div>
          <div className="flex items-center gap-3">
            {isOwnerOperator && <Dialog open={isAddVehicleOpen} onOpenChange={setIsAddVehicleOpen}>
              <DialogTrigger asChild>
                <Button className="bg-slate-900 hover:bg-slate-800">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Vehicle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a Vehicle</DialogTitle>
                  <DialogDescription>
                    Enter a VIN to decode the vehicle details, then save it to your dashboard.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="vehicle-vin">VIN</Label>
                    <div className="mt-2 flex gap-3">
                      <Input
                        id="vehicle-vin"
                        placeholder="17-character VIN"
                        value={vehicleForm.vin}
                        onChange={(e) =>
                          setVehicleForm((current) => ({ ...current, vin: e.target.value.toUpperCase() }))
                        }
                      />
                      <Button type="button" variant="outline" onClick={decodeVin} disabled={isDecodingVin}>
                        {isDecodingVin ? "Decoding..." : "Decode VIN"}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="vehicle-label">Vehicle Label</Label>
                    <Input
                      id="vehicle-label"
                      placeholder="Truck #57"
                      value={vehicleForm.label}
                      onChange={(e) => setVehicleForm((current) => ({ ...current, label: e.target.value }))}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      If left blank, TruckFixr will use unit {getFallbackUnitNumber(vehicleForm.vin) || "from the last 6 VIN digits"}.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="vehicle-type">Vehicle Type</Label>
                    <select
                      id="vehicle-type"
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={vehicleForm.type}
                      onChange={(e) => setVehicleForm((current) => ({ ...current, type: e.target.value }))}
                    >
                      <option value="truck">Truck</option>
                      <option value="tractor">Tractor</option>
                      <option value="trailer">Trailer</option>
                      <option value="straight_truck">Straight Truck</option>
                      <option value="bus">Bus</option>
                      <option value="van">Van</option>
                      <option value="reefer_trailer">Reefer Trailer</option>
                      <option value="flatbed_trailer">Flatbed Trailer</option>
                      <option value="dry_van_trailer">Dry Van Trailer</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="vehicle-license">License Plate</Label>
                    <Input
                      id="vehicle-license"
                      placeholder="XYZ-2048"
                      value={vehicleForm.licensePlate}
                      onChange={(e) =>
                        setVehicleForm((current) => ({ ...current, licensePlate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vehicle-make">Make</Label>
                      <Input
                        id="vehicle-make"
                        placeholder="Volvo"
                        value={vehicleForm.make}
                        onChange={(e) => setVehicleForm((current) => ({ ...current, make: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="vehicle-model">Model</Label>
                      <Input
                        id="vehicle-model"
                        placeholder="VNL 760"
                        value={vehicleForm.model}
                        onChange={(e) => setVehicleForm((current) => ({ ...current, model: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="vehicle-year">Year</Label>
                    <Input
                      id="vehicle-year"
                      placeholder="2024"
                      value={vehicleForm.year}
                      onChange={(e) => setVehicleForm((current) => ({ ...current, year: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddVehicleOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddVehicle}>Save Vehicle</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>}
            <Button variant="outline" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <Card className="overflow-hidden border-blue-200">
          <CardContent className="p-0">
            <div className="bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    <Stethoscope className="w-3.5 h-3.5" />
                    Ready for diagnosis
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{activeVehicle.label}</h2>
                    <p className="text-sm text-slate-600">License: {activeVehicle.licensePlate}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Make / Model</p>
                      <p className="font-semibold text-slate-900">{activeVehicleDisplay}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Type</p>
                      <p className="font-semibold text-slate-900 capitalize">{activeVehicle.type.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Distance</p>
                      <p className="font-semibold text-slate-900">
                        {formatDistanceKm(activeVehicle.mileage)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Status</p>
                      <p className="font-semibold text-emerald-600">{activeVehicle.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Today</p>
                      <p className="font-semibold text-slate-900">Pre-trip ready</p>
                    </div>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-72">
                  {isOwnerOperator && <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={() => setIsAddVehicleOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vehicle
                  </Button>}
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => startDiagnosis(activeVehicle)}>
                    <Stethoscope className="w-4 h-4 mr-2" />
                    Start Diagnosis
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => startInspection(activeVehicle)}>
                    <SearchCode className="w-4 h-4 mr-2" />
                    Start Daily Inspection
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Vehicles</CardTitle>
            <CardDescription>Choose a truck, then start an inspection or diagnosis flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {vehicles.map((vehicle) => {
                const isActive = vehicle.id === activeVehicleId;

                return (
                  <div
                    key={vehicle.id}
                    className={`rounded-xl border p-4 transition-all ${
                      isActive ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Truck className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-slate-500"}`} />
                          <p className="font-semibold text-slate-900">{vehicle.label}</p>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")} <span className="text-slate-400">({vehicle.type})</span>
                        </p>
                        <p className="text-xs text-slate-500">{vehicle.licensePlate}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isActive && (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            Current
                          </span>
                        )}
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {vehicle.status}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      <Button
                        variant={isActive ? "default" : "outline"}
                        className="flex-1"
                        onClick={() => startInspection(vehicle)}
                      >
                        Inspect
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => startDiagnosis(vehicle)}>
                        Diagnose
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest inspections and driver-reported issues</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-3">
                    {activity.type === "inspection" ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium text-slate-900">{activity.title}</p>
                      <p className="text-xs text-slate-500">{activity.detail}</p>
                    </div>
                  </div>
                  {activity.type === "inspection" && activity.report ? (
                    <Button variant="outline" size="sm" onClick={() => setSelectedReport(activity.report ?? null)}>
                      <Eye className="w-4 h-4 mr-2" />
                      View Report
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {isOwnerOperator && <Button className="h-12 bg-slate-900 hover:bg-slate-800" onClick={() => setIsAddVehicleOpen(true)}>
                Add Vehicle
              </Button>}
              <Button variant="outline" className="h-12" onClick={() => startDiagnosis(activeVehicle)}>
                Start Diagnosis
              </Button>
              <Button variant="outline" className="h-12" onClick={() => startInspection(activeVehicle)}>
                Start Daily Inspection
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={Boolean(selectedReport)} onOpenChange={(open) => (!open ? setSelectedReport(null) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedReport?.title ?? "Inspection Report"}</DialogTitle>
              <DialogDescription>{selectedReport?.completedAt}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-medium text-slate-900">{selectedReport?.summary}</p>
              </div>
              <div className="space-y-2">
                {selectedReport?.findings.map((finding) => (
                  <div key={finding} className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                    {finding}
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setSelectedReport(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

export default function DriverDashboard() {
  return (
    <RoleBasedRoute requiredRoles={["driver", "owner_operator", "owner", "manager"]}>
      <DriverDashboardContent />
    </RoleBasedRoute>
  );
}
