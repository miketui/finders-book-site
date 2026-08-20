from __future__ import annotations

import argparse
import asyncio
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
    # Defensive redaction for accidental key-like strings in provider/user text.
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

    # Both consequential classes are owner-authorized. Authorization happens
    # before mutating pending/resolved state.
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


_original_execute_model_unit = engine.execute_model_unit
_original_render_creative_jobs = engine.render_creative_jobs


async def guarded_execute_model_unit(
    unit: dict, run_id: str
) -> tuple[engine.RunOutput, dict]:
    output, qa = await _original_execute_model_unit(unit, run_id)
    return normalize_output(output), qa


def _provider_name(job: engine.CreativeJob) -> str:
    return "GPT Image 2" if job.kind == "image" else "Runway Gen-4.5"


def _provider_failure(job: engine.CreativeJob, exc: BaseException) -> str:
    detail = _safe_text(f"{exc.__class__.__name__}: {exc}", limit=300)
    return f"{_provider_name(job)} asset {job.asset_id} failed: {detail}"


def _creative_preflight(output: engine.RunOutput) -> list[str]:
    budget = engine.config_json("creative-budget.json")
    image_cfg = budget["image"]
    video_cfg = budget["video"]
    images = [j for j in output.creative_jobs if j.kind == "image"]
    videos = [j for j in output.creative_jobs if j.kind == "video"]
    violations: list[str] = []

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

    violations = _creative_preflight(output)
    if violations:
        return {"enabled": True, "rendered": [], "violations": violations}

    rendered: list[dict] = []
    provider_failures: list[str] = []

    # Call the already budget-aware renderer one job at a time. This preserves
    # completed files if a later provider call fails, while the combined
    # preflight above still enforces per-run ceilings.
    for job in output.creative_jobs:
        one = output.model_copy(deep=True)
        one.creative_jobs = [job]
        try:
            result = _original_render_creative_jobs(one, unit, run_id)
            rendered.extend(result.get("rendered", []))
            for violation in result.get("violations", []):
                provider_failures.append(
                    f"{_provider_name(job)} asset {job.asset_id}: {_safe_text(violation, 300)}"
                )
        except Exception as exc:  # provider/network/SDK errors become stateful blockers
            failure = _provider_failure(job, exc)
            provider_failures.append(failure)
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "status": "PROVIDER_FAILED",
                    "provider": _provider_name(job),
                }
            )

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
        # workflow_dispatch supplies the authenticated GitHub actor. Status may
        # expose the safe approval review fields only to an allowlisted owner.
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
