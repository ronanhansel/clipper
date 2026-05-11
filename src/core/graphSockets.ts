export type GraphCompositionMode = "composition2d";

export type SocketType =
  | "universal"
  | "scalar"
  | "any"
  | "renderable"
  | "time"
  | "token";

export const graphSocketColors: Record<SocketType, string> = {
  universal: "#2f80ff",
  scalar: "#ff4fb8",
  any: "#ff3b30",
  renderable: "#2f80ff",
  time: "#ff4fb8",
  token: "#30d158",
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
