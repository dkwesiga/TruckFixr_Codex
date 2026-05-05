import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, CheckCircle2, KeyRound, Ticket, UserPlus } from "lucide-react";

const accessCards = [
  {
    title: "Start a 30-day trial",
    body: "For fleet owners and managers who want to try TruckFixr with a small fleet. No credit card required.",
    href: "/access/start-trial",
    cta: "Start Trial",
    icon: CheckCircle2,
  },
  {
    title: "Enter pilot code",
    body: "For selected fleets and existing customers invited by TruckFixr. Pilot access gives you higher usage limits during your 30-day pilot.",
    href: "/access/pilot-code",
    cta: "Enter Pilot Code",
    icon: Ticket,
  },
  {
    title: "Accept driver invitation",
    body: "For drivers invited by a fleet owner or manager. Confirm your invitation and access your driver dashboard.",
    href: "/access/driver-invite",
    cta: "Accept Invitation",
    icon: UserPlus,
  },
  {
    title: "Sign in",
    body: "Already have an account? Continue to your TruckFixr dashboard.",
    href: "/auth/email",
    cta: "Sign In",
    icon: KeyRound,
  },
];

export default function AccessGateway() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center">
            <AppLogo variant="full" imageClassName="h-10 w-auto" />
          </a>
          <Button asChild className="rounded-full bg-[#E32636] px-5 font-bold text-white hover:bg-[#BC1E2C]">
            <a href="/auth/email">Sign In</a>
          </Button>
        </header>

        <section className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A04100]">Access TruckFixr Fleet AI</p>
          <h1 className="mt-3 font-['Manrope'] text-4xl font-black tracking-[-0.04em] text-[#00263F] sm:text-5xl">
            Choose the option that matches how you were invited or how you want to start.
          </h1>
          <p className="mt-4 text-base leading-8 text-[#42474E]">
            Book a Demo remains the primary sales path. This page is for users who already have a reason to enter the app.
          </p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          {accessCards.map((card) => (
            <Card key={card.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <card.icon className="h-6 w-6 text-[#E32636]" />
              <h2 className="mt-4 font-['Manrope'] text-2xl font-black text-[#00263F]">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[#42474E]">{card.body}</p>
              <Button asChild className="mt-5 rounded-full bg-[#00263F] px-5 font-bold text-white hover:bg-[#0B3C5D]">
                <a href={card.href}>
                  {card.cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
