export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
// Installed PWAs must enter through a public in-app route while the session restores.
export const getLoginUrl = () => {
  return "/login";
};
