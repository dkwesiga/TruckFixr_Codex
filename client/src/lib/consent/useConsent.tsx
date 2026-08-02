// React binding for the marketing-analytics consent store.
//
// Exposes the resolved consent state plus imperative actions (accept / reject /
// withdraw / open preferences). Kept intentionally small; all logic lives in
// `consent.ts` / `consentStore.ts`. Consuming components never read consent
// directly — they go through this hook so re-renders stay consistent.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  acceptAnalytics,
  getConsentState,
  rejectAnalytics,
  subscribeConsent,
  withdrawConsent,
} from "./consentStore";
import type { ResolvedConsent } from "./consent";

interface ConsentContextValue extends ResolvedConsent {
  /** Grant optional analytics. */
  accept: () => void;
  /** Deny optional analytics. */
  reject: () => void;
  /** Withdraw previously granted consent (clears first-party analytics data). */
  withdraw: () => void;
  /** Whether the Cookie preferences dialog is open. */
  preferencesOpen: boolean;
  /** Open the Cookie preferences dialog (from banner or footer control). */
  openPreferences: () => void;
  /** Close the Cookie preferences dialog. */
  closePreferences: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ResolvedConsent>(() => getConsentState());
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    // Re-resolve on mount (GPC/localStorage are only reliable client-side) and
    // stay subscribed to changes from any surface (banner, footer, other tabs).
    setState(getConsentState());
    const unsubscribe = subscribeConsent(setState);

    // Keep multiple tabs consistent: another tab accepting/rejecting updates us.
    const onStorage = () => setState(getConsentState());
    window.addEventListener("storage", onStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const accept = useCallback(() => {
    setState(acceptAnalytics());
    setPreferencesOpen(false);
  }, []);

  const reject = useCallback(() => {
    setState(rejectAnalytics());
    setPreferencesOpen(false);
  }, []);

  const withdraw = useCallback(() => {
    setState(withdrawConsent());
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      ...state,
      accept,
      reject,
      withdraw,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
    }),
    [state, accept, reject, withdraw, preferencesOpen]
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useConsent must be used within a <ConsentProvider>");
  }
  return ctx;
}
