import React from "react";
import { DiagnosticResult } from "../../../packages/types/diagnostics";
import { DiagnosticResultCard } from "./DiagnosticResultCard";

interface DiagnosticsResultCardsProps {
  result: DiagnosticResult;
}

export function DiagnosticsResultCards({ result }: DiagnosticsResultCardsProps) {
  return (
    <>
      <DiagnosticResultCard title="Most Likely Issue" value={result.mostLikelyIssue} />
      <DiagnosticResultCard title="Confidence" value={`${result.confidence}%`} />
      <DiagnosticResultCard title="Risk" value={result.risk.toUpperCase()} />
      <DiagnosticResultCard title="Tests" value={result.tests.join("\n")} />
      <DiagnosticResultCard title="Fix" value={result.fix} />
    </>
  );
}
