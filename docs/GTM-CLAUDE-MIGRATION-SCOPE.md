# Scoping: migrating the GTM Autopilot orchestrator from OpenAI to Claude

Written at the owner's request to decide whether to move Phase 0 execution off
the OpenAI Agents SDK. **No code has been changed.** This is a decision
document.

## Summary recommendation

**Migrating is viable and smaller than it first appears — but it does not solve
the problem that is actually blocking Phase 0.** Phase 0 is halted because an
API account has no credits (`docs/GTM-PHASE0-RESUME.md`). A Claude migration
replaces an unfunded OpenAI account with an Anthropic account that also has to
be funded, and image generation still requires OpenAI either way.

Migrate if you want Claude for capability or cost reasons. Do not migrate as a
way to avoid adding credits.

### Correction to an earlier claim

An earlier note in this session said migrating would cost Section 12 its hosted
web search. **That was wrong.** Anthropic ships a first-party server-side web
search tool (`web_search_20260209`, tool name `web_search`), supported on Claude
Opus 5 and Sonnet 5. Section 12's live source verification survives the
migration. What does *not* survive is reaching it through the OpenAI Agents SDK
— `agents.WebSearchTool` is specific to OpenAI's Responses API. See
"Why not LiteLLM" below.

## Current OpenAI coupling — every point

| # | Location | What it does | Migration impact |
|---|---|---|---|
| 1 | `gtm/autopilot/main.py:17` | `from agents import Agent, Runner, WebSearchTool` | Replaced |
| 2 | `gtm/autopilot/main.py:18` | `from openai import OpenAI` | **Kept** (images) |
| 3 | `gtm/autopilot/main.py:275` | Specialist `model="gpt-5.6"` | → `claude-opus-5` |
| 4 | `gtm/autopilot/main.py:294` | `WebSearchTool(search_context_size="medium")` | → `web_search_20260209` |
| 5 | `gtm/autopilot/main.py:298` | Orchestrator `model="gpt-5.6"` | → `claude-opus-5` |
| 6 | `gtm/autopilot/main.py:795` | `Runner.run(orchestrator, prompt, max_turns=14)` | → Anthropic tool runner |
| 7 | `gtm/autopilot/main.py:533,539` | `OpenAI()` → `client.images.generate` | **Unchanged — Claude cannot generate images** |
| 8 | `gtm/autopilot/main.py:64-81` | `RunOutput` pydantic + `output_type=` | → `output_config.format` / `messages.parse()` |
| 9 | `gtm/autopilot/main.py:855` | `if not os.getenv("OPENAI_API_KEY")` | → `ANTHROPIC_API_KEY` |
| 10 | `.github/workflows/gtm-autopilot.yml:42,66-73` | Secret plumbing + required-key check | Add Anthropic key; keep OpenAI for images |
| 11 | `.github/workflows/validate.yml:197` | Asserts the literal string `'OPENAI_API_KEY is required for autonomous run mode.'` | **Required gate — must be amended** |
| 12 | `.github/workflows/validate.yml:141-142` | Asserts `gpt-image-2` and `gen4.5` | Unchanged |
| 13 | `gtm/autopilot/pyproject.toml` + `uv.lock` | `openai-agents==0.19.2`; `openai` only transitive | Add `anthropic`; add `openai` **explicitly** (image path loses its transitive source) |

Item 13 is a real trap: dropping `openai-agents` silently removes the `openai`
package that `main.py:533` depends on for Day 6 image generation.

## The seam that makes this contained

Four hardening layers monkey-patch the same function:

- `control_plane.py:176` → `guarded_execute_model_unit`
- `final_hardening.py:536` → `final_execute_model`
- `render_contracts.py:232` → `tracked_hardened_execute_unit`
- `v1_1.py:416` → calls `engine.execute_model_unit(unit, run_id)`

They all wrap **`execute_model_unit(unit, run_id) -> (RunOutput, qa)`**.

If the migration preserves that signature and return contract, **all four
certified control layers keep working untouched** — approvals, budget guards,
render contracts, state persistence, redaction. The rewrite is confined to the
body of `execute_model_unit` plus `build_agents` / `build_orchestrator`.

This is the single most important design constraint. Do not restructure the
seam.

## Recommended target architecture

Use the **Anthropic SDK's Tool Runner** (`client.beta.messages.tool_runner`),
not a compatibility shim:

- **Specialists as tools.** Each of the nine specialists becomes a `@beta_tool`
  whose body calls `client.messages.create` with that specialist's system
  prompt from `prompts/agents.md`. This mirrors `agent.as_tool()` exactly.
- **Web search** as the server tool `{"type": "web_search_20260209", "name":
  "web_search"}`, declared only for the sections that currently set
  `enable_web_search` (1, 4, 6, 7, 8, 9, 11, 12). Restrict with
  `allowed_domains` to the platform docs Section 12 must cite.
- **Structured output** via `output_config: {format: ...}` with
  `client.messages.parse()`, replacing `output_type=RunOutput`. The existing
  `RunOutput` pydantic model carries over unchanged.
- **Model** `claude-opus-5`, `thinking: {type: "adaptive"}`,
  `output_config: {effort: "xhigh"}` for agentic runs.
- **Streaming** with `max_tokens` ~64000, since Phase 0 sections are long.

### Why not LiteLLM

Routing the OpenAI Agents SDK at Anthropic through LiteLLM looks like the
smaller diff, but it keeps the `Runner` abstraction while **losing access to
Anthropic's server-side tools** — including the web search Section 12 depends
on. You would end up reimplementing web search as a custom tool anyway, on top
of a translation layer. The native path is less code and fewer moving parts.

## Prompt caching — the real cost lever

`collect_repository_evidence()` sends up to twelve files at 7000 chars each, and
`foundation_context()` grows as sections complete. That prefix is stable across
all fourteen turns of a unit and across all thirteen units.

Put a `cache_control: {type: "ephemeral"}` breakpoint after the repository
evidence and foundation context, and keep the volatile per-unit instructions
after it. Cached reads bill at ~0.1x. Verify with
`usage.cache_read_input_tokens` — if it is zero across units, something in the
prefix is varying (a timestamp or unsorted JSON).

## Cost

Anthropic list prices (first-party API):

| Model | ID | Context | Input $/1M | Output $/1M |
|---|---|---|---|---|
| Claude Opus 5 | `claude-opus-5` | 1M | $5.00 | $25.00 |
| Claude Sonnet 5 | `claude-sonnet-5` | 1M | $3.00 ($2.00 intro thru 2026-08-31) | $15.00 ($10.00 intro) |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1.00 | $5.00 |

**Order-of-magnitude estimate for a full Phase 0 run**, assuming ~300K
cumulative input and ~30K output tokens per unit across `max_turns=14`, over 13
units:

| Configuration | Estimated full Phase 0 |
|---|---|
| Opus 5, no caching | ~$29 |
| Opus 5, with prefix caching | roughly $8–12 |
| Sonnet 5 (intro pricing), with caching | roughly $4–6 |

These are estimates from payload size, not measurements. Baseline them properly
with `client.messages.count_tokens` against one real section prompt before
committing. **I am deliberately not quoting OpenAI `gpt-5.6` pricing** — read
your actual spend off the OpenAI dashboard rather than trusting a figure here.

A defensible split: orchestrator on `claude-opus-5`, reading-heavy specialists
on `claude-haiku-4-5`.

## Work breakdown

1. Add `anthropic` and explicit `openai` to `pyproject.toml`; regenerate `uv.lock`.
2. Rewrite `build_agents` / `build_orchestrator` as tool definitions.
3. Rewrite the body of `execute_model_unit`, preserving its signature.
4. Swap the required-key check at `main.py:855`.
5. Add `ANTHROPIC_API_KEY` to the workflow env and secret normalization.
6. Amend the `validate.yml:197` assertion to match the new required-key message.
7. Leave the image path, Runway path, and all four hardening layers untouched.
8. Run `npm run validate` and the GTM control-plane job; dispatch one `mode=run`
   and confirm Section 12 completes.

Realistically a day of work plus one live Section 12 test.

## Prerequisites the owner must supply

- A funded Anthropic account.
- `ANTHROPIC_API_KEY` added as a repository secret (only an owner can do this).
- A funded OpenAI account **anyway**, if Day 6 image generation is still wanted.

## Risks

- **Untestable until the key exists.** Nothing beyond static validation can be
  verified without a funded Anthropic secret.
- **Amending a required gate.** `validate.yml:197` is a protected assertion;
  changing it is a deliberate weakening of a certified check and should be
  reviewed as such, not slipped in.
- **Section 12 is still unproven.** PR #65's classification contract has never
  run against any live model. Migrating providers at the same time confounds
  two variables — if Section 12 fails afterwards, you will not know whether the
  contract or the migration caused it. **Prefer proving Section 12 on the
  current stack first, then migrating.**
