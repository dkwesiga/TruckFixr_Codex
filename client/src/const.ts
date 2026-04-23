export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getApiBaseUrl } from "./lib/api";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  if (typeof window === "undefined") {
    return "/auth/email";
  }

  const redirectUri = `${getApiBaseUrl()}/api/oauth/callback`;

  if (!oauthPortalUrl || !appId) {
    return "/auth/email";
  }

  const state = btoa(redirectUri);

  try {
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch {
    return "/auth/email";
  }
};
