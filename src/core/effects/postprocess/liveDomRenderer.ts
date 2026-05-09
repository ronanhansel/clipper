import {
  getLiveDomPostProcessPreflight,
  LiveDomCapabilityProbe,
  prepareLiveDomPostProcessSource,
  type LiveDomPostProcessCapability,
} from "./liveDomCapability";
import { measurePreviewPerf } from "./perf";
import {
  createDefaultPostProcessRenderer,
  type PostProcessRenderer,
} from "./registry";
import type { PostProcessPass } from "../types";

export type LiveDomPostProcessRenderResult = {
  rendered: boolean;
  presentable: boolean;
  capability: LiveDomPostProcessCapability;
};

export class LiveDomPostProcessRenderer {
  private readonly renderers = new Map<string, PostProcessRenderer>();
  private readonly capabilityProbe = new LiveDomCapabilityProbe();
  private scratchCanvases: HTMLCanvasElement[] = [];
  private preparedSourceElement: Element | null = null;
  private preparedCanvas: HTMLCanvasElement | null = null;
  private incompatibleUpload = false;

  render(input: {
    canvas: HTMLCanvasElement;
    sourceCanvas?: HTMLCanvasElement | null;
    sourceElement: Element | null;
    passes: readonly PostProcessPass[];
    width: number;
    height: number;
    optIn: boolean;
  }): LiveDomPostProcessRenderResult {
    const capabilityInput = {
      optIn: input.optIn,
      sourceElement: input.sourceElement,
      canvas: input.sourceCanvas ?? input.canvas,
    };
    const preflight = getLiveDomPostProcessPreflight(capabilityInput);
    if (!preflight.supported)
      return {
        rendered: false,
        presentable: false,
        capability: { ...preflight, drawElementImage: null },
      };
    if (this.incompatibleUpload)
      return {
        rendered: false,
        presentable: false,
        capability: {
          ...preflight,
          drawElementImage: null,
          supported: false,
          reason: "missing-draw-element-image",
        },
      };

    if (!input.passes.length)
      return {
        rendered: false,
        presentable: false,
        capability: { ...preflight, drawElementImage: null },
      };
    const missingRenderer = input.passes.some(
      (pass) =>
        !measurePreviewPerf("live.render.getRenderer", () =>
          this.getRenderer(pass.kind),
        ),
    );
    if (missingRenderer)
      return {
        rendered: false,
        presentable: false,
        capability: {
          ...preflight,
          drawElementImage: null,
          supported: false,
          reason: "missing-draw-element-image",
        },
      };
    const capability = measurePreviewPerf("live.render.capabilityProbe", () =>
      this.capabilityProbe.getCapability(capabilityInput),
    );
    if (!capability.supported || !input.sourceElement)
      return { rendered: false, presentable: false, capability };

    const sourceCanvas = input.sourceCanvas ?? input.canvas;
    const sourceElement = input.sourceElement;
    if (
      this.preparedSourceElement !== sourceElement ||
      this.preparedCanvas !== sourceCanvas
    ) {
      measurePreviewPerf("live.render.prepareSource", () =>
        prepareLiveDomPostProcessSource(sourceElement, sourceCanvas),
      );
      this.preparedSourceElement = sourceElement;
      this.preparedCanvas = sourceCanvas;
    }
    const rendered = measurePreviewPerf("live.render.renderPasses", () =>
      this.renderPasses({
        canvas: input.canvas,
        sourceCanvas,
        sourceElement,
        passes: input.passes,
        width: input.width,
        height: input.height,
      }),
    );
    if (!rendered) this.incompatibleUpload = true;
    const finalRenderer = this.getRenderer(
      input.passes[input.passes.length - 1].kind,
    );
    const presentable =
      rendered &&
      Boolean(finalRenderer) &&
      measurePreviewPerf("live.render.hasVisiblePixels", () =>
        finalRenderer!.hasVisiblePixels(input.canvas),
      );
    return {
      rendered,
      presentable,
      capability: rendered
        ? capability
        : {
            ...capability,
            supported: false,
            reason: "missing-draw-element-image",
          },
    };
  }

  private renderPasses(input: {
    canvas: HTMLCanvasElement;
    sourceCanvas: HTMLCanvasElement;
    sourceElement: Element;
    passes: readonly PostProcessPass[];
    width: number;
    height: number;
  }) {
    let sourceFrame: TexImageSource | Element = input.sourceElement;
    for (let index = 0; index < input.passes.length; index += 1) {
      const pass = input.passes[index];
      const renderer = this.getRenderer(pass.kind);
      if (!renderer) return false;
      const isLast = index === input.passes.length - 1;
      const outputCanvas = isLast ? input.canvas : this.getScratchCanvas(index);
      const rendered =
        index === 0
          ? renderer.renderElement(
              outputCanvas,
              sourceFrame as Element,
              pass,
              input.width,
              input.height,
              input.sourceCanvas,
            )
          : renderer.render(
              outputCanvas,
              sourceFrame as TexImageSource,
              pass,
              input.width,
              input.height,
            );
      if (!rendered) return false;
      sourceFrame = outputCanvas;
    }
    return true;
  }

  private getScratchCanvas(index: number) {
    const scratchIndex = index % 2;
    this.scratchCanvases[scratchIndex] ??= document.createElement("canvas");
    return this.scratchCanvases[scratchIndex];
  }

  private getRenderer(kind: string) {
    const existing = this.renderers.get(kind);
    if (existing) return existing;
    const renderer = createDefaultPostProcessRenderer(kind);
    if (renderer) this.renderers.set(kind, renderer);
    this.capabilityProbe.clear();
    this.preparedSourceElement = null;
    this.preparedCanvas = null;
    this.incompatibleUpload = false;
    return renderer;
  }

  destroy() {
    for (const renderer of this.renderers.values()) renderer.destroy();
    this.renderers.clear();
    this.scratchCanvases = [];
    this.capabilityProbe.clear();
    this.preparedSourceElement = null;
    this.preparedCanvas = null;
    this.incompatibleUpload = false;
  }
}
