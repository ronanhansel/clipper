export type Composition3dNodeKind =
  | "time"
  | "uv"
  | "texture"
  | "color"
  | "mx_noise_vec3"
  | "split_x"
  | "split_y"
  | "vec2"
  | "mul"
  | "add"
  | "sub"
  | "div"
  | "abs"
  | "max"
  | "min"
  | "pow"
  | "sin"
  | "fract"
  | "clamp"
  | "mix"
  | "smoothstep"
  | "out";

export type Composition3dValue = number | string | readonly number[];

export type Composition3dNodeInput = {
  nodeId: string;
  output?: string;
};

export type Composition3dNode = {
  id: string;
  kind: Composition3dNodeKind;
  inputs?: Record<string, Composition3dNodeInput>;
  params?: Record<string, Composition3dValue>;
};

export type Composition3dGraph = {
  version: 1;
  nodes: Composition3dNode[];
  outNodeId: string;
};

export type Composition3dTextureLoader = (asset: string) => unknown;

export type Composition3dTslRuntime = {
  time: unknown;
  uv: () => unknown;
  texture: (texture: unknown, uv?: unknown) => unknown;
  color: (...channels: number[]) => unknown;
  mx_noise_vec3: (value: unknown) => unknown;
  vec2: (x: unknown, y: unknown) => unknown;
  mul: (...values: unknown[]) => unknown;
  add: (...values: unknown[]) => unknown;
  sub: (left: unknown, right: unknown) => unknown;
  div: (left: unknown, right: unknown) => unknown;
  abs: (value: unknown) => unknown;
  max: (left: unknown, right: unknown) => unknown;
  min: (left: unknown, right: unknown) => unknown;
  pow: (value: unknown, exponent: unknown) => unknown;
  sin: (value: unknown) => unknown;
  fract: (value: unknown) => unknown;
  clamp: (value: unknown, min: unknown, max: unknown) => unknown;
  mix: (x: unknown, y: unknown, a: unknown) => unknown;
  smoothstep: (edge0: unknown, edge1: unknown, x: unknown) => unknown;
};

export type Composition3dCompileOptions = {
  tsl: Composition3dTslRuntime;
  loadTexture: Composition3dTextureLoader;
  time?: unknown;
};
