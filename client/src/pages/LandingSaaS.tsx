import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { motion, type Transition } from "framer-motion";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { trackEvent } from "@/lib/analytics";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  ShieldCheck,
  Siren,
  Sparkles,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const colors = {
  fleetBlue: "#0B3C5D",
  fleetNavy: "#00263F",
  orange: "#E32636",
  surface: "#F6F8FC",
  surfaceSoft: "#E8EEF8",
  ink: "#0B1C30",
  muted: "#42474E",
};

type ContentCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};


const solutionCards: ContentCard[] = [
  {
    icon: BrainCircuit,
    title: "AI Repair Decision Engine",
    description:
      "Turns symptoms, inspection defects, photos, fault codes, and repair history into severity, likely causes, and the next best maintenance action.",
  },
  {
    icon: ClipboardCheck,
    title: "Driver issue reporting",
    description:
      "Drivers report smoke, vibration, warning lights, air leaks, brake concerns, overheating, DEF/DPF issues, and trailer defects from a mobile flow.",
  },
  {
    icon: Gauge,
    title: "Fleet risk dashboard",
    description:
      "Owners see which vehicles are normal, need attention, or are high risk before dispatch decisions create expensive downtime.",
  },
  {
    icon: Truck,
    title: "Shop-ready repair reports",
    description:
      "Send mechanics a structured symptom story with urgency, likely causes, inspection context, and prior repair clues instead of vague complaints.",
  },
];

const repairDecisionSteps = [
  "Driver report",
  "AI questions",
  "Severity score",
  "Likely causes",
  "Recommended action",
  "Shop-ready report",
  "Fleet risk dashboard",
];

const steps = [
  {
    step: "1",
    title: "Capture the issue",
    description:
      "Drivers or managers report symptoms, warning lights, fault codes, photos, voice notes, or inspection defects from a mobile-friendly flow.",
  },
  {
    step: "2",
    title: "Analyze the risk",
    description:
      "TruckFixr connects the issue to vehicle details, inspection history, repair history, and diagnostic patterns so the signal is easier to read.",
  },
  {
    step: "3",
    title: "Decide what to do next",
    description:
      "The owner gets severity, likely causes, risk if ignored, and a clear recommendation: monitor, inspect, schedule repair, stop, or escalate.",
  },
];

const platformFeatures: ContentCard[] = [
  {
    icon: BrainCircuit,
    title: "AI Diagnostics",
    description:
      "Driver symptoms, photos, voice notes, fault codes, likely causes, severity, and repair recommendations.",
  },
  {
    icon: Truck,
    title: "Vehicle & Trailer Management",
    description:
      "Track trucks, trailers, VINs, service records, mileage, ownership details, and asset status.",
  },
  {
    icon: ClipboardCheck,
    title: "Inspections & DVIR",
    description:
      "Capture driver inspections, defects, recurring issues, and inspection history.",
  },
  {
    icon: Gauge,
    title: "Maintenance Scheduling",
    description:
      "Set preventive maintenance reminders and track upcoming service needs.",
  },
  {
    icon: Wrench,
    title: "Repair History",
    description:
      "Upload invoices, record repairs, identify repeat failures, and maintain service records.",
  },
  {
    icon: Sparkles,
    title: "Service Requests",
    description:
      "Create, assign, and track repair actions from reported issues.",
  },
  {
    icon: Siren,
    title: "Fleet Dashboard",
    description:
      "See which vehicles are normal, need attention, or are high risk.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance Support",
    description:
      "Maintain inspection and maintenance records for better audit readiness.",
  },
  {
    icon: BrainCircuit,
    title: "ELD / Telematics",
    description:
      "Premium integrations can support fault-code capture, mileage-based triggers, and automated reporting.",
  },
];

const comparisonRows = [
  ["Store vehicle records", "Identifies risky trucks"],
  ["Track inspections", "Interprets defects and symptoms"],
  ["Create work orders", "Recommends repair urgency"],
  ["Manage maintenance tasks", "Helps prevent surprise breakdowns"],
  ["Require manual judgment", "AI guides the next best action"],
];

const pilotIncludes = [
  "Fleet setup",
  "Vehicle and trailer onboarding",
  "Driver issue reporting",
  "AI diagnostic reports",
  "Inspection intelligence",
  "Repair-priority dashboard",
  "End-of-pilot review",
];


const faqItems = [
  {
    question: "Who is TruckFixr built for?",
    answer:
      "TruckFixr is built for owner-led trucking fleets, owner-operators, fleet managers, drivers, repair shops, and growing fleets that need a simple way to manage inspections, diagnostics, maintenance, and repair history.",
  },
  {
    question: "How quickly can my fleet get started?",
    answer:
      "You can create an account, add your first truck, and complete a daily inspection in under 10 minutes. Drivers access TruckFixr from any mobile browser with no app download required.",
  },
  {
    question: "How does the AI-assisted diagnosis work?",
    answer:
      "TruckFixr combines symptoms, fault codes, vehicle context, inspections, and maintenance signals to suggest urgency and likely next actions. Final judgment stays with your team or repair shop.",
  },
  {
    question: "Does this replace a licensed inspection or a mechanic's judgment?",
    answer:
      "No. TruckFixr supports maintenance and inspection readiness; it does not replace professional judgment, licensed inspections, or regulatory compliance obligations.",
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

function SectionHeading({
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
    <motion.div {...fadeUp} className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow ? (
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">{eyebrow}</p>
      ) : null}
      <h2 className={`${eyebrow ? "mt-3" : ""} font-['Manrope'] text-3xl font-black tracking-[-0.03em] text-[#00263F] sm:text-4xl`}>
        {title}
      </h2>
      {description ? <p className="mt-4 text-base leading-8 text-[#42474E]">{description}</p> : null}
    </motion.div>
  );
}

function FeatureCard({ card }: { card: ContentCard }) {
  return (
    <div className="h-full rounded-2xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
      <card.icon className="h-8 w-8 text-[#E32636]" />
      <h3 className="mt-5 font-['Manrope'] text-xl font-black text-[#00263F]">{card.title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#42474E]">{card.description}</p>
    </div>
  );
}


function DemoRequestForm() {
  const leadMutation = trpc.leads.submitDemoRequest.useMutation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const startTrackedRef = useRef(false);
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    fleetSize: "",
    biggestMaintenanceChallenge: "",
    website: "",
  });
  const challengeTooShort = form.biggestMaintenanceChallenge.trim().length > 0 && form.biggestMaintenanceChallenge.trim().length < 10;

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
    if (!startTrackedRef.current) {
      startTrackedRef.current = true;
      setHasStarted(true);
      trackEvent("demo_form_started", {
        source_page: trackingContext.sourcePage,
      });
    }
  };

  const handleChange = (field: string, value: string) => {
    markStarted();
    setErrorMessage(null);
    setSuccessMessage(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    markStarted();

    if (form.biggestMaintenanceChallenge.trim().length < 10) {
      setSuccessMessage(null);
      setErrorMessage("Please describe your biggest maintenance challenge in at least 10 characters.");
      return;
    }

    try {
      const result = await leadMutation.mutateAsync({
        fullName: form.fullName,
        companyName: form.companyName,
        email: form.email,
        phone: null,
        fleetSize: form.fleetSize,
        vehicleTypes: null,
        location: null,
        biggestMaintenanceChallenge: form.biggestMaintenanceChallenge,
        interestType: "book_a_demo",
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
      trackEvent("demo_form_submitted", {
        source_page: trackingContext.sourcePage,
        interest_type: "book_a_demo",
      });
      setForm({
        fullName: "",
        companyName: "",
        email: "",
        fleetSize: "",
        biggestMaintenanceChallenge: "",
        website: "",
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message = rawMessage.includes("biggestMaintenanceChallenge")
        ? "Please describe your biggest maintenance challenge in at least 10 characters."
        : rawMessage.includes("email")
          ? "Please enter a valid email address."
          : "We could not submit your request. Please try again or contact info@truckfixr.com.";
      setSuccessMessage(null);
      setErrorMessage(message);
      trackEvent("lead_form_submission_failed", {
        source_page: trackingContext.sourcePage,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        className="absolute left-[-9999px] h-px w-px opacity-0"
        name="website"
        onChange={(event) => handleChange("website", event.target.value)}
        value={form.website}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-[#00263F]">
            Full name *
          </Label>
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(event) => handleChange("fullName", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="Jordan Smith"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyName" className="text-[#00263F]">
            Company name *
          </Label>
          <Input
            id="companyName"
            value={form.companyName}
            onChange={(event) => handleChange("companyName", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="Brampton Freight Inc."
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[#00263F]">
            Email *
          </Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => handleChange("email", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="name@company.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fleetSize" className="text-[#00263F]">
            Fleet size *
          </Label>
          <select
            id="fleetSize"
            value={form.fleetSize}
            onChange={(event) => handleChange("fleetSize", event.target.value)}
            className="h-11 w-full rounded-lg border border-[#BFD0E7] bg-[#F8FAFD] px-3 text-sm text-[#0B1C30]"
            required
          >
            <option value="">Select fleet size</option>
            <option value="1-2 vehicles">1-2 vehicles</option>
            <option value="3-5 vehicles">3-5 vehicles</option>
            <option value="6-10 vehicles">6-10 vehicles</option>
            <option value="11-20 vehicles">11-20 vehicles</option>
            <option value="21-50 vehicles">21-50 vehicles</option>
            <option value="50+ vehicles">50+ vehicles</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="biggestMaintenanceChallenge" className="text-[#00263F]">
          Biggest maintenance challenge *
        </Label>
        <Textarea
          id="biggestMaintenanceChallenge"
          value={form.biggestMaintenanceChallenge}
          onChange={(event) => handleChange("biggestMaintenanceChallenge", event.target.value)}
          className="min-h-28 border-[#BFD0E7] bg-[#F8FAFD]"
          placeholder="What is creating breakdowns, repeat repairs, inspection follow-up headaches, or repair-decision delays?"
          required
          minLength={10}
        />
        <p className={`text-xs ${challengeTooShort ? "text-[#BC1E2C]" : "text-[#6B7280]"}`}>
          Please use at least 10 characters so we can understand the issue clearly.
        </p>
      </div>

      <div className="rounded-2xl border border-[#D8E2F0] bg-[#F8FAFD] p-4 text-sm text-[#42474E]">
        {hasStarted ? "Thanks for taking a look. We'll follow up within one business day." : "Tell us about your fleet and we'll follow up about the 90-day pilot or a product demo."}
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <Button
        type="submit"
        className="w-full rounded-full bg-[#E32636] px-6 py-6 font-['Manrope'] text-base font-bold text-white shadow-[0_18px_35px_-22px_rgba(227,38,54,0.72)] hover:bg-[#BC1E2C]"
        disabled={
          leadMutation.isPending ||
          !form.fullName.trim() ||
          !form.companyName.trim() ||
          !form.email.trim() ||
          !form.fleetSize.trim() ||
          form.biggestMaintenanceChallenge.trim().length < 10
        }
      >
        {leadMutation.isPending ? "Sending..." : "Apply for Pilot / Demo"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export default function LandingSaaS() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const handleLeadCtaClick = (location: string) => {
    trackEvent("book_demo_cta_clicked", {
      cta_location: location,
    });
  };

  return (
    <div
      className="app-shell min-h-screen text-[#0B1C30] [font-family:'Inter',sans-serif]"
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
      <header className="sticky top-0 z-50 border-b border-[var(--fleet-outline)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center">
            <AppLogo variant="full" imageClassName="h-8 w-auto sm:h-10" />
          </a>

          <nav className="hidden items-center gap-6 lg:flex">
            {[
              ["Pilot", "#pilot"],
              ["Features", "#features"],
              ["How It Works", "#how-it-works"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="font-['Manrope'] text-xs font-bold uppercase tracking-[0.08em] text-[var(--fleet-muted)] transition-colors hover:text-[#E32636]"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-full border-[#00263F] bg-white px-3 font-['Manrope'] text-xs font-bold text-[#00263F] hover:border-[#E32636] hover:bg-[#F4F7FD] sm:px-4 sm:text-sm"
            >
              <a href="/auth/email">Sign In</a>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#E32636] px-3 font-['Manrope'] text-xs font-bold text-white hover:bg-[#BC1E2C] sm:px-5 sm:text-sm"
            >
              <a href="#pilot" onClick={() => handleLeadCtaClick("nav_pilot")}>Start Pilot</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-[var(--fleet-outline)] bg-[linear-gradient(140deg,#F7F9FC_0%,#E9EEF7_52%,#FDEDEF_100%)]">
          <div className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 bg-[radial-gradient(circle,#C7D2E2_1px,transparent_1px)] bg-[length:24px_24px] opacity-45 lg:block" />
          <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-20">
            <motion.div {...fadeUp} className="max-w-2xl">
              <p className="inline-flex rounded-full bg-[#00263F] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                AI breakdown prevention for small trucking fleets
              </p>
              <h1 className="mt-6 font-['Manrope'] text-5xl font-black leading-[0.95] tracking-[-0.06em] text-[#00263F] sm:text-6xl lg:text-7xl">
                Stop surprise truck breakdowns before they cost you money.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#42474E]">
                TruckFixr Fleet AI helps small trucking fleets turn driver reports, inspections, photos, fault codes, and repair history into clear repair decisions before minor issues become expensive downtime.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#E32636] px-8 py-3 font-['Manrope'] text-base font-bold text-white shadow-[0_18px_35px_-22px_rgba(227,38,54,0.72)] hover:bg-[#BC1E2C] h-auto whitespace-normal text-center leading-snug"
                >
                  <a href="#pilot" onClick={() => handleLeadCtaClick("hero_pilot")}>Start a 90-Day Breakdown Reduction Pilot</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-2 border-[#00263F] bg-transparent px-8 font-['Manrope'] text-base font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
                >
                  <a href="/auth/email">Log In to Your Dashboard</a>
                </Button>
              </div>
              <p className="mt-5 text-sm font-semibold text-[#00263F]">
                Built from real heavy-truck repair workflows for small fleets that cannot afford downtime.
              </p>
              <div className="mt-8 grid gap-3 text-sm text-[#42474E] sm:grid-cols-2">
                {[
                  "Owner-led fleets with 2-25 trucks",
                  "Driver symptom + inspection intelligence",
                  "Shop-ready AI repair reports",
                  "Dashboard, inspections, history, and access preserved",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#E32636]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div {...fadeUp} transition={{ ...revealTransition, delay: 0.08 }}>
              <div className="relative mx-auto max-w-[620px]">
                <div className="absolute -inset-5 rounded-[2rem] bg-[#E32636]/10 blur-3xl" />
                <div className="relative overflow-hidden rounded-[2rem] border border-[#7FA7CD]/30 bg-[#0B3C5D] p-2 shadow-[0_34px_80px_-40px_rgba(0,38,63,0.85)]">
                  <div className="rounded-[1.25rem] border border-white/10 bg-[#071E32] p-5">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#A3CBF2]">
                          Fleet risk dashboard
                        </p>
                        <h2 className="mt-1 font-['Manrope'] text-lg font-bold text-white">
                          Which truck needs attention next?
                        </h2>
                      </div>
                      <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
                        Live
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <div className="space-y-3">
                        {[
                          ["89%", "Fleet healthy"],
                          ["3", "High-risk issues"],
                          ["7", "Inspections due"],
                        ].map(([value, label]) => (
                          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
                            <p className="font-['Manrope'] text-3xl font-black text-white">{value}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-300">{label}</p>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-['Manrope'] text-sm font-bold text-white">Repair decision queue</p>
                            <p className="text-xs text-slate-300">Trucks affecting dispatch readiness</p>
                          </div>
                          <Gauge className="h-5 w-5 text-[#E32636]" />
                        </div>
                        <div className="mt-4 space-y-3">
                          {[
                            ["Unit 487964", "Cooling fault", "Hold dispatch", "Critical"],
                            ["Unit 330184", "Inspection due", "Driver follow-up", "Attention"],
                            ["Unit 219782", "Battery voltage", "Monitor", "Stable"],
                          ].map(([unit, issue, action, level]) => (
                            <div
                              key={unit}
                              className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-white/10 bg-[#0B1C30]/70 px-3 py-3"
                            >
                              <div>
                                <p className="text-sm font-bold text-white">{unit}</p>
                                <p className="text-xs text-slate-300">{issue}</p>
                              </div>
                              <div className="text-right">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                    level === "Critical"
                                      ? "bg-red-100 text-red-700"
                                      : level === "Attention"
                                        ? "bg-orange-100 text-orange-700"
                                        : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {level}
                                </span>
                                <p className="mt-2 text-xs text-slate-400">{action}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-[#00263F] px-4 py-4">
                      <BrainCircuit className="mt-1 h-5 w-5 text-[#E32636]" />
                      <p className="text-sm leading-6 text-slate-200">
                        TruckFixr AI flags a likely cooling-system risk. Hold dispatch, inspect coolant level, belt tension, fan response, and recent repair history.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-b border-[var(--fleet-outline)] bg-white px-4 py-5 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#42474E]">Supported by</p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:justify-start">
              <a
                href="https://dmz.torontomu.ca/black-innovation-summit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-[#00263F] transition-colors hover:text-[#E32636]"
              >
                DMZ · Toronto Metropolitan University
              </a>
              <span className="hidden text-[#C2C7CE] sm:inline">|</span>
              <a
                href="https://entrepreneurs.utoronto.ca/for-entrepreneurs/bfn-scale/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-[#00263F] transition-colors hover:text-[#E32636]"
              >
                BFN Scale · University of Toronto
              </a>
            </div>
          </div>
        </section>

        <section id="solution" className="bg-[var(--fleet-surface)] px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="The AI repair decision engine"
              title="The AI repair decision engine for small trucking fleets."
              description="When a driver reports a problem, TruckFixr asks follow-up questions, scores issue severity, ranks likely causes, recommends the next action, and creates a shop-ready repair report."
              center
            />
            <motion.div {...fadeUp} className="mt-10 rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-5 shadow-[var(--fleet-shadow)]">
              <div className="grid gap-3 md:grid-cols-7">
                {repairDecisionSteps.map((step, index) => (
                  <div key={step} className="relative rounded-2xl bg-[#F6F8FC] p-4 text-center">
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#E32636] font-['Manrope'] text-sm font-black text-white">
                      {index + 1}
                    </div>
                    <p className="mt-3 text-sm font-bold text-[#00263F]">{step}</p>
                  </div>
                ))}
              </div>
            </motion.div>
            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {solutionCards.map((card, index) => (
                <motion.div key={card.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.04 }}>
                  <FeatureCard card={card} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="border-y border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Full platform"
              title="Everything your fleet needs to manage maintenance in one place."
              description="The new positioning does not hide existing TruckFixr tools. The platform still supports the broader workflow your team uses to manage vehicles, inspections, diagnostics, maintenance, repair history, service requests, and access."
              center
            />
            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {platformFeatures.map((card, index) => (
                <motion.div key={card.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.03 }}>
                  <FeatureCard card={card} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#00263F] px-4 py-16 text-white sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...fadeUp} className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                From driver report to repair decision in minutes
              </p>
              <h2 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                Three steps from symptom to action.
              </h2>
            </motion.div>
            <div className="relative mt-14 grid gap-8 md:grid-cols-3">
              <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/15 md:block" />
              {steps.map((item, index) => (
                <motion.div key={item.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.08 }} className="relative text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E32636] text-white shadow-[0_0_0_8px_#00263F]">
                    <span className="font-['Manrope'] text-xl font-black">{item.step}</span>
                  </div>
                  <h3 className="mt-5 font-['Manrope'] text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-blue-100/80">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="difference" className="border-y border-[var(--fleet-outline)] bg-[#F6F8FC] px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Clear differentiation"
              title="Traditional fleet software records problems. TruckFixr helps you decide what to do next."
              center
            />
            <motion.div {...fadeUp} className="mt-12 overflow-hidden rounded-[2rem] border border-[var(--fleet-outline)] bg-white shadow-[var(--fleet-shadow)]">
              <div className="grid bg-[#00263F] text-sm font-black uppercase tracking-[0.12em] text-white md:grid-cols-2">
                <div className="border-b border-white/10 p-5 md:border-b-0 md:border-r md:border-white/10">Traditional fleet apps</div>
                <div className="p-5">TruckFixr Fleet AI</div>
              </div>
              <div className="divide-y divide-[#E0E7F1]">
                {comparisonRows.map(([traditional, truckfixr]) => (
                  <div key={traditional} className="grid gap-0 md:grid-cols-2">
                    <div className="border-b border-[#E0E7F1] p-5 text-sm leading-7 text-[#42474E] md:border-b-0 md:border-r">
                      {traditional}
                    </div>
                    <div className="flex items-center gap-3 p-5 text-sm font-semibold leading-7 text-[#00263F]">
                      <Check className="h-4 w-4 shrink-0 text-[#E32636]" />
                      {truckfixr}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <section id="pilot" className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SectionHeading
              eyebrow="Market-entry offer"
              title="90-Day AI Breakdown Reduction Pilot"
              description="In 90 days, TruckFixr helps your fleet capture driver issues earlier, identify high-risk vehicles, prioritize repairs, and reduce surprise downtime."
            />
            <motion.div {...fadeUp} className="rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)] sm:p-8">
              <h3 className="font-['Manrope'] text-2xl font-black text-[#00263F]">Pilot includes</h3>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {pilotIncludes.map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-2xl bg-[#F6F8FC] p-4 text-sm font-semibold text-[#00263F]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#E32636]" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full bg-[#E32636] px-8 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]">
                  <a href="#book-demo" onClick={() => handleLeadCtaClick("pilot_primary")}>Apply for the 90-Day Pilot</a>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-2 border-[#00263F] px-8 py-3 font-['Manrope'] font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white h-auto whitespace-normal text-center leading-snug">
                  <a href="#book-demo" onClick={() => handleLeadCtaClick("pilot_health_check")}>Run a Free AI Truck Health Check</a>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="book-demo" className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SectionHeading
              eyebrow="Talk to the TruckFixr team"
              title="Apply for the pilot or book a demo"
              description="Tell us about your fleet and we will follow up to show how TruckFixr can support your maintenance workflow, pilot setup, or free AI truck health check."
            />
            <div className="rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)] sm:p-8">
              <DemoRequestForm />
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              title="Common questions from fleet operators."
              center
            />
            <div className="mt-10 space-y-3">
              {faqItems.map((faq, index) => {
                const isOpen = expandedFaq === index;
                return (
                  <motion.button
                    key={faq.question}
                    type="button"
                    {...fadeUp}
                    transition={{ ...revealTransition, delay: index * 0.05 }}
                    onClick={() => setExpandedFaq(isOpen ? null : index)}
                    className="w-full rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] px-5 py-5 text-left shadow-[var(--fleet-shadow)] transition hover:border-[#E32636]"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <p className="font-['Manrope'] text-lg font-black text-[#00263F]">{faq.question}</p>
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
            className="relative mx-auto max-w-[1200px] overflow-hidden rounded-[2rem] bg-[#00263F] px-6 py-12 text-white sm:px-10 lg:px-12"
          >
            <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle,#7FA7CD_1px,transparent_1px)] bg-[length:22px_22px] opacity-20 lg:block" />
            <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <h2 className="font-['Manrope'] text-3xl font-black tracking-[-0.03em] sm:text-4xl">
                  Know which truck is becoming risky before it breaks down.
                </h2>
                <p className="mt-4 text-base leading-8 text-blue-100">
                  TruckFixr helps small trucking fleets detect, diagnose, and act on vehicle issues before they become expensive downtime.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button asChild size="lg" className="rounded-full bg-[#E32636] px-8 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]">
                  <a href="#pilot" onClick={() => handleLeadCtaClick("final_cta_pilot")}>Start a 90-Day Pilot</a>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-2 border-white/25 bg-transparent px-8 font-['Manrope'] font-bold text-white hover:bg-white hover:text-[#00263F]">
                  <a href="/auth/email">Log In</a>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <section className="border-t border-[var(--fleet-outline)] bg-[#F6F8FC]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-4 py-10 text-center sm:px-6">
          <h3 className="font-['Manrope'] text-lg font-bold text-[#00263F]">Already have access?</h3>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="/auth/email"
              className="inline-flex items-center gap-2 rounded-lg border border-[#0B3C5D] px-5 py-2.5 text-sm font-semibold text-[#0B3C5D] transition hover:bg-[#0B3C5D] hover:text-white"
            >
              Sign In
            </a>
            <a
              href="/access/pilot-code"
              className="inline-flex items-center gap-2 rounded-lg border border-[#0B3C5D] px-5 py-2.5 text-sm font-semibold text-[#0B3C5D] transition hover:bg-[#0B3C5D] hover:text-white"
            >
              Enter Pilot Code
            </a>
            <a
              href="/access/driver-invite"
              className="inline-flex items-center gap-2 rounded-lg border border-[#0B3C5D] px-5 py-2.5 text-sm font-semibold text-[#0B3C5D] transition hover:bg-[#0B3C5D] hover:text-white"
            >
              I got a driver invite
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--fleet-outline)] bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-8 text-sm text-[#42474E] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <AppLogo imageClassName="h-8" frameClassName="rounded p-1.5" />
            <span className="font-['Manrope'] font-black text-[#00263F]">TruckFixr Fleet AI</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <a href="#features" className="hover:text-[#E32636]">Features</a>
            <a href="#pilot" className="hover:text-[#E32636]">Pilot</a>
            <a href="/pricing" className="hover:text-[#E32636]">Pricing</a>
            <a href="mailto:info@truckfixr.com" className="hover:text-[#E32636]">info@truckfixr.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
