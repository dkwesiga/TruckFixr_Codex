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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Camera, CarFront, ChevronRight, Clock3, LogOut, MapPin, Plus, Search, ShieldCheck, Truck, Users, Wrench } from "lucide-react";

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

function formatDefectDescription(value: string | null | undefined) {
  const description = value?.trim();
  if (!description) return "No additional defect details were provided.";

  if (!description.startsWith("{")) {
    return description;
  }

  try {
    const parsed = JSON.parse(description) as {
      driverNotes?: string;
      symptoms?: string[];
      faultCodes?: string[];
      output?: {
        top_most_likely_cause?: string;
        recommended_fix?: string;
      };
    };

    const segments: string[] = [];

    if (Array.isArray(parsed.symptoms) && parsed.symptoms.length > 0) {
      segments.push(parsed.symptoms.join(", "));
    }

    if (parsed.driverNotes?.trim()) {
      segments.push(parsed.driverNotes.trim());
    }

    if (Array.isArray(parsed.faultCodes) && parsed.faultCodes.length > 0) {
      segments.push(`Codes: ${parsed.faultCodes.join(", ")}`);
    }

    if (parsed.output?.top_most_likely_cause?.trim()) {
      segments.push(`Likely cause: ${parsed.output.top_most_likely_cause.trim()}`);
    }

    if (parsed.output?.recommended_fix?.trim()) {
      segments.push(`Recommended fix: ${parsed.output.recommended_fix.trim()}`);
    }

    return segments[0] ?? "Diagnostic context was captured for this defect.";
  } catch {
    return description;
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
  const [selectedAccessVehicleId, setSelectedAccessVehicleId] = useState<number | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    driverUserId: "",
    accessType: "permanent" as "permanent" | "temporary",
    expiresAt: "",
    notes: "",
  });
  const [assignmentDriverMode, setAssignmentDriverMode] = useState<"existing" | "invite">("existing");
  const [assignmentInviteForm, setAssignmentInviteForm] = useState({
    name: "",
    email: "",
  });
  const [requestActionNote, setRequestActionNote] = useState("");

  const initials = useMemo(() => {
    const name = user?.name?.trim() || "Manager";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [user?.name]);

  const driversQuery = trpc.vehicleAccess.listFleetDrivers.useQuery({ fleetId });
  const vehiclesQuery = trpc.vehicles.listByFleet.useQuery({ fleetId });
  const pendingAccessRequestsQuery = trpc.vehicleAccess.listPendingRequests.useQuery(
    { fleetId },
    { staleTime: 15_000 }
  );
  const selectedVehicleAccessQuery = trpc.vehicleAccess.listVehicleAccess.useQuery(
    {
      fleetId,
      vehicleId: selectedAccessVehicleId ?? 0,
    },
    {
      enabled: Boolean(selectedAccessVehicleId),
      staleTime: 10_000,
    }
  );
  const managerActionQueueQuery = trpc.diagnostics.getManagerActionQueue.useQuery({
    fleetId,
    limit: 5,
  });
  const verifiedHealthQuery = trpc.inspections.getFleetDailyHealth.useQuery(
    { fleetId },
    { staleTime: 30_000 }
  );
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
  const assignVehicleAccessMutation = trpc.vehicleAccess.assignDriverAccess.useMutation({
    onSuccess: async () => {
      await utils.vehicleAccess.listVehicleAccess.invalidate();
      await utils.vehicleAccess.listPendingRequests.invalidate({ fleetId });
      await utils.vehicles.listByFleet.invalidate({ fleetId });
      toast.success("Driver access updated");
    },
  });
  const revokeVehicleAccessMutation = trpc.vehicleAccess.revokeDriverAccess.useMutation({
    onSuccess: async () => {
      await utils.vehicleAccess.listVehicleAccess.invalidate();
      toast.success("Driver access removed");
    },
  });
  const approveAccessRequestMutation = trpc.vehicleAccess.approveAccessRequest.useMutation({
    onSuccess: async () => {
      await utils.vehicleAccess.listPendingRequests.invalidate({ fleetId });
      await utils.vehicleAccess.listVehicleAccess.invalidate();
      await utils.vehicles.listByFleet.invalidate({ fleetId });
      toast.success("Vehicle access request approved");
    },
  });
  const denyAccessRequestMutation = trpc.vehicleAccess.denyAccessRequest.useMutation({
    onSuccess: async () => {
      await utils.vehicleAccess.listPendingRequests.invalidate({ fleetId });
      await utils.vehicleAccess.listVehicleAccess.invalidate();
      toast.success("Vehicle access request denied");
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
  const verifiedHealth = verifiedHealthQuery.data;
  const pendingAccessRequests = pendingAccessRequestsQuery.data ?? [];
  const selectedVehicleAccess = selectedVehicleAccessQuery.data;

  const openAddVehicleDialog = () => {
    setVehicleCaptureInitialStep("entry");
    setIsAddVehicleOpen(true);
  };

  const resetVehicleDialog = () => {};

  const openVehicleAccessDialog = (vehicleId: number) => {
    setSelectedAccessVehicleId(vehicleId);
    setAssignmentForm({
      driverUserId: "",
      accessType: "permanent",
      expiresAt: "",
      notes: "",
    });
    setAssignmentDriverMode(drivers.length > 0 ? "existing" : "invite");
    setAssignmentInviteForm({
      name: "",
      email: "",
    });
    setRequestActionNote("");
  };

  const selectedVehicleRow = (vehiclesQuery.data ?? []).find(
    (vehicle) => vehicle.id === selectedAccessVehicleId
  );

  const handleAddVehicle = async (draft: VehicleCaptureDraft) => {
    if (draft.vin.trim().length !== 17) {
      throw new Error("VIN must be exactly 17 characters.");
    }

    try {
      const createdVehicle = await createVehicleMutation.mutateAsync({
        fleetId,
        unitNumber: draft.label.trim() || getFallbackUnitNumber(draft.vin),
        vin: draft.vin.trim().toUpperCase(),
        licensePlate: draft.licensePlate.trim() || undefined,
        make: draft.make.trim() || undefined,
        engineMake: draft.engineMake.trim() || undefined,
        model: draft.model.trim() || undefined,
        year: draft.year.trim() ? Number(draft.year.trim()) : undefined,
      });

      const vehicleLabel = getVehicleDisplayLabel({
        label: createdVehicle.unitNumber ?? draft.label,
        vin: createdVehicle.vin,
        vehicleId: createdVehicle.id,
      });

      toast.success(`${vehicleLabel} created.`, {
        description: "Step 2 is optional: assign a driver now or later from Vehicle Access.",
        action: {
          label: "Assign driver",
          onClick: () => openVehicleAccessDialog(createdVehicle.id),
        },
      });
      resetVehicleDialog();
      return {
        id: createdVehicle.id,
        fleetId: createdVehicle.fleetId,
        label: vehicleLabel,
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

  const handleAssignVehicleAccess = async () => {
    if (!selectedAccessVehicleId) return;

    let driverUserId = assignmentForm.driverUserId;

    if (assignmentDriverMode === "invite") {
      if (!assignmentInviteForm.name.trim()) {
        toast.error("Enter the driver's name.");
        return;
      }

      if (!assignmentInviteForm.email.trim()) {
        toast.error("Enter the driver's email.");
        return;
      }

      const inviteResult = await inviteDriverMutation.mutateAsync({
        name: assignmentInviteForm.name.trim(),
        email: assignmentInviteForm.email.trim(),
      });

      driverUserId = String(inviteResult.driver.id);
      toast.message(inviteResult.invitation.message);
    } else if (!driverUserId) {
      toast.error("Select a driver to assign.");
      return;
    }

    await assignVehicleAccessMutation.mutateAsync({
      fleetId,
      vehicleId: selectedAccessVehicleId,
      driverUserId: Number(driverUserId),
      accessType: assignmentForm.accessType,
      expiresAt: assignmentForm.accessType === "temporary" ? assignmentForm.expiresAt : undefined,
      notes: assignmentForm.notes.trim() || undefined,
    });
    await selectedVehicleAccessQuery.refetch();
    setAssignmentForm((current) => ({
      ...current,
      driverUserId: "",
      expiresAt: "",
      notes: "",
      accessType: "permanent",
    }));
    setAssignmentInviteForm({
      name: "",
      email: "",
    });
  };

  return (
    <div className="app-shell min-h-screen">
      <header className="border-b border-[var(--fleet-outline)] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-start gap-4">
            <AppLogo imageClassName="h-10" frameClassName="p-1.5" href="/" />
            <div>
            <p className="section-label">Manager dashboard</p>
            <h1 className="fleet-page-title mt-2 text-3xl font-semibold tracking-tight">Fleet operations center</h1>
            <p className="mt-2 text-sm text-[var(--fleet-muted)]">Manager actions now open real routes and the dashboard can add vehicles with required driver assignment.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fleet-muted)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search trucks, plates, drivers, issues"
                className="h-10 rounded-full border-[var(--fleet-outline)] bg-white pl-9 shadow-sm"
              />
            </div>
            <Button variant="outline" className="rounded-full border-[var(--fleet-outline)] bg-white" onClick={() => window.print()}>
              Export morning brief
            </Button>
            <Dialog
              open={isAddVehicleOpen}
              onOpenChange={(open) => {
                setIsAddVehicleOpen(open);
                if (open) {
                  setVehicleCaptureInitialStep("entry");
                } else {
                  resetVehicleDialog();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="fleet-primary-btn rounded-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add vehicle
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-[24px] border-[var(--fleet-outline)] sm:max-w-xl">
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
                      <div className="rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] px-4 py-4">
                        <p className="font-['Manrope'] text-sm font-semibold text-[var(--fleet-ink)]">
                          Step 2: Assign a driver
                        </p>
                        <p className="mt-2 text-sm text-[var(--fleet-muted)]">
                          Driver assignment is optional and happens after the vehicle is created.
                          Once this truck is saved, you can assign a driver from Vehicle Access right away or later.
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
                <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => openAddVehicleDialog()}>Add vehicle</DropdownMenuItem>
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

        <section className="grid gap-4 lg:grid-cols-4">
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Inspected today</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.today.inspectedVehicles ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              {verifiedHealth?.today.completionRate ?? 0}% completion rate.
            </CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Missed inspections</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.today.missedInspections ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">Vehicles not inspected today.</CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Open defects</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.openDefects.length ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">Known issues remain visible until resolved.</CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Integrity score</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.averages.fleetIntegrityScore ?? 100}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">Average verified inspection score.</CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="saas-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Daily vehicle health
              </CardTitle>
              <CardDescription>
                Verified daily status combines inspection completion, open defects, photo proof, location proof, and flags.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(verifiedHealth?.vehicles ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No verified inspections yet today.
                </div>
              ) : (
                verifiedHealth?.vehicles.map((vehicle) => (
                  <div key={vehicle.vehicleId} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">{vehicle.unit}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {vehicle.openDefects} open defects | Integrity {vehicle.integrityScore ?? "N/A"}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          Driver:{" "}
                          <span className="font-medium text-slate-900">
                            {vehicle.assignedDriverName ?? "No driver assigned"}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-col items-start gap-2 sm:items-end">
                        <span
                          className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                            vehicle.status === "safe"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : vehicle.status === "attention"
                                ? "bg-amber-50 text-amber-700 ring-amber-200"
                                : vehicle.status === "critical"
                                  ? "bg-red-50 text-red-700 ring-red-200"
                                  : "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {vehicle.status.replace("_", " ")}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full border-slate-200 bg-white"
                          onClick={() => openVehicleAccessDialog(vehicle.vehicleId)}
                        >
                          {vehicle.assignedDriverName ? "Change driver" : "Assign driver"}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                        <MapPin className="h-3.5 w-3.5" />
                        Location {vehicle.locationProofCaptured ? "captured" : "missing"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                        <Camera className="h-3.5 w-3.5" />
                        Photo proof {vehicle.photoProofSubmitted ? "submitted" : "missing"}
                      </span>
                      {vehicle.latestAiRecommendation ? (
                        <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                          AI: {vehicle.latestAiRecommendation}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="saas-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Inspection integrity alerts
              </CardTitle>
              <CardDescription>Fast inspections, skipped proof, missing photos, and missing location proof.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(verifiedHealth?.integrityAlerts ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No integrity alerts are waiting for review.
                </div>
              ) : (
                verifiedHealth?.integrityAlerts.slice(0, 8).map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <p className="font-semibold text-slate-950">{alert.flagType.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-400">
                      {alert.severity}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card className="saas-card">
            <CardHeader>
              <CardTitle className="text-slate-950">Open defects</CardTitle>
              <CardDescription>Review, monitor, repair, or resolve driver-reported defects.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(verifiedHealth?.openDefects ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No open defects.
                </div>
              ) : (
                verifiedHealth?.openDefects.slice(0, 8).map((defect) => (
                  <div key={defect.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{defect.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatDefectDescription(defect.description)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(defect.severity === "critical" ? "Critical" : defect.severity === "moderate" || defect.severity === "medium" ? "High" : "Low")}`}>
                        {defect.severity}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      AI recommendation: {defect.aiRecommendation ?? "Manager review pending"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate(`/defect/${defect.id}`)}>
                        Review
                      </Button>
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate(`/defect/${defect.id}`)}>
                        Create repair action
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="saas-card">
            <CardHeader>
              <CardTitle className="text-slate-950">Inspection quality averages</CardTitle>
              <CardDescription>Simple MVP integrity scoring by vehicle and driver.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">By vehicle</p>
                <div className="mt-2 space-y-2">
                  {(verifiedHealth?.averages.byVehicle ?? []).slice(0, 6).map((item) => (
                    <div key={item.vehicleId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span>{item.unit}</span>
                      <span className="font-semibold text-slate-950">{item.score}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">By driver</p>
                <div className="mt-2 space-y-2">
                  {(verifiedHealth?.averages.byDriver ?? []).slice(0, 6).map((item) => (
                    <div key={item.driverId} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span>Driver {item.driverId}</span>
                      <span className="font-semibold text-slate-950">{item.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
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
                <p className="mt-2 text-sm text-slate-600">Create the vehicle first, then optionally assign driver access from Vehicle Access.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="rounded-full border-slate-200 bg-white" onClick={() => navigate("/defect/1")}>
                  <Wrench className="mr-2 h-4 w-4" />
                  Open queue
                </Button>
                <Button className="fleet-primary-btn rounded-full" onClick={() => openAddVehicleDialog()}>
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
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" className="rounded-full text-blue-700 hover:bg-blue-50" onClick={() => navigate(`/truck/${row.id}`)}>
                            View details
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-slate-200 bg-white"
                            onClick={() => openVehicleAccessDialog(row.id)}
                          >
                            Vehicle Access
                          </Button>
                        </div>
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
                      className="fleet-primary-btn rounded-xl"
                      onClick={() => openAddVehicleDialog()}
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
                      onClick={() => openAddVehicleDialog()}
                    >
                      Add vehicle
                    </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="saas-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  Vehicle Access
                </CardTitle>
                <CardDescription>
                  Assign permanent or temporary vehicle/trailer access and review pending driver requests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingAccessRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No vehicle access requests are pending.
                  </div>
                ) : (
                  pendingAccessRequests.slice(0, 5).map((request) => (
                    <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {request.vehicle?.unitNumber ||
                              request.vehicle?.licensePlate ||
                              request.requestedVehicleIdentifier ||
                              "Vehicle request"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {request.driver?.name || request.driver?.email || `Driver ${request.requestedByDriverId}`} | {request.reason.replaceAll("_", " ")}
                          </p>
                        </div>
                        {request.urgent ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                            Urgent
                          </span>
                        ) : null}
                      </div>
                      {request.note ? (
                        <p className="mt-3 text-sm text-slate-700">{request.note}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() =>
                            void approveAccessRequestMutation.mutateAsync({
                              requestId: request.id,
                              accessType: "permanent",
                              managerNote: requestActionNote.trim() || undefined,
                            })
                          }
                        >
                          Approve permanent
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() =>
                            void approveAccessRequestMutation.mutateAsync({
                              requestId: request.id,
                              accessType: "temporary",
                              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                              managerNote: requestActionNote.trim() || undefined,
                            })
                          }
                        >
                          Approve 24h
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() =>
                            void denyAccessRequestMutation.mutateAsync({
                              requestId: request.id,
                              managerNote: requestActionNote.trim() || undefined,
                            })
                          }
                        >
                          Deny
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                <Textarea
                  value={requestActionNote}
                  onChange={(event) => setRequestActionNote(event.target.value)}
                  placeholder="Optional manager note for approve/deny actions"
                  className="min-h-24"
                />
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
                <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => openAddVehicleDialog()}>Add vehicle</Button>
                <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => navigate("/defect/1")}>Open maintenance queue</Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Dialog
          open={Boolean(selectedAccessVehicleId)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedAccessVehicleId(null);
              setRequestActionNote("");
            }
          }}
        >
          <DialogContent className="rounded-[24px] border-slate-200 sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Vehicle Access</DialogTitle>
              <DialogDescription>
                {selectedVehicleRow
                  ? `Manage driver access for ${selectedVehicleRow.unitNumber || selectedVehicleRow.licensePlate || selectedVehicleRow.vin}.`
                  : "Manage driver access assignments and requests."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_160px_1fr]">
                <div>
                  <Label htmlFor="access-driver">Driver</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] p-1">
                    <Button
                      type="button"
                      variant={assignmentDriverMode === "existing" ? "default" : "ghost"}
                      className="rounded-xl"
                      onClick={() => setAssignmentDriverMode("existing")}
                    >
                      Select existing
                    </Button>
                    <Button
                      type="button"
                      variant={assignmentDriverMode === "invite" ? "default" : "ghost"}
                      className="rounded-xl"
                      onClick={() => setAssignmentDriverMode("invite")}
                    >
                      Add driver
                    </Button>
                  </div>

                  {assignmentDriverMode === "existing" ? (
                    <>
                      <Select
                        value={assignmentForm.driverUserId}
                        onValueChange={(value) =>
                          setAssignmentForm((current) => ({ ...current, driverUserId: value }))
                        }
                      >
                        <SelectTrigger id="access-driver" className="mt-3 h-11 rounded-xl">
                          <SelectValue placeholder={drivers.length > 0 ? "Select driver" : "No linked drivers yet"} />
                        </SelectTrigger>
                        <SelectContent>
                          {drivers.map((driver) => (
                            <SelectItem key={driver.id} value={String(driver.id)}>
                              {driver.name?.trim() || driver.email || `Driver ${driver.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {drivers.length === 0 ? (
                        <p className="mt-2 text-xs text-[var(--fleet-muted)]">
                          No linked drivers yet. Use “Add driver” to create or link one by name and email.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--fleet-muted)]">
                          If the driver you need is missing, switch to “Add driver.”
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="access-driver-name">Driver name</Label>
                        <Input
                          id="access-driver-name"
                          value={assignmentInviteForm.name}
                          onChange={(event) =>
                            setAssignmentInviteForm((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Dixon K"
                          className="mt-2 h-11 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label htmlFor="access-driver-email">Driver email</Label>
                        <Input
                          id="access-driver-email"
                          type="email"
                          value={assignmentInviteForm.email}
                          onChange={(event) =>
                            setAssignmentInviteForm((current) => ({ ...current, email: event.target.value }))
                          }
                          placeholder="driver@fleet.com"
                          className="mt-2 h-11 rounded-xl"
                        />
                      </div>
                      <p className="sm:col-span-2 text-xs text-[var(--fleet-muted)]">
                        If this email already exists for a driver, TruckFixr will link and assign that driver. Otherwise it will create the driver record and send an invite when email is configured.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="access-type">Access type</Label>
                  <Select
                    value={assignmentForm.accessType}
                    onValueChange={(value: "permanent" | "temporary") =>
                      setAssignmentForm((current) => ({ ...current, accessType: value }))
                    }
                  >
                    <SelectTrigger id="access-type" className="mt-2 h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="permanent">Permanent</SelectItem>
                      <SelectItem value="temporary">Temporary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="access-expires">Expiry</Label>
                  <Input
                    id="access-expires"
                    type="datetime-local"
                    value={assignmentForm.expiresAt}
                    disabled={assignmentForm.accessType !== "temporary"}
                    onChange={(event) =>
                      setAssignmentForm((current) => ({ ...current, expiresAt: event.target.value }))
                    }
                    className="mt-2 h-11 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="access-notes">Notes</Label>
                <Textarea
                  id="access-notes"
                  value={assignmentForm.notes}
                  onChange={(event) =>
                    setAssignmentForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Optional note for the driver"
                  className="mt-2 min-h-24"
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">Assigned drivers</p>
                <div className="mt-3 space-y-3">
                  {(selectedVehicleAccess?.assignments ?? []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      No driver access assignments yet.
                    </div>
                  ) : (
                    selectedVehicleAccess?.assignments.map((assignment) => (
                      <div key={assignment.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {assignment.driver?.name || assignment.driver?.email || `Driver ${assignment.driverUserId}`}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {assignment.accessType} | {assignment.status}
                            {assignment.expiresAt ? ` | expires ${new Date(assignment.expiresAt).toLocaleString()}` : ""}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() =>
                            void revokeVehicleAccessMutation.mutateAsync({
                              assignmentId: assignment.id,
                              managerNote: "Access revoked by manager",
                            })
                          }
                        >
                          Revoke
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setSelectedAccessVehicleId(null)}>
                Close
              </Button>
              <Button
                className="fleet-primary-btn rounded-xl"
                disabled={assignVehicleAccessMutation.isPending}
                onClick={() => void handleAssignVehicleAccess()}
              >
                {assignVehicleAccessMutation.isPending ? "Saving..." : "Assign driver"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
