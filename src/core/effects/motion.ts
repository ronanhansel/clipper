import type { MotionBlockEffectKind } from "../types";
import { builtInMotionEffects } from "./builtins/motion";

export { builtInMotionEffects } from "./builtins/motion";

export function defaultLayerIdForMotionKind(kind: MotionBlockEffectKind) {
  return builtInMotionEffects.find((effect) => effect.kind === kind)?.id ?? builtInMotionEffects[0].id;
}
