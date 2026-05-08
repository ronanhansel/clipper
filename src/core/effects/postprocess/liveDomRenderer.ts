import { getLiveDomPostProcessPreflight, LiveDomCapabilityProbe, prepareLiveDomPostProcessSource, type LiveDomPostProcessCapability } from "./liveDomCapability";
import { measurePreviewPerf } from "./perf";
import { createDefaultPostProcessRenderer, type PostProcessRenderer } from "./registry";
import type { PostProcessPass } from "../types";

export type LiveDomPostProcessRenderResult = {
  rendered: boolean;
  presentable: boolean;
  capability: LiveDomPostProcessCapability;
};

export class LiveDomPostProcessRenderer {
  private renderer: PostProcessRenderer | null = null;
  private rendererKind: string | null = null;
  private readonly capabilityProbe = new LiveDomCapabilityProbe();
  private preparedSourceElement: Element | null = null;
  private preparedCanvas: HTMLCanvasElement | null = null;
  private incompatibleUpload = false;

  render(input: { canvas: HTMLCanvasElement; sourceCanvas?: HTMLCanvasElement | null; sourceElement: Element | null; pass: PostProcessPass; width: number; height: number; optIn: boolean }): LiveDomPostProcessRenderResult {
    const capabilityInput = { optIn: input.optIn, sourceElement: input.sourceElement, canvas: input.sourceCanvas ?? input.canvas };
    const preflight = getLiveDomPostProcessPreflight(capabilityInput);
    if (!preflight.supported) return { rendered: false, presentable: false, capability: { ...preflight, texElementImage2D: null } };
    if (this.incompatibleUpload) return { rendered: false, presentable: false, capability: { ...preflight, texElementImage2D: null, supported: false, reason: "missing-tex-element-image" } };

    const renderer = measurePreviewPerf("live.render.getRenderer", () => this.getRenderer(input.pass.kind));
    if (!renderer) return { rendered: false, presentable: false, capability: { ...preflight, texElementImage2D: null, supported: false, reason: "missing-tex-element-image" } };
    const gl = measurePreviewPerf("live.render.getLiveDomContext", () => renderer.getLiveDomContext(input.canvas));
    const capability = measurePreviewPerf("live.render.capabilityProbe", () => this.capabilityProbe.getCapability({ ...capabilityInput, gl }));
    if (!capability.supported || !input.sourceElement) return { rendered: false, presentable: false, capability };

    const sourceCanvas = input.sourceCanvas ?? input.canvas;
    const sourceElement = input.sourceElement;
    if (this.preparedSourceElement !== sourceElement || this.preparedCanvas !== sourceCanvas) {
      measurePreviewPerf("live.render.prepareSource", () => prepareLiveDomPostProcessSource(sourceElement, sourceCanvas));
      this.preparedSourceElement = sourceElement;
      this.preparedCanvas = sourceCanvas;
    }
    const rendered = measurePreviewPerf("live.render.renderElement", () => renderer.renderElement(input.canvas, sourceElement, input.pass, input.width, input.height, sourceCanvas));
    if (!rendered) this.incompatibleUpload = true;
    const presentable = rendered && measurePreviewPerf("live.render.hasVisiblePixels", () => renderer.hasVisiblePixels(input.canvas));
    return { rendered, presentable, capability: rendered ? capability : { ...capability, supported: false, reason: "missing-tex-element-image" } };
  }

  private getRenderer(kind: string) {
    if (this.renderer && this.rendererKind === kind) return this.renderer;
    this.renderer?.destroy();
    this.renderer = createDefaultPostProcessRenderer(kind);
    this.rendererKind = this.renderer ? kind : null;
    this.capabilityProbe.clear();
    this.preparedSourceElement = null;
    this.preparedCanvas = null;
    this.incompatibleUpload = false;
    return this.renderer;
  }

  destroy() {
    this.renderer?.destroy();
    this.renderer = null;
    this.rendererKind = null;
    this.capabilityProbe.clear();
    this.preparedSourceElement = null;
    this.preparedCanvas = null;
    this.incompatibleUpload = false;
  }
}
