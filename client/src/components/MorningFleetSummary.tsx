import { AlertCircle, Truck, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { trackEvent } from "@/lib/analytics";
import { useEffect } from "react";

interface MorningFleetSummaryProps {
  fleetId: number;
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
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-slate-900">Morning Fleet Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
            <div className="h-4 bg-slate-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !healthSummary) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-red-900">Morning Fleet Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-700">Unable to load fleet summary</p>
        </CardContent>
      </Card>
    );
  }

  // Determine overall fleet status color
  const getStatusColor = () => {
    if (healthSummary.criticalDefects > 0) return "from-red-50 to-orange-50";
    if (healthSummary.openDefects > 5) return "from-yellow-50 to-orange-50";
    return "from-green-50 to-emerald-50";
  };

  const getHealthColor = () => {
    if (healthSummary.averageFleetHealth >= 80) return "text-green-600";
    if (healthSummary.averageFleetHealth >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card className={`bg-gradient-to-br ${getStatusColor()} border-blue-200`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold text-slate-900">Morning Fleet Summary</CardTitle>
          <TrendingUp className={`w-5 h-5 ${getHealthColor()}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Fleet Health Score */}
          <div className="flex items-center justify-between p-4 bg-white/50 rounded-lg border border-slate-200">
            <div>
              <p className="text-sm text-slate-600 font-medium">Fleet Health</p>
              <p className={`text-3xl font-bold ${getHealthColor()}`}>
                {healthSummary.averageFleetHealth}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Last updated</p>
              <p className="text-sm font-medium text-slate-700">
                {new Date(healthSummary.lastUpdated).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          {/* Truck Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-white/50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <p className="text-xs text-slate-600 font-medium">Trucks Active</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{healthSummary.activeTrucks}</p>
              <p className="text-xs text-slate-500 mt-1">
                {healthSummary.trucksInService} in service, {healthSummary.trucksInMaintenance} in maintenance
              </p>
            </div>

            <div className="p-3 bg-white/50 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <p className="text-xs text-slate-600 font-medium">Pending Inspections</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{healthSummary.pendingInspections}</p>
              <p className="text-xs text-slate-500 mt-1">Due today</p>
            </div>
          </div>

          {/* Defects Overview */}
          <div className="p-4 bg-white/50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-slate-700 font-semibold">Open Defects</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{defectsBySeverity?.critical || 0}</p>
                <p className="text-xs text-slate-600">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{defectsBySeverity?.high || 0}</p>
                <p className="text-xs text-slate-600">High</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{defectsBySeverity?.medium || 0}</p>
                <p className="text-xs text-slate-600">Medium</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{defectsBySeverity?.low || 0}</p>
                <p className="text-xs text-slate-600">Low</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Total: {healthSummary.openDefects} open defects
            </p>
          </div>

          {/* Maintenance Alerts */}
          {healthSummary.maintenanceAlerts > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {healthSummary.maintenanceAlerts} Maintenance Alert{healthSummary.maintenanceAlerts !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    Scheduled maintenance due on {healthSummary.maintenanceAlerts} truck{healthSummary.maintenanceAlerts !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Status Indicator */}
          <div className="flex items-center gap-2 p-3 bg-white/50 rounded-lg border border-slate-200">
            <CheckCircle2 className={`w-5 h-5 ${getHealthColor()}`} />
            <p className="text-sm text-slate-700">
              {healthSummary.criticalDefects === 0
                ? "✓ No critical issues detected"
                : `⚠ ${healthSummary.criticalDefects} critical issue${healthSummary.criticalDefects !== 1 ? 's' : ''} require attention`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
