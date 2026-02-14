# Agent Backlog

Use this backlog to coordinate work between GitHub Copilot and Codex-style agents.

## Workflow
1. Create an issue from **Copilot Agent Task** template.
2. Assign the issue to an agent.
3. Agent creates a branch: `agent/<issue-number>-<slug>`.
4. Agent pushes changes → **PR automatically created** with `agent-task` label.
5. Automation handles rebase, approval, and merge (if `agent-automerge` label present).

## Suggested initial tasks

### 1) Bootstrap repository docs
- **Agent:** github-copilot
- **Issue title:** `[Agent Task] Add README and contribution workflow`
- **Deliverable:** baseline README + contribution process
- **Verification:** markdown lint or manual review

### 2) Add CI scaffold
- **Agent:** codex
- **Issue title:** `[Agent Task] Add minimal CI checks`
- **Deliverable:** CI workflow running lint/tests
- **Verification:** workflow succeeds on PR

### 3) Establish coding standards
- **Agent:** pair (copilot + codex)
- **Issue title:** `[Agent Task] Add coding standards + PR checklist`
- **Deliverable:** style guide + PR template
- **Verification:** checklist present in PR body

## Assignment board

| Issue | Agent | Status | Notes |
|---|---|---|---|
| (create) #1 Docs bootstrap | github-copilot | ready | Start here |
| (create) #2 CI scaffold | codex | blocked | Wait for stack decision |
| (create) #3 Standards/checklist | pair | ready | Can run in parallel with #1 |
