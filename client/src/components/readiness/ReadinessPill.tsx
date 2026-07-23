import { AlertOctagon, CheckCircle2, Clock, Eye, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Customer-facing readiness (matches shared/maintenance/customerReadiness.ts).
export type Readiness = "ready" | "monitor" | "service_soon" | "stop";

interface ReadinessDisplay {
  label: string;
  icon: LucideIcon;
  color: string; // brand status color
  bg: string;
  border: string;
}

// Icon + text + color together — never color alone (ui-ux-pro-max: "Color Only" [High]).
const DISPLAY: Record<Readiness, ReadinessDisplay> = {
  ready: { label: "Ready", icon: CheckCircle2, color: "#1EA66C", bg: "#E7F6EE", border: "#B7E4CD" },
  monitor: { label: "Monitor", icon: Eye, color: "#2D7DE0", bg: "#E8F1FC", border: "#BBD6F5" },
  service_soon: { label: "Service Soon", icon: Clock, color: "#B5760A", bg: "#FDF3DF", border: "#F3D9A0" },
  stop: { label: "Stop", icon: AlertOctagon, color: "#D81F2A", bg: "#FDEAEB", border: "#F4B9BD" },
};

export function readinessDisplay(readiness: Readiness): ReadinessDisplay {
  return DISPLAY[readiness];
}

export function ReadinessPill({
  readiness,
  size = "md",
  className,
}: {
  readiness: Readiness;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const d = DISPLAY[readiness];
  const Icon = d.icon;
  const sizing =
    size === "lg"
      ? "text-base px-4 py-2 gap-2"
      : size === "sm"
        ? "text-xs px-2.5 py-1 gap-1.5"
        : "text-sm px-3 py-1.5 gap-2";
  const iconSize = size === "lg" ? 20 : size === "sm" ? 14 : 16;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-bold uppercase tracking-[0.04em]",
        sizing,
        className
      )}
      style={{ color: d.color, backgroundColor: d.bg, borderColor: d.border }}
      // Screen readers get an explicit status label, not just a color.
      role="status"
      aria-label={`Readiness: ${d.label}`}
    >
      <Icon size={iconSize} aria-hidden="true" strokeWidth={2.5} />
      {d.label}
    </span>
  );
}
