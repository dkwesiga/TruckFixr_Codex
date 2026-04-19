import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  analyzeDiagnostic,
  mapDiagnosticRiskToAction,
  mapDiagnosticRiskToUrgency,
} from "../services/tadisCore";

export const defectsRouter = router({
  /**
   * Create a new defect and run TADIS analysis
   */
  create: protectedProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vehicleId: z.number(),
        inspectionId: z.number().optional(),
        title: z.string().min(1, "Defect title is required"),
        description: z.string().optional(),
        category: z.string().optional(),
        photoUrls: z.array(z.string()).optional(),
        // TADIS diagnostic input
        symptoms: z.array(z.string()),
        faultCodes: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "driver") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Drivers cannot directly create defects",
        });
      }

      try {
        // Run TADIS analysis
        const tadisResult = await analyzeDiagnostic({
          symptoms: input.symptoms,
          faultCodes: input.faultCodes ?? [],
          vehicleId: input.vehicleId,
          driverNotes: input.description,
        });

        // TODO: Save defect to database
        // TODO: Save TADIS alert to database
        
        // Track defect creation event
        console.log('[Analytics] Defect created:', { defectId: 1, title: input.title, category: input.category, vehicleId: input.vehicleId, fleetId: input.fleetId, userId: ctx.user.id });

        return {
          defectId: 1, // Mock ID
          title: input.title,
          description: input.description,
          category: input.category,
          photoUrls: input.photoUrls || [],
          tadisAlert: {
            urgency: mapDiagnosticRiskToUrgency(tadisResult.risk_level),
            recommendedAction: mapDiagnosticRiskToAction(tadisResult.risk_level),
            likelyCause: tadisResult.possible_causes[0]?.cause ?? input.title,
            reasoning: JSON.stringify(tadisResult),
            confidence: tadisResult.confidence_score / 100,
            nextSteps: tadisResult.recommended_tests,
          },
          createdAt: new Date(),
        };
      } catch (error) {
        console.error("Failed to create defect:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create defect and run analysis",
        });
      }
    }),

  /**
   * Get defect by ID with TADIS analysis
   */
  getById: protectedProcedure
    .input(z.object({ defectId: z.number() }))
    .query(async ({ input, ctx }) => {
      // TODO: Verify user has access to this defect's fleet
      // TODO: Fetch defect and TADIS alert from database
      return null;
    }),

  /**
   * List defects for a vehicle
   */
  listByVehicle: protectedProcedure
    .input(z.object({ vehicleId: z.number(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      // TODO: Verify user has access to this vehicle's fleet
      // TODO: Fetch defects from database
      return [];
    }),

  /**
   * List defects for a fleet
   */
  listByFleet: protectedProcedure
    .input(z.object({ fleetId: z.number(), urgency: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      // TODO: Verify user has access to this fleet
      // TODO: Fetch defects from database, optionally filtered by urgency
      return [];
    }),

  /**
   * Update defect status and add manager action
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        status: z.enum(["open", "acknowledged", "assigned", "resolved"]),
        notes: z.string().optional(),
        assignedTo: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can update defect status",
        });
      }

      // TODO: Update defect status in database
      // TODO: Create defect action record
      return null;
    }),

  /**
   * Resolve defect and create maintenance log
   */
  resolve: protectedProcedure
    .input(
      z.object({
        defectId: z.number(),
        resolutionNotes: z.string(),
        cost: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "owner" && ctx.user.role !== "manager") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers can resolve defects",
        });
      }

      // TODO: Update defect status to "resolved"
      // TODO: Create maintenance log entry
      return null;
    }),
});
