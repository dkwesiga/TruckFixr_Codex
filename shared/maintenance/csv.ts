// Minimal, dependency-free CSV parsing + formula-injection protection for the
// vehicle-event import. Pure and testable. NOT a general CSV library — it
// handles quoted fields, escaped quotes, and CRLF/LF, which is sufficient for
// the bounded import format.

export const VEHICLE_EVENT_IMPORT_LIMITS = {
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxRows: 1_000,
  batchSize: 100,
} as const;

// Characters that make a spreadsheet treat a cell as a formula. Any field that
// begins with one is neutralized with a leading apostrophe on export AND is
// rejected/again-sanitized on import so a malicious CSV cannot inject formulas.
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

export function isFormulaInjection(value: string): boolean {
  if (value.length === 0) return false;
  return FORMULA_TRIGGERS.includes(value[0]);
}

// For values we write OUT to CSV exports.
export function sanitizeCsvField(value: string): string {
  return isFormulaInjection(value) ? `'${value}` : value;
}

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // handle CRLF: skip, newline handled on \n
      if (text[i + 1] === "\n") {
        // let \n handle the row break
      } else {
        pushRow();
      }
    } else {
      field += ch;
    }
  }
  // trailing field / row (no final newline)
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // Drop a trailing fully-empty row (file ended with newline).
  const nonEmpty = rows.filter(
    (r) => !(r.length === 1 && r[0].trim() === "")
  );

  const [header, ...dataRows] = nonEmpty;
  return {
    header: (header ?? []).map((h) => h.trim()),
    rows: dataRows,
  };
}

// Map header names to column indexes, case-insensitively.
export function buildColumnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((name, idx) => {
    map[name.trim().toLowerCase()] = idx;
  });
  return map;
}
