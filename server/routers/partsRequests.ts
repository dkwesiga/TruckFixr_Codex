import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router, staffProcedure } from "../_core/trpc";
import { enforceIpRateLimit } from "../_core/rateLimit";
import {
  createPartsRequest,
  generateCustomerLink,
  generateSupplierLink,
  getPartsRequest,
  getRequestForCustomerToken,
  listPartsRequests,
  markPartsTransactionStatus,
  selectOfferViaToken,
  submitOfferViaToken,
  submitPublicPartsRequest,
} from "../services/partsRequests";

function assertCanWrite(ctx: { user?: { internalAdminRole?: string | null } }): void {
  if (ctx.user?.internalAdminRole === "read_only_viewer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Read-only reviewers cannot modify parts requests.",
    });
  }
}

const guestRateLimit = (ctx: { req: unknown }, bucket: string, limit: number) =>
  enforceIpRateLimit({
    req: (ctx as { req: any }).req,
    bucket,
    limit,
    windowMs: 10 * 60 * 1000,
    message: "Too many requests. Please wait a few minutes and try again.",
  });

export const partsRequestsRouter = router({
  // Public self-serve intake (landing page "Find a Part"). Starts in
  // "draft" — staff triage it in /admin/parts before a supplier link goes out.
  submitPublic: publicProcedure
    .input(
      z.object({
        customerName: z.string().trim().min(1).max(255),
        customerEmail: z.string().trim().email().max(320),
        customerPhone: z.string().trim().max(40).optional().nullable(),
        partNumber: z.string().trim().max(120).optional().nullable(),
        partDescription: z.string().trim().max(2000).optional().nullable(),
        vehicleIdentifier: z.record(z.string(), z.unknown()).optional().nullable(),
      })
    )
    .mutation(({ input, ctx }) => {
      guestRateLimit(ctx, "parts_request_submit_public", 10);
      return submitPublicPartsRequest(input);
    }),

  // Staff (concierge) side.
  create: staffProcedure
    .input(
      z.object({
        route: z.enum(["case_derived", "known_part_number"]),
        caseId: z.number().int().positive().optional().nullable(),
        guestCaseId: z.number().int().positive().optional().nullable(),
        customerName: z.string().trim().max(255).optional().nullable(),
        customerEmail: z.string().trim().email().max(320).optional().nullable(),
        customerPhone: z.string().trim().max(40).optional().nullable(),
        vehicleIdentifier: z.record(z.string(), z.unknown()).optional().nullable(),
        partNumber: z.string().trim().max(120).optional().nullable(),
        partDescription: z.string().trim().max(2000).optional().nullable(),
        confirmedByType: z
          .enum(["truckfixr_technician", "external_technician", "repair_shop", "customer_declaration"])
          .optional()
          .nullable(),
        confirmedByName: z.string().trim().max(255).optional().nullable(),
        evidenceNotes: z.string().trim().max(4000).optional().nullable(),
      })
    )
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return createPartsRequest({ ...input, createdByUserId: ctx.user.id });
    }),

  list: staffProcedure
    .input(z.object({ statuses: z.array(z.string()).optional() }).optional())
    .query(({ input }) => listPartsRequests(input?.statuses)),

  get: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getPartsRequest(input.id)),

  generateSupplierLink: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return generateSupplierLink({ partsRequestId: input.id });
    }),

  generateCustomerLink: staffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      assertCanWrite(ctx);
      const { request } = await getPartsRequest(input.id);
      return generateCustomerLink({ publicToken: request.publicToken });
    }),

  markTransactionStatus: staffProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        transactionStatus: z.enum(["completed", "not_completed"]),
      })
    )
    .mutation(({ input, ctx }) => {
      assertCanWrite(ctx);
      return markPartsTransactionStatus({ partsRequestId: input.id, transactionStatus: input.transactionStatus });
    }),

  // Supplier side — no account, token-gated.
  submitOffer: publicProcedure
    .input(
      z.object({
        token: z.string().min(10),
        supplierName: z.string().trim().min(1).max(255),
        supplierBranch: z.string().trim().max(255).optional().nullable(),
        respondentName: z.string().trim().max(255).optional().nullable(),
        respondentContact: z.string().trim().max(255).optional().nullable(),
        skuPartNumber: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).optional().nullable(),
        brandManufacturer: z.string().trim().max(255).optional().nullable(),
        conditionType: z.enum(["new", "remanufactured", "used"]).optional().nullable(),
        quantity: z.number().int().positive().default(1),
        supersessionNotes: z.string().trim().max(2000).optional().nullable(),
        fitmentConfirmed: z.literal(true),
        fitmentBasis: z.string().trim().max(2000).optional().nullable(),
        fitmentExclusions: z.string().trim().max(2000).optional().nullable(),
        requiredSerialOrCalibration: z.string().trim().max(2000).optional().nullable(),
        priceCents: z.number().int().nonnegative(),
        currency: z.string().trim().length(3).default("CAD"),
        taxesIncluded: z.boolean().default(false),
        coreChargeCents: z.number().int().nonnegative().optional().nullable(),
        coreReturnTerms: z.string().trim().max(1000).optional().nullable(),
        depositCents: z.number().int().nonnegative().optional().nullable(),
        warrantyText: z.string().trim().max(1000).optional().nullable(),
        quoteExpiresAt: z.coerce.date().optional().nullable(),
        stockStatus: z.string().trim().max(40).optional().nullable(),
        availableQuantity: z.number().int().nonnegative().optional().nullable(),
        pickupLocation: z.string().trim().max(500).optional().nullable(),
        deliveryOption: z.string().trim().max(40).optional().nullable(),
        deliveryCostCents: z.number().int().nonnegative().optional().nullable(),
        estimatedReadyAt: z.coerce.date().optional().nullable(),
      })
    )
    .mutation(({ input, ctx }) => {
      guestRateLimit(ctx, "parts_offer_submit", 20);
      return submitOfferViaToken(input);
    }),

  // Customer side — no account, token-gated.
  getByCustomerToken: publicProcedure
    .input(z.object({ token: z.string().min(10) }))
    .query(({ input, ctx }) => {
      guestRateLimit(ctx, "parts_customer_view", 60);
      return getRequestForCustomerToken(input.token);
    }),

  selectOffer: publicProcedure
    .input(z.object({ token: z.string().min(10), offerId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => {
      guestRateLimit(ctx, "parts_offer_select", 20);
      return selectOfferViaToken(input);
    }),
});
