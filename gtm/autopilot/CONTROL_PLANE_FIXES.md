# GTM Autopilot control-plane merge gate

This temporary merge-gate note records the final control-plane requirements for PR #58. Remove this file before merge after the implementation and tests pass.

Required fixes:
1. Both YELLOW and RED approval decisions must require an authenticated GitHub actor present in `GTM_OWNER_ALLOWLIST` before pending state is mutated.
2. Normalize contradictory model output: if `run_status == "PASS"` while `pass_condition_met == false`, persist/report `PARTIAL`, never `PASS`.
3. `status` mode must expose pending approval IDs and safe review metadata (`id`, `approval_class`, `title`, `action`, `reason`, `max_spend_usd`, `blocking`, `created_at`, `status`) so the owner can resolve a blocking gate. Do not expose secrets.
4. Media provider failures from GPT Image 2 or Runway must be caught per job and returned as controlled render violations/blockers with provider + asset ID + sanitized error class/message. Preserve already rendered artifacts; do not crash before state/report persistence.
5. Local/default runtime state must not write mutable state into the tracked public `gtm/` directory. Default `GTM_RUNTIME_ROOT` to a temp/user-cache location when the environment variable is absent.
6. Existing trusted-main checkout and runtime archive path validation in `.github/workflows/gtm-autopilot.yml` must remain intact.

Validation required before merge:
- `python -m py_compile gtm/autopilot/main.py gtm/ebook/build_epub.py`
- GTM secretless static contract test
- `npm run validate`
- `npm run test:render`
- manifest verification
