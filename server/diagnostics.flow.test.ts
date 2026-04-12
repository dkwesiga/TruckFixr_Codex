import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createDriverContext(): TrpcContext {
  return {
    user: {
      id: 14,
      openId: "driver-14",
      email: "driver14@example.com",
      name: "Driver Fourteen",
      loginMethod: "email",
      role: "driver",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("diagnostics router full loop", () => {
  it("asks a dynamic question, accepts an answer, and then proceeds with a structured result", async () => {
    const caller = appRouter.createCaller(createDriverContext());

    const firstPass = await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: 42,
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
      photoUrls: [],
      clarificationHistory: [],
    });

    expect(firstPass.next_action).toBe("ask_question");
    expect(firstPass.clarifying_question.length).toBeGreaterThan(0);

    const answers = [
      "Yes, coolant level is dropping and there is wet residue after shutdown.",
      "The fan is running but the hose connection looks wet after shutdown.",
      "There is a sweet coolant smell near the radiator and the upper hose is damp.",
      "The temperature climbs hardest under load and then drops a bit after I slow down.",
    ];

    let current = firstPass;
    const clarificationHistory = [];

    for (const answer of answers) {
      if (current.next_action === "proceed") {
        break;
      }

      clarificationHistory.push({
        question: current.clarifying_question,
        answer,
      });

      current = await caller.diagnostics.analyze({
        fleetId: 1,
        vehicleId: 42,
        symptoms: ["Engine overheating"],
        faultCodes: [],
        driverNotes: "Temperature rises on route",
        photoUrls: [],
        clarificationHistory,
      });
    }

    expect(current.next_action).toBe("proceed");
    expect(current.possible_causes[0]?.cause).toContain("Coolant");
    expect(clarificationHistory.length).toBeLessThanOrEqual(4);
  });
});
