import * as THREE from "three";
import {
  captureLiveDomElementToCanvas,
  prepareLiveDomPostProcessSource,
} from "../../../core/effects/postprocess/liveDomCapability";

export interface CaptureQuadResult {
  /** True if a capture happened this call. False if drawElementImage missing. */
  captured: boolean;
}

/**
 * Owns a single offscreen `<canvas>` + `THREE.CanvasTexture` that mirrors
 * a source DOM element via the experimental `drawElementImage` capability
 * exposed in `liveDomCapability`. Used by `CompositionRenderer` as the
 * colour quad behind the depth meshes.
 *
 * Falls through silently when the host browser lacks `drawElementImage`
 * (`captured: false`); upstream callers can show a placeholder instead.
 */
export class CapturePlaneTexture {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly texture: any;
  /**
   * The 2D canvas element that backs `texture`. `drawElementImage`
   * requires its source element to be an immediate child of this
   * canvas, so callers must mount it into the DOM and reparent the
   * source under it before calling `capture`.
   */
  readonly canvas: HTMLCanvasElement;

  private preparedFor: { source: Element; canvas: HTMLCanvasElement } | null =
    null;

  constructor(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.texture = new THREE.CanvasTexture(this.canvas);
    // Default flipY is true; be explicit so future changes are guarded.
    this.texture.flipY = true;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    // The captured 2D canvas holds sRGB-encoded bytes from the DOM
    // composite. Mark the texture as sRGB so Three linearises on read
    // and the bokeh gather operates in linear-light space. Without this,
    // averaging gamma-encoded values desaturates and dulls the bokeh
    // shape — the well-known "muddy mid-tones" gamma-blend artefact.
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  capture(
    sourceElement: Element | null,
    width: number,
    height: number,
  ): CaptureQuadResult {
    if (!sourceElement) return { captured: false };
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    if (
      !this.preparedFor ||
      this.preparedFor.source !== sourceElement ||
      this.preparedFor.canvas !== this.canvas
    ) {
      prepareLiveDomPostProcessSource(sourceElement, this.canvas);
      this.preparedFor = { source: sourceElement, canvas: this.canvas };
    }

    const ok = captureLiveDomElementToCanvas(
      sourceElement,
      this.canvas,
      this.canvas,
      w,
      h,
    );
    if (!ok) return { captured: false };
    this.texture.needsUpdate = true;
    return { captured: true };
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.preparedFor = null;
  }
}
