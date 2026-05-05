import { getLiveDomPostProcessPreflight, LiveDomCapabilityProbe, prepareLiveDomPostProcessSource, type LiveDomPostProcessCapability } from "./liveDomCapability";
import { LensPostProcessRenderer } from "./lensWebGlRenderer";
import type { PostProcessPass } from "../types";

export type LiveDomPostProcessRenderResult = {
  rendered: boolean;
  presentable: boolean;
  capability: LiveDomPostProcessCapability;
};

export class LiveDomPostProcessRenderer {
  private readonly renderer = new LensPostProcessRenderer();
  private readonly capabilityProbe = new LiveDomCapabilityProbe();
  private preparedSourceElement: Element | null = null;
  private preparedCanvas: HTMLCanvasElement | null = null;
  private incompatibleUpload = false;

  render(input: { canvas: HTMLCanvasElement; sourceCanvas?: HTMLCanvasElement | null; sourceElement: Element | null; pass: PostProcessPass; width: number; height: number; optIn: boolean }): LiveDomPostProcessRenderResult {
    const capabilityInput = { optIn: input.optIn, sourceElement: input.sourceElement, canvas: input.sourceCanvas ?? input.canvas };
    const preflight = getLiveDomPostProcessPreflight(capabilityInput);
    if (!preflight.supported) return { rendered: false, presentable: false, capability: { ...preflight, texElementImage2D: null } };
    if (this.incompatibleUpload) return { rendered: false, presentable: false, capability: { ...preflight, texElementImage2D: null, supported: false, reason: "missing-tex-element-image" } };

    const gl = this.renderer.getLiveDomContext(input.canvas);
    const capability = this.capabilityProbe.getCapability({ ...capabilityInput, gl });
    if (!capability.supported || !input.sourceElement) return { rendered: false, presentable: false, capability };

    const sourceCanvas = input.sourceCanvas ?? input.canvas;
    if (this.preparedSourceElement !== input.sourceElement || this.preparedCanvas !== sourceCanvas) {
      prepareLiveDomPostProcessSource(input.sourceElement, sourceCanvas);
      this.preparedSourceElement = input.sourceElement;
      this.preparedCanvas = sourceCanvas;
    }
    const rendered = this.renderer.renderElement(input.canvas, input.sourceElement, input.pass, input.width, input.height, sourceCanvas);
    if (!rendered) this.incompatibleUpload = true;
    const presentable = rendered && this.renderer.hasVisiblePixels(input.canvas);
    return { rendered, presentable, capability: rendered ? capability : { ...capability, supported: false, reason: "missing-tex-element-image" } };
  }

  destroy() {
    this.renderer.destroy();
    this.capabilityProbe.clear();
    this.preparedSourceElement = null;
    this.preparedCanvas = null;
    this.incompatibleUpload = false;
  }
}
