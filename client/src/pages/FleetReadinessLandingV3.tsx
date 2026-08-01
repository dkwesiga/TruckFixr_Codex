import { type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Compass,
  Gauge,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Truck,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { ReadinessPill, type Readiness } from "@/components/readiness/ReadinessPill";
import {
  PilotOffer,
  TractionStrip,
  getDefaultFitAnswers,
} from "@/components/marketing/FleetReadinessLandingSections";

// V3 landing — preventive (scheduled PM) + predictive (developing risk), condensed
// to 5 focused sections. Shares V2's locked brand system — no new design system.
const sectionShell = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";
const cardClass =
  "rounded-[10px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const monoClass = "font-['JetBrains_Mono']";
const eyebrowClass = "text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

const DEFAULT_ADDONS = [
  "Driver photo/video reporting",
  "Repair invoice upload",
  "Weekly pilot review",
];

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function RiskCheckButton({
  location,
  className,
  children = "Check One Vehicle's Maintenance Risk — Free",
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

const READINESS_HEX: Record<Readiness, string> = {
  ready: "#1EA66C",
  monitor: "#2D7DE0",
  service_soon: "#F2A516",
  stop: "#D81F2A",
};

// ── Nav ──────────────────────────────────────────────────────────────────────
function Header() {
  const navItems: Array<[string, string]> = [
    ["Fleet Health", "daily"],
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
        <RiskCheckButton location="header" className="hidden h-10 min-h-0 px-4 py-0 text-sm sm:inline-flex" children="Check One Vehicle" />
      </div>
    </div>
  );
}

// ── Section 1: Hero + Fleet Health Score card ────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const r = 76;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - score / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-40 w-40 sm:h-44 sm:w-44">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label={`Fleet health score ${score} percent`}>
          <circle cx="90" cy="90" r={r} fill="none" stroke="#E2E6EC" strokeWidth="14" />
          <circle cx="90" cy="90" r={r} fill="none" stroke="#1EA66C" strokeWidth="14" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1EA66C]">
            <Check className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <span className="mt-1 text-4xl font-black text-[#0A1A2E] sm:text-5xl">{score}%</span>
        </div>
      </div>
      <p className="mt-3 text-lg font-bold text-[#0A1A2E]">Fleet Health Score</p>
    </div>
  );
}

const FLEET_STATS: Array<{ icon: LucideIcon; value: string; label: string; iconColor: string; valueColor: string }> = [
  { icon: Truck, value: "48", label: "Active Vehicles", iconColor: "#2D7DE0", valueColor: "#0A1A2E" },
  { icon: Wrench, value: "5", label: "In Shop", iconColor: "#5B6472", valueColor: "#0A1A2E" },
  { icon: AlertTriangle, value: "2", label: "Critical Alerts", iconColor: "#E8720C", valueColor: "#E8720C" },
];

function HeroFleetHealthCard() {
  return (
    <div className={cn(cardClass, "p-5 sm:p-6")}>
      <div className="mb-4 flex items-center justify-between">
        <p className={cn(monoClass, "text-[11px] font-bold uppercase tracking-wider text-[#73777E]")}>Fleet Health</p>
        <span className={cn(monoClass, "rounded-full bg-[#F1F4F9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#73777E]")}>Sample</span>
      </div>
      <div className="grid items-center gap-5 sm:grid-cols-2">
        <ScoreGauge score={94} />
        <div className="space-y-3">
          {FLEET_STATS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-3 rounded-[10px] border border-[#E2E6EC] bg-white px-4 py-3 shadow-[0_8px_20px_-16px_rgba(10,26,46,0.5)]">
                <Icon className="h-7 w-7 shrink-0" style={{ color: s.iconColor }} aria-hidden="true" />
                <div>
                  <div className="text-2xl font-black leading-none" style={{ color: s.valueColor }}>{s.value}</div>
                  <div className="mt-1 text-xs font-semibold text-[#73777E]">{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 border-t border-[#EEF1F5] pt-3">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#2D7DE0]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[#38465F]">
          <span className="font-bold text-[#0A1A2E]">PM due:</span> Unit 118 service in 400 km · Unit 402 overdue 3 days
        </p>
      </div>
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

// ── Section 2: Daily Fleet Health (problem + states + daily loop) ────────────
const STATES: Array<{ r: Readiness; body: string }> = [
  { r: "ready", body: "No available evidence indicates an immediate concern." },
  { r: "monitor", body: "May operate, but a known condition requires monitoring." },
  { r: "service_soon", body: "Inspection, scheduling, or maintenance follow-up is required." },
  { r: "stop", body: "Should not be dispatched until the concern is assessed or resolved." },
];
const DAILY_SURFACES = [
  "Completed and missing inspections",
  "Unresolved driver reports",
  "Warning lights or fault codes",
  "Defects and repairs awaiting confirmation",
  "Recurring issues",
  "PM approaching due or overdue — by km, engine hours, or date",
];
const WORK_STEPS: Array<{ icon: LucideIcon; title: string }> = [
  { icon: Radio, title: "Capture daily signals" },
  { icon: Gauge, title: "Assess risk + PM status" },
  { icon: Compass, title: "Assign the next action" },
  { icon: ClipboardCheck, title: "Confirm the outcome" },
];

function DailyFleetHealth() {
  return (
    <section id="daily" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Daily Fleet Health"
          title="Start every morning knowing what's ready—and what's due."
          description="Maintenance signals are scattered across inspections, driver reports, warning lights, fault codes, invoices, shop findings and PM spreadsheets. TruckFixr connects them into one clear action list."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATES.map((s) => (
            <div key={s.r} className={cn(cardClass, "border-t-[3px] p-5")} style={{ borderTopColor: READINESS_HEX[s.r] }}>
              <ReadinessPill readiness={s.r} size="sm" />
              <p className="mt-3 text-sm leading-6 text-[#38465F]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className={cn(cardClass, "p-5")}>
            <p className="text-sm font-bold text-[#0A1A2E]">The morning view surfaces:</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {DAILY_SURFACES.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-[#38465F]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={cn(cardClass, "bg-[#F6F8FB] p-5")}>
            <p className={cn(eyebrowClass, "!text-[#73777E]")}>A daily loop, not an occasional lookup</p>
            <div className="mt-3 space-y-2.5">
              {WORK_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#0A1A2E]">
                      <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-[#0A1A2E]">
                      <span className={cn(monoClass, "mr-2 text-xs text-[#73777E]")}>{String(i + 1).padStart(2, "0")}</span>
                      {s.title}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 border-t border-[#E2E6EC] pt-3 text-xs leading-5 text-[#73777E]">
              Confirmed shop findings and outcomes improve future recommendations through the TruckFixr Adaptive
              Diagnostic System (TADIS).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section 3: Preventive + predictive (with roadside callout) ───────────────
const PATTERNS = [
  "The same warning returning",
  "Repeated repairs to the same system",
  "Increasing regen frequency",
  "Unresolved defects carried forward",
  "Repairs closed without confirmed resolution",
  "Vehicles consuming disproportionate maintenance resources",
];
const RISK_OUTPUT: Array<[string, string]> = [
  ["Risk level", "Critical, Attention or Stable."],
  ["Operating decision", "Continue, monitor, schedule, inspect, or remove from service."],
  ["Maintenance timeframe", "Now, before next dispatch, within 48 hours, this week, or monitor."],
  ["Evidence & escalation", "Why the recommendation was made, and what should trigger escalation."],
];

function PreventivePredictive() {
  return (
    <section id="preventive" className="bg-[#F6F8FB] py-16 sm:py-20">
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
              Track service due by mileage, engine hours, or date — whichever comes first — and stay ahead of PM and
              DOT / annual-inspection obligations. Missing readings show as &ldquo;insufficient data,&rdquo; never a
              false overdue.
            </p>
          </div>
          <div className={cn(cardClass, "border-t-[3px] border-t-[#D81F2A] p-6")}>
            <div className="flex items-center gap-2 text-[#D81F2A]">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
              <p className={eyebrowClass}>Predictive risk · available now</p>
            </div>
            <h3 className={cn(displayClass, "mt-2 text-xl")}>Identify developing risk before it becomes urgent</h3>
            <p className="mt-2 text-sm leading-6 text-[#38465F]">
              Evaluate risk from vehicle age, mileage and engine hours, inspections, driver symptoms, warning-light and
              fault history, regen and derate history, repeat repairs, and confirmed repair outcomes.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className={cn(cardClass, "p-5")}>
            <p className={cn(eyebrowClass, "!text-[#73777E]")}>Patterns it detects</p>
            <ul className="mt-3 grid gap-2">
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
            <dl className="mt-3 space-y-2.5">
              {RISK_OUTPUT.map(([label, body]) => (
                <div key={label} className="border-b border-[#E2E6EC] pb-2.5 last:border-0 last:pb-0">
                  <dt className="text-sm font-bold text-[#0A1A2E]">{label}</dt>
                  <dd className="text-sm leading-6 text-[#38465F]">{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Roadside triage — folded in as a highlighted capability. */}
        <div className="mt-4 grid gap-4 rounded-[10px] border border-[#25324A] bg-[#0A1A2E] p-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <p className={cn(monoClass, "text-[11px] font-bold uppercase tracking-wider text-[#abcaea]")}>On the road</p>
            <h3 className={cn(displayClass, "mt-2 text-xl !text-white")}>A warning light appears. Decide what to do next.</h3>
            <p className="mt-2 text-sm leading-6 text-[#abcaea]">
              A driver can photograph the dashboard or enter a fault code, answer a few safety questions, and get a
              preliminary operating recommendation — with the fleet notified.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Stop Safely Now", "#D81F2A"],
              ["Proceed to a Safe Service Location", "#F2A516"],
              ["Return to Yard", "#F2A516"],
              ["Continue and Monitor", "#2D7DE0"],
              ["Schedule Service", "#1EA66C"],
            ].map(([label, tone]) => (
              <div key={label} className="flex items-center gap-2 rounded-md border border-[#25324A] bg-[#182336] px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} aria-hidden="true" />
                <span className="text-xs font-semibold text-white">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-[10px] border border-dashed border-[#C3C7CE] bg-white p-4 sm:flex-row sm:items-start">
          <Route className="mt-0.5 h-5 w-5 shrink-0 text-[#73777E]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#38465F]">
            <span className="font-bold text-[#0A1A2E]">Expanding next:</span> telematics integrations, automated
            mileage / engine-hour updates, deterioration trends, and system-level replacement-risk indicators.
            TruckFixr does not claim exact failure dates or guaranteed breakdown prevention. Preliminary triage does not
            replace inspection by a qualified technician.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Section 4: Free vehicle risk check ───────────────────────────────────────
const RISK_STEPS: Array<{ n: string; title: string; body: string }> = [
  { n: "1", title: "Identify the vehicle", body: "VIN where available, year / make / model, engine, mileage or engine hours, and current operating status." },
  { n: "2", title: "Add available evidence", body: "Driver symptom, inspection finding, warning light, fault code, dashboard photo, recent repair, or regen / derate info. No field is required." },
  { n: "3", title: "Receive the risk assessment", body: "Preliminary risk level, recommended operating decision, maintenance timeframe, supporting evidence, what to monitor, and optional expert review." },
];

function VehicleRiskCheck() {
  return (
    <section className="bg-[#ECEFF4] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Free vehicle risk check"
          title="Check one vehicle for emerging maintenance risk."
          description="Use a current concern, a recurring issue, a recent repair, an inspection finding, or an older vehicle you're weighing for replacement — no account or card required."
        />
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
            No credit card. No initial fleet setup. Create a fleet workspace after the result to save the case and get
            ongoing fleet-health monitoring.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Section 5: Pricing, proof, review + close ────────────────────────────────
const PRICE_TIERS: Array<{ name: string; price: string; note: string; highlight?: boolean }> = [
  { name: "One-Vehicle Risk Check", price: "Free", note: "One real vehicle, no account or card." },
  { name: "Assisted Fleet Pilot", price: "CAD $99", note: "One-time · 30 days, up to 5 vehicles.", highlight: true },
  { name: "Ongoing Plans", price: "$19–$199/mo", note: "Owner-Operator $19 · Small Fleet $49 · Fleet Growth $99 · Fleet Pro $199." },
  { name: "Larger Fleets", price: "Custom", note: "21+ vehicles or trailer-heavy operations." },
];
const FAQS: Array<{ q: string; a: string }> = [
  { q: "Does TruckFixr track scheduled PM?", a: "Yes. It tracks preventive-maintenance intervals by mileage, engine hours, or date — whichever comes first — and surfaces work that is due soon or overdue." },
  { q: "Can it help when a driver is on the road?", a: "Yes. A driver can triage a warning light or fault code, answer a few safety questions, and get a preliminary operating recommendation. It is preliminary triage, not a replacement for inspection." },
  { q: "Does it replace a technician?", a: "No. It provides decision support and does not replace inspection, diagnosis, or a qualified technician, and does not provide roadworthiness certification." },
  { q: "Is telematics hardware required?", a: "No. A driver report, inspection, or warning light is enough to start. Automated telematics ingestion is on the roadmap." },
  { q: "What happens after the free vehicle check?", a: "You get the assessment immediately, then can create a fleet workspace to save the case and add vehicles — or start the CAD $99 assisted pilot." },
];

function CloseSection() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section id="pricing" className="bg-white py-16 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className={cn(sectionShell, "space-y-12")}>
        {/* Pricing */}
        <div>
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
            also available.{" "}
            <Link href="/pricing" className="font-semibold text-[#0A1A2E] underline">View full pricing</Link>.
          </p>
        </div>

        {/* Supporters (qualitative proof) */}
        <TractionStrip />

        {/* Fleet-risk review + pilot — the compact lead form. */}
        <div id="pilot" className="scroll-mt-20">
          <SectionHeading center eyebrow="Fleet-risk review & 30-day pilot" title="Request a review, or start the CAD $99 pilot." />
          <div className="mt-6">
            <PilotOffer fitAnswers={getDefaultFitAnswers()} selectedAddOns={DEFAULT_ADDONS} />
          </div>
          <div className="mt-6 text-center">
            <Link href="/pilot-apply">
              <Button
                onClick={() => trackEvent("pilot_cta_clicked", { cta_location: "close_section" })}
                className={cn("h-11 px-6 font-bold", redBtn)}
              >
                Start the CAD $99 Pilot
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div>
          <SectionHeading center eyebrow="FAQ" title="Common questions" />
          <div className="mx-auto mt-6 max-w-3xl divide-y divide-[#E2E6EC]">
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
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#0A1A2E] py-14 sm:py-16">
      <div className={cn(sectionShell, "text-center")}>
        <h2 className={cn(displayClass, "mx-auto max-w-3xl text-2xl !text-white sm:text-3xl")}>
          Know what needs attention—and what&apos;s due—before the next dispatch, roadside warning or breakdown.
        </h2>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <RiskCheckButton location="final_cta" />
          <FleetRiskReviewButton dark />
        </div>
      </div>
    </section>
  );
}

function StickyMobileCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#C3C7CE] bg-white/95 p-3 backdrop-blur sm:hidden">
      <RiskCheckButton location="sticky_mobile" className="h-12 min-h-0 w-full justify-center py-0" children="Check One Vehicle — Free" />
    </div>
  );
}

export default function FleetReadinessLandingV3() {
  useSeoMeta({
    title: "TruckFixr Fleet AI | Preventive & Predictive Maintenance Intelligence for Commercial Fleets",
    description:
      "Stay ahead of scheduled service and catch developing problems early. TruckFixr combines inspections, driver reports, fault information, PM schedules, repair history and confirmed outcomes into a clear risk level, PM status and recommended action for commercial fleets.",
  });

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-16 font-['IBM_Plex_Sans'] text-[#0A1A2E] sm:pb-0">
      <Header />
      <Hero />
      <DailyFleetHealth />
      <PreventivePredictive />
      <VehicleRiskCheck />
      <CloseSection />
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
