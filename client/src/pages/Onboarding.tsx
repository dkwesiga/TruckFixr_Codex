import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronLeft, CheckCircle } from "lucide-react";
import { useAuthContext } from "@/hooks/useAuthContext";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { trpc } from "@/lib/trpc";
import { loadCompanyName, saveCompanyName } from "@/lib/companyIdentity";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OnboardingStep = 
  | "fleet-creation"
  | "truck-setup"
  | "team-invitations"
  | "inspection-templates"
  | "first-inspection"
  | "first-diagnosis"
  | "morning-summary";

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
  team: {
    managerName: string;
    managerEmail: string;
    driverName: string;
    driverEmail: string;
  };
  completed: {
    truckCreated: boolean;
    managerInvited: boolean;
    driverInvited: boolean;
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
    team: {
      managerName: "",
      managerEmail: "",
      driverName: "",
      driverEmail: "",
    },
    completed: {
      truckCreated: false,
      managerInvited: false,
      driverInvited: false,
    },
  });
  const companyQuery = trpc.company.getCurrent.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const createFleetMutation = trpc.fleet.create.useMutation();
  const createVehicleMutation = trpc.vehicles.create.useMutation();
  const inviteManagerMutation = trpc.company.inviteMember.useMutation();
  const inviteDriverMutation = trpc.auth.createManagedDriverInvite.useMutation();

  const steps: OnboardingStep[] = [
    "fleet-creation",
    "truck-setup",
    "team-invitations",
    "inspection-templates",
    "first-inspection",
    "first-diagnosis",
    "morning-summary",
  ];

  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;
  const existingFleetId =
    typeof companyQuery.data?.company?.id === "number" && companyQuery.data.company.id > 0
      ? companyQuery.data.company.id
      : null;
  const resolvedFleetId = state.fleet.id ?? existingFleetId;
  const isOwner = user?.role === "owner";

  const isTruckFormValid = useMemo(() => {
    const normalizedVin = state.truck.vin.trim().toUpperCase();
    if (state.completed.truckCreated) return true;
    if (normalizedVin.length !== 17) return false;
    if (!state.truck.year.trim()) return true;
    const parsedYear = Number(state.truck.year);
    return Number.isInteger(parsedYear) && parsedYear >= 1980 && parsedYear <= new Date().getFullYear() + 1;
  }, [state.completed.truckCreated, state.truck.vin, state.truck.year]);

  const teamStepHasPartialInvite = useMemo(() => {
    const values = [
      state.team.managerName,
      state.team.managerEmail,
      state.team.driverName,
      state.team.driverEmail,
    ].map((value) => value.trim());
    return values.some(Boolean);
  }, [state.team.driverEmail, state.team.driverName, state.team.managerEmail, state.team.managerName]);

  const teamStepIsValid = useMemo(() => {
    const managerProvided = state.team.managerName.trim() || state.team.managerEmail.trim();
    const driverProvided = state.team.driverName.trim() || state.team.driverEmail.trim();

    if (!managerProvided && !driverProvided) return true;
    if (managerProvided && (!state.team.managerName.trim() || !state.team.managerEmail.trim())) return false;
    if (driverProvided && (!state.team.driverName.trim() || !state.team.driverEmail.trim())) return false;
    return true;
  }, [state.team.driverEmail, state.team.driverName, state.team.managerEmail, state.team.managerName]);

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

      if (currentStep === "team-invitations") {
        if (!teamStepIsValid) {
          toast.error("Complete both name and email for each team invite you want to send.");
          return;
        }

        if (!resolvedFleetId) {
          toast.error("TruckFixr could not find your fleet yet. Go back and save the fleet first.");
          return;
        }

        if (isOwner && state.team.managerName.trim() && state.team.managerEmail.trim() && !state.completed.managerInvited) {
          await inviteManagerMutation.mutateAsync({
            fleetId: resolvedFleetId,
            role: "manager",
            name: state.team.managerName.trim(),
            email: state.team.managerEmail.trim().toLowerCase(),
          });
          setState((current) => ({
            ...current,
            completed: {
              ...current.completed,
              managerInvited: true,
            },
          }));
          toast.success("Manager invitation created.");
        }

        if (state.team.driverName.trim() && state.team.driverEmail.trim() && !state.completed.driverInvited) {
          const result = await inviteDriverMutation.mutateAsync({
            name: state.team.driverName.trim(),
            email: state.team.driverEmail.trim().toLowerCase(),
          });
          setState((current) => ({
            ...current,
            completed: {
              ...current.completed,
              driverInvited: true,
            },
          }));
          toast.success(result.invitation.message);
        }

        if (!teamStepHasPartialInvite) {
          toast.message("No invites were sent on this step. You can add teammates later from the dashboard.");
        }
      }

      if (currentStepIndex < steps.length - 1) {
        setCurrentStep(steps[currentStepIndex + 1]);
      }
    } catch (error: any) {
      toast.error(error?.message || "TruckFixr could not save this step.");
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
    (currentStep === "truck-setup" && !isTruckFormValid) ||
    (currentStep === "team-invitations" && !teamStepIsValid);

  const nextButtonLabel =
    submittingStep === currentStep
      ? "Saving..."
      : currentStep === "fleet-creation"
        ? resolvedFleetId
          ? "Continue"
          : "Create Fleet"
        : currentStep === "truck-setup" && !state.completed.truckCreated
          ? "Save Truck"
          : currentStep === "team-invitations" && teamStepHasPartialInvite
            ? "Send Invites"
            : "Next";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-slate-900">Welcome to TruckFixr</h1>
          <p className="text-slate-600 mt-1">Let's get your fleet ready for inspections and AI diagnosis in 7 steps</p>
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
              {resolvedFleetId ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Fleet ready. TruckFixr will use this fleet for the next onboarding steps.
                </p>
              ) : null}
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
                  <Label htmlFor="unit-number">Unit Number</Label>
                  <Input
                    id="unit-number"
                    placeholder="e.g., 42"
                    className="mt-2"
                    value={state.truck.unitNumber}
                    onChange={(e) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, unitNumber: e.target.value },
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
                    onChange={(e) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, vin: e.target.value.toUpperCase() },
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
                    onChange={(e) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, licensePlate: e.target.value },
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
                    onChange={(e) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, make: e.target.value },
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
                    onChange={(e) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, model: e.target.value },
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
                    onChange={(e) =>
                      setState((current) => ({
                        ...current,
                        truck: { ...current.truck, year: e.target.value },
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
                {isOwner ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="manager-name">Manager Name</Label>
                      <Input
                        id="manager-name"
                        type="text"
                        placeholder="Dispatch lead"
                        className="mt-2"
                        value={state.team.managerName}
                        onChange={(e) =>
                          setState((current) => ({
                            ...current,
                            team: { ...current.team, managerName: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="manager-email">Manager Email</Label>
                      <Input
                        id="manager-email"
                        type="email"
                        placeholder="manager@example.com"
                        className="mt-2"
                        value={state.team.managerEmail}
                        onChange={(e) =>
                          setState((current) => ({
                            ...current,
                            team: { ...current.team, managerEmail: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Only fleet owners can invite additional managers. You can still invite drivers below.
                  </div>
                )}
                <div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="driver-name">Driver Name</Label>
                      <Input
                        id="driver-name"
                        type="text"
                        placeholder="Driver name"
                        className="mt-2"
                        value={state.team.driverName}
                        onChange={(e) =>
                          setState((current) => ({
                            ...current,
                            team: { ...current.team, driverName: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="driver-email">Driver Email</Label>
                      <Input
                        id="driver-email"
                        type="email"
                        placeholder="driver@example.com"
                        className="mt-2"
                        value={state.team.driverEmail}
                        onChange={(e) =>
                          setState((current) => ({
                            ...current,
                            team: { ...current.team, driverEmail: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
              {state.completed.managerInvited || state.completed.driverInvited ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {state.completed.managerInvited && state.completed.driverInvited
                    ? "Manager and driver invites have been created."
                    : state.completed.driverInvited
                      ? "Driver invite has been sent."
                      : "Manager invite has been created."}
                </p>
              ) : null}
              <p className="text-sm text-slate-600">
                Driver invites are emailed immediately. Manager invitations are created for fleet access and can be completed during signup.
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
                    <li>Exterior condition</li>
                    <li>Lights and signals</li>
                    <li>Tires and wheels</li>
                    <li>Brakes and suspension</li>
                    <li>Engine compartment</li>
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

        {/* Step 6: First Diagnosis */}
        {currentStep === "first-diagnosis" && (
          <Card>
            <CardHeader>
              <CardTitle>See AI Diagnosis in Action</CardTitle>
              <CardDescription>How TruckFixr prioritizes defects and fault code risk</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="font-semibold text-slate-900 mb-2">Example: Engine Overheating</h4>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p><strong>Urgency:</strong> <span className="text-red-600 font-semibold">Critical</span></p>
                    <p><strong>Action:</strong> <span className="text-red-600 font-semibold">Stop Now</span></p>
                    <p><strong>Likely Cause:</strong> Coolant system failure or thermostat malfunction</p>
                    <p><strong>Reasoning:</strong> High engine temperature combined with a recent coolant leak points to an immediate cooling-system failure risk.</p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                TruckFixr reviews driver reports, inspection findings, and fault codes to help you prioritize safe next steps.
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
