## Pan Middle Transition

- Work started to add a pan-only middle snap option that controls how snapped adjacent pan markers hand off.
- Goal: preserve existing instant middle snap by default, with an optional transition mode where the incoming pan marker starts from the previous marker position and eases into its own position inside the new block.
- Added optional `middleTransition: "transition"` on `TranslationMarker`; absent keeps the existing instant handoff.
- The pan inspector now shows `Middle handoff` controls (`Instant` / `Transition`) whenever a middle snap is active. The setting is applied to the incoming marker(s) of the active middle snap pair(s).
- Playback detects snapped adjacent pan markers and, in transition mode, starts the incoming marker from the previous marker's position before easing into its target pan.
- Verified with `npm run typecheck` and `npm test`.
- Added editable pan marker easing via `ease?: MotionEase`; the inspector exposes Ease in-out, Linear, Ease in, Ease out, Ease in-out, and Circ out.
- Pan easing applies to normal in/out ramps and pan middle transition handoffs. Missing `ease` preserves the previous default ease-in-out behavior.

## Zoom Middle Transition

- Mirrored the middle handoff model for zoom markers with optional `middleTransition: "transition"`; absent keeps the existing instant handoff.
- The zoom inspector now shows the same `Middle handoff` controls whenever a middle snap is active.
- Zoom transition mode starts the incoming zoom block from the previous marker's focus and scale, then eases into the incoming marker's focus and scale.
- Re-verified pan and zoom handoffs with `npm run typecheck` and `npm test`.
- Added editable zoom marker easing via `ease?: MotionEase`; the zoom inspector exposes an `Ease` dropdown directly below `Scale` with named ease presets only: Ease in, Ease out, Ease in-out, and Circ out.
- Zoom easing applies to normal zoom ramps and zoom middle transition handoffs. Missing `ease` preserves the previous default ease-in-out behavior.
- Removed the old zoom preset cards (`Gentle Center`, `Hero Push`, `Left Detail`, `Close Detail`) because scale, focus, duration, and easing are now directly editable controls.
- Added separate `middleEase?: MotionEase` settings for zoom and pan middle handoffs. Both inspectors show a `Middle ease` dropdown when middle snap is active, and playback uses it only for the incoming middle transition ramp.
