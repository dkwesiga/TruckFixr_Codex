import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  Compass,
  Gauge,
  Radio,
  RefreshCw,
  ShieldCheck,
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

// Shared visual language with the existing landing (kept in sync deliberately).
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

function TryFreeButton({
  location,
  className,
  children = "Try One Vehicle Case Free",
}: {
  location: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href="/try-one-case">
      <Button
        onClick={() => trackEvent("try_one_case_clicked", { cta_location: location })}
        className={cn("h-12 px-6 text-[15px] font-bold", redBtn, className)}
      >
        {children}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Link>
  );
}

function Header() {
  return (
    <div className="sticky top-0 z-50 border-b border-[#C3C7CE] bg-white/95 backdrop-blur">
      <div className={cn(sectionShell, "flex items-center justify-between gap-4 py-3.5")}>
        <AppLogo href="/" imageClassName="h-8 sm:h-9" />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#38465F] md:flex">
          <button onClick={() => scrollToSection("dashboard")} className="hover:text-[#0A1A2E]">Dashboard</button>
          <button onClick={() => scrollToSection("lifecycle")} className="hover:text-[#0A1A2E]">How it works</button>
          <button onClick={() => scrollToSection("pilot")} className="hover:text-[#0A1A2E]">Pilot</button>
          <button onClick={() => scrollToSection("faq")} className="hover:text-[#0A1A2E]">FAQ</button>
          <a href="/access" className="hover:text-[#0A1A2E]">Sign in</a>
        </nav>
        <TryFreeButton location="header" className="hidden h-10 px-4 text-sm sm:inline-flex" children="Try One Case Free" />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-[#F6F8FB]">
      <div className={cn(sectionShell, "grid items-center gap-10 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:py-20")}>
        <div>
          <p className={cn("mb-3.5", eyebrowClass)}>Fleet maintenance intelligence for commercial fleets</p>
          <h1 className={cn(displayClass, "text-4xl sm:text-5xl")}>
            Know Which Vehicles Need Attention—and What to Do Next
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#38465F]">
            TruckFixr combines driver reports, inspections, maintenance history, repair outcomes, and
            connected-vehicle data into one live fleet-health view. When an issue appears, it helps your team
            decide whether to continue, monitor, service soon, stop, or escalate.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <TryFreeButton location="hero" />
            <Button
              variant="outline"
              onClick={() => scrollToSection("dashboard")}
              className="h-12 border-[#0A1A2E] px-6 text-[15px] font-bold text-[#0A1A2E] hover:bg-[#0A1A2E] hover:text-white"
            >
              View the Fleet Health Dashboard
            </Button>
          </div>
          <p className="mt-4 text-sm text-[#73777E]">
            No fleet import. No account setup. No payment required for your first case.
          </p>
        </div>
        <HeroPhoto />
      </div>
    </section>
  );
}

function HeroPhoto() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#C3C7CE] shadow-[0_22px_55px_-26px_rgba(10,26,46,0.5)]">
      <img
        src="/hero-fleet.jpg"
        alt="A commercial fleet maintenance facility at sunset — trucks staged in the yard, solar-roofed service bays, and a control tower overseeing operations."
        width={1380}
        height={720}
        loading="eager"
        className="aspect-[1380/720] h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#00101E]/55 to-transparent" />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-[#1EA66C]" aria-hidden="true" />
        <span className={cn(monoClass, "text-[11px] font-bold uppercase tracking-wide text-[#0A1A2E]")}>
          Fleet-wide readiness
        </span>
      </div>
    </div>
  );
}

// Demo fixture data — a safe, clearly-representative snapshot rendered with the
// REAL readiness component (ReadinessPill), not a throwaway mock.
const DEMO_VEHICLES: Array<{ unit: string; readiness: Readiness; reason: string }> = [
  { unit: "Unit 214", readiness: "stop", reason: "Low air-pressure warning — pulled from service" },
  { unit: "Unit 118", readiness: "service_soon", reason: "Repeat DTC + PM overdue" },
  { unit: "Unit 402", readiness: "monitor", reason: "Intermittent derate reported by driver" },
  { unit: "Unit 077", readiness: "ready", reason: "No open concerns" },
  { unit: "Unit 351", readiness: "ready", reason: "No open concerns" },
];

// Status palette (matches ReadinessPill) — drives the colored metrics and the
// per-row accent border, mirroring the stitch "Fleet Readiness Board" treatment.
const READINESS_HEX: Record<Readiness, string> = {
  ready: "#1EA66C",
  monitor: "#2D7DE0",
  service_soon: "#F2A516",
  stop: "#D81F2A",
};

function FleetHealthPreview() {
  const counts = DEMO_VEHICLES.reduce(
    (acc, v) => ({ ...acc, [v.readiness]: (acc[v.readiness] ?? 0) + 1 }),
    {} as Record<Readiness, number>
  );
  const tiles: Array<[Readiness, string]> = [
    ["ready", "Ready"],
    ["monitor", "Monitor"],
    ["service_soon", "Service Soon"],
    ["stop", "Stop"],
  ];
  return (
    <div className={cn(cardClass, "overflow-hidden")}>
      <div className="flex items-center justify-between border-b border-[#E2E6EC] bg-[#0A1A2E] px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#abcaea]" aria-hidden="true" />
          <p className={cn(monoClass, "text-xs font-bold uppercase tracking-wide text-white")}>Fleet Readiness</p>
        </div>
        <span className={cn(monoClass, "rounded-full bg-[#abcaea]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#abcaea]")}>
          Sample
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        {tiles.map(([r, label]) => (
          <div key={r} className="rounded-md bg-[#F1F4F9] p-2 text-center">
            <div className="text-xl font-black" style={{ color: READINESS_HEX[r] }}>{counts[r] ?? 0}</div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#73777E]">{label}</div>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-[#EEF1F5]">
        {DEMO_VEHICLES.map((v) => (
          <li
            key={v.unit}
            className="flex items-center justify-between gap-3 border-l-[3px] bg-white px-4 py-2.5"
            style={{ borderLeftColor: READINESS_HEX[v.readiness] }}
          >
            <div>
              <div className="text-sm font-bold text-[#0A1A2E]">{v.unit}</div>
              <div className="text-xs text-[#73777E]">{v.reason}</div>
            </div>
            <ReadinessPill readiness={v.readiness} size="sm" />
          </li>
        ))}
      </ul>
    </div>
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

function DashboardSection() {
  return (
    <section id="dashboard" className="border-y border-[#C3C7CE] bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading
          eyebrow="Fleet health dashboard"
          title="One view of the vehicles that need your attention"
          description="See active fleet risk using reported concerns, inspection defects, maintenance status, repair outcomes, telematics signals, and diagnostic data."
        />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <FleetHealthPreview />
          <div className={cn(cardClass, "bg-[#F6F8FB] p-5")}>
            <p className="text-[15px] leading-7 text-[#0A1A2E]">
              <span className="font-bold">Three vehicles need attention.</span> One requires immediate review,
              while two can be scheduled without interrupting today's work.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-[#38465F]">
              {["Open defects and unresolved repairs", "Telematics and diagnostic alerts", "Repeat issues within 30 days", "Outcomes awaiting confirmation", "Upcoming follow-ups"].map((t) => (
                <li key={t} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" /><span>{t}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const LIFECYCLE: Array<{ icon: typeof Radio; title: string; body: string }> = [
  { icon: Radio, title: "Detect", body: "Driver reports, warning lights, fault codes, inspection defects, telematics and diagnostic signals." },
  { icon: Gauge, title: "Prioritize", body: "Ready, Monitor, Service Soon, or Stop — worst-first." },
  { icon: Compass, title: "Decide", body: "Continue, restrict, monitor, schedule, stop, tow, or escalate." },
  { icon: ClipboardCheck, title: "Coordinate", body: "One structured record shared across driver, fleet, and shop." },
  { icon: Wrench, title: "Confirm", body: "Shop findings, repair performed, cost, downtime, and whether it was resolved." },
  { icon: RefreshCw, title: "Improve fleet health", body: "Update history, readiness, repeat-issue detection, and attention priorities." },
];

function LifecycleSection() {
  return (
    <section id="lifecycle" className="bg-[#0A1A2E] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading dark center eyebrow="Not only for breakdowns" title="From early signal to confirmed repair outcome" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIFECYCLE.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="rounded-[10px] border border-[#25324A] bg-[#182336] p-5">
                <div className="flex items-center gap-2 text-[#abcaea]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span className={cn(monoClass, "text-xs font-bold")}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className={cn(displayClass, "mt-2 text-xl !text-white")}>{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#abcaea]">{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FreeCaseSection() {
  const steps = [
    { n: "1", title: "Submit the concern", body: "A warning light, defect, recurring symptom, inspection finding, telematics alert, diagnostic concern, or early maintenance issue." },
    { n: "2", title: "Answer up to three focused questions", body: "Each question can change the readiness, the recommended action, or whether a case is escalated." },
    { n: "3", title: "Receive and track the decision", body: "Readiness, operating action, reasoning, what to check next, escalation conditions, and human-review status." },
  ];
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading eyebrow="One free vehicle case" title="See how TruckFixr works with one real vehicle concern" description="TruckFixr structures the evidence, asks up to three focused questions, and produces a clear next action." />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className={cn(cardClass, "p-5")}>
              <div className={cn(monoClass, "text-2xl font-black text-[#D81F2A]")}>{s.n}</div>
              <h3 className={cn(displayClass, "mt-2 text-lg")}>{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8"><TryFreeButton location="free_case_section" /></div>
      </div>
    </section>
  );
}

function SampleDecisionCard() {
  return (
    <section className="bg-[#ECEFF4] py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading center eyebrow="Sample decision card" title="A clear, defensible next action" />
        <div className={cn(cardClass, "mx-auto mt-8 max-w-2xl p-6")}>
          <div className="flex items-center justify-between">
            <p className={cn(eyebrowClass, "!text-[#73777E]")}>Decision</p>
            <ReadinessPill readiness="service_soon" />
          </div>
          <h3 className={cn(displayClass, "mt-3 text-xl")}>Limit operation and arrange an inspection promptly</h3>
          <div className="mt-4 space-y-3 text-sm text-[#38465F]">
            <p><span className="font-bold text-[#0A1A2E]">Why: </span>Repeat fault code with an overdue service item raises maintenance risk.</p>
            <p><span className="font-bold text-[#0A1A2E]">Evidence reviewed: </span>Driver report, fault code, maintenance status.</p>
            <p><span className="font-bold text-[#0A1A2E]">What to check next: </span>Confirm the code is active and inspect the related system.</p>
            <p className="rounded-md bg-[#F1F4F9] p-3 text-xs text-[#73777E]">Possible causes—not a confirmed diagnosis. They are shown only when the evidence supports them.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const BENEFITS = [
  "Prioritize maintenance attention — immediate action, scheduled work, monitoring, or none.",
  "Act on early warning signs before they become roadside breakdowns.",
  "Make defensible operating decisions and record why.",
  "Send better evidence to repair shops in one structured record.",
  "Verify that repairs worked — findings, cost, downtime, and recurrence.",
  "Build fleet maintenance memory from confirmed outcomes.",
];

function BenefitsSection() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className={sectionShell}>
        <SectionHeading eyebrow="Operational benefits" title="Do not wait for the next breakdown" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b} className={cn(cardClass, "p-5 text-sm leading-6 text-[#38465F]")}>
              <ShieldCheck className="mb-2 h-5 w-5 text-[#1EA66C]" aria-hidden="true" />
              {b}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HumanReviewSafety() {
  return (
    <section className="bg-[#F6F8FB] py-16 sm:py-20">
      <div className={sectionShell}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div className={cn(cardClass, "p-6")}>
            <SectionHeading eyebrow="Human review" title="Automated guidance, with people in the loop" />
            <p className="mt-4 text-sm leading-6 text-[#38465F]">
              Critical safety cases are always eligible for human review. Service hours are Monday–Friday,
              8:00 a.m.–6:00 p.m. Eastern Time; critical cases submitted during service hours are targeted for
              review within one business hour. Not every free case is reviewed by a technician, and this is not
              an emergency service.
            </p>
          </div>
          <div className={cn(cardClass, "p-6")}>
            <SectionHeading eyebrow="Safety" title="When safety is uncertain, stop" />
            <p className="mt-4 text-sm leading-6 text-[#38465F]">
              For fire, smoke, collision danger, or immediate risk to people, contact emergency services.
              TruckFixr provides decision support — it does not replace inspection, diagnosis, or the judgment of a
              qualified technician, and does not provide roadworthiness certification.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const FAQS: Array<{ q: string; a: string }> = [
  { q: "Is TruckFixr only for breakdowns?", a: "No. TruckFixr also organizes driver concerns, inspection defects, maintenance status, repair outcomes, telematics signals, diagnostic events, and unresolved issues. The free vehicle case is a low-commitment way to experience the decision workflow." },
  { q: "Is the first case really free?", a: "Yes — one complimentary completed case, with no account, fleet import, or payment required." },
  { q: "Do I need an account or to import my fleet?", a: "No. You can submit one real vehicle concern without either." },
  { q: "Do I need telematics?", a: "No. Telematics and diagnostic data help when available, but a driver report or warning light is enough to start." },
  { q: "Can drivers and repair shops contribute?", a: "Yes. Drivers can start a case, and repair shops can add findings and repair details — all on the same canonical case." },
  { q: "What happens with a critical case?", a: "Safety guidance is shown immediately, the case is recorded, and reviewers are alerted. It is not an emergency service." },
  { q: "Is TruckFixr a confirmed diagnostic or roadworthiness service?", a: "No. It provides decision support and does not replace inspection, diagnosis, or roadworthiness certification." },
  { q: "What is included in the CAD $99 pilot?", a: "A 30-day assisted pilot for up to five vehicles, with human review for qualifying escalations, a weekly summary, and a final outcome review." },
];

function FaqSection() {
  // FAQPage structured data (§35) — improves the search result for the homepage.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <section id="faq" className="bg-white py-16 sm:py-20">
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

function FinalCta() {
  return (
    <section className="bg-[#0A1A2E] py-16 sm:py-20">
      <div className={cn(sectionShell, "text-center")}>
        <p className={cn(monoClass, "text-[13px] text-[#8A98AE]")}>START WITH ONE REAL VEHICLE ISSUE</p>
        <h2 className={cn(displayClass, "mx-auto mt-4 max-w-3xl text-3xl !text-white sm:text-4xl")}>
          Know which vehicles need attention—and what to do next.
        </h2>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <TryFreeButton location="final_cta" />
          <Button
            variant="outline"
            onClick={() => scrollToSection("pilot")}
            className="h-12 border-white/40 px-6 text-[15px] font-bold text-white hover:bg-white hover:text-[#0A1A2E]"
          >
            Explore the 30-Day Pilot — CAD $99
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function FleetReadinessLandingV2() {
  const [fitAnswers, setFitAnswers] = useState<FitAnswerMap>(() => getDefaultFitAnswers());
  const [fitCompleted, setFitCompleted] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([
    "Driver photo/video reporting",
    "Repair invoice upload",
    "Weekly pilot review",
  ]);

  useSeoMeta({
    title: "TruckFixr Fleet AI — Know Which Vehicles Need Attention",
    description:
      "See fleet-health risk, act on driver concerns and inspection defects, and track issues through repair and confirmed outcome. Try one vehicle case free.",
  });

  return (
    <div className="min-h-screen bg-[#F6F8FB] font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <Header />
      <Hero />
      <DashboardSection />
      <LifecycleSection />
      <FreeCaseSection />
      <SampleDecisionCard />
      <BenefitsSection />
      <HumanReviewSafety />
      {/* Operational proof, then supporters below it. */}
      <ProofSection />
      <TractionStrip />
      {/* CAD $99 pilot — qualification + demoted lead form. */}
      <section id="pilot" className="bg-[#ECEFF4] py-16 sm:py-20">
        <div className={cn(sectionShell, "space-y-10")}>
          <SectionHeading center eyebrow="30-day assisted pilot — CAD $99" title="Ready for more than one case? Start the pilot." />
          <div className="text-center">
            <Link href="/pilot-apply">
              <Button className={cn("h-11 px-6 font-bold", redBtn)}>
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
    </div>
  );
}
