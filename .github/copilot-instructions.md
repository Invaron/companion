# Copilot Collaboration Protocol

This repository is managed through an **agent-orchestrated workflow** where GitHub Copilot, Claude, and Codex collaborate recursively.

## Objective
Keep work moving asynchronously by assigning small, verifiable tasks to agents and tracking outcomes in issues/PRs. The system is self-sustaining: agents complete features, update the roadmap, and the orchestrator creates new issues automatically.

## How agents should work in this repo
1. **Read `docs/project-brief.md` first** — understand the product, architecture, and roadmap.
2. Pick one issue or task at a time.
3. Restate acceptance criteria before coding.
4. Make minimal, focused changes.
5. Run relevant checks locally (`npx tsc --noEmit`, `npx vitest run`).
6. Push to an `agent/<issue-number>-<description>` branch.
   - A PR is **automatically created** with the `agent-task` label
   - The PR template is pre-populated
   - The linked issue receives an update comment
7. Automated workflows then handle:
   - Auto-rebase onto latest `main`
   - Auto-approval via `github-actions[bot]`
   - Auto-merge (if `agent-automerge` label is present)

## Recursive collaboration loop
The system operates in a continuous loop:
1. **Orchestrator** reads `docs/project-brief.md` roadmap → creates issues for `⬜ todo` items
2. **Agents** (Claude/Copilot/Codex) are assigned round-robin → create PRs
3. **Workflows** auto-rebase, approve, and merge PRs
4. **Agents update the roadmap** in their PR: change `⬜ todo` → `✅ done`
5. If an agent discovers new features needed, **add new `⬜ todo` rows** to the roadmap
6. When todos run low, the orchestrator creates an "idea generation" issue
7. Loop repeats on next cron cycle or push to main

**This means every agent PR should update `docs/project-brief.md`** to mark its feature done and optionally propose new work.

## Task decomposition rules
- Prefer tasks that can be completed in one PR.
- Each task must define:
  - Scope (in/out)
  - Deliverable
  - Verification command(s)
- If blocked, create a "blocked" update with proposed unblocking options.

## Codebase conventions
- **Server**: `apps/server/src/` — TypeScript, Node.js
- **Web**: `apps/web/src/` — React + Vite PWA, mobile-first
- **Agent profiles**: `.github/agents/*.agent.md` — read your profile before starting
- **API contracts**: `docs/contracts.md` — update if you change API shapes
- **Tests**: `npx vitest run` in `apps/server` — all tests must pass
- **Types**: `npx tsc --noEmit` — zero errors required
- **GitHub Pages**: Deploys automatically when `apps/web/` changes merge to main

## Agent handoff format
When handing work to another agent, include:
- Current branch
- Files changed
- Remaining TODOs
- Known risks
- Exact next command to run

## Definition of done
A task is done only when:
- Acceptance criteria are met.
- Checks pass (or failure is explained by environment constraints).
- `docs/project-brief.md` roadmap status is updated.
- `docs/contracts.md` is updated if API shapes changed.
- Documentation is updated for behavioral/process changes.
