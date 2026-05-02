export const compositionApiSource = `export type { ChartSpec, ChartType } from "./chart";
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

export function transformToCss(transform: Transform | string | undefined): string | undefined {
  if (typeof transform === "string") return transform;
  if (!transform) return undefined;
  const parts: string[] = [];
  if (transform.x !== undefined || transform.y !== undefined || transform.z !== undefined) {
    parts.push(\`translate3d(\${transform.x ?? 0}px, \${transform.y ?? 0}px, \${transform.z ?? 0}px)\`);
  }
  if (transform.rotate !== undefined) {
    parts.push(\`rotate(\${transform.rotate}deg)\`);
  }
  if (transform.scale !== undefined) {
    parts.push(\`scale(\${transform.scale})\`);
  }
  if (transform.scaleX !== undefined) {
    parts.push(\`scaleX(\${transform.scaleX})\`);
  }
  if (transform.scaleY !== undefined) {
    parts.push(\`scaleY(\${transform.scaleY})\`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export class RenderableObject {
  id: string;
  name?: string;
  kind: FrameObjectType;
  bounds: { x: number; y: number; width: number; height: number };
  content?: string;
  chart?: any;
  template?: any;
  richText?: any;
  style: Record<string, string | number>;
  motion?: any;
  transform?: Transform | string;
  layoutId?: string;
  hidden?: boolean;
  locked?: boolean;
  animations?: any;

  constructor(props: Record<string, unknown>) {
    this.id = props.id as string;
    this.name = props.name as string | undefined;
    this.kind = "rect";
    this.bounds = props.bounds as { x: number; y: number; width: number; height: number };
    this.content = (props.text as string | undefined) ?? (props.content as string | undefined);
    this.chart = props.chart as unknown;
    this.template = props.template as unknown;
    this.richText = props.richText as unknown;
    this.style = (props.style as Record<string, string | number>) ?? {};
    this.motion = props.motion as unknown;
    this.transform = props.transform as Transform | string | undefined;
    this.layoutId = props.layoutId as string | undefined;
    this.hidden = props.hidden as boolean | undefined;
    this.locked = props.locked as boolean | undefined;
    this.animations = props.animations as unknown;
  }
}

export class Rect extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "rect";
  }
}

export class Text extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "text";
  }
}

export class Image extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "image";
  }
}

export class Svg extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "svg";
  }
}

export class Html extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "html";
  }
}

export class Template extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "template";
  }
}

export class Chart extends RenderableObject {
  constructor(props: Record<string, unknown>) {
    super(props);
    this.kind = "chart";
  }
}

export class Component {
  style?: Record<string, string | number>;
  transform?: Transform | string;
  motion?: any;
  animations?: any;
  hidden?: boolean;
  locked?: boolean;

  constructor(props?: Record<string, unknown>) {
    if (props) {
      this.style = props.style as Record<string, string | number> | undefined;
      this.transform = props.transform as Transform | string | undefined;
      this.motion = props.motion as unknown;
      this.animations = props.animations as unknown;
      this.hidden = props.hidden as boolean | undefined;
      this.locked = props.locked as boolean | undefined;
    }
  }

  render(_context: RenderContext): (RenderableObject | Component | Group | null | undefined | false | unknown[])[] {
    return [];
  }
}

export class Group extends Component {
  children: (RenderableObject | Component | Group | null | undefined | false | unknown[])[];

  constructor(props?: Record<string, unknown>) {
    super(props);
    this.children = (props?.children as (RenderableObject | Component | Group | null | undefined | false | unknown[])[]) ?? [];
  }

  render(_context: RenderContext): (RenderableObject | Component | Group | null | undefined | false | unknown[])[] {
    return this.children;
  }
}

export class Composition {
  name?: string;
  duration: number;
  frame: { width: number; height: number; style?: Record<string, string | number> };
  background?: {
    id?: string;
    name?: string;
    style?: Record<string, string | number>;
    stretchToElements?: boolean;
    motion?: unknown;
    hidden?: boolean;
    locked?: boolean;
    animations?: unknown;
    elements?: (RenderableObject | Component | Group | null | undefined | false | unknown[])[];
  };
  render: (context: RenderContext) => (RenderableObject | Component | Group | null | undefined | false | unknown[])[];

  constructor(props: Record<string, unknown>) {
    this.name = props.name as string | undefined;
    this.duration = props.duration as number;
    this.frame = props.frame as { width: number; height: number; style?: Record<string, string | number> };
    this.background = props.background as typeof this.background;
    this.render = props.render as (context: RenderContext) => (RenderableObject | Component | Group | null | undefined | false | unknown[])[];
  }
}
`;
