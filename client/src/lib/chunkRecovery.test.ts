import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attemptChunkReload,
  clearChunkReloadParam,
  forceChunkReload,
  isChunkLoadError,
} from "./chunkRecovery";

function createStorage() {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function installWindow(href: string) {
  const replace = vi.fn();
  const replaceState = vi.fn();
  const setTimeout = vi.fn((callback: () => void) => {
    callback();
    return 1;
  });
  const windowMock = {
    location: {
      href,
      replace,
    },
    history: {
      replaceState,
    },
    sessionStorage: createStorage(),
    setTimeout,
  };

  vi.stubGlobal("window", windowMock);
  vi.stubGlobal("document", { title: "TruckFixr" });

  return { replace, replaceState, setTimeout, windowMock };
}

describe("chunk recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects common chunk-load failures", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk dashboard failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Something else failed"))).toBe(false);
  });

  it("navigates to a cache-busted version of the current route on first chunk failure", async () => {
    const { replace } = installWindow("https://truckfixr.com/auth/email");
    vi.spyOn(Date, "now").mockReturnValue(1_717_171_717_171);

    const recovered = attemptChunkReload(
      new Error("Failed to fetch dynamically imported module")
    );
    await Promise.resolve();

    expect(recovered).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0]).toBe(
      "https://truckfixr.com/auth/email?tfxChunkReload=1717171717171"
    );
  });

  it("does not loop reloads for the same route inside the retry window", async () => {
    const { replace } = installWindow("https://truckfixr.com/manager");
    const dateNow = vi.spyOn(Date, "now");
    dateNow.mockReturnValue(1_000);

    expect(attemptChunkReload(new Error("Loading chunk manager failed"))).toBe(true);
    await Promise.resolve();

    dateNow.mockReturnValue(2_000);

    expect(attemptChunkReload(new Error("Loading chunk manager failed"))).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("removes the cache-busting query param after a successful boot", () => {
    const { replaceState, windowMock } = installWindow(
      "https://truckfixr.com/app?tfxChunkReload=1717171717171#tab=overview"
    );
    windowMock.sessionStorage.setItem(
      "truckfixr:chunk-reload-attempt",
      JSON.stringify({ at: 1, routeKey: "/app" })
    );

    clearChunkReloadParam();

    expect(replaceState).toHaveBeenCalledWith(
      {},
      "TruckFixr",
      "/app#tab=overview"
    );
    expect(windowMock.sessionStorage.getItem("truckfixr:chunk-reload-attempt")).toBeNull();
  });

  it("forces a fresh navigation when the manual recovery action is used", async () => {
    const { replace } = installWindow("https://truckfixr.com/driver");
    vi.spyOn(Date, "now").mockReturnValue(5_000);

    forceChunkReload();
    await Promise.resolve();

    expect(replace).toHaveBeenCalledWith(
      "https://truckfixr.com/driver?tfxChunkReload=5000"
    );
  });
});
