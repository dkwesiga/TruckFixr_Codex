// Browser privacy signals. With no consent banner, we lean the other way and
// proactively honour both Global Privacy Control and legacy Do Not Track: if
// either is set, we send no analytics at all. This strengthens the case for a
// cookieless, banner-free setup.
//
// Pure reader over navigator; guarded so it is safe anywhere.

type NavSignals = {
  globalPrivacyControl?: boolean;
  doNotTrack?: string | null;
};

function nav(): NavSignals | null {
  try {
    return typeof navigator !== "undefined"
      ? (navigator as unknown as NavSignals)
      : null;
  } catch {
    return null;
  }
}

/** Global Privacy Control: navigator.globalPrivacyControl === true. */
export function readGpc(): boolean {
  return nav()?.globalPrivacyControl === true;
}

/** Legacy Do Not Track: navigator.doNotTrack === "1" (or window.doNotTrack). */
export function readDnt(): boolean {
  const n = nav();
  const raw =
    n?.doNotTrack ??
    (typeof window !== "undefined"
      ? (window as unknown as { doNotTrack?: string }).doNotTrack
      : undefined);
  return raw === "1" || raw === "yes";
}

/** True when either GPC or DNT asks us not to track. */
export function honoursDoNotTrack(): boolean {
  return readGpc() || readDnt();
}
