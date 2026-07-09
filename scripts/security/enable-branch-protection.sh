#!/usr/bin/env bash
#
# Enable branch protection on the default branch so production auto-deploys
# (render.yaml) only ever ship code that passed CI. SOC 2 change management (CC8.1).
#
# Run this ONCE the CI workflow (.github/workflows/ci.yml) has run at least once on
# GitHub — required status checks can only reference checks GitHub has already seen.
#
# Requirements: gh CLI installed and authenticated (`gh auth login`) with admin
# rights on the repo.
#
# Usage:
#   scripts/security/enable-branch-protection.sh [options]
#
# Options:
#   --repo <owner/name>   Target repo (default: auto-detected from gh / git remote)
#   --branch <name>       Branch to protect (default: main)
#   --approvals <N>       Required approving reviews (default: 0 — safe for a solo
#                         maintainer; raise to 1 once a second reviewer exists)
#   --no-pr-reviews       Do not require pull requests / reviews at all
#   --no-enforce-admins   Let admins bypass the rules (NOT recommended)
#   --contexts "a;b"      Semicolon-separated required status-check contexts
#                         (semicolon, because a job name may itself contain commas —
#                         e.g. "Typecheck, tests, secret scan"). Default: the two
#                         blocking CI jobs.
#   --dry-run             Print what would be applied, change nothing
#   -h, --help            Show this help
#
# Notes:
#   * The default required checks are the BLOCKING ci.yml jobs. The
#     "Dependency audit (pnpm)" job is intentionally excluded (it is non-blocking
#     until the audit backlog is clean).
#   * enforce_admins=true means admins must also go through PR + passing CI. Combined
#     with 0 required approvals this avoids a solo-maintainer deadlock while still
#     guaranteeing CI ran.
#
set -euo pipefail

BRANCH="main"
APPROVALS="0"
ENFORCE_ADMINS="true"
REQUIRE_PR_REVIEWS="true"
DRY_RUN="false"
REPO=""
# Must match the job `name:` values in .github/workflows/ci.yml.
# Semicolon-delimited (a single job name contains commas).
CONTEXTS="Typecheck, tests, secret scan;Secret scan (gitleaks)"

die() { echo "error: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --approvals) APPROVALS="${2:-}"; shift 2 ;;
    --contexts) CONTEXTS="${2:-}"; shift 2 ;;
    --no-pr-reviews) REQUIRE_PR_REVIEWS="false"; shift ;;
    --no-enforce-admins) ENFORCE_ADMINS="false"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

command -v gh >/dev/null 2>&1 || die "gh CLI is not installed. See https://cli.github.com/"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated. Run: gh auth login"

# Resolve the repo (owner/name) if not supplied.
if [ -z "$REPO" ]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
fi
if [ -z "$REPO" ]; then
  origin="$(git remote get-url origin 2>/dev/null || true)"
  REPO="$(printf '%s' "$origin" | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
fi
[ -n "$REPO" ] || die "could not determine repo; pass --repo owner/name"

# Build the JSON array of required-check contexts (pure bash; no jq dependency).
contexts_json=""
IFS=';' read -ra _ctx <<< "$CONTEXTS"
for c in "${_ctx[@]}"; do
  c="${c#"${c%%[![:space:]]*}"}"   # ltrim
  c="${c%"${c##*[![:space:]]}"}"   # rtrim
  [ -n "$c" ] || continue
  esc="${c//\\/\\\\}"; esc="${esc//\"/\\\"}"
  contexts_json="${contexts_json}\"${esc}\","
done
contexts_json="[${contexts_json%,}]"

# Warn if the required checks have not been seen on the branch yet (GitHub rejects
# unknown contexts). Best-effort — do not fail the script on API hiccups.
seen="$(gh api "repos/${REPO}/commits/${BRANCH}/check-runs" \
          --jq '[.check_runs[].name] | unique | join("\n")' 2>/dev/null || true)"
if [ -n "$seen" ]; then
  for c in "${_ctx[@]}"; do
    c="${c#"${c%%[![:space:]]*}"}"; c="${c%"${c##*[![:space:]]}"}"
    [ -n "$c" ] || continue
    printf '%s\n' "$seen" | grep -qxF "$c" \
      || echo "warning: required check '$c' not seen on ${BRANCH} yet — push a CI run first, or GitHub may reject it." >&2
  done
else
  echo "warning: no check runs found on ${BRANCH} yet. Let ci.yml run once before enabling required checks." >&2
fi

# Assemble the protection payload.
if [ "$REQUIRE_PR_REVIEWS" = "true" ]; then
  pr_reviews="{\"required_approving_review_count\": ${APPROVALS}, \"dismiss_stale_reviews\": true}"
else
  pr_reviews="null"
fi

read -r -d '' BODY <<JSON || true
{
  "required_status_checks": { "strict": true, "contexts": ${contexts_json} },
  "enforce_admins": ${ENFORCE_ADMINS},
  "required_pull_request_reviews": ${pr_reviews},
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

echo "Repo:            ${REPO}"
echo "Branch:          ${BRANCH}"
echo "Required checks: ${contexts_json}"
echo "Enforce admins:  ${ENFORCE_ADMINS}"
echo "PR reviews:      ${REQUIRE_PR_REVIEWS} (approvals: ${APPROVALS})"
echo

if [ "$DRY_RUN" = "true" ]; then
  echo "[dry-run] Would PUT the following to repos/${REPO}/branches/${BRANCH}/protection:"
  echo "$BODY"
  exit 0
fi

echo "Applying branch protection..."
printf '%s' "$BODY" | gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${REPO}/branches/${BRANCH}/protection" \
  --input - >/dev/null

echo "Done. Current protection summary:"
gh api "repos/${REPO}/branches/${BRANCH}/protection" \
  --jq '{
    required_status_checks: .required_status_checks.contexts,
    strict: .required_status_checks.strict,
    enforce_admins: .enforce_admins.enabled,
    required_reviews: (.required_pull_request_reviews.required_approving_review_count // "none"),
    linear_history: .required_linear_history.enabled,
    force_pushes: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled
  }'
