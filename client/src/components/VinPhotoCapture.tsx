import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiUrl, readApiPayload } from "@/lib/api";
import { normalizeVinInput } from "@/lib/vin";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

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
 */
export default function VinPhotoCapture({ onVinCaptured, disabled, className, label = "Scan VIN photo" }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setProcessing(true);
    try {
      const imageDataUrl = await fileToDataUrl(file);
      const response = await fetch(getApiUrl("/api/vehicles/extract-vin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl }),
      });
      const payload = await readApiPayload<Record<string, any>>(response, {
        htmlErrorMessage: "TruckFixr received an HTML page instead of the VIN extraction API response.",
      }).catch(() => ({} as Record<string, any>));

      if (!response.ok || !payload.vin) {
        setError(payload.warning || payload.error || "Couldn't read the VIN clearly. Try another photo or enter it manually.");
        return;
      }

      if (payload.warning) {
        setError(String(payload.warning));
      }

      onVinCaptured(normalizeVinInput(String(payload.vin)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the VIN clearly. Try another photo or enter it manually.");
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
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
        <p className="mt-1 text-sm font-medium text-[#D81F2A]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
