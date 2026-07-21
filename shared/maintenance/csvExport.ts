// Pure CSV serialization for tenant-scoped exports. Every field is sanitized
// against formula injection and quoted. Excludes prompts, signed URLs, storage
// keys, and raw payloads by construction (callers pass only allowed columns).

import { sanitizeCsvField } from "./csv";

function escapeField(value: string): string {
  const safe = sanitizeCsvField(value);
  // Quote if it contains a comma, quote, or newline.
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines: string[] = [];
  lines.push(headers.map((h) => escapeField(String(h))).join(","));
  for (const row of rows) {
    lines.push(row.map((cell) => escapeField(cell == null ? "" : String(cell))).join(","));
  }
  return lines.join("\r\n");
}

// Metadata header block prepended to an export (date, timezone, filters, pilot
// period, units, currencies). Rendered as comment-style leading lines.
export function buildExportPreamble(meta: {
  generatedAt: string;
  timezone: string;
  pilotStart?: string | null;
  pilotEnd?: string | null;
  filters?: string;
  units?: string;
  currencies?: string;
}): string {
  const lines = [
    `# Generated: ${meta.generatedAt}`,
    `# Timezone: ${meta.timezone}`,
    `# Pilot period: ${meta.pilotStart ?? "n/a"} to ${meta.pilotEnd ?? "n/a"}`,
    `# Filters: ${meta.filters ?? "none"}`,
    `# Units: ${meta.units ?? "kilometres, hours"}`,
    `# Currencies: ${meta.currencies ?? "CAD"}`,
  ];
  // Sanitize preamble values too (they may include user-influenced filters).
  return lines.map((l) => sanitizeCsvField(l)).join("\r\n");
}
