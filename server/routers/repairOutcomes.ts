import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { defects } from "../../drizzle/schema";
import { canManageVehicleAccess } from "../services/vehicleAccess";
import {
  getFleetDiagnosisAgreement,
  getRepairOutcomeByDefect,
} from "../services/repairOutcomes";

// NOTE: outcome *capture* already lives in `inspections.recordRepairOutcome`.
// This router adds the missing *measurement* layer (TADIS agreement reporting)
// on top of the same `repairOutcomes` data — it intentionally does not write.

async function verifyFleetAccess(
  fleetId: number,
  userId: number,
  userRole: string
) {
  return canManageVehicleAccess({
    fleetId,
    user: { id: userId, role: userRole },
  });
}

export const repairOutcomesRouter = router({
  getByDefect: protectedProcedure
    .input(z.object({ defectId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const [defect] = await db
        .select()
        .from(defects)
        .where(eq(defects.id, input.defectId))
        .limit(1);

      if (!defect) return null;

      const hasAccess = await verifyFleetAccess(
        defect.fleetId,
        ctx.user.id,
        ctx.user.role
      );
      if (!hasAccess && defect.driverId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this defect",
        });
      }

      return getRepairOutcomeByDefect(input.defectId);
    }),

  // Fleet-level TADIS quality: AI-vs-confirmed agreement rate over time.
  agreementStats: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const hasAccess = await verifyFleetAccess(
        input.fleetId,
        ctx.user.id,
        ctx.user.role
      );
      if (!hasAccess) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this fleet",
        });
      }

      return getFleetDiagnosisAgreement(input.fleetId);
    }),
});
