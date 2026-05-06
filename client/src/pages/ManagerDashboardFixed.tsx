import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import MorningFleetSummary from "@/components/MorningFleetSummary";
import VehicleCaptureFlow, {
  type VehicleCaptureDraft,
} from "@/components/VehicleCaptureFlow";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";
import {
  getFallbackUnitNumber,
  getVehicleDisplayLabel,
} from "@/lib/vehicleDisplay";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CarFront,
  ChevronRight,
  Clock3,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

type DashboardRow = {
  id: number | string;
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

function formatReportTimestamp(value: unknown) {
  if (!value) return "Submitted inspection";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Submitted inspection";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
      segments.push(
        `Likely cause: ${parsed.output.top_most_likely_cause.trim()}`
      );
    }

    if (parsed.output?.recommended_fix?.trim()) {
      segments.push(`Recommended fix: ${parsed.output.recommended_fix.trim()}`);
    }

    return segments[0] ?? "Diagnostic context was captured for this defect.";
  } catch {
    return description;
  }
}

function mapVehicleRow(vehicle: any, drivers: any[] = []): DashboardRow {
  const priority =
    vehicle.complianceStatus === "red"
      ? "Critical"
      : vehicle.complianceStatus === "yellow"
        ? "High"
        : "Low";

  const driver = drivers.find(d => d.id === vehicle.assignedDriverId);

  return {
    id: vehicle.id,
    truck: getVehicleDisplayLabel({
      label: vehicle.unitNumber,
      vin: vehicle.vin,
      vehicleId: vehicle.id,
    }),
    assignedDriver: driver?.name || "Unassigned",
    detail:
      [vehicle.make, vehicle.model, vehicle.engineMake, vehicle.licensePlate]
        .filter(Boolean)
        .join(" | ") || vehicle.vin,
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
  const { user, logout, isLoading: isAuthLoading } = useAuthContext();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const companyQuery = trpc.company.getCurrent.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const fallbackFleetId =
    typeof (user as any)?.fleetId === "number" && Number.isFinite((user as any).fleetId)
      ? (user as any).fleetId
      : null;
  const companyFleetId =
    typeof companyQuery.data?.company?.id === "number" && Number.isFinite(companyQuery.data.company.id)
      ? companyQuery.data.company.id
      : null;
  const fleetId = subscriptionQuery.data?.activeFleetId ?? companyFleetId ?? fallbackFleetId;
  const resolvedFleetId = typeof fleetId === "number" && fleetId > 0 ? fleetId : null;
  const isFleetContextLoading =
    isAuthLoading ||
    subscriptionQuery.isLoading ||
    companyQuery.isLoading;
  const [search, setSearch] = useState("");
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [vehicleCaptureInitialStep, setVehicleCaptureInitialStep] = useState<
    "entry" | "manual" | "scan_source"
  >("entry");
  const [requestActionNote, setRequestActionNote] = useState("");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assignmentStep, setAssignmentStep] = useState<"form" | "warning">("form");
  const [assignmentWarning, setAssignmentWarning] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
  } | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    vehicleId: null as string | null,
    driverUserId: null as string | null,
    accessType: "permanent" as "permanent" | "temporary",
    expiresAt: "",
    notes: "",
    driverMode: "existing" as "existing" | "invite",
    inviteFirstName: "",
    inviteLastName: "",
    inviteEmail: "",
  });

  const vehiclesQuery = trpc.vehicles.listByFleet.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { enabled: resolvedFleetId != null }
  );
  const managerActionQueueQuery =
    trpc.diagnostics.getManagerActionQueue.useQuery({
      fleetId: resolvedFleetId ?? 0,
      limit: 5,
    }, { enabled: resolvedFleetId != null });
    
  const verifiedHealthQuery = trpc.inspections.getFleetDailyHealth.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { staleTime: 30_000, enabled: resolvedFleetId != null }
  );
  const inspectionReportsQuery = trpc.inspections.getMyReports.useQuery(
    { fleetId: resolvedFleetId ?? 0, limit: 8 },
    { staleTime: 30_000, enabled: resolvedFleetId != null }
  );
  const driversQuery = trpc.vehicleAccess.listFleetDrivers.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { enabled: resolvedFleetId != null }
  );
  const pendingAccessRequestsQuery = trpc.vehicleAccess.listPendingRequests.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { enabled: resolvedFleetId != null }
  );
  
  const selectedAsset = useMemo(() => 
    (vehiclesQuery.data ?? []).find(v => String(v.id) === assignmentForm.vehicleId),
    [vehiclesQuery.data, assignmentForm.vehicleId]
  );
  const selectedDriver = useMemo(
    () =>
      assignmentForm.driverMode === "existing"
        ? (driversQuery.data ?? []).find(d => String(d.id) === assignmentForm.driverUserId) ?? null
        : null,
    [assignmentForm.driverMode, assignmentForm.driverUserId, driversQuery.data]
  );
  const otherDriverAssignments = useMemo(() => {
    if (assignmentForm.driverMode !== "existing" || !assignmentForm.driverUserId) return [];
    return (vehiclesQuery.data ?? []).filter(vehicle => {
      if (String(vehicle.id) === assignmentForm.vehicleId) return false;
      return String(vehicle.assignedDriverId ?? "") === assignmentForm.driverUserId;
    });
  }, [assignmentForm.driverMode, assignmentForm.driverUserId, assignmentForm.vehicleId, vehiclesQuery.data]);

  const initials = useMemo(() => {
    const name = user?.name?.trim() || "Manager";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join("");
  }, [user?.name]);

const assignMutation = trpc.vehicles.assignDriver.useMutation({
    onSuccess: () => {
      toast.success("Assignment saved successfully.");
      setIsAssignDialogOpen(false);
      void vehiclesQuery.refetch();
    }
  });

  const approveAccessRequestMutation = trpc.vehicleAccess.approveAccessRequest.useMutation();
  const denyAccessRequestMutation = trpc.vehicleAccess.denyAccessRequest.useMutation();

  const createVehicleMutation = trpc.vehicles.create.useMutation({
    onSuccess: async createdVehicle => {
      if (resolvedFleetId == null) {
        return;
      }

      utils.vehicles.listByFleet.setData({ fleetId: resolvedFleetId }, current => {
        const vehicles = current ?? [];
        const existingIndex = vehicles.findIndex(
          vehicle => vehicle.id === createdVehicle.id
        );

        if (existingIndex >= 0) {
          const next = [...vehicles];
          next[existingIndex] = createdVehicle;
          return next;
        }

        return [createdVehicle, ...vehicles];
      });

      await utils.vehicles.listByFleet.invalidate({ fleetId: resolvedFleetId });
      await vehiclesQuery.refetch();
    },
  });

  const parseOptionalVehicleId = (value?: string | number | null) => {
    if (value === undefined || value === null || value === "") return null;
    return String(value);
  };

  const parseOptionalDriverId = (value?: string | number | null) => {
    if (value === undefined || value === null || value === "") return null;
    return String(value);
  };

  const handleOpenAssign = (
    vehicleId?: string | number,
    driverId?: string | number
  ) => {
    const explicitVehicleId = parseOptionalVehicleId(vehicleId);
    const defaultVehicleId =
      explicitVehicleId ?? (vehiclesQuery.data?.[0]?.id != null ? String(vehiclesQuery.data[0].id) : null);
    setAssignmentForm(prev => ({ 
      ...prev, 
      vehicleId: defaultVehicleId,
      driverUserId: parseOptionalDriverId(driverId),
      driverMode: driverId ? "existing" : prev.driverMode
    }));
    setAssignmentStep("form");
    setAssignmentWarning(null);
    setIsAssignDialogOpen(true);
  };

  useEffect(() => {
    if (!isAssignDialogOpen) return;
    if (assignmentForm.vehicleId != null) return;
    const firstVehicleId =
      vehiclesQuery.data?.[0]?.id != null ? String(vehiclesQuery.data[0].id) : null;
    if (firstVehicleId == null) return;

    setAssignmentForm(prev => ({ ...prev, vehicleId: firstVehicleId }));
  }, [isAssignDialogOpen, assignmentForm.vehicleId, vehiclesQuery.data]);

  const handleAssignSubmit = async (confirmed: boolean = false) => {
    if (resolvedFleetId == null) {
      toast.error("Your fleet is still loading. Please try again in a moment.");
      return;
    }

    if (!confirmed && selectedAsset?.assignedDriverId && String(selectedAsset.assignedDriverId) !== String(assignmentForm.driverUserId ?? "")) {
      setAssignmentWarning({
        title: "Asset Already Assigned",
        description: `This asset is currently assigned to ${drivers.find(d => d.id === selectedAsset?.assignedDriverId)?.name || "another driver"}. Reassigning it will immediately revoke the current driver's access.`,
        confirmLabel: "Reassign Driver",
      });
      setAssignmentStep("warning");
      return;
    }

    const parsedVehicleId =
      assignmentForm.vehicleId ??
      (vehiclesQuery.data?.[0]?.id != null ? String(vehiclesQuery.data[0].id) : null);
    if (!parsedVehicleId?.trim()) {
      toast.error("Select a valid vehicle or trailer before assigning.");
      return;
    }

    const parsedDriverUserId =
      assignmentForm.driverMode === "existing"
        ? assignmentForm.driverUserId
        : undefined;

    if (
      assignmentForm.driverMode === "existing" &&
      !parsedDriverUserId?.trim()
    ) {
      toast.error("Select an existing driver or switch to Add New Driver.");
      return;
    }

    if (!confirmed && assignmentForm.driverMode === "existing" && otherDriverAssignments.length > 0) {
      const assignedUnits = otherDriverAssignments
        .map(vehicle => getVehicleDisplayLabel({
          label: vehicle.unitNumber,
          vin: vehicle.vin,
          vehicleId: vehicle.id as any,
        }))
        .slice(0, 3)
        .join(", ");
      setAssignmentWarning({
        title: "Driver Already Assigned",
        description: `${selectedDriver?.name || selectedDriver?.email || "This driver"} already has active access to ${assignedUnits}${otherDriverAssignments.length > 3 ? ", and other assets" : ""}. Continue if this shared assignment is intentional, such as a tractor and trailer combination.`,
        confirmLabel: "Assign Anyway",
      });
      setAssignmentStep("warning");
      return;
    }

    try {
      await assignMutation.mutateAsync({
        fleetId: resolvedFleetId,
        vehicleId: parsedVehicleId,
        driverUserId:
          assignmentForm.driverMode === "invite" ? undefined : parsedDriverUserId,
        accessType: assignmentForm.accessType,
        expiresAt: assignmentForm.expiresAt || undefined,
        notes: assignmentForm.notes || undefined,
        driverMode: assignmentForm.driverMode,
        inviteFirstName: assignmentForm.inviteFirstName || undefined,
        inviteLastName: assignmentForm.inviteLastName || undefined,
        inviteEmail: assignmentForm.inviteEmail || undefined,
        confirmReassign: confirmed,
      });
    } catch (e: any) {
      const message = e?.message || "Failed to assign driver";
      if (typeof message === "string" && message.includes("DRIVER_HAS_OTHER_ASSIGNMENTS")) {
        const assetSummary = message.split("DRIVER_HAS_OTHER_ASSIGNMENTS:")[1]?.trim() || "other active assets";
        setAssignmentWarning({
          title: "Driver Already Assigned",
          description: `${selectedDriver?.name || selectedDriver?.email || "This driver"} already has active access to ${assetSummary}. Continue if this shared assignment is intentional, such as a tractor and trailer combination.`,
          confirmLabel: "Assign Anyway",
        });
        setAssignmentStep("warning");
        return;
      }
      toast.error(e.message || "Failed to assign driver");
    }
  };

  const pilotAccess = subscriptionQuery.data?.pilotAccess ?? null;
  const managerActionItems = managerActionQueueQuery.data ?? [];
  const verifiedHealth = verifiedHealthQuery.data;
  const drivers = driversQuery.data ?? [];
  const pendingAccessRequests = pendingAccessRequestsQuery.data ?? [];

  const rows = useMemo(() => {
    const liveVehicles = vehiclesQuery.data ?? [];
    const mapped = liveVehicles.map(vehicle => mapVehicleRow(vehicle, drivers));

    const q = search.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter(row =>
      [row.truck, row.detail, row.assignedDriver, row.issue].some(value =>
        value.toLowerCase().includes(q)
      )
    );
  }, [search, vehiclesQuery.data, drivers]);

  const openAddVehicleDialog = () => {
    if (resolvedFleetId == null) {
      toast.error(
        isFleetContextLoading
          ? "TruckFixr is still loading your fleet. Please try again in a moment."
          : "TruckFixr could not find a fleet for this manager account yet."
      );
      return;
    }

    setVehicleCaptureInitialStep("entry");
    setIsAddVehicleOpen(true);
  };

  const resetVehicleDialog = () => {};

  const handleAddVehicle = async (draft: VehicleCaptureDraft) => {
    if (resolvedFleetId == null) {
      throw new Error("TruckFixr could not determine your fleet yet. Refresh the page and try again.");
    }

    if (draft.vin.trim().length !== 17) {
      throw new Error("VIN must be exactly 17 characters.");
    }

    try {
      const createdVehicle = await createVehicleMutation.mutateAsync({
        fleetId: resolvedFleetId,
        assetType: "truck", // Default for OCR, should be selectable in flow
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
        description: "Vehicle successfully added to fleet.",
      });
      resetVehicleDialog();
      return {
        id: createdVehicle.id,
        fleetId: createdVehicle.fleetId,
        label: vehicleLabel,
        vin: createdVehicle.vin,
        licensePlate: createdVehicle.licensePlate?.trim() || "UNKNOWN",
        make: createdVehicle.make?.trim() || draft.make.trim() || "Truck",
        engineMake:
          createdVehicle.engineMake?.trim() || draft.engineMake.trim(),
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
      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 rounded-full border-slate-200 bg-white px-4 shadow-lg shadow-slate-200/60"
            >
              <Menu className="mr-2 h-4 w-4" />
              Menu
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 rounded-2xl border-slate-200 p-2"
          >
            <DropdownMenuItem
              className="cursor-pointer rounded-xl"
              onClick={() => navigate("/profile")}
            >
              Profile settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer rounded-xl"
              onClick={() => navigate("/profile")}
            >
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer rounded-xl"
              onClick={() => navigate("/profile?security=1")}
            >
              Change password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer rounded-xl text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="border-b border-[var(--fleet-outline)] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-start gap-4">
            <AppLogo imageClassName="h-10" frameClassName="p-1.5" href="/manager" />
            <div>
              <p className="section-label">Manager dashboard</p>
              <h1 className="fleet-page-title mt-2 text-3xl font-semibold tracking-tight">
                Fleet operations center
              </h1>
              <p className="mt-2 text-sm text-[var(--fleet-muted)]">
                Manager actions now open real routes and the dashboard can add vehicles.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fleet-muted)]" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search trucks, plates, drivers, issues"
                className="h-10 rounded-full border-[var(--fleet-outline)] bg-white pl-9 shadow-sm"
              />
            </div>
            <Button
              variant="outline"
              className="rounded-full border-[var(--fleet-outline)] bg-white"
              onClick={() => window.print()}
            >
              Export morning brief
            </Button>
            <Dialog
              open={isAddVehicleOpen}
              onOpenChange={open => {
                setIsAddVehicleOpen(open);
                if (open) {
                  setVehicleCaptureInitialStep("entry");
                } else {
                  resetVehicleDialog();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  className="fleet-primary-btn rounded-full"
                  disabled={resolvedFleetId == null && isFleetContextLoading}
                  onClick={openAddVehicleDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add vehicle
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border-[var(--fleet-outline)] p-0 sm:max-h-[calc(100svh-2rem)] sm:max-w-2xl">
                <VehicleCaptureFlow
                  fleetId={resolvedFleetId ?? 0}
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
                <Button
                  variant="outline"
                  className="h-10 rounded-full border-slate-200 bg-white px-2"
                >
                  <Avatar className="h-7 w-7 border border-slate-200">
                    <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl border-slate-200 p-2"
              >
                <DropdownMenuItem
                  className="cursor-pointer rounded-xl"
                  onClick={() => navigate("/profile")}
                >
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer rounded-xl"
                  onClick={() => openAddVehicleDialog()}
                >
                  Add vehicle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer rounded-xl text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-xl shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <p className="text-sm text-amber-800">
              Safety notice: Do not use TruckFixr while driving. If you are driving, pull over safely before 
              entering symptoms, reading results, or following diagnostic instructions.
            </p>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          {pilotAccess?.status === "active" ? (
            <Card className="metric-card border-0">
              <CardHeader className="pb-3">
                <CardDescription>Pilot Access</CardDescription>
                <CardTitle className="text-2xl font-semibold text-slate-950">
                  Pilot Access Active
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-slate-600">
                <p>
                  Expires {new Date(pilotAccess.expiresAt).toLocaleDateString()}
                </p>
                <p className="mt-1">
                  Vehicles used: {pilotAccess.vehiclesUsed} /{" "}
                  {pilotAccess.maxVehicles}
                </p>
                <p className="mt-1">
                  Users enabled: {pilotAccess.usersUsed} /{" "}
                  {pilotAccess.maxUsers}
                </p>
                <Button
                  variant="outline"
                  className="mt-4 w-full rounded-xl"
                  onClick={() => navigate("/profile")}
                >
                  Upgrade plan
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Vehicles in fleet</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {vehiclesQuery.data?.length ?? 0}
              </CardTitle>
            <Button 
              variant="link" 
              className="p-0 h-auto text-blue-600" 
              onClick={() => handleOpenAssign()}
            >
              Assign Vehicle / Trailer
            </Button>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              Live fleet list with driver assignment.
            </CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Linked drivers</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {drivers.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              Drivers available to assign to vehicles.
            </CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Action shortcuts</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                Live
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              Profile, maintenance queue, truck details, and add vehicle actions
              now respond.
            </CardContent>
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
              <p>{verifiedHealth?.today.completionRate ?? 0}% completion rate.</p>
              <Button
                variant="link"
                className="mt-2 h-auto p-0 text-sm font-medium text-blue-700"
                onClick={() => {
                  const firstReport = inspectionReportsQuery.data?.[0];
                  if (firstReport) {
                    navigate(`/inspection-report/${firstReport.id}`);
                    return;
                  }
                  toast.info("No DVIR inspection reports are available yet.");
                }}
              >
                View inspection reports
              </Button>
            </CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Missed inspections</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.today.missedInspections ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              Vehicles not inspected today.
            </CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Open defects</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.openDefects.length ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              Known issues remain visible until resolved.
            </CardContent>
          </Card>
          <Card className="metric-card border-0">
            <CardHeader className="pb-3">
              <CardDescription>Integrity score</CardDescription>
              <CardTitle className="text-3xl font-semibold text-slate-950">
                {verifiedHealth?.averages.fleetIntegrityScore ?? 100}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              Average verified inspection score.
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="saas-card">
            <CardHeader>
              <CardTitle className="text-slate-950">DVIR inspection reports</CardTitle>
              <CardDescription>
                Completed verified daily inspections are saved here for manager review and driver records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {inspectionReportsQuery.isLoading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  Loading inspection reports...
                </div>
              ) : null}
              {!inspectionReportsQuery.isLoading && (inspectionReportsQuery.data ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No DVIR inspection reports have been submitted yet.
                </div>
              ) : null}
              {(inspectionReportsQuery.data ?? []).map((report) => (
                <div
                  key={report.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{report.vehicleLabel}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Driver: {report.driverName} | {formatReportTimestamp(report.submittedAt)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                      {String(report.overallVehicleResult ?? "submitted").replaceAll("_", " ")} | Integrity{" "}
                      {report.integrityScore ?? "N/A"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-full bg-white"
                    onClick={() => navigate(`/inspection-report/${report.id}`)}
                  >
                    View DVIR report
                  </Button>
                </div>
              ))}
            </CardContent>
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
                Verified daily status combines inspection completion, open
                defects, photo proof, location proof, and flags.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(verifiedHealth?.vehicles ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No verified inspections yet today.
                </div>
              ) : (
                verifiedHealth?.vehicles.map(vehicle => (
                  <div
                    key={vehicle.vehicleId}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {vehicle.unit}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {vehicle.openDefects} open defects | Integrity{" "}
                          {vehicle.integrityScore ?? "N/A"}
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
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                        <MapPin className="h-3.5 w-3.5" />
                        Location{" "}
                        {vehicle.locationProofCaptured ? "captured" : "missing"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                        <Camera className="h-3.5 w-3.5" />
                        Photo proof{" "}
                        {vehicle.photoProofSubmitted ? "submitted" : "missing"}
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
              <CardDescription>
                Fast inspections, skipped proof, missing photos, and missing
                location proof.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(verifiedHealth?.integrityAlerts ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No integrity alerts are waiting for review.
                </div>
              ) : (
                verifiedHealth?.integrityAlerts.slice(0, 8).map(alert => (
                  <div
                    key={alert.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <p className="font-semibold text-slate-950">
                      {alert.flagType.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {alert.message}
                    </p>
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
              <CardDescription>
                Review, monitor, repair, or resolve driver-reported defects.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(verifiedHealth?.openDefects ?? []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  No open defects.
                </div>
              ) : (
                verifiedHealth?.openDefects.slice(0, 8).map(defect => (
                  <div
                    key={defect.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {defect.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {formatDefectDescription(defect.description)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(defect.severity === "critical" ? "Critical" : defect.severity === "moderate" || defect.severity === "medium" ? "High" : "Low")}`}
                      >
                        {defect.severity}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      AI recommendation:{" "}
                      {defect.aiRecommendation ?? "Manager review pending"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => navigate(`/defect/${defect.id}`)}
                      >
                        Review
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => navigate(`/defect/${defect.id}`)}
                      >
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
              <CardTitle className="text-slate-950">
                Inspection quality averages
              </CardTitle>
              <CardDescription>
                Simple MVP integrity scoring by vehicle and driver.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  By vehicle
                </p>
                <div className="mt-2 space-y-2">
                  {(verifiedHealth?.averages.byVehicle ?? [])
                    .slice(0, 6)
                    .map(item => (
                      <div
                        key={item.vehicleId}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span>{item.unit}</span>
                        <span className="font-semibold text-slate-950">
                          {item.score}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  By driver
                </p>
                <div className="mt-2 space-y-2">
                  {(verifiedHealth?.averages.byDriver ?? [])
                    .slice(0, 6)
                    .map(item => (
                      <div
                        key={item.driverId}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                      >
                        <span>Driver {item.driverId}</span>
                        <span className="font-semibold text-slate-950">
                          {item.score}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          {resolvedFleetId != null ? <MorningFleetSummary fleetId={resolvedFleetId} /> : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="saas-card p-0">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Fleet operations</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Vehicles and assigned drivers
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Manage your fleet vehicles and their operational status.
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white"
                  onClick={() => navigate("/defect/1")}
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  Open queue
                </Button>
                <Button
                  className="fleet-primary-btn rounded-full"
                  onClick={() => openAddVehicleDialog()}
                >
                  <CarFront className="mr-2 h-4 w-4" />
                  Add vehicle
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    {[
                      "Truck",
                      "Status",
                      "Inspection",
                      "Assigned Driver",
                      "Issue",
                      "Priority",
                      "Action",
                    ].map(heading => (
                      <th key={heading} className="px-7 py-4 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="border-t border-slate-200/80">
                      <td
                        colSpan={7}
                        className="px-7 py-10 text-center text-sm text-slate-600"
                      >
                        {vehiclesQuery.isLoading
                          ? "Loading your fleet vehicles..."
                          : search.trim()
                            ? "No vehicles match that search."
                            : "No vehicles in this fleet yet. Add a vehicle to start assigning drivers and tracking fleet health."}
                      </td>
                    </tr>
                  ) : (
                    rows.map(row => (
                      <tr key={row.id} className="border-t border-slate-200/80">
                        <td className="px-7 py-5 align-top">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                              <Truck className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-950">
                                {row.truck}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                                {row.detail}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-7 py-5 align-top">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-7 py-5 align-top">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.inspection)}`}
                          >
                            {row.inspection}
                          </span>
                        </td>
                        <td className="px-7 py-5 align-top text-slate-600">
                          {row.assignedDriver}
                        </td>
                        <td className="px-7 py-5 align-top text-slate-600">
                          {row.issue}
                        </td>
                        <td className="px-7 py-5 align-top">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.priority)}`}
                          >
                            {row.priority}
                          </span>
                        </td>
                        <td className="px-7 py-5 align-top">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-full text-blue-700 hover:bg-blue-50"
                              onClick={() => navigate(`/truck/${row.id}`)}
                            >
                              View details
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => handleOpenAssign(String(row.id))}
                            >
                              Assign
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
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
                      Invite drivers into TruckFixr or assign linked drivers to
                      a vehicle.
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
                    No linked drivers yet. Invite a driver from Settings, then
                    assign them to a vehicle.
                  </div>
                ) : (
                  drivers.slice(0, 5).map(driver => (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-950">
                          {driver.name?.trim() ||
                            driver.email ||
                            `Driver ${driver.id}`}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {driver.email || "No email available"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => handleOpenAssign(undefined, String(driver.id))}
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
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  Vehicle Access
                </CardTitle>
                <CardDescription>
                  Assign permanent or temporary vehicle/trailer access and
                  review pending driver requests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingAccessRequests.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No vehicle access requests are pending.
                  </div>
                ) : (
                  pendingAccessRequests.slice(0, 5).map(request => (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {request.vehicle?.unitNumber ||
                              request.vehicle?.licensePlate ||
                              request.requestedVehicleIdentifier ||
                              "Vehicle request"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {request.driver?.name ||
                              request.driver?.email ||
                              `Driver ${request.requestedByDriverId}`}{" "}
                            | {request.reason.replaceAll("_", " ")}
                          </p>
                        </div>
                        {request.urgent ? (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                            Urgent
                          </span>
                        ) : null}
                      </div>
                      {request.note ? (
                        <p className="mt-3 text-sm text-slate-700">
                          {request.note}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() =>
                            void approveAccessRequestMutation.mutateAsync({
                              requestId: request.id,
                              accessType: "permanent",
                              managerNote:
                                requestActionNote.trim() || undefined,
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
                              expiresAt: new Date(
                                Date.now() + 24 * 60 * 60 * 1000
                              ).toISOString(),
                              managerNote:
                                requestActionNote.trim() || undefined,
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
                              managerNote:
                                requestActionNote.trim() || undefined,
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
                  onChange={event => setRequestActionNote(event.target.value)}
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
                  Completed driver diagnoses that were shared to your queue for
                  follow-up.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {managerActionQueueQuery.isLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    Loading manager action queue...
                  </div>
                ) : managerActionItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No diagnosis summaries are waiting on manager follow-up
                    right now.
                  </div>
                ) : (
                  managerActionItems.map(item => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">
                            {item.truckLabel}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {[item.truckDetail, item.driverName]
                              .filter(Boolean)
                              .join(" | ")}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {item.riskLevel ? (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(item.riskLevel === "high" ? "Critical" : item.riskLevel === "medium" ? "High" : "Low")}`}
                            >
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
                            <span className="font-medium text-slate-900">
                              Symptoms:
                            </span>{" "}
                            {item.symptoms.join(", ")}
                          </p>
                        ) : null}
                        {item.recommendedFix ? (
                          <p>
                            <span className="font-medium text-slate-900">
                              Recommended fix:
                            </span>{" "}
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
                          onClick={() =>
                            navigate(`/defect/${item.defectId ?? 1}`)
                          }
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
                <CardDescription>
                  These links now perform real actions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl"
                  onClick={() => navigate("/profile")}
                >
                  Profile settings
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl"
                  onClick={() => openAddVehicleDialog()}
                >
                  Add vehicle
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-xl"
                  onClick={() => navigate("/defect/1")}
                >
                  Open maintenance queue
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent className="rounded-[24px] sm:max-w-2xl">
            {assignmentStep === "form" ? (
              <>
                <DialogHeader>
                  <DialogTitle>Assign Vehicle / Trailer</DialogTitle>
                  <DialogDescription>
                    Select an asset and a driver to manage operational access.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Select Vehicle / Trailer</Label>
                    <Select 
                      value={
                        assignmentForm.vehicleId != null
                          ? String(assignmentForm.vehicleId)
                          : undefined
                      }
                      onValueChange={v =>
                        setAssignmentForm(p => ({
                          ...p,
                          vehicleId: parseOptionalVehicleId(v),
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Select vehicle or trailer" />
                      </SelectTrigger>
                      <SelectContent>
                        {(vehiclesQuery.data ?? []).map(v => (
                          <SelectItem key={v.id} value={String(v.id)}>
                            {v.unitNumber} · {v.assetType} {v.licensePlate ? `· ${v.licensePlate}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Select Driver</Label>
                    <div className="flex gap-2 flex-1">
                      <Select
                        value={
                          assignmentForm.driverUserId != null
                            ? String(assignmentForm.driverUserId)
                            : undefined
                        }
                        onValueChange={v =>
                          setAssignmentForm(p => ({
                            ...p,
                            driverUserId: parseOptionalDriverId(v),
                            driverMode: "existing",
                          }))
                        }
                        disabled={assignmentForm.driverMode === "invite"}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Select existing driver" />
                        </SelectTrigger>
                        <SelectContent>
                          {(driversQuery.data ?? []).map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name} · {d.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="outline" 
                        className="rounded-xl"
                        onClick={() => setAssignmentForm(p => ({...p, driverMode: "invite"}))}
                      >
                        + Add New Driver
                      </Button>
                    </div>
                  </div>

                  {assignmentForm.driverMode === "invite" && (
                    <div className="grid grid-cols-2 gap-4 rounded-xl border p-4 bg-slate-50">
                      <div className="space-y-2">
                        <Label>First Name</Label>
                        <Input 
                          value={assignmentForm.inviteFirstName} 
                          onChange={e => setAssignmentForm(p => ({...p, inviteFirstName: e.target.value}))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Last Name</Label>
                        <Input 
                          value={assignmentForm.inviteLastName} 
                          onChange={e => setAssignmentForm(p => ({...p, inviteLastName: e.target.value}))}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label>Email</Label>
                        <Input 
                          type="email" 
                          value={assignmentForm.inviteEmail} 
                          onChange={e => setAssignmentForm(p => ({...p, inviteEmail: e.target.value}))}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Assignment Type</Label>
                      <Select 
                        value={assignmentForm.accessType} 
                        onValueChange={(v: any) => setAssignmentForm(p => ({...p, accessType: v}))}
                      >
                        <SelectTrigger className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="permanent">Permanent</SelectItem>
                          <SelectItem value="temporary">Temporary</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {assignmentForm.accessType === "temporary" && (
                      <div className="space-y-2">
                        <Label>Expiry Date and Time</Label>
                        <Input 
                          type="datetime-local" 
                          value={assignmentForm.expiresAt} 
                          onChange={e => setAssignmentForm(p => ({...p, expiresAt: e.target.value}))}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button>
                  <Button 
                    className="fleet-primary-btn rounded-xl"
                    onClick={() => handleAssignSubmit()}
                  >
                    Assign Driver
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>{assignmentWarning?.title || "Assignment requires confirmation"}</DialogTitle>
                  <DialogDescription>
                    {assignmentWarning?.description || "Please confirm this assignment change before continuing."}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex gap-2">
                  <Button variant="outline" onClick={() => setAssignmentStep("form")}>Choose Another Asset</Button>
                  <Button variant="ghost" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button>
                  <Button 
                    variant="destructive"
                    className="rounded-xl"
                    onClick={() => handleAssignSubmit(true)}
                  >
                    {assignmentWarning?.confirmLabel || "Confirm"}
                  </Button>
                </DialogFooter>
              </>
            )}
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
