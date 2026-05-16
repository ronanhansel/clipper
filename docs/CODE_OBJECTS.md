# Code Objects

## What this is

A compose-only object kind (`type: "code"`) that renders an arbitrary React component bundled from a project bin entry. The component runs on the player clock (no internal animation drivers), is mounted inside an isolated `contain: strict` wrapper with a per-instance error boundary, and is hot-recompiled when its source bin entry (or any of its relative imports) changes.

## Authoring a code component

### File shape

- The bin entry must be `.tsx`, `.ts`, `.jsx`, or `.js`. Extension precedence for relative-import resolution is the same: `tsx -> ts -> jsx -> js`.
- The slash-separated bin path (e.g. `paper/main.tsx`) is what the inspector's `Source` field stores in `object.props.source`.
- Both `internal-file` (manifest-stored source) and `external-proxy` (file on disk referenced by the bin) entries are supported.
- Export a default function with the signature `({ time, props, size }) => ReactNode`.
- Relative imports (`./`, `../`) work — multi-file components compile fine. They resolve against the bin tree, not disk. Absolute or bare module imports of anything other than `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime` will fail to resolve.

### The arguments

- `time: number` — scene time in seconds, sourced from the player clock through `usePlayheadTime` on the host side. Your component is called every frame with the current time. NEVER call `Date.now()`, `performance.now()`, or `requestAnimationFrame` — your component must be a pure function of `(time, props, size)`. Otherwise scrubbing and export are non-deterministic.
- `props: Record<string, unknown>` — user-supplied props from the inspector's `Props` JSON editor. The `source` key is stripped before the component sees them. They are NOT typed — runtime-cast at your own risk. (Schema-driven props is on the limitations list below.)
- `size: { width: number; height: number }` — the object's bounds in canvas pixels. Use this rather than `100%` width/height when you need numeric dimensions for layout math.

### Example: minimal

```tsx
export default function Pulse({ time, size }) {
  const radius = 40 + Math.sin(time * 2) * 20;
  return (
    <svg width={size.width} height={size.height}>
      <circle
        cx={size.width / 2}
        cy={size.height / 2}
        r={radius}
        fill="tomato"
      />
    </svg>
  );
}
```

### Example: with props

```tsx
export default function Label({ time, props, size }) {
  const text = typeof props.label === "string" ? props.label : "label";
  const color = typeof props.color === "string" ? props.color : "#dfe2ea";
  const opacity = 0.5 + 0.5 * Math.sin(time);
  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        opacity,
        fontFamily: "system-ui, sans-serif",
        fontSize: Math.min(size.height / 4, 64),
      }}
    >
      {text}
    </div>
  );
}
```

Inspector `Props` JSON for the above:

```json
{
  "label": "hello",
  "color": "#88ddff"
}
```

### Example: multi-file

`paper/main.tsx` (entry — what the inspector points at):

```tsx
import { Particle } from "./Particle";

export default function Scene({ time, size }) {
  const count = 24;
  return (
    <svg width={size.width} height={size.height}>
      {Array.from({ length: count }, (_, i) => (
        <Particle
          key={i}
          time={time}
          index={i}
          total={count}
          width={size.width}
          height={size.height}
        />
      ))}
    </svg>
  );
}
```

`paper/Particle.tsx` (sibling, imported relatively, looked up in the bin):

```tsx
export function Particle({ time, index, total, width, height }) {
  const phase = (index / total) * Math.PI * 2;
  const cx = width / 2 + Math.cos(time + phase) * (width / 3);
  const cy = height / 2 + Math.sin(time + phase) * (height / 3);
  return <circle cx={cx} cy={cy} r={4} fill="white" />;
}
```

- Both files are watched. Editing either fires a recompile and the preview rerenders without a manual reload. Internal-file mutations land via the project store; external-proxy edits land via the chokidar watcher.

## Available React surface

The bundler externalises React via a host bridge (see Architecture below), so user code shares a single React instance with the editor. The following are available:

- React 18 hooks: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, `useReducer`, `useContext`, `useSyncExternalStore`, `useId`, `useLayoutEffect`, `useTransition`, `useDeferredValue`, `useImperativeHandle`, `useInsertionEffect`, `useDebugValue`.
- React component primitives: `Fragment`, `Component`, `PureComponent`, `StrictMode`, `Suspense`, `createContext`, `createElement`, `createRef`, `forwardRef`, `isValidElement`, `lazy`, `memo`, `cloneElement`, `Children`, `startTransition`.
- `react-dom`: `createPortal`, `flushSync`, plus the React 18 resource hints (`preconnect`, `prefetchDNS`, `preinit`, `preload`, etc.).
- JSX (automatic runtime, both prod and dev variants).

Anything else (third-party packages, Node APIs, Electron APIs, host code) is NOT available. Practically: write self-contained code components. Multi-file is fine; bringing in `lodash` is not, unless the source happens to live somewhere your relative imports can reach.

## What NOT to do

- No timers (`setTimeout`, `setInterval`). They aren't on the player clock and won't drive deterministic frames.
- No animation drivers (`requestAnimationFrame`, `framer-motion` runtime, GSAP, anime.js). Render against `time` only.
- No `Date.now()`, `performance.now()`. `Math.random()` is fine only if seeded from `time` (otherwise the export will differ from what you saw scrubbing).
- No DOM mutation outside your returned subtree. Your component renders inside a `contain: strict` wrapper; reaching outside it via `document.querySelector` etc. is unsupported and will likely break in export or when the editor remounts the frame.
- No imports of host modules (`../../app/...`, anything outside the asset tree). Only relative imports rooted within your asset tree, plus the externalised React/ReactDOM/jsx-runtime, are bundled.
- No long-running effects. `useEffect` runs per render; on a 60 fps scrub that fires often.

## How errors are contained

- Render-time throws are caught by `CodeObjectErrorBoundary` (class component in `src/components/preview/CodeObjectFrame.tsx`). It writes the error to `setCodeObjectError(objectId, ...)`, renders a placeholder reading "Code error", and lets every other object keep rendering. When the underlying component changes (new bundle), the boundary clears its state.
- Compile errors are returned by `bundleCodeAsset` as `{ ok: false, message, location? }`. The runtime stores them under a synthetic key derived from the source path (`__code-source:<path>`) so the inspector's `Errors` block can render them next to the object that referenced the source.
- Both render and compile errors flow through the same map. `getCodeObjectError(id)` reads it; `subscribeCodeObjectErrors(listener)` notifies on change. The inspector subscribes via `useSyncExternalStore`.

## Hot reload

- The runtime tracks every relative import that resolved during a successful bundle in a `sourceMultiPathRegistry` keyed by entry source path.
- `retainCodeSource(sourcePath)` / `releaseCodeSource(sourcePath)` ref-count mounted code objects. Each change triggers `refreshWatchList`, which collapses the union of every retained entry path and dependency path into a single `setWatchedSources([...])` call.
- The host bridge maps watched source paths to disk paths for `external-proxy` entries and forwards them to `window.clipper.watchTextFiles`. Disk file change events from `window.clipper.onTextFileChanged` are mapped back to source paths by walking the bin tree, then surfaced to the runtime as a source-change event.
- For `internal-file` entries, the host bridge snapshots the manifest source whenever the project store updates and emits a source-change event when the source string changes for any watched path.
- Successful recompiles produce a content-hashed bundle. If the hash already exists in the LRU cache (cap 32), the previously evaluated component is reused. Otherwise the runtime imports the new bundle as a Blob URL ESM module.
- Re-render is driven by `subscribeCodeObjectComponents` / `getCodeObjectComponentTick`. `CodeObjectFrame` reads the tick via `useSyncExternalStore`, which causes its `useMemo(() => loadCodeComponent(...), [sourcePath, componentTick])` to re-run and pick up the freshly cached component.

## Architecture

```
                                                         globalThis.__clipperCodeBundlerHost
                                                         (react, react-dom, jsx-runtime,
                                                          jsx-dev-runtime)
                                                                    │
                                                                    ▼
   bin entry (slash path) ─► host.readEntrySource ─► bundleCodeAsset ─► clipper-react-shim
                                  │             (esbuild-wasm)    re-exports React
                                  │                  │            from the bridge
                                  │                  ▼
                                  │             SHA-256 hash
                                  │                  │
                                  │                  ▼
                                  │           LRU cache (cap 32)
                                  │                  │
                                  │                  ▼
                                  │           Blob URL + dynamic import()
                                  │                  │
                                  │                  ▼
                                  │           CodeComponent
                                  │                  │
                                  ▼                  ▼
                       chokidar watcher  ─► CodeObjectFrame (host)
                       (external-proxy)            │
                       project store sub          ▼
                       (internal-file)    CodeObjectErrorBoundary
                                                    │
                                                    ▼
                                            user React subtree
```

Time is published by `playbackTimeStore` and consumed via `usePlayheadTime(true)` in `CodeObjectFrame`, then passed as `time` to the bundled component each render. Source paths are looked up in the bin via `resolveBinItemByPath`; relative imports are resolved against the importer's bin directory and the same extension precedence (`tsx -> ts -> jsx -> js`).

### Public runtime API

`src/render-engine/codeObjectRuntime.ts` is the contract. Exports:

- `loadCodeComponent(sourcePath: string | null): CodeComponent | null` — synchronous entry. Returns the cached component if loaded, an error placeholder if the last bundle failed, or a "compiling" placeholder otherwise. Kicks off an async bundle if none is in flight. Returns the "unset" placeholder for `null`.
- `retainCodeSource(sourcePath: string): void` — mounted `CodeObjectFrame`s call this in a mount effect. Increments a refcount, ensures a bundle has started, and refreshes the watch list.
- `releaseCodeSource(sourcePath: string): void` — paired with `retainCodeSource`. When the count hits zero the source state is cleared and the watch list trimmed.
- `getCodeObjectError(objectId: string): CodeObjectError | null` — read the latest error for a given object id (or synthetic compile-error key).
- `setCodeObjectError(objectId: string, error: CodeObjectError): void` — internal; called by the error boundary and bundler error paths.
- `clearCodeObjectError(objectId: string): void` — called by the inspector "Clear" button and on boundary recovery.
- `subscribeCodeObjectErrors(listener: () => void): () => void` — for `useSyncExternalStore` in the inspector.
- `subscribeCodeObjectComponents(listener: () => void): () => void` / `getCodeObjectComponentTick(): number` — for `useSyncExternalStore` in `CodeObjectFrame`. Tick increments after every successful or failed bundle resolution.
- `configureCodeObjectRuntime(host: CodeObjectRuntimeHost): () => void` — called once by the host bridge to install the entry reader, import resolver, watch-list setter, and source-change subscriber. Returns an unsubscribe.
- `getCodeSourceBundlerErrorKey(sourcePath: string): string` — produces the `__code-source:<path>` synthetic key. Use it when an inspector needs to read the bundler error specifically (most code uses `object.id` and works for both render and compile errors via the same map).

Types:

- `CodeComponent = (args: CodeComponentArgs) => ReactNode`
- `CodeComponentArgs = { time: number; props: Record<string, unknown>; size: { width: number; height: number } }`
- `CodeObjectError = { message: string; stack?: string; location?: { file: string; line: number; column: number } }`
- `CodeObjectRuntimeHost = { readEntrySource, readImportSource, setWatchedSources, subscribeSourceChanges }`

### Object schema

- `FrameObjectType` (in `src/core/types.ts`) includes `"code"`.
- `object.props.source: string | null` — slash-separated bin path of the entry (e.g. `paper/main.tsx`). Resolves through `resolveBinItemByPath` against `project.bin`. Nothing else lives at the top level of the object; the bundler integration stays inside `props`.
- `object.props.*` — everything else is forwarded to the component as `props` (with `source` filtered out by `sanitizeCodeComponentProps` in `CodeObjectFrame.tsx`). These keys are also keyframable through the existing dynamic `props.*` property registry.
- Bounds and `style` are inherited from base `FrameObject`. Default factory in `useFrameObjectCommands.createComposeObject("code")`: `{ x: 200, y: 120, width: 480, height: 320 }`, `style: { backgroundColor: "transparent", overflow: "hidden" }`, `props: { source: null }`.

### Inspector sections

- Registered in `src/components/inspector/inspectorRegistry.ts` as `code: { sections: [BoundsSection, CodeSection] }`. No fill, stroke, shadow, or compose-style sections.
- `CodeSection` (in `src/components/inspector/sections/CodeSection.tsx`) has three subsections: `Source` (a text input bound to the bin path string, plus a drop target listening for `application/x-clipper-bin-path` so dragging an `internal-file` or `external-proxy` row from the bin onto it writes the path), `Props` (textarea editing the JSON minus `source`; commit on blur, parse errors flip `aria-invalid` and refuse to write), and `Errors` (subscribes to the runtime errors map via `useSyncExternalStore`, shows message plus optional stack toggle plus a Clear button).
- Inline validation under the Source input flags paths that don't resolve to an `internal-file` or `external-proxy` whose name ends in `.tsx`/`.ts`/`.jsx`/`.js`. The value is still written; the warning is informational so users can fix typos in place.
- All writes go through `useObjectInspector().onChange(updater)`. The section never reads per-tick values.

### Bundler externals

- `globalThis.__clipperCodeBundlerHost` (key from `codeBundlerHostGlobalKey` in `codeBundlerExternals.ts`) holds populated React/ReactDOM/jsx-runtime modules. Populated lazily by `ensureCodeBundlerHostBridge()`, which is awaited at the top of every `bundleCodeAsset` call.
- The bundler plugin registers a virtual namespace, `clipper-react-shim`. On `onResolve`, any import matching `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, or `react/jsx-dev-runtime` is rewritten to a virtual file in that namespace. On `onLoad`, the shim source is generated by `buildReactShimSource` and friends; each shim reads the bridge from `globalThis`, throws if missing, and re-exports the named bindings the user imports.
- This keeps a single React in the tree (hooks need module identity) and avoids bundling React into every code object.

## Extending the feature

### Add a new prop type to the inspector

Today, `Props` is JSON only. To add typed prop UI, extend `CodeSection` with a schema-driven editor. The intended shape: discover the schema from a named export on the entry module (e.g. `export const propsSchema = ...`). Wire schema-typed entries through the dynamic property registry so animation tracks understand them. Not built — when adding it, also decide how the schema flows from a freshly bundled module back to the inspector (the runtime currently exposes only the default export).

### Add a new built-in import

Externals live in `src/render-engine/codeBundlerExternals.ts`. To add (for example) `react-dom/server`:

1. Add the import key to `externalShimMap` in `codeBundler.ts`, mapping to a virtual entry path.
2. Add a builder function (e.g. `buildReactDomServerShimSource`) and an entry in `getReactShimSource`.
3. Add the named exports list and the `bridgeKey` to `codeBundlerExternals.ts`.
4. Import the module inside `ensureCodeBundlerHostBridge()` and store it on the bridge under that `bridgeKey`.

Don't externalise anything that isn't already a dependency of the host; adding a new top-level dependency is a separate decision.

### Add new error display

Errors are stored at `getCodeObjectError(objectId)`. Both render and compile errors land here; the synthetic compile-error key is `__code-source:<sourcePath>`, available via `getCodeSourceBundlerErrorKey(sourcePath)`. To surface line/column info in the inspector, read `error.location` from the `CodeObjectError` returned for the bundler key — it's already populated by `extractEsbuildLocation` on compile failure.

## Known limitations / not yet built

- No schema-driven props UI. Inspector edits raw JSON.
- The inspector renders only `error.message` (and optional `error.stack`); `error.location.line/column/file` is stored on the error record but not displayed.
- No "Open in editor" action from the error block.
- No iframe / worker sandbox. The in-process `CodeObjectErrorBoundary` is the only isolation. Long-running synchronous work in your component will stall the editor.
- No external package imports. Only React/ReactDOM/jsx-runtime are externalised; everything else must be reachable via relative imports rooted in the bin.
- No source-map mapping back to original lines in the inspector. The bundle includes an inline source map, so devtools can step through the compiled module, but the inspector doesn't surface it.
- Stale-bundle protection is best-effort: a `pendingHash` is recorded per source path, but if two bundles for the same path finish out of order both write to the cache. The latest source state reflects the freshest synchronous run, so the next render picks up the right component, but evicted entries can flap.

## Manual test recipe

1. `npm run dev`. Open or create a project, open the bin.
2. Add a file `paper/main.tsx` (folder + internal-file) exporting `({ props, size }) => <div style={{ width: size.width, height: size.height, background: "tomato" }}>{props.label}</div>`.
3. In Compose mode, click the toolbar `Code` button. A code object spawns at the default bounds.
4. Open the right inspector. Drag the `paper/main.tsx` row from the bin onto the `Source` input — the path appears. Or type `paper/main.tsx` directly. The placeholder is replaced with the tomato block within roughly a second.
5. Set `Props` to `{ "label": "hi" }`, blur the textarea. The label appears.
6. Edit `paper/main.tsx`: change `tomato` to `mediumseagreen`. The preview updates without re-clicking the inspector — internal-file edits arrive through the project store, external-proxy edits arrive through the watcher.
7. Add `import Inner from "./inner";` and create `paper/inner.tsx` with its own default export. Toggle `Source` to another file then back, then edit `paper/inner.tsx` — the recompile fires for the entry source because the multi-path registry knows the dependency.
8. Introduce a syntax error (`const x = ;`). The inspector `Errors` block shows the message; the frame falls back to "Code error"; the rest of the project keeps rendering.
9. Fix the syntax error. Recovery is automatic; the `Errors` block shows "No errors" again.
10. Scrub the timeline. The `time` arg threads through every frame — confirm by mapping `time` to a color or transform inside the user component.

## Reference files

- Runtime: `src/render-engine/codeObjectRuntime.ts`
- Bundler: `src/render-engine/codeBundler.ts`, `src/render-engine/codeBundlerExternals.ts`, `src/render-engine/codeBundlerCache.ts`
- Bridge: `src/render-engine/codeObjectRuntimeHostBridge.ts`
- Render: `src/components/preview/CodeObjectFrame.tsx`
- Inspector: `src/components/inspector/sections/CodeSection.tsx`, `src/components/inspector/inspectorRegistry.ts`
- Toolbar: `src/app/shell/ComposeToolbar.tsx`
- Schema: `src/core/types.ts` (`FrameObjectType`)
- Tests: `src/render-engine/codeObjectRuntime.test.ts`, `src/render-engine/codeBundler.test.ts`, `src/components/preview/CodeObjectFrame.test.ts`
- Memos: `agent-log/v0.2.18/memory/108-code-object-phase-1.md`, `agent-log/v0.2.18/memory/109-code-object-phase-2-3.md`, `agent-log/v0.2.18/memory/110-code-object-phase-4-bundler.md`
