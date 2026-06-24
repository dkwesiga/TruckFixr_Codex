import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ComplianceStatus } from "../../shared/compliance";

type ReportChecklistItem = {
  label: string;
  category: string;
  status: "pass" | "fail";
  classification?: "minor" | "major" | "not_sure";
  comment?: string;
};

type ReportInput = {
  inspectionId: number;
  submittedAt: Date;
  validUntil: Date;
  complianceStatus: ComplianceStatus;
  carrier?: {
    name?: string | null;
    address?: string | null;
  };
  vehicle: {
    id: string | number;
    unitNumber?: string | null;
    vin?: string | null;
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    assetType?: string | null;
  };
  inspector: {
    printedName: string;
    signature: string;
    signatureMode: "typed" | "drawn";
    signatureImageUrl?: string | null;
    email?: string | null;
  };
  location: string;
  odometer: number | null;
  checklist: ReportChecklistItem[];
  majorDefectCount: number;
  minorDefectCount: number;
  canOperate: boolean;
};

const INK = rgb(0.04, 0.11, 0.19); // #0B1C30
const LINE = rgb(0.6, 0.66, 0.74);
const MUTED = rgb(0.42, 0.46, 0.51);
const FILL = rgb(0.95, 0.97, 0.99);
const RED = rgb(0.78, 0.13, 0.16);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Human label for a checklist category key. Mirrors shared inspection labels but
// kept local so reporting has no UI dependency; unknown keys are title-cased.
const CATEGORY_LABELS: Record<string, string> = {
  dashboard_warning_lights: "Dashboard warning lights",
  tires_wheels: "Tires and wheels",
  tires: "Tires",
  brakes: "Brakes",
  brakes_air_system: "Brakes and air system",
  steering: "Steering",
  suspension: "Suspension",
  lights: "Lights",
  lights_reflectors: "Lights and reflectors",
  fluid_leaks: "Fluid leaks",
  coupling: "Coupling devices",
  mirrors_windshield: "Mirrors and windshield",
  body_damage: "Body / frame",
  load_security: "Cargo securement",
  safety_equipment: "Emergency / safety equipment",
  reefer_unit: "Reefer unit",
  other: "General / other",
};

function categoryLabel(key: string) {
  if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

type Ctx = { page: PDFPage; font: PDFFont; bold: PDFFont };

function truncate(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

// Word-wrap to fit maxWidth, hard-splitting any single word that is too long.
function wrapLines(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const safe = (value ?? "").replace(/[^\x20-\x7E]/g, " ");
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) > maxWidth) {
      let chunk = word;
      while (chunk.length > 1 && font.widthOfTextAtSize(chunk, size) > maxWidth) {
        chunk = chunk.slice(0, -1);
      }
      lines.push(chunk);
      current = word.slice(chunk.length);
    } else {
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function text(ctx: Ctx, value: string, x: number, y: number, opts?: { size?: number; bold?: boolean; color?: typeof INK; maxWidth?: number }) {
  const size = opts?.size ?? 9;
  const font = opts?.bold ? ctx.bold : ctx.font;
  const safe = (value ?? "").replace(/[^\x20-\x7E]/g, " ");
  const rendered = opts?.maxWidth ? truncate(font, safe, size, opts.maxWidth) : safe;
  ctx.page.drawText(rendered, { x, y, size, font, color: opts?.color ?? INK });
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, opts?: { fill?: boolean }) {
  ctx.page.drawRectangle({
    x,
    y: y - h,
    width: w,
    height: h,
    borderColor: LINE,
    borderWidth: 0.75,
    color: opts?.fill ? FILL : undefined,
  });
}

// A labelled field cell: small uppercase label on top, value below.
function field(ctx: Ctx, label: string, value: string, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h);
  text(ctx, label.toUpperCase(), x + 4, y - 9, { size: 6, color: MUTED });
  text(ctx, value || "Not provided", x + 4, y - h + 6, { size: 9, maxWidth: w - 8 });
}

function checkbox(ctx: Ctx, x: number, y: number, checked: boolean, size = 8) {
  ctx.page.drawRectangle({ x, y: y - size, width: size, height: size, borderColor: INK, borderWidth: 0.9 });
  if (checked) {
    text(ctx, "X", x + 1.4, y - size + 1.2, { size: 7.5, bold: true });
  }
}

type CategoryResult = { label: string; pass: boolean; minor: boolean; major: boolean };

function summarizeByCategory(checklist: ReportChecklistItem[]): CategoryResult[] {
  const order: string[] = [];
  const map = new Map<string, CategoryResult>();
  for (const item of checklist) {
    const key = item.category || "other";
    if (!map.has(key)) {
      order.push(key);
      map.set(key, { label: categoryLabel(key), pass: true, minor: false, major: false });
    }
    const result = map.get(key)!;
    if (item.status === "fail") {
      result.pass = false;
      if (item.classification === "major") result.major = true;
      else result.minor = true;
    }
  }
  return order.map((key) => map.get(key)!);
}

export async function buildInspectionReport(input: ReportInput) {
  const failedItems = input.checklist.filter((item) => item.status === "fail");
  const passedCount = input.checklist.length - failedItems.length;
  const fileName = `canada-daily-inspection-${input.inspectionId}.pdf`;

  const summary = {
    passedCount,
    failedCount: failedItems.length,
    majorDefectCount: input.majorDefectCount,
    minorDefectCount: input.minorDefectCount,
    complianceStatus: input.complianceStatus,
    canOperate: input.canOperate,
  };

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { page, font, bold };

  let y = PAGE_H - MARGIN;

  // ---- Title ----
  text(ctx, "DRIVER'S VEHICLE INSPECTION REPORT", MARGIN, y - 4, { size: 14, bold: true });
  text(ctx, "Daily vehicle inspection record - NSC Schedule 1 structure", MARGIN, y - 18, {
    size: 8,
    color: MUTED,
  });
  text(ctx, `Inspection #${input.inspectionId}`, MARGIN + CONTENT_W - 120, y - 4, {
    size: 9,
    bold: true,
    maxWidth: 120,
  });
  y -= 30;

  // ---- Carrier ----
  field(ctx, "Carrier / operator", input.carrier?.name?.trim() || "Not provided", MARGIN, y, CONTENT_W * 0.5, 26);
  field(ctx, "Carrier address", input.carrier?.address?.trim() || "Not provided", MARGIN + CONTENT_W * 0.5, y, CONTENT_W * 0.5, 26);
  y -= 26;

  // ---- Report meta row ----
  const meta = [
    ["Date", formatDate(input.submittedAt)],
    ["Time", formatTime(input.submittedAt)],
    ["Inspection location", input.location || "Not provided"],
    ["Valid until", `${formatDate(input.validUntil)} ${formatTime(input.validUntil)}`],
  ];
  const metaW = CONTENT_W / meta.length;
  meta.forEach(([label, value], i) => field(ctx, label, value, MARGIN + i * metaW, y, metaW, 26));
  y -= 26;

  // ---- Vehicle / trailer ----
  const vehicleLabel = [input.vehicle.year, input.vehicle.make, input.vehicle.model].filter(Boolean).join(" ");
  const vehRow1 = [
    ["Unit / plate", input.vehicle.licensePlate || input.vehicle.unitNumber || `Vehicle #${input.vehicle.id}`],
    ["VIN", input.vehicle.vin || "Not provided"],
    ["Make / model / year", vehicleLabel || "Not provided"],
  ];
  const vehW = CONTENT_W / 3;
  vehRow1.forEach(([label, value], i) => field(ctx, label, value, MARGIN + i * vehW, y, vehW, 26));
  y -= 26;
  const vehRow2 = [
    ["Asset type", input.vehicle.assetType || "Not provided"],
    ["Odometer (km)", typeof input.odometer === "number" ? input.odometer.toLocaleString("en-CA") : "Not captured"],
    ["Driver / inspector", input.inspector.printedName || "Not provided"],
  ];
  vehRow2.forEach(([label, value], i) => field(ctx, label, value, MARGIN + i * vehW, y, vehW, 26));
  y -= 34;

  // ---- Result banner ----
  box(ctx, MARGIN, y, CONTENT_W, 22, { fill: true });
  const hasDefects = failedItems.length > 0;
  checkbox(ctx, MARGIN + 8, y - 6, !hasDefects);
  text(ctx, "NO DEFECTS", MARGIN + 20, y - 14, { size: 9, bold: true });
  checkbox(ctx, MARGIN + 110, y - 6, hasDefects);
  text(ctx, "DEFECTS NOTED", MARGIN + 122, y - 14, { size: 9, bold: true, color: hasDefects ? RED : INK });
  text(ctx, "Vehicle may be operated:", MARGIN + 250, y - 14, { size: 9 });
  checkbox(ctx, MARGIN + 372, y - 6, input.canOperate);
  text(ctx, "YES", MARGIN + 384, y - 14, { size: 9, bold: true });
  checkbox(ctx, MARGIN + 412, y - 6, !input.canOperate);
  text(ctx, "NO", MARGIN + 424, y - 14, { size: 9, bold: true });
  y -= 30;

  // ---- Defect matrix ----
  text(ctx, "INSPECTION ITEMS (mark defects by component)", MARGIN, y, { size: 8, bold: true });
  y -= 6;
  const rowH = 15;
  const colPass = MARGIN + CONTENT_W - 150;
  const colMinor = MARGIN + CONTENT_W - 100;
  const colMajor = MARGIN + CONTENT_W - 50;
  // Header row
  box(ctx, MARGIN, y, CONTENT_W, rowH, { fill: true });
  text(ctx, "COMPONENT", MARGIN + 5, y - 10, { size: 7, bold: true, color: MUTED });
  text(ctx, "PASS", colPass + 8, y - 10, { size: 7, bold: true, color: MUTED });
  text(ctx, "MINOR", colMinor + 6, y - 10, { size: 7, bold: true, color: MUTED });
  text(ctx, "MAJOR", colMajor + 6, y - 10, { size: 7, bold: true, color: MUTED });
  y -= rowH;

  const categories = summarizeByCategory(input.checklist);
  for (const cat of categories) {
    box(ctx, MARGIN, y, CONTENT_W, rowH);
    text(ctx, cat.label, MARGIN + 5, y - 10, { size: 8, maxWidth: colPass - MARGIN - 12 });
    checkbox(ctx, colPass + 14, y - 4, cat.pass, 8);
    checkbox(ctx, colMinor + 14, y - 4, cat.minor, 8);
    checkbox(ctx, colMajor + 14, y - 4, cat.major, 8, );
    y -= rowH;
  }
  y -= 6;
  text(ctx, `Minor defects: ${input.minorDefectCount}    Major defects: ${input.majorDefectCount}    Items passed: ${passedCount}`, MARGIN, y, { size: 8, color: MUTED });
  y -= 16;

  // ---- Remarks for failed items ----
  const remarksH = Math.max(40, y - 130);
  box(ctx, MARGIN, y, CONTENT_W, remarksH);
  text(ctx, "REMARKS / DEFECT DETAILS", MARGIN + 4, y - 9, { size: 6, color: MUTED });
  const remarksBottom = y - remarksH + 8;
  let ry = y - 20;
  if (failedItems.length === 0) {
    text(ctx, "No defects reported on this inspection.", MARGIN + 6, ry, { size: 8, color: MUTED });
  } else {
    for (const item of failedItems) {
      if (ry < remarksBottom) break;
      const tag = item.classification === "major" ? "[MAJOR]" : "[minor]";
      const line = `${tag} ${categoryLabel(item.category)}: ${item.label}${item.comment?.trim() ? ` - ${item.comment.trim()}` : ""}`;
      const wrapped = wrapLines(ctx.font, line, 8, CONTENT_W - 16);
      for (const wline of wrapped) {
        if (ry < remarksBottom) break;
        text(ctx, wline, MARGIN + 6, ry, {
          size: 8,
          color: item.classification === "major" ? RED : INK,
        });
        ry -= 11;
      }
      ry -= 3; // small gap between items
    }
  }
  y -= remarksH + 12;

  // ---- Certification ----
  const certDeclaration = wrapLines(
    ctx.font,
    "I certify that the components listed were inspected in accordance with the daily inspection requirements and that this report accurately records their condition.",
    8,
    CONTENT_W - 16
  );
  const certH = 46 + certDeclaration.length * 11;
  box(ctx, MARGIN, y, CONTENT_W, certH);
  text(ctx, "CERTIFICATION", MARGIN + 4, y - 9, { size: 6, color: MUTED });
  let cy = y - 19;
  for (const line of certDeclaration) {
    text(ctx, line, MARGIN + 6, cy, { size: 8 });
    cy -= 11;
  }
  const sigText =
    input.inspector.signatureMode === "drawn" ? "Signed electronically (drawn signature on file)" : input.inspector.signature || input.inspector.printedName;
  const sigY = cy - 6;
  text(ctx, "Driver signature:", MARGIN + 6, sigY, { size: 8, color: MUTED });
  text(ctx, sigText, MARGIN + 96, sigY, { size: 9, maxWidth: 200 });
  text(ctx, `Printed name: ${input.inspector.printedName}`, MARGIN + 320, sigY, { size: 8, maxWidth: CONTENT_W - 320 });
  text(ctx, `Date: ${formatDate(input.submittedAt)}`, MARGIN + 320, sigY - 10, { size: 8 });
  y -= certH + 10;

  // ---- Footer disclaimer ----
  text(
    ctx,
    "This TruckFixr-generated record follows the Canadian daily inspection (NSC Schedule 1) structure to support fleet record-keeping.",
    MARGIN,
    y,
    { size: 6.5, color: MUTED, maxWidth: CONTENT_W }
  );
  text(
    ctx,
    "It supports, and does not replace, the official inspection, a licensed mechanic's judgment, or regulatory compliance obligations.",
    MARGIN,
    y - 9,
    { size: 6.5, color: MUTED, maxWidth: CONTENT_W }
  );

  const pdfBytes = await doc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

  return {
    fileName,
    pdfBase64,
    mimeType: "application/pdf" as const,
    generatedAt: input.submittedAt,
    summary,
    failedItems,
  };
}
