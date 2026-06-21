import { useEffect, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import FleetDowntimeCalculator from "@/components/calculators/FleetDowntimeCalculator";
import { trackEvent } from "@/lib/analytics";

const colors = {
  fleetBlue: "#0B3C5D",
  fleetNavy: "#00263F",
  orange: "#E32636",
  surface: "#F6F8FC",
  surfaceSoft: "#E8EEF8",
  ink: "#0B1C30",
  muted: "#42474E",
};

const PAGE_PATH = "/fleet-downtime-cost-calculator";
const PAGE_TITLE =
  "Fleet Downtime Cost Calculator for Medium Commercial Fleets";
const PAGE_DESCRIPTION =
  "Estimate downtime exposure across vehicles, routes, driver time, lost revenue, repair delays, and repeat maintenance issues.";

const WORKFLOW_STEPS = [
  {
    label: "Inspect",
    body: "Daily inspections capture defects, photos, and timing.",
  },
  {
    label: "Report",
    body: "Drivers report symptoms, warning lights, and fault codes.",
  },
  {
    label: "AI Triage",
    body: "Symptoms and history become clearer maintenance direction.",
  },
  {
    label: "Decide",
    body: "Managers prioritize urgent safety issues vs. monitor items.",
  },
  {
    label: "Repair",
    body: "Technicians get symptom story and prior repair context.",
  },
  {
    label: "Learn",
    body: "Repair history builds maintenance visibility over time.",
  },
];

function useSeoMeta() {
  // This is a client-rendered SPA, so meta tags are applied at runtime. Crawlers
  // that execute JavaScript (and link unfurlers) will read these.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;

    const meta = document.querySelector('meta[name="description"]');
    const createdMeta = !meta;
    const descriptionEl = meta ?? document.createElement("meta");
    if (createdMeta) {
      descriptionEl.setAttribute("name", "description");
      document.head.appendChild(descriptionEl);
    }
    const previousDescription = descriptionEl.getAttribute("content");
    descriptionEl.setAttribute("content", PAGE_DESCRIPTION);

    return () => {
      document.title = previousTitle;
      if (createdMeta) {
        descriptionEl.remove();
      } else if (previousDescription !== null) {
        descriptionEl.setAttribute("content", previousDescription);
      }
    };
  }, []);
}

export default function FleetDowntimeCostCalculator() {
  useSeoMeta();

  useEffect(() => {
    trackEvent("downtime_calculator_opened", { source_page: PAGE_PATH });
  }, []);

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
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-full border-[#00263F] bg-white px-3 font-['Manrope'] text-xs font-bold text-[#00263F] hover:border-[#E32636] hover:bg-[#F4F7FD] sm:px-4 sm:text-sm"
            >
              <a href="/#book-demo">Book a Demo</a>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#E32636] px-3 font-['Manrope'] text-xs font-bold text-white hover:bg-[#BC1E2C] sm:px-5 sm:text-sm"
            >
              <a href="/access">Get Access</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b border-[var(--fleet-outline)] bg-[linear-gradient(140deg,#F7F9FC_0%,#E9EEF7_52%,#FDEDEF_100%)] px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-[900px] text-center">
            <p className="inline-flex rounded-full bg-[#00263F] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
              Fleet downtime cost calculator
            </p>
            <h1 className="mt-6 font-['Manrope'] text-4xl font-black leading-[0.98] tracking-[-0.04em] text-[#00263F] sm:text-5xl">
              What Does One Truck Down for One Day Really Cost?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#42474E]">
              Use this calculator to estimate downtime exposure across vehicles,
              driver time, repair delays, repeat issues, and maintenance
              workflow gaps.
            </p>
          </div>
        </section>

        {/* Explanation */}
        <section className="bg-white px-4 py-12 sm:px-6">
          <div className="mx-auto grid max-w-[1000px] gap-6 md:grid-cols-3">
            {[
              {
                title: "Downtime is more than a repair bill",
                body: "When a vehicle is down, you lose revenue and still carry driver and labour cost — every day it sits.",
              },
              {
                title: "Delays compound the cost",
                body: "Time spent deciding what to do, and repeat repairs that come back, quietly add to monthly exposure.",
              },
              {
                title: "Scattered workflows hide the signal",
                body: "When inspections, texts, and invoices live in different places, downtime risk is harder to see early.",
              },
            ].map(card => (
              <div
                key={card.title}
                className="rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] p-5 shadow-[var(--fleet-shadow)]"
              >
                <h2 className="font-['Manrope'] text-base font-black text-[#00263F]">
                  {card.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#42474E]">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Embedded calculator */}
        <section className="bg-[var(--fleet-surface)] px-4 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-[820px]">
            <div className="rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)] sm:p-8">
              <FleetDowntimeCalculator sourcePagePath={PAGE_PATH} />
            </div>
          </div>
        </section>

        {/* Workflow explanation */}
        <section className="bg-[#00263F] px-4 py-14 text-white sm:px-6 lg:py-20">
          <div className="mx-auto max-w-[1100px]">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFB693]">
                The TruckFixr workflow
              </p>
              <h2 className="mt-3 font-['Manrope'] text-3xl font-black tracking-[-0.03em] sm:text-4xl">
                Inspect → Report → AI Triage → Decide → Repair → Learn
              </h2>
              <p className="mt-4 text-base leading-7 text-blue-100">
                TruckFixr connects each step so downtime becomes a visible,
                manageable workflow — not a surprise.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {WORKFLOW_STEPS.map((step, index) => (
                <div
                  key={step.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"
                >
                  <p className="font-['Manrope'] text-sm font-black uppercase tracking-[0.16em] text-[#FFB693]">
                    {index + 1}. {step.label}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-blue-100/90">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTAs */}
        <section className="px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto flex max-w-[1000px] flex-col items-center gap-6 rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-8 text-center shadow-[var(--fleet-shadow)]">
            <h2 className="font-['Manrope'] text-2xl font-black text-[#00263F] sm:text-3xl">
              Want to see where your downtime risk is coming from?
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[#42474E]">
              Book a fleet workflow review to walk through your inspections,
              repair decisions, and maintenance visibility — or apply for the
              TruckFixr pilot.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                onClick={() =>
                  trackEvent("downtime_calculator_workflow_review_clicked", {
                    source_page: PAGE_PATH,
                  })
                }
                className="rounded-full bg-[#E32636] px-8 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]"
              >
                <a href="/#book-demo">
                  Book a Fleet Workflow Review
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                onClick={() =>
                  trackEvent("downtime_calculator_pilot_clicked", {
                    source_page: PAGE_PATH,
                  })
                }
                className="rounded-full border-2 border-[#00263F] bg-white px-8 font-['Manrope'] font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
              >
                <a href="/access">Apply for Pilot</a>
              </Button>
            </div>
            <p className="max-w-2xl text-xs leading-5 text-[#6B7280]">
              This calculator provides an estimate for planning and workflow
              review purposes only. It does not guarantee savings, downtime
              reduction, repair outcomes, or compliance results.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--fleet-outline)] bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-sm text-[#42474E] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <AppLogo imageClassName="h-8" frameClassName="rounded p-1.5" />
            <span className="font-['Manrope'] font-black text-[#00263F]">
              TruckFixr Fleet AI
            </span>
          </div>
          <p>
            Contact:{" "}
            <a
              href="mailto:info@truckfixr.com"
              className="hover:text-[#F37021]"
            >
              info@truckfixr.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
