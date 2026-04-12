import { startTransition, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SignaturePad from "@/components/SignaturePad";
import { Textarea } from "@/components/ui/textarea";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import {
  clearInspectionDraft,
  enqueueInspectionSubmission,
  flushQueuedInspectionSubmissions,
  getBrowserStorage,
  getQueuedInspectionSubmissions,
  loadChecklistSnapshot,
  loadInspectionDraft,
  saveChecklistSnapshot,
  saveInspectionDraft,
  type InspectionDraftItemResponse,
} from "@/lib/inspectionDrafts";
import { trpc } from "@/lib/trpc";
import { trackInspectionSubmitted } from "@/lib/analytics";
import { getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { INSPECTION_VALIDITY_HOURS } from "../../../shared/inspection";
import { toast } from "sonner";
import { AlertCircle, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, TriangleAlert, Truck } from "lucide-react";

type ItemResponse = InspectionDraftItemResponse;

function formatInspectionTime(value: string | Date) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function filesToDataUrls(files: FileList | null) {
  if (!files || files.length === 0) return [];

  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsDataURL(file);
        })
    )
  );
}

function DriverInspectionContent() {
  const { user } = useAuthContext();
  const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const vehicleId = Number(searchParams.get("vehicle") ?? "42");
  const fleetId = Number(searchParams.get("fleet") ?? "1");
  const driverName = user?.name?.trim() || user?.email?.trim() || "Driver";
  const storage = useMemo(() => getBrowserStorage(), []);
  const restoredDraft = useMemo(() => loadInspectionDraft(storage, vehicleId), [storage, vehicleId]);
  const storedChecklistSnapshot = useMemo(
    () => loadChecklistSnapshot(storage, vehicleId),
    [storage, vehicleId]
  );

  const [stepIndex, setStepIndex] = useState(() => restoredDraft?.data.stepIndex ?? 0);
  const [odometer, setOdometer] = useState(() => restoredDraft?.data.odometer ?? "");
  const [location, setLocation] = useState(() => restoredDraft?.data.location ?? "");
  const [attested, setAttested] = useState(() => restoredDraft?.data.attested ?? false);
  const [signatureMode, setSignatureMode] = useState<"typed" | "drawn">(
    () => restoredDraft?.data.signatureMode ?? "typed"
  );
  const [driverSignature, setDriverSignature] = useState(
    () => restoredDraft?.data.driverSignature ?? ""
  );
  const [drawnSignature, setDrawnSignature] = useState(
    () => restoredDraft?.data.drawnSignature ?? ""
  );
  const [responses, setResponses] = useState<Record<string, ItemResponse>>(
    () => restoredDraft?.data.responses ?? {}
  );
  const [offlineChecklist, setOfflineChecklist] = useState(
    () => storedChecklistSnapshot
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [queuedInspectionCount, setQueuedInspectionCount] = useState(() =>
    getQueuedInspectionSubmissions(storage).length
  );

  const checklistQuery = trpc.inspections.getDailyChecklist.useQuery(
    { vehicleId },
    { staleTime: 60_000 }
  );
  const submitMutation = trpc.inspections.create.useMutation();

  const checklistData = checklistQuery.data ?? offlineChecklist ?? null;
  const categories = checklistData?.categories ?? [];
  const totalSteps = categories.length + 2;
  const isMetadataStep = stepIndex === 0;
  const isSummaryStep = stepIndex === totalSteps - 1;
  const currentCategory = !isMetadataStep && !isSummaryStep ? categories[stepIndex - 1] : null;

  const allChecklistItems = useMemo(
    () => categories.flatMap((category) => category.items),
    [categories]
  );

  const failedItems = useMemo(
    () =>
      allChecklistItems
        .map((item) => ({ item, response: responses[item.id] }))
        .filter(({ response }) => response?.status === "fail"),
    [allChecklistItems, responses]
  );
  const typedSignatureValue = driverSignature.trim() || driverName;

  const currentStepComplete = useMemo(() => {
    if (isMetadataStep) {
      return odometer.trim().length > 0 && location.trim().length > 0;
    }

    if (isSummaryStep) {
      return attested && (signatureMode === "typed" ? typedSignatureValue.trim().length > 0 : drawnSignature.length > 0);
    }

    if (!currentCategory) return false;

    return currentCategory.items.every((item) => {
      const response = responses[item.id];
      if (!response?.status) return false;
      if (response.status === "pass") return true;
      return Boolean(response.classification && response.comment?.trim());
    });
  }, [attested, currentCategory, drawnSignature, isMetadataStep, isSummaryStep, location, odometer, responses, signatureMode, typedSignatureValue]);

  const updateItemResponse = (itemId: string, patch: Partial<ItemResponse>) => {
    setResponses((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        photoUrls: current[itemId]?.photoUrls ?? [],
        ...patch,
      },
    }));
  };

  const handlePhotoUpload = async (itemId: string, files: FileList | null) => {
    try {
      const photoUrls = await filesToDataUrls(files);
      startTransition(() => {
        updateItemResponse(itemId, { photoUrls });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read photo");
    }
  };

  useEffect(() => {
    if (!checklistQuery.data) return;
    saveChecklistSnapshot(storage, vehicleId, checklistQuery.data);
    setOfflineChecklist(checklistQuery.data);
  }, [checklistQuery.data, storage, vehicleId]);

  useEffect(() => {
    const hasDraftData =
      odometer.trim().length > 0 ||
      location.trim().length > 0 ||
      driverSignature.trim().length > 0 ||
      drawnSignature.length > 0 ||
      Object.keys(responses).length > 0 ||
      stepIndex > 0;

    if (!hasDraftData) {
      clearInspectionDraft(storage, vehicleId);
      return;
    }

    saveInspectionDraft(storage, {
      version: 1,
      vehicleId,
      fleetId,
      savedAt: new Date().toISOString(),
      data: {
        stepIndex,
        odometer,
        location,
        attested,
        signatureMode,
        driverSignature,
        drawnSignature,
        responses,
      },
    });
  }, [
    attested,
    drawnSignature,
    driverSignature,
    fleetId,
    location,
    odometer,
    responses,
    signatureMode,
    stepIndex,
    storage,
    vehicleId,
  ]);

  useEffect(() => {
    const syncQueuedInspections = () =>
      flushQueuedInspectionSubmissions(storage, (submission) =>
        submitMutation.mutateAsync(submission)
      ).then((summary) => {
        setQueuedInspectionCount(summary.remainingCount);
        if (summary.flushedCount > 0) {
          toast.success(
            `${summary.flushedCount} queued inspection${summary.flushedCount === 1 ? "" : "s"} uploaded successfully.`
          );
        }
      });

    const handleOnline = () => {
      setIsOnline(true);
      void syncQueuedInspections();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (navigator.onLine && getQueuedInspectionSubmissions(storage).length > 0) {
      void syncQueuedInspections();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [storage, submitMutation]);

  const buildSubmissionPayload = () => {
    const results = allChecklistItems.map((item) => {
      const response = responses[item.id];
      if (!response?.status) {
        throw new Error(`Missing inspection result for ${item.label}`);
      }

      if (response.status === "pass") {
        return { itemId: item.id, status: "pass" as const };
      }

      return {
        itemId: item.id,
        status: "fail" as const,
        classification: response.classification ?? "minor",
        comment: response.comment?.trim() ?? "",
        photoUrls: response.photoUrls,
      };
    });

    return {
      vehicleId,
      fleetId,
      odometer: Number(odometer),
      location: location.trim(),
      attested: true as const,
      driverPrintedName: driverName,
      driverSignature: signatureMode === "typed" ? typedSignatureValue : driverName,
      driverSignatureMode: signatureMode,
      driverSignatureImageUrl: signatureMode === "drawn" ? drawnSignature : undefined,
      results,
    };
  };

  const finishFlow = () => {
    window.setTimeout(() => {
      window.location.href = "/driver";
    }, 1400);
  };

  const handleSubmit = async () => {
    const submission = buildSubmissionPayload();

    if (!isOnline) {
      enqueueInspectionSubmission(storage, submission);
      clearInspectionDraft(storage, vehicleId);
      setQueuedInspectionCount(getQueuedInspectionSubmissions(storage).length);
      toast.success(
        "Inspection saved offline. TruckFixr will upload it automatically when you are back online."
      );
      finishFlow();
      return;
    }

    let result;

    try {
      result = await submitMutation.mutateAsync(submission);
    } catch (error) {
      if (!navigator.onLine) {
        enqueueInspectionSubmission(storage, submission);
        clearInspectionDraft(storage, vehicleId);
        setQueuedInspectionCount(getQueuedInspectionSubmissions(storage).length);
        toast.success(
          "Connection dropped during submit. Your inspection was saved offline and queued for upload."
        );
        finishFlow();
        return;
      }

      toast.error(error instanceof Error ? error.message : "Inspection submission failed");
      return;
    }

    trackInspectionSubmitted(result.inspectionId, result.defectsCreated, {
      vehicle_id: vehicleId,
      major_defect_count: result.majorDefectCount,
      minor_defect_count: result.minorDefectCount,
      can_operate: result.canOperate,
    });

    clearInspectionDraft(storage, vehicleId);

    toast.success(
      result.reportGenerated
        ? result.canOperate
          ? `Daily inspection submitted for ${driverName}. ${result.reportFileName} was generated. Returning to dashboard.`
          : `Daily inspection submitted for ${driverName}. Major defect reported, ${result.reportFileName} was generated, and the vehicle should not operate until corrected. Returning to dashboard.`
        : `Daily inspection submitted for ${driverName}. The record was saved even though PDF generation was unavailable. Returning to dashboard.`
    );

    finishFlow();
  };

  if (!checklistData && checklistQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-24 animate-pulse rounded-3xl bg-slate-200" />
          <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (checklistQuery.error && !checklistData) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-3xl">
          <Card className="rounded-3xl border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle>Unable to load inspection checklist</CardTitle>
              <CardDescription>Try refreshing the page or returning to the driver dashboard.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  if (!checklistData) {
    return null;
  }

  const { vehicle, latestInspection } = checklistData;
  const vehicleLabel = getVehicleDisplayLabel({
    vin: vehicle.vin,
    vehicleId: vehicle.id,
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-label">Daily inspection</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-950">
                {vehicleLabel} - {vehicle.licensePlate}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Complete the required daily inspection. Each report is valid for {INSPECTION_VALIDITY_HOURS} hours per vehicle.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:items-end">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-slate-200 bg-white"
                onClick={() => {
                  window.location.href = "/driver";
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Return to Dashboard
              </Button>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="flex items-center gap-2 font-medium text-slate-800">
                  <Truck className="h-4 w-4 text-blue-600" />
                  {vehicleLabel}
                </div>
                <p className="mt-1">{vehicle.year ?? "Year n/a"} {vehicle.make} {vehicle.model}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all"
                style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-400">
              <span>Step {stepIndex + 1} of {totalSteps}</span>
              <span>{isMetadataStep ? "Inspection details" : isSummaryStep ? "Review and submit" : currentCategory?.label}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 pb-28 sm:px-6">
        {!isOnline ? (
          <Card className="rounded-3xl border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-5 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">Offline mode is active.</p>
                <p className="mt-1">
                  Draft changes are being saved on this device. If you submit now, the inspection will queue and upload automatically when the connection returns.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {checklistQuery.error && offlineChecklist ? (
          <Card className="rounded-3xl border-blue-200 bg-blue-50">
            <CardContent className="flex items-start gap-3 p-5 text-sm text-blue-900">
              <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">Using the last saved checklist snapshot.</p>
                <p className="mt-1">
                  Live checklist sync is unavailable right now, so TruckFixr is using the most recent saved vehicle checklist for this inspection.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {queuedInspectionCount > 0 ? (
          <Card className="rounded-3xl border-slate-200 bg-white">
            <CardContent className="p-5 text-sm text-slate-700">
              {queuedInspectionCount} inspection{queuedInspectionCount === 1 ? "" : "s"} waiting to upload when the connection is available.
            </CardContent>
          </Card>
        ) : null}

        {latestInspection ? (
          <Card className={`rounded-3xl border-0 ${latestInspection.canOperate && latestInspection.isCurrent ? "bg-emerald-50" : "bg-amber-50"}`}>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Clock3 className="h-4 w-4" />
                  Last inspection submitted {formatInspectionTime(latestInspection.submittedAt)}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {latestInspection.isCurrent
                    ? `Current until ${formatInspectionTime(latestInspection.validUntil)}.`
                    : "The previous inspection is no longer current and a new inspection is required."}
                </p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${latestInspection.canOperate ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                {latestInspection.canOperate ? "No major defect on last report" : "Last report included a major defect"}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {isMetadataStep ? (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>Inspection details</CardTitle>
              <CardDescription>Record the basic report information before working through the checklist.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
                A failed item requires a major or minor classification and a comment before you can continue. Photo evidence is optional.
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="odometer">Odometer</Label>
                  <Input id="odometer" inputMode="numeric" placeholder="245320" value={odometer} onChange={(event) => setOdometer(event.target.value.replace(/[^\d]/g, ""))} className="mt-2 h-11 rounded-xl" />
                </div>
                <div>
                  <Label htmlFor="location">Inspection location</Label>
                  <div className="relative mt-2">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input id="location" placeholder="Toronto yard" value={location} onChange={(event) => setLocation(event.target.value)} className="h-11 rounded-xl pl-9" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {currentCategory ? (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>{currentCategory.label}</CardTitle>
              <CardDescription>Every item must be marked pass or fail. Failed items need a classification and comment before you can move on.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentCategory.items.map((item) => {
                const response = responses[item.id] ?? { photoUrls: [] };
                const isFail = response.status === "fail";

                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">{item.label}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.guidance}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant={response.status === "pass" ? "default" : "outline"} className="rounded-full" onClick={() => updateItemResponse(item.id, { status: "pass", classification: undefined, comment: "", photoUrls: [] })}>
                          Pass
                        </Button>
                        <Button type="button" variant={isFail ? "destructive" : "outline"} className="rounded-full" onClick={() => updateItemResponse(item.id, { status: "fail" })}>
                          Fail
                        </Button>
                      </div>
                    </div>

                    {isFail ? (
                      <div className="mt-4 grid gap-4 rounded-2xl border border-red-200 bg-white p-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`${item.id}-classification`}>Classification</Label>
                            <select
                              id={`${item.id}-classification`}
                              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                              value={response.classification ?? ""}
                              onChange={(event) => updateItemResponse(item.id, { classification: event.target.value as "minor" | "major" })}
                            >
                              <option value="">Select...</option>
                              <option value="minor">Minor defect</option>
                              <option value="major">Major defect</option>
                            </select>
                          </div>
                          <div>
                            <Label htmlFor={`${item.id}-photo`}>Photo evidence (optional)</Label>
                            <Input
                              id={`${item.id}-photo`}
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(event) => void handlePhotoUpload(item.id, event.target.files)}
                              className="mt-2 h-11 rounded-xl"
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`${item.id}-comment`}>Comment</Label>
                          <Textarea
                            id={`${item.id}-comment`}
                            value={response.comment ?? ""}
                            onChange={(event) => updateItemResponse(item.id, { comment: event.target.value })}
                            placeholder="Describe what failed and what the driver observed."
                            className="mt-2 min-h-24 rounded-xl"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {response.photoUrls.map((photoUrl, index) => (
                            <img
                              key={`${item.id}-${index}`}
                              src={photoUrl}
                              alt={`${item.label} evidence ${index + 1}`}
                              className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
                            />
                          ))}
                          {response.photoUrls.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Camera className="h-4 w-4" />
                              Add a photo if it helps show the issue.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ) : null}

        {isSummaryStep ? (
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>Review and submit</CardTitle>
              <CardDescription>Confirm the report before submitting the inspection record.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Items checked</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{allChecklistItems.length}</p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Minor defects</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {failedItems.filter(({ response }) => response?.classification === "minor").length}
                  </p>
                </div>
                <div className="rounded-2xl bg-red-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-red-700">Major defects</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {failedItems.filter(({ response }) => response?.classification === "major").length}
                  </p>
                </div>
              </div>

              {failedItems.length > 0 ? (
                <div className="space-y-3">
                  {failedItems.map(({ item, response }) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-950">{item.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{response?.comment}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${response?.classification === "major" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                          {response?.classification === "major" ? "Major" : "Minor"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  No defects were reported in this inspection.
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <Checkbox id="attestation" checked={attested} onCheckedChange={(checked) => setAttested(Boolean(checked))} className="mt-1" />
                  <label htmlFor="attestation" className="text-sm text-slate-700">
                    I confirm this daily inspection was completed and the information in this report is accurate.
                  </label>
                </div>
                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Driver</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{driverName}</p>
                  </div>
                  <div>
                    <Label>Confirmation signature</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={signatureMode === "typed" ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => setSignatureMode("typed")}
                      >
                        Typed
                      </Button>
                      <Button
                        type="button"
                        variant={signatureMode === "drawn" ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => setSignatureMode("drawn")}
                      >
                        Drawn
                      </Button>
                    </div>
                    {signatureMode === "typed" ? (
                      <>
                        <Input
                          id="driver-signature"
                          value={driverSignature}
                          onChange={(event) => setDriverSignature(event.target.value)}
                          placeholder={driverName}
                          className="mt-3 h-11 rounded-xl"
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Your typed signature defaults to {driverName}. Edit it here only if you want a different typed signature.
                        </p>
                      </>
                    ) : (
                      <div className="mt-3">
                        <SignaturePad value={drawnSignature} onChange={setDrawnSignature} />
                        <p className="mt-2 text-xs text-slate-500">
                          Draw your signature. Your name will still appear on the report as {driverName}.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {failedItems.some(({ response }) => response?.classification === "major") ? (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Major defects were reported. The vehicle should not be operated until the defect is corrected.
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0} className="rounded-xl">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          {isSummaryStep ? (
            <Button onClick={() => void handleSubmit()} disabled={!currentStepComplete || submitMutation.isPending} className="rounded-xl bg-green-600 text-white hover:bg-green-700">
              {submitMutation.isPending ? "Submitting..." : "Submit Inspection"}
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setStepIndex((current) => Math.min(totalSteps - 1, current + 1))} disabled={!currentStepComplete} className="rounded-xl">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DriverInspectionNSC() {
  return (
    <RoleBasedRoute requiredRoles={["driver"]}>
      <DriverInspectionContent />
    </RoleBasedRoute>
  );
}
