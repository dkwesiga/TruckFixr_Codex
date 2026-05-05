import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { sendEmail } from "./email";
import { leadSubmissions } from "../../drizzle/schema";

export type LeadInterestType = "book_a_demo" | "beta_access" | "pilot_inquiry" | "general_inquiry";

export type SubmitLeadRequestInput = {
  fullName: string;
  companyName: string;
  email: string;
  phone?: string | null;
  fleetSize: string;
  vehicleTypes?: string | null;
  location?: string | null;
  biggestMaintenanceChallenge: string;
  interestType: LeadInterestType;
  preferredDemoTime?: string | null;
  sourcePage?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  referrer?: string | null;
  trapField?: string | null;
};

function formatLeadInterestType(value: LeadInterestType) {
  switch (value) {
    case "beta_access":
      return "Beta Access";
    case "pilot_inquiry":
      return "Pilot Inquiry";
    case "general_inquiry":
      return "General Inquiry";
    default:
      return "Book a Demo";
  }
}

function buildLeadNotificationText(input: SubmitLeadRequestInput, submittedAt: Date) {
  const utmLines = [
    input.utmSource ? `UTM Source: ${input.utmSource}` : "",
    input.utmMedium ? `UTM Medium: ${input.utmMedium}` : "",
    input.utmCampaign ? `UTM Campaign: ${input.utmCampaign}` : "",
    input.utmContent ? `UTM Content: ${input.utmContent}` : "",
    input.utmTerm ? `UTM Term: ${input.utmTerm}` : "",
  ].filter(Boolean);

  return [
    `New TruckFixr demo request - ${input.companyName}`,
    "",
    `Full name: ${input.fullName}`,
    `Company name: ${input.companyName}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone || "Not provided"}`,
    `Fleet size: ${input.fleetSize}`,
    `Vehicle types: ${input.vehicleTypes || "Not provided"}`,
    `Location: ${input.location || "Not provided"}`,
    `Biggest maintenance challenge: ${input.biggestMaintenanceChallenge}`,
    `Interest type: ${formatLeadInterestType(input.interestType)}`,
    `Source page: ${input.sourcePage || "Unknown"}`,
    ...utmLines,
    `Referrer: ${input.referrer || "Not provided"}`,
    `Preferred demo time: ${input.preferredDemoTime || "Not provided"}`,
    `Submission date/time: ${submittedAt.toISOString()}`,
  ].join("\n");
}

export async function submitLeadRequest(input: SubmitLeadRequestInput) {
  if (input.trapField?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "We could not submit your request. Please try again or contact info@truckfixr.com.",
    });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const now = new Date();
  const [lead] = await db
    .insert(leadSubmissions)
    .values({
      fullName: input.fullName.trim(),
      companyName: input.companyName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      fleetSize: input.fleetSize.trim(),
      vehicleTypes: input.vehicleTypes?.trim() || null,
      location: input.location?.trim() || null,
      biggestMaintenanceChallenge: input.biggestMaintenanceChallenge.trim(),
      interestType: input.interestType,
      preferredDemoTime: input.preferredDemoTime?.trim() || null,
      sourcePage: input.sourcePage?.trim() || null,
      utmSource: input.utmSource?.trim() || null,
      utmMedium: input.utmMedium?.trim() || null,
      utmCampaign: input.utmCampaign?.trim() || null,
      utmContent: input.utmContent?.trim() || null,
      utmTerm: input.utmTerm?.trim() || null,
      referrer: input.referrer?.trim() || null,
      status: "new",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const to = (ENV.salesNotificationEmail || "info@truckfixr.com").trim().toLowerCase();

  try {
    await sendEmail({
      to: [to],
      subject: `New TruckFixr Demo Request - ${input.companyName.trim()}`,
      text: buildLeadNotificationText(input, now),
    });
  } catch (error) {
    console.error("[Leads] Demo request notification email failed:", error);
  }

  return lead;
}

export async function getLeadSubmissionById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [lead] = await db.select().from(leadSubmissions).where(eq(leadSubmissions.id, id)).limit(1);
  return lead ?? null;
}
