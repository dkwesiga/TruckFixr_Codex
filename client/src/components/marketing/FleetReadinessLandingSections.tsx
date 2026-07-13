import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  MessageSquareText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";
import {
  closeoutOutcomes,
  evidenceOptions,
  fitQuestions,
  optionalPilotAddOns,
  painPoints,
  pilotIncludes,
  priorityActions,
  proofCards,
  readinessColumns,
  recommendedPilotSetup,
  snapshotInsights,
  supporters,
  workflowSteps,
  type FitQuestion,
} from "@/content/fleetReadinessLanding";

export type FitAnswerValue = string | string[];
export type FitAnswerMap = Record<FitQuestion["id"], FitAnswerValue>;

function answerText(value: FitAnswerValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

const sectionShell = "mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8";
const cardClass = "rounded-lg border border-[#d4deec] bg-white shadow-[0_18px_45px_-34px_rgba(0,38,63,0.5)]";

export function getDefaultFitAnswers(): FitAnswerMap {
  return fitQuestions.reduce((answers, question) => {
    answers[question.id] = question.defaultAnswer;
    return answers;
  }, {} as FitAnswerMap);
}

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SectionHeader({
  title,
  description,
  center = false,
}: {
  title: string;
  description?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <h2 className="font-['Manrope'] text-3xl font-extrabold tracking-normal text-[#00263F] sm:text-4xl">
        {title}
      </h2>
      {description ? <p className="mt-4 text-base leading-8 text-[#42474E]">{description}</p> : null}
    </div>
  );
}

function CtaButton({
  children,
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 rounded-lg px-5 font-['Manrope'] text-sm font-extrabold tracking-normal sm:px-6",
        variant === "primary"
          ? "bg-[#E32636] text-white shadow-[0_18px_36px_-24px_rgba(227,38,54,0.9)] hover:bg-[#BC1E2C]"
          : "border border-[#b9c6d8] bg-white text-[#00263F] hover:bg-[#edf3fb]",
      )}
      variant={variant === "primary" ? "default" : "outline"}
    >
      {children}
    </Button>
  );
}

export function FleetReadinessBoard() {
  const toneClasses = {
    ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
    monitor: "border-sky-200 bg-sky-50 text-sky-800",
    service: "border-amber-200 bg-amber-50 text-amber-800",
    stop: "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <div className={cn(cardClass, "overflow-hidden p-4 sm:p-5")}>
      <div className="flex flex-col gap-3 border-b border-[#e0e7f1] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#00263F]">Fleet Readiness Board</p>
          <p className="mt-1 text-xs text-[#5a6575]">Today before dispatch</p>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-[#edf3fb] px-3 py-2 text-xs font-bold text-[#00263F]">
          <Gauge className="h-4 w-4 text-[#E32636]" />
          8 units reviewed
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {readinessColumns.map((column) => (
          <div key={column.title} className="rounded-lg border border-[#dbe3ee] bg-[#f8fbff] p-3">
            <div className={cn("rounded-md border px-3 py-2 text-sm font-extrabold", toneClasses[column.tone])}>
              {column.title}
            </div>
            <div className="mt-3 space-y-2">
              {column.units.map((item) => (
                <div key={`${column.title}-${item.unit}`} className="rounded-md border border-[#e0e7f1] bg-white p-3">
                  <p className="text-sm font-extrabold text-[#00263F]">{item.unit}</p>
                  {item.issue ? <p className="mt-1 text-xs leading-5 text-[#5a6575]">{item.issue}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-[#dbe3ee] bg-[#00263F] p-4 text-white">
        <p className="text-sm font-extrabold">Today's Priority Actions</p>
        <div className="mt-3 space-y-2">
          {priorityActions.map((item, index) => (
            <div key={item.unit} className="grid gap-2 rounded-md bg-white/[0.08] p-3 text-sm sm:grid-cols-[1.2fr_1.4fr_1fr]">
              <span className="font-extrabold text-white">{index + 1}. {item.unit}</span>
              <span className="text-blue-100">{item.issue}</span>
              <span className="font-bold text-white">{item.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeroSection({ onFitCheck, onPilot }: { onFitCheck: () => void; onPilot: () => void }) {
  return (
    <section className="bg-[#f6f9fd] pt-5">
      <div className={sectionShell}>
        <header className="flex items-center justify-between gap-4 border-b border-[#dbe3ee] py-4">
          <AppLogo href="/" imageClassName="h-9 sm:h-10" />
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#42474E] md:flex">
            <a href="#how-it-works" className="hover:text-[#00263F]">How it works</a>
            <a href="#fit-check" className="hover:text-[#00263F]">Fit check</a>
            <a href="#pilot" className="hover:text-[#00263F]">Pilot</a>
            <a href="/access" className="hover:text-[#00263F]">Sign in</a>
          </nav>
          <Button
            asChild
            variant="outline"
            className="h-10 rounded-lg border-[#b9c6d8] bg-white font-['Manrope'] font-extrabold text-[#00263F] hover:bg-[#edf3fb]"
          >
            <a href="/access/pilot-code">Pilot code</a>
          </Button>
        </header>

        <div className="grid items-center gap-10 py-14 lg:grid-cols-[0.88fr_1.12fr] lg:py-20">
          <div>
            <h1 className="max-w-3xl font-['Manrope'] text-4xl font-extrabold leading-[1.04] tracking-normal text-[#00263F] sm:text-5xl lg:text-6xl">
              Know what's ready, risky, or needs repair before dispatch.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#42474E]">
              TruckFixr Fleet AI helps small and mid-sized fleets turn driver reports, warning lights,
              inspections, and repair history into clear readiness actions: Ready, Monitor, Service Soon, or Stop.
            </p>
            <p className="mt-4 font-['Manrope'] text-base font-extrabold tracking-normal text-[#00263F]">
              Do not let small warning signs become dispatch delays.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton onClick={onFitCheck}>
                Check Your Fleet Readiness Fit
                <ArrowRight className="h-4 w-4" />
              </CtaButton>
              <CtaButton onClick={onPilot} variant="secondary">
                Start a 30-Day Pilot
              </CtaButton>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#697586]">Supported by</span>
              {supporters.map((supporter) => (
                <a key={supporter.name} href={supporter.href} target="_blank" rel="noreferrer" aria-label={supporter.name}>
                  <span className={supporter.logoWrapperClassName}>
                    <img src={supporter.logoSrc} alt={supporter.logoAlt} className={supporter.logoClassName} />
                  </span>
                </a>
              ))}
            </div>
          </div>
          <FleetReadinessBoard />
        </div>
      </div>
    </section>
  );
}

export function ProblemSection() {
  return (
    <section id="problem" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <SectionHeader
            title="Small issues become expensive when they are missed before dispatch."
            description="Fleet teams often deal with warning lights, driver calls, paper inspections, missed service items, scattered repair history, and pressure to decide quickly before trucks leave. TruckFixr helps turn those signals into a clear readiness decision."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {painPoints.map((point) => (
              <div key={point} className="flex items-start gap-3 rounded-lg border border-[#dbe3ee] bg-[#f8fbff] p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#E32636]" />
                <p className="text-sm font-semibold leading-6 text-[#00263F]">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const icons = [MessageSquareText, SlidersHorizontal, Gauge, ClipboardCheck, Sparkles];

  return (
    <section id="how-it-works" className="bg-[#00263F] py-16 text-white sm:py-20">
      <div className={sectionShell}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-['Manrope'] text-3xl font-extrabold tracking-normal text-white sm:text-4xl">How TruckFixr Works</h2>
        </div>
        <div className="mx-auto mt-5 max-w-3xl rounded-lg border border-white/15 bg-white/[0.08] p-4 text-center font-['Manrope'] text-lg font-extrabold tracking-normal">
          Report → Clarify → Decide → Closeout → Learn
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-5">
          {workflowSteps.map((step, index) => {
            const Icon = icons[index];
            return (
              <div key={step.title} className="rounded-lg border border-white/15 bg-white/[0.08] p-5">
                <Icon className="h-7 w-7 text-[#ffb4bc]" />
                <p className="mt-5 font-['Manrope'] text-sm font-extrabold tracking-normal text-white">
                  {index + 1}. {step.title}
                </p>
                <p className="mt-3 text-sm leading-6 text-blue-100/85">{step.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FitCheck({
  answers,
  setAnswers,
  completed,
  onComplete,
  onBuildPilot,
}: {
  answers: FitAnswerMap;
  setAnswers: Dispatch<SetStateAction<FitAnswerMap>>;
  completed: boolean;
  onComplete: () => void;
  onBuildPilot: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = fitQuestions[step];
  const isLast = step === fitQuestions.length - 1;
  const progress = Math.round(((step + 1) / fitQuestions.length) * 100);
  const progressLabel = isLast ? "Question 5 of 5 - Almost done" : `Question ${step + 1} of 5 - ${progress}% complete`;

  const isMultiSelect = current.id === "challenge" || current.id === "reporting";
  const selectedValues = Array.isArray(answers[current.id]) ? answers[current.id] : [answers[current.id]];

  const chooseAnswer = (value: string) => {
    setAnswers((currentAnswers) => {
      if (!isMultiSelect) return { ...currentAnswers, [current.id]: value };
      const rawValue = currentAnswers[current.id];
      const currentValues = Array.isArray(rawValue) ? rawValue : [rawValue];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      return { ...currentAnswers, [current.id]: nextValues.length > 0 ? nextValues : [value] };
    });
  };

  const goNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((currentStep) => currentStep + 1);
  };

  return (
    <section id="fit-check" className="scroll-mt-20 bg-[#f6f9fd] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <SectionHeader
              title="Check Your Fleet Readiness Fit"
              description="Five quick questions to surface your biggest readiness gaps and shape a focused pilot."
            />
            <div className="mt-6 rounded-lg border border-[#dbe3ee] bg-white p-5">
              <p className="text-sm font-extrabold text-[#00263F]">Smart defaults already selected</p>
              <p className="mt-2 text-sm leading-6 text-[#5a6575]">
                Change only what is different. The goal is a quick readiness snapshot, not a long form.
              </p>
            </div>
          </div>

          <div className={cn(cardClass, "p-5 sm:p-6")}>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-extrabold text-[#00263F]">{progressLabel}</p>
              <p className="text-sm font-bold text-[#697586]">{progress}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e1e9f4]">
              <div className="h-full rounded-full bg-[#E32636]" style={{ width: `${progress}%` }} />
            </div>

            <h3 className="mt-7 font-['Manrope'] text-2xl font-extrabold tracking-normal text-[#00263F]">
              {current.question}
            </h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {current.options.map((option) => {
                const selected = selectedValues.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseAnswer(option)}
                    className={cn(
                      "min-h-14 rounded-lg border px-4 py-3 text-left text-sm font-bold leading-5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00263F]",
                      selected
                        ? "border-[#E32636] bg-[#fff1f2] text-[#00263F]"
                        : "border-[#dbe3ee] bg-white text-[#42474E] hover:border-[#9fb0c6]",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
                disabled={step === 0}
                className="h-11 rounded-lg border-[#b9c6d8] bg-white font-bold text-[#00263F]"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={goNext}
                className="h-11 rounded-lg bg-[#00263F] px-5 font-['Manrope'] font-extrabold text-white hover:bg-[#0B3C5D]"
              >
                {isLast ? "Show My Snapshot" : "Next Question"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {completed ? <ReadinessSnapshot answers={answers} onBuildPilot={onBuildPilot} /> : null}
      </div>
    </section>
  );
}

export function ReadinessSnapshot({ answers, onBuildPilot }: { answers: FitAnswerMap; onBuildPilot: () => void }) {
  return (
    <div id="snapshot" className="mt-8 scroll-mt-20 rounded-lg border border-[#c9d7e8] bg-white p-5 shadow-[0_22px_55px_-38px_rgba(0,38,63,0.55)] sm:p-6">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h3 className="font-['Manrope'] text-2xl font-extrabold tracking-normal text-[#00263F]">
            Your Fleet Readiness Snapshot
          </h3>
          <p className="mt-3 text-sm leading-7 text-[#42474E]">
            Based on your answers, TruckFixr may help your fleet improve:
          </p>
          <div className="mt-5 rounded-lg bg-[#f6f9fd] p-4 text-sm text-[#42474E]">
            <p><strong className="text-[#00263F]">Fleet:</strong> {answers.fleetSize}</p>
            <p className="mt-2"><strong className="text-[#00263F]">Current challenge:</strong> {answerText(answers.challenge)}</p>
            <p className="mt-2"><strong className="text-[#00263F]">Reporting today:</strong> {answerText(answers.reporting)}</p>
          </div>
        </div>
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshotInsights.map((insight) => (
              <div key={insight} className="rounded-lg border border-[#dbe3ee] bg-[#f8fbff] p-4">
                <Check className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 text-sm font-extrabold text-[#00263F]">{insight}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-[#f2c2c8] bg-[#fff5f6] p-4">
            <p className="text-sm font-extrabold text-[#00263F]">
              Recommended next step: a focused 30-day pilot with 5-10 vehicles.
            </p>
            <Button
              type="button"
              onClick={onBuildPilot}
              className="mt-4 h-11 rounded-lg bg-[#E32636] px-5 font-['Manrope'] font-extrabold text-white hover:bg-[#BC1E2C]"
            >
              Build Your Pilot
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BuildPilot({
  selectedAddOns,
  setSelectedAddOns,
  onPilot,
}: {
  selectedAddOns: string[];
  setSelectedAddOns: Dispatch<SetStateAction<string[]>>;
  onPilot: () => void;
}) {
  const toggleAddOn = (addon: string) => {
    setSelectedAddOns((current) =>
      current.includes(addon) ? current.filter((item) => item !== addon) : [...current, addon],
    );
  };

  return (
    <section id="build-pilot" className="scroll-mt-20 bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr]">
          <SectionHeader
            title="Build your 30-day pilot."
            description="Start focused: 5-10 vehicles, 30 days, and the workflow your team already uses."
          />
          <div className={cn(cardClass, "p-5 sm:p-6")}>
            <p className="font-['Manrope'] text-lg font-extrabold tracking-normal text-[#00263F]">Recommended setup</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {recommendedPilotSetup.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <Check className="h-4 w-4 text-emerald-700" />
                  <span className="text-sm font-bold text-[#00263F]">{item}</span>
                </div>
              ))}
            </div>

            <p className="mt-6 font-['Manrope'] text-lg font-extrabold tracking-normal text-[#00263F]">Optional add-ons</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {optionalPilotAddOns.map((addon) => {
                const selected = selectedAddOns.includes(addon);
                return (
                  <button
                    key={addon}
                    type="button"
                    onClick={() => toggleAddOn(addon)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-14 items-center gap-3 rounded-lg border p-3 text-left text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00263F]",
                      selected
                        ? "border-[#E32636] bg-[#fff1f2] text-[#00263F]"
                        : "border-[#dbe3ee] bg-[#f8fbff] text-[#42474E] hover:border-[#9fb0c6]",
                    )}
                  >
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded border", selected ? "border-[#E32636] bg-[#E32636] text-white" : "border-[#9fb0c6] bg-white")}>
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    {addon}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              onClick={onPilot}
              className="mt-6 h-12 w-full rounded-lg bg-[#00263F] font-['Manrope'] font-extrabold text-white hover:bg-[#0B3C5D] sm:w-auto sm:px-6"
            >
              Review Pilot Offer
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function PilotOffer({
  fitAnswers,
  selectedAddOns,
}: {
  fitAnswers: FitAnswerMap;
  selectedAddOns: string[];
}) {
  return (
    <section id="pilot" className="scroll-mt-20 bg-[#f6f9fd] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <SectionHeader
              title="Prove readiness value in 30 days."
              description="Pilot TruckFixr with 5-10 vehicles before expanding across the operation."
            />
            <div className="mt-6 rounded-lg border border-[#dbe3ee] bg-white p-5">
              <p className="text-sm leading-7 text-[#42474E]">
                In 30 days, your team can see which issues affect dispatch, how quickly they are triaged, and what outcomes are being closed out — before committing to a full rollout.
              </p>
              <p className="mt-4 text-sm font-bold leading-7 text-[#00263F]">
                After the pilot, scale the workflow that proved useful for your fleet.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {pilotIncludes.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-lg bg-white p-4">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#E32636]" />
                  <p className="text-sm font-semibold leading-6 text-[#00263F]">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <PilotLeadForm fitAnswers={fitAnswers} selectedAddOns={selectedAddOns} />
        </div>
      </div>
    </section>
  );
}

function PilotLeadForm({
  fitAnswers,
  selectedAddOns,
}: {
  fitAnswers: FitAnswerMap;
  selectedAddOns: string[];
}) {
  const leadMutation = trpc.leads.submitDemoRequest.useMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const startTrackedRef = useRef(false);
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    phone: "",
    fleetSize: answerText(fitAnswers.fleetSize),
    location: "",
    biggestMaintenanceChallenge: answerText(fitAnswers.challenge),
    website: "",
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      fleetSize: answerText(fitAnswers.fleetSize),
      biggestMaintenanceChallenge: answerText(fitAnswers.challenge),
    }));
  }, [fitAnswers.challenge, fitAnswers.fleetSize]);

  const trackingContext = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        sourcePage: "/",
        referrer: "",
        utmSource: "",
        utmMedium: "",
        utmCampaign: "",
        utmContent: "",
        utmTerm: "",
      };
    }

    const url = new URL(window.location.href);
    return {
      sourcePage: `${url.pathname}${url.search}` || "/",
      referrer: document.referrer || "",
      utmSource: url.searchParams.get("utm_source") || "",
      utmMedium: url.searchParams.get("utm_medium") || "",
      utmCampaign: url.searchParams.get("utm_campaign") || "",
      utmContent: url.searchParams.get("utm_content") || "",
      utmTerm: url.searchParams.get("utm_term") || "",
    };
  }, []);

  const markStarted = () => {
    if (startTrackedRef.current) return;
    startTrackedRef.current = true;
    setHasStarted(true);
    trackEvent("pilot_form_started", { source_page: trackingContext.sourcePage });
  };

  const handleChange = (field: keyof typeof form, value: string) => {
    markStarted();
    setSuccessMessage(null);
    setErrorMessage(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    markStarted();

    if (form.biggestMaintenanceChallenge.trim().length < 10) {
      setSuccessMessage(null);
      setErrorMessage("Please describe your maintenance challenge in at least 10 characters.");
      return;
    }

    const challengeWithContext = [
      form.biggestMaintenanceChallenge.trim(),
      `Fit check: fleet=${fitAnswers.fleetSize}; challenge=${fitAnswers.challenge}; reporting=${fitAnswers.reporting}; maintenance=${fitAnswers.maintenance}; pilotInterest=${fitAnswers.pilotInterest}`,
      `Selected pilot add-ons: ${selectedAddOns.length > 0 ? selectedAddOns.join(", ") : "None selected"}`,
    ].join("\n\n");

    try {
      // TODO: Store fit-check answers, pilot add-ons, CRM routing, email notifications,
      // calendar booking, and CTA analytics as first-class backend fields.
      const result = await leadMutation.mutateAsync({
        fullName: form.fullName,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone || null,
        fleetSize: form.fleetSize,
        vehicleTypes: null,
        location: form.location || null,
        biggestMaintenanceChallenge: challengeWithContext,
        interestType: "pilot_inquiry",
        preferredDemoTime: null,
        sourcePage: trackingContext.sourcePage,
        utmSource: trackingContext.utmSource || null,
        utmMedium: trackingContext.utmMedium || null,
        utmCampaign: trackingContext.utmCampaign || null,
        utmContent: trackingContext.utmContent || null,
        utmTerm: trackingContext.utmTerm || null,
        referrer: trackingContext.referrer || null,
        trapField: form.website,
      });

      setSuccessMessage(result.message);
      setErrorMessage(null);
      trackEvent("pilot_form_submitted", { source_page: trackingContext.sourcePage, interest_type: "pilot_inquiry" });
      setForm({
        fullName: "",
        companyName: "",
        email: "",
        phone: "",
        fleetSize: answerText(fitAnswers.fleetSize),
        location: "",
        biggestMaintenanceChallenge: answerText(fitAnswers.challenge),
        website: "",
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message = rawMessage.includes("email")
        ? "Please enter a valid email address."
        : "We could not submit your request. Please try again or contact info@truckfixr.com.";
      setSuccessMessage(null);
      setErrorMessage(message);
      trackEvent("lead_form_submission_failed", { source_page: trackingContext.sourcePage });
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn(cardClass, "p-5 sm:p-6")}>
      <input
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-px w-px opacity-0"
        name="website"
        onChange={(event) => handleChange("website", event.target.value)}
        value={form.website}
      />

      <h3 className="font-['Manrope'] text-2xl font-extrabold tracking-normal text-[#00263F]">Request pilot follow-up</h3>
      <p className="mt-2 text-sm leading-7 text-[#42474E]">
        Share where to route this and the TruckFixr team will follow up about a 30-day pilot.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilot-full-name" className="font-bold text-[#00263F]">Full name *</Label>
          <Input id="pilot-full-name" value={form.fullName} onChange={(event) => handleChange("fullName", event.target.value)} required className="border-[#BFD0E7] bg-[#F8FAFD]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pilot-company" className="font-bold text-[#00263F]">Company *</Label>
          <Input id="pilot-company" value={form.companyName} onChange={(event) => handleChange("companyName", event.target.value)} required className="border-[#BFD0E7] bg-[#F8FAFD]" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilot-email" className="font-bold text-[#00263F]">Email *</Label>
          <Input id="pilot-email" type="email" value={form.email} onChange={(event) => handleChange("email", event.target.value)} required className="border-[#BFD0E7] bg-[#F8FAFD]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pilot-phone" className="font-bold text-[#00263F]">Phone</Label>
          <Input id="pilot-phone" value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} className="border-[#BFD0E7] bg-[#F8FAFD]" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilot-fleet-size" className="font-bold text-[#00263F]">Fleet size *</Label>
          <Input id="pilot-fleet-size" value={form.fleetSize} onChange={(event) => handleChange("fleetSize", event.target.value)} required className="border-[#BFD0E7] bg-[#F8FAFD]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pilot-location" className="font-bold text-[#00263F]">Location</Label>
          <Input id="pilot-location" value={form.location} onChange={(event) => handleChange("location", event.target.value)} className="border-[#BFD0E7] bg-[#F8FAFD]" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="pilot-challenge" className="font-bold text-[#00263F]">Current maintenance challenge *</Label>
        <Textarea
          id="pilot-challenge"
          value={form.biggestMaintenanceChallenge}
          onChange={(event) => handleChange("biggestMaintenanceChallenge", event.target.value)}
          required
          minLength={10}
          className="min-h-24 border-[#BFD0E7] bg-[#F8FAFD]"
        />
      </div>

      <div className="mt-5 rounded-lg border border-[#dbe3ee] bg-[#f8fbff] p-4 text-sm leading-6 text-[#42474E]">
        {hasStarted
          ? "This request will include your fit-check answers and pilot configuration."
          : "Your fit-check answers and selected pilot add-ons will be included with this request."}
      </div>

      {successMessage ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{successMessage}</div> : null}
      {errorMessage ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</div> : null}

      <Button
        type="submit"
        disabled={leadMutation.isPending || !form.fullName || !form.companyName || !form.email || form.biggestMaintenanceChallenge.trim().length < 10}
        className="mt-5 h-12 w-full rounded-lg bg-[#E32636] font-['Manrope'] font-extrabold text-white hover:bg-[#BC1E2C]"
      >
        {leadMutation.isPending ? "Sending..." : "Start Pilot Conversation"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function ProofSection() {
  return (
    <section id="proof" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeader
          title="Built from the repair floor. Validated with early fleets."
          description="TruckFixr Fleet AI is developed from real heavy-duty truck inspection, diagnostic, and repair workflows at Mr Diesel Inc., and tested through early fleet use cases to improve dispatch readiness, maintenance triage, and repair outcome learning."
          center
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {proofCards.map((card) => (
            <div key={card.title} className="rounded-lg border border-[#dbe3ee] bg-[#f8fbff] p-5">
              <Wrench className="h-6 w-6 text-[#E32636]" />
              <h3 className="mt-4 font-['Manrope'] text-base font-extrabold tracking-normal text-[#00263F]">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#42474E]">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RepairWorkflowSection() {
  return (
    <section id="workflow-compatibility" className="bg-[#f6f9fd] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <SectionHeader
              title="Works with your existing maintenance workflow."
              description="TruckFixr does not force fleets into a specific repair shop. It helps managers capture better issue details, prioritize maintenance risk, and coordinate with the repair teams they already trust."
            />
            <div className="mt-6 rounded-lg border border-[#dbe3ee] bg-white p-5">
              <p className="text-sm leading-7 text-[#42474E]">
                TruckFixr is built from Mr Diesel repair workflows, giving the platform practical grounding in truck
                diagnostics, inspections, and repair operations.
              </p>
              <p className="mt-4 text-sm leading-7 text-[#42474E]">
                TruckFixr uses AI to support maintenance triage - not replace human judgment. It helps organize driver
                reports, warning signs, inspection history, and repair outcomes into practical recommendations fleet
                managers can act on.
              </p>
              <p className="mt-4 font-bold text-[#00263F]">
                Designed to identify issues earlier, speed up triage, and support better dispatch decisions.
              </p>
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
                TruckFixr supports maintenance decisions. It does not replace driver judgment, technician inspection,
                or fleet safety procedures.
              </p>
            </div>
          </div>
          <div className="grid gap-4">
            <div className={cn(cardClass, "p-5")}>
              <h3 className="font-['Manrope'] text-lg font-extrabold tracking-normal text-[#00263F]">Manager closeout options</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {closeoutOutcomes.map((item) => (
                  <div key={item} className="rounded-md bg-[#f8fbff] px-3 py-2 text-sm font-semibold text-[#00263F]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className={cn(cardClass, "p-5")}>
              <h3 className="font-['Manrope'] text-lg font-extrabold tracking-normal text-[#00263F]">Evidence upload options</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {evidenceOptions.map((item) => (
                  <div key={item} className="rounded-md bg-[#fff5f6] px-3 py-2 text-sm font-semibold text-[#00263F]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className={cn(cardClass, "p-5")}>
              <h3 className="font-['Manrope'] text-lg font-extrabold tracking-normal text-[#00263F]">Repair partner neutral</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {["In-house shops", "External repair shops", "Dealers", "Mobile mechanics"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm font-bold text-[#00263F]">
                    <Truck className="h-4 w-4 text-[#E32636]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FinalCTA({ onFitCheck }: { onFitCheck: () => void }) {
  return (
    <section className="bg-[#00263F] py-16 text-white sm:py-20">
      <div className={cn(sectionShell, "text-center")}>
        <h2 className="mx-auto max-w-3xl font-['Manrope'] text-3xl font-extrabold tracking-normal text-white sm:text-5xl">
          Do not let small warning signs become dispatch delays.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-blue-100">
          Check your fleet readiness fit and see whether TruckFixr's 30-Day Fleet Readiness Pilot is right for your operation.
        </p>
        <Button
          type="button"
          onClick={onFitCheck}
          className="mt-8 h-12 rounded-lg bg-white px-6 font-['Manrope'] font-extrabold text-[#00263F] hover:bg-blue-50"
        >
          Check Your Fleet Readiness Fit
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

