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
  Users,
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

const painPoints: ContentCard[] = [
  {
    icon: Siren,
    title: "Emergency breakdowns",
    description:
      "Small warning signs can turn into roadside calls, missed loads, and expensive emergency labour when nobody sees the pattern early.",
  },
  {
    icon: ClipboardCheck,
    title: "Missed inspection defects",
    description:
      "Paper inspections, rushed checks, and text-message follow-up make it too easy for important defects to disappear.",
  },
  {
    icon: Wrench,
    title: "Repeat repairs without history",
    description:
      "Technicians spend more time reconstructing the story when symptoms, fault codes, and prior work are scattered across systems.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance readiness pressure",
    description:
      "Ontario fleets need records that are easier to trust when someone asks what was checked, reported, and repaired.",
  },
];

const solutionCards: ContentCard[] = [
  {
    icon: BrainCircuit,
    title: "AI-assisted diagnostics",
    description:
      "Turn symptoms, warning lights, and fault codes into clearer maintenance direction with confidence and safety-aware next steps.",
  },
  {
    icon: ClipboardCheck,
    title: "Daily inspection issue capture",
    description:
      "Drivers record defects, photos, notes, and timing so managers can see what needs action now versus what can wait.",
  },
  {
    icon: Gauge,
    title: "Fleet manager visibility",
    description:
      "Keep one view of inspection status, open defects, maintenance history, and the latest recommendation for every unit.",
  },
  {
    icon: Truck,
    title: "Technician-ready context",
    description:
      "Give the bay team the symptom story, previous repair clues, and operational urgency before the truck arrives.",
  },
  {
    icon: Sparkles,
    title: "Repair prioritization",
    description:
      "Separate urgent safety issues from monitor-and-check items so maintenance decisions happen faster and with less noise.",
  },
  {
    icon: Users,
    title: "Driver + manager workflow",
    description:
      "Capture the issue where it starts, then move it through a cleaner operating flow for maintenance and follow-up.",
  },
];

const steps = [
  {
    step: "1",
    title: "Capture the issue",
    description:
      "Drivers or managers report symptoms, warning lights, fault codes, photos, or inspection defects from a mobile-friendly flow.",
  },
  {
    step: "2",
    title: "Organize the context",
    description:
      "TruckFixr connects the issue to vehicle details, repair history, and diagnostic patterns so the signal is easier to read.",
  },
  {
    step: "3",
    title: "Act faster",
    description:
      "Managers and technicians get clearer next steps so the right maintenance decision can happen sooner.",
  },
];

const demoWorkflow = [
  {
    label: "Driver report",
    body: "ABS warning light on. Brake pedal feels normal. Truck completed route yesterday.",
  },
  {
    label: "TruckFixr context",
    body: "Vehicle history, previous ABS repair, inspection notes, urgency level, and possible diagnostic direction.",
  },
  {
    label: "Maintenance decision",
    body: "Prioritize inspection before next dispatch. Check wheel speed sensor wiring and ABS module communication.",
  },
];

const supportCards = [
  {
    title: "For Drivers",
    body: "Simple inspections, issue reporting, photo capture, and clearer next steps when something feels wrong.",
  },
  {
    title: "For Technicians",
    body: "Better symptom history, fault-code context, previous repair clues, and AI-assisted diagnostic guidance before the truck reaches the bay.",
  },
];

const faqItems = [
  {
    question: "What does TruckFixr help fleets do day to day?",
    answer:
      "TruckFixr helps fleets capture inspection issues, organize diagnostics, and turn maintenance signals into clearer decisions before downtime grows.",
  },
  {
    question: "How does the AI-assisted diagnosis work?",
    answer:
      "TruckFixr combines symptoms, fault codes, vehicle context, and maintenance signals to suggest urgency and likely next actions. Final judgment stays with your team or shop.",
  },
  {
    question: "Is this built for trucking workflows specifically?",
    answer:
      "Yes. The product language, inspection flows, and manager views are tailored for truck readiness, dispatch risk, and fleet maintenance coordination.",
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
            AI context bundle
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-[#42474E]">
            <li>Vehicle history and recent repair notes</li>
            <li>Inspection defects and driver observations</li>
            <li>Urgency level and safety-aware maintenance direction</li>
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
    phone: "",
    fleetSize: "",
    vehicleTypes: "",
    location: "",
    biggestMaintenanceChallenge: "",
    interestType: "book_a_demo",
    preferredDemoTime: "",
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
        phone: form.phone || null,
        fleetSize: form.fleetSize,
        vehicleTypes: form.vehicleTypes || null,
        location: form.location || null,
        biggestMaintenanceChallenge: form.biggestMaintenanceChallenge,
        interestType: form.interestType as "book_a_demo" | "beta_access" | "pilot_inquiry" | "general_inquiry",
        preferredDemoTime: form.preferredDemoTime || null,
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
        interestType: "book_a_demo",
        preferredDemoTime: "",
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
          <Label htmlFor="interestType" className="text-[#00263F]">
            Interest type *
          </Label>
          <select
            id="interestType"
            value={form.interestType}
            onChange={(event) => handleChange("interestType", event.target.value)}
            className="h-11 w-full rounded-lg border border-[#BFD0E7] bg-[#F8FAFD] px-3 text-sm text-[#0B1C30]"
            required
          >
            <option value="book_a_demo">Book a Demo</option>
            <option value="beta_access">Beta Access</option>
            <option value="pilot_inquiry">Pilot Inquiry</option>
            <option value="general_inquiry">General Inquiry</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="vehicleTypes" className="text-[#00263F]">
            Vehicle types
          </Label>
          <Input
            id="vehicleTypes"
            value={form.vehicleTypes}
            onChange={(event) => handleChange("vehicleTypes", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="Tractors, straight trucks, trailers"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location" className="text-[#00263F]">
            Location
          </Label>
          <Input
            id="location"
            value={form.location}
            onChange={(event) => handleChange("location", event.target.value)}
            className="border-[#BFD0E7] bg-[#F8FAFD]"
            placeholder="Ontario, Canada"
          />
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
          placeholder="What is creating downtime, repeat repairs, or inspection follow-up headaches?"
          required
          minLength={10}
        />
        <p className={`text-xs ${challengeTooShort ? "text-[#BC1E2C]" : "text-[#6B7280]"}`}>
          Please use at least 10 characters so we can understand the issue clearly.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="preferredDemoTime" className="text-[#00263F]">
          Preferred demo time
        </Label>
        <Input
          id="preferredDemoTime"
          value={form.preferredDemoTime}
          onChange={(event) => handleChange("preferredDemoTime", event.target.value)}
          className="border-[#BFD0E7] bg-[#F8FAFD]"
          placeholder="Weekday mornings, afternoons, or flexible"
        />
      </div>

      <div className="rounded-2xl border border-[#D8E2F0] bg-[#F8FAFD] p-4 text-sm text-[#42474E]">
        {hasStarted ? "Thanks for taking a look. We'll route this to the TruckFixr team at info@truckfixr.com." : "Tell us about your fleet and we'll follow up with a demo."}
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
        {leadMutation.isPending ? "Sending..." : "Request Demo"}
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

  const handleBetaCtaClick = (location: string) => {
    trackEvent("beta_waitlist_cta_clicked", {
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
            <AppLogo variant="full" imageClassName="h-10 w-auto" />
          </a>

          <nav className="hidden items-center gap-6 lg:flex">
            {[
              ["Problem", "#problem"],
              ["Solution", "#solution"],
              ["How it works", "#how-it-works"],
              ["Demo", "#demo"],
              ["Ontario", "#ontario"],
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
              <a href="/access">Sign In / Get Access</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="hidden rounded-full border-[#00263F] bg-white px-3 font-['Manrope'] text-xs font-bold text-[#00263F] hover:border-[#E32636] hover:bg-[#F4F7FD] sm:inline-flex sm:px-4 sm:text-sm"
            >
              <a href="#book-demo" onClick={() => handleLeadCtaClick("nav")}>Book a Demo</a>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#E32636] px-3 font-['Manrope'] text-xs font-bold text-white hover:bg-[#BC1E2C] sm:px-5 sm:text-sm"
            >
              <a href="#beta" onClick={() => handleBetaCtaClick("nav")}>Join the Beta</a>
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
                Built from real Ontario diesel repair operations - not generic AI.
              </p>
              <h1 className="mt-6 font-['Manrope'] text-5xl font-black leading-[0.95] tracking-[-0.06em] text-[#00263F] sm:text-6xl lg:text-7xl">
                AI-powered fleet maintenance intelligence for small commercial fleets.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#42474E]">
                TruckFixr Fleet AI helps fleet managers reduce downtime by turning driver reports, inspections, fault codes,
                symptoms, and repair history into faster, clearer maintenance decisions.
              </p>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-[#A04100]">
                Now onboarding selected Ontario and Canadian fleets for early access.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-[#E32636] px-8 font-['Manrope'] text-base font-bold text-white shadow-[0_18px_35px_-22px_rgba(227,38,54,0.72)] hover:bg-[#BC1E2C]"
                >
                  <a href="#book-demo" onClick={() => handleLeadCtaClick("hero")}>Book a Demo</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-2 border-[#00263F] bg-transparent px-8 font-['Manrope'] text-base font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
                >
                  <a href="#beta" onClick={() => handleBetaCtaClick("hero")}>Join the Beta</a>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 text-sm text-[#42474E] sm:grid-cols-2">
                {[
                  "Driver inspection workflows",
                  "AI-assisted defect triage",
                  "Fleet readiness visibility",
                  "Ontario and Canadian operating realities",
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
                          Fleet operations center
                        </p>
                        <h2 className="mt-1 font-['Manrope'] text-lg font-bold text-white">
                          Morning readiness in one view
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
                        TADIS flags a likely cooling-system risk. Hold dispatch, inspect coolant level, belt tension, fan response,
                        and recent repair history.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="problem" className="border-b border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="The problem"
              title="Downtime does not start when the truck stops. It starts when warning signs get missed."
              description="Small fleets lose time and money when maintenance decisions are scattered across paper inspections, text messages, driver memory, fault codes, and previous repair invoices."
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

        <section id="solution" className="bg-[var(--fleet-surface)] px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="The solution"
              title="One intelligence layer for inspections, diagnostics, and maintenance decisions."
              description="TruckFixr Fleet AI organizes daily inspection issues, driver reports, symptoms, fault codes, vehicle history, and repair notes into a clearer maintenance workflow."
              center
            />
            <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {solutionCards.map((card, index) => (
                <motion.div key={card.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.04 }}>
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
                From driver report to maintenance decision in minutes
              </p>
              <h2 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                Three simple steps to move from symptom to action.
              </h2>
            </motion.div>
            <div className="relative mt-14 grid gap-8 md:grid-cols-3">
              <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/15 md:block" />
              {steps.map((item, index) => (
                <motion.div key={item.title} {...fadeUp} transition={{ ...revealTransition, delay: index * 0.08 }} className="relative text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F37021] text-white shadow-[0_0_0_8px_#00263F]">
                    <span className="font-['Manrope'] text-xl font-black">{item.step}</span>
                  </div>
                  <h3 className="mt-5 font-['Manrope'] text-lg font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-blue-100/80">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Product demo preview"
              title="See how TruckFixr turns a driver report into a maintenance decision."
              description="This static preview is designed to show the workflow clearly even before a live demo."
              center
            />
            <div className="mt-12">
              <ProductPreview />
            </div>
            <div className="mt-8 text-center">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[#00263F] px-8 font-['Manrope'] font-bold text-white hover:bg-[#0B3C5D]"
              >
                <a href="#book-demo" onClick={() => handleLeadCtaClick("demo_preview")}>Book a Demo to see the full workflow</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <SectionHeading
              eyebrow="Built from real repair experience"
              title="Built by people who understand truck repair pressure."
              description="TruckFixr Fleet AI was developed from real commercial truck repair experience at Mr. Diesel Inc., an Ontario truck and trailer repair shop."
            />
            <div className="rounded-3xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] p-6 shadow-[var(--fleet-shadow)]">
              <p className="text-sm leading-7 text-[#42474E]">
                This is not generic AI pasted onto fleet maintenance. TruckFixr is built with repair-shop DNA and shaped by real
                repair workflows, real driver reports, and the daily pressure fleet managers face when vehicles go down.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Ontario shop experience", "Diesel repair workflow", "Driver + technician alignment", "Maintenance follow-up"].map((label) => (
                  <span key={label} className="rounded-full bg-[#E5EEFF] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#00263F]">
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-6">
                <Button asChild className="rounded-full bg-[#E32636] px-6 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]">
                  <a href="#book-demo" onClick={() => handleLeadCtaClick("repair_experience")}>Book a Demo</a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="ontario" className="bg-[var(--fleet-surface)] px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Ontario / Canada readiness"
              title="Built for Ontario and Canadian fleet realities."
              description="TruckFixr helps fleet teams stay organized around daily inspections, reported defects, maintenance follow-up, and repair history."
              center
            />
            <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              <div className="rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
                <p className="text-sm leading-8 text-[#42474E]">
                  CVOR-aware workflows, MTO inspection expectations, DriveON-related service realities, Canadian winters, and local
                  repair conditions all shape how TruckFixr presents fleet health and maintenance readiness.
                </p>
                <p className="mt-6 rounded-2xl bg-[#F8FAFD] p-4 text-sm leading-7 text-[#6B7280]">
                  TruckFixr supports maintenance and inspection readiness; it does not replace professional judgment, licensed inspections,
                  or regulatory compliance obligations.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Daily inspections",
                  "CVOR-aware workflows",
                  "Winter condition readiness",
                  "Repair follow-up visibility",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-[var(--fleet-outline)] bg-white p-5 shadow-[var(--fleet-shadow)]">
                    <Check className="h-4 w-4 text-[#E32636]" />
                    <p className="mt-3 text-sm font-semibold text-[#00263F]">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="Supporting users"
              title="Built for fleet managers. Useful for drivers and technicians."
              center
            />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {supportCards.map((card) => (
                <div key={card.title} className="rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)]">
                  <h3 className="font-['Manrope'] text-xl font-black text-[#00263F]">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#42474E]">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="beta" className="border-y border-[var(--fleet-outline)] bg-[#00263F] px-4 py-16 text-white sm:px-6 lg:py-24">
          <div className="mx-auto grid max-w-[1200px] gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                Now onboarding selected Ontario and Canadian fleets
              </p>
              <h2 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
                Join the Ontario Fleet Beta.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-blue-100">
                TruckFixr Fleet AI is currently onboarding early-access fleets that want a smarter way to manage inspections, diagnostics,
                repair history, and maintenance decisions.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild size="lg" className="rounded-full bg-[#E32636] px-8 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]">
                <a href="#book-demo" onClick={() => handleLeadCtaClick("beta")}>Book a Demo</a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-2 border-white/25 bg-transparent px-8 font-['Manrope'] font-bold text-white hover:bg-white hover:text-[#00263F]">
                <a href="#book-demo" onClick={() => handleBetaCtaClick("beta")}>Join the Beta</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--fleet-outline)] bg-white px-4 py-10 sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 rounded-3xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] px-6 py-6 shadow-[var(--fleet-shadow)] sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Already invited to TruckFixr?</p>
              <p className="mt-2 text-sm leading-7 text-[#42474E]">
                If you have a pilot code, trial invitation, or driver invitation, you can access TruckFixr without booking a demo.
              </p>
            </div>
            <Button asChild className="rounded-full bg-[#00263F] px-6 font-['Manrope'] font-bold text-white hover:bg-[#0B3C5D]">
              <a href="/access">Sign In / Get Access</a>
            </Button>
          </div>
        </section>

        <section id="book-demo" className="px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px] grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <SectionHeading
              eyebrow="Lead capture"
              title="Book a TruckFixr Fleet AI Demo"
              description="Tell us about your fleet and we will follow up to show how TruckFixr can support your maintenance workflow."
            />
            <div className="rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)] sm:p-8">
              <DemoRequestForm />
            </div>
          </div>
        </section>

        <section id="faq" className="border-t border-[var(--fleet-outline)] bg-white px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-[1200px]">
            <SectionHeading
              eyebrow="FAQ"
              title="Clear answers for fleets evaluating TruckFixr."
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
                    className="w-full rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] px-5 py-5 text-left shadow-[var(--fleet-shadow)] transition hover:border-[#F37021]"
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
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                  Ready to reduce downtime and make maintenance decisions faster?
                </p>
                <h2 className="mt-4 font-['Manrope'] text-3xl font-black tracking-[-0.03em] sm:text-4xl">
                  Book a demo and see how TruckFixr Fleet AI turns inspections, driver reports, fault codes, and repair history into action.
                </h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <Button asChild size="lg" className="rounded-full bg-[#E32636] px-8 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]">
                  <a href="#book-demo" onClick={() => handleLeadCtaClick("final_cta")}>Book a Demo</a>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-2 border-white/25 bg-transparent px-8 font-['Manrope'] font-bold text-white hover:bg-white hover:text-[#00263F]">
                  <a href="#beta" onClick={() => handleBetaCtaClick("final_cta")}>Join the Beta</a>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-[var(--fleet-outline)] bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-8 text-sm text-[#42474E] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <AppLogo imageClassName="h-8" frameClassName="rounded p-1.5" />
            <span className="font-['Manrope'] font-black text-[#00263F]">TruckFixr Fleet AI</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <a href="#problem" className="hover:text-[#F37021]">Problem</a>
            <a href="#solution" className="hover:text-[#F37021]">Solution</a>
            <a href="#book-demo" className="hover:text-[#F37021]">Book a Demo</a>
            <a href="#faq" className="hover:text-[#F37021]">FAQ</a>
          </div>
          <p>2026 TruckFixr. Fleet maintenance intelligence for modern trucking teams.</p>
          <p className="text-sm">
            Contact:{" "}
            <a href="mailto:info@truckfixr.com" className="hover:text-[#F37021]">
              info@truckfixr.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

