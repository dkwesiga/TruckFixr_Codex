import { useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { saveLastDriverVehicleContext } from "@/lib/driverVehicleContext";
import { loadDriverVehicles, saveDriverVehicles, type DriverVehicleRecord } from "@/lib/driverVehicles";
import { getFallbackUnitNumber, getVehicleDisplayLabel } from "@/lib/vehicleDisplay";
import { toast } from "sonner";
import { Camera, Loader2, ScanLine, Upload, CheckCircle2, PencilLine, TriangleAlert, CarFront } from "lucide-react";

type FlowStep =
  | "entry"
  | "manual"
  | "scan_source"
  | "ocr_processing"
  | "ocr_failed"
  | "confirm_vin"
  | "decoding"
  | "review"
  | "saving";

type VehicleCaptureSource = "diagnosis" | "inspection" | "vehicles";

export type VehicleCaptureDraft = {
  label: string;
  vin: string;
  licensePlate: string;
  make: string;
  model: string;
  year: string;
  engineMake: string;
};

type Props = {
  fleetId: number;
  source: VehicleCaptureSource;
  initialStep?: "entry" | "manual" | "scan_source";
  onCancel?: () => void;
  onSaveDraft?: (draft: VehicleCaptureDraft) => Promise<DriverVehicleRecord>;
  renderReviewExtras?: (args: {
    vehicleForm: VehicleCaptureDraft;
    setVehicleForm: Dispatch<SetStateAction<VehicleCaptureDraft>>;
  }) => ReactNode;
  saveButtonLabel?: string;
  onSaved: (vehicle: DriverVehicleRecord) => void;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function normalizeVinInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[OQ]/g, "0").replace(/I/g, "1");
}

export default function VehicleCaptureFlow({
  fleetId,
  source,
  initialStep = "entry",
  onCancel,
  onSaveDraft,
  renderReviewExtras,
  saveButtonLabel = "Save Vehicle",
  onSaved,
}: Props) {
  const [step, setStep] = useState<FlowStep>(initialStep);
  const [imagePreview, setImagePreview] = useState("");
  const [ocrWarning, setOcrWarning] = useState("");
  const [vinInput, setVinInput] = useState("");
  const [decodeWarning, setDecodeWarning] = useState("");
  const [vehicleForm, setVehicleForm] = useState<VehicleCaptureDraft>({
    label: "",
    vin: "",
    licensePlate: "",
    make: "",
    model: "",
    year: "",
    engineMake: "",
  });
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const utils = trpc.useUtils();
  const createVehicleMutation = trpc.vehicles.create.useMutation();

  const titleBySource = useMemo(() => {
    switch (source) {
      case "diagnosis":
        return "Add a vehicle to continue diagnosis";
      case "inspection":
        return "Add a vehicle to continue inspection";
      default:
        return "Add vehicle";
    }
  }, [source]);

  const persistVehicleLocally = (vehicle: {
    id: number;
    fleetId: number;
    vin: string;
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    engineMake?: string | null;
  }) => {
    const localVehicle: DriverVehicleRecord = {
      id: vehicle.id,
      fleetId: vehicle.fleetId,
      label: getVehicleDisplayLabel({
        label: vehicleForm.label.trim(),
        vin: vehicle.vin,
        vehicleId: vehicle.id,
      }),
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate?.trim() || "UNKNOWN",
      make: vehicle.make?.trim() || vehicleForm.make.trim() || "Truck",
      engineMake: vehicle.engineMake?.trim() || vehicleForm.engineMake.trim(),
      model: vehicle.model?.trim() || vehicleForm.model.trim() || "Unit",
      year: typeof vehicle.year === "number" ? vehicle.year : vehicleForm.year.trim() ? Number(vehicleForm.year.trim()) : null,
      mileage: 0,
      status: "Operational",
    };

    const existing = loadDriverVehicles();
    const nextVehicles = [localVehicle, ...existing.filter((item) => item.id !== localVehicle.id)];
    saveDriverVehicles(nextVehicles);
    saveLastDriverVehicleContext({
      id: localVehicle.id,
      fleetId: localVehicle.fleetId,
      label: localVehicle.label,
      vin: localVehicle.vin,
      licensePlate: localVehicle.licensePlate,
      make: localVehicle.make,
      model: localVehicle.model,
      year: localVehicle.year,
      engineMake: localVehicle.engineMake,
    });
    return localVehicle;
  };

  const handleSelectedFile = async (file: File | null) => {
    if (!file) {
      setOcrWarning("No image was selected. You can try again or enter the VIN manually.");
      setStep("ocr_failed");
      return;
    }

    try {
      const imageDataUrl = await fileToDataUrl(file);
      setImagePreview(imageDataUrl);
      setStep("ocr_processing");

      const response = await fetch(getApiUrl("/api/vehicles/extract-vin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const payload = await readApiPayload<Record<string, any>>(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the VIN extraction API response. Check the live API base URL configuration.",
      }).catch(() => ({}));

      if (!response.ok || !payload.vin) {
        setOcrWarning(payload.warning || payload.error || "Couldn't read VIN clearly.");
        setStep("ocr_failed");
        return;
      }

      setVinInput(payload.vin);
      setOcrWarning(payload.warning || "");
      setStep("confirm_vin");
    } catch (error) {
      setOcrWarning(error instanceof Error ? error.message : "Couldn't read VIN clearly.");
      setStep("ocr_failed");
    }
  };

  const startDecode = async (providedVin?: string) => {
    const vin = normalizeVinInput(providedVin ?? vinInput ?? vehicleForm.vin);
    if (vin.length !== 17) {
      toast.error("VIN must be exactly 17 characters before decode.");
      return;
    }

    setVehicleForm((current) => ({
      ...current,
      vin,
      label: current.label || `Unit ${getFallbackUnitNumber(vin)}`,
    }));
    setDecodeWarning("");
    setStep("decoding");

    try {
      const response = await fetch(getApiUrl(`/api/vehicles/decode-vin/${encodeURIComponent(vin)}`));
      const payload = await readApiPayload<Record<string, any>>(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the VIN decode API response. Check the live API base URL configuration.",
      }).catch(() => ({}));

      setVehicleForm((current) => ({
        ...current,
        vin,
        label: current.label || `Unit ${getFallbackUnitNumber(vin)}`,
        make: payload.make || current.make,
        model: payload.model || current.model,
        year: payload.year ? String(payload.year) : current.year,
        engineMake: payload.engineMake || current.engineMake,
      }));

      if (!response.ok) {
        setDecodeWarning(payload.error || "We couldn't decode this VIN automatically. Please review and enter details manually.");
      } else if (payload.warnings) {
        setDecodeWarning(payload.warnings);
      }

      setStep("review");
    } catch (error) {
      setDecodeWarning(
        error instanceof Error
          ? error.message
          : "We couldn't decode this VIN automatically. Please review and enter details manually."
      );
      setStep("review");
    }
  };

  const saveVehicle = async () => {
    const vin = normalizeVinInput(vehicleForm.vin);
    if (vin.length !== 17) {
      toast.error("VIN must be 17 characters before saving.");
      return;
    }

    setStep("saving");
    try {
      const normalizedDraft: VehicleCaptureDraft = {
        label: vehicleForm.label.trim() || `Unit ${getFallbackUnitNumber(vin)}`,
        vin,
        licensePlate: vehicleForm.licensePlate.trim(),
        make: vehicleForm.make.trim(),
        model: vehicleForm.model.trim(),
        year: vehicleForm.year.trim(),
        engineMake: vehicleForm.engineMake.trim(),
      };

      if (onSaveDraft) {
        const savedVehicle = await onSaveDraft(normalizedDraft);
        toast.success(`${savedVehicle.label} saved and ready to use.`);
        onSaved(savedVehicle);
        return;
      }

      const createdVehicle = await createVehicleMutation.mutateAsync({
        fleetId,
        unitNumber: normalizedDraft.label || getFallbackUnitNumber(vin),
        vin,
        licensePlate: normalizedDraft.licensePlate || undefined,
        make: normalizedDraft.make || undefined,
        model: normalizedDraft.model || undefined,
        year: normalizedDraft.year ? Number(normalizedDraft.year) : undefined,
        engineMake: normalizedDraft.engineMake || undefined,
      });

      await utils.vehicles.listByFleet.invalidate({ fleetId });
      const localVehicle = persistVehicleLocally(createdVehicle);
      toast.success(`${localVehicle.label} saved and ready to use.`);
      onSaved(localVehicle);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save vehicle");
      setStep("review");
    }
  };

  return (
    <Card className="h-full max-h-full overflow-hidden rounded-3xl border-slate-200 shadow-none">
      <CardHeader className="flex-none">
        <CardTitle>{titleBySource}</CardTitle>
        <CardDescription>
          Capture the VIN manually or by photo, confirm it, review the decoded details, then save the vehicle before returning to your workflow.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 overflow-y-auto pb-2">
        {step === "entry" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-auto justify-start rounded-2xl border-slate-200 px-4 py-4" onClick={() => setStep("manual")}>
              <PencilLine className="mr-3 h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold">Manual VIN Entry</div>
                <div className="text-xs text-slate-500">Type or paste the VIN yourself.</div>
              </div>
            </Button>
            <Button type="button" variant="outline" className="h-auto justify-start rounded-2xl border-slate-200 px-4 py-4" onClick={() => setStep("scan_source")}>
              <ScanLine className="mr-3 h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold">Scan VIN</div>
                <div className="text-xs text-slate-500">Use camera or gallery to reduce typing.</div>
              </div>
            </Button>
          </div>
        ) : null}

        {step === "manual" ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="manual-vin">VIN</Label>
              <Input
                id="manual-vin"
                value={vehicleForm.vin}
                onChange={(event) =>
                  setVehicleForm((current) => ({
                    ...current,
                    vin: normalizeVinInput(event.target.value),
                  }))
                }
                placeholder="Enter 17-character VIN"
                className="mt-2"
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep("entry")}>Back</Button>
              <Button type="button" onClick={() => void startDecode(vehicleForm.vin)}>Continue</Button>
            </div>
          </div>
        ) : null}

        {step === "scan_source" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Camera guidance</p>
              <ul className="mt-2 space-y-1">
                <li>Align the VIN inside the frame.</li>
                <li>Use good lighting and avoid glare.</li>
                <li>Hold steady and avoid blur.</li>
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="outline" className="h-auto justify-start rounded-2xl border-slate-200 px-4 py-4" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="mr-3 h-4 w-4" />
                <div className="text-left">
                  <div className="font-semibold">Take Photo</div>
                  <div className="text-xs text-slate-500">Open the camera and capture the VIN.</div>
                </div>
              </Button>
              <Button type="button" variant="outline" className="h-auto justify-start rounded-2xl border-slate-200 px-4 py-4" onClick={() => galleryInputRef.current?.click()}>
                <Upload className="mr-3 h-4 w-4" />
                <div className="text-left">
                  <div className="font-semibold">Upload from Gallery</div>
                  <div className="text-xs text-slate-500">Choose an existing VIN photo.</div>
                </div>
              </Button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => void handleSelectedFile(event.target.files?.[0] ?? null)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void handleSelectedFile(event.target.files?.[0] ?? null)}
            />
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep("entry")}>Back</Button>
              <Button type="button" variant="ghost" onClick={() => setStep("manual")}>Enter VIN Manually</Button>
            </div>
          </div>
        ) : null}

        {step === "ocr_processing" ? (
          <div className="space-y-4">
            {imagePreview ? (
              <img src={imagePreview} alt="VIN preview" className="max-h-56 w-full rounded-2xl object-cover" />
            ) : null}
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              OCR is processing the VIN image now.
            </div>
          </div>
        ) : null}

        {step === "ocr_failed" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-semibold">Couldn't read VIN clearly.</p>
                  <p className="mt-1">{ocrWarning || "Try another photo or continue with manual VIN entry."}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => setStep("scan_source")}>Retake Photo</Button>
              <Button type="button" variant="outline" onClick={() => setStep("manual")}>Enter VIN Manually</Button>
            </div>
          </div>
        ) : null}

        {step === "confirm_vin" ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="confirmed-vin">Confirm VIN</Label>
              <Input
                id="confirmed-vin"
                value={vinInput}
                onChange={(event) => setVinInput(normalizeVinInput(event.target.value))}
                className="mt-2"
              />
              <p className="mt-2 text-xs text-slate-500">
                Review OCR mistakes before decode. Common corrections include 0 vs O and 1 vs I.
              </p>
              {ocrWarning ? <p className="mt-2 text-xs text-amber-700">{ocrWarning}</p> : null}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep("scan_source")}>Back</Button>
              <Button type="button" onClick={() => void startDecode(vinInput)}>Decode VIN</Button>
            </div>
          </div>
        ) : null}

        {step === "decoding" ? (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Decoding the VIN and pulling available vehicle details.
          </div>
        ) : null}

        {step === "review" || step === "saving" ? (
          <div className="space-y-4">
            {decodeWarning ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                {decodeWarning || "We couldn't decode this VIN automatically. Please review and enter details manually."}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                VIN decoded. Review the details before saving.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="review-vin">VIN</Label>
                <Input
                  id="review-vin"
                  value={vehicleForm.vin}
                  onChange={(event) =>
                    setVehicleForm((current) => ({
                      ...current,
                      vin: normalizeVinInput(event.target.value),
                    }))
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="review-make">Make</Label>
                <Input id="review-make" value={vehicleForm.make} onChange={(event) => setVehicleForm((current) => ({ ...current, make: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="review-model">Model</Label>
                <Input id="review-model" value={vehicleForm.model} onChange={(event) => setVehicleForm((current) => ({ ...current, model: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="review-year">Year</Label>
                <Input id="review-year" value={vehicleForm.year} onChange={(event) => setVehicleForm((current) => ({ ...current, year: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="review-engine">Engine model</Label>
                <Input id="review-engine" value={vehicleForm.engineMake} onChange={(event) => setVehicleForm((current) => ({ ...current, engineMake: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="review-label">Unit Number</Label>
                <Input id="review-label" value={vehicleForm.label} onChange={(event) => setVehicleForm((current) => ({ ...current, label: event.target.value }))} placeholder={`Unit ${getFallbackUnitNumber(vehicleForm.vin) || "123456"}`} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="review-plate">License Plate</Label>
                <Input id="review-plate" value={vehicleForm.licensePlate} onChange={(event) => setVehicleForm((current) => ({ ...current, licensePlate: event.target.value }))} placeholder="Optional" className="mt-2" />
              </div>
            </div>
            {renderReviewExtras ? (
              <div className="border-t border-slate-200 pt-4">
                {renderReviewExtras({
                  vehicleForm,
                  setVehicleForm,
                })}
              </div>
            ) : null}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setStep("manual")} disabled={step === "saving"}>
                Edit VIN
              </Button>
              <Button type="button" onClick={() => void saveVehicle()} disabled={step === "saving" || createVehicleMutation.isPending}>
                {step === "saving" || createVehicleMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CarFront className="mr-2 h-4 w-4" />}
                {saveButtonLabel}
              </Button>
            </div>
          </div>
        ) : null}

        {onCancel ? (
          <div className="pt-1">
            <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
