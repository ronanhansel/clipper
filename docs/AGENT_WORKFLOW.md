# Agent Workflow v0.1

Clipper v0.1 exposes editor context as structured data so Codex-style agents can reason about project hierarchy, timeline order, frame geometry, selected objects, and screenshot selections.

## Context Contract

Use `createAgentContext` in `src/core/agentContext.ts` to generate the current payload.

The payload includes:

- Project id, name, fixed resolution, and assets path under the ignored `clipper/` application root.
- Scene id, name, total duration, and linear timeline entries.
- Current part id, file path, duration, declared frame objects, zoom markers, and snapshot lines.
- Optional screenshot selection metadata with four-point coordinates and intersecting objects.

## Editing Rules

- Do not add visual DOM artifacts that are not represented as `FrameObject` records.
- Treat `clipper/` as the runtime application root. Generated projects and user assets live under `clipper/projects/` and are ignored by git.
- Keep part durations between `0` and `10` seconds.
- Keep scene timelines linear; parts are queued by manifest order and must not overlap.
- Use empty parts when the timeline needs a quiet pause instead of introducing a separate gap model.
- Preserve shared object ids across adjacent parts when a hero pan is intended.
- Treat Motion code in `FrameObject.motion` as editable TypeScript animation intent.

## Future Codex Adapter

T3 Code reference notes suggest introducing a provider-neutral adapter before building UI-specific chat state. The eventual adapter should support:

- Starting or resuming a session for the active project.
- Sending turns with `createAgentContext` payloads and selected file paths.
- Streaming normalized events into a read model.
- Interrupting a turn.
- Handling approvals and user-input requests.

## Reference Notes

- Recordly: use a preview/export math split, timeline rows, zoom regions with lead-in/lead-out, and WebCodecs/FFmpeg fallback ideas later.
- Penpot: keep rendered objects separate from overlay controls, use transient drag state, and derive inspectors from selection type.
- T3 Code: normalize provider events and keep raw payloads available for debugging.
