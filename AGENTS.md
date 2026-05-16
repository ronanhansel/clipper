# AGENTS.md

- Run `npm run typecheck` before committing (also formats).
- Don't run `git diff` unless asked.
- Don't fix errors not from your edits — they may be another agent's work.
- Read `docs/PERFORMANCE.md` before touching playback / inspector / scrub code.

## Memory

- Current version: `v0.2.18`.
- Document every change in `agent-log/v0.2.18/memory/[id]-feature-name.md` —
  update an existing file or create the next sequential ID.
- Write incrementally on long tasks, not just at the end.
- `PLAN.md` only on request; if it exists, keep it current.
