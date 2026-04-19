import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceKm } from "@/lib/vehicleDisplay";
import { AlertCircle, CheckCircle, Clock, Wrench, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";

function TruckDetailContent() {
  const [activeTab, setActiveTab] = useState("overview");
  const [, navigate] = useLocation();

  // Mock truck data
  const truck = {
    id: 42,
    vin: "1XPWD49X91D487964",
    licensePlate: "ABC-1234",
    make: "Peterbilt",
    engineMake: "PACCAR",
    model: "579",
    year: 2022,
    mileage: 245320,
    engineHours: 12450,
    status: "operational",
    lastInspection: new Date(Date.now() - 24 * 60 * 60 * 1000),
    nextMaintenanceDue: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  const inspections = [
    {
      id: 1,
      date: new Date(Date.now() - 24 * 60 * 60 * 1000),
      driver: "John Smith",
      status: "completed",
      itemsChecked: 12,
      defectsFound: 0,
    },
    {
      id: 2,
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      driver: "John Smith",
      status: "completed",
      itemsChecked: 12,
      defectsFound: 1,
    },
    {
      id: 3,
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      driver: "Jane Doe",
      status: "completed",
      itemsChecked: 12,
      defectsFound: 0,
    },
  ];

  const defects = [
    {
      id: 1,
      title: "Engine Overheating",
      urgency: "Critical",
      status: "open",
      reportedDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      reportedBy: "John Smith",
    },
    {
      id: 2,
      title: "Brake Inspection Due",
      urgency: "Attention",
      status: "acknowledged",
      reportedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      reportedBy: "Jane Doe",
    },
    {
      id: 3,
      title: "Tire Wear Detected",
      urgency: "Monitor",
      status: "resolved",
      reportedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      reportedBy: "John Smith",
    },
  ];

  const maintenanceLogs = [
    {
      id: 1,
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      type: "Oil Change",
      component: "Engine",
      cost: 150,
      notes: "Routine maintenance",
    },
    {
      id: 2,
      date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      type: "Brake Pads Replacement",
      component: "Brakes",
      cost: 450,
      notes: "Front and rear pads replaced",
    },
    {
      id: 3,
      date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      type: "Tire Rotation",
      component: "Tires",
      cost: 200,
      notes: "All four tires rotated",
    },
  ];

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "Critical":
        return "text-red-600 bg-red-50";
      case "Attention":
        return "text-yellow-600 bg-yellow-50";
      case "Monitor":
        return "text-blue-600 bg-blue-50";
      default:
        return "text-slate-600 bg-slate-50";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Truck #{truck.id}</h1>
              <p className="text-slate-600 mt-1">{truck.make} {truck.model} ({truck.year})</p>
            </div>
            <Button variant="outline" onClick={() => navigate("/manager")}>Back to Fleet</Button>
          </div>
        </div>
      </header>

      {/* Quick Stats */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-slate-600 mb-1">License Plate</p>
                <p className="font-semibold text-slate-900">{truck.licensePlate}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Engine Model</p>
                <p className="font-semibold text-slate-900">{truck.engineMake}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Status</p>
                <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                  {truck.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Distance</p>
                <p className="font-semibold text-slate-900">{formatDistanceKm(truck.mileage)}</p>
              </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="inspections">Inspections</TabsTrigger>
            <TabsTrigger value="defects">Defects & Alerts</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Information</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-slate-600 mb-1">VIN</p>
                  <p className="font-medium text-slate-900">{truck.vin}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Engine Hours</p>
                  <p className="font-medium text-slate-900">{truck.engineHours.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Engine Model</p>
                  <p className="font-medium text-slate-900">{truck.engineMake}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Year</p>
                  <p className="font-medium text-slate-900">{truck.year}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 mb-1">Next Maintenance Due</p>
                  <p className="font-medium text-slate-900">{truck.nextMaintenanceDue.toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fleet Health Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-semibold text-slate-900">Overall Status: Good</p>
                      <p className="text-sm text-slate-600">No critical issues detected</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inspections Tab */}
          <TabsContent value="inspections" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Inspections</CardTitle>
                <CardDescription>Daily inspection history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inspections.map(inspection => (
                    <div key={inspection.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-slate-900">{inspection.date.toLocaleDateString()}</p>
                          <p className="text-sm text-slate-600">Driver: {inspection.driver}</p>
                        </div>
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                          {inspection.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        {inspection.itemsChecked} items checked • {inspection.defectsFound} defect{inspection.defectsFound !== 1 ? "s" : ""} found
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Defects & Alerts Tab */}
          <TabsContent value="defects" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Defects & Alerts</CardTitle>
                <CardDescription>All reported issues and TADIS alerts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {defects.map(defect => (
                    <div key={defect.id} className={`p-4 rounded-lg border ${getUrgencyColor(defect.urgency)}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-slate-900">{defect.title}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            {defect.reportedDate.toLocaleDateString()} • {defect.reportedBy}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-semibold px-2 py-1 rounded`}>
                            {defect.urgency}
                          </span>
                          <p className="text-xs text-slate-600 mt-1">{defect.status}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Maintenance Tab */}
          <TabsContent value="maintenance" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Maintenance Log</CardTitle>
                <CardDescription>Complete maintenance history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-900">Date</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-900">Type</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-900">Component</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-900">Cost</th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-900">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenanceLogs.map(log => (
                        <tr key={log.id} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="py-3 px-4">{log.date.toLocaleDateString()}</td>
                          <td className="py-3 px-4">{log.type}</td>
                          <td className="py-3 px-4">{log.component}</td>
                          <td className="py-3 px-4">${log.cost}</td>
                          <td className="py-3 px-4 text-slate-600">{log.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default function TruckDetail() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <TruckDetailContent />
    </RoleBasedRoute>
  );
}
