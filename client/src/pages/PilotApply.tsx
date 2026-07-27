import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import {
  PILOT_AGREEMENT_DISCLAIMERS,
  PILOT_AGREEMENT_TERMS,
  PILOT_AGREEMENT_VERSION,
} from "@shared/pilotAgreement";

const shell = "mx-auto w-full max-w-[680px] px-4 sm:px-6";
const cardClass = "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass = "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

type Result = { qualificationResult: "qualified" | "needs_review" | "not_a_fit"; id: number } | null;

export default function PilotApply() {
  useSeoMeta({
    title: "Start the 30-Day Assisted Pilot — CAD $99 | TruckFixr",
    description: "Tell us about your fleet to start the 30-day assisted TruckFixr pilot for up to five vehicles.",
  });

  const [fleetName, setFleetName] = useState("");
  const [vehicleCount, setVehicleCount] = useState("");
  const [coordinatorName, setCoordinatorName] = useState("");
  const [expectedCases, setExpectedCases] = useState("");
  const [outsourced, setOutsourced] = useState(false);
  const [hasManager, setHasManager] = useState(false);
  const [email, setEmail] = useState("");
  const [trapField, setTrapField] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  const submit = trpc.pilotApplications.submit.useMutation();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fleetName.trim().length < 2) {
      setError("Please enter your fleet name.");
      return;
    }
    try {
      const res = await submit.mutateAsync({
        fleetName: fleetName.trim(),
        vehicleCount: vehicleCount ? Number(vehicleCount) : undefined,
        coordinatorName: coordinatorName.trim() || undefined,
        expectedCases30d: expectedCases ? Number(expectedCases) : undefined,
        outsourced,
        hasMaintenanceManager: hasManager,
        primaryContact: email.trim() ? { email: email.trim() } : undefined,
        trapField,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-16 font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <header className="border-b border-[#C3C7CE] bg-white/90 backdrop-blur">
        <div className={cn(shell, "flex items-center justify-between py-3")}>
          <Link href="/"><AppLogo /></Link>
          <Link href="/" className="text-sm font-semibold text-[#38465F] hover:text-[#0A1A2E]">Back to home</Link>
        </div>
      </header>

      <main className={cn(shell, "pt-6")}>
        {!result ? (
          <form onSubmit={onSubmit} className={cn(cardClass, "space-y-5 p-5 sm:p-6")} noValidate>
            <input type="text" value={trapField} onChange={(e) => setTrapField(e.target.value)} tabIndex={-1} aria-hidden="true" className="absolute left-[-9999px] h-px w-px opacity-0" autoComplete="off" />
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#D81F2A]">30-day assisted pilot — CAD $99</p>
              <h1 className={cn(displayClass, "text-2xl sm:text-3xl")}>Start your pilot</h1>
              <p className="mt-2 text-sm leading-6 text-[#38465F]">Up to five vehicles, 30 days. Tell us about your fleet and we'll confirm your fit.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fleetName" className="text-sm font-semibold">Fleet name <span className="text-[#D81F2A]">*</span></Label>
              <Input id="fleetName" value={fleetName} onChange={(e) => setFleetName(e.target.value)} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vehicleCount" className="text-sm font-semibold">Number of vehicles</Label>
                <Input id="vehicleCount" type="number" min={0} value={vehicleCount} onChange={(e) => setVehicleCount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedCases" className="text-sm font-semibold">Expected cases (next 30 days)</Label>
                <Input id="expectedCases" type="number" min={0} value={expectedCases} onChange={(e) => setExpectedCases(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coordinatorName" className="text-sm font-semibold">Maintenance coordinator</Label>
              <Input id="coordinatorName" value={coordinatorName} onChange={(e) => setCoordinatorName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Contact email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fleet.com" />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={outsourced} onChange={(e) => setOutsourced(e.target.checked)} className="h-4 w-4" />Repairs are outsourced</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hasManager} onChange={(e) => setHasManager(e.target.checked)} className="h-4 w-4" />We have a maintenance manager</label>
            </div>

            {error && <p className="text-sm font-medium text-[#D81F2A]" role="alert">{error}</p>}
            <Button type="submit" disabled={submit.isPending} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Check my fit
            </Button>
          </form>
        ) : (
          <div className={cn(cardClass, "space-y-5 p-5 sm:p-6")}>
            {result.qualificationResult === "qualified" ? (
              <>
                <div className="flex items-center gap-2 text-[#1EA66C]">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  <h1 className={cn(displayClass, "text-2xl !text-[#0A1A2E]")}>You're a fit — here are the terms</h1>
                </div>
                <ul className="space-y-2 text-sm text-[#0A1A2E]">
                  {PILOT_AGREEMENT_TERMS.map((t) => (
                    <li key={t} className="flex gap-2"><span className="text-[#D81F2A]">•</span>{t}</li>
                  ))}
                </ul>
                <div className="rounded-md bg-[#F1F4F9] p-3 text-xs text-[#73777E]">
                  {PILOT_AGREEMENT_DISCLAIMERS.map((d) => (<p key={d} className="mb-1 last:mb-0">{d}</p>))}
                  <p className="mt-1">Agreement version {PILOT_AGREEMENT_VERSION}.</p>
                </div>
                <p className="text-sm text-[#38465F]">
                  Next, sign in (or create a quick account) to accept the agreement and complete the CAD $99 payment. Payment is one-time and credited toward your first month if you continue within 14 days after the pilot.
                </p>
                <Link href={`/pilot/accept?application=${result.id}`}>
                  <Button className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
                    Continue to accept &amp; pay
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </>
            ) : result.qualificationResult === "needs_review" ? (
              <>
                <h1 className={cn(displayClass, "text-2xl")}>Thanks — we'll take a quick look</h1>
                <p className="text-sm leading-6 text-[#38465F]">Your fleet is a little outside the standard assisted-pilot setup, so a TruckFixr team member will review your details and follow up shortly.</p>
              </>
            ) : (
              <>
                <h1 className={cn(displayClass, "text-2xl")}>Let's start with one case</h1>
                <p className="text-sm leading-6 text-[#38465F]">The assisted pilot isn't the right fit just yet. You can still try one vehicle case free to see how TruckFixr works.</p>
                <Link href="/try-one-case"><Button className={cn("h-11 w-full font-bold", redBtn)}>Try One Vehicle Case Free</Button></Link>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
