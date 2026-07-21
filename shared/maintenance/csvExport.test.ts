import { describe, expect, it } from "vitest";

import { buildCsv, buildExportPreamble } from "./csvExport";

describe("buildCsv", () => {
  it("serializes headers and rows with CRLF", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("quotes fields containing commas, quotes, and newlines", () => {
    const csv = buildCsv(["x"], [['has, comma'], ['has "quote"'], ["line\nbreak"]]);
    expect(csv).toContain('"has, comma"');
    expect(csv).toContain('"has ""quote"""');
    expect(csv).toContain('"line\nbreak"');
  });

  it("neutralizes formula injection in cells", () => {
    const csv = buildCsv(["f"], [["=SUM(A1:A9)"], ["+1"], ["@cmd"]]);
    expect(csv).toContain("'=SUM(A1:A9)");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'@cmd");
  });

  it("renders empty cells for null/undefined", () => {
    const csv = buildCsv(["a", "b", "c"], [[null, undefined, "x"]]);
    expect(csv).toBe("a,b,c\r\n,,x");
  });
});

describe("buildExportPreamble", () => {
  it("includes date, timezone, and pilot period", () => {
    const p = buildExportPreamble({
      generatedAt: "2026-07-21T12:00:00Z",
      timezone: "America/Toronto",
      pilotStart: "2026-07-01",
      pilotEnd: "2026-09-30",
    });
    expect(p).toContain("Generated: 2026-07-21T12:00:00Z");
    expect(p).toContain("America/Toronto");
    expect(p).toContain("2026-07-01 to 2026-09-30");
  });
});
