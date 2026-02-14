# Reusable Prompt For Coding Agents

Use this when delegating work to Codex, Claude, or Copilot.

```md
You are helping build Companion, a personal AI companion PWA.

The app sends push notifications to the user's iPhone, tracks their schedule
(lectures, assignments, deadlines), supports journaling, and adapts to their
context (stress, energy, mode). It is encouraging, not nagging.

Context:
- Frontend: React + Vite PWA (`apps/web`)
- Backend: Node + TypeScript (`apps/server`)
- Contracts: `docs/contracts.md`
- Project brief: `docs/project-brief.md` — READ THIS FIRST
- Agent profiles: `.github/agents/*.agent.md`

Your task:
- Ticket: <ID + title>
- Allowed paths: <explicit path list>
- Out-of-scope paths: <explicit path list>
- Acceptance criteria: <bullet list>

Rules:
1. Read `docs/project-brief.md` before starting any work.
2. Do not touch files outside allowed paths.
3. Keep changes small and composable.
4. If API contracts change, update `docs/contracts.md` in the same PR.
5. Do NOT add features outside the project brief scope.
6. Provide verification steps and risks in your final message.
```
