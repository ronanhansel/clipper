# Required Timeline Layer Types

## Summary
- Timeline rows now render by default without requiring new timeline documents to serialize default `timelineLayers`.
- Existing partial timeline layer state is still normalized with missing category rows, while timelines with no layer state can remain unpopulated on disk.

## Architecture Notes
- `defaultTimelineLayerState` in `src/core/project.ts` remains the single source of truth for available timeline layer categories and their default rows.
- `withRequiredTimelineLayerTypes` derives required categories from array keys in that default state, so adding a future category should only require extending the default state and the relevant type/UI plumbing.
- Raw OS File Manager timeline creation in `src/components/OsFileManager.tsx` no longer writes default `timelineLayers`; render-time fallbacks provide the visible lanes.
- File Manager project timeline creation in `src/app/features/file-manager/timelineLibraryMutations.ts` also omits default `timelineLayers` for new timelines.
- Directory project loading repairs deprecated `.timeline.json` files on disk only when a `timelineLayers` object exists but is missing one or more required category arrays.
- `App.tsx` uses the same `withRequiredTimelineLayerTypes` helper for active timeline props, so the UI fallback path matches project normalization.
- `OsFileManager` now strips a leading `file-manager/` segment from selected timeline/composition IDs even when the visible root is already the `file-manager` directory. This prevents selecting `file-manager/timelines/...` while the project model stores `timelines/...`, which previously made opened timelines appear to have no layers.
- OS timeline selection now reloads the directory project first when the clicked timeline file is not present in `project.timelines`, then selects it. This keeps externally created or newly created raw `.timeline.json` files synced into app state before the timeline panel renders.
- Active timeline resolution now tolerates exact IDs, file paths, stripped `file-manager/` paths, and display names. `App.tsx` passes the resolved timeline ID into derived scene state and timeline props so stale path variants cannot route the panel to `emptyTimelineLayerState`.
- `App.tsx` also self-heals persisted or late-selected `.timeline.json` IDs that are not yet loaded by reloading the directory project and replacing the selected ID with the resolved project timeline ID.
- Direct timeline rendering no longer trusts empty category arrays as intentional. `directTimelineModel` falls back to default rows for empty composition/adjustment/motion/transition arrays, and `App.tsx` passes required rows whenever Direct mode is active. This prevents the timeline from showing an undroppable zero-row panel while file/project sync catches up.
- Follow-up: no-timeline-open is intentionally empty again. `App.tsx` only applies `withRequiredTimelineLayerTypes` when a timeline is active (or compose mode is active), and `directTimelineModel` treats explicit empty arrays as empty so the app does not show layer rows before a timeline exists.
- Follow-up: a selected `.timeline.json` file now also gets render-time default rows even if project sync has not resolved it into `project.timelines` yet. This preserves the empty no-selection state while making newly created timeline files show lanes immediately after click.
- Transition timeline rows are included in `DirectTimelinePanel` layer category detection so their row controls work consistently with composition, adjustment, and motion rows.

## Verification
- Added project normalization tests for omitting default rows on new timelines and repairing existing partial layer state.
- Cleanup pass kept the zero-row Direct timeline fix, timeline ID resolver, OS file path normalization, raw timeline defaults, and load-time repair. Active timeline lookup is now centralized through `getSelectedTimelineDocument` in `App.tsx` instead of mixing exact-match and fallback matching.
- `rtk npm run typecheck` passed.
- `npm test -- --run src/core/project.test.ts` passed.
