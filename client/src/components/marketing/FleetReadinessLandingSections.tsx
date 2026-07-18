import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from "react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Check, FileCheck2, Truck, Wrench } from "lucide-react";
import {
  closeoutOutcomes,
  evidenceOptions,
  fitQuestions,
  leadRoleOptions,
  optionalPilotAddOns,
  painPoints,
  pilotIncludes,
  priorityActions,
  proofCards,
  readinessColumns,
  recommendedPilotSetup,
  snapshotInsights,
  supporters,
  tractionStats,
  workflowSteps,
  type FitQuestion,
} from "@/content/fleetReadinessLanding";

export type FitAnswerValue = string | string[];
export type FitAnswerMap = Record<FitQuestion["id"], FitAnswerValue>;

function answerText(value: FitAnswerValue): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

const sectionShell = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";
const cardClass = "rounded-[10px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
// Barlow Condensed italic display style shared by all landing headings.
const displayClass = "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const monoClass = "font-['JetBrains_Mono']";

export function getDefaultFitAnswers(): FitAnswerMap {
  return fitQuestions.reduce((answers, question) => {
    answers[question.id] = question.defaultAnswer;
    return answers;
  }, {} as FitAnswerMap);
}

function SectionHeader({
  eyebrow,
  title,
  description,
  center = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      {eyebrow ? (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]">{eyebrow}</p>
      ) : null}
      <h2 className={cn(displayClass, "text-3xl sm:text-4xl")}>{title}</h2>
      {description ? <p className="mt-4 text-base leading-7 text-[#38465F]">{description}</p> : null}
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
        "h-12 rounded-md px-5 text-[15px] font-bold sm:px-6",
        variant === "primary"
          ? "bg-[#D81F2A] text-white shadow-[0_8px_20px_rgba(216,31,42,0.2)] hover:bg-[#A6121B]"
          : "border border-[#C3C7CE] bg-transparent text-[#0A1A2E] hover:bg-white",
      )}
      variant={variant === "primary" ? "default" : "outline"}
    >
      {children}
    </Button>
  );
}

export function LandingHeader({ onFitCheck }: { onFitCheck: () => void }) {
  return (
    <div className="sticky top-0 z-50 border-b border-[#C3C7CE] bg-white/95 backdrop-blur">
      <div className={cn(sectionShell, "flex items-center justify-between gap-4 py-3.5")}>
        <AppLogo href="/" imageClassName="h-8 sm:h-9" />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#38465F] md:flex">
          <a href="#how-it-works" className="hover:text-[#0A1A2E]">How it works</a>
          <a href="#fit-check" className="hover:text-[#0A1A2E]">Fit check</a>
          <a href="#pilot" className="hover:text-[#0A1A2E]">Pilot</a>
          <a href="/access" className="hover:text-[#0A1A2E]">Sign in</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            className="hidden h-10 rounded-md border-[#C3C7CE] bg-white text-[13px] font-bold text-[#0A1A2E] hover:bg-[#F6F8FB] sm:inline-flex"
          >
            <a href="/access/pilot-code">Pilot code</a>
          </Button>
          <Button
            type="button"
            onClick={onFitCheck}
            className="h-10 rounded-md bg-[#D81F2A] px-4 text-[13px] font-bold tracking-[0.04em] text-white hover:bg-[#A6121B]"
          >
            Check your fit
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FleetReadinessBoard() {
  const toneClasses = {
    ready: "text-[#1EA66C]",
    monitor: "text-[#2D7DE0]",
    service: "text-[#F2A516]",
    stop: "text-[#D81F2A]",
  };
  const badgeClasses = {
    ready: "bg-[#1EA66C]/10 text-[#1EA66C]",
    monitor: "bg-[#2D7DE0]/10 text-[#2D7DE0]",
    service: "bg-[#F2A516]/15 text-[#B87708]",
    stop: "bg-[#D81F2A]/10 text-[#D81F2A]",
  };
  const badgeLabels = { ready: "READY", monitor: "MONITOR", service: "SERVICE", stop: "STOP" } as const;

  return (
    <div className="overflow-hidden rounded-[10px] shadow-[0_18px_40px_rgba(10,26,46,0.14)]">
      <div className="flex items-center justify-between gap-3 bg-[#0A1A2E] px-5 py-3">
        <div>
          <p className="font-['Barlow_Condensed'] text-[15px] font-bold uppercase tracking-[0.02em] text-white">
            Fleet Readiness Board
          </p>
          <p className="text-[11px] text-[#8A98AE]">Today before dispatch · 8 units reviewed</p>
        </div>
        <span className={cn(monoClass, "rounded bg-white/10 px-2 py-1 text-[10px] text-[#abcaea]")}>LIVE</span>
      </div>

      <div className="bg-white p-5">
        <div className="flex justify-around border-b border-[#ECEFF4] pb-4">
          {readinessColumns.map((column) => (
            <div key={column.title} className="text-center">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#73777E]">{column.title}</div>
              <div className={cn("font-['Barlow_Condensed'] text-3xl font-extrabold", toneClasses[column.tone])}>
                {column.units.length}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {readinessColumns
            .filter((column) => column.tone !== "ready")
            .flatMap((column) => column.units.map((item) => ({ ...item, tone: column.tone })))
            .map((item) => (
              <div
                key={item.unit}
                className="relative flex items-center justify-between gap-3 rounded-md border border-[#ECEFF4] bg-[#F6F8FB] px-3 py-2.5"
              >
                {item.tone === "stop" ? (
                  <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-md bg-[#D81F2A]" />
                ) : null}
                <div>
                  <p className="text-[13px] font-bold text-[#0A1A2E]">{item.unit}</p>
                  {item.issue ? (
                    <p className={cn(monoClass, "mt-0.5 text-[11px] leading-4 text-[#73777E]")}>{item.issue}</p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.06em]",
                    badgeClasses[item.tone],
                  )}
                >
                  {badgeLabels[item.tone]}
                </span>
              </div>
            ))}
        </div>

        <div className="mt-4 rounded-md bg-[#0A1A2E] p-4 text-white">
          <p className="font-['Barlow_Condensed'] text-sm font-bold uppercase tracking-[0.04em]">Today's Priority Actions</p>
          <div className="mt-3 space-y-2">
            {priorityActions.map((item, index) => (
              <div key={item.unit} className="grid gap-1 rounded bg-white/[0.08] px-3 py-2.5 text-[13px] sm:grid-cols-[1fr_1.4fr_1fr] sm:gap-2">
                <span className="font-bold text-white">{index + 1}. {item.unit}</span>
                <span className="text-[#B6C0D0]">{item.issue}</span>
                <span className="font-bold text-white sm:text-right">{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroSection({ onFitCheck, onPilot }: { onFitCheck: () => void; onPilot: () => void }) {
  return (
    <section className="bg-[#F6F8FB]">
      <div className={cn(sectionShell, "grid items-center gap-10 py-12 lg:grid-cols-[0.95fr_1.05fr] lg:py-20")}>
        <div>
          <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]">
            AI-assisted dispatch readiness
          </p>
          <h1 className={cn(displayClass, "max-w-3xl text-4xl leading-[1] sm:text-5xl lg:text-6xl")}>
            Know what's ready to roll — before dispatch.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#38465F] sm:text-[17px]">
            TruckFixr turns driver reports, warning lights, inspections, and repair history into one clear
            readiness call: Ready, Monitor, Service Soon, or Stop.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <CtaButton onClick={onPilot}>Book a fleet review</CtaButton>
            <CtaButton onClick={onFitCheck} variant="secondary">
              Check your fit
              <ArrowRight className="h-4 w-4" />
            </CtaButton>
          </div>
          <div className="mt-5 flex max-w-[400px] justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#73777E]">
            <span>No credit card</span>
            <span>Live in a day</span>
          </div>
          <div className="mt-5">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A98AE]">
              Built on repair-floor experience from
            </p>
            <p className="font-['Barlow_Condensed'] text-xl font-extrabold italic tracking-[0.01em] text-[#25324A]">
              MR DIESEL INC.
            </p>
          </div>
        </div>
        <FleetReadinessBoard />
      </div>
    </section>
  );
}

export function TractionStrip() {
  return (
    <section aria-label="Pilot traction" className="border-t border-[#C3C7CE] bg-white">
      <div className={cn(sectionShell, "py-6 sm:py-7")}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {tractionStats.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse text-center sm:text-left">
              <dt className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#73777E]">{stat.label}</dt>
              <dd className="font-['Barlow_Condensed'] text-3xl font-extrabold text-[#0A1A2E]">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-[#ECEFF4] pt-5 sm:justify-start">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A98AE]">Supported by</span>
          {supporters.map((supporter) => (
            <a key={supporter.name} href={supporter.href} target="_blank" rel="noreferrer" aria-label={supporter.name}>
              <span className={supporter.logoWrapperClassName}>
                <img src={supporter.logoSrc} alt={supporter.logoAlt} className={supporter.logoClassName} />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProblemSection() {
  return (
    <section id="problem" className="border-y border-[#C3C7CE] bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <SectionHeader
            title="Small issues become expensive when they're missed before dispatch."
            description="Fleet teams deal with warning lights, driver calls, paper inspections, missed service items, and scattered repair history — under pressure to decide before trucks leave. TruckFixr turns those signals into one clear readiness decision."
          />
          <div className="grid content-start gap-3 sm:grid-cols-2">
            {painPoints.map((point) => (
              <div key={point} className="rounded-[10px] border border-[#C3C7CE] bg-white p-4 text-sm font-semibold leading-6 text-[#0A1A2E]">
                {point}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#0A1A2E] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className={cn(displayClass, "text-3xl text-white sm:text-4xl")}>How TruckFixr works</h2>
        </div>
        <p className={cn(monoClass, "mx-auto mt-5 max-w-3xl rounded-[10px] border border-[#25324A] bg-[#182336] p-4 text-center text-sm font-bold text-[#abcaea]")}>
          Report → Clarify → Decide → Closeout → Learn
        </p>
        <div className="mt-10 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {workflowSteps.map((step, index) => (
            <div key={step.title} className="rounded-[10px] border border-[#25324A] bg-[#182336] p-5">
              <p className={cn(monoClass, "text-[13px] font-bold text-[#D81F2A]")}>0{index + 1}</p>
              <p className="mt-2.5 text-sm font-bold text-white">{step.title}</p>
              <p className="mt-1.5 text-[13px] leading-5 text-[#B6C0D0]">{step.body}</p>
            </div>
          ))}
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
  const progressLabel = isLast ? "Question 5 of 5 — Almost done" : `Question ${step + 1} of 5`;

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
    <section id="fit-check" className="scroll-mt-20 bg-[#F6F8FB] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <SectionHeader
              title="Check your fleet readiness fit"
              description="Five quick questions surface your biggest readiness gaps and shape a focused pilot. Takes under two minutes."
            />
            <p className="mt-3 text-[13px] text-[#8A98AE]">
              No commitment. See your fit before you share contact details.
            </p>
            <div className="mt-6 rounded-[10px] border border-[#C3C7CE] bg-white p-5">
              <p className="text-sm font-bold text-[#0A1A2E]">Smart defaults already selected</p>
              <p className="mt-2 text-sm leading-6 text-[#73777E]">
                Change only what is different. The goal is a quick readiness snapshot, not a long form.
              </p>
            </div>
          </div>

          <div className={cn(cardClass, "p-5 sm:p-6")}>
            <div className="flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-[0.04em] text-[#8A98AE]">
              <p>{progressLabel}</p>
              <p>{progress}%</p>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Fit check progress: question ${step + 1} of ${fitQuestions.length}`}
              className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#ECEFF4]"
            >
              <div className="h-full rounded-full bg-[#D81F2A] transition-all" style={{ width: `${progress}%` }} />
            </div>

            <h3 className="mt-6 text-[17px] font-bold text-[#0A1A2E]">{current.question}</h3>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {current.options.map((option) => {
                const selected = selectedValues.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseAnswer(option)}
                    className={cn(
                      "min-h-12 rounded-md px-4 py-3 text-left text-sm leading-5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A1A2E]",
                      selected
                        ? "border-2 border-[#D81F2A] bg-[#D81F2A]/[0.05] font-bold text-[#0A1A2E]"
                        : "border border-[#C3C7CE] bg-white font-semibold text-[#38465F] hover:border-[#8A98AE]",
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
                className="h-11 rounded-md border-[#C3C7CE] bg-white font-bold text-[#0A1A2E]"
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={goNext}
                className="h-11 rounded-md bg-[#0A1A2E] px-5 font-bold text-white hover:bg-[#182336]"
              >
                {isLast ? "Show my snapshot" : "Next question"}
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
    <div id="snapshot" className={cn(cardClass, "mt-8 scroll-mt-20 p-5 sm:p-6")}>
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h3 className={cn(displayClass, "text-2xl")}>Your fleet readiness snapshot</h3>
          <p className="mt-3 text-sm leading-6 text-[#38465F]">
            Based on your answers, TruckFixr may help your fleet improve:
          </p>
          <div className="mt-5 rounded-md bg-[#F6F8FB] p-4 text-sm text-[#38465F]">
            <p><strong className="text-[#0A1A2E]">Fleet:</strong> {answers.fleetSize}</p>
            <p className="mt-2"><strong className="text-[#0A1A2E]">Current challenge:</strong> {answerText(answers.challenge)}</p>
            <p className="mt-2"><strong className="text-[#0A1A2E]">Reporting today:</strong> {answerText(answers.reporting)}</p>
          </div>
        </div>
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {snapshotInsights.map((insight) => (
              <div key={insight} className="rounded-md border border-[#ECEFF4] bg-[#F6F8FB] p-4">
                <Check className="h-5 w-5 text-[#1EA66C]" />
                <p className="mt-3 text-sm font-bold text-[#0A1A2E]">{insight}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-[#D81F2A]/25 bg-[#D81F2A]/[0.04] p-4">
            <p className="text-sm font-bold text-[#0A1A2E]">
              Recommended next step: a focused 30-day pilot with 5-10 vehicles.
            </p>
            <Button
              type="button"
              onClick={onBuildPilot}
              className="mt-4 h-11 rounded-md bg-[#D81F2A] px-5 font-bold text-white hover:bg-[#A6121B]"
            >
              Build your pilot
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
    <section id="build-pilot" className="scroll-mt-20 border-y border-[#C3C7CE] bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr]">
          <SectionHeader
            eyebrow="Pilot builder"
            title="Build your 30-day pilot."
            description="Start focused: 5-10 vehicles, 30 days, and the workflow your team already uses."
          />
          <div className={cn(cardClass, "p-5 sm:p-6")}>
            <p className={cn(displayClass, "text-xl")}>Recommended setup</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {recommendedPilotSetup.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-md border border-[#1EA66C]/25 bg-[#1EA66C]/[0.06] p-3">
                  <Check className="h-4 w-4 text-[#1EA66C]" />
                  <span className="text-sm font-bold text-[#0A1A2E]">{item}</span>
                </div>
              ))}
            </div>

            <p className={cn(displayClass, "mt-6 text-xl")}>Optional add-ons</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {optionalPilotAddOns.map((addon) => {
                const selected = selectedAddOns.includes(addon);
                return (
                  <button
                    key={addon}
                    type="button"
                    onClick={() => toggleAddOn(addon)}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-md p-3 text-left text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0A1A2E]",
                      selected
                        ? "border-2 border-[#D81F2A] bg-[#D81F2A]/[0.05] text-[#0A1A2E]"
                        : "border border-[#C3C7CE] bg-[#F6F8FB] text-[#38465F] hover:border-[#8A98AE]",
                    )}
                  >
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded border", selected ? "border-[#D81F2A] bg-[#D81F2A] text-white" : "border-[#8A98AE] bg-white")}>
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
              className="mt-6 h-12 w-full rounded-md bg-[#0A1A2E] font-bold text-white hover:bg-[#182336] sm:w-auto sm:px-6"
            >
              Review pilot offer
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
    <section id="pilot" className="scroll-mt-20 bg-[#F6F8FB] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <SectionHeader
              eyebrow="30-day pilot · 5-10 vehicles"
              title="Prove readiness value in 30 days."
              description="Pilot TruckFixr with 5-10 vehicles before expanding across the operation."
            />
            <div className="mt-6 rounded-[10px] border border-[#C3C7CE] bg-white p-5">
              <p className="text-sm leading-6 text-[#38465F]">
                In 30 days, your team can see which issues affect dispatch, how quickly they are triaged, and what outcomes are being closed out — before committing to a full rollout.
              </p>
              <p className="mt-4 text-sm font-bold leading-6 text-[#0A1A2E]">
                After the pilot, scale the workflow that proved useful for your fleet.
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {pilotIncludes.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-[10px] bg-white p-4">
                  <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#D81F2A]" />
                  <p className="text-sm font-semibold leading-5 text-[#0A1A2E]">{item}</p>
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
    role: "",
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

    // Role rides along in the free-text field so the existing lead schema
    // stays unchanged (same pattern as the fit-check context below).
    const challengeWithContext = [
      form.biggestMaintenanceChallenge.trim(),
      form.role ? `Role: ${form.role}` : null,
      `Fit check: fleet=${fitAnswers.fleetSize}; challenge=${fitAnswers.challenge}; reporting=${fitAnswers.reporting}; maintenance=${fitAnswers.maintenance}; pilotInterest=${fitAnswers.pilotInterest}`,
      `Selected pilot add-ons: ${selectedAddOns.length > 0 ? selectedAddOns.join(", ") : "None selected"}`,
    ]
      .filter(Boolean)
      .join("\n\n");

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
        role: "",
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

      <h3 className={cn(displayClass, "text-2xl")}>Book a fleet review</h3>
      <p className="mt-2 text-sm leading-6 text-[#38465F]">
        We'll contact you to understand your fleet workflow and determine whether TruckFixr is
        suitable for a pilot or product demonstration.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilot-full-name" className="font-bold text-[#0A1A2E]">Full name *</Label>
          <Input id="pilot-full-name" value={form.fullName} onChange={(event) => handleChange("fullName", event.target.value)} required autoComplete="name" className="border-[#C3C7CE] bg-[#F6F8FB]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pilot-company" className="font-bold text-[#0A1A2E]">Company *</Label>
          <Input id="pilot-company" value={form.companyName} onChange={(event) => handleChange("companyName", event.target.value)} required autoComplete="organization" className="border-[#C3C7CE] bg-[#F6F8FB]" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilot-email" className="font-bold text-[#0A1A2E]">Work email *</Label>
          <Input id="pilot-email" type="email" value={form.email} onChange={(event) => handleChange("email", event.target.value)} required autoComplete="email" inputMode="email" className="border-[#C3C7CE] bg-[#F6F8FB]" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pilot-phone" className="font-bold text-[#0A1A2E]">Phone (optional)</Label>
          <Input id="pilot-phone" type="tel" value={form.phone} onChange={(event) => handleChange("phone", event.target.value)} autoComplete="tel" inputMode="tel" className="border-[#C3C7CE] bg-[#F6F8FB]" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pilot-role" className="font-bold text-[#0A1A2E]">Your role</Label>
          <select
            id="pilot-role"
            value={form.role}
            onChange={(event) => handleChange("role", event.target.value)}
            className="h-11 w-full rounded-lg border border-[#C3C7CE] bg-[#F6F8FB] px-3 text-sm text-[#0A1A2E]"
          >
            <option value="">Select your role</option>
            {leadRoleOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pilot-fleet-size" className="font-bold text-[#0A1A2E]">Fleet size *</Label>
          <Input id="pilot-fleet-size" value={form.fleetSize} onChange={(event) => handleChange("fleetSize", event.target.value)} required className="border-[#C3C7CE] bg-[#F6F8FB]" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="pilot-location" className="font-bold text-[#0A1A2E]">Location</Label>
        <Input id="pilot-location" value={form.location} onChange={(event) => handleChange("location", event.target.value)} autoComplete="address-level2" className="border-[#C3C7CE] bg-[#F6F8FB]" />
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="pilot-challenge" className="font-bold text-[#0A1A2E]">Current maintenance challenge *</Label>
        <Textarea
          id="pilot-challenge"
          value={form.biggestMaintenanceChallenge}
          onChange={(event) => handleChange("biggestMaintenanceChallenge", event.target.value)}
          required
          minLength={10}
          className="min-h-24 border-[#C3C7CE] bg-[#F6F8FB]"
        />
      </div>

      <div className="mt-5 rounded-md border border-[#ECEFF4] bg-[#F6F8FB] p-4 text-sm leading-6 text-[#38465F]">
        {hasStarted
          ? "This request will include your fit-check answers and pilot configuration."
          : "Your fit-check answers and selected pilot add-ons will be included with this request."}
      </div>

      {successMessage ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{successMessage}</div> : null}
      {errorMessage ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</div> : null}

      <Button
        type="submit"
        disabled={leadMutation.isPending || !form.fullName || !form.companyName || !form.email || form.biggestMaintenanceChallenge.trim().length < 10}
        className="mt-5 h-12 w-full rounded-md bg-[#D81F2A] font-bold text-white shadow-[0_8px_20px_rgba(216,31,42,0.2)] hover:bg-[#A6121B]"
      >
        {leadMutation.isPending ? "Sending..." : "Book a fleet review"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function ProofSection() {
  return (
    <section id="proof" className="bg-[#ECEFF4] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeader
          title="Built from the repair floor. Validated with early fleets."
          description="TruckFixr Fleet AI is developed from real heavy-duty truck inspection, diagnostic, and repair workflows at Mr Diesel Inc., and tested through early fleet use cases to improve dispatch readiness, maintenance triage, and repair outcome learning."
          center
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {proofCards.map((card) => (
            <div key={card.title} className="rounded-[10px] border border-[#C3C7CE] bg-white p-5">
              <Wrench className="h-6 w-6 text-[#D81F2A]" />
              <h3 className="mt-4 text-[15px] font-bold text-[#0A1A2E]">{card.title}</h3>
              <p className="mt-2.5 text-[13px] leading-5 text-[#38465F]">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RepairWorkflowSection() {
  return (
    <section id="workflow-compatibility" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <SectionHeader
              title="Works with your existing maintenance workflow."
              description="TruckFixr does not force fleets into a specific repair shop. It helps managers capture better issue details, prioritize maintenance risk, and coordinate with the repair teams they already trust."
            />
            <div className="mt-6 rounded-[10px] border border-[#C3C7CE] bg-white p-5">
              <p className="text-sm leading-6 text-[#38465F]">
                TruckFixr is built from Mr Diesel repair workflows, giving the platform practical grounding in truck
                diagnostics, inspections, and repair operations.
              </p>
              <p className="mt-4 text-sm leading-6 text-[#38465F]">
                TruckFixr uses AI to support maintenance triage - not replace human judgment. It helps organize driver
                reports, warning signs, inspection history, and repair outcomes into practical recommendations fleet
                managers can act on.
              </p>
              <p className="mt-4 text-sm font-bold text-[#0A1A2E]">
                Designed to identify issues earlier, speed up triage, and support better dispatch decisions.
              </p>
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
                TruckFixr supports maintenance decisions. It does not replace driver judgment, technician inspection,
                or fleet safety procedures.
              </p>
            </div>
          </div>
          <div className="grid gap-4">
            <div className={cn(cardClass, "p-5")}>
              <h3 className={cn(displayClass, "text-xl")}>Manager closeout options</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {closeoutOutcomes.map((item) => (
                  <div key={item} className="rounded bg-[#F6F8FB] px-3 py-2 text-sm font-semibold text-[#0A1A2E]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className={cn(cardClass, "p-5")}>
              <h3 className={cn(displayClass, "text-xl")}>Evidence upload options</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {evidenceOptions.map((item) => (
                  <div key={item} className="rounded bg-[#D81F2A]/[0.05] px-3 py-2 text-sm font-semibold text-[#0A1A2E]">
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className={cn(cardClass, "p-5")}>
              <h3 className={cn(displayClass, "text-xl")}>Repair partner neutral</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {["In-house shops", "External repair shops", "Dealers", "Mobile mechanics"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm font-bold text-[#0A1A2E]">
                    <Truck className="h-4 w-4 text-[#D81F2A]" />
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

export function FinalCTA({ onFitCheck, onPilot }: { onFitCheck: () => void; onPilot: () => void }) {
  return (
    <section className="bg-[#0A1A2E] py-16 sm:py-20">
      <div className={cn(sectionShell, "text-center")}>
        <p className={cn(monoClass, "text-[13px] text-[#8A98AE]")}>30-DAY PILOT · 5-10 VEHICLES</p>
        <h2 className={cn(displayClass, "mx-auto mt-4 max-w-3xl text-3xl text-white sm:text-4xl")}>
          Prove readiness value before you commit to a full rollout.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#B6C0D0]">
          Check your fleet readiness fit and see whether TruckFixr's 30-Day Fleet Readiness Pilot is right for your operation.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            type="button"
            onClick={onPilot}
            className="h-12 rounded-md bg-[#D81F2A] px-7 text-[15px] font-bold text-white hover:bg-[#A6121B]"
          >
            Book a fleet review
          </Button>
          <Button
            type="button"
            onClick={onFitCheck}
            variant="outline"
            className="h-12 rounded-md border-white/25 bg-transparent px-6 text-[15px] font-bold text-white hover:bg-white hover:text-[#0A1A2E]"
          >
            Check your fleet readiness fit
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5A6981]">No credit card required</p>
      </div>
    </section>
  );
}
