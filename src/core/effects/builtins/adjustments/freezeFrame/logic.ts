import type { AdjustmentEffectPackage } from "../../../types";

export const freezeFrameLogic = {
  applySceneTime: ({ layer }) => layer.start,
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applySceneTime">>;
