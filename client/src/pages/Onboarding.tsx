import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronLeft, CheckCircle } from "lucide-react";
import { useAuthContext } from "@/hooks/useAuthContext";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";

type OnboardingStep = 
  | "fleet-creation"
  | "truck-setup"
  | "team-invitations"
  | "inspection-templates"
  | "first-inspection"
  | "first-triage"
  | "morning-summary";

interface OnboardingState {
  fleet: {
    name: string;
  };
  trucks: Array<{
    vin: string;
    licensePlate: string;
    make: string;
    model: string;
    year: number;
  }>;
  teamMembers: Array<{
    email: string;
    role: "manager" | "driver";
  }>;
}

function OnboardingContent() {
  const { user } = useAuthContext();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("fleet-creation");
  const [state, setState] = useState<OnboardingState>({
    fleet: { name: loadCompanyName() },
    trucks: [],
    teamMembers: [],
  });

  const steps: OnboardingStep[] = [
    "fleet-creation",
    "truck-setup",
    "team-invitations",
    "inspection-templates",
    "first-inspection",
    "first-triage",
    "morning-summary",
  ];

  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep === "fleet-creation") {
      saveCompanyName(state.fleet.name);
    }

    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  useEffect(() => {
    const companyName = loadCompanyName();
    if (!companyName) return;
    setState((current) => ({
      ...current,
      fleet: current.fleet.name ? current.fleet : { ...current.fleet, name: companyName },
    }));
  }, []);

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-slate-900">Welcome to TruckFixr</h1>
          <p className="text-slate-600 mt-1">Let's get your fleet up and running in 7 steps</p>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-900">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className="text-sm text-slate-600">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Step 1: Fleet Creation */}
        {currentStep === "fleet-creation" && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your Fleet</CardTitle>
              <CardDescription>Give your fleet a name to get started</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="fleet-name">Fleet Name</Label>
                <Input
                  id="fleet-name"
                  placeholder="e.g., John's Trucking Co."
                  value={state.fleet.name}
                  onChange={(e) =>
                    setState({
                      ...state,
                      fleet: { ...state.fleet, name: e.target.value },
                    })
                  }
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
              </div>
              <p className="text-sm text-slate-600">
                You can add more details and settings later. For now, just give your fleet a name.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Truck Setup */}
        {currentStep === "truck-setup" && (
          <Card>
            <CardHeader>
              <CardTitle>Add Your First Truck</CardTitle>
              <CardDescription>Enter details for your first vehicle</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="vin">VIN</Label>
                  <Input id="vin" placeholder="17-character VIN" className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="license-plate">License Plate</Label>
                  <Input id="license-plate" placeholder="ABC-1234" className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" placeholder="e.g., Peterbilt" className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" placeholder="e.g., 579" className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" type="number" placeholder="2022" className="mt-2" />
                </div>
              </div>
              <p className="text-sm text-slate-600">
                You can add more trucks later. Start with one to test the workflow.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Team Invitations */}
        {currentStep === "team-invitations" && (
          <Card>
            <CardHeader>
              <CardTitle>Invite Your Team</CardTitle>
              <CardDescription>Add managers and drivers to your fleet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="manager-email">Manager Email</Label>
                  <Input
                    id="manager-email"
                    type="email"
                    placeholder="manager@example.com"
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="driver-email">Driver Email</Label>
                  <Input
                    id="driver-email"
                    type="email"
                    placeholder="driver@example.com"
                    className="mt-2"
                  />
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Invitations will be sent via email. Team members can join immediately.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Inspection Templates */}
        {currentStep === "inspection-templates" && (
          <Card>
            <CardHeader>
              <CardTitle>Set Up Inspection Templates</CardTitle>
              <CardDescription>Define what drivers should check daily</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-slate-900 mb-2">Standard Daily Inspection</h4>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>✓ Exterior condition</li>
                    <li>✓ Lights and signals</li>
                    <li>✓ Tires and wheels</li>
                    <li>✓ Brakes and suspension</li>
                    <li>✓ Engine compartment</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                We've pre-configured a standard inspection template. You can customize it later.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 5: First Inspection */}
        {currentStep === "first-inspection" && (
          <Card>
            <CardHeader>
              <CardTitle>Complete Your First Inspection</CardTitle>
              <CardDescription>Let's walk through an inspection</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-slate-900">Inspection Ready</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Your first truck is ready for inspection. In the next step, you'll see how drivers report defects.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: First Triage */}
        {currentStep === "first-triage" && (
          <Card>
            <CardHeader>
              <CardTitle>See TADIS in Action</CardTitle>
              <CardDescription>How our AI analyzes defects</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="font-semibold text-slate-900 mb-2">Example: Engine Overheating</h4>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p><strong>Urgency:</strong> <span className="text-red-600 font-semibold">Critical</span></p>
                    <p><strong>Action:</strong> <span className="text-red-600 font-semibold">Stop Now</span></p>
                    <p><strong>Likely Cause:</strong> Coolant system failure or thermostat malfunction</p>
                    <p><strong>Reasoning:</strong> High engine temperature combined with recent coolant leak indicates immediate cooling system failure.</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                TADIS analyzes every defect to help you prioritize maintenance.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 7: Morning Summary */}
        {currentStep === "morning-summary" && (
          <Card>
            <CardHeader>
              <CardTitle>Your Morning Dashboard</CardTitle>
              <CardDescription>See your fleet at a glance every morning</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="font-semibold text-slate-900 mb-3">Fleet Status</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-600">Active Trucks</p>
                      <p className="text-2xl font-bold text-slate-900">1</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Critical Issues</p>
                      <p className="text-2xl font-bold text-red-600">0</p>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                You're all set! Start by having your driver complete their first inspection.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="text-sm text-slate-600">
            {currentStepIndex + 1} / {steps.length}
          </div>

          {currentStepIndex === steps.length - 1 ? (
            <Button onClick={() => window.location.href = "/manager"} className="bg-green-600 hover:bg-green-700">
              Go to Dashboard
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={
                (currentStep === "fleet-creation" && !state.fleet.name) ||
                (currentStep === "truck-setup" && state.trucks.length === 0)
              }
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Onboarding() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <OnboardingContent />
    </RoleBasedRoute>
  );
}
