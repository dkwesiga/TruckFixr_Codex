import { useAuthContext } from "@/hooks/useAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { AlertCircle, TrendingUp, Truck, Clock } from "lucide-react";
import { useLocation } from "wouter";
import MorningFleetSummary from "@/components/MorningFleetSummary";

function ManagerDashboardContent() {
  const { user, logout } = useAuthContext();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fleet Dashboard</h1>
            <p className="text-sm text-slate-600">Welcome, {user?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Active Trucks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">12</div>
              <p className="text-xs text-slate-500 mt-1">All operational</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Critical Issues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">3</div>
              <p className="text-xs text-slate-500 mt-1">Require immediate action</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Pending Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">8</div>
              <p className="text-xs text-slate-500 mt-1">Awaiting assignment</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Fleet Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">94%</div>
              <p className="text-xs text-slate-500 mt-1">Above target</p>
            </CardContent>
          </Card>
        </div>

        {/* Morning Fleet Summary */}
        <div className="mb-8">
          <MorningFleetSummary fleetId={1} />
        </div>

        {/* Open Defects by Severity */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Open Defects by Severity</CardTitle>
            <CardDescription>Current fleet defect status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-900">Truck #42 - Engine Overheating</h4>
                  <p className="text-sm text-slate-600">Critical: Stop now. Driver reported high coolant temperature.</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-900">Truck #15 - Brake Inspection Due</h4>
                  <p className="text-sm text-slate-600">Attention: Inspect soon. Scheduled maintenance overdue.</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-900">Truck #8 - Monitor</h4>
                  <p className="text-sm text-slate-600">Monitor: Minor tire wear detected. No immediate action needed.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Prioritized Action Queue</CardTitle>
            <CardDescription>Issues requiring manager attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Truck</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Issue</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Urgency</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-900">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-3 px-4">Truck #42</td>
                    <td className="py-3 px-4">Engine Overheating</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">
                        Critical
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Button size="sm" variant="outline">
                        View Details
                      </Button>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="py-3 px-4">Truck #15</td>
                    <td className="py-3 px-4">Brake Inspection</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                        Attention
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Button size="sm" variant="outline">
                        View Details
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default function ManagerDashboard() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <ManagerDashboardContent />
    </RoleBasedRoute>
  );
}
