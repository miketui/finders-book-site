from __future__ import annotations

import argparse
import asyncio
import copy
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Literal

import control_plane
import main as engine
import network_guard
from pydantic import Field


CreativeCategory = Literal[
    "video_reference_still",
    "carousel_master",
    "pinterest_pin",
    "video",
]


class HardenedCreativeJob(engine.CreativeJob):
    category: CreativeCategory
    reference_image: str | None = Field(
        default=None,
        description=(
            "For video jobs only: the asset_id of a video_reference_still image "
            "job in the same current creative run. Never provide a runtime path."
        ),
    )


class HardenedRunOutput(engine.RunOutput):
    creative_jobs: list[HardenedCreativeJob] = Field(default_factory=list)


_RAW_ACTIVE_UNIT = engine.active_unit
_RAW_EXECUTE_UNIT = engine.execute_unit
_RAW_WRITE_ARTIFACT_DOCUMENTS = engine.write_artifact_documents
_ACTIVE_UNIT: dict | None = None
_REJECTED_ARTIFACT_PATHS: list[str] = []
_WRITTEN_ARTIFACT_PATHS: set[str] = set()


def hardened_active_unit(state: dict) -> dict:
    unit = _RAW_ACTIVE_UNIT(state)
    if unit.get("kind") == "day":
        plan = engine.config_json("day-plan.json")
        day_num = int(unit["day"])
        day = next(item for item in plan["days"] if int(item["day"]) == day_num)
        outputs = list(day.get("outputs", []))
        if not outputs:
            raise RuntimeError(f"Day {day_num} has no durable output contract.")
        unit["required_outputs"] = outputs
    elif unit.get("kind") == "continuous":
        weekday = str(unit["id"]).removeprefix("continuous-")
        unit["required_outputs"] = [
            f"reports/continuous-{weekday}-deliverable.md"
        ]
    return unit


def _allowed_artifact_paths(unit: dict | None) -> set[str]:
    if not unit:
        return set()
    allowed = set(unit.get("required_outputs", []))
    if unit.get("kind") == "foundation_qa":
        allowed.add("foundation/00-foundation-qa.md")
    return allowed


def hardened_write_artifact_documents(
    documents: list[engine.ArtifactDocument],
) -> list[str]:
    global _REJECTED_ARTIFACT_PATHS, _WRITTEN_ARTIFACT_PATHS
    allowed = _allowed_artifact_paths(_ACTIVE_UNIT)
    accepted: list[engine.ArtifactDocument] = []
    for doc in documents:
        rel = Path(doc.relative_path).as_posix()
        if rel not in allowed:
            _REJECTED_ARTIFACT_PATHS.append(rel)
            continue
        accepted.append(doc)
    written = _RAW_WRITE_ARTIFACT_DOCUMENTS(accepted)
    _WRITTEN_ARTIFACT_PATHS.update(written)
    return written


async def hardened_execute_unit(unit: dict) -> dict:
    global _ACTIVE_UNIT, _REJECTED_ARTIFACT_PATHS, _WRITTEN_ARTIFACT_PATHS
    _ACTIVE_UNIT = copy.deepcopy(unit)
    _REJECTED_ARTIFACT_PATHS = []
    _WRITTEN_ARTIFACT_PATHS = set()
    try:
        return await _RAW_EXECUTE_UNIT(unit)
    finally:
        _ACTIVE_UNIT = None


def _category_counts(jobs: list[HardenedCreativeJob]) -> dict[str, int]:
    counts = {
        "video_reference_still": 0,
        "carousel_master": 0,
        "pinterest_pin": 0,
        "video": 0,
    }
    for job in jobs:
        counts[job.category] = counts.get(job.category, 0) + 1
    return counts


def _strict_creative_preflight(
    output: HardenedRunOutput, unit: dict
) -> list[str]:
    violations = list(control_plane._creative_preflight(output, unit))
    jobs = list(output.creative_jobs)

    for job in jobs:
        if job.kind == "video" and job.category != "video":
            violations.append(
                f"Video asset {job.asset_id} must use category=video."
            )
        if job.kind == "image" and job.category == "video":
            violations.append(
                f"Image asset {job.asset_id} cannot use category=video."
            )

    if unit.get("id") == "day-06":
        expected = {
            "video_reference_still": 5,
            "carousel_master": 5,
            "pinterest_pin": 5,
            "video": 5,
        }
        counts = _category_counts(jobs)
        for category, count in expected.items():
            if counts.get(category, 0) != count:
                violations.append(
                    f"Day 6 requires exactly {count} {category} jobs; "
                    f"received {counts.get(category, 0)}."
                )

        reference_ids = {
            job.asset_id
            for job in jobs
            if job.kind == "image"
            and job.category == "video_reference_still"
        }
        video_refs = [
            job.reference_image
            for job in jobs
            if job.kind == "video"
        ]
        if any(not ref or ref not in reference_ids for ref in video_refs):
            violations.append(
                "Every Day 6 video must reference the asset_id of a current-run "
                "video_reference_still."
            )
        if len(set(video_refs)) != 5:
            violations.append(
                "Day 6 requires five distinct video-to-reference-still bindings."
            )
    return violations


def _provider_failure(job: HardenedCreativeJob, exc: BaseException) -> str:
    return control_plane._provider_failure(job, exc)


def strict_render_creative_jobs(
    output: HardenedRunOutput, unit: dict, run_id: str
) -> dict:
    if not unit.get("rendering_enabled"):
        return {
            "enabled": False,
            "rendered": [],
            "skipped": len(output.creative_jobs),
        }

    violations = _strict_creative_preflight(output, unit)
    if violations:
        return {"enabled": True, "rendered": [], "violations": violations}

    rendered: list[dict] = []
    failures: list[str] = []
    current_image_paths: dict[str, str] = {}

    images = [job for job in output.creative_jobs if job.kind == "image"]
    videos = [job for job in output.creative_jobs if job.kind == "video"]

    for job in images:
        one = output.model_copy(deep=True)
        one.creative_jobs = [job]
        try:
            result = control_plane._original_render_creative_jobs(
                one, unit, run_id
            )
            rows = result.get("rendered", [])
            for row in rows:
                row["category"] = job.category
                if row.get("status") == "RENDERED":
                    path = str(row.get("path", ""))
                    if Path(path).suffix.lower() not in {
                        ".png",
                        ".jpg",
                        ".jpeg",
                        ".webp",
                    }:
                        failures.append(
                            f"Image asset {job.asset_id} produced an unsupported "
                            "reference extension."
                        )
                    else:
                        current_image_paths[job.asset_id] = path
            rendered.extend(rows)
            for violation in result.get("violations", []):
                failures.append(
                    f"GPT Image 2 asset {job.asset_id}: "
                    f"{control_plane._safe_text(violation, 300)}"
                )
        except Exception as exc:
            failures.append(_provider_failure(job, exc))
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "category": job.category,
                    "status": "PROVIDER_FAILED",
                    "provider": "GPT Image 2",
                }
            )

    for job in videos:
        reference_asset_id = str(job.reference_image or "")
        reference_path = current_image_paths.get(reference_asset_id)
        if not reference_path:
            failures.append(
                f"Runway asset {job.asset_id} has no successfully rendered "
                "current-run reference image."
            )
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "category": job.category,
                    "status": "PROVIDER_FAILED",
                    "provider": "Runway Gen-4.5",
                }
            )
            continue

        resolved = (engine.RUNTIME_ROOT / reference_path).resolve()
        creative_root = (
            engine.RUNTIME_ROOT / "creative" / unit["id"] / run_id
        ).resolve()
        if (
            resolved != creative_root
            and creative_root not in resolved.parents
        ):
            failures.append(
                f"Runway asset {job.asset_id} reference escaped the current "
                "creative run."
            )
            continue
        if resolved.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            failures.append(
                f"Runway asset {job.asset_id} reference is not an image."
            )
            continue

        one = output.model_copy(deep=True)
        one.creative_jobs = [job]
        one_job = one.creative_jobs[0]
        one_job.reference_image = reference_path
        try:
            result = control_plane._original_render_creative_jobs(
                one, unit, run_id
            )
            rows = result.get("rendered", [])
            for row in rows:
                row["category"] = job.category
            rendered.extend(rows)
            for violation in result.get("violations", []):
                failures.append(
                    f"Runway Gen-4.5 asset {job.asset_id}: "
                    f"{control_plane._safe_text(violation, 300)}"
                )
        except Exception as exc:
            failures.append(_provider_failure(job, exc))
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "category": job.category,
                    "status": "PROVIDER_FAILED",
                    "provider": "Runway Gen-4.5",
                }
            )

    if unit.get("id") == "day-06":
        successful = [
            item for item in rendered if item.get("status") == "RENDERED"
        ]
        expected = {
            "video_reference_still": 5,
            "carousel_master": 5,
            "pinterest_pin": 5,
            "video": 5,
        }
        actual = {key: 0 for key in expected}
        for item in successful:
            category = str(item.get("category", ""))
            if category in actual:
                actual[category] += 1
        for category, count in expected.items():
            if actual[category] != count:
                failures.append(
                    f"Day 6 requires {count} successfully rendered {category} "
                    f"assets; received {actual[category]}."
                )
        ids = [str(item.get("asset_id", "")) for item in successful]
        if len(ids) != 20 or len(set(ids)) != 20:
            failures.append(
                "Day 6 requires 20 distinct successfully rendered asset IDs."
            )

    outdir = engine.RUNTIME_ROOT / "creative" / unit["id"] / run_id
    outdir.mkdir(parents=True, exist_ok=True)
    manifest = outdir / "render-manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "unit": unit["id"],
                "generated_at": engine.datetime.now(engine.TZ).isoformat(),
                "rendered": rendered,
                "provider_failures": failures,
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
    if failures:
        result["violations"] = failures
    return result


def minimal_pending_approval_index() -> list[dict]:
    approvals = engine.load_runtime_json("approvals.json")
    return [
        {
            "id": item.get("id"),
            "approval_class": item.get("approval_class"),
            "blocking": bool(item.get("blocking")),
            "status": item.get("status"),
        }
        for item in approvals.get("pending", [])
    ]


def latest_blocker_summaries(last_run_id: object) -> list[str]:
    """Return bounded, credential-redacted blockers for status-only diagnosis."""
    if not last_run_id:
        return []

    reports = engine.RUNTIME_ROOT / "reports"
    matches: list[tuple[float, dict]] = []
    for path in reports.glob("*.json"):
        try:
            payload = json.loads(path.read_text())
            modified = path.stat().st_mtime
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        if str(payload.get("run_id")) == str(last_run_id):
            matches.append((modified, payload))
    if not matches:
        return []

    payload = max(matches, key=lambda match: match[0])[1]

    summaries: list[str] = []
    for value in payload.get("blockers", [])[:5]:
        text = re.sub(r"\s+", " ", str(value)).strip()
        if not text:
            continue
        credential_marker = re.search(
            r"(?i)(?:\b(?:authorization\s*:\s*)?bearer\s+\S+|"
            r"\b[A-Z0-9_]*(?:API[_ -]?KEY|SECRET|ACCESS[_ -]?TOKEN|TOKEN|"
            r"PASSWORD|PASSPHRASE|RECOVERY[_ -]?CODE|PIN)[A-Z0-9_]*\b\s*[:=]|"
            r"\b(?:sk|ghp|github_pat|glpat)[-_][A-Za-z0-9_-]{12,}\b)",
            text,
        )
        if credential_marker:
            text = "Credential-bearing blocker suppressed."
        else:
            text = re.sub(
                r"\b[A-Za-z0-9._~+/-]{40,}\b",
                "[REDACTED_HIGH_ENTROPY_VALUE]",
                text,
            )
        summaries.append(text[:300])
    return summaries


def public_status_payload() -> dict:
    state = engine.load_runtime_json("state.json")
    active = engine.active_unit(state)
    completed_sections = state.get("completed_foundation_sections", [])
    last_completed_unit = None
    if state.get("last_completed_day"):
        last_completed_unit = f"day-{int(state['last_completed_day']):02d}"
    elif completed_sections:
        last_completed_unit = f"section-{int(completed_sections[-1]):02d}"

    foundation_root = engine.RUNTIME_ROOT / "foundation"
    foundation_files = (
        sorted(
            path.relative_to(engine.RUNTIME_ROOT).as_posix()
            for path in foundation_root.rglob("*.md")
            if path.is_file()
        )
        if foundation_root.exists()
        else []
    )
    return {
        "mode": state.get("mode"),
        "foundation_cursor": state.get("foundation_cursor"),
        "completed_foundation_sections": completed_sections,
        "foundation_qa_passed": state.get("foundation_qa_passed"),
        "foundation_output_status": {
            "present": bool(foundation_files),
            "markdown_count": len(foundation_files),
            "files": foundation_files,
        },
        "current_day": state.get("current_day"),
        "status": state.get("status"),
        "active_unit": {
            "id": active.get("id"),
            "kind": active.get("kind"),
            "objective": active.get("objective"),
        },
        "last_completed_unit": last_completed_unit,
        "next_executable_unit": active.get("id"),
        "last_run_id": state.get("last_run_id"),
        "last_run_status": state.get("last_run_status"),
        "latest_blocker_summaries": latest_blocker_summaries(
            state.get("last_run_id")
        ),
        "blocking_approval_count": len(
            state.get("blocking_approval_ids", [])
        ),
        "pending_approval_index": minimal_pending_approval_index(),
    }


def ingest_private_ebook_source() -> Path:
    source_url = os.getenv("GTM_EBOOK_SOURCE_URL", "").strip()
    expected_sha = os.getenv("GTM_EBOOK_SOURCE_SHA256", "").strip().lower()
    bearer = os.getenv("GTM_EBOOK_SOURCE_BEARER", "").strip()

    if not source_url:
        raise SystemExit(
            "GTM_EBOOK_SOURCE_URL is required for ebook-ingest."
        )
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
        raise SystemExit(
            "GTM_EBOOK_SOURCE_SHA256 must be an exact 64-character SHA-256."
        )

    target = engine.RUNTIME_ROOT / "ebook" / "ebook-manuscript.json"
    temp = target.with_suffix(".json.part")
    headers = {}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    network_guard.guarded_download_url(
        source_url,
        temp,
        headers=headers,
        max_bytes=20 * 1024 * 1024,
    )
    actual_sha = hashlib.sha256(temp.read_bytes()).hexdigest()
    if actual_sha != expected_sha:
        temp.unlink(missing_ok=True)
        raise SystemExit("Private ebook source SHA-256 verification failed.")

    try:
        data = json.loads(temp.read_text())
    except Exception as exc:
        temp.unlink(missing_ok=True)
        raise SystemExit(
            "Private ebook source is not valid JSON."
        ) from exc
    if not isinstance(data, dict) or not isinstance(data.get("chapters"), list):
        temp.unlink(missing_ok=True)
        raise SystemExit(
            "Private ebook source must contain a top-level chapters array."
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    temp.replace(target)
    print(
        json.dumps(
            {
                "ebook_ingest": "complete",
                "sha256_verified": True,
                "bytes": target.stat().st_size,
            }
        )
    )
    return target


def install_final_guards() -> None:
    engine.CreativeJob = HardenedCreativeJob
    engine.RunOutput = HardenedRunOutput

    control_plane.install_guards()

    prior_execute_model = engine.execute_model_unit
    prior_update_state = engine.update_state_after_unit

    async def final_execute_model(unit: dict, run_id: str):
        enriched = copy.deepcopy(unit)
        outputs = list(enriched.get("required_outputs", []))
        if outputs and enriched.get("kind") != "section":
            enriched["pass_condition"] = (
                str(enriched.get("pass_condition", ""))
                + " Required private runtime outputs: "
                + json.dumps(outputs)
                + ". Return one artifact_documents entry for every required "
                "output path; the unit cannot PASS without them."
            )
        return await prior_execute_model(enriched, run_id)

    def final_update_state(
        output,
        unit,
        qa,
        run_id,
        blocking,
        required_ok,
        render_result,
    ):
        if unit.get("kind") in {"section", "day", "continuous"}:
            required_now = set(unit.get("required_outputs", []))
            missing_current = sorted(required_now - _WRITTEN_ARTIFACT_PATHS)
            if missing_current:
                output.blockers.append("Required outputs not written by current run: " + ", ".join(missing_current))
                output.pass_condition_met = False
                output.run_status = "BLOCKED"
                required_ok = False
        if _REJECTED_ARTIFACT_PATHS:
            rejected = ", ".join(sorted(set(_REJECTED_ARTIFACT_PATHS)))
            output.blockers.append(
                "Rejected out-of-contract artifact paths: " + rejected
            )
            output.pass_condition_met = False
            output.run_status = "BLOCKED"
        return prior_update_state(
            output,
            unit,
            qa,
            run_id,
            blocking,
            required_ok,
            render_result,
        )

    engine.active_unit = hardened_active_unit
    engine.execute_model_unit = final_execute_model
    engine.write_artifact_documents = hardened_write_artifact_documents
    engine.render_creative_jobs = strict_render_creative_jobs
    engine.update_state_after_unit = final_update_state
    engine.execute_unit = hardened_execute_unit


def main() -> None:
    install_final_guards()

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=[
            "run",
            "approve",
            "reject",
            "status",
            "ebook-ingest",
            "ebook-build",
        ],
        default="run",
    )
    parser.add_argument("--approval-id", default="")
    parser.add_argument("--note", default="")
    parser.add_argument("--actor", default="")
    args = parser.parse_args()

    if args.mode in {"approve", "reject"}:
        if not args.approval_id:
            raise SystemExit("--approval-id is required.")
        control_plane.secure_resolve_approval(
            args.approval_id, args.mode, args.note, args.actor
        )
        print(f"{args.mode.upper()}: {args.approval_id}")
        return

    if args.mode == "status":
        control_plane._authorized_owner(args.actor)
        print(json.dumps(public_status_payload(), indent=2))
        return

    if args.mode == "ebook-ingest":
        control_plane._authorized_owner(args.actor)
        ingest_private_ebook_source()
        return

    if args.mode == "ebook-build":
        control_plane._authorized_owner(args.actor)
        engine.build_epub_from_runtime()
        return

    asyncio.run(engine.run_autopilot())


if __name__ == "__main__":
    main()
