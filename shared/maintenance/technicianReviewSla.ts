// SLA timing for the paid technician-reviewed Resolution report (PRD v1.1
// §5.1: Mon–Sat, 9:00 a.m.–6:00 p.m. Eastern; 2 business hours from Review
// Ready). This is a SEPARATE service-hours config from the internal
// critical-safety review queue's DEFAULT_SERVICE_HOURS (serviceHours.ts) —
// that queue is tuned independently and must not change when this product's
// hours change.

import {
  computeSlaTarget,
  isWithinServiceHours,
  type ServiceHoursConfig,
  type SlaTarget,
} from "./serviceHours";
import { TECHNICIAN_REVIEW_SLA_TARGET_MINUTES } from "./technicianReviewState";

export const PAID_REVIEW_SERVICE_HOURS: ServiceHoursConfig = {
  timeZone: "America/Toronto",
  businessDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  startHour: 9,
  endHour: 18,
};

/** SLA due instant for a case that just became Review Ready. */
export function computePaidReviewSlaTarget(reviewReadyAt: Date): SlaTarget {
  return computeSlaTarget(
    reviewReadyAt,
    TECHNICIAN_REVIEW_SLA_TARGET_MINUTES,
    PAID_REVIEW_SERVICE_HOURS
  );
}

export function isWithinPaidReviewServiceHours(date: Date): boolean {
  return isWithinServiceHours(date, PAID_REVIEW_SERVICE_HOURS);
}
