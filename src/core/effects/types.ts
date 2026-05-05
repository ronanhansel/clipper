import type { AdjustmentEffectDefinition, AdjustmentLayer, MotionBlock, MotionEffectDefinition, TransitionEffectDefinition, TransitionLayer, Point } from "../types";
import type { LensPostProcessPass } from "./postprocess/lens";

export type PostProcessPass = LensPostProcessPass;

export type AdjustmentVisualStyle = {
  filter?: string;
  overlays?: AdjustmentVisualOverlay[];
};

export type AdjustmentVisualOverlay = {
  id: string;
  target?: "frame" | "camera";
  style: Record<string, string | number>;
};

export type TransitionVisualStyle = {
  filter?: string;
  frameStyle?: Record<string, string | number>;
  cameraStyle?: Record<string, string | number>;
  overlays?: TransitionVisualOverlay[];
};

export type TransitionSequenceStyle = {
  frameStyle?: Record<string, string | number>;
  aStyle?: Record<string, string | number>;
  bStyle?: Record<string, string | number>;
};

export type TransitionVisualOverlay = {
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

export type MotionMendTransitionNumberControl = {
  key: string;
  label: string;
  type: "number";
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
};

export type MotionMendTransitionSelectControl = {
  key: string;
  label: string;
  type: "select";
  defaultValue: string;
  options: readonly { value: string; label: string }[];
};

export type MotionMendTransitionParamControl = MotionMendTransitionNumberControl | MotionMendTransitionSelectControl;

export type MotionMendTransitionOption = {
  key: string;
  label: string;
  defaultParams: Record<string, unknown>;
  paramControls: readonly MotionMendTransitionParamControl[];
};

export type MotionEffectPackage = MotionEffectDefinition & {
  createDefaultBlock(input: { id: string; layerId: string; start: number; duration: number; focus: Point; position: Point }): MotionBlock;
  mendTransitionOptions?: readonly MotionMendTransitionOption[];
};

export type AdjustmentEffectPackage = AdjustmentEffectDefinition & {
  paramControls?: readonly AdjustmentEffectParamControl[];
  pointControls?: readonly AdjustmentEffectPointControl[];
  timeSensitive?: boolean;
  requiresLiveDomPostProcessSource?: boolean;
  createDefaultLayer(input: { id: string; layerId?: string; start: number; duration: number }): AdjustmentLayer;
  applySceneTime?(input: { sceneTime: number; layer: AdjustmentLayer; frameRate: number }): number;
  applyVisualStyle?(input: { sceneTime: number; layer: AdjustmentLayer; frameRate: number }): AdjustmentVisualStyle;
  collectPostProcessPasses?(input: { sceneTime: number; layer: AdjustmentLayer; frameRate: number; frameSize: { width: number; height: number } }): PostProcessPass[];
  getDisplayElapsed?(input: { elapsed: number; layer: AdjustmentLayer; frameRate: number }): number;
  validate?(layer: AdjustmentLayer): string | null;
};

export type TransitionEffectPackage = TransitionEffectDefinition & {
  createDefaultLayer(input: { id: string; layerId?: string; start: number; duration: number; midPoint: number }): TransitionLayer;
  applyVisualStyle?(input: { sceneTime: number; layer: TransitionLayer; frameRate: number; progress: number }): TransitionVisualStyle;
  renderSequence?(input: { sceneTime: number; layer: TransitionLayer; frameRate: number; progress: number }): TransitionSequenceStyle;
};

export type EffectPackage = MotionEffectPackage | AdjustmentEffectPackage | TransitionEffectPackage;
