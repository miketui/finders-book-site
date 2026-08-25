# Claude Code handoff — Gemini fallback for GTM Autopilot

## Authorization and objective

The owner approved the Gemini fallback and PR #68 merged at `a59770c0b354ca3236eb763ea750d43c4be43002`. Continue hardening and operating the opt-in Gemini text-orchestration path for `miketui/finders-book-site`, complete Phase 0 through Foundation QA, and stop before Day 1.

This authorization does not permit exposing credentials, weakening approvals, resetting state, bypassing branch protection, or changing the Day 6 image/video providers.

## Preserved production state

- Mode: `PHASE0`
- Active unit: Section 12 — Source Verification
- Foundation cursor: `0`
- Completed Foundation sections: none
- Existing Foundation output: `foundation/12-source-ledger.md`
- Failed OpenAI executions did not advance or reset state.
- Gemini activation run `32791569423` reached the model but returned truncated JSON before persistence; it also did not advance or reset state. The response-budget follow-up must be certified and merged before retrying.

Treat the encrypted `gtm-autopilot-state` remote snapshot as authoritative. Never bootstrap or replace it with checked-in templates.

## Provider contract

- Default provider remains `openai`.
- Gemini is selected explicitly with `GTM_MODEL_PROVIDER=gemini` or the `model_provider=gemini` workflow input.
- Gemini text model defaults to the stable `gemini-3.7-flash` through Google's OpenAI-compatible endpoint.
- Current-web research uses Gemini's native Google Search grounding endpoint and returns cited HTTPS sources.
- `GEMINI_API_KEY` is read only from GitHub Actions secrets. Never print, download, echo, or paste its value.
- `GTM_STATE_KEY` encryption/authentication and legacy migration behavior remain unchanged.
- GPT Image 2 and Runway Gen-4.5 remain the Day 6 creative providers. Gemini must not replace them.
- Provider errors must fail closed and must not advance the state cursor.

Before activating a no-cost/free-tier Gemini key, the owner must accept the data-handling terms of the Google AI plan attached to that key. Phase 0 context can contain private business material. If those terms are not acceptable, use a paid Gemini project with suitable data controls or keep the provider on OpenAI; do not silently strip context or weaken the prompts.

## Files in the change

- `gtm/autopilot/model_provider.py`
- `gtm/autopilot/gemini_fallback_selftest.py`
- `gtm/autopilot/main.py`
- `.github/workflows/gtm-autopilot.yml`
- `.github/workflows/validate.yml`
- `.github/workflows/gtm-final-hardening.yml`
- `.github/workflows/gtm-v1-1-usability.yml`
- `docs/CLAUDE-CODE-GEMINI-FALLBACK-HANDOFF.md`
- Canonically regenerated `docs/FILE-TREE.md` and `docs/FILE-INVENTORY.md`

## Local validation

Run from the repository root:

```bash
uv sync --project gtm/autopilot --locked
PYTHONPATH=gtm/autopilot uv run --project gtm/autopilot python gtm/autopilot/gemini_fallback_selftest.py
PYTHONPATH=gtm/autopilot uv run --project gtm/autopilot python -c 'import v1_1_selftest; v1_1_selftest.main()'
python -m py_compile gtm/autopilot/main.py gtm/autopilot/model_provider.py gtm/autopilot/gemini_fallback_selftest.py
npm ci --ignore-scripts
npm run validate
node scripts/regen-manifests.mjs
git diff --check
git diff --exit-code -- docs/FILE-TREE.md docs/FILE-INVENTORY.md
```

If a browser is available, also run `npm run test:render`. Otherwise, require the GitHub rendered-page gate.

## Release gates

Do not merge until all six gates are green on one exact head SHA:

1. Static Validation
2. Rendered-page Smoke Test
3. GTM Autopilot Validation
4. GTM Autopilot Final Hardening
5. Manifest Verification
6. GTM v1.1 Usability Validation

Reconcile review threads conservatively. Fix current P1/P2/Major/Critical issues; do not dismiss them. Merge normally without `[gtm-autopilot-bootstrap]`.

## GitHub setup and activation

The owner performs the one-time secret action in GitHub:

1. Repository **Settings → Secrets and variables → Actions → New repository secret**.
2. Name it exactly `GEMINI_API_KEY` and paste the Google AI Studio key value there.
3. Do not place the key in a repository variable, workflow input, issue, PR, log, or chat.

After the certified fallback is merged, dispatch **Finder's Book GTM Autopilot** on `main` with:

- `mode`: `run`
- `model_provider`: `gemini`
- leave approval ID and owner note empty unless a real approval is pending

Observe every run. If a blocking approval or deterministic failure occurs, fix or obtain the specific approval, recertify code changes, and resume from the encrypted state. Do not reset the state.

Production activation run `32792695463` confirmed Gemini credential preflight but
failed before generation because the compatibility endpoint rejected JSON-schema
`maxLength`/`maxItems` keywords. Persistence was skipped and the Phase 0 cursor
remained unchanged. The follow-up keeps identical Pydantic safety bounds as
runtime `AfterValidator` checks while omitting unsupported provider-facing schema
keywords.

Production retry `32793509935` then reached Gemini and returned a complete
Section 12 result, but the legitimate JSON source ledger exceeded the initial
10,000-character per-artifact limit. Persistence again skipped safely. The
follow-up permits up to 40,000 characters for one evidence ledger while enforcing
an eight-document and 75,000-character aggregate ceiling before persistence.

Production run `32794175194` reached the live Phase 0 Section 10 cursor and
returned four complete artifacts totaling 62,262 characters. The initial
55,000-character aggregate ceiling rejected the otherwise valid result before
persistence. The ceiling is therefore set to 75,000 characters, while the
40,000-character per-document cap and 80,000-character whole-response prompt
remain in force.

## Completion boundary

Continue until the status output proves all 12 Foundation sections and Foundation QA are complete. Then run `mode=status` only and verify:

- mode transitioned to `THIRTY_DAY`
- next executable unit is Day 1
- no Day 1 execution occurred
- no blocking approvals remain, unless explicitly reported
- Foundation outputs are present

Stop before Day 1. Save the final feature SHA, six gate results, merge SHA, each Phase 0 run ID, and the final status-only run ID.

## Rollback

To stop using Gemini without changing state, dispatch future runs with `model_provider=openai` or leave the provider at its default. Do not delete or rewrite the encrypted state ref. A provider switch is not a bootstrap and must not move the cursor by itself.
