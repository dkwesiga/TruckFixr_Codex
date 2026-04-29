function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

type ApiPayloadReadOptions = {
  htmlErrorMessage?: string;
  emptyFallback?: unknown;
};

function inferHostedApiBaseUrl(hostname: string) {
  const normalizedHost = hostname.trim().toLowerCase();

  if (normalizedHost === "truckfixr.com" || normalizedHost === "www.truckfixr.com") {
    return "https://truckfixr-api.onrender.com";
  }

  return "";
}

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (typeof window !== "undefined") {
    const hostedApiBaseUrl = inferHostedApiBaseUrl(window.location.hostname);
    if (hostedApiBaseUrl) {
      return trimTrailingSlash(hostedApiBaseUrl);
    }
    return trimTrailingSlash(window.location.origin);
  }

  return "";
}

export function getApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export async function readApiPayload<T = Record<string, unknown>>(
  response: Response,
  options: ApiPayloadReadOptions = {}
): Promise<T> {
  const {
    htmlErrorMessage = "TruckFixr received an HTML page instead of the API response. Check the API base URL configuration.",
    emptyFallback = {},
  } = options;
  const rawText = await response.text();

  if (!rawText.trim()) {
    return emptyFallback as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      throw new Error(htmlErrorMessage);
    }
    throw new Error("TruckFixr could not read the server response. Please try again.");
  }
}
