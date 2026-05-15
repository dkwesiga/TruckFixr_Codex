import { describe, expect, it } from "vitest";
import { buildMissedInspectionReminderAlerts } from "./inspectionReminders";

describe("inspection reminders", () => {
  it("builds manager and driver alerts only for vehicles missed today", () => {
    const alerts = buildMissedInspectionReminderAlerts({
      fleetId: 8,
      managerUserId: 42,
      vehicles: [
        {
          vehicleId: "nsf-601",
          unit: "NSF-601",
          assignedDriverId: 77,
          assignedDriverName: "Robert Singh",
          inspectedToday: false,
          mostRecentInspectionAt: new Date("2026-05-11T14:30:00Z"),
        },
        {
          vehicleId: "nsf-602",
          unit: "NSF-602",
          assignedDriverId: 78,
          assignedDriverName: "James Walker",
          inspectedToday: true,
          mostRecentInspectionAt: new Date("2026-05-12T10:30:00Z"),
        },
      ],
    });

    expect(alerts).toHaveLength(2);
    expect(alerts.map((alert) => alert.userId)).toEqual(expect.arrayContaining([42, 77]));
    expect(alerts.every((alert) => alert.vehicleId === "nsf-601")).toBe(true);
    expect(alerts[0]?.message).toContain("Follow up with Robert Singh");
    expect(alerts[1]?.message).toContain("Complete the daily inspection");
  });

  it("still creates a manager alert when no driver is assigned", () => {
    const alerts = buildMissedInspectionReminderAlerts({
      fleetId: 1,
      managerUserId: 9,
      vehicles: [
        {
          vehicleId: "mrl-t201",
          unit: "MRL-T201",
          assignedDriverId: null,
          assignedDriverName: null,
          inspectedToday: false,
          mostRecentInspectionAt: null,
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      fleetId: 1,
      userId: 9,
      vehicleId: "mrl-t201",
      alertType: "daily_inspection_missed",
      severity: "warning",
      status: "open",
    });
    expect(alerts[0]?.message).toContain("No previous inspection is on file");
  });
});
