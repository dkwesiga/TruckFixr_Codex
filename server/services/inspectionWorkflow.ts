import {
  buildDailyInspectionChecklist,
  getInspectionDueAt,
  inspectionCategoryLabels,
  type DailyInspectionSubmission,
  type VehicleInspectionConfig,
} from "../../shared/inspection";
import {
  getCompliancePresentation,
  getInspectionComplianceStatus,
  type ComplianceStatus,
} from "../../shared/compliance";
import { buildInspectionReport } from "./reporting";
import { sendEmail } from "./email";

type VehicleProfile = {
  id: number;
  vin?: string | null;
  licensePlate?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
};

type WorkflowUser = {
  id: number;
  email?: string | null;
  name?: string | null;
};

type NormalizedChecklistItem = {
  itemId: string;
  category: string;
  categoryLabel: string;
  label: string;
  guidance: string;
  status: "pass" | "fail";
  classification?: "minor" | "major";
  comment?: string;
  photoUrls?: string[];
};

export type PreparedInspectionSubmission = {
  submittedAt: Date;
  validUntil: Date;
  normalizedChecklist: NormalizedChecklistItem[];
  majorDefectCount: number;
  minorDefectCount: number;
  complianceStatus: ComplianceStatus;
  canOperate: boolean;
  inspectorName: string;
  baseInspectionResults: {
    checklist: NormalizedChecklistItem[];
    location: string;
    odometer: number;
    vehicle: VehicleProfile;
    vehicleConfiguration: VehicleInspectionConfig;
    inspector: {
      id: number;
      name: string;
      email: string | null;
      printedName: string;
      signature: string;
      signatureMode: "typed" | "drawn";
      signatureImageUrl: string | null;
    };
    summary: {
      majorDefectCount: number;
      minorDefectCount: number;
      complianceStatus: ComplianceStatus;
      canOperate: boolean;
    };
    submittedAt: Date;
    validUntil: Date;
  };
};

type EmailDelivery = {
  delivered: boolean;
  skipped: boolean;
  reason?: string;
};

type ReportDeliveryResult = {
  reportFileName: string;
  reportGenerated: boolean;
  reportWarning?: string;
  emailDelivery: EmailDelivery;
  storedInspectionResults: PreparedInspectionSubmission["baseInspectionResults"] & {
    report: {
      fileName: string;
      mimeType: "application/pdf";
      generatedAt: Date;
      pdfBase64?: string;
      summary: {
        passedCount?: number;
        failedCount?: number;
        majorDefectCount: number;
        minorDefectCount: number;
        complianceStatus: ComplianceStatus;
        canOperate: boolean;
      };
      failedItems: Array<{
        label: string;
        category: string;
        status: "pass" | "fail";
        classification?: "minor" | "major";
        comment?: string;
      }>;
      recipients: string[];
      emailDelivery: EmailDelivery;
      warning?: string;
    };
  };
};

function mapReportEmailDelivery(
  value: Awaited<ReturnType<typeof sendEmail>>
): EmailDelivery {
  return {
    delivered: value.delivered,
    skipped: value.skipped,
    reason: "reason" in value ? value.reason : undefined,
  };
}

export function mapClassificationToSeverity(classification: "minor" | "major") {
  return classification === "major" ? "critical" : "medium";
}

export function prepareInspectionSubmission(args: {
  input: DailyInspectionSubmission;
  user: WorkflowUser;
  vehicle: VehicleProfile;
  configuration: VehicleInspectionConfig;
}) {
  const checklist = buildDailyInspectionChecklist(args.configuration);
  const checklistIds = new Set(checklist.map((item) => item.id));
  const responseIds = args.input.results.map((result) => result.itemId);
  const uniqueResponseIds = new Set(responseIds);

  if (
    args.input.results.length !== checklist.length ||
    uniqueResponseIds.size !== args.input.results.length
  ) {
    throw new Error("Every required checklist item must be completed.");
  }

  const missingOrUnknownItems = args.input.results.filter(
    (result) => !checklistIds.has(result.itemId)
  );
  if (missingOrUnknownItems.length > 0) {
    throw new Error("Inspection results do not match the required vehicle checklist.");
  }

  const responseMap = new Map(args.input.results.map((result) => [result.itemId, result]));
  if (checklist.some((item) => !responseMap.has(item.id))) {
    throw new Error("Inspection results are missing required checklist items.");
  }

  const normalizedChecklist = checklist.map((item) => {
    const response = responseMap.get(item.id);

    if (!response) {
      throw new Error(`Missing inspection result for ${item.label}`);
    }

    if (response.status === "pass") {
      return {
        itemId: item.id,
        category: item.category,
        categoryLabel: inspectionCategoryLabels[item.category],
        label: item.label,
        guidance: item.guidance,
        status: "pass" as const,
      };
    }

    return {
      itemId: item.id,
      category: item.category,
      categoryLabel: inspectionCategoryLabels[item.category],
      label: item.label,
      guidance: item.guidance,
      status: "fail" as const,
      classification: response.classification,
      comment: response.comment,
      photoUrls: response.photoUrls,
    };
  });

  const majorDefectCount = normalizedChecklist.filter(
    (item) => item.status === "fail" && item.classification === "major"
  ).length;
  const minorDefectCount = normalizedChecklist.filter(
    (item) => item.status === "fail" && item.classification === "minor"
  ).length;
  const submittedAt = new Date();
  const validUntil = getInspectionDueAt(submittedAt);
  const complianceStatus = getInspectionComplianceStatus({
    majorDefectCount,
    minorDefectCount,
  });
  const canOperate = complianceStatus !== "red";
  const inspectorName =
    args.input.driverPrintedName || args.user.name || args.user.email || "Driver";

  return {
    submittedAt,
    validUntil,
    normalizedChecklist,
    majorDefectCount,
    minorDefectCount,
    complianceStatus,
    canOperate,
    inspectorName,
    baseInspectionResults: {
      checklist: normalizedChecklist,
      location: args.input.location,
      odometer: args.input.odometer,
      vehicle: args.vehicle,
      vehicleConfiguration: args.configuration,
      inspector: {
        id: args.user.id,
        name: inspectorName,
        email: args.user.email ?? null,
        printedName: args.input.driverPrintedName,
        signature: args.input.driverSignature,
        signatureMode: args.input.driverSignatureMode,
        signatureImageUrl: args.input.driverSignatureImageUrl ?? null,
      },
      summary: {
        majorDefectCount,
        minorDefectCount,
        complianceStatus,
        canOperate,
      },
      submittedAt,
      validUntil,
    },
  } satisfies PreparedInspectionSubmission;
}

export async function createInspectionReportDelivery(args: {
  prepared: PreparedInspectionSubmission;
  inspectionId: number;
  recipients: string[];
  vehicle: VehicleProfile;
  input: DailyInspectionSubmission;
  userEmail?: string | null;
  reportBuilder?: typeof buildInspectionReport;
  emailSender?: typeof sendEmail;
}): Promise<ReportDeliveryResult> {
  const reportBuilder = args.reportBuilder ?? buildInspectionReport;
  const emailSender = args.emailSender ?? sendEmail;
  let reportWarning: string | undefined;
  let reportData:
    | ReturnType<typeof buildInspectionReport>
    | null = null;

  try {
    reportData = reportBuilder({
      inspectionId: args.inspectionId,
      submittedAt: args.prepared.submittedAt,
      validUntil: args.prepared.validUntil,
      complianceStatus: args.prepared.complianceStatus,
      vehicle: {
        id: args.vehicle.id,
        vin: args.vehicle.vin ?? null,
        licensePlate: args.vehicle.licensePlate ?? null,
        make: args.vehicle.make ?? null,
        model: args.vehicle.model ?? null,
        year: args.vehicle.year ?? null,
      },
      inspector: {
        printedName: args.input.driverPrintedName,
        signature: args.input.driverSignature,
        signatureMode: args.input.driverSignatureMode,
        signatureImageUrl: args.input.driverSignatureImageUrl ?? null,
        email: args.userEmail ?? null,
      },
      location: args.input.location,
      odometer: args.input.odometer,
      checklist: args.prepared.normalizedChecklist,
      majorDefectCount: args.prepared.majorDefectCount,
      minorDefectCount: args.prepared.minorDefectCount,
      canOperate: args.prepared.canOperate,
    });
  } catch (error) {
    reportWarning =
      error instanceof Error
        ? `PDF generation failed, but the inspection record was saved: ${error.message}`
        : "PDF generation failed, but the inspection record was saved.";
  }

  const compliancePresentation = getCompliancePresentation(args.prepared.complianceStatus);
  let emailDelivery: EmailDelivery = {
    delivered: false,
    skipped: true,
    reason: reportData?.pdfBase64 ? "not_attempted" : "report_unavailable",
  };

  if (reportData?.pdfBase64 && args.recipients.length > 0) {
    try {
      emailDelivery = mapReportEmailDelivery(
        await emailSender({
          to: args.recipients,
          subject: `TruckFixr Daily Inspection Report - ${args.vehicle.licensePlate}`,
          text: [
            `Daily inspection submitted for ${args.vehicle.make ?? "Vehicle"} ${args.vehicle.model ?? ""}`.trim(),
            `Compliance status: ${compliancePresentation.label} - ${compliancePresentation.title}`,
            compliancePresentation.description,
            `Driver: ${args.input.driverPrintedName}`,
            `Location: ${args.input.location}`,
            `Odometer: ${args.input.odometer.toLocaleString()} km`,
            `Valid until: ${args.prepared.validUntil.toLocaleString("en-CA")}`,
          ].join("\n"),
          attachments: [
            {
              filename: reportData.fileName,
              content: reportData.pdfBase64,
              contentType: reportData.mimeType,
            },
          ],
        })
      );
    } catch (error) {
      emailDelivery = {
        delivered: false,
        skipped: false,
        reason: error instanceof Error ? error.message : "send_failed",
      };
    }
  }

  const fallbackReport = {
    fileName: reportData?.fileName ?? `canada-daily-inspection-${args.inspectionId}.pdf`,
    mimeType: "application/pdf" as const,
    generatedAt: args.prepared.submittedAt,
    ...(reportData?.pdfBase64 ? { pdfBase64: reportData.pdfBase64 } : {}),
    summary: reportData?.summary ?? args.prepared.baseInspectionResults.summary,
    failedItems:
      reportData?.failedItems ??
      args.prepared.normalizedChecklist.filter((item) => item.status === "fail"),
    recipients: args.recipients,
    emailDelivery,
    ...(reportWarning ? { warning: reportWarning } : {}),
  };

  return {
    reportFileName: fallbackReport.fileName,
    reportGenerated: Boolean(reportData?.pdfBase64),
    reportWarning,
    emailDelivery,
    storedInspectionResults: {
      ...args.prepared.baseInspectionResults,
      report: fallbackReport,
    },
  };
}
