import type { AdjustmentEffectDefinition, AdjustmentLayer, MotionBlock, MotionEffectDefinition, Point } from "../types";

export type MotionEffectPackage = MotionEffectDefinition & {
  createDefaultBlock(input: { id: string; layerId: string; start: number; duration: number; focus: Point; position: Point }): MotionBlock;
};

export type AdjustmentEffectPackage = AdjustmentEffectDefinition & {
  createDefaultLayer(input: { id: string; layerId?: string; start: number; duration: number }): AdjustmentLayer;
  applySceneTime(input: { sceneTime: number; layer: AdjustmentLayer; frameRate: number }): number;
  validate?(layer: AdjustmentLayer): string | null;
};

export type EffectPackage = MotionEffectPackage | AdjustmentEffectPackage;
