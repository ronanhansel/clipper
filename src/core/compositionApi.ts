import type { ChartSpec, ChartType } from "./chart";

export type { ChartSpec, ChartType } from "./chart";
export { defineChart } from "./chart";

export type FrameObjectType = "rect" | "text" | "image" | "svg" | "html" | "template" | "chart";

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
export type RichTextSegment = { text: string; bold: boolean; italic: boolean; underline: boolean };
export type FrameTemplate = { kind: "html"; source: string; static?: boolean };
export type MotionEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "circOut" | "backOut";
export type MotionTrack = {
  delay?: number;
  duration: number;
  ease?: MotionEase;
  loop?: boolean;
  opacity?: readonly [number, number];
  path?: readonly { x: number; y: number }[];
  rotate?: readonly [number, number];
  scale?: readonly [number, number];
  scaleX?: readonly [number, number];
  scaleY?: readonly [number, number];
  skewX?: readonly [number, number];
  skewY?: readonly [number, number];
  x?: readonly [number, number];
  y?: readonly [number, number];
};
export type LayerAnimation = {
  id: string;
  name?: string;
  target?: "self" | "children";
  keyframes: Record<string, readonly number[] | readonly string[] | undefined>;
  options: { duration: number; delay?: number; ease?: MotionEase | readonly [number, number, number, number]; repeat?: number; repeatType?: "loop" | "reverse" | "mirror"; repeatDelay?: number; type?: "tween" | "spring" | "inertia"; bounce?: number; stiffness?: number; damping?: number; mass?: number; velocity?: number };
  enabled?: boolean;
};
export type Renderable = RenderableObject | Component | Group | null | undefined | false | Renderable[];
export type RenderableProps = {
  id: string;
  name?: string;
  bounds: Bounds;
  content?: string;
  text?: string;
  chart?: ChartSpec;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  style?: LayerStyle;
  motion?: MotionTrack;
  transform?: Transform | string;
  layoutId?: string;
  hidden?: boolean;
  locked?: boolean;
  animations?: LayerAnimation[];
};
export type TextProps = Omit<RenderableProps, "content"> & { text?: string; content?: string };
export type ChartProps = RenderableProps & { chart: ChartSpec };
export type ComponentProps = Pick<RenderableProps, "style" | "transform" | "motion" | "animations" | "hidden" | "locked">;
export type GroupProps = ComponentProps & { children?: Renderable[] };
export type CompositionProps = {
  id?: string;
  name?: string;
  duration: number;
  frame: { width: 1920; height: 1080; style?: LayerStyle };
  background?: {
    id?: string;
    name?: string;
    style?: LayerStyle;
    stretchToElements?: boolean;
    motion?: MotionTrack;
    hidden?: boolean;
    locked?: boolean;
    animations?: LayerAnimation[];
    elements?: Renderable[];
  };
  render: (context: RenderContext) => Renderable[];
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

export class RenderableObject {
  id: string;
  name?: string;
  kind: FrameObjectType;
  bounds: Bounds;
  content?: string;
  chart?: ChartSpec;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  style: LayerStyle;
  motion?: MotionTrack;
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
    this.chart = props.chart;
    this.template = props.template;
    this.richText = props.richText;
    this.style = props.style ?? {};
    this.motion = props.motion;
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

export class Template extends RenderableObject {
  constructor(props: RenderableProps) {
    super(props);
    this.kind = "template";
  }
}

export class Chart extends RenderableObject {
  constructor(props: ChartProps) {
    super(props);
    this.kind = "chart";
  }
}

export class Component {
  style?: LayerStyle;
  transform?: Transform | string;
  motion?: MotionTrack;
  animations?: LayerAnimation[];
  hidden?: boolean;
  locked?: boolean;

  constructor(props?: ComponentProps) {
    if (props) {
      this.style = props.style;
      this.transform = props.transform;
      this.motion = props.motion;
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
  frame: CompositionProps["frame"];
  background?: CompositionProps["background"];
  render: (context: RenderContext) => Renderable[];

  constructor(props: CompositionProps) {
    this.id = props.id;
    this.name = props.name;
    this.duration = props.duration;
    this.frame = props.frame;
    this.background = props.background;
    this.render = props.render;
  }
}
