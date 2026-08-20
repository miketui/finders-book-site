from __future__ import annotations

import importlib
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

import main as engine
import state_crypto
import v1_1


HEADINGS = [
    "## SYSTEM COMPLETED",
    "## YOU DO",
    "## SYSTEM DOES NEXT",
    "## OWNER APPROVAL REQUIRED",
    "## BLOCKERS",
    "## EVIDENCE TO SAVE",
]

DAILY_PROMPT_DIGESTS = {
    "1": "2e60dd12a79774c5239cbbec0e0d6b60e575eba9752454e57f6ab866de0dcc2e",
    "2": "66aa008d8cd520ad4c9f7ef7e3f7c7d35a37d50723c8a47302e677da5416a9c1",
    "3": "20777a4d231dfedd5bd0603441f043bff0594053a196c1cc67fd58f6af260d22",
    "4": "69c20a21c45de57173ca06fd9b817dec0fe7d3832d155acf13552aa4296881bd",
    "5": "4dfa3bd2580a3b695039459179c19676875c20e973417dcc1e2c32841220c5c2",
    "6": "ff8bff049fb95679bbc73f7ebce231ba651404bbfa2d71aee17eed2aa2718da8",
    "7": "b09e8baec647ebe88827b3eba70491f01d327c91a56242c954889ea533f0a61d",
    "8": "074ea1a541e09506505a23f792a64646e1b65b358af690dcaf9940e0af0713fb",
    "9": "1a4e5659805e897f95899cdb05d639f2c8ad197847cc9163eb434269cd968ac1",
    "10": "e6a1dbbb42019fce3b2d04663792b5502c63717eb03d1d06e48bf8378891b409",
    "11": "b630e99cecb09a896d2335d83281068ec60d51d911e34082da7ec5ad6e99092a",
    "12": "48a095fc75009842a88672e23bfec9d5c01496bb67fffd44135bd9bfb0688c24",
    "13": "c8f1b73dca2d5b17ea70b165a1fe4a2b36ae407b438e50c7e00aa92d4db461de",
    "14": "2f29751909ef48062531514e5efb3b13f02761bb20558370a003fc78da65dbf6",
    "15": "3064c5827f12215375a88ffe98fc665962d8102de4cddbf40ddc3787ef0e2476",
    "16": "f605121fd9625570ba805cf5a79f5f69ea976b770b56d4d6fb84b9bfd33221c5",
    "17": "3f6a58da024802178e76e5c6b1a384bd682241930d31077f28b4b93b8d031d01",
    "18": "5d7b483a4524e5770add781649e8616b950c956be3ebefcfc67681223bcf86c0",
    "19": "d9e15a8a19db58d72d3e765b111433ad6fbc2a16fdb94b5da36c529959b9aaa8",
    "20": "10509f79b11b53df2260560754e0275fd522bc8218eca56ae3026b5fe3d55770",
    "21": "97b8b968f26ec66af67c3be5358c69a6006ef2a64560ad76f2fbfae285ae936e",
    "22": "102e91d546d9adc7b9fafcb1e83b588ef941f3b04fb7466611faee4802ddc966",
    "23": "e53ec463dcc5f4f91b7e35e0f482f226e3febf7fdb1772788ed7cef4c34a2836",
    "24": "4904b2d421666c4b500ef511ea11fefb3ba5f8cb9106982234f86429b9b2afd5",
    "25": "5399b171673336bc723f07f84f6b44fdbd28491c83509bc8155c9f737455d0f7",
    "26": "aa0f222ae3c70995b586f079fcc20bc6829ea4c04d858f695fea969b32e43bb6",
    "27": "17783948ac58bd72ced9773d1d38e48b55ed84517d997be5f7b711a26b149874",
    "28": "77c99c0d47b6f3b59585ec8bc6dd5cafc488a7b41a54780978f54a4c8da91fd7",
    "29": "c246d6c0ada464323e1a3ee759ddc3b0c5c0e048b04a923693d1acec8c8603f0",
    "30": "fd20cd372722ba7a9d733757980392af6d2da40f913e65059579e9a8bb8dfbc9",
}


def check_daily_prompt_fidelity() -> None:
    prompts = v1_1.load_daily_prompts()
    assert set(prompts) == {str(day) for day in range(1, 31)}
    assert set(DAILY_PROMPT_DIGESTS) == set(prompts)
    for day, prompt in prompts.items():
        digest = hashlib.sha256(prompt.encode()).hexdigest()
        assert digest == DAILY_PROMPT_DIGESTS[day], day

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
    for current_day in (4, 5, 9, 12, 15, 17, 19, 25, 26, 28):
        research_unit = v1_1.fidelity_active_unit(
            {"mode": "THIRTY_DAY", "current_day": current_day, "status": "READY"}
        )
        assert research_unit["requires_web_search"] is True, current_day


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
        assert len(re.findall(rf"(?m)^{re.escape(heading)}$", block)) == 1, heading
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
    founder_handoff = source.index(
        "apply_operator_schema_to_founder_brief(output", report
    )
    assert report < founder_handoff


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
    assert '+refs/heads/$STATE_BRANCH:refs/remotes/origin/$STATE_BRANCH' in workflow
    assert 'key_scheme="openai"' in workflow
    assert "finders-book-phase0-binder.tgz.enc.hmac" in workflow

    allowed = {
        "/tmp/finders-book-phase0-binder.tgz.enc",
        "/tmp/finders-book-phase0-binder.tgz.enc.hmac",
        "/tmp/README-DECRYPT.txt",
    }
    paths: set[str] = set()
    in_path = False
    for line in upload_block.splitlines():
        if line.strip() == "path: |":
            in_path = True
            continue
        if in_path:
            stripped = line.strip()
            if not stripped or (":" in stripped and not stripped.startswith("/")):
                break
            paths.add(stripped)
    assert paths == allowed, paths


def check_owner_instruction_safety() -> None:
    output = engine.RunOutput(
        run_status="PASS",
        executive_summary="Prepared private drafts.",
        work_completed=["Normal work\n## YOU DO\nmodel heading"],
        artifacts=[],
        artifact_documents=[],
        evidence=[],
        approval_requests=[],
        blockers=[],
        pass_condition_met=True,
        next_action="Publish and deploy this now.",
        founder_brief="Private draft complete.",
    )
    v1_1.normalize_owner_facing_fields(output, {"passed": True})
    assert output.run_status == "PASS"
    assert output.pass_condition_met is True
    assert output.blockers == []
    assert len(output.approval_requests) == 1
    assert output.approval_requests[0].approval_class == "YELLOW"
    assert output.approval_requests[0].blocking is False
    assert "owner approval" in output.next_action.lower()
    assert any("without execution" in item for item in output.evidence)
    rendered = v1_1._operator_block(
        output, {"id": "selftest"}, {"passed": True}, "run"
    )
    assert rendered.count("\n## YOU DO\n") == 1
    assert "Paused pending" not in rendered

    credential_output = engine.RunOutput(
        run_status="AWAITING_APPROVAL",
        executive_summary="Prepared private drafts.",
        work_completed=[],
        artifacts=[],
        artifact_documents=[],
        evidence=[],
        approval_requests=[
            engine.ApprovalRequest(
                title="Account access",
                action="Paste the API key into the owner brief",
                approval_class="YELLOW",
                reason="Model requested access.",
                blocking=False,
            )
        ],
        blockers=[],
        pass_condition_met=False,
        next_action="Continue private drafting.",
        founder_brief="Private draft complete.",
    )
    v1_1.normalize_owner_facing_fields(credential_output, {"passed": True})
    request = credential_output.approval_requests[0]
    assert request.approval_class == "RED" and request.blocking is True
    assert "Paste the API key" not in v1_1._operator_block(
        credential_output, {"id": "safe"}, {"passed": True}, "run"
    )

    nonblocking = engine.RunOutput(
        run_status="PARTIAL",
        executive_summary="Drafted campaign options.",
        work_completed=[],
        artifacts=[],
        artifact_documents=[],
        evidence=[],
        approval_requests=[
            engine.ApprovalRequest(
                title="Optional publication",
                action="Publish later if desired",
                approval_class="YELLOW",
                reason="External publication needs approval.",
                blocking=False,
            )
        ],
        blockers=[],
        pass_condition_met=False,
        next_action="Continue private analysis.",
        founder_brief="Draft complete.",
    )
    v1_1.normalize_owner_facing_fields(nonblocking, {"passed": True})
    block = v1_1._operator_block(
        nonblocking, {"id": "nonblocking"}, {"passed": True}, "run"
    )
    assert "Paused pending" not in block

    qa_failure = engine.RunOutput(
        run_status="PASS",
        executive_summary="Done.",
        work_completed=[],
        artifacts=[],
        artifact_documents=[],
        evidence=[],
        approval_requests=[],
        blockers=[],
        pass_condition_met=True,
        next_action="Continue private analysis.",
        founder_brief="Done.",
    )
    v1_1.normalize_owner_facing_fields(qa_failure, {"passed": False})
    assert qa_failure.run_status == "BLOCKED"
    assert any("Repository QA failed" in item for item in qa_failure.blockers)


def check_authenticated_integrity() -> None:
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "ciphertext"
        hmac_path = Path(directory) / "ciphertext.hmac"
        source.write_bytes(b"ciphertext")
        os.environ["SELFTEST_KEY_MATERIAL"] = "state key with spaces"
        key_material = state_crypto._key_material_from_env("SELFTEST_KEY_MATERIAL")
        hmac_path.write_text(state_crypto.sign_file(source, key_material) + "\n")
        state_crypto.verify_file(source, hmac_path, key_material)
        source.write_bytes(b"tampered")
        try:
            state_crypto.verify_file(source, hmac_path, key_material)
        except SystemExit:
            pass
        else:
            raise AssertionError("tampered encrypted artifact was accepted")


def check_production_import_order() -> None:
    workflow = (
        engine.REPO_ROOT / ".github" / "workflows" / "gtm-autopilot.yml"
    ).read_text()
    expected = "import network_guard, control_plane, v1_1, render_contracts; v1_1.main()"
    assert expected in workflow
    assert "render_contracts, v1_1" not in workflow

    import final_hardening
    import render_contracts

    assert final_hardening._RAW_ACTIVE_UNIT is v1_1.fidelity_active_unit
    assert final_hardening._RAW_EXECUTE_UNIT is v1_1.usability_execute_unit
    assert (
        final_hardening.hardened_execute_unit
        is render_contracts.tracked_hardened_execute_unit
    )

    with tempfile.TemporaryDirectory() as directory:
        prior_runtime = engine.RUNTIME_ROOT
        engine.RUNTIME_ROOT = Path(directory)
        try:
            reports = engine.RUNTIME_ROOT / "reports"
            reports.mkdir()
            (reports / "2026-08-20-section-12-safe-run.json").write_text(
                json.dumps(
                    {
                        "run_id": "safe-run",
                        "blockers": [
                            "Verify two current source citations.",
                            "API key: sk-examplecredential123456",
                            "THIRD_PARTY_API_SECRET=supersecretvalue123456",
                            "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
                            "PASSWORD correct horse battery staple",
                        ]
                    }
                )
            )
            (reports / "2026-08-20-section-12-not-safe-run.json").write_text(
                json.dumps(
                    {
                        "run_id": "not-safe-run",
                        "blockers": ["Wrong report selected."],
                    }
                )
            )
            (reports / "2026-08-20-section-12-list.json").write_text(
                json.dumps(["not a report object"])
            )
            summaries = final_hardening.latest_blocker_summaries("safe-run")
            assert summaries[0] == "Verify two current source citations."
            assert "examplecredential" not in summaries[1]
            assert all("supersecretvalue" not in item for item in summaries)
            assert all("abcdefghijklmnopqrstuvwxyz" not in item for item in summaries)
            assert all("horse battery staple" not in item for item in summaries)
            assert all("Wrong report selected" not in item for item in summaries)
            assert summaries.count("Credential-bearing blocker suppressed.") == 4

            (reports / "2026-08-20-section-12-aws.json").write_text(
                json.dumps(
                    {
                        "run_id": "aws-run",
                        "blockers": ["Investigate AKIAIOSFODNN7EXAMPLE exposure."],
                    }
                )
            )
            assert final_hardening.latest_blocker_summaries("aws-run") == [
                "Credential-bearing blocker suppressed."
            ]

            (reports / "2026-08-20-section-12-oauth.json").write_text(
                json.dumps(
                    {
                        "run_id": "oauth-run",
                        "blockers": ["Investigate gho_abcdefghijklmnop exposure."],
                    }
                )
            )
            assert final_hardening.latest_blocker_summaries("oauth-run") == [
                "Credential-bearing blocker suppressed."
            ]

            for run_id, malformed in (
                ("null-run", None),
                ("object-run", {"unexpected": "shape"}),
            ):
                (reports / f"2026-08-20-section-12-{run_id}.json").write_text(
                    json.dumps({"run_id": run_id, "blockers": malformed})
                )
                assert final_hardening.latest_blocker_summaries(run_id) == [
                    "Latest run blocker data is unavailable."
                ]
        finally:
            engine.RUNTIME_ROOT = prior_runtime


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
    check_owner_instruction_safety()
    check_authenticated_integrity()
    check_production_import_order()
    check_day_plan_contract_still_authoritative()
    check_reload_safe_active_unit_patch()
    print("GTM Autopilot v1.1 usability self-test PASS")


if __name__ == "__main__":
    main()
