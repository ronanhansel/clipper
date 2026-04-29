import type { MotionBlock, MotionBlockEffectKind, MotionEffectId, Point } from "../types";
import type { MotionEffectPackage } from "./types";

function block(input: { id: string; layerId: string; start: number; duration: number }, effectId: MotionEffectId, params: MotionBlock["params"]): MotionBlock {
  return { ...input, effectId, params, ...params };
}

export const builtInMotionEffects = [
  {
    id: "clipper.motion.zoom",
    category: "motion",
    kind: "zoom",
    name: "Zoom",
    label: "Zoom",
    accent: "#f0c95a",
    defaultDuration: 1,
    createDefaultBlock: (input) => block(input, "clipper.motion.zoom", { focus: input.focus, scale: 1.8 }),
  },
  {
    id: "clipper.motion.pan",
    category: "motion",
    kind: "pan",
    name: "Pan",
    label: "Pan",
    accent: "#24b7c9",
    defaultDuration: 1,
    createDefaultBlock: (input) => block(input, "clipper.motion.pan", { position: input.position }),
  },
  {
    id: "clipper.motion.rotate",
    category: "motion",
    kind: "rotate",
    name: "Rotate",
    label: "Rotate",
    accent: "#24b7c9",
    defaultDuration: 1,
    createDefaultBlock: (input) => block(input, "clipper.motion.rotate", { position: { x: 0, y: 0 }, rotation: 15 }),
  },
  {
    id: "clipper.motion.perspective",
    category: "motion",
    kind: "perspective",
    name: "Perspective",
    label: "Perspective",
    accent: "#24b7c9",
    defaultDuration: 1,
    createDefaultBlock: (input) => {
      const perspective = { z: 0, rotateX: 8, rotateY: 0 };
      return block(input, "clipper.motion.perspective", { position: { x: 0, y: 0 }, perspective });
    },
  },
] as const satisfies readonly MotionEffectPackage[];

export function defaultLayerIdForMotionKind(kind: MotionBlockEffectKind) {
  return builtInMotionEffects.find((effect) => effect.kind === kind)?.id ?? builtInMotionEffects[0].id;
}
