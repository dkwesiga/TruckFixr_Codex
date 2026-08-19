import { describe, expect, it } from "vitest";
import { computeDiagnosticsAccess } from "./subscriptions";

describe("computeDiagnosticsAccess", () => {
  it("soft plans keep serving AI calls past the fair-use limit, but flag it", () => {
    const result = computeDiagnosticsAccess({
      diagnosticsThisMonth: 151,
      diagnosticLimit: 150,
      aiUsageEnforcement: "soft",
    });
    expect(result.aiFairUseExceeded).toBe(true);
    expect(result.canRunDiagnostics).toBe(true);
  });

  it("soft plans under the fair-use limit are not flagged", () => {
    const result = computeDiagnosticsAccess({
      diagnosticsThisMonth: 10,
      diagnosticLimit: 150,
      aiUsageEnforcement: "soft",
    });
    expect(result.aiFairUseExceeded).toBe(false);
    expect(result.canRunDiagnostics).toBe(true);
  });

  it("hard plans (no-card free trial) block once the limit is reached", () => {
    const result = computeDiagnosticsAccess({
      diagnosticsThisMonth: 10,
      diagnosticLimit: 10,
      aiUsageEnforcement: "hard",
    });
    expect(result.aiFairUseExceeded).toBe(true);
    expect(result.canRunDiagnostics).toBe(false);
  });

  it("a null limit (custom/enterprise) never blocks or flags", () => {
    const result = computeDiagnosticsAccess({
      diagnosticsThisMonth: 10_000,
      diagnosticLimit: null,
      aiUsageEnforcement: "hard",
    });
    expect(result.aiFairUseExceeded).toBe(false);
    expect(result.canRunDiagnostics).toBe(true);
  });
});
