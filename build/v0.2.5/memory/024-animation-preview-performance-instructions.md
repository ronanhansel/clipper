# Animation Preview Performance Instructions

## Context
- Future render, camera, motion, effect, and animation previews should not become laggy from repeated global state updates.
- The zoom-scale slider proved the best default: local UI readouts plus rAF-throttled imperative preview writes, with canonical state committed only at finalization.

## Instruction Update
- Added explicit guidance to `AGENTS.md` for live render/animation previews.
- Future agents should compute deterministic preview results from `src/core` helpers, update only the affected DOM/CSS property with rAF, and avoid project/editor-store/Zustand writes during pointer-driven or playback-like preview loops.
- Numeric labels and lightweight readouts should stay local to the owning control during movement.
- Canonical project/app/editor state should commit only on release, blur, cancel, pause, or another explicit finalization event.
- Condensed the `AGENTS.md` guidance after the initial instruction update so the rule is easier for future agents to scan and follow.

## Reuse
- For camera/effect sliders, reuse the pattern documented in `build/v0.2.5/memory/023-zoom-scale-slider-preview.md`.
- If one targeted DOM/CSS update is not enough, first try a narrow render cache or component-local rAF loop before adding global state updates.
