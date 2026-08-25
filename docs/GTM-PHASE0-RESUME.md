# GTM Autopilot — Phase 0 resume runbook

Phase 0 of the Finder's Book GTM Autopilot has **0 of 12 sections persisted**.
This file records the verified state, the root cause with evidence, and the
exact steps to resume. It is written so the next operator starts from evidence
rather than from an assumption.

Two blockers have been cleared and neither required a state change. The original
one (OpenAI credit exhaustion) was routed around by the opt-in Gemini fallback in
PRs #68–#71; the one after it (Section 10 exceeding the aggregate artifact
ceiling) was fixed by PR #72. Phase 0 reaches the model and executes, but **no
section has been persisted yet** — a run must now complete end to end for the
cursor to move. Both failures are recorded below, because each one discarded a
run that had done real work.

## Verified state — 2026-08-25

Captured from `AUTOPILOT_MODE=status` (Actions run
[#141](https://github.com/miketui/finders-book-site/actions/runs/32795047124)),
which reads persisted state and never advances the cursor. These values are
unchanged from the 2026-08-20 capture (run
[#123](https://github.com/miketui/finders-book-site/actions/runs/32420360466)).

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

## Last blocker — Section 10 exceeded the aggregate artifact ceiling (fixed)

Run [#140](https://github.com/miketui/finders-book-site/actions/runs/32794175194)
(`mode=run` against `7074dfb`, via the Gemini fallback) executed the canonical
order and reached **Section 10**, which returned a complete result —
`"pass_condition_met": true`, no blockers, all four required documents present.
The run then failed at output validation:

```
1 validation error for HardenedRunOutput
artifact_documents
  Value error, artifact content exceeds 55000 aggregate characters
```

Because the failure happened before the *Encrypt and persist bounded runtime
state* step, **every section that run had completed was discarded.** The cursor
is still `0` and `next_executable_unit` is still `section-12`. This is why real
model progress and a persisted count of zero are both true at once.

The ceiling was internally inconsistent with the output contract: a single
artifact may be 40,000 characters, but Section 10 is the one section required to
emit **four** documents (`gtm/phase0-plan.json`) — content bank with 30 hooks and
12 content packages, creative master spec in Markdown and JSON, and 30 promotion
plays. A flat 55,000-character aggregate allows those four documents an average
of 13,750 characters each.

**Fixed on `main` by PR #72** (`83ccc90`): the aggregate ceiling is now 75,000
characters. Section 10's four documents measured 62,262 characters in run #140,
so the new ceiling carries roughly 20% headroom. The 40,000-character
per-document cap, the eight-document ceiling and the fail-closed behaviour are
unchanged — an over-budget unit still refuses to persist.

One thing to watch on the next `mode: run`: the orchestrator's `max_tokens` is
still `24_000` (`gtm/autopilot/main.py:355`) while the prompt now permits a
whole response of 80,000 characters. JSON-escaped Markdown is token-dense, so a
section that actually fills the new budget could hit the token ceiling and
truncate rather than be bounded. If a run fails with malformed or truncated
JSON rather than a validation error, that is the cause — raise `max_tokens`
rather than lowering the artifact budget.

## Original blocker (resolved) — OpenAI credit exhaustion (owner-only / RED)

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

Every Phase 0 section is model-executed, and `run_autopilot()` refuses to start
without a credential for the selected provider
(`GTM_MODEL_PROVIDER=openai|gemini`). Foundation QA is deterministic, but it
passes only when
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
| `main` HEAD | `83ccc90` (PR #72, aggregate ceiling raised to 75,000) |
| `npm run validate` locally | ✅ passes |
| Encrypted state branch | `gtm-autopilot-state`, HMAC-signed, restores cleanly |
| Blocking approvals | none |
| Section 12 classification contract | merged (PR #65), exercised — run #140 cleared Section 12 and reached Section 10 |
| Text orchestration | OpenAI (default) or Gemini 3.7 Flash fallback, PRs #68–#71 |

## Resume procedure

1. The aggregate-budget blocker is already fixed on `main` (PR #72). No code
   change is needed before the next attempt.
2. Actions → **Finder's Book GTM Autopilot** → *Run workflow* → branch `main`,
   `mode: run`, with `GTM_MODEL_PROVIDER` set to a provider that has a funded
   credential.
   A single dispatch executes every remaining Phase 0 unit in canonical order
   (`12 → 1 → 2 → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 11 → 5 → Foundation QA`) and
   stops at the first `PARTIAL`, `BLOCKED`, or `AWAITING_APPROVAL`.
3. Re-dispatch with `mode: status` to confirm progress. Expect
   `completed_foundation_sections` to grow, and on success
   `foundation_qa_passed: true` with `mode` transitioning to `THIRTY_DAY`.
4. Do **not** start Day 1 in the same session. Day 1 is gated behind Foundation
   QA by design; let the state machine make that transition.

### A failed run discards everything it completed

State is persisted once, after the execute step, in *Encrypt and persist bounded
runtime state*. Any non-zero exit from the execute step — a validation error on
the very last unit included — skips persistence, so the whole run is lost and the
cursor does not move. When diagnosing, read the persisted cursor with
`mode: status`; do not infer progress from content visible in a failed run's log.

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
