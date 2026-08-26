import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CheckCircle2, Loader2, RotateCcw, ZoomIn } from "lucide-react";
import {
  computePreviewDimensions,
  decodeImageFile,
  logPipelineStage,
  prepareVinRoiFromCrop,
  previewCropToSourceCrop,
  validatePreparedVinImage,
  VIN_IMAGE_PIPELINE_CONFIG,
  type CropRect,
  type DecodedImage,
  type Dimensions,
  type ImageTransform,
} from "@/lib/vinImagePipeline";

// The VIN guide box is a wide, short band (VINs read as one horizontal line of 17 chars),
// expressed as a fraction of the container so it scales with viewport size.
const GUIDE_WIDTH_RATIO = 0.88;
const GUIDE_HEIGHT_RATIO = 0.22;
const MAX_ZOOM_MULTIPLIER = 4;

export type VinPositionCropResult = {
  dataUrl: string;
  blob: Blob;
};

type Props = {
  file: File;
  onConfirm: (result: VinPositionCropResult) => void;
  onCancel: () => void;
};

/**
 * Shared "position the VIN" step used by both VIN capture entry points
 * (VehicleCaptureFlow and VinPhotoCapture). Unlike the old drag-preview UI this component
 * replaced, every pan/zoom gesture here directly feeds the crop that gets sent to OCR —
 * there is no cosmetic-only transform.
 */
export default function VinPositionCropStep({ file, onConfirm, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const decodedRef = useRef<DecodedImage | null>(null);
  const initializedTransformRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const [status, setStatus] = useState<"decoding" | "ready" | "error" | "preparing">("decoding");
  const [error, setError] = useState("");
  const [cropWarning, setCropWarning] = useState("");
  const [containerSize, setContainerSize] = useState<Dimensions>({ width: 320, height: 288 });
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewDims, setPreviewDims] = useState<Dimensions>({ width: 0, height: 0 });
  const [sourceDims, setSourceDims] = useState<Dimensions>({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ImageTransform>({ scale: 1, translateX: 0, translateY: 0 });

  // Decode the file once and render a bounded preview. The full-resolution decoded bitmap
  // is kept in a ref (not React state) and only ever read at crop-confirm time — it is never
  // drawn into a full-size on-screen canvas.
  useEffect(() => {
    let cancelled = false;

    setStatus("decoding");
    setError("");
    initializedTransformRef.current = false;

    (async () => {
      try {
        const decoded = await decodeImageFile(file);
        if (cancelled) {
          decoded.close();
          return;
        }
        decodedRef.current = decoded;
        const source = { width: decoded.width, height: decoded.height };
        setSourceDims(source);

        const bounded = computePreviewDimensions(source, VIN_IMAGE_PIPELINE_CONFIG.MAX_PREVIEW_LONG_EDGE);
        setPreviewDims(bounded);

        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = bounded.width;
        previewCanvas.height = bounded.height;
        const ctx = previewCanvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context is unavailable on this device.");
        // One-step downscale straight into the bounded preview canvas — no full-resolution
        // canvas is ever allocated just to show the preview.
        ctx.drawImage(decoded.drawable, 0, 0, source.width, source.height, 0, 0, bounded.width, bounded.height);

        if (cancelled) return;
        setPreviewUrl(previewCanvas.toDataURL("image/jpeg", 0.85));
        setStatus("ready");

        logPipelineStage("decoded", {
          sourceWidth: source.width,
          sourceHeight: source.height,
          previewWidth: bounded.width,
          previewHeight: bounded.height,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't open this photo.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      decodedRef.current?.close();
      decodedRef.current = null;
    };
  }, [file]);

  // Measure the fixed viewport that hosts the image + guide box.
  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [status]);

  const minZoom =
    previewDims.width > 0 && previewDims.height > 0
      ? Math.max(1, containerSize.width / previewDims.width, containerSize.height / previewDims.height)
      : 1;
  const maxZoom = minZoom * MAX_ZOOM_MULTIPLIER;

  // Initialize the transform so the image covers the container (like background-size: cover)
  // as soon as we know both the preview's native size and the container's rendered size.
  useEffect(() => {
    if (status !== "ready" || initializedTransformRef.current) return;
    if (previewDims.width <= 0 || containerSize.width <= 0) return;
    setTransform({ scale: minZoom, translateX: 0, translateY: 0 });
    initializedTransformRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, previewDims, containerSize]);

  function clampTransform(next: ImageTransform): ImageTransform {
    const scale = Math.min(maxZoom, Math.max(minZoom, next.scale));
    const displayedWidth = previewDims.width * scale;
    const displayedHeight = previewDims.height * scale;
    const slackX = Math.max(0, (displayedWidth - containerSize.width) / 2);
    const slackY = Math.max(0, (displayedHeight - containerSize.height) / 2);
    return {
      scale,
      translateX: Math.max(-slackX, Math.min(slackX, next.translateX)),
      translateY: Math.max(-slackY, Math.min(slackY, next.translateY)),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: transform.translateX,
      baseY: transform.translateY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTransform((current) =>
      clampTransform({
        scale: current.scale,
        translateX: drag.baseX + (event.clientX - drag.startX),
        translateY: drag.baseY + (event.clientY - drag.startY),
      })
    );
  }

  function endDrag(event?: ReactPointerEvent<HTMLDivElement>) {
    if (event) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Some browsers throw if the capture was already released; safe to ignore.
      }
    }
    dragRef.current = null;
  }

  function handleZoomChange(values: number[]) {
    const nextScale = values[0];
    if (typeof nextScale !== "number") return;
    setTransform((current) => clampTransform({ ...current, scale: nextScale }));
  }

  function handleReset() {
    setTransform(clampTransform({ scale: minZoom, translateX: 0, translateY: 0 }));
  }

  function guideRect(): CropRect {
    return {
      width: containerSize.width * GUIDE_WIDTH_RATIO,
      height: containerSize.height * GUIDE_HEIGHT_RATIO,
      x: (containerSize.width * (1 - GUIDE_WIDTH_RATIO)) / 2,
      y: (containerSize.height * (1 - GUIDE_HEIGHT_RATIO)) / 2,
    };
  }

  // Live estimate of the source-resolution crop this transform would produce, recomputed as
  // the user pans/zooms so they get feedback *before* confirming instead of only after a
  // failed OCR round trip. Pure math (see previewCropToSourceCrop) — no canvas work here.
  function computeLiveCropLongEdge(): number {
    if (status !== "ready" && status !== "preparing") return 0;
    const crop = previewCropToSourceCrop(
      guideRect(),
      { container: containerSize, image: previewDims },
      sourceDims,
      transform
    );
    return Math.max(crop.width, crop.height);
  }
  const liveCropLongEdge = computeLiveCropLongEdge();
  const cropQuality: "low" | "ok" | "good" =
    liveCropLongEdge < VIN_IMAGE_PIPELINE_CONFIG.MIN_VIN_CROP_LONG_EDGE
      ? "low"
      : liveCropLongEdge < VIN_IMAGE_PIPELINE_CONFIG.RECOMMENDED_VIN_CROP_LONG_EDGE
        ? "ok"
        : "good";

  async function handleConfirm() {
    const decoded = decodedRef.current;
    if (!decoded || status !== "ready") return;

    setCropWarning("");
    setStatus("preparing");

    try {
      const sourceCrop = previewCropToSourceCrop(
        guideRect(),
        { container: containerSize, image: previewDims },
        sourceDims,
        transform
      );

      const prepared = await prepareVinRoiFromCrop(decoded.drawable, sourceCrop);
      const validation = validatePreparedVinImage({
        width: prepared.outputDimensions.width,
        height: prepared.outputDimensions.height,
        byteSize: prepared.byteSize,
      });

      logPipelineStage("crop-confirmed", {
        sourceWidth: sourceDims.width,
        sourceHeight: sourceDims.height,
        cropWidth: Math.round(sourceCrop.width),
        cropHeight: Math.round(sourceCrop.height),
        outputWidth: prepared.outputDimensions.width,
        outputHeight: prepared.outputDimensions.height,
        outputBytes: prepared.byteSize,
        valid: validation.ok,
      });

      if (!validation.ok) {
        setStatus("ready");
        setCropWarning(
          validation.reason === "CROP_TOO_SMALL"
            ? "Zoom in a bit more so the VIN fills the box before continuing."
            : "That crop doesn't look right — try repositioning the photo."
        );
        return;
      }

      onConfirm({ dataUrl: prepared.dataUrl, blob: prepared.blob });
    } catch (err) {
      setStatus("ready");
      setCropWarning(err instanceof Error ? err.message : "Couldn't prepare this photo. Try again.");
    }
  }

  if (status === "error") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          {error || "Couldn't open this photo."}
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="relative h-72 w-full touch-none overflow-hidden rounded-3xl border border-slate-200 bg-slate-950/95"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {status === "decoding" || !previewUrl ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/80">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing photo…
          </div>
        ) : (
          <>
            <img
              src={previewUrl}
              alt="VIN preview"
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: previewDims.width,
                height: previewDims.height,
                transform: `translate(-50%, -50%) translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`,
                touchAction: "none",
                userSelect: "none",
              }}
              draggable={false}
            />
            {/* VIN guide box: the exact region mapped back to source coordinates on confirm. */}
            <div
              className="pointer-events-none absolute rounded-xl border-2 border-white/90"
              style={{
                width: `${GUIDE_WIDTH_RATIO * 100}%`,
                height: `${GUIDE_HEIGHT_RATIO * 100}%`,
                left: `${((1 - GUIDE_WIDTH_RATIO) / 2) * 100}%`,
                top: `${((1 - GUIDE_HEIGHT_RATIO) / 2) * 100}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              }}
            />
            <div className="pointer-events-none absolute inset-x-4 top-3 rounded-full bg-black/55 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur">
              Position the full 17-character VIN inside the box.
            </div>
            {status === "preparing" ? (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 text-sm text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing crop…
              </div>
            ) : null}
          </>
        )}
      </div>

      {status === "ready" || status === "preparing" ? (
        <div className="flex items-center gap-3 px-1">
          <ZoomIn className="h-4 w-4 shrink-0 text-slate-500" />
          <Slider
            min={minZoom}
            max={maxZoom}
            step={(maxZoom - minZoom) / 100 || 0.01}
            value={[transform.scale]}
            onValueChange={handleZoomChange}
            disabled={status === "preparing"}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleReset}
            disabled={status === "preparing"}
            aria-label="Reset zoom and position"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {status === "ready" || status === "preparing" ? (
        cropQuality === "good" ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Good framing — this should read clearly.
          </p>
        ) : (
          <p className="text-sm font-medium text-amber-700">
            {cropQuality === "low"
              ? "Zoom in until the VIN fills the box, or move closer and retake the photo."
              : "Zoom in a bit more for the sharpest read."}
          </p>
        )
      ) : null}

      {cropWarning ? (
        <p className="text-sm font-medium text-amber-700" role="alert">
          {cropWarning}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={status === "preparing"}>
          Back
        </Button>
        <Button type="button" onClick={() => void handleConfirm()} disabled={status !== "ready"}>
          {status === "preparing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Use This Crop
        </Button>
      </div>
    </div>
  );
}
