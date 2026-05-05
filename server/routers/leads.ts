import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { submitLeadRequest } from "../services/leads";

const interestTypeSchema = z.enum([
  "book_a_demo",
  "beta_access",
  "pilot_inquiry",
  "general_inquiry",
]);

export const leadsRouter = router({
  submitDemoRequest: publicProcedure
    .input(
      z.object({
        fullName: z.string().trim().min(2),
        companyName: z.string().trim().min(2),
        email: z.string().trim().email(),
        phone: z.string().trim().max(50).optional().nullable(),
        fleetSize: z.string().trim().min(1),
        vehicleTypes: z.string().trim().max(300).optional().nullable(),
        location: z.string().trim().max(255).optional().nullable(),
        biggestMaintenanceChallenge: z.string().trim().min(10),
        interestType: interestTypeSchema,
        preferredDemoTime: z.string().trim().max(255).optional().nullable(),
        sourcePage: z.string().trim().max(255).optional().nullable(),
        utmSource: z.string().trim().max(255).optional().nullable(),
        utmMedium: z.string().trim().max(255).optional().nullable(),
        utmCampaign: z.string().trim().max(255).optional().nullable(),
        utmContent: z.string().trim().max(255).optional().nullable(),
        utmTerm: z.string().trim().max(255).optional().nullable(),
        referrer: z.string().trim().max(2048).optional().nullable(),
        trapField: z.string().trim().max(255).optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const lead = await submitLeadRequest(input);

      return {
        id: lead.id,
        status: lead.status,
        createdAt: lead.createdAt,
        message: "Thank you. We received your demo request and will contact you shortly.",
      };
    }),
});
