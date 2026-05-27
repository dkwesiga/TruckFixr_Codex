import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";
import { useAuthContext } from "@/hooks/useAuthContext";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { trpc } from "@/lib/trpc";
import { getVehicleCreateErrorPresentation } from "@/lib/actionErrorMessages";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OnboardingStep = "fleet-creation" | "truck-setup" | "first-inspection";

interface OnboardingState {
  fleet: {
    name: string;
    id: number | null;
  };
  truck: {
    unitNumber: string;
    vin: string;
    licensePlate: string;
    make: string;
    model: string;
    year: string;
  };
  completed: {
    truckCreated: boolean;
  };
}

function OnboardingContent() {
  const { user } = useAuthContext();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("fleet-creation");
  const [submittingStep, setSubmittingStep] = useState<OnboardingStep | null>(null);
  const [state, setState] = useState<OnboardingState>({
    fleet: { name: loadCompanyName(), id: null },
    truck: {
      unitNumber: "",
      vin: "",
      licensePlate: "",
      make: "",
      model: "",
      year: "",
    },
    completed: {
      truckCreated: false,
    },
  });

  const companyQuery = trpc.company.getCurrent.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const createFleetMutation = trpc.fleet.create.useMutation();
  const createVehicleMutation = trpc.vehicles.create.useMutation();

  const steps: OnboardingStep[] = ["fleet-creation", "truck-setup", "first-inspection"];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const existingFleetId =
    typeof companyQuery.data?.company?.id === "number" && companyQuery.data.company.id > 0
      ? companyQuery.data.company.id
      : null;
  const resolvedFleetId = state.fleet.id ?? existingFleetId;

  const isTruckFormValid = useMemo(() => {
    const normalizedVin = state.truck.vin.trim().toUpperCase();
    if (state.completed.truckCreated) return true;
    if (normalizedVin.length !== 17) return false;
    if (!state.truck.year.trim()) return true;
    const parsedYear = Number(state.truck.year);
    return Number.isInteger(parsedYear) && parsedYear >= 1980 && parsedYear <= new Date().getFullYear() + 1;
  }, [state.completed.truckCreated, state.truck.vin, state.truck.year]);

  const handleNext = async () => {
    try {
      setSubmittingStep(currentStep);

      if (currentStep === "fleet-creation") {
        const fleetName = state.fleet.name.trim();
        if (!fleetName) {
          toast.error("Enter your fleet name before continuing.");
          return;
        }

        saveCompanyName(fleetName);

        if (!resolvedFleetId) {
          const fleet = await createFleetMutation.mutateAsync({
            name: fleetName,
          });
          setState((current) => ({
            ...current,
            fleet: {
              name: fleet.name,
              id: fleet.id,
            },
          }));
          await companyQuery.refetch();
          toast.success("Fleet created. You can add your first truck now.");
        }
      }

      if (currentStep === "truck-setup" && !state.completed.truckCreated) {
        if (!resolvedFleetId) {
          toast.error("TruckFixr could not find your fleet yet. Go back and save the fleet first.");
          return;
        }

        if (!isTruckFormValid) {
          toast.error("Enter a valid 17-character VIN and check the year.");
          return;
        }

        const createdVehicle = await createVehicleMutation.mutateAsync({
          fleetId: resolvedFleetId,
          unitNumber: state.truck.unitNumber.trim() || undefined,
          vin: state.truck.vin.trim().toUpperCase(),
          licensePlate: state.truck.licensePlate.trim() || undefined,
          make: state.truck.make.trim() || undefined,
          model: state.truck.model.trim() || undefined,
          year: state.truck.year.trim() ? Number(state.truck.year.trim()) : undefined,
        });

        setState((current) => ({
          ...current,
          completed: {
            ...current.completed,
            truckCreated: true,
          },
          truck: {
            ...current.truck,
            vin: createdVehicle.vin,
            licensePlate: createdVehicle.licensePlate ?? current.truck.licensePlate,
            make: createdVehicle.make ?? current.truck.make,
            model: createdVehicle.model ?? current.truck.model,
            year:
              typeof createdVehicle.year === "number"
                ? String(createdVehicle.year)
                : current.truck.year,
          },
        }));
        await utils.vehicles.listByFleet.invalidate({ fleetId: resolvedFleetId });
        toast.success("Your first truck has been saved.");
      }

      if (currentStepIndex < steps.length - 1) {
        setCurrentStep(steps[currentStepIndex + 1]);
      }
    } catch (error: any) {
      if (currentStep === "truck-setup") {
        toast.error(getVehicleCreateErrorPresentation(error).toast);
      } else {
        toast.error(error?.message || "TruckFixr could not save this step.");
      }
    } finally {
      setSubmittingStep(null);
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

  useEffect(() => {
    if (!companyQuery.data?.company) return;
    setState((current) => ({
      ...current,
      fleet: {
        id: current.fleet.id ?? companyQuery.data?.company?.id ?? null,
        name: current.fleet.name || companyQuery.data?.company?.name || "",
      },
    }));
  }, [companyQuery.data?.company]);

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const nextButtonDisabled =
    submittingStep === currentStep ||
    companyQuery.isLoading ||
    (currentStep === "fleet-creation" && !state.fleet.name.trim()) ||
    (currentStep === "truck-setup" && !isTruckFormValid);

  const nextButtonLabel =
    submittingStep === currentStep
      ? "Saving..."
      : currentStep === "fleet-creation"
        ? resolvedFleetId
          ? "Continue"
          : "Create Fleet"
        : currentStep === "truck-setup" && !state.completed.truckCreated
          ? "Save Truck"
          : "Next";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-slate-900">Welcome to TruckFixr</h1>
          <p className="text-slate-600 mt-1">Let's get your fleet ready in 3 quick steps: fleet, first truck, first inspection.</p>
        </div>
      </header>

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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {currentStep === "fleet-creation" && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your Fleet</CardTitle>
              <CardDescription>Give your fleet a name to get started.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="fleet-name">Fleet Name</Label>
                <Input
                  id="fleet-name"
                  placeholder="e.g., John's Trucking Co."
                  value={state.fleet.name}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      fleet: { ...current.fleet, name: event.target.value },
                    }))
                  }
                  className="mt-2 border-blue-200 bg-blue-50/60 focus-visible:ring-blue-500"
                />
              </div>
              {resolvedFleetId ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Fleet ready. TruckFixr will use this fleet for the next onboarding steps.
                </p>
              ) : null}
              <p className="text-sm text-slate-600">
                You can refine settings later. Right now the goal is to get you to the first real workflow as quickly as possible.
              </p>
            </CardContent>
          </Card>
        )}

        {currentStep === "truck-setup" && (
          <Card>
            <CardHeader>
              <CardTitle>Add Your First Truck</CardTitle>
              <CardDescription>Start with the minimum info needed to run the first inspection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="unit-number">Unit Number</Label>
                  <Input
                    id="unit-number"
                    placeholder="e.g., 42"
                    className="mt-2"
                    value={state.truck.unitNumber}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, unitNumber: event.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="vin">VIN</Label>
                  <Input
                    id="vin"
                    placeholder="17-character VIN"
                    className="mt-2"
                    value={state.truck.vin}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, vin: event.target.value.toUpperCase() },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="license-plate">License Plate</Label>
                  <Input
                    id="license-plate"
                    placeholder="ABC-1234"
                    className="mt-2"
                    value={state.truck.licensePlate}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, licensePlate: event.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="make">Make</Label>
                  <Input
                    id="make"
                    placeholder="e.g., Peterbilt"
                    className="mt-2"
                    value={state.truck.make}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, make: event.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    placeholder="e.g., 579"
                    className="mt-2"
                    value={state.truck.model}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, model: event.target.value },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    placeholder="2022"
                    className="mt-2"
                    value={state.truck.year}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, year: event.target.value },
                      }))
                    }
                  />
                </div>
              </div>
              {state.completed.truckCreated ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Your first truck is saved and ready for inspections.
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  VIN is required. License plate, make, model, and year can be refined later.
                </p>
              )}
              <p className="text-sm text-slate-600">
                You can add more trucks later. Start with one to prove the workflow before you do the rest of the setup.
              </p>
            </CardContent>
          </Card>
        )}

        {currentStep === "first-inspection" && (
          <Card>
            <CardHeader>
              <CardTitle>Start Your First Inspection</CardTitle>
              <CardDescription>You're ready for the first real workflow step inside the app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-slate-900">Your first truck is ready</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Fleet created and first truck saved. Next, open the dashboard and run the first inspection flow so you can see TruckFixr in action.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="font-semibold text-slate-900">Recommended next actions</h4>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>Open the dashboard and start the first inspection for the truck you just added.</li>
                  <li>Invite drivers or managers later from Profile &amp; Settings when you're ready.</li>
                  <li>After the first inspection, use TruckFixr diagnosis tools on any reported defect.</li>
                </ul>
              </div>

              <p className="text-sm text-slate-600">
                This shorter setup path gets you to the first win faster. You can handle invites, templates, and extra configuration after you see the core workflow.
              </p>
            </CardContent>
          </Card>
        )}

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
            <Button onClick={() => setLocation("/manager")} className="bg-green-600 hover:bg-green-700">
              Go to Dashboard
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={nextButtonDisabled}
            >
              {nextButtonLabel}
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
