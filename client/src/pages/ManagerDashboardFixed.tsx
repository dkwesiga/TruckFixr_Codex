import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import MorningFleetSummary from "@/components/MorningFleetSummary";
import TrialUpgradeBanner from "@/components/TrialUpgradeBanner";
import QuickStartBanner from "@/components/quickStart/QuickStartBanner";
import VehicleCaptureFlow, {
  type VehicleCaptureDraft,
} from "@/components/VehicleCaptureFlow";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import { goToDriverMode } from "@/hooks/useOwnerOperatorModeNavigation";
import { isOwnerOperatorEnabled } from "@/lib/ownerOperator";
import { trpc } from "@/lib/trpc";
import {
  getFallbackUnitNumber,
  getVehicleDisplayLabel,
} from "@/lib/vehicleDisplay";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { EarlyWarningList, type EarlyWarning } from "@/components/EarlyWarnings";
import { NotificationBell } from "@/components/NotificationBell";
import {
  AlertTriangle,
  BookOpenCheck,
  CarFront,
  ChevronRight,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
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
  relationship: string | null;
  assignedDriver: string;
  assignedDriverId: number | null;
  assignedDriverDisplayName: string | null;
  status: "Operational" | "In Shop" | "Dispatch Hold";
  inspection: "Complete" | "Due Today" | "Overdue";
  priority: "Low" | "High" | "Critical";
  issue: string;
  assetRecordStatus: string | null;
  isOwnerOperatorSelfAssigned: boolean;
  ownerOperatorPreviousDriverId: number | null;
  ownerOperatorPreviousDriverName: string | null;
};

const DEFAULT_ASSIGNMENT_FORM = {
  vehicleId: null as string | null,
  driverUserId: null as string | null,
  accessType: "permanent" as "permanent" | "temporary",
  expiresAt: "",
  notes: "",
  driverMode: "existing" as "existing" | "invite",
  inviteFirstName: "",
  inviteLastName: "",
  inviteEmail: "",
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

const managerReviewOptions = [
  { value: "reviewed", label: "Reviewed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "deferred", label: "Deferred" },
  { value: "resolved", label: "Resolved" },
  { value: "escalated", label: "Escalated" },
] as const;

function formatManagerReviewStatus(value: string | null | undefined) {
  const match = managerReviewOptions.find(option => option.value === value);
  return match?.label ?? "Submitted";
}

function buildVehicleRelationship(vehicle: any, fleetVehicles: any[] = []) {
  if (typeof vehicle.linkedVehicleSummary === "string" && vehicle.linkedVehicleSummary.trim().length > 0) {
    return vehicle.linkedVehicleSummary.trim();
  }

  const linkedPoweredVehicle =
    vehicle.linkedPoweredVehicleId != null
      ? fleetVehicles.find(candidate => String(candidate.id) === String(vehicle.linkedPoweredVehicleId))
      : null;
  if (linkedPoweredVehicle) {
    return `Linked to ${getVehicleDisplayLabel({
      label: linkedPoweredVehicle.unitNumber,
      vin: linkedPoweredVehicle.vin,
      vehicleId: linkedPoweredVehicle.id,
    })}`;
  }

  const linkedTrailers = fleetVehicles.filter(
    candidate => candidate.linkedPoweredVehicleId != null && String(candidate.linkedPoweredVehicleId) === String(vehicle.id)
  );
  if (linkedTrailers.length === 0) {
    return null;
  }

  const linkedTrailerLabels = linkedTrailers.map(candidate =>
    getVehicleDisplayLabel({
      label: candidate.unitNumber,
      vin: candidate.vin,
      vehicleId: candidate.id,
    })
  );

  return linkedTrailerLabels.length === 1
    ? `Linked trailer ${linkedTrailerLabels[0]}`
    : `Linked trailers ${linkedTrailerLabels.join(", ")}`;
}

function mapVehicleRow(
  vehicle: any,
  fleetVehicles: any[] = [],
  drivers: any[] = [],
  currentUserId?: number | null
): DashboardRow {
  const priority =
    vehicle.complianceStatus === "red"
      ? "Critical"
      : vehicle.complianceStatus === "yellow"
        ? "High"
        : "Low";

  const driver = drivers.find(d => d.id === vehicle.assignedDriverId);
  const ownerOperatorSelfAssignment = vehicle.ownerOperatorSelfAssignment ?? null;
  const isOwnerOperatorSelfAssigned =
    ownerOperatorSelfAssignment?.ownerOperatorUserId != null &&
    currentUserId != null &&
    ownerOperatorSelfAssignment.ownerOperatorUserId === currentUserId;
  const assignedDriverDisplayName =
    vehicle.assignedDriverDisplayName ??
    driver?.name ??
    driver?.email ??
    (isOwnerOperatorSelfAssigned ? "Assigned to you" : null);

  return {
    id: vehicle.id,
    truck: getVehicleDisplayLabel({
      label: vehicle.unitNumber,
      vin: vehicle.vin,
      vehicleId: vehicle.id,
    }),
    relationship: buildVehicleRelationship(vehicle, fleetVehicles),
    assignedDriver: assignedDriverDisplayName || "Unassigned",
    assignedDriverId:
      typeof vehicle.assignedDriverId === "number" ? vehicle.assignedDriverId : null,
    assignedDriverDisplayName,
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
    assetRecordStatus: vehicle.assetRecordStatus ?? null,
    isOwnerOperatorSelfAssigned,
    ownerOperatorPreviousDriverId:
      ownerOperatorSelfAssignment?.previousDriverUserId ?? null,
    ownerOperatorPreviousDriverName:
      ownerOperatorSelfAssignment?.previousDriverName ?? null,
  };
}

function ManagerDashboardFixedContent({ internalAdminRole }: { internalAdminRole?: string | null }) {
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
  const isPartnerShop = Boolean((companyQuery.data?.company as any)?.isPartner);
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
  const [selfAssignmentWarning, setSelfAssignmentWarning] = useState<{
    vehicleId: string;
    vehicleLabel: string;
    currentDriverName: string | null;
  } | null>(null);
  const [assignmentForm, setAssignmentForm] = useState(DEFAULT_ASSIGNMENT_FORM);

  const [reportIssueVehicle, setReportIssueVehicle] = useState<{ id: string; label: string } | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSymptoms, setReportSymptoms] = useState("");
  const createDefect = trpc.defects.create.useMutation({
    onSuccess: () => {
      toast.success("Issue reported.");
      setReportIssueVehicle(null);
      setReportTitle("");
      setReportDescription("");
      setReportSymptoms("");
      void utils.vehicles.listByFleet.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  function submitReportIssue() {
    if (!resolvedFleetId || !reportIssueVehicle || !reportTitle.trim()) return;
    createDefect.mutate({
      fleetId: resolvedFleetId,
      vehicleId: reportIssueVehicle.id,
      title: reportTitle.trim(),
      description: reportDescription.trim() || undefined,
      symptoms: reportSymptoms
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

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
  const earlyWarningsQuery = trpc.defects.listEarlyWarnings.useQuery(
    { fleetId: resolvedFleetId ?? 0 },
    { staleTime: 30_000, enabled: resolvedFleetId != null }
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
  const isOwnerOperator = isOwnerOperatorEnabled(user);

  const resetAssignmentDialog = () => {
    setAssignmentStep("form");
    setAssignmentWarning(null);
    setAssignmentForm(DEFAULT_ASSIGNMENT_FORM);
  };

  const assignMutation = trpc.vehicles.assignDriver.useMutation({
    onSuccess: () => {
      toast.success("Assignment saved successfully.");
      resetAssignmentDialog();
      setIsAssignDialogOpen(false);
      void vehiclesQuery.refetch();
    }
  });
  const assignToSelfMutation = trpc.vehicles.assignOwnerOperatorToSelf.useMutation({
    onSuccess: async (result) => {
      setSelfAssignmentWarning(null);
      await utils.vehicles.listByFleet.invalidate({ fleetId: resolvedFleetId ?? 0 });
      await vehiclesQuery.refetch();
      toast.success(
        result.previousDriverName
          ? `Assigned to you. ${result.previousDriverName} remains preserved for later restore.`
          : "Assigned to you."
      );
    },
    onError: (error) => {
      const message = error.message || "TruckFixr could not assign this vehicle to you.";
      if (message.startsWith("OWNER_OPERATOR_CONFIRM_TAKEOVER:")) {
        const currentDriverName = message.split("OWNER_OPERATOR_CONFIRM_TAKEOVER:")[1]?.trim() || null;
        if (selfAssignmentWarning) {
          setSelfAssignmentWarning({
            ...selfAssignmentWarning,
            currentDriverName,
          });
          return;
        }
        toast.error(
          currentDriverName
            ? `This vehicle is currently assigned to ${currentDriverName}. Please try again to confirm takeover.`
            : "This vehicle is currently assigned. Please try again to confirm takeover."
        );
        return;
      }
      toast.error(message);
    },
  });
  const releaseSelfAssignmentMutation = trpc.vehicles.releaseOwnerOperatorSelfAssignment.useMutation({
    onSuccess: async (result) => {
      await utils.vehicles.listByFleet.invalidate({ fleetId: resolvedFleetId ?? 0 });
      await vehiclesQuery.refetch();
      toast.success(
        result.restoredDriverName
          ? `Self-assignment released. ${result.restoredDriverName} was restored.`
          : "Self-assignment released."
      );
    },
    onError: (error) => {
      toast.error(error.message || "TruckFixr could not release this self-assignment.");
    },
  });

  const approveAccessRequestMutation = trpc.vehicleAccess.approveAccessRequest.useMutation({
    onSuccess: async () => {
      toast.success("Vehicle access approved.");
      await pendingAccessRequestsQuery.refetch();
    },
    onError: error => {
      toast.error(error.message || "Unable to approve vehicle access request.");
    },
  });
  const denyAccessRequestMutation = trpc.vehicleAccess.denyAccessRequest.useMutation({
    onSuccess: async () => {
      toast.success("Vehicle access request denied.");
      await pendingAccessRequestsQuery.refetch();
    },
    onError: error => {
      toast.error(error.message || "Unable to deny vehicle access request.");
    },
  });
  const updateDefectReviewMutation = trpc.defects.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("Manager review status updated.");
      await verifiedHealthQuery.refetch();
    },
  });

  const createVehicleMutation = trpc.vehicles.create.useMutation({
    onSuccess: async createdVehicle => {
      if (resolvedFleetId == null) {
        return;
      }

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
    setAssignmentForm({
      ...DEFAULT_ASSIGNMENT_FORM,
      vehicleId: defaultVehicleId,
      driverUserId: parseOptionalDriverId(driverId),
      driverMode: "existing",
    });
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
  const earlyWarnings = (earlyWarningsQuery.data ?? []) as EarlyWarning[];

  const rows = useMemo(() => {
    const liveVehicles = vehiclesQuery.data ?? [];
    const mapped = liveVehicles.map(vehicle =>
      mapVehicleRow(vehicle, liveVehicles, drivers, user?.id ?? null)
    );

    const q = search.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter(row =>
      [row.truck, row.detail, row.relationship ?? "", row.assignedDriver, row.issue].some(value =>
        value.toLowerCase().includes(q)
      )
    );
  }, [search, vehiclesQuery.data, drivers]);

  // Decision-oriented fleet-health rollup for the owner view. Computed from
  // data already loaded on the manager dashboard so owners and managers share
  // one page and one design system (no separate owner app).
  const ownerSummary = useMemo(() => {
    const allRows = (vehiclesQuery.data ?? []).map(vehicle =>
      mapVehicleRow(vehicle, vehiclesQuery.data ?? [], drivers, user?.id ?? null)
    );
    const unavailable = allRows.filter(
      row => row.status === "In Shop" || row.status === "Dispatch Hold"
    );
    const highPriority = allRows.filter(
      row => row.priority === "Critical" || row.priority === "High"
    );
    const needsAttention = allRows.filter(
      row =>
        row.status === "Operational" &&
        (row.inspection === "Overdue" ||
          row.priority === "Critical" ||
          row.priority === "High")
    );
    const operatingNormally = allRows.filter(
      row =>
        row.status === "Operational" &&
        row.priority === "Low" &&
        row.inspection !== "Overdue"
    );
    return {
      total: allRows.length,
      operatingNormally: operatingNormally.length,
      needsAttention: needsAttention.length,
      unavailable: unavailable.length,
      highPriority: highPriority.length,
      pendingDecisions: managerActionItems.length,
    };
  }, [vehiclesQuery.data, drivers, user?.id, managerActionItems.length]);

  // KPI row for the redesigned dashboard header — derived from data already
  // fetched above (verifiedHealth, vehiclesQuery, drivers), no extra queries.
  const fleetKpis = useMemo(() => {
    const healthVehicles = verifiedHealth?.vehicles ?? [];
    const fleetHealthPct = healthVehicles.length
      ? Math.round(
          (healthVehicles.filter(v => v.status === "safe").length / healthVehicles.length) * 100
        )
      : 100;
    const totalVehicles = vehiclesQuery.data?.length ?? 0;
    const activeVehicles = (vehiclesQuery.data ?? []).filter(
      vehicle => vehicle.status !== "maintenance" && vehicle.status !== "retired"
    ).length;
    const openDefects = verifiedHealth?.openDefects ?? [];
    const severityCounts = {
      critical: openDefects.filter(d => d.severity === "critical").length,
      high: openDefects.filter(d => d.severity === "high").length,
      medium: openDefects.filter(d => d.severity === "medium" || d.severity === "moderate").length,
      low: openDefects.filter(
        d => !["critical", "high", "medium", "moderate"].includes(d.severity ?? "")
      ).length,
    };
    return {
      fleetHealthPct,
      totalVehicles,
      activeVehicles,
      pendingInspections: verifiedHealth?.today.missedInspections ?? 0,
      openDefectsTotal: openDefects.length,
      severityCounts,
      integrityScore: verifiedHealth?.averages.fleetIntegrityScore ?? 100,
    };
  }, [verifiedHealth, vehiclesQuery.data]);

  const isOwnerView = user?.role === "owner" && !isOwnerOperator;

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

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const isOperationalOwnerOperatorAsset = (row: DashboardRow) =>
    isOwnerOperator &&
    row.status === "Operational" &&
    row.assetRecordStatus === "active";

  const handleAssignToSelf = async (
    row: DashboardRow,
    confirmed: boolean = false
  ) => {
    if (resolvedFleetId == null) {
      toast.error("TruckFixr is still loading your fleet. Please try again.");
      return;
    }

    if (!isOperationalOwnerOperatorAsset(row)) {
      toast.error("Only operational active vehicles can be assigned to you.");
      return;
    }

    if (
      !confirmed &&
      row.assignedDriverId != null &&
      user?.id != null &&
      row.assignedDriverId !== user.id
    ) {
      setSelfAssignmentWarning({
        vehicleId: String(row.id),
        vehicleLabel: row.truck,
        currentDriverName:
          row.assignedDriverDisplayName || row.assignedDriver || null,
      });
      return;
    }

    await assignToSelfMutation.mutateAsync({
      fleetId: resolvedFleetId,
      vehicleId: String(row.id),
      confirmTakeover: confirmed || undefined,
    });
  };

  const handleReleaseSelfAssignment = async (row: DashboardRow) => {
    if (resolvedFleetId == null) {
      toast.error("TruckFixr is still loading your fleet. Please try again.");
      return;
    }

    await releaseSelfAssignmentMutation.mutateAsync({
      fleetId: resolvedFleetId,
      vehicleId: String(row.id),
    });
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
        unitNumber: draft.label.trim() || getFallbackUnitNumber(draft.vin),
        vin: draft.vin.trim().toUpperCase(),
        licensePlate: draft.licensePlate.trim() || undefined,
        make: draft.make.trim() || undefined,
        engineMake: draft.engineMake.trim() || undefined,
        model: draft.model.trim() || undefined,
        year: draft.year.trim() ? Number(draft.year.trim()) : undefined,
        vehicleType: draft.vehicleType || undefined,
      });

      const vehicleLabel = getVehicleDisplayLabel({
        label: createdVehicle.unitNumber ?? draft.label,
        vin: createdVehicle.vin,
        vehicleId: createdVehicle.id,
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
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2 sm:right-6 sm:top-6">
        <NotificationBell fleetId={resolvedFleetId} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 rounded-full border-slate-200 bg-white px-2 shadow-lg shadow-slate-200/60"
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
            <DropdownMenuItem
              className="cursor-pointer rounded-xl"
              onClick={() => openAddVehicleDialog()}
            >
              Add vehicle
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer rounded-xl"
              onClick={() => navigate("/quick-start-guides/my-guide")}
            >
              <BookOpenCheck className="mr-2 h-4 w-4" />
              My Quick Start Guide
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer rounded-xl"
              onClick={() => navigate("/quick-start-guides")}
            >
              <BookOpenCheck className="mr-2 h-4 w-4" />
              Quick Start Guides
            </DropdownMenuItem>
            {isPartnerShop ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer rounded-xl"
                  onClick={() => navigate("/partner/cases/new")}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New case
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer rounded-xl"
                  onClick={() => navigate("/app/fleet-health")}
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Cases &amp; repair outcomes
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer rounded-xl"
                  onClick={() => navigate("/partner/knowledge")}
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  Knowledge Base Studio
                </DropdownMenuItem>
              </>
            ) : null}
            {internalAdminRole ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer rounded-xl"
                  onClick={() => navigate("/admin/metrics")}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Admin dashboard
                </DropdownMenuItem>
              </>
            ) : null}
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

      <header>
        {/* Top app bar */}
        <div
          className="flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8"
          style={{ background: "var(--brand-navy-deep)" }}
        >
          <AppLogo
            imageClassName="h-6"
            frameClassName="rounded-lg bg-white px-3 py-1.5"
            href="/manager"
          />
          <div className="hidden flex-1 max-w-[480px] sm:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--steel-400)]" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search trucks, plates, drivers, issues"
                className="h-9 rounded-md border-[var(--steel-700)] bg-[var(--steel-900)] pl-9 text-[var(--steel-50)] placeholder:text-[var(--steel-400)] shadow-none"
              />
            </div>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            className="hidden rounded-md border-[var(--steel-700)] bg-transparent text-[var(--steel-200)] hover:bg-[var(--steel-800)] hover:text-white sm:inline-flex"
            onClick={() => window.print()}
          >
            Export morning brief
          </Button>
        </div>

        {/* Page header band */}
        <div className="border-b border-[var(--fleet-outline)] bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="tfx-eyebrow">Manager dashboard</p>
                {isOwnerOperator ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 ring-1 ring-slate-200">
                    Owner Mode
                  </span>
                ) : null}
              </div>
              <h1 className="tfx-display mt-1 text-4xl">
                Fleet operations center
              </h1>
              <p className="mt-2 max-w-xl text-sm text-[var(--fleet-muted)]">
                Prioritize urgent vehicles and assign the next action across your fleet.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isOwnerOperator ? (
                <Button
                  variant="outline"
                  className="rounded-full border-[var(--fleet-outline)] bg-white"
                  onClick={() => goToDriverMode()}
                >
                  Switch to Driver Mode
                </Button>
              ) : null}
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
                <Button
                  className="rounded-md px-5 font-semibold text-white shadow-none hover:opacity-90"
                  style={{ background: "var(--brand-red)" }}
                  disabled={resolvedFleetId == null && isFleetContextLoading}
                  onClick={openAddVehicleDialog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add vehicle
                </Button>
                <DialogContent
                  className="max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] overflow-hidden rounded-[28px] border-[var(--fleet-outline)] p-0 sm:max-h-[calc(100svh-2rem)] sm:max-w-2xl"
                  // Taking a VIN photo backgrounds the page while the native camera app is
                  // open. Radix's Dialog otherwise treats the resulting focus/pointer loss as
                  // an "outside interaction" and auto-dismisses back to the dashboard the
                  // moment the camera returns focus — this keeps the dialog open through that
                  // round trip; explicit Cancel/close/save actions are unaffected.
                  onPointerDownOutside={(event) => event.preventDefault()}
                  onInteractOutside={(event) => event.preventDefault()}
                >
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
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 pb-28 sm:px-6 lg:px-8 lg:pb-8">
        <QuickStartBanner role={user?.role} />
        <TrialUpgradeBanner />

        {/* Morning Fleet Summary — primary daily engagement */}
        <section>
          {resolvedFleetId != null ? <MorningFleetSummary fleetId={resolvedFleetId} /> : null}
        </section>

        {isOwnerView ? (
          <section aria-label="Fleet health summary" className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="section-label">Fleet health</p>
                <h2 className="mt-1 font-['Manrope'] text-2xl font-semibold tracking-tight text-slate-950">
                  {ownerSummary.total === 0
                    ? "No vehicles yet"
                    : ownerSummary.needsAttention + ownerSummary.unavailable === 0
                      ? "All vehicles operating normally"
                      : `${ownerSummary.needsAttention + ownerSummary.unavailable} vehicle${
                          ownerSummary.needsAttention + ownerSummary.unavailable === 1 ? "" : "s"
                        } need attention`}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <button
                type="button"
                onClick={() => scrollToSection("manager-fleet-operations")}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <p className="text-3xl font-semibold text-emerald-900">{ownerSummary.operatingNormally}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Operating normally</p>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("manager-open-defects-panel")}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <p className="text-3xl font-semibold text-amber-900">{ownerSummary.needsAttention}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Need attention</p>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("manager-fleet-operations")}
                className="rounded-2xl border border-red-200 bg-red-50 p-4 text-left transition hover:border-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <p className="text-3xl font-semibold text-red-900">{ownerSummary.unavailable}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-red-700">Unavailable</p>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("manager-open-defects-panel")}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <p className="text-3xl font-semibold text-slate-950">{ownerSummary.highPriority}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">High-priority issues</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  managerActionItems[0]?.defectId
                    ? navigate(`/defect/${managerActionItems[0].defectId}`)
                    : scrollToSection("manager-open-defects-panel")
                }
                className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-left transition hover:border-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <p className="text-3xl font-semibold text-blue-950">{ownerSummary.pendingDecisions}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Pending decisions</p>
              </button>
            </div>
          </section>
        ) : null}


        <section className="space-y-4 lg:hidden">
          <Card className="saas-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-950">Quick actions</CardTitle>
              <CardDescription>
                Jump into the next owner task without hunting through the full dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {isOwnerOperator ? (
                <>
                  <Button className="fleet-primary-btn h-12 rounded-2xl justify-start" onClick={() => goToDriverMode()}>
                    Switch to Driver Mode
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 rounded-2xl justify-start border-[var(--fleet-outline)] bg-white"
                    onClick={() => goToDriverMode("start-inspection")}
                  >
                    Start Inspection
                  </Button>
                </>
              ) : null}
              <Button
                className="h-12 rounded-2xl justify-start bg-slate-900 text-white hover:bg-slate-800"
                onClick={openAddVehicleDialog}
              >
                Add Vehicle
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-2xl justify-start border-[var(--fleet-outline)] bg-white"
                onClick={() => scrollToSection("manager-open-defects-panel")}
              >
                View Open Defects
              </Button>
            </CardContent>
          </Card>

          <Card id="manager-open-defects-panel" className="saas-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-950">Urgent fleet issues</CardTitle>
              <CardDescription>
                The highest-priority items for the fleet right now.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => scrollToSection("manager-open-defects-list")}
                className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-left transition-colors hover:border-red-300 hover:bg-red-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">Open defects</p>
                <p className="mt-2 text-2xl font-semibold text-red-950">
                  {verifiedHealth?.openDefects.length ?? 0}
                </p>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("manager-fleet-operations")}
                className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-left transition-colors hover:border-amber-300 hover:bg-amber-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Missed inspections</p>
                <p className="mt-2 text-2xl font-semibold text-amber-950">
                  {verifiedHealth?.today.missedInspections ?? 0}
                </p>
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("manager-action-queue-panel")}
                className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Needs manager action</p>
                <p className="mt-2 text-2xl font-semibold text-blue-950">
                  {managerActionItems.length}
                </p>
              </button>
            </CardContent>
          </Card>

          <Card className="saas-card border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-950">Today&apos;s inspections</CardTitle>
              <CardDescription>
                Keep today&apos;s inspection status visible without opening the full reporting stack.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Inspected</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {verifiedHealth?.today.inspectedVehicles ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Completion</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {verifiedHealth?.today.completionRate ?? 0}%
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Integrity score</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {verifiedHealth?.averages.fleetIntegrityScore ?? 100}
                </p>
              </div>
            </CardContent>
          </Card>

          <Accordion type="multiple" className="space-y-3">
            <AccordionItem value="snapshot" className="rounded-3xl border border-slate-200 bg-white px-5">
              <AccordionTrigger className="text-base font-semibold text-slate-950">
                Fleet snapshot
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4 text-sm text-slate-600">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Vehicles in fleet</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{vehiclesQuery.data?.length ?? 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Linked drivers</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{drivers.length}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full rounded-2xl" onClick={() => handleOpenAssign()}>
                  Assign Vehicle / Trailer
                </Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="monitoring" className="rounded-3xl border border-slate-200 bg-white px-5">
              <AccordionTrigger className="text-base font-semibold text-slate-950">
                Reports & monitoring
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4 text-sm text-slate-600">
                <p>Daily health, DVIR reports, integrity alerts, and the morning brief remain available below on larger screens.</p>
                <Button
                  variant="outline"
                  className="w-full rounded-2xl"
                  onClick={() => {
                    const firstReport = inspectionReportsQuery.data?.[0];
                    if (firstReport) {
                      navigate(`/inspection-report/${firstReport.id}`);
                      return;
                    }
                    toast.info("No DVIR inspection reports are available yet.");
                  }}
                >
                  Open latest inspection report
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {pilotAccess?.status === "active" ? (
          <section className="hidden lg:block">
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
          </section>
        ) : null}

        {/* KPI row */}
        <section id="manager-open-defects" className="hidden gap-4 lg:grid lg:grid-cols-5">
          <div
            className="rounded-[var(--r-4)] p-5"
            style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--tfx-fg-3)]">Fleet health</p>
            <p
              className="tfx-display mt-1 text-4xl"
              style={{
                color:
                  fleetKpis.fleetHealthPct >= 90
                    ? "var(--status-ok)"
                    : fleetKpis.fleetHealthPct >= 70
                      ? "var(--status-warning)"
                      : "var(--status-critical)",
              }}
            >
              {fleetKpis.fleetHealthPct}%
            </p>
            <p className="mt-1.5 text-xs text-[var(--tfx-fg-3)]">Based on today's verified inspections</p>
          </div>

          <button
            type="button"
            onClick={() => scrollToSection("manager-fleet-operations")}
            className="rounded-[var(--r-4)] p-5 text-left"
            style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--tfx-fg-3)]">Trucks active</p>
            <p className="tfx-display mt-1 text-4xl">
              {fleetKpis.activeVehicles}
              <span className="ml-1 text-xl font-semibold not-italic text-[var(--tfx-fg-3)]">
                {" "}/ {fleetKpis.totalVehicles}
              </span>
            </p>
            <p className="mt-1.5 text-xs text-[var(--tfx-fg-3)]">
              {Math.max(0, fleetKpis.totalVehicles - fleetKpis.activeVehicles)} in maintenance
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              const firstReport = inspectionReportsQuery.data?.[0];
              if (firstReport) {
                navigate(`/inspection-report/${firstReport.id}`);
                return;
              }
              toast.info("No DVIR inspection reports are available yet.");
            }}
            className="rounded-[var(--r-4)] p-5 text-left"
            style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--tfx-fg-3)]">Pending inspections</p>
            <p className="tfx-display mt-1 text-4xl">{fleetKpis.pendingInspections}</p>
            <p className="mt-1.5 text-xs font-semibold" style={{ color: fleetKpis.pendingInspections > 0 ? "var(--status-warning)" : "var(--tfx-fg-3)" }}>
              {fleetKpis.pendingInspections > 0 ? "Due today" : "All caught up"}
            </p>
          </button>

          <button
            type="button"
            onClick={() => scrollToSection("manager-open-defects-panel")}
            className="rounded-[var(--r-4)] p-5 text-left"
            style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.04em] text-[var(--tfx-fg-3)]">
              <span>Open defects</span>
              <span className="text-[var(--tfx-fg-1)]">{fleetKpis.openDefectsTotal}</span>
            </div>
            <div className="mt-3.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              <div className="flex-1" style={{ background: "var(--status-critical)", flexGrow: Math.max(1, fleetKpis.severityCounts.critical) }} />
              <div className="flex-1" style={{ background: "var(--status-warning)", flexGrow: Math.max(1, fleetKpis.severityCounts.high) }} />
              <div className="flex-1" style={{ background: "var(--steel-400)", flexGrow: Math.max(1, fleetKpis.severityCounts.medium + fleetKpis.severityCounts.low) }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-[var(--tfx-fg-3)]">
              <span><span className="font-bold" style={{ color: "var(--status-critical)" }}>{fleetKpis.severityCounts.critical}</span> crit</span>
              <span><span className="font-bold" style={{ color: "var(--status-warning)" }}>{fleetKpis.severityCounts.high}</span> high</span>
              <span><span className="font-bold text-[var(--steel-500)]">{fleetKpis.severityCounts.medium}</span> med</span>
              <span><span className="font-bold" style={{ color: "var(--status-ok)" }}>{fleetKpis.severityCounts.low}</span> low</span>
            </div>
          </button>

          <div
            className="rounded-[var(--r-4)] p-5"
            style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.04em] text-[var(--tfx-fg-3)]">Integrity score</p>
            <p className="tfx-display mt-1 text-4xl" style={{ color: "var(--status-ok)" }}>
              {fleetKpis.integrityScore}
            </p>
            <p className="mt-1.5 text-xs text-[var(--tfx-fg-3)]">Avg. verified inspection</p>
          </div>
        </section>

        {/* Needs manager action */}
        <section
          className="hidden rounded-[var(--r-4)] p-5 lg:block"
          style={{
            background: "var(--tfx-bg-surface)",
            border: "1px solid var(--tfx-border-1)",
            borderTop: "2px solid var(--brand-red)",
            boxShadow: "var(--tfx-shadow-sm)",
          }}
        >
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="tfx-h3">Needs manager action</h2>
            <button
              type="button"
              onClick={() => scrollToSection("manager-fleet-operations")}
              className="text-sm font-semibold"
              style={{ color: "var(--tfx-fg-link)" }}
            >
              Review action queue &rarr;
            </button>
          </div>
          {managerActionItems.length === 0 ? (
            <p className="text-sm text-[var(--tfx-fg-3)]">
              No diagnosis summaries are waiting on manager follow-up right now.
            </p>
          ) : (
            managerActionItems.slice(0, 4).map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3.5 py-3"
                style={{ borderTop: "1px solid var(--tfx-border-1)" }}
              >
                <span
                  className={`w-16 flex-shrink-0 rounded-full px-2.5 py-1 text-center text-[10px] font-bold uppercase tracking-[0.06em] ring-1 ${badgeClasses(item.riskLevel === "high" ? "Critical" : item.riskLevel === "medium" ? "High" : "Low")}`}
                >
                  {item.riskLevel === "high" ? "Critical" : item.riskLevel === "medium" ? "High" : "Medium"}
                </span>
                <div className="tfx-mono w-24 flex-shrink-0 text-sm font-semibold text-[var(--tfx-fg-1)]">
                  {item.truckLabel}
                </div>
                <div className="flex-1 truncate text-sm text-[var(--tfx-fg-2)]">
                  {item.possibleCause || item.summary}
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 text-sm font-semibold"
                  style={{ color: "var(--tfx-fg-link)" }}
                  disabled={!item.defectId}
                  onClick={() => item.defectId && navigate(`/defect/${item.defectId}`)}
                >
                  Review defect
                </button>
              </div>
            ))
          )}
        </section>

        <section className="hidden gap-5 lg:grid lg:grid-cols-[2fr_1fr] lg:items-start">
          {/* DVIR inspection reports table */}
          <div
            className="overflow-x-auto rounded-[var(--r-4)]"
            style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
          >
            <div className="border-b px-5 pb-3.5 pt-4.5" style={{ borderColor: "var(--tfx-border-1)" }}>
              <h2 className="tfx-h3">DVIR inspection reports</h2>
              <p className="mt-1 text-sm text-[var(--tfx-fg-3)]">Verified daily inspections, most recent first.</p>
            </div>
            <div
              className="grid min-w-[600px] grid-cols-[80px_minmax(90px,1fr)_110px_120px_60px_60px] gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--tfx-fg-3)]"
              style={{ background: "var(--tfx-bg-sunken)" }}
            >
              <div>Unit</div>
              <div>Driver</div>
              <div>Timestamp</div>
              <div>Status</div>
              <div className="text-right">Integrity</div>
              <div />
            </div>
            {inspectionReportsQuery.isLoading ? (
              <div className="px-4 py-4 text-sm text-[var(--tfx-fg-3)]">Loading inspection reports...</div>
            ) : null}
            {!inspectionReportsQuery.isLoading && (inspectionReportsQuery.data ?? []).length === 0 ? (
              <div className="px-4 py-4 text-sm text-[var(--tfx-fg-3)]">No DVIR inspection reports have been submitted yet.</div>
            ) : null}
            {(inspectionReportsQuery.data ?? []).map(report => {
              const result = String(report.overallVehicleResult ?? "submitted");
              const statusLabel = result === "no_defect" ? "No defect" : result.replaceAll("_", " ");
              const statusClasses =
                result === "not_safe_to_operate"
                  ? "bg-red-50 text-red-700"
                  : result === "no_defect"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-800";
              return (
                <div
                  key={report.id}
                  className="grid min-w-[600px] grid-cols-[80px_minmax(90px,1fr)_110px_120px_60px_60px] items-center gap-2 px-4 py-3"
                  style={{ borderTop: "1px solid var(--tfx-border-1)" }}
                >
                  <div className="tfx-mono truncate text-sm font-bold text-[var(--tfx-fg-1)]">{report.vehicleLabel}</div>
                  <div className="truncate text-sm text-[var(--tfx-fg-2)]">{report.driverName}</div>
                  <div className="tfx-mono text-xs text-[var(--tfx-fg-3)]">{formatReportTimestamp(report.submittedAt)}</div>
                  <span className={`w-fit justify-self-start rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] ${statusClasses}`}>
                    {statusLabel}
                  </span>
                  <div className="tfx-mono text-right text-sm font-bold text-[var(--tfx-fg-1)]">{report.integrityScore ?? "N/A"}</div>
                  <button
                    type="button"
                    className="justify-self-end rounded-md px-2.5 py-1.5 text-xs font-semibold"
                    style={{ border: "1px solid var(--tfx-border-2)", color: "var(--tfx-fg-2)" }}
                    onClick={() => navigate(`/inspection-report/${report.id}`)}
                  >
                    View
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            <div
              className="rounded-[var(--r-4)] p-4.5"
              style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
            >
              <h3 className="tfx-h4 mb-3">Fleet snapshot</h3>
              {[
                { label: "Vehicles in fleet", value: vehiclesQuery.data?.length ?? 0 },
                { label: "Linked drivers", value: drivers.length },
                {
                  label: "Inspected today",
                  value: `${verifiedHealth?.today.inspectedVehicles ?? 0} / ${vehiclesQuery.data?.length ?? 0}`,
                },
                { label: "Missed inspections", value: verifiedHealth?.today.missedInspections ?? 0 },
              ].map(item => (
                <div
                  key={item.label}
                  className="flex items-baseline justify-between py-2"
                  style={{ borderTop: "1px solid var(--tfx-border-1)" }}
                >
                  <span className="text-sm text-[var(--tfx-fg-2)]">{item.label}</span>
                  <span className="tfx-mono text-base font-bold text-[var(--tfx-fg-1)]">{item.value}</span>
                </div>
              ))}
              <Button
                variant="outline"
                className="mt-3 w-full rounded-xl"
                onClick={() => handleOpenAssign()}
              >
                Assign Vehicle / Trailer
              </Button>
            </div>

            <div
              className="rounded-[var(--r-4)] p-4.5"
              style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
            >
              <h3 className="tfx-h4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Daily vehicle health
              </h3>
              <p className="mb-3 mt-0.5 text-xs text-[var(--tfx-fg-3)]">
                Completion, defects, photo &amp; location proof combined.
              </p>
              {(verifiedHealth?.vehicles ?? []).length === 0 ? (
                <p className="text-sm text-[var(--tfx-fg-3)]">No verified inspections yet today.</p>
              ) : (
                verifiedHealth?.vehicles.slice(0, 4).map(vehicle => (
                  <div key={vehicle.vehicleId} className="py-3" style={{ borderTop: "1px solid var(--tfx-border-1)" }}>
                    <div className="flex items-center justify-between">
                      <span className="tfx-mono text-sm font-bold text-[var(--tfx-fg-1)]">{vehicle.unit}</span>
                      {vehicle.status === "critical" ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]"
                          style={{ background: "rgba(216,31,42,0.1)", color: "var(--brand-red)" }}
                        >
                          Critical
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--tfx-fg-3)]">
                      {vehicle.openDefects} open defects &middot; Integrity {vehicle.integrityScore ?? "N/A"} &middot;{" "}
                      {vehicle.assignedDriverName ?? "No driver assigned"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span
                        className="rounded-[var(--r-1)] px-2 py-1 text-[11px]"
                        style={{ background: "var(--tfx-bg-sunken)", border: "1px solid var(--tfx-border-1)", color: "var(--tfx-fg-3)" }}
                      >
                        Location {vehicle.locationProofCaptured ? "captured" : "missing"}
                      </span>
                      <span
                        className="rounded-[var(--r-1)] px-2 py-1 text-[11px]"
                        style={{ background: "var(--tfx-bg-sunken)", border: "1px solid var(--tfx-border-1)", color: "var(--tfx-fg-3)" }}
                      >
                        Photo {vehicle.photoProofSubmitted ? "submitted" : "missing"}
                      </span>
                      {vehicle.latestAiRecommendation ? (
                        <span
                          className="rounded-[var(--r-1)] px-2 py-1 text-[11px]"
                          style={{ background: "var(--tfx-bg-sunken)", border: "1px solid var(--tfx-border-1)", color: "var(--tfx-fg-3)" }}
                        >
                          AI: {vehicle.latestAiRecommendation}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              className="rounded-[var(--r-4)] p-4.5"
              style={{ background: "var(--tfx-bg-surface)", border: "1px solid var(--tfx-border-1)", boxShadow: "var(--tfx-shadow-sm)" }}
            >
              <h3 className="tfx-h4 mb-3">Inspection integrity alerts</h3>
              {(verifiedHealth?.integrityAlerts ?? []).length === 0 ? (
                <p className="text-sm text-[var(--tfx-fg-3)]">No integrity alerts are waiting for review.</p>
              ) : (
                verifiedHealth?.integrityAlerts.slice(0, 4).map(alert => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-2.5 py-2.5"
                    style={{ borderTop: "1px solid var(--tfx-border-1)" }}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "var(--status-warning)" }} />
                    <div>
                      <p className="text-sm font-bold text-[var(--tfx-fg-1)]">{alert.flagType.replaceAll("_", " ")}</p>
                      <p className="mt-0.5 text-xs text-[var(--tfx-fg-3)]">{alert.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section>
          <Card className="saas-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Early warnings
              </CardTitle>
              <CardDescription>
                Rule-based signals flagging vehicles that need attention before
                they become costly downtime. Click a warning to open the issue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EarlyWarningList
                warnings={earlyWarnings}
                showVehicle
                onSelect={(warning) =>
                  navigate(
                    warning.defectId
                      ? `/defect/${warning.defectId}`
                      : `/truck/${warning.vehicleId}`
                  )
                }
                emptyMessage="No active early warnings. Vehicles are clear."
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card id="manager-open-defects-list" className="saas-card scroll-mt-4">
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
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Manager status
                        </p>
                        <span className="text-sm font-semibold text-slate-900">
                          {formatManagerReviewStatus(defect.managerReviewStatus)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {managerReviewOptions.map(option => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={defect.managerReviewStatus === option.value ? "default" : "outline"}
                            size="sm"
                            className="rounded-xl"
                            disabled={updateDefectReviewMutation.isPending}
                            onClick={() =>
                              updateDefectReviewMutation.mutate({
                                defectId: defect.id,
                                managerReviewStatus: option.value,
                              })
                            }
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
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

        <section id="manager-fleet-operations" className="grid scroll-mt-4 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
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
                  disabled={!managerActionItems[0]?.defectId}
                  onClick={() => managerActionItems[0]?.defectId && navigate(`/defect/${managerActionItems[0].defectId}`)}
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

            <div className="space-y-4 px-4 pb-4 lg:hidden">
              {rows.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  {vehiclesQuery.isLoading
                    ? "Loading your fleet vehicles..."
                    : search.trim()
                      ? "No vehicles match that search."
                      : "No vehicles in this fleet yet. Add a vehicle to start assigning drivers and tracking fleet health."}
                </div>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{row.truck}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                          {row.detail}
                        </p>
                        {row.relationship ? (
                          <p className="mt-2 text-xs font-medium text-blue-700">
                            {row.relationship}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Assigned driver
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {row.assignedDriver}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Inspection
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {row.inspection}
                        </p>
                      </div>
                    </div>

                    {row.isOwnerOperatorSelfAssigned ? (
                      <p className="mt-3 text-sm text-blue-700">
                        Assigned to you
                        {row.ownerOperatorPreviousDriverName
                          ? `, will restore ${row.ownerOperatorPreviousDriverName} when released.`
                          : "."}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setReportIssueVehicle({ id: String(row.id), label: row.truck })}
                      >
                        Report issue
                      </Button>
                      {isOperationalOwnerOperatorAsset(row) ? (
                        row.isOwnerOperatorSelfAssigned ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full border-blue-200 text-blue-700 hover:bg-blue-50"
                            disabled={releaseSelfAssignmentMutation.isPending}
                            onClick={() => void handleReleaseSelfAssignment(row)}
                          >
                            Release self-assignment
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                            disabled={assignToSelfMutation.isPending}
                            onClick={() => void handleAssignToSelf(row)}
                          >
                            Assign to me
                          </Button>
                        )
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden overflow-x-auto lg:block">
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
                              {row.relationship ? (
                                <p className="mt-2 text-xs font-medium text-blue-700">
                                  {row.relationship}
                                </p>
                              ) : null}
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full"
                              onClick={() => setReportIssueVehicle({ id: String(row.id), label: row.truck })}
                            >
                              Report issue
                            </Button>
                            {isOperationalOwnerOperatorAsset(row) ? (
                              row.isOwnerOperatorSelfAssigned ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full border-blue-200 text-blue-700 hover:bg-blue-50"
                                  disabled={releaseSelfAssignmentMutation.isPending}
                                  onClick={() => void handleReleaseSelfAssignment(row)}
                                >
                                  Release self-assignment
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="rounded-full bg-slate-900 text-white hover:bg-slate-800"
                                  disabled={assignToSelfMutation.isPending}
                                  onClick={() => void handleAssignToSelf(row)}
                                >
                                  Assign to me
                                </Button>
                              )
                            ) : null}
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
            <Card id="manager-action-queue-panel" className="saas-card scroll-mt-4">
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
                          disabled={!item.defectId}
                          onClick={() =>
                            item.defectId && navigate(`/defect/${item.defectId}`)
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
                  Common manager tasks for profile, vehicles, and open diagnosis follow-up.
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
                  disabled={!managerActionItems[0]?.defectId}
                  onClick={() => managerActionItems[0]?.defectId && navigate(`/defect/${managerActionItems[0].defectId}`)}
                >
                  Open maintenance queue
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Dialog
          open={selfAssignmentWarning != null}
          onOpenChange={(open) => {
            if (!open) {
              setSelfAssignmentWarning(null);
            }
          }}
        >
          <DialogContent className="rounded-[24px] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Take over assignment?</DialogTitle>
              <DialogDescription>
                {selfAssignmentWarning?.currentDriverName
                  ? `${selfAssignmentWarning.vehicleLabel} is currently assigned to ${selfAssignmentWarning.currentDriverName}. Assign it to yourself instead?`
                  : "This vehicle is currently assigned. Assign it to yourself instead?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSelfAssignmentWarning(null)}
              >
                Cancel
              </Button>
              <Button
                className="bg-slate-900 text-white hover:bg-slate-800"
                disabled={assignToSelfMutation.isPending}
                onClick={() => {
                  if (!selfAssignmentWarning) return;
                  const row = rows.find(
                    (candidate) => String(candidate.id) === selfAssignmentWarning.vehicleId
                  );
                  if (!row) {
                    setSelfAssignmentWarning(null);
                    toast.error("TruckFixr could not find that vehicle row anymore.");
                    return;
                  }
                  void handleAssignToSelf(row, true);
                }}
              >
                Assign to me
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={reportIssueVehicle != null}
          onOpenChange={(open) => {
            if (!open) setReportIssueVehicle(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report issue{reportIssueVehicle ? ` — ${reportIssueVehicle.label}` : ""}</DialogTitle>
              <DialogDescription>
                Capture a problem on this vehicle for triage before repair and reporting.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dash-report-title">What's wrong</Label>
                <Input
                  id="dash-report-title"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g. Check engine light + derate on the highway"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-report-description">Details (optional)</Label>
                <Textarea
                  id="dash-report-description"
                  rows={3}
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-report-symptoms">Symptoms (one per line, optional)</Label>
                <Textarea
                  id="dash-report-symptoms"
                  rows={3}
                  value={reportSymptoms}
                  onChange={(e) => setReportSymptoms(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={createDefect.isPending || !reportTitle.trim()} onClick={submitReportIssue}>
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isAssignDialogOpen}
          onOpenChange={open => {
            setIsAssignDialogOpen(open);
            if (!open) {
              resetAssignmentDialog();
            }
          }}
        >
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
                            {v.unitNumber} | {v.assetType} {v.licensePlate ? `| ${v.licensePlate}` : ""}
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
                              {d.name} | {d.email}
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

        <div
          className="flex items-center justify-center gap-2.5 rounded-[var(--r-4)] px-4 py-3"
          style={{ background: "var(--tfx-bg-sunken)", border: "1px solid var(--tfx-border-1)" }}
        >
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--tfx-fg-3)" }} />
          <p className="text-center text-xs text-[var(--tfx-fg-3)]">
            Safety notice: do not use TruckFixr while driving. Pull over safely before reading results or
            following diagnostic instructions.
          </p>
        </div>
      </main>

      {/* Mobile-only quick actions: exception-based entry points kept within
          thumb reach on a long dashboard. Desktop keeps the header controls. */}
      <nav
        aria-label="Manager quick actions"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--fleet-outline)] bg-white/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
          <button
            type="button"
            onClick={() => scrollToSection("manager-open-defects-panel")}
            className="relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-[var(--fleet-ink)] hover:bg-[var(--fleet-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fleet-ink)]"
          >
            <AlertTriangle className="h-5 w-5" />
            Urgent
            {(verifiedHealth?.openDefects.length ?? 0) > 0 ? (
              <span
                aria-label={`${verifiedHealth?.openDefects.length} open defects`}
                className="absolute right-[calc(50%-2rem)] top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
              >
                {verifiedHealth?.openDefects.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("manager-fleet-operations")}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-[var(--fleet-ink)] hover:bg-[var(--fleet-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fleet-ink)]"
          >
            <Truck className="h-5 w-5" />
            Vehicles
          </button>
          <button
            type="button"
            onClick={openAddVehicleDialog}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-[var(--fleet-ink)] hover:bg-[var(--fleet-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fleet-ink)]"
          >
            <Plus className="h-5 w-5" />
            Add Vehicle
          </button>
        </div>
      </nav>
    </div>
  );
}

export default function ManagerDashboardFixed() {
  const internalAdminQuery = trpc.admin.me.useQuery(undefined, { retry: false });

  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <ManagerDashboardFixedContent internalAdminRole={internalAdminQuery.data?.role ?? null} />
    </RoleBasedRoute>
  );
}
