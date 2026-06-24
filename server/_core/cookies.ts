import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

/**
 * Decide whether to scope the session cookie to a parent domain so it is shared
 * first-party between the frontend and the API.
 *
 * The live app is split across two hosts (frontend `truckfixr.com`, API
 * `*.onrender.com`). A cookie set by the API on `onrender.com` is a THIRD-PARTY
 * cookie relative to `truckfixr.com`, which Brave/Safari/Chrome block by default,
 * so the session never persists and login appears to fail.
 *
 * The fix is to serve the API from a subdomain of the app domain (e.g.
 * `api.truckfixr.com`) and set the cookie domain to `.truckfixr.com`, making it
 * first-party. This helper returns that parent domain ONLY when the current API
 * request host is actually under the configured APP_BASE_URL domain — so it is a
 * safe no-op while the API still lives on `onrender.com` (a host may not set a
 * cookie for a domain it does not belong to; doing so would make the browser
 * reject the cookie outright).
 *
 * Requires APP_BASE_URL to be set on the API (e.g. https://truckfixr.com).
 */
function getCookieDomain(req: Request): string | undefined {
  let appHost = "";
  try {
    appHost = new URL(ENV.appBaseUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  if (!appHost || LOCAL_HOSTS.has(appHost) || isIpAddress(appHost)) {
    return undefined;
  }

  // Treat the bare apex as the shared parent (so www.truckfixr.com -> truckfixr.com).
  const apex = appHost.replace(/^www\./, "");
  const reqHost = (req.hostname || "").toLowerCase();
  if (!reqHost) return undefined;

  // Only set the parent domain when this API request is itself served from the
  // app's domain (apex or a subdomain such as api.truckfixr.com). Otherwise the
  // API is on an unrelated host (onrender.com, localhost) and must stay host-scoped.
  if (reqHost === apex || reqHost.endsWith(`.${apex}`)) {
    return `.${apex}`;
  }

  return undefined;
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  const secure = isSecureRequest(req);
  const domain = getCookieDomain(req);

  return {
    ...(domain ? { domain } : {}),
    httpOnly: true,
    path: "/",
    // Browsers reject SameSite=None cookies unless they are Secure.
    // For local http://localhost development we fall back to Lax so auth persists.
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
