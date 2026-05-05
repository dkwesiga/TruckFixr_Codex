import { beforeEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.fn();
const returning = vi.fn();
const insert = vi.fn(() => ({
  values: insertValues,
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    insert,
  })),
}));

vi.mock("./services/email", () => ({
  sendEmail: vi.fn(async () => ({ delivered: true, skipped: false })),
}));

import { sendEmail } from "./services/email";
import { submitLeadRequest } from "./services/leads";

describe("submitLeadRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const lead = {
      id: 42,
      status: "new",
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
    };
    insertValues.mockReturnValue({
      returning,
    });
    returning.mockReturnValue({
      returning,
    });
    returning.mockResolvedValue([lead]);
  });

  it("stores the lead and emails the admin recipient", async () => {
    const result = await submitLeadRequest({
      fullName: "Jordan Smith",
      companyName: "Brampton Transit Inc.",
      email: "jordan@example.com",
      phone: "416-555-0101",
      fleetSize: "11-20 vehicles",
      vehicleTypes: "Tractors and trailers",
      location: "Ontario, Canada",
      biggestMaintenanceChallenge: "Repeat defects and hard-to-track follow-up.",
      interestType: "book_a_demo",
      preferredDemoTime: "Weekday mornings",
      sourcePage: "/",
      utmSource: "newsletter",
      utmMedium: "email",
      utmCampaign: "spring-demo",
      utmContent: "hero-cta",
      utmTerm: "fleet-maintenance",
      referrer: "https://truckfixr.com/",
      trapField: "",
    });

    expect(insert).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Brampton Transit Inc.",
        email: "jordan@example.com",
        status: "new",
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["info@truckfixr.com"],
        subject: "New TruckFixr Demo Request - Brampton Transit Inc.",
      })
    );
    expect(result.id).toBe(42);
  });

  it("rejects the honeypot field", async () => {
    await expect(
      submitLeadRequest({
        fullName: "Bot Name",
        companyName: "Spam Fleet",
        email: "bot@example.com",
        fleetSize: "1-2 vehicles",
        biggestMaintenanceChallenge: "Spam submission attempt",
        interestType: "general_inquiry",
        trapField: "filled",
      })
    ).rejects.toThrow("Please try again or contact info@truckfixr.com");
  });

  it("still saves the lead if notification email delivery fails", async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("mail down"));

    const result = await submitLeadRequest({
      fullName: "Jordan Smith",
      companyName: "Brampton Transit Inc.",
      email: "jordan@example.com",
      fleetSize: "11-20 vehicles",
      biggestMaintenanceChallenge: "Need help reducing repeat downtime.",
      interestType: "beta_access",
      trapField: "",
    });

    expect(result.id).toBe(42);
    expect(sendEmail).toHaveBeenCalled();
  });
});
