from __future__ import annotations

import importlib
import json
from pathlib import Path

import main as engine
import v1_1


HEADINGS = [
    "## SYSTEM COMPLETED",
    "## YOU DO",
    "## SYSTEM DOES NEXT",
    "## OWNER APPROVAL REQUIRED",
    "## BLOCKERS",
    "## EVIDENCE TO SAVE",
]


def check_daily_prompt_fidelity() -> None:
    prompts = v1_1.load_daily_prompts()
    assert set(prompts) == {str(day) for day in range(1, 31)}
    for day in range(1, 31):
        prompt = prompts[str(day)]
        assert prompt.startswith(f"AGM. Execute Day {day}"), day
        assert len(prompt) > 100, day

    unit = v1_1.fidelity_active_unit(
        {
            "mode": "THIRTY_DAY",
            "current_day": 6,
            "status": "READY",
        }
    )
    assert unit["id"] == "day-06"
    assert unit["agm_daily_prompt"] == prompts["6"]
    assert unit["agm_daily_prompt_source"] == "gtm/prompts/days.md"
    assert unit["rendering_enabled"] is True


def _sample_output(content: str):
    return engine.RunOutput(
        run_status="AWAITING_APPROVAL",
        executive_summary="Prepared the requested package.",
        work_completed=["Built the package", "Ran QA"],
        artifacts=["reports/day-01-deliverable.md"],
        artifact_documents=[
            engine.ArtifactDocument(
                relative_path="reports/day-01-deliverable.md",
                content=content,
            )
        ],
        evidence=["Verified source A"],
        approval_requests=[
            engine.ApprovalRequest(
                title="Publish package",
                action="Publish the staged package",
                approval_class="YELLOW",
                reason="External publication requires owner approval.",
            )
        ],
        blockers=["Owner decision required"],
        pass_condition_met=False,
        next_action="Resume publication preparation.",
        founder_brief="Prepared package; owner decision required.",
    )


def check_operator_schema() -> None:
    output = _sample_output("# Day 1 Deliverable\n\nCore work.")
    v1_1.apply_operator_schema(
        output,
        {"kind": "day", "id": "day-01"},
        {"passed": True},
        "selftestrun",
    )
    text = output.artifact_documents[0].content
    assert text.count(v1_1._OPERATOR_START) == 1
    assert text.count(v1_1._OPERATOR_END) == 1
    block = text.split(v1_1._OPERATOR_START, 1)[1].split(v1_1._OPERATOR_END, 1)[0]
    for heading in HEADINGS:
        assert block.count(heading) == 1, heading
    assert "YELLOW - Publish package" in block
    assert "Owner decision required" in block
    assert "Run ID: selftestrun" in block
    assert "Repository QA: PASS" in block

    # Idempotency: regenerating the deterministic handoff replaces only the
    # sentinel-delimited prior handoff rather than duplicating it.
    v1_1.apply_operator_schema(
        output,
        {"kind": "day", "id": "day-01"},
        {"passed": True},
        "selftestrun2",
    )
    text = output.artifact_documents[0].content
    assert text.count(v1_1._OPERATOR_START) == 1
    assert "Run ID: selftestrun2" in text
    assert "Run ID: selftestrun\n" not in text


def check_legitimate_headings_are_preserved() -> None:
    original = (
        "# Strategy\n\n"
        "## BLOCKERS\n"
        "This is legitimate strategy prose about market blockers.\n\n"
        "## EVIDENCE TO SAVE\n"
        "This is legitimate evidence-planning prose."
    )
    output = _sample_output(original)
    v1_1.apply_operator_schema(
        output,
        {"kind": "section", "id": "section-04"},
        {"passed": True},
        "headingsafe",
    )
    text = output.artifact_documents[0].content
    assert "This is legitimate strategy prose about market blockers." in text
    assert "This is legitimate evidence-planning prose." in text
    assert text.startswith(original)
    assert text.count(v1_1._OPERATOR_START) == 1


def check_late_blocker_ordering() -> None:
    source = Path(v1_1.__file__).read_text()
    state_update = source.index("engine.update_state_after_unit(")
    handoff = source.index("apply_operator_schema(output, unit, qa, run_id)")
    final_write = source.index(
        "engine.write_artifact_documents(output.artifact_documents)",
        handoff,
    )
    report = source.index("engine.write_report(output, unit, qa, run_id)")
    assert state_update < handoff < final_write < report
    assert "final persisted status" in source


def check_reload_safe_active_unit_patch() -> None:
    base = engine._gtm_v1_1_base_active_unit
    reloaded = importlib.reload(v1_1)
    assert engine._gtm_v1_1_base_active_unit is base
    unit = reloaded.fidelity_active_unit(
        {"mode": "THIRTY_DAY", "current_day": 1, "status": "READY"}
    )
    assert unit["id"] == "day-01"
    assert unit["agm_daily_prompt_source"] == "gtm/prompts/days.md"


def check_export_workflow_privacy() -> None:
    workflow = (
        engine.REPO_ROOT / ".github" / "workflows" / "gtm-foundation-export.yml"
    ).read_text()
    assert "retention-days: 1" in workflow
    assert "finders-book-phase0-binder.tgz.enc" in workflow
    upload_block = workflow.split("- name: Upload encrypted Foundation export", 1)[1]
    assert "$GTM_RUNTIME_ROOT/foundation" not in upload_block
    assert "GTM_OWNER_ALLOWLIST" in workflow
    assert "openssl enc -aes-256-cbc -salt -pbkdf2" in workflow
    assert (
        'git fetch origin "refs/heads/$STATE_BRANCH:refs/remotes/origin/$STATE_BRANCH"'
        in workflow
    )


def check_day_plan_contract_still_authoritative() -> None:
    plan = json.loads((engine.CONFIG_ROOT / "day-plan.json").read_text())
    assert len(plan["days"]) == 30
    day6 = next(item for item in plan["days"] if item["day"] == 6)
    assert day6["rendering_enabled"] is True
    assert "5 video drafts" in day6["pass_condition"]
    assert "5 Pinterest Pins" in day6["pass_condition"]


def main() -> None:
    check_daily_prompt_fidelity()
    check_operator_schema()
    check_legitimate_headings_are_preserved()
    check_late_blocker_ordering()
    check_export_workflow_privacy()
    check_day_plan_contract_still_authoritative()
    check_reload_safe_active_unit_patch()
    print("GTM Autopilot v1.1 usability self-test PASS")


if __name__ == "__main__":
    main()
