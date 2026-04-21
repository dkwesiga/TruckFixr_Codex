import { useState } from "react";
import { motion, type Transition } from "framer-motion";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

const trustSignals = [
  "Built for owner-operators and small fleet teams",
  "Daily inspection workflows drivers actually complete",
  "AI-assisted triage with audit-friendly reasoning",
  "Operational visibility for compliance and uptime",
];

const supporters = [
  {
    name: "Black Founders Network",
    href: "https://www.blackfounders.network/",
    description: "Startup ecosystem support for Black-led ventures and innovation.",
    logoSrc: "/partner-bfn.svg",
    logoAlt: "Black Founders Network logo",
    logoClassName: "h-12 w-auto",
    logoWrapperClassName:
      "rounded-2xl bg-slate-950 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
  },
  {
    name: "DMZ",
    href: "https://www.dmzlaunchpad.ca/",
    description: "Startup acceleration and venture support for high-growth founders.",
    logoSrc: "/partner-dmz.png",
    logoAlt: "DMZ logo",
    logoClassName: "h-11 w-auto",
    logoWrapperClassName: "rounded-2xl bg-slate-100 px-4 py-3",
  },
];

const outcomes = [
  {
    icon: Truck,
    title: "Reduce roadside breakdowns",
    description:
      "Surface high-risk defects before dispatch and keep maintenance decisions tied to truck readiness.",
  },
  {
    icon: ClipboardCheck,
    title: "Stay inspection-ready",
    description:
      "Standardize pre-trip and post-trip checks with clear records that support safety and compliance reviews.",
  },
  {
    icon: BrainCircuit,
    title: "Triage issues faster",
    description:
      "Turn driver symptoms, fault details, and truck history into prioritized next steps instead of guesswork.",
  },
];

const roleSections = [
  {
    title: "For Drivers",
    icon: Truck,
    points: [
      "Complete daily inspections in a few focused steps",
      "Start diagnosis when a truck is not road-ready",
      "See exactly what to report before downtime spreads",
    ],
  },
  {
    title: "For Fleet Managers",
    icon: Users,
    points: [
      "Monitor readiness, issues, and due inspections in one view",
      "Identify trucks that need action before dispatch",
      "Keep operations, maintenance, and compliance aligned",
    ],
  },
];

const workflow = [
  {
    step: "01",
    title: "Drivers inspect and report",
    description:
      "Drivers complete the daily workflow from the cab, logging defects, notes, and operational context.",
  },
  {
    step: "02",
    title: "TruckFixr prioritizes the issue",
    description:
      "TADIS evaluates severity, likely causes, and recommended next steps so teams know what needs attention first.",
  },
  {
    step: "03",
    title: "Managers act from one operations view",
    description:
      "Fleet leaders review urgent trucks, inspection gaps, and health trends to keep trucks moving safely.",
  },
];

const faqs = [
  {
    question: "What does TruckFixr help fleets do day to day?",
    answer:
      "TruckFixr helps drivers complete inspections, report issues clearly, and start diagnosis quickly. Managers get a single operating view for readiness, urgent defects, and inspection follow-up.",
  },
  {
    question: "How does the AI-assisted diagnosis work?",
    answer:
      "TruckFixr combines driver-reported symptoms, inspection context, and maintenance signals to suggest urgency and likely next actions. It is designed to support decisions, not replace shop-level judgment.",
  },
  {
    question: "Is this built for trucking workflows specifically?",
    answer:
      "Yes. The product language, readiness flows, and operational views are tailored for truck inspections, dispatch readiness, and fleet maintenance coordination.",
  },
  {
    question: "Can drivers and managers use the same system?",
    answer:
      "Yes. Drivers get a focused workflow for inspections and truck readiness, while managers get a broader fleet operations view with issue prioritization and oversight.",
  },
];

const revealTransition: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: revealTransition,
};

function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="absolute inset-x-12 top-8 h-40 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-[0_36px_120px_-48px_rgba(15,23,42,0.9)]">
        <div className="border-b border-white/10 bg-slate-900/90 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                Fleet Operations Center
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">
                Morning readiness across active trucks
              </h3>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              89% fleet healthy
            </span>
          </div>
        </div>

        <div className="grid gap-4 bg-slate-950 px-5 py-5 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Active trucks", "24", "+3 from last week"],
                ["Critical issues", "3", "2 need dispatch hold"],
                ["Inspections due", "7", "Before 10:00 AM"],
              ].map(([label, value, hint]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-xs text-slate-400">{hint}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Needs immediate attention</p>
                  <p className="text-xs text-slate-400">
                    Trucks affecting dispatch readiness
                  </p>
                </div>
                <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-200">
                  3 urgent
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["Truck 42", "Coolant temp spike detected", "Critical"],
                  ["Truck 18", "Brake inspection overdue", "Attention"],
                  ["Truck 07", "Battery voltage unstable", "Monitor"],
                ].map(([truck, issue, level]) => (
                  <div
                    key={truck}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-900/70 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{truck}</p>
                      <p className="text-xs text-slate-400">{issue}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        level === "Critical"
                          ? "bg-red-500/15 text-red-200"
                          : level === "Attention"
                            ? "bg-amber-500/15 text-amber-200"
                            : "bg-blue-500/15 text-blue-200"
                      }`}
                    >
                      {level}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
              <div className="flex items-center gap-2 text-blue-100">
                <BrainCircuit className="h-4 w-4" />
                <p className="text-sm font-semibold">AI diagnosis brief</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Likely cooling system failure on Truck 42. Recommend pulling from
                dispatch, checking coolant level, belt tension, and fan response.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Driver workflow</p>
              <div className="mt-4 space-y-3">
                {[
                  {
                    label: "Pre-trip inspection",
                    status: "Completed",
                    complete: true,
                  },
                  {
                    label: "Readiness confirmation",
                    status: "Pending manager review",
                    complete: false,
                  },
                  {
                    label: "Diagnosis started",
                    status: "Symptoms logged",
                    complete: true,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${
                        item.complete
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                          : "border-slate-700 bg-slate-900 text-slate-400"
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-slate-400">{item.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingSaaS() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <AppLogo
              imageClassName="h-10"
              frameClassName="p-1.5"
            />
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-950">TruckFixr</p>
              <p className="text-xs text-slate-500">Fleet uptime software</p>
            </div>
          </a>

          <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#benefits" className="transition-colors hover:text-slate-950">
              Benefits
            </a>
            <a href="#roles" className="transition-colors hover:text-slate-950">
              Teams
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-slate-950">
              How it works
            </a>
            <a href="#faq" className="transition-colors hover:text-slate-950">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="hidden text-slate-700 sm:inline-flex">
              <a href="/auth/email">Sign In</a>
            </Button>
            <Button
              asChild
              className="rounded-full bg-blue-600 px-5 text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.8)] hover:bg-blue-700"
            >
              <a href="/signup">
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-14 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:py-28">
            <motion.div
              className="flex flex-col justify-center"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.22em] text-slate-300">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
                Fleet uptime and inspection compliance
              </span>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Reduce truck downtime and keep every day road-ready.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                TruckFixr gives drivers a faster inspection workflow and gives fleet
                managers a clear operating picture for readiness, diagnostics, and
                urgent maintenance decisions.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full bg-blue-600 px-6 text-white hover:bg-blue-700">
                  <a href="/signup">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-white/15 bg-white/5 px-6 text-white hover:bg-white/10"
                >
                  <a href="/auth/email">See the product</a>
                </Button>
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {[
                  "Daily inspections drivers can finish quickly",
                  "AI-assisted defect triage with clear next steps",
                  "Fleet visibility built for dispatch readiness",
                  "Operational records that support compliance reviews",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                    <p className="text-sm text-slate-200">{item}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              className="flex items-center"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <ProductMockup />
            </motion.div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white/80">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-4">
              {trustSignals.map((signal) => (
                <div
                  key={signal}
                  className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"
                >
                  {signal}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200/80 bg-slate-50/80">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="section-label">Partners and supporters</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Supported by organizations helping innovative founders build real operating products.
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[540px]">
                {supporters.map((supporter) => (
                  <a
                    key={supporter.name}
                    href={supporter.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                  >
                    <div className="flex h-16 items-center">
                      <div className={supporter.logoWrapperClassName}>
                      <img
                        src={supporter.logoSrc}
                        alt={supporter.logoAlt}
                        className={supporter.logoClassName}
                      />
                      </div>
                    </div>
                    <p className="text-base font-semibold text-slate-950">{supporter.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{supporter.description}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="benefits" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="max-w-3xl">
            <p className="section-label">Why fleets choose TruckFixr</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Operational software shaped around readiness, defects, and uptime.
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              The product is designed to help teams answer two questions quickly:
              what needs attention, and what should happen next?
            </p>
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {outcomes.map((outcome, index) => (
              <motion.div
                key={outcome.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.08 }}
                className="saas-card p-7"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <outcome.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-slate-950">{outcome.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{outcome.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="roles" className="border-y border-slate-200/80 bg-white/70">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="max-w-3xl">
              <p className="section-label">Built for the people doing the work</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Role-based workflows for drivers in the field and managers in the office.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              {roleSections.map((role, index) => (
                <motion.div
                  key={role.title}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: index * 0.08 }}
                  className="saas-card p-8"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <role.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-semibold text-slate-950">{role.title}</h3>
                  </div>
                  <div className="mt-6 space-y-4">
                    {role.points.map((point) => (
                      <div key={point} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <p className="text-sm leading-7 text-slate-600">{point}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="max-w-3xl">
            <p className="section-label">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              A simple operating loop for daily inspections and issue response.
            </h2>
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {workflow.map((item, index) => (
              <motion.div
                key={item.step}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.08 }}
                className="saas-card p-7"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white">
                  {item.step}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-slate-950">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="faq" className="border-t border-slate-200/80 bg-white/80">
          <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="max-w-2xl">
              <p className="section-label">FAQ</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Clear answers for fleets evaluating TruckFixr.
              </h2>
            </motion.div>

            <div className="mt-10 space-y-4">
              {faqs.map((faq, index) => {
                const isOpen = expandedFaq === index;

                return (
                  <motion.button
                    key={faq.question}
                    type="button"
                    {...fadeUp}
                    transition={{ ...fadeUp.transition, delay: index * 0.05 }}
                    onClick={() => setExpandedFaq(isOpen ? null : index)}
                    className="saas-card w-full px-6 py-5 text-left"
                  >
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">{faq.question}</p>
                        {isOpen ? (
                          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                            {faq.answer}
                          </p>
                        ) : null}
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            {...fadeUp}
            className="overflow-hidden rounded-[32px] border border-slate-200 bg-slate-950 px-8 py-10 text-white shadow-[0_24px_70px_-45px_rgba(15,23,42,0.7)] sm:px-10 sm:py-12"
          >
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <p className="section-label border-white/10 bg-white/5 text-slate-300">
                  Ready to modernize fleet operations?
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Give drivers a faster daily workflow and give managers a clearer operations center.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                  Start with inspections, diagnostics, and readiness visibility in one product built
                  for trucking teams.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
                <Button asChild size="lg" className="rounded-full bg-blue-600 px-6 text-white hover:bg-blue-700">
                  <a href="/signup">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-white/15 bg-white/5 px-6 text-white hover:bg-white/10"
                >
                  <a href="/auth/email">Sign In</a>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 text-sm text-slate-500 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <AppLogo imageClassName="h-8" frameClassName="p-1.5" />
            <span>TruckFixr</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#benefits" className="hover:text-slate-950">
              Benefits
            </a>
            <a href="#roles" className="hover:text-slate-950">
              Teams
            </a>
            <a href="#faq" className="hover:text-slate-950">
              FAQ
            </a>
          </div>
          <p>2026 TruckFixr. Fleet uptime software for modern trucking teams.</p>
        </div>
      </footer>
    </div>
  );
}
