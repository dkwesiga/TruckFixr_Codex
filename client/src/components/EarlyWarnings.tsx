import { AlertTriangle } from "lucide-react";

// Shared presentation helpers for rule-based early-warning flags
// (server/services/earlyWarning.ts). Reused by the Fleet Dashboard, Vehicle
// Profile, and Issue Detail views so warnings look consistent everywhere.

export type EarlyWarning = {
  id: number;
  vehicleId: string;
  defectId: number | null;
  warningType: string;
  warningReason: string;
  severity: string;
  vehicleLabel?: string;
};

const WARNING_TYPE_LABELS: Record<string, string> = {
  repeat_symptom: "Repeated issue",
  repeat_fault_code: "Repeated fault code",
  high_severity_defect: "High-severity defect",
  multiple_open_issues: "Multiple open issues",
  safety_keyword: "Safety-critical system",
  overdue_open_issue: "Overdue open issue",
  recurring_after_repair: "Recurring after repair",
};

export function warningTypeLabel(type: string): string {
  return WARNING_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

export function warningSeverityClasses(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-50 text-red-700 ring-red-200";
    case "high":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "medium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

export function EarlyWarningList({
  warnings,
  showVehicle = false,
  onSelect,
  emptyMessage = "No active early warnings.",
}: {
  warnings: EarlyWarning[];
  showVehicle?: boolean;
  onSelect?: (warning: EarlyWarning) => void;
  emptyMessage?: string;
}) {
  if (warnings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {warnings.map((warning) => {
        const interactive = Boolean(onSelect);
        return (
          <div
            key={warning.id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={interactive ? () => onSelect?.(warning) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect?.(warning);
                    }
                  }
                : undefined
            }
            className={`rounded-2xl border border-slate-200 bg-white p-4 ${
              interactive ? "cursor-pointer transition hover:border-slate-300 hover:shadow-sm" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-slate-900">
                    {warningTypeLabel(warning.warningType)}
                    {showVehicle && warning.vehicleLabel ? (
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        · {warning.vehicleLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{warning.warningReason}</p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ${warningSeverityClasses(
                  warning.severity
                )}`}
              >
                {warning.severity}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
