from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from agents import Agent, Runner
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parents[2]
GTM_ROOT = REPO_ROOT / "gtm"
TZ = ZoneInfo("America/Los_Angeles")


class ApprovalRequest(BaseModel):
    title: str
    action: str
    approval_class: Literal["YELLOW", "RED"]
    reason: str
    max_spend_usd: float | None = None
    blocking: bool = True


class MetricUpdate(BaseModel):
    metric: str
    channel: str
    value: float | int | str | None
    source: str
    verified: bool


class ExperimentUpdate(BaseModel):
    experiment_id: str
    status: str
    finding: str
    next_step: str


class DailyRunOutput(BaseModel):
    run_status: Literal["PASS", "AWAITING_APPROVAL", "BLOCKED", "PARTIAL"]
    executive_summary: str
    work_completed: list[str] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    metric_updates: list[MetricUpdate] = Field(default_factory=list)
    experiment_updates: list[ExperimentUpdate] = Field(default_factory=list)
    approval_requests: list[ApprovalRequest] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    pass_condition_met: bool
    next_action: str
    founder_brief: str


def load_json(name: str) -> dict:
    return json.loads((GTM_ROOT / name).read_text())


def save_json(name: str, data: dict) -> None:
    (GTM_ROOT / name).write_text(json.dumps(data, indent=2) + "\n")


def owner_allowlist() -> set[str]:
    raw = os.getenv("GTM_OWNER_ALLOWLIST", "miketui")
    return {item.strip() for item in raw.split(",") if item.strip()}


def load_agent_prompts() -> dict[str, str]:
    text = (GTM_ROOT / "prompts" / "agents.md").read_text()
    matches = list(re.finditer(r"^## AGENT: ([A-Z_]+)\s*$", text, flags=re.M))
    prompts: dict[str, str] = {}
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        prompts[match.group(1)] = text[start:end].strip()
    return prompts


def run_qa() -> dict:
    commands = [["npm", "run", "validate"]]
    results = []
    for command in commands:
        proc = subprocess.run(command, cwd=REPO_ROOT, text=True, capture_output=True)
        tail = "\n".join((proc.stdout + "\n" + proc.stderr).splitlines()[-25:])
        results.append({"command": " ".join(command), "returncode": proc.returncode, "tail": tail})
    return {"passed": all(r["returncode"] == 0 for r in results), "results": results}


def active_day(plan: dict, state: dict) -> dict:
    if state["mode"] == "CONTINUOUS_GROWTH":
        weekday = datetime.now(TZ).strftime("%A").lower()
        return {
            "day": "continuous",
            "objective": plan["continuous_growth"]["cadence"][weekday],
            "specialists": ["ANALYTICS", "SEO", "CONTENT", "GROWTH", "COMMERCE", "PARTNERSHIPS", "RELEASE_QA"],
            "pass_condition": "A measurable weekly growth action is prepared or completed with evidence and safe approval handling.",
        }
    day = int(state["current_day"])
    return next(item for item in plan["days"] if item["day"] == day)


def build_agents(prompt_map: dict[str, str]) -> dict[str, Agent]:
    agents: dict[str, Agent] = {}
    descriptions = {
        "SEO": "Search intent, on-page SEO, schema, internal linking and evergreen organic growth.",
        "CONTENT": "Platform-native content packages and repurposing.",
        "GROWTH": "Paid acquisition, testing, budgets and optimization recommendations.",
        "COMMERCE": "Payhip, Lulu, KDP, Etsy, B&N, Ingram and marketplace architecture.",
        "ANALYTICS": "Funnel metrics, attribution, KPIs and experiment readouts.",
        "PARTNERSHIPS": "Creator, professional, B2B, library and bookstore outreach strategy.",
        "RELEASE_QA": "Repository safety, QA, release evidence and regression prevention.",
    }
    for name, instructions in prompt_map.items():
        agents[name] = Agent(
            name=f"Finder's Book {name}",
            handoff_description=descriptions[name],
            instructions=instructions,
            model="gpt-5.6",
        )
    return agents


def build_orchestrator(specialists: dict[str, Agent]) -> Agent:
    instructions = (GTM_ROOT / "prompts" / "orchestrator.md").read_text()
    tools = [
        agent.as_tool(
            tool_name=f"consult_{name.lower()}",
            tool_description=agent.handoff_description or f"Consult {name}",
        )
        for name, agent in specialists.items()
    ]
    return Agent(
        name="Finder's Book GTM Orchestrator",
        instructions=instructions,
        model="gpt-5.6",
        tools=tools,
        output_type=DailyRunOutput,
    )


def resolve_approval(approval_id: str, decision: str, note: str, actor: str) -> None:
    approvals = load_json("approvals.json")
    pending = approvals["pending"]
    item = next((x for x in pending if x["id"] == approval_id), None)
    if not item:
        raise SystemExit(f"Approval ID not found: {approval_id}")

    approval_class = item.get("approval_class")
    if approval_class == "RED":
        allowed = owner_allowlist()
        if not actor or actor not in allowed:
            raise SystemExit(
                f"RED approval decision denied for actor {actor or '<missing>'}. "
                f"Authorized owner allow-list: {', '.join(sorted(allowed)) or '<empty>'}."
            )

    pending.remove(item)
    item["decision"] = decision.upper()
    item["resolved_at"] = datetime.now(TZ).isoformat()
    item["note"] = note
    item["authorized_actor"] = actor or "unattributed"
    approvals["resolved"].append(item)
    save_json("approvals.json", approvals)

    state = load_json("state.json")
    remaining_blockers = [x for x in state["blocking_approval_ids"] if x != approval_id]
    state["blocking_approval_ids"] = remaining_blockers
    if remaining_blockers:
        state["status"] = "AWAITING_APPROVAL"
    elif state.get("last_run_status") == "AWAITING_APPROVAL":
        state["status"] = "READY"

    if decision == "reject":
        state.setdefault("notes", []).append(f"Approval {approval_id} rejected by {actor or 'unattributed'}: {note}")
        if not remaining_blockers and state.get("last_run_status") == "AWAITING_APPROVAL":
            state["status"] = "READY"

    save_json("state.json", state)


def persist_output(output: DailyRunOutput, day: dict, qa: dict, run_id: str) -> None:
    now = datetime.now(TZ)
    stamp = now.strftime("%Y-%m-%d")
    label = f"day-{int(day['day']):02d}" if isinstance(day["day"], int) else "continuous"
    reports = GTM_ROOT / "reports"
    reports.mkdir(exist_ok=True)

    payload = output.model_dump()
    payload["run_id"] = run_id
    payload["generated_at"] = now.isoformat()
    payload["active_day"] = day
    payload["qa"] = qa
    (reports / f"{stamp}-{label}-{run_id}.json").write_text(json.dumps(payload, indent=2) + "\n")

    brief = f"""# Finder's Book Founder Brief — {stamp}

**Run ID:** {run_id}  
**Mode:** {load_json('state.json')['mode']}  
**Active:** {label} — {day['objective']}  
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

    metrics = load_json("metrics.json")
    for update in output.metric_updates:
        channel = metrics["channels"].setdefault(update.channel, {})
        channel[update.metric] = {
            "value": update.value,
            "source": update.source,
            "verified": update.verified,
            "updated_at": now.isoformat(),
        }
    metrics["as_of"] = now.isoformat()
    save_json("metrics.json", metrics)

    experiments = load_json("experiments.json")
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
    save_json("experiments.json", experiments)

    approvals = load_json("approvals.json")
    state = load_json("state.json")
    new_blocking = []
    for idx, req in enumerate(output.approval_requests, start=1):
        approval_id = f"{stamp}-{label}-{run_id}-{idx:02d}"
        record_data = req.model_dump()
        # RED actions are never allowed to become non-blocking based on model output.
        record_data["blocking"] = True if req.approval_class == "RED" else req.blocking
        record = {
            "id": approval_id,
            "run_id": run_id,
            "created_at": now.isoformat(),
            "status": "PENDING",
            **record_data,
        }
        approvals["pending"].append(record)
        if record["blocking"]:
            new_blocking.append(approval_id)
    save_json("approvals.json", approvals)

    state["last_run_id"] = run_id
    state["last_run_at"] = now.isoformat()
    state["last_run_status"] = output.run_status
    state["blocking_approval_ids"] = new_blocking
    if output.run_status == "PASS" and output.pass_condition_met and qa["passed"] and not new_blocking:
        if state["mode"] == "THIRTY_DAY":
            day_num = int(state["current_day"])
            if day_num not in state["completed_days"]:
                state["completed_days"].append(day_num)
            if day_num >= 30:
                state["mode"] = "CONTINUOUS_GROWTH"
                state["status"] = "READY"
            else:
                state["current_day"] = day_num + 1
                state["status"] = "READY"
    elif new_blocking:
        state["status"] = "AWAITING_APPROVAL"
    elif not qa["passed"]:
        state["status"] = "BLOCKED"
        state.setdefault("notes", []).append("Repository validation failed on latest run.")
    else:
        state["status"] = output.run_status
    save_json("state.json", state)


async def run_daily() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required.")

    run_id = uuid4().hex[:16]
    plan = load_json("day-plan.json")
    state = load_json("state.json")
    if state["status"] == "AWAITING_APPROVAL" and state["blocking_approval_ids"]:
        raise SystemExit("Blocking approval is pending. Resolve it before the next run.")

    day = active_day(plan, state)
    qa = run_qa()
    context = {
        "run_id": run_id,
        "active_day": day,
        "state": state,
        "metrics": load_json("metrics.json"),
        "experiments": load_json("experiments.json"),
        "approvals": load_json("approvals.json"),
        "repository_qa": qa,
    }
    prompt_map = load_agent_prompts()
    specialists = build_agents(prompt_map)
    orchestrator = build_orchestrator(specialists)

    prompt = (
        "Execute the active GTM unit using only the supplied evidence. "
        "Consult the listed specialists when useful. Do not claim external actions occurred unless evidence says so.\n\n"
        + json.dumps(context, indent=2)
    )
    result = await Runner.run(orchestrator, prompt, max_turns=10)
    output = result.final_output
    if not isinstance(output, DailyRunOutput):
        output = DailyRunOutput.model_validate(output)
    persist_output(output, day, qa, run_id)

    # Safe CI-visible summary only. Detailed briefs, metrics and approval reasons
    # remain in encrypted runtime state rather than public GitHub Actions logs.
    print(json.dumps({
        "autopilot": "completed",
        "run_id": run_id,
        "active_day": day["day"],
        "run_status": output.run_status,
        "pass_condition_met": output.pass_condition_met,
        "approval_count": len(output.approval_requests),
        "blocker_count": len(output.blockers),
        "repository_qa_passed": qa["passed"],
    }, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["run", "approve", "reject", "status"], default="run")
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
        state = load_json("state.json")
        print(json.dumps({
            "mode": state.get("mode"),
            "current_day": state.get("current_day"),
            "status": state.get("status"),
            "last_run_id": state.get("last_run_id"),
            "last_run_status": state.get("last_run_status"),
            "blocking_approval_count": len(state.get("blocking_approval_ids", [])),
        }, indent=2))
        return
    asyncio.run(run_daily())


if __name__ == "__main__":
    main()
