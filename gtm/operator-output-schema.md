# Finder's Book GTM Operator Output Schema

Every human-facing Markdown artifact generated for a Phase 0 section, Foundation QA, a 30-day unit, or Continuous Growth unit must end with the six operator sections below. The runtime appends them deterministically from structured run output so the owner never has to infer what to do next.

## SYSTEM COMPLETED
What the Autopilot completed autonomously in this unit.

## YOU DO
Only concrete owner actions that remain. If none remain, say `None - no owner action required for this unit.`

## SYSTEM DOES NEXT
The next system-owned action. If a blocking approval or blocker exists, say that the system is paused and name what resumes after resolution.

## OWNER APPROVAL REQUIRED
List each YELLOW or RED approval request with class, title, action and reason. If none, say `None.`

## BLOCKERS
List unresolved blockers or missing evidence. If none, say `None.`

## EVIDENCE TO SAVE
List evidence supporting the unit result plus the run ID and repository-QA result.

## Authority and safety

- The six sections are an operator handoff, not permission to bypass approval gates.
- `YOU DO` must never ask the owner to disclose credentials or secrets in chat or commit them to the public repository.
- `SYSTEM DOES NEXT` must not claim an external side effect will occur unless that action is GREEN or separately approved.
- `OWNER APPROVAL REQUIRED` is authoritative only when paired with the persisted approval queue.
- Private runtime artifacts remain outside public `main` and are encrypted before persistence.
