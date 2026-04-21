import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import MorningFleetSummary from "@/components/MorningFleetSummary";
import VehicleCaptureFlow, { type VehicleCaptureDraft } from "@/components/VehicleCaptureFlow";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";
import { getFallbackUnitNumber, getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CarFront, ChevronRight, Clock3, LogOut, Plus, Search, Truck, Users, Wrench } from "lucide-react";

type DashboardRow = {
  id: number;
  truck: string;
  detail: string;
  assignedDriver: string;
  status: "Operational" | "In Shop" | "Dispatch Hold";
  inspection: "Complete" | "Due Today" | "Overdue";
  priority: "Low" | "High" | "Critical";
  issue: string;
};

function badgeClasses(value: string) {
  switch (value) {
    case "Operational":
    case "Complete":
    case "Low":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "Due Today":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "High":
    case "In Shop":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "Critical":
    case "Overdue":
    case "Dispatch Hold":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function mapVehicleRow(vehicle: any, driverName: string): DashboardRow {
  const priority =
    vehicle.complianceStatus === "red"
      ? "Critical"
      : vehicle.complianceStatus === "yellow"
        ? "High"
        : "Low";

  return {
    id: vehicle.id,
    truck: getVehicleDisplayLabel({
      label: vehicle.unitNumber,
      vin: vehicle.vin,
      vehicleId: vehicle.id,
    }),
    detail: [vehicle.make, vehicle.model, vehicle.engineMake, vehicle.licensePlate].filter(Boolean).join(" | ") || vehicle.vin,
    assignedDriver: driverName,
    status:
      vehicle.status === "maintenance"
        ? "In Shop"
        : vehicle.status === "retired"
          ? "Dispatch Hold"
          : "Operational",
    inspection:
      vehicle.complianceStatus === "red"
        ? "Overdue"
        : vehicle.complianceStatus === "yellow"
          ? "Due Today"
          : "Complete",
    priority,
    issue:
      vehicle.complianceStatus === "red"
        ? "Compliance issue requires action"
        : vehicle.complianceStatus === "yellow"
          ? "Inspection attention needed"
          : "No active defects",
  };
}

function ManagerDashboardFixedContent() {
  const { user, logout } = useAuthContext();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const fleetId = subscriptionQuery.data?.activeFleetId ?? 1;
  const [search, setSearch] = useState("");
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [vehicleCaptureInitialStep, setVehicleCaptureInitialStep] = useState<"entry" | "manual" | "scan_source">("entry");
  const [driverMode, setDriverMode] = useState<"existing" | "invite">("existing");
  const [vehicleForm, setVehicleForm] = useState({
    assignedDriverId: "",
  });
  const [invitedDriverForm, setInvitedDriverForm] = useState({
    name: "",
    email: "",
  });

  const initials = useMemo(() => {
    const name = user?.name?.trim() || "Manager";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [user?.name]);

  const driversQuery = trpc.auth.listManagedDrivers.useQuery();
  const vehiclesQuery = trpc.vehicles.listByFleet.useQuery({ fleetId });
  const managerActionQueueQuery = trpc.diagnostics.getManagerActionQueue.useQuery({
    fleetId,
    limit: 5,
  });
  const createVehicleMutation = trpc.vehicles.create.useMutation({
    onSuccess: async () => {
      await utils.vehicles.listByFleet.invalidate({ fleetId });
      await vehiclesQuery.refetch();
    },
  });
  const inviteDriverMutation = trpc.auth.createManagedDriverInvite.useMutation({
    onSuccess: async () => {
      await utils.auth.listManagedDrivers.invalidate();
      await driversQuery.refetch();
    },
  });

  const drivers = driversQuery.data ?? [];
  const driverMap = useMemo(
    () =>
      new Map(
        drivers.map((driver) => [
          driver.id,
          driver.name?.trim() || driver.email?.trim() || `Driver ${driver.id}`,
        ])
      ),
    [drivers]
  );

  const rows = useMemo(() => {
    const liveVehicles = vehiclesQuery.data ?? [];
    const mapped =
      liveVehicles.length > 0
        ? liveVehicles.map((vehicle) =>
            mapVehicleRow(
              vehicle,
              vehicle.assignedDriverId ? driverMap.get(vehicle.assignedDriverId) || "No driver assigned" : "No driver assigned"
            )
          )
        : [
            {
              id: 42,
              truck: "Truck 42",
              detail: "Peterbilt 579 | ABC-1234",
              assignedDriver: "No driver assigned",
              status: "Dispatch Hold" as const,
              inspection: "Overdue" as const,
              priority: "Critical" as const,
              issue: "Manager dashboard was in demo mode",
            },
          ];

    const q = search.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter((row) =>
      [row.truck, row.detail, row.assignedDriver, row.issue].some((value) =>
        value.toLowerCase().includes(q)
      )
    );
  }, [driverMap, search, vehiclesQuery.data]);
  const pilotAccess = subscriptionQuery.data?.pilotAccess ?? null;
  const managerActionItems = managerActionQueueQuery.data ?? [];

  const selectedDriver = drivers.find((driver) => String(driver.id) === vehicleForm.assignedDriverId);

  const openAddVehicleDialog = (mode: "existing" | "invite" = "existing") => {
    setVehicleCaptureInitialStep("entry");
    setDriverMode(mode);
    setIsAddVehicleOpen(true);
  };

  const resetVehicleDialog = () => {
    setVehicleForm({
      assignedDriverId: "",
    });
    setInvitedDriverForm({
      name: "",
      email: "",
    });
    setDriverMode(drivers.length > 0 ? "existing" : "invite");
  };

  const handleAddVehicle = async (draft: VehicleCaptureDraft) => {
    if (draft.vin.trim().length !== 17) {
      throw new Error("VIN must be exactly 17 characters.");
    }

    try {
      let assignedDriverId = vehicleForm.assignedDriverId;
      let assignedDriverLabel =
        selectedDriver?.name || selectedDriver?.email || "the assigned driver";
      let inviteMessage: string | null = null;

      if (driverMode === "invite") {
        if (!invitedDriverForm.name.trim()) {
          throw new Error("Enter the driver's name before sending the invite.");
        }
        if (!invitedDriverForm.email.trim()) {
          throw new Error("Enter the driver's email before sending the invite.");
        }

        const inviteResult = await inviteDriverMutation.mutateAsync({
          name: invitedDriverForm.name.trim(),
          email: invitedDriverForm.email.trim(),
        });

        assignedDriverId = String(inviteResult.driver.id);
        assignedDriverLabel =
          inviteResult.driver.name?.trim() || inviteResult.driver.email || assignedDriverLabel;
        inviteMessage = inviteResult.invitation.message;
      } else if (!assignedDriverId) {
        throw new Error("Select an existing driver or switch to invite a new one.");
      }

      const createdVehicle = await createVehicleMutation.mutateAsync({
        fleetId,
        assignedDriverId: Number(assignedDriverId),
        unitNumber: draft.label.trim() || getFallbackUnitNumber(draft.vin),
        vin: draft.vin.trim().toUpperCase(),
        licensePlate: draft.licensePlate.trim() || undefined,
        make: draft.make.trim() || undefined,
        engineMake: draft.engineMake.trim() || undefined,
        model: draft.model.trim() || undefined,
        year: draft.year.trim() ? Number(draft.year.trim()) : undefined,
      });
      toast.success(
        `${draft.make.trim() || "Vehicle"} ${draft.model.trim() || ""}`.trim() + ` added for ${assignedDriverLabel}.`
      );
      if (inviteMessage) {
        toast.message(inviteMessage);
      }
      resetVehicleDialog();
      return {
        id: createdVehicle.id,
        fleetId: createdVehicle.fleetId,
        label: getVehicleDisplayLabel({
          label: createdVehicle.unitNumber ?? draft.label,
          vin: createdVehicle.vin,
          vehicleId: createdVehicle.id,
        }),
        vin: createdVehicle.vin,
        licensePlate: createdVehicle.licensePlate?.trim() || "UNKNOWN",
        make: createdVehicle.make?.trim() || draft.make.trim() || "Truck",
        engineMake: createdVehicle.engineMake?.trim() || draft.engineMake.trim(),
        model: createdVehicle.model?.trim() || draft.model.trim() || "Unit",
        year:
          typeof createdVehicle.year === "number"
            ? createdVehicle.year
            : draft.year.trim()
              ? Number(draft.year.trim())
              : null,
        mileage: 0,
        status: "Operational" as const,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Failed to add vehicle");
    }
  };

  return (
    <div className="app-shell min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-start gap-4">
            <AppLogo imageClassName="h-10" frameClassName="p-1.5" href="/" />
            <div>
            <p className="section-label">Manager dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Fleet operations center</h1>
            <p className="mt-2 text-sm text-slate-600">Manager actions now open real routes and the dashboard can add vehicles with required driver assignment.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search trucks, plates, drivers, issues"
                className="h-10 rounded-full border-slate-200 bg-white pl-9 shadow-sm"
              />
            </div>
            <Button variant="outline" className="rounded-full border-slate-200 bg-white" onClick={() => window.print()}>
              Export morning brief
            </Button>
            <Dialog
              open={isAddVehicleOpen}
              onOpenChange={(open) => {
                setIsAddVehicleOpen(open);
                if (open) {
                  setVehicleCaptureInitialStep("entry");
                  setDriverMode(drivers.length > 0 ? "existing" : "invite");
                } else {
                  resetVehicleDialog();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="rounded-full bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Add vehicle
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[24px] border-slate-200 sm:max-w-xl">
                <VehicleCaptureFlow
                  fleetId={fleetId}
                  source="vehicles"
                  initialStep={vehicleCaptureInitialStep}
                  saveButtonLabel="Save vehicle"
                  onCancel={() => {
                    setIsAddVehicleOpen(false);
                    resetVehicleDialog();
                  }}
                  onSaveDraft={handleAddVehicle}
                  renderReviewExtras={() => (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="manager-driver">Assigned driver</Label>
                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                          <Button
                            type="button"
                            variant={driverMode === "existing" ? "default" : "ghost"}
                            className="rounded-xl"
                            onClick={() => setDriverMode("existing")}
                          >
                            Select existing
                          </Button>
                          <Button
                            type="button"
                            variant={driverMode === "invite" ? "default" : "ghost"}
                            className="rounded-xl"
                            onClick={() => setDriverMode("invite")}
                          >
                            Invite new driver
                          </Button>
                        </div>
                        {driverMode === "existing" ? (
                          <div className="mt-3">
                            <Select
                              value={vehicleForm.assignedDriverId}
                              onValueChange={(value) =>
                                setVehicleForm((current) => ({ ...current, assignedDriverId: value }))
                              }
                            >
                              <SelectTrigger id="manager-driver" className="h-11 rounded-xl">
                                <SelectValue placeholder={drivers.length > 0 ? "Select a driver" : "No linked drivers available"} />
                              </SelectTrigger>
                              <SelectContent>
                                {drivers.map((driver) => (
                                  <SelectItem key={driver.id} value={String(driver.id)}>
                                    {driver.name?.trim() || driver.email || `Driver ${driver.id}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-4 sm:grid-cols-2">
                            <div>
                              <Label htmlFor="manager-driver-name">Driver name</Label>
                              <Input
                                id="manager-driver-name"
                                value={invitedDriverForm.name}
                                onChange={(event) =>
                                  setInvitedDriverForm((current) => ({ ...current, name: event.target.value }))
                                }
                                placeholder="Dixon K"
                                className="mt-2 h-11 rounded-xl"
                              />
                            </div>
                            <div>
                              <Label htmlFor="manager-driver-email">Driver email</Label>
                              <Input
                                id="manager-driver-email"
                                type="email"
                                value={invitedDriverForm.email}
                                onChange={(event) =>
                                  setInvitedDriverForm((current) => ({ ...current, email: event.target.value }))
                                }
                                placeholder="driver@fleet.com"
                                className="mt-2 h-11 rounded-xl"
                              />
                            </div>
                          </div>
                        )}
                        <p className="mt-2 text-xs text-slate-500">
                          {driverMode === "existing"
                            ? drivers.length > 0
                              ? "The assigned driver will own inspections and be linked to this truck."
                              : "No linked drivers yet. Switch to 'Invite new driver' to create one inline."
                            : "TruckFixr will create or link the driver by email, send an invite when email is configured, and then assign the truck immediately."}
                        </p>
                      </div>
                    </div>
                  )}
                  onSaved={() => {
                    setIsAddVehicleOpen(false);
                    resetVehicleDialog();
                  }}
                />
              </DialogContent>
            </Dialog>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-full border-slate-200 bg-white px-2">
                  <Avatar className="h-7 w-7 border border-slate-200">
                    <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl border-slate-200 p-2">
                <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/profile")}>Profile settings</DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => openAddVehicleDialog("existing")}>Add vehicle & assign driver</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-xl text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-3">
          {pilotAccess?.status === "active" ? (
            <Card className="metric-card border-0">
              <CardHeader className="pb-3">
                <CardDescription>Pilot Access</CardDescription>
                <CardTitle className="text-2xl font-semibold text-slate-950">Pilot Access Active</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                <p>Expires {new Date(pilotAccess.expiresAt).toLocaleDateString()}</p>
                <p className="mt-1">Vehicles used: {pilotAccess.vehiclesUsed} / {pilotAccess.maxVehicles}</p>
                <p className="mt-1">Users enabled: {pilotAccess.usersUsed} / {pilotAccess.maxUsers}</p>
                <Button variant="outline" className="mt-4 w-full rounded-xl" onClick={() => navigate("/profile")}>
                  Upgrade plan
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Vehicles in fleet</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">{rows.length}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">Live fleet list with driver assignment.</CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Linked drivers</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">{drivers.length}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">Drivers available to assign to vehicles.</CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Action shortcuts</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">Live</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">Profile, maintenance queue, truck details, and add vehicle actions now respond.</CardContent>
          </Card>
        </section>

        <section>
          <MorningFleetSummary fleetId={fleetId} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="saas-card p-0">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Fleet operations</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Vehicles and assigned drivers</h2>
                <p className="mt-2 text-sm text-slate-600">Each vehicle row now has a working detail link, and new vehicles must be assigned to a driver.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="rounded-full border-slate-200 bg-white" onClick={() => navigate("/defect/1")}>
                  <Wrench className="mr-2 h-4 w-4" />
                  Open queue
                </Button>
                <Button className="rounded-full bg-blue-600 text-white hover:bg-blue-700" onClick={() => openAddVehicleDialog("existing")}>
                  <CarFront className="mr-2 h-4 w-4" />
                  Add vehicle
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    {["Truck", "Status", "Inspection", "Assigned Driver", "Issue", "Priority", "Action"].map((heading) => (
                      <th key={heading} className="px-7 py-4 font-medium">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200/80">
                      <td className="px-7 py-5 align-top">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-950">{row.truck}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">{row.detail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-7 py-5 align-top"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.status)}`}>{row.status}</span></td>
                      <td className="px-7 py-5 align-top"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.inspection)}`}>{row.inspection}</span></td>
                      <td className="px-7 py-5 align-top text-slate-600">{row.assignedDriver}</td>
                      <td className="px-7 py-5 align-top text-slate-600">{row.issue}</td>
                      <td className="px-7 py-5 align-top"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.priority)}`}>{row.priority}</span></td>
                      <td className="px-7 py-5 align-top">
                        <Button variant="ghost" size="sm" className="rounded-full text-blue-700 hover:bg-blue-50" onClick={() => navigate(`/truck/${row.id}`)}>
                          View details
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="saas-card">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-slate-950">
                      <Users className="h-5 w-5 text-blue-600" />
                      Linked drivers
                    </CardTitle>
                    <CardDescription>
                      Invite drivers into TruckFixr or assign linked drivers to a vehicle.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => navigate("/profile")}
                    >
                      Invite driver
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => openAddVehicleDialog("existing")}
                    >
                      Add vehicle
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {drivers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No linked drivers yet. Invite a driver from Settings, then assign them to a vehicle.
                  </div>
                ) : (
                  drivers.slice(0, 5).map((driver) => (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-950">
                          {driver.name?.trim() || driver.email || `Driver ${driver.id}`}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{driver.email || "No email available"}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => openAddVehicleDialog("existing")}
                      >
                        Assign driver
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="saas-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Needs manager action
                </CardTitle>
                <CardDescription>
                  Completed driver diagnoses that were shared to your queue for follow-up.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {managerActionQueueQuery.isLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Loading manager action queue...
                  </div>
                ) : managerActionItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No diagnosis summaries are waiting on manager follow-up right now.
                  </div>
                ) : (
                  managerActionItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{item.truckLabel}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {[item.truckDetail, item.driverName].filter(Boolean).join(" | ")}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {item.riskLevel ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(item.riskLevel === "high" ? "Critical" : item.riskLevel === "medium" ? "High" : "Low")}`}>
                              {item.riskLevel} risk
                            </span>
                          ) : null}
                          {item.confidenceScore !== null ? (
                            <span className="text-xs font-medium text-slate-500">
                              {item.confidenceScore}% confidence
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-700">
                        <p>{item.possibleCause || item.summary}</p>
                        {item.symptoms.length > 0 ? (
                          <p>
                            <span className="font-medium text-slate-900">Symptoms:</span>{" "}
                            {item.symptoms.join(", ")}
                          </p>
                        ) : null}
                        {item.recommendedFix ? (
                          <p>
                            <span className="font-medium text-slate-900">Recommended fix:</span>{" "}
                            {item.recommendedFix}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(item.createdAt).toLocaleString()}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => navigate(`/defect/${item.defectId ?? 1}`)}
                        >
                          Review action
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="saas-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <Users className="h-5 w-5 text-blue-600" />
                  Manager actions
                </CardTitle>
                <CardDescription>These links now perform real actions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => navigate("/profile")}>Profile settings</Button>
                <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => openAddVehicleDialog("existing")}>Add vehicle & assign driver</Button>
                <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => navigate("/defect/1")}>Open maintenance queue</Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ManagerDashboardFixed() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <ManagerDashboardFixedContent />
    </RoleBasedRoute>
  );
}
