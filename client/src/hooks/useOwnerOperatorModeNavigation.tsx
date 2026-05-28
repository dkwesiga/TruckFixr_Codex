import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthContext } from "@/hooks/useAuthContext";
import { isOwnerOperatorEnabled } from "@/lib/ownerOperator";

type UseOwnerOperatorReturnOptions = {
  hasInProgressWork: boolean;
  title?: string;
  description?: string;
  destination?: string;
};

export function goToDriverMode(intent?: "start-inspection") {
  const nextUrl = intent ? `/driver?intent=${encodeURIComponent(intent)}` : "/driver";
  window.location.href = nextUrl;
}

export function useOwnerOperatorReturnToOwner({
  hasInProgressWork,
  title = "Leave Driver Mode?",
  description = "You have work in progress. Leaving Driver Mode may interrupt this workflow.",
  destination = "/manager",
}: UseOwnerOperatorReturnOptions) {
  const { user } = useAuthContext();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const canReturnToOwnerDashboard = isOwnerOperatorEnabled(user);

  const leaveNow = () => {
    window.location.href = destination;
  };

  const requestReturnToOwnerDashboard = () => {
    if (!canReturnToOwnerDashboard) {
      leaveNow();
      return;
    }

    if (hasInProgressWork) {
      setIsConfirmOpen(true);
      return;
    }

    leaveNow();
  };

  const ownerDashboardReturnDialog = canReturnToOwnerDashboard ? (
    <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
      <DialogContent className="rounded-3xl border-slate-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
            Stay
          </Button>
          <Button
            className="bg-slate-900 text-white hover:bg-slate-800"
            onClick={leaveNow}
          >
            Leave Driver Mode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return {
    canReturnToOwnerDashboard,
    requestReturnToOwnerDashboard,
    ownerDashboardReturnDialog,
  };
}
