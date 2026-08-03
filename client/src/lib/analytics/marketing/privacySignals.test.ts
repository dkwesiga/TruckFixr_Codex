import { describe, it, expect, afterEach, vi } from "vitest";
import { honoursDoNotTrack, readDnt, readGpc } from "./privacySignals";

afterEach(() => vi.unstubAllGlobals());

describe("privacy signals (GPC + DNT)", () => {
  it("reads Global Privacy Control", () => {
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    expect(readGpc()).toBe(true);
    expect(honoursDoNotTrack()).toBe(true);
  });

  it("reads legacy Do Not Track", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(readDnt()).toBe(true);
    expect(honoursDoNotTrack()).toBe(true);
  });

  it("returns false when neither signal is set", () => {
    vi.stubGlobal("navigator", {});
    expect(readGpc()).toBe(false);
    expect(readDnt()).toBe(false);
    expect(honoursDoNotTrack()).toBe(false);
  });
});
