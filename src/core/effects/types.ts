import type {
  AdjustmentEffectDefinition,
  AdjustmentLayer,
  MotionBlock,
  MotionEffectDefinition,
  TransitionEffectDefinition,
  TransitionLayer,
  Point,
} from "../types";

export type BasePostProcessPass = {
  id: string;
  sourceLayerId?: string;
  kind: string;
  target: "final";
  requiresLiveDomSource?: boolean;
};

export type UnknownPostProcessPass = BasePostProcessPass &
  Record<string, unknown>;

export type PostProcessPass = UnknownPostProcessPass;

export type AdjustmentVisualStyle = {
  filter?: string;
  overlays?: AdjustmentVisualOverlay[];
};

export type AdjustmentExecutionPlanStep = {
  layer: AdjustmentLayer;
  filter?: string;
  overlays?: AdjustmentVisualOverlay[];
  postProcessPasses?: PostProcessPass[];
};

export type AdjustmentExecutionPlan = {
  activeLayers: AdjustmentLayer[];
  steps: AdjustmentExecutionPlanStep[];
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
  key?: string;
  truthy?: boolean;
  equals?: string | number | boolean;
  reason?: string;
  and?: AdjustmentEffectDisableCondition[];
};

export type AdjustmentEffectSection =
  | string
  | {
      key: string;
      label: string;
      description?: string;
      display?: "panel" | "dialog";
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
  visibleWhen?: AdjustmentEffectDisableCondition;
  section?: AdjustmentEffectSection;
  inlineGroup?: string;
  inlineToggle?: {
    label: string;
    key: string;
    defaultValue: boolean;
  };
};

export type AdjustmentEffectSelectParamControl = {
  key: string;
  label: string;
  type: "select";
  defaultValue: string;
  options: readonly { value: string; label: string }[];
  disabledWhen?: AdjustmentEffectDisableCondition;
  visibleWhen?: AdjustmentEffectDisableCondition;
  section?: AdjustmentEffectSection;
  inlineGroup?: string;
  inlineToggle?: {
    label: string;
    key: string;
    defaultValue: boolean;
  };
};

export type AdjustmentEffectBooleanParamControl = {
  key: string;
  label: string;
  type: "boolean";
  defaultValue: boolean;
  disabledWhen?: AdjustmentEffectDisableCondition;
  visibleWhen?: AdjustmentEffectDisableCondition;
  section?: AdjustmentEffectSection;
  inlineGroup?: string;
};

export type AdjustmentEffectParamControl =
  | AdjustmentEffectNumberParamControl
  | AdjustmentEffectSelectParamControl
  | AdjustmentEffectBooleanParamControl;

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
  visibleWhen?: AdjustmentEffectDisableCondition;
  section?: AdjustmentEffectSection;
  inlineGroup?: string;
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

export type MotionMendTransitionParamControl =
  | MotionMendTransitionNumberControl
  | MotionMendTransitionSelectControl;

export type MotionMendTransitionOption = {
  key: string;
  label: string;
  defaultParams: Record<string, unknown>;
  paramControls: readonly MotionMendTransitionParamControl[];
};

export type MotionEffectPackage = MotionEffectDefinition & {
  createDefaultBlock(input: {
    id: string;
    layerId: string;
    start: number;
    duration: number;
    focus: Point;
    position: Point;
  }): MotionBlock;
  mendTransitionOptions?: readonly MotionMendTransitionOption[];
};

export type AdjustmentEffectPackage = AdjustmentEffectDefinition & {
  paramControls?: readonly AdjustmentEffectParamControl[];
  pointControls?: readonly AdjustmentEffectPointControl[];
  timeSensitive?: boolean;
  requiresLiveDomPostProcessSource?: boolean;
  createDefaultLayer(input: {
    id: string;
    layerId?: string;
    start: number;
    duration: number;
  }): AdjustmentLayer;
  applySceneTime?(input: {
    sceneTime: number;
    layer: AdjustmentLayer;
    frameRate: number;
  }): number;
  applyVisualStyle?(input: {
    sceneTime: number;
    layer: AdjustmentLayer;
    frameRate: number;
  }): AdjustmentVisualStyle;
  collectPostProcessPasses?(input: {
    sceneTime: number;
    layer: AdjustmentLayer;
    frameRate: number;
    frameSize: { width: number; height: number };
  }): PostProcessPass[];
  getDisplayElapsed?(input: {
    elapsed: number;
    layer: AdjustmentLayer;
    frameRate: number;
  }): number;
  validate?(layer: AdjustmentLayer): string | null;
};

export type TransitionEffectPackage = TransitionEffectDefinition & {
  createDefaultLayer(input: {
    id: string;
    layerId?: string;
    start: number;
    duration: number;
    midPoint: number;
  }): TransitionLayer;
  applyVisualStyle?(input: {
    sceneTime: number;
    layer: TransitionLayer;
    frameRate: number;
    progress: number;
  }): TransitionVisualStyle;
  renderSequence?(input: {
    sceneTime: number;
    layer: TransitionLayer;
    frameRate: number;
    progress: number;
  }): TransitionSequenceStyle;
};

export type EffectPackage =
  | MotionEffectPackage
  | AdjustmentEffectPackage
  | TransitionEffectPackage;
