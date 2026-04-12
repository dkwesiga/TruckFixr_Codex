import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { AlertCircle, CheckCircle, Clock, User, MessageSquare, FileText } from "lucide-react";
import { useAuthContext } from "@/hooks/useAuthContext";

function DefectDetailContent() {
  const { user } = useAuthContext();

  // Mock defect data
  const defect = {
    id: 1,
    vehicleId: 42,
    title: "Engine Overheating",
    description: "Driver reported high engine temperature warning on dashboard",
    reportedBy: "John Smith (Driver)",
    reportedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    status: "open",
    photoUrls: [],
  };

  const tadisAnalysis = {
    urgency: "Critical" as const,
    recommendedAction: "Stop Now" as const,
    likelyCause: "Coolant system failure or thermostat malfunction",
    reasoning:
      "High engine temperature combined with recent coolant leak indicates immediate cooling system failure. Continued operation risks engine damage and potential safety hazard.",
    confidence: 0.92,
    nextSteps: [
      "Move vehicle to safe location immediately",
      "Do not continue operation",
      "Check coolant level and condition",
      "Inspect radiator for blockages",
      "Test thermostat operation",
    ],
  };

  const actionLog = [
    {
      id: 1,
      actor: "John Smith (Driver)",
      action: "Reported defect",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      notes: "Engine overheating warning on dashboard",
    },
    {
      id: 2,
      actor: "System",
      action: "TADIS Analysis Complete",
      timestamp: new Date(Date.now() - 1.99 * 60 * 60 * 1000),
      notes: "Urgency: Critical, Recommended Action: Stop Now",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Defect Details</h1>
              <p className="text-slate-600 mt-1">Truck #42 - License ABC-1234</p>
            </div>
            <Button variant="outline">Back to Queue</Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column: Defect & TADIS */}
          <div className="lg:col-span-2 space-y-6">
            {/* Defect Summary */}
            <Card>
              <CardHeader>
                <CardTitle>{defect.title}</CardTitle>
                <CardDescription>Reported {defect.reportedAt.toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-2">Description</p>
                  <p className="text-slate-900">{defect.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Reported By</p>
                    <p className="font-medium text-slate-900">{defect.reportedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Status</p>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                      {defect.status}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TADIS Analysis Card */}
            <Card className="border-2 border-red-200 bg-red-50">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      TADIS Analysis
                    </CardTitle>
                    <CardDescription>AI-powered diagnostic assessment</CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">Confidence</p>
                    <p className="text-lg font-bold text-slate-900">{Math.round(tadisAnalysis.confidence * 100)}%</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Urgency & Action */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-red-100 rounded-lg border border-red-300">
                    <p className="text-xs text-red-700 font-semibold mb-1">URGENCY</p>
                    <p className="text-2xl font-bold text-red-600">{tadisAnalysis.urgency}</p>
                  </div>
                  <div className="p-4 bg-red-100 rounded-lg border border-red-300">
                    <p className="text-xs text-red-700 font-semibold mb-1">ACTION</p>
                    <p className="text-lg font-bold text-red-600">{tadisAnalysis.recommendedAction}</p>
                  </div>
                </div>

                {/* Likely Cause */}
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-2">Likely Cause</p>
                  <p className="text-slate-700">{tadisAnalysis.likelyCause}</p>
                </div>

                {/* Reasoning */}
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-2">Reasoning</p>
                  <p className="text-slate-700">{tadisAnalysis.reasoning}</p>
                </div>

                {/* Next Steps */}
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-3">Recommended Next Steps</p>
                  <ol className="space-y-2">
                    {tadisAnalysis.nextSteps.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-900">{idx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>

            {/* Action Log */}
            <Card>
              <CardHeader>
                <CardTitle>Action Log</CardTitle>
                <CardDescription>Timeline of all actions on this defect</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {actionLog.map((log, idx) => (
                    <div key={log.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          {log.action.includes("Reported") ? (
                            <User className="w-4 h-4 text-blue-600" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        {idx < actionLog.length - 1 && <div className="w-0.5 h-12 bg-slate-200 mt-2" />}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="font-medium text-slate-900">{log.action}</p>
                        <p className="text-xs text-slate-600">{log.actor}</p>
                        <p className="text-xs text-slate-500 mt-1">{log.timestamp.toLocaleString()}</p>
                        {log.notes && <p className="text-sm text-slate-700 mt-2">{log.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Manager Actions */}
          <div className="space-y-6">
            {/* Manager Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle>Manager Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full" variant="outline">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Acknowledge
                </Button>
                <Button className="w-full" variant="outline">
                  <Clock className="w-4 h-4 mr-2" />
                  Assign to Mechanic
                </Button>
                <Button className="w-full" variant="outline">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Add Note
                </Button>
                <Button className="w-full" variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Mark Resolved
                </Button>
              </CardContent>
            </Card>

            {/* Quick Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-slate-600 mb-1">Vehicle</p>
                  <p className="font-medium text-slate-900">Truck #42</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">License Plate</p>
                  <p className="font-medium text-slate-900">ABC-1234</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">Make/Model</p>
                  <p className="font-medium text-slate-900">Peterbilt 579</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">Mileage</p>
                  <p className="font-medium text-slate-900">245,320 mi</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DefectDetail() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <DefectDetailContent />
    </RoleBasedRoute>
  );
}
