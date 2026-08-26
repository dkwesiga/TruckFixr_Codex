import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { normalizeVinInput } from "@/lib/vin";
import VinPositionCropStep, { type VinPositionCropResult } from "@/components/vin-capture/VinPositionCropStep";

type Props = {
  onVinCaptured: (vin: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
};

/**
 * Lets a guest capture a photo of a VIN plate, OCRs it via
 * /api/vehicles/extract-vin, and hands the extracted VIN back to the caller
 * for confirmation — it never decodes or submits the VIN itself.
 *
 * Shares the same position/crop pipeline as VehicleCaptureFlow (see
 * client/src/components/vin-capture/VinPositionCropStep.tsx and
 * client/src/lib/vinImagePipeline.ts) so both VIN capture entry points prepare the
 * image the same way before it ever reaches OCR.
 */
export default function VinPhotoCapture({ onVinCaptured, disabled, className, label = "Scan VIN photo" }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OCR only ever starts after the crop dialog has closed on a confirmed crop.
  async function runOcr(image: VinPositionCropResult) {
    setError(null);
    setProcessing(true);
    try {
      const response = await fetch(getApiUrl("/api/vehicles/extract-vin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: image.dataUrl }),
      });
      const payload = await readApiPayload<Record<string, any>>(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the VIN extraction API response.",
      }).catch(() => ({} as Record<string, any>));

      if (!response.ok || !payload.vin) {
        setError(payload.warning || payload.error || "Couldn't read the VIN clearly. Try another photo or enter it manually.");
        return;
      }

      setSourceFile(null);
      onVinCaptured(normalizeVinInput(String(payload.vin)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the VIN clearly. Try another photo or enter it manually.");
    } finally {
      setProcessing(false);
    }
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setSourceFile(file);
    setCropDialogOpen(true);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || processing}
        onClick={() => inputRef.current?.click()}
        className="w-full gap-2 font-semibold"
      >
        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {processing ? "Reading VIN…" : label}
      </Button>
      {error && (
        <div className="mt-1 space-y-1">
          <p className="text-sm font-medium text-[#D81F2A]" role="alert">
            {error}
          </p>
          {sourceFile ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm font-medium underline"
              onClick={() => setCropDialogOpen(true)}
            >
              Adjust Photo
            </Button>
          ) : null}
        </div>
      )}

      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Position the VIN</DialogTitle>
          </DialogHeader>
          {sourceFile ? (
            <VinPositionCropStep
              file={sourceFile}
              onConfirm={(result) => {
                setCropDialogOpen(false);
                void runOcr(result);
              }}
              onCancel={() => setCropDialogOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
