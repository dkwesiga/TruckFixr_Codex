# Personnel Security Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual |

## 1. Purpose

Ensure people who access TruckFixr systems are trustworthy, informed, and properly
on/off-boarded. Scaled to a very small team.

## 2. Onboarding

- New personnel acknowledge the [Acceptable Use Policy](02-acceptable-use-policy.md)
  and this pack before receiving access.
- Access is granted on **least privilege** by the Security Lead and recorded in the
  [Access Review Log](../registers/access-review-log.md).
- **Planned/target:** background checks where appropriate and legally permitted;
  confidentiality terms in employment/contractor agreements.

## 3. Security awareness

- All personnel receive basic security guidance (phishing, secrets handling, device
  hygiene, incident reporting). **Planned/target:** lightweight annual refresher,
  recorded.

## 4. Devices

- Work devices must use disk encryption, a screen lock, and a supported/patched OS
  (per Acceptable Use).

## 5. Offboarding

On departure or contract end, the Security Lead:

- Revokes all console and app access (GitHub, Render, Supabase, Stripe, email, AI).
- Rotates any shared or potentially exposed secrets.
- Records completion in the Access Review Log.
- Target: complete within one business day.

## 6. Review

Reviewed annually and after any team change.
