// Shared image-preparation pipeline for VIN photo capture.
//
// This module is deliberately framework-agnostic (no React) so the crop-coordinate
// math can be unit tested without a DOM/canvas, and so both VIN capture entry points
// (VehicleCaptureFlow and VinPhotoCapture) can share one implementation instead of
// duplicating ad-hoc ratio math in components.
//
// Pipeline shape:
//   File -> decodeImageFile -> source dimensions
//        -> computePreviewDimensions -> bounded preview shown to the user
//        -> user pans/zooms the preview under a fixed VIN guide box
//        -> previewCropToSourceCrop maps that guide box back to source-image coordinates
//        -> cropAndResizeSource crops+downscales in a single drawImage call (no full-size
//           intermediate canvas)
//        -> prepareVinRoiFromCrop exports the ROI as a bounded JPEG Blob/Data URL
//        -> validatePreparedVinImage guards against empty/too-small/too-large output

export type Dimensions = { width: number; height: number };

export type CropRect = { x: number; y: number; width: number; height: number };

/** Pan/zoom applied to the preview image: translate first, then scale around its own center. */
export type ImageTransform = { scale: number; translateX: number; translateY: number };

/** The on-screen geometry needed to map a crop rect from preview/container space to source space. */
export type PreviewLayout = {
  /** The fixed viewport that shows the image and the VIN guide box, in CSS px. */
  container: Dimensions;
  /** The rendered size of the image at transform.scale === 1, in CSS px (see computePreviewDimensions). */
  image: Dimensions;
};

export const VIN_IMAGE_PIPELINE_CONFIG = {
  /** Long edge of the bounded preview shown to the user while positioning the VIN. */
  MAX_PREVIEW_LONG_EDGE: 1024,
  /** Long edge of the exported VIN ROI sent to OCR. Never upscaled past the source crop. */
  MAX_ROI_LONG_EDGE: 1600,
  /** Below this long edge, the crop is considered too small to reliably contain readable VIN text. */
  MIN_VIN_CROP_LONG_EDGE: 280,
  /**
   * Advisory (not enforced) threshold: below this, the live "position" step nudges the user
   * to zoom in further, since a crop this small is still valid but marginal for OCR.
   */
  RECOMMENDED_VIN_CROP_LONG_EDGE: 720,
  /** Zoom is never allowed below this, even in degenerate guide/preview-size edge cases. */
  MIN_ZOOM_SAFETY_FLOOR: 0.05,
  /** Zoom-in headroom is always at least this multiple of the preview's native pixel size. */
  MIN_MAX_ZOOM: 3,
  OUTPUT_MIME: "image/jpeg" as const,
  JPEG_QUALITY: 0.92,
  MAX_OUTPUT_BYTES: 3 * 1024 * 1024,
} as const;

export const VIN_CROP_PADDING = {
  /** Fraction of the mapped crop's own width added on *each* horizontal side before OCR. */
  HORIZONTAL_RATIO: 0.15,
  /** Fraction of the mapped crop's own height added on *each* vertical side before OCR. */
  VERTICAL_RATIO: 0.35,
} as const;

export type DecodedImage = {
  drawable: CanvasImageSource;
  width: number;
  height: number;
  /** Releases the ImageBitmap or revokes the object URL backing an <img> fallback. */
  close: () => void;
};

/**
 * Decodes an uploaded/captured file into a drawable source with orientation already
 * normalized. Prefers createImageBitmap({ imageOrientation: "from-image" }), which applies
 * EXIF orientation and avoids ever laying the image out in the DOM. Falls back to an <img>
 * element for browsers without bitmap decode support (orientation may not be corrected there).
 */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some browsers/formats reject createImageBitmap; fall through to the <img> path.
    }
  }
  return decodeImageFileViaImgElement(file);
}

function decodeImageFileViaImgElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        drawable: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't decode the selected image."));
    };
    img.src = url;
  });
}

/** Scales `source` down (never up) so its long edge is at most `maxLongEdge`. */
export function computePreviewDimensions(source: Dimensions, maxLongEdge: number): Dimensions {
  const longEdge = Math.max(source.width, source.height);
  const scale = longEdge > 0 ? Math.min(1, maxLongEdge / longEdge) : 1;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/** Clamps a crop rect so it lies entirely within [0, bounds]. */
export function clampCropToBounds(crop: CropRect, bounds: Dimensions): CropRect {
  const x = Math.max(0, Math.min(crop.x, Math.max(0, bounds.width - 1)));
  const y = Math.max(0, Math.min(crop.y, Math.max(0, bounds.height - 1)));
  const width = Math.max(1, Math.min(crop.width, bounds.width - x));
  const height = Math.max(1, Math.min(crop.height, bounds.height - y));
  return { x, y, width, height };
}

/**
 * The single explicit coordinate-mapping function for VIN crop selection. Everything else
 * (React state, pointer handlers, sliders) should feed this function rather than computing
 * its own ratios.
 *
 * Geometry assumed (matches how the preview is rendered in VinPositionCropStep):
 *   - `layout.image` is the preview image's rendered size at transform.scale === 1.
 *   - The image is centered in `layout.container`, then shifted by
 *     (transform.translateX, transform.translateY), then scaled by transform.scale around
 *     its own center (i.e. CSS `translate(-50%, -50%) translate(tx, ty) scale(s)` on an
 *     element positioned at left: 50%; top: 50%).
 *   - `previewCrop` (the fixed VIN guide box) is given in container coordinates, CSS px,
 *     top-left origin.
 */
export function previewCropToSourceCrop(
  previewCrop: CropRect,
  layout: PreviewLayout,
  sourceDimensions: Dimensions,
  transform: ImageTransform
): CropRect {
  const scale = transform.scale > 0 ? transform.scale : 1;

  const imageCenterX = layout.container.width / 2 + transform.translateX;
  const imageCenterY = layout.container.height / 2 + transform.translateY;
  const displayedWidth = layout.image.width * scale;
  const displayedHeight = layout.image.height * scale;
  const imageLeft = imageCenterX - displayedWidth / 2;
  const imageTop = imageCenterY - displayedHeight / 2;

  const previewToSourceX = layout.image.width > 0 ? sourceDimensions.width / layout.image.width : 1;
  const previewToSourceY = layout.image.height > 0 ? sourceDimensions.height / layout.image.height : 1;

  const rawCrop: CropRect = {
    x: ((previewCrop.x - imageLeft) / scale) * previewToSourceX,
    y: ((previewCrop.y - imageTop) / scale) * previewToSourceY,
    width: (previewCrop.width / scale) * previewToSourceX,
    height: (previewCrop.height / scale) * previewToSourceY,
  };

  return clampCropToBounds(rawCrop, sourceDimensions);
}

/**
 * Minimum zoom scale that keeps the VIN guide box fully backed by image pixels — the
 * preview image only needs to cover the *guide region*, not the entire preview container.
 * (Forcing coverage of the whole container, as an earlier version of this component did via
 * `Math.max(1, ...)`, over-constrains zoom-out on a high-resolution preview bitmap shown in a
 * small mobile viewport: the image is already far larger than the container at scale 1, so a
 * floor of 1 makes it impossible to zoom out far enough to see the whole VIN label.)
 */
export function computeMinZoomForGuide(guide: Dimensions, previewDims: Dimensions): number {
  if (previewDims.width <= 0 || previewDims.height <= 0) return 1;
  return Math.max(
    VIN_IMAGE_PIPELINE_CONFIG.MIN_ZOOM_SAFETY_FLOOR,
    guide.width / previewDims.width,
    guide.height / previewDims.height
  );
}

/**
 * Expands a source-space crop rect by a padding ratio on each side (before clamping to the
 * source image bounds). Used to send OCR a looser ROI than the visible guide box — the guide
 * only needs the VIN comfortably inside it, not glyph-tight, so the padded crop preserves
 * character edges and label-border context that a razor-tight crop could clip.
 */
export function padCropRect(
  crop: CropRect,
  bounds: Dimensions,
  config: { horizontalRatio?: number; verticalRatio?: number } = {}
): CropRect {
  const horizontalRatio = config.horizontalRatio ?? VIN_CROP_PADDING.HORIZONTAL_RATIO;
  const verticalRatio = config.verticalRatio ?? VIN_CROP_PADDING.VERTICAL_RATIO;

  const padX = crop.width * horizontalRatio;
  const padY = crop.height * verticalRatio;

  const padded: CropRect = {
    x: crop.x - padX,
    y: crop.y - padY,
    width: crop.width + padX * 2,
    height: crop.height + padY * 2,
  };

  return clampCropToBounds(padded, bounds);
}

/** Scales `crop` down (never up) so its long edge is at most `maxLongEdge`. */
export function computeRoiOutputDimensions(crop: Dimensions, maxLongEdge: number): Dimensions {
  const longEdge = Math.max(crop.width, crop.height);
  const scale = longEdge > 0 ? Math.min(1, maxLongEdge / longEdge) : 1;
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

/**
 * Crops and (if needed) downscales `source` in a single drawImage call, so the only canvas
 * ever allocated is sized to the *output* ROI, not the full source photo. This is the
 * mobile-memory-safe alternative to drawing the whole source into a full-resolution canvas
 * first and cropping afterwards.
 */
export function cropAndResizeSource(
  source: CanvasImageSource,
  sourceCrop: CropRect,
  maxOutputLongEdge: number = VIN_IMAGE_PIPELINE_CONFIG.MAX_ROI_LONG_EDGE
): HTMLCanvasElement {
  const outputDimensions = computeRoiOutputDimensions(sourceCrop, maxOutputLongEdge);
  const canvas = document.createElement("canvas");
  canvas.width = outputDimensions.width;
  canvas.height = outputDimensions.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable on this device.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    source,
    sourceCrop.x,
    sourceCrop.y,
    sourceCrop.width,
    sourceCrop.height,
    0,
    0,
    outputDimensions.width,
    outputDimensions.height
  );

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Couldn't export the prepared VIN image."));
      },
      mimeType,
      quality
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Couldn't read the prepared VIN image."));
    reader.readAsDataURL(blob);
  });
}

export type PreparedVinImage = {
  dataUrl: string;
  blob: Blob;
  outputDimensions: Dimensions;
  sourceCrop: CropRect;
  byteSize: number;
};

/** Crops+resizes+exports a source-space crop rect into the final image sent to OCR. */
export async function prepareVinRoiFromCrop(
  source: CanvasImageSource,
  sourceCrop: CropRect,
  config: { maxOutputLongEdge?: number; mimeType?: string; quality?: number } = {}
): Promise<PreparedVinImage> {
  const maxOutputLongEdge = config.maxOutputLongEdge ?? VIN_IMAGE_PIPELINE_CONFIG.MAX_ROI_LONG_EDGE;
  const mimeType = config.mimeType ?? VIN_IMAGE_PIPELINE_CONFIG.OUTPUT_MIME;
  const quality = config.quality ?? VIN_IMAGE_PIPELINE_CONFIG.JPEG_QUALITY;

  const canvas = cropAndResizeSource(source, sourceCrop, maxOutputLongEdge);
  const blob = await canvasToBlob(canvas, mimeType, quality);
  const dataUrl = await blobToDataUrl(blob);

  return {
    dataUrl,
    blob,
    outputDimensions: { width: canvas.width, height: canvas.height },
    sourceCrop,
    byteSize: blob.size,
  };
}

export type ImageValidationFailureReason = "CROP_INVALID" | "CROP_TOO_SMALL" | "OUTPUT_EMPTY" | "OUTPUT_TOO_LARGE";

export type ImageValidationResult = { ok: true } | { ok: false; reason: ImageValidationFailureReason };

/** Guards against sending an empty, too-small, or oversized image into OCR. */
export function validatePreparedVinImage(
  image: { width: number; height: number; byteSize: number },
  config: { minLongEdge?: number; maxBytes?: number } = {}
): ImageValidationResult {
  const minLongEdge = config.minLongEdge ?? VIN_IMAGE_PIPELINE_CONFIG.MIN_VIN_CROP_LONG_EDGE;
  const maxBytes = config.maxBytes ?? VIN_IMAGE_PIPELINE_CONFIG.MAX_OUTPUT_BYTES;

  if (image.width <= 0 || image.height <= 0) {
    return { ok: false, reason: "CROP_INVALID" };
  }
  if (Math.max(image.width, image.height) < minLongEdge) {
    return { ok: false, reason: "CROP_TOO_SMALL" };
  }
  if (image.byteSize <= 0) {
    return { ok: false, reason: "OUTPUT_EMPTY" };
  }
  if (image.byteSize > maxBytes) {
    return { ok: false, reason: "OUTPUT_TOO_LARGE" };
  }
  return { ok: true };
}

type PipelineLogData = Record<string, string | number | boolean | null | undefined>;

/** Dev-only diagnostic logging. Logs dimensions/byte sizes/timings only, never image data. */
export function logPipelineStage(stage: string, data: PipelineLogData) {
  if (typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug(`[vin-image-pipeline] ${stage}`, data);
  }
}
