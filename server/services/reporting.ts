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

function formatTimestamp(value: Date) {
  return value.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
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

function buildPdfBuffer(lines: string[]) {
  const textCommands = lines.map((line, index) => {
    const y = 748 - index * 16;
    return `1 0 0 1 48 ${y} Tm (${normalizePdfText(line)}) Tj`;
  });

  const contentStream = `BT\n/F1 10 Tf\n14 TL\n${textCommands.join("\n")}\nET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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
  const fileName = `inspection-${input.inspectionId}.pdf`;

  const summary = {
    passedCount,
    failedCount: failedItems.length,
    majorDefectCount: input.majorDefectCount,
    minorDefectCount: input.minorDefectCount,
    complianceStatus: input.complianceStatus,
    canOperate: input.canOperate,
  };

  const lines = [
    "TruckFixr Daily Inspection Report",
    `Inspection ID: ${input.inspectionId}`,
    `Generated: ${formatTimestamp(input.submittedAt)}`,
    `Compliance status: ${complianceLabel}`,
    `Vehicle: ${vehicleLabel || `Vehicle #${input.vehicle.id}`}`,
    `Plate: ${input.vehicle.licensePlate || "Not provided"}`,
    `VIN: ${input.vehicle.vin || "Not provided"}`,
    `Driver: ${input.inspector.printedName}`,
    `Signature: ${
      input.inspector.signatureMode === "drawn"
        ? "Drawn signature captured electronically"
        : input.inspector.signature
    }`,
    `Inspection location: ${input.location}`,
    `Odometer: ${input.odometer.toLocaleString()} km`,
    `Valid until: ${formatTimestamp(input.validUntil)}`,
    `Checklist items passed: ${passedCount}`,
    `Minor defects: ${input.minorDefectCount}`,
    `Major defects: ${input.majorDefectCount}`,
    `Can operate: ${input.canOperate ? "Yes" : "No"}`,
    " ",
    "Failed items:",
    ...(failedItems.length > 0
      ? failedItems.flatMap((item) => [
          `- ${item.label} [${item.classification?.toUpperCase() ?? "FAIL"}]`,
          `  ${item.comment || "No comment provided"}`,
        ])
      : ["- No failed items reported"]),
  ].slice(0, 42);

  const pdfBase64 = buildPdfBuffer(lines).toString("base64");

  return {
    fileName,
    pdfBase64,
    mimeType: "application/pdf" as const,
    generatedAt: input.submittedAt,
    summary,
    failedItems,
  };
}
