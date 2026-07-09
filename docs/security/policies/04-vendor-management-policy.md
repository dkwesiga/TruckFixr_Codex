# Vendor & Third-Party Management Policy

| | |
|---|---|
| **Status** | DRAFT — pending ratification |
| **Owner** | TODO: Security Lead |
| **Version** | 0.1 |
| **Effective** | TODO |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual; inventory reviewed on any vendor change |

## 1. Purpose

Ensure third parties that process TruckFixr or customer data meet adequate security
and privacy standards.

## 2. Inventory

All sub-processors and key vendors are tracked in the
[Vendor / Sub-processor Inventory](../registers/vendor-subprocessor-inventory.md),
including what data they handle and their compliance posture.

## 3. Onboarding a new vendor

Before a vendor processes customer data, the Security Lead confirms:

- What data it will handle and why (minimize).
- The vendor's security posture (e.g. published SOC 2 / ISO report, DPA, encryption).
- Data location/residency and sub-processing.
- That it is added to the inventory and, if it processes personal data, reflected in
  the customer-facing [Privacy Policy](../../../client/src/pages/Privacy.tsx).

## 4. Ongoing review

- Review the inventory at least annually and whenever a vendor materially changes.
- Track each vendor's compliance evidence (report/DPA) and its renewal date.

## 5. Offboarding

When a vendor is dropped, confirm data deletion/return per its terms and update the
inventory and Privacy Policy.

## 6. Current critical sub-processors

Supabase (database + storage), Render (hosting), Stripe (payments), the email
provider (Resend), and AI model providers (OpenRouter / OpenAI / Anthropic / Google
/ Groq). See the inventory for the authoritative list and data scope.
