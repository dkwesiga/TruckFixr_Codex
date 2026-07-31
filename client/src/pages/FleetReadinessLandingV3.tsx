import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Compass,
  Gauge,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  TrendingUp,
  Wrench,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { ReadinessPill, type Readiness } from "@/components/readiness/ReadinessPill";
import {
  BuildPilot,
  FitCheck,
  PilotOffer,
  ProofSection,
  TractionStrip,
  getDefaultFitAnswers,
  type FitAnswerMap,
} from "@/components/marketing/FleetReadinessLandingSections";

// V3 landing — preventive (scheduled PM) + predictive (developing risk) positioning.
// Shares V2's locked brand system (Barlow Condensed display, IBM Plex Sans body,
// JetBrains Mono, navy/red palette, ReadinessPill) — no new design system.
const sectionShell = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";
const cardClass =
  "rounded-[10px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const monoClass = "font-['JetBrains_Mono']";
const eyebrowClass = "text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

const RISK_CHECK_LABEL = "Check One Vehicle's Maintenance Risk — Free";

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function RiskCheckButton({
  location,
  className,
  children = RISK_CHECK_LABEL,
}: {
  location: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href="/try-one-case">
      <Button
        onClick={() => trackEvent("try_one_case_clicked", { cta_location: location })}
        className={cn(
          "min-h-12 h-auto whitespace-normal px-6 py-2.5 text-center text-[15px] font-bold leading-tight",
          redBtn,
          className
        )}
      >
        {children}
        <ArrowRight className="ml-2 h-4 w-4 shrink-0" />
      </Button>
    </Link>
  );
}

function FleetRiskReviewButton({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        trackEvent("fleet_risk_review_clicked", { cta_location: "landing" });
        scrollToSection("pilot");
      }}
      className={cn(
        "min-h-12 h-auto whitespace-normal px-6 py-2.5 text-center text-[15px] font-bold leading-tight",
        dark
          ? "border-white/40 text-white hover:bg-white hover:text-[#0A1A2E]"
          : "border-[#0A1A2E] text-[#0A1A2E] hover:bg-[#0A1A2E] hover:text-white",
        className
      )}
    >
      Request a Fleet-Risk Review
    </Button>
  );
}

// ── Nav ──────────────────────────────────────────────────────────────────────
function Header() {
  const navItems: Array<[string, string]> = [
    ["Fleet Health", "fleet-health"],
    ["How it works", "workflow"],
    ["Preventive Maintenance", "preventive"],
    ["Pricing", "pricing"],
  ];
  return (
    <div className="sticky top-0 z-50 border-b border-[#C3C7CE] bg-white/95 backdrop-blur">
      <div className={cn(sectionShell, "flex items-center justify-between gap-4 py-3.5")}>
        <AppLogo href="/" imageClassName="h-8 sm:h-9" />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#38465F] lg:flex">
          {navItems.map(([label, id]) => (
            <button key={id} onClick={() => scrollToSection(id)} className="hover:text-[#0A1A2E]">
              {label}
            </button>
          ))}
          <a href="/access" className="hover:text-[#0A1A2E]">Sign in</a>
        </nav>
        <RiskCheckButton location="header" className="hidden h-10 px-4 text-sm sm:inline-flex" children="Check One Vehicle" />
      </div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────
const READINESS_HEX: Record<Readiness, string> = {
  ready: "#1EA66C",
  monitor: "#2D7DE0",
  service_soon: "#F2A516",
  stop: "#D81F2A",
};

function SectionHeading({ eyebrow, title, description, dark = false, center = false }: {
  eyebrow?: string; title: string; description?: string; dark?: boolean; center?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      {eyebrow ? <p className={cn("mb-2", eyebrowClass)}>{eyebrow}</p> : null}
      <h2 className={cn(displayClass, "text-3xl sm:text-4xl", dark && "!text-white")}>{title}</h2>
      {description ? (
        <p className={cn("mt-4 text-base leading-7", dark ? "text-[#abcaea]" : "text-[#38465F]")}>{description}</p>
      ) : null}
    </div>
  );
}

// ── Block 1: Hero + product Fleet Health preview card ────────────────────────
const HERO_VEHICLES: Array<{ unit: string; readiness: Readiness; reason: string }> = [
  { unit: "Unit 214", readiness: "service_soon", reason: "Repeated aftertreatment warning · recent regen · reported power loss" },
  { unit: "Unit 402", readiness: "monitor", reason: "Intermittent derate reported by driver" },
  { unit: "Unit 118", readiness: "ready", reason: "No open concerns" },
];

function HeroFleetHealthCard() {
  const counts: Array<[Readiness, string, number]> = [
    ["ready", "Ready", 9],
    ["monitor", "Monitor", 2],
    ["service_soon", "Service Soon", 1],
    ["stop", "Stop", 0],
  ];
  return (
    <div className={cn(cardClass, "overflow-hidden")}>
      <div className="flex items-center justify-between border-b border-[#E2E6EC] bg-[#0A1A2E] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#abcaea]" aria-hidden="true" />
          <p className={cn(monoClass, "text-xs font-bold uppercase tracking-wide text-white")}>Morning Fleet Health</p>
        </div>
        <span className={cn(monoClass, "rounded-full bg-[#abcaea]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#abcaea]")}>
          Sample · 12 reviewed
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {counts.map(([r, label, n]) => (
          <div key={r} className="rounded-md bg-[#F1F4F9] p-2 text-center">
            <div className="text-xl font-black" style={{ color: READINESS_HEX[r] }}>{n}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#73777E]">{label}</div>
          </div>
        ))}
      </div>
      {/* PM-due line — the "what's due" (preventive) dimension. */}
      <div className="flex items-start gap-2 border-t border-[#EEF1F5] bg-[#FBFCFE] px-4 py-2.5">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#2D7DE0]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[#38465F]">
          <span className="font-bold text-[#0A1A2E]">PM due:</span> Unit 118 service in 400 km · Unit 402 overdue 3 days
        </p>
      </div>
      <ul className="divide-y divide-[#EEF1F5]">
        {HERO_VEHICLES.map((v) => (
          <li
            key={v.unit}
            className="flex items-center justify-between gap-3 border-l-[3px] bg-white px-4 py-2.5"
            style={{ borderLeftColor: READINESS_HEX[v.readiness] }}
          >
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#0A1A2E]">{v.unit}</div>
              <div className="truncate text-xs text-[#73777E]">{v.reason}</div>
            </div>
            <ReadinessPill readiness={v.readiness} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-[#F6F8FB]">
      <div className={cn(sectionShell, "grid items-center gap-10 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:py-20")}>
        <div>
          <p className={cn("mb-3.5", eyebrowClass)}>Preventive &amp; predictive maintenance intelligence for commercial fleets</p>
          <h1 className={cn(displayClass, "text-4xl sm:text-5xl")}>
            Know which vehicles are ready, which need attention, what&apos;s due, and what to do next.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#38465F]">
            TruckFixr combines daily inspections, driver reports, warning lights, fault information, PM schedules,
            repair history and confirmed outcomes into a live fleet-health picture — and the next maintenance or
            operating action.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <RiskCheckButton location="hero" />
            <FleetRiskReviewButton />
          </div>
          <p className="mt-4 text-sm text-[#73777E]">No credit card. No full fleet setup. Start with one vehicle.</p>
        </div>
        <HeroFleetHealthCard />
      </div>
    </section>
  );
}

// ── Block 2: The daily problem ───────────────────────────────────────────────
const PROBLEM_QUESTIONS: Array<{ when: string; q: string }> = [
  { when: "Before dispatch", q: "Which vehicles are ready today?" },
  { when: "On the road", q: "What should the driver do when a warning light appears?" },
  { when: "Before the next breakdown", q: "Which vehicles are due for service or becoming higher-risk?" },
];
const SCATTERED = ["Inspections", "Driver conversations", "Warning lights", "Fault codes", "Text messages", "Invoices", "Shop findings", "PM spreadsheets", "Memory"];

function DailyProblem() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="The daily problem"
          title="Your vehicles produce warning signs every day. The problem is connecting them—and staying ahead of what's due."
          description="Maintenance information is scattered across the fleet — and the service calendar lives somewhere else entirely."
        />
        <div className="mt-6 flex flex-wrap gap-2">
          {SCATTERED.map((s) => (
            <span key={s} className={cn(monoClass, "rounded-full border border-[#C3C7CE] bg-[#F1F4F9] px-3 py-1 text-xs font-semibold text-[#38465F]")}>
              {s}
            </span>
          ))}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PROBLEM_QUESTIONS.map((p) => (
            <div key={p.when} className={cn(cardClass, "p-5")}>
              <p className={cn(eyebrowClass, "!text-[#2D7DE0]")}>{p.when}</p>
              <p className="mt-2 text-[15px] font-semibold leading-6 text-[#0A1A2E]">{p.q}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Block 3: Daily Fleet Health, PM status & operating states ────────────────
const STATES: Array<{ r: Readiness; label: string; body: string }> = [
  { r: "ready", label: "Ready", body: "No available evidence indicates an immediate concern." },
  { r: "monitor", label: "Monitor", body: "The vehicle may operate, but a known condition requires monitoring." },
  { r: "service_soon", label: "Service Soon", body: "Inspection, scheduling, evidence review or maintenance follow-up is required." },
  { r: "stop", label: "Stop", body: "The vehicle should not be dispatched until the concern is assessed or resolved." },
];
const DAILY_SURFACES = [
  "Completed and missing inspections",
  "Unresolved driver reports",
  "Warning lights or fault codes",
  "Defects awaiting review",
  "Repairs awaiting confirmation",
  "Recurring issues",
  "PM approaching due or overdue — by km, engine hours, or date",
  "Priority actions before dispatch",
];

function FleetHealthStates() {
  return (
    <section id="fleet-health" className="border-y border-[#C3C7CE] bg-[#F6F8FB] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Daily Fleet Health"
          title="Start every morning with a clear action list—including what's due."
          description="Four operating states, so anyone on the team can see what to do next."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATES.map((s) => (
            <div key={s.r} className={cn(cardClass, "border-t-[3px] p-5")} style={{ borderTopColor: READINESS_HEX[s.r] }}>
              <ReadinessPill readiness={s.r} size="sm" />
              <p className="mt-3 text-sm leading-6 text-[#38465F]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className={cn(cardClass, "mt-6 p-5")}>
          <p className="text-sm font-bold text-[#0A1A2E]">The daily view surfaces:</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {DAILY_SURFACES.map((t) => (
              <li key={t} className="flex gap-2 text-sm text-[#38465F]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Block 4: How TruckFixr works every day ───────────────────────────────────
const WORK_STEPS: Array<{ icon: ComponentType<{ className?: string }>; title: string; body: string }> = [
  { icon: Radio, title: "Capture daily vehicle signals", body: "Inspections, symptoms, warning lights, dashboard photos, fault codes, mileage or engine hours, and recent repairs." },
  { icon: Gauge, title: "Assess maintenance risk and PM status", body: "Classify emerging risk and check what service is due — by mileage, engine hours, or date." },
  { icon: Compass, title: "Assign and track the next action", body: "One structured record shared across driver, fleet, and shop." },
  { icon: ClipboardCheck, title: "Confirm the repair outcome", body: "Shop findings, repair performed, cost, downtime, and whether it was resolved." },
];
const LIFECYCLE_STAGES = ["Reported", "Reviewed", "Scheduled", "Repaired", "Confirmed"];

function DailyWorkflow() {
  return (
    <section id="workflow" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading eyebrow="How it works every day" title="A daily loop, not an occasional lookup" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORK_STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className={cn(cardClass, "p-5")}>
                <div className="flex items-center gap-2 text-[#D81F2A]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className={cn(monoClass, "text-xs font-bold text-[#73777E]")}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className={cn(displayClass, "mt-2 text-lg")}>{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#38465F]">{s.body}</p>
              </div>
            );
          })}
        </div>
        <div className={cn(cardClass, "mt-6 p-5")}>
          <p className={cn(eyebrowClass, "!text-[#73777E]")}>Issue lifecycle</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            {LIFECYCLE_STAGES.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className={cn(monoClass, "rounded-md bg-[#F1F4F9] px-2.5 py-1 text-xs font-bold text-[#0A1A2E]")}>{s}</span>
                {i < LIFECYCLE_STAGES.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-[#C3C7CE]" aria-hidden="true" /> : null}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-[#38465F]">
            Confirmed shop findings, repairs and outcomes help TruckFixr improve future recommendations through the
            TruckFixr Adaptive Diagnostic System (TADIS).
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Block 5: Roadside warning-light & fault-code triage ──────────────────────
const TRIAGE_STEPS = [
  "Select the vehicle",
  "Photograph the dashboard or enter the fault code",
  "Describe the operating change",
  "Answer a few relevant safety questions",
  "Receive a preliminary operating recommendation",
];
const TRIAGE_QUESTIONS = [
  "Is the warning red, amber or flashing?",
  "Is the engine derating or has power reduced?",
  "Is temperature elevated or oil pressure low?",
  "Any smoke, noise, vibration or leakage?",
  "Has the vehicle threatened shutdown?",
  "Has this happened before, or was related work recently done?",
];
const TRIAGE_RECS: Array<{ label: string; body: string; tone: string }> = [
  { label: "Stop Safely Now", body: "Do not continue operating. Contact dispatch or roadside support.", tone: "#D81F2A" },
  { label: "Proceed to a Safe Service Location", body: "Limited operation may be acceptable under stated conditions.", tone: "#F2A516" },
  { label: "Return to Yard", body: "Avoid extended operation or another dispatch.", tone: "#F2A516" },
  { label: "Continue and Monitor", body: "Continue while monitoring named escalation conditions.", tone: "#2D7DE0" },
  { label: "Schedule Service", body: "No immediate interruption indicated, but investigate within a defined period.", tone: "#1EA66C" },
];

function RoadsideTriage() {
  return (
    <section className="bg-[#0A1A2E] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          dark
          eyebrow="On the road"
          title="A warning light appears. Help the driver and fleet decide what to do next."
          description="A driver can triage a warning light or fault code in a few taps and get a preliminary operating recommendation — with the dispatcher, owner, maintenance contact or shop notified."
        />
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <div className="rounded-[10px] border border-[#25324A] bg-[#182336] p-5">
            <p className={cn(monoClass, "text-xs font-bold uppercase tracking-wide text-[#abcaea]")}>The driver flow</p>
            <ol className="mt-3 space-y-2.5">
              {TRIAGE_STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-white">
                  <span className={cn(monoClass, "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D81F2A] text-[11px] font-bold")}>{i + 1}</span>
                  <span className="leading-6 text-[#dbe4ef]">{s}</span>
                </li>
              ))}
            </ol>
            <p className={cn(monoClass, "mt-5 text-xs font-bold uppercase tracking-wide text-[#abcaea]")}>Questions adapt to the answer</p>
            <ul className="mt-2 space-y-1.5">
              {TRIAGE_QUESTIONS.map((q) => (
                <li key={q} className="flex gap-2 text-sm leading-6 text-[#abcaea]">
                  <span className="text-[#D81F2A]">›</span>{q}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            {TRIAGE_RECS.map((r) => (
              <div key={r.label} className="flex items-start gap-3 rounded-[10px] border border-[#25324A] bg-[#182336] p-4">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.tone }} aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-white">{r.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#abcaea]">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-3xl rounded-md bg-[#182336] p-4 text-center text-xs leading-6 text-[#abcaea]">
          TruckFixr supports preliminary operating triage. It does not replace physical inspection or testing by a
          qualified technician.
        </p>
      </div>
    </section>
  );
}

// ── Block 6: Preventive & predictive maintenance intelligence ────────────────
const PATTERNS = [
  "The same warning returning",
  "Repeated repairs to the same system",
  "Increasing regen frequency",
  "Recurring roadside events",
  "Unresolved defects carried forward",
  "Repairs closed without confirmed resolution",
  "Vehicles consuming disproportionate maintenance resources",
];
const RISK_OUTPUT: Array<{ label: string; body: string }> = [
  { label: "Risk level", body: "Critical, Attention or Stable." },
  { label: "Operating decision", body: "Continue, monitor, schedule, inspect immediately, or remove from service." },
  { label: "Maintenance timeframe", body: "Now, before next dispatch, within 48 hours, this week, or monitor." },
  { label: "Evidence", body: "Why the recommendation was made." },
  { label: "What to watch next", body: "Conditions that should trigger escalation." },
];

function PreventivePredictive() {
  return (
    <section id="preventive" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Preventive & predictive maintenance intelligence"
          title="Stay ahead of what's scheduled—and catch what develops in between."
          description="Two halves of one maintenance strategy: the service calendar you have to keep, and the risk that develops between services."
        />
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className={cn(cardClass, "border-t-[3px] border-t-[#2D7DE0] p-6")}>
            <div className="flex items-center gap-2 text-[#2D7DE0]">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
              <p className={cn(eyebrowClass, "!text-[#2D7DE0]")}>Scheduled PM · available now</p>
            </div>
            <h3 className={cn(displayClass, "mt-2 text-xl")}>Know what&apos;s due before it&apos;s overdue</h3>
            <p className="mt-2 text-sm leading-6 text-[#38465F]">
              Track service due by mileage, engine hours, or date — whichever comes first. Surface work that is due soon
              or overdue, and stay ahead of PM and DOT / annual-inspection obligations. Missing readings show as
              &ldquo;insufficient data&rdquo; — never a false overdue.
            </p>
          </div>
          <div className={cn(cardClass, "border-t-[3px] border-t-[#D81F2A] p-6")}>
            <div className="flex items-center gap-2 text-[#D81F2A]">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
              <p className={eyebrowClass}>Predictive risk · available now</p>
            </div>
            <h3 className={cn(displayClass, "mt-2 text-xl")}>Identify developing risk before it becomes urgent</h3>
            <p className="mt-2 text-sm leading-6 text-[#38465F]">
              Evaluate risk from vehicle age, mileage and engine hours, inspections, driver symptoms, warning-light
              history, fault information, regen and derate history, repeat repairs, unresolved defects, maintenance
              frequency, and confirmed repair outcomes.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className={cn(eyebrowClass, "!text-[#73777E]")}>Patterns TruckFixr can detect</p>
            <ul className="mt-3 space-y-2">
              {PATTERNS.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-6 text-[#38465F]">
                  <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-[#2D7DE0]" aria-hidden="true" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={cn(cardClass, "bg-[#F6F8FB] p-5")}>
            <p className={cn(eyebrowClass, "!text-[#73777E]")}>What you get back</p>
            <dl className="mt-3 space-y-3">
              {RISK_OUTPUT.map((o) => (
                <div key={o.label} className="grid grid-cols-[130px_1fr] gap-3 border-b border-[#E2E6EC] pb-3 last:border-0 last:pb-0">
                  <dt className="text-sm font-bold text-[#0A1A2E]">{o.label}</dt>
                  <dd className="text-sm leading-6 text-[#38465F]">{o.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-8 flex items-start gap-3 rounded-[10px] border border-dashed border-[#C3C7CE] bg-[#F6F8FB] p-4">
          <Route className="mt-0.5 h-5 w-5 shrink-0 text-[#73777E]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#38465F]">
            <span className="font-bold text-[#0A1A2E]">Expanding next:</span> telematics integrations, automated mileage
            and engine-hour updates, deterioration trends, repeated-fault detection, and system-level
            service-interruption and replacement-risk indicators. TruckFixr does not claim exact failure dates,
            guaranteed breakdown prevention, or unsupported probabilities.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Block 7: Free vehicle risk check ─────────────────────────────────────────
const RISK_USES = [
  "A current concern", "A recurring issue", "A recent repair", "An inspection finding",
  "A warning light or fault code", "An older high-maintenance vehicle", "A vehicle considered for replacement",
];
const RISK_STEPS: Array<{ n: string; title: string; body: string }> = [
  { n: "1", title: "Identify the vehicle", body: "VIN where available, year / make / model, engine, mileage or engine hours, vehicle type, and current operating status." },
  { n: "2", title: "Add available evidence", body: "Driver symptom, inspection finding, warning light, fault code, dashboard photo, recent repair, invoice, or regen / derate info. No field is required." },
  { n: "3", title: "Receive the maintenance-risk assessment", body: "Preliminary risk level, recommended operating decision, suggested maintenance timeframe, supporting evidence, signs of recurrence, what to monitor, and optional expert review." },
];

function VehicleRiskCheck() {
  return (
    <section className="bg-[#ECEFF4] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Free vehicle risk check"
          title="Check one vehicle for emerging maintenance risk."
          description="Not just a reactive diagnostic. Use a current concern, a recurring issue, a recent repair, an inspection finding, or an older vehicle you're weighing for replacement."
        />
        <div className="mt-6 flex flex-wrap gap-2">
          {RISK_USES.map((u) => (
            <span key={u} className={cn(monoClass, "rounded-full border border-[#C3C7CE] bg-white px-3 py-1 text-xs font-semibold text-[#38465F]")}>
              {u}
            </span>
          ))}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {RISK_STEPS.map((s) => (
            <div key={s.n} className={cn(cardClass, "p-5")}>
              <div className={cn(monoClass, "text-2xl font-black text-[#D81F2A]")}>{s.n}</div>
              <h3 className={cn(displayClass, "mt-2 text-lg")}>{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-start gap-3">
          <RiskCheckButton location="risk_check_section" />
          <p className="text-sm text-[#73777E]">
            No credit card. No initial fleet setup. Create a fleet workspace after the result to save the case, add
            vehicles, and get ongoing fleet-health monitoring.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Block 8a: Pricing summary ────────────────────────────────────────────────
const PRICE_TIERS: Array<{ name: string; price: string; note: string; highlight?: boolean }> = [
  { name: "One-Vehicle Risk Check", price: "Free", note: "One real vehicle, no account or card." },
  { name: "Assisted Fleet Pilot", price: "CAD $99", note: "One-time · 30 days, up to 5 vehicles.", highlight: true },
  { name: "Ongoing Plans", price: "CAD $19–$199/mo", note: "Owner-Operator $19 · Small Fleet $49 · Fleet Growth $99 · Fleet Pro $199." },
  { name: "Larger Fleets & Partnerships", price: "Custom", note: "21+ vehicles or trailer-heavy operations." },
];

function PricingSummary() {
  return (
    <section id="pricing" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading center eyebrow="Pricing" title="Start free. Grow when it earns its place." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRICE_TIERS.map((t) => (
            <div key={t.name} className={cn(cardClass, "p-5", t.highlight && "ring-2 ring-[#D81F2A]")}>
              <p className="text-sm font-bold text-[#0A1A2E]">{t.name}</p>
              <p className={cn(displayClass, "mt-2 text-2xl")}>{t.price}</p>
              <p className="mt-2 text-xs leading-5 text-[#73777E]">{t.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-[#73777E]">
          The one-time CAD $99 Assisted Pilot is separate from the $99/mo Fleet Growth plan. A no-card 14-day trial is
          also available.
        </p>
        <div className="mt-6 text-center">
          <Link href="/pricing">
            <Button
              variant="outline"
              onClick={() => trackEvent("pricing_viewed", { cta_location: "pricing_summary" })}
              className="h-11 border-[#0A1A2E] px-6 font-bold text-[#0A1A2E] hover:bg-[#0A1A2E] hover:text-white"
            >
              View full pricing
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Block 8b: FAQ ────────────────────────────────────────────────────────────
const FAQS: Array<{ q: string; a: string }> = [
  { q: "Is TruckFixr a daily inspection app?", a: "It includes daily inspections, but it goes further — connecting inspections, driver reports, warning lights, fault information, PM schedules, repair history and confirmed outcomes into one fleet-health picture and next action." },
  { q: "Can TruckFixr help when a driver is on the road?", a: "Yes. A driver can triage a warning light or fault code, answer a few safety questions, and get a preliminary operating recommendation, with the fleet notified. It is preliminary triage, not a replacement for inspection." },
  { q: "Does TruckFixr replace a technician?", a: "No. It provides decision support and does not replace inspection, diagnosis, or the judgment of a qualified technician, and does not provide roadworthiness certification." },
  { q: "Does TruckFixr track scheduled PM?", a: "Yes. It tracks preventive-maintenance intervals by mileage, engine hours, or date — whichever comes first — and surfaces work that is due soon or overdue." },
  { q: "Is TruckFixr already predicting exact failures?", a: "No. It identifies elevated maintenance risk and recurring patterns and recommends the next action. It does not claim exact component or date failure prediction, and becomes more predictive as outcome and telematics data grow." },
  { q: "Is telematics hardware required?", a: "No. Telematics and diagnostic data help when available, but a driver report, inspection, or warning light is enough to start. Automated telematics ingestion is on the roadmap." },
  { q: "What happens after the free vehicle check?", a: "You get the assessment immediately. You can then create a fleet workspace to save the case, add vehicles, and receive ongoing fleet-health monitoring — or start the CAD $99 assisted pilot." },
];

function FaqSection() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section id="faq" className="bg-[#F6F8FB] py-16 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className={sectionShell}>
        <SectionHeading center eyebrow="FAQ" title="Common questions" />
        <div className="mx-auto mt-8 max-w-3xl divide-y divide-[#E2E6EC]">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-bold text-[#0A1A2E]">
                {f.q}
                <span className="ml-4 text-[#D81F2A] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-[#38465F]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Block 8c: Final CTA ──────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="bg-[#0A1A2E] py-16 sm:py-20">
      <div className={cn(sectionShell, "text-center")}>
        <p className={cn(monoClass, "text-[13px] text-[#8A98AE]")}>PREVENTIVE + PREDICTIVE, EVERY DAY</p>
        <h2 className={cn(displayClass, "mx-auto mt-4 max-w-3xl text-3xl !text-white sm:text-4xl")}>
          Know what needs attention—and what&apos;s due—before the next dispatch, roadside warning or breakdown.
        </h2>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <RiskCheckButton location="final_cta" />
          <FleetRiskReviewButton dark />
        </div>
      </div>
    </section>
  );
}

// ── Sticky mobile CTA ────────────────────────────────────────────────────────
function StickyMobileCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#C3C7CE] bg-white/95 p-3 backdrop-blur sm:hidden">
      <RiskCheckButton location="sticky_mobile" className="h-12 w-full justify-center" children="Check One Vehicle — Free" />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FleetReadinessLandingV3() {
  const [fitAnswers, setFitAnswers] = useState<FitAnswerMap>(() => getDefaultFitAnswers());
  const [fitCompleted, setFitCompleted] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([
    "Driver photo/video reporting",
    "Repair invoice upload",
    "Weekly pilot review",
  ]);

  useSeoMeta({
    title: "TruckFixr Fleet AI | Preventive & Predictive Maintenance Intelligence for Commercial Fleets",
    description:
      "Stay ahead of scheduled service and catch developing problems early. TruckFixr combines inspections, driver reports, fault information, PM schedules, repair history and confirmed outcomes into a clear risk level, PM status and recommended action for commercial fleets.",
  });

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-16 font-['IBM_Plex_Sans'] text-[#0A1A2E] sm:pb-0">
      <Header />
      <Hero />
      <DailyProblem />
      <FleetHealthStates />
      <DailyWorkflow />
      <RoadsideTriage />
      <PreventivePredictive />
      <VehicleRiskCheck />
      {/* Block 8: qualitative proof, then supporters, then pricing. */}
      <ProofSection />
      <TractionStrip />
      <PricingSummary />
      {/* CAD $99 pilot — qualification + demoted lead form (the Fleet-Risk Review target). */}
      <section id="pilot" className="bg-[#ECEFF4] py-16 sm:py-20">
        <div className={cn(sectionShell, "space-y-10")}>
          <SectionHeading center eyebrow="30-day assisted pilot — CAD $99" title="Ready for more than one vehicle? Start the pilot." />
          <div className="text-center">
            <Link href="/pilot-apply">
              <Button
                onClick={() => trackEvent("pilot_cta_clicked", { cta_location: "pilot_section" })}
                className={cn("h-11 px-6 font-bold", redBtn)}
              >
                Start the CAD $99 Pilot
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <FitCheck
            answers={fitAnswers}
            setAnswers={setFitAnswers}
            completed={fitCompleted}
            onComplete={() => setFitCompleted(true)}
            onBuildPilot={() => scrollToSection("build-pilot")}
          />
          <div id="build-pilot">
            <BuildPilot selectedAddOns={selectedAddOns} setSelectedAddOns={setSelectedAddOns} onPilot={() => scrollToSection("pilot-lead")} />
          </div>
          <div id="pilot-lead">
            <PilotOffer fitAnswers={fitAnswers} selectedAddOns={selectedAddOns} />
          </div>
        </div>
      </section>
      <FaqSection />
      <FinalCta />
      <footer className="bg-[#00101E] py-8 text-center text-xs text-[#8A98AE]">
        <div className={sectionShell}>
          TruckFixr Fleet AI · <a href="/privacy" className="hover:text-white">Privacy</a> ·{" "}
          <a href="/terms" className="hover:text-white">Terms</a>
        </div>
      </footer>
      <StickyMobileCta />
    </div>
  );
}
