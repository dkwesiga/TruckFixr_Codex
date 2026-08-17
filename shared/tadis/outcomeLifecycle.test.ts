import { describe, expect, it } from "vitest";
import { allowedOutcomeTransitions, canTransitionOutcome } from "./outcomeLifecycle";

describe("outcome lifecycle transitions", () => {
  it("allows unknown to move to reported, verified, or failed", () => {
    expect(canTransitionOutcome("unknown", "reported")).toBe(true);
    expect(canTransitionOutcome("unknown", "verified")).toBe(true);
    expect(canTransitionOutcome("unknown", "failed")).toBe(true);
  });

  it("allows reported to move to verified or failed but not directly to confirmed", () => {
    expect(canTransitionOutcome("reported", "verified")).toBe(true);
    expect(canTransitionOutcome("reported", "failed")).toBe(true);
    expect(canTransitionOutcome("reported", "confirmed")).toBe(false);
  });

  it("allows verified to move to confirmed or regress to failed", () => {
    expect(canTransitionOutcome("verified", "confirmed")).toBe(true);
    expect(canTransitionOutcome("verified", "failed")).toBe(true);
    expect(canTransitionOutcome("verified", "reported")).toBe(false);
  });

  it("allows a confirmed outcome to regress to failed on a later comeback", () => {
    expect(canTransitionOutcome("confirmed", "failed")).toBe(true);
    expect(canTransitionOutcome("confirmed", "verified")).toBe(false);
  });

  it("treats failed as terminal within a single outcome row", () => {
    expect(allowedOutcomeTransitions("failed")).toEqual([]);
  });

  it("rejects a no-op transition", () => {
    expect(canTransitionOutcome("verified", "verified")).toBe(false);
  });
});
