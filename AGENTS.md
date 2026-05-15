# AGENTS.md

- Don't check git diff without user asking.
- Make sure to run `npm run typecheck` before committing, this will prettify your code too.

# Project Agent Rules

- Current version: `v0.2.18`.
- **This is mandatory. Do not skip this step.** Every code change must be documented in external memory.
- Always start project work by creating or identifying the relevant memory file at `agent-log/[version number]/memory/[id]-feature-name.md`.
- Example: `agent-log/v0.2.18/memory/001-init-editor.md`.
- After EVERY change — whether a new feature, update, rework, rewrite, refactor, bug fix, or any code modification — populate or update the relevant memory files so future agents can pick up the work.
- If a memory file for the feature/area already exists, update it with the latest changes and architecture decisions. If none exists, create a new file with the next sequential ID.
- **Long-running tasks**: write memory incrementally as you work, not only at the end. This prevents memory loss if the session is interrupted, and keeps external memory current for every step of the task.
- For quick edits or small bug fixes, still update or create the relevant memory file — do not skip this step under any circumstances.
- If you are unsure what memory file to update, look at existing files in `agent-log/[version number]/memory/` for context, or ask the user.
- After finishing any task, verify that the relevant memory files have been written or updated before marking the work as complete.
- Keep artifacts and `PLAN.md` under `agent-log/v0.2.18/`, same level as `memory/`.
- Create `PLAN.md` only when user asks, but always check and update its progress and todos when it exists.
- Do not edit or fix any errors that's not originating from your edits or that user does not report. That might be the progress of another agent.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
