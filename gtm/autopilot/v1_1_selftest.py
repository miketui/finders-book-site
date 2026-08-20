from __future__ import annotations

import json
import tempfile
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


def check_operator_schema() -> None:
    output = engine.RunOutput(
        run_status="AWAITING_APPROVAL",
        executive_summary="Prepared the requested package.",
        work_completed=["Built the package", "Ran QA"],
        artifacts=["reports/day-01-deliverable.md"],
        artifact_documents=[
            engine.ArtifactDocument(
                relative_path="reports/day-01-deliverable.md",
                content="# Day 1 Deliverable\n\nCore work.",
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
    v1_1.apply_operator_schema(
        output,
        {"kind": "day", "id": "day-01"},
        {"passed": True},
        "selftestrun",
    )
    text = output.artifact_documents[0].content
    for heading in HEADINGS:
        assert text.count(heading) == 1, heading
    assert "YELLOW - Publish package" in text
    assert "Owner decision required" in text
    assert "Run ID: selftestrun" in text
    assert "Repository QA: PASS" in text


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
    check_export_workflow_privacy()
    check_day_plan_contract_still_authoritative()
    print("GTM Autopilot v1.1 usability self-test PASS")


if __name__ == "__main__":
    main()
