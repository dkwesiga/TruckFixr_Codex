import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AlertOctagon, ArrowRight, Check, Loader2, ShieldAlert } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { ReadinessPill, type Readiness } from "@/components/readiness/ReadinessPill";

// Shared visual language with the marketing landing (kept in sync intentionally).
const shell = "mx-auto w-full max-w-[640px] px-4 sm:px-6";
const cardClass =
  "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

const OPERATING_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "operating_normally", label: "Operating normally" },
  { value: "operating_with_symptoms", label: "Operating with symptoms" },
  { value: "reduced_power_derate", label: "Reduced power / derate" },
  { value: "stopped", label: "Stopped" },
  { value: "unsafe_to_move", label: "Unsafe to move" },
  { value: "unknown", label: "Not sure" },
];

const CONCERN_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "symptom", label: "Symptom / behaviour" },
  { value: "warning_light", label: "Warning light" },
  { value: "fault_code", label: "Fault code" },
  { value: "defect", label: "Defect" },
  { value: "inspection_finding", label: "Inspection finding" },
  { value: "telematics_alert", label: "Telematics alert" },
  { value: "diagnostic_event", label: "Diagnostic event" },
  { value: "maintenance_concern", label: "Maintenance concern" },
];

interface AdaptiveQuestion {
  id: string;
  prompt: string;
  options: Array<{ value: string; label: string }>;
}
interface Preliminary {
  readiness: Readiness;
  label: string;
  recommendation: string;
}
interface DecisionCard {
  readiness: Readiness;
  readinessLabel: string;
  operatingAction: string;
  recommendation: string;
  evidenceReviewed: string[];
  possibleCausesSuppressed: boolean;
  humanReviewStatus: string;
  safetyGuidance: string | null;
}

type Phase = "intake" | "questions" | "critical" | "preliminary" | "contact" | "decision";

function SafetyCard({ guidance }: { guidance: string }) {
  return (
    <div
      className="rounded-[12px] border-2 border-[#D81F2A] bg-[#FDEAEB] p-5"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2 text-[#A6121B]">
        <ShieldAlert size={22} aria-hidden="true" />
        <h2 className={cn(displayClass, "text-xl !text-[#A6121B]")}>Safety first — stop and check</h2>
      </div>
      <p className="mt-3 text-[15px] leading-6 text-[#3A0B0E]">{guidance}</p>
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn("h-2 w-8 rounded-full", i < current ? "bg-[#D81F2A]" : "bg-[#D9DEE6]")}
          aria-hidden="true"
        />
      ))}
      <span className="ml-2 text-xs font-semibold text-[#73777E]">
        Step {current} of {total}
      </span>
    </div>
  );
}

export default function TryOneCase() {
  useSeoMeta({
    title: "Try One Vehicle Case Free | TruckFixr Fleet AI",
    description:
      "Describe one real vehicle concern. TruckFixr gives you a clear next action — Ready, Monitor, Service Soon, or Stop. No account, fleet import, or payment required.",
  });

  const [phase, setPhase] = useState<Phase>("intake");
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [safetyGuidance, setSafetyGuidance] = useState<string | null>(null);
  const [preliminary, setPreliminary] = useState<Preliminary | null>(null);
  const [question, setQuestion] = useState<AdaptiveQuestion | null>(null);
  const [answered, setAnswered] = useState(0);
  const [decision, setDecision] = useState<DecisionCard | null>(null);
  const [freeCaseLimitReached, setFreeCaseLimitReached] = useState(false);

  // Intake fields.
  const [concernText, setConcernText] = useState("");
  const [concernCategory, setConcernCategory] = useState("");
  const [operatingStatus, setOperatingStatus] = useState("");
  const [unitOrVin, setUnitOrVin] = useState("");
  const [inviteCode, setInviteCode] = useState(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("invite") ?? ""
      : ""
  );
  const [intakeError, setIntakeError] = useState<string | null>(null);

  // Contact fields.
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consentEmail, setConsentEmail] = useState(false);
  const [consentSms, setConsentSms] = useState(false);
  const [consentWhatsapp, setConsentWhatsapp] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [trapField, setTrapField] = useState(""); // honeypot
  const [contactError, setContactError] = useState<string | null>(null);

  const startMutation = trpc.guestCases.start.useMutation();
  const answerMutation = trpc.guestCases.answerQuestion.useMutation();
  const contactMutation = trpc.guestCases.submitContact.useMutation();

  function applyStep(res: {
    criticalTriggered: boolean;
    safetyGuidance: string | null;
    preliminary: Preliminary;
    nextQuestion: AdaptiveQuestion | null;
  }) {
    setPreliminary(res.preliminary);
    setSafetyGuidance(res.safetyGuidance);
    if (res.criticalTriggered) {
      setQuestion(null);
      setPhase("critical");
      trackEvent("critical_escalation_triggered", {});
    } else if (res.nextQuestion) {
      setQuestion(res.nextQuestion);
      setPhase("questions");
    } else {
      setQuestion(null);
      setPhase("preliminary");
      trackEvent("preliminary_assessment_viewed", { readiness: res.preliminary.readiness });
    }
  }

  async function handleIntakeSubmit(e: FormEvent) {
    e.preventDefault();
    setIntakeError(null);
    if (concernText.trim().length < 3) {
      setIntakeError("Please describe the concern (a few words is enough).");
      return;
    }
    if (!operatingStatus) {
      setIntakeError("Please choose the vehicle's current operating status.");
      return;
    }
    trackEvent("case_form_started", {});
    try {
      const res = await startMutation.mutateAsync({
        concernText: concernText.trim(),
        concernCategory: concernCategory || undefined,
        operatingStatus,
        vehicleIdentifier: unitOrVin.trim()
          ? unitOrVin.trim().length >= 11
            ? { vin: unitOrVin.trim() }
            : { unitNumber: unitOrVin.trim() }
          : undefined,
        intakeSource: "web",
        inviteCode: inviteCode.trim() || undefined,
        trapField,
      } as never);
      setPublicToken(res.publicToken);
      applyStep(res);
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleAnswer(value: string) {
    if (!publicToken || !question) return;
    trackEvent("adaptive_question_answered", { questionId: question.id });
    try {
      const res = await answerMutation.mutateAsync({
        publicToken,
        questionId: question.id,
        answer: value,
      });
      setAnswered((n) => n + 1);
      applyStep(res);
    } catch {
      /* keep the current question on transient failure */
    }
  }

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    setContactError(null);
    if (!email.trim() && !phone.trim()) {
      setContactError("Enter an email address or a mobile number so we can share the result.");
      return;
    }
    if (!publicToken) return;
    try {
      const res = await contactMutation.mutateAsync({
        publicToken,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        consentEmail,
        consentSms,
        consentWhatsapp,
        consentMarketing,
        authorityConfirmed,
        trapField,
      });
      setDecision(res.decision as DecisionCard);
      setFreeCaseLimitReached(res.freeCaseLimitReached);
      setPhase("decision");
      trackEvent("decision_card_viewed", { readiness: (res.decision as DecisionCard).readiness });
    } catch (err) {
      setContactError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-24 font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <header className="border-b border-[#C3C7CE] bg-white/90 backdrop-blur">
        <div className={cn(shell, "flex items-center justify-between py-3")}>
          <Link href="/" className="flex items-center gap-2">
            <AppLogo />
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#38465F] hover:text-[#0A1A2E]">
            Back to home
          </Link>
        </div>
      </header>

      <main className={cn(shell, "pt-6")}>
        {/* Honeypot — visually hidden, must stay empty. */}
        <input
          type="text"
          value={trapField}
          onChange={(e) => setTrapField(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-px w-px opacity-0"
        />

        {/* Invite-only preview notice (provisional copy). */}
        <div className="mb-4 rounded-md border border-[#F3D9A0] bg-[#FDF3DF] px-3 py-2 text-xs leading-5 text-[#7a5a12]">
          <span className="font-bold uppercase tracking-wide">Invite-only preview</span> · provisional.
          Decision support only — not a confirmed diagnosis, roadworthiness certification, or emergency service.
        </div>

        {phase === "intake" && (
          <form onSubmit={handleIntakeSubmit} className={cn(cardClass, "space-y-5 p-5 sm:p-6")} noValidate>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]">
                Try one vehicle case — free
              </p>
              <h1 className={cn(displayClass, "text-2xl sm:text-3xl")}>Describe one real vehicle concern</h1>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">
                No account, fleet setup, or payment required. TruckFixr gives you a clear next action.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inviteCode" className="text-sm font-semibold">
                Invite code <span className="text-[#D81F2A]">*</span>
              </Label>
              <Input
                id="inviteCode"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="From your invite link or email"
                autoComplete="off"
              />
              <p className="text-xs text-[#73777E]">This preview is invite-only.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="concernText" className="text-sm font-semibold">
                What's happening? <span className="text-[#D81F2A]">*</span>
              </Label>
              <Textarea
                id="concernText"
                value={concernText}
                onChange={(e) => setConcernText(e.target.value)}
                onBlur={() =>
                  concernText.trim().length > 0 && concernText.trim().length < 3
                    ? setIntakeError("Please add a little more detail.")
                    : setIntakeError(null)
                }
                placeholder="e.g. Amber check-engine light came on, engine runs rough at idle"
                rows={4}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="concernCategory" className="text-sm font-semibold">
                Concern type <span className="font-normal text-[#73777E]">(optional)</span>
              </Label>
              <select
                id="concernCategory"
                value={concernCategory}
                onChange={(e) => setConcernCategory(e.target.value)}
                className="h-11 w-full rounded-md border border-[#C3C7CE] bg-white px-3 text-sm"
              >
                <option value="">Choose one…</option>
                {CONCERN_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                Current operating status <span className="text-[#D81F2A]">*</span>
              </legend>
              <div className="grid gap-2">
                {OPERATING_STATUS_OPTIONS.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => setOperatingStatus(o.value)}
                    aria-pressed={operatingStatus === o.value}
                    className={cn(
                      "min-h-[44px] rounded-md border px-4 text-left text-sm font-medium transition-colors",
                      operatingStatus === o.value
                        ? "border-[#0A1A2E] bg-[#0A1A2E] text-white"
                        : "border-[#C3C7CE] bg-white text-[#0A1A2E] hover:border-[#0A1A2E]"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="unitOrVin" className="text-sm font-semibold">
                Unit number or VIN <span className="font-normal text-[#73777E]">(optional)</span>
              </Label>
              <Input
                id="unitOrVin"
                value={unitOrVin}
                onChange={(e) => setUnitOrVin(e.target.value)}
                placeholder="Unit 214 or 1FUJGLDR…"
              />
            </div>

            {intakeError && (
              <p className="text-sm font-medium text-[#D81F2A]" role="alert">
                {intakeError}
              </p>
            )}

            <Button type="submit" disabled={startMutation.isPending} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {startMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Get my next action
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-center text-xs text-[#73777E]">
              Decision support only. It does not replace inspection or a qualified technician.
            </p>
          </form>
        )}

        {phase === "questions" && question && (
          <div className={cn(cardClass, "space-y-5 p-5 sm:p-6")}>
            <StepDots current={Math.min(answered + 1, 3)} total={3} />
            <h2 className={cn(displayClass, "text-xl sm:text-2xl")}>{question.prompt}</h2>
            <div className="grid gap-2">
              {question.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleAnswer(o.value)}
                  disabled={answerMutation.isPending}
                  className="min-h-[48px] rounded-md border border-[#C3C7CE] bg-white px-4 text-left text-sm font-medium text-[#0A1A2E] hover:border-[#0A1A2E] disabled:opacity-60"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "critical" && safetyGuidance && (
          <div className="space-y-5">
            <SafetyCard guidance={safetyGuidance} />
            <div className={cn(cardClass, "space-y-3 p-5")}>
              <p className="text-sm text-[#38465F]">
                We've recorded this case. Add a contact to receive the full guidance and next steps.
              </p>
              <Button onClick={() => setPhase("contact")} className={cn("h-11 w-full font-bold", redBtn)}>
                Send me the full guidance
              </Button>
            </div>
          </div>
        )}

        {phase === "preliminary" && preliminary && (
          <div className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#73777E]">
              Preliminary assessment
            </p>
            <ReadinessPill readiness={preliminary.readiness} size="lg" />
            <p className="text-[15px] leading-6 text-[#0A1A2E]">{preliminary.recommendation}</p>
            <div className="rounded-md bg-[#F1F4F9] p-3 text-sm text-[#38465F]">
              Add one contact method to see the full decision card — reasoning, what to check next, and how to share it.
            </div>
            <Button onClick={() => setPhase("contact")} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              See the full decision
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {phase === "contact" && (
          <form onSubmit={handleContactSubmit} className={cn(cardClass, "space-y-5 p-5 sm:p-6")} noValidate>
            <div>
              <h2 className={cn(displayClass, "text-xl sm:text-2xl")}>Where should we send the result?</h2>
              <p className="mt-2 text-sm text-[#38465F]">Email or mobile — you only need one.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fleet.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold">Mobile number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0100" />
            </div>

            <fieldset className="space-y-2 rounded-md border border-[#E2E6EC] p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[#73777E]">
                Optional updates (choose any)
              </legend>
              {[
                { checked: consentEmail, set: setConsentEmail, label: "Operational updates by email" },
                { checked: consentSms, set: setConsentSms, label: "Operational updates by SMS" },
                { checked: consentWhatsapp, set: setConsentWhatsapp, label: "Updates by WhatsApp" },
                { checked: consentMarketing, set: setConsentMarketing, label: "Occasional TruckFixr news (marketing)" },
              ].map((c) => (
                <label key={c.label} className="flex items-start gap-2 text-sm text-[#0A1A2E]">
                  <input
                    type="checkbox"
                    checked={c.checked}
                    onChange={(e) => c.set(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </fieldset>

            <label className="flex items-start gap-2 text-xs leading-5 text-[#38465F]">
              <input
                type="checkbox"
                checked={authorityConfirmed}
                onChange={(e) => setAuthorityConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                I'm authorized to share the vehicle and contact information provided. Marketing consent is optional and separate.
              </span>
            </label>

            {contactError && (
              <p className="text-sm font-medium text-[#D81F2A]" role="alert">{contactError}</p>
            )}
            <Button type="submit" disabled={contactMutation.isPending} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {contactMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Show my decision
            </Button>
          </form>
        )}

        {phase === "decision" && decision && (
          <div className="space-y-4">
            {decision.safetyGuidance && <SafetyCard guidance={decision.safetyGuidance} />}
            <div className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#73777E]">Decision</p>
                <ReadinessPill readiness={decision.readiness} />
              </div>
              <div>
                <h2 className={cn(displayClass, "text-xl")}>Operating action</h2>
                <p className="mt-1 text-[15px] leading-6 text-[#0A1A2E]">{decision.recommendation}</p>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#38465F]">Evidence reviewed</h3>
                <ul className="mt-1 space-y-1 text-sm text-[#38465F]">
                  {decision.evidenceReviewed.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {decision.possibleCausesSuppressed && (
                <p className="rounded-md bg-[#F1F4F9] p-3 text-xs text-[#73777E]">
                  Possible causes are not shown here — they need physical testing to confirm. Possible causes are not a confirmed diagnosis.
                </p>
              )}
              <p className="text-xs text-[#73777E]">
                Human review status: <span className="font-semibold">{decision.humanReviewStatus.replace(/_/g, " ")}</span>
              </p>
            </div>

            <div className={cn(cardClass, "space-y-3 p-5")}>
              {freeCaseLimitReached ? (
                <p className="text-sm text-[#38465F]">
                  You've used your free vehicle case. Keep going with the 30-day assisted pilot.
                </p>
              ) : (
                <p className="text-sm text-[#38465F]">
                  Want this across your fleet? Start the 30-day assisted pilot — CAD $99.
                </p>
              )}
              <Link href="/pilot-apply">
                <Button className={cn("h-11 w-full font-bold", redBtn)}>
                  Start the CAD $99 Pilot
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
