import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "wouter";
import { AlertOctagon, ArrowRight, Check, ImagePlus, Loader2, ShieldAlert } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { getFriendlyErrorMessage } from "@/lib/actionErrorMessages";
import { decodeVin, normalizeVinInput, type DecodedVehicle } from "@/lib/vin";
import VinPhotoCapture from "@/components/VinPhotoCapture";
import { ReadinessPill, type Readiness } from "@/components/readiness/ReadinessPill";
import {
  GUEST_RESULT_DISCLAIMER_TEXT,
  GUEST_RESULT_DISCLAIMER_VERSION,
} from "@shared/maintenance/guestDisclaimer";

// Shared visual language with the marketing landing (kept in sync intentionally).
const shell = "mx-auto w-full max-w-[640px] px-4 sm:px-6";
const cardClass =
  "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

// Invite-only vs public, keyed to the single public-launch flag (see App.tsx and
// shared/publicLaunch.ts). Default invite-only; the funnel opens to the public
// only when VITE_PUBLIC_LAUNCH_APPROVED=true (set together with the server-side
// PUBLIC_LAUNCH_* preconditions, which independently hard-gate submissions).
const INVITE_REQUIRED = import.meta.env.VITE_PUBLIC_LAUNCH_APPROVED !== "true";

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
  explanation?: string | null;
  confidenceLow?: boolean;
  lowConfidenceNotice?: string | null;
}
interface LikelyCause {
  label: string;
  confidenceBand: "low" | "medium" | "high";
  supportingEvidence: string[];
  status: "hypothesis";
}
interface DecisionCard {
  readiness: Readiness;
  readinessLabel: string;
  operatingAction: string;
  recommendation: string;
  evidenceReviewed: string[];
  possibleCauses: LikelyCause[] | null;
  possibleCausesSuppressed: boolean;
  humanReviewStatus: string;
  safetyGuidance: string | null;
  explanation?: string | null;
  confidenceLow?: boolean;
  lowConfidenceNotice?: string | null;
}

type Phase = "vehicle" | "intake" | "questions" | "critical" | "preliminary" | "contact" | "verify" | "decision";

function LowConfidenceNotice({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border border-[#F3D9A0] bg-[#FDF3DF] p-3 text-sm text-[#7a5a12]"
      role="status"
    >
      <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

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

  const [phase, setPhase] = useState<Phase>("vehicle");
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [safetyGuidance, setSafetyGuidance] = useState<string | null>(null);
  const [preliminary, setPreliminary] = useState<Preliminary | null>(null);
  const [question, setQuestion] = useState<AdaptiveQuestion | null>(null);
  const [answered, setAnswered] = useState(0);
  // Which option the user just tapped, so it stays visibly selected while the
  // next question loads instead of every option dimming uniformly.
  const [selectedAnswerValue, setSelectedAnswerValue] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionCard | null>(null);
  const [freeCaseLimitReached, setFreeCaseLimitReached] = useState(false);

  // Vehicle identification (step 1) — VIN decode first, manual entry as fallback.
  const [vin, setVin] = useState("");
  const [vinDecoding, setVinDecoding] = useState(false);
  const [decodedVehicle, setDecodedVehicle] = useState<DecodedVehicle | null>(null);
  const [vehicleDecodeError, setVehicleDecodeError] = useState<string | null>(null);
  const [manualVehicleEntry, setManualVehicleEntry] = useState(false);
  const [manualMake, setManualMake] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualUnitNumber, setManualUnitNumber] = useState("");
  const [vehicleStepError, setVehicleStepError] = useState<string | null>(null);
  const [vinFromPhoto, setVinFromPhoto] = useState(false);

  // Intake fields.
  const [concernText, setConcernText] = useState("");
  const [concernCategory, setConcernCategory] = useState("");
  const [operatingStatus, setOperatingStatus] = useState("");
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
  const [disclaimerAck, setDisclaimerAck] = useState(false);
  const [trapField, setTrapField] = useState(""); // honeypot
  const [contactError, setContactError] = useState<string | null>(null);

  // Verification (OTP) fields.
  const [maskedDestination, setMaskedDestination] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const startMutation = trpc.guestCases.start.useMutation();
  const answerMutation = trpc.guestCases.answerQuestion.useMutation();
  const contactMutation = trpc.guestCases.submitContact.useMutation();
  const verifyMutation = trpc.guestCases.verifyContact.useMutation();
  const resendCodeMutation = trpc.guestCases.resendVerification.useMutation();
  const reviewCheckoutMutation = trpc.technicianReviews.startCheckout.useMutation();
  const [reviewCheckoutError, setReviewCheckoutError] = useState<string | null>(null);

  // Evidence photos (optional, image-only for now). The guest can attach
  // these right after describing the concern, before a case even exists yet
  // (publicToken is only issued once the intake form is submitted) — so a
  // photo picked at that point is staged locally (id: null, dataUrl kept for
  // upload) and only actually uploaded once startGuestCase returns a token;
  // see uploadStagedPhotos below. Photos picked later, once a token already
  // exists, upload immediately as before.
  const uploadPhotoMutation = trpc.guestCases.uploadEvidencePhoto.useMutation();
  const [photos, setPhotos] = useState<Array<{ id: number | null; url: string; dataUrl?: string }>>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingStaged, setUploadingStaged] = useState(false);

  async function uploadStagedPhotos(token: string) {
    const staged = photos.filter((p) => p.id === null && p.dataUrl);
    if (staged.length === 0) return;
    setUploadingStaged(true);
    try {
      for (const p of staged) {
        try {
          const res = await uploadPhotoMutation.mutateAsync({ publicToken: token, dataUrl: p.dataUrl! });
          setPhotos((prev) =>
            prev.map((x) => (x === p ? { id: res.id, url: res.url } : x))
          );
        } catch (err) {
          setPhotoError(getFriendlyErrorMessage(err, "Couldn't upload a photo. Please try again."));
        }
      }
    } finally {
      setUploadingStaged(false);
    }
  }

  function applyStep(res: {
    criticalTriggered: boolean;
    safetyGuidance: string | null;
    preliminary: Preliminary;
    nextQuestion: AdaptiveQuestion | null;
  }) {
    setPreliminary(res.preliminary);
    setSafetyGuidance(res.safetyGuidance);
    if (res.nextQuestion) {
      // Clarifying questions run even on a critical case (safety guidance
      // stays visible via the "questions" phase banner below) so confidence
      // has a chance to improve before the final report.
      setQuestion(res.nextQuestion);
      setPhase("questions");
    } else if (res.criticalTriggered) {
      setQuestion(null);
      setPhase("critical");
      trackEvent("critical_escalation_triggered", {});
    } else {
      setQuestion(null);
      setPhase("preliminary");
      trackEvent("preliminary_assessment_viewed", { readiness: res.preliminary.readiness });
    }
  }

  async function handleDecodeVin() {
    setVehicleDecodeError(null);
    const normalized = normalizeVinInput(vin);
    if (normalized.length !== 17) {
      setVehicleDecodeError("VIN must be 17 characters.");
      return;
    }
    setVin(normalized);
    setVinDecoding(true);
    const result = await decodeVin(normalized);
    setVinDecoding(false);
    if (result.ok) {
      setDecodedVehicle(result.vehicle);
      setVehicleStepError(null);
      trackEvent("vin_decoded", { cta_location: "try_one_case" });
    } else {
      setDecodedVehicle(null);
      setVehicleDecodeError(result.error);
      setManualVehicleEntry(true);
    }
  }

  function handleVinPhotoCaptured(capturedVin: string) {
    setVin(capturedVin);
    setVinFromPhoto(true);
    setDecodedVehicle(null);
    setVehicleDecodeError(null);
    trackEvent("vin_ocr_captured", { cta_location: "try_one_case" });
  }

  function buildVehicleIdentifier() {
    if (decodedVehicle) {
      return {
        vin: decodedVehicle.vin,
        make: decodedVehicle.make || undefined,
        model: decodedVehicle.model || undefined,
        year: decodedVehicle.year ? String(decodedVehicle.year) : undefined,
        unitNumber: manualUnitNumber.trim() || undefined,
      };
    }
    const identifier = {
      unitNumber: manualUnitNumber.trim() || undefined,
      make: manualMake.trim() || undefined,
      model: manualModel.trim() || undefined,
      year: manualYear.trim() || undefined,
    };
    return Object.values(identifier).some(Boolean) ? identifier : undefined;
  }

  function handleVehicleContinue() {
    setVehicleStepError(null);
    const hasDecoded = Boolean(decodedVehicle && (decodedVehicle.make || decodedVehicle.model));
    const hasManual = Boolean(manualVehicleEntry && (manualMake.trim() || manualModel.trim()));
    if (!hasDecoded && !hasManual) {
      setVehicleStepError("Decode a VIN, or enter the vehicle's make and model, to continue.");
      return;
    }
    trackEvent("vehicle_identified", { method: hasDecoded ? "vin_decode" : "manual" });
    setPhase("intake");
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
        vehicleIdentifier: buildVehicleIdentifier(),
        intakeSource: "web",
        inviteCode: inviteCode.trim() || undefined,
        trapField,
      } as never);
      setPublicToken(res.publicToken);
      applyStep(res);
      void uploadStagedPhotos(res.publicToken);
    } catch (err) {
      const raw = getFriendlyErrorMessage(err);
      // Fail-safe UX: if the client is in public mode but the server hasn't
      // completed the public-launch gate (e.g. sign-off/reviewer not yet set),
      // the server still requires an invite. Show a friendly "not open yet"
      // instead of an invite-code error the public visitor can't act on.
      const looksLikeInviteGate = /invite/i.test(raw);
      setIntakeError(
        !INVITE_REQUIRED && looksLikeInviteGate
          ? "The free case preview isn't open to everyone just yet — please check back soon."
          : raw
      );
    }
  }

  async function handleAnswer(value: string) {
    if (!publicToken || !question) return;
    setSelectedAnswerValue(value);
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
    } finally {
      setSelectedAnswerValue(null);
    }
  }

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    setContactError(null);
    if (!email.trim()) {
      setContactError("Enter an email address so we can send the result.");
      return;
    }
    if (!disclaimerAck) {
      setContactError("Please acknowledge the disclaimer to see the full result.");
      return;
    }
    if (!publicToken) return;
    try {
      const res = await contactMutation.mutateAsync({
        publicToken,
        email: email.trim(),
        phone: phone.trim() || undefined,
        consentEmail,
        consentSms,
        consentWhatsapp,
        consentMarketing,
        authorityConfirmed,
        disclaimerAcknowledged: true,
        disclaimerVersion: GUEST_RESULT_DISCLAIMER_VERSION,
        trapField,
      });
      setMaskedDestination(res.maskedDestination);
      setPhase("verify");
      trackEvent("verification_code_sent", {});
    } catch (err) {
      setContactError(getFriendlyErrorMessage(err));
    }
  }

  async function handleVerifySubmit(e: FormEvent) {
    e.preventDefault();
    setVerifyError(null);
    if (!publicToken) return;
    try {
      const res = await verifyMutation.mutateAsync({ publicToken, code: verificationCode.trim() });
      setDecision(res.decision as DecisionCard);
      setFreeCaseLimitReached(res.freeCaseLimitReached);
      setPhase("decision");
      trackEvent("decision_card_viewed", { readiness: (res.decision as DecisionCard).readiness });
    } catch (err) {
      setVerifyError(getFriendlyErrorMessage(err, "That code didn't work. Please try again."));
    }
  }

  async function handleResendCode() {
    setVerifyError(null);
    setResendMessage(null);
    if (!publicToken) return;
    try {
      const res = await resendCodeMutation.mutateAsync({ publicToken });
      setMaskedDestination(res.maskedDestination);
      setResendMessage("A new code is on its way.");
    } catch (err) {
      setVerifyError(getFriendlyErrorMessage(err, "Couldn't resend a code. Please try again."));
    }
  }

  async function handlePhotoSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setPhotoError(null);
    if (photos.length >= 5) {
      setPhotoError("You can attach up to 5 photos.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Please choose a JPEG, PNG, or WebP photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("That photo is too large (max 5MB).");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (!publicToken) {
        // No case yet — stage locally, uploaded automatically once the
        // intake form is submitted (see uploadStagedPhotos).
        setPhotos((prev) => [...prev, { id: null, url: dataUrl, dataUrl }]);
        return;
      }
      const res = await uploadPhotoMutation.mutateAsync({ publicToken, dataUrl });
      setPhotos((prev) => [...prev, { id: res.id, url: res.url }]);
    } catch (err) {
      setPhotoError(getFriendlyErrorMessage(err, "Couldn't upload that photo. Please try again."));
    }
  }

  async function handleStartReviewCheckout() {
    if (!publicToken) return;
    setReviewCheckoutError(null);
    try {
      const res = await reviewCheckoutMutation.mutateAsync({ publicToken });
      trackEvent("technician_review_checkout_started", {});
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err) {
      setReviewCheckoutError(getFriendlyErrorMessage(err, "Couldn't start checkout. Please try again."));
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

        {/* Provisional notice. Wording depends on invite-only vs public mode. */}
        <div className="mb-4 rounded-md border border-[#F3D9A0] bg-[#FDF3DF] px-3 py-2 text-xs leading-5 text-[#7a5a12]">
          {INVITE_REQUIRED ? (
            <>
              <span className="font-bold uppercase tracking-wide">Invite-only preview</span> · provisional.{" "}
            </>
          ) : null}
          Decision support only — not a confirmed diagnosis, roadworthiness certification, or emergency service.{" "}
          <strong className="font-bold">Do not use this while driving.</strong> Pull over and park safely first.
        </div>

        {phase === "vehicle" && (
          <div className={cn(cardClass, "space-y-5 p-5 sm:p-6")}>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]">
                Try one vehicle case — free
              </p>
              <h1 className={cn(displayClass, "text-2xl sm:text-3xl")}>Which vehicle is this?</h1>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">
                Start with the VIN — TruckFixr pulls the make, model, and year automatically.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vin" className="text-sm font-semibold">
                VIN
              </Label>
              <div className="flex gap-2">
                <Input
                  id="vin"
                  value={vin}
                  onChange={(e) => {
                    setVin(e.target.value);
                    setVinFromPhoto(false);
                  }}
                  placeholder="17-character VIN"
                  maxLength={17}
                  autoComplete="off"
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleDecodeVin}
                  disabled={vinDecoding}
                  className={cn("h-11 shrink-0 font-bold", redBtn)}
                >
                  {vinDecoding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decode"}
                </Button>
              </div>
              {vinFromPhoto && (
                <p className="text-sm font-medium text-[#38465F]">
                  Read from your photo — double-check it against the plate, then tap Decode.
                </p>
              )}
              {vehicleDecodeError && (
                <p className="text-sm font-medium text-[#D81F2A]" role="alert">
                  {vehicleDecodeError}
                </p>
              )}
              <VinPhotoCapture onVinCaptured={handleVinPhotoCaptured} disabled={vinDecoding} />
            </div>

            {decodedVehicle && (decodedVehicle.make || decodedVehicle.model || decodedVehicle.year) && (
              <div className="rounded-md border border-[#1EA66C] bg-[#EAF8F1] p-3 text-sm">
                <p className="flex items-center gap-1.5 font-bold text-[#0A1A2E]">
                  <Check className="h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
                  {[decodedVehicle.year, decodedVehicle.make, decodedVehicle.model].filter(Boolean).join(" ")}
                </p>
                <p className="mt-1 text-xs text-[#38465F]">VIN {decodedVehicle.vin}</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setManualVehicleEntry((v) => !v)}
              className="text-sm font-semibold text-[#38465F] underline underline-offset-2 hover:text-[#0A1A2E]"
            >
              {manualVehicleEntry ? "Hide manual entry" : "Don't have the VIN? Enter vehicle details manually"}
            </button>

            {manualVehicleEntry && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="manualMake" className="text-sm font-semibold">
                    Make
                  </Label>
                  <Input id="manualMake" value={manualMake} onChange={(e) => setManualMake(e.target.value)} placeholder="e.g. Freightliner" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manualModel" className="text-sm font-semibold">
                    Model
                  </Label>
                  <Input id="manualModel" value={manualModel} onChange={(e) => setManualModel(e.target.value)} placeholder="e.g. Cascadia" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manualYear" className="text-sm font-semibold">
                    Year <span className="font-normal text-[#73777E]">(optional)</span>
                  </Label>
                  <Input
                    id="manualYear"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 2021"
                    inputMode="numeric"
                    maxLength={4}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="manualUnitNumber" className="text-sm font-semibold">
                    Unit number <span className="font-normal text-[#73777E]">(optional)</span>
                  </Label>
                  <Input
                    id="manualUnitNumber"
                    value={manualUnitNumber}
                    onChange={(e) => setManualUnitNumber(e.target.value)}
                    placeholder="e.g. Unit 214"
                  />
                </div>
              </div>
            )}

            {vehicleStepError && (
              <p className="text-sm font-medium text-[#D81F2A]" role="alert">
                {vehicleStepError}
              </p>
            )}

            <Button
              type="button"
              onClick={handleVehicleContinue}
              className={cn("h-12 w-full text-[15px] font-bold", redBtn)}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

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

            <div className="flex items-center justify-between rounded-md border border-[#E2E6EC] bg-[#F8FAFC] p-3 text-sm">
              <span className="font-semibold text-[#0A1A2E]">
                {decodedVehicle
                  ? [decodedVehicle.year, decodedVehicle.make, decodedVehicle.model].filter(Boolean).join(" ") ||
                    `VIN ${decodedVehicle.vin}`
                  : [manualYear, manualMake, manualModel].filter(Boolean).join(" ") ||
                    manualUnitNumber ||
                    "Vehicle not specified"}
              </span>
              <button
                type="button"
                onClick={() => setPhase("vehicle")}
                className="font-semibold text-[#38465F] underline underline-offset-2 hover:text-[#0A1A2E]"
              >
                Change
              </button>
            </div>

            {INVITE_REQUIRED && (
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
            )}

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

            <div className="space-y-2 border-t border-[#E2E6EC] pt-4">
              <Label htmlFor="evidencePhoto">Add photos (optional)</Label>
              <p className="text-xs text-[#73777E]">
                A photo helps with the AI read and a technician later — dashboard lights, leaks, or the affected area. Up to 5, JPEG/PNG/WebP.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((p) => (
                  <img
                    key={p.id}
                    src={p.url}
                    alt="Uploaded evidence"
                    className="h-14 w-14 rounded-md border border-[#E2E6EC] object-cover"
                  />
                ))}
                {photos.length < 5 && (
                  <label
                    htmlFor="evidencePhoto"
                    className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-[#C3C7CE] text-[#73777E] hover:border-[#38465F] hover:text-[#38465F]"
                  >
                    {uploadPhotoMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ImagePlus className="h-5 w-5" aria-hidden="true" />
                    )}
                    <input
                      id="evidencePhoto"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handlePhotoSelect}
                      disabled={uploadPhotoMutation.isPending}
                    />
                  </label>
                )}
              </div>
              {photoError && (
                <p className="text-xs font-medium text-[#D81F2A]" role="alert">{photoError}</p>
              )}
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
          <div className="space-y-5">
            {safetyGuidance && <SafetyCard guidance={safetyGuidance} />}
            <div className={cn(cardClass, "space-y-5 p-5 sm:p-6")}>
              <StepDots current={Math.min(answered + 1, 3)} total={3} />
              <h2 className={cn(displayClass, "text-xl sm:text-2xl")}>{question.prompt}</h2>
              <div className="grid gap-2">
                {question.options.map((o) => {
                  const isSelected = answerMutation.isPending && selectedAnswerValue === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => handleAnswer(o.value)}
                      disabled={answerMutation.isPending}
                      aria-pressed={isSelected}
                      className={cn(
                        "min-h-[48px] rounded-md border px-4 text-left text-sm font-medium hover:border-[#0A1A2E] disabled:opacity-60",
                        isSelected
                          ? "border-[#D81F2A] bg-[#FDEAEB] text-[#0A1A2E] opacity-100"
                          : "border-[#C3C7CE] bg-white text-[#0A1A2E]"
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
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
            {preliminary.explanation && (
              <p className="text-sm leading-6 text-[#38465F]">{preliminary.explanation}</p>
            )}
            {preliminary.confidenceLow && preliminary.lowConfidenceNotice && (
              <LowConfidenceNotice message={preliminary.lowConfidenceNotice} />
            )}
            <div className="rounded-md bg-[#F1F4F9] p-3 text-sm text-[#38465F]">
              Add one contact method to see the full decision card — reasoning, what to check next, and how to share it.
            </div>

            {photos.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E6EC] pt-4">
                {photos.map((p) => (
                  <img
                    key={p.id}
                    src={p.url}
                    alt="Uploaded evidence"
                    className="h-14 w-14 rounded-md border border-[#E2E6EC] object-cover"
                  />
                ))}
              </div>
            )}

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
              <p className="mt-2 text-sm text-[#38465F]">We'll email your full decision card and next steps.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">
                Email <span className="text-[#D81F2A]">*</span>
              </Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fleet.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold">Mobile number (optional)</Label>
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

            <label className="flex items-start gap-2 rounded-md border border-[#E2E6EC] bg-[#F8FAFC] p-3 text-xs leading-5 text-[#38465F]">
              <input
                type="checkbox"
                checked={disclaimerAck}
                onChange={(e) => setDisclaimerAck(e.target.checked)}
                className="mt-0.5 h-4 w-4"
                required
              />
              <span>{GUEST_RESULT_DISCLAIMER_TEXT}</span>
            </label>

            {contactError && (
              <p className="text-sm font-medium text-[#D81F2A]" role="alert">{contactError}</p>
            )}
            <Button type="submit" disabled={contactMutation.isPending || !disclaimerAck} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {contactMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Show my decision
            </Button>
          </form>
        )}

        {phase === "verify" && (
          <form onSubmit={handleVerifySubmit} className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
            <div>
              <h2 className={cn(displayClass, "text-xl")}>Check your email</h2>
              <p className="mt-1 text-sm text-[#38465F]">
                We sent a 6-digit code to {maskedDestination || "your email"}. Enter it below to see your full result.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="verificationCode">Verification code</Label>
              <Input
                id="verificationCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="text-center text-lg tracking-[0.3em]"
              />
            </div>
            {verifyError && (
              <p className="text-sm font-medium text-[#D81F2A]" role="alert">{verifyError}</p>
            )}
            {resendMessage && <p className="text-sm text-[#1EA66C]">{resendMessage}</p>}
            <Button
              type="submit"
              disabled={verifyMutation.isPending || verificationCode.trim().length < 4}
              className={cn("h-12 w-full text-[15px] font-bold", redBtn)}
            >
              {verifyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verify and show my result
            </Button>
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCodeMutation.isPending}
              className="w-full text-center text-sm font-semibold text-[#38465F] underline underline-offset-2 hover:text-[#0A1A2E]"
            >
              Didn't get a code? Resend
            </button>
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
                {decision.explanation && (
                  <p className="mt-2 text-sm leading-6 text-[#38465F]">{decision.explanation}</p>
                )}
                {decision.confidenceLow && decision.lowConfidenceNotice && (
                  <div className="mt-3">
                    <LowConfidenceNotice message={decision.lowConfidenceNotice} />
                  </div>
                )}
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
              {decision.possibleCausesSuppressed ? (
                <p className="rounded-md bg-[#F1F4F9] p-3 text-xs text-[#73777E]">
                  Possible causes are not shown here — they need physical testing to confirm. Possible causes are not a confirmed diagnosis.
                </p>
              ) : (
                decision.possibleCauses &&
                decision.possibleCauses.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[#38465F]">
                      Possible causes (hypothesis only)
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {decision.possibleCauses.map((cause, i) => (
                        <li key={i} className="rounded-md border border-[#E2E6EC] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-[#0A1A2E]">{cause.label}</span>
                            <span className="rounded-full bg-[#F1F4F9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#38465F]">
                              {cause.confidenceBand} confidence
                            </span>
                          </div>
                          {cause.supportingEvidence.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5 text-xs text-[#73777E]">
                              {cause.supportingEvidence.map((e, j) => (
                                <li key={j}>• {e}</li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-[#73777E]">
                      AI-generated hypotheses, not a confirmed diagnosis. Physical testing or a technician review is
                      needed to confirm.
                    </p>
                  </div>
                )
              )}
              <p className="text-xs text-[#73777E]">
                Human review status: <span className="font-semibold">{decision.humanReviewStatus.replace(/_/g, " ")}</span>
              </p>
            </div>

            <div className={cn(cardClass, "space-y-3 p-5")}>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-[#38465F]">
                  Want a qualified technician to review this?
                </h3>
                <p className="mt-1 text-sm text-[#38465F]">
                  A written, technician-reviewed report — delivered within two business hours
                  (Mon–Sat, 9am–6pm Eastern) once your evidence is complete. CAD $99, paid upfront.
                </p>
              </div>
              {reviewCheckoutError && (
                <p className="text-sm font-medium text-[#D81F2A]" role="alert">{reviewCheckoutError}</p>
              )}
              <Button
                onClick={handleStartReviewCheckout}
                disabled={reviewCheckoutMutation.isPending}
                className={cn("h-11 w-full font-bold", redBtn)}
              >
                {reviewCheckoutMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Get a technician review — CAD $99
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
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
