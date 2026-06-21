import { beforeEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.fn(async () => undefined);
const db = { insert: vi.fn(() => ({ values: insertValues })) };

vi.mock("./db", () => ({ getDb: vi.fn(async () => db) }));

import {
  recordAnalyticsEvent,
  redactProperties,
} from "./services/analyticsEvents";

describe("redactProperties", () => {
  it("keeps non-PII scalars and drops PII keys, emails, and non-scalars", () => {
    const out = redactProperties({
      cta_location: "hero",
      fleet_size: 50,
      opted_in: true,
      email: "driver@example.com", // PII key
      contactName: "Jordan", // PII key (name)
      note: "reach me at a@b.com", // email-looking value
      nested: { a: 1 }, // non-scalar
      tags: ["x"], // non-scalar
    });

    expect(out).toEqual({
      cta_location: "hero",
      fleet_size: 50,
      opted_in: true,
    });
  });

  it("returns null when nothing survives redaction", () => {
    expect(redactProperties({ email: "a@b.com" })).toBeNull();
    expect(redactProperties(null)).toBeNull();
    expect(redactProperties("nope")).toBeNull();
  });
});

describe("recordAnalyticsEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores events not on the allowlist", async () => {
    const result = await recordAnalyticsEvent({ name: "totally_made_up" });
    expect(result).toEqual({ stored: false, reason: "unknown_event" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("stores an allowlisted event with a path stripped of its query string", async () => {
    const result = await recordAnalyticsEvent({
      name: "downtime_calculator_opened",
      sessionId: "abc",
      path: "/fleet-downtime-cost-calculator?utm_source=x&email=a@b.com",
      role: "manager",
      fleetId: 7,
      properties: { source_page: "/", email: "a@b.com" },
    });

    expect(result).toEqual({ stored: true });
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "downtime_calculator_opened",
        sessionId: "abc",
        path: "/fleet-downtime-cost-calculator",
        role: "manager",
        fleetId: 7,
        properties: { source_page: "/" },
      })
    );
  });

  it("rejects non-allowlisted roles and invalid fleet ids", async () => {
    await recordAnalyticsEvent({
      name: "book_demo_cta_clicked",
      role: "superadmin",
      fleetId: -3,
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: null, fleetId: null })
    );
  });
});
