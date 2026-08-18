#!/usr/bin/env bash
set -euo pipefail

# protect_and_cleanup.sh
# - fetches & prunes origin
# - deletes remote branches merged into origin/main (excluding main/HEAD)
# - deletes agent/launch-audit-fixes
# - applies branch protection on main requiring a PR, 1 approving review,
#   and the status checks "Static validation" and "Rendered-page smoke test"
#
# Usage:
#   ./protect_and_cleanup.sh         # perform changes (requires push/admin rights)
#   ./protect_and_cleanup.sh --dry-run   # show what would be done, do not delete or change protection
#
# Environment:
#   - Run from inside the repo clone (origin should point to the target repo).
#   - To set branch protection automatically you need either:
#       * gh CLI authenticated as a user with admin permissions on the repo, or
#       * GITHUB_TOKEN env var with repo scope (and admin permission).
#
OWNER="${OWNER:-miketui}"
REPO="${REPO:-finders-book-site}"
FULL_REPO="$OWNER/$REPO"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

# --- begin token handling ----
# Prefer existing env var, then gh auth, otherwise prompt securely.
USE_GH=0

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    echo "gh CLI is authenticated — will use gh for API calls when available."
    USE_GH=1
  fi
fi

if [[ -z "${GITHUB_TOKEN:-}" && $USE_GH -eq 0 ]]; then
  # Prompt for token securely (won't echo)
  read -rsp "Enter a GitHub personal access token (with repo/admin permissions) or press Enter to cancel: " GITHUB_TOKEN
  echo
  if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "No token provided and gh is not authenticated. Some operations may not be possible."
    # We do not exit here because the script can still perform the git push/delete operations locally.
  else
    export GITHUB_TOKEN
  fi
fi
# --- end token handling ----

if ! command -v git >/dev/null 2>&1; then
  echo "git is required; please install git."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Please run this script from inside your local clone of $FULL_REPO"
  exit 1
fi

origin_url=$(git remote get-url origin 2>/dev/null || echo "(no origin)")
if [[ "$origin_url" != *"$OWNER/$REPO"* ]]; then
  echo "Warning: origin remote does not appear to be $FULL_REPO (found: $origin_url)"
  echo "Proceeding, but double-check you're in the right repo clone."
fi

echo
echo "1) Fetching and pruning origin..."
git fetch --prune origin

echo
echo "2) Listing remote branches merged into origin/main (excluding main and HEAD)..."
merged_branches=$(git branch -r --merged origin/main | sed 's|origin/||' | grep -vE 'main|HEAD' | sed 's/^[[:space:]]*//')

if [[ -z "$merged_branches" ]]; then
  echo "No merged remote branches found to delete."
else
  echo "Found the following merged branches:"
  echo "$merged_branches"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "(dry-run) Skipping deletion of merged branches."
  else
    echo "Deleting merged branches on origin..."
    while IFS= read -r b; do
      [[ -z "$b" ]] && continue
      echo "-> Deleting origin/$b"
      git push origin --delete "$b" || echo "  failed to delete origin/$b (continuing)"
    done <<< "$merged_branches"
  fi
fi

echo
echo "3) Deleting specific superseded branch: agent/launch-audit-fixes"
if [[ $DRY_RUN -eq 1 ]]; then
  echo "(dry-run) Would run: git push origin --delete agent/launch-audit-fixes"
else
  git push origin --delete agent/launch-audit-fixes || echo "  failed to delete agent/launch-audit-fixes (may not exist)"
fi

echo
echo "4) Applying branch protection to main (require PR + status checks + 1 review)..."
read -r -d '' PAYLOAD <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Static validation", "Rendered-page smoke test"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null
}
JSON

if [[ $DRY_RUN -eq 1 ]]; then
  echo "(dry-run) Would apply protection payload:"
  echo "$PAYLOAD"
else
  if command -v gh >/dev/null 2>&1 && [[ $USE_GH -eq 1 ]]; then
    echo "Using gh CLI to put branch protection..."
    gh api --method PUT -H "Accept: application/vnd.github+json" \
      /repos/"$OWNER"/"$REPO"/branches/main/protection \
      -f required_status_checks.strict=true \
      -f required_status_checks.contexts='["Static validation","Rendered-page smoke test"]' \
      -f enforce_admins=true \
      -f required_pull_request_reviews.required_approving_review_count=1 \
      -f restrictions='null' \
      || { echo "gh api failed to set protection"; exit 1; }
    echo "Branch protection applied via gh."
  elif [[ -n "${GITHUB_TOKEN:-}" ]]; then
    echo "Using curl with GITHUB_TOKEN to put branch protection..."
    if command -v jq >/dev/null 2>&1; then
      curl -sS -X PUT \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO/branches/main/protection" \
        -d "$PAYLOAD" | jq .
    else
      curl -sS -X PUT \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO/branches/main/protection" \
        -d "$PAYLOAD" || { echo "curl failed to set protection"; exit 1; }
      echo
      echo "Protection applied (curl). If you want prettier output, install jq."
    fi
  else
    echo "Cannot set branch protection automatically: neither gh CLI is authenticated nor GITHUB_TOKEN is available."
    echo "To set protection manually, run the following curl command with a GITHUB_TOKEN that has repo scope and admin permissions:"
    echo
    echo "curl -X PUT -H 'Authorization: Bearer \$GITHUB_TOKEN' -H 'Accept: application/vnd.github+json' \\"
    echo "  https://api.github.com/repos/$OWNER/$REPO/branches/main/protection \\"
    echo "  -d '$PAYLOAD'"
    # Do not exit with error here because the git deletions may have completed successfully.
  fi
fi

echo
echo "Done."
if [[ $DRY_RUN -eq 1 ]]; then
  echo "You ran --dry-run. No deletions or protection changes were made."
fi
