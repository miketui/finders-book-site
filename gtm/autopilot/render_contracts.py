from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import final_hardening as hardening


_prior_preflight = hardening._strict_creative_preflight
_prior_hardened_write = hardening.hardened_write_artifact_documents
_prior_hardened_execute = hardening.hardened_execute_unit
_prior_required_outputs_exist = hardening.engine.required_outputs_exist
_CURRENT_WRITTEN_PATHS: set[str] = set()
_RESUME_VERSION = 1


def normalized_output_name(job) -> str:
    name = Path(job.filename).name
    target_suffix = ".png" if job.kind == "image" else ".mp4"
    path = Path(name)
    if path.suffix.lower() != target_suffix:
        path = path.with_suffix(target_suffix)
    return path.name.lower()


def _job_contract(job) -> dict:
    return {
        "asset_id": str(job.asset_id),
        "kind": str(job.kind),
        "category": str(job.category),
        "prompt": str(job.prompt),
        "filename": normalized_output_name(job),
        "size_or_ratio": str(job.size_or_ratio or ""),
        "duration_seconds": int(job.duration_seconds or 0),
        "proof_classification": str(job.proof_classification or ""),
        "reference_image": str(job.reference_image or ""),
    }


def _job_fingerprint(job) -> str:
    payload = json.dumps(
        _job_contract(job),
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _plan_fingerprint(output) -> str:
    contracts = sorted(
        (_job_contract(job) for job in output.creative_jobs),
        key=lambda item: item["asset_id"],
    )
    payload = json.dumps(
        contracts,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _resume_root(unit: dict) -> Path:
    return (
        hardening.engine.RUNTIME_ROOT
        / "creative"
        / str(unit["id"])
        / "resume"
    )


def _resume_ledger_path(unit: dict) -> Path:
    return _resume_root(unit) / "resume-ledger.json"


def _atomic_json_write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, indent=2) + "\n")
    temp.replace(path)


def _ensure_day6_resume_ledger(output, unit: dict) -> tuple[dict, Path, list[str]]:
    path = _resume_ledger_path(unit)
    fingerprint = _plan_fingerprint(output)
    violations: list[str] = []
    if path.exists():
        try:
            ledger = json.loads(path.read_text())
        except Exception as exc:
            return {}, path, [f"Day 6 resume ledger is unreadable: {exc.__class__.__name__}"]
        if ledger.get("version") != _RESUME_VERSION:
            violations.append("Day 6 resume ledger version is unsupported.")
        if ledger.get("unit") != unit.get("id"):
            violations.append("Day 6 resume ledger belongs to a different unit.")
        if ledger.get("plan_fingerprint") != fingerprint:
            violations.append(
                "Day 6 retry plan differs from the persisted paid-render plan; "
                "automatic rerendering is blocked to prevent duplicate spend."
            )
    else:
        ledger = {
            "version": _RESUME_VERSION,
            "unit": unit.get("id"),
            "plan_fingerprint": fingerprint,
            "jobs": {},
        }
        _atomic_json_write(path, ledger)
    ledger.setdefault("jobs", {})
    return ledger, path, violations


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resume_asset_path(unit: dict, job) -> Path:
    return _resume_root(unit) / "assets" / normalized_output_name(job)


def _record_resume_status(
    ledger: dict,
    ledger_path: Path,
    job,
    *,
    status: str,
    path: Path | None = None,
    detail: str = "",
) -> None:
    entry = {
        "job_fingerprint": _job_fingerprint(job),
        "kind": str(job.kind),
        "category": str(job.category),
        "filename": normalized_output_name(job),
        "status": status,
    }
    if path is not None:
        entry["path"] = str(path.relative_to(hardening.engine.RUNTIME_ROOT))
        entry["sha256"] = _file_sha256(path)
    if detail:
        entry["detail"] = hardening.control_plane._safe_text(detail, 300)
    ledger["jobs"][str(job.asset_id)] = entry
    _atomic_json_write(ledger_path, ledger)


def _cached_render_row(
    ledger: dict,
    unit: dict,
    job,
) -> tuple[dict | None, str | None]:
    entry = ledger.get("jobs", {}).get(str(job.asset_id))
    if not entry:
        return None, None
    if entry.get("job_fingerprint") != _job_fingerprint(job):
        return None, (
            f"Day 6 asset {job.asset_id} no longer matches its persisted paid-render contract."
        )
    status = str(entry.get("status", ""))
    if status in {"IN_PROGRESS", "PROVIDER_FAILED_AMBIGUOUS"}:
        return None, (
            f"Day 6 asset {job.asset_id} has an ambiguous prior provider attempt; "
            "automatic retry is blocked to prevent duplicate spend."
        )
    if status != "RENDERED":
        return None, None

    rel = str(entry.get("path", ""))
    if not rel:
        return None, f"Day 6 cached asset {job.asset_id} is missing its persisted path."
    path = (hardening.engine.RUNTIME_ROOT / rel).resolve()
    root = _resume_root(unit).resolve()
    if path != root and root not in path.parents:
        return None, f"Day 6 cached asset {job.asset_id} escaped the resume directory."
    if not path.is_file():
        return None, (
            f"Day 6 cached asset {job.asset_id} is missing from encrypted runtime state; "
            "automatic rerendering is blocked to prevent duplicate spend."
        )
    expected_suffix = ".png" if job.kind == "image" else ".mp4"
    if path.suffix.lower() != expected_suffix:
        return None, f"Day 6 cached asset {job.asset_id} has an invalid file type."
    if _file_sha256(path) != str(entry.get("sha256", "")):
        return None, (
            f"Day 6 cached asset {job.asset_id} failed integrity verification; "
            "automatic rerendering is blocked."
        )
    return {
        "asset_id": job.asset_id,
        "category": job.category,
        "status": "RENDERED",
        "provider": "resume-cache",
        "path": str(path.relative_to(hardening.engine.RUNTIME_ROOT)),
        "reused": True,
    }, None


def strict_filename_preflight(output, unit: dict) -> list[str]:
    violations = list(_prior_preflight(output, unit))
    normalized = [normalized_output_name(job) for job in output.creative_jobs]
    if len(normalized) != len(set(normalized)):
        violations.append(
            "Creative jobs must resolve to distinct normalized output filenames."
        )

    for job in output.creative_jobs:
        suffix = Path(job.filename).suffix.lower()
        if job.kind == "image" and suffix != ".png":
            violations.append(
                f"Image asset {job.asset_id} must use a .png filename so "
                "generated bytes, MIME type, and Runway reference encoding agree."
            )
        if job.kind == "video" and suffix != ".mp4":
            violations.append(
                f"Video asset {job.asset_id} must use a .mp4 filename."
            )
    return violations


def tracked_hardened_write_artifact_documents(documents):
    written = _prior_hardened_write(documents)
    _CURRENT_WRITTEN_PATHS.update(Path(path).as_posix() for path in written)
    return written


async def tracked_hardened_execute_unit(unit: dict) -> dict:
    _CURRENT_WRITTEN_PATHS.clear()
    return await _prior_hardened_execute(unit)


def current_run_required_outputs_exist(unit: dict) -> tuple[bool, list[str]]:
    """A durable output only satisfies this run if this run wrote it."""
    _, filesystem_missing = _prior_required_outputs_exist(unit)
    required = [Path(path).as_posix() for path in unit.get("required_outputs", [])]
    current_run_missing = [
        path for path in required if path not in _CURRENT_WRITTEN_PATHS
    ]
    missing = list(dict.fromkeys([*filesystem_missing, *current_run_missing]))
    return not missing, missing


def _stabilize_provider_row(unit: dict, job, row: dict) -> tuple[dict, Path]:
    rel = str(row.get("path", ""))
    source = (hardening.engine.RUNTIME_ROOT / rel).resolve()
    if not source.is_file():
        raise RuntimeError(
            f"Provider reported a rendered path that does not exist for {job.asset_id}."
        )
    expected_suffix = ".png" if job.kind == "image" else ".mp4"
    if source.suffix.lower() != expected_suffix:
        raise RuntimeError(
            f"Provider output for {job.asset_id} did not use {expected_suffix}."
        )

    target = _resume_asset_path(unit, job)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    shutil.move(str(source), str(target))
    updated = dict(row)
    updated["path"] = str(target.relative_to(hardening.engine.RUNTIME_ROOT))
    updated["category"] = job.category
    updated["reused"] = False
    return updated, target


def strict_render_creative_jobs(output, unit: dict, run_id: str) -> dict:
    """Render Day 6 incrementally and resume completed paid jobs without recharging."""
    if not unit.get("rendering_enabled"):
        return {
            "enabled": False,
            "rendered": [],
            "skipped": len(output.creative_jobs),
        }

    violations = strict_filename_preflight(output, unit)
    if violations:
        return {"enabled": True, "rendered": [], "violations": violations}

    ledger = None
    ledger_path = None
    if unit.get("id") == "day-06":
        ledger, ledger_path, resume_violations = _ensure_day6_resume_ledger(
            output, unit
        )
        if resume_violations:
            return {
                "enabled": True,
                "rendered": [],
                "violations": resume_violations,
            }

        preflight_resume_violations = []
        for job in output.creative_jobs:
            _, error = _cached_render_row(ledger, unit, job)
            if error:
                preflight_resume_violations.append(error)
        if preflight_resume_violations:
            return {
                "enabled": True,
                "rendered": [],
                "violations": preflight_resume_violations,
            }

    rendered: list[dict] = []
    failures: list[str] = []
    current_image_paths: dict[str, str] = {}
    halt_paid_calls = False

    images = [job for job in output.creative_jobs if job.kind == "image"]
    videos = [job for job in output.creative_jobs if job.kind == "video"]

    for job in images:
        if halt_paid_calls:
            break

        if ledger is not None:
            cached, error = _cached_render_row(ledger, unit, job)
            if error:
                failures.append(error)
                break
            if cached:
                rendered.append(cached)
                current_image_paths[job.asset_id] = str(cached["path"])
                continue
            _record_resume_status(
                ledger,
                ledger_path,
                job,
                status="IN_PROGRESS",
                detail="Provider call started; do not retry automatically until resolved.",
            )

        one = output.model_copy(deep=True)
        one_job = next(
            candidate
            for candidate in one.creative_jobs
            if candidate.asset_id == job.asset_id
        )
        one.creative_jobs = [one_job]
        try:
            result = hardening.control_plane._original_render_creative_jobs(
                one, unit, run_id
            )
            rows = result.get("rendered", [])
            provider_violations = list(result.get("violations", []))
            success = next(
                (row for row in rows if row.get("status") == "RENDERED"),
                None,
            )
            if provider_violations or success is None:
                detail = "; ".join(str(item) for item in provider_violations) or (
                    "provider returned no successful image row"
                )
                if ledger is not None:
                    _record_resume_status(
                        ledger,
                        ledger_path,
                        job,
                        status="PROVIDER_FAILED_AMBIGUOUS",
                        detail=detail,
                    )
                failures.append(
                    f"GPT Image 2 asset {job.asset_id}: "
                    f"{hardening.control_plane._safe_text(detail, 300)}"
                )
                halt_paid_calls = True
                continue

            stabilized, stable_path = _stabilize_provider_row(
                unit, job, success
            )
            rendered.append(stabilized)
            current_image_paths[job.asset_id] = str(stabilized["path"])
            if ledger is not None:
                _record_resume_status(
                    ledger,
                    ledger_path,
                    job,
                    status="RENDERED",
                    path=stable_path,
                )
        except Exception as exc:
            if ledger is not None:
                _record_resume_status(
                    ledger,
                    ledger_path,
                    job,
                    status="PROVIDER_FAILED_AMBIGUOUS",
                    detail=f"{exc.__class__.__name__}: {exc}",
                )
            failures.append(hardening._provider_failure(job, exc))
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "category": job.category,
                    "status": "PROVIDER_FAILED",
                    "provider": "GPT Image 2",
                }
            )
            halt_paid_calls = True

    for job in videos:
        if halt_paid_calls:
            break

        if ledger is not None:
            cached, error = _cached_render_row(ledger, unit, job)
            if error:
                failures.append(error)
                break
            if cached:
                rendered.append(cached)
                continue

        reference_asset_id = str(job.reference_image or "")
        reference_path = current_image_paths.get(reference_asset_id)
        if not reference_path:
            failures.append(
                f"Runway asset {job.asset_id} has no verified Day 6 resume reference image."
            )
            break

        resolved = (hardening.engine.RUNTIME_ROOT / reference_path).resolve()
        resume_root = _resume_root(unit).resolve()
        if resolved != resume_root and resume_root not in resolved.parents:
            failures.append(
                f"Runway asset {job.asset_id} reference escaped the Day 6 resume directory."
            )
            break
        if resolved.suffix.lower() != ".png":
            failures.append(
                f"Runway asset {job.asset_id} reference is not a verified PNG image."
            )
            break

        if ledger is not None:
            _record_resume_status(
                ledger,
                ledger_path,
                job,
                status="IN_PROGRESS",
                detail="Provider call started; do not retry automatically until resolved.",
            )

        one = output.model_copy(deep=True)
        one_job = next(
            candidate
            for candidate in one.creative_jobs
            if candidate.asset_id == job.asset_id
        )
        one.creative_jobs = [one_job]
        one_job.reference_image = reference_path
        try:
            result = hardening.control_plane._original_render_creative_jobs(
                one, unit, run_id
            )
            rows = result.get("rendered", [])
            provider_violations = list(result.get("violations", []))
            success = next(
                (row for row in rows if row.get("status") == "RENDERED"),
                None,
            )
            if provider_violations or success is None:
                detail = "; ".join(str(item) for item in provider_violations) or (
                    "provider returned no successful video row"
                )
                if ledger is not None:
                    _record_resume_status(
                        ledger,
                        ledger_path,
                        job,
                        status="PROVIDER_FAILED_AMBIGUOUS",
                        detail=detail,
                    )
                failures.append(
                    f"Runway Gen-4.5 asset {job.asset_id}: "
                    f"{hardening.control_plane._safe_text(detail, 300)}"
                )
                halt_paid_calls = True
                continue

            stabilized, stable_path = _stabilize_provider_row(
                unit, job, success
            )
            rendered.append(stabilized)
            if ledger is not None:
                _record_resume_status(
                    ledger,
                    ledger_path,
                    job,
                    status="RENDERED",
                    path=stable_path,
                )
        except Exception as exc:
            if ledger is not None:
                _record_resume_status(
                    ledger,
                    ledger_path,
                    job,
                    status="PROVIDER_FAILED_AMBIGUOUS",
                    detail=f"{exc.__class__.__name__}: {exc}",
                )
            failures.append(hardening._provider_failure(job, exc))
            rendered.append(
                {
                    "asset_id": job.asset_id,
                    "category": job.category,
                    "status": "PROVIDER_FAILED",
                    "provider": "Runway Gen-4.5",
                }
            )
            halt_paid_calls = True

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

        paths = [str(item.get("path", "")) for item in successful]
        normalized_paths = [
            Path(path).as_posix().lower() for path in paths if path
        ]
        if len(normalized_paths) != 20 or len(set(normalized_paths)) != 20:
            failures.append(
                "Day 6 requires 20 distinct successfully rendered output paths."
            )

    outdir = hardening.engine.RUNTIME_ROOT / "creative" / unit["id"] / run_id
    outdir.mkdir(parents=True, exist_ok=True)
    manifest = outdir / "render-manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "unit": unit["id"],
                "generated_at": hardening.engine.datetime.now(
                    hardening.engine.TZ
                ).isoformat(),
                "rendered": rendered,
                "provider_failures": failures,
                "resume_ledger": (
                    str(ledger_path.relative_to(hardening.engine.RUNTIME_ROOT))
                    if ledger_path is not None
                    else None
                ),
            },
            indent=2,
        )
        + "\n"
    )
    result = {
        "enabled": True,
        "rendered": rendered,
        "manifest": str(manifest.relative_to(hardening.engine.RUNTIME_ROOT)),
    }
    if failures:
        result["violations"] = failures
    return result


hardening._strict_creative_preflight = strict_filename_preflight
hardening.hardened_write_artifact_documents = tracked_hardened_write_artifact_documents
hardening.hardened_execute_unit = tracked_hardened_execute_unit
hardening.strict_render_creative_jobs = strict_render_creative_jobs
hardening.engine.required_outputs_exist = current_run_required_outputs_exist
