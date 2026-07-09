# Vendor / Sub-processor Inventory

| | |
|---|---|
| **Status** | DRAFT — confirm each row |
| **Owner** | TODO: Security Lead |
| **Last reviewed** | 2026-06-29 |
| **Review cadence** | Annual + on any vendor change |

Authoritative list of third parties that store or process TruckFixr or customer data.
Confirm data scope, region, and compliance evidence (`TODO`) with each provider.

| Vendor | Service | Data processed | Class | Region | Compliance evidence | DPA |
|---|---|---|---|---|---|---|
| Supabase | Postgres DB + object storage | All customer/fleet data, users, inspection photos | Confidential | TODO | TODO (SOC 2?) | TODO |
| Render | Frontend + API hosting | Request data in transit; logs | Confidential (transient) | TODO | TODO | TODO |
| Stripe | Payments/subscriptions | Billing identifiers, card data (PCI handled by Stripe) | Confidential | TODO | PCI DSS / SOC 2 (confirm) | TODO |
| Resend | Transactional/notification email | Recipient email, message content | Confidential | TODO | TODO | TODO |
| OpenRouter | LLM gateway (diagnosis) | Diagnostic inputs (minimized) | Confidential | TODO | TODO | TODO |
| OpenAI | LLM provider | Diagnostic inputs (minimized) | Confidential | TODO | TODO | TODO |
| Anthropic | LLM provider | Diagnostic inputs (minimized) | Confidential | TODO | TODO | TODO |
| Google (Gemini) | LLM provider | Diagnostic inputs (minimized) | Confidential | TODO | TODO | TODO |
| Groq | LLM provider | Diagnostic inputs (minimized) | Confidential | TODO | TODO | TODO |
| GitHub | Source control + CI | Source code, CI logs (no customer PII) | Internal | TODO | SOC 2 (confirm) | n/a |
| NHTSA API | Vehicle lookup (VIN decode) | VIN | Confidential | US gov | Public API | n/a |

## Notes

- Keep the customer-facing [Privacy Policy](../../../client/src/pages/Privacy.tsx)
  consistent with this list (it references these sub-processor categories).
- Record each vendor's security/support contact for the
  [Incident Response Plan](../policies/05-incident-response-plan.md).
- Remove a vendor here and confirm data deletion when offboarding it.
