from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import subprocess
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from agents import Agent, ModelSettings, Runner
from openai import OpenAI
from pydantic import AfterValidator, BaseModel, Field

import model_provider

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_ROOT = REPO_ROOT / "gtm"
RUNTIME_ROOT = Path(os.getenv("GTM_RUNTIME_ROOT", str(CONFIG_ROOT))).resolve()
TZ = ZoneInfo("America/Los_Angeles")


def _bounded_text(limit: int):
    def validate(value: str) -> str:
        if len(value) > limit:
            raise ValueError(f"text exceeds {limit} characters")
        return value

    return validate


def _bounded_items(limit: int):
    def validate(value: list):
        if len(value) > limit:
            raise ValueError(f"list exceeds {limit} items")
        return value

    return validate


def _bounded_artifacts(value: list["ArtifactDocument"]):
    if len(value) > 8:
        raise ValueError("list exceeds 8 items")
    if sum(len(item.content) for item in value) > 55_000:
        raise ValueError("artifact content exceeds 55000 aggregate characters")
    return value


# AfterValidator keeps durable safety bounds out of the provider-facing JSON schema.
# Gemini's OpenAI-compatible structured-output endpoint rejects maxLength/maxItems,
# while Pydantic still enforces these limits before any output is trusted or persisted.
ShortText = Annotated[str, AfterValidator(_bounded_text(2_000))]
PathText = Annotated[str, AfterValidator(_bounded_text(500))]
ArtifactText = Annotated[str, AfterValidator(_bounded_text(40_000))]


class ApprovalRequest(BaseModel):
    title: ShortText
    action: ShortText
    approval_class: Literal["YELLOW", "RED"]
    reason: ShortText
    max_spend_usd: float | None = None
    blocking: bool = True


class MetricUpdate(BaseModel):
    metric: ShortText
    channel: ShortText
    value: float | int | ShortText | None
    source: ShortText
    verified: bool


class ExperimentUpdate(BaseModel):
    experiment_id: ShortText
    status: ShortText
    finding: ShortText
    next_step: ShortText


class ArtifactDocument(BaseModel):
    relative_path: PathText
    content: ArtifactText = Field(
        description=(
            "Complete but concise artifact body. Stay within 40,000 characters; "
            "use dense tables/lists instead of decorative repetition."
        ),
    )


class CreativeJob(BaseModel):
    asset_id: ShortText
    kind: Literal["image", "video"]
    prompt: Annotated[str, AfterValidator(_bounded_text(5_000))]
    filename: PathText
    size_or_ratio: ShortText
    duration_seconds: int | None = None
    reference_image: PathText | None = None
    proof_classification: Literal["GENERATIVE", "REAL_PROOF_REQUIRED"] = "GENERATIVE"


WorkList = Annotated[list[ShortText], AfterValidator(_bounded_items(50))]
PathList = Annotated[list[PathText], AfterValidator(_bounded_items(50))]
ArtifactList = Annotated[list[ArtifactDocument], AfterValidator(_bounded_artifacts)]
MetricList = Annotated[list[MetricUpdate], AfterValidator(_bounded_items(50))]
ExperimentList = Annotated[list[ExperimentUpdate], AfterValidator(_bounded_items(50))]
ApprovalList = Annotated[list[ApprovalRequest], AfterValidator(_bounded_items(20))]
BlockerList = Annotated[list[ShortText], AfterValidator(_bounded_items(20))]
CreativeList = Annotated[list[CreativeJob], AfterValidator(_bounded_items(30))]


class RunOutput(BaseModel):
    run_status: Literal["PASS", "AWAITING_APPROVAL", "BLOCKED", "PARTIAL"]
    executive_summary: ShortText
    work_completed: WorkList = Field(default_factory=list)
    artifacts: PathList = Field(default_factory=list)
    artifact_documents: ArtifactList = Field(default_factory=list)
    evidence: WorkList = Field(default_factory=list)
    metric_updates: MetricList = Field(default_factory=list)
    experiment_updates: ExperimentList = Field(default_factory=list)
    approval_requests: ApprovalList = Field(default_factory=list)
    blockers: BlockerList = Field(default_factory=list)
    creative_jobs: CreativeList = Field(default_factory=list)
    pass_condition_met: bool
    next_action: ShortText
    founder_brief: Annotated[str, AfterValidator(_bounded_text(4_000))]


def config_json(name: str) -> dict:
    return json.loads((CONFIG_ROOT / name).read_text())


def runtime_path(name: str) -> Path:
    return RUNTIME_ROOT / name


def load_runtime_json(name: str) -> dict:
    path = runtime_path(name)
    if not path.exists():
        template = CONFIG_ROOT / name
        if not template.exists():
            raise FileNotFoundError(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(template.read_text())
    return json.loads(path.read_text())


def save_runtime_json(name: str, data: dict) -> None:
    path = runtime_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def owner_allowlist() -> set[str]:
    raw = os.getenv("GTM_OWNER_ALLOWLIST", "miketui")
    return {item.strip() for item in raw.split(",") if item.strip()}


def parse_markdown_prompts(path: Path, pattern: str) -> dict[str, str]:
    text = path.read_text()
    matches = list(re.finditer(pattern, text, flags=re.M))
    out: dict[str, str] = {}
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        out[match.group(1)] = text[start:end].strip()
    return out


def load_agent_prompts() -> dict[str, str]:
    return parse_markdown_prompts(
        CONFIG_ROOT / "prompts" / "agents.md",
        r"^## AGENT: ([A-Z_]+)\s*$",
    )


def load_section_prompts() -> dict[str, str]:
    return parse_markdown_prompts(
        CONFIG_ROOT / "prompts" / "sections.md",
        r"^## SECTION: (\d+)\s*$",
    )


def run_qa(render: bool = False) -> dict:
    commands = [["npm", "run", "validate"]]
    if render:
        commands.append(["npm", "run", "test:render"])
    results = []
    for command in commands:
        proc = subprocess.run(command, cwd=REPO_ROOT, text=True, capture_output=True)
        combined = proc.stdout + "\n" + proc.stderr
        results.append({
            "command": " ".join(command),
            "returncode": proc.returncode,
            "tail": "\n".join(combined.splitlines()[-30:]),
        })
    return {"passed": all(r["returncode"] == 0 for r in results), "results": results}


def collect_repository_evidence() -> dict:
    candidate_paths = [
        "README.md",
        "package.json",
        "order.html",
        "analytics.js",
        "consent.js",
        "family-emergency-planning.html",
        "important-documents.html",
        "how-it-works.html",
        "in-case-of-death-binder.html",
        "letter-of-instruction.html",
        "docs/FINAL-LAUNCH-CERTIFICATION-2026-08-19.md",
        "sitemap.xml",
    ]
    files: dict[str, str] = {}
    for rel in candidate_paths:
        path = REPO_ROOT / rel
        if path.exists() and path.is_file():
            text = path.read_text(errors="replace")
            files[rel] = text[:7000]
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True
        ).strip()
    except Exception:
        sha = "UNVERIFIED"
    return {"commit": sha, "files": files}


def foundation_context() -> dict:
    root = RUNTIME_ROOT / "foundation"
    if not root.exists():
        return {"files": {}}
    files: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".md", ".json", ".txt"}:
            rel = path.relative_to(RUNTIME_ROOT).as_posix()
            files[rel] = path.read_text(errors="replace")[:7000]
    return {"files": files}


def active_unit(state: dict) -> dict:
    if state["mode"] == "PHASE0":
        phase0 = config_json("phase0-plan.json")
        cursor = int(state.get("foundation_cursor", 0))
        order = phase0["execution_order"]
        if cursor < len(order):
            section_num = order[cursor]
            section = next(x for x in phase0["sections"] if x["section"] == section_num)
            return {
                "kind": "section",
                "id": f"section-{section_num:02d}",
                "section": section_num,
                "objective": section["title"],
                "specialists": section["specialists"],
                "pass_condition": section["pass_condition"],
                "required_outputs": section["outputs"],
                "rendering_enabled": False,
            }
        qa = phase0["foundation_qa"]
        return {
            "kind": "foundation_qa",
            "id": "foundation-qa",
            "objective": qa["title"],
            "specialists": qa["specialists"],
            "pass_condition": qa["pass_condition"],
            "required_outputs": qa["required_outputs"],
            "rendering_enabled": False,
        }

    plan = config_json("day-plan.json")
    if state["mode"] == "CONTINUOUS_GROWTH":
        weekday = datetime.now(TZ).strftime("%A").lower()
        return {
            "kind": "continuous",
            "id": f"continuous-{weekday}",
            "day": "continuous",
            "objective": plan["continuous_growth"]["cadence"][weekday],
            "specialists": [
                "ANALYTICS", "SEO", "CONTENT", "CREATIVE_PRODUCTION",
                "GROWTH", "COMMERCE", "PARTNERSHIPS", "RELEASE_QA",
            ],
            "pass_condition": (
                "A measurable weekly growth action is prepared or completed with "
                "evidence and safe approval handling."
            ),
            "required_outputs": [],
            "rendering_enabled": False,
        }

    day_num = int(state["current_day"])
    day = next(item for item in plan["days"] if item["day"] == day_num)
    return {
        "kind": "day",
        "id": f"day-{day_num:02d}",
        **day,
        "required_outputs": [],
        "rendering_enabled": bool(day.get("rendering_enabled", False)),
    }


def build_agents(prompt_map: dict[str, str], model) -> dict[str, Agent]:
    descriptions = {
        "SEO": "Search intent, on-page SEO, schema, internal linking and evergreen organic growth.",
        "CONTENT": "Platform-native scripts, copy, carousels, Pins, email and repurposing.",
        "GROWTH": "Paid acquisition, testing, budgets and optimization recommendations.",
        "COMMERCE": "Payhip, Lulu, KDP, Etsy, B&N, Ingram and marketplace architecture.",
        "ANALYTICS": "Funnel metrics, attribution, KPIs and experiment readouts.",
        "PARTNERSHIPS": "Creator, professional, B2B, library and bookstore outreach strategy.",
        "RELEASE_QA": "Repository safety, QA, release evidence and regression prevention.",
        "CREATIVE_PRODUCTION": "Render specifications and guarded GPT Image 2 / Runway Gen-4.5 media jobs.",
        "EBOOK_PRODUCTION": "Separate reflowable EPUB reading-edition architecture and production.",
    }
    agents: dict[str, Agent] = {}
    for name, instructions in prompt_map.items():
        agents[name] = Agent(
            name=f"Finder's Book {name}",
            handoff_description=descriptions.get(name, f"Consult {name}"),
            instructions=instructions,
            model=model,
            model_settings=ModelSettings(max_tokens=6_000),
        )
    return agents


def build_orchestrator(
    specialists: dict[str, Agent],
    allowed: list[str],
    model,
    provider: model_provider.ModelProviderName,
    enable_web_search: bool = False,
) -> Agent:
    instructions = (CONFIG_ROOT / "prompts" / "orchestrator.md").read_text()
    tools = []
    for name in allowed:
        if name not in specialists:
            continue
        agent = specialists[name]
        tools.append(agent.as_tool(
            tool_name=f"consult_{name.lower()}",
            tool_description=agent.handoff_description or f"Consult {name}",
        ))
    if enable_web_search:
        tools.append(model_provider.web_search_tool(provider))
    return Agent(
        name="Finder's Book GTM Orchestrator",
        instructions=instructions,
        model=model,
        model_settings=ModelSettings(max_tokens=24_000),
        tools=tools,
        output_type=RunOutput,
    )


def safe_runtime_artifact_path(relative_path: str) -> Path:
    rel = Path(relative_path)
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError(f"Unsafe artifact path: {relative_path}")
    allowed = {"foundation", "reports", "creative", "ebook"}
    if not rel.parts or rel.parts[0] not in allowed:
        raise ValueError(f"Artifact must live under {sorted(allowed)}: {relative_path}")
    target = (RUNTIME_ROOT / rel).resolve()
    if RUNTIME_ROOT not in target.parents and target != RUNTIME_ROOT:
        raise ValueError(f"Artifact escaped runtime root: {relative_path}")
    return target


def write_artifact_documents(documents: list[ArtifactDocument]) -> list[str]:
    written = []
    for doc in documents:
        target = safe_runtime_artifact_path(doc.relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.suffix.lower() == ".json":
            parsed = json.loads(doc.content)
            target.write_text(json.dumps(parsed, indent=2) + "\n")
        else:
            target.write_text(doc.content)
        written.append(doc.relative_path)
    return written


def resolve_approval(approval_id: str, decision: str, note: str, actor: str) -> None:
    approvals = load_runtime_json("approvals.json")
    pending = approvals["pending"]
    item = next((x for x in pending if x["id"] == approval_id), None)
    if not item:
        raise SystemExit(f"Approval ID not found: {approval_id}")

    if item.get("approval_class") == "RED":
        allowed = owner_allowlist()
        if not actor or actor not in allowed:
            raise SystemExit(
                f"RED approval decision denied for actor {actor or '<missing>'}. "
                f"Authorized owner allow-list: {', '.join(sorted(allowed)) or '<empty>'}."
            )

    pending.remove(item)
    item["decision"] = decision.upper()
    item["status"] = "APPROVED" if decision == "approve" else "REJECTED"
    item["resolved_at"] = datetime.now(TZ).isoformat()
    item["note"] = note
    item["authorized_actor"] = actor or "unattributed"
    approvals["resolved"].append(item)
    save_runtime_json("approvals.json", approvals)

    state = load_runtime_json("state.json")
    remaining = [x for x in state.get("blocking_approval_ids", []) if x != approval_id]
    state["blocking_approval_ids"] = remaining
    if remaining:
        state["status"] = "AWAITING_APPROVAL"
    else:
        state["status"] = "READY"
    if decision == "reject":
        state.setdefault("notes", []).append(
            f"Approval {approval_id} rejected by {actor or 'unattributed'}: {note}"
        )
    save_runtime_json("state.json", state)


def persist_metrics(output: RunOutput, now: datetime, run_id: str) -> None:
    if not output.metric_updates:
        return
    metrics = load_runtime_json("metrics.json")
    history = metrics.setdefault("history", [])
    for update in output.metric_updates:
        observation = {
            "run_id": run_id,
            "observed_at": now.isoformat(),
            **update.model_dump(),
        }
        history.append(observation)
        channel = metrics["channels"].setdefault(update.channel, {})
        channel[update.metric] = {
            "value": update.value,
            "source": update.source,
            "verified": update.verified,
            "updated_at": now.isoformat(),
        }
    metrics["as_of"] = now.isoformat()
    save_runtime_json("metrics.json", metrics)


def persist_experiments(output: RunOutput) -> None:
    experiments = load_runtime_json("experiments.json")
    for update in output.experiment_updates:
        data = update.model_dump()
        target_name = "active" if update.status.lower() not in {"completed", "closed"} else "completed"
        other_name = "completed" if target_name == "active" else "active"

        existing_target = next(
            (x for x in experiments[target_name] if x.get("experiment_id") == update.experiment_id),
            None,
        )
        if existing_target:
            existing_target.update(data)
            continue

        existing_other = next(
            (x for x in experiments[other_name] if x.get("experiment_id") == update.experiment_id),
            None,
        )
        if existing_other:
            experiments[other_name].remove(existing_other)
            existing_other.update(data)
            experiments[target_name].append(existing_other)
        else:
            experiments[target_name].append(data)
    save_runtime_json("experiments.json", experiments)


def persist_approvals(
    output: RunOutput, unit: dict, now: datetime, run_id: str
) -> list[str]:
    approvals = load_runtime_json("approvals.json")
    blocking = []
    label = unit["id"]
    stamp = now.strftime("%Y-%m-%d")
    for idx, req in enumerate(output.approval_requests, start=1):
        approval_id = f"{stamp}-{label}-{run_id}-{idx:02d}"
        data = req.model_dump()
        data["blocking"] = True if req.approval_class == "RED" else req.blocking
        record = {
            "id": approval_id,
            "run_id": run_id,
            "created_at": now.isoformat(),
            "status": "PENDING",
            **data,
        }
        approvals["pending"].append(record)
        if record["blocking"]:
            blocking.append(approval_id)
    save_runtime_json("approvals.json", approvals)
    return blocking


def write_report(output: RunOutput, unit: dict, qa: dict, run_id: str) -> None:
    now = datetime.now(TZ)
    reports = RUNTIME_ROOT / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    stamp = now.strftime("%Y-%m-%d")
    label = unit["id"]

    payload = output.model_dump()
    payload["run_id"] = run_id
    payload["generated_at"] = now.isoformat()
    payload["active_unit"] = unit
    payload["qa"] = qa
    (reports / f"{stamp}-{label}-{run_id}.json").write_text(
        json.dumps(payload, indent=2) + "\n"
    )

    brief = f"""# Finder's Book Founder Brief — {stamp}

**Run ID:** {run_id}
**Mode:** {load_runtime_json('state.json')['mode']}
**Active:** {label} — {unit['objective']}
**Run status:** {output.run_status}
**Repository QA:** {'PASS' if qa['passed'] else 'FAIL'}

{output.founder_brief}

## Approvals required
"""
    if output.approval_requests:
        for req in output.approval_requests:
            brief += f"- **{req.approval_class}: {req.title}** — {req.reason}\n"
    else:
        brief += "- None.\n"
    if output.blockers:
        brief += "\n## Blockers\n" + "\n".join(f"- {b}" for b in output.blockers) + "\n"
    brief += f"\n## Next action\n{output.next_action}\n"
    (reports / f"{stamp}-{label}-{run_id}-founder-brief.md").write_text(brief)


def required_outputs_exist(unit: dict) -> tuple[bool, list[str]]:
    missing = []
    for rel in unit.get("required_outputs", []):
        if not (RUNTIME_ROOT / rel).exists():
            missing.append(rel)
    return not missing, missing


def image_data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('utf-8')}"


def download_url(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response:
        target.write_bytes(response.read())


def render_creative_jobs(output: RunOutput, unit: dict, run_id: str) -> dict:
    if not unit.get("rendering_enabled"):
        return {"enabled": False, "rendered": [], "skipped": len(output.creative_jobs)}

    budget = config_json("creative-budget.json")
    image_cfg = budget["image"]
    video_cfg = budget["video"]
    images = [j for j in output.creative_jobs if j.kind == "image"]
    videos = [j for j in output.creative_jobs if j.kind == "video"]

    violations = []
    if len(images) > int(image_cfg["max_images_per_run"]):
        violations.append("image job count exceeds hard ceiling")
    if len(videos) > int(video_cfg["max_videos_per_run"]):
        violations.append("video job count exceeds hard ceiling")
    total_seconds = sum(int(j.duration_seconds or 0) for j in videos)
    if total_seconds > int(video_cfg["max_total_seconds_per_run"]):
        violations.append("total video seconds exceed hard ceiling")
    if any(int(j.duration_seconds or 0) > int(video_cfg["max_seconds_per_video"]) for j in videos):
        violations.append("one or more videos exceed per-video ceiling")
    if total_seconds * int(video_cfg["credits_per_second_guardrail"]) > int(video_cfg["max_runway_credits_per_run"]):
        violations.append("Runway credit estimate exceeds hard ceiling")
    if violations:
        return {"enabled": True, "rendered": [], "violations": violations}

    outdir = RUNTIME_ROOT / "creative" / unit["id"] / run_id
    outdir.mkdir(parents=True, exist_ok=True)
    rendered: list[dict] = []

    if images:
        client = OpenAI()
        for job in images:
            if job.proof_classification == "REAL_PROOF_REQUIRED":
                rendered.append({"asset_id": job.asset_id, "status": "SKIPPED_REAL_PROOF_REQUIRED"})
                continue
            size = job.size_or_ratio if job.size_or_ratio in image_cfg["allowed_sizes"] else "1024x1536"
            result = client.images.generate(
                model=image_cfg["model"],
                prompt=job.prompt,
                size=size,
                quality=image_cfg["quality"],
            )
            target = outdir / Path(job.filename).name
            if target.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                target = target.with_suffix(".png")
            item = result.data[0]
            if getattr(item, "b64_json", None):
                target.write_bytes(base64.b64decode(item.b64_json))
            elif getattr(item, "url", None):
                download_url(item.url, target)
            else:
                raise RuntimeError(f"GPT Image 2 returned no image payload for {job.asset_id}")
            rendered.append({"asset_id": job.asset_id, "status": "RENDERED", "path": str(target.relative_to(RUNTIME_ROOT))})

    if videos:
        if not os.getenv("RUNWAYML_API_SECRET"):
            return {
                "enabled": True,
                "rendered": rendered,
                "violations": ["RUNWAYML_API_SECRET missing for video rendering"],
            }
        from runwayml import RunwayML

        runway = RunwayML()
        for job in videos:
            if job.proof_classification == "REAL_PROOF_REQUIRED":
                rendered.append({"asset_id": job.asset_id, "status": "SKIPPED_REAL_PROOF_REQUIRED"})
                continue
            kwargs = {
                "model": video_cfg["model"],
                "prompt_text": job.prompt,
                "ratio": job.size_or_ratio if job.size_or_ratio in video_cfg["allowed_ratios"] else "720:1280",
                "duration": int(job.duration_seconds or 5),
            }
            if job.reference_image:
                ref = safe_runtime_artifact_path(job.reference_image)
                if ref.exists():
                    kwargs["prompt_image"] = image_data_uri(ref)
            task = runway.image_to_video.create(**kwargs).wait_for_task_output()
            raw_output = getattr(task, "output", None)
            if raw_output is None and isinstance(task, dict):
                raw_output = task.get("output")
            urls = raw_output if isinstance(raw_output, list) else [raw_output] if raw_output else []
            if not urls:
                raise RuntimeError(f"Runway returned no output URL for {job.asset_id}")
            target = outdir / Path(job.filename).name
            if target.suffix.lower() != ".mp4":
                target = target.with_suffix(".mp4")
            download_url(str(urls[0]), target)
            rendered.append({"asset_id": job.asset_id, "status": "RENDERED", "path": str(target.relative_to(RUNTIME_ROOT))})

    manifest = outdir / "render-manifest.json"
    manifest.write_text(json.dumps({
        "run_id": run_id,
        "unit": unit["id"],
        "generated_at": datetime.now(TZ).isoformat(),
        "rendered": rendered,
    }, indent=2) + "\n")
    return {"enabled": True, "rendered": rendered, "manifest": str(manifest.relative_to(RUNTIME_ROOT))}


def update_state_after_unit(
    output: RunOutput,
    unit: dict,
    qa: dict,
    run_id: str,
    blocking: list[str],
    required_ok: bool,
    render_result: dict,
) -> None:
    state = load_runtime_json("state.json")
    now = datetime.now(TZ)
    state["last_run_id"] = run_id
    state["last_run_at"] = now.isoformat()
    state["last_run_status"] = output.run_status
    state["blocking_approval_ids"] = blocking

    render_violations = render_result.get("violations", [])
    effective_pass = (
        output.run_status == "PASS"
        and output.pass_condition_met
        and qa["passed"]
        and not blocking
        and required_ok
        and not render_violations
    )

    if blocking:
        state["status"] = "AWAITING_APPROVAL"
    elif not qa["passed"] or render_violations:
        state["status"] = "BLOCKED"
        if render_violations:
            state.setdefault("notes", []).append(
                f"Creative rendering blocked: {'; '.join(render_violations)}"
            )
    elif unit["kind"] == "section" and effective_pass:
        section = int(unit["section"])
        completed = state.setdefault("completed_foundation_sections", [])
        if section not in completed:
            completed.append(section)
        state["foundation_cursor"] = int(state.get("foundation_cursor", 0)) + 1
        state["status"] = "READY"
    elif unit["kind"] == "foundation_qa" and effective_pass:
        state["foundation_qa_passed"] = True
        state["mode"] = "THIRTY_DAY"
        state["status"] = "READY"
        state["started_at"] = state.get("started_at") or now.isoformat()
        state["current_day"] = 1
    elif unit["kind"] == "day" and effective_pass:
        day_num = int(unit["day"])
        completed_days = state.setdefault("completed_days", [])
        if day_num not in completed_days:
            completed_days.append(day_num)
        state["last_completed_local_date"] = now.date().isoformat()
        state["last_completed_day"] = day_num
        if day_num >= 30:
            state["mode"] = "CONTINUOUS_GROWTH"
            state["status"] = "READY"
        else:
            state["current_day"] = day_num + 1
            state["status"] = "READY"
    elif unit["kind"] == "continuous" and effective_pass:
        state["status"] = "READY"
        state["last_completed_local_date"] = now.date().isoformat()
    else:
        state["status"] = output.run_status

    save_runtime_json("state.json", state)


def deterministic_foundation_qa(unit: dict) -> RunOutput:
    qa = run_qa(render=True)
    ok, missing = required_outputs_exist(unit)
    state = load_runtime_json("state.json")
    expected = config_json("phase0-plan.json")["execution_order"]
    completed = state.get("completed_foundation_sections", [])
    sections_ok = all(section in completed for section in expected)
    blockers = []
    if missing:
        blockers.append("Missing required foundation artifacts: " + ", ".join(missing))
    if not sections_ok:
        blockers.append("Not all 12 foundation sections are complete.")
    if not qa["passed"]:
        blockers.append("Repository QA failed.")

    passed = not blockers
    summary = (
        "All 12 Phase 0 foundation sections, required artifacts and protected repository QA passed."
        if passed
        else "Phase 0 Foundation QA found blocking conditions."
    )
    doc = ArtifactDocument(
        relative_path="foundation/00-foundation-qa.md",
        content=(
            "# Phase 0 Foundation QA\n\n"
            f"Status: {'PASS' if passed else 'BLOCKED'}\n\n"
            f"Completed sections: {completed}\n\n"
            f"Missing required artifacts: {missing or 'None'}\n\n"
            f"Repository QA: {'PASS' if qa['passed'] else 'FAIL'}\n"
        ),
    )
    return RunOutput(
        run_status="PASS" if passed else "BLOCKED",
        executive_summary=summary,
        work_completed=["Checked all required Phase 0 outputs", "Ran protected repository QA"],
        artifacts=["foundation/00-foundation-qa.md"],
        artifact_documents=[doc],
        evidence=[f"Completed foundation sections: {completed}", f"Repository QA passed: {qa['passed']}"],
        blockers=blockers,
        pass_condition_met=passed,
        next_action="Begin Day 1." if passed else "Resolve the listed Foundation QA blockers.",
        founder_brief=summary,
    )


async def execute_model_unit(unit: dict, run_id: str) -> tuple[RunOutput, dict]:
    state = load_runtime_json("state.json")
    qa = run_qa(render=unit["kind"] in {"day", "continuous"})

    if unit["kind"] == "section":
        section_prompt = load_section_prompts()[str(unit["section"])]
        specific = (
            f"Execute Phase 0 {unit['id']}. Required private runtime outputs: "
            f"{json.dumps(unit['required_outputs'])}. "
            "Return one artifact_documents entry for EVERY required output path. "
            "Do not claim external platform verification unless supplied evidence or hosted web-search results support it. "
            "If live private dashboard evidence is unavailable, mark it UNVERIFIED and produce a concrete verification checklist rather than inventing facts.\n\n"
            f"SECTION PROMPT:\n{section_prompt}"
        )
        if int(unit.get("section", 0)) == 12:
            specific += (
                "\n\nSECTION 12 CLASSIFICATION CONTRACT: The pass condition is complete "
                "classification, not successful verification of every claim. A material "
                "claim classified UNVERIFIED satisfies this unit when the source ledger "
                "records its impact and a concrete authoritative verification checklist. "
                "Do not require rendered-page results, private dashboard evidence, "
                "protected-check/merge/deployment alignment, final-file marketplace "
                "economics, outputs from later Foundation sections, or Foundation QA as "
                "prerequisites for Section 12. Do not mark the unit BLOCKED solely because "
                "those later or private inputs are unavailable."
            )
    else:
        specific = (
            f"Execute {unit['id']}: {unit['objective']}. "
            f"Pass condition: {unit['pass_condition']}. "
            "Use the Phase 0 foundation artifacts as governing strategy. "
        )
        if unit.get("agm_daily_prompt"):
            specific += (
                "\n\nAUTHORITATIVE DAILY AGM SOURCE PROMPT:\n"
                + str(unit["agm_daily_prompt"])
                + "\n\nThe current hardened machine-readable contract and "
                "approval/privacy controls remain authoritative on conflicts."
            )
        if unit.get("rendering_enabled"):
            specific += (
                "This unit explicitly enables autonomous rendering. Return creative_jobs that stay "
                "within creative-budget.json and target the Day 6 batch. Use GPT Image 2 image jobs "
                "and Runway Gen-4.5 video jobs. Never create synthetic product proof. "
            )

    context = {
        "run_id": run_id,
        "active_unit": unit,
        "state": state,
        "metrics": load_runtime_json("metrics.json"),
        "experiments": load_runtime_json("experiments.json"),
        "approvals": load_runtime_json("approvals.json"),
        "repository_qa": qa,
        "repository_evidence": collect_repository_evidence(),
        "foundation": foundation_context(),
        "creative_budget": config_json("creative-budget.json"),
    }

    prompt_map = load_agent_prompts()
    provider = model_provider.selected_provider()
    model = model_provider.runtime_model(provider)
    specialists = build_agents(prompt_map, model)
    enable_web = (
        (
            unit["kind"] == "section"
            and int(unit.get("section", 0)) in {1, 4, 6, 7, 8, 9, 11, 12}
        )
        or (unit["kind"] == "day" and bool(unit.get("requires_web_search")))
    )
    orchestrator = build_orchestrator(
        specialists,
        unit.get("specialists", []),
        model,
        provider,
        enable_web_search=enable_web,
    )
    prompt = (
        specific
        + "\n\nUse only supplied evidence for repo/current-state claims. "
        "Do not claim external side effects occurred unless evidence says so.\n\n"
        "OUTPUT BUDGET: Return valid complete JSON. Keep every artifact document "
        "at or below 10,000 characters, avoid decorative repeated characters, "
        "and keep the full response below 60,000 characters. Prefer concise "
        "tables and bullets while preserving all required evidence.\n\n"
        + json.dumps(context, indent=2)
    )
    result = await Runner.run(orchestrator, prompt, max_turns=14)
    output = result.final_output
    if not isinstance(output, RunOutput):
        output = RunOutput.model_validate(output)
    return output, qa


async def execute_unit(unit: dict) -> dict:
    run_id = uuid4().hex[:16]
    if unit["kind"] == "foundation_qa":
        output = deterministic_foundation_qa(unit)
        qa = run_qa(render=True)
    else:
        output, qa = await execute_model_unit(unit, run_id)

    written = write_artifact_documents(output.artifact_documents)
    required_ok, missing = required_outputs_exist(unit)
    if missing:
        output.blockers.append("Missing required runtime outputs: " + ", ".join(missing))
        output.pass_condition_met = False
        if output.run_status == "PASS":
            output.run_status = "PARTIAL"

    render_result = render_creative_jobs(output, unit, run_id)
    if render_result.get("violations"):
        output.blockers.extend(render_result["violations"])
        output.pass_condition_met = False
        output.run_status = "BLOCKED"

    now = datetime.now(TZ)
    persist_metrics(output, now, run_id)
    persist_experiments(output)
    blocking = persist_approvals(output, unit, now, run_id)
    write_report(output, unit, qa, run_id)
    update_state_after_unit(output, unit, qa, run_id, blocking, required_ok, render_result)

    return {
        "run_id": run_id,
        "unit": unit["id"],
        "status": output.run_status,
        "pass_condition_met": output.pass_condition_met,
        "qa_passed": qa["passed"],
        "artifact_documents_written": written,
        "rendered_count": len(render_result.get("rendered", [])),
        "blocking_approvals": len(blocking),
        "blockers": len(output.blockers),
    }


def daily_cadence_already_satisfied(state: dict) -> bool:
    if state.get("mode") not in {"THIRTY_DAY", "CONTINUOUS_GROWTH"}:
        return False
    today = datetime.now(TZ).date().isoformat()
    return state.get("last_completed_local_date") == today


async def run_autopilot() -> None:
    model_provider.validate_provider_credentials()

    summaries = []
    state = load_runtime_json("state.json")
    if state["status"] == "AWAITING_APPROVAL" and state.get("blocking_approval_ids"):
        raise SystemExit("Blocking approval is pending. Resolve it before the next run.")

    if state["mode"] == "PHASE0":
        # Bootstrap runs every remaining Phase 0 unit in sequence. It stops immediately
        # on PARTIAL/BLOCKED/AWAITING_APPROVAL so Day 1 can never leapfrog a bad foundation.
        for _ in range(13):
            state = load_runtime_json("state.json")
            if state["mode"] != "PHASE0":
                break
            if state["status"] == "AWAITING_APPROVAL" and state.get("blocking_approval_ids"):
                break
            unit = active_unit(state)
            summary = await execute_unit(unit)
            summaries.append(summary)
            state = load_runtime_json("state.json")
            if state["status"] in {"BLOCKED", "PARTIAL", "AWAITING_APPROVAL"}:
                break
    else:
        state = load_runtime_json("state.json")
        if daily_cadence_already_satisfied(state):
            summaries.append({
                "autopilot": "no-op",
                "reason": "One successful GTM unit has already completed on this Los Angeles calendar date.",
                "mode": state["mode"],
                "current_day": state.get("current_day"),
            })
        else:
            summaries.append(await execute_unit(active_unit(state)))

    print(json.dumps({"autopilot": "completed", "runs": summaries}, indent=2))


def build_epub_from_runtime() -> None:
    manuscript = RUNTIME_ROOT / "ebook" / "ebook-manuscript.json"
    if not manuscript.exists():
        raise SystemExit(
            "No private runtime ebook/ebook-manuscript.json exists. "
            "EBOOK_PRODUCTION must first receive the full authoritative source securely."
        )
    builder = CONFIG_ROOT / "ebook" / "build_epub.py"
    output = RUNTIME_ROOT / "ebook" / "The_Finders_Book_Reading_Edition.epub"
    subprocess.run(
        ["python", str(builder), "--input", str(manuscript), "--output", str(output)],
        check=True,
        cwd=REPO_ROOT,
    )
    print(json.dumps({"ebook_build": "complete", "output": str(output)}, indent=2))


def main() -> None:
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
        resolve_approval(args.approval_id, args.mode, args.note, args.actor)
        print(f"{args.mode.upper()}: {args.approval_id}")
        return

    if args.mode == "status":
        state = load_runtime_json("state.json")
        print(json.dumps({
            "mode": state.get("mode"),
            "foundation_cursor": state.get("foundation_cursor"),
            "completed_foundation_sections": state.get("completed_foundation_sections", []),
            "foundation_qa_passed": state.get("foundation_qa_passed"),
            "current_day": state.get("current_day"),
            "status": state.get("status"),
            "last_run_id": state.get("last_run_id"),
            "last_run_status": state.get("last_run_status"),
            "blocking_approval_count": len(state.get("blocking_approval_ids", [])),
        }, indent=2))
        return

    if args.mode == "ebook-build":
        build_epub_from_runtime()
        return

    asyncio.run(run_autopilot())


if __name__ == "__main__":
    main()
