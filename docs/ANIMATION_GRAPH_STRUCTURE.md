# Animation Graph Structure

This document describes the typed composition2d animation graph. It is the source graph used by the low-code animation editor and compiler.

## Scope

- This structure applies to `CompositionClip.animationGraph` for composition2d animation graphs.
- Background graphs and composition3d graphs keep their existing graph formats and behavior.
- Legacy composition2d graph storage is not supported. Nodes must be typed graph objects.

## Storage Shape

An animation graph stores typed nodes and directed edges.

```ts
type TypedAnimationGraphState = {
  nodes: Record<string, TypedAnimationGraphNode>;
  edges: AnimationGraphEdge[];
  viewport?: GraphViewport;
  viewports?: Record<string, GraphViewport>;
};
```

Each node owns its graph position, socket contracts, and config.

```ts
type TypedAnimationGraphNodeBase<Kind extends string, Config> = {
  id: string;
  kind: Kind;
  label: string;
  position: { x: number; y: number };
  inputs: Record<string, TypedAnimationGraphSocket>;
  outputs: Record<string, TypedAnimationGraphSocket>;
  config: Config;
};
```

Edges connect specific node sockets.

```ts
type AnimationGraphEdge = {
  id: string;
  fromNodeId: string;
  fromPort: "top" | "right" | "bottom" | "left";
  toNodeId: string;
  toPort: "top" | "right" | "bottom" | "left";
  fromSocket?: string;
  toSocket?: string;
};
```

`fromPort` and `toPort` are visual connector positions. `fromSocket` and `toSocket` are semantic typed sockets.

## Value Types

Sockets use explicit graph value types.

```ts
type AnimationGraphValueType =
  | "Structure.Shape"
  | "Structure.TextObject"
  | "Structure.RichTextObject"
  | "Structure.Object"
  | "Value.String"
  | "Value.Number"
  | "Value.Color"
  | "Value.Boolean"
  | "Value.StringArray"
  | "Value.NumberArray"
  | "Effect.CSSEffect"
  | "AnimationController"
  | "CompiledAnimation";
```

Meaning:

- `Structure.Shape`: drawable shape/line-like objects, such as rects, SVG, circles, polygons.
- `Structure.TextObject`: text object with style, bounds, and raw text/rich text content.
- `Structure.RichTextObject`: split/tokenized text units that can be controlled individually.
- `Structure.Object`: generic renderable/HTML-like object.
- `Value.*`: primitive values and primitive arrays.
- `Effect.CSSEffect`: current animation effect output, backed by CSS/motion keyframes.
- `AnimationController`: computed timing/scheduling controller passed through graph execution.
- `CompiledAnimation`: final graph compiler output from `Out`.

## Sockets

Sockets are object contracts, not arbitrary strings.

```ts
type TypedAnimationGraphSocket = {
  id: string;
  label: string;
  type: AnimationGraphValueType;
  accepts?: readonly AnimationGraphValueType[];
};
```

Compatibility rule:

- Output socket connects to input socket when `output.type === input.type`.
- Output socket also connects when `input.accepts` includes `output.type`.
- Otherwise connection is invalid and editor shows toast.

Core helpers:

- `src/core/animationGraph/nodeRegistry.ts`: node definitions and typed node factory.
- `src/core/animationGraph/compatibility.ts`: typed socket compatibility.
- `src/core/animationGraph/compiler.ts`: graph compiler.

## Node Kinds

The composition2d typed graph supports these node kinds:

```ts
type TypedAnimationGraphNode =
  | AnimationGraphSourceNode
  | AnimationGraphTimeNode
  | AnimationGraphSplitNode
  | AnimationGraphConditionNode
  | AnimationGraphAnimationNode
  | AnimationGraphGroupNode
  | AnimationGraphOutNode;
```

## Source Node

Source nodes represent frame objects/layers.

```ts
type AnimationGraphSourceNode = {
  kind: "source";
  config: { objectId: string };
  outputs: {
    structure: TypedAnimationGraphSocket;
  };
};
```

Editor specializes source output by frame object type:

- `text` -> `Structure.TextObject`
- `rect` and `svg` -> `Structure.Shape`
- other object types -> `Structure.Object`

## Time Node

Time nodes create and pass animation timing. `AnimationController` is computed during compilation from `config`; it is not saved as a runtime value.

Inputs:

- `structure`: accepts `Structure.Shape`, `Structure.TextObject`, `Structure.RichTextObject`, `Structure.Object`
- `controller`: `AnimationController`

Outputs:

- `structure`: `Structure.Object`
- `controller`: `AnimationController`

Config:

```ts
type TimeConfig = {
  delay?: string;
  duration?: string;
  ease?: string;
  repeat?: string;
  repeatType?: string;
  schedule?: "relative" | "absolute";
};
```

Compiler interpretation:

- `delay` and `duration` become animation timing.
- `ease`, `repeat`, and `repeatType` become playback settings.
- `schedule: "absolute"` prevents upstream relative stacking.
- Missing schedule behaves as `relative`.

## Split Node

Split nodes split text or values into individually controlled units.

Inputs:

- `source`: accepts `Structure.TextObject`, `Value.String`, `Value.Number`, `Value.StringArray`, `Value.NumberArray`
- `controller`: `AnimationController`

Outputs:

- `items`: `Structure.RichTextObject`
- `controller`: `AnimationController`

Config:

```ts
type SplitConfig = {
  mode?: "word" | "character";
  stagger?: string;
  order?: "forward" | "reverse" | "center";
  repeatScope?: "sequence" | "item";
};
```

Current compiler support:

- `word` and `character` split modes for text objects.
- `stagger`, `order`, and `repeatScope` map into `LayerAnimation.options.split`.
- Value splitting is represented in socket contracts, but compile behavior is currently text-focused.

## Condition Node

Condition nodes filter or modify text/token flows and controllers.

Inputs:

- `source`: accepts `Structure.TextObject`, `Structure.RichTextObject`, `Value.String`, `Value.Number`
- `controller`: `AnimationController`

Outputs:

- `matched`: `Structure.RichTextObject`
- `output:1` through `output:4`: `AnimationController`

Config is currently rule-based string metadata:

```ts
type ConditionConfig = Record<string, string>;
```

Supported rule keys:

- `conditionCount`: number of rules, clamped to 1-4.
- `matchType`, `matchType2`, etc.
- `value`, `value2`, etc.
- `action`, `action2`, etc.
- `delay`, `delay2`, etc.

Current compiler support:

- `matchType: "textEquals"`
- `action: "setDelay"`
- Applies absolute per-token delay overrides to split animation options.

## Animation Node

Animation nodes materialize visual keyframes/effects.

Inputs:

- `structure`: accepts `Structure.Shape`, `Structure.TextObject`, `Structure.RichTextObject`, `Structure.Object`
- `controller`: `AnimationController`
- `effect`: `Effect.CSSEffect`

Outputs:

- `effect`: `Effect.CSSEffect`

Config:

```ts
type AnimationConfig = Record<string, string> & {
  property?: string;
};
```

Compiler behavior:

- `property` selects animation definition from `src/core/animations/registry.ts`.
- Config values are parsed as keyframe/control values.
- Output becomes `LayerAnimation.keyframes` and `LayerAnimation.options` after controller resolution.

## Group Node

Group nodes are typed graph nodes for grouped graph behavior.

Inputs:

- `controller`: `AnimationController`

Outputs:

- `effect`: `Effect.CSSEffect`

Config:

```ts
type GroupConfig = {
  groupId: string;
};
```

Current limitation:

- Typed group compile is not fully rebuilt yet.
- Existing skipped tests cover legacy group expansion internals.
- Treat group support as in-progress until typed group compiler coverage is added.

## Out Node

Out is the compiler boundary.

Inputs:

- `structure`: accepts `Structure.Shape`, `Structure.TextObject`, `Structure.RichTextObject`, `Structure.Object`
- `effect`: `Effect.CSSEffect`
- `controller`: `AnimationController`

Outputs:

- `compiled`: `CompiledAnimation`

Compiler behavior:

- Only nodes reachable upstream of `Out` participate in output.
- Animation nodes not connected to `Out` do not emit layer animations.
- Final output becomes `LayerAnimation[]` applied to frame objects.

## AnimationController

`AnimationController` is a graph value type, not persisted runtime state. It is computed in `src/core/animationGraph/compiler.ts` from `time`, `split`, and `condition` nodes.

Current computed output maps to `LayerAnimation.options`:

```ts
type LayerAnimationOptions = {
  delay?: number;
  duration: number;
  ease?: MotionEase | readonly [number, number, number, number];
  type?: "tween" | "spring" | "inertia";
  repeat?: number;
  repeatType?: "loop" | "reverse" | "mirror";
  split?: {
    mode: "word" | "character";
    stagger?: number;
    order?: "forward" | "reverse" | "center";
    repeatScope?: "sequence" | "item";
    tokenDelays?: Record<number, number>;
  };
};
```

Conceptual fields:

- Timing: delay, duration, relative/absolute schedule.
- Playback: ease, tween/spring/inertia, repeat behavior.
- Sequencing: split mode, stagger, order, repeat scope.
- Conditions: token delay overrides from condition nodes.

## Connection Validation

Composition2d validation uses typed sockets first.

```ts
canConnectTypedAnimationGraphNodes(fromNode, toNode, fromSocketId, toSocketId);
```

If typed sockets are incompatible:

- Editor rejects connection.
- Drag/drop to real incompatible target shows `toast.error("Incompatible animation graph connection.")`.

Background and composition3d graphs continue through existing validation paths.

## Compiler Flow

Compile entry:

```ts
compileTypedAnimationGraphForObject(object, graph): LayerAnimation[]
```

Flow:

1. Filter graph nodes to typed nodes relevant to current object.
2. Find `out` node.
3. Walk reverse edges to collect nodes connected upstream of `Out`.
4. For each connected `animation` node, find related `time` node.
5. Materialize keyframes from animation definition/config.
6. Compute controller options from time/split/condition path.
7. Emit `LayerAnimation` for object.

## Example

```ts
const graph: TypedAnimationGraphState = {
  nodes: {
    "layer:title": createTypedAnimationGraphNode(
      "layer:title",
      "source",
      { x: 2, y: 2 },
      { objectId: "title" },
      "Title",
    ),
    "time:1": createTypedAnimationGraphNode(
      "time:1",
      "time",
      { x: 10, y: 2 },
      { delay: "0s", duration: "1s", ease: "linear" },
    ),
    "animation:opacity": createTypedAnimationGraphNode(
      "animation:opacity",
      "animation",
      { x: 18, y: 2 },
      { property: "opacity", from: "0", to: "1" },
      "Opacity",
    ),
    "composition2d:out": createTypedAnimationGraphNode(
      "composition2d:out",
      "out",
      { x: 26, y: 2 },
      {},
      "Out",
    ),
  },
  edges: [
    {
      id: "source-time",
      fromNodeId: "layer:title",
      fromPort: "right",
      fromSocket: "structure",
      toNodeId: "time:1",
      toPort: "left",
      toSocket: "structure",
    },
    {
      id: "time-animation",
      fromNodeId: "time:1",
      fromPort: "right",
      fromSocket: "controller",
      toNodeId: "animation:opacity",
      toPort: "left",
      toSocket: "controller",
    },
    {
      id: "animation-out",
      fromNodeId: "animation:opacity",
      fromPort: "right",
      fromSocket: "effect",
      toNodeId: "composition2d:out",
      toPort: "left",
      toSocket: "effect",
    },
  ],
};
```

## Current Limitations

- Typed group compile is incomplete.
- Value splitting has socket contracts but text split is the compiler path currently covered.
- Condition compile currently covers text equality and set-delay token behavior first.
- `AnimationController` is represented by `LayerAnimation.options`; no standalone runtime controller class exists yet.

## Maintenance Rules

- Add node socket changes in `src/core/animationGraph/nodeRegistry.ts` first.
- Add value types in `src/core/types.ts` before using them in nodes.
- Keep socket ids stable; edges persist `fromSocket` and `toSocket` ids.
- Do not hardcode composition2d compatibility in React panels. Use typed compatibility helpers.
- Keep compiler behavior in `src/core/animationGraph/compiler.ts`, not UI components.
