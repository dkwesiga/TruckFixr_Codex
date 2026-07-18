import { useEffect, useState } from "react";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { trackEvent } from "@/lib/analytics";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import {
  BuildPilot,
  FinalCTA,
  FitCheck,
  HeroSection,
  HowItWorks,
  LandingHeader,
  PilotOffer,
  ProblemSection,
  ProofSection,
  RepairWorkflowSection,
  TractionStrip,
  getDefaultFitAnswers,
  type FitAnswerMap,
} from "@/components/marketing/FleetReadinessLandingSections";

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Mobile-only sticky CTA: appears after the hero scrolls away and hides while
// the lead-form section is on screen so it never covers the form it links to.
function StickyMobileCta({ onBookReview }: { onBookReview: () => void }) {
  const [pastHero, setPastHero] = useState(false);
  const [pilotVisible, setPilotVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const pilotSection = document.getElementById("pilot");
    let observer: IntersectionObserver | undefined;
    if (pilotSection && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => setPilotVisible(entries.some((entry) => entry.isIntersecting)),
        { rootMargin: "0px 0px -20% 0px" },
      );
      observer.observe(pilotSection);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  if (!pastHero || pilotVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#C3C7CE] bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
      <Button
        type="button"
        onClick={onBookReview}
        className="h-12 w-full rounded-md bg-[#D81F2A] text-[15px] font-bold text-white hover:bg-[#A6121B]"
      >
        Book a fleet review
      </Button>
    </div>
  );
}

export default function FleetReadinessLanding() {
  const [fitAnswers, setFitAnswers] = useState<FitAnswerMap>(() => getDefaultFitAnswers());
  const [fitCompleted, setFitCompleted] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([
    "Driver photo/video reporting",
    "Repair invoice upload",
    "Weekly pilot review",
  ]);

  useSeoMeta({
    title: "TruckFixr Fleet AI | Fleet Maintenance Triage and Vehicle Health Intelligence",
    description:
      "TruckFixr helps small and mid-sized fleets consolidate driver reports, inspections, fault information and repair history to assess maintenance urgency and decide what to do next.",
  });

  const handleFitCheck = (location: string) => {
    trackEvent("fleet_readiness_fit_check_clicked", { cta_location: location });
    scrollToSection("fit-check");
  };

  const handlePilot = (location: string) => {
    trackEvent("start_30_day_pilot_clicked", { cta_location: location });
    scrollToSection("pilot");
  };

  const handleBuildPilot = () => {
    trackEvent("build_pilot_clicked", { cta_location: "readiness_snapshot" });
    scrollToSection("build-pilot");
  };

  const handleFitComplete = () => {
    setFitCompleted(true);
    trackEvent("fleet_readiness_fit_check_completed", {
      fleet_size: fitAnswers.fleetSize,
      pilot_interest: fitAnswers.pilotInterest,
    });
    window.setTimeout(() => scrollToSection("snapshot"), 0);
  };

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#0A1A2E] [font-family:'IBM_Plex_Sans',sans-serif]">
      <LandingHeader onFitCheck={() => handleFitCheck("nav")} />
      <HeroSection onFitCheck={() => handleFitCheck("hero")} onPilot={() => handlePilot("hero")} />
      <TractionStrip />
      <StickyMobileCta onBookReview={() => handlePilot("sticky_mobile_bar")} />
      <main>
        <ProblemSection />
        <HowItWorks />
        <FitCheck
          answers={fitAnswers}
          setAnswers={setFitAnswers}
          completed={fitCompleted}
          onComplete={handleFitComplete}
          onBuildPilot={handleBuildPilot}
        />
        <BuildPilot
          selectedAddOns={selectedAddOns}
          setSelectedAddOns={setSelectedAddOns}
          onPilot={() => handlePilot("build_pilot")}
        />
        <PilotOffer fitAnswers={fitAnswers} selectedAddOns={selectedAddOns} />
        <ProofSection />
        <RepairWorkflowSection />
        <FinalCTA onFitCheck={() => handleFitCheck("final_cta")} onPilot={() => handlePilot("final_cta")} />
      </main>

      <footer className="bg-[#00101E] text-[#B6C0D0]">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_0.8fr_0.8fr_1fr] lg:px-8">
          <div>
            <AppLogo href="/" imageClassName="h-9" frameClassName="rounded bg-white p-1.5" />
            <p className="mt-4 max-w-sm text-[13px] leading-6 text-[#8A98AE]">
              TruckFixr Fleet AI helps fleets make calmer pre-dispatch maintenance decisions.
            </p>
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-white">Product</h4>
            <ul className="mt-4 space-y-2 text-[13px]">
              <li><a className="hover:text-white" href="#how-it-works">How it works</a></li>
              <li><a className="hover:text-white" href="#fit-check">Fit check</a></li>
              <li><a className="hover:text-white" href="#pilot">Pilot</a></li>
              <li><a className="hover:text-white" href="/resources">Resources</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-white">Access</h4>
            <ul className="mt-4 space-y-2 text-[13px]">
              <li><a className="hover:text-white" href="/access">Sign in</a></li>
              <li><a className="hover:text-white" href="/access/pilot-code">Enter pilot code</a></li>
              <li><a className="hover:text-white" href="/pricing">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-white">Company</h4>
            <ul className="mt-4 space-y-2 text-[13px]">
              <li><a className="hover:text-white" href="mailto:info@truckfixr.com">info@truckfixr.com</a></li>
              <li><a className="hover:text-white" href="/terms">Terms</a></li>
              <li><a className="hover:text-white" href="/privacy">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 border-t border-[#182336] px-4 py-5 text-xs text-[#5A6981] sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>2026 TruckFixr. Maintenance decision support for commercial fleets.</p>
          <p>Built for readiness decisions before dispatch.</p>
        </div>
      </footer>
    </div>
  );
}
