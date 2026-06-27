import { useEffect } from "react";

/**
 * Lightweight per-page SEO metadata for this client-rendered SPA.
 *
 * This app is a Vite + React SPA (no server-side rendering), so document title
 * and meta description are applied at runtime. Crawlers that execute JavaScript
 * and link unfurlers will read these. Each page sets its own values and the
 * previous values are restored on unmount, so navigating between pages does not
 * leak stale metadata.
 *
 * Extracted from the original inline implementation in
 * pages/FleetDowntimeCostCalculator.tsx so every page can reuse one pattern.
 */
export function useSeoMeta(options: { title: string; description: string }): void {
  const { title, description } = options;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const existing = document.querySelector('meta[name="description"]');
    const createdMeta = !existing;
    const descriptionEl = existing ?? document.createElement("meta");
    if (createdMeta) {
      descriptionEl.setAttribute("name", "description");
      document.head.appendChild(descriptionEl);
    }
    const previousDescription = descriptionEl.getAttribute("content");
    descriptionEl.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (createdMeta) {
        descriptionEl.remove();
      } else if (previousDescription !== null) {
        descriptionEl.setAttribute("content", previousDescription);
      }
    };
  }, [title, description]);
}
