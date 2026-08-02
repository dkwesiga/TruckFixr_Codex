import { describe, it, expect } from "vitest";
import {
  CONSENT_POLICY_VERSION,
  CONSENT_TTL_MS,
  createConsentRecord,
  isRecordValid,
  parseConsentRecord,
  resolveConsent,
  type ConsentRecord,
} from "./consent";

const NOW = 1_700_000_000_000;

describe("consent — pure logic", () => {
  it("defaults to undecided with analytics OFF when there is no record", () => {
    const state = resolveConsent({ record: null, gpcActive: false, now: NOW });
    expect(state.status).toBe("undecided");
    expect(state.analyticsAllowed).toBe(false);
    expect(state.shouldShowBanner).toBe(true);
  });

  it("grants analytics only after an explicit accept record", () => {
    const record = createConsentRecord("granted", { now: NOW });
    const state = resolveConsent({ record, gpcActive: false, now: NOW });
    expect(state.status).toBe("granted");
    expect(state.analyticsAllowed).toBe(true);
    expect(state.shouldShowBanner).toBe(false);
  });

  it("keeps analytics OFF after a reject record", () => {
    const record = createConsentRecord("denied", { now: NOW });
    const state = resolveConsent({ record, gpcActive: false, now: NOW });
    expect(state.status).toBe("denied");
    expect(state.analyticsAllowed).toBe(false);
    expect(state.shouldShowBanner).toBe(false);
  });

  it("expires consent after 12 months and re-shows the banner", () => {
    const record = createConsentRecord("granted", { now: NOW });
    const justValid = resolveConsent({
      record,
      gpcActive: false,
      now: NOW + CONSENT_TTL_MS - 1,
    });
    expect(justValid.analyticsAllowed).toBe(true);

    const expired = resolveConsent({
      record,
      gpcActive: false,
      now: NOW + CONSENT_TTL_MS,
    });
    expect(expired.status).toBe("undecided");
    expect(expired.analyticsAllowed).toBe(false);
    expect(expired.shouldShowBanner).toBe(true);
  });

  it("invalidates a record captured under an older policy version", () => {
    const stale: ConsentRecord = {
      v: CONSENT_POLICY_VERSION - 1,
      analytics: "granted",
      ts: NOW,
      gpc: false,
    };
    expect(isRecordValid(stale, NOW)).toBe(false);
    const state = resolveConsent({ record: stale, gpcActive: false, now: NOW });
    expect(state.status).toBe("undecided");
    expect(state.shouldShowBanner).toBe(true);
  });

  it("GPC forces analytics OFF and suppresses the banner, overriding a prior accept", () => {
    const granted = createConsentRecord("granted", { now: NOW });
    const state = resolveConsent({
      record: granted,
      gpcActive: true,
      now: NOW,
    });
    expect(state.status).toBe("denied");
    expect(state.analyticsAllowed).toBe(false);
    expect(state.gpcActive).toBe(true);
    expect(state.source).toBe("gpc");
    expect(state.shouldShowBanner).toBe(false);
  });

  it("does NOT treat legacy Do Not Track as GPC (only the gpcActive flag matters)", () => {
    // resolveConsent only reads gpcActive; DNT is never an input here. A visitor
    // with DNT but no GPC and no record is still 'undecided' (banner shown), not
    // auto-rejected.
    const state = resolveConsent({ record: null, gpcActive: false, now: NOW });
    expect(state.source).toBe("default");
    expect(state.status).toBe("undecided");
  });

  it("parses only well-formed records and rejects garbage without throwing", () => {
    expect(parseConsentRecord(null)).toBeNull();
    expect(parseConsentRecord("not json")).toBeNull();
    expect(parseConsentRecord(JSON.stringify({ v: 1 }))).toBeNull();
    expect(
      parseConsentRecord(JSON.stringify({ v: 1, analytics: "maybe", ts: NOW }))
    ).toBeNull();
    const ok = parseConsentRecord(
      JSON.stringify({ v: 1, analytics: "granted", ts: NOW, gpc: false })
    );
    expect(ok?.analytics).toBe("granted");
  });

  it("guards against future-dated (clock-skewed) records", () => {
    const future = createConsentRecord("granted", { now: NOW + 10_000 });
    expect(isRecordValid(future, NOW)).toBe(false);
  });
});
