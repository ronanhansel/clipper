import type { AdjustmentEffectDefinition, AdjustmentLayer, MotionBlock, MotionEffectDefinition, Point } from "../types";

export type AdjustmentVisualStyle = {
  filter?: string;
  overlays?: AdjustmentVisualOverlay[];
};

export type AdjustmentVisualOverlay = {
  id: string;
  target?: "frame" | "camera";
  style: Record<string, string | number>;
};

export type AdjustmentEffectDisableCondition = {
  key: string;
  truthy?: boolean;
  equals?: string | number | boolean;
  reason?: string;
};

export type AdjustmentEffectNumberParamControl = {
  key: string;
  label: string;
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
  disabledWhen?: AdjustmentEffectDisableCondition;
};

export type AdjustmentEffectSelectParamControl = {
  key: string;
  label: string;
  type: "select";
  defaultValue: string;
  options: readonly { value: string; label: string }[];
  disabledWhen?: AdjustmentEffectDisableCondition;
};

export type AdjustmentEffectParamControl = AdjustmentEffectNumberParamControl | AdjustmentEffectSelectParamControl;

export type AdjustmentEffectPointControl = {
  label: string;
  xKey: string;
  yKey: string;
  xLabel?: string;
  yLabel?: string;
  xDefault: number;
  yDefault: number;
  coordinateSpace: "percent" | "frame";
  pickLabel?: string;
  disabledWhen?: AdjustmentEffectDisableCondition;
};

export type MotionEffectPackage = MotionEffectDefinition & {
  createDefaultBlock(input: { id: string; layerId: string; start: number; duration: number; focus: Point; position: Point }): MotionBlock;
};

export type AdjustmentEffectPackage = AdjustmentEffectDefinition & {
  paramControls?: readonly AdjustmentEffectParamControl[];
  pointControls?: readonly AdjustmentEffectPointControl[];
  timeSensitive?: boolean;
  createDefaultLayer(input: { id: string; layerId?: string; start: number; duration: number }): AdjustmentLayer;
  applySceneTime?(input: { sceneTime: number; layer: AdjustmentLayer; frameRate: number }): number;
  applyVisualStyle?(input: { sceneTime: number; layer: AdjustmentLayer; frameRate: number }): AdjustmentVisualStyle;
  getDisplayElapsed?(input: { elapsed: number; layer: AdjustmentLayer; frameRate: number }): number;
  validate?(layer: AdjustmentLayer): string | null;
};

export type EffectPackage = MotionEffectPackage | AdjustmentEffectPackage;
