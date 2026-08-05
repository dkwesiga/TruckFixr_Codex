import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import { useAuthContext } from "@/hooks/useAuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import QuickStartBanner from "@/components/quickStart/QuickStartBanner";
import SafetyNotice from "@/components/SafetyNotice";
import VehicleAccessRequestDialog from "@/components/VehicleAccessRequestDialog";
import IssueClarifyingQuestionsWizard from "@/components/IssueClarifyingQuestionsWizard";
import {
  useOwnerOperatorReturnToOwner,
} from "@/hooks/useOwnerOperatorModeNavigation";
import { getBrowserStorage, getQueuedInspectionSubmissions, loadInspectionDraft } from "@/lib/inspectionDrafts";
import { enqueueIssueReport, flushQueuedIssueReports, getQueuedIssueReports } from "@/lib/issueDrafts";
import { trackEvent, trackInspectionStarted } from "@/lib/analytics";
import {
  loadLastDriverVehicleContext,
  saveLastDriverVehicleContext,
} from "@/lib/driverVehicleContext";
import { isOwnerOperatorEnabled } from "@/lib/ownerOperator";
import { trpc } from "@/lib/trpc";
import { type DriverVehicleRecord } from "@/lib/driverVehicles";
import { formatDistanceKm } from "@/lib/vehicleDisplay";
import { AlertCircle, BookOpenCheck, Camera, CheckCircle2, Eye, FileText, Gauge, Info, LogOut, Menu, SearchCode, ShieldCheck, Stethoscope, Truck, TriangleAlert, Wrench } from "lucide-react";
import { toast } from "sonner";

type DriverVehicle = DriverVehicleRecord & {
  linkedPoweredVehicleId?: string | number | null;
};

type ActivityEntry = {
  key: string;
  kind: "inspection" | "issue" | "triage";
  timestamp: number;
  title: string;
  subtitle: string;
  href: string;
  severity?: string | null;
};

type TriageResult = {
  most_likely_cause?: string;
  severity?: string;
  confidence_score?: number;
  recommended_action?: string;
  driver_message?: string;
  safety_warning?: string | null;
  suggested_next_steps?: string[] | null;
};


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

function isTrailerAsset(assetType?: string | null) {
  return Boolean(assetType?.toLowerCase().includes("trailer"));
}

function formatVinLastSix(vin?: string | null) {
  const value = String(vin ?? "").trim();
  if (!value) return "Not available";
  return value.length <= 6 ? value : `…${value.slice(-6)}`;
}

function isDemoDriverEmail(email?: string | null) {
  return String(email ?? "").trim().toLowerCase().endsWith("@truckfixr-demo.example.com");
}

function hasMatchingVehicleId(
  left: string | number | null | undefined,
  right: string | number | null | undefined
) {
  return left != null && right != null && String(left) === String(right);
}

function resolveLinkedInspectionPair(
  vehicles: DriverVehicle[],
  preferredVehicleId: string | number | null
) {
  const findTrailerForPoweredVehicle = (poweredVehicle: DriverVehicle | null) =>
    poweredVehicle
      ? vehicles.find(
          (vehicle) =>
            isTrailerAsset(vehicle.assetType) &&
            hasMatchingVehicleId(vehicle.linkedPoweredVehicleId ?? null, poweredVehicle.id)
        ) ?? null
      : null;

  const findPoweredVehicleForTrailer = (trailer: DriverVehicle | null) =>
    trailer?.linkedPoweredVehicleId != null
      ? vehicles.find(
          (vehicle) =>
            !isTrailerAsset(vehicle.assetType) &&
            hasMatchingVehicleId(vehicle.id, trailer.linkedPoweredVehicleId)
        ) ?? null
      : null;

  const preferredVehicle =
    vehicles.find((vehicle) => hasMatchingVehicleId(vehicle.id, preferredVehicleId)) ?? null;

  if (preferredVehicle) {
    const preferredPoweredVehicle = isTrailerAsset(preferredVehicle.assetType)
      ? findPoweredVehicleForTrailer(preferredVehicle)
      : preferredVehicle;
    const preferredTrailer = isTrailerAsset(preferredVehicle.assetType)
      ? preferredVehicle
      : findTrailerForPoweredVehicle(preferredVehicle);

    if (preferredPoweredVehicle && preferredTrailer) {
      return {
        poweredVehicle: preferredPoweredVehicle,
        trailer: preferredTrailer,
      };
    }
  }

  for (const vehicle of vehicles) {
    if (isTrailerAsset(vehicle.assetType)) continue;
    const trailer = findTrailerForPoweredVehicle(vehicle);
    if (trailer) {
      return {
        poweredVehicle: vehicle,
        trailer,
      };
    }
  }

  return null;
}

function createInspectionSessionId(driverId?: number | string) {
  return `driver-${driverId ?? "user"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function filesToDataUrls(files: FileList | null) {
  if (!files?.length) return [];
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        })
    )
  );
}

function DriverDashboardContent() {
  const { user, logout } = useAuthContext();
  const [, navigate] = useLocation();
  const storedVehicle = useMemo(() => loadLastDriverVehicleContext(), []);
  const launchIntent = useMemo(
    () => new URLSearchParams(window.location.search).get("intent"),
    []
  );
  const [activeVehicleId, setActiveVehicleId] = useState<number | string>(
    () => storedVehicle?.id ?? 0
  );
  const [handledLaunchIntent, setHandledLaunchIntent] = useState<string | null>(null);
  const [isIssueDialogOpen, setIsIssueDialogOpen] = useState(false);
  // "Report a Problem" is a single AI-first flow: form -> (online) triaging ->
  // result, or a manual/offline file when there is no connection.
  const [reportPhase, setReportPhase] = useState<"form" | "clarifying_questions" | "triaging" | "result">("form");
  const [clarifyingQuestions, setClarifyingQuestions] = useState<Array<{ question: string }>>([]);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);
  const [filedDefectId, setFiledDefectId] = useState<number | null>(null);
  const [issueForm, setIssueForm] = useState({
    title: "",
    category: "driver_reported_issue",
    severity: "medium" as "low" | "medium" | "high" | "critical",
    description: "",
    photoUrls: [] as string[],
  });
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const storage = useMemo(() => getBrowserStorage(), []);
  const [queuedIssueCount, setQueuedIssueCount] = useState(() =>
    getQueuedIssueReports(storage).length
  );
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const trackPilotEventMutation = trpc.subscriptions.trackPilotEvent.useMutation();
  const activeFleetId = subscriptionQuery.data?.activeFleetId ?? (user as any)?.fleetId ?? 0;
  const vehiclesQuery = trpc.vehicles.listMine.useQuery(undefined, {
    staleTime: 30_000,
    enabled: Boolean(user?.id),
  });
  const myRequestsQuery = trpc.vehicleAccess.listMyRequests.useQuery(
    { fleetId: activeFleetId },
    { staleTime: 15_000, enabled: activeFleetId > 0 }
  );
  const inspectionReportsQuery = trpc.inspections.getMyReports.useQuery(
    { limit: 5 },
    { staleTime: 30_000, enabled: Boolean(user?.id) }
  );
  const myReportedIssuesQuery = trpc.defects.listMyRecent.useQuery(
    { limit: 8 },
    { staleTime: 30_000, enabled: Boolean(user?.id) }
  );
  const reportIssueMutation = trpc.defects.reportIssue.useMutation();
  const runTriageMutation = trpc.defects.runTriage.useMutation();
  const submitClarifyingAnswersMutation = trpc.defects.submitClarifyingAnswers.useMutation();
  const vehicles = useMemo<DriverVehicle[]>(() => {
    const rows = vehiclesQuery.data ?? [];
    return rows.map((vehicle) => ({
      id: vehicle.id,
      fleetId: vehicle.fleetId,
      label: vehicle.unitNumber?.trim() || vehicle.licensePlate?.trim() || vehicle.vin,
      relationshipSummary:
        typeof vehicle.linkedVehicleSummary === "string" ? vehicle.linkedVehicleSummary : null,
      linkedPoweredVehicleId: vehicle.linkedPoweredVehicleId ?? null,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate || "UNKNOWN",
      make: vehicle.make || "Truck",
      engineMake: vehicle.engineMake || "",
      model: vehicle.model || "Unit",
      year: vehicle.year ?? null,
      mileage: vehicle.mileage ?? 0,
      status: vehicle.complianceStatus === "red" || vehicle.status === "maintenance" ? "Needs Review" : "Operational",
      assetType: vehicle.assetType,
    })) as DriverVehicle[];
  }, [vehiclesQuery.data]);
  const activeVehicle = vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? vehicles[0] ?? null;
  const pilotAccess = subscriptionQuery.data?.pilotAccess ?? null;
  const inspectionReports = inspectionReportsQuery.data ?? [];
  const latestInspectionReport = inspectionReports[0];
  const latestInspection = latestInspectionReport
    ? {
        detail: `${formatReportTimestamp(latestInspectionReport.submittedAt)} - ${String(
          latestInspectionReport.overallVehicleResult ?? "submitted"
        ).replaceAll("_", " ")}`,
      }
    : null;
  const reportedIssues = myReportedIssuesQuery.data ?? [];
  const activityFeed = useMemo<ActivityEntry[]>(() => {
    const toTime = (value: unknown) => {
      if (!value) return 0;
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };

    const inspectionEntries: ActivityEntry[] = inspectionReports.map((report) => ({
      key: `inspection-${report.id}`,
      kind: "inspection",
      timestamp: toTime(report.submittedAt),
      title: "DVIR inspection report",
      subtitle: `${report.vehicleLabel} | Integrity ${report.integrityScore ?? "N/A"}`,
      href: `/inspection-report/${report.id}`,
    }));

    const issueEntries: ActivityEntry[] = reportedIssues.map((issue) => {
      const fromTriage =
        issue.sourceType === "ai_triage" || issue.aiConfidenceScore != null;
      return {
        key: `issue-${issue.id}`,
        kind: fromTriage ? "triage" : "issue",
        timestamp: toTime(issue.createdAt),
        title: issue.title,
        subtitle: `${issue.vehicleLabel} | ${String(issue.status ?? "open").replaceAll("_", " ")}`,
        href: `/defect/${issue.id}`,
        severity: issue.severity ?? null,
      };
    });

    return [...inspectionEntries, ...issueEntries].sort((a, b) => b.timestamp - a.timestamp);
  }, [inspectionReports, reportedIssues]);
  const pendingDrafts = useMemo(
    () =>
      vehicles
        .map((vehicle) => ({
          vehicle,
          draft: typeof vehicle.id === "number" ? loadInspectionDraft(storage, vehicle.id) : null,
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
  const pendingRequests = myRequestsQuery.data ?? [];
  const hasVehicles = vehicles.length > 0;
  const resolvedFleetId =
    activeVehicle?.fleetId ?? vehicles[0]?.fleetId ?? storedVehicle?.fleetId ?? activeFleetId;
  const fleetQuery = trpc.fleet.getById.useQuery(
    { fleetId: resolvedFleetId },
    { staleTime: 60_000, enabled: resolvedFleetId > 0 }
  );
  const activeDefectsQuery = trpc.defects.listByVehicle.useQuery(
    { vehicleId: activeVehicle?.id ?? "", status: "open" },
    { staleTime: 30_000, enabled: Boolean(activeVehicle?.id) }
  );
  const isOwnerOperator = isOwnerOperatorEnabled(user);
  const driverModeEnabled =
    isOwnerOperator ||
    Boolean(fleetQuery.data?.driverModeEnabled) ||
    isDemoDriverEmail(user?.email);
  const queuedInspections = getQueuedInspectionSubmissions(storage);
  const linkedInspectionPair = useMemo(
    () => resolveLinkedInspectionPair(vehicles, activeVehicleId),
    [activeVehicleId, vehicles]
  );
  const poweredAssignedVehicle = linkedInspectionPair?.poweredVehicle ?? null;
  const assignedTrailer = linkedInspectionPair?.trailer ?? null;
  const canStartCombinedInspection = Boolean(linkedInspectionPair);

  useEffect(() => {
    if (!vehicles.length) {
      setActiveVehicleId(0);
      return;
    }

    if (!vehicles.some((vehicle) => vehicle.id === activeVehicleId)) {
      setActiveVehicleId(vehicles[0].id);
    }
  }, [activeVehicleId, vehicles]);

  const activeVehicleDisplay = useMemo(() => {
    if (!activeVehicle) return "No assigned vehicle";
    const yearPrefix = activeVehicle.year ? `${activeVehicle.year} ` : "";
    return `${yearPrefix}${activeVehicle.make} ${activeVehicle.model}`.trim();
  }, [activeVehicle]);

  useEffect(() => {
    const syncQueuedIssues = async () => {
      const result = await flushQueuedIssueReports(storage, (submission) =>
        reportIssueMutation.mutateAsync(submission)
      );
      setQueuedIssueCount(result.remainingCount);
      if (result.flushedCount > 0) {
        trackEvent("issue_synced_after_offline_draft", {
          count: result.flushedCount,
        });
        toast.success(`${result.flushedCount} queued issue report${result.flushedCount === 1 ? "" : "s"} synced.`);
        void activeDefectsQuery.refetch();
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      void syncQueuedIssues();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void syncQueuedIssues();
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [activeDefectsQuery, reportIssueMutation, storage]);

  const initials = useMemo(() => {
    const name = user?.name?.trim() || "Driver";
    return name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  }, [user?.name]);

  const readinessLabel = activeVehicle?.status === "Operational" ? "Ready" : "Attention";
  const activeOpenDefects = activeDefectsQuery.data ?? [];
  const hasCriticalOpenDefect = activeOpenDefects.some((defect) => defect.severity === "critical");
  const hasActiveQueuedInspection = activeVehicle
    ? queuedInspections.some((entry) => String(entry.vehicleId) === String(activeVehicle.id))
    : false;
  const hasActiveQueuedIssue = activeVehicle
    ? getQueuedIssueReports(storage).some((entry) => String(entry.vehicleId) === String(activeVehicle.id))
    : false;
  const todayInspectionStatus = pendingDraftForActiveVehicle
    ? "Saved Locally"
    : hasActiveQueuedInspection || hasActiveQueuedIssue
      ? "Sync Pending"
      : hasCriticalOpenDefect
        ? "Critical Defect Reported"
        : activeOpenDefects.length > 0
          ? "Defect Reported"
          : latestInspectionReport
            ? "Submitted"
            : "Not Started";
  const hasDriverModeWorkInProgress =
    pendingDrafts.length > 0 ||
    isIssueDialogOpen ||
    issueForm.title.trim().length > 0 ||
    issueForm.description.trim().length > 0 ||
    issueForm.photoUrls.length > 0;
  const {
    canReturnToOwnerDashboard,
    requestReturnToOwnerDashboard,
    ownerDashboardReturnDialog,
  } = useOwnerOperatorReturnToOwner({
    hasInProgressWork: hasDriverModeWorkInProgress,
    description:
      "You have work in progress in Driver Mode. Leaving now may interrupt an inspection draft or issue report.",
  });

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
      metadata: {
        source: "driver_dashboard",
      },
    });
  }, [activeFleetId, pilotAccess, trackPilotEventMutation]);

  const startInspection = (vehicle: DriverVehicle) => {
    const inspectionSessionId = createInspectionSessionId(user?.id);
    const numericVehicleId = Number(vehicle.id);
    if (Number.isFinite(numericVehicleId)) {
      trackInspectionStarted(Date.now(), numericVehicleId, {
        source: "driver_dashboard",
        vehicle_label: vehicle.label,
        flow: "daily_inspection",
        inspection_session_id: inspectionSessionId,
      });
    }
    setActiveVehicleId(vehicle.id);
    saveLastDriverVehicleContext({
      id: vehicle.id,
      fleetId: vehicle.fleetId,
      label: vehicle.label,
      relationshipSummary: vehicle.relationshipSummary ?? null,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      engineMake: vehicle.engineMake,
      mileage: vehicle.mileage,
      status: vehicle.status,
    });
    window.location.href =
      `/inspection?vehicle=${encodeURIComponent(String(vehicle.id))}` +
      `&fleet=${encodeURIComponent(String(vehicle.fleetId))}` +
      `&session=${encodeURIComponent(inspectionSessionId)}` +
      "&mode=daily";
  };

  const startCombinedInspection = () => {
    if (!poweredAssignedVehicle || !assignedTrailer) return;

    const inspectionSessionId = createInspectionSessionId(user?.id);
    const numericVehicleId = Number(poweredAssignedVehicle.id);
    if (Number.isFinite(numericVehicleId)) {
      trackInspectionStarted(Date.now(), numericVehicleId, {
        source: "driver_dashboard",
        vehicle_label: poweredAssignedVehicle.label,
        flow: "combined_truck_trailer_inspection",
        trailer_id: assignedTrailer.id,
        inspection_session_id: inspectionSessionId,
      });
    }
    setActiveVehicleId(poweredAssignedVehicle.id);
    saveLastDriverVehicleContext({
      id: poweredAssignedVehicle.id,
      fleetId: poweredAssignedVehicle.fleetId,
      label: poweredAssignedVehicle.label,
      relationshipSummary: poweredAssignedVehicle.relationshipSummary ?? null,
      vin: poweredAssignedVehicle.vin,
      licensePlate: poweredAssignedVehicle.licensePlate,
      make: poweredAssignedVehicle.make,
      model: poweredAssignedVehicle.model,
      year: poweredAssignedVehicle.year,
      engineMake: poweredAssignedVehicle.engineMake,
      mileage: poweredAssignedVehicle.mileage,
      status: poweredAssignedVehicle.status,
    });
    window.location.href =
      `/inspection?vehicle=${encodeURIComponent(String(poweredAssignedVehicle.id))}` +
      `&trailer=${encodeURIComponent(String(assignedTrailer.id))}` +
      `&fleet=${encodeURIComponent(String(poweredAssignedVehicle.fleetId))}` +
      `&session=${encodeURIComponent(inspectionSessionId)}` +
      "&combo=truck";
  };

  useEffect(() => {
    if (!activeVehicle || launchIntent !== "start-inspection" || handledLaunchIntent === launchIntent) {
      return;
    }

    setHandledLaunchIntent(launchIntent);
    startInspection(activeVehicle);
  }, [activeVehicle, handledLaunchIntent, launchIntent]);

  const openIssueReport = (vehicle: DriverVehicle) => {
    setActiveVehicleId(vehicle.id);
    setIssueForm({
      title: "",
      category: "driver_reported_issue",
      severity: "medium",
      description: "",
      photoUrls: [],
    });
    setReportPhase("form");
    setTriageResult(null);
    setFiledDefectId(null);
    setIsIssueDialogOpen(true);
  };

  const handleIssuePhotos = async (files: FileList | null) => {
    const photoUrls = await filesToDataUrls(files);
    setIssueForm((current) => ({
      ...current,
      photoUrls: [...current.photoUrls, ...photoUrls],
    }));
    trackEvent("photo_uploaded", {
      source: "driver_mode_issue_report",
      vehicle_id: activeVehicle?.id,
      count: photoUrls.length,
    });
  };

  const submitIssueReport = async () => {
    if (!activeVehicle) return;
    if (!issueForm.title.trim()) {
      return;
    }

    const localDraftId = `issue-${activeVehicle.id}-${Date.now()}`;
    const submission = {
      fleetId: resolvedFleetId,
      vehicleId: activeVehicle.id,
      title: issueForm.title.trim(),
      description: issueForm.description.trim() || undefined,
      category: issueForm.category,
      severity: issueForm.severity,
      photoUrls: issueForm.photoUrls,
      localDraftId,
    };

    if (!isOnline) {
      enqueueIssueReport(storage, submission);
      setQueuedIssueCount(getQueuedIssueReports(storage).length);
      trackEvent("issue_saved_locally", {
        vehicle_id: activeVehicle.id,
        severity: issueForm.severity,
      });
      toast.success("Issue saved offline. TruckFixr will upload it automatically when you are back online.");
      setIsIssueDialogOpen(false);
      return;
    }

    let result;

    try {
      result = await reportIssueMutation.mutateAsync(submission);
    } catch (error) {
      if (!navigator.onLine) {
        enqueueIssueReport(storage, submission);
        setQueuedIssueCount(getQueuedIssueReports(storage).length);
        trackEvent("issue_saved_locally", {
          vehicle_id: activeVehicle.id,
          severity: issueForm.severity,
          source: "submit_retry_after_disconnect",
        });
        toast.success("Connection dropped. TruckFixr saved the issue offline and will sync it automatically.");
        setIsIssueDialogOpen(false);
        return;
      }

      toast.error(error instanceof Error ? error.message : "Issue submission failed");
      return;
    }

    trackEvent("issue_submitted", {
      source: "driver_mode",
      vehicle_id: activeVehicle.id,
      defect_id: result.defectId,
      severity: issueForm.severity,
    });
    if (issueForm.severity === "critical") {
      trackEvent("critical_defect_marked", {
        vehicle_id: activeVehicle.id,
        defect_id: result.defectId,
      });
    }

    setFiledDefectId(result.defectId);
    void activeDefectsQuery.refetch();
    void myReportedIssuesQuery.refetch();

    // AI-first: the issue is now filed for the manager; run AI triage on it.
    // If confidence is low, show clarifying questions. Otherwise show the result.
    setReportPhase("triaging");
    try {
      const triageResponse = await runTriageMutation.mutateAsync({ defectId: result.defectId });
      const triage = triageResponse.triage ?? null;
      setTriageResult((triage) as TriageResult | null);

      // Check if we need clarifying questions (confidence < 85%)
      // Show questions even if they come from fallback/default
      const hasQuestions = triage?.clarifying_questions && triage.clarifying_questions.length > 0;
      if (triage && triage.confidence_score < 85 && hasQuestions) {
        setClarifyingQuestions(triage.clarifying_questions.map(q => ({ question: q })));
        setReportPhase("clarifying_questions");
      } else if (triage && triage.confidence_score < 85 && !hasQuestions) {
        // Low confidence but no questions — provide default question
        setClarifyingQuestions([
          { question: "Can you provide more details about when this issue started and whether it's getting worse?" }
        ]);
        setReportPhase("clarifying_questions");
      } else {
        setReportPhase("result");
      }

      trackEvent("driver_report_triage_completed", {
        vehicle_id: activeVehicle.id,
        defect_id: result.defectId,
        confidence: triage?.confidence_score,
        recommended_action: triage?.recommended_action,
      });
    } catch {
      setTriageResult(null);
      toast.info("Issue reported to your manager. AI triage could not run right now.");
      setReportPhase("result");
    }
    void myReportedIssuesQuery.refetch();
  };

  const handleSubmitClarifyingAnswers = async (
    answers: Array<{ question: string; answer: string }>
  ) => {
    if (!filedDefectId) return;

    setReportPhase("triaging");
    try {
      const response = await submitClarifyingAnswersMutation.mutateAsync({
        defectId: filedDefectId,
        answers,
      });

      setTriageResult((response.triage ?? null) as TriageResult | null);
      trackEvent("driver_clarifying_answers_submitted", {
        defect_id: filedDefectId,
        confidence: response.triage?.confidence_score,
        confidence_met_target: response.confidenceMetTarget,
      });

      setReportPhase("result");
    } catch (error) {
      toast.error("Failed to process your answers. Please try again.");
      setReportPhase("clarifying_questions");
    }
  };

  if (resolvedFleetId > 0 && !fleetQuery.isLoading && !driverModeEnabled) {
    return (
      <div className="app-shell min-h-screen px-4 py-6">
        <div className="mx-auto flex min-h-[80vh] max-w-xl items-center">
          <Card className="fleet-panel w-full border-[var(--fleet-outline)] shadow-none">
            <CardHeader>
              <CardTitle className="fleet-page-title">Driver Mode is not enabled yet</CardTitle>
              <CardDescription>
                This company has not been switched on for the Driver Mode pilot. Ask a fleet manager to enable Driver Mode for this account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="h-12 w-full rounded-xl" onClick={() => navigate("/profile")}>
                View Profile
              </Button>
              <Button variant="ghost" className="h-12 w-full rounded-xl" onClick={logout}>
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      {ownerDashboardReturnDialog}
      <div className="fixed right-4 top-4 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-11 rounded-full border-slate-200 bg-white px-3 shadow-lg shadow-slate-200/60">
              <Avatar className="h-7 w-7 border border-slate-200">
                <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium text-slate-900">{user?.name || "Driver"}</span>
              <Menu className="h-4 w-4 sm:hidden" />
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
            <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/pricing")}>
              Subscription & Pricing
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/quick-start-guides/my-guide")}>
              <BookOpenCheck className="mr-2 h-4 w-4" />
              My Quick Start Guide
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/quick-start-guides")}>
              <BookOpenCheck className="mr-2 h-4 w-4" />
              Quick Start Guides
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/")}>
              <Info className="mr-2 h-4 w-4" />
              About TruckFixr
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-xl text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="border-b border-[var(--fleet-outline)] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 pr-20 sm:px-6 lg:px-8 lg:pr-24">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 ring-1 ring-slate-200">
              Driver Mode
            </span>
            {canReturnToOwnerDashboard ? (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                Owner-operator active
              </span>
            ) : null}
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <AppLogo variant="icon" imageClassName="h-full w-full" href="/driver" />
              <div>
                <h1 className="fleet-page-title mt-2 text-3xl font-semibold tracking-tight">Today&apos;s driver workflow</h1>
                <p className="mt-2 text-sm text-slate-600">Inspect assigned trucks and trailers, report defects, and send manager-ready updates from the yard or roadside.</p>
              </div>
            </div>
            {canReturnToOwnerDashboard ? (
              <Button
                variant="outline"
                className="hidden rounded-full border-slate-200 bg-white text-slate-900 sm:inline-flex"
                onClick={requestReturnToOwnerDashboard}
              >
                Back to Owner Dashboard
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {canReturnToOwnerDashboard ? (
              <Button
                variant="outline"
                className="h-11 rounded-2xl border-slate-200 bg-white text-slate-900 sm:hidden"
                onClick={requestReturnToOwnerDashboard}
              >
                Back to Owner Dashboard
              </Button>
            ) : null}
            <VehicleAccessRequestDialog
              fleetId={resolvedFleetId}
              triggerLabel="Request Vehicle Access"
              triggerVariant="default"
              onSubmitted={() => void myRequestsQuery.refetch()}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 pb-28 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-8">
        <SafetyNotice variant="strip" className="rounded-2xl border" />
        <QuickStartBanner role={user?.role} />

        {!hasVehicles ? (
          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="saas-card overflow-hidden p-0">
              <div className="border-b border-[var(--fleet-outline)] bg-[linear-gradient(145deg,var(--fleet-surface-low),rgba(255,255,255,0.98),var(--fleet-secondary-soft))] px-7 py-7">
                <p className="section-label">My vehicles</p>
                <h2 className="mt-2 font-['Manrope'] text-3xl font-semibold tracking-tight text-[var(--fleet-ink)]">No assigned vehicles yet</h2>
                <p className="mt-3 max-w-2xl text-sm text-[var(--fleet-muted)]">
                  Drivers can only inspect and diagnose vehicles assigned by a fleet owner or manager.
                  Request access to the truck or trailer you need, and it will appear here as soon as it is approved.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <VehicleAccessRequestDialog
                    fleetId={resolvedFleetId}
                    triggerLabel="Request Vehicle Access"
                    triggerVariant="default"
                    onSubmitted={() => void myRequestsQuery.refetch()}
                  />
                  <Button variant="outline" className="rounded-2xl border-[var(--fleet-outline)] bg-white" onClick={() => navigate("/profile")}>
                    View Profile
                  </Button>
                </div>
              </div>
            </Card>
            <Card className="metric-card border-0">
              <CardHeader className="pb-4">
                <CardDescription className="text-sm text-slate-500">Pending requests</CardDescription>
                <CardTitle className="mt-2 text-3xl font-semibold text-slate-950">{pendingRequests.filter((item) => item.status === "pending").length}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-1 text-sm text-slate-600">
                {(pendingRequests.slice(0, 3) ?? []).map((request) => (
                  <div key={request.id} className="rounded-2xl bg-[var(--fleet-surface)] px-4 py-3">
                    <p className="font-medium text-[var(--fleet-ink)]">
                      {request.vehicle?.unitNumber || request.requestedVehicleIdentifier || "Vehicle request"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--fleet-muted)]">
                      {request.status} {request.urgent ? "| urgent" : ""}
                    </p>
                  </div>
                ))}
                {pendingRequests.length === 0 ? (
                  <p>No access requests yet.</p>
                ) : null}
              </CardContent>
            </Card>
          </section>
        ) : (
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="saas-card overflow-hidden p-0">
            <div className="border-b border-[var(--fleet-outline)] bg-[linear-gradient(145deg,var(--fleet-surface-low),rgba(255,255,255,0.98),var(--fleet-secondary-soft))] px-7 py-7">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(activeVehicle.status)}`}>{activeVehicle.status}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(readinessLabel)}`}>Today&apos;s inspection: {todayInspectionStatus}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${isOnline ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div>
                    <p className="section-label">Assigned asset</p>
                    <h2 className="mt-2 font-['Manrope'] text-3xl font-semibold tracking-tight text-[var(--fleet-ink)]">{activeVehicle.label}</h2>
                    <p className="mt-2 text-sm text-[var(--fleet-muted)]">{activeVehicleDisplay}</p>
                    {activeVehicle.relationshipSummary ? (
                      <p className="mt-2 text-sm font-medium text-blue-700">{activeVehicle.relationshipSummary}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        { label: "Plate", value: activeVehicle.licensePlate },
                        { label: "Type", value: activeVehicle.assetType?.replaceAll("_", " ") || "Asset" },
                        { label: "Distance", value: formatDistanceKm(activeVehicle.mileage) },
                        { label: "Last inspection", value: latestInspection?.detail.split(" - ")[0] ?? "Not available" },
                        {
                          label: "Open defects",
                          value: activeOpenDefects.length ? String(activeOpenDefects.length) : "None",
                          href: activeOpenDefects.length ? `/truck/${activeVehicle.id}` : undefined,
                        },
                        { label: "VIN", value: formatVinLastSix(activeVehicle.vin), title: activeVehicle.vin },
                      ] as Array<{ label: string; value: string; href?: string; title?: string }>
                    ).map(({ label, value, href, title }) => {
                      const tileClasses =
                        "rounded-2xl border border-[var(--fleet-outline)] bg-white px-4 py-5 shadow-[var(--fleet-shadow)]";
                      const body = (
                        <>
                          <p className="text-xs uppercase tracking-[0.16em] text-[var(--fleet-muted)]">{label}</p>
                          <p className="mt-3 text-sm font-semibold text-[var(--fleet-ink)]" title={title || value}>{value}</p>
                        </>
                      );
                      return href ? (
                        <button
                          key={label}
                          type="button"
                          onClick={() => navigate(href)}
                          className={`${tileClasses} text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
                        >
                          {body}
                        </button>
                      ) : (
                        <div key={label} className={tileClasses}>
                          {body}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid w-full gap-3 sm:grid-cols-3 lg:w-[320px] lg:grid-cols-1">
                  {canStartCombinedInspection ? (
                    <Button className="fleet-primary-btn h-12 rounded-2xl whitespace-normal text-center leading-tight" onClick={startCombinedInspection}>
                      <Truck className="h-4 w-4 shrink-0" />
                      Start Truck + Trailer
                    </Button>
                  ) : null}
                  <Button className="fleet-primary-btn h-12 rounded-2xl" onClick={() => startInspection(activeVehicle)}><SearchCode className="h-4 w-4" />{pendingDraftForActiveVehicle ? "Resume Inspection" : "Start Inspection"}</Button>
                  <Button variant="outline" className="h-12 rounded-2xl border-[var(--fleet-outline)] bg-white" onClick={() => openIssueReport(activeVehicle)}><Wrench className="h-4 w-4" />Report a Problem</Button>
                  <Button variant="outline" className="h-12 rounded-2xl border-[var(--fleet-outline)] bg-white" onClick={() => navigate("/driver#recent-reports")}><FileText className="h-4 w-4" />View Recent Reports</Button>
                  <VehicleAccessRequestDialog
                    fleetId={resolvedFleetId}
                    triggerLabel="Request Another Vehicle"
                    triggerVariant="outline"
                    onSubmitted={() => void myRequestsQuery.refetch()}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 px-7 py-6 md:grid-cols-3">
              {[
                { icon: ShieldCheck, label: "What needs attention", value: "Complete the pre-trip workflow before dispatch." },
                { icon: Gauge, label: "Last completed activity", value: latestInspection?.detail || "No recent inspection logged." },
                { icon: AlertCircle, label: "Next best action", value: queuedIssueCount > 0 ? `${queuedIssueCount} issue report${queuedIssueCount === 1 ? "" : "s"} waiting to sync.` : "Start diagnosis immediately if the truck feels unsafe or warning lights appear." },
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
                    <Button className="fleet-primary-btn rounded-xl" onClick={() => startInspection(activeVehicle)}>
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
                      <VehicleAccessRequestDialog
                        fleetId={resolvedFleetId}
                        triggerLabel="Request another vehicle"
                        triggerVariant="outline"
                        onSubmitted={() => void myRequestsQuery.refetch()}
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-6">
            {pilotAccess?.status === "active" ? (
              <Card className="metric-card border-0">
                <CardHeader className="pb-4">
                  <CardDescription className="text-sm text-slate-500">Pilot Access</CardDescription>
                  <CardTitle className="mt-2 text-2xl font-semibold text-slate-950">Pilot Access Active</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-1 text-sm text-slate-600">
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
              <CardHeader className="pb-4"><CardDescription className="text-sm text-slate-500">Assigned vehicles</CardDescription><CardTitle className="mt-2 text-3xl font-semibold text-slate-950">{vehicles.length}</CardTitle></CardHeader>
              <CardContent className="pt-1 text-sm text-slate-600">Only vehicles and trailers assigned to you appear here.</CardContent>
            </Card>
            <Card className="metric-card border-0">
              <CardHeader className="pb-4"><CardDescription className="text-sm text-slate-500">Today&apos;s readiness</CardDescription><CardTitle className="mt-2 text-3xl font-semibold text-slate-950">{readinessLabel}</CardTitle></CardHeader>
              <CardContent className="pt-1 text-sm text-slate-600">{activeVehicle.status === "Operational" ? "Truck looks ready for the daily inspection workflow." : "Resolve flagged concerns before heading out."}</CardContent>
            </Card>
          </div>
        </section>
        )}

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
                        {vehicle.relationshipSummary ? (
                          <p className="mt-2 text-sm font-medium text-blue-700">{vehicle.relationshipSummary}</p>
                        ) : null}
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
                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <Button className="fleet-primary-btn flex-1 rounded-2xl" onClick={() => startInspection(vehicle)}>Inspect</Button>
                      <Button variant="outline" className="flex-1 rounded-2xl border-slate-200 bg-white" onClick={() => openIssueReport(vehicle)}>Report a Problem</Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="saas-card border-0 p-0">
            <CardHeader id="recent-reports" className="border-b border-slate-200 px-7 py-6">
              <CardTitle className="text-2xl font-semibold text-slate-950">Recent activity</CardTitle>
              <CardDescription className="text-sm text-slate-600">Review what happened recently before starting your next task.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-7 py-6">
              {activityFeed.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No activity yet. Completed inspections, reported issues, and AI triage results will appear here.
                </div>
              ) : null}
              {activityFeed.map((entry) => {
                const meta =
                  entry.kind === "inspection"
                    ? { Icon: CheckCircle2, iconClass: "text-emerald-600", badge: "Inspection" }
                    : entry.kind === "triage"
                      ? { Icon: Stethoscope, iconClass: "text-blue-600", badge: "AI triage" }
                      : { Icon: Wrench, iconClass: "text-amber-600", badge: "Reported issue" };
                const isCritical = entry.severity === "critical" || entry.severity === "high";
                return (
                  <div key={entry.key} className="rounded-[22px] border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                          <meta.Icon className={`h-4 w-4 ${meta.iconClass}`} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950">{entry.title}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                              entry.kind === "inspection"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : entry.kind === "triage"
                                  ? "bg-blue-50 text-blue-700 ring-blue-200"
                                  : isCritical
                                    ? "bg-red-50 text-red-700 ring-red-200"
                                    : "bg-amber-50 text-amber-700 ring-amber-200"
                            }`}>
                              {meta.badge}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {entry.subtitle} | {entry.timestamp ? formatReportTimestamp(new Date(entry.timestamp)) : "Recently"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-slate-200 bg-white"
                        onClick={() => navigate(entry.href)}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <Dialog open={isIssueDialogOpen} onOpenChange={setIsIssueDialogOpen}>
          <DialogContent className="rounded-[24px] border-slate-200 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Report a Problem</DialogTitle>
              <DialogDescription>
                {reportPhase === "result"
                  ? "Your issue is filed for your manager. Here is what TruckFixr AI found."
                  : reportPhase === "clarifying_questions"
                    ? "Answer a few quick questions to help TruckFixr build confidence in the diagnosis."
                    : reportPhase === "triaging"
                      ? "Running AI triage on your report..."
                      : `Describe the problem with ${activeVehicle?.label ?? "this asset"}. TruckFixr AI will help diagnose it and send a manager-ready report.`}
              </DialogDescription>
            </DialogHeader>
            {reportPhase === "clarifying_questions" ? (
              <IssueClarifyingQuestionsWizard
                questions={clarifyingQuestions}
                isSubmitting={submitClarifyingAnswersMutation.isPending}
                onSubmit={handleSubmitClarifyingAnswers}
                onCancel={() => {
                  setReportPhase("result");
                  setTriageResult(null);
                }}
              />
            ) : reportPhase === "form" ? (
            <div className="space-y-4">
              <SafetyNotice variant="inline" />
              {!isOnline ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  You are offline. Your report is saved and sent to your manager automatically when you reconnect. AI triage runs once you are back online.
                </div>
              ) : null}
              <div>
                <Label htmlFor="issue-title">Issue</Label>
                <Input
                  id="issue-title"
                  value={issueForm.title}
                  onChange={(event) => setIssueForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Air leak, tire damage, warning light..."
                  className="mt-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="issue-category">Category</Label>
                  <select
                    id="issue-category"
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    value={issueForm.category}
                    onChange={(event) => setIssueForm((current) => ({ ...current, category: event.target.value }))}
                  >
                    <option value="brakes">Brakes</option>
                    <option value="steering">Steering</option>
                    <option value="tires">Tires</option>
                    <option value="lights">Lights</option>
                    <option value="coupling">Coupling</option>
                    <option value="fluid_leaks">Fluid leaks</option>
                    <option value="driver_reported_issue">Other</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="issue-severity">Severity</Label>
                  <select
                    id="issue-severity"
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    value={issueForm.severity}
                    onChange={(event) =>
                      setIssueForm((current) => ({
                        ...current,
                        severity: event.target.value as "low" | "medium" | "high" | "critical",
                      }))
                    }
                  >
                    <option value="low">Monitor</option>
                    <option value="medium">Report to manager</option>
                    <option value="high">Stop and request help</option>
                    <option value="critical">Do not drive</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="issue-description">Notes</Label>
                <Textarea
                  id="issue-description"
                  value={issueForm.description}
                  onChange={(event) => setIssueForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What did you see, hear, smell, or feel?"
                  className="mt-2 min-h-24"
                />
              </div>
              <div>
                <Label htmlFor="issue-photos">Photos</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="issue-photos"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="flex-1"
                    onChange={(event) => void handleIssuePhotos(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-slate-200"
                    onClick={() => {
                      const input = document.getElementById("issue-camera") as HTMLInputElement;
                      input?.click();
                    }}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <Input
                    id="issue-camera"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => void handleIssuePhotos(event.target.files)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {issueForm.photoUrls.map((photoUrl, index) => (
                    <div key={`${photoUrl.slice(0, 24)}-${index}`} className="relative">
                      <img src={photoUrl} alt={`Issue evidence ${index + 1}`} className="h-16 w-16 rounded-xl border border-slate-200 object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setIssueForm((current) => ({
                            ...current,
                            photoUrls: current.photoUrls.filter((_, i) => i !== index),
                          }));
                        }}
                        className="absolute -right-2 -top-2 rounded-full bg-red-500 text-white hover:bg-red-600 w-5 h-5 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {issueForm.photoUrls.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Camera className="h-4 w-4" />
                      Photos help managers prioritize.
                    </div>
                  ) : null}
                </div>
              </div>
              {issueForm.severity === "critical" ? (
                <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4" />
                  Critical issues notify managers and should be reviewed before dispatch.
                </div>
              ) : null}
            </div>
            ) : reportPhase === "triaging" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <Stethoscope className="h-8 w-8 animate-pulse text-blue-600" />
                <p className="text-sm font-medium text-slate-900">Analyzing your report…</p>
                <p className="text-sm text-slate-600">Your issue is already filed for your manager.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  Issue reported to your manager.
                </div>
                {triageResult ? (
                  <>
                    {triageResult.safety_warning ? (
                      <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        {triageResult.safety_warning}
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Most likely cause</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {triageResult.most_likely_cause ?? "Needs further inspection"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {triageResult.recommended_action ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700 ring-1 ring-blue-200">
                            {String(triageResult.recommended_action).replaceAll("_", " ")}
                          </span>
                        ) : null}
                        {typeof triageResult.confidence_score === "number" ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                            Confidence {triageResult.confidence_score}%
                          </span>
                        ) : null}
                      </div>
                      {triageResult.driver_message ? (
                        <p className="mt-3 text-sm leading-6 text-slate-700">{triageResult.driver_message}</p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    AI triage did not run this time, but your issue is filed and your manager can run triage from their dashboard.
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              {reportPhase === "form" ? (
                <>
                  <Button variant="outline" onClick={() => setIsIssueDialogOpen(false)}>Cancel</Button>
                  <Button className="fleet-primary-btn" disabled={!issueForm.title.trim() || reportIssueMutation.isPending} onClick={() => void submitIssueReport()}>
                    {reportIssueMutation.isPending ? "Reporting..." : isOnline ? "Report & run AI triage" : "Save & report offline"}
                  </Button>
                </>
              ) : reportPhase === "triaging" ? (
                <Button className="fleet-primary-btn" disabled>Working…</Button>
              ) : (
                <>
                  {filedDefectId ? (
                    <Button variant="outline" onClick={() => navigate(`/defect/${filedDefectId}`)}>View issue details</Button>
                  ) : null}
                  <Button className="fleet-primary-btn" onClick={() => setIsIssueDialogOpen(false)}>Done</Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {/* Mobile-only quick actions: keeps Inspect / Report / Reports within
          thumb reach on a long page. Desktop keeps the in-card buttons. */}
      {hasVehicles && activeVehicle ? (
        <nav
          aria-label="Driver quick actions"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--fleet-outline)] bg-white/95 backdrop-blur lg:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-3 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
            <button
              type="button"
              onClick={() => startInspection(activeVehicle)}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-[var(--fleet-ink)] hover:bg-[var(--fleet-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fleet-ink)]"
            >
              <SearchCode className="h-5 w-5" />
              {pendingDraftForActiveVehicle ? "Resume" : "Inspect"}
            </button>
            <button
              type="button"
              onClick={() => openIssueReport(activeVehicle)}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-[#E32636] text-xs font-bold text-white shadow-sm hover:bg-[#BC1E2C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E32636] focus-visible:ring-offset-2"
            >
              <Wrench className="h-5 w-5" />
              Report a Problem
            </button>
            <button
              type="button"
              onClick={() => navigate("/driver#recent-reports")}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-[var(--fleet-ink)] hover:bg-[var(--fleet-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fleet-ink)]"
            >
              <FileText className="h-5 w-5" />
              My Reports
            </button>
          </div>
        </nav>
      ) : null}
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
