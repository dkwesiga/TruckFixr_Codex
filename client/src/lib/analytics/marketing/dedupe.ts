// Duplicate-suppression for once-per-scope events (section_view once per page
// view, qualified_visitor once per visit, meeting_scheduled once per confirmed
// booking). Backed by an injectable Set for the in-memory (per-page-view) scope
// and sessionStorage for the cross-navigation (per-visit) scope.

const memoryOnce = new Set<string>();

/** In-memory once-guard. Returns true the FIRST time a key is seen this page. */
export function firstTimeThisPageView(key: string): boolean {
  if (memoryOnce.has(key)) return false;
  memoryOnce.add(key);
  return true;
}

/** Reset the in-memory guard (call on page-view change). */
export function resetPageViewDedupe(): void {
  memoryOnce.clear();
}

function hasSession(): boolean {
  try {
    return typeof window !== "undefined" && !!window.sessionStorage;
  } catch {
    return false;
  }
}

/**
 * Session-scoped once-guard (survives client navigations within one tab/visit).
 * Returns true the FIRST time a key is recorded this session. Falls back to the
 * in-memory guard when sessionStorage is unavailable.
 */
export function firstTimeThisSession(key: string): boolean {
  const storageKey = `tfx_once_${key}`;
  if (!hasSession()) return firstTimeThisPageView(storageKey);
  try {
    if (window.sessionStorage.getItem(storageKey)) return false;
    window.sessionStorage.setItem(storageKey, "1");
    return true;
  } catch {
    return firstTimeThisPageView(storageKey);
  }
}
