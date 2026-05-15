import { useEffect, useMemo, useRef, useState } from "react";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import VehicleAccessRequestDialog from "@/components/VehicleAccessRequestDialog";
import { trackFeatureAccessed } from "@/lib/analytics";
import { loadLastDriverVehicleContext, saveLastDriverVehicleContext } from "@/lib/driverVehicleContext";
import { type DriverVehicleRecord } from "@/lib/driverVehicles";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";
import { getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, CheckCircle2, Sparkles, Stethoscope, Truck, Wrench } from "lucide-react";

type DiagnosisView = {
  status: "clarification_needed" | "final";
  issueSummary: string;
  systemsAffected: string[];
  likelyCauses: Array<{
    cause: string;
    likelihood: "high" | "medium" | "low";
    probability: number;
    reasoning: string;
  }>;
  confidenceScore: number;
  clarifyingQuestion: string;
  clarificationReason: string;
  recommendedTests: string[];
  likelyParts: string[];
  safeToDriveDecision:
    | "safe_to_drive"
    | "drive_with_caution"
    | "stop_and_inspect"
    | "tow_or_repair_immediately";
  riskLevel: "low" | "medium" | "high" | "critical";
  maintenanceRecommendation: string;
  complianceImpact: "none" | "warning" | "critical";
  driverFriendlyExplanation: string;
  managerSummary: string;
  advancedAiReviewUsed: boolean;
  modelUsed: string;
  fallbackUsed: boolean;
};

function normalizeDiagnosisView(diagnosis: unknown): DiagnosisView | null {
  if (!diagnosis || typeof diagnosis !== "object") return null;
  const record = diagnosis as Record<string, unknown>;
  const likelyCausesRaw = Array.isArray(record.likely_causes)
    ? record.likely_causes
    : Array.isArray(record.possible_causes)
      ? record.possible_causes
      : [];
  const riskLevel =
    record.risk_level === "critical" ||
    record.risk_level === "high" ||
    record.risk_level === "medium" ||
    record.risk_level === "low"
      ? record.risk_level
      : "medium";
  const safeDecision =
    record.safe_to_drive_decision === "safe_to_drive" ||
    record.safe_to_drive_decision === "drive_with_caution" ||
    record.safe_to_drive_decision === "stop_and_inspect" ||
    record.safe_to_drive_decision === "tow_or_repair_immediately"
      ? record.safe_to_drive_decision
      : riskLevel === "high" || riskLevel === "critical"
        ? "stop_and_inspect"
        : "drive_with_caution";
  const confidenceScore =
    typeof record.confidence_score === "number" ? record.confidence_score : 0;

  return {
    status:
      record.status === "clarification_needed" || record.next_action === "ask_question"
        ? "clarification_needed"
        : "final",
    issueSummary:
      typeof record.issue_summary === "string"
        ? record.issue_summary
        : typeof record.top_most_likely_cause === "string"
          ? record.top_most_likely_cause
          : "Diagnosis summary",
    systemsAffected: Array.isArray(record.systems_affected)
      ? record.systems_affected.filter((item): item is string => typeof item === "string")
      : [],
    likelyCauses: likelyCausesRaw.map((item) => {
      const cause = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const probability =
        typeof cause.probability === "number" ? cause.probability : 0;
      return {
        cause: typeof cause.cause === "string" ? cause.cause : "Unspecified cause",
        likelihood:
          cause.likelihood === "high" || cause.likelihood === "medium" || cause.likelihood === "low"
            ? cause.likelihood
            : probability >= 70
              ? "high"
              : probability >= 40
                ? "medium"
                : "low",
        probability,
        reasoning:
          typeof cause.reasoning === "string"
            ? cause.reasoning
            : Array.isArray(record.confidence_rationale)
              ? record.confidence_rationale.filter((value): value is string => typeof value === "string")[0] ?? ""
              : "",
      };
    }),
    confidenceScore,
    clarifyingQuestion:
      typeof record.clarifying_question === "string" ? record.clarifying_question : "",
    clarificationReason:
      typeof record.clarification_reason === "string"
        ? record.clarification_reason
        : typeof record.question_rationale === "string"
          ? record.question_rationale
          : "",
    recommendedTests: Array.isArray(record.recommended_tests)
      ? record.recommended_tests.filter((item): item is string => typeof item === "string")
      : [],
    likelyParts: Array.isArray(record.likely_parts)
      ? record.likely_parts.filter((item): item is string => typeof item === "string")
      : Array.isArray(record.possible_replacement_parts)
        ? record.possible_replacement_parts.filter((item): item is string => typeof item === "string")
        : [],
    safeToDriveDecision: safeDecision,
    riskLevel,
    maintenanceRecommendation:
      typeof record.maintenance_recommendation === "string"
        ? record.maintenance_recommendation
        : Array.isArray(record.maintenance_recommendations)
          ? record.maintenance_recommendations.filter((item): item is string => typeof item === "string").join(" ")
          : "",
    complianceImpact:
      record.compliance_impact === "critical" ||
      record.compliance_impact === "warning" ||
      record.compliance_impact === "none"
        ? record.compliance_impact
        : riskLevel === "critical"
          ? "critical"
          : riskLevel === "high"
            ? "warning"
            : "none",
    driverFriendlyExplanation:
      typeof record.driver_friendly_explanation === "string"
        ? record.driver_friendly_explanation
        : typeof record.driver_message === "string"
          ? record.driver_message
          : typeof record.driver_action_reason === "string"
            ? record.driver_action_reason
            : "",
    managerSummary:
      typeof record.manager_summary === "string"
        ? record.manager_summary
        : typeof record.risk_summary === "string"
          ? record.risk_summary
          : "",
    advancedAiReviewUsed: Boolean(record.advanced_ai_review_used),
    modelUsed: typeof record.model_used === "string" ? record.model_used : "",
    fallbackUsed: Boolean(record.fallback_used),
  };
}

function formatSafeDecision(value: DiagnosisView["safeToDriveDecision"]) {
  return value.replace(/_/g, " ");
}

function DriverDiagnosisContent() {
  const { user } = useAuthContext();
  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery();
  const params = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const storedVehicle = useMemo(() => loadLastDriverVehicleContext(), []);
  const vehicleId = params.get("vehicle") ?? (storedVehicle ? String(storedVehicle.id) : null);
  const fleetId = useMemo(() => {
    const urlFleet = params.get("fleet");
    if (urlFleet && Number(urlFleet) > 0) return String(Number(urlFleet));
    if (storedVehicle?.fleetId && storedVehicle.fleetId > 0) return String(storedVehicle.fleetId);
    const subscriptionFleetId = subscriptionQuery.data?.activeFleetId;
    return subscriptionFleetId && subscriptionFleetId > 0 ? String(subscriptionFleetId) : null;
  }, [params, storedVehicle, subscriptionQuery.data?.activeFleetId]);
  const vehicleLabel = getVehicleDisplayLabel({
    label: params.get("label") ?? storedVehicle?.label,
    vin: params.get("vin") ?? storedVehicle?.vin,
    vehicleId: vehicleId ?? undefined,
  });
  const isOwnerOperator = user?.role === "owner" || user?.role === "manager";

  const [symptom, setSymptom] = useState("");
  const [faultCode, setFaultCode] = useState("");
  const [diagnosisStarted, setDiagnosisStarted] = useState(false);
  const [clarificationHistory, setClarificationHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [diagnosisSessionId, setDiagnosisSessionId] = useState<string | null>(null);
  const diagnoseMutation = trpc.diagnostics.analyze.useMutation();
  const vehiclesQuery = trpc.vehicles.listMine.useQuery(undefined, {
    staleTime: 30_000,
    enabled: Boolean(user?.id),
  });

  const hasDiagnosisInput = symptom.trim().length > 0;
  const diagnosis = diagnoseMutation.data;
  const diagnosisView = useMemo(() => normalizeDiagnosisView(diagnosis), [diagnosis]);
  const activeClarifyingQuestion = diagnosisView?.clarifyingQuestion.trim() ?? "";
  const isAwaitingClarification =
    diagnosisStarted &&
    !!diagnosisView &&
    diagnosisView.status === "clarification_needed" &&
    diagnosisView.confidenceScore < 80 &&
    activeClarifyingQuestion.length > 0;
  const isClarificationMissing =
    diagnosisStarted &&
    !!diagnosisView &&
    diagnosisView.status === "clarification_needed" &&
    diagnosisView.confidenceScore < 80 &&
    activeClarifyingQuestion.length === 0;
  const shouldShowClarificationPanel = isAwaitingClarification || isClarificationMissing;
  const isDiagnosisReady =
    diagnosisStarted &&
    !!diagnosisView &&
    diagnosisView.status === "final";
  const isLowConfidenceSummary =
    isDiagnosisReady && !!diagnosisView && diagnosisView.confidenceScore < 80;
  const vehicleChoices = useMemo<DriverVehicleRecord[]>(
    () =>
      (vehiclesQuery.data ?? []).map((vehicle) => ({
        id: vehicle.id,
        fleetId: vehicle.fleetId,
        label: vehicle.unitNumber?.trim() || vehicle.licensePlate?.trim() || vehicle.vin,
        vin: vehicle.vin,
        licensePlate: vehicle.licensePlate || "UNKNOWN",
        make: vehicle.make || "Truck",
        engineMake: vehicle.engineMake || "",
        model: vehicle.model || "Unit",
        year: vehicle.year ?? null,
        mileage: vehicle.mileage ?? 0,
        assetType: vehicle.assetType === "tractor" || vehicle.assetType === "straight_truck" || vehicle.assetType === "trailer" ? vehicle.assetType : "other",
        status: vehicle.complianceStatus === "red" || vehicle.status === "maintenance" ? "Needs Review" : "Operational",
      })),
    [vehiclesQuery.data]
  );
  const hasAvailableVehicles = vehicleChoices.length > 0;
  const selectedVehicle = useMemo(
    () => vehicleChoices.find((vehicle) => String(vehicle.id) === vehicleId) ?? null,
    [vehicleChoices, vehicleId]
  );
  const resolvedFleetId = selectedVehicle?.fleetId ?? (fleetId ? Number(fleetId) : 0);
  const hasResolvedFleetContext = resolvedFleetId > 0;
  const isBlockedVehicleSelection =
    Boolean(vehicleId) && !selectedVehicle && !vehiclesQuery.isLoading;
  const clarificationPanelRef = useRef<HTMLDivElement | null>(null);
  const lastAnnouncedQuestionRef = useRef("");

  useEffect(() => {
    if (!diagnosisStarted || !diagnosisView) {
      return;
    }

    if (isAwaitingClarification && activeClarifyingQuestion) {
      clarificationPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      if (lastAnnouncedQuestionRef.current !== activeClarifyingQuestion) {
        lastAnnouncedQuestionRef.current = activeClarifyingQuestion;
        toast.info("Clarifying question ready", {
          description: activeClarifyingQuestion,
        });
      }
      return;
    }

    if (isClarificationMissing) {
      toast.warning("Clarifying question unavailable", {
        description: "TruckFixr can retry the next question directly under Generate Diagnosis.",
      });
    }
  }, [
    activeClarifyingQuestion,
    diagnosisView,
    diagnosisStarted,
    isAwaitingClarification,
    isClarificationMissing,
  ]);

  const runDiagnosis = async (nextClarificationHistory = clarificationHistory) => {
    trackFeatureAccessed("driver_diagnosis_started", {
      vehicle_id: vehicleId,
      has_fault_code: Boolean(faultCode.trim()),
      clarification_rounds: nextClarificationHistory.length,
    });

    const normalizedFaultCodes = faultCode
      .split(/[,;\n]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);

    try {
      if (!hasResolvedFleetContext) {
        toast.error("Select or join a company fleet before starting diagnosis.");
        return;
      }

      const result = await diagnoseMutation.mutateAsync({
        fleetId: resolvedFleetId,
        vehicleId: String(vehicleId),
        diagnosisSessionId:
          nextClarificationHistory.length > 0 && diagnosisSessionId ? diagnosisSessionId : undefined,
        vehicleContext: selectedVehicle
          ? {
              id: selectedVehicle.id,
              vin: selectedVehicle.vin,
              make: selectedVehicle.make,
              model: selectedVehicle.model,
              year: selectedVehicle.year,
              mileage: selectedVehicle.mileage,
              brakeConfiguration: selectedVehicle.vin ? "vehicle_configured" : undefined,
            }
          : undefined,
        symptoms: [
          symptom.trim(),
        ],
        faultCodes: normalizedFaultCodes,
        photoUrls: [],
        clarificationHistory: nextClarificationHistory,
      });
      if (typeof result?.case_id === "string" && result.case_id.trim()) {
        setDiagnosisSessionId(result.case_id);
      }
      setDiagnosisStarted(true);
      setClarificationAnswer("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate diagnosis");
    }
  };

  if (!vehicleId) {
    return (
      <div className="app-shell min-h-screen">
        <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <Card className="fleet-panel border-[#ffdbcb] bg-[#fff6f0] shadow-none">
            <CardHeader>
              <CardTitle>Select a vehicle to start diagnosis</CardTitle>
              <CardDescription>
                    {isOwnerOperator
                      ? "TruckFixr needs a selected vehicle before diagnosis can begin. Select a unit from your operation to resume."
                      : "TruckFixr needs a selected vehicle before diagnosis can begin. Select one of your assigned units to continue."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                {hasAvailableVehicles ? (
                  <div className="grid gap-3">
                    {vehicleChoices.map((vehicle) => (
                      <button
                        key={vehicle.id}
                        type="button"
                      onClick={() => {
                        saveLastDriverVehicleContext(vehicle);
                        window.location.href = `/diagnosis?vehicle=${encodeURIComponent(
                          String(vehicle.id)
                        )}&fleet=${encodeURIComponent(String(vehicle.fleetId))}&label=${encodeURIComponent(
                          vehicle.label
                        )}&vin=${encodeURIComponent(vehicle.vin)}`;
                      }}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{vehicle.label}</p>
                            <p className="text-sm text-slate-500">{vehicle.make} {vehicle.model} | {vehicle.vin}</p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Use vehicle
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-amber-300 bg-white p-5 text-sm text-slate-700">
                    {isOwnerOperator
                      ? "No vehicles are available in your operation yet. Add your first truck or trailer to unlock diagnostics."
                      : "No assigned vehicles are available yet. Request access from your fleet manager or owner, then diagnostics will unlock automatically."}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {isOwnerOperator ? (
                    <Button onClick={() => (window.location.href = "/driver")}>Add a Vehicle</Button>
                  ) : (
                    hasResolvedFleetContext ? (
                      <VehicleAccessRequestDialog
                        fleetId={resolvedFleetId}
                        triggerLabel="Request Vehicle Access"
                        triggerVariant="default"
                      />
                    ) : null
                  )}
                  <Button variant="outline" onClick={() => (window.location.href = "/driver")}>Back to Dashboard</Button>
                </div>
              </div>
              <div>
                <Card className="rounded-2xl border border-slate-200 bg-white">
                  <CardHeader>
                    <CardTitle className="text-base">Access is required before diagnosis</CardTitle>
                    <CardDescription>
                      {isOwnerOperator ? "You can diagnose any vehicle or trailer registered to your operation. Select an active unit to begin building the intake record." : "Drivers can only diagnose vehicles and trailers assigned to them. If you are covering another unit today, request temporary or permanent access and wait for manager approval."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (isBlockedVehicleSelection) {
    return (
      <div className="app-shell min-h-screen">
        <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <Card className="fleet-panel border-[#ffdbcb] bg-[#fff6f0] shadow-none">
            <CardHeader>
              <CardTitle>{isOwnerOperator ? "Vehicle not found" : "You do not currently have access to this vehicle"}</CardTitle>
              <CardDescription>
                {isOwnerOperator ? "This vehicle does not belong to your operation. Select another unit from your dashboard to continue." : "Drivers can only diagnose assigned vehicles and trailers. Request access from your fleet manager or owner to continue."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {!isOwnerOperator && (
                hasResolvedFleetContext ? (
                  <VehicleAccessRequestDialog
                    fleetId={resolvedFleetId}
                    triggerLabel="Request Vehicle Access"
                    triggerVariant="default"
                  />
                ) : null
              )}
              <Button variant="outline" onClick={() => (window.location.href = "/driver")}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen">
      <header className="border-b border-[var(--fleet-outline)] bg-white/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="fleet-page-title text-2xl font-bold">Start Diagnosis</h1>
            <p className="text-sm text-slate-600">{vehicleLabel} diagnostic intake</p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/driver")}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="fleet-panel shadow-none">
          <CardHeader>
            <CardTitle>Diagnostic Intake</CardTitle>
            <CardDescription>
              Capture what {isOwnerOperator ? "you are" : "the driver is"} seeing before {isOwnerOperator ? "reviewing health details" : "sending the truck for inspection"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="symptom">Symptom description</Label>
              <Input
                id="symptom"
                placeholder="Low power, check engine light, air pressure dropping..."
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fault-code">Fault code if available</Label>
              <Input
                id="fault-code"
                placeholder="SPN 4364 FMI 18"
                value={faultCode}
                onChange={(e) => setFaultCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="fleet-primary-btn flex-1"
                disabled={!hasDiagnosisInput || !hasResolvedFleetContext || diagnoseMutation.isPending}
                onClick={() => void runDiagnosis([])}
              >
                <Stethoscope className="w-4 h-4 mr-2" />
                {diagnoseMutation.isPending ? "Analyzing..." : (isOwnerOperator ? "Run Diagnosis" : "Generate Diagnosis")}
              </Button>
              <Button
                variant="outline"
                className="fleet-secondary-btn flex-1"
                onClick={() => {
                  window.location.href = `/inspection?vehicle=${encodeURIComponent(vehicleId)}&fleet=${encodeURIComponent(String(resolvedFleetId))}&mode=daily`;
                }}
              >
                Start Daily Inspection Instead
              </Button>
            </div>
            {shouldShowClarificationPanel && diagnosisView ? (
              <div
                ref={clarificationPanelRef}
                className={`rounded-2xl border p-4 ${
                  isAwaitingClarification ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"
                }`}
              >
                <p
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    isAwaitingClarification ? "text-blue-700" : "text-amber-700"
                  }`}
                >
                  {isAwaitingClarification ? "Clarifying question" : "Question unavailable"}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {isAwaitingClarification
                    ? `Confidence is ${diagnosisView.confidenceScore}%. Answer this one focused question so TruckFixr AI can reduce uncertainty before finalizing.`
                    : "TruckFixr AI is still in clarification mode, but the next question did not come through cleanly. Retry here to request a fresh clarifying question."}
                </p>
                {isAwaitingClarification ? (
                  <>
                    <p className="mt-3 text-sm font-medium text-slate-950">{activeClarifyingQuestion}</p>
                    <div className="mt-4 space-y-3">
                      <Textarea
                        value={clarificationAnswer}
                        onChange={(event) => setClarificationAnswer(event.target.value)}
                        placeholder="Answer this question to continue the diagnostic loop."
                        className="min-h-24 bg-white"
                      />
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">
                          Clarification round {clarificationHistory.length + 1} of 3
                        </p>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          disabled={!clarificationAnswer.trim() || diagnoseMutation.isPending}
                          onClick={() => {
                            const nextHistory = [
                              ...clarificationHistory,
                              { question: activeClarifyingQuestion, answer: clarificationAnswer.trim() },
                            ];
                            setClarificationHistory(nextHistory);
                            void runDiagnosis(nextHistory);
                          }}
                        >
                          {diagnoseMutation.isPending ? "Recomputing..." : "Submit answer"}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <Button
                    className="mt-4 bg-blue-600 hover:bg-blue-700"
                    disabled={diagnoseMutation.isPending}
                    onClick={() => void runDiagnosis(clarificationHistory)}
                  >
                    {diagnoseMutation.isPending ? "Retrying..." : "Retry Clarifying Question"}
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="fleet-panel shadow-none">
            <CardHeader>
              <CardTitle>Diagnosis Summary</CardTitle>
              <CardDescription>
                {isAwaitingClarification
                  ? "Answer the clarifying question in the intake panel to continue the AI diagnosis loop."
                  : isDiagnosisReady
                    ? `Generated from vehicle context and intake details for ${isOwnerOperator ? "your records" : "fleet review"}.`
                    : "No diagnosis generated yet. This is a focused diagnosis path, not the full daily inspection flow."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAwaitingClarification && diagnosisView ? (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Clarification in progress</p>
                    <p className="mt-2 text-sm text-slate-700">
                      TruckFixr AI is still separating the top causes. The next question is shown directly under the Generate Diagnosis button so it can be answered before the summary appears.
                    </p>
                  </div>
                  {clarificationHistory.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clarification history</p>
                      <div className="mt-2 space-y-2">
                        {clarificationHistory.map((turn, index) => (
                          <div key={`${index}-${turn.question}-${turn.answer}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                            <p className="font-medium text-slate-900">{turn.question}</p>
                            <p className="mt-1 text-slate-600">{turn.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : isClarificationMissing ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Question unavailable</p>
                  <p className="mt-2 text-sm text-slate-700">
                    TruckFixr AI is still in clarification mode, but the next question did not come through cleanly. Try generating the diagnosis again and TruckFixr will request a fresh clarifying question.
                  </p>
                  <Button
                    className="mt-4 bg-blue-600 hover:bg-blue-700"
                    disabled={diagnoseMutation.isPending}
                    onClick={() => void runDiagnosis(clarificationHistory)}
                  >
                    {diagnoseMutation.isPending ? "Retrying..." : "Retry Clarifying Question"}
                  </Button>
                </div>
              ) : isDiagnosisReady && diagnosisView ? (
                <>
                  {isLowConfidenceSummary ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Low-confidence summary</p>
                      <p className="mt-2 text-sm text-slate-700">
                        TruckFixr AI could not reach 80% confidence after the available clarification. Review this as a practical recommendation and confirm it with hands-on inspection before acting on it.
                      </p>
                    </div>
                  ) : null}
                  <div
                    className={`rounded-lg border p-4 ${
                      diagnosisView.riskLevel === "critical" || diagnosisView.riskLevel === "high"
                        ? "border-red-200 bg-red-50"
                        : diagnosisView.riskLevel === "medium"
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        diagnosisView.riskLevel === "critical" || diagnosisView.riskLevel === "high"
                          ? "text-red-700"
                          : diagnosisView.riskLevel === "medium"
                            ? "text-amber-700"
                            : "text-emerald-700"
                      }`}
                    >
                      Compliance warning
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold ${
                      diagnosisView.riskLevel === "critical" || diagnosisView.riskLevel === "high"
                          ? "text-red-600"
                          : diagnosisView.riskLevel === "medium"
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {diagnosisView.complianceImpact === "critical" ? "Critical" : diagnosisView.complianceImpact === "warning" ? "Warning" : "No compliance flag"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {diagnosisView.riskLevel === "critical" || diagnosisView.riskLevel === "high"
                        ? "Diagnostics indicate a high-risk issue. Remove the vehicle from service until verified."
                        : diagnosisView.riskLevel === "medium"
                          ? "Diagnostics indicate a caution state. Review the truck before the next dispatch."
                          : "No high-risk diagnostic signal is currently leading the analysis."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence score</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{diagnosisView.confidenceScore}%</p>
                  </div>
                  {diagnosisView.advancedAiReviewUsed ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Advanced AI review used</p>
                      <p className="mt-2 text-sm text-slate-700">
                        TruckFixr used a stronger review path because this case had higher safety risk, complexity, or uncertainty.
                      </p>
                    </div>
                  ) : null}
                  {diagnosisView.likelyCauses.some((item) => item.reasoning) ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this ranks here</p>
                      <div className="mt-2 space-y-2">
                        {diagnosisView.likelyCauses.filter((item) => item.reasoning).slice(0, 3).map((item) => (
                          <div key={`${item.cause}-${item.reasoning}`} className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                            {item.reasoning}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance impact</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{diagnosisView.complianceImpact}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issue summary</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{diagnosisView.issueSummary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Safe-to-drive decision</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatSafeDecision(diagnosisView.safeToDriveDecision)}</p>
                    <p className="mt-2 text-sm text-slate-700">{diagnosisView.driverFriendlyExplanation}</p>
                    <p className="mt-2 text-sm text-slate-600">{diagnosisView.managerSummary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Systems affected</p>
                    <p className="mt-1 text-sm text-slate-800">
                      {diagnosisView.systemsAffected.length ? diagnosisView.systemsAffected.join(", ") : "Not specified yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance recommendation</p>
                    <p className="mt-1 text-sm text-slate-800">{diagnosisView.maintenanceRecommendation || "Confirm with inspection before replacing parts."}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended tests</p>
                    <div className="mt-2 space-y-2">
                      {diagnosisView.recommendedTests.map((step) => (
                        <div key={step} className="flex items-start gap-2 rounded-lg bg-slate-100 p-3">
                          <Wrench className="w-4 h-4 mt-0.5 text-slate-500" />
                          <p className="text-sm text-slate-700">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Likely parts</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {diagnosisView.likelyParts.length > 0 ? (
                        diagnosisView.likelyParts.map((item) => (
                          <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">No specific replacement parts suggested yet.</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Confirm the fault before replacing parts.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Likely causes</p>
                    <div className="mt-2 space-y-2">
                      {diagnosisView.likelyCauses.map((item) => (
                        <div key={item.cause} className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{item.cause}</span>
                            <span>{item.likelihood} {Math.round(item.probability)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {diagnosisView.fallbackUsed ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">AI fallback used</p>
                      <p className="mt-2 text-sm text-slate-700">
                        TruckFixr retried or used a configured fallback model. Provider details are saved internally, not shown to drivers.
                      </p>
                    </div>
                  ) : null}
                  {clarificationHistory.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clarification history</p>
                      <div className="mt-2 space-y-2">
                        {clarificationHistory.map((turn, index) => (
                          <div key={`${index}-${turn.question}-${turn.answer}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                            <p className="font-medium text-slate-900">{turn.question}</p>
                            <p className="mt-1 text-slate-600">{turn.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {diagnosisView.status === "clarification_needed" && diagnosisView.clarificationReason ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Why this question matters</p>
                      <p className="mt-2 text-sm text-slate-700">{diagnosisView.clarificationReason}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Enter a symptom or fault code, then generate a diagnosis to create a compliance warning and {isOwnerOperator ? "health summary" : "manager-ready intake summary"}. TruckFixr uses a lighter intake here than the full daily inspection.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="fleet-panel shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Driver Reminder
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              Diagnosis is for issue intake. Use the daily inspection flow when you need the full pre-trip checklist and compliance report.
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function DriverDiagnosis() {
  return (
    <RoleBasedRoute requiredRoles={["driver", "owner_operator", "owner", "manager"]}>
      <DriverDiagnosisContent />
    </RoleBasedRoute>
  );
}

