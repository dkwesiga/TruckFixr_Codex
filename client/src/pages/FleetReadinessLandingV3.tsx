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
  Search,
  ShieldCheck,
  Truck,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { ReadinessPill, type Readiness } from "@/components/readiness/ReadinessPill";
import { TractionStrip } from "@/components/marketing/FleetReadinessLandingSections";

// V3 landing — consultative, founder-led motion. TruckFixr is explained through
// the operational problem first; the single conversion path is a 25-minute
// Fleet Maintenance Review (/fleet-review), not a self-serve trial or a generic
// product demo. No pricing prominence, no competing CTAs. Shares V2's brand
// system — no new design system.
const sectionShell = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";
const cardClass =
  "rounded-[10px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const monoClass = "font-['JetBrains_Mono']";
const eyebrowClass = "text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// The one conversion path on the page — the founder-led Fleet Maintenance Review.
function FleetReviewButton({
  location,
  className,
  children = "Book Your Fleet Review",
}: {
  location: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href="/fleet-review">
      <Button
        onClick={() => trackEvent("fleet_review_cta_clicked", { cta_location: location })}
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

// Secondary action — informational only, never a second conversion path.
function SeeHowButton({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        trackEvent("see_how_it_works_clicked", { cta_location: "landing" });
        scrollToSection("how-it-works");
      }}
      className={cn(
        "min-h-12 h-auto whitespace-normal px-6 py-2.5 text-center text-[15px] font-bold leading-tight",
        dark
          ? "border-white/40 text-white hover:bg-white hover:text-[#0A1A2E]"
          : "border-[#0A1A2E] text-[#0A1A2E] hover:bg-[#0A1A2E] hover:text-white",
        className
      )}
    >
      See How TruckFixr Works
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
    ["How It Works", "how-it-works"],
    ["Who It's For", "who"],
    ["Why TruckFixr", "why"],
    ["About", "about"],
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
        <FleetReviewButton location="header" className="hidden h-10 min-h-0 px-4 py-0 text-sm sm:inline-flex" />
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
  { icon: AlertTriangle, value: "2", label: "Open Issues", iconColor: "#E8720C", valueColor: "#E8720C" },
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
          <span className="font-bold text-[#0A1A2E]">Follow-ups:</span> Unit 118 defect awaiting sign-off · Unit 402 repeat fault
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
          <p className={cn("mb-3.5", eyebrowClass)}>Fleet maintenance workflow for commercial operators</p>
          <h1 className={cn(displayClass, "text-4xl sm:text-5xl")}>
            Stop maintenance issues from getting lost, delayed, or becoming costly downtime.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#38465F]">
            TruckFixr helps commercial fleets capture vehicle issues, prioritize what needs attention, track repairs,
            and confirm outcomes through one connected maintenance workflow.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <FleetReviewButton location="hero" />
            <SeeHowButton />
          </div>
          <p className="mt-4 text-sm text-[#73777E]">
            Free 25-minute founder-led review for qualified commercial fleets with 5–50 vehicles.
          </p>
        </div>
        <HeroFleetHealthCard />
      </div>
    </section>
  );
}

// ── Section 2: The operational problem (lead with the pain) ──────────────────
const LOSS_POINTS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Radio, title: "Reported, then lost", body: "A driver mentions a noise or a warning light — by phone, text, or paper — and it never reaches the person who can act on it." },
  { icon: AlertTriangle, title: "Delayed until urgent", body: "Small issues wait behind everything else and only get attention once they become a roadside failure or an out-of-service truck." },
  { icon: Compass, title: "Poorly prioritized", body: "Without a shared view of urgency, the loudest problem wins — not the one most likely to cause downtime." },
  { icon: RefreshCw, title: "Left unresolved", body: "Repairs get closed without confirmation, the same fault returns, and repeat work quietly eats the maintenance budget." },
];

function ProblemSection() {
  return (
    <section id="problem" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="The problem"
          title="Maintenance issues get lost between the driver, the yard, and the shop."
          description="Warning lights, driver reports, inspections, and repair history live in calls, texts, paper, and spreadsheets. Between them, issues slip — and management can't see what's actually at risk until something breaks."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOSS_POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className={cn(cardClass, "p-5")}>
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0A1A2E]">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-[#0A1A2E]">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#38465F]">{p.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Section 3: The value of the review (the offer, before the product) ───────
const REVIEW_OUTCOMES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Search, title: "Your biggest workflow weakness", body: "A clear read on where issues are being lost, delayed, poorly prioritized, or left unresolved in your current process." },
  { icon: ClipboardCheck, title: "One or two practical fixes", body: "Recommendations you can apply to your process right away — with or without TruckFixr." },
  { icon: Gauge, title: "A demo tailored to your gaps", body: "We show only the parts of TruckFixr connected to the problems we uncover — not a generic platform tour." },
];

function ReviewValueSection() {
  return (
    <section id="review" className="bg-[#ECEFF4] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="The 25-minute Fleet Maintenance Review"
          title="A working session that exposes a costly weakness in how your fleet handles maintenance."
          description="Not a pitch, and not a generic demo. We diagnose your actual workflow, give you something useful to take away, and only then show how TruckFixr would fit."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {REVIEW_OUTCOMES.map((o) => {
            const Icon = o.icon;
            return (
              <div key={o.title} className={cn(cardClass, "p-5")}>
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#D81F2A]">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <h3 className={cn(displayClass, "mt-3 text-lg")}>{o.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#38465F]">{o.body}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-8 flex flex-col items-start gap-3">
          <FleetReviewButton location="review_section" />
          <p className="text-sm text-[#73777E]">
            If there&apos;s a strong operational fit, we may recommend a small paid pilot afterward. No obligation to
            proceed.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Section 4: Who it's for (explicit ICP — not every fleet) ─────────────────
const FIT: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Users, title: "Fleet owners & operations managers", body: "The people responsible for keeping commercial vehicles moving and maintenance decisions on track." },
  { icon: Truck, title: "Commercial fleets, 5–50 vehicles", body: "Big enough that issues slip through the cracks, small enough that one missed repair hurts." },
  { icon: Wrench, title: "Older diesel & mixed assets", body: "Especially operators running older diesel trucks and mixed commercial assets that need constant attention." },
];

function WhoItsForSection() {
  return (
    <section id="who" className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Who it's for"
          title="Built for commercial fleets that outsource repairs or run without a dedicated maintenance manager."
          description="For fleet owners, operations managers, and maintenance decision-makers responsible for commercial fleets with 5–50 vehicles. TruckFixr isn't for every fleet — and we'll tell you on the review if it isn't for yours."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FIT.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className={cn(cardClass, "p-5")}>
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0A1A2E]">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-[#0A1A2E]">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#38465F]">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Section 5: How TruckFixr works (product, after the problem is framed) ─────
const STATES: Array<{ r: Readiness; body: string }> = [
  { r: "ready", body: "No available evidence indicates an immediate concern." },
  { r: "monitor", body: "May operate, but a known condition requires monitoring." },
  { r: "service_soon", body: "Inspection, scheduling, or maintenance follow-up is required." },
  { r: "stop", body: "Should not be dispatched until the concern is assessed or resolved." },
];
const WORK_STEPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Radio, title: "Capture the issue", body: "Drivers report symptoms, warning lights, fault codes, or inspection findings — one place, not scattered calls and paper." },
  { icon: Gauge, title: "Prioritize what matters", body: "Each vehicle gets a readiness state so the right issue rises to the top before dispatch." },
  { icon: Compass, title: "Assign & track the repair", body: "Turn an issue into a tracked action — assigned, followed, and visible until it's done." },
  { icon: ClipboardCheck, title: "Confirm the outcome", body: "Close the loop with a confirmed resolution, so repeat faults and unresolved work stop hiding." },
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-[#F6F8FB] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="How TruckFixr works"
          title="One connected workflow: capture, prioritize, track, confirm."
          description="TruckFixr connects the maintenance signals you already generate — inspections, driver reports, warning lights, and repair history — into a single view of what's ready, what needs attention, and what to do next."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORK_STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className={cn(cardClass, "p-5")}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0A1A2E]">
                    <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                  </span>
                  <span className={cn(monoClass, "text-xs font-bold text-[#73777E]")}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-[#0A1A2E]">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[#38465F]">{s.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className={cn(cardClass, "p-5")}>
            <p className={cn(eyebrowClass, "!text-[#73777E]")}>Every vehicle, one clear status</p>
            <div className="mt-3 grid gap-3">
              {STATES.map((s) => (
                <div key={s.r} className="flex items-start gap-3 rounded-md border border-[#E2E6EC] p-3" style={{ borderLeftColor: READINESS_HEX[s.r], borderLeftWidth: 3 }}>
                  <ReadinessPill readiness={s.r} size="sm" />
                  <p className="text-sm leading-6 text-[#38465F]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid content-start gap-4">
            <div className={cn(cardClass, "border-t-[3px] border-t-[#2D7DE0] p-5")}>
              <div className="flex items-center gap-2 text-[#2D7DE0]">
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
                <p className={cn(eyebrowClass, "!text-[#2D7DE0]")}>Scheduled maintenance</p>
              </div>
              <h3 className={cn(displayClass, "mt-2 text-xl")}>Know what&apos;s due before it&apos;s overdue</h3>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">
                Track service due by mileage, engine hours, or date — whichever comes first — and stay ahead of PM and
                DOT / annual-inspection obligations. Missing readings show as &ldquo;insufficient data,&rdquo; never a
                false overdue.
              </p>
            </div>
            <div className={cn(cardClass, "border-t-[3px] border-t-[#D81F2A] p-5")}>
              <div className="flex items-center gap-2 text-[#D81F2A]">
                <TrendingUp className="h-5 w-5" aria-hidden="true" />
                <p className={eyebrowClass}>Developing-risk signals</p>
              </div>
              <h3 className={cn(displayClass, "mt-2 text-xl")}>Surface problems that repeat or escalate</h3>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">
                TruckFixr flags patterns worth a closer look — repeat repairs, returning warnings, unresolved defects,
                and vehicles consuming disproportionate maintenance — so they get attention before the next breakdown.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-[10px] border border-dashed border-[#C3C7CE] bg-white p-4 sm:flex-row sm:items-start">
          <Route className="mt-0.5 h-5 w-5 shrink-0 text-[#73777E]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[#38465F]">
            <span className="font-bold text-[#0A1A2E]">Being tested and expanding:</span> telematics integrations,
            automated mileage / engine-hour updates, and deterioration trends. TruckFixr does not claim exact failure
            dates or guaranteed breakdown prevention, and does not replace inspection by a qualified technician.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Section 6: Why TruckFixr — founder credibility + honest proof ────────────
function WhyTruckFixrSection() {
  return (
    <section id="why" className="scroll-mt-16 bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <div id="about" className="grid items-center gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className={eyebrowClass}>Why TruckFixr</p>
            <h2 className={cn(displayClass, "mt-2 text-3xl sm:text-4xl")}>Built by someone who has lived the maintenance workflow.</h2>
            <p className="mt-4 text-base leading-7 text-[#38465F]">
              TruckFixr comes out of hands-on experience managing commercial fleets and heavy-duty repair operations —
              the calls, the paper, the repeat faults, and the repairs that close without ever being confirmed.
            </p>
            <p className="mt-3 text-base leading-7 text-[#38465F]">
              Your review is led by <span className="font-bold text-[#0A1A2E]">Dickson Kwesiga</span>, founder of
              TruckFixr Fleet AI. You&apos;re booking a working session with the founder — not a demo request routed to a
              sales rep.
            </p>
            <div className="mt-6">
              <FleetReviewButton location="why_section" />
            </div>
          </div>
          <div className={cn(cardClass, "p-6")}>
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#0A1A2E] text-lg font-black text-white">DK</span>
              <div>
                <p className="text-base font-bold text-[#0A1A2E]">Dickson Kwesiga</p>
                <p className="text-sm text-[#73777E]">Founder, TruckFixr Fleet AI</p>
              </div>
            </div>
            <ul className="mt-5 space-y-3">
              {[
                "Currently being tested with commercial fleets using real inspections, vehicle issues, maintenance decisions, and repair outcomes.",
                "Reviews are honest: pilot-ready, improve-first, or not a fit — we'll tell you which.",
                "Decision support for your team — not a replacement for inspection or a qualified technician.",
              ].map((t) => (
                <li key={t} className="flex gap-2 text-sm leading-6 text-[#38465F]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-10">
          <TractionStrip />
        </div>
      </div>
    </section>
  );
}

// ── FAQ + final close ────────────────────────────────────────────────────────
const FAQS: Array<{ q: string; a: string }> = [
  { q: "What actually happens on the review?", a: "A live 25-minute working session: we confirm your context, diagnose how issues are reported, prioritized, approved, tracked and confirmed today, then show only the parts of TruckFixr connected to the gaps we find — and end with an honest recommendation." },
  { q: "Is this just a sales demo?", a: "No. The goal is to find a real weakness in your maintenance workflow and give you something useful to take away. A tailored demonstration is part of it, but only against the problems we actually uncover." },
  { q: "Is it really free? What's the catch?", a: "The review is free and there's no obligation. If there's a strong operational fit, we may recommend a small, standardized paid pilot afterward — but that's a decision for after the call, not a condition of it." },
  { q: "Who should be on the call?", a: "The person who owns or influences maintenance decisions — a fleet owner, operations manager, or maintenance manager for a commercial fleet with roughly 5–50 vehicles." },
  { q: "Does TruckFixr replace a technician?", a: "No. It provides decision support and does not replace inspection, diagnosis, or a qualified technician, and does not provide roadworthiness certification." },
  { q: "Do I need telematics hardware to start?", a: "No. A driver report, inspection, or warning light is enough. Automated telematics ingestion is being tested and expanded." },
];

function CloseSection() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section className="bg-[#F6F8FB] py-16 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className={cn(sectionShell, "max-w-3xl")}>
        <SectionHeading center eyebrow="FAQ" title="Common questions" />
        <div className="mt-6 divide-y divide-[#E2E6EC]">
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

function FinalCta() {
  return (
    <section className="bg-[#0A1A2E] py-14 sm:py-16">
      <div className={cn(sectionShell, "text-center")}>
        <h2 className={cn(displayClass, "mx-auto max-w-3xl text-2xl !text-white sm:text-3xl")}>
          Find the costly weakness in your maintenance workflow—in 25 minutes with the founder.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#abcaea]">
          Free 25-minute founder-led review for qualified commercial fleets with 5–50 vehicles. No obligation.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <FleetReviewButton location="final_cta" />
          <SeeHowButton dark />
        </div>
      </div>
    </section>
  );
}

function StickyMobileCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#C3C7CE] bg-white/95 p-3 backdrop-blur sm:hidden">
      <FleetReviewButton location="sticky_mobile" className="h-12 min-h-0 w-full justify-center py-0" />
    </div>
  );
}

export default function FleetReadinessLandingV3() {
  useSeoMeta({
    title: "TruckFixr Fleet AI | Stop Maintenance Issues From Becoming Costly Downtime",
    description:
      "TruckFixr helps commercial fleets capture vehicle issues, prioritize what needs attention, track repairs, and confirm outcomes in one connected workflow. Book a free 25-minute founder-led Fleet Maintenance Review for fleets with 5–50 vehicles.",
  });

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-16 font-['IBM_Plex_Sans'] text-[#0A1A2E] sm:pb-0">
      <Header />
      <Hero />
      <ProblemSection />
      <ReviewValueSection />
      <WhoItsForSection />
      <HowItWorksSection />
      <WhyTruckFixrSection />
      <CloseSection />
      <FinalCta />
      <footer className="bg-[#00101E] py-8 text-center text-xs text-[#8A98AE]">
        <div className={sectionShell}>
          TruckFixr Fleet AI · <a href="/privacy" className="hover:text-white">Privacy</a> ·{" "}
          <a href="/terms" className="hover:text-white">Terms</a> ·{" "}
          <a href="/pricing" className="hover:text-white">Pricing</a>
        </div>
      </footer>
      <StickyMobileCta />
    </div>
  );
}
