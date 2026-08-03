import { TriangleAlert } from "lucide-react";

export const SAFETY_NOTICE_TEXT =
  "Do not use TruckFixr while driving. If you are driving, pull over safely before entering symptoms, reading results, or following diagnostic instructions.";

/**
 * Safety-critical driver warning. Intentionally NOT dismissible: a warning the
 * driver can permanently hide stops working at the moment it matters most.
 *
 * - `strip`  — slim, always-visible banner for the top of the driver dashboard.
 * - `inline` — contextual reminder shown inside high-risk entry points
 *              (report-a-problem, inspection, diagnosis) where a driver is about
 *              to enter symptoms or read results.
 */
export default function SafetyNotice({
  variant = "strip",
  className = "",
}: {
  variant?: "strip" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div
        role="note"
        className={`flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 ${className}`}
      >
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p>
          <span className="font-semibold">Safety notice:</span> {SAFETY_NOTICE_TEXT}
        </p>
      </div>
    );
  }

  return (
    <div
      role="note"
      className={`w-full border-b border-amber-300 bg-amber-100/90 px-4 py-2 text-center text-xs font-medium leading-snug text-amber-900 ${className}`}
    >
      <span className="mx-auto inline-flex max-w-4xl items-center justify-center gap-2">
        <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          <span className="font-semibold">Safety notice:</span> {SAFETY_NOTICE_TEXT}
        </span>
      </span>
    </div>
  );
}
