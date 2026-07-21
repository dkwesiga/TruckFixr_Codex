import { describe, expect, it } from "vitest";

import { sniffMimeType, validateDocument } from "./documentValidation";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const HTML = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50]); // <!DOCTYP
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]);

describe("sniffMimeType", () => {
  it("recognizes allowed types by magic bytes", () => {
    expect(sniffMimeType(PDF)).toBe("application/pdf");
    expect(sniffMimeType(JPEG)).toBe("image/jpeg");
    expect(sniffMimeType(PNG)).toBe("image/png");
    expect(sniffMimeType(WEBP)).toBe("image/webp");
  });

  it("rejects disallowed content (HTML, executables)", () => {
    expect(sniffMimeType(HTML)).toBeNull();
    expect(sniffMimeType(ELF)).toBeNull();
  });
});

describe("validateDocument", () => {
  it("accepts a well-formed PDF", () => {
    const result = validateDocument({
      filename: "invoice.pdf",
      declaredMimeType: "application/pdf",
      sizeBytes: 1000,
      headerBytes: PDF,
    });
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe("application/pdf");
  });

  it("rejects an oversized file", () => {
    const result = validateDocument({
      filename: "invoice.pdf",
      declaredMimeType: "application/pdf",
      sizeBytes: 20 * 1024 * 1024,
      headerBytes: PDF,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/exceeds/i);
  });

  it("rejects a forged extension (html renamed to .pdf)", () => {
    const result = validateDocument({
      filename: "evil.pdf",
      declaredMimeType: "application/pdf",
      sizeBytes: 1000,
      headerBytes: HTML,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a disallowed extension even with valid content", () => {
    const result = validateDocument({
      filename: "invoice.svg",
      declaredMimeType: "image/svg+xml",
      sizeBytes: 1000,
      headerBytes: PNG,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a mismatched extension vs content (png bytes as .pdf)", () => {
    const result = validateDocument({
      filename: "invoice.pdf",
      declaredMimeType: "application/pdf",
      sizeBytes: 1000,
      headerBytes: PNG,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/does not match/i);
  });

  it("accepts jpg extension for jpeg content", () => {
    const result = validateDocument({
      filename: "photo.jpg",
      declaredMimeType: "image/jpeg",
      sizeBytes: 1000,
      headerBytes: JPEG,
    });
    expect(result.ok).toBe(true);
  });
});
