import type { ReactNode } from "react";
import type { LiveDomPostProcessCapability } from "../../../core/effects/postprocess/liveDomCapability";
import type { PostProcessPass } from "../../../core/effects/types";
import type { CompositionClip } from "../../../core/types";
import type { CompositionInteractionBackendProps } from "./CompositionBackend";

export type RenderBackendKind = "dom" | "canvas2d" | "webgl" | "webgpu";

export interface RenderBackendCapabilities {
  kind: RenderBackendKind;
  supportsRasterCache: boolean;
  supportsPostProcess: boolean;
}

export interface RenderViewport {
  width: number;
  height: number;
}

export interface DomCompositionInput extends CompositionInteractionBackendProps {
  hostRef: React.RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  renderMode: "preview" | "export";
  animationsEnabled: boolean;
  frameScale: number;
  exportTileFrameBounds?: import("../FramePreview").ExportTileFrameBounds;
  hideNullObjects: boolean;
  renderClockSceneTime: number;
  active: boolean;
}

export interface CompositionRenderInput {
  composition: CompositionClip;
  localTime: number;
  duration: number;
  viewport: RenderViewport;
  source?: TexImageSource | null;
  target?: HTMLCanvasElement | null;
  dom?: DomCompositionInput;
}

export interface CompositionRenderResult {
  node?: ReactNode;
  rendered: boolean;
}

export interface EffectRenderInput {
  output: HTMLCanvasElement;
  sourceCanvas?: HTMLCanvasElement | null;
  sourceElement: Element | null;
  passes: readonly PostProcessPass[];
  width: number;
  height: number;
  optIn: boolean;
}

export interface EffectRenderResult {
  rendered: boolean;
  presentable: boolean;
  capability: LiveDomPostProcessCapability;
}

export interface RenderBackend {
  readonly capabilities: RenderBackendCapabilities;
  renderComposition(input: CompositionRenderInput): CompositionRenderResult;
  renderEffect?(input: EffectRenderInput): EffectRenderResult;
  destroy(): void;
}
