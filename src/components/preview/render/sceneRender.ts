import {
  formatCameraPreviewFilter,
  formatCameraPreviewTransform,
  type CameraPreviewTransform,
} from "../../../core/camera";
import type {
  AdjustmentVisualOverlay,
  PostProcessPass,
  TransitionVisualStyle,
} from "../../../core/effects/types";
import type { CompositionClip } from "../../../core/types";

export interface SceneRenderViewport {
  width: number;
  height: number;
}

export interface SceneRenderInput {
  sceneCamera: CameraPreviewTransform;
  visualAdjustmentFilter: string | undefined;
  transitionVisual: TransitionVisualStyle | undefined;
  visualOverlays: AdjustmentVisualOverlay[] | undefined;
  useTransitionComposite: boolean;
  viewport: SceneRenderViewport;
  exportTileViewport?: { x: number; y: number };
  frameScale: number;
}

export interface SceneRenderResult {
  cameraTransform: string;
  cameraFilter: string | undefined;
  cameraExtraTransform: string | undefined;
  visualAdjustmentFilter: string | undefined;
  visualAdjustmentFrameStyle: Record<string, unknown> | undefined;
  visualOverlays: AdjustmentVisualOverlay[];
  frameStyle: {
    width: number;
    height: number;
    left: number;
    top: number;
    transform: string | undefined;
  };
}

export function renderScenePreview(input: SceneRenderInput): SceneRenderResult {
  const cameraTransform = formatCameraPreviewTransform(input.sceneCamera);
  const cameraFilter = formatCameraPreviewFilter(input.sceneCamera);
  const cameraExtraTransform = input.useTransitionComposite
    ? undefined
    : (input.transitionVisual?.cameraStyle?.transform as string | undefined);
  const transitionFilter = input.useTransitionComposite
    ? undefined
    : input.transitionVisual?.filter;
  const visualAdjustmentFilter =
    [
      input.useTransitionComposite ? undefined : input.visualAdjustmentFilter,
      transitionFilter,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return {
    cameraTransform,
    cameraFilter,
    cameraExtraTransform,
    visualAdjustmentFilter,
    visualAdjustmentFrameStyle: input.useTransitionComposite
      ? undefined
      : input.transitionVisual?.frameStyle,
    visualOverlays: input.visualOverlays ?? [],
    frameStyle: {
      width: input.viewport.width,
      height: input.viewport.height,
      left: input.exportTileViewport ? -input.exportTileViewport.x : 0,
      top: input.exportTileViewport ? -input.exportTileViewport.y : 0,
      transform:
        input.frameScale === 1 ? undefined : `scale(${input.frameScale})`,
    },
  };
}

export interface CompositionRenderInput {
  composition: CompositionClip;
  localTime: number;
  duration: number;
  viewport: SceneRenderViewport;
  frameScale: number;
}

export interface CompositionRenderResult {
  partId: string;
  localTime: number;
  duration: number;
  background: string;
  frameStyle: {
    width: number;
    height: number;
    transform: string | undefined;
  };
}

export function renderCompositionPreview(
  input: CompositionRenderInput,
): CompositionRenderResult {
  return {
    partId: input.composition.id,
    localTime: input.localTime,
    duration: input.duration,
    background: String(input.composition.frame.style.backgroundColor ?? "#000"),
    frameStyle: {
      width: input.viewport.width,
      height: input.viewport.height,
      transform:
        input.frameScale === 1 ? undefined : `scale(${input.frameScale})`,
    },
  };
}

export interface EffectRenderInput {
  pass: PostProcessPass;
  viewport: SceneRenderViewport;
  background: unknown;
}

export interface EffectRenderResult {
  pass: PostProcessPass;
  width: number;
  height: number;
  background: unknown;
}

export function renderEffectPreview(
  input: EffectRenderInput,
): EffectRenderResult {
  return {
    pass: input.pass,
    width: input.viewport.width,
    height: input.viewport.height,
    background: input.background,
  };
}
