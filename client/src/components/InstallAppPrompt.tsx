import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Chrome/Android fires `beforeinstallprompt` when the PWA meets installability
// criteria (valid manifest + registered service worker + HTTPS). We capture it
// and surface a clear, dismissible "Install" button so drivers can add
// TruckFixr to their home screen without digging through the browser menu.
//
// This renders nothing on platforms that don't support install (desktop unless
// installable, iOS Safari), when already running installed (standalone), or
// once dismissed — so it is safe to mount globally.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "truckfixr:install-prompt-dismissed-at";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // re-offer after 14 days

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) && Date.now() - at < DISMISS_TTL_MS;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export default function InstallAppPrompt() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    setPromptEvent(null);
    setVisible(false);
  };

  if (!visible || !promptEvent) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[120] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_18px_48px_-24px_rgba(15,23,42,0.45)]">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00263F] text-white">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-['Manrope'] text-sm font-bold text-[#00263F]">
            Install TruckFixr
          </p>
          <p className="truncate text-xs text-slate-500">
            Add it to your home screen for quick driver access.
          </p>
        </div>
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-full bg-[#E32636] px-4 py-2 font-['Manrope'] text-xs font-bold text-white transition hover:bg-[#BC1E2C]"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
