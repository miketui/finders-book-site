from __future__ import annotations

import re
from pathlib import Path

import main as engine


_DAILY_PROMPT_SOURCE = "gtm/prompts/days.md"
_OPERATOR_START = "<!-- GTM_OPERATOR_HANDOFF_V1_1_START -->"
_OPERATOR_END = "<!-- GTM_OPERATOR_HANDOFF_V1_1_END -->"
_OPERATOR_HEADINGS = [
    "SYSTEM COMPLETED",
    "YOU DO",
    "SYSTEM DOES NEXT",
    "OWNER APPROVAL REQUIRED",
    "BLOCKERS",
    "EVIDENCE TO SAVE",
]


def load_daily_prompts() -> dict[str, str]:
    prompts = engine.parse_markdown_prompts(
        engine.CONFIG_ROOT / "prompts" / "days.md",
        r"^## DAY: (\d+)\s*$",
    )
    expected = {str(day) for day in range(1, 31)}
    missing = sorted(expected - set(prompts), key=int)
    if missing:
        raise RuntimeError(
            "Daily AGM prompt source is incomplete; missing days: "
            + ", ".join(missing)
        )
    return prompts


_BASE_ACTIVE_UNIT = getattr(engine, "_gtm_v1_1_base_active_unit", None)
if _BASE_ACTIVE_UNIT is None:
    _BASE_ACTIVE_UNIT = engine.active_unit
    engine._gtm_v1_1_base_active_unit = _BASE_ACTIVE_UNIT


def fidelity_active_unit(state: dict) -> dict:
    unit = _BASE_ACTIVE_UNIT(state)
    if unit.get("kind") == "day":
        day = str(int(unit["day"]))
        source_prompt = load_daily_prompts()[day]
        unit["agm_daily_prompt"] = source_prompt
        unit["agm_daily_prompt_source"] = _DAILY_PROMPT_SOURCE
        unit["prompt_precedence"] = (
            "Preserve the AGM prompt's task intent. If it conflicts with the current "
            "machine-readable day contract, approval gates, privacy rules, repository QA, "
            "creative budget or hardened controls, the current hardened contract wins and "
            "the discrepancy must be reported rather than silently followed."
        )
    return unit


engine.active_unit = fidelity_active_unit


def _bullets(items: list[str], fallback: str) -> str:
    clean = [str(item).strip() for item in items if str(item).strip()]
    if not clean:
        return fallback
    return "\n".join(f"- {item}" for item in clean)


def _operator_block(output, unit: dict, qa: dict, run_id: str) -> str:
    approvals = list(output.approval_requests)
    blockers = [str(item) for item in output.blockers]

    completed = _bullets(
        [str(item) for item in output.work_completed],
        output.executive_summary.strip() or "No autonomous work was recorded.",
    )

    owner_actions: list[str] = []
    for request in approvals:
        owner_actions.append(
            f"Review and decide {request.approval_class} approval: "
            f"{request.title} - {request.action}"
        )
    for blocker in blockers:
        owner_actions.append(f"Resolve or supply evidence for blocker: {blocker}")
    you_do = _bullets(
        owner_actions,
        "None - no owner action required for this unit.",
    )

    if approvals or blockers:
        system_next = (
            "Paused pending the owner approval/blocker resolution above. After resolution: "
            + (output.next_action.strip() or "resume the current GTM unit")
        )
    else:
        system_next = output.next_action.strip() or "No next system action recorded."

    approval_lines = [
        (
            f"{request.approval_class} - {request.title}: {request.action}. "
            f"Reason: {request.reason}"
        )
        for request in approvals
    ]
    approval_text = _bullets(approval_lines, "None.")
    blocker_text = _bullets(blockers, "None.")

    evidence = [str(item) for item in output.evidence]
    evidence.extend(
        [
            f"Run ID: {run_id}",
            f"Repository QA: {'PASS' if qa.get('passed') else 'FAIL'}",
            f"Active unit: {unit.get('id')}",
        ]
    )
    evidence_text = _bullets(evidence, "None recorded.")

    return (
        "\n\n"
        + _OPERATOR_START
        + "\n## SYSTEM COMPLETED\n"
        + completed
        + "\n\n## YOU DO\n"
        + you_do
        + "\n\n## SYSTEM DOES NEXT\n"
        + system_next
        + "\n\n## OWNER APPROVAL REQUIRED\n"
        + approval_text
        + "\n\n## BLOCKERS\n"
        + blocker_text
        + "\n\n## EVIDENCE TO SAVE\n"
        + evidence_text
        + "\n"
        + _OPERATOR_END
        + "\n"
    )


def _strip_existing_operator_handoff(content: str) -> str:
    pattern = re.compile(
        rf"\n?{re.escape(_OPERATOR_START)}.*?{re.escape(_OPERATOR_END)}\n?",
        flags=re.S,
    )
    return pattern.sub("\n", content).rstrip()


def apply_operator_schema(output, unit: dict, qa: dict, run_id: str) -> None:
    if unit.get("kind") not in {"section", "foundation_qa", "day", "continuous"}:
        return
    block = _operator_block(output, unit, qa, run_id)
    for document in output.artifact_documents:
        path = Path(document.relative_path)
        if path.suffix.lower() != ".md":
            continue
        document.content = _strip_existing_operator_handoff(document.content) + block


async def usability_execute_unit(unit: dict) -> dict:
    run_id = engine.uuid4().hex[:16]
    if unit["kind"] == "foundation_qa":
        output = engine.deterministic_foundation_qa(unit)
        qa = engine.run_qa(render=True)
    else:
        output, qa = await engine.execute_model_unit(unit, run_id)

    # First write establishes the current-run durable-output evidence used by the
    # final hardening layer. The owner handoff is intentionally written later,
    # after missing-output/render/runtime blockers have been normalized.
    written = engine.write_artifact_documents(output.artifact_documents)
    required_ok, missing = engine.required_outputs_exist(unit)
    if missing:
        output.blockers.append(
            "Missing required runtime outputs: " + ", ".join(missing)
        )
        output.pass_condition_met = False
        if output.run_status == "PASS":
            output.run_status = "PARTIAL"

    render_result = engine.render_creative_jobs(output, unit, run_id)
    if render_result.get("violations"):
        output.blockers.extend(render_result["violations"])
        output.pass_condition_met = False
        output.run_status = "BLOCKED"

    now = engine.datetime.now(engine.TZ)
    engine.persist_metrics(output, now, run_id)
    engine.persist_experiments(output)
    blocking = engine.persist_approvals(output, unit, now, run_id)

    # final_hardening.update_state_after_unit may add late safety blockers such as
    # rejected out-of-contract paths or required outputs not written in this run.
    # Run it before rendering the owner-facing handoff so the Markdown mirrors the
    # final persisted status instead of an earlier model-only snapshot.
    engine.update_state_after_unit(
        output,
        unit,
        qa,
        run_id,
        blocking,
        required_ok,
        render_result,
    )

    apply_operator_schema(output, unit, qa, run_id)
    # Rewrite the same contract-approved documents with the final deterministic
    # operator handoff. No new artifact path is introduced by this second write.
    engine.write_artifact_documents(output.artifact_documents)
    engine.write_report(output, unit, qa, run_id)

    return {
        "run_id": run_id,
        "unit": unit["id"],
        "status": output.run_status,
        "pass_condition_met": output.pass_condition_met,
        "qa_passed": qa["passed"],
        "artifact_documents_written": written,
        "operator_schema_applied": True,
        "rendered_count": len(render_result.get("rendered", [])),
        "blocking_approvals": len(blocking),
        "blockers": len(output.blockers),
    }


engine.execute_unit = usability_execute_unit

# Import only after the v1.1 patches above are installed so final_hardening captures
# the fidelity-aware active-unit loader and operator-schema execute path as its raw base.
import final_hardening  # noqa: E402


def main() -> None:
    final_hardening.main()


if __name__ == "__main__":
    main()
