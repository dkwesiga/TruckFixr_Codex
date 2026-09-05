import { describe, expect, it } from "vitest";
import {
  allowedPartRequirementTransitions,
  canTransitionPartRequirement,
  isTerminalPartRequirementStatus,
} from "./partRequirementWorkflow";

describe("part requirement workflow", () => {
  it("allows the happy path from part_required to options_available", () => {
    expect(canTransitionPartRequirement("part_required", "identifying")).toBe(true);
    expect(canTransitionPartRequirement("identifying", "fitment_review")).toBe(true);
    expect(canTransitionPartRequirement("fitment_review", "fitment_verified")).toBe(true);
    expect(canTransitionPartRequirement("fitment_verified", "sourcing")).toBe(true);
    expect(canTransitionPartRequirement("sourcing", "options_available")).toBe(true);
  });

  it("rejects skipping identification/fitment steps", () => {
    expect(canTransitionPartRequirement("part_required", "sourcing")).toBe(false);
    expect(canTransitionPartRequirement("part_required", "options_available")).toBe(false);
  });

  it("allows recovering from an ambiguous fitment with more evidence", () => {
    expect(canTransitionPartRequirement("fitment_review", "fitment_ambiguous")).toBe(true);
    expect(canTransitionPartRequirement("fitment_ambiguous", "fitment_verified")).toBe(true);
  });

  it("treats approved/declined/part_not_found/cancelled as terminal (options_available is no longer terminal — Phase 2 extends it)", () => {
    expect(isTerminalPartRequirementStatus("approved")).toBe(true);
    expect(isTerminalPartRequirementStatus("declined")).toBe(true);
    expect(isTerminalPartRequirementStatus("part_not_found")).toBe(true);
    expect(isTerminalPartRequirementStatus("cancelled")).toBe(true);
    expect(isTerminalPartRequirementStatus("options_available")).toBe(false);
    expect(isTerminalPartRequirementStatus("sourcing")).toBe(false);
  });

  it("rejects a no-op transition", () => {
    expect(canTransitionPartRequirement("sourcing", "sourcing")).toBe(false);
  });

  it("exposes the allowed-transition list for a status", () => {
    expect(allowedPartRequirementTransitions("options_available")).toEqual([
      "recommendation_ready",
      "sourcing",
      "cancelled",
    ]);
    expect(allowedPartRequirementTransitions("part_required")).toEqual(["identifying", "cancelled"]);
    expect(allowedPartRequirementTransitions("approved")).toEqual([]);
  });
});

describe("part requirement workflow — Phase 2 comparison/approval tail", () => {
  it("allows the happy path from options_available through approval", () => {
    expect(canTransitionPartRequirement("options_available", "recommendation_ready")).toBe(true);
    expect(canTransitionPartRequirement("recommendation_ready", "awaiting_approval")).toBe(true);
    expect(canTransitionPartRequirement("awaiting_approval", "approved")).toBe(true);
  });

  it("allows declining or requesting more information instead of approving", () => {
    expect(canTransitionPartRequirement("awaiting_approval", "declined")).toBe(true);
    expect(canTransitionPartRequirement("awaiting_approval", "needs_more_information")).toBe(true);
  });

  it("recovers from needs_more_information back into fitment/sourcing work", () => {
    expect(canTransitionPartRequirement("needs_more_information", "fitment_review")).toBe(true);
    expect(canTransitionPartRequirement("needs_more_information", "sourcing")).toBe(true);
    expect(isTerminalPartRequirementStatus("needs_more_information")).toBe(false);
  });

  it("does not allow skipping straight from options_available to approved", () => {
    expect(canTransitionPartRequirement("options_available", "approved")).toBe(false);
    expect(canTransitionPartRequirement("options_available", "awaiting_approval")).toBe(false);
  });

  it("treats approved and declined as final — no further transition out", () => {
    expect(allowedPartRequirementTransitions("approved")).toEqual([]);
    expect(allowedPartRequirementTransitions("declined")).toEqual([]);
  });
});
