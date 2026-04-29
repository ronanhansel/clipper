import type { AdjustmentLayer } from "../../../../types";
import type { AdjustmentEffectPackage } from "../../../types";
import { getNumericParam, positiveModulo } from "../helpers";

export const loopStutterLogic = {
  applySceneTime: ({ sceneTime, layer }) => layer.start + positiveModulo(Math.max(0, sceneTime - layer.start), getLoopWindow(layer)),
  validate: (layer) => getNumericParam(layer, "window", 0.5) <= 0 ? `Adjustment ${layer.name} must use a loop window greater than 0.` : null,
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applySceneTime" | "validate">>;

export function getLoopWindow(layer: Pick<AdjustmentLayer, "effect">) {
  return Math.max(0.05, Number(layer.effect.params?.window) || 0.5);
}
