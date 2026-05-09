export type FrameObjectType = "rect" | "text" | "image" | "svg" | "html" | "template";

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
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type RichTextSegment = { text: string; bold: boolean; italic: boolean; underline: boolean };
export type FrameTemplate = { kind: "html"; source: string; static?: boolean };
export type MotionEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "circOut" | "backOut";
export type LayerAnimation = {
  id: string;
  name?: string;
  target?: "self" | "children";
  keyframes: Record<string, readonly number[] | readonly string[] | undefined>;
  options: { duration: number; delay?: number; ease?: MotionEase | readonly [number, number, number, number]; repeat?: number; repeatType?: "loop" | "reverse" | "mirror"; repeatDelay?: number; type?: "tween" | "spring" | "inertia"; bounce?: number; stiffness?: number; damping?: number; mass?: number; velocity?: number; split?: { mode: "word" | "character"; stagger?: number; order?: "forward" | "reverse" | "center"; repeatScope?: "sequence" | "item" } };
  enabled?: boolean;
};
export type Renderable = RenderableObject | Component | Group | null | undefined | false | Renderable[];
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
export type TextProps = Omit<RenderableProps, "content"> & { text?: string; content?: string };
export type ComponentProps = Pick<RenderableProps, "style" | "transform" | "animations" | "hidden" | "locked">;
export type GroupProps = ComponentProps & { children?: Renderable[] };
export type WebLayerProps = Omit<RenderableProps, "content"> & { css?: string; html: string };
export type ThreeLayerProps = Omit<RenderableProps, "content"> & { source: string };
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
  animationGraph?: JsonValue;
  composition3dGraph?: JsonValue;
  render: (context: RenderContext) => Renderable[];
};

export type Composition3DProps = Omit<CompositionProps, "render" | "renderMode" | "background"> & {
  background?: CompositionProps["background"];
  animationGraph?: JsonValue;
  composition3dGraph?: JsonValue;
  render?: (context: RenderContext) => Renderable[];
};

export function transformToCss(transform: Transform | string | undefined): string | undefined {
  if (typeof transform === "string") return transform;
  if (!transform) return undefined;
  const parts: string[] = [];
  if (transform.x !== undefined || transform.y !== undefined || transform.z !== undefined) {
    parts.push(`translate3d(${transform.x ?? 0}px, ${transform.y ?? 0}px, ${transform.z ?? 0}px)`);
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
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
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
  composition3dGraph?: CompositionProps["composition3dGraph"];
  render: (context: RenderContext) => Renderable[];

  constructor(props: CompositionProps) {
    this.id = props.id;
    this.name = props.name;
    this.duration = props.duration;
    this.renderMode = props.renderMode;
    this.frame = props.frame;
    this.background = props.background;
    this.animationGraph = props.animationGraph;
    this.composition3dGraph = props.composition3dGraph;
    this.render = props.render;
  }
}

export class Composition3D extends Composition {
  constructor(props: Composition3DProps) {
    super({
      ...props,
      renderMode: "webgl",
      background: props.background ?? { id: "bg", name: "Background", style: {}, elements: [] },
      render: props.render ?? (() => []),
    });
  }
}
