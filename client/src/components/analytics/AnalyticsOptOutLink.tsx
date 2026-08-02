// Footer control for the cookieless, banner-free analytics: a permanent one-click
// way to opt out of (or back into) analytics. Reflects the current state and
// re-syncs the analytics module immediately on toggle.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isOptedOut,
  setOptedOut,
  subscribeOptOut,
} from "@/lib/analytics/marketing/optOut";
import { onOptOutChanged } from "@/lib/analytics/marketing";

export default function AnalyticsOptOutLink({
  className,
}: {
  className?: string;
}) {
  const [optedOut, setOptedOutState] = useState(false);

  useEffect(() => {
    setOptedOutState(isOptedOut());
    return subscribeOptOut(() => setOptedOutState(isOptedOut()));
  }, []);

  const toggle = () => {
    setOptedOut(!isOptedOut());
    onOptOutChanged();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "cursor-pointer bg-transparent p-0 hover:text-white",
        className
      )}
      aria-pressed={optedOut}
    >
      {optedOut ? "Analytics off — turn on" : "Do not track me"}
    </button>
  );
}
