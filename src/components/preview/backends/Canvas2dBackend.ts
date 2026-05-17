import type {
  CompositionRenderInput,
  CompositionRenderResult,
  RenderBackend,
  RenderBackendCapabilities,
} from "./types";

const capabilities: RenderBackendCapabilities = {
  kind: "canvas2d",
  supportsRasterCache: true,
  supportsPostProcess: false,
};

export function createCanvas2dBackend(): RenderBackend {
  return {
    capabilities,
    renderComposition(input: CompositionRenderInput): CompositionRenderResult {
      const target = input.target;
      const source = input.source;
      if (!target || !source) return { rendered: false };
      const context = target.getContext("2d", {
        alpha: true,
        colorSpace: "srgb",
      });
      if (!context) return { rendered: false };
      drawSourceToCanvas2d(
        context,
        source,
        input.viewport.width,
        input.viewport.height,
      );
      return { rendered: true };
    },
    destroy() {},
  };
}

export function drawSourceToCanvas2d(
  context: CanvasRenderingContext2D,
  source: TexImageSource,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height);
  context.drawImage(source as CanvasImageSource, 0, 0);
}
