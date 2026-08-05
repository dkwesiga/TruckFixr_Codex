# TruckFixr Fleet AI — Review Coverage Register

Tracks when each required review domain last got a baseline (weekly sweep) look vs. a full deep dive, per the weekly whole-product self-improvement review process. No domain should go more than 8 weeks without a deep review unless there's a documented reason (noted below where applicable). First populated 2026-08-03 — prior reviews (2026-06-29 SOC2, 2026-07-03 weekly) didn't maintain this register, so "last deep review" dates before 2026-08-03 are reconstructed from those reports' content, not from a formal tracked rotation.

| Domain | Last baseline review | Last deep review | Current risk | Known unresolved findings | Next recommended deep review |
|---|---|---|---|---|---|
| Codebase & architecture | 2026-08-03 | Never formally | Watch | Oversized files, 2 likely-dead pages (BL-17) | Within 8 weeks (by 2026-09-28) if not sooner |
| Database & data integrity | 2026-08-03 | **2026-08-03 (this week)** | At risk | BL-01, BL-12 | 2026-08-10 — re-check BL-01 resolution status weekly until closed |
| AI diagnostic quality | 2026-08-03 | 2026-08-03 (paired with driver/manager workflow deep dive) | Watch | BL-03 | Within 8 weeks, sooner if BL-03 isn't closed |
| Safety & escalation | 2026-08-03 | 2026-08-03 (same pass as AI diagnostic quality) | Watch | BL-03 | Same as AI diagnostic quality |
| Live usage & retention | 2026-08-03 | Never (no data source exists) | Not enough evidence | BL-18 | Blocked until GA4 measurement ID is configured or an internal usage endpoint exists — revisit the blocker itself next week |
| Driver workflow | 2026-08-03 | **2026-08-03 (this week)** | Watch | BL-07, BL-08, BL-10, BL-13 | Within 8 weeks (by 2026-09-28) |
| Fleet-manager workflow | 2026-08-03 | **2026-08-03 (this week)** | Watch | BL-09, BL-10 | Within 8 weeks |
| Repair-outcome loop | 2026-08-03 | Never formally (reviewed incidentally via AI diagnostic deep dive) | Healthy-leaning-Watch | None | Within 8 weeks |
| Security & privacy | 2026-08-03 | 2026-06-29 (SOC2 readiness review) | At risk | BL-02, BL-04, BL-11, BL-15, BL-16 | Recommend next deep dive by 2026-08-24 given the new BL-02 privacy finding |
| Mobile & PWA | 2026-08-03 (code-only) | Never with real devices | Not enough evidence | No real-device evidence in 3+ review cycles | **Overdue — prioritize next week**, now feasible against the live production URL |
| Android compatibility | 2026-08-03 (code-only) | Never | Not enough evidence | Same as Mobile & PWA | Same — bundle with Mobile & PWA deep dive |
| Cross-browser compatibility | 2026-08-03 (code-only) | Never | Not enough evidence | Same as Mobile & PWA | Same — bundle with Mobile & PWA deep dive |
| Performance & reliability | 2026-08-03 | Never formally | Watch | Test-suite runtime grew 139s→463s this period — trend to watch, not yet a problem | Within 8 weeks |
| Landing page & acquisition | 2026-08-03 | 2026-07-03 (partial) | Watch | V3-vs-V2 code comment mismatch (process note, §H) | Within 8 weeks |
| Pricing & conversion | 2026-08-03 | Never (no conversion data exists) | Not enough evidence | Blocked on live usage data (same root cause as BL-18) | Revisit once usage data exists |
| Product strategy | 2026-08-03 | 2026-08-03 (synthesis-level, not a standalone deep dive) | Watch | Unvalidated conversion assumption (review §I) | Within 8 weeks |

## Rotation notes
- This week's two deep dives (Database & data integrity; Driver/fleet-manager workflow + AI diagnostic safety) were chosen for the combination of: recent change (PR #48 merged the day before this review), customer impact, weak/no prior evidence, and a newly-surfaced safety/data-integrity risk — see review §0.5 for the full rationale.
- **Mobile/Android/cross-browser is the most overdue domain** — it has never had real-device evidence across at least 3 review cycles (2026-06-29, 2026-07-03, 2026-08-03), and the standing blocker (dev-server startup hang) no longer applies now that the product is live in production. Recommend this as next week's deep dive unless a new P0/P1 displaces it.
- Security & privacy is not this week's formal deep dive but received substantial baseline-plus scrutiny anyway because of the BL-01/BL-02 findings; treat its "last deep review" date as effectively refreshed for the specific sub-areas covered (auth/session, PII logging, CORS/CSP, rate limiting, file uploads) even though the register lists the SOC2 date for the domain as a whole.
