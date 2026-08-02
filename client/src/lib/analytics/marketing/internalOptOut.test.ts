import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  applyInternalOptOutFromUrl,
  isInternalTraffic,
  readOptOutIntent,
  setInternalTraffic,
} from "./internalOptOut";

describe("internal opt-out — pure intent", () => {
  it("reads enable/disable/none from the query string", () => {
    expect(readOptOutIntent("?tfx_internal=1")).toBe("enable");
    expect(readOptOutIntent("?tfx_internal=true")).toBe("enable");
    expect(readOptOutIntent("?tfx_internal=0")).toBe("disable");
    expect(readOptOutIntent("?tfx_internal=false")).toBe("disable");
    expect(readOptOutIntent("?other=1")).toBeNull();
    expect(readOptOutIntent("")).toBeNull();
  });
});

describe("internal opt-out — persistence", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is reversible via URL toggle", () => {
    expect(isInternalTraffic()).toBe(false);
    expect(applyInternalOptOutFromUrl("?tfx_internal=1")).toBe(true);
    expect(isInternalTraffic()).toBe(true);
    expect(applyInternalOptOutFromUrl("?tfx_internal=0")).toBe(false);
    expect(isInternalTraffic()).toBe(false);
  });

  it("can be set directly and does not use personal identity (opaque flag)", () => {
    setInternalTraffic(true);
    expect(store.get("tfx_internal_optout")).toBe("1");
    setInternalTraffic(false);
    expect(store.has("tfx_internal_optout")).toBe(false);
  });
});
