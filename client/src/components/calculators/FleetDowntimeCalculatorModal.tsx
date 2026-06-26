import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trackEvent } from "@/lib/analytics";
import FleetDowntimeCalculator from "./FleetDowntimeCalculator";

export type FleetDowntimeCalculatorModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Analytics + lead attribution context for where the modal was opened. */
  sourcePagePath?: string;
};

export default function FleetDowntimeCalculatorModal({
  open,
  onOpenChange,
  sourcePagePath,
}: FleetDowntimeCalculatorModalProps) {
  const openedTrackedRef = useRef(false);

  useEffect(() => {
    if (open && !openedTrackedRef.current) {
      openedTrackedRef.current = true;
      trackEvent("downtime_calculator_opened", {
        source_page: sourcePagePath ?? "modal",
      });
    }
    if (!open) {
      openedTrackedRef.current = false;
    }
  }, [open, sourcePagePath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="font-['Manrope'] text-2xl font-black text-[#00263F]">
            Estimate Your Fleet Downtime Cost
          </DialogTitle>
          <DialogDescription className="text-[#42474E]">
            See how downtime days, repair delays, repeat issues, and scattered
            maintenance workflows may be affecting your fleet.
          </DialogDescription>
        </DialogHeader>
        <FleetDowntimeCalculator
          sourcePagePath={sourcePagePath}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
