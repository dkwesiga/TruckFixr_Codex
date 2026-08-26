import { describe, expect, it } from "vitest";
import {
  clampCropToBounds,
  computePreviewDimensions,
  computeRoiOutputDimensions,
  previewCropToSourceCrop,
  validatePreparedVinImage,
  type PreviewLayout,
} from "./vinImagePipeline";

describe("computePreviewDimensions", () => {
  it("downscales a large landscape image to the bound", () => {
    expect(computePreviewDimensions({ width: 4032, height: 3024 }, 1024)).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it("downscales a large portrait image to the bound", () => {
    expect(computePreviewDimensions({ width: 3024, height: 4032 }, 1024)).toEqual({
      width: 768,
      height: 1024,
    });
  });

  it("never upscales an image smaller than the bound", () => {
    expect(computePreviewDimensions({ width: 400, height: 300 }, 1024)).toEqual({
      width: 400,
      height: 300,
    });
  });
});

describe("previewCropToSourceCrop", () => {
  // A 320x288 container showing an 800x600 landscape preview of a 4000x3000 source
  // (i.e. the preview itself is already downscaled 5x from source).
  const landscapeLayout: PreviewLayout = {
    container: { width: 320, height: 288 },
    image: { width: 800, height: 600 },
  };
  const landscapeSource = { width: 4000, height: 3000 };
  const identityTransform = { scale: 1, translateX: 0, translateY: 0 };

  it("maps a centered guide box back to source coordinates at scale 1", () => {
    // Guide box: 240x80 centered in the 320x288 container -> (40, 104) top-left.
    const guide = { x: 40, y: 104, width: 240, height: 80 };
    const result = previewCropToSourceCrop(guide, landscapeLayout, landscapeSource, identityTransform);

    // Image top-left on screen at identity transform: center (160,144) minus half of
    // displayed size (400,300) => (-240, -156).
    // sourceCrop.x = (40 - -240) / 1 * (4000/800) = 280 * 5 = 1400
    expect(result.x).toBeCloseTo(1400);
    expect(result.y).toBeCloseTo((104 - -156) * (3000 / 600));
    expect(result.width).toBeCloseTo(240 * (4000 / 800));
    expect(result.height).toBeCloseTo(80 * (3000 / 600));
  });

  it("handles a portrait source/preview pair", () => {
    const portraitLayout: PreviewLayout = {
      container: { width: 288, height: 400 },
      image: { width: 600, height: 800 },
    };
    const portraitSource = { width: 3000, height: 4000 };
    const guide = { x: 44, y: 160, width: 200, height: 80 };

    const result = previewCropToSourceCrop(guide, portraitLayout, portraitSource, identityTransform);

    expect(result.width).toBeCloseTo(200 * (3000 / 600));
    expect(result.height).toBeCloseTo(80 * (4000 / 800));
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });

  it("scales up a very large (48MP-class) source proportionally", () => {
    const hugeSource = { width: 8000, height: 6000 };
    const guide = { x: 40, y: 104, width: 240, height: 80 };
    const result = previewCropToSourceCrop(guide, landscapeLayout, hugeSource, identityTransform);

    expect(result.width).toBeCloseTo(240 * (8000 / 800));
    expect(result.height).toBeCloseTo(80 * (6000 / 600));
    expect(result.width).toBeLessThanOrEqual(hugeSource.width);
    expect(result.height).toBeLessThanOrEqual(hugeSource.height);
  });

  it("accounts for a resized preview (smaller bounded preview than source)", () => {
    const smallPreviewLayout: PreviewLayout = {
      container: { width: 320, height: 288 },
      image: { width: 400, height: 300 }, // preview bounded tighter than the 800x600 case above
    };
    const guide = { x: 40, y: 104, width: 240, height: 80 };
    const result = previewCropToSourceCrop(guide, smallPreviewLayout, landscapeSource, identityTransform);

    // previewToSource ratio is now 10x instead of 5x, so the mapped crop is twice as large.
    const wideLayoutResult = previewCropToSourceCrop(guide, landscapeLayout, landscapeSource, identityTransform);
    expect(result.width).toBeCloseTo(wideLayoutResult.width * 2, 0);
  });

  it("shrinks the mapped source crop when the user zooms in", () => {
    const zoomedTransform = { scale: 2, translateX: 0, translateY: 0 };
    const guide = { x: 40, y: 104, width: 240, height: 80 };

    const base = previewCropToSourceCrop(guide, landscapeLayout, landscapeSource, identityTransform);
    const zoomed = previewCropToSourceCrop(guide, landscapeLayout, landscapeSource, zoomedTransform);

    // Zooming in means the same on-screen guide box now covers a smaller source region.
    expect(zoomed.width).toBeCloseTo(base.width / 2, 0);
    expect(zoomed.height).toBeCloseTo(base.height / 2, 0);
  });

  it("shifts the mapped source crop when the user pans/translates the image", () => {
    const guide = { x: 40, y: 104, width: 240, height: 80 };
    const base = previewCropToSourceCrop(guide, landscapeLayout, landscapeSource, identityTransform);
    const panned = previewCropToSourceCrop(
      guide,
      landscapeLayout,
      landscapeSource,
      { scale: 1, translateX: 50, translateY: 0 }
    );

    // Panning the image right by 50 CSS px moves the guide box's mapped source region left
    // by 50 * (source/preview) px.
    expect(panned.x).toBeCloseTo(base.x - 50 * (4000 / 800));
    expect(panned.width).toBeCloseTo(base.width);
  });

  it("clamps the mapped crop to stay within source bounds", () => {
    // Guide box far outside the displayed image at a large zoom -> would map out of bounds.
    const guide = { x: 0, y: 0, width: 320, height: 288 };
    const result = previewCropToSourceCrop(
      guide,
      landscapeLayout,
      landscapeSource,
      { scale: 0.1, translateX: 0, translateY: 0 }
    );

    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(landscapeSource.width);
    expect(result.y + result.height).toBeLessThanOrEqual(landscapeSource.height);
  });
});

describe("clampCropToBounds", () => {
  it("leaves an in-bounds crop untouched", () => {
    expect(clampCropToBounds({ x: 10, y: 10, width: 50, height: 40 }, { width: 100, height: 100 })).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 40,
    });
  });

  it("pulls a negative-origin crop back into bounds", () => {
    const result = clampCropToBounds({ x: -20, y: -30, width: 50, height: 40 }, { width: 100, height: 100 });
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it("shrinks a crop that overflows the far edge", () => {
    const result = clampCropToBounds({ x: 80, y: 80, width: 50, height: 50 }, { width: 100, height: 100 });
    expect(result.width).toBeLessThanOrEqual(20);
    expect(result.height).toBeLessThanOrEqual(20);
  });
});

describe("computeRoiOutputDimensions", () => {
  it("never upscales a crop smaller than the max long edge", () => {
    expect(computeRoiOutputDimensions({ width: 500, height: 200 }, 1600)).toEqual({ width: 500, height: 200 });
  });

  it("downscales a crop larger than the max long edge", () => {
    expect(computeRoiOutputDimensions({ width: 3200, height: 800 }, 1600)).toEqual({ width: 1600, height: 400 });
  });
});

describe("validatePreparedVinImage", () => {
  it("accepts a well-formed output image", () => {
    expect(validatePreparedVinImage({ width: 900, height: 300, byteSize: 200_000 })).toEqual({ ok: true });
  });

  it("rejects a zero-size crop", () => {
    expect(validatePreparedVinImage({ width: 0, height: 0, byteSize: 0 })).toEqual({
      ok: false,
      reason: "CROP_INVALID",
    });
  });

  it("rejects a crop below the minimum usable long edge", () => {
    expect(validatePreparedVinImage({ width: 100, height: 40, byteSize: 5_000 })).toEqual({
      ok: false,
      reason: "CROP_TOO_SMALL",
    });
  });

  it("rejects an oversized output", () => {
    expect(
      validatePreparedVinImage({ width: 1600, height: 500, byteSize: 10 * 1024 * 1024 })
    ).toEqual({ ok: false, reason: "OUTPUT_TOO_LARGE" });
  });
});
