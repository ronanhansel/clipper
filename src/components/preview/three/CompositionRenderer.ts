import * as THREE from "three";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { pass } from "three/tsl";
import { getCameraLensPostProcessPass } from "../../../core/cameraEffectsPasses";
import { createCameraDofPass } from "../../../core/effects/postprocess/cameraDof";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
} from "../../../core/types";
import { applyCompositionCameraToThree } from "./compositionCameraThree";
import { LayerNodeSync } from "./layers/LayerNodeSync";
import {
  LayerShadowSync,
  type LayerShadowDebugImage,
  type LayerShadowDiagnostics,
  type LayerShadowObjectDiagnostics,
} from "./layers/LayerShadowSync";
import { SharedCaptureCanvas } from "./SharedCaptureCanvas";
import {
  createCameraDofModeNode,
  createCameraLensNode,
} from "./cameraComposerPasses";
import { ThinLensRenderPass } from "./ThinLensRenderPass";
import type { CompositionRendererBackendSelection } from "./compositionRendererBackend";

export interface CompositionRendererOptions {
  width: number;
  height: number;
  backendSelection?: CompositionRendererBackendSelection;
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
  readonly backendSelection: CompositionRendererBackendSelection;

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
  private outputPass: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extraPasses: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuPipeline: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuDofNode: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuScenePass: any = null;
  private webGpuOutputSignature = "";
  private webGpuInitPromise: Promise<unknown> | null = null;
  private webGpuInitFailed = false;
  private sharedCapture: SharedCaptureCanvas;
  private layerSync: LayerNodeSync;
  private shadowSync: LayerShadowSync;
  private readonly shadowDebugPane: HTMLDivElement;
  private readonly shadowDebugCanvas: HTMLCanvasElement;
  private readonly shadowDebugText: HTMLPreElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private backgroundMesh: any;

  private width: number;
  private height: number;
  private compositionCamera: CameraObjectProps | null = null;
  private sourceElement: Element | null = null;
  private lastComposition: {
    part: CompositionClip | null;
    localTime: number;
    sourceElement: Element | null;
    options: { syncShadows?: boolean; isPlaying?: boolean };
  } | null = null;

  constructor(opts: CompositionRendererOptions) {
    // Internal scene/RT/composer always run at the canonical frame
    // resolution so Direct and the camera PIP produce identical pixels
    // regardless of host container size. The canvas's backing store is
    // FRAME_WIDTH × FRAME_HEIGHT; CSS scales the canvas to fit each host.
    this.width = FRAME_WIDTH;
    this.height = FRAME_HEIGHT;
    this.backendSelection =
      opts.backendSelection ??
      ({
        kind: "webgl",
        requested: "auto",
        reason: "legacy-default",
      } satisfies CompositionRendererBackendSelection);

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

    const isWebGpu = this.backendSelection.kind === "webgpu";
    this.renderer = isWebGpu
      ? new WebGPURenderer({
          alpha: true,
          antialias: true,
          premultipliedAlpha: true,
        })
      : new THREE.WebGLRenderer({
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

    if (isWebGpu) {
      const scenePass = pass(this.scene, this.camera, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
      });
      this.webGpuScenePass = scenePass;
      this.webGpuDofNode = scenePass;
      this.webGpuPipeline = new RenderPipeline(this.renderer, scenePass);
      this.webGpuOutputSignature = "scene";
      this.webGpuInitPromise = this.renderer
        .init()
        .then(() => {
          if (this.lastComposition) {
            this.setComposition(
              this.lastComposition.part,
              this.lastComposition.localTime,
              this.lastComposition.sourceElement,
              this.lastComposition.options,
            );
          }
          this.render();
        })
        .catch((error: unknown) => {
          this.webGpuInitFailed = true;
          console.error("CompositionRenderer WebGPU init failed", error);
        });
    } else {
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
      this.renderPass = new ThinLensRenderPass(this.scene, this.camera, {
        width: this.width,
        height: this.height,
        getCamera: () => this.compositionCamera,
      });
      this.outputPass = new OutputPass();
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.outputPass);
    }

    // The shared capture canvas is the DOM mount the host portals the
    // source subtree into. Per-element capture nodes call
    // `drawElementImage` on its 2D context (browsers require the
    // captured element to be a descendant of THIS canvas), then blit
    // pixels into their own private canvases. Native rect/null nodes
    // ignore it.
    this.sharedCapture = new SharedCaptureCanvas(FRAME_WIDTH, FRAME_HEIGHT);
    this.layerSync = new LayerNodeSync({
      materialBackend:
        this.backendSelection.kind === "webgpu"
          ? "webgpu-node"
          : "webgl-shader",
      sharedCapture: this.sharedCapture,
      sourceRoot: () => this.sourceElement,
      requestRender: () => this.requestCompositionRender(),
    });
    this.scene.add(this.layerSync.group);
    this.shadowSync = new LayerShadowSync({
      backend:
        this.backendSelection.kind === "webgpu"
          ? "webgpu-node"
          : "webgl-shader",
    });
    this.shadowDebugPane = document.createElement("div");
    this.shadowDebugPane.style.position = "fixed";
    this.shadowDebugPane.style.left = "12px";
    this.shadowDebugPane.style.top = "12px";
    this.shadowDebugPane.style.zIndex = "2147483647";
    this.shadowDebugPane.style.display = "none";
    this.shadowDebugPane.style.gridTemplateColumns = "64px minmax(0, 1fr)";
    this.shadowDebugPane.style.alignItems = "start";
    this.shadowDebugPane.style.gap = "8px";
    this.shadowDebugPane.style.maxWidth = "min(620px, calc(100vw - 24px))";
    this.shadowDebugPane.style.maxHeight = "min(72vh, calc(100vh - 24px))";
    this.shadowDebugPane.style.overflow = "auto";
    this.shadowDebugPane.style.overscrollBehavior = "contain";
    this.shadowDebugPane.style.boxSizing = "border-box";
    this.shadowDebugPane.style.padding = "8px";
    this.shadowDebugPane.style.border = "1px solid rgba(255,255,255,0.18)";
    this.shadowDebugPane.style.borderRadius = "6px";
    this.shadowDebugPane.style.background = "rgba(8,10,12,0.84)";
    this.shadowDebugPane.style.color = "#f4f7fb";
    this.shadowDebugPane.style.font =
      "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace";
    this.shadowDebugPane.style.pointerEvents = "auto";
    this.shadowDebugCanvas = document.createElement("canvas");
    this.shadowDebugCanvas.width = 64;
    this.shadowDebugCanvas.height = 64;
    this.shadowDebugCanvas.style.width = "64px";
    this.shadowDebugCanvas.style.height = "64px";
    this.shadowDebugCanvas.style.flex = "0 0 auto";
    this.shadowDebugCanvas.style.imageRendering = "pixelated";
    this.shadowDebugCanvas.style.border = "1px solid rgba(255,255,255,0.2)";
    this.shadowDebugText = document.createElement("pre");
    this.shadowDebugText.style.margin = "0";
    this.shadowDebugText.style.whiteSpace = "pre-wrap";
    this.shadowDebugText.style.overflowWrap = "anywhere";
    this.shadowDebugText.style.minWidth = "0";
    this.shadowDebugPane.append(this.shadowDebugCanvas, this.shadowDebugText);

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
    this.hostRoot.dataset.clipperCompositionRendererBackend =
      this.backendSelection.kind;
    this.hostRoot.dataset.clipperCompositionRendererBackendRequested =
      this.backendSelection.requested;
    this.hostRoot.dataset.clipperCompositionRendererBackendReason =
      this.backendSelection.reason;
    this.hostRoot.style.position = "absolute";
    this.hostRoot.style.inset = "0";
    this.hostRoot.style.overflow = "hidden";
    this.hostRoot.appendChild(this.canvas);
  }

  setCamera(camera: CameraObjectProps | null) {
    this.compositionCamera = camera;
    this.syncWebGpuOutputNode(camera);
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
    options: { syncShadows?: boolean; isPlaying?: boolean } = {},
  ) {
    this.lastComposition = { part, localTime, sourceElement, options };
    if (sourceElement !== this.sourceElement) {
      this.sourceElement = sourceElement;
      this.sharedCapture.prepare(sourceElement);
    }
    this.layerSync.sync(part, localTime, { isPlaying: options.isPlaying });
    if (
      this.backendSelection.kind === "webgpu" &&
      this.renderer.initialized !== true
    ) {
      this.layerSync.applyShadow(this.shadowSync.getState());
      this.updateShadowDebugPane();
      return;
    }
    if (options.syncShadows === false) {
      this.layerSync.applyShadow(this.shadowSync.getState());
    } else {
      const shadow = this.shadowSync.sync(
        part,
        localTime,
        this.renderer,
        this.layerSync.group,
      );
      this.layerSync.applyShadow(shadow);
    }
    this.updateShadowDebugPane();
  }

  /**
   * Replace the composer pass list (DoF, lens, etc). Pass instances are
   * Three.js `Pass` subclasses. Always preserves the leading
   * `RenderPass` and rebuilds the chain after it. Phase 2 uses this to
   * feed the camera DoF + lens chain.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setComposerPasses(passes: any[]) {
    if (this.backendSelection.kind === "webgpu") {
      disposeComposerPasses(passes);
      return;
    }
    // Remove previously appended passes (Three's EffectComposer doesn't
    // expose a clear-from-index, so do it explicitly).
    for (const p of this.extraPasses) {
      this.composer.removePass(p);
      if (typeof p.dispose === "function") p.dispose();
    }
    this.composer.removePass(this.outputPass);
    this.extraPasses = passes.slice();
    for (const p of this.extraPasses) {
      this.composer.addPass(p);
    }
    this.composer.addPass(this.outputPass);
  }

  render() {
    applyCompositionCameraToThree(
      this.camera,
      this.compositionCamera,
      this.width / this.height,
    );
    if (this.backendSelection.kind === "webgpu") {
      if (this.webGpuInitFailed || this.renderer.initialized !== true) return;
      this.webGpuPipeline.render();
      return;
    }
    this.composer.render();
  }

  private requestCompositionRender() {
    if (!this.lastComposition) {
      this.render();
      return;
    }
    this.setComposition(
      this.lastComposition.part,
      this.lastComposition.localTime,
      this.lastComposition.sourceElement,
      this.lastComposition.options,
    );
    this.render();
  }

  private updateShadowDebugPane() {
    const diagnostics = this.shadowSync.getDiagnostics();
    if (diagnostics.light?.debug !== true) {
      this.shadowDebugPane.style.display = "none";
      return;
    }
    if (this.shadowDebugPane.parentElement !== document.body) {
      document.body.appendChild(this.shadowDebugPane);
    }
    const debug =
      this.shadowSync.readDebugImageData(this.renderer, 64) ??
      this.shadowSync.getCachedDebugImage();
    if (debug) {
      this.shadowDebugCanvas.getContext("2d")?.putImageData(debug.image, 0, 0);
      drawObjectOverlays(this.shadowDebugCanvas, debug.objects);
    } else {
      drawShadowDiagnosticMap(this.shadowDebugCanvas, diagnostics);
    }
    this.shadowDebugText.textContent = formatShadowDebugText(
      diagnostics,
      debug,
    );
    this.shadowDebugPane.style.display = "grid";
  }

  dispose() {
    this.scene.remove(this.layerSync.group);
    this.layerSync.dispose();
    this.shadowSync.dispose();
    this.scene.remove(this.backgroundMesh);
    this.backgroundMesh.geometry.dispose();
    this.backgroundMesh.material.dispose();
    this.sharedCapture.dispose();
    for (const p of this.extraPasses) {
      if (typeof p.dispose === "function") p.dispose();
    }
    this.extraPasses.length = 0;
    this.webGpuDofNode?.dispose?.();
    this.webGpuPipeline?.dispose?.();
    this.composer?.dispose?.();
    this.renderPass?.dispose?.();
    this.outputPass?.dispose?.();
    this.renderer.dispose();
    this.shadowDebugPane.remove();
  }

  private syncWebGpuOutputNode(camera: CameraObjectProps | null): void {
    if (this.backendSelection.kind !== "webgpu" || !this.webGpuPipeline) return;
    const lensPass = camera
      ? getCameraLensPostProcessPass(camera, {
          idScope: "camera",
          frameSize: { width: this.width, height: this.height },
        })
      : null;
    const dofPass =
      camera && hasWebGpuDof(camera)
        ? createCameraDofPass(camera, "camera")
        : null;
    const signature = getWebGpuCameraEffectsSignature(dofPass, lensPass);
    if (signature === this.webGpuOutputSignature) return;
    this.webGpuOutputSignature = signature;
    const dofNode = dofPass
      ? createCameraDofModeNode(
          this.webGpuScenePass,
          this.webGpuScenePass.getViewZNode(),
          dofPass,
          {
            width: this.width,
            height: this.height,
          },
        )
      : this.webGpuDofNode;
    this.webGpuPipeline.outputNode = lensPass
      ? createCameraLensNode(dofNode, lensPass, {
          width: this.width,
          height: this.height,
        })
      : dofNode;
    this.webGpuPipeline.needsUpdate = true;
  }
}

function getWebGpuCameraEffectsSignature(
  dofPass: ReturnType<typeof createCameraDofPass>,
  lensPass: ReturnType<typeof getCameraLensPostProcessPass>,
): string {
  const dof = dofPass?.uniforms;
  const lens = lensPass?.uniforms;
  return JSON.stringify({
    dof: dof
      ? {
          sensorHeight: dof.sensorHeight,
          fov: dof.fov,
          focusDistance: dof.focusDistance,
          fNumber: dof.fNumber,
          maxBlurPx: dof.maxBlurPx,
          debug: dof.debug,
          blurMode: dof.blurMode,
          near: dof.near,
          far: dof.far,
        }
      : null,
    lens: lens ?? null,
  });
}

function hasWebGpuDof(camera: CameraObjectProps): boolean {
  return Boolean(
    camera.dof.enabled &&
    camera.dof.fNumber > 0 &&
    camera.dof.maxBlurPx > 0 &&
    Number.isFinite(camera.dof.focusDistance) &&
    camera.dof.focusDistance >= 0,
  );
}

function disposeComposerPasses(passes: any[]): void {
  for (const pass of passes) {
    if (typeof pass?.dispose === "function") pass.dispose();
  }
}

function formatShadowDebugText(
  diagnostics: LayerShadowDiagnostics,
  debug: LayerShadowDebugImage | null,
) {
  const light = diagnostics.light;
  const objects = debug?.objects ?? diagnostics.objects;
  const insideCount = objects.filter((object) => object.shadow.inside).length;
  const outsideCount = objects.length - insideCount;
  const lines = [
    `shadow ${diagnostics.reason}`,
    light
      ? `light ${light.id} ${light.kind} range=${round(light.range)} angle=${round(light.angle)}`
      : "light none",
    `casters ${diagnostics.casterIds.length} rendered=${diagnostics.render.visibleCasters}`,
    `map objects inside=${insideCount} outside=${outsideCount}`,
  ];
  if (debug) {
    lines.push(
      `map depth=${round(debug.map.minDepth)}..${round(debug.map.maxDepth)} samples=${debug.map.nonClearSamples}/${debug.map.totalSamples}`,
    );
  } else if (diagnostics.active) {
    lines.push("map depth pending (readback in progress)");
  }
  for (const object of objects) {
    const shadow = object.shadow;
    const state = shadow.inside
      ? shadow.blockedAfterBias == null
        ? "mapped"
        : shadow.blockedAfterBias
          ? "blocked"
          : "lit"
      : "outside";
    const depthInfo =
      shadow.closestDepth != null
        ? `closest=${round(shadow.closestDepth)} delta=${round(shadow.depthDelta!)} blocked=${shadow.blockedAfterBias}`
        : `depth=${round(shadow.depth)}`;
    lines.push(
      `${object.id} ${object.type} ${state} cast=${object.casts} uv=${round(shadow.u)},${round(shadow.v)} ${depthInfo}`,
    );
  }
  return lines.join("\n");
}

function drawObjectOverlays(
  canvas: HTMLCanvasElement,
  objects: LayerShadowObjectDiagnostics[],
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  for (const object of objects) {
    const shadow = object.shadow;
    const x = shadow.u * width;
    const y = (1 - shadow.v) * height;
    const inside =
      shadow.inside && x >= 0 && x <= width && y >= 0 && y <= height;
    context.fillStyle = inside
      ? object.casts
        ? shadow.blockedAfterBias
          ? "rgb(255, 170, 50)"
          : "rgb(69, 214, 103)"
        : "rgb(82, 151, 255)"
      : "rgb(255, 83, 83)";
    context.beginPath();
    context.arc(
      Math.min(width, Math.max(0, x)),
      Math.min(height, Math.max(0, y)),
      2.5,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
}

function drawShadowDiagnosticMap(
  canvas: HTMLCanvasElement,
  diagnostics: LayerShadowDiagnostics,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgb(6, 8, 12)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const p = (i / 4) * width;
    context.beginPath();
    context.moveTo(p, 0);
    context.lineTo(p, height);
    context.moveTo(0, p);
    context.lineTo(width, p);
    context.stroke();
  }
  for (const object of diagnostics.objects) {
    const shadow = object.shadow;
    const x = shadow.u * width;
    const y = (1 - shadow.v) * height;
    const inside =
      shadow.inside && x >= 0 && x <= width && y >= 0 && y <= height;
    context.fillStyle = inside
      ? object.casts
        ? "rgb(69, 214, 103)"
        : "rgb(82, 151, 255)"
      : "rgb(255, 83, 83)";
    context.beginPath();
    context.arc(
      Math.min(width, Math.max(0, x)),
      Math.min(height, Math.max(0, y)),
      3,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.fillStyle = "rgba(255,255,255,0.88)";
    context.font = "8px ui-monospace, monospace";
    context.fillText(
      object.type.slice(0, 1).toUpperCase(),
      Math.min(width - 5, Math.max(1, x + 4)),
      Math.min(height - 2, Math.max(8, y - 4)),
    );
  }
}

function round(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : String(value);
}
