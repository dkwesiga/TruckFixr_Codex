// App-wide marketing-analytics driver. Mounted once, app-wide.
//
// Responsibilities:
//  - Fire a page view on every client navigation (the module gates it).
//  - Re-sync providers when consent changes (accept/reject/withdraw).
//  - Track behavioural qualified-visitor signals: >=2 public pages and >=30s of
//    engaged (visible) time. The CTA-click signal is fired at the CTA call site.
//
// Renders nothing. All heavy lifting is in the analytics module, which fails
// safe, so this component can never break the app.

import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { isPublicMarketingRoute } from "@/lib/publicRoutes";
import {
  trackPageView,
  trackQualifiedVisitor,
} from "@/lib/analytics/marketing";
import {
  ENGAGED_TIME_THRESHOLD_MS,
  qualifiesByPages,
  recordPublicPageView,
} from "@/lib/analytics/marketing/qualifiedVisitor";

export default function MarketingAnalytics() {
  const [location] = useLocation();

  // Page view + multi-page qualification on each public navigation.
  useEffect(() => {
    trackPageView(location);
    if (isPublicMarketingRoute(location)) {
      const count = recordPublicPageView(location);
      if (qualifiesByPages(count)) trackQualifiedVisitor("multi_page");
    }
  }, [location]);

  // Engaged-time qualification: accumulate visible time on public routes; fire
  // once the 30s threshold is crossed. Timers pause when the tab is hidden.
  const engagedRef = useRef(0);
  useEffect(() => {
    if (!isPublicMarketingRoute(location)) return;

    let last = Date.now();
    let fired = false;
    let raf = 0;

    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") {
        engagedRef.current += now - last;
      }
      last = now;
      if (!fired && engagedRef.current >= ENGAGED_TIME_THRESHOLD_MS) {
        fired = true;
        trackQualifiedVisitor("engaged_time");
        return; // stop scheduling once qualified
      }
      raf = window.setTimeout(tick, 1000);
    };
    raf = window.setTimeout(tick, 1000);

    const onVisibility = () => {
      last = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearTimeout(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [location]);

  return null;
}
