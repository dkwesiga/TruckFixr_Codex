import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { getFriendlyErrorMessage } from "@/lib/actionErrorMessages";
import { decodeVin, normalizeVinInput, type DecodedVehicle } from "@/lib/vin";
import VinPhotoCapture from "@/components/VinPhotoCapture";

const shell = "mx-auto w-full max-w-[640px] px-4 sm:px-6";
const cardClass =
  "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

type Step = "vehicle" | "form" | "submitted";

export default function RequestAPart() {
  useSeoMeta({
    title: "Find a Part | TruckFixr",
    description: "Tell us the part you need or describe the issue — TruckFixr's GTA parts concierge sources supplier offers for you.",
  });

  const [step, setStep] = useState<Step>("vehicle");
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");

  // Vehicle identification (step 1) — VIN decode first, manual entry as fallback.
  const [vin, setVin] = useState("");
  const [vinDecoding, setVinDecoding] = useState(false);
  const [decodedVehicle, setDecodedVehicle] = useState<DecodedVehicle | null>(null);
  const [vehicleDecodeError, setVehicleDecodeError] = useState<string | null>(null);
  const [manualVehicleEntry, setManualVehicleEntry] = useState(false);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualUnitNumber, setManualUnitNumber] = useState("");
  const [vehicleStepError, setVehicleStepError] = useState<string | null>(null);
  const [vinFromPhoto, setVinFromPhoto] = useState(false);

  const submitMutation = trpc.partsRequests.submitPublic.useMutation();

  async function handleDecodeVin() {
    setVehicleDecodeError(null);
    const normalized = normalizeVinInput(vin);
    if (normalized.length !== 17) {
      setVehicleDecodeError("VIN must be 17 characters.");
      return;
    }
    setVin(normalized);
    setVinDecoding(true);
    const result = await decodeVin(normalized);
    setVinDecoding(false);
    if (result.ok) {
      setDecodedVehicle(result.vehicle);
      setVehicleStepError(null);
    } else {
      setDecodedVehicle(null);
      setVehicleDecodeError(result.error);
      setManualVehicleEntry(true);
    }
  }

  function handleVinPhotoCaptured(capturedVin: string) {
    setVin(capturedVin);
    setVinFromPhoto(true);
    setDecodedVehicle(null);
    setVehicleDecodeError(null);
  }

  function vehicleSummaryLabel() {
    if (decodedVehicle) {
      return [decodedVehicle.year, decodedVehicle.make, decodedVehicle.model].filter(Boolean).join(" ") || `VIN ${decodedVehicle.vin}`;
    }
    return [manualYear, manualMake, manualModel].filter(Boolean).join(" ") || manualUnitNumber || "Vehicle not specified";
  }

  function buildVehicleIdentifier(): Record<string, unknown> | undefined {
    if (decodedVehicle) {
      return {
        vin: decodedVehicle.vin,
        make: decodedVehicle.make || undefined,
        model: decodedVehicle.model || undefined,
        year: decodedVehicle.year ? String(decodedVehicle.year) : undefined,
        unitNumber: manualUnitNumber.trim() || undefined,
      };
    }
    const identifier = {
      unitNumber: manualUnitNumber.trim() || undefined,
      make: manualMake.trim() || undefined,
      model: manualModel.trim() || undefined,
      year: manualYear.trim() || undefined,
    };
    return Object.values(identifier).some(Boolean) ? identifier : undefined;
  }

  function handleVehicleContinue() {
    setVehicleStepError(null);
    const hasDecoded = Boolean(decodedVehicle && (decodedVehicle.make || decodedVehicle.model));
    const hasManual = Boolean(manualVehicleEntry && (manualMake.trim() || manualModel.trim()));
    if (!hasDecoded && !hasManual) {
      setVehicleStepError("Decode a VIN, or enter the vehicle's make and model, to continue.");
      return;
    }
    setStep("form");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partNumber.trim() && !partDescription.trim()) {
      setError("Please provide a part number or describe what you need.");
      return;
    }
    try {
      const vehicleLabel = vehicleSummaryLabel();
      const vehiclePrefix = vehicleLabel && vehicleLabel !== "Vehicle not specified" ? `Vehicle: ${vehicleLabel}\n\n` : "";
      await submitMutation.mutateAsync({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || undefined,
        partNumber: partNumber.trim() || undefined,
        partDescription: partDescription.trim() ? `${vehiclePrefix}${partDescription.trim()}` : vehiclePrefix.trim() || undefined,
        vehicleIdentifier: buildVehicleIdentifier(),
      });
      setStep("submitted");
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-24 font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <header className="border-b border-[#C3C7CE] bg-white/90 backdrop-blur">
        <div className={cn(shell, "flex items-center justify-between py-3")}>
          <Link href="/" className="flex items-center gap-2">
            <AppLogo />
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#38465F] hover:text-[#0A1A2E]">
            Back to home
          </Link>
        </div>
      </header>

      <main className={cn(shell, "space-y-4 pt-8")}>
        {step === "submitted" && (
          <div className={cn(cardClass, "space-y-3 p-6 text-center")}>
            <Check className="mx-auto h-10 w-10 text-[#1EA66C]" aria-hidden="true" />
            <h1 className={cn(displayClass, "text-xl")}>Request received</h1>
            <p className="text-sm text-[#38465F]">
              A TruckFixr team member will reach out with supplier offers to compare. GTA concierge pilot — response times may vary.
            </p>
          </div>
        )}

        {step === "vehicle" && (
          <div className={cn(cardClass, "space-y-5 p-5 sm:p-6")}>
            <div>
              <h1 className={cn(displayClass, "text-xl")}>Which vehicle is this part for?</h1>
              <p className="mt-1 text-sm text-[#38465F]">
                Start with the VIN — TruckFixr pulls the make, model, and year automatically so a supplier can quote accurately.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vin" className="text-sm font-semibold">
                VIN
              </Label>
              <div className="flex gap-2">
                <Input
                  id="vin"
                  value={vin}
                  onChange={(e) => {
                    setVin(e.target.value);
                    setVinFromPhoto(false);
                  }}
                  placeholder="17-character VIN"
                  maxLength={17}
                  autoComplete="off"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleDecodeVin}
                  disabled={vinDecoding}
                  className={cn("h-11 shrink-0 font-bold", redBtn)}
                >
                  {vinDecoding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decode"}
                </Button>
              </div>
              {vinFromPhoto && (
                <p className="text-sm font-medium text-[#38465F]">
                  Read from your photo — double-check it against the plate, then tap Decode.
                </p>
              )}
              {vehicleDecodeError && (
                <p className="text-sm font-medium text-[#D81F2A]" role="alert">
                  {vehicleDecodeError}
                </p>
              )}
              <VinPhotoCapture onVinCaptured={handleVinPhotoCaptured} disabled={vinDecoding} />
            </div>

            {decodedVehicle && (decodedVehicle.make || decodedVehicle.model || decodedVehicle.year) && (
              <div className="rounded-md border border-[#1EA66C] bg-[#EAF8F1] p-3 text-sm">
                <p className="flex items-center gap-1.5 font-bold text-[#0A1A2E]">
                  <Check className="h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
                  {[decodedVehicle.year, decodedVehicle.make, decodedVehicle.model].filter(Boolean).join(" ")}
                </p>
                <p className="mt-1 text-xs text-[#38465F]">VIN {decodedVehicle.vin}</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setManualVehicleEntry((v) => !v)}
              className="text-sm font-semibold text-[#38465F] underline underline-offset-2 hover:text-[#0A1A2E]"
            >
              {manualVehicleEntry ? "Hide manual entry" : "Don't have the VIN? Enter vehicle details manually"}
            </button>

            {manualVehicleEntry && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="manualMake" className="text-sm font-semibold">
                    Make
                  </Label>
                  <Input id="manualMake" value={manualMake} onChange={(e) => setManualMake(e.target.value)} placeholder="e.g. Freightliner" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manualModel" className="text-sm font-semibold">
                    Model
                  </Label>
                  <Input id="manualModel" value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="e.g. Cascadia" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manualYear" className="text-sm font-semibold">
                    Year <span className="font-normal text-[#73777E]">(optional)</span>
                  </Label>
                  <Input
                    id="manualYear"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 2021"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manualUnitNumber" className="text-sm font-semibold">
                    Unit number <span className="font-normal text-[#73777E]">(optional)</span>
                  </Label>
                  <Input
                    id="manualUnitNumber"
                    value={manualUnitNumber}
                    onChange={(e) => setManualUnitNumber(e.target.value)}
                    placeholder="e.g. Unit 214"
                  />
                </div>
              </div>
            )}

            {vehicleStepError && (
              <p className="text-sm font-medium text-[#D81F2A]" role="alert">
                {vehicleStepError}
              </p>
            )}

            <Button
              type="button"
              onClick={handleVehicleContinue}
              className={cn("h-12 w-full text-[15px] font-bold", redBtn)}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={handleSubmit} className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
            <div>
              <h1 className={cn(displayClass, "text-xl")}>Find a part</h1>
              <p className="mt-1 text-sm text-[#38465F]">
                Know the exact part number, or just describe what you need — we'll get supplier offers for you to compare.
                GTA concierge pilot.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#E2E6EC] bg-[#F8FAFC] p-3 text-sm">
              <span className="font-semibold text-[#0A1A2E]">{vehicleSummaryLabel()}</span>
              <button
                type="button"
                onClick={() => setStep("vehicle")}
                className="font-semibold text-[#38465F] underline underline-offset-2 hover:text-[#0A1A2E]"
              >
                Change
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="customerName">Your name</Label>
                <Input id="customerName" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="customerEmail">Email</Label>
                <Input id="customerEmail" type="email" required value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="customerPhone">Phone (optional)</Label>
              <Input id="customerPhone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="partNumber">Part number (if known)</Label>
              <Input id="partNumber" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="partDescription">Or describe what you need</Label>
              <Textarea
                id="partDescription"
                placeholder="Part name, symptoms, or any other details that help a supplier quote accurately"
                value={partDescription}
                onChange={(e) => setPartDescription(e.target.value)}
              />
            </div>

            {error && <p className="text-sm font-medium text-[#D81F2A]" role="alert">{error}</p>}

            <Button type="submit" disabled={submitMutation.isPending} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Request part offers
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
