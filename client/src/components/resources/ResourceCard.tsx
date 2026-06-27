import { ArrowRight, type LucideIcon } from "lucide-react";

export type ResourceCardData = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
};

/**
 * Compact, reusable card for the Resources index and the homepage Resources
 * strip. Uses the shared --fleet-* tokens and Manrope/Inter type scale already
 * used across LandingSaaS and the downtime calculator page, so it matches the
 * existing brand without a redesign.
 */
export default function ResourceCard({ card }: { card: ResourceCardData }) {
  return (
    <a
      href={card.href}
      className="group flex h-full flex-col rounded-3xl border border-[var(--fleet-outline)] bg-white p-6 shadow-[var(--fleet-shadow)] transition hover:-translate-y-0.5 hover:border-[#E32636]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00263F]"
    >
      <card.icon className="h-8 w-8 text-[#E32636]" />
      <h3 className="mt-5 font-['Manrope'] text-lg font-black text-[#00263F]">
        {card.title}
      </h3>
      <p className="mt-3 flex-1 text-sm leading-7 text-[#42474E]">
        {card.description}
      </p>
      <span className="mt-5 inline-flex items-center gap-2 font-['Manrope'] text-sm font-bold text-[#A04100]">
        {card.cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </a>
  );
}
