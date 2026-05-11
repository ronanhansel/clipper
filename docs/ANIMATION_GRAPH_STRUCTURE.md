# Animation Graph Structure

This document describes current strict composition2d animation graph architecture.

## Scope

- Applies to `CompositionClip.animationGraph` for composition2d only.
- Background and composition3d graphs keep their separate legacy formats.
- Legacy composition2d socket/state formats are not accepted on active strict runtime/editor paths.

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

## Compiler Program

`planAnimationGraphProgram` turns saved graph data into deterministic `AnimationGraphProgram` operations. Program order is topological from `Out` dependencies. Unreachable branches are not materialized. Cycles and invalid typed endpoints emit diagnostics.

`compileAnimationGraph` executes planned operations over streams:

- `Source` emits one animation stream for `sourceObjectId`.
- `Time` updates downstream controller state.
- `Split` tokenizes supported structures.
- `Condition` partitions streams by explicit dynamic output ports plus default/rest.
- Value nodes emit typed value streams for effect params and scripts.
- Effect package nodes append `EffectInstruction` snapshots.
- `Out` aggregates connected animation streams.

## Runtime Adapter Parity

Preview/export parity comes from one shared path:

- `compileAnimationGraphForObject` calls `compileAnimationGraph` for matching source objects.
- `compileAnimationGraph` materializes `LayerAnimation[]` through package graph runtime adapters from `getGraphEffectRuntimeAdapter`.
- `applyAnimationGraphToComposition` appends those compiled graph animations to composition objects used by preview/export.

No preview/export code should infer graph topology or re-run effect conversion outside compiler/package runtime adapters.

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
