import type { Composition3dNodeKind } from "./composition3d/types";

export type GraphCompositionMode =
  | "composition2d"
  | "composition3d"
  | "background";

export type SocketType =
  | "universal"
  | "scalar"
  | "any"
  | "renderable"
  | "time"
  | "token";

export type BackgroundGraphNodeKind =
  | "layer"
  | "time"
  | "oscillate"
  | "bgSolid"
  | "bgGradient"
  | "bgPattern"
  | "bgPaper"
  | "bgThreeCode";

export type BackgroundGraphNodeRole =
  | "target"
  | "time"
  | "modifier"
  | "source"
  | "animatedSource";

export const graphSocketColors: Record<SocketType, string> = {
  universal: "#2f80ff",
  scalar: "#ff4fb8",
  any: "#ff3b30",
  renderable: "#2f80ff",
  time: "#ff4fb8",
  token: "#30d158",
};

export type Composition3dSocketDefinition = {
  output: SocketType;
  accepts: readonly SocketType[];
  scalarInputs?: readonly string[];
};

export const composition2dSocketSettings = {
  defaultSocket: "any",
  sockets: {
    layer: { output: "renderable", accepts: [] },
    effect: {
      output: "renderable",
      accepts: ["renderable", "time", "token", "any"],
    },
    effectMix: {
      output: "renderable",
      accepts: ["renderable", "time", "token", "any"],
    },
    time: { output: "time", accepts: ["renderable", "time", "any"] },
    split: { output: "token", accepts: ["renderable", "time", "token", "any"] },
    condition: { output: "token", accepts: ["token", "any"] },
    group: {
      output: "renderable",
      accepts: ["renderable", "time", "token", "any"],
    },
    out: {
      output: "renderable",
      accepts: ["renderable", "time", "token", "any"],
    },
  },
  rules: [
    { from: "effect", to: "time" },
    { from: "effect", to: "out" },
    { from: "effectMix", to: "time" },
    { from: "effectMix", to: "out" },
    { from: "layer", to: "time" },
    { from: "layer", to: "group" },
    { from: "group", to: "time" },
    { from: "group", to: "effect" },
    { from: "group", to: "effectMix" },
    { from: "group", to: "out" },
    { from: "layer", to: "out" },
    { from: "time", to: "out" },
    { from: "time", to: "effect" },
    { from: "time", to: "effectMix" },
    { from: "time", to: "time" },
    { from: "time", to: "split" },
    { from: "split", to: "condition" },
    { from: "split", to: "effect" },
    { from: "split", to: "effectMix" },
    { from: "condition", to: "effect" },
    { from: "condition", to: "effectMix" },
    { from: "condition", to: "time" },
    { from: "condition", to: "out" },
    { from: "split", to: "out" },
  ],
} as const;

export type Composition2dNodeKind =
  keyof typeof composition2dSocketSettings.sockets;

export function getComposition2dSocketDefinition(
  kind: string | null | undefined,
) {
  return kind && kind in composition2dSocketSettings.sockets
    ? composition2dSocketSettings.sockets[kind as Composition2dNodeKind]
    : null;
}

export const backgroundGraphSocketSettings = {
  roles: {
    layer: "target",
    time: "time",
    oscillate: "modifier",
    bgSolid: "source",
    bgGradient: "animatedSource",
    bgPattern: "animatedSource",
    bgPaper: "animatedSource",
    bgThreeCode: "animatedSource",
  },
  rules: [
    { from: "time", to: "modifier" },
    { from: "modifier", to: "animatedSource" },
    { from: "source", to: "target" },
    { from: "animatedSource", to: "target" },
  ],
} as const satisfies {
  roles: Record<BackgroundGraphNodeKind, BackgroundGraphNodeRole>;
  rules: readonly {
    from: BackgroundGraphNodeRole;
    to: BackgroundGraphNodeRole;
  }[];
};

export function getBackgroundGraphNodeRole(
  kind: string,
): BackgroundGraphNodeRole | null {
  return Object.prototype.hasOwnProperty.call(
    backgroundGraphSocketSettings.roles,
    kind,
  )
    ? backgroundGraphSocketSettings.roles[kind as BackgroundGraphNodeKind]
    : null;
}

export function canConnectBackgroundGraphNodeRoles(
  from: BackgroundGraphNodeRole | null,
  to: BackgroundGraphNodeRole | null,
) {
  if (!from || !to) return false;
  return backgroundGraphSocketSettings.rules.some(
    (rule) => rule.from === from && rule.to === to,
  );
}

export const composition3dSocketSettings = {
  time: { output: "scalar", accepts: [] },
  uv: { output: "universal", accepts: [] },
  color: { output: "universal", accepts: [] },
  texture: { output: "universal", accepts: ["universal", "any"] },
  mx_noise_vec3: {
    output: "universal",
    accepts: ["universal", "scalar", "any"],
  },
  split_x: { output: "scalar", accepts: ["universal", "any"] },
  split_y: { output: "scalar", accepts: ["universal", "any"] },
  vec2: {
    output: "universal",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["x", "y"],
  },
  mul: { output: "universal", accepts: ["universal", "scalar", "any"] },
  add: { output: "universal", accepts: ["universal", "scalar", "any"] },
  sub: { output: "universal", accepts: ["universal", "scalar", "any"] },
  div: { output: "universal", accepts: ["universal", "scalar", "any"] },
  abs: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["value"],
  },
  max: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["in0", "in1"],
  },
  min: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["in0", "in1"],
  },
  pow: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["value", "exponent"],
  },
  sin: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["value"],
  },
  fract: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["value"],
  },
  clamp: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["value", "min", "max"],
  },
  mix: {
    output: "universal",
    accepts: ["universal", "scalar", "any"],
    scalarInputs: ["a"],
  },
  smoothstep: {
    output: "scalar",
    accepts: ["scalar", "universal", "any"],
    scalarInputs: ["edge0", "edge1", "x"],
  },
  out: { output: "any", accepts: ["universal", "scalar", "any"] },
} as const satisfies Record<
  Composition3dNodeKind,
  Composition3dSocketDefinition
>;

export function getComposition3dNodeKindFromPackageId(
  packageId: string | undefined,
): Composition3dNodeKind | null {
  const kind = packageId?.replace(/^composition3d:/, "");
  return isComposition3dNodeKind(kind) ? kind : null;
}

export function getComposition3dSocketDefinition(
  kind: Composition3dNodeKind | null | undefined,
): Composition3dSocketDefinition | null {
  return kind ? composition3dSocketSettings[kind] : null;
}

export function canConnectSocketTypes(
  output: SocketType,
  accepts: readonly SocketType[],
) {
  return (
    output === "any" ||
    accepts.includes("any") ||
    accepts.includes(output) ||
    (output === "universal" && accepts.includes("scalar"))
  );
}

export function isUniversalToScalarCast(output: SocketType, input: SocketType) {
  return output === "universal" && input === "scalar";
}

function isComposition3dNodeKind(
  value: string | undefined,
): value is Composition3dNodeKind {
  return (
    value === "time" ||
    value === "uv" ||
    value === "texture" ||
    value === "color" ||
    value === "mx_noise_vec3" ||
    value === "split_x" ||
    value === "split_y" ||
    value === "vec2" ||
    value === "mul" ||
    value === "add" ||
    value === "sub" ||
    value === "div" ||
    value === "abs" ||
    value === "max" ||
    value === "min" ||
    value === "pow" ||
    value === "sin" ||
    value === "fract" ||
    value === "clamp" ||
    value === "mix" ||
    value === "smoothstep" ||
    value === "out"
  );
}
