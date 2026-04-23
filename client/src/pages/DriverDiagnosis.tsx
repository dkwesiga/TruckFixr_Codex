import { useEffect, useMemo, useRef, useState } from "react";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import VehicleCaptureFlow from "@/components/VehicleCaptureFlow";
import { trackFeatureAccessed } from "@/lib/analytics";
import { loadLastDriverVehicleContext, saveLastDriverVehicleContext } from "@/lib/driverVehicleContext";
import { loadDriverVehicles, type DriverVehicleRecord } from "@/lib/driverVehicles";
import { trpc } from "@/lib/trpc";
import { getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, CheckCircle2, Plus, Sparkles, Stethoscope, Truck, Wrench } from "lucide-react";

function DriverDiagnosisContent() {
  const params = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const storedVehicle = useMemo(() => loadLastDriverVehicleContext(), []);
  const vehicleId = params.get("vehicle") ?? (storedVehicle ? String(storedVehicle.id) : null);
  const fleetId = params.get("fleet") ?? (storedVehicle?.fleetId ? String(storedVehicle.fleetId) : "1");
  const vehicleLabel = getVehicleDisplayLabel({
    label: params.get("label") ?? storedVehicle?.label,
    vin: params.get("vin") ?? storedVehicle?.vin,
    vehicleId: vehicleId ? Number(vehicleId) : undefined,
  });

  const [symptom, setSymptom] = useState("");
  const [faultCode, setFaultCode] = useState("");
  const [driverNotes, setDriverNotes] = useState("");
  const [operatingConditions, setOperatingConditions] = useState("");
  const [diagnosisStarted, setDiagnosisStarted] = useState(false);
  const [clarificationHistory, setClarificationHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [vehicleChoices, setVehicleChoices] = useState<DriverVehicleRecord[]>(() => loadDriverVehicles());
  const [showVehicleCapture, setShowVehicleCapture] = useState(false);
  const [vehicleCaptureInitialStep, setVehicleCaptureInitialStep] = useState<"entry" | "manual" | "scan_source">("entry");
  const diagnoseMutation = trpc.diagnostics.analyze.useMutation();

  const hasDiagnosisInput =
    symptom.trim().length > 0 || faultCode.trim().length > 0 || driverNotes.trim().length > 0;
  const diagnosis = diagnoseMutation.data;
  const activeClarifyingQuestion = diagnosis?.clarifying_question?.trim() ?? "";
  const isAwaitingClarification =
    diagnosisStarted &&
    !!diagnosis &&
    diagnosis.next_action === "ask_question" &&
    diagnosis.confidence_score < 75 &&
    activeClarifyingQuestion.length > 0;
  const isClarificationMissing =
    diagnosisStarted &&
    !!diagnosis &&
    diagnosis.next_action === "ask_question" &&
    diagnosis.confidence_score < 75 &&
    activeClarifyingQuestion.length === 0;
  const shouldShowClarificationPanel = isAwaitingClarification || isClarificationMissing;
  const isDiagnosisReady =
    diagnosisStarted &&
    !!diagnosis &&
    diagnosis.next_action === "proceed";
  const isLowConfidenceSummary =
    isDiagnosisReady && !!diagnosis && diagnosis.confidence_score < 75;
  const hasAvailableVehicles = vehicleChoices.length > 0;
  const selectedVehicle = useMemo(
    () => vehicleChoices.find((vehicle) => String(vehicle.id) === vehicleId) ?? null,
    [vehicleChoices, vehicleId]
  );
  const clarificationPanelRef = useRef<HTMLDivElement | null>(null);
  const lastAnnouncedQuestionRef = useRef("");

  useEffect(() => {
    if (!diagnosisStarted || !diagnosis) {
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
    diagnosis,
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
      .split(/[,\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);

    try {
      await diagnoseMutation.mutateAsync({
        fleetId: Number(fleetId),
        vehicleId: Number(vehicleId),
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
          symptom.trim() ||
            (normalizedFaultCodes[0] ? `Fault code ${normalizedFaultCodes[0]}` : "Driver reported concern"),
        ],
        faultCodes: normalizedFaultCodes,
        driverNotes: driverNotes.trim() || undefined,
        operatingConditions: operatingConditions.trim() || undefined,
        photoUrls: [],
        clarificationHistory: nextClarificationHistory,
      });
      setDiagnosisStarted(true);
      setClarificationAnswer("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to generate diagnosis");
    }
  };

  if (!vehicleId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle>Select a vehicle to start diagnosis</CardTitle>
              <CardDescription>
                TADIS needs a vehicle before it can build context, pull similar cases, and evaluate compliance impact. Select an existing truck or add one inline, then diagnostics will resume automatically.
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
                            <p className="text-sm text-slate-500">{vehicle.make} {vehicle.model} · {vehicle.vin}</p>
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
                    No vehicles are available yet. Add one now to unlock TADIS diagnostics.
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => {
                      setVehicleCaptureInitialStep("entry");
                      setShowVehicleCapture(true);
                    }}
                  >
                    Add Vehicle
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setVehicleCaptureInitialStep("scan_source");
                      setShowVehicleCapture(true);
                    }}
                  >
                    Scan VIN
                  </Button>
                </div>
                <Button variant="outline" onClick={() => (window.location.href = "/driver")}>Back to Dashboard</Button>
              </div>
              <div>
                {showVehicleCapture ? (
                  <VehicleCaptureFlow
                    fleetId={Number(fleetId)}
                    source="diagnosis"
                    initialStep={vehicleCaptureInitialStep}
                    onCancel={() => setShowVehicleCapture(false)}
                    onSaved={(vehicle) => {
                      setVehicleChoices((current) => [vehicle, ...current.filter((item) => item.id !== vehicle.id)]);
                      saveLastDriverVehicleContext({
                        id: vehicle.id,
                        fleetId: vehicle.fleetId,
                        label: vehicle.label,
                        vin: vehicle.vin,
                        licensePlate: vehicle.licensePlate,
                        make: vehicle.make,
                        model: vehicle.model,
                        year: vehicle.year,
                        engineMake: vehicle.engineMake,
                      });
                      window.location.href = `/diagnosis?vehicle=${encodeURIComponent(String(vehicle.id))}&fleet=${encodeURIComponent(String(vehicle.fleetId))}&label=${encodeURIComponent(vehicle.label)}&vin=${encodeURIComponent(vehicle.vin)}`;
                    }}
                  />
                ) : (
                  <Card className="rounded-2xl border border-slate-200 bg-white">
                    <CardHeader>
                      <CardTitle className="text-base">VIN-first vehicle setup</CardTitle>
                      <CardDescription>
                        Scan the VIN or enter it manually, review the decoded details, save the vehicle, and TruckFixr will reopen diagnosis with that vehicle already selected.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Start Diagnosis</h1>
            <p className="text-sm text-slate-600">{vehicleLabel} diagnostic intake</p>
          </div>
          <Button variant="outline" onClick={() => (window.location.href = "/driver")}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Diagnostic Intake</CardTitle>
            <CardDescription>
              Capture what the driver is seeing before sending the truck for inspection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="symptom">Primary Symptom</Label>
              <Input
                id="symptom"
                placeholder="Engine overheating, brake warning, steering pull..."
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fault-code">Fault Code</Label>
              <Input
                id="fault-code"
                placeholder="SPN/FMI or dashboard code"
                value={faultCode}
                onChange={(e) => setFaultCode(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="driver-notes">Driver Notes</Label>
              <Textarea
                id="driver-notes"
                placeholder="When did it start, how often does it happen, and what changed?"
                value={driverNotes}
                onChange={(e) => setDriverNotes(e.target.value)}
                className="min-h-32"
              />
            </div>
            <div>
              <Label htmlFor="operating-conditions">Operating Conditions</Label>
              <Input
                id="operating-conditions"
                placeholder="Under load, idling in traffic, cold start, during braking..."
                value={operatingConditions}
                onChange={(e) => setOperatingConditions(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={!hasDiagnosisInput || diagnoseMutation.isPending}
                onClick={() => void runDiagnosis([])}
              >
                <Stethoscope className="w-4 h-4 mr-2" />
                {diagnoseMutation.isPending ? "Analyzing..." : "Generate Diagnosis"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  window.location.href = `/inspection?vehicle=${encodeURIComponent(vehicleId)}&fleet=${encodeURIComponent(fleetId)}&mode=daily`;
                }}
              >
                Start Daily Inspection Instead
              </Button>
            </div>
            {shouldShowClarificationPanel && diagnosis ? (
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
                    ? `Confidence is ${diagnosis.confidence_score}%. Answer this next question so TADIS can reduce uncertainty before showing the diagnosis summary.`
                    : "TADIS is still in clarification mode, but the next question did not come through cleanly. Retry here to request a fresh clarifying question."}
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
                          Clarification round {clarificationHistory.length + 1} of 5
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
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Sparkles className="w-5 h-5 text-blue-600" />
                TADIS Preview
              </CardTitle>
              <CardDescription>
                A focused diagnosis path separate from the full daily inspection.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              Capture a symptom, fault code, and notes first. Then send the truck into the shop flow with better context.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Diagnosis Summary</CardTitle>
              <CardDescription>
                {isAwaitingClarification
                  ? "Answer the clarifying question in the intake panel to continue the TADIS loop."
                  : isDiagnosisReady
                    ? "Generated from the vehicle context, intake details, history, and similar cases."
                    : "No diagnosis generated yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isAwaitingClarification && diagnosis ? (
                <>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Clarification in progress</p>
                    <p className="mt-2 text-sm text-slate-700">
                      TADIS is still separating the top causes. The next question is shown directly under the Generate Diagnosis button so it can be answered before the summary appears.
                    </p>
                  </div>
                  {clarificationHistory.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clarification history</p>
                      <div className="mt-2 space-y-2">
                        {clarificationHistory.map((turn) => (
                          <div key={`${turn.question}-${turn.answer}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
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
                    TADIS is still in clarification mode, but the next question did not come through cleanly. Try generating the diagnosis again and TruckFixr will request a fresh clarifying question.
                  </p>
                  <Button
                    className="mt-4 bg-blue-600 hover:bg-blue-700"
                    disabled={diagnoseMutation.isPending}
                    onClick={() => void runDiagnosis(clarificationHistory)}
                  >
                    {diagnoseMutation.isPending ? "Retrying..." : "Retry Clarifying Question"}
                  </Button>
                </div>
              ) : isDiagnosisReady && diagnosis ? (
                <>
                  {isLowConfidenceSummary ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Low-confidence summary</p>
                      <p className="mt-2 text-sm text-slate-700">
                        TADIS asked up to 5 clarifying questions and still could not reach 75% confidence. Review this summary as a best-effort recommendation and confirm the issue with hands-on inspection and testing before acting on it.
                      </p>
                    </div>
                  ) : null}
                  <div
                    className={`rounded-lg border p-4 ${
                      diagnosis.risk_level === "high"
                        ? "border-red-200 bg-red-50"
                        : diagnosis.risk_level === "medium"
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        diagnosis.risk_level === "high"
                          ? "text-red-700"
                          : diagnosis.risk_level === "medium"
                            ? "text-amber-700"
                            : "text-emerald-700"
                      }`}
                    >
                      Compliance warning
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold ${
                        diagnosis.risk_level === "high"
                          ? "text-red-600"
                          : diagnosis.risk_level === "medium"
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {diagnosis.risk_level === "high" ? "Non-Compliant" : diagnosis.risk_level === "medium" ? "Warning" : "Compliant"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {diagnosis.risk_level === "high"
                        ? "Diagnostics indicate a high-risk issue. Remove the vehicle from service until verified."
                        : diagnosis.risk_level === "medium"
                          ? "Diagnostics indicate a caution state. Review the truck before the next dispatch."
                          : "No high-risk diagnostic signal is currently leading the analysis."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence score</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{diagnosis.confidence_score}%</p>
                  </div>
                  {diagnosis.confidence_rationale?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidence rationale</p>
                      <div className="mt-2 space-y-2">
                        {diagnosis.confidence_rationale.map((item) => (
                          <div key={item} className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance impact</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{diagnosis.compliance_impact}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top most likely cause</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{diagnosis.top_most_likely_cause}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Driver action</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{diagnosis.driver_action}</p>
                    <p className="mt-2 text-sm text-slate-700">{diagnosis.driver_action_reason}</p>
                    <p className="mt-2 text-sm text-slate-600">{diagnosis.risk_summary}</p>
                    {diagnosis.distance_or_time_limit ? (
                      <p className="mt-2 text-sm text-slate-600">Limit: {diagnosis.distance_or_time_limit}</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Systems affected</p>
                    <p className="mt-1 text-sm text-slate-800">{diagnosis.systems_affected.join(", ")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended fix</p>
                    <p className="mt-1 text-sm text-slate-800">{diagnosis.recommended_fix}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended tests</p>
                    <div className="mt-2 space-y-2">
                      {diagnosis.recommended_tests.map((step) => (
                        <div key={step} className="flex items-start gap-2 rounded-lg bg-slate-100 p-3">
                          <Wrench className="w-4 h-4 mt-0.5 text-slate-500" />
                          <p className="text-sm text-slate-700">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Likely replacement parts</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {diagnosis.possible_replacement_parts.length > 0 ? (
                        diagnosis.possible_replacement_parts.map((item) => (
                          <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">No specific replacement parts suggested yet.</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {diagnosis.confirm_before_replacement
                        ? "Confirm the fault before replacing parts."
                        : "Replacement can proceed without additional confirmation."}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Labor estimate</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Verification</p>
                        <p>{diagnosis.diagnostic_verification_labor_hours.min}-{diagnosis.diagnostic_verification_labor_hours.max} hrs</p>
                      </div>
                      <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Repair</p>
                        <p>{diagnosis.repair_labor_hours.min}-{diagnosis.repair_labor_hours.max} hrs</p>
                      </div>
                      <div className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">Total</p>
                        <p>{diagnosis.total_estimated_labor_hours.min}-{diagnosis.total_estimated_labor_hours.max} hrs</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Possible causes</p>
                    <div className="mt-2 space-y-2">
                      {diagnosis.possible_causes.map((item) => (
                        <div key={item.cause} className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-slate-900">{item.cause}</span>
                            <span>{Math.round(item.probability)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {diagnosis.final_llm_ranking?.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence by cause</p>
                      <div className="mt-2 space-y-3">
                        {diagnosis.final_llm_ranking.slice(0, 3).map((item) => (
                          <div key={`${item.cause_id ?? item.cause_name}-${item.probability}`} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{item.cause_name}</p>
                                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                                  {Math.round(item.probability)}% likelihood
                                  {item.is_new_cause ? " | New AI-proposed cause" : ""}
                                </p>
                              </div>
                              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                Fit {Math.round(item.cause_library_fit_score)}%
                              </div>
                            </div>
                            {item.evidence_summary?.length ? (
                              <div className="mt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
                                <div className="mt-2 space-y-2">
                                  {item.evidence_summary.map((reason) => (
                                    <div key={reason} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                                      {reason}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {item.ranking_rationale?.length ? (
                              <div className="mt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it ranks here</p>
                                <div className="mt-2 space-y-2">
                                  {item.ranking_rationale.map((reason) => (
                                    <div key={reason} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                      {reason}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {diagnosis.fallback_used || diagnosis.llm_status !== "ok" ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">AI fallback used</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {diagnosis.fallback_reason || "The AI review layer was unavailable, so the rules-engine baseline was used."}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance recommendations</p>
                    <div className="mt-2 space-y-2">
                      {diagnosis.maintenance_recommendations.map((item) => (
                        <div key={item} className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  {clarificationHistory.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clarification history</p>
                      <div className="mt-2 space-y-2">
                        {clarificationHistory.map((turn) => (
                          <div key={`${turn.question}-${turn.answer}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                            <p className="font-medium text-slate-900">{turn.question}</p>
                            <p className="mt-1 text-slate-600">{turn.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {diagnosis.next_action === "ask_question" && diagnosis.question_rationale ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Why this question matters</p>
                      <p className="mt-2 text-sm text-slate-700">{diagnosis.question_rationale}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  Enter a symptom or fault code, then generate a diagnosis to create a compliance warning and manager-ready intake summary.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
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
    <RoleBasedRoute requiredRoles={["driver"]}>
      <DriverDiagnosisContent />
    </RoleBasedRoute>
  );
}
