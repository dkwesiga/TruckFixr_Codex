// Permanent footer control to (re)open Cookie preferences. Styled as a plain
// inline link so it drops into existing footers next to Privacy / Terms.

import { useConsent } from "@/lib/consent/useConsent";
import { cn } from "@/lib/utils";

export default function CookiePreferencesLink({
  className,
}: {
  className?: string;
}) {
  const { openPreferences } = useConsent();
  return (
    <button
      type="button"
      onClick={openPreferences}
      className={cn(
        "cursor-pointer bg-transparent p-0 hover:text-white",
        className
      )}
    >
      Cookie preferences
    </button>
  );
}
