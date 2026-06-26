import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const diagnosticsRouterSource = readFileSync(
  resolve(process.cwd(), "server/routers/diagnostics.ts"),
  "utf8"
);
const confirmedOutcomesSource = readFileSync(
  resolve(process.cwd(), "server/services/confirmedOutcomes.ts"),
  "utf8"
);
const schemaSource = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const mvpHardeningMigration = readFileSync(
  resolve(process.cwd(), "drizzle/0019_mvp_readiness_hardening.sql"),
  "utf8"
);

describe("diagnostic feedback persistence guardrails", () => {
  it("allows manager-confirmed diagnostic outcomes to persist without a defect id", () => {
    expect(schemaSource).toContain('defectId: integer("defectId")');
    expect(mvpHardeningMigration).toContain('ALTER COLUMN "defectId" DROP NOT NULL');
    expect(diagnosticsRouterSource).toContain("defectId: input.defectId ?? null");
    expect(diagnosticsRouterSource).toContain("if (input.defectId) {");
    expect(diagnosticsRouterSource).not.toContain("if (\n        input.defectId &&\n        (ctx.user.role");
  });

  it("merges feedback metadata into existing AI quality review metadata", () => {
    expect(diagnosticsRouterSource).toContain("coalesce(${aiQualityReviews.metadata}, '{}'::jsonb)");
    expect(diagnosticsRouterSource).toContain("feedback: feedbackMetadata");
  });

  it("stores compact diagnosis context for future same-fleet solved-case retrieval", () => {
    expect(diagnosticsRouterSource).toContain("diagnosisContext: {");
    expect(diagnosticsRouterSource).toContain("faultCodes: normalizeFaultCodes(input.faultCodes)");
    expect(diagnosticsRouterSource).toContain("topCause: analysis.likely_causes[0]?.cause ?? null");
  });

  it("loads normalized repair outcomes from the whole fleet for similarity scoring", () => {
    expect(diagnosticsRouterSource).toContain('.where(eq(repairOutcomes.fleetId, fleetId))');
    expect(diagnosticsRouterSource).toContain('.where(eq(repairOutcomes.fleetId, input.fleetId))');
    expect(diagnosticsRouterSource).toContain("solved diagnostic reviews");
    // Selection/ranking now lives in the dedicated confirmed-outcomes service.
    expect(diagnosticsRouterSource).toContain("buildConfirmedOutcomeReferences({");
    expect(confirmedOutcomesSource).toContain("scoreHistoricalDiagnosticCase({");
  });

  it("guards against cross-fleet outcome leakage in the confirmed-outcome builder", () => {
    expect(confirmedOutcomesSource).toContain("droppedForeignFleetCount");
    expect(confirmedOutcomesSource).toContain("String(row.fleetId) === requestedFleetId");
    expect(diagnosticsRouterSource).toContain("cross_fleet_outcome_filtered");
  });
});
