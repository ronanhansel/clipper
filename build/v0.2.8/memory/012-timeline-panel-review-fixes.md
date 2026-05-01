# Timeline Panel Review Fixes

Implemented focused timeline review fixes in `src/components/timeline`.

- `TimelinePanel` is now a hook-free dispatcher. Direct-mode behavior moved into sibling `DirectTimelinePanel`; Compose still routes to `ComposeAnimationTimelinePanel`.
- Direct timeline drag auto-scroll now passes `saveTimelineDisplacement` through `onScrollPersist`, matching Compose persistence behavior.
- Shared row resize logic lives in `src/components/timeline/useTimelineRowResize.ts`. It owns the 42..140 clamp, pointer capture, pointerup/pointercancel cleanup, preview state, and final commit. Direct uses `onCanResizeRow` to preserve locked-row blocking and `onDragActiveChange` for global timeline drag state; Compose uses the same lifecycle.
- Compose timing drags now set state-backed `timelineDragActive`, so `TimelineShell` receives drag-active styling during timing operations.
- `TimelineShell` accepts `emptyContent` so the empty Compose timeline reuses the shared shell/header instead of duplicating mode header markup.
- Row resize now tracks its active transaction so pointerup commits, while pointercancel/unmount cancels and clears listeners, pointer capture, preview heights, and drag-active state without writing project state.
- Timeline scrubbing unmount cleanup cancels pending rAF/timeout work, clears pending refs, releases active pointer capture, resets `scrubbingRef`, and clears Shift snap UI without committing a final scrub.
- Timeline block preview keys/types live in `src/components/timeline/timelineBlockPreview.ts` for reuse by direct and motion-lane rendering.
- Timeline layer rename uses the themed `Input` primitive, and timeline zoom uses the small reusable `TimelineSlider` wrapper instead of an inline raw range input in `TimelineShell`.

Future agents should reuse `useTimelineRowResize` for any additional timeline row-height interactions instead of adding panel-local pointer handlers.
