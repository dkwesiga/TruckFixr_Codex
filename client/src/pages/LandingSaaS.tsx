import { useState, type CSSProperties } from "react";
import { motion, type Transition } from "framer-motion";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  ShieldCheck,
  Siren,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const colors = {
  fleetBlue: "#0B3C5D",
  fleetNavy: "#00263F",
  orange: "#F37021",
  surface: "#F8F9FF",
  surfaceSoft: "#E5EEFF",
  ink: "#0B1C30",
  muted: "#42474E",
};

type IconItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const riskCards: IconItem[] = [
  {
    icon: Siren,
    title: "Roadside breakdowns",
    description:
      "Unplanned failures can turn a small warning sign into towing, missed loads, and emergency labor.",
  },
  {
    icon: ShieldCheck,
    title: "Missed inspections",
    description:
      "Incomplete pre-trip records create safety exposure and make compliance reviews harder than they need to be.",
  },
  {
    icon: AlertTriangle,
    title: "Ignored fault codes",
    description:
      "A buried sensor issue can snowball into a high-cost engine or emissions repair when nobody has clear next steps.",
  },
];

const workflow: IconItem[] = [
  {
    icon: BrainCircuit,
    title: "Diagnose faster",
    description:
      "TADIS turns symptoms, codes, and vehicle history into ranked guidance your team can act on.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspect properly",
    description:
      "Drivers complete focused inspection flows that capture defects before dispatch pressure takes over.",
  },
  {
    icon: BarChart3,
    title: "Track compliance",
    description:
      "Managers get a readiness view with inspection status, urgent issues, and repair follow-up in one place.",
  },
  {
    icon: Wrench,
    title: "Act early",
    description:
      "Prioritize trucks before small defects become avoidable downtime or repeat shop visits.",
  },
];

const featureBlocks = [
  {
    label: "AI diagnostics",
    title: "Real-time fault analysis without the guesswork",
    description:
      "Combine driver symptoms, fault codes, inspection context, and repair history into a structured diagnostic brief with confidence, risks, and next tests.",
    bullets: [
      "Top likely cause and ranked alternatives",
      "Driver action guidance for the current risk",
      "Parts and labor direction after verification",
    ],
  },
  {
    label: "Daily inspections",
    title: "DOT-ready records for the work happening in the yard",
    description:
      "Keep inspection capture simple for drivers while giving managers clean records for follow-up, audit trails, and maintenance planning.",
    bullets: [
      "Mobile-first driver reporting",
      "Defect status and action tracking",
      "Fleet readiness signals before dispatch",
    ],
  },
];

const fleetRows = [
  ["Unit 487964", "Cooling fault", "Hold dispatch", "Critical"],
  ["Unit 330184", "Inspection due", "Driver follow-up", "Attention"],
  ["Unit 219782", "Battery voltage", "Monitor", "Stable"],
];

const metrics = [
  ["89%", "Fleet healthy"],
  ["3", "Urgent issues"],
  ["7", "Inspections due"],
];

const pricingPlans = [
  {
    name: "Starter",
    trucks: "2-5 trucks",
    price: "$99",
    description: "For owner-operators and small teams standardizing inspections.",
    features: ["Daily inspections", "Basic TADIS diagnostics", "Morning fleet summary", "Email support"],
    highlighted: false,
  },
  {
    name: "Growth",
    trucks: "6-10 trucks",
    price: "$249",
    description: "For growing teams that need stronger visibility and follow-up.",
    features: ["Everything in Starter", "Advanced reporting", "Maintenance history", "Truck health trends"],
    highlighted: true,
  },
  {
    name: "Fleet",
    trucks: "11-20 trucks",
    price: "$499",
    description: "For operators coordinating more trucks, people, and defects.",
    features: ["Everything in Growth", "Custom inspection templates", "Unlimited team members", "Priority support"],
    highlighted: false,
  },
];

const faqs = [
  {
    question: "What does TruckFixr help fleets do day to day?",
    answer:
      "TruckFixr helps drivers complete inspections, report issues clearly, and start diagnosis quickly. Managers get one operating view for readiness, urgent defects, and inspection follow-up.",
  },
  {
    question: "How does the AI-assisted diagnosis work?",
    answer:
      "TruckFixr combines symptoms, fault codes, vehicle context, and maintenance signals to suggest urgency and likely next actions. It supports decisions while keeping the final repair judgment with your team or shop.",
  },
  {
    question: "Is this built for trucking workflows specifically?",
    answer:
      "Yes. The product language, inspection flows, driver actions, and manager views are tailored for truck readiness, dispatch risk, and fleet maintenance coordination.",
  },
  {
    question: "Can drivers and managers use the same system?",
    answer:
      "Yes. Drivers get focused inspection and diagnosis workflows, while managers get fleet-level readiness, defect prioritization, and operational oversight.",
  },
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
      "rounded bg-slate-950 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
  },
  {
    name: "DMZ",
    href: "https://www.dmzlaunchpad.ca/",
    description: "Startup acceleration and venture support for high-growth founders.",
    logoSrc: "/partner-dmz.png",
    logoAlt: "DMZ logo",
    logoClassName: "h-11 w-auto",
    logoWrapperClassName: "rounded bg-slate-100 px-4 py-3",
  },
];

const revealTransition: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: revealTransition,
};

function StatusPill({ level }: { level: string }) {
  const className =
    level === "Critical"
      ? "bg-red-100 text-red-700"
      : level === "Attention"
        ? "bg-orange-100 text-orange-700"
        : "bg-emerald-100 text-emerald-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{level}</span>;
}

function FleetCommandMockup() {
  return (
    <div className="relative mx-auto max-w-[620px]">
      <div className="absolute -inset-5 rounded-[2rem] bg-[#F37021]/10 blur-3xl" />
      <div className="relative rotate-1 overflow-hidden rounded-lg border border-[#7FA7CD]/30 bg-[#0B3C5D] p-2 shadow-[0_34px_80px_-40px_rgba(0,38,63,0.85)]">
        <div className="rounded-md border border-white/10 bg-[#071E32]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#A3CBF2]">
                Fleet Operations Center
              </p>
              <h3 className="mt-1 font-['Work_Sans'] text-lg font-bold text-white">
                Morning readiness
              </h3>
            </div>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
              Live
            </span>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[0.9fr_1.3fr]">
            <div className="space-y-3">
              {metrics.map(([value, label]) => (
                <div key={label} className="rounded border border-white/10 bg-white/[0.06] p-4">
                  <p className="font-['Work_Sans'] text-3xl font-black text-white">{value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-300">{label}</p>
                </div>
              ))}
            </div>

            <div className="rounded border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-['Work_Sans'] text-sm font-bold text-white">Action queue</p>
                  <p className="text-xs text-slate-300">Trucks affecting dispatch readiness</p>
                </div>
                <Gauge className="h-5 w-5 text-[#F37021]" />
              </div>
              <div className="mt-4 space-y-3">
                {fleetRows.map(([unit, issue, action, level]) => (
                  <div
                    key={unit}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded border border-white/10 bg-[#0B1C30]/70 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-white">{unit}</p>
                      <p className="text-xs text-slate-300">{issue}</p>
                    </div>
                    <div className="text-right">
                      <StatusPill level={level} />
                      <p className="mt-2 text-xs text-slate-400">{action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#00263F] px-5 py-4">
            <div className="flex items-start gap-3">
              <BrainCircuit className="mt-1 h-5 w-5 text-[#F37021]" />
              <p className="text-sm leading-6 text-slate-200">
                TADIS flags Unit 487964 as likely cooling-system risk. Hold dispatch,
                inspect coolant level, belt tension, fan response, and recent repair history.
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-4 hidden rounded bg-[#F37021] px-5 py-4 text-white shadow-xl lg:block">
        <p className="font-['Work_Sans'] text-3xl font-black">30%</p>
        <p className="text-xs font-bold uppercase tracking-[0.12em]">Downtime target</p>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  center = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  center?: boolean;
}) {
  return (
    <motion.div {...fadeUp} className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">{eyebrow}</p>
      <h2 className="mt-3 font-['Work_Sans'] text-3xl font-black tracking-[-0.03em] text-[#00263F] sm:text-4xl">
        {title}
      </h2>
      {description ? <p className="mt-4 text-base leading-8 text-[#42474E]">{description}</p> : null}
    </motion.div>
  );
}

export default function LandingSaaS() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  return (
    <div
      className="min-h-screen bg-[#F8F9FF] text-[#0B1C30] [font-family:'Inter',sans-serif]"
      style={
        {
          "--fleet-blue": colors.fleetBlue,
          "--fleet-navy": colors.fleetNavy,
          "--truckfixr-orange": colors.orange,
          "--truckfixr-surface": colors.surface,
          "--truckfixr-surface-soft": colors.surfaceSoft,
          "--truckfixr-ink": colors.ink,
          "--truckfixr-muted": colors.muted,
        } as CSSProperties
      }
    >
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <AppLogo imageClassName="h-9" frameClassName="rounded p-1.5" />
            <div className="leading-none">
              <p className="font-['Work_Sans'] text-base font-black uppercase tracking-[-0.04em] text-[#00263F]">
                TruckFixr
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#A04100]">
                Fleet AI
              </p>
            </div>
          </a>

          <nav className="hidden items-center gap-8 md:flex">
            {[
              ["Product", "#product"],
              ["How it works", "#how-it-works"],
              ["Pricing", "#pricing"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="font-['Work_Sans'] text-xs font-bold uppercase tracking-[0.08em] text-slate-600 transition-colors hover:text-[#F37021]"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded border-[#00263F] bg-white px-3 font-['Work_Sans'] text-xs font-bold text-[#00263F] hover:bg-[#E5EEFF] sm:px-4 sm:text-sm"
            >
              <a href="/auth/email">Sign In</a>
            </Button>
            <Button
              asChild
              className="rounded bg-[#F37021] px-3 font-['Work_Sans'] text-xs font-bold text-white hover:bg-[#A04100] sm:px-5 sm:text-sm"
            >
              <a href="/signup">
                Sign Up
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-slate-200 bg-[linear-gradient(135deg,#F8F9FF_0%,#E5EEFF_100%)]">
          <div className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 bg-[radial-gradient(circle,#CBD5E1_1px,transparent_1px)] bg-[length:24px_24px] opacity-50 lg:block" />
          <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-20">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={revealTransition}
              className="max-w-2xl"
            >
              <p className="inline-flex rounded bg-[#00263F] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                Fleet Intelligence Engine
              </p>
              <h1 className="mt-6 font-['Work_Sans'] text-5xl font-black leading-[0.95] tracking-[-0.06em] text-[#00263F] sm:text-6xl lg:text-7xl">
                Stop guessing. Start moving.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#42474E]">
                Daily inspections, AI-assisted diagnostics, and real-time fleet visibility
                help you catch issues before they become downtime.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="rounded bg-[#F37021] px-8 font-['Work_Sans'] text-base font-bold text-white shadow-[0_18px_35px_-22px_rgba(243,112,33,0.9)] hover:bg-[#A04100]"
                >
                  <a href="/signup">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded border-2 border-[#00263F] bg-transparent px-8 font-['Work_Sans'] text-base font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
                >
                  <a href="#how-it-works">See How It Works</a>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 text-sm text-[#42474E] sm:grid-cols-2">
                {[
                  "Driver inspection workflows",
                  "AI-assisted defect triage",
                  "Fleet readiness visibility",
                  "Compliance-friendly records",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#F37021]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 26, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...revealTransition, delay: 0.08 }}
            >
              <FleetCommandMockup />
            </motion.div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Cost of inaction"
              title="The high cost of wait-and-see maintenance"
              description="Delayed maintenance and manual tracking are expensive liabilities for trucks that need to stay ready."
              center
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {riskCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  {...fadeUp}
                  transition={{ ...revealTransition, delay: index * 0.08 }}
                  className="group rounded-lg border border-slate-200 bg-[#F8F9FF] p-7 transition-colors hover:border-[#F37021]"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <card.icon className="h-9 w-9 text-[#BA1A1A]" />
                    <span className="rounded bg-red-100 px-2 py-1 text-xs font-black uppercase tracking-[0.1em] text-red-700">
                      Risk
                    </span>
                  </div>
                  <h3 className="font-['Work_Sans'] text-xl font-black text-[#00263F]">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#42474E]">{card.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#00263F] px-4 py-16 text-white sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...fadeUp} className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                Operational system of record
              </p>
              <h2 className="mt-3 font-['Work_Sans'] text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                One loop for inspection, diagnosis, and action.
              </h2>
            </motion.div>
            <div className="relative mt-14 grid gap-8 md:grid-cols-4">
              <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/15 md:block" />
              {workflow.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp}
                  transition={{ ...revealTransition, delay: index * 0.08 }}
                  className="relative text-center"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F37021] text-white shadow-[0_0_0_8px_#00263F]">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 font-['Work_Sans'] text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-blue-100/80">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px] space-y-20">
            {featureBlocks.map((feature, index) => (
              <motion.div
                key={feature.title}
                {...fadeUp}
                className={`grid gap-10 lg:grid-cols-2 lg:items-center ${index % 2 ? "lg:[&>div:first-child]:order-2" : ""}`}
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">{feature.label}</p>
                  <h2 className="mt-3 font-['Work_Sans'] text-3xl font-black tracking-[-0.03em] text-[#00263F] sm:text-4xl">
                    {feature.title}
                  </h2>
                  <p className="mt-4 text-base leading-8 text-[#42474E]">{feature.description}</p>
                  <div className="mt-6 space-y-3">
                    {feature.bullets.map((bullet) => (
                      <div key={bullet} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFDBCB] text-[#A04100]">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-sm font-medium text-[#0B1C30]">{bullet}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
                  <div className="rounded-md bg-[#E5EEFF] p-5">
                    <div className="flex items-center justify-between">
                      <p className="font-['Work_Sans'] text-sm font-black uppercase tracking-[0.12em] text-[#00263F]">
                        {feature.label}
                      </p>
                      <Sparkles className="h-5 w-5 text-[#F37021]" />
                    </div>
                    <div className="mt-8 grid gap-3">
                      {feature.bullets.map((bullet, bulletIndex) => (
                        <div key={bullet} className="rounded border border-[#C2C7CE] bg-white px-4 py-3">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-[#00263F]">{bullet}</p>
                            <span className="text-xs font-black text-[#F37021]">0{bulletIndex + 1}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <SectionHeading
              eyebrow="Partners and supporters"
              title="Supported by organizations helping founders build practical operating products."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {supporters.map((supporter) => (
                <a
                  key={supporter.name}
                  href={supporter.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 bg-[#F8F9FF] p-5 transition hover:-translate-y-0.5 hover:border-[#F37021]"
                >
                  <div className="flex h-16 items-center">
                    <div className={supporter.logoWrapperClassName}>
                      <img src={supporter.logoSrc} alt={supporter.logoAlt} className={supporter.logoClassName} />
                    </div>
                  </div>
                  <h3 className="font-['Work_Sans'] text-lg font-black text-[#00263F]">{supporter.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#42474E]">{supporter.description}</p>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Simple pricing"
              title="Start with the fleet size you operate today."
              description="Choose a plan that fits your trucks now, then expand as your inspection and diagnostic workflows mature."
              center
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {pricingPlans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  {...fadeUp}
                  transition={{ ...revealTransition, delay: index * 0.08 }}
                  className={`rounded-lg border p-7 ${
                    plan.highlighted
                      ? "border-[#F37021] bg-[#00263F] text-white shadow-[0_24px_70px_-45px_rgba(0,38,63,0.9)]"
                      : "border-slate-200 bg-white text-[#0B1C30]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-['Work_Sans'] text-2xl font-black">{plan.name}</h3>
                      <p className={plan.highlighted ? "mt-1 text-blue-100" : "mt-1 text-[#42474E]"}>{plan.trucks}</p>
                    </div>
                    {plan.highlighted ? (
                      <span className="rounded-full bg-[#F37021] px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-white">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-7 flex items-end gap-1">
                    <p className="font-['Work_Sans'] text-4xl font-black">{plan.price}</p>
                    <p className={plan.highlighted ? "pb-1 text-blue-100" : "pb-1 text-[#42474E]"}>/month</p>
                  </div>
                  <p className={plan.highlighted ? "mt-4 text-sm leading-6 text-blue-100" : "mt-4 text-sm leading-6 text-[#42474E]"}>
                    {plan.description}
                  </p>
                  <div className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-3">
                        <Check className={plan.highlighted ? "h-4 w-4 text-[#F37021]" : "h-4 w-4 text-[#A04100]"} />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    asChild
                    className={`mt-7 w-full rounded font-['Work_Sans'] font-bold ${
                      plan.highlighted
                        ? "bg-[#F37021] text-white hover:bg-[#A04100]"
                        : "bg-[#00263F] text-white hover:bg-[#0B3C5D]"
                    }`}
                  >
                    <a href="/signup">Start Free Trial</a>
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-4xl">
            <SectionHeading
              eyebrow="FAQ"
              title="Clear answers for fleets evaluating TruckFixr."
              center
            />
            <div className="mt-10 space-y-3">
              {faqs.map((faq, index) => {
                const isOpen = expandedFaq === index;

                return (
                  <motion.button
                    key={faq.question}
                    type="button"
                    {...fadeUp}
                    transition={{ ...revealTransition, delay: index * 0.05 }}
                    onClick={() => setExpandedFaq(isOpen ? null : index)}
                    className="w-full rounded-lg border border-slate-200 bg-[#F8F9FF] px-5 py-5 text-left transition hover:border-[#F37021]"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <p className="font-['Work_Sans'] text-lg font-black text-[#00263F]">{faq.question}</p>
                        {isOpen ? <p className="mt-3 text-sm leading-7 text-[#42474E]">{faq.answer}</p> : null}
                      </div>
                      <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-[#A04100] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:py-24">
          <motion.div
            {...fadeUp}
            className="relative mx-auto max-w-[1200px] overflow-hidden rounded-lg bg-[#00263F] px-6 py-12 text-white sm:px-10 lg:px-12"
          >
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle,#7FA7CD_1px,transparent_1px)] bg-[length:22px_22px] opacity-20 lg:block" />
            <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                  Ready to modernize fleet operations?
                </p>
                <h2 className="mt-4 font-['Work_Sans'] text-3xl font-black tracking-[-0.03em] sm:text-4xl">
                  Keep your trucks road-ready with fewer blind spots.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-8 text-blue-100">
                  Give drivers a faster daily workflow and give managers a clearer command center for defects,
                  diagnostics, and readiness.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button asChild size="lg" className="rounded bg-[#F37021] px-8 font-['Work_Sans'] font-bold text-white hover:bg-[#A04100]">
                  <a href="/signup">
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded border-2 border-white/25 bg-transparent px-8 font-['Work_Sans'] font-bold text-white hover:bg-white hover:text-[#00263F]"
                >
                  <a href="/auth/email">Sign In</a>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-8 text-sm text-[#42474E] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <AppLogo imageClassName="h-8" frameClassName="rounded p-1.5" />
            <span className="font-['Work_Sans'] font-black text-[#00263F]">TruckFixr Fleet AI</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <a href="#product" className="hover:text-[#F37021]">Product</a>
            <a href="#how-it-works" className="hover:text-[#F37021]">How it works</a>
            <a href="#pricing" className="hover:text-[#F37021]">Pricing</a>
            <a href="#faq" className="hover:text-[#F37021]">FAQ</a>
          </div>
          <p>2026 TruckFixr. Fleet AI for modern trucking teams.</p>
        </div>
      </footer>
    </div>
  );
}
