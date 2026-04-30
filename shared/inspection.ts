import { z } from "zod";

export const INSPECTION_VALIDITY_HOURS = 24;

export const inspectionCategories = [
  "dashboard_warning_lights",
  "tires_wheels",
  "brakes",
  "brakes_air_system",
  "steering",
  "lights",
  "lights_reflectors",
  "tires",
  "suspension",
  "fluid_leaks",
  "coupling",
  "mirrors_windshield",
  "body_damage",
  "load_security",
  "other",
  "safety_equipment",
] as const;

export const inspectionCategoryLabels: Record<(typeof inspectionCategories)[number], string> = {
  dashboard_warning_lights: "Dashboard warning lights",
  tires_wheels: "Tires and wheels",
  brakes: "Brakes",
  brakes_air_system: "Brakes and air system",
  steering: "Steering",
  lights: "Lights",
  lights_reflectors: "Lights and reflectors",
  tires: "Tires",
  suspension: "Suspension",
  fluid_leaks: "Fluid leaks",
  coupling: "Coupling",
  mirrors_windshield: "Mirrors and windshield",
  body_damage: "Body damage",
  load_security: "Load/security",
  other: "Other issue",
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
    id: "dashboard-warning-lights",
    category: "dashboard_warning_lights",
    label: "No active red or amber dashboard warning lights",
    guidance: "Photograph or describe any active warning light before dispatch.",
  },
  {
    id: "tires-wheels-visual",
    category: "tires_wheels",
    label: "Tires, wheels, rims, and lug nuts show no visible damage",
    guidance: "Check tread, sidewalls, inflation, wheel-end hardware, and missing lug nuts.",
  },
  {
    id: "brakes-air-system-daily",
    category: "brakes_air_system",
    label: "Brake/air system builds and holds pressure with no warning condition",
    guidance: "Watch gauges, listen for leaks, and verify normal brake response.",
    when: (config) => config.airBrakes,
  },
  {
    id: "lights-reflectors-daily",
    category: "lights_reflectors",
    label: "Lights, reflectors, brake lamps, and turn signals are working and visible",
    guidance: "Confirm forward, side, and rear lighting before dispatch.",
  },
  {
    id: "fluid-leaks-ground",
    category: "fluid_leaks",
    label: "No visible fuel, oil, coolant, DEF, or air leaks under the vehicle",
    guidance: "Inspect the ground, engine bay, tanks, hoses, and fittings.",
  },
  {
    id: "steering-suspension-daily",
    category: "steering",
    label: "Steering and suspension feel normal with no visible damage",
    guidance: "Check steering play, binding, leaning, broken springs, and loose components.",
  },
  {
    id: "coupling-trailer-connection-daily",
    category: "coupling",
    label: "Coupling, fifth wheel, trailer connection, air, and electrical lines are secure",
    guidance: "Confirm locked coupling and protected air/electrical connections.",
    when: (config) => config.couplingSystem || config.trailerAttached,
  },
  {
    id: "mirrors-windshield-daily",
    category: "mirrors_windshield",
    label: "Mirrors, windshield, and wipers support safe visibility",
    guidance: "Look for cracked glass, blocked visibility, mirror damage, or failed wipers.",
  },
  {
    id: "body-damage-daily",
    category: "body_damage",
    label: "No new body damage or loose panels that affect safe operation",
    guidance: "Check doors, hood, steps, bumpers, fairings, and body panels.",
  },
  {
    id: "load-security-daily",
    category: "load_security",
    label: "Load and cargo securement are acceptable if applicable",
    guidance: "Confirm straps, doors, seals, and cargo are secure when hauling a load.",
  },
  {
    id: "other-issue-daily",
    category: "other",
    label: "No other issue noticed by the driver",
    guidance: "Report unusual smells, sounds, vibration, alerts, or anything that feels unsafe.",
  },
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

const inspectionVehicleIdSchema = z
  .union([z.number().int(), z.string().trim().min(1)])
  .refine((value) => value !== 0 && value !== "", "Vehicle reference is required");

export const dailyInspectionSubmissionSchema = z.object({
  vehicleId: inspectionVehicleIdSchema,
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

export const verifiedInspectionResultSchema = z.enum([
  "pass",
  "issue_found",
  "not_checked",
]);

export const verifiedDefectSeveritySchema = z.enum(["minor", "moderate", "critical"]);

export const locationCaptureSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  capturedAt: z.string().optional(),
  permissionStatus: z.enum(["granted", "denied", "unavailable"]).default("unavailable"),
});

export const verifiedInspectionChecklistResponseSchema = z
  .object({
    itemId: z.string().min(1),
    itemLabel: z.string().min(1),
    category: z.string().min(1),
    result: verifiedInspectionResultSchema,
    defectDescription: z.string().trim().optional(),
    severity: verifiedDefectSeveritySchema.optional(),
    note: z.string().trim().optional(),
    photoUrls: z.array(z.string().min(1)).default([]),
    unableToTakePhoto: z.boolean().default(false),
    unableToTakePhotoReason: z.string().trim().optional(),
  })
  .superRefine((value, context) => {
    if (value.result !== "issue_found") return;

    if (!value.defectDescription?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defectDescription"],
        message: "Describe the defect before submitting.",
      });
    }

    if (!value.severity) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["severity"],
        message: "Select a defect severity.",
      });
    }

    if (value.photoUrls.length === 0 && !value.unableToTakePhoto) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["photoUrls"],
        message: "Add a defect photo or explain why a photo cannot be taken.",
      });
    }

    if (value.unableToTakePhoto && !value.unableToTakePhotoReason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unableToTakePhotoReason"],
        message: "Explain why a defect photo cannot be taken.",
      });
    }
  });

export const knownDefectFollowUpSchema = z.object({
  defectIds: z.array(z.number().int().positive()).min(1),
  status: z.enum(["no_longer_visible", "still_present", "worse", "not_checked", "repaired"]),
  note: z.string().trim().optional(),
  photoUrls: z.array(z.string().min(1)).default([]),
});

export const proofPhotoSubmissionSchema = z.object({
  proofItem: z.string().min(1),
  photoUrl: z.string().trim().optional(),
  skipped: z.boolean().default(false),
});

export const startVerifiedInspectionSchema = z.object({
  vehicleId: inspectionVehicleIdSchema,
  fleetId: z.number().int().positive(),
  startLocation: locationCaptureSchema.optional(),
});

export const submitVerifiedInspectionSchema = z.object({
  inspectionId: z.number().int().positive(),
  driverPrintedName: z.string().trim().min(1, "Driver name is required"),
  driverSignature: z.string().trim().min(1, "Driver e-signature is required"),
  signatureConfirmed: z
    .boolean()
    .refine((value) => value === true, "Confirm the driver signature before submitting."),
  notes: z.string().trim().optional(),
  submitLocation: locationCaptureSchema.optional(),
  checklistResponses: z.array(verifiedInspectionChecklistResponseSchema).min(1),
  proofPhotos: z.array(proofPhotoSubmissionSchema).default([]),
  knownDefectFollowUps: z.array(knownDefectFollowUpSchema).default([]),
});

export type VerifiedInspectionChecklistResponse = z.infer<
  typeof verifiedInspectionChecklistResponseSchema
>;
export type StartVerifiedInspectionInput = z.infer<typeof startVerifiedInspectionSchema>;
export type SubmitVerifiedInspectionInput = z.infer<typeof submitVerifiedInspectionSchema>;

export const randomProofItems = [
  "dashboard",
  "left front tire",
  "right front tire",
  "rear tires",
  "lights",
  "trailer connection",
  "visible leaks under truck",
] as const;

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

export function getVehicleInspectionConfig(vehicleId: number | string, overrides?: Partial<VehicleInspectionConfig>) {
  const numericVehicleId = typeof vehicleId === "number" ? vehicleId : Number(vehicleId);
  return vehicleInspectionConfigSchema.parse({
    ...defaultVehicleInspectionConfig,
    ...(Number.isFinite(numericVehicleId) ? configuredVehicles[numericVehicleId] ?? {} : {}),
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
