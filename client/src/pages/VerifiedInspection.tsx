import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import OwnerOperatorGate from "@/components/OwnerOperatorGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import VehicleAccessRequestDialog from "@/components/VehicleAccessRequestDialog";
import { useOwnerOperatorReturnToOwner } from "@/hooks/useOwnerOperatorModeNavigation";
import { getInspectionErrorPresentation } from "@/lib/actionErrorMessages";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/hooks/useAuthContext";
import { loadLastDriverVehicleContext } from "@/lib/driverVehicleContext";
import { getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { isOwnerOperatorEnabled } from "@/lib/ownerOperator";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  MapPin,
  ShieldCheck,
  Truck,
} from "lucide-react";

type LocationCapture = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  capturedAt?: string;
  permissionStatus: "granted" | "denied" | "unavailable";
};

type ChecklistResponse = {
  itemId: string;
  itemLabel: string;
  category: string;
  result?: "pass" | "issue_found" | "not_checked";
  defectDescription?: string;
  severity?: "minor" | "moderate" | "critical";
  note?: string;
  photoUrls: string[];
  unableToTakePhoto: boolean;
  unableToTakePhotoReason?: string;
};

type OpenDefectGroup = {
  key: string;
  title: string;
  description: string;
  defectIds: number[];
};

type FollowUpStatus =
  | "no_longer_visible"
  | "still_present"
  | "worse"
  | "not_checked"
  | "repaired";

async function captureLocation(): Promise<LocationCapture> {
  if (!("geolocation" in navigator)) {
    return { permissionStatus: "unavailable", capturedAt: new Date().toISOString() };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
          permissionStatus: "granted",
        }),
      (error) =>
        resolve({
          permissionStatus: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
          capturedAt: new Date().toISOString(),
        }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
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

function summarizeDefectDescription(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "No description provided.";

  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const symptoms = Array.isArray(parsed.symptoms) ? parsed.symptoms.join(", ") : "";
      const notes = typeof parsed.driverNotes === "string" ? parsed.driverNotes : "";
      const topCause =
        parsed.output?.top_most_likely_cause ??
        parsed.output?.possible_causes?.[0]?.cause ??
        parsed.output?.final_llm_ranking?.[0]?.cause_name;
      return [symptoms, notes, topCause ? `Likely cause: ${topCause}` : ""]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 220);
    } catch {
      return trimmed.slice(0, 220);
    }
  }

  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
}

function VerifiedInspectionContent() {
  const { user } = useAuthContext();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const storedVehicle = useMemo(() => loadLastDriverVehicleContext(), []);
  const vehicleId = params.get("vehicle") ?? storedVehicle?.id ?? "";
  const parsedFleetId = Number(params.get("fleet") ?? storedVehicle?.fleetId ?? 0);
  const fleetId = Number.isFinite(parsedFleetId) && parsedFleetId > 0 ? parsedFleetId : 0;
  const userRole = String(user?.role ?? "");
  if (user?.role === "owner" && !isOwnerOperatorEnabled(user)) {
    return <OwnerOperatorGate />;
  }
  const isOwnerOperator = userRole === "manager" || isOwnerOperatorEnabled(user);
  const [inspectionSession, setInspectionSession] = useState<any>(null);
  const [location, setLocation] = useState<LocationCapture | null>(null);
  const [responses, setResponses] = useState<Record<string, ChecklistResponse>>({});
  const [proofPhotos, setProofPhotos] = useState<Record<string, { photoUrl?: string; skipped?: boolean }>>({});
  const [followUps, setFollowUps] = useState<
    Record<number, { status: FollowUpStatus; note?: string; photoUrls: string[] }>
  >({});
  const [driverPrintedName, setDriverPrintedName] = useState(
    () => user?.name?.trim() || user?.email?.trim() || ""
  );
  const [driverSignature, setDriverSignature] = useState(
    () => user?.name?.trim() || ""
  );
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [startErrorMessage, setStartErrorMessage] = useState("");
  const [submitErrorMessage, setSubmitErrorMessage] = useState("");
  const proofCaptureRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const defectCaptureRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const startMutation = trpc.inspections.startVerified.useMutation();
  const submitMutation = trpc.inspections.submitVerified.useMutation();
  const uploadEvidencePhotoMutation = trpc.inspections.uploadEvidencePhoto.useMutation();
  const vehiclesQuery = trpc.vehicles.listByFleet.useQuery(
    { fleetId },
    { staleTime: 30_000, enabled: fleetId > 0 }
  );

  const categories = inspectionSession?.categories ?? [];
  const allItems = categories.flatMap((category: any) => category.items);
  const openDefects = inspectionSession?.openDefects ?? [];
  const requestedProofItems: string[] = inspectionSession?.requestedProofItems ?? [];
  const selectedVehicle = useMemo(
    () => (vehiclesQuery.data ?? []).find((vehicle) => String(vehicle.id) === String(vehicleId)) ?? null,
    [vehicleId, vehiclesQuery.data]
  );
  const vehicleLabel = useMemo(
    () =>
      getVehicleDisplayLabel({
        label:
          storedVehicle?.label ??
          selectedVehicle?.unitNumber ??
          selectedVehicle?.licensePlate ??
          undefined,
        vin: storedVehicle?.vin ?? selectedVehicle?.vin ?? undefined,
        vehicleId: vehicleId || undefined,
      }),
    [selectedVehicle?.licensePlate, selectedVehicle?.unitNumber, selectedVehicle?.vin, storedVehicle?.label, storedVehicle?.vin, vehicleId]
  );
  const openDefectGroups = useMemo<OpenDefectGroup[]>(() => {
    const grouped = new Map<string, OpenDefectGroup>();
    for (const defect of openDefects) {
      const summary = summarizeDefectDescription(defect.description);
      const key = `${defect.category ?? "uncategorized"}::${(defect.title ?? "").trim().toLowerCase()}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.defectIds.push(defect.id);
      } else {
        grouped.set(key, {
          key,
          title: defect.title,
          description: summary,
          defectIds: [defect.id],
        });
      }
    }
    return Array.from(grouped.values());
  }, [openDefects]);
  const hasDriverModeWorkInProgress =
    Boolean(inspectionSession) ||
    Object.keys(responses).length > 0 ||
    Object.keys(proofPhotos).length > 0 ||
    Object.keys(followUps).length > 0 ||
    signatureConfirmed ||
    notes.trim().length > 0 ||
    startMutation.isPending ||
    submitMutation.isPending;
  const {
    canReturnToOwnerDashboard,
    requestReturnToOwnerDashboard,
    ownerDashboardReturnDialog,
  } = useOwnerOperatorReturnToOwner({
    hasInProgressWork: hasDriverModeWorkInProgress,
    description:
      "You have verified inspection work in progress. Leaving Driver Mode now may interrupt this inspection.",
  });

  const updateResponse = (item: any, patch: Partial<ChecklistResponse>) => {
    setResponses((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        itemId: item.id,
        itemLabel: item.label,
        category: item.category,
        result: current[item.id]?.result,
        photoUrls: current[item.id]?.photoUrls ?? [],
        unableToTakePhoto: current[item.id]?.unableToTakePhoto ?? false,
        ...patch,
      },
    }));
  };

  const startInspection = async () => {
    try {
      setStartErrorMessage("");
      if (fleetId <= 0) {
        const presentation = getInspectionErrorPresentation("Select or join a company fleet before starting an inspection.");
        setStartErrorMessage(presentation.inline);
        toast.error(presentation.toast);
        return;
      }

      const startLocation = await captureLocation();
      setLocation(startLocation);
      const session = await startMutation.mutateAsync({ vehicleId, fleetId, startLocation });
      const initialResponses: Record<string, ChecklistResponse> = {};
      session.categories.flatMap((category: any) => category.items).forEach((item: any) => {
        initialResponses[item.id] = {
          itemId: item.id,
          itemLabel: item.label,
          category: item.category,
          photoUrls: [],
          unableToTakePhoto: false,
        };
      });
      setResponses(initialResponses);
      setInspectionSession(session);
    } catch (error) {
      const presentation = getInspectionErrorPresentation(error);
      setStartErrorMessage(presentation.inline);
      toast.error(presentation.toast);
    }
  };

  const handleDefectPhoto = async (item: any, files: FileList | null) => {
    const rawUrls = await filesToDataUrls(files);
    if (rawUrls.length === 0) {
      updateResponse(item, { photoUrls: [] });
      return;
    }

    const inspectionId = inspectionSession?.inspectionId ?? inspectionSession?.id ?? null;
    const photoUrls =
      fleetId > 0 && vehicleId
        ? await Promise.all(
            rawUrls.map(async (dataUrl) => {
              try {
                const result = await uploadEvidencePhotoMutation.mutateAsync({
                  fleetId,
                  vehicleId,
                  inspectionId,
                  kind: "defect",
                  dataUrl,
                });
                return result.url;
              } catch {
                return dataUrl;
              }
            })
          )
        : rawUrls;

    updateResponse(item, { photoUrls });
  };

  const handleProofPhoto = async (proofItem: string, files: FileList | null) => {
    const [firstUrl] = await filesToDataUrls(files);
    if (!firstUrl) return;

    const inspectionId = inspectionSession?.inspectionId ?? inspectionSession?.id ?? null;
    let photoUrl = firstUrl;
    if (fleetId > 0 && vehicleId) {
      try {
        const result = await uploadEvidencePhotoMutation.mutateAsync({
          fleetId,
          vehicleId,
          inspectionId,
          kind: "proof",
          dataUrl: firstUrl,
        });
        photoUrl = result.url;
      } catch {
        photoUrl = firstUrl;
      }
    }
    setProofPhotos((current) => ({
      ...current,
      [proofItem]: { photoUrl, skipped: false },
    }));
  };

  const triggerProofCapture = (proofItem: string) => {
    proofCaptureRefs.current[proofItem]?.click();
  };

  const triggerDefectCapture = (itemId: string) => {
    defectCaptureRefs.current[itemId]?.click();
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    allItems.forEach((item: any) => {
      const response = responses[item.id];
      if (!response?.result) errors.push(`Choose pass, issue found, or not checked for ${item.label}.`);
      if (response?.result === "issue_found") {
        if (!response.defectDescription?.trim()) errors.push(`Describe the defect for ${item.label}.`);
        if (!response.severity) errors.push(`Select severity for ${item.label}.`);
        if (response.photoUrls.length === 0 && !response.unableToTakePhoto) {
          errors.push(`Add a photo for ${item.label}, or mark unable to take photo.`);
        }
        if (response.unableToTakePhoto && !response.unableToTakePhotoReason?.trim()) {
          errors.push(`Explain why no photo is available for ${item.label}.`);
        }
      }
    });

    if (!driverPrintedName.trim()) {
      errors.push("Enter the driver's printed name before submitting.");
    }

    if (!driverSignature.trim()) {
      errors.push("Enter the driver's e-signature before submitting.");
    }

    if (!signatureConfirmed) {
      errors.push("Confirm that the e-signature is accurate before submitting.");
    }

    openDefectGroups.forEach((defectGroup) => {
      if (!followUps[defectGroup.defectIds[0]]?.status) {
        errors.push(`Acknowledge open defect: ${defectGroup.title}.`);
      }
    });

    return errors;
  }, [allItems, driverPrintedName, driverSignature, followUps, openDefectGroups, responses, signatureConfirmed]);

  const submitInspection = async () => {
    setSubmitErrorMessage("");
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    try {
      const submitLocation = await captureLocation();
      const result = await submitMutation.mutateAsync({
        inspectionId: inspectionSession.inspectionId,
        driverPrintedName: driverPrintedName.trim(),
        driverSignature: driverSignature.trim(),
        signatureConfirmed,
        notes,
        submitLocation,
        checklistResponses: allItems.map((item: any) => responses[item.id]),
        proofPhotos: requestedProofItems.map((proofItem) => ({
          proofItem,
          photoUrl: proofPhotos[proofItem]?.photoUrl,
          skipped: proofPhotos[proofItem]?.skipped ?? !proofPhotos[proofItem]?.photoUrl,
        })),
        knownDefectFollowUps: openDefectGroups.map((defectGroup) => ({
          defectIds: defectGroup.defectIds,
          status: followUps[defectGroup.defectIds[0]]?.status,
          note: followUps[defectGroup.defectIds[0]]?.note,
          photoUrls: followUps[defectGroup.defectIds[0]]?.photoUrls ?? [],
        })),
      });
      setSubmitResult(result);
      toast.success("Verified inspection submitted");
    } catch (error) {
      const presentation = getInspectionErrorPresentation(error);
      setSubmitErrorMessage(presentation.inline);
      toast.error(presentation.toast);
    }
  };

  if (!inspectionSession) {
    return (
      <div className="app-shell min-h-screen px-4 py-6">
        {ownerDashboardReturnDialog}
        <div className="mx-auto max-w-3xl space-y-4">
          <Card className="fleet-panel border-[var(--fleet-outline)] shadow-none">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[var(--fleet-surface-container)] p-3 text-[var(--fleet-primary)]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="fleet-page-title">Verified daily inspection</CardTitle>
                  <CardDescription>
                    {isOwnerOperator ? "Today's inspection helps you keep a credible record of your truck's condition." : "TruckFixr captures timing, proof photos, location status, open defect follow-up, and AI triage."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">Vehicle</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                  <Truck className="h-4 w-4" />
                  {vehicleLabel}
                </p>
              </div>
              <Button
                className="fleet-primary-btn h-12 w-full text-base"
                disabled={fleetId <= 0 || startMutation.isPending}
                onClick={startInspection}
              >
                {startMutation.isPending ? "Starting..." : "Start today's inspection"}
              </Button>
              {startErrorMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="mr-2 inline h-4 w-4" />
                  {startErrorMessage}
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full text-base"
                onClick={() => navigate("/driver")}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Button>
              {canReturnToOwnerDashboard ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full text-base"
                  onClick={requestReturnToOwnerDashboard}
                >
                  Back to Owner Dashboard
                </Button>
              ) : null}
              {!isOwnerOperator && (
                fleetId > 0 ? (
                  <VehicleAccessRequestDialog
                    fleetId={fleetId}
                    triggerLabel="Request Vehicle Access"
                    triggerVariant="outline"
                  />
                ) : null
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen px-3 py-4 sm:px-6">
      {ownerDashboardReturnDialog}
      <div className="mx-auto max-w-4xl space-y-4">
        <Card className="fleet-panel border-[var(--fleet-outline)] shadow-none">
          <CardHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 ring-1 ring-slate-200">
                Driver Mode
              </span>
              {canReturnToOwnerDashboard ? (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                  Owner-operator active
                </span>
              ) : null}
            </div>
            <CardTitle className="fleet-page-title flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-[var(--fleet-primary)]" />
              Daily verified inspection
            </CardTitle>
            <CardDescription>
              Started {new Date(inspectionSession.startedAt).toLocaleTimeString()} by {user?.name || "Driver"}.
              Location: {location?.permissionStatus ?? "unavailable"}.
            </CardDescription>
            {canReturnToOwnerDashboard ? (
              <div className="pt-2">
                <Button type="button" variant="outline" onClick={requestReturnToOwnerDashboard}>
                  Back to Owner Dashboard
                </Button>
              </div>
            ) : null}
          </CardHeader>
        </Card>

        {requestedProofItems.length > 0 && (
          <Card className="fleet-panel border-[#ffdbcb] bg-[#fff6f0] shadow-none">
            <CardHeader>
              <CardTitle className="text-base text-amber-950">Today&apos;s verification check</CardTitle>
              <CardDescription className="text-amber-800">
                Please take a photo of {requestedProofItems.join(" and ")}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {requestedProofItems.map((proofItem) => (
                <div key={proofItem} className="rounded-2xl border border-amber-200 bg-white p-3">
                  <Label className="capitalize">{proofItem}</Label>
                  <input
                    ref={(node) => {
                      proofCaptureRefs.current[proofItem] = node;
                    }}
                    className="hidden"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => void handleProofPhoto(proofItem, event.target.files)}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-amber-300 bg-white text-amber-900 hover:bg-amber-50"
                      onClick={() => triggerProofCapture(proofItem)}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Take photo
                    </Button>
                  </div>
                  {proofPhotos[proofItem]?.photoUrl ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">Photo attached</p>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2 h-8 px-2 text-xs text-amber-800"
                      onClick={() =>
                        setProofPhotos((current) => ({
                          ...current,
                          [proofItem]: { skipped: true },
                        }))
                      }
                    >
                      Skip if unavailable
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {openDefectGroups.length > 0 && (
          <Card className="fleet-panel border-[#ffdad6] bg-[#fff5f5] shadow-none">
            <CardHeader>
              <CardTitle className="text-base text-red-950">Open defect follow-up</CardTitle>
              <CardDescription className="text-red-800">
                Known defects stay visible until a manager resolves or dismisses them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {openDefectGroups.map((defectGroup) => (
                <div key={defectGroup.key} className="rounded-2xl border border-red-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-950">{defectGroup.title}</p>
                  <p className="text-xs text-slate-600">{defectGroup.description}</p>
                  {defectGroup.defectIds.length > 1 ? (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-red-500">
                      Reported {defectGroup.defectIds.length} times
                    </p>
                  ) : null}
                  <select
                    className="mt-3 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    value={followUps[defectGroup.defectIds[0]]?.status ?? ""}
                    onChange={(event) =>
                      setFollowUps((current) => ({
                        ...current,
                        [defectGroup.defectIds[0]]: {
                          ...current[defectGroup.defectIds[0]],
                          photoUrls: current[defectGroup.defectIds[0]]?.photoUrls ?? [],
                          status: event.target.value as FollowUpStatus,
                        },
                      }))
                    }
                  >
                    <option value="">Current condition...</option>
                    <option value="no_longer_visible">No longer visible</option>
                    <option value="still_present">Still present</option>
                    <option value="worse">Worse</option>
                    <option value="not_checked">Not checked</option>
                    <option value="repaired">Repaired</option>
                  </select>
                  <Textarea
                    className="mt-2"
                    placeholder="Optional follow-up note"
                    value={followUps[defectGroup.defectIds[0]]?.note ?? ""}
                    onChange={(event) =>
                      setFollowUps((current) => ({
                        ...current,
                        [defectGroup.defectIds[0]]: {
                          photoUrls: current[defectGroup.defectIds[0]]?.photoUrls ?? [],
                          status: current[defectGroup.defectIds[0]]?.status ?? "not_checked",
                          note: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {categories.map((category: any) => (
          <Card key={category.category} className="fleet-panel border-[var(--fleet-outline)] shadow-none">
            <CardHeader>
              <CardTitle className="fleet-page-title text-lg">{category.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {category.items.map((item: any) => {
                const response = responses[item.id];
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="font-medium text-slate-950">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.guidance}</p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        ["pass", "Pass"],
                        ["issue_found", "Issue"],
                        ["not_checked", "Not checked"],
                      ].map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          variant={response?.result === value ? "default" : "outline"}
                          className="rounded-xl"
                          onClick={() => updateResponse(item, { result: value as ChecklistResponse["result"] })}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>

                    {response?.result === "issue_found" && (
                      <div className="mt-4 space-y-3 rounded-2xl bg-red-50 p-3">
                        <Textarea
                          placeholder="Describe the defect"
                          value={response.defectDescription ?? ""}
                          onChange={(event) => updateResponse(item, { defectDescription: event.target.value })}
                        />
                        <select
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                          value={response.severity ?? ""}
                          onChange={(event) =>
                            updateResponse(item, {
                              severity: event.target.value as ChecklistResponse["severity"],
                            })
                          }
                        >
                          <option value="">Severity...</option>
                          <option value="minor">Minor</option>
                          <option value="moderate">Moderate</option>
                          <option value="critical">Critical</option>
                        </select>
                        <Label className="flex items-center gap-2 text-sm">
                          <Camera className="h-4 w-4" />
                          Defect photo
                        </Label>
                        <input
                          ref={(node) => {
                            defectCaptureRefs.current[item.id] = node;
                          }}
                          className="hidden"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(event) => void handleDefectPhoto(item, event.target.files)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full rounded-xl border-red-200 bg-white text-red-900 hover:bg-red-50"
                          onClick={() => triggerDefectCapture(item.id)}
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          Take photo
                        </Button>
                        {response.photoUrls.length > 0 && (
                          <p className="text-xs font-medium text-emerald-700">Defect photo attached</p>
                        )}
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={response.unableToTakePhoto}
                            onChange={(event) =>
                              updateResponse(item, { unableToTakePhoto: event.target.checked })
                            }
                          />
                          Unable to take photo
                        </label>
                        {response.unableToTakePhoto && (
                          <Input
                            placeholder="Reason photo is unavailable"
                            value={response.unableToTakePhotoReason ?? ""}
                            onChange={(event) =>
                              updateResponse(item, { unableToTakePhotoReason: event.target.value })
                            }
                          />
                        )}
                      </div>
                    )}

                    {response?.result === "not_checked" && (
                      <Input
                        className="mt-3"
                        placeholder="Reason not checked"
                        value={response.note ?? ""}
                        onChange={(event) => updateResponse(item, { note: event.target.value })}
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        <Card className="fleet-panel border-[var(--fleet-outline)] shadow-none">
          <CardHeader>
            <CardTitle className="fleet-page-title">Submit inspection</CardTitle>
            <CardDescription>Add the driver name, e-signature, and any final note before {isOwnerOperator ? "saving the record" : "sending this to the fleet manager"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="driverPrintedName">Driver printed name</Label>
                <Input
                  id="driverPrintedName"
                  value={driverPrintedName}
                  onChange={(event) => setDriverPrintedName(event.target.value)}
                  placeholder="Driver name"
                />
              </div>
              <div>
                <Label htmlFor="driverSignature">Driver e-signature</Label>
                <Input
                  id="driverSignature"
                  value={driverSignature}
                  onChange={(event) => setDriverSignature(event.target.value)}
                  placeholder="Type full name as signature"
                />
              </div>
            </div>
            <Textarea
              placeholder="Optional inspection notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={signatureConfirmed}
                onChange={(event) => setSignatureConfirmed(event.target.checked)}
              />
              <span>
                I confirm this e-signature is mine and the completed inspection report is accurate to the best of my knowledge.
              </span>
            </label>
            {validationErrors.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                {validationErrors[0]}
              </div>
            )}
            {submitErrorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                {submitErrorMessage}
              </div>
            ) : null}
            <Button
              className="fleet-primary-btn h-12 w-full text-base"
              disabled={submitMutation.isPending}
              onClick={submitInspection}
            >
              {submitMutation.isPending ? "Submitting..." : (isOwnerOperator ? "Save verified inspection" : "Submit verified inspection")}
            </Button>
          </CardContent>
        </Card>

        {submitResult && (
          <Card className="fleet-panel border-[#cae9dd] bg-[#f2fbf6] shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-950">
                <CheckCircle2 className="h-5 w-5" />
                Inspection submitted
              </CardTitle>
              <CardDescription className="text-emerald-800">
                Integrity score {submitResult.integrityScore}/100. Status: {submitResult.status}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-emerald-900">
                <MapPin className="h-4 w-4" />
                Location proof {submitResult.locationProofCaptured ? "captured" : "not available"}.
              </p>
              {submitResult.flags?.map((flag: any) => (
                <p key={flag.flagType} className="text-sm text-amber-800">
                  {flag.message}
                </p>
              ))}
              {submitResult.triageResults?.map((entry: any) => (
                <div key={entry.defect.id} className="rounded-2xl bg-white p-3">
                  <p className="font-semibold text-slate-950">{entry.defect.title}</p>
                  <p className="mt-1 text-sm text-slate-700">{entry.triage.driver_message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    AI: {entry.triage.most_likely_cause} | {entry.triage.confidence_score}% confidence |
                    Action: {entry.triage.recommended_action}
                  </p>
                  {entry.triage.clarifying_questions?.[0] && (
                    <p className="mt-2 text-sm font-medium text-blue-700">
                      Follow-up: {entry.triage.clarifying_questions[0]}
                    </p>
                  )}
                </div>
              ))}
              <div className="pt-2">
                <Button
                  type="button"
                  className="mb-2 w-full"
                  onClick={() => navigate(`/inspection-report/${submitResult.inspectionId}`)}
                >
                  View DVIR report
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => navigate("/driver")}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back to dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function VerifiedInspection() {
  return (
    <RoleBasedRoute requiredRoles={["driver", "owner_operator", "manager", "owner"]}>
      <VerifiedInspectionContent />
    </RoleBasedRoute>
  );
}
