import { z } from "zod";

export const INSPECTION_VALIDITY_HOURS = 24;

export const inspectionCategories = [
  "brakes",
  "steering",
  "lights",
  "tires",
  "suspension",
  "coupling",
  "safety_equipment",
] as const;

export const inspectionCategoryLabels: Record<(typeof inspectionCategories)[number], string> = {
  brakes: "Brakes",
  steering: "Steering",
  lights: "Lights",
  tires: "Tires",
  suspension: "Suspension",
  coupling: "Coupling",
  safety_equipment: "Safety Equipment",
};

export const defectClassificationSchema = z.enum(["minor", "major"]);
export const signatureModeSchema = z.enum(["typed", "drawn"]);

export const vehicleInspectionConfigSchema = z.object({
  airBrakes: z.boolean().default(true),
  hydraulicBrakes: z.boolean().default(false),
  trailerAttached: z.boolean().default(false),
  couplingSystem: z.boolean().default(false),
  airSuspension: z.boolean().default(false),
  steeringAssist: z.boolean().default(true),
  emergencyEquipment: z.boolean().default(true),
  clearanceLights: z.boolean().default(true),
});

export type VehicleInspectionConfig = z.infer<typeof vehicleInspectionConfigSchema>;

export type InspectionCategory = (typeof inspectionCategories)[number];

export type InspectionChecklistItem = {
  id: string;
  category: InspectionCategory;
  label: string;
  guidance: string;
};

type ChecklistDefinition = InspectionChecklistItem & {
  when?: (config: VehicleInspectionConfig) => boolean;
};

const checklistDefinitions: ChecklistDefinition[] = [
  {
    id: "brakes-service-response",
    category: "brakes",
    label: "Service brakes respond evenly and hold pressure",
    guidance: "Confirm braking performance and watch for delayed or uneven response.",
  },
  {
    id: "brakes-parking-system",
    category: "brakes",
    label: "Parking brake holds the vehicle securely",
    guidance: "Verify the parking brake sets and holds without roll.",
  },
  {
    id: "brakes-air-loss",
    category: "brakes",
    label: "Air brake system shows no audible leak or rapid pressure loss",
    guidance: "Inspect air lines, tanks, and gauges for leaks or abnormal loss.",
    when: (config) => config.airBrakes,
  },
  {
    id: "brakes-hydraulic-condition",
    category: "brakes",
    label: "Hydraulic brake components show no leak or damage",
    guidance: "Inspect master cylinder, lines, and wheel-end components.",
    when: (config) => config.hydraulicBrakes,
  },
  {
    id: "steering-free-play",
    category: "steering",
    label: "Steering has normal free play and no binding",
    guidance: "Check for excessive lash, stiffness, or unusual movement.",
  },
  {
    id: "steering-assist",
    category: "steering",
    label: "Steering assist operates normally with no fluid leak",
    guidance: "Inspect hoses, pump, and steering assist response.",
    when: (config) => config.steeringAssist,
  },
  {
    id: "lights-headlamps-signals",
    category: "lights",
    label: "Headlamps, brake lamps, and turn signals work correctly",
    guidance: "Verify all primary lighting functions before dispatch.",
  },
  {
    id: "lights-clearance-markers",
    category: "lights",
    label: "Clearance, marker, and reflector systems are secure and visible",
    guidance: "Confirm required marker and clearance lights are illuminated and clean.",
    when: (config) => config.clearanceLights,
  },
  {
    id: "lights-trailer-circuit",
    category: "lights",
    label: "Trailer light circuit is connected and functioning",
    guidance: "Check trailer electrical connection and rear lighting response.",
    when: (config) => config.trailerAttached,
  },
  {
    id: "tires-condition",
    category: "tires",
    label: "Tires show proper inflation and no visible damage",
    guidance: "Inspect tread, sidewall condition, cuts, bulges, and inflation.",
  },
  {
    id: "tires-wheel-security",
    category: "tires",
    label: "Wheels, rims, and fasteners are secure",
    guidance: "Check wheel-end hardware, rims, and signs of looseness or cracking.",
  },
  {
    id: "suspension-structure",
    category: "suspension",
    label: "Suspension components are secure with no visible damage",
    guidance: "Inspect springs, hangers, torque arms, and frame attachment points.",
  },
  {
    id: "suspension-air-system",
    category: "suspension",
    label: "Air suspension maintains ride height with no leak",
    guidance: "Check air bags, valves, and lines for wear or leaks.",
    when: (config) => config.airSuspension,
  },
  {
    id: "coupling-fifth-wheel",
    category: "coupling",
    label: "Coupling devices are locked, secured, and free of visible damage",
    guidance: "Inspect fifth wheel, kingpin, pintle, hooks, and safety latches.",
    when: (config) => config.couplingSystem,
  },
  {
    id: "coupling-air-electrical",
    category: "coupling",
    label: "Coupling air and electrical lines are connected and protected",
    guidance: "Confirm glad hands, chains, cables, and electrical connectors are secure.",
    when: (config) => config.couplingSystem || config.trailerAttached,
  },
  {
    id: "safety-equipment-emergency-kit",
    category: "safety_equipment",
    label: "Emergency equipment is present and ready for use",
    guidance: "Check extinguisher, warning triangles, and other emergency kit items.",
    when: (config) => config.emergencyEquipment,
  },
  {
    id: "safety-equipment-documents",
    category: "safety_equipment",
    label: "Required inspection and registration documents are available",
    guidance: "Confirm the vehicle carries the inspection report and required documents.",
  },
];

export const inspectionItemResultSchema = z.discriminatedUnion("status", [
  z.object({
    itemId: z.string().min(1),
    status: z.literal("pass"),
  }),
  z.object({
    itemId: z.string().min(1),
    status: z.literal("fail"),
    classification: defectClassificationSchema,
    comment: z.string().trim().min(1, "A comment is required for failed items"),
    photoUrls: z.array(z.string().min(1)).default([]),
  }),
]);

export const dailyInspectionSubmissionSchema = z.object({
  vehicleId: z.number().int().positive(),
  fleetId: z.number().int().positive(),
  odometer: z.number().int().nonnegative(),
  location: z.string().trim().min(1, "Inspection location is required"),
  attested: z.literal(true),
  driverPrintedName: z.string().trim().min(1, "Driver name is required"),
  driverSignature: z.string().trim().min(1, "Driver signature is required"),
  driverSignatureMode: signatureModeSchema,
  driverSignatureImageUrl: z.string().trim().min(1).optional(),
  results: z.array(inspectionItemResultSchema).min(1),
}).superRefine((value, context) => {
  if (value.driverSignatureMode === "drawn" && !value.driverSignatureImageUrl?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["driverSignatureImageUrl"],
      message: "A drawn signature is required when using drawn signature mode",
    });
  }
});

export type DailyInspectionSubmission = z.infer<typeof dailyInspectionSubmissionSchema>;
export type InspectionItemResult = z.infer<typeof inspectionItemResultSchema>;

export const defaultVehicleInspectionConfig: VehicleInspectionConfig = {
  airBrakes: true,
  hydraulicBrakes: false,
  trailerAttached: true,
  couplingSystem: true,
  airSuspension: true,
  steeringAssist: true,
  emergencyEquipment: true,
  clearanceLights: true,
};

const configuredVehicles: Record<number, VehicleInspectionConfig> = {
  42: defaultVehicleInspectionConfig,
};

export function getVehicleInspectionConfig(vehicleId: number, overrides?: Partial<VehicleInspectionConfig>) {
  return vehicleInspectionConfigSchema.parse({
    ...defaultVehicleInspectionConfig,
    ...(configuredVehicles[vehicleId] ?? {}),
    ...(overrides ?? {}),
  });
}

export function buildDailyInspectionChecklist(config: VehicleInspectionConfig) {
  return checklistDefinitions.filter((item) => (item.when ? item.when(config) : true));
}

export function buildChecklistByCategory(config: VehicleInspectionConfig) {
  const items = buildDailyInspectionChecklist(config);

  return inspectionCategories
    .map((category) => ({
      category,
      label: inspectionCategoryLabels[category],
      items: items.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);
}

export function getInspectionDueAt(submittedAt: Date | string) {
  const submittedDate = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
  return new Date(submittedDate.getTime() + INSPECTION_VALIDITY_HOURS * 60 * 60 * 1000);
}

export function parseInspectionResults(results: unknown) {
  if (!results) return null;

  const normalized =
    typeof results === "string"
      ? (() => {
          try {
            return JSON.parse(results);
          } catch {
            return null;
          }
        })()
      : results;

  return normalized && typeof normalized === "object" ? normalized : null;
}
