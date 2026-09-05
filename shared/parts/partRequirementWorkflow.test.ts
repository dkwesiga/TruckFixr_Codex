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

  it("treats options_available/part_not_found/cancelled as terminal", () => {
    expect(isTerminalPartRequirementStatus("options_available")).toBe(true);
    expect(isTerminalPartRequirementStatus("part_not_found")).toBe(true);
    expect(isTerminalPartRequirementStatus("cancelled")).toBe(true);
    expect(isTerminalPartRequirementStatus("sourcing")).toBe(false);
  });

  it("rejects a no-op transition", () => {
    expect(canTransitionPartRequirement("sourcing", "sourcing")).toBe(false);
  });

  it("exposes the allowed-transition list for a status", () => {
    expect(allowedPartRequirementTransitions("options_available")).toEqual([]);
    expect(allowedPartRequirementTransitions("part_required")).toEqual(["identifying", "cancelled"]);
  });
});
