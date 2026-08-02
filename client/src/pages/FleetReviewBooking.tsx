import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock,
  Mail,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useSeoMeta } from "@/lib/useSeoMeta";
import CookiePreferencesLink from "@/components/consent/CookiePreferencesLink";
import {
  trackCalendlyOpened,
  trackMeetingScheduled,
} from "@/lib/analytics/marketing";

// Founder-led Fleet Maintenance Review booking page. The homepage's single
// conversion path lands here. A short qualification form gates an embedded
// Calendly so only decision-makers with a real fleet and a genuine problem
// reach the calendar — keeping the founder's calendar for qualified reviews.
const sectionShell = "mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8";
const cardClass =
  "rounded-[10px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const eyebrowClass =
  "text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";
const fieldClass =
  "border-[#C3C7CE] bg-white text-[#0A1A2E] placeholder:text-[#9AA3B0]";

// Embeddable Calendly / Cal.com inline URL for the review event. Defaults to the
// founder's Calendly; override per-environment with VITE_FLEET_REVIEW_SCHEDULER_URL.
const DEFAULT_SCHEDULER_URL = "https://calendly.com/dkwesga/25-min-meeting";
const SCHEDULER_URL =
  (
    import.meta.env.VITE_FLEET_REVIEW_SCHEDULER_URL as string | undefined
  )?.trim() || DEFAULT_SCHEDULER_URL;
// Optional hosted founder photo. Falls back to an initials avatar when unset.
const FOUNDER_PHOTO_URL = (
  import.meta.env.VITE_FOUNDER_PHOTO_URL as string | undefined
)?.trim();

const ROLE_OPTIONS: Array<{
  value: string;
  label: string;
  decisionMaker: boolean;
}> = [
  { value: "owner", label: "Fleet owner / principal", decisionMaker: true },
  { value: "ops", label: "Operations manager", decisionMaker: true },
  {
    value: "maintenance",
    label: "Maintenance / fleet manager",
    decisionMaker: true,
  },
  {
    value: "influencer",
    label: "I influence maintenance decisions",
    decisionMaker: true,
  },
  {
    value: "not_involved",
    label: "Just researching / not a decision-maker",
    decisionMaker: false,
  },
];
const FLEET_SIZE_OPTIONS: Array<{
  value: string;
  label: string;
  qualified: boolean;
}> = [
  { value: "1-4", label: "1–4 vehicles", qualified: false },
  { value: "5-14", label: "5–14 vehicles", qualified: true },
  { value: "15-50", label: "15–50 vehicles", qualified: true },
  { value: "50+", label: "50+ vehicles", qualified: true },
];
const HANDLING_OPTIONS = [
  { value: "outsourced", label: "Mostly outsourced to shops" },
  { value: "mixed", label: "A mix of in-house and outsourced" },
  { value: "inhouse", label: "Mostly in-house / own technicians" },
];

const REVIEW_EXPECTATIONS: Array<{
  icon: typeof Search;
  title: string;
  body: string;
}> = [
  {
    icon: Search,
    title: "The biggest weakness in your workflow",
    body: "We diagnose where vehicle issues are getting lost, delayed, poorly prioritized, or left unresolved between the driver, the yard, and the shop.",
  },
  {
    icon: ClipboardCheck,
    title: "One or two practical recommendations",
    body: "Concrete changes you can apply to your current process — whether or not you ever use TruckFixr.",
  },
  {
    icon: CalendarClock,
    title: "A demonstration tailored to your gaps",
    body: "We show only the parts of TruckFixr connected to the problems we uncover — not a full platform tour.",
  },
];

const AGENDA: Array<[string, string]> = [
  [
    "0–3 min",
    "Context: fleet size, asset types, who owns maintenance, and your primary concern.",
  ],
  [
    "3–15 min",
    "Workflow diagnosis: how issues are reported, prioritized, approved, assigned, tracked, and confirmed — and what management can't currently see.",
  ],
  [
    "15–22 min",
    "Tailored demonstration of the workflows connected to the gaps we find.",
  ],
  [
    "22–25 min",
    "An honest recommendation: pilot-ready, improve first, or not currently a fit.",
  ],
];

function FounderCard() {
  return (
    <div className={cn(cardClass, "flex items-start gap-4 p-5")}>
      {FOUNDER_PHOTO_URL ? (
        <img
          src={FOUNDER_PHOTO_URL}
          alt="Dickson Kwesiga, founder of TruckFixr Fleet AI"
          className="h-16 w-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#0A1A2E] text-lg font-black text-white">
          DK
        </span>
      )}
      <div>
        <p className={cn(eyebrowClass, "!text-[#73777E]")}>
          Your review is led by
        </p>
        <p className="mt-1 text-base font-bold text-[#0A1A2E]">
          Dickson Kwesiga
        </p>
        <p className="text-sm text-[#73777E]">Founder, TruckFixr Fleet AI</p>
        <p className="mt-2 text-sm leading-6 text-[#38465F]">
          Hands-on experience managing commercial fleets and heavy-duty repair
          operations — you&apos;re booking a working session with the founder,
          not a sales rep.
        </p>
      </div>
    </div>
  );
}

function LeftColumn() {
  return (
    <div className="space-y-6">
      <div>
        <p className={eyebrowClass}>Free 25-minute founder-led review</p>
        <h1 className={cn(displayClass, "mt-2 text-3xl sm:text-4xl")}>
          Book your Fleet Maintenance Review
        </h1>
        <p className="mt-4 text-base leading-7 text-[#38465F]">
          A focused working session to find where maintenance issues are getting
          lost, delayed, or turning into costly downtime in your operation — and
          to show how TruckFixr could close those gaps.
        </p>
        <p className="mt-3 text-sm text-[#73777E]">
          For commercial fleets with{" "}
          <span className="font-semibold text-[#0A1A2E]">5–50 vehicles</span>.
          No obligation.
        </p>
      </div>

      <div className="grid gap-3">
        {REVIEW_EXPECTATIONS.map(e => {
          const Icon = e.icon;
          return (
            <div key={e.title} className={cn(cardClass, "flex gap-3 p-4")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#0A1A2E]">
                <Icon className="h-5 w-5 text-white" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-[#0A1A2E]">{e.title}</p>
                <p className="mt-1 text-sm leading-6 text-[#38465F]">
                  {e.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn(cardClass, "bg-[#F6F8FB] p-5")}>
        <p className={cn(eyebrowClass, "!text-[#73777E]")}>
          How the 25 minutes are spent
        </p>
        <dl className="mt-3 space-y-2.5">
          {AGENDA.map(([time, body]) => (
            <div key={time} className="flex gap-3">
              <dt className="w-16 shrink-0 font-['JetBrains_Mono'] text-xs font-bold text-[#D81F2A]">
                {time}
              </dt>
              <dd className="text-sm leading-6 text-[#38465F]">{body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 flex items-start gap-2 border-t border-[#E2E6EC] pt-3 text-xs leading-5 text-[#73777E]">
          <ClipboardCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]"
            aria-hidden="true"
          />
          Come with one recent maintenance issue, recurring fault, inspection
          concern, or repair decision that was hard to manage. Invoices or
          inspection records are welcome but optional.
        </p>
      </div>

      <FounderCard />

      <p className="text-xs leading-5 text-[#73777E]">
        If there&apos;s a strong operational fit, we may recommend a small,
        standardized paid pilot at the end. There is no obligation to proceed.
      </p>
    </div>
  );
}

type Stage = "form" | "book" | "nurture";

interface FormState {
  name: string;
  company: string;
  role: string;
  fleetSize: string;
  handling: string;
  tracking: string;
  challenge: string;
  email: string;
  phone: string;
  pilotOpen: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  company: "",
  role: "",
  fleetSize: "",
  handling: "",
  tracking: "",
  challenge: "",
  email: "",
  phone: "",
  pilotOpen: false,
};

function FieldLabel({
  htmlFor,
  children,
  optional = false,
}: {
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[#0A1A2E]"
    >
      {children}
      {optional ? (
        <span className="text-xs font-normal text-[#9AA3B0]">(optional)</span>
      ) : null}
    </Label>
  );
}

const selectClass =
  "flex h-10 w-full rounded-md border border-[#C3C7CE] bg-white px-3 py-2 text-sm text-[#0A1A2E] focus:outline-none focus:ring-2 focus:ring-[#0A1A2E]/20";

function QualificationForm({
  onQualified,
  onNurture,
}: {
  onQualified: (form: FormState) => void;
  onNurture: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const required: Array<[keyof FormState, string]> = [
      ["name", "your name"],
      ["company", "your company"],
      ["role", "your role"],
      ["fleetSize", "your fleet size"],
      ["challenge", "your biggest maintenance challenge"],
      ["email", "your email"],
    ];
    for (const [key, label] of required) {
      if (!String(form[key]).trim()) {
        setError(`Please add ${label}.`);
        return;
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    const roleMeta = ROLE_OPTIONS.find(r => r.value === form.role);
    const sizeMeta = FLEET_SIZE_OPTIONS.find(s => s.value === form.fleetSize);
    const qualifies =
      Boolean(roleMeta?.decisionMaker) &&
      Boolean(sizeMeta?.qualified) &&
      form.challenge.trim().length >= 10 &&
      form.pilotOpen;

    // Non-PII qualification metadata only (name/email are prefilled into Calendly).
    trackEvent(
      qualifies ? "fleet_review_qualified" : "fleet_review_not_qualified",
      {
        role: form.role,
        fleet_size: form.fleetSize,
        handling: form.handling || null,
        challenge_length: form.challenge.trim().length,
        pilot_open: form.pilotOpen,
        phone_provided: Boolean(form.phone.trim()),
      }
    );

    if (qualifies) onQualified(form);
    else onNurture(form);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(cardClass, "space-y-4 p-5 sm:p-6")}
      noValidate
    >
      <div>
        <p className={eyebrowClass}>Step 1 of 2 · Tell us about your fleet</p>
        <p className="mt-1 text-sm leading-6 text-[#38465F]">
          A few questions so the review is worth your time. If it&apos;s a fit,
          the calendar appears next.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            value={form.name}
            onChange={e => set("name", e.target.value)}
            className={fieldClass}
            autoComplete="name"
          />
        </div>
        <div>
          <FieldLabel htmlFor="company">Company</FieldLabel>
          <Input
            id="company"
            value={form.company}
            onChange={e => set("company", e.target.value)}
            className={fieldClass}
            autoComplete="organization"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="role">Your role</FieldLabel>
          <select
            id="role"
            value={form.role}
            onChange={e => set("role", e.target.value)}
            className={selectClass}
          >
            <option value="" disabled>
              Select your role…
            </option>
            {ROLE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="fleetSize">Fleet size</FieldLabel>
          <select
            id="fleetSize"
            value={form.fleetSize}
            onChange={e => set("fleetSize", e.target.value)}
            className={selectClass}
          >
            <option value="" disabled>
              Select fleet size…
            </option>
            {FLEET_SIZE_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel htmlFor="handling" optional>
          How maintenance and repairs are handled
        </FieldLabel>
        <select
          id="handling"
          value={form.handling}
          onChange={e => set("handling", e.target.value)}
          className={selectClass}
        >
          <option value="">Select…</option>
          {HANDLING_OPTIONS.map(h => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel htmlFor="tracking" optional>
          How issues and repairs are currently tracked
        </FieldLabel>
        <Textarea
          id="tracking"
          value={form.tracking}
          onChange={e => set("tracking", e.target.value)}
          className={fieldClass}
          rows={2}
          placeholder="Spreadsheets, paper, texts/calls, an existing tool…"
        />
      </div>

      <div>
        <FieldLabel htmlFor="challenge">
          Biggest maintenance challenge right now
        </FieldLabel>
        <Textarea
          id="challenge"
          value={form.challenge}
          onChange={e => set("challenge", e.target.value)}
          className={fieldClass}
          rows={3}
          placeholder="What keeps slipping, getting missed, or costing you unplanned downtime?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="email">Best email</FieldLabel>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            className={fieldClass}
            autoComplete="email"
            inputMode="email"
          />
        </div>
        <div>
          <FieldLabel htmlFor="phone" optional>
            Phone
          </FieldLabel>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={e => set("phone", e.target.value)}
            className={fieldClass}
            autoComplete="tel"
            inputMode="tel"
          />
        </div>
      </div>

      <label
        htmlFor="pilotOpen"
        className="flex cursor-pointer items-start gap-3 rounded-md border border-[#C3C7CE] bg-[#F6F8FB] p-3"
      >
        <Checkbox
          id="pilotOpen"
          checked={form.pilotOpen}
          onCheckedChange={v => set("pilotOpen", v === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-6 text-[#38465F]">
          If there is a clear operational fit, I am open to considering a small
          paid pilot.
        </span>
      </label>

      {error ? (
        <p className="text-sm font-semibold text-[#D81F2A]">{error}</p>
      ) : null}

      <Button
        type="submit"
        className={cn("h-12 w-full justify-center font-bold", redBtn)}
      >
        Continue to Scheduling
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <p className="text-center text-xs text-[#9AA3B0]">
        We only use this to prepare for your review and follow up. No spam.
      </p>
    </form>
  );
}

function BookStage({ form }: { form: FormState }) {
  const src = useMemo(() => {
    if (!SCHEDULER_URL) return null;
    try {
      const url = new URL(SCHEDULER_URL);
      const sizeLabel =
        FLEET_SIZE_OPTIONS.find(s => s.value === form.fleetSize)?.label ??
        form.fleetSize;
      const roleLabel =
        ROLE_OPTIONS.find(r => r.value === form.role)?.label ?? form.role;
      url.searchParams.set("name", form.name);
      url.searchParams.set("email", form.email);
      // Calendly single-line custom answers map to a1/a2 in order; best-effort prefill.
      url.searchParams.set(
        "a1",
        `${form.company} · ${sizeLabel} · ${roleLabel}`
      );
      url.searchParams.set("a2", form.challenge);
      url.searchParams.set("hide_gdpr_banner", "1");
      url.searchParams.set("utm_source", "fleet-review");
      return url.toString();
    } catch {
      return SCHEDULER_URL;
    }
  }, [form]);

  // Conversion tracking. Reaching this stage means a qualified visitor opened
  // the calendar; a Calendly `event_scheduled` postMessage means a confirmed
  // booking. Both are deduped once-per-visit inside the analytics module, so a
  // reopen or replayed message cannot double-count. No PII is read from the
  // message payload — we only react to the event type.
  useEffect(() => {
    if (!src) return;
    trackCalendlyOpened();

    const onMessage = (event: MessageEvent) => {
      try {
        if (
          typeof event.origin !== "string" ||
          !/(^|\.)calendly\.com$/.test(new URL(event.origin).hostname)
        ) {
          return;
        }
        const data = event.data as { event?: string } | undefined;
        if (data && data.event === "calendly.event_scheduled") {
          trackMeetingScheduled();
        }
      } catch {
        /* ignore malformed messages */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [src]);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          cardClass,
          "flex items-start gap-3 border-l-[3px] border-l-[#1EA66C] p-4"
        )}
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1EA66C]">
          <Check className="h-4 w-4 text-white" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-bold text-[#0A1A2E]">
            You&apos;re a fit — pick a time below.
          </p>
          <p className="mt-1 text-sm leading-6 text-[#38465F]">
            Thanks, {form.name.split(" ")[0] || "there"}. Choose a slot that
            works and you&apos;ll get a calendar invite with a video link. Bring
            one real maintenance example.
          </p>
        </div>
      </div>

      {src ? (
        <div className={cn(cardClass, "overflow-hidden p-0")}>
          <iframe
            src={src}
            title="Book your Fleet Maintenance Review"
            loading="lazy"
            className="h-[720px] w-full border-0 bg-white"
          />
        </div>
      ) : (
        <div
          className={cn(
            cardClass,
            "flex flex-col items-center gap-3 p-8 text-center"
          )}
        >
          <CalendarClock
            className="h-8 w-8 text-[#D81F2A]"
            aria-hidden="true"
          />
          <p className="text-sm font-bold text-[#0A1A2E]">
            Scheduling is being set up.
          </p>
          <p className="max-w-sm text-sm leading-6 text-[#38465F]">
            Reply to the confirmation email we&apos;ll send, or reach out and
            we&apos;ll lock in a time for your review.
          </p>
        </div>
      )}
    </div>
  );
}

function NurtureStage({
  form,
  onBack,
}: {
  form: FormState;
  onBack: () => void;
}) {
  const sizeMeta = FLEET_SIZE_OPTIONS.find(s => s.value === form.fleetSize);
  const roleMeta = ROLE_OPTIONS.find(r => r.value === form.role);
  const reason = !roleMeta?.decisionMaker
    ? "The review is built for the people who own maintenance decisions."
    : !sizeMeta?.qualified
      ? "Right now the review is focused on commercial fleets with 5 or more vehicles."
      : !form.pilotOpen
        ? "The review works best when there's genuine openness to a pilot if it's a clear fit."
        : "Based on your answers, a live review may not be the best use of your time yet.";

  return (
    <div className={cn(cardClass, "space-y-4 p-6")}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F1F4F9]">
        <Users className="h-5 w-5 text-[#0A1A2E]" aria-hidden="true" />
      </span>
      <div>
        <h2 className={cn(displayClass, "text-2xl")}>
          Thanks — let&apos;s stay in touch
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#38465F]">
          {reason} We&apos;d rather be honest than book a call that isn&apos;t
          right for you.
        </p>
      </div>
      <div className="rounded-md border border-[#E2E6EC] bg-[#F6F8FB] p-4 text-sm leading-6 text-[#38465F]">
        In the meantime, our free maintenance planning guides and inspection
        checklists are open to everyone.
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/resources">
          <Button
            variant="outline"
            className="h-11 w-full justify-center border-[#0A1A2E] font-bold text-[#0A1A2E] hover:bg-[#0A1A2E] hover:text-white sm:w-auto sm:px-6"
          >
            Browse free resources
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          onClick={onBack}
          className="h-11 justify-center font-semibold text-[#73777E]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Edit my answers
        </Button>
      </div>
    </div>
  );
}

export default function FleetReviewBooking() {
  useSeoMeta({
    title: "Book Your Fleet Maintenance Review | TruckFixr Fleet AI",
    description:
      "Free 25-minute founder-led Fleet Maintenance Review for commercial fleets with 5–50 vehicles. Find where vehicle issues get lost, delayed, or become costly downtime — and see how TruckFixr could close the gaps.",
  });

  const [stage, setStage] = useState<Stage>("form");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  return (
    <div className="min-h-screen bg-[#F6F8FB] font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <div className="sticky top-0 z-50 border-b border-[#C3C7CE] bg-white/95 backdrop-blur">
        <div
          className={cn(
            sectionShell,
            "flex items-center justify-between gap-4 py-3.5"
          )}
        >
          <AppLogo href="/" imageClassName="h-8 sm:h-9" />
          <Link
            href="/"
            className="text-sm font-semibold text-[#38465F] hover:text-[#0A1A2E]"
          >
            ← Back to site
          </Link>
        </div>
      </div>

      <div
        className={cn(
          sectionShell,
          "grid gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-16"
        )}
      >
        <LeftColumn />
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-semibold text-[#73777E]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-[#2D7DE0]" aria-hidden="true" /> 25
              minutes
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck
                className="h-4 w-4 text-[#1EA66C]"
                aria-hidden="true"
              />{" "}
              No obligation
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-[#73777E]" aria-hidden="true" />{" "}
              Founder-led
            </span>
          </div>
          {stage === "form" ? (
            <QualificationForm
              onQualified={f => {
                setForm(f);
                setStage("book");
              }}
              onNurture={f => {
                setForm(f);
                setStage("nurture");
              }}
            />
          ) : stage === "book" ? (
            <BookStage form={form} />
          ) : (
            <NurtureStage form={form} onBack={() => setStage("form")} />
          )}
        </div>
      </div>

      <p className="mx-auto max-w-[1120px] px-4 pb-3 text-center text-xs leading-5 text-[#73777E] sm:px-6">
        Built and tested through real commercial fleet and heavy-duty
        maintenance workflows. TruckFixr provides decision support and does not
        replace inspection by a qualified technician.
      </p>
      <footer className="bg-[#00101E] py-8 text-center text-xs text-[#8A98AE]">
        <div className={sectionShell}>
          TruckFixr Fleet AI ·{" "}
          <a href="/privacy" className="hover:text-white">
            Privacy
          </a>{" "}
          ·{" "}
          <a href="/terms" className="hover:text-white">
            Terms
          </a>{" "}
          · <CookiePreferencesLink />
        </div>
      </footer>
    </div>
  );
}
