# State

How Clipper layers state. Read this before adding a `useState`, a store field, or a selector.

## Three layers

| Layer      | Mechanism                                    | Holds                                | Update cadence         |
| ---------- | -------------------------------------------- | ------------------------------------ | ---------------------- |
| Per-tick   | `playbackTimeStore` + `useSyncExternalStore` | Scene time, scrub clock              | Every rAF              |
| Structural | `editorStore` (zustand) + `projectStore`     | Project, selection, mode, panels     | Per edit / mode change |
| UI-local   | `useState`                                   | Popover open, hover, transient input | Per interaction        |

Pick the lowest layer that fits. A per-tick value in the structural store fans out on every rAF; a structural value in `useState` on the root shell fans out to every subscriber on every change.

## Per-tick layer

```
playback rAF  ──►  publishMasterTimelineClock(snap)  ──►  playbackTimeStore
                                                              │
                                                  usePlayheadTime(enabled)
                                                              │
                                                          leaf component
```

- One publisher (`usePlaybackController`).
- Many subscribers, each at the leaf that needs the value.
- Bucketed at 30 Hz (`usePlayheadTime`) to throttle React commits while keeping animation smooth.
- Event handlers read via `readPlayheadTime(currentTime)`; they do not close over the rendered time.
- Imperative DOM writes (playhead chrome, time labels, scrubber) are owned by the rAF, not the React tree.

`currentSceneTime` exposed by `editorStore` is the structural value — only updated at preview-key boundaries (composition switch, transition crossing). That is what `AppContent` reads. The live tick value never leaves the per-tick layer.

## Structural layer

`editorStore` is the single source of structural truth: project document, selection ids, mode, panels, picks, dialogs. `projectStore` carries the active project document and saved snapshots.

### Field-granular merges

Partial-state setters must compare each key with `Object.is` and emit only changed fields. A "set everything" pattern (`set({ ...patch })`) replaces every field's reference, which kicks shallow-equality fanout for selectors that read unchanged fields.

```ts
function setState(patch: Partial<State>) {
  const current = store.getState();
  const changed: Partial<State> = {};
  for (const key of Object.keys(patch) as (keyof State)[]) {
    if (!Object.is(current[key], patch[key])) {
      changed[key] = patch[key];
    }
  }
  if (Object.keys(changed).length > 0) store.setState(changed);
}
```

### Selector strategy

One `useShallow` over many fields = N-way fanout. A consumer that reads 2 fields re-renders when any of the other N-2 change.

Split monolithic selectors into feature-scoped hooks:

- `usePlaybackEditorState` — playback flags + setters (10–15 fields).
- `useSelectionEditorState` — selection ids + clear actions.
- `useEditorTabsState` — tab list + actions.
- `useViewportEditorState` — preview scale, zoom bar, padding.
- `useShellEditorState` — mode, panels, dialogs.

Each field appears in exactly one hook. No duplication. Atomic leaves (`useIsPlaying`, etc.) for hot subscribers that only need one bit.

### Dead-field rule

A store field with only writers (no readers) still triggers shallow-equality fanout on every write. Delete it. If the consumer is a ref (e.g. `playbackClockRef`), keep the ref and drop the store field entirely.

### Selection clearing

Mode-state must clear on mode switch. `clearDirectSelection` and `clearComposeSelection` set every mode-specific selection field, including the cross-cutting ones (object id, marker id, drag state, marquee state, pick state). Missing one field leaks selection across modes.

## UI-local layer

Component-local `useState` for transient UI:

- Popover / menu open
- Hover, focus
- Transient input mid-edit (committed value lives in the store)
- Drag-in-progress preview offset

These never need to be shared. If two components read the same `useState`, lift it to the structural store.

## When to add to which layer

Use this checklist for any new state:

1. **Does it change every rAF?** → Per-tick layer (publish from one rAF, subscribe at leaves).
2. **Is it part of the saved project, or read by multiple panels?** → Structural store (one feature-scoped selector).
3. **Is it transient UI that one component owns?** → `useState`.

If two answers apply, pick the highest layer that fits all consumers — but watch fanout. A high-frequency value in the structural store demands an atomic selector at every consumer.

## Persistence (round-trip + verify)

Persisted settings (debug toggles, export config, FPS, etc.) live behind a single typed module:

```
src/app/state/storedAppSettings.ts
```

- `appSettingKeys` — typed key list.
- `readStoredAppSettings()` / `writeStoredAppSetting(key, value)` — the only IO surface.
- `clamp*` / `getInitial*` / `is*EnabledByDefault` — typed readers.

When a setting also writes to the host (Electron `writeAppState`), the persist function:

1. Writes via `clipperHost.writeAppState`.
2. Reads back to verify the value landed.
3. Returns `Promise<boolean>` — the caller awaits and surfaces failure in the UI.

Never `void` a persist promise. Silent failure means the user thinks they enabled something they didn't.

## Async actions

Hooks that own a persisted value expose:

- `value` — current state.
- `setValue(next)` — clears any prior error, calls the persist function, on failure sets a `persistError` state.
- `persistError` — `string | null` surfaced in the dialog.

The UI shows the error banner with priority over informational ("restart to apply") banners.

## Anti-patterns

- `useState` in the root shell for a value any other panel needs.
- A structural-store field that only fans out — no readers.
- One `useShallow` selector covering 100+ fields.
- Replacing the whole state object on every setter call.
- Selection state that survives a mode switch.
- `void persistFn()` — fire-and-forget for state the user can later check.
- Subscribing to per-tick values one or more levels above the consumer.

## Key files

- `src/app/features/playback/playbackTimeStore.ts` — per-tick channel.
- `src/app/features/playback/usePlayheadTime.ts` — bucketed live-time hook.
- `src/app/state/editorStore.tsx` — structural store + feature-scoped selectors.
- `src/app/state/projectStore.tsx` — project document + snapshots.
- `src/app/state/editorDerivedState.ts` — derived structural model.
- `src/app/state/storedAppSettings.ts` — typed persisted-settings IO.
