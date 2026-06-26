import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
  Calculator,
  Check,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  History,
  KeyRound,
  Play,
  Siren,
  Smartphone,
  Truck,
  Users,
  Wrench,
  X,
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

// Vite env var (this app is Vite + tRPC, not Next.js). If a hosted explainer
// video URL is provided at build time, the demo card plays it in a modal;
// otherwise a polished placeholder with a Request Pilot CTA is shown.
const EXPLAINER_VIDEO_URL =
  (import.meta.env.VITE_EXPLAINER_VIDEO_URL as string | undefined) ?? "";

// CTA route map — reuses the app's existing access + lead infrastructure.
// No duplicate routes, no schema changes.
const ROUTES = {
  getStarted: "/pricing",
  pricing: "/pricing",
  requestPilot: "#request-pilot",
  pilotCode: "/access/pilot-code",
  signIn: "/access",
};

type ContentCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const painPoints: ContentCard[] = [
  {
    icon: Siren,
    title: "Issues scattered everywhere",
    description:
      "Vehicle problems live in calls, texts, inspections, fault codes, photos, and memory. Nobody sees the full picture in time.",
  },
  {
    icon: Gauge,
    title: "Slow urgent-vs-wait calls",
    description:
      "Fleet managers lose time deciding what is urgent and what can wait, often with incomplete information.",
  },
  {
    icon: History,
    title: "Incomplete repair history",
    description:
      "When history is thin, repeat issues are harder to catch and technicians rebuild the story every time.",
  },
  {
    icon: ClipboardCheck,
    title: "Defects without follow-through",
    description:
      "Inspection defects are not always connected to a repair decision, the work done, and the proof it was handled.",
  },
];

const benefitCards: ContentCard[] = [
  {
    icon: Siren,
    title: "Catch issues earlier",
    description:
      "Spot recurring defects, high-risk symptoms, overdue issues, and warning signs before they become costly downtime.",
  },
  {
    icon: BrainCircuit,
    title: "Make faster repair decisions",
    description:
      "Use AI triage, severity levels, and recommended actions to decide whether to monitor, schedule repair, pull from service, or escalate.",
  },
  {
    icon: History,
    title: "Build better vehicle history",
    description:
      "Connect inspections, diagnostics, manager decisions, repair notes, costs, and outcomes into one maintenance record.",
  },
];

const featureItems: { icon: LucideIcon; label: string }[] = [
  { icon: ClipboardCheck, label: "Digital inspections" },
  { icon: BrainCircuit, label: "AI triage" },
  { icon: Siren, label: "Early warning flags" },
  { icon: Gauge, label: "Manager repair decisions" },
  { icon: Wrench, label: "Repair status tracking" },
  { icon: History, label: "Repair history" },
  { icon: Truck, label: "Fleet dashboard" },
  { icon: Smartphone, label: "Mobile-friendly reporting" },
  { icon: ClipboardCheck, label: "Photos, notes, fault codes" },
];

const steps = [
  {
    step: "1",
    title: "Report the issue",
    description:
      "Drivers or owner-operators submit inspection defects, symptoms, warning lights, fault codes, notes, or photos.",
  },
  {
    step: "2",
    title: "Run AI triage",
    description:
      "TruckFixr summarizes the issue, identifies likely causes, assigns severity, and recommends next steps.",
  },
  {
    step: "3",
    title: "Decide what happens next",
    description:
      "Fleet managers choose whether to monitor, schedule repair, pull from service, or escalate.",
  },
  {
    step: "4",
    title: "Track the repair",
    description:
      "Follow the issue from open to reviewed, scheduled, completed, and closed.",
  },
  {
    step: "5",
    title: "Build better history",
    description:
      "Every issue, decision, repair note, and outcome strengthens the vehicle's maintenance record.",
  },
];

const demoWorkflow = [
  {
    label: "Driver report",
    body: "ABS warning light on. Brake pedal feels normal. Truck completed route yesterday.",
  },
  {
    label: "AI triage",
    body: "Likely wheel-speed sensor or ABS module communication. Severity: caution. Recommended action: inspect before next dispatch.",
  },
  {
    label: "Manager decision + history",
    body: "Schedule repair, track to completion, and save the outcome to the vehicle's maintenance record.",
  },
];

const whoCards = [
  {
    title: "Owner-operators",
    body: "Track issues, get AI triage support, and build better repair history.",
  },
  {
    title: "Small fleets",
    body: "Connect inspections, defects, repair decisions, and vehicle records in one workflow.",
  },
  {
    title: "Growing commercial fleets",
    body: "See open issues, early warnings, manager decisions, and repair status across vehicles.",
  },
];

const supporters = [
  {
    name: "Black Founders Network",
    href: "https://www.blackfounders.network/",
    logoSrc: "/partner-bfn.svg",
    logoAlt: "Black Founders Network logo",
    logoClassName: "h-8 w-auto",
    logoWrapperClassName: "rounded-xl bg-slate-950 px-3 py-2",
  },
  {
    name: "DMZ",
    href: "https://www.dmzlaunchpad.ca/",
    logoSrc: "/partner-dmz.png",
    logoAlt: "DMZ logo",
    logoClassName: "h-7 w-auto",
    logoWrapperClassName: "rounded-xl bg-slate-100 px-3 py-2",
  },
];

const faqItems = [
  {
    question: "What does TruckFixr do?",
    answer:
      "TruckFixr helps fleets connect inspections, driver reports, fault codes, AI triage, repair decisions, and vehicle history in one maintenance workflow.",
  },
  {
    question: "Is TruckFixr a replacement for a mechanic?",
    answer:
      "No. TruckFixr provides maintenance decision support. Repairs and final judgment stay with your qualified technicians and shop.",
  },
  {
    question: "What does AI triage do?",
    answer:
      "It reviews symptoms, inspection defects, fault codes, notes, and vehicle history to suggest severity, likely causes, and recommended next steps.",
  },
  {
    question: "Does TruckFixr support inspections?",
    answer:
      "Yes. TruckFixr helps capture inspection defects and connect them to repair decisions and vehicle history.",
  },
  {
    question: "How do I get started?",
    answer:
      "View pricing, request a pilot, enter a pilot code, or sign in if you already have an account.",
  },
  {
    question: "How is TruckFixr different from telematics or inspection apps?",
    answer:
      "Telematics shows vehicle signals and inspection apps capture defects. TruckFixr connects those issues to AI triage, early warnings, repair decisions, repair tracking, and vehicle history.",
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

function scrollToId(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
      <h2 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.03em] text-[#00263F] sm:text-4xl">
        {title}
      </h2>
      {description ? <p className="mt-4 text-base leading-8 text-[#42474E]">{description}</p> : null}
    </motion.div>
  );
}

function FeatureCard({ card }: { card: ContentCard }) {
  return (
    <div className="rounded-2xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
      <card.icon className="h-8 w-8 text-[#E32636]" />
      <h3 className="mt-5 font-['Manrope'] text-xl font-black text-[#00263F]">{card.title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#42474E]">{card.description}</p>
    </div>
  );
}

// Compact partner / supporter credibility strip (ported from the legacy
// Landing page so the "Supported by" relationships are preserved).
function SupportersStrip() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#6B7280]">Supported by</span>
      <div className="flex flex-wrap items-center gap-3">
        {supporters.map((supporter) => (
          <a
            key={supporter.name}
            href={supporter.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center transition-transform hover:-translate-y-0.5"
            aria-label={supporter.name}
          >
            <span className={supporter.logoWrapperClassName}>
              <img src={supporter.logoSrc} alt={supporter.logoAlt} className={supporter.logoClassName} />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Driver report</p>
        <p className="mt-4 text-lg leading-8 text-[#00263F]">
          "ABS warning light on. Brake pedal feels normal. Truck completed route yesterday."
        </p>
        <div className="mt-6 rounded-2xl bg-[#F6F8FC] p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#00263F]">
            <BrainCircuit className="h-4 w-4 text-[#E32636]" />
            AI triage bundle
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[#42474E]">
            <li>Likely cause and severity level</li>
            <li>Inspection defects, fault codes, and vehicle history</li>
            <li>Recommended action: monitor, schedule, pull, or escalate</li>
          </ul>
        </div>
      </div>
      <div className="grid gap-4">
        {demoWorkflow.map((item) => (
          <div key={item.label} className="rounded-3xl border border-[var(--fleet-outline)] bg-[#00263F] p-6 text-white shadow-[var(--fleet-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">{item.label}</p>
            <p className="mt-3 text-base leading-8 text-blue-100">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Accessible modal shell: focus trap entry, Escape to close, scroll lock,
// click-outside to dismiss. Used by both the video and downtime modals.
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-['Manrope'] text-xl font-black text-[#00263F]">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[#42474E] transition hover:bg-[#F4F7FD] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00263F]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ExplainerVideoModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="See how TruckFixr works in 45 seconds" onClose={onClose}>
      {EXPLAINER_VIDEO_URL ? (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <iframe
            src={EXPLAINER_VIDEO_URL}
            title="TruckFixr explainer video"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#BFD0E7] bg-[#F8FAFD] p-8 text-center">
          <Play className="mx-auto h-10 w-10 text-[#E32636]" />
          <p className="mt-4 font-['Manrope'] text-lg font-bold text-[#00263F]">Demo video coming soon</p>
          <p className="mt-2 text-sm leading-7 text-[#42474E]">
            Want a walkthrough now? Request a pilot and we'll show you the full workflow on a real fleet.
          </p>
          <Button
            className="mt-5 rounded-full bg-[#E32636] px-6 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]"
            onClick={() => {
              onClose();
              scrollToId("request-pilot");
              trackEvent("request_pilot_cta_clicked", { cta_location: "video_placeholder" });
            }}
          >
            Request Pilot
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </ModalShell>
  );
}

function DowntimeCalculatorModal({ onClose }: { onClose: () => void }) {
  const [trucks, setTrucks] = useState("3");
  const [daysDown, setDaysDown] = useState("2");
  const [costPerDay, setCostPerDay] = useState("800");

  const estimate = useMemo(() => {
    const t = Math.max(0, Number.parseFloat(trucks) || 0);
    const d = Math.max(0, Number.parseFloat(daysDown) || 0);
    const c = Math.max(0, Number.parseFloat(costPerDay) || 0);
    return Math.round(t * d * c);
  }, [trucks, daysDown, costPerDay]);

  const formatted = useMemo(
    () => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(estimate),
    [estimate],
  );

  return (
    <ModalShell title="What is downtime costing you?" onClose={onClose}>
      <p className="text-sm leading-7 text-[#42474E]">
        A rough estimate of avoidable downtime cost. Catching issues earlier is how fleets keep this number down.
      </p>
      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dt-trucks" className="text-[#00263F]">
            Trucks affected
          </Label>
          <Input
            id="dt-trucks"
            type="number"
            min="0"
            inputMode="numeric"
            value={trucks}
            onChange={(event) => setTrucks(event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dt-days" className="text-[#00263F]">
            Days out of service (each)
          </Label>
          <Input
            id="dt-days"
            type="number"
            min="0"
            inputMode="decimal"
            value={daysDown}
            onChange={(event) => setDaysDown(event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dt-cost" className="text-[#00263F]">
            Lost revenue per truck per day (CAD)
          </Label>
          <Input
            id="dt-cost"
            type="number"
            min="0"
            inputMode="decimal"
            value={costPerDay}
            onChange={(event) => setCostPerDay(event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
          />
        </div>
      </div>
      <div className="mt-6 rounded-2xl bg-[#00263F] p-5 text-white">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">Estimated downtime cost</p>
        <p className="mt-2 font-['Manrope'] text-3xl font-black" aria-live="polite">
          {formatted}
        </p>
        <p className="mt-2 text-xs leading-6 text-blue-100">
          Estimate only. Actual costs vary by route, contract, and repair time.
        </p>
      </div>
      <Button
        className="mt-5 w-full rounded-full bg-[#E32636] px-6 py-6 font-['Manrope'] text-base font-bold text-white hover:bg-[#BC1E2C]"
        onClick={() => {
          onClose();
          scrollToId("request-pilot");
          trackEvent("request_pilot_cta_clicked", { cta_location: "downtime_calculator" });
        }}
      >
        Request a pilot to reduce this
        <ArrowRight className="h-4 w-4" />
      </Button>
    </ModalShell>
  );
}

function PilotRequestForm() {
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
    fleetSize: "",
    vehicleTypes: "",
    location: "",
    biggestMaintenanceChallenge: "",
    interestType: "pilot_inquiry",
    hasPilotCode: "",
    website: "",
  });
  const challengeTooShort =
    form.biggestMaintenanceChallenge.trim().length > 0 && form.biggestMaintenanceChallenge.trim().length < 10;

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
      trackEvent("pilot_form_started", {
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

    // Fold the optional "already have a pilot code?" answer into the free-text
    // challenge field so we keep using the existing lead schema (no backend change).
    const challengeWithContext = form.hasPilotCode
      ? `${form.biggestMaintenanceChallenge.trim()} [Has pilot code/invitation: ${form.hasPilotCode}]`
      : form.biggestMaintenanceChallenge.trim();

    try {
      const result = await leadMutation.mutateAsync({
        fullName: form.fullName,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone || null,
        fleetSize: form.fleetSize,
        vehicleTypes: form.vehicleTypes || null,
        location: form.location || null,
        biggestMaintenanceChallenge: challengeWithContext,
        interestType: form.interestType as "book_a_demo" | "beta_access" | "pilot_inquiry" | "general_inquiry",
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
      trackEvent("pilot_form_submitted", {
        source_page: trackingContext.sourcePage,
        interest_type: form.interestType,
      });
      setForm({
        fullName: "",
        companyName: "",
        email: "",
        phone: "",
        fleetSize: "",
        vehicleTypes: "",
        location: "",
        biggestMaintenanceChallenge: "",
        interestType: "pilot_inquiry",
        hasPilotCode: "",
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
            placeholder="Brampton Transit Inc."
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
          <Label htmlFor="phone" className="text-[#00263F]">
            Phone
          </Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(event) => handleChange("phone", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="416-555-0123"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="space-y-2">
          <Label htmlFor="vehicleTypes" className="text-[#00263F]">
            Vehicle type
          </Label>
          <Input
            id="vehicleTypes"
            value={form.vehicleTypes}
            onChange={(event) => handleChange("vehicleTypes", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="Tractors, straight trucks, trailers"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="biggestMaintenanceChallenge" className="text-[#00263F]">
          Main maintenance challenge *
        </Label>
        <Textarea
          id="biggestMaintenanceChallenge"
          value={form.biggestMaintenanceChallenge}
          onChange={(event) => handleChange("biggestMaintenanceChallenge", event.target.value)}
          className="min-h-24 border-[#BFD0E7] bg-[#F8FAFD]"
          placeholder="What is creating downtime, repeat repairs, or inspection follow-up headaches?"
          required
          minLength={10}
        />
        <p className={`text-xs ${challengeTooShort ? "text-[#BC1E2C]" : "text-[#6B7280]"}`}>
          Please use at least 10 characters so we can understand the issue clearly.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hasPilotCode" className="text-[#00263F]">
          Do you already have a pilot code or invitation?
        </Label>
        <select
          id="hasPilotCode"
          value={form.hasPilotCode}
          onChange={(event) => handleChange("hasPilotCode", event.target.value)}
          className="h-11 w-full rounded-lg border border-[#BFD0E7] bg-[#F8FAFD] px-3 text-sm text-[#0B1C30]"
        >
          <option value="">Select one</option>
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </div>

      <div className="rounded-2xl border border-[#D8E2F0] bg-[#F8FAFD] p-4 text-sm text-[#42474E]">
        {hasStarted
          ? "Thanks for taking a look. We'll route this to the TruckFixr team at info@truckfixr.com."
          : "Tell us about your fleet and we'll follow up about a pilot or demo."}
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
        {leadMutation.isPending ? "Sending..." : "Request Pilot"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

export default function LandingSaaS() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [showVideo, setShowVideo] = useState(false);
  const [showDowntime, setShowDowntime] = useState(false);

  const handleCta = (event: string, location: string) => {
    trackEvent(event, { cta_location: location });
  };

  const openDowntime = (location: string) => {
    setShowDowntime(true);
    handleCta("calculate_downtime_cost_clicked", location);
  };

  const openVideo = (location: string) => {
    setShowVideo(true);
    handleCta("watch_demo_clicked", location);
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
      {/* 1. Header / Navigation */}
      <header className="sticky top-0 z-50 border-b border-[var(--fleet-outline)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center" aria-label="TruckFixr home">
            <AppLogo variant="full" imageClassName="h-10 w-auto" />
          </a>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
            {[
              ["How it works", "#how-it-works"],
              ["Features", "#features"],
              ["Pricing", ROUTES.pricing],
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
              <a href={ROUTES.signIn} onClick={() => handleCta("sign_in_clicked", "nav")}>Sign In</a>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#E32636] px-3 font-['Manrope'] text-xs font-bold text-white hover:bg-[#BC1E2C] sm:px-5 sm:text-sm"
            >
              <a href={ROUTES.getStarted} onClick={() => handleCta("get_started_clicked", "nav")}>Get Started</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* 2. Hero */}
        <section className="relative isolate overflow-hidden border-b border-[var(--fleet-outline)] bg-[linear-gradient(140deg,#F7F9FC_0%,#E9EEF7_52%,#FDEDEF_100%)]">
          <div className="absolute inset-y-0 right-0 -z-10 hidden w-1/2 bg-[radial-gradient(circle,#C7D2E2_1px,transparent_1px)] bg-[length:24px_24px] opacity-45 lg:block" />
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-20">
            <motion.div {...fadeUp} className="max-w-2xl">
              <p className="inline-flex rounded-full bg-[#00263F] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
                Maintenance intelligence for commercial vehicle uptime
              </p>
              <h1 className="mt-6 font-['Manrope'] text-4xl font-black leading-[0.98] tracking-[-0.05em] text-[#00263F] sm:text-5xl lg:text-6xl">
                Turn scattered vehicle issues into clear maintenance decisions.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#42474E]">
                TruckFixr Fleet AI helps commercial fleets connect inspections, driver reports, fault codes, early
                warnings, AI triage, repair decisions, and vehicle history in one workflow.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#E32636] px-8 font-['Manrope'] text-base font-bold text-white shadow-[0_18px_35px_-22px_rgba(227,38,54,0.72)] hover:bg-[#BC1E2C]"
                >
                  <a href={ROUTES.getStarted} onClick={() => handleCta("get_started_clicked", "hero")}>Get Started</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-2 border-[#00263F] bg-transparent px-8 font-['Manrope'] text-base font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
                >
                  <a
                    href={ROUTES.requestPilot}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToId("request-pilot");
                      handleCta("request_pilot_cta_clicked", "hero");
                    }}
                  >
                    Request Pilot
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="rounded-full px-4 font-['Manrope'] text-base font-bold text-[#00263F] hover:bg-[#00263F]/5"
                >
                  <a href={ROUTES.signIn} onClick={() => handleCta("sign_in_clicked", "hero")}>Sign In</a>
                </Button>
              </div>

              {/* Calculate Downtime Cost — secondary lead-magnet CTA (does not compete with primary CTAs) */}
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => openDowntime("hero")}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#A04100] underline-offset-4 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A04100] focus-visible:ring-offset-2"
                >
                  <Calculator className="h-4 w-4" />
                  Not sure what downtime is costing you? Calculate Downtime Cost
                </button>
              </div>

              <div className="mt-8">
                <SupportersStrip />
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
                          Fleet operations center
                        </p>
                        <p className="mt-1 font-['Manrope'] text-lg font-bold text-white">
                          Morning readiness in one view
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-200">
                        Live
                      </span>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                      <div className="space-y-3">
                        {[
                          ["89%", "Fleet healthy"],
                          ["3", "Urgent issues"],
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
                            <p className="font-['Manrope'] text-sm font-bold text-white">Action queue</p>
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
                        TruckFixr AI flags a likely cooling-system risk. Hold dispatch, inspect coolant level, belt tension, fan response,
                        and recent repair history.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* 3. Explainer Video / Demo Preview */}
        <section id="demo" className="border-b border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Demo preview"
              title="See how TruckFixr works in 45 seconds."
              description="Watch how a driver-reported issue becomes AI triage, a manager decision, repair tracking, and vehicle history."
              center
            />
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => openVideo("demo_section")}
                className="group relative flex aspect-video w-full max-w-2xl items-center justify-center overflow-hidden rounded-[2rem] border border-[var(--fleet-outline)] bg-[#00263F] shadow-[var(--fleet-shadow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E32636] focus-visible:ring-offset-2"
                aria-label="Play the 45-second TruckFixr explainer video"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle,#7FA7CD_1px,transparent_1px)] bg-[length:22px_22px] opacity-20" />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#E32636] text-white shadow-lg transition-transform group-hover:scale-110">
                  <Play className="h-7 w-7" />
                </span>
                <span className="absolute bottom-5 left-0 right-0 text-center text-sm font-bold uppercase tracking-[0.16em] text-[#A3CBF2]">
                  Watch the 45-second demo
                </span>
              </button>
            </div>
            <div className="mt-12">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* 4. How It Works */}
        <section id="how-it-works" className="bg-[#00263F] px-4 py-16 text-white sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <motion.div {...fadeUp} className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">How it works</p>
              <h2 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                From driver report to repair decision.
              </h2>
            </motion.div>
            <div className="mt-14 grid gap-6 md:grid-cols-3 lg:grid-cols-5">
              {steps.map((item, index) => (
                <motion.div
                  key={item.title}
                  {...fadeUp}
                  transition={{ ...revealTransition, delay: index * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 text-center"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F37021] font-['Manrope'] text-lg font-black text-white">
                    {item.step}
                  </div>
                  <h3 className="mt-4 font-['Manrope'] text-base font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-blue-100/80">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. What Fleets Struggle With */}
        <section id="problem" className="border-b border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="What fleets struggle with"
              title="Downtime starts when warning signs get missed."
              description="Maintenance decisions get scattered across paper inspections, text messages, driver memory, fault codes, and old repair invoices."
              center
            />
            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {painPoints.map((card, index) => (
                <motion.div key={card.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.05 }}>
                  <FeatureCard card={card} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Key Benefits */}
        <section id="benefits" className="bg-[var(--fleet-surface)] px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Key benefits"
              title="Catch more, decide faster, remember everything."
              center
            />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {benefitCards.map((card, index) => (
                <motion.div key={card.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.05 }}>
                  <FeatureCard card={card} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Core Features */}
        <section id="features" className="border-y border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Core features"
              title="One workflow, all the moving parts."
              center
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featureItems.map((feature, index) => (
                <motion.div
                  key={feature.label}
                  {...fadeUp}
                  transition={{ ...revealTransition, delay: index * 0.03 }}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] px-5 py-4 shadow-[var(--fleet-shadow)]"
                >
                  <feature.icon className="h-5 w-5 shrink-0 text-[#E32636]" />
                  <span className="font-['Manrope'] text-sm font-bold text-[#00263F]">{feature.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Who TruckFixr Helps (+ mobile use + Mr Diesel trust line) */}
        <section id="who" className="bg-[var(--fleet-surface)] px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Who TruckFixr helps"
              title="From one truck to a growing fleet."
              center
            />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {whoCards.map((card) => (
                <div key={card.title} className="rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
                  <h3 className="font-['Manrope'] text-xl font-black text-[#00263F]">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#42474E]">{card.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="flex items-start gap-4 rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
                <Smartphone className="mt-1 h-7 w-7 shrink-0 text-[#E32636]" />
                <div>
                  <h3 className="font-['Manrope'] text-lg font-black text-[#00263F]">Works on mobile</h3>
                  <p className="mt-2 text-sm leading-7 text-[#42474E]">
                    Drivers report issues, upload photos, complete inspections, and answer maintenance questions from their
                    phone. Managers review issues, AI triage, and repair status from the office, yard, or road.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
                <Wrench className="mt-1 h-7 w-7 shrink-0 text-[#E32636]" />
                <div>
                  <h3 className="font-['Manrope'] text-lg font-black text-[#00263F]">Built from real repair workflows</h3>
                  <p className="mt-2 text-sm leading-7 text-[#42474E]">
                    Built from real commercial truck repair workflows through Mr. Diesel Inc. in Ontario, TruckFixr is
                    designed around practical fleet maintenance decisions, not generic AI chat.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. Get Started / Access Paths */}
        <section id="get-started" className="border-y border-[var(--fleet-outline)] bg-[#00263F] px-4 py-16 text-white sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Pricing teaser */}
              <div className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.05] p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">Pricing</p>
                <h3 className="mt-3 font-['Manrope'] text-2xl font-black">Fleet plans from $49/month CAD.</h3>
                <p className="mt-3 text-sm leading-7 text-blue-100">
                  Plans scale by vehicle count, with better per-vehicle economics as your fleet grows. Owner-operator
                  plans start at $19/month.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="rounded-full bg-[#E32636] px-6 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]">
                    <a href={ROUTES.pricing} onClick={() => handleCta("view_pricing_clicked", "get_started")}>View Pricing</a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-2 border-white/25 bg-transparent px-6 font-['Manrope'] font-bold text-white hover:bg-white hover:text-[#00263F]"
                  >
                    <a
                      href={ROUTES.requestPilot}
                      onClick={(event) => {
                        event.preventDefault();
                        scrollToId("request-pilot");
                        handleCta("request_pilot_cta_clicked", "get_started");
                      }}
                    >
                      Request Pilot
                    </a>
                  </Button>
                </div>
              </div>

              {/* Access-code / invitation path */}
              <div className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.05] p-6">
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                  <KeyRound className="h-4 w-4" />
                  Invited?
                </p>
                <h3 className="mt-3 font-['Manrope'] text-2xl font-black">Already have a pilot code or invitation?</h3>
                <p className="mt-3 text-sm leading-7 text-blue-100">
                  If your fleet manager, employer, or TruckFixr contact invited you, use your code or invitation link to
                  activate your account and join the correct fleet.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="rounded-full bg-white px-6 font-['Manrope'] font-bold text-[#00263F] hover:bg-blue-50">
                    <a href={ROUTES.pilotCode} onClick={() => handleCta("enter_pilot_code_clicked", "get_started")}>Enter Pilot Code</a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-2 border-white/25 bg-transparent px-6 font-['Manrope'] font-bold text-white hover:bg-white hover:text-[#00263F]"
                  >
                    <a href={ROUTES.signIn} onClick={() => handleCta("sign_in_clicked", "get_started")}>Sign In</a>
                  </Button>
                </div>
              </div>

              {/* Request pilot lead form */}
              <div id="request-pilot" className="scroll-mt-24 rounded-3xl border border-white/10 bg-white p-6 text-[#0B1C30] shadow-[var(--fleet-shadow)]">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Request a pilot</p>
                <h3 className="mt-2 font-['Manrope'] text-xl font-black text-[#00263F]">Tell us about your fleet</h3>
                <p className="mt-2 text-sm leading-7 text-[#42474E]">
                  We'll follow up to set up a pilot or demo on a real fleet.
                </p>
                <div className="mt-5">
                  <PilotRequestForm />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 10. FAQ */}
        <section id="faq" className="bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[900px]">
            <SectionHeading eyebrow="FAQ" title="Clear answers for fleets evaluating TruckFixr." center />
            <div className="mt-10 space-y-3">
              {faqItems.map((faq, index) => {
                const isOpen = expandedFaq === index;
                return (
                  <div
                    key={faq.question}
                    className="overflow-hidden rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] shadow-[var(--fleet-shadow)]"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedFaq(isOpen ? null : index)}
                      className="flex w-full items-start justify-between gap-6 px-5 py-5 text-left transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F37021]"
                    >
                      <span className="font-['Manrope'] text-lg font-black text-[#00263F]">{faq.question}</span>
                      <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-[#A04100] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen ? <p className="px-5 pb-5 text-sm leading-7 text-[#42474E]">{faq.answer}</p> : null}
                  </div>
                );
              })}
            </div>
            <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-6 text-[#6B7280]">
              TruckFixr provides maintenance decision support and does not replace certified inspections, qualified
              technicians, or required safety and compliance procedures.
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--fleet-outline)] bg-[#00263F] text-blue-100">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <AppLogo imageClassName="h-8" frameClassName="rounded p-1.5 bg-white" />
                <span className="font-['Manrope'] font-black text-white">TruckFixr Fleet AI</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-blue-100/80">
                Maintenance intelligence for commercial vehicle uptime.
              </p>
            </div>
            <div>
              <h4 className="font-['Manrope'] font-black text-white">Product</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li><a href="#how-it-works" className="hover:text-white">How It Works</a></li>
                <li><a href="#features" className="hover:text-white">Features</a></li>
                <li><a href={ROUTES.pricing} className="hover:text-white">Pricing</a></li>
                <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-['Manrope'] font-black text-white">Get Started</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li><a href={ROUTES.getStarted} className="hover:text-white">Get Started</a></li>
                <li>
                  <a
                    href={ROUTES.requestPilot}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToId("request-pilot");
                    }}
                    className="hover:text-white"
                  >
                    Request Pilot
                  </a>
                </li>
                <li><a href={ROUTES.pilotCode} className="hover:text-white">Enter Pilot Code</a></li>
                <li><a href={ROUTES.signIn} className="hover:text-white">Sign In</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-['Manrope'] font-black text-white">Company</h4>
              <ul className="mt-4 space-y-2 text-sm">
                <li><a href="mailto:info@truckfixr.com" className="hover:text-white">Contact</a></li>
                <li><a href="/terms" className="hover:text-white">Terms</a></li>
                <li><a href="/privacy" className="hover:text-white">Privacy</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-blue-100/70 sm:flex-row sm:items-center sm:justify-between">
            <p>2026 TruckFixr. Maintenance intelligence for commercial fleets.</p>
            <p>
              Contact:{" "}
              <a href="mailto:info@truckfixr.com" className="hover:text-white">
                info@truckfixr.com
              </a>
            </p>
          </div>
        </div>
      </footer>

      {showVideo ? <ExplainerVideoModal onClose={() => setShowVideo(false)} /> : null}
      {showDowntime ? <DowntimeCalculatorModal onClose={() => setShowDowntime(false)} /> : null}
    </div>
  );
}
