import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import { LayerNodeSync } from "./layers/LayerNodeSync";
import { SharedCaptureCanvas } from "./SharedCaptureCanvas";

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
 * The scene is a per-FrameObject native Three node graph owned by
 * `LayerNodeSync`. Native types (rect, null) render with their own
 * geometry + shaders; everything else uses `PerElementCaptureNode`,
 * which captures just that layer's DOM subtree into its own private
 * canvas + texture (no shared composite, no UV crop). Phase B replaces
 * image/text/svg with native primitives.
 *
 * Post-processing runs through Three's `EffectComposer` chain. The
 * composer's read RT carries a `DepthTexture` so the camera DoF pass
 * can sample scene depth without re-rendering the scene as
 * MeshDepthMaterial. Phases beyond DoF (lens distortion, CA) chain on
 * after as additional `Pass`es.
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private composer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private renderPass: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extraPasses: any[] = [];

  private sharedCapture: SharedCaptureCanvas;
  private layerSync: LayerNodeSync;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private backgroundMesh: any;

  private width: number;
  private height: number;
  private compositionCamera: CameraObjectProps | null = null;
  private sourceElement: Element | null = null;

  constructor(opts: CompositionRendererOptions) {
    // Internal scene/RT/composer always run at the canonical frame
    // resolution so Direct and the camera PIP produce identical pixels
    // regardless of host container size. The canvas's backing store is
    // FRAME_WIDTH × FRAME_HEIGHT; CSS scales the canvas to fit each host.
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
    // Opaque black clear. Real-physics DoF integrates against actual
    // surfaces; transparent void in the back of the frame would let the
    // bokeh gather sum bright glyph edges with `(0,0,0,0)` taps and
    // produce a soft halo around every silhouette. The far-plane
    // background mesh added below gives the camera a real "wall" at the
    // far clip so every pixel has geometry, real depth, and a defined
    // colour to integrate over.
    this.renderer.setClearColor(0x000000, 1);
    this.canvas = this.renderer.domElement as HTMLCanvasElement;
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";

    // Build EffectComposer with a custom read RT that carries a
    // DepthTexture. RenderPass writes the beauty into this RT (and its
    // depth attachment); the camera DoF pass reads `readBuffer.depthTexture`
    // to compute its CoC. The clone for ping-pong gets a depth attachment
    // too so the depth survives a swap (EffectComposer.clone() preserves
    // the `depthBuffer` flag and the `DepthTexture`).
    const depthTexture = new THREE.DepthTexture(
      this.width,
      this.height,
      THREE.UnsignedShortType,
    );
    const composerRT = new THREE.WebGLRenderTarget(this.width, this.height, {
      depthBuffer: true,
      depthTexture,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      colorSpace: THREE.LinearSRGBColorSpace,
      // Mipmap chain on the colour attachment so the DoF pass can
      // sample area-averaged colour at LOD = log2(σ_tap) per tap. This
      // is what lets a 60-tap Vogel gather look like a high-quality
      // bokeh: each tap's read is an integral over an area matched to
      // its CoC, instead of one random texel that produces ghost-letter
      // and grain artefacts on text content (Pixelmischief, "Bokeh
      // Depth-of-Field"). Three's WebGLRenderer regenerates these
      // mipmaps automatically on `setRenderTarget` transitions.
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.composer = new EffectComposer(this.renderer, composerRT);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // The shared capture canvas is the DOM mount the host portals the
    // source subtree into. Per-element capture nodes call
    // `drawElementImage` on its 2D context (browsers require the
    // captured element to be a descendant of THIS canvas), then blit
    // pixels into their own private canvases. Native rect/null nodes
    // ignore it.
    this.sharedCapture = new SharedCaptureCanvas(FRAME_WIDTH, FRAME_HEIGHT);
    this.layerSync = new LayerNodeSync({
      sharedCapture: this.sharedCapture,
      sourceRoot: () => this.sourceElement,
    });
    this.scene.add(this.layerSync.group);

    // Far-plane background. Without a real surface in the back of the
    // frame the depth attachment reads `1.0` (cleared) on void pixels,
    // which the DoF CoC math turns into a large blur with no colour to
    // integrate against — a soft halo bleeds out of every layer
    // silhouette. A single fullscreen mesh at world `z = -far + ε`
    // gives every pixel real geometry, real depth, and a defined
    // colour. Larger than the scene's far clip would clip; we sit just
    // inside it. Geometry is enormous so any plausible camera FOV /
    // composition framing keeps the plane fully covering the frustum.
    const backgroundDistance =
      DEFAULT_CAMERA_OBJECT_PROPS.far - DEFAULT_CAMERA_OBJECT_PROPS.near;
    this.backgroundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(backgroundDistance * 4, backgroundDistance * 4),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
        transparent: false,
      }),
    );
    this.backgroundMesh.name = "CompositionFarPlane";
    this.backgroundMesh.position.set(
      0,
      0,
      -(DEFAULT_CAMERA_OBJECT_PROPS.far - 1),
    );
    this.backgroundMesh.renderOrder = -1000;
    this.scene.add(this.backgroundMesh);

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
   * The 2D canvas that backs the shared DOM-capture root. Per-element
   * capture nodes call `drawElementImage` on this canvas's context,
   * which requires the captured element to be one of its descendants.
   * The React owner must mount this canvas into the DOM and nest the
   * source subtree inside it.
   */
  get captureCanvas(): HTMLCanvasElement {
    return this.sharedCapture.canvas;
  }

  setViewport(_width: number, _height: number) {
    // No-op. Internal resolution is fixed at FRAME_WIDTH × FRAME_HEIGHT;
    // the canvas's CSS size is driven by the host container. Kept on the
    // API surface so existing call sites (mount + ResizeObserver) don't
    // need to change.
  }

  /**
   * Reconcile the per-layer nodes against the current `(part, localTime)`.
   * The shared capture canvas is `prepare()`d only when the source
   * element transitions — `prepare` flips the experimental
   * `layoutSubtree` flag and invokes the paint hook, both of which are
   * idempotent but not free. Each per-element capture node performs its
   * own `drawElementImage` call inside `update()`. Does not render —
   * the caller drives `render()` separately.
   */
  setComposition(
    part: CompositionClip | null,
    localTime: number,
    sourceElement: Element | null,
  ) {
    if (sourceElement !== this.sourceElement) {
      this.sourceElement = sourceElement;
      this.sharedCapture.prepare(sourceElement);
    }
    this.layerSync.sync(part, localTime);
  }

  /**
   * Replace the composer pass list (DoF, lens, etc). Pass instances are
   * Three.js `Pass` subclasses. Always preserves the leading
   * `RenderPass` and rebuilds the chain after it. Phase 2 uses this to
   * feed the camera DoF + lens chain.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setComposerPasses(passes: any[]) {
    // Remove previously appended passes (Three's EffectComposer doesn't
    // expose a clear-from-index, so do it explicitly). Disposal of the
    // pass instances themselves is the caller's job — the composer
    // doesn't own them.
    for (const p of this.extraPasses) {
      this.composer.removePass(p);
    }
    this.extraPasses = passes.slice();
    for (const p of this.extraPasses) {
      this.composer.addPass(p);
    }
  }

  render() {
    applyCompositionCameraToThree(
      this.camera,
      this.compositionCamera,
      this.width / this.height,
    );
    this.composer.render();
  }

  dispose() {
    this.scene.remove(this.layerSync.group);
    this.layerSync.dispose();
    this.scene.remove(this.backgroundMesh);
    this.backgroundMesh.geometry.dispose();
    this.backgroundMesh.material.dispose();
    this.sharedCapture.dispose();
    // Drop refs to extra passes (caller owns disposal) before disposing
    // the composer so its `dispose()` only releases its own RTs +
    // copyPass.
    this.extraPasses.length = 0;
    this.composer.dispose();
    this.renderer.dispose();
  }
}
