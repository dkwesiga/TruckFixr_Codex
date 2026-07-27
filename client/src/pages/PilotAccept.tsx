import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { useAuthContext } from "@/hooks/useAuthContext";
import {
  PILOT_AGREEMENT_DISCLAIMERS,
  PILOT_AGREEMENT_TERMS,
  PILOT_AGREEMENT_VERSION,
} from "@shared/pilotAgreement";

const shell = "mx-auto w-full max-w-[680px] px-4 sm:px-6";
const cardClass =
  "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

// Survives the sign-in round trip: a guest who applied then signs in returns here
// with the application id restored from storage even if it drops off the URL.
const STORAGE_KEY = "truckfixr:pending-pilot-application";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-16 font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <header className="border-b border-[#C3C7CE] bg-white/90 backdrop-blur">
        <div className={cn(shell, "flex items-center justify-between py-3")}>
          <Link href="/">
            <AppLogo />
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#38465F] hover:text-[#0A1A2E]">
            Back to home
          </Link>
        </div>
      </header>
      <main className={cn(shell, "pt-6")}>{children}</main>
    </div>
  );
}

export default function PilotAccept() {
  useSeoMeta({
    title: "Accept & Pay — 30-Day Assisted Pilot | TruckFixr",
    description: "Accept the TruckFixr assisted-pilot agreement and complete the one-time CAD $99 payment.",
  });

  const { user, isLoading: authLoading } = useAuthContext();
  const search = useSearch();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // Resolve the application id from the URL, persisting it for the sign-in round trip.
  const applicationId = useMemo(() => {
    const fromUrl = Number(new URLSearchParams(search).get("application"));
    if (Number.isInteger(fromUrl) && fromUrl > 0) {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(fromUrl));
      } catch {
        /* storage unavailable — fall through to URL value */
      }
      return fromUrl;
    }
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isInteger(stored) && stored > 0 ? stored : null;
    } catch {
      return null;
    }
  }, [search]);

  const acceptMutation = trpc.pilotApplications.acceptAgreement.useMutation();
  const checkoutMutation = trpc.subscriptions.createPilotCheckoutSession.useMutation();
  const busy = acceptMutation.isPending || checkoutMutation.isPending || redirecting;

  async function onAcceptAndPay() {
    if (!applicationId || !accepted) return;
    setError(null);
    try {
      await acceptMutation.mutateAsync({
        applicationId,
        agreementVersion: PILOT_AGREEMENT_VERSION,
      });
      const { checkoutUrl } = await checkoutMutation.mutateAsync({
        pilotApplicationId: applicationId,
        successPath: "/profile?pilot=paid",
        cancelPath: "/pilot/accept?application=" + applicationId,
      });
      if (!checkoutUrl) {
        setError("Could not start checkout. Please try again in a moment.");
        return;
      }
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* best effort */
      }
      setRedirecting(true);
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (authLoading) {
    return (
      <Page>
        <div className={cn(cardClass, "flex items-center gap-3 p-6 text-sm text-[#38465F]")}>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading…
        </div>
      </Page>
    );
  }

  // No application to act on — send them back to apply.
  if (!applicationId) {
    return (
      <Page>
        <div className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
          <h1 className={cn(displayClass, "text-2xl")}>Start with your pilot application</h1>
          <p className="text-sm leading-6 text-[#38465F]">
            We couldn't find a pilot application to accept. Tell us about your fleet first, then come back to accept and pay.
          </p>
          <Link href="/pilot-apply">
            <Button className={cn("h-11 w-full font-bold", redBtn)}>
              Go to pilot application
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Page>
    );
  }

  // Not signed in — the agreement + payment require an authenticated owner.
  if (!user) {
    return (
      <Page>
        <div className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
          <div className="flex items-center gap-2 text-[#0A1A2E]">
            <ShieldCheck className="h-6 w-6 text-[#D81F2A]" aria-hidden="true" />
            <h1 className={cn(displayClass, "text-2xl")}>Sign in to accept &amp; pay</h1>
          </div>
          <p className="text-sm leading-6 text-[#38465F]">
            Accepting the pilot agreement and completing the CAD&nbsp;$99 payment needs a fleet-owner account. Sign in or create one, then return to this page to finish.
          </p>
          <Link href="/access">
            <Button className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              Continue to sign in
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-xs text-[#73777E]">Your application is saved — you'll pick up right here.</p>
        </div>
      </Page>
    );
  }

  // Authenticated owner — show the agreement and the accept-&-pay action.
  return (
    <Page>
      <div className={cn(cardClass, "space-y-5 p-5 sm:p-6")}>
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]">
            30-day assisted pilot — CAD $99
          </p>
          <h1 className={cn(displayClass, "text-2xl sm:text-3xl")}>Accept the agreement &amp; pay</h1>
          <p className="mt-2 text-sm leading-6 text-[#38465F]">
            One-time CAD&nbsp;$99, credited toward your first month if you continue within 14 days after the pilot.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-[#0A1A2E]">
          {PILOT_AGREEMENT_TERMS.map((t) => (
            <li key={t} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1EA66C]" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>

        <div className="rounded-md bg-[#F1F4F9] p-3 text-xs text-[#73777E]">
          {PILOT_AGREEMENT_DISCLAIMERS.map((d) => (
            <p key={d} className="mb-1 last:mb-0">
              {d}
            </p>
          ))}
          <p className="mt-1">Agreement version {PILOT_AGREEMENT_VERSION}.</p>
        </div>

        <label className="flex items-start gap-2 text-sm text-[#0A1A2E]">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            I have read and accept the assisted-pilot agreement (version {PILOT_AGREEMENT_VERSION}) on behalf of my fleet.
          </span>
        </label>

        {error && (
          <p className="text-sm font-medium text-[#D81F2A]" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          onClick={onAcceptAndPay}
          disabled={!accepted || busy}
          className={cn("h-12 w-full text-[15px] font-bold", redBtn)}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {redirecting ? "Redirecting to secure checkout…" : "Accept & Pay CAD $99"}
        </Button>
        <p className="text-center text-xs text-[#73777E]">
          Payment is handled securely by Stripe. Paying starts your setup — the pilot activates once your fleet and kickoff details are in place.
        </p>
      </div>
    </Page>
  );
}
