import { lazy, type ComponentType } from "react";

const CHUNK_RELOAD_STORAGE_KEY = "truckfixr:chunk-reload-attempt";
const CHUNK_RELOAD_QUERY_PARAM = "tfxChunkReload";
const CHUNK_RELOAD_WINDOW_MS = 30_000;
const CHUNK_RELOAD_NOTICE_ID = "truckfixr-chunk-reload-notice";

const CHUNK_LOAD_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\d\w-]+ failed/i,
  /failed to load module script/i,
  /dynamically imported module/i,
];

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return [error.name, error.message, error.stack].filter(Boolean).join("\n");
  }

  if (typeof error === "string") {
    return error;
  }

  return String(error);
}

export function isChunkLoadError(error: unknown) {
  const text = getErrorText(error);
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function getRouteKey(url: URL) {
  url.searchParams.delete(CHUNK_RELOAD_QUERY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

function readLastAttempt() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { at?: number; routeKey?: string };
    if (!Number.isFinite(parsed.at) || typeof parsed.routeKey !== "string") {
      return null;
    }

    return { at: parsed.at as number, routeKey: parsed.routeKey };
  } catch {
    return null;
  }
}

function buildFreshLocationHref() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(CHUNK_RELOAD_QUERY_PARAM, String(Date.now()));
  return nextUrl.toString();
}

export function clearChunkReloadParam() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);

  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has(CHUNK_RELOAD_QUERY_PARAM)) {
    return;
  }

  currentUrl.searchParams.delete(CHUNK_RELOAD_QUERY_PARAM);
  window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}

function showChunkReloadNotice() {
  if (
    typeof document === "undefined" ||
    typeof document.getElementById !== "function" ||
    typeof document.createElement !== "function" ||
    !document.body
  ) {
    return;
  }

  const existing = document.getElementById(CHUNK_RELOAD_NOTICE_ID);
  if (existing) {
    return;
  }

  const notice = document.createElement("div");
  notice.id = CHUNK_RELOAD_NOTICE_ID;
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  notice.style.position = "fixed";
  notice.style.inset = "0";
  notice.style.zIndex = "2147483647";
  notice.style.display = "flex";
  notice.style.alignItems = "center";
  notice.style.justifyContent = "center";
  notice.style.padding = "24px";
  notice.style.background = "rgba(248,250,252,.92)";
  notice.style.backdropFilter = "blur(6px)";
  notice.style.fontFamily = "Inter,Segoe UI,Arial,sans-serif";

  const card = document.createElement("div");
  card.style.maxWidth = "420px";
  card.style.width = "100%";
  card.style.border = "1px solid #dbe3ee";
  card.style.borderRadius = "24px";
  card.style.background = "#ffffff";
  card.style.boxShadow = "0 18px 48px -32px rgba(15,23,42,.45)";
  card.style.padding = "24px";
  card.style.textAlign = "center";

  const eyebrow = document.createElement("p");
  eyebrow.textContent = "TruckFixr";
  eyebrow.style.margin = "0 0 8px";
  eyebrow.style.fontSize = "12px";
  eyebrow.style.fontWeight = "800";
  eyebrow.style.letterSpacing = ".14em";
  eyebrow.style.textTransform = "uppercase";
  eyebrow.style.color = "#64748b";

  const title = document.createElement("h1");
  title.textContent = "New version available";
  title.style.margin = "0 0 10px";
  title.style.fontSize = "24px";
  title.style.lineHeight = "1.2";
  title.style.color = "#0f172a";

  const description = document.createElement("p");
  description.textContent =
    "TruckFixr is clearing stale files and reloading the latest version now.";
  description.style.margin = "0";
  description.style.fontSize = "14px";
  description.style.lineHeight = "1.6";
  description.style.color = "#475569";

  card.append(eyebrow, title, description);
  notice.append(card);
  document.body.append(notice);
}

async function clearStaleClientCaches() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    }
  } catch {
    // Ignore service worker cleanup failures.
  }

  try {
    if ("caches" in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey).catch(() => false)));
    }
  } catch {
    // Ignore cache-storage cleanup failures.
  }
}

function scheduleChunkReload() {
  showChunkReloadNotice();
  void clearStaleClientCaches().finally(() => {
    window.setTimeout(() => {
      window.location.replace(buildFreshLocationHref());
    }, 120);
  });
}

export function forceChunkReload() {
  if (typeof window === "undefined") {
    return;
  }

  scheduleChunkReload();
}

export function attemptChunkReload(error: unknown) {
  if (typeof window === "undefined" || !isChunkLoadError(error)) {
    return false;
  }

  const now = Date.now();
  const currentUrl = new URL(window.location.href);
  const routeKey = getRouteKey(currentUrl);
  const lastAttempt = readLastAttempt();

  if (
    lastAttempt &&
    lastAttempt.routeKey === routeKey &&
    now - lastAttempt.at < CHUNK_RELOAD_WINDOW_MS
  ) {
    return false;
  }

  window.sessionStorage.setItem(
    CHUNK_RELOAD_STORAGE_KEY,
    JSON.stringify({ at: now, routeKey })
  );
  scheduleChunkReload();
  return true;
}

function wrapChunkImport<T>(loader: () => Promise<T>) {
  return () =>
    loader().catch((error) => {
      if (attemptChunkReload(error)) {
        return new Promise<never>(() => {});
      }

      throw error;
    });
}

export function lazyWithChunkRecovery<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>
) {
  return lazy(wrapChunkImport(loader));
}
