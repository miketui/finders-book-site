# Finder's Book GTM Autopilot v1.1 - Operator Usability

This release is additive. It does not replace the hardened Phase 0 / 30-Day / Continuous Growth state machine and does not alter the launch-certified customer funnel.

## 1. Exact 42-prompt operating interface

- The 12 Phase 0 AGM prompt bodies remain in `gtm/prompts/sections.md`.
- The authoritative v4 30 Daily AGM prompt bodies are preserved in `gtm/prompts/days.md`.
- Daily execution continues to use `gtm/day-plan.json` as the deterministic current contract for objective, specialists, durable output, pass condition and rendering behavior.
- Each active Daily unit carries its original AGM prompt into the Orchestrator context.
- If historical prompt prose conflicts with a newer approval, privacy, budget, QA or hardened safety control, the current hardened control wins and the discrepancy must be surfaced.

## 2. Standard operator handoff in every Markdown deliverable

Every human-facing Markdown artifact for a Section, Foundation QA, Daily unit or Continuous Growth unit ends with:

1. `SYSTEM COMPLETED`
2. `YOU DO`
3. `SYSTEM DOES NEXT`
4. `OWNER APPROVAL REQUIRED`
5. `BLOCKERS`
6. `EVIDENCE TO SAVE`

The v1.1 runtime appends these sections deterministically from structured run output instead of depending on model formatting. See `gtm/operator-output-schema.md`.

## 3. Encrypted Foundation export

Because `miketui/finders-book-site` is public, a plaintext GitHub Actions artifact is not treated as private. The separate workflow `.github/workflows/gtm-foundation-export.yml` therefore:

1. accepts only manual workflow dispatch;
2. authorizes the triggering GitHub actor against `GTM_OWNER_ALLOWLIST`;
3. restores and decrypts the private GTM state snapshot inside the runner;
4. collects only `foundation/**/*.md` files;
5. packages them into a Phase 0 Binder;
6. encrypts the Binder with `GTM_STATE_KEY` using AES-256-CBC + PBKDF2;
7. uploads only the encrypted Binder plus non-secret decryption instructions;
8. retains the artifact for one day;
9. never writes plaintext Foundation files to public `main` and never advances GTM state.

### Export from GitHub UI

GitHub -> repository -> Actions -> `Finder's Book GTM Foundation Export` -> `Run workflow`.

The resulting artifact is named `finders-book-phase0-binder-<run-id>` and contains `finders-book-phase0-binder.tgz.enc`.

### Decrypt locally

Use the private `GTM_STATE_KEY` stored in your password manager. Do not paste it into chat.

```bash
export GTM_STATE_KEY='YOUR_PRIVATE_VALUE'
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in finders-book-phase0-binder.tgz.enc \
  -out finders-book-phase0-binder.tgz \
  -pass env:GTM_STATE_KEY
mkdir phase0-binder
tar -xzf finders-book-phase0-binder.tgz -C phase0-binder
```

## 4. Calling the Autopilot

Automatic schedule remains `15:00 UTC` (8:00 AM PDT during the initial launch window).

Manual execution from GitHub Actions or GitHub CLI remains:

```bash
gh workflow run gtm-autopilot.yml -f mode=run
```

Status, approvals and ebook modes remain separate from `run`. The export workflow is deliberately separate so downloading a Binder cannot advance Phase 0 or consume a 30-Day unit.

## 5. Merge safety

All v1.1 code changes must pass the existing protected site/GTM validation plus `Finder's Book GTM v1.1 Usability Validation` before merge. Merge/deploy remains YELLOW and requires explicit owner approval.
