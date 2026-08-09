import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { trackEvent } from "@/lib/analytics";
import { useEffect } from "react";

interface MorningFleetSummaryProps {
  fleetId: number;
}

const cardStyle = {
  background: "var(--tfx-bg-surface)",
  border: "1px solid var(--tfx-border-1)",
  boxShadow: "var(--tfx-shadow-sm)",
} as const;

const tileStyle = {
  background: "var(--tfx-bg-sunken)",
} as const;

function healthStatusColor(averageFleetHealth: number): string {
  if (averageFleetHealth >= 80) return "var(--status-ok)";
  if (averageFleetHealth >= 60) return "var(--status-warning)";
  return "var(--status-critical)";
}

export default function MorningFleetSummary({ fleetId }: MorningFleetSummaryProps) {
  const { data: healthSummary, isLoading, error } = trpc.fleet.getHealthSummary.useQuery({
    fleetId,
  });

  const { data: defectsBySeverity } = trpc.fleet.getDefectsBySeverity.useQuery({
    fleetId,
  });

  useEffect(() => {
    if (healthSummary) {
      trackEvent('dashboard_viewed', {
        section: 'morning_fleet_summary',
        fleetId,
        activeTrucks: healthSummary.activeTrucks,
        criticalDefects: healthSummary.criticalDefects,
      });
    }
  }, [healthSummary, fleetId]);

  if (isLoading) {
    return (
      <div className="rounded-[var(--r-4)] p-5" style={cardStyle}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-1/3 rounded bg-[var(--tfx-bg-sunken)]" />
          <div className="h-16 rounded bg-[var(--tfx-bg-sunken)]" />
        </div>
      </div>
    );
  }

  if (error || !healthSummary) {
    return (
      <div className="rounded-[var(--r-4)] p-5" style={{ ...cardStyle, borderTop: "2px solid var(--status-critical)" }}>
        <h2 className="tfx-h3">Morning fleet summary</h2>
        <p className="mt-1 text-sm text-[var(--tfx-fg-3)]">Unable to load fleet summary.</p>
      </div>
    );
  }

  const maintenanceAlerts = healthSummary.maintenanceAlerts ?? 0;
  const criticalDefects = healthSummary.criticalDefects ?? 0;
  const healthColor = healthStatusColor(healthSummary.averageFleetHealth);
  const updatedAt = new Date(healthSummary.lastUpdated).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const severityStats: Array<{ label: string; value: number; color: string }> = [
    { label: "Critical", value: defectsBySeverity?.critical ?? 0, color: "var(--status-critical)" },
    { label: "High", value: defectsBySeverity?.high ?? 0, color: "var(--status-warning)" },
    { label: "Medium", value: defectsBySeverity?.medium ?? 0, color: "var(--status-info)" },
    { label: "Low", value: defectsBySeverity?.low ?? 0, color: "var(--status-idle)" },
  ];

  return (
    <div className="rounded-[var(--r-4)] p-5" style={cardStyle}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="tfx-h3">Morning fleet summary</h2>
        <span className="text-xs text-[var(--tfx-fg-3)]">Updated {updatedAt}</span>
      </div>

      {/* Fleet health, trucks active, pending inspections */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--r-2)] p-3.5" style={tileStyle}>
          <p className="text-xs font-medium text-[var(--tfx-fg-3)]">Fleet health</p>
          <p className="mt-1 text-3xl font-bold" style={{ color: healthColor }}>
            {healthSummary.averageFleetHealth}%
          </p>
        </div>
        <div className="rounded-[var(--r-2)] p-3.5" style={tileStyle}>
          <p className="text-xs font-medium text-[var(--tfx-fg-3)]">Trucks active</p>
          <p className="mt-1 text-3xl font-bold text-[var(--tfx-fg-1)]">{healthSummary.activeTrucks}</p>
          <p className="mt-0.5 text-xs text-[var(--tfx-fg-3)]">
            {healthSummary.trucksInService} in service, {healthSummary.trucksInMaintenance} in maintenance
          </p>
        </div>
        <div className="rounded-[var(--r-2)] p-3.5" style={tileStyle}>
          <p className="text-xs font-medium text-[var(--tfx-fg-3)]">Pending inspections</p>
          <p className="mt-1 text-3xl font-bold text-[var(--tfx-fg-1)]">{healthSummary.pendingInspections}</p>
          <p className="mt-0.5 text-xs text-[var(--tfx-fg-3)]">Due today</p>
        </div>
      </div>

      {/* Open defects by severity */}
      <div className="mt-3 rounded-[var(--r-2)] p-3.5" style={tileStyle}>
        <p className="text-xs font-semibold text-[var(--tfx-fg-2)]">Open defects</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {severityStats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold" style={{ color: stat.color }}>
                {stat.value}
              </p>
              <p className="text-xs text-[var(--tfx-fg-3)]">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--tfx-fg-3)]">Total: {healthSummary.openDefects} open defects</p>
      </div>

      {/* At-a-glance alerts */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className="flex items-start gap-2.5 rounded-[var(--r-2)] p-3.5"
          style={{
            background: "var(--tfx-bg-sunken)",
            borderTop: `2px solid ${maintenanceAlerts > 0 ? "var(--status-warning)" : "var(--status-ok)"}`,
          }}
        >
          {maintenanceAlerts > 0 ? (
            <AlertTriangle className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" style={{ color: "var(--status-warning)" }} />
          ) : (
            <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" style={{ color: "var(--status-ok)" }} />
          )}
          <div>
            <p className="text-sm font-bold text-[var(--tfx-fg-1)]">
              {maintenanceAlerts > 0
                ? `${maintenanceAlerts} maintenance alert${maintenanceAlerts !== 1 ? "s" : ""}`
                : "No maintenance alerts"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--tfx-fg-2)]">
              {maintenanceAlerts > 0
                ? `Scheduled maintenance due on ${maintenanceAlerts} truck${maintenanceAlerts !== 1 ? "s" : ""}`
                : "Scheduled maintenance is up to date"}
            </p>
          </div>
        </div>

        <div
          className="flex items-start gap-2.5 rounded-[var(--r-2)] p-3.5"
          style={{
            background: "var(--tfx-bg-sunken)",
            borderTop: `2px solid ${criticalDefects > 0 ? "var(--brand-red)" : "var(--status-ok)"}`,
          }}
        >
          {criticalDefects > 0 ? (
            <AlertCircle className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" style={{ color: "var(--brand-red)" }} />
          ) : (
            <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" style={{ color: "var(--status-ok)" }} />
          )}
          <div>
            <p className="text-sm font-bold text-[var(--tfx-fg-1)]">
              {criticalDefects > 0
                ? `${criticalDefects} critical issue${criticalDefects !== 1 ? "s" : ""}`
                : "No critical issues"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--tfx-fg-2)]">
              {criticalDefects > 0 ? "Requires manager attention today" : "Fleet is operating safely"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
