from __future__ import annotations

import argparse
import asyncio
import copy
import json
import os
import re
import tempfile
from datetime import datetime
from pathlib import Path

# The public repository contains immutable templates only. When a caller has not
# supplied a private runtime location, choose an OS temporary directory before
# importing the engine so mutable GTM state never defaults into tracked /gtm.
if not os.getenv("GTM_RUNTIME_ROOT"):
    os.environ["GTM_RUNTIME_ROOT"] = str(
        Path(tempfile.gettempdir()) / "finders-book-gtm-runtime"
    )

import main as engine  # noqa: E402


SAFE_APPROVAL_FIELDS = (
    "id",
    "approval_class",
    "title",
    "action",
    "reason",
    "max_spend_usd",
    "blocking",
    "created_at",
    "status",
)


def _safe_text(value: object, limit: int = 600) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    text = re.sub(r"\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b", "[REDACTED]", text)
    text = re.sub(
        r"(?i)\b(?:api[_ -]?key|secret|token|authorization)\b\s*[:=]\s*\S+",
        "[REDACTED]",
        text,
    )
    return text[:limit]


def _authorized_owner(actor: str) -> None:
    allowed = engine.owner_allowlist()
    if not actor or actor not in allowed:
        raise SystemExit(
            f"Approval decision denied for actor {actor or '<missing>'}. "
            f"Authorized owner allow-list: {', '.join(sorted(allowed)) or '<empty>'}."
        )


def secure_resolve_approval(
    approval_id: str, decision: str, note: str, actor: str
) -> None:
    """Resolve YELLOW or RED only after authenticated owner authorization."""
    approvals = engine.load_runtime_json("approvals.json")
    pending = approvals.get("pending", [])
    item = next((x for x in pending if x.get("id") == approval_id), None)
    if not item:
        raise SystemExit(f"Approval ID not found: {approval_id}")

    approval_class = item.get("approval_class")
    if approval_class not in {"YELLOW", "RED"}:
        raise SystemExit(f"Unsupported approval class: {approval_class!r}")

    _authorized_owner(actor)

    pending.remove(item)
    item["decision"] = decision.upper()
    item["status"] = "APPROVED" if decision == "approve" else "REJECTED"
    item["resolved_at"] = datetime.now(engine.TZ).isoformat()
    item["note"] = _safe_text(note, limit=1200)
    item["authorized_actor"] = actor
    approvals.setdefault("resolved", []).append(item)
    engine.save_runtime_json("approvals.json", approvals)

    state = engine.load_runtime_json("state.json")
    remaining = [
        x for x in state.get("blocking_approval_ids", []) if x != approval_id
    ]
    state["blocking_approval_ids"] = remaining
    state["status"] = "AWAITING_APPROVAL" if remaining else "READY"
    if decision == "reject":
        state.setdefault("notes", []).append(
            f"Approval {approval_id} rejected by {actor}: {_safe_text(note, 500)}"
        )
    engine.save_runtime_json("state.json", state)


def pending_approval_summaries() -> list[dict]:
    approvals = engine.load_runtime_json("approvals.json")
    summaries: list[dict] = []
    for item in approvals.get("pending", []):
        summary: dict = {}
        for field in SAFE_APPROVAL_FIELDS:
            value = item.get(field)
            if field in {"title", "action", "reason"}:
                value = _safe_text(value)
            summary[field] = value
        summaries.append(summary)
    return summaries


def normalize_output(output: engine.RunOutput) -> engine.RunOutput:
    """Never persist PASS for a unit whose declared pass condition is false."""
    if output.run_status == "PASS" and not output.pass_condition_met:
        output.run_status = "PARTIAL"
        marker = "Model returned PASS while pass_condition_met=false; normalized to PARTIAL."
        if marker not in output.blockers:
            output.blockers.append(marker)
    return output


def rich_execution_context() -> dict:
    """Supply complete foundation files plus durable summaries of prior daily runs."""
    files: dict[str, str] = {}
    foundation = engine.RUNTIME_ROOT / "foundation"
    if foundation.exists():
        for path in sorted(foundation.rglob("*")):
            if path.is_file() and path.suffix.lower() in {".md", ".json", ".txt"}:
                files[path.relative_to(engine.RUNTIME_ROOT).as_posix()] = path.read_text(
                    errors="replace"
                )

    reports = engine.RUNTIME_ROOT / "reports"
    if reports.exists():
        report_paths = sorted(
            [p for p in reports.glob("*.json") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
        )[-30:]
        for path in report_paths:
            try:
                data = json.loads(path.read_text())
            except Exception:
                continue
            summary = {
                "run_id": data.get("run_id"),
                "generated_at": data.get("generated_at"),
                "active_unit": data.get("active_unit"),
                "run_status": data.get("run_status"),
                "executive_summary": data.get("executive_summary"),
                "work_completed": data.get("work_completed", []),
                "artifacts": data.get("artifacts", []),
                "evidence": data.get("evidence", []),
                "blockers": data.get("blockers", []),
                "pass_condition_met": data.get("pass_condition_met"),
                "next_action": data.get("next_action"),
            }
            key = f"reports/summary-{path.name}"
            files[key] = json.dumps(summary, indent=2)
    return {"files": files}


def _bounded_prompt_runtime_json(name: str, original_loader) -> dict:
    data = original_loader(name)
    if name != "metrics.json":
        return data
    bounded = copy.deepcopy(data)
    history = bounded.get("history", [])
    # Keep the full audit history on disk, but only the latest observations in
    # model context so continuous-growth prompts cannot grow without bound.
    bounded["history"] = history[-120:]
    bounded["history_window"] = {
        "included": len(bounded["history"]),
        "total": len(history),
        "policy": "latest_120_observations",
    }
    return bounded


_original_execute_model_unit = engine.execute_model_unit
_original_render_creative_jobs = engine.render_creative_jobs
_original_update_state_after_unit = engine.update_state_after_unit
_original_deterministic_foundation_qa = engine.deterministic_foundation_qa
_original_load_runtime_json = engine.load_runtime_json


async def guarded_execute_model_unit(
    unit: dict, run_id: str
) -> tuple[engine.RunOutput, dict]:
    prior_loader = engine.load_runtime_json

    def bounded_loader(name: str) -> dict:
        return _bounded_prompt_runtime_json(name, prior_loader)

    engine.load_runtime_json = bounded_loader
    try:
        output, qa = await _original_execute_model_unit(unit, run_id)
    finally:
        engine.load_runtime_json = prior_loader
    return normalize_output(output), qa


def guarded_update_state_after_unit(
    output: engine.RunOutput,
    unit: dict,
    qa: dict,
    run_id: str,
    blocking: list[str],
    required_ok: bool,
    render_result: dict,
) -> None:
    normalize_output(output)
    _original_update_state_after_unit(
        output, unit, qa, run_id, blocking, required_ok, render_result
    )


def guarded_foundation_qa(unit: dict) -> engine.RunOutput:
    """Require explicit Section 5 reconciliation, not file-presence alone."""
    output = _original_deterministic_foundation_qa(unit)
    if output.run_status != "PASS" or not output.pass_condition_met:
        return normalize_output(output)

    blockers: list[str] = []
    operating_path = engine.RUNTIME_ROOT / "foundation" / "05-operating-system.json"
    summary_path = engine.RUNTIME_ROOT / "foundation" / "foundation-summary.md"
    channel_path = engine.RUNTIME_ROOT / "foundation" / "01-channel-architecture.md"

    try:
        operating = json.loads(operating_path.read_text())
    except Exception as exc:
        operating = {}
        blockers.append(f"Section 5 operating-system JSON is unreadable: {_safe_text(exc, 240)}")

    reconciliation = operating.get("foundation_reconciliation", {})
    status = str(reconciliation.get("status", "")).upper()
    contradictions = reconciliation.get("contradictions", None)
    if status != "PASS":
        blockers.append("Section 5 foundation_reconciliation.status must be PASS.")
    if contradictions not in ([], None):
        blockers.append("Section 5 still reports unresolved foundation contradictions.")
    if contradictions is None:
        blockers.append("Section 5 must explicitly provide foundation_reconciliation.contradictions as an array.")

    if not summary_path.exists() or "reconcil" not in summary_path.read_text(errors="replace").lower():
        blockers.append("foundation-summary.md must explicitly document reconciliation.")

    channel_text = channel_path.read_text(errors="replace").lower() if channel_path.exists() else ""
    for required in ("kindle", "apple", "kobo", "non-fillable", "lulu", "direct checkout"):
        if required not in channel_text:
            blockers.append(f"Channel architecture is missing required decision marker: {required}.")

    pending = engine.load_runtime_json("approvals.json").get("pending", [])
    blocking_pending = [x for x in pending if x.get("blocking")]
    if blocking_pending:
        blockers.append("Blocking approval requests remain unresolved at Foundation QA.")

    if blockers:
        output.run_status = "BLOCKED"
        output.pass_condition_met = False
        output.blockers.extend(blockers)
        output.executive_summary = "Phase 0 Foundation QA found unresolved reconciliation requirements."
        output.founder_brief = output.executive_summary
        output.next_action = "Resolve the Foundation QA reconciliation blockers before Day 1."
    return output


def _provider_name(job: engine.CreativeJob) -> str:
    return "GPT Image 2" if job.kind == "image" else "Runway Gen-4.5"


def _provider_failure(job: engine.CreativeJob, exc: BaseException) -> str:
    detail = _safe_text(f"{exc.__class__.__name__}: {exc}", limit=300)
    return f"{_provider_name(job)} asset {job.asset_id} failed: {detail}"


def _creative_preflight(output: engine.RunOutput, unit: dict) -> list[str]:
    budget = engine.config_json("creative-budget.json")
    image_cfg = budget["image"]
    video_cfg = budget["video"]
    images = [j for j in output.creative_jobs if j.kind == "image"]
    videos = [j for j in output.creative_jobs if j.kind == "video"]
    violations: list[str] = []

    if images and not image_cfg.get("enabled", False):
        violations.append("GPT Image 2 provider is disabled by creative-budget.json")
    if videos and not video_cfg.get("enabled", False):
        violations.append("Runway provider is disabled by creative-budget.json")
    if images and not os.getenv("OPENAI_API_KEY"):
        violations.append("OPENAI_API_KEY missing for image rendering")
    if videos and not os.getenv("RUNWAYML_API_SECRET"):
        violations.append("RUNWAYML_API_SECRET missing for video rendering")

    if len(images) > int(image_cfg["max_images_per_run"]):
        violations.append("image job count exceeds hard ceiling")
    if len(videos) > int(video_cfg["max_videos_per_run"]):
        violations.append("video job count exceeds hard ceiling")
    total_seconds = sum(int(j.duration_seconds or 0) for j in videos)
    if total_seconds > int(video_cfg["max_total_seconds_per_run"]):
        violations.append("total video seconds exceed hard ceiling")
    if any(
        int(j.duration_seconds or 0) > int(video_cfg["max_seconds_per_video"])
        for j in videos
    ):
        violations.append("one or more videos exceed per-video ceiling")
    if (
        total_seconds * int(video_cfg["credits_per_second_guardrail"])
        > int(video_cfg["max_runway_credits_per_run"])
    ):
        violations.append("Runway credit estimate exceeds hard ceiling")

    if unit.get("id") == "day-06":
        target = budget["day_6"]["target_outputs"]
        expected_images = (
            int(target["video_reference_stills"])
            + int(target["carousel_master_graphics"])
            + int(target["pinterest_pins"])
        )
        expected_videos = int(target["video_drafts"])
        if len(images) != expected_images:
            violations.append(
                f"Day 6 requires exactly {expected_images} image jobs; received {len(images)}"
            )
        if len(videos) != expected_videos:
            violations.append(
                f"Day 6 requires exactly {expected_videos} video jobs; received {len(videos)}"
            )
        asset_ids = [j.asset_id for j in output.creative_jobs]
        filenames = [Path(j.filename).name for j in output.creative_jobs]
        if len(set(asset_ids)) != len(asset_ids):
            violations.append("Day 6 asset IDs must be distinct")
        if len(set(filenames)) != len(filenames):
            violations.append("Day 6 filenames must be distinct")
        if any(j.proof_classification == "REAL_PROOF_REQUIRED" for j in output.creative_jobs):
            violations.append("Day 6 generative batch cannot count REAL_PROOF_REQUIRED jobs as rendered outputs")
    return violations


def guarded_render_creative_jobs(
    output: engine.RunOutput, unit: dict, run_id: str
) -> dict:
    """Render each media job independently so provider failures persist safely."""
    if not unit.get("rendering_enabled"):
        return {
            "enabled": False,
            "rendered": [],
            "skipped": len(output.creative_jobs),
        }

    violations = _creative_preflight(output, unit)
    if violations:
        return {"enabled": True, "rendered": [], "violations": violations}

    rendered: list[dict] = []
    provider_failures: list[str] = []
    images = [j for j in output.creative_jobs if j.kind == "image"]
    videos = [j for j in output.creative_jobs if j.kind == "video"]

    # Images are deliberately rendered before videos so video reference images
    # can point to an artifact created in the same guarded batch.
    for job in images + videos:
        one = output.model_copy(deep=True)
        one.creative_jobs = [job]
        try:
            result = _original_render_creative_jobs(one, unit, run_id)
            job_results = result.get("rendered", [])
            rendered.extend(job_results)
            for violation in result.get("violations", []):
                provider_failures.append(
                    f"{_provider_name(job)} asset {job.asset_id}: {_safe_text(violation, 300)}"
                )
        except Exception as exc:
            failure = _provider_failure(job, exc)
            provider_failures.append(failure)
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "status": "PROVIDER_FAILED",
                    "provider": _provider_name(job),
                }
            )

    if unit.get("id") == "day-06":
        successful = [item for item in rendered if item.get("status") == "RENDERED"]
        if len(successful) != 20:
            provider_failures.append(
                f"Day 6 requires 20 distinct successfully rendered assets; received {len(successful)}"
            )
        success_ids = [item.get("asset_id") for item in successful]
        if len(set(success_ids)) != len(success_ids):
            provider_failures.append("Day 6 rendered asset IDs are not distinct")

    outdir = engine.RUNTIME_ROOT / "creative" / unit["id"] / run_id
    outdir.mkdir(parents=True, exist_ok=True)
    manifest = outdir / "render-manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "unit": unit["id"],
                "generated_at": datetime.now(engine.TZ).isoformat(),
                "rendered": rendered,
                "provider_failures": provider_failures,
            },
            indent=2,
        )
        + "\n"
    )
    result = {
        "enabled": True,
        "rendered": rendered,
        "manifest": str(manifest.relative_to(engine.RUNTIME_ROOT)),
    }
    if provider_failures:
        result["violations"] = provider_failures
    return result


def install_guards() -> None:
    engine.resolve_approval = secure_resolve_approval
    engine.execute_model_unit = guarded_execute_model_unit
    engine.render_creative_jobs = guarded_render_creative_jobs
    engine.update_state_after_unit = guarded_update_state_after_unit
    engine.deterministic_foundation_qa = guarded_foundation_qa
    engine.foundation_context = rich_execution_context


def status_payload() -> dict:
    state = engine.load_runtime_json("state.json")
    pending = pending_approval_summaries()
    return {
        "mode": state.get("mode"),
        "foundation_cursor": state.get("foundation_cursor"),
        "completed_foundation_sections": state.get(
            "completed_foundation_sections", []
        ),
        "foundation_qa_passed": state.get("foundation_qa_passed"),
        "current_day": state.get("current_day"),
        "status": state.get("status"),
        "last_run_id": state.get("last_run_id"),
        "last_run_status": state.get("last_run_status"),
        "blocking_approval_count": len(state.get("blocking_approval_ids", [])),
        "pending_approvals": pending,
    }


def main() -> None:
    install_guards()

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=["run", "approve", "reject", "status", "ebook-build"],
        default="run",
    )
    parser.add_argument("--approval-id", default="")
    parser.add_argument("--note", default="")
    parser.add_argument("--actor", default="")
    args = parser.parse_args()

    if args.mode in {"approve", "reject"}:
        if not args.approval_id:
            raise SystemExit("--approval-id is required.")
        secure_resolve_approval(
            args.approval_id, args.mode, args.note, args.actor
        )
        print(f"{args.mode.upper()}: {args.approval_id}")
        return

    if args.mode == "status":
        _authorized_owner(args.actor)
        print(json.dumps(status_payload(), indent=2))
        return

    if args.mode == "ebook-build":
        _authorized_owner(args.actor)
        engine.build_epub_from_runtime()
        return

    asyncio.run(engine.run_autopilot())


if __name__ == "__main__":
    main()
