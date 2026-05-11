export type FrameObjectType =
  | "rect"
  | "text"
  | "image"
  | "svg"
  | "html"
  | "template";

export type RenderContext = {
  time: number;
  duration: number;
};

export function renderContext(time: number, duration: number): RenderContext {
  return { time, duration };
}

export type Transform = {
  x?: number;
  y?: number;
  z?: number;
  rotate?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
};

export type Bounds = { x: number; y: number; width: number; height: number };
export type StyleValue = string | number;
export type LayerStyle = Record<string, StyleValue>;
export type CompositionRenderMode = "dom" | "webgl";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type AnimationGraph = {
  id: string;
  sourceObjectId: string;
  nodes: Record<
    string,
    {
      id: string;
      kind: string;
      position: { x: number; y: number };
      config: unknown;
    }
  >;
  edges: {
    id: string;
    from: { nodeId: string; portId: string };
    to: { nodeId: string; portId: string };
  }[];
  viewport?: { scrollLeft: number; scrollTop: number; zoom?: number };
};
export type RichTextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};
export type FrameTemplate = { kind: "html"; source: string; static?: boolean };
export type MotionEase =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "inAndOut"
  | "expoIn"
  | "expoOut"
  | "circOut"
  | "backOut";
export type LayerAnimation = {
  id: string;
  name?: string;
  target?: "self" | "children";
  keyframes: Record<string, readonly number[] | readonly string[] | undefined>;
  options: {
    duration: number;
    delay?: number;
    ease?: MotionEase | readonly [number, number, number, number];
    repeat?: number;
    repeatType?: "loop" | "reverse" | "mirror";
    repeatDelay?: number;
    type?: "tween" | "spring" | "inertia";
    bounce?: number;
    stiffness?: number;
    damping?: number;
    mass?: number;
    velocity?: number;
    split?: {
      mode: "word" | "character";
      stagger?: number;
      order?: "forward" | "reverse" | "center";
      repeatScope?: "sequence" | "item";
      tokenDelays?: Record<number, number>;
    };
  };
  enabled?: boolean;
};
export type Renderable =
  | RenderableObject
  | Component
  | Group
  | null
  | undefined
  | false
  | Renderable[];
export type RenderableProps = {
  id: string;
  name?: string;
  bounds: Bounds;
  content?: string;
  text?: string;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  style?: LayerStyle;
  transform?: Transform | string;
  layoutId?: string;
  hidden?: boolean;
  locked?: boolean;
  animations?: LayerAnimation[];
};
export type TextProps = Omit<RenderableProps, "content"> & {
  text?: string;
  content?: string;
};
export type ComponentProps = Pick<
  RenderableProps,
  "style" | "transform" | "animations" | "hidden" | "locked"
>;
export type GroupProps = ComponentProps & { children?: Renderable[] };
export type WebLayerProps = Omit<RenderableProps, "content"> & {
  css?: string;
  html: string;
};
export type ThreeLayerProps = Omit<RenderableProps, "content"> & {
  source: string;
};
export type CompositionProps = {
  id?: string;
  name?: string;
  duration: number;
  renderMode?: CompositionRenderMode;
  frame: { width: 1920; height: 1080; style?: LayerStyle };
  background?: {
    id?: string;
    name?: string;
    style?: LayerStyle;
    stretchToElements?: boolean;
    hidden?: boolean;
    locked?: boolean;
    animations?: LayerAnimation[];
    elements?: Renderable[];
  };
  animationGraph?: AnimationGraph | JsonValue;
  render: (context: RenderContext) => Renderable[];
};

export function transformToCss(
  transform: Transform | string | undefined,
): string | undefined {
  if (typeof transform === "string") return transform;
  if (!transform) return undefined;
  const parts: string[] = [];
  if (
    transform.x !== undefined ||
    transform.y !== undefined ||
    transform.z !== undefined
  ) {
    parts.push(
      `translate3d(${transform.x ?? 0}px, ${transform.y ?? 0}px, ${transform.z ?? 0}px)`,
    );
  }
  if (transform.rotate !== undefined) {
    parts.push(`rotate(${transform.rotate}deg)`);
  }
  if (transform.scale !== undefined) {
    parts.push(`scale(${transform.scale})`);
  }
  if (transform.scaleX !== undefined) {
    parts.push(`scaleX(${transform.scaleX})`);
  }
  if (transform.scaleY !== undefined) {
    parts.push(`scaleY(${transform.scaleY})`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function css(strings: TemplateStringsArray, ...values: unknown[]) {
  return String.raw({ raw: strings }, ...values).trim();
}

export function html(strings: TemplateStringsArray, ...values: unknown[]) {
  return String.raw({ raw: strings }, ...values).trim();
}

export class RenderableObject {
  id: string;
  name?: string;
  kind: FrameObjectType;
  bounds: Bounds;
  content?: string;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  style: LayerStyle;
  transform?: Transform | string;
  layoutId?: string;
  hidden?: boolean;
  locked?: boolean;
  animations?: LayerAnimation[];

  constructor(props: RenderableProps) {
    this.id = props.id;
    this.name = props.name;
    this.kind = "rect";
    this.bounds = props.bounds;
    this.content = props.text ?? props.content;
    this.template = props.template;
    this.richText = props.richText;
    this.style = props.style ?? {};
    this.transform = props.transform;
    this.layoutId = props.layoutId;
    this.hidden = props.hidden;
    this.locked = props.locked;
    this.animations = props.animations;
  }
}

export class Rect extends RenderableObject {
  constructor(props: RenderableProps) {
    super(props);
    this.kind = "rect";
  }
}

export class Text extends RenderableObject {
  constructor(props: TextProps) {
    super(props);
    this.kind = "text";
  }
}

export class Image extends RenderableObject {
  constructor(props: RenderableProps) {
    super(props);
    this.kind = "image";
  }
}

export class Svg extends RenderableObject {
  constructor(props: RenderableProps) {
    super(props);
    this.kind = "svg";
  }
}

export class Html extends RenderableObject {
  constructor(props: RenderableProps) {
    super(props);
    this.kind = "html";
  }
}

export class WebLayer extends Html {
  constructor(props: WebLayerProps) {
    super({
      ...props,
      content: `${props.css ? `<style>${props.css}</style>` : ""}${props.html}`,
    });
  }
}

export class ThreeLayer extends Html {
  constructor(props: ThreeLayerProps) {
    const escapedSource = JSON.stringify(props.source);
    const rootId = `clipper-three-${props.id}`;
    super({
      ...props,
      content: `<div id="${escapeHtmlAttribute(rootId)}" data-clipper-three-root style="width:100%;height:100%;"></div><script type="module">
const root = document.getElementById(${JSON.stringify(rootId)});
root.dataset.clipperThreePending = "true";
try {
  const THREE = await import("https://esm.sh/three@0.181.2");
  const createScene = (0, eval)("(" + ${escapedSource} + ")");
  if (typeof createScene !== "function") throw new Error("ThreeLayer source must evaluate to a function.");
  const cleanup = await createScene({ THREE, root, width: root.clientWidth, height: root.clientHeight });
  if (typeof cleanup === "function") root.__clipperThreeCleanup = cleanup;
  root.dataset.clipperThreeReady = "true";
} catch (error) {
  root.dataset.clipperThreeError = error instanceof Error ? error.message : String(error);
  root.innerHTML = '<pre style="margin:0;width:100%;height:100%;box-sizing:border-box;white-space:pre-wrap;background:#16090d;color:#ffb4b4;padding:16px;font:16px ui-monospace,monospace;">' + String(error instanceof Error ? error.message : error).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]) + '</pre>';
} finally {
  delete root.dataset.clipperThreePending;
}
</script>`,
    });
  }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export class Template extends RenderableObject {
  constructor(props: RenderableProps) {
    super(props);
    this.kind = "template";
  }
}

export class Component {
  style?: LayerStyle;
  transform?: Transform | string;
  animations?: LayerAnimation[];
  hidden?: boolean;
  locked?: boolean;

  constructor(props?: ComponentProps) {
    if (props) {
      this.style = props.style;
      this.transform = props.transform;
      this.animations = props.animations;
      this.hidden = props.hidden;
      this.locked = props.locked;
    }
  }

  render(_context: RenderContext): Renderable[] {
    return [];
  }
}

export class Group extends Component {
  children: Renderable[];

  constructor(props?: GroupProps) {
    super(props);
    this.children = props?.children ?? [];
  }

  render(_context: RenderContext): Renderable[] {
    return this.children;
  }
}

export class Composition {
  id?: string;
  name?: string;
  duration: number;
  renderMode?: CompositionProps["renderMode"];
  frame: CompositionProps["frame"];
  background?: CompositionProps["background"];
  animationGraph?: CompositionProps["animationGraph"];
  render: (context: RenderContext) => Renderable[];

  constructor(props: CompositionProps) {
    this.id = props.id;
    this.name = props.name;
    this.duration = props.duration;
    this.renderMode = props.renderMode;
    this.frame = props.frame;
    this.background = props.background;
    this.animationGraph = props.animationGraph;
    this.render = props.render;
  }
}

// ---------------------------------------------------------------------------
// Typed Effect Graph API
// ---------------------------------------------------------------------------

export type AnimationGraphValueType =
  | "Structure.Shape"
  | "Structure.TextObject"
  | "Structure.RichTextObject"
  | "Structure.TextTokens"
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

export type AnimationGraphSocket = {
  id: string;
  label: string;
  type: AnimationGraphValueType;
  accepts?: readonly AnimationGraphValueType[];
};

export type AnimationGraphPort = "top" | "right" | "bottom" | "left";

export type AnimationGraphEdge = {
  id: string;
  fromNodeId: string;
  fromPort: AnimationGraphPort;
  toNodeId: string;
  toPort: AnimationGraphPort;
  fromSocket?: string;
  toSocket?: string;
};

export type AnimationGraphTimeConfig = {
  delay?: number;
  duration?: number;
  ease?: MotionEase;
  repeat?: number;
  repeatType?: "loop" | "reverse" | "mirror";
  schedule?: "relative" | "absolute";
};

export type AnimationGraphSplitConfig = {
  mode?: "word" | "character" | "pattern";
  pattern?: string;
  stagger?: number;
  order?: "forward" | "reverse" | "center";
  repeatScope?: "sequence" | "item";
};

export type AnimationGraphConditionRule = {
  target: "value" | "type";
  operator: "equals" | "contains" | "notContains" | "gt" | "lt" | "gte" | "lte";
  value: string | number;
  action: "setDelay" | "sendToOutput" | "duplicateToOutput";
  output: string;
  delay?: number;
};

export type AnimationGraphConditionConfig = {
  rules: AnimationGraphConditionRule[];
};

export type AnimationGraphCssEffect = {
  property: string;
  from?: string | number;
  to?: string | number;
  values?: Record<string, string | number | boolean>;
};

export type AnimationGraphEffectConfig = {
  effects: AnimationGraphCssEffect[];
};

export type AnimationGraphNodePosition = { x: number; y: number };

export type AnimationGraphNodeBase<Kind extends string, Config> = {
  id: string;
  kind: Kind;
  label: string;
  position: AnimationGraphNodePosition;
  x: number;
  y: number;
  inputs: readonly AnimationGraphSocket[];
  outputs: readonly AnimationGraphSocket[];
  config: Config;
};

export type AnimationGraphSourceNode = AnimationGraphNodeBase<
  "source",
  { objectId: string }
>;
export type AnimationGraphTimeNode = AnimationGraphNodeBase<
  "time",
  Required<
    Pick<AnimationGraphTimeConfig, "delay" | "duration" | "ease" | "schedule">
  > &
    Pick<AnimationGraphTimeConfig, "repeat" | "repeatType">
>;
export type AnimationGraphSplitNode = AnimationGraphNodeBase<
  "split",
  Required<
    Pick<
      AnimationGraphSplitConfig,
      "mode" | "stagger" | "order" | "repeatScope"
    >
  > &
    Pick<AnimationGraphSplitConfig, "pattern">
>;
export type AnimationGraphConditionNode = AnimationGraphNodeBase<
  "condition",
  AnimationGraphConditionConfig
>;
export type AnimationGraphAnimationNode = AnimationGraphNodeBase<
  "effect",
  AnimationGraphEffectConfig
>;
export type AnimationGraphGroupNode = AnimationGraphNodeBase<
  "group",
  { groupId: string }
>;
export type AnimationGraphOutNode = AnimationGraphNodeBase<"out", {}>;

export type TypedAnimationGraphNode =
  | AnimationGraphSourceNode
  | AnimationGraphTimeNode
  | AnimationGraphSplitNode
  | AnimationGraphConditionNode
  | AnimationGraphAnimationNode
  | AnimationGraphGroupNode
  | AnimationGraphOutNode;

export type TypedAnimationGraphState = {
  nodes: Record<string, TypedAnimationGraphNode | CompactAnimationGraphNode>;
  edges: AnimationGraphEdge[];
  layers?: Array<{
    id: string;
    nodes: Record<string, TypedAnimationGraphNode | CompactAnimationGraphNode>;
    edges: AnimationGraphEdge[];
  }>;
  customNodes?: Record<string, JsonValue>;
  parameters?: Record<string, Record<string, string>>;
  groups?: Record<string, JsonValue>;
  viewport?: JsonValue;
  viewports?: JsonValue;
};

export type CompactAnimationGraphNode = {
  id: string;
  kind: TypedAnimationGraphNode["kind"];
  label?: string;
  position: AnimationGraphNodePosition;
  config?: JsonValue;
};

export function defineAnimationGraph<T extends TypedAnimationGraphState>(
  graph: T,
): T {
  return graph;
}
