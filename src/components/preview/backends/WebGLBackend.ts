import { LiveDomPostProcessRenderer } from "../../../core/effects/postprocess/liveDomRenderer";
import type {
  CompositionRenderInput,
  CompositionRenderResult,
  EffectRenderInput,
  EffectRenderResult,
  RenderBackend,
  RenderBackendCapabilities,
} from "./types";

const capabilities: RenderBackendCapabilities = {
  kind: "webgl",
  supportsRasterCache: true,
  supportsPostProcess: true,
};

export interface WebGLBackendOptions {
  renderer?: WebGLEffectRenderer;
}

export interface WebGLEffectRenderer {
  render(input: {
    canvas: HTMLCanvasElement;
    sourceCanvas?: HTMLCanvasElement | null;
    sourceElement: Element | null;
    passes: readonly EffectRenderInput["passes"][number][];
    width: number;
    height: number;
  }): EffectRenderResult;
  destroy(): void;
}

export function createWebGLBackend(
  options: WebGLBackendOptions = {},
): RenderBackend {
  let renderer: WebGLEffectRenderer | null = options.renderer ?? null;
  return {
    capabilities,
    renderComposition(_: CompositionRenderInput): CompositionRenderResult {
      return { rendered: false };
    },
    renderEffect(input: EffectRenderInput): EffectRenderResult {
      renderer ??= new LiveDomPostProcessRenderer();
      return renderer.render({
        canvas: input.output,
        sourceCanvas: input.sourceCanvas ?? null,
        sourceElement: input.sourceElement,
        passes: input.passes,
        width: input.width,
        height: input.height,
      });
    },
    destroy() {
      renderer?.destroy();
      renderer = null;
    },
  };
}
