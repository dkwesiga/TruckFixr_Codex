// Accessible, mobile-friendly analytics consent banner.
//
// Deliberately NOT a modal dialog: ignoring it must never block browsing or the
// booking flow, so it is a non-modal complementary region that does not trap
// focus. "Accept analytics" and "Reject analytics" carry equal visual weight;
// "Manage preferences" is the secondary control. It is positioned above the
// landing's sticky mobile CTA so it never obscures the primary booking button.

import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConsent } from "@/lib/consent/useConsent";
import { isPublicMarketingRoute } from "@/lib/publicRoutes";

// Matches the landing's sticky mobile CTA height so the banner sits above it and
// the "Book Your Fleet Review" button stays visible/tappable on phones.
const STICKY_CTA_CLEARANCE = "max-sm:bottom-[76px]";

const primaryBtn =
  "h-11 flex-1 justify-center bg-[#0A1A2E] font-bold text-white hover:bg-[#0A1A2E]/90 focus-visible:ring-2 focus-visible:ring-[#0A1A2E]/40 focus-visible:ring-offset-2";
const equalBtn =
  "h-11 flex-1 justify-center border-2 border-[#0A1A2E] bg-white font-bold text-[#0A1A2E] hover:bg-[#0A1A2E] hover:text-white focus-visible:ring-2 focus-visible:ring-[#0A1A2E]/40 focus-visible:ring-offset-2";

export default function ConsentBanner() {
  const { shouldShowBanner, accept, reject, openPreferences } = useConsent();
  const [location] = useLocation();

  // Only ask for analytics consent where analytics could actually run — the
  // public marketing pages. Never surface it over the authenticated app.
  if (!shouldShowBanner || !isPublicMarketingRoute(location)) return null;

  return (
    <div
      role="region"
      aria-label="Analytics cookie consent"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-[#C3C7CE] bg-white/98 backdrop-blur",
        "shadow-[0_-12px_40px_-24px_rgba(10,26,46,0.5)]",
        STICKY_CTA_CLEARANCE
      )}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:py-3.5">
        <p className="text-sm leading-6 text-[#38465F]">
          <span className="font-bold text-[#0A1A2E]">
            We use analytics to improve this site.
          </span>{" "}
          With your consent we use Google Analytics and Microsoft Clarity to
          understand how visitors use our public pages. This is optional — the
          site and booking work either way. See our{" "}
          <a
            href="/privacy"
            className="font-semibold text-[#0A1A2E] underline hover:text-[#D81F2A]"
          >
            Privacy&nbsp;Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row lg:w-auto">
          <div className="flex gap-2.5">
            <Button className={primaryBtn} onClick={accept}>
              Accept analytics
            </Button>
            <Button variant="outline" className={equalBtn} onClick={reject}>
              Reject analytics
            </Button>
          </div>
          <Button
            variant="ghost"
            className="h-11 justify-center px-3 text-sm font-semibold text-[#73777E] underline underline-offset-2 hover:text-[#0A1A2E]"
            onClick={openPreferences}
          >
            Manage preferences
          </Button>
        </div>
      </div>
    </div>
  );
}
