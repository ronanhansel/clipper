import * as THREE from "three";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import { SceneComposer, type ComposerPass } from "./sceneComposer";
import { LayerNodeSync } from "./layers/LayerNodeSync";
import { CapturePlaneTexture } from "./CapturePlaneTexture";

export interface CompositionRendererOptions {
  width: number;
  height: number;
}

/**
 * `CompositionRenderer` is the through-camera renderer for a single
 * composition. It shows the composition's flat output as seen from the
 * active `CameraObjectProps`. Used by Direct mode (sealed output) and
 * the compose-mode camera PIP.
 *
 * The scene is now a per-FrameObject native Three node graph owned by
 * `LayerNodeSync`. Native types (rect, null) render with their own
 * geometry + shaders; everything else still goes through a UV-crop
 * fallback into a single captured composite (phases 2/3/4 swap those
 * out for native text, image, and per-element capture). The previous
 * "shared composite + depth-only cards + flat background plane" hybrid
 * is gone — every layer now writes its own pixels at its own depth, so
 * the DoF composer pass sees real 3D colour + depth instead of a
 * 2D-flattened wall.
 */
export class CompositionRenderer {
  readonly hostRoot: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly camera: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly renderer: any;
  private composer: SceneComposer;

  private captureTexture: CapturePlaneTexture;
  private layerSync: LayerNodeSync;

  private width: number;
  private height: number;
  private compositionCamera: CameraObjectProps | null = null;
  private sourceElement: Element | null = null;

  constructor(opts: CompositionRendererOptions) {
    // Internal scene/RT/composer always run at the canonical frame
    // resolution so Direct and the camera PIP produce identical pixels
    // regardless of host container size. The canvas's backing store is
    // FRAME_WIDTH × FRAME_HEIGHT; CSS scales the canvas to fit each host.
    // Without this the PIP (small host) ran the DoF pipeline at ~200×113
    // and looked chunky next to Direct's larger backing store.
    void opts;
    this.width = FRAME_WIDTH;
    this.height = FRAME_HEIGHT;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA_OBJECT_PROPS.fov,
      this.width / this.height,
      DEFAULT_CAMERA_OBJECT_PROPS.near,
      DEFAULT_CAMERA_OBJECT_PROPS.far,
    );
    applyCompositionCameraToThree(
      this.camera,
      DEFAULT_CAMERA_OBJECT_PROPS,
      this.width / this.height,
    );

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    // Linear-light pipeline: scene + composer RTs are RGBA16F linear;
    // Three encodes to sRGB on the final write to the default
    // framebuffer (the on-screen canvas). Matches AW/Frostbite/UE5 DoF
    // — bokeh maths must happen in linear space or highlights look
    // muddy and the disc loses shape.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Pixel ratio fixed at 1 — the canonical frame resolution is already
    // the export target. Letting DPR multiply backing-store size would
    // make the canvas larger than the export and pay a cost (≥2x texel
    // fetches in the DoF pass) for no visual gain.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement as HTMLCanvasElement;
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";

    this.composer = new SceneComposer({
      width: this.width,
      height: this.height,
    });

    // Capture canvas is shared infrastructure for the per-element
    // fallback nodes (text, image, svg, etc. until phases 2/3 land
    // native versions). The browser requires `drawElementImage`'s
    // source element to be a descendant of THIS canvas, so all per-
    // layer captures route through it; each fallback node then blits
    // pixels into its own private canvas. Native rect/null nodes
    // ignore it.
    this.captureTexture = new CapturePlaneTexture(FRAME_WIDTH, FRAME_HEIGHT);
    this.layerSync = new LayerNodeSync({
      compositeTexture: this.captureTexture.texture,
      sharedCaptureCanvas: this.captureTexture.canvas,
      sourceRoot: () => this.sourceElement,
    });
    this.scene.add(this.layerSync.group);

    this.hostRoot = document.createElement("div");
    this.hostRoot.style.position = "absolute";
    this.hostRoot.style.inset = "0";
    this.hostRoot.style.overflow = "hidden";
    this.hostRoot.appendChild(this.canvas);
  }

  setCamera(camera: CameraObjectProps | null) {
    this.compositionCamera = camera;
  }

  /**
   * The 2D canvas that backs the through-camera composite capture
   * texture. `drawElementImage` requires the captured source element to
   * be an immediate child of this canvas, so the React owner must mount
   * this canvas into the DOM and nest the source subtree inside it.
   */
  get captureCanvas(): HTMLCanvasElement {
    return this.captureTexture.canvas;
  }

  setViewport(_width: number, _height: number) {
    // No-op. Internal resolution is fixed at FRAME_WIDTH × FRAME_HEIGHT;
    // the canvas's CSS size is driven by the host container. Kept on the
    // API surface so existing call sites (mount + ResizeObserver) don't
    // need to change.
  }

  /**
   * Reconcile the per-layer cards against the current `(part, localTime)`
   * and capture the source element's DOM into the composite texture.
   * Does not render — the caller drives `render()` separately.
   */
  setComposition(
    part: CompositionClip | null,
    localTime: number,
    sourceElement: Element | null,
  ) {
    this.sourceElement = sourceElement;
    this.captureTexture.capture(sourceElement, FRAME_WIDTH, FRAME_HEIGHT);
    this.layerSync.sync(part, localTime);
  }

  /**
   * Replace the composer pass list (e.g. DoF, lens, adjustment layers).
   * Phase 2 uses this to feed the multi-pass DoF pipeline.
   */
  setComposerPasses(passes: ComposerPass[]) {
    this.composer.setPasses(passes);
  }

  render() {
    applyCompositionCameraToThree(
      this.camera,
      this.compositionCamera,
      this.width / this.height,
    );
    this.composer.render(this.renderer, this.scene, this.camera);
  }

  dispose() {
    this.scene.remove(this.layerSync.group);
    this.layerSync.dispose();
    this.captureTexture.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
