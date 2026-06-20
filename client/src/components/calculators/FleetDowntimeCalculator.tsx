import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Gauge, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { trackEvent } from "@/lib/analytics";
import {
  computeDowntimeEstimate,
  formatCad,
  MAINTENANCE_WORKFLOWS,
  MAINTENANCE_WORKFLOW_LABELS,
  type DowntimeEstimate,
  type MaintenanceWorkflow,
  type RiskBand,
} from "@shared/calculators/downtimeCost";

type Phase = "calc" | "lead" | "report";

type NumberFieldKey =
  | "fleetSize"
  | "affectedVehiclesPerMonth"
  | "averageDowntimeDays"
  | "revenuePerVehiclePerDay"
  | "driverLabourCostPerDay"
  | "repairDecisionDelayDays"
  | "repeatRepairEventsPerMonth";

type NumberFieldConfig = {
  key: NumberFieldKey;
  label: string;
  helper: string;
  prefix?: string;
  min: number;
  step?: number;
  placeholder: string;
};

const NUMBER_FIELDS: NumberFieldConfig[] = [
  {
    key: "fleetSize",
    label: "Fleet size",
    helper: "Total number of vehicles in your fleet.",
    min: 1,
    placeholder: "50",
  },
  {
    key: "affectedVehiclesPerMonth",
    label: "Vehicles affected by downtime / month",
    helper: "Roughly how many vehicles are taken off the road each month.",
    min: 0,
    placeholder: "3",
  },
  {
    key: "averageDowntimeDays",
    label: "Average downtime days per affected vehicle",
    helper: "Average days each affected vehicle is down per month.",
    min: 0,
    step: 0.5,
    placeholder: "2",
  },
  {
    key: "revenuePerVehiclePerDay",
    label: "Revenue per vehicle per day",
    helper: "Estimated revenue a working vehicle produces in a day.",
    prefix: "$",
    min: 0,
    step: 10,
    placeholder: "800",
  },
  {
    key: "driverLabourCostPerDay",
    label: "Driver / labour cost per day",
    helper: "Driver or labour cost when a vehicle is down or disrupted.",
    prefix: "$",
    min: 0,
    step: 10,
    placeholder: "250",
  },
  {
    key: "repairDecisionDelayDays",
    label: "Repair decision delay (days)",
    helper: "Average delay before a repair decision is made.",
    min: 0,
    step: 0.5,
    placeholder: "1",
  },
  {
    key: "repeatRepairEventsPerMonth",
    label: "Repeat repair events / month",
    helper: "Repairs that come back or repeat in a typical month.",
    min: 0,
    placeholder: "2",
  },
];

const ROLE_OPTIONS = [
  "Fleet Manager",
  "Owner / Operator",
  "Maintenance Lead",
  "Operations Manager",
  "Dispatcher",
  "Other",
];

const RISK_BAND_STYLES: Record<RiskBand, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  moderate: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

const DISCLAIMER =
  "This calculator provides an estimate for planning and workflow review purposes only. It does not guarantee savings, downtime reduction, repair outcomes, or compliance results.";

type NumberFieldsState = Record<NumberFieldKey, string>;

const EMPTY_NUMBERS: NumberFieldsState = {
  fleetSize: "",
  affectedVehiclesPerMonth: "",
  averageDowntimeDays: "",
  revenuePerVehiclePerDay: "",
  driverLabourCostPerDay: "",
  repairDecisionDelayDays: "",
  repeatRepairEventsPerMonth: "",
};

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function trackingContext(sourcePagePath?: string) {
  if (typeof window === "undefined") {
    return { pagePath: sourcePagePath || "/", userAgent: "" };
  }
  const url = new URL(window.location.href);
  return {
    pagePath: sourcePagePath || `${url.pathname}${url.search}` || "/",
    userAgent: window.navigator.userAgent || "",
  };
}

export type FleetDowntimeCalculatorProps = {
  /** Where the calculator is mounted, used for analytics + lead attribution. */
  sourcePagePath?: string;
  /** Rendered after the report CTAs (e.g. a "Close" button inside the modal). */
  onClose?: () => void;
};

export default function FleetDowntimeCalculator({
  sourcePagePath,
  onClose,
}: FleetDowntimeCalculatorProps) {
  const submitMutation = trpc.downtimeCalculator.submit.useMutation();

  const [phase, setPhase] = useState<Phase>("calc");
  const [numbers, setNumbers] = useState<NumberFieldsState>(EMPTY_NUMBERS);
  const [workflow, setWorkflow] = useState<MaintenanceWorkflow | "">("");
  const [notes, setNotes] = useState("");

  const [lead, setLead] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    phone: "",
    vehicleTypes: "",
    website: "", // honeypot
  });
  const [leadError, setLeadError] = useState<string | null>(null);
  const [report, setReport] = useState<DowntimeEstimate | null>(null);

  const startTrackedRef = useRef(false);
  const completedTrackedRef = useRef(false);

  const ctx = useMemo(() => trackingContext(sourcePagePath), [sourcePagePath]);

  // Live client-side preview (the server recalculates authoritatively on submit).
  const inputsReady =
    workflow !== "" &&
    [
      "affectedVehiclesPerMonth",
      "averageDowntimeDays",
      "revenuePerVehiclePerDay",
      "driverLabourCostPerDay",
    ].every(key => numbers[key as NumberFieldKey].trim() !== "");

  const previewEstimate = useMemo<DowntimeEstimate | null>(() => {
    // `inputsReady` already requires a selected workflow, which narrows the type.
    if (!inputsReady) return null;
    return computeDowntimeEstimate({
      fleetSize: toNumber(numbers.fleetSize),
      affectedVehiclesPerMonth: toNumber(numbers.affectedVehiclesPerMonth),
      averageDowntimeDays: toNumber(numbers.averageDowntimeDays),
      revenuePerVehiclePerDay: toNumber(numbers.revenuePerVehiclePerDay),
      driverLabourCostPerDay: toNumber(numbers.driverLabourCostPerDay),
      repairDecisionDelayDays: toNumber(numbers.repairDecisionDelayDays),
      repeatRepairEventsPerMonth: toNumber(numbers.repeatRepairEventsPerMonth),
      currentMaintenanceWorkflow: workflow,
    });
  }, [inputsReady, numbers, workflow]);

  useEffect(() => {
    if (previewEstimate && !completedTrackedRef.current) {
      completedTrackedRef.current = true;
      trackEvent("downtime_calculator_completed", {
        source_page: ctx.pagePath,
      });
    }
  }, [previewEstimate, ctx.pagePath]);

  const markStarted = () => {
    if (!startTrackedRef.current) {
      startTrackedRef.current = true;
      trackEvent("downtime_calculator_started", { source_page: ctx.pagePath });
    }
  };

  const handleNumberChange = (key: NumberFieldKey, value: string) => {
    markStarted();
    setNumbers(current => ({ ...current, [key]: value }));
  };

  const handleStartLead = () => {
    if (!previewEstimate) return;
    // Pre-fill lead details we can infer from the calculator inputs.
    setLead(current => ({
      ...current,
      vehicleTypes: current.vehicleTypes,
    }));
    setPhase("lead");
  };

  const fleetSizeNumber = Math.max(
    1,
    Math.round(toNumber(numbers.fleetSize)) || 1
  );

  const handleLeadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLeadError(null);
    if (workflow === "") return;

    if (
      !lead.name.trim() ||
      !lead.email.trim() ||
      !lead.company.trim() ||
      !lead.role.trim()
    ) {
      setLeadError("Please complete your name, email, company, and role.");
      return;
    }

    try {
      const result = await submitMutation.mutateAsync({
        name: lead.name,
        email: lead.email,
        company: lead.company,
        role: lead.role,
        fleetSize: fleetSizeNumber,
        phone: lead.phone || null,
        vehicleTypes: lead.vehicleTypes || null,
        currentMaintenanceWorkflow: workflow,
        biggestDowntimeIssue: notes || null,
        affectedVehiclesPerMonth: Math.round(
          toNumber(numbers.affectedVehiclesPerMonth)
        ),
        averageDowntimeDays: toNumber(numbers.averageDowntimeDays),
        revenuePerVehiclePerDay: toNumber(numbers.revenuePerVehiclePerDay),
        driverLabourCostPerDay: toNumber(numbers.driverLabourCostPerDay),
        repairDecisionDelayDays: toNumber(numbers.repairDecisionDelayDays),
        repeatRepairEventsPerMonth: Math.round(
          toNumber(numbers.repeatRepairEventsPerMonth)
        ),
        calculatorWorkflow: workflow,
        pagePath: ctx.pagePath,
        userAgent: ctx.userAgent || null,
        trapField: lead.website || null,
      });

      setReport(result.estimate);
      setPhase("report");
      trackEvent("downtime_calculator_lead_submitted", {
        source_page: ctx.pagePath,
        workflow_risk_band: result.estimate.workflowRiskBand,
        fleet_size: fleetSizeNumber,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      setLeadError(
        rawMessage.includes("email")
          ? "Please enter a valid email address."
          : "We could not submit your request. Please try again or contact info@truckfixr.com."
      );
    }
  };

  const handleCtaClick = (kind: "workflow_review" | "pilot") => {
    trackEvent(
      kind === "workflow_review"
        ? "downtime_calculator_workflow_review_clicked"
        : "downtime_calculator_pilot_clicked",
      { source_page: ctx.pagePath }
    );
  };

  return (
    <div className="space-y-6 text-[#0B1C30]">
      {/* ---- Calculator inputs ---- */}
      {phase === "calc" ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {NUMBER_FIELDS.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label
                  htmlFor={`dt-${field.key}`}
                  className="text-sm text-[#00263F]"
                >
                  {field.label}
                </Label>
                <div className="relative">
                  {field.prefix ? (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B7280]">
                      {field.prefix}
                    </span>
                  ) : null}
                  <Input
                    id={`dt-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={field.min}
                    step={field.step ?? 1}
                    value={numbers[field.key]}
                    onChange={event =>
                      handleNumberChange(field.key, event.target.value)
                    }
                    placeholder={field.placeholder}
                    className={`border-[#BFD0E7] bg-[#F8FAFD] ${field.prefix ? "pl-7" : ""}`}
                  />
                </div>
                <p className="text-xs text-[#6B7280]">{field.helper}</p>
              </div>
            ))}

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dt-workflow" className="text-sm text-[#00263F]">
                Current maintenance workflow
              </Label>
              <select
                id="dt-workflow"
                value={workflow}
                onChange={event => {
                  markStarted();
                  setWorkflow(event.target.value as MaintenanceWorkflow | "");
                }}
                className="h-11 w-full rounded-lg border border-[#BFD0E7] bg-[#F8FAFD] px-3 text-sm text-[#0B1C30]"
              >
                <option value="">
                  Select how maintenance is tracked today
                </option>
                {MAINTENANCE_WORKFLOWS.map(value => (
                  <option key={value} value={value}>
                    {MAINTENANCE_WORKFLOW_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[#6B7280]">
                How issues, inspections, and repairs are tracked between people
                today.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dt-notes" className="text-sm text-[#00263F]">
                Biggest downtime issue{" "}
                <span className="text-[#6B7280]">(optional)</span>
              </Label>
              <Textarea
                id="dt-notes"
                value={notes}
                onChange={event => {
                  markStarted();
                  setNotes(event.target.value);
                }}
                placeholder="What is creating the most downtime or repeat repair pain right now?"
                className="min-h-20 border-[#BFD0E7] bg-[#F8FAFD]"
                maxLength={2000}
              />
            </div>
          </div>

          {/* ---- Live basic result ---- */}
          {previewEstimate ? (
            <div className="rounded-2xl border border-[#D8E2F0] bg-[#F6F8FC] p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A04100]">
                Estimated monthly downtime exposure
              </p>
              <p className="mt-2 font-['Manrope'] text-3xl font-black text-[#00263F]">
                {formatCad(previewEstimate.estimatedMonthlyDowntimeExposure)}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#42474E]">
                This is not an accounting figure; it is a decision-risk estimate
                based on downtime days, affected vehicles, labour cost, repeat
                repair events, and repair decision delays.
              </p>
              <div className="mt-4 rounded-xl border border-[#E6D2B8] bg-[#FBF4E9] p-4">
                <p className="font-['Manrope'] text-sm font-bold text-[#7A4A12]">
                  Want the full downtime report and workflow recommendations?
                </p>
                <Button
                  type="button"
                  onClick={handleStartLead}
                  className="mt-3 rounded-full bg-[#E32636] px-6 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]"
                >
                  Get the full downtime report
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[#BFD0E7] bg-[#F8FAFD] p-4 text-sm text-[#6B7280]">
              Enter affected vehicles, downtime days, revenue, labour cost, and
              your maintenance workflow to see an instant estimate.
            </p>
          )}

          <p className="text-xs leading-5 text-[#6B7280]">{DISCLAIMER}</p>
        </div>
      ) : null}

      {/* ---- Lead capture ---- */}
      {phase === "lead" && previewEstimate ? (
        <div className="space-y-5">
          <div>
            <h3 className="font-['Manrope'] text-xl font-black text-[#00263F]">
              Get the full downtime report
            </h3>
            <p className="mt-1 text-sm leading-6 text-[#42474E]">
              See the estimate, risk score, and recommended next steps for
              improving maintenance visibility.
            </p>
          </div>

          <form onSubmit={handleLeadSubmit} className="space-y-4">
            <input
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              className="absolute left-[-9999px] h-px w-px opacity-0"
              name="website"
              value={lead.website}
              onChange={event =>
                setLead(c => ({ ...c, website: event.target.value }))
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dt-name" className="text-sm text-[#00263F]">
                  Full name *
                </Label>
                <Input
                  id="dt-name"
                  value={lead.name}
                  onChange={event =>
                    setLead(c => ({ ...c, name: event.target.value }))
                  }
                  className="border-[#BFD0E7] bg-[#F8FAFD]"
                  placeholder="Jordan Smith"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dt-email" className="text-sm text-[#00263F]">
                  Email *
                </Label>
                <Input
                  id="dt-email"
                  type="email"
                  value={lead.email}
                  onChange={event =>
                    setLead(c => ({ ...c, email: event.target.value }))
                  }
                  className="border-[#BFD0E7] bg-[#F8FAFD]"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dt-company" className="text-sm text-[#00263F]">
                  Company *
                </Label>
                <Input
                  id="dt-company"
                  value={lead.company}
                  onChange={event =>
                    setLead(c => ({ ...c, company: event.target.value }))
                  }
                  className="border-[#BFD0E7] bg-[#F8FAFD]"
                  placeholder="Brampton Transit Inc."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dt-role" className="text-sm text-[#00263F]">
                  Role *
                </Label>
                <select
                  id="dt-role"
                  value={lead.role}
                  onChange={event =>
                    setLead(c => ({ ...c, role: event.target.value }))
                  }
                  className="h-11 w-full rounded-lg border border-[#BFD0E7] bg-[#F8FAFD] px-3 text-sm text-[#0B1C30]"
                  required
                >
                  <option value="">Select your role</option>
                  {ROLE_OPTIONS.map(role => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label
                  htmlFor="dt-fleetSize2"
                  className="text-sm text-[#00263F]"
                >
                  Fleet size *
                </Label>
                <Input
                  id="dt-fleetSize2"
                  type="number"
                  min={1}
                  value={numbers.fleetSize}
                  onChange={event =>
                    handleNumberChange("fleetSize", event.target.value)
                  }
                  className="border-[#BFD0E7] bg-[#F8FAFD]"
                  placeholder="50"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dt-phone" className="text-sm text-[#00263F]">
                  Phone <span className="text-[#6B7280]">(optional)</span>
                </Label>
                <Input
                  id="dt-phone"
                  value={lead.phone}
                  onChange={event =>
                    setLead(c => ({ ...c, phone: event.target.value }))
                  }
                  className="border-[#BFD0E7] bg-[#F8FAFD]"
                  placeholder="416-555-0123"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="dt-vehicleTypes"
                className="text-sm text-[#00263F]"
              >
                Vehicle types <span className="text-[#6B7280]">(optional)</span>
              </Label>
              <Input
                id="dt-vehicleTypes"
                value={lead.vehicleTypes}
                onChange={event =>
                  setLead(c => ({ ...c, vehicleTypes: event.target.value }))
                }
                className="border-[#BFD0E7] bg-[#F8FAFD]"
                placeholder="Tractors, straight trucks, trailers"
              />
            </div>

            {leadError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                {leadError}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPhase("calc")}
                className="rounded-full border-[#00263F] bg-white px-6 font-['Manrope'] font-bold text-[#00263F] hover:bg-[#F4F7FD]"
              >
                Back to calculator
              </Button>
              <Button
                type="submit"
                disabled={submitMutation.isPending}
                className="flex-1 rounded-full bg-[#E32636] px-6 py-6 font-['Manrope'] text-base font-bold text-white hover:bg-[#BC1E2C]"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building your report...
                  </>
                ) : (
                  <>
                    Show my downtime report
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs leading-5 text-[#6B7280]">{DISCLAIMER}</p>
          </form>
        </div>
      ) : null}

      {/* ---- Full report ---- */}
      {phase === "report" && report ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-['Manrope'] text-xl font-black text-[#00263F]">
              Your downtime report
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${RISK_BAND_STYLES[report.workflowRiskBand]}`}
            >
              <Gauge className="h-3.5 w-3.5" />
              {report.workflowRiskScore}/100 · {report.workflowRiskBandLabel}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#D8E2F0] bg-[#00263F] p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FFB693]">
                Estimated monthly exposure
              </p>
              <p className="mt-2 font-['Manrope'] text-3xl font-black">
                {formatCad(report.estimatedMonthlyDowntimeExposure)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#D8E2F0] bg-[#0B3C5D] p-5 text-white">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FFB693]">
                Estimated annual exposure
              </p>
              <p className="mt-2 font-['Manrope'] text-3xl font-black">
                {formatCad(report.estimatedAnnualDowntimeExposure)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#D8E2F0] bg-[#F6F8FC] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A04100]">
              Where the estimate comes from
            </p>
            <dl className="mt-3 space-y-2 text-sm text-[#42474E]">
              {[
                [
                  "Downtime cost per vehicle per day",
                  report.downtimeCostPerVehiclePerDay,
                ],
                [
                  "Direct downtime cost / month",
                  report.monthlyDirectDowntimeCost,
                ],
                [
                  "Repair decision delay cost / month",
                  report.decisionDelayCost,
                ],
                [
                  "Repeat repair risk cost / month",
                  report.repeatRepairRiskCost,
                ],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="flex items-center justify-between gap-4"
                >
                  <dt>{label}</dt>
                  <dd className="font-bold text-[#00263F]">
                    {formatCad(value as number)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-[#D8E2F0] bg-white p-5">
            <p className="text-sm leading-7 text-[#42474E]">
              Your result suggests that downtime may not only be a repair
              problem. It may also be a workflow visibility problem. TruckFixr
              helps connect inspections, driver-reported issues, AI triage,
              repair decisions, and repair history so fleet managers can act
              faster and build better maintenance visibility over time.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                "Inspect",
                "Report",
                "AI Triage",
                "Decide",
                "Repair",
                "Learn",
              ].map(stepLabel => (
                <div
                  key={stepLabel}
                  className="flex items-center gap-2 rounded-lg border border-[#E1E9F4] bg-[#F8FAFD] px-3 py-2 text-sm font-semibold text-[#00263F]"
                >
                  <Check className="h-4 w-4 text-[#E32636]" />
                  {stepLabel}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E6D2B8] bg-[#FBF4E9] p-5">
            <p className="font-['Manrope'] text-base font-bold text-[#7A4A12]">
              Want to see where your downtime risk is coming from?
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                onClick={() => handleCtaClick("workflow_review")}
                className="rounded-full bg-[#E32636] px-6 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]"
              >
                <a href="/#book-demo">Book a Fleet Workflow Review</a>
              </Button>
              <Button
                asChild
                variant="outline"
                onClick={() => handleCtaClick("pilot")}
                className="rounded-full border-2 border-[#00263F] bg-white px-6 font-['Manrope'] font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
              >
                <a href="/access">Apply for Pilot</a>
              </Button>
            </div>
          </div>

          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-[#6B7280] underline-offset-2 hover:text-[#00263F] hover:underline"
            >
              Close
            </button>
          ) : null}

          <p className="text-xs leading-5 text-[#6B7280]">{DISCLAIMER}</p>
        </div>
      ) : null}
    </div>
  );
}
