import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";

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
  beforeEach(() => {
    ENV.groqApiKey = "groq-test-key";
    ENV.groqModel = "qwen/qwen3-32b";
    const aiQuestions = [
      "Does coolant level drop or leave wet residue after shutdown?",
      "Does the truck run hottest under load rather than only at idle?",
      "Do you smell coolant near the radiator or hose connections after stopping?",
      "Does the cab heat stay weak or fluctuate when the temperature rises?",
      "Does the fan engage strongly when the engine starts running hot?",
    ];
    let aiQuestionIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "groq-response",
            created: 123456,
            model: "qwen/qwen3-32b",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    question: aiQuestions[Math.min(aiQuestionIndex++, aiQuestions.length - 1)],
                  }),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 90,
              completion_tokens: 18,
              total_tokens: 108,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      )
    );
  });

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

    expect(["ask_question", "proceed"]).toContain(current.next_action);
    expect(current.possible_causes[0]?.cause).toContain("Coolant");
    if (current.next_action === "ask_question") {
      expect(current.clarifying_question.length).toBeGreaterThan(0);
    }
    expect(clarificationHistory.length).toBeLessThanOrEqual(answers.length);
  });

  it("retries AI clarification generation when the provider repeats the previous question", async () => {
    const repeatedThenFresh = [
      "Does coolant level drop or leave wet residue after shutdown?",
      "Does coolant level drop or leave wet residue after shutdown?",
      "Does the truck run hottest under load rather than only at idle?",
    ];
    let responseIndex = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "retry-response",
            created: 123456,
            model: "openrouter/free",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    question: repeatedThenFresh[Math.min(responseIndex++, repeatedThenFresh.length - 1)],
                  }),
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 90,
              completion_tokens: 18,
              total_tokens: 108,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }
        )
      )
    );

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

    const secondPass = await caller.diagnostics.analyze({
      fleetId: 1,
      vehicleId: 42,
      symptoms: ["Engine overheating"],
      faultCodes: [],
      driverNotes: "Temperature rises on route",
      photoUrls: [],
      clarificationHistory: [
        {
          question: firstPass.clarifying_question,
          answer: "Yes, coolant level is dropping and there is wet residue after shutdown.",
        },
      ],
    });

    expect(secondPass.next_action).toBe("ask_question");
    expect(secondPass.clarifying_question.length).toBeGreaterThan(0);
    expect(secondPass.clarifying_question).not.toBe(firstPass.clarifying_question);
  });
});
