# GTM Autopilot — Phase 0 resume runbook

Phase 0 of the Finder's Book GTM Autopilot is **halted at Section 12** by an
owner-only billing condition. This file records the verified state, the root
cause with evidence, and the exact steps to resume. It is written so the next
operator starts from evidence rather than from an assumption.

## Verified state — 2026-08-20

Captured from `AUTOPILOT_MODE=status` (Actions run
[#123](https://github.com/miketui/finders-book-site/actions/runs/32420360466)),
which reads persisted state and never advances the cursor.

| Field | Value |
|---|---|
| `mode` | `PHASE0` |
| `status` | `BLOCKED` |
| `foundation_cursor` | `0` |
| `completed_foundation_sections` | `[]` |
| `foundation_qa_passed` | `false` |
| `next_executable_unit` | `section-12` |
| `last_completed_unit` | `null` |
| `last_run_id` | `aaaef9802b7142ec` |
| `last_run_status` | `BLOCKED` |
| `blocking_approval_count` | `0` |
| Pending approvals | `2026-08-20-section-12-aaaef9802b7142ec-01` — YELLOW, `blocking: false` |
| Foundation output so far | `foundation/12-source-ledger.md` |

**0 of 12 Phase 0 sections are complete.** Section 12 has executed at least once
and produced a partial ledger, but has never satisfied its pass condition.

Note: `foundation_output_status` globs `*.md` only
(`gtm/autopilot/final_hardening.py:432`). It is not evidence about the presence
or absence of `foundation/12-source-ledger.json`.

## Root cause — OpenAI credit exhaustion (owner-only / RED)

Run [#122](https://github.com/miketui/finders-book-site/actions/runs/32415953223)
dispatched `mode=run` against `a9b6bf1` and failed in 50 seconds:

```
openai.RateLimitError: Error code: 429 - {'error': {'message':
'You have no credits remaining. Add credits to continue using the API at
https://platform.openai.com/settings/organization/billing/.',
'type': 'insufficient_quota', 'code': 'credit_balance_exhausted'}}
```

The account behind the `OPENAI_API_KEY` repository secret has a zero credit
balance. Only an account owner can resolve this; it cannot be worked around
from the repository.

### Why this halts all of Phase 0

Every Phase 0 section is model-executed through the OpenAI Responses API
(`gtm/autopilot/main.py:795`), and `run_autopilot()` refuses to start without
`OPENAI_API_KEY`. Foundation QA is deterministic, but it passes only when
`completed_foundation_sections` contains all twelve sections, and that list
advances solely through a successful model-executed unit
(`update_state_after_unit`). **Phase 0 therefore cannot be completed by hand:**
authoring foundation Markdown into the repository would not register in state,
would leave Foundation QA failing, and would violate the private-runtime
control that keeps Foundation output out of the public tree.

### No spend, no state damage, no double-spend exposure

Run #122 failed on its first Responses API call with a quota error, before any
billable completion. It wrote no artifacts, created no approvals, and did not
advance the cursor. Resuming is safe and idempotent — the durable per-unit
execution state and no-double-spend guarantees are intact.

## Everything else is ready

| Gate | State |
|---|---|
| `main` HEAD | `a9b6bf1e5f19b7415fe0902e33da356b039cdf05` |
| `validate.yml` on that SHA | ✅ success (run [#361](https://github.com/miketui/finders-book-site/actions/runs/32415939785)) |
| `npm run validate` locally | ✅ passes |
| Encrypted state branch | `gtm-autopilot-state`, HMAC-signed, restores cleanly |
| Blocking approvals | none |
| Section 12 classification contract | merged (PR #65), **not yet exercised against a live model run** |

## Resume procedure

1. **Owner:** add credits at
   <https://platform.openai.com/settings/organization/billing/>. Confirm the
   funded organization/project is the one issuing the key stored in the
   `OPENAI_API_KEY` repository secret — a funded org with the key issued from a
   different project fails identically.
2. Actions → **Finder's Book GTM Autopilot** → *Run workflow* → branch `main`,
   `mode: run`.
   A single dispatch executes every remaining Phase 0 unit in canonical order
   (`12 → 1 → 2 → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 11 → 5 → Foundation QA`) and
   stops at the first `PARTIAL`, `BLOCKED`, or `AWAITING_APPROVAL`.
3. Re-dispatch with `mode: status` to confirm progress. Expect
   `completed_foundation_sections` to grow, and on success
   `foundation_qa_passed: true` with `mode` transitioning to `THIRTY_DAY`.
4. Do **not** start Day 1 in the same session. Day 1 is gated behind Foundation
   QA by design; let the state machine make that transition.

### If Section 12 blocks again

The run before the credit failure (`aaaef9802b7142ec`) reported:

- *"Foundation QA still lacks rendered-page results, protected-check/merge/deployment alignment, and private dashboard evidence."*
- *"Current KDP numerical rules and final-file economics remain UNVERIFIED and require authoritative capture plus account calculator validation."*

PR #65 added the Section 12 classification contract precisely so that a
complete `UNVERIFIED` classification with a concrete verification checklist
satisfies the unit, and so later-section and private-dashboard inputs cannot
block the first section. That fix has never run against a live model. If
Section 12 blocks again, read the current blockers with `mode: status` — they
are redacted and bounded, and safe to share — before changing any contract.

## Retrieving the Foundation once it exists

Foundation artifacts are deliberately **not** committed to this public
repository. Use Actions → **Finder's Book GTM Foundation Export**, which builds
an HMAC-signed, encrypted Phase 0 Binder and uploads it as a time-limited
workflow artifact with non-secret decryption instructions. Decryption requires
`GTM_STATE_KEY`. The export covers Markdown foundation files only.

## Do not

- Do not hand-author foundation artifacts into the repository to "unblock" QA.
- Do not bootstrap, reset, or re-create the Autopilot; the persisted state is
  authoritative and resumable.
- Do not substitute a different image or video model for GPT Image 2 / Runway
  Gen-4.5, or a different orchestration provider, to route around billing.
