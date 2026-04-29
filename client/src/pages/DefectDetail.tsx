import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceKm } from "@/lib/vehicleDisplay";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle, Clock, User, MessageSquare, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function DefectDetailContent() {
  const [, navigate] = useLocation();
  const defectId = useMemo(() => {
    const match = window.location.pathname.match(/\/defect\/(\d+)/);
    return match ? Number(match[1]) : 1;
  }, []);
  const defectQuery = trpc.defects.getById.useQuery({ defectId });
  const utils = trpc.useUtils();
  const [managerNote, setManagerNote] = useState("");
  const recordRepairOutcomeMutation = trpc.inspections.recordRepairOutcome.useMutation({
    onSuccess: async () => {
      await utils.defects.getById.invalidate({ defectId });
      toast.success("Repair outcome recorded");
    },
  });
  const updateStatusMutation = trpc.defects.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.defects.getById.invalidate({ defectId });
      toast.success("Defect status updated");
    },
  });
  const resolveMutation = trpc.defects.resolve.useMutation({
    onSuccess: async () => {
      await utils.defects.getById.invalidate({ defectId });
      toast.success("Defect marked resolved");
    },
  });
  const [repairForm, setRepairForm] = useState({
    confirmedFault: "",
    repairPerformed: "",
    partsReplaced: "",
    aiDiagnosisCorrect: "unknown" as "yes" | "partially" | "no" | "unknown",
    repairNotes: "",
  });

  const liveDefect = defectQuery.data?.defect;
  const liveAlert = defectQuery.data?.tadisAlert;
  const defect = liveDefect
    ? {
        id: liveDefect.id,
        vehicleId: liveDefect.vehicleId,
        title: liveDefect.title,
        description: liveDefect.description || "No description provided",
        reportedBy: `Driver ${liveDefect.driverId}`,
        reportedAt: new Date(liveDefect.createdAt),
        status: liveDefect.status || "open",
        photoUrls: Array.isArray(liveDefect.photoUrls) ? liveDefect.photoUrls : [],
      }
    : {
        id: defectId,
        vehicleId: 42,
        title: "Loading defect...",
        description: "Loading latest defect details",
        reportedBy: "Driver",
        reportedAt: new Date(),
        status: "open",
        photoUrls: [],
      };

  const tadisAnalysis = {
    urgency: liveAlert?.urgency ?? "Attention",
    recommendedAction: liveAlert?.recommendedAction ?? "Inspect Soon",
    likelyCause: liveAlert?.likelyCause ?? liveDefect?.aiSummary ?? "Manager review required",
    reasoning:
      liveAlert?.reasoning ??
      liveDefect?.aiSummary ??
      "TruckFixr created this defect from the verified inspection workflow.",
    confidence: (liveDefect?.aiConfidenceScore ?? 0) / 100,
    nextSteps: liveAlert?.reasoning
      ? (() => {
          try {
            const parsed = JSON.parse(liveAlert.reasoning);
            return Array.isArray(parsed.recommended_tests) ? parsed.recommended_tests : ["Review defect and record repair outcome"];
          } catch {
            return ["Review defect and record repair outcome"];
          }
        })()
      : ["Review defect and record repair outcome"],
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

  const submitRepairOutcome = async () => {
    if (!repairForm.confirmedFault.trim() || !repairForm.repairPerformed.trim()) {
      toast.error("Enter the confirmed fault and repair performed.");
      return;
    }

    await recordRepairOutcomeMutation.mutateAsync({
      defectId: defect.id,
      confirmedFault: repairForm.confirmedFault.trim(),
      repairPerformed: repairForm.repairPerformed.trim(),
      partsReplaced: repairForm.partsReplaced
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
      aiDiagnosisCorrect: repairForm.aiDiagnosisCorrect,
      returnedToServiceAt: new Date().toISOString(),
      repairNotes: repairForm.repairNotes.trim() || undefined,
      resolveDefect: true,
    });
  };

  const submitStatusUpdate = async (status: "open" | "acknowledged" | "assigned" | "resolved", options?: { assignedTo?: number }) => {
    if (!liveDefect) return;
    await updateStatusMutation.mutateAsync({
      defectId: defect.id,
      status,
      notes: managerNote.trim() || undefined,
      assignedTo: options?.assignedTo,
    });
  };

  const markResolved = async () => {
    if (!liveDefect) return;
    await resolveMutation.mutateAsync({
      defectId: defect.id,
      resolutionNotes: managerNote.trim() || "Resolved by manager",
    });
  };

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
            <Button variant="outline" onClick={() => navigate("/manager")}>Back to Queue</Button>
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
                    {tadisAnalysis.nextSteps.map((step: string, idx: number) => (
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
                <div className="space-y-2">
                  <Label htmlFor="managerNote">Manager note</Label>
                  <Textarea
                    id="managerNote"
                    value={managerNote}
                    onChange={(event) => setManagerNote(event.target.value)}
                    placeholder="Optional note for the driver or mechanic"
                  />
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={() => void submitStatusUpdate("acknowledged")}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Acknowledge
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={() => void submitStatusUpdate("assigned")}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Assign to Mechanic
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={updateStatusMutation.isPending}
                  onClick={() => void submitStatusUpdate((liveDefect?.status ?? "open") as "open" | "acknowledged" | "assigned" | "resolved")}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Add Note
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  disabled={resolveMutation.isPending}
                  onClick={() => void markResolved()}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Mark Resolved
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Repair Outcome</CardTitle>
                <CardDescription>Save confirmed repair feedback for future AI context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="confirmedFault">Confirmed fault</Label>
                  <Input
                    id="confirmedFault"
                    value={repairForm.confirmedFault}
                    onChange={(event) =>
                      setRepairForm((current) => ({ ...current, confirmedFault: event.target.value }))
                    }
                    placeholder="Leaking oil cooler"
                  />
                </div>
                <div>
                  <Label htmlFor="repairPerformed">Repair performed</Label>
                  <Textarea
                    id="repairPerformed"
                    value={repairForm.repairPerformed}
                    onChange={(event) =>
                      setRepairForm((current) => ({ ...current, repairPerformed: event.target.value }))
                    }
                    placeholder="Pressure-tested cooling system and replaced oil cooler"
                  />
                </div>
                <div>
                  <Label htmlFor="partsReplaced">Parts replaced</Label>
                  <Input
                    id="partsReplaced"
                    value={repairForm.partsReplaced}
                    onChange={(event) =>
                      setRepairForm((current) => ({ ...current, partsReplaced: event.target.value }))
                    }
                    placeholder="oil cooler, coolant, oil filter"
                  />
                </div>
                <div>
                  <Label htmlFor="aiAccuracy">Was AI diagnosis correct?</Label>
                  <select
                    id="aiAccuracy"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={repairForm.aiDiagnosisCorrect}
                    onChange={(event) =>
                      setRepairForm((current) => ({
                        ...current,
                        aiDiagnosisCorrect: event.target.value as typeof repairForm.aiDiagnosisCorrect,
                      }))
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="partially">Partially</option>
                    <option value="no">No</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
                <Textarea
                  value={repairForm.repairNotes}
                  onChange={(event) =>
                    setRepairForm((current) => ({ ...current, repairNotes: event.target.value }))
                  }
                  placeholder="Repair notes"
                />
                <Button
                  className="w-full"
                  disabled={recordRepairOutcomeMutation.isPending}
                  onClick={submitRepairOutcome}
                >
                  {recordRepairOutcomeMutation.isPending ? "Saving..." : "Record repair outcome"}
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
                  <p className="text-slate-600 mb-1">Distance</p>
                  <p className="font-medium text-slate-900">{formatDistanceKm(245320)}</p>
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
