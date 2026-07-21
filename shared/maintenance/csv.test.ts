import { describe, expect, it } from "vitest";

import {
  buildColumnMap,
  isFormulaInjection,
  parseCsv,
  sanitizeCsvField,
} from "./csv";

describe("CSV parsing", () => {
  it("parses a simple CSV with header", () => {
    const { header, rows } = parseCsv(
      "vehicleId,eventType,eventTimestamp\nveh-1,odometer,2026-07-20T12:00:00Z\n"
    );
    expect(header).toEqual(["vehicleId", "eventType", "eventTimestamp"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["veh-1", "odometer", "2026-07-20T12:00:00Z"]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const { rows } = parseCsv(
      'a,b\n"has, comma","he said ""hi"""\n'
    );
    expect(rows[0]).toEqual(["has, comma", 'he said "hi"']);
  });

  it("handles CRLF line endings and a missing trailing newline", () => {
    const { header, rows } = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(header).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("builds a case-insensitive column map", () => {
    const map = buildColumnMap(["VehicleId", "EventType"]);
    expect(map["vehicleid"]).toBe(0);
    expect(map["eventtype"]).toBe(1);
  });
});

describe("formula-injection protection", () => {
  it("detects formula triggers", () => {
    expect(isFormulaInjection("=SUM(A1)")).toBe(true);
    expect(isFormulaInjection("+1")).toBe(true);
    expect(isFormulaInjection("-1")).toBe(true);
    expect(isFormulaInjection("@cmd")).toBe(true);
    expect(isFormulaInjection("safe")).toBe(false);
    expect(isFormulaInjection("")).toBe(false);
  });

  it("neutralizes dangerous export fields with a leading apostrophe", () => {
    expect(sanitizeCsvField("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvField("normal")).toBe("normal");
  });
});
