const CHUNK_RELOAD_STORAGE_KEY = "truckfixr:chunk-reload-attempt";
const CHUNK_RELOAD_WINDOW_MS = 30_000;

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

export function attemptChunkReload(error: unknown) {
  if (typeof window === "undefined" || !isChunkLoadError(error)) {
    return false;
  }

  const now = Date.now();
  const lastAttempt = Number.parseInt(
    window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? "",
    10
  );

  if (Number.isFinite(lastAttempt) && now - lastAttempt < CHUNK_RELOAD_WINDOW_MS) {
    return false;
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  window.location.reload();
  return true;
}
