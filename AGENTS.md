# WABOX — Agent Instructions

## Project

WABOX application repository. Cursor engineering config is vendored from [cursor-config-coding](https://github.com/Vinayak-RZ/cursor-config-coding) in `.cursor/`.

## Workflow

Follow the orchestration in cursor-config-coding `AGENTS.md`:

1. **Research → plan → approve** before non-trivial work (`planning.mdc`, `learn-and-research.mdc`).
2. **Implement** in phases with minimal scope (`execution.mdc`, `core-engineering.mdc`).
3. **Validate** before marking done (`quality-gates.mdc`).
4. **Commit** with conventional commits after milestones (`git-commit-discipline.mdc`).

## Architecture skills

| Domain | Skill |
|--------|-------|
| Frontend / UI | `frontend-architecture` |
| Backend / API | `backend-architecture` |
| AI agents / LLM | `agentic-system-design` |
| Trade-offs | `system-design-tradeoffs` |

## Project docs (add as needed)

| File | Purpose |
|------|---------|
| `README.md` | Project overview and setup |
| `PROGRESS.md` | Current status and blockers |

## Updating Cursor config

To refresh from upstream:

```powershell
robocopy "D:\Startups\Cursor\cursor-config-coding\.cursor" "D:\Tech\WABOX\.cursor" /E /MIR
```

Or use junction locally (not for git):

```powershell
D:\Startups\Cursor\cursor-config-coding\scripts\link-to-project.ps1 -Target "D:\Tech\WABOX"
```
