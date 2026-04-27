# Frame Edit Performance

## Context

Frame object dragging was laggy because every pointer move rebuilt project scene/part/object arrays and called `updateProject`, which normalizes and compares project state before re-rendering broad app UI.

The successful fix was to keep high-frequency pointer movement outside project writes and broad React state updates. Future drag features should follow this pattern by default.

## Direction

- Keep live object dragging as transient preview state.
- Throttle pointer-move UI updates with `requestAnimationFrame`.
- Apply live drag previews imperatively through CSS variables on object DOM nodes to avoid React renders during pointer movement.
- Throttle marquee selection box updates with `requestAnimationFrame`.
- Marquee selection captures the pointer on drag start so move/up continues when dragging outside the frame.
- Marquee selection updates selected objects during the rAF drag loop, and edge-touching the selection border counts as selected.
- Focus/pan point picking uses a transient rAF-throttled overlay point and commits the marker once on pointer release.
- Color picker preview/draft updates are rAF-coalesced so pointer movement does not set React state on every event.
- Commit final object bounds to project state once on pointer up.
- Preserve current selection and multi-object drag behavior.

## Rule

For any new drag or pointer-move feature: use rAF plus transient/imperative preview during movement, avoid project writes and broad React state updates in the move loop, and commit durable state once on release.
