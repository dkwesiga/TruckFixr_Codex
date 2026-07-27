// The acknowledgment a guest must accept before the FULL decision card is
// released (the preliminary readiness and any critical/unsafe safety warning are
// shown ungated — a safety warning is never withheld to collect this).
//
// Recording (version + timestamp + identifiable contact) is the actual
// liability lever; bump the version whenever the wording changes so the stored
// acknowledgment stays attributable to exactly what the user saw.

export const GUEST_RESULT_DISCLAIMER_VERSION = "2026-07-26";

export const GUEST_RESULT_DISCLAIMER_TEXT =
  "I understand TruckFixr provides maintenance decision support — not a confirmed diagnosis, roadworthiness certification, or emergency service — and that decisions about this vehicle remain my responsibility.";
