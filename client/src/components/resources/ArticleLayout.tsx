import { type CSSProperties, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import AnalyticsOptOutLink from "@/components/analytics/AnalyticsOptOutLink";

const colors = {
  fleetBlue: "#0B3C5D",
  fleetNavy: "#00263F",
  orange: "#E32636",
  surface: "#F6F8FC",
  surfaceSoft: "#E8EEF8",
  ink: "#0B1C30",
  muted: "#42474E",
};

export type OfficialReference = { label: string; href: string };

/**
 * Shared shell for static Resources pages (index + article pages). Reuses the
 * header/footer and --fleet-* token style from LandingSaaS and the downtime
 * calculator page so resource pages stay on-brand without a redesign.
 *
 * `disclaimer` and `references` are optional; compliance-related pages pass them
 * to render the standard "general guidance only" note and official Ontario/MTO
 * source links at the bottom.
 */
export default function ArticleLayout({
  eyebrow,
  title,
  intro,
  children,
  disclaimer,
  references,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
  disclaimer?: string;
  references?: OfficialReference[];
}) {
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
            <a
              href="/resources"
              className="hidden font-['Manrope'] text-xs font-bold uppercase tracking-[0.08em] text-[var(--fleet-muted)] transition-colors hover:text-[#E32636] sm:inline"
            >
              Resources
            </a>
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
        <section className="border-b border-[var(--fleet-outline)] bg-[linear-gradient(140deg,#F7F9FC_0%,#E9EEF7_52%,#FDEDEF_100%)] px-4 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-[820px]">
            <a
              href="/resources"
              className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.16em] text-[#A04100] hover:underline"
            >
              Resources
            </a>
            <p className="mt-4 inline-flex rounded-full bg-[#00263F] px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-white">
              {eyebrow}
            </p>
            <h1 className="mt-5 font-['Manrope'] text-3xl font-black leading-[1.04] tracking-[-0.03em] text-[#00263F] sm:text-4xl">
              {title}
            </h1>
            {intro ? (
              <p className="mt-5 text-lg leading-8 text-[#42474E]">{intro}</p>
            ) : null}
          </div>
        </section>

        <section className="bg-white px-4 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-[820px] [&_h2]:mt-10 [&_h2]:font-['Manrope'] [&_h2]:text-2xl [&_h2]:font-black [&_h2]:tracking-[-0.02em] [&_h2]:text-[#00263F] [&_h3]:mt-7 [&_h3]:font-['Manrope'] [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-[#00263F] [&_p]:mt-4 [&_p]:text-base [&_p]:leading-8 [&_p]:text-[#42474E] [&_ul]:mt-4 [&_ul]:space-y-2 [&_li]:text-base [&_li]:leading-7 [&_li]:text-[#42474E]">
            {children}

            {disclaimer ? (
              <div className="mt-12 rounded-2xl border border-[var(--fleet-outline)] bg-[var(--fleet-surface)] p-5">
                <p className="font-['Manrope'] text-sm font-black text-[#00263F]">
                  Disclaimer
                </p>
                <p className="mt-2 text-sm leading-7 text-[#42474E]">
                  {disclaimer}
                </p>
              </div>
            ) : null}

            {references && references.length > 0 ? (
              <div className="mt-8">
                <h2 className="!mt-0 font-['Manrope'] text-xl font-black text-[#00263F]">
                  Official references
                </h2>
                <ul className="mt-4 space-y-2">
                  {references.map(ref => (
                    <li key={ref.href} className="text-base leading-7">
                      <a
                        href={ref.href}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#0B3C5D] underline-offset-4 hover:underline"
                      >
                        {ref.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section className="bg-[var(--fleet-surface)] px-4 py-12 sm:px-6 lg:py-16">
          <div className="mx-auto flex max-w-[820px] flex-col items-center gap-5 rounded-[2rem] border border-[var(--fleet-outline)] bg-white p-8 text-center shadow-[var(--fleet-shadow)]">
            <h2 className="font-['Manrope'] text-2xl font-black text-[#00263F]">
              See how TruckFixr supports faster maintenance decisions
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[#42474E]">
              TruckFixr helps small and mid-sized fleets organize
              driver-reported issues, inspections, fault codes, compliance
              dates, and repair history so maintenance does not become urgent at
              the last minute.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[#E32636] px-8 font-['Manrope'] font-bold text-white hover:bg-[#BC1E2C]"
              >
                <a href="/#request-pilot">
                  Request Pilot Access
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-2 border-[#00263F] bg-white px-8 font-['Manrope'] font-bold text-[#00263F] hover:bg-[#00263F] hover:text-white"
              >
                <a href="/#demo">Book a Demo</a>
              </Button>
            </div>
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
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Contact:{" "}
              <a
                href="mailto:info@truckfixr.com"
                className="hover:text-[#F37021]"
              >
                info@truckfixr.com
              </a>
            </span>
            <span aria-hidden="true">·</span>
            <AnalyticsOptOutLink className="text-[#42474E] hover:text-[#F37021]" />
          </p>
        </div>
      </footer>
    </div>
  );
}
