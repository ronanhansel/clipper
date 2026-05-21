import { prepareLiveDomPostProcessSource } from "../../../core/effects/postprocess/liveDomCapability";

/**
 * Owns a single offscreen `<canvas>` that backs the shared
 * `drawElementImage` capture root. Browsers require the captured source
 * element to be a descendant of THIS canvas, so all per-element capture
 * nodes route their `drawElementImage()` calls through `context` here
 * before blitting pixels into their own private canvases.
 *
 * No Three texture, no per-frame capture: this class is purely the DOM
 * mount + cached `getContext('2d')`. `prepare(sourceRoot)` toggles the
 * Chromium-experimental `layoutSubtree` / paint hooks once per (root,
 * canvas) pair the same way the old `CapturePlaneTexture` did.
 */
export class SharedCaptureCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;

  private preparedFor: { source: Element; canvas: HTMLCanvasElement } | null =
    null;

  constructor(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext("2d");
  }

  get context(): CanvasRenderingContext2D {
    if (!this.ctx)
      throw new Error("SharedCaptureCanvas: 2D context unavailable");
    return this.ctx;
  }

  prepare(sourceRoot: Element | null): void {
    if (!sourceRoot) {
      this.preparedFor = null;
      return;
    }
    if (
      this.preparedFor &&
      this.preparedFor.source === sourceRoot &&
      this.preparedFor.canvas === this.canvas
    )
      return;
    prepareLiveDomPostProcessSource(sourceRoot, this.canvas);
    this.preparedFor = { source: sourceRoot, canvas: this.canvas };
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  dispose(): void {
    this.preparedFor = null;
  }
}
