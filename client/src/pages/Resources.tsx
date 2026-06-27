import { type CSSProperties } from "react";
import { Calculator, ClipboardCheck, CalendarClock } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import ResourceCard, {
  type ResourceCardData,
} from "@/components/resources/ResourceCard";
import { useSeoMeta } from "@/lib/useSeoMeta";

const colors = {
  fleetBlue: "#0B3C5D",
  fleetNavy: "#00263F",
  orange: "#E32636",
  surface: "#F6F8FC",
  surfaceSoft: "#E8EEF8",
  ink: "#0B1C30",
  muted: "#42474E",
};

export const RESOURCE_CARDS: ResourceCardData[] = [
  {
    icon: Calculator,
    title: "Fleet Downtime Cost Calculator",
    description:
      "Estimate how much downtime could be costing your fleet across vehicles, repair delays, and repeat issues — and where faster maintenance decisions can help.",
    href: "/fleet-downtime-cost-calculator",
    cta: "Open calculator",
  },
  {
    icon: ClipboardCheck,
    title: "Ontario Daily Inspection Guide",
    description:
      "A practical overview of daily commercial vehicle inspections in Ontario: what drivers check, how defects are recorded, and how to keep inspections from piling up.",
    href: "/resources/ontario-daily-inspection-guide",
    cta: "Read the guide",
  },
  {
    icon: CalendarClock,
    title: "Annual Inspection Planning Checklist",
    description:
      "A simple checklist to plan annual and semi-annual inspection dates ahead of time, so maintenance stays scheduled instead of becoming urgent at the last minute.",
    href: "/resources/annual-inspection-planning-checklist",
    cta: "Open checklist",
  },
];

export default function Resources() {
  useSeoMeta({
    title: "Fleet Maintenance Resources | TruckFixr Fleet AI",
    description:
      "Practical resources for small and mid-sized commercial fleets: a downtime cost calculator, an Ontario daily inspection guide, and an annual inspection planning checklist.",
  });

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
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center" aria-label="TruckFixr home">
            <AppLogo variant="full" imageClassName="h-10 w-auto" />
          </a>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-full border-[#00263F] bg-white px-3 font-['Manrope'] text-xs font-bold text-[#00263F] hover:border-[#E32636] hover:bg-[#F4F7FD] sm:px-4 sm:text-sm"
            >
              <a href="/#demo">Book a Demo</a>
            </Button>
            <Button
              asChild
              className="rounded-full bg-[#E32636] px-3 font-['Manrope'] text-xs font-bold text-white hover:bg-[#BC1E2C] sm:px-5 sm:text-sm"
            >
              <a href="/#request-pilot">Request Pilot Access</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-[var(--fleet-outline)] bg-[linear-gradient(140deg,#F7F9FC_0%,#E9EEF7_52%,#FDEDEF_100%)] px-4 py-14 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-[820px] text-center">
            <p className="inline-flex rounded-full bg-[#00263F] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white">
              Resources
            </p>
            <h1 className="mt-6 font-['Manrope'] text-4xl font-black leading-[1.0] tracking-[-0.04em] text-[#00263F] sm:text-5xl">
              Practical tools for fleet maintenance planning
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#42474E]">
              Free guides and tools to help small and mid-sized fleets reduce
              downtime by turning inspections, defects, and compliance dates into
              earlier maintenance decisions.
            </p>
          </div>
        </section>

        <section className="bg-white px-4 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto grid max-w-[1100px] gap-6 md:grid-cols-3">
            {RESOURCE_CARDS.map((card) => (
              <ResourceCard key={card.href} card={card} />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--fleet-outline)] bg-white">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 py-8 text-sm text-[#42474E] sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <AppLogo imageClassName="h-8" frameClassName="rounded p-1.5" />
            <span className="font-['Manrope'] font-black text-[#00263F]">
              TruckFixr Fleet AI
            </span>
          </div>
          <p>
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
