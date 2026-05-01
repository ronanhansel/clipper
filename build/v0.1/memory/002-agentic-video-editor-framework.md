# 002 Agentic Video Editor Framework

## Context

- User started version `v0.1` with a full product vision for an agentic video editor framework.
- The product creates fixed-resolution `1920x1080` videos from TypeScript/web/Motion-authored parts.
- It uses a Project > Scene > Part hierarchy with a linear timeline, object-declared frame contents, screenshot selector metadata, zoom markers, and agent-assisted workflows.
- Referenced repositories for future adaptation:
  - Recordly: video encoder, timeline management, edit interface, zoom mechanics.
  - T3 Code: agentic loader, chat, file parsing, Codex communication.
  - Penpot: interactive web editing patterns.

## Initial Decisions

- This is a major v0.1 update, so `build/v0.1/PLAN.md` is the canonical implementation plan.
- Since the repo only contained project docs/license, the implementation can be a clean scaffold rather than a refactor.
- Start with Electron + Vite + TypeScript, desktop-only.
- Keep the frame fixed at `1920x1080` and clipped.
- Treat every frame visual as a declared `FrameObject` with `id`, `type`, `selector`, `bounds`, optional style/content, and Motion-like animation code.
- Keep interactive editing intentionally small for v0.1: selection, bounding boxes, inspector edits, screenshot selection, snapshots, and zoom markers.

## Work Log

- Created v0.1 plan from the user vision.
- Cloned Recordly, T3 Code, and Penpot into `.temp/referenced/` for local reference.
- Scaffolded Electron + Vite + React + TypeScript.
- Added fixed-frame project model types, linear timeline helpers, validation, selection geometry, and agent context generation.
- Added a sample project under `projects/prj_v01_sample/` with manifest and part files.
- Built the first editor shell with project browser, Code/Interactive toggle, fixed `1920x1080` frame viewport, object selection, inspector edits, snapshots, agent context preview, and two-row timeline.
- Added zoom marker basics with a dedicated zoom row and smooth preview transform.
- Added `docs/AGENT_WORKFLOW.md` for Codex-style context and editing rules.
- Added scoped Vitest tests for linear timeline validation and screenshot selection payloads.
- Added an Electron preload IPC bridge for Code mode to read and save actual files under `clipper/projects/`.
- Updated runtime application-root handling so generated/user project files live under the ignored `clipper/` directory, e.g. `clipper/projects/[project_id]/[scene_id]/[part_id].ts`.
- Fixed `electron:dev` so it compiles Electron TypeScript before launching from a clean checkout.
- Fixed timeline part switching to clear stale selection context and improved zoom focus centering/easing.
- Redesigned the editor toward a professional Screen Studio / DaVinci Resolve-inspired layout: macOS-like top toolbar, left media/tools rail, centered fixed-frame viewer, right inspector, transport controls, and a full-width bottom timeline.
- Moved parts out of the left sidebar and into the bottom horizontal main timeline, with adjacent clip blocks and a separate zoom marker lane.
- Added direct object dragging in the fixed frame. Moving an object updates its declared bounding box, keeping the "everything in frame is an object" rule intact.

## Verification

- `npm run typecheck` passes.
- `npm test` passes after restricting Vitest to local `src/**/*.test.*` files so cloned reference repos are not executed.
- `npm run build` passes and emits renderer output plus Electron main/preload files.

## Reference Research Highlights

- Recordly: revisit `modernVideoExporter.ts`, `TimelineEditor.tsx`, `TimelineWrapper.tsx`, `zoomRegionUtils.ts`, and `zoomTransform.ts` for encoding, timeline rows, and mature zoom mechanics.
- T3 Code: revisit `ProviderAdapter.ts`, `CodexSessionRuntime.ts`, `CodexAdapter.ts`, and `ChatComposer.tsx` for future Codex integration.
- Penpot: revisit viewport selection/control files for overlay selection, transient transforms, area selection, and inspector routing.

## Open Follow-Ups

- Extract concrete implementation notes from referenced repos after cloning into `.temp/referenced/`.
- Add real renderer-to-video encoding after initial editor/model foundations are stable.
- Expand agent chat/Codex integration after context payloads and part files exist.
- Wire manifest-backed loading/saving into runtime state; current UI still uses `src/sampleProject.ts` as fixture data while Code mode can edit actual part files.
