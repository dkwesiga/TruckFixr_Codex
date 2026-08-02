// Single mount point for the consent UI. Rendered once, app-wide, inside the
// ConsentProvider. Both pieces read the same consent context, so the banner and
// the preferences dialog always agree.

import ConsentBanner from "./ConsentBanner";
import CookiePreferences from "./CookiePreferences";

export default function ConsentManager() {
  return (
    <>
      <ConsentBanner />
      <CookiePreferences />
    </>
  );
}
