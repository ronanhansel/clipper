import type { MotionBlock, MotionEffectId } from "../../../types";

export function createMotionBlock(
  input: { id: string; layerId: string; start: number; duration: number },
  effectId: MotionEffectId,
  params: MotionBlock["params"],
): MotionBlock {
  return { ...input, effectId, params, ...params };
}
