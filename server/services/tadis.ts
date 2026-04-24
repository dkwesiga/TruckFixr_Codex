import { z } from "zod";

/**
 * TADIS v1 Service Layer
 * TruckFixr Adaptive Diagnostic Intelligence System
 *
 * A rule-based expert system augmented by LLM reasoning for fleet maintenance diagnostics.
 * Produces urgency levels, recommended actions, likely causes, and reasoning for every defect.
 */

// Type definitions
export const UrgencyLevel = z.enum(["Monitor", "Attention", "Critical"]);
export type UrgencyLevel = z.infer<typeof UrgencyLevel>;

export const RecommendedAction = z.enum(["Keep Running", "Inspect Soon", "Stop Now"]);
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const DiagnosticInputSchema = z.object({
  // Driver-reported information
  symptoms: z.array(z.string()).describe("Driver-reported symptoms (e.g., 'engine knocking', 'brake noise')"),
  faultCodes: z.array(z.string()).optional().describe("OBD-II or manufacturer fault codes"),
  driverNotes: z.string().optional().describe("Free-form notes from driver"),

  // Vehicle context
  vehicleId: z.number().optional(),
  vehicleAge: z.number().optional().describe("Vehicle age in years"),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  mileage: z.number().optional(),
  engineHours: z.number().optional(),

  // Historical context
  recentRepairs: z.array(z.object({
    type: z.string(),
    date: z.date(),
    component: z.string(),
  })).optional().describe("Recent maintenance history"),

  recurringIssues: z.array(z.string()).optional().describe("Issues that have occurred multiple times"),
  maintenanceHistory: z.array(z.unknown()).optional().describe("Legacy maintenance history input"),

  // Operational context
  operationalContext: z.string().optional().describe("Current operation (highway, city, idle, etc.)"),
  complianceContext: z.string().optional().describe("Regulatory or compliance concerns"),
});

export type DiagnosticInput = z.infer<typeof DiagnosticInputSchema>;

export const TadisOutputSchema = z.object({
  urgency: UrgencyLevel,
  urgencyLevel: UrgencyLevel,
  recommendedAction: RecommendedAction,
  likelyCause: z.string().describe("Most probable root cause of the issue"),
  reasoning: z.string().describe("Detailed explanation of the diagnosis"),
  severityScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1).describe("Confidence score (0-1)"),
  nextSteps: z.array(z.string()).describe("Recommended diagnostic or repair steps"),
});

export type TadisOutput = z.infer<typeof TadisOutputSchema>;

/**
 * TADIS Scoring Engine
 * Rule-based system that produces a severity score (0-100)
 */
class TadisEngine {
  /**
   * Score fault codes based on severity mapping
   */
  private scoreFaultCodes(faultCodes: string[]): number {
    const faultSeverity: Record<string, number> = {
      // Engine codes (P0xxx)
      "P0011": 20, // Camshaft timing over-advanced
      "P0101": 60, // Mass air flow sensor performance
      "P0128": 75, // Coolant thermostat below regulating temperature
      "P0133": 55, // O2 sensor slow response
      "P0300": 45, // Random misfire
      "P0301": 50, // Cylinder 1 misfire
      "P0400": 35, // EGR system malfunction
      "P0500": 40, // Vehicle speed sensor
      "P0600": 30, // Serial communication link error

      // Transmission codes (P1xxx, P2xxx)
      "P1700": 55, // Transmission control system malfunction
      "P2000": 60, // NOx trap efficiency below threshold

      // Brake codes (C0xxx)
      "C0035": 70, // ABS wheel speed sensor
      "C0040": 75, // ABS system failure

      // Chassis codes (U0xxx)
      "U0100": 25, // Lost communication with engine control module
    };

    if (faultCodes.length === 0) return 0;

    const scores = faultCodes.map(code => faultSeverity[code] || 40);
    return Math.max(...scores);
  }

  /**
   * Score driver-reported symptoms
   */
  private scoreSymptoms(symptoms: string[]): number {
    const symptomSeverity: Record<string, number> = {
      // Critical symptoms
      "brake failure": 90,
      "steering failure": 90,
      "engine fire": 95,
      "smoke from engine": 80,
      "loss of power": 85,
      "engine overheating": 75,
      "overheating": 75,

      // High severity
      "brake noise": 60,
      "grinding": 65,
      "knocking": 70,
      "smoking": 80,
      "fluid leak": 55,
      "rough idle": 45,

      // Medium severity
      "check engine light": 20,
      "vibration": 45,
      "noise": 40,
      "warning light": 35,

      // Low severity
      "minor noise": 20,
      "slight vibration": 15,
    };

    if (symptoms.length === 0) return 0;

    const scores = symptoms.map(symptom => {
      const normalized = symptom.toLowerCase();
      for (const [key, value] of Object.entries(symptomSeverity)) {
        if (normalized.includes(key)) return value;
      }
      return 30; // Default for unknown symptoms
    });

    return Math.max(...scores);
  }

  /**
   * Apply history-aware adjustments
   */
  private applyHistoryAdjustment(
    baseScore: number,
    recentRepairs?: Array<{ type: string; date: Date; component: string }>,
    recurringIssues?: string[],
    vehicleAge?: number,
    mileage?: number
  ): number {
    let adjustedScore = baseScore;

    // If same component was repaired recently, increase severity
    if (recentRepairs && recentRepairs.length > 0) {
      const daysSinceRepair = Math.floor(
        (Date.now() - recentRepairs[0].date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceRepair < 30) {
        adjustedScore += 15; // Recurring issue within 30 days
      }
    }

    // If this is a recurring issue, increase severity
    if (recurringIssues && recurringIssues.length > 0) {
      adjustedScore += 10 * recurringIssues.length;
    }

    if (vehicleAge !== undefined) {
      if (vehicleAge >= 8) adjustedScore += 8;
      else if (vehicleAge >= 4) adjustedScore += 4;
    }

    if (mileage !== undefined) {
      if (mileage >= 250000) adjustedScore += 10;
      else if (mileage >= 100000) adjustedScore += 5;
      else if (mileage >= 50000) adjustedScore += 2;
    }

    return Math.min(adjustedScore, 100);
  }

  /**
   * Map severity score to urgency level
   */
  private scoreToUrgency(score: number): UrgencyLevel {
    if (score >= 75) return "Critical";
    if (score >= 50) return "Attention";
    return "Monitor";
  }

  /**
   * Map severity score to recommended action
   */
  private scoreToAction(score: number): RecommendedAction {
    if (score >= 80) return "Stop Now";
    if (score >= 50) return "Inspect Soon";
    return "Keep Running";
  }

  /**
   * Main analysis method
   */
  async analyze(input: DiagnosticInput): Promise<TadisOutput> {
    // Calculate base severity score
    let severityScore = 0;

    // Score fault codes (40% weight)
    const faultCodeScore = this.scoreFaultCodes(input.faultCodes || []);
    severityScore += faultCodeScore * 0.4;

    // Score symptoms (60% weight)
    const symptomScore = this.scoreSymptoms(input.symptoms);
    severityScore += symptomScore * 0.6;

    // Apply history adjustments
    severityScore = this.applyHistoryAdjustment(
      severityScore,
      input.recentRepairs,
      input.recurringIssues,
      input.vehicleAge,
      input.mileage
    );

    // Determine urgency and action
    const urgency = this.scoreToUrgency(severityScore);
    const recommendedAction = this.scoreToAction(severityScore);

    // Generate likely cause (rule-based)
    const likelyCause = this.generateLikelyCause(input);

    // Generate reasoning
    const reasoning = this.generateReasoning(input, severityScore, urgency);

    // Generate next steps
    const nextSteps = this.generateNextSteps(input, urgency);

    return {
      urgency,
      urgencyLevel: urgency,
      recommendedAction,
      likelyCause,
      reasoning,
      severityScore,
      confidence: Math.min(0.95, 0.5 + severityScore / 200), // Confidence based on score
      nextSteps,
    };
  }

  /**
   * Generate likely cause based on symptoms and fault codes
   */
  private generateLikelyCause(input: DiagnosticInput): string {
    const symptoms = input.symptoms.map(s => s.toLowerCase()).join(" ");
    const faultCodes = input.faultCodes?.join(" ") || "";

    // Rule-based cause mapping
    if (symptoms.includes("overheating") || faultCodes.includes("P0500")) {
      return "Coolant system failure or thermostat malfunction";
    }
    if (symptoms.includes("brake") || faultCodes.includes("C0035")) {
      return "Brake system component failure or ABS sensor issue";
    }
    if (symptoms.includes("knocking") || faultCodes.includes("P0300")) {
      return "Engine misfire or fuel quality issue";
    }
    if (symptoms.includes("leak")) {
      return "Fluid leak in engine, transmission, or brake system";
    }

    return "Diagnostic analysis required - multiple possible causes";
  }

  /**
   * Generate detailed reasoning
   */
  private generateReasoning(input: DiagnosticInput, score: number, urgency: UrgencyLevel): string {
    const parts = [
      `Based on reported symptoms (${input.symptoms.join(", ")}),`,
    ];

    if (input.faultCodes && input.faultCodes.length > 0) {
      parts.push(`fault codes (${input.faultCodes.join(", ")}),`);
    }

    parts.push(`and vehicle history, this issue is classified as "${urgency}".`);

    if (input.recurringIssues && input.recurringIssues.length > 0) {
      parts.push(
        `This component has experienced similar issues previously, indicating a potential systemic problem.`
      );
    }

    if (score >= 80) {
      parts.push("Immediate action is required to prevent further damage or safety risks.");
    } else if (score >= 55) {
      parts.push("Schedule an inspection within the next 24-48 hours.");
    } else {
      parts.push("Monitor the situation and report any changes in vehicle behavior.");
    }

    return parts.join(" ");
  }

  /**
   * Generate next diagnostic steps
   */
  private generateNextSteps(input: DiagnosticInput, urgency: UrgencyLevel): string[] {
    const steps: string[] = [];
    const normalizedSymptoms = input.symptoms.map((symptom) => symptom.toLowerCase());

    if (urgency === "Critical") {
      steps.push("Move vehicle to safe location immediately");
      steps.push("Do not continue operation");
    }

    if (normalizedSymptoms.some((symptom) => symptom.includes("overheating"))) {
      steps.push("Check coolant level and condition");
      steps.push("Inspect radiator for blockages");
      steps.push("Test thermostat operation");
    }

    if (normalizedSymptoms.some((symptom) => symptom.includes("brake"))) {
      steps.push("Inspect brake pads and rotors");
      steps.push("Check brake fluid level and condition");
      steps.push("Test brake pressure and response");
    }

    if (input.faultCodes && input.faultCodes.length > 0) {
      steps.push("Clear fault codes after repair and verify resolution");
    }

    if (steps.length === 0) {
      steps.push("Perform comprehensive vehicle diagnostic scan");
      steps.push("Inspect affected system components");
    }

    return steps;
  }
}

// Export singleton instance
export const tadisEngine = new TadisEngine();

/**
 * Public API for TADIS analysis
 */
export async function analyzeDiagnostic(input: DiagnosticInput): Promise<TadisOutput> {
  // Validate input
  const validatedInput = DiagnosticInputSchema.parse(input);

  // Run analysis
  const result = await tadisEngine.analyze(validatedInput);

  // Validate output
  return TadisOutputSchema.parse(result);
}
