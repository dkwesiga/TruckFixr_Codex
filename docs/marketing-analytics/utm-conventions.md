# UTM conventions & generator

Consistent, non-identifying campaign tags so attribution stays clean. Generate
links with the built-in tool rather than writing UTMs by hand.

## Generator

```bash
pnpm utm --channel <channel> --campaign <name> [--content <content>] [--path </path>]
pnpm utm --list      # show channels + example labels
pnpm utm --help
```

Examples:

```bash
pnpm utm --channel linkedin_post --campaign post_downtime
pnpm utm --channel linkedin_dm  --campaign dm_fleet_manager --path /fleet-review
pnpm utm --channel email        --campaign outreach_q3 --content variant_a
pnpm utm --channel event        --campaign yc_demo_day
pnpm utm --channel partner      --campaign mr_diesel --path /pricing
```

> **Git Bash on Windows** rewrites a leading-slash argument into a Windows path.
> Pass `--path fleet-review` (no leading slash) or prefix with
> `MSYS_NO_PATHCONV=1`. PowerShell and Linux are unaffected.

## Channels

| `--channel`     | utm_source | utm_medium | Use for                  |
| --------------- | ---------- | ---------- | ------------------------ |
| `linkedin_post` | linkedin   | social     | LinkedIn organic posts   |
| `linkedin_dm`   | linkedin   | dm         | LinkedIn direct messages |
| `email`         | email      | outreach   | Email outreach           |
| `event`         | event      | event      | Events and accelerators  |
| `partner`       | partner    | referral   | Partner referrals        |

## Naming rules

- Lowercase **snake_case**; the generator normalizes for you.
- Short and descriptive: `post_downtime`, `dm_fleet_manager`, `qr_pitch_deck`.
- `--content` is an optional non-identifying variant label (`variant_a`, `v2`).
- Destination `--path` must be a page on `truckfixr.com` (default `/`).

## Never do this

- ❌ No recipient **names, emails, phone numbers, or company names** in any UTM
  value. The generator rejects values that look like emails or phone numbers.
- ❌ Don't invent one-off `utm_source` values — use a defined channel so reports
  roll up correctly.
- ❌ Don't put personal or sensitive data in `utm_content`.

## How attribution uses these

With consent, the first campaign a visitor arrives on is stored as **first-touch**
(immutable for 90 days); each later campaign updates **recent-touch**. Both expire
after 90 days and are attached to events as `first_touch_*` / `recent_touch_*` and
`utm_*`. Before consent, UTMs are read only for the current page and never stored.
See [README.md](./README.md#campaign-attribution).
