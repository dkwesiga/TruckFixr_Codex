import type { ComplianceStatus } from "../../shared/compliance";

type ReportChecklistItem = {
  label: string;
  category: string;
  status: "pass" | "fail";
  classification?: "minor" | "major";
  comment?: string;
};

type ReportInput = {
  inspectionId: number;
  submittedAt: Date;
  validUntil: Date;
  complianceStatus: ComplianceStatus;
  vehicle: {
    id: number;
    vin?: string | null;
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
  };
  inspector: {
    printedName: string;
    signature: string;
    signatureMode: "typed" | "drawn";
    signatureImageUrl?: string | null;
    email?: string | null;
  };
  location: string;
  odometer: number;
  checklist: ReportChecklistItem[];
  majorDefectCount: number;
  minorDefectCount: number;
  canOperate: boolean;
};

const REPORT_LINE_LIMIT = 68;
const REPORT_LINE_WIDTH = 84;

function formatDate(value: Date) {
  return value.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTime(value: Date) {
  return value.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " ");
}

function wrapText(value: string, width: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= width) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    lines.push(word.slice(0, width));
    currentLine = word.slice(width);
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function fitCell(value: string, width: number) {
  const normalized = value.trim();
  if (!normalized) return "".padEnd(width, " ");
  if (normalized.length <= width) return normalized.padEnd(width, " ");
  if (width <= 1) return normalized.slice(0, width);
  return `${normalized.slice(0, Math.max(0, width - 1))}\u2026`.replace(/[^\x20-\x7E]/g, " ");
}

function row(label: string, value: string, width = REPORT_LINE_WIDTH) {
  const prefix = `${label}: `;
  const wrapped = wrapText(value || "Not provided", width - prefix.length);
  return wrapped.map((line, index) =>
    index === 0 ? `${prefix}${line}` : `${" ".repeat(prefix.length)}${line}`
  );
}

function separator(character = "=") {
  return character.repeat(REPORT_LINE_WIDTH);
}

function buildPdfBuffer(lines: string[]) {
  const safeLines = lines.slice(0, REPORT_LINE_LIMIT);
  const textCommands = safeLines.map((line, index) => {
    const y = 760 - index * 10;
    return `1 0 0 1 34 ${y} Tm (${normalizePdfText(line)}) Tj`;
  });

  const contentStream = `BT\n/F1 8.5 Tf\n10 TL\n${textCommands.join("\n")}\nET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function buildInspectionReport(input: ReportInput) {
  const vehicleLabel = [input.vehicle.year, input.vehicle.make, input.vehicle.model]
    .filter(Boolean)
    .join(" ");
  const failedItems = input.checklist.filter((item) => item.status === "fail");
  const passedCount = input.checklist.length - failedItems.length;
  const complianceLabel = input.complianceStatus.toUpperCase();
  const fileName = `canada-daily-inspection-${input.inspectionId}.pdf`;

  const summary = {
    passedCount,
    failedCount: failedItems.length,
    majorDefectCount: input.majorDefectCount,
    minorDefectCount: input.minorDefectCount,
    complianceStatus: input.complianceStatus,
    canOperate: input.canOperate,
  };

  const checklistByCategory = input.checklist.reduce<Record<string, ReportChecklistItem[]>>(
    (accumulator, item) => {
      const category = item.category || "Other";
      accumulator[category] ??= [];
      accumulator[category].push(item);
      return accumulator;
    },
    {}
  );

  const reportLines: string[] = [
    "TRUCKFIXR CANADA DAILY VEHICLE INSPECTION REPORT",
    "Canada-style layout aligned to daily vehicle inspection field requirements.",
    separator(),
    `Inspection ID: ${input.inspectionId}    Report date: ${formatDate(input.submittedAt)}    Report time: ${formatTime(input.submittedAt)}`,
    `Compliance status: ${complianceLabel}    Vehicle may operate: ${input.canOperate ? "YES" : "NO"}`,
    separator("-"),
    "VEHICLE IDENTIFICATION",
    ...row("Vehicle", vehicleLabel || `Vehicle #${input.vehicle.id}`),
    ...row("Plate / Unit", input.vehicle.licensePlate || `Vehicle #${input.vehicle.id}`),
    ...row("VIN", input.vehicle.vin || "Not provided"),
    ...row("Odometer (km)", input.odometer.toLocaleString("en-CA")),
    separator("-"),
    "INSPECTION RECORD",
    ...row("Inspection location", input.location),
    ...row("Valid for", `24 hours, until ${formatDate(input.validUntil)} ${formatTime(input.validUntil)}`),
    ...row("Driver / inspector", input.inspector.printedName),
    ...row(
      "Electronic signature",
      input.inspector.signatureMode === "drawn"
        ? "Drawn signature captured electronically"
        : input.inspector.signature
    ),
    ...row("Driver email", input.inspector.email || "Not provided"),
    separator("-"),
    "SUMMARY OF RESULTS",
    `Checklist items passed: ${passedCount}    Minor defects: ${input.minorDefectCount}    Major defects: ${input.majorDefectCount}`,
    separator("-"),
    "INSPECTION ITEMS / DEFECT REPORT",
    "P = pass   F = fail   MIN = minor defect   MAJ = major defect",
    separator("-"),
    "P F MIN MAJ  ITEM / DEFECT DETAILS",
    separator("-"),
  ];

  Object.entries(checklistByCategory).forEach(([category, items]) => {
    reportLines.push(category.toUpperCase());

    items.forEach((item) => {
      const lead = [
        item.status === "pass" ? "X" : " ",
        item.status === "fail" ? "X" : " ",
        item.classification === "minor" ? "X" : " ",
        item.classification === "major" ? "X" : " ",
      ].join(" ");

      const wrappedLabel = wrapText(item.label, REPORT_LINE_WIDTH - 12);
      reportLines.push(`${lead}  ${wrappedLabel[0]}`);
      wrappedLabel.slice(1).forEach((line) => {
        reportLines.push(`           ${line}`);
      });

      if (item.status === "fail" && item.comment?.trim()) {
        wrapText(`Comment: ${item.comment.trim()}`, REPORT_LINE_WIDTH - 11).forEach((line) => {
          reportLines.push(`           ${line}`);
        });
      }
    });

    reportLines.push(separator("-"));
  });

  reportLines.push(
    "CERTIFICATION",
    ...row(
      "Declaration",
      `I certify that this daily vehicle inspection was completed and recorded electronically by ${input.inspector.printedName}.`
    ),
    ...row(
      "Note",
      "This TruckFixr report is styled to follow the standard Canadian daily inspection record structure for field use."
    )
  );

  const finalLines =
    reportLines.length > REPORT_LINE_LIMIT
      ? [
          ...reportLines.slice(0, REPORT_LINE_LIMIT - 2),
          separator("-"),
          "Additional checklist detail was omitted from this page because the report exceeded one page.",
        ]
      : reportLines;

  const pdfBase64 = buildPdfBuffer(finalLines).toString("base64");

  return {
    fileName,
    pdfBase64,
    mimeType: "application/pdf" as const,
    generatedAt: input.submittedAt,
    summary,
    failedItems,
  };
}
