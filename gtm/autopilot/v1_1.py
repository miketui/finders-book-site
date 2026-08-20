from __future__ import annotations

import re
from pathlib import Path

import main as engine


_DAILY_PROMPT_SOURCE = "gtm/prompts/days.md"
_CURRENT_RESEARCH = re.compile(
    r"\b(web research|current official|current partners|current .{0,80}"
    r"(?:rules|requirements|policies|fees)|re-verify|verify .{0,40}buyable)\b",
    re.I | re.S,
)
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
_CREDENTIAL_WORDS = re.compile(
    r"\b(password|api[ _-]?key|secret(?:[ _-]?key)?|access[ _-]?token|"
    r"bearer[ _-]?token|private[ _-]?key|recovery[ _-]?code|pin|"
    r"gtm_state_key|openai_api_key|runwayml_api_secret|credential)\b",
    re.I,
)
_REQUEST_VERBS = re.compile(
    r"\b(paste|provide|share|send|reveal|enter|expose|upload|give\s+me|"
    r"tell\s+me|supply|return|include)\b",
    re.I,
)
_EXTERNAL_ACTIONS = {
    "publish": re.compile(r"\bpublish\b", re.I),
    "send": re.compile(r"\b(send|email|message)\b", re.I),
    "activate": re.compile(r"\b(activate|launch)\b", re.I),
    "deploy": re.compile(r"\bdeploy\b", re.I),
    "merge": re.compile(r"\bmerge\b", re.I),
    "spend": re.compile(r"\b(spend|charge|purchase|order|buy)\b", re.I),
    "contact": re.compile(r"\b(contact|outreach)\b", re.I),
    "pricing": re.compile(
        r"\b(change|alter|update|set)\s+(?:the\s+)?(?:price|pricing)\b",
        re.I,
    ),
    "campaign": re.compile(
        r"\b(?:start|enable|turn on|activate|launch)\s+(?:the\s+)?(?:ad|ads|campaign)",
        re.I,
    ),
}
_REDACTION_PATTERN = re.compile(r"\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b")
_LABELED_VALUE = re.compile(
    r"(?i)\b(?:api[ _-]?key|secret(?:[ _-]?key)?|access[ _-]?token|"
    r"bearer[ _-]?token|password|pin|recovery[ _-]?code)\b\s*[:=]\s*\S+"
)


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
        unit["requires_web_search"] = bool(_CURRENT_RESEARCH.search(source_prompt))
        unit["prompt_precedence"] = (
            "Preserve the AGM prompt's task intent. If it conflicts with the current "
            "machine-readable day contract, approval gates, privacy rules, repository QA, "
            "creative budget or hardened controls, the current hardened contract wins and "
            "the discrepancy must be reported rather than silently followed."
        )
    return unit


engine.active_unit = fidelity_active_unit


def _redact_sensitive_values(value: object) -> str:
    text = str(value)
    text = _REDACTION_PATTERN.sub("[REDACTED]", text)
    return _LABELED_VALUE.sub("[REDACTED]", text)


def _neutralize_heading_lines(value: str) -> str:
    text = _redact_sensitive_values(value).strip()
    if not text:
        return text
    headings = "|".join(re.escape(item) for item in _OPERATOR_HEADINGS)
    return re.sub(
        rf"(?mi)^(\s*)##\s+({headings})\s*$",
        r"\1> ## \2",
        text,
    )


def _safe_display(value: object) -> str:
    return _neutralize_heading_lines(str(value))


def _bullets(items: list[str], fallback: str) -> str:
    clean = [_safe_display(item) for item in items if str(item).strip()]
    if not clean:
        return fallback
    return "\n".join(f"- {item}" for item in clean)


def _credential_request(text: object) -> bool:
    value = str(text)
    return bool(_CREDENTIAL_WORDS.search(value) and _REQUEST_VERBS.search(value))


def _external_action_names(text: object) -> set[str]:
    value = str(text)
    return {
        name for name, pattern in _EXTERNAL_ACTIONS.items() if pattern.search(value)
    }


def _matching_approval_exists(output, action: str) -> bool:
    pattern = _EXTERNAL_ACTIONS[action]
    for request in output.approval_requests:
        combined = " ".join(
            [str(request.title), str(request.action), str(request.reason)]
        )
        if pattern.search(combined):
            return True
    return False


def _sanitize_owner_text(value: object, fallback: str) -> tuple[str, bool]:
    text = str(value or "")
    if _credential_request(text):
        return fallback, True
    return _redact_sensitive_values(text), False


def normalize_owner_facing_fields(output, qa: dict) -> None:
    unsafe = False

    if output.run_status == "PASS" and not output.pass_condition_met:
        output.run_status = "PARTIAL"
        marker = (
            "Model returned PASS while pass_condition_met=false; normalized to PARTIAL."
        )
        if marker not in output.blockers:
            output.blockers.append(marker)

    for request in output.approval_requests:
        combined = " ".join(
            [str(request.title), str(request.action), str(request.reason)]
        )
        if request.approval_class == "RED":
            request.blocking = True
        if _credential_request(combined):
            request.title = "Unsafe model instruction suppressed"
            request.action = (
                "Do not provide credentials, passwords, keys, tokens, PINs, "
                "or recovery codes."
            )
            request.reason = (
                "The model attempted to request sensitive credentials; execution is blocked."
            )
            request.approval_class = "RED"
            request.blocking = True
            unsafe = True
        else:
            request.title = _redact_sensitive_values(request.title)
            request.action = _redact_sensitive_values(request.action)
            request.reason = _redact_sensitive_values(request.reason)

    normalized_blockers: list[str] = []
    for blocker in output.blockers:
        cleaned, blocked = _sanitize_owner_text(
            blocker,
            "Unsafe model-derived credential request was suppressed. Do not provide secrets.",
        )
        normalized_blockers.append(cleaned)
        unsafe = unsafe or blocked
    output.blockers = normalized_blockers

    output.executive_summary, summary_unsafe = _sanitize_owner_text(
        output.executive_summary,
        "Unsafe model-derived credential request was suppressed.",
    )
    output.founder_brief, brief_unsafe = _sanitize_owner_text(
        output.founder_brief,
        "Unsafe model-derived credential request was suppressed.",
    )
    output.work_completed = [
        _sanitize_owner_text(
            item, "Unsafe model-derived credential request was suppressed."
        )[0]
        for item in output.work_completed
    ]
    output.evidence = [
        _sanitize_owner_text(
            item, "Unsafe model-derived credential request was suppressed."
        )[0]
        for item in output.evidence
    ]
    unsafe = unsafe or summary_unsafe or brief_unsafe

    next_action = str(output.next_action or "")
    cleaned_next, next_unsafe = _sanitize_owner_text(
        next_action,
        "Execution is blocked because an unsafe credential request was suppressed.",
    )
    output.next_action = cleaned_next
    unsafe = unsafe or next_unsafe

    unapproved_actions = sorted(
        action
        for action in _external_action_names(next_action)
        if not _matching_approval_exists(output, action)
    )
    if unapproved_actions:
        output.next_action = (
            "Prepare the proposed external action privately, then request the required "
            "owner approval before execution."
        )
        output.blockers.append(
            "External action was proposed without a matching recorded approval: "
            + ", ".join(unapproved_actions)
            + "."
        )
        unsafe = True

    if not qa.get("passed"):
        qa_blocker = (
            "Repository QA failed; resolve validation/render failures before advancing "
            "this GTM unit."
        )
        if qa_blocker not in output.blockers:
            output.blockers.append(qa_blocker)
        output.pass_condition_met = False
        output.run_status = "BLOCKED"

    if unsafe:
        safe_blocker = (
            "Unsafe model-derived owner instruction was suppressed by the v1.1 control plane."
        )
        if safe_blocker not in output.blockers:
            output.blockers.append(safe_blocker)
        output.pass_condition_met = False
        output.run_status = "BLOCKED"
    elif output.blockers and output.run_status == "PASS":
        output.pass_condition_met = False
        output.run_status = "BLOCKED"

    blocking_approval = any(
        request.approval_class == "RED" or bool(request.blocking)
        for request in output.approval_requests
    )
    if blocking_approval and output.run_status == "PASS":
        output.run_status = "AWAITING_APPROVAL"
        output.pass_condition_met = False


def _operator_block(output, unit: dict, qa: dict, run_id: str) -> str:
    approvals = list(output.approval_requests)
    blockers = [str(item) for item in output.blockers]
    blocking_approvals = [
        request
        for request in approvals
        if request.approval_class == "RED" or bool(request.blocking)
    ]

    completed = _bullets(
        [str(item) for item in output.work_completed],
        _safe_display(output.executive_summary.strip())
        or "No autonomous work was recorded.",
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

    if blocking_approvals or blockers:
        system_next = (
            "Paused pending the blocking approval/blocker resolution above. "
            "After resolution: "
            + (_safe_display(output.next_action) or "resume the current GTM unit")
        )
    else:
        system_next = _safe_display(output.next_action) or "No next system action recorded."

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


def apply_operator_schema_to_founder_brief(
    output, unit: dict, qa: dict, run_id: str
) -> None:
    reports = engine.RUNTIME_ROOT / "reports"
    matches = sorted(reports.glob(f"*-{unit['id']}-{run_id}-founder-brief.md"))
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly one founder brief for {unit['id']} run {run_id}; "
            f"found {len(matches)}."
        )
    brief = matches[0]
    brief.write_text(
        _strip_existing_operator_handoff(brief.read_text())
        + _operator_block(output, unit, qa, run_id)
    )


async def usability_execute_unit(unit: dict) -> dict:
    run_id = engine.uuid4().hex[:16]
    if unit["kind"] == "foundation_qa":
        output = engine.deterministic_foundation_qa(unit)
        qa = engine.run_qa(render=True)
    else:
        output, qa = await engine.execute_model_unit(unit, run_id)

    normalize_owner_facing_fields(output, qa)

    written = engine.write_artifact_documents(output.artifact_documents)
    required_ok, missing = engine.required_outputs_exist(unit)
    if missing:
        output.blockers.append("Missing required runtime outputs: " + ", ".join(missing))
        output.pass_condition_met = False
        if output.run_status == "PASS":
            output.run_status = "PARTIAL"

    render_result = engine.render_creative_jobs(output, unit, run_id)
    if render_result.get("violations"):
        output.blockers.extend(render_result["violations"])
        output.pass_condition_met = False
        output.run_status = "BLOCKED"

    normalize_owner_facing_fields(output, qa)
    now = engine.datetime.now(engine.TZ)
    engine.persist_metrics(output, now, run_id)
    engine.persist_experiments(output)
    blocking = engine.persist_approvals(output, unit, now, run_id)

    engine.update_state_after_unit(
        output,
        unit,
        qa,
        run_id,
        blocking,
        required_ok,
        render_result,
    )

    normalize_owner_facing_fields(output, qa)
    apply_operator_schema(output, unit, qa, run_id)
    engine.write_artifact_documents(output.artifact_documents)
    engine.write_report(output, unit, qa, run_id)
    apply_operator_schema_to_founder_brief(output, unit, qa, run_id)

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

# Import only after the v1.1 patches above are installed. This makes the hardened
# layer capture fidelity_active_unit and usability_execute_unit as its raw bases.
import final_hardening  # noqa: E402


def main() -> None:
    final_hardening.main()


if __name__ == "__main__":
    main()
