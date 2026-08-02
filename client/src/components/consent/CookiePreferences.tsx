// Cookie preferences dialog — the permanent, re-openable control that lets a
// visitor review and change their analytics choice at any time (from the footer
// or the banner's "Manage preferences"). Honours Global Privacy Control: when
// GPC is active, analytics is locked off and the toggle explains why.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useConsent } from "@/lib/consent/useConsent";

export default function CookiePreferences() {
  const consent = useConsent();
  const {
    preferencesOpen,
    closePreferences,
    gpcActive,
    analyticsAllowed,
    accept,
    reject,
  } = consent;

  return (
    <Dialog
      open={preferencesOpen}
      onOpenChange={open => (open ? undefined : closePreferences())}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-['Barlow_Condensed'] text-2xl font-black uppercase italic text-[#0A1A2E]">
            Cookie preferences
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#38465F]">
            Control optional analytics on TruckFixr&apos;s public website.
            Necessary cookies that keep the site and booking working are always
            on and are not covered here.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-[10px] border border-[#C3C7CE] bg-[#F6F8FB] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#0A1A2E]">
                Analytics &amp; product improvement
              </p>
              <p className="mt-1 text-sm leading-6 text-[#38465F]">
                Google Analytics 4 and Microsoft Clarity, on public marketing
                pages only. Never on the signed-in app, and never linked to your
                fleet, vehicle, or account data.
              </p>
            </div>
            <Switch
              checked={analyticsAllowed}
              disabled={gpcActive}
              onCheckedChange={next => (next ? accept() : reject())}
              aria-label="Allow analytics"
            />
          </div>

          {gpcActive ? (
            <p className="mt-3 rounded-md border border-[#C3C7CE] bg-white px-3 py-2 text-xs leading-5 text-[#73777E]">
              Your browser is sending a{" "}
              <span className="font-semibold text-[#0A1A2E]">
                Global Privacy Control
              </span>{" "}
              signal, so optional analytics stays off. Turn off GPC in your
              browser to change this.
            </p>
          ) : (
            <p className="mt-3 text-xs leading-5 text-[#73777E]">
              Current choice:{" "}
              <span className="font-semibold text-[#0A1A2E]">
                {analyticsAllowed ? "Analytics allowed" : "Analytics off"}
              </span>
              . Your choice is remembered for 12 months and you can change it
              here anytime.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            className="font-semibold text-[#73777E] hover:text-[#0A1A2E]"
            onClick={closePreferences}
          >
            Close
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className={cn(
                "border-2 border-[#0A1A2E] font-bold text-[#0A1A2E]",
                gpcActive && "opacity-50"
              )}
              disabled={gpcActive}
              onClick={reject}
            >
              Reject analytics
            </Button>
            <Button
              className={cn(
                "bg-[#0A1A2E] font-bold text-white hover:bg-[#0A1A2E]/90",
                gpcActive && "opacity-50"
              )}
              disabled={gpcActive}
              onClick={accept}
            >
              Accept analytics
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
