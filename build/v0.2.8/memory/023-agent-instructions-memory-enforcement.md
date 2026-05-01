## Agent Instructions — Structure & Discovery Enforcement

**Restructured AGENTS.md** into two independently tunable sections:
- **Part 1: Agent Behaviour** — how the agent operates (discovery workflow, external memory)
- **Part 2: Project Instructions** — how Clipper code should be written (version planning, UI, architecture)

This separation allows each part to be tuned independently without the other interfering.

---

### Path of Discovery (new section, Part 1)

A standalone agent-behaviour section enforcing an evidence-first workflow:

- **Evidence first, execution second** — start every task by gathering context with batched tool calls, not one-at-a-time conservative searching.
- **Full scope before code** — find every instance of the user's mentioned feature/function/pattern before modifying anything.
- **Ambiguity handling** — when a reference is ambiguous (duplicate definitions, two matching modules):
  - **Stop and ask the user.** Never guess.
  - Only reason/choose if the user explicitly instructs bypass. When reasoning, consider all available information and select the best reference.
- **Simple tweaks** — for short prompts, locate quickly, edit efficiently, and move on. No overthinking or over-engineering.

### Architecture note

The Path of Discovery is meant to be tuned individually without affecting other agent instructions. It addresses common failure modes with open-source models that search tool-by-tool conservatively instead of batching, costing extra tokens and time.
