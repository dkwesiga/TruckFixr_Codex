import { useState } from "react";
import { useSeoMeta } from "@/lib/useSeoMeta";
import { trackEvent } from "@/lib/analytics";
import AppLogo from "@/components/AppLogo";
import {
  BuildPilot,
  FinalCTA,
  FitCheck,
  HeroSection,
  HowItWorks,
  PilotOffer,
  ProblemSection,
  ProofSection,
  RepairWorkflowSection,
  getDefaultFitAnswers,
  type FitAnswerMap,
} from "@/components/marketing/FleetReadinessLandingSections";

function scrollToSection(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    title: "TruckFixr Fleet AI | Dispatch Readiness and Maintenance Triage",
    description:
      "TruckFixr Fleet AI helps small and mid-sized fleets turn driver reports, warning lights, inspections, and repair history into Ready, Monitor, Service Soon, or Stop readiness actions.",
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
    <div className="min-h-screen bg-[#f6f9fd] text-[#0B1C30]">
      <HeroSection onFitCheck={() => handleFitCheck("hero")} onPilot={() => handlePilot("hero")} />
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
        <FinalCTA onFitCheck={() => handleFitCheck("final_cta")} />
      </main>

      <footer className="border-t border-white/10 bg-[#001d31] text-blue-100">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_0.8fr_0.8fr_1fr] lg:px-8">
          <div>
            <AppLogo href="/" imageClassName="h-9" frameClassName="rounded bg-white p-1.5" />
            <p className="mt-4 max-w-sm text-sm leading-7 text-blue-100/80">
              TruckFixr Fleet AI helps fleets make calmer pre-dispatch maintenance decisions.
            </p>
          </div>
          <div>
            <h4 className="font-['Manrope'] font-extrabold tracking-normal text-white">Product</h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a className="hover:text-white" href="#how-it-works">How it works</a></li>
              <li><a className="hover:text-white" href="#fit-check">Fit check</a></li>
              <li><a className="hover:text-white" href="#pilot">Pilot</a></li>
              <li><a className="hover:text-white" href="/resources">Resources</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-['Manrope'] font-extrabold tracking-normal text-white">Access</h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a className="hover:text-white" href="/access">Sign in</a></li>
              <li><a className="hover:text-white" href="/access/pilot-code">Enter pilot code</a></li>
              <li><a className="hover:text-white" href="/pricing">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-['Manrope'] font-extrabold tracking-normal text-white">Company</h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li><a className="hover:text-white" href="mailto:info@truckfixr.com">info@truckfixr.com</a></li>
              <li><a className="hover:text-white" href="/terms">Terms</a></li>
              <li><a className="hover:text-white" href="/privacy">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 border-t border-white/10 px-4 py-5 text-sm text-blue-100/70 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>2026 TruckFixr. Maintenance decision support for commercial fleets.</p>
          <p>Built for readiness decisions before dispatch.</p>
        </div>
      </footer>
    </div>
  );
}
