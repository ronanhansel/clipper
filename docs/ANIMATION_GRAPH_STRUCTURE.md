# Animation Graph Structure

This document describes current strict composition2d animation graph architecture and the current implementation path for Vox-style 2D graph animation.

## Scope

- Applies to `CompositionClip.animationGraph` for composition2d only.
- Legacy composition2d socket/state formats are not accepted on active strict runtime/editor paths.
- Removed legacy non-2D graph paths are not part of the target architecture. New 2D animation graph work should land in the strict typed DAG and compiler path described here.
- Graph output is used by preview and export. Graph-generated objects are transient render objects and must not be persisted back into editable composition source.

## Current Capability

The graph API is customizable enough for data-driven 2D motion-graphics building blocks: source object animation, generated text, generated geometry, tokenized text animation, parameterized effects, reusable macros, time/value-driven parameters, and deterministic preview/export compilation.

It is not yet a complete Vox-style editorial animation toolkit by itself. Current strong areas are procedural layout, text callouts/highlights, charts made from generated geometry, split-text motion, and reusable effect chains. Gaps to fill for richer Vox-like work are higher-level chart/data nodes, line/area/bar chart presets, map/annotation primitives, more text reveal presets, shape morphing, camera/scene choreography helpers, and bundled macro presets.

Use the graph as the core runtime and extension surface; add missing editorial behaviours as strict node definitions, effect packages, geometry nodes, or macros instead of hardcoding graph ids in React, preview, export, or timeline code.

## Persisted Graph

Composition2d saves one deterministic typed DAG:

```ts
type AnimationGraph = {
  id: string;
  sourceObjectId: string;
  nodes: Record<GraphNodeId, AnimationGraphNode>;
  edges: AnimationGraphEdge[];
  macros?: Record<string, AnimationGraphMacro>;
  viewport?: AnimationGraphViewport;
};
```

Nodes persist stable ids, kind, position, and config only. Ordinary generated port lists are not saved; node definitions and current config derive ports. User-authored dynamic structure, such as condition outputs and macro interfaces, lives in node or macro config.

Edges persist typed endpoints:

```ts
type AnimationGraphEdge = {
  id: string;
  from: { nodeId: GraphNodeId; portId: GraphPortId };
  to: { nodeId: GraphNodeId; portId: GraphPortId };
};
```

## Ports

Ports are first-class typed contracts from node definitions:

```ts
type GraphPortDefinition = {
  id: GraphPortId;
  label: string;
  direction: "input" | "output";
  cardinality: "single" | "multi";
  type: GraphPortType;
  role?:
    | "main"
    | "parameter"
    | "condition-default"
    | "condition-output"
    | "macro-input"
    | "macro-output";
};
```

Connection validation uses `src/core/animationGraph/portCompatibility.ts` and strict graph validation. Visual editor drag/drop must reject incompatible typed ports instead of relying on loose socket names.

Effect parameter ports are generated from `EffectPackage.graph.paramControls` and `paramPorts`. Field-specific ports remain exact binding targets, while the editor may expose type-bus ports such as `input:number` to keep the canvas compact. Type-bus edges can still bind to exact fields through `input.alias` expressions from `src/core/graphParameterBindings.ts`.

## Built-In Node Surface

Node definitions are registered in `src/core/animationGraph/registry.ts`.

- Core control: `source`, `time`, `split`, `condition`, `macro`, `out`.
- Virtual source: `virtual:text`, which creates graph-owned text render objects.
- Geometry: rectangle, circle, ellipse, polygon, line, path, star, grid, dot grid, highlight box, transforms, point/path operations, instance-on-points, collect, merge, and group.
- Values: string, number, color, boolean, vector, arrays, time seconds, frame, oscillator, math, compare, combine/split vector/color, arrays, random, noise.
- Effects: every effect package with `graph` metadata is exposed as `effect:<packageId>`.

Graph structure streams currently cover `text`, `richText`, `shape`, `object`, and `geometry`. Value streams cover scalar and array forms for string, number, color, boolean, and vector.

## Compiler Program

`planAnimationGraphProgram` turns saved graph data into deterministic `AnimationGraphProgram` operations. Program order is topological from `Out` dependencies. Unreachable branches are not materialized. Cycles and invalid typed endpoints emit diagnostics.

`compileAnimationGraph` executes planned operations over streams:

- `Source` emits one animation stream for `sourceObjectId`.
- `Time` updates downstream controller state.
- `Split` tokenizes supported structures.
- `Condition` partitions streams by explicit dynamic output ports plus default/rest.
- Value nodes emit typed value streams for effect params and scripts.
- Geometry nodes create or transform generated geometry streams.
- Virtual source nodes create graph-owned render objects.
- Effect package nodes append `EffectInstruction` snapshots.
- `Out` aggregates connected animation streams.

`compileAnimationGraph` returns streams, materialized `LayerAnimation[]`, generated geometry, generated render objects, diagnostics, and optional execution traces. Non-time-driven effect runtime output is collapsed to static keyframes; `time` marks controllers as time-driven so runtime adapters keep animated keyframes.

## Runtime Adapter Parity

Preview/export parity comes from one shared path:

- `compileAnimationGraphForObject` calls `compileAnimationGraph` for matching source objects.
- `compileAnimationGraph` materializes `LayerAnimation[]` through package graph runtime adapters from `getGraphEffectRuntimeAdapter`.
- `applyAnimationGraphToComposition` appends compiled graph animations and generated graph objects to the composition used by preview/export.

No preview/export code should infer graph topology or re-run effect conversion outside compiler/package runtime adapters.

## Adding Graph Capability

Prefer one of these extension points:

- Add a strict node in `src/core/animationGraph/builtins/*/definition.ts` or a new registered definition. Implement `getPorts`, `createDefaultConfig`, `normalizeConfig`, and `execute`.
- Add graph support to an effect package by setting `graph.acceptedStructureKinds`, `graph.paramControls`, optional `graph.defaultParams`, optional `graph.paramPorts`, and `graph.runtimeAdapter`.
- Add procedural visuals through geometry streams when the output is shape/data driven.
- Add graph-owned text through `virtual:text` or a new virtual source when the object should be created by graph output instead of persisted as a composition object.
- Add reusable editorial behaviours as macros when no new runtime primitive is needed.

For Vox-like 2D work, recommended graph patterns:

- Use `virtual:text` plus `geometry:highlightBox` for labels, callouts, and text highlights.
- Use geometry primitives plus `geometry:collect`/`merge`/`group` for charts and lower thirds.
- Use `value:time:seconds`, `value:time:oscillator`, math, random, or noise to drive effect parameters.
- Use `split` + `condition` + `time` for word/character reveals and staggered callouts.
- Use effect nodes for pan, zoom, rotate, opacity, and blur only when their packages expose graph runtime adapters.
- Use `out.config.renderOrder` when multiple graph branches must render in a specific order.

## Implementation Rules

- Keep graph persistence strict: save ids, node kinds, positions, configs, edges, macros, and viewport only.
- Do not add legacy socket/state paths.
- Do not hardcode package ids or node ids in React panels, timeline code, preview/export routing, or docs examples that pretend to be runtime wiring.
- Register capability in manifests/definitions/registries, then let editor, compiler, preview, and export discover it.
- Keep preview/export parity through compiler output. If a behaviour cannot compile through `compileAnimationGraph`, it is not a graph runtime feature yet.
- Emit diagnostics for unsupported stream kinds, missing runtime adapters, disconnected required inputs, duplicate/single-input conflicts, cycles, and branches that do not reach `Out`.

## Serialization Gate

Phase 18 tests assert JSON save/load preserves:

- Graph id and source object id.
- Node ids, kinds, positions, and configs.
- Condition dynamic port ids and rules.
- Edge ids and typed endpoints.
- Macro interfaces, defaults, inner nodes, and inner edges.
- Viewport.
- Planned program, diagnostics, streams, and materialized animations.
- Preview/export composition animations from the same compiled program output before and after serialization.
