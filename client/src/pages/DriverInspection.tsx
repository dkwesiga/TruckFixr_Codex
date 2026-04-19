import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronLeft, CheckCircle, AlertCircle, Camera } from "lucide-react";
import { useAuthContext } from "@/hooks/useAuthContext";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";

type InspectionStep = "start" | "exterior" | "lights" | "tires" | "brakes" | "engine" | "defects" | "confirmation";

interface InspectionItem {
  id: string;
  category: string;
  name: string;
  checked: boolean;
  notes?: string;
}

interface DefectReport {
  category: string;
  description: string;
  severity: "minor" | "moderate" | "severe";
  photoUrls: string[];
}

function DriverInspectionContent() {
  const { user } = useAuthContext();
  const [currentStep, setCurrentStep] = useState<InspectionStep>("start");
  const [items, setItems] = useState<InspectionItem[]>([
    { id: "ext-1", category: "Exterior", name: "Body damage or dents", checked: false },
    { id: "ext-2", category: "Exterior", name: "Glass and mirrors intact", checked: false },
    { id: "ext-3", category: "Exterior", name: "Doors and locks working", checked: false },
    { id: "light-1", category: "Lights", name: "Headlights functional", checked: false },
    { id: "light-2", category: "Lights", name: "Brake lights functional", checked: false },
    { id: "light-3", category: "Lights", name: "Turn signals working", checked: false },
    { id: "tire-1", category: "Tires", name: "Tire pressure normal", checked: false },
    { id: "tire-2", category: "Tires", name: "No visible damage or wear", checked: false },
    { id: "brake-1", category: "Brakes", name: "Brake pedal firm", checked: false },
    { id: "brake-2", category: "Brakes", name: "No brake fluid leaks", checked: false },
    { id: "engine-1", category: "Engine", name: "Engine starts normally", checked: false },
    { id: "engine-2", category: "Engine", name: "No unusual noises", checked: false },
  ]);
  const [defects, setDefects] = useState<DefectReport[]>([]);
  const [newDefect, setNewDefect] = useState<Partial<DefectReport>>({});

  const steps: InspectionStep[] = ["start", "exterior", "lights", "tires", "brakes", "engine", "defects", "confirmation"];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const toggleItem = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const getItemsByCategory = (category: string) => items.filter(item => item.category === category);
  const allItemsChecked = items.every(item => item.checked);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-lg sm:text-xl font-bold text-slate-900">Daily Inspection</h1>
          <p className="text-xs sm:text-sm text-slate-600">Truck #42 - License ABC-1234</p>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        {/* Start */}
        {currentStep === "start" && (
          <Card>
            <CardHeader>
              <CardTitle>Ready to Inspect?</CardTitle>
              <CardDescription>Complete a quick daily inspection of your truck</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-slate-900 mb-2">What You'll Check:</h4>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>✓ Exterior condition</li>
                  <li>✓ Lights and signals</li>
                  <li>✓ Tires and wheels</li>
                  <li>✓ Brakes</li>
                  <li>✓ Engine compartment</li>
                </ul>
              </div>
              <p className="text-sm text-slate-600">
                This should take about 5-10 minutes. Report any defects you find.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Exterior */}
        {currentStep === "exterior" && (
          <Card>
            <CardHeader>
              <CardTitle>Exterior Check</CardTitle>
              <CardDescription>Look for damage, dents, or issues</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getItemsByCategory("Exterior").map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <label htmlFor={item.id} className="text-sm font-medium text-slate-900 cursor-pointer flex-1">
                    {item.name}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Lights */}
        {currentStep === "lights" && (
          <Card>
            <CardHeader>
              <CardTitle>Lights & Signals</CardTitle>
              <CardDescription>Check all lights are working</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getItemsByCategory("Lights").map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <label htmlFor={item.id} className="text-sm font-medium text-slate-900 cursor-pointer flex-1">
                    {item.name}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tires */}
        {currentStep === "tires" && (
          <Card>
            <CardHeader>
              <CardTitle>Tires & Wheels</CardTitle>
              <CardDescription>Inspect all tires for wear and damage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getItemsByCategory("Tires").map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <label htmlFor={item.id} className="text-sm font-medium text-slate-900 cursor-pointer flex-1">
                    {item.name}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Brakes */}
        {currentStep === "brakes" && (
          <Card>
            <CardHeader>
              <CardTitle>Brakes</CardTitle>
              <CardDescription>Check brake system condition</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getItemsByCategory("Brakes").map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <label htmlFor={item.id} className="text-sm font-medium text-slate-900 cursor-pointer flex-1">
                    {item.name}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Engine */}
        {currentStep === "engine" && (
          <Card>
            <CardHeader>
              <CardTitle>Engine Compartment</CardTitle>
              <CardDescription>Final engine and fluid checks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getItemsByCategory("Engine").map(item => (
                <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <Checkbox
                    id={item.id}
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    className="mt-1"
                  />
                  <label htmlFor={item.id} className="text-sm font-medium text-slate-900 cursor-pointer flex-1">
                    {item.name}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Defects */}
        {currentStep === "defects" && (
          <Card>
            <CardHeader>
              <CardTitle>Report Defects</CardTitle>
              <CardDescription>Any issues found during inspection?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {defects.length > 0 && (
                <div className="space-y-3">
                  {defects.map((defect, idx) => (
                    <div key={idx} className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="font-medium text-slate-900">{defect.category}</p>
                      <p className="text-sm text-slate-600 mt-1">{defect.description}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <Label htmlFor="defect-category">Category</Label>
                  <select
                    id="defect-category"
                    className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg"
                    value={newDefect.category || ""}
                    onChange={(e) => setNewDefect({ ...newDefect, category: e.target.value })}
                  >
                    <option value="">Select category...</option>
                    <option value="Engine">Engine</option>
                    <option value="Brakes">Brakes</option>
                    <option value="Tires">Tires</option>
                    <option value="Lights">Lights</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="defect-description">Description</Label>
                  <Textarea
                    id="defect-description"
                    placeholder="Describe the issue..."
                    value={newDefect.description || ""}
                    onChange={(e) => setNewDefect({ ...newDefect, description: e.target.value })}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Take Photo (Optional)</Label>
                  <Button variant="outline" className="w-full mt-2">
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo
                  </Button>
                </div>

                <Button
                  className="w-full"
                  disabled={!newDefect.category || !newDefect.description}
                  onClick={() => {
                    if (newDefect.category && newDefect.description) {
                      setDefects([...defects, {
                        category: newDefect.category,
                        description: newDefect.description,
                        severity: "moderate",
                        photoUrls: [],
                      }]);
                      setNewDefect({});
                    }
                  }}
                >
                  Add Defect
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirmation */}
        {currentStep === "confirmation" && (
          <Card>
            <CardHeader>
              <CardTitle>Inspection Complete!</CardTitle>
              <CardDescription>Your inspection has been submitted</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <CheckCircle className="w-16 h-16 text-green-600" />
              </div>

              <div className="space-y-3">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm font-medium text-slate-900">✓ All inspection items checked</p>
                </div>

                {defects.length > 0 && (
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm font-medium text-slate-900">
                      {defects.length} defect{defects.length !== 1 ? "s" : ""} reported
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Your manager will review and prioritize these issues.
                    </p>
                  </div>
                )}
              </div>

              <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => window.location.href = "/driver"}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 sm:px-6 lg:px-8 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className="flex-1"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <span className="text-xs sm:text-sm text-slate-600 whitespace-nowrap">
              {currentStepIndex + 1} / {steps.length}
            </span>

            {currentStepIndex === steps.length - 1 ? (
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => window.location.href = "/driver"}>
                Done
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="flex-1"
                disabled={currentStep !== "defects" && !getItemsByCategory(
                  currentStep === "exterior" ? "Exterior" :
                  currentStep === "lights" ? "Lights" :
                  currentStep === "tires" ? "Tires" :
                  currentStep === "brakes" ? "Brakes" :
                  currentStep === "engine" ? "Engine" : ""
                ).every(item => item.checked)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DriverInspection() {
  return (
    <RoleBasedRoute requiredRoles={["driver"]}>
      <DriverInspectionContent />
    </RoleBasedRoute>
  );
}
