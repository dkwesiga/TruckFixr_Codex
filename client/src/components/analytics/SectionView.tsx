// Fires `section_view` once per page view when a landing section has been at
// least 50% visible for ~1 second. Uses IntersectionObserver (no scroll
// listeners). Wraps its children in a passthrough element so it drops into
// existing markup without changing layout.
//
// `section` must be a STABLE logical name (problem/workflow/validation/demo/
// final_cta) — never section copy. The analytics module dedupes per page view.

import { useEffect, useRef, type ReactNode } from "react";
import { trackSectionView } from "@/lib/analytics/marketing";

const VISIBLE_RATIO = 0.5;
const DWELL_MS = 1000;

export default function SectionView({
  section,
  children,
  className,
}: {
  section: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let dwellTimer: number | undefined;
    let done = false;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (done) return;
          if (
            entry.isIntersecting &&
            entry.intersectionRatio >= VISIBLE_RATIO
          ) {
            // Require the section to stay visible for the dwell period.
            if (dwellTimer === undefined) {
              dwellTimer = window.setTimeout(() => {
                done = true;
                trackSectionView(section);
                observer.disconnect();
              }, DWELL_MS);
            }
          } else if (dwellTimer !== undefined) {
            window.clearTimeout(dwellTimer);
            dwellTimer = undefined;
          }
        }
      },
      { threshold: [VISIBLE_RATIO] }
    );

    observer.observe(el);
    return () => {
      if (dwellTimer !== undefined) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [section]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
