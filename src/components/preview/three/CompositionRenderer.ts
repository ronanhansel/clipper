import * as THREE from "three";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { pass } from "three/tsl";
import { getCameraLensPostProcessPass } from "../../../core/cameraEffectsPasses";
import { createCameraDofPass } from "../../../core/effects/postprocess/cameraDof";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CameraObjectProps,
  type CompositionClip,
  type TransitionLayer,
} from "../../../core/types";
import {
  type LayerShadowDebugImage,
  type LayerShadowDiagnostics,
  type LayerShadowObjectDiagnostics,
} from "./layers/LayerShadowSync";
import { CompositionSceneInput } from "./CompositionSceneInput";
import {
  createCameraDofModeNode,
  createCameraLensNode,
} from "./cameraComposerPasses";
import {
  applyGpuPostProcessUniforms,
  createGpuPostProcessNode,
  getGpuPostProcessPassSignature,
} from "./gpuPostProcessNodes";
import {
  applyGpuTransitionCompositeUniforms,
  createGpuTransitionCompositeNode,
  getGpuTransitionCompositeSignature,
} from "./gpuTransitionCompositeNodes";
import type { CompositionRendererBackendSelection } from "./compositionRendererBackend";
import type { PostProcessPass } from "../../../core/effects/types";

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
 * Post-processing runs through Three WebGPU nodes appended to the output
 * pipeline. There is no Direct WebGL fallback; if WebGPU is unavailable the
 * host disables this renderer instead of maintaining a second renderer path.
 */
export class CompositionRenderer {
  readonly hostRoot: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  readonly backendSelection: CompositionRendererBackendSelection;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly renderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuPipeline: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuDofNode: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuScenePass: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webGpuTransitionScenePass: any = null;
  private webGpuOutputSignature = "";
  private webGpuPostProcessSignature = "";
  private webGpuPostProcessPasses: PostProcessPass[] = [];
  private webGpuInitPromise: Promise<unknown> | null = null;
  private webGpuInitFailed = false;
  private pendingRenderFrame = 0;
  private readonly sceneInput: CompositionSceneInput;
  private readonly transitionSceneInput: CompositionSceneInput;
  private webGpuTransitionComposite: {
    layer: TransitionLayer;
    progress: number;
    fromCamera: CameraObjectProps | null;
    toCamera: CameraObjectProps | null;
  } | null = null;
  private readonly shadowDebugPane: HTMLDivElement;
  private readonly shadowDebugCanvas: HTMLCanvasElement;
  private readonly shadowDebugText: HTMLPreElement;

  private width: number;
  private height: number;
  private compositionCamera: CameraObjectProps | null = null;

  constructor(opts: CompositionRendererOptions) {
    // Internal scene/RT output always runs at the canonical frame
    // resolution so Direct and the camera PIP produce identical pixels
    // regardless of host container size. The canvas's backing store is
    // FRAME_WIDTH × FRAME_HEIGHT; CSS scales the canvas to fit each host.
    this.width = FRAME_WIDTH;
    this.height = FRAME_HEIGHT;
    this.backendSelection =
      opts.backendSelection ??
      ({
        kind: "webgpu",
        requested: "auto",
        reason: "webgpu-ready",
      } satisfies CompositionRendererBackendSelection);
    if (this.backendSelection.kind === "disabled") {
      throw new Error("CompositionRenderer requires WebGPU.");
    }

    this.renderer = new WebGPURenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    // Linear-light pipeline: scene + post-process nodes are RGBA16F linear;
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

    this.sceneInput = new CompositionSceneInput({
      width: this.width,
      height: this.height,
      requestRender: () => this.requestCompositionRender(),
    });
    this.transitionSceneInput = new CompositionSceneInput({
      width: this.width,
      height: this.height,
      requestRender: () => this.requestCompositionRender(),
    });
    const scenePass = pass(this.sceneInput.scene, this.sceneInput.camera, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    });
    this.webGpuTransitionScenePass = pass(
      this.transitionSceneInput.scene,
      this.transitionSceneInput.camera,
      {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
      },
    );
    this.webGpuScenePass = scenePass;
    this.webGpuDofNode = scenePass;
    this.webGpuPipeline = new RenderPipeline(this.renderer, scenePass);
    this.webGpuOutputSignature = "scene";
    this.webGpuInitPromise = this.renderer
      .init()
      .then(() => {
        this.sceneInput.renderSnapshot(this.renderer, true);
        this.transitionSceneInput.renderSnapshot(this.renderer, true);
        this.render();
      })
      .catch((error: unknown) => {
        this.webGpuInitFailed = true;
        console.error("CompositionRenderer WebGPU init failed", error);
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
    this.sceneInput.applyCamera(camera);
    this.webGpuTransitionComposite = null;
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
    return this.sceneInput.captureCanvas;
  }

  get transitionCaptureCanvas(): HTMLCanvasElement {
    return this.transitionSceneInput.captureCanvas;
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
    this.webGpuTransitionComposite = null;
    this.sceneInput.syncComposition(
      part,
      localTime,
      sourceElement,
      this.renderer,
      this.renderer.initialized === true,
      options,
    );
    this.updateShadowDebugPane();
  }

  setTransitionComposition(input: {
    from: {
      part: CompositionClip;
      localTime: number;
      sourceElement: Element | null;
      camera: CameraObjectProps | null;
    };
    to: {
      part: CompositionClip;
      localTime: number;
      sourceElement: Element | null;
      camera: CameraObjectProps | null;
    };
    layer: TransitionLayer;
    progress: number;
    options?: { syncShadows?: boolean; isPlaying?: boolean };
  }) {
    const options = input.options ?? {};
    this.compositionCamera = input.from.camera;
    this.sceneInput.applyCamera(input.from.camera);
    this.transitionSceneInput.applyCamera(input.to.camera);
    this.sceneInput.syncComposition(
      input.from.part,
      input.from.localTime,
      input.from.sourceElement,
      this.renderer,
      this.renderer.initialized === true,
      options,
    );
    this.transitionSceneInput.syncComposition(
      input.to.part,
      input.to.localTime,
      input.to.sourceElement,
      this.renderer,
      this.renderer.initialized === true,
      options,
    );
    this.webGpuTransitionComposite = {
      layer: input.layer,
      progress: input.progress,
      fromCamera: input.from.camera,
      toCamera: input.to.camera,
    };
    this.syncWebGpuOutputNode(input.from.camera);
    this.updateShadowDebugPane();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setComposerPasses(passes: any[]) {
    disposeComposerPasses(passes);
  }

  setGpuPostProcessPasses(passes: readonly PostProcessPass[]) {
    const signature = getGpuPostProcessPassSignature(passes);
    if (signature === this.webGpuPostProcessSignature) {
      applyGpuPostProcessUniforms(this.webGpuPostProcessPasses, passes);
      return;
    }
    this.webGpuPostProcessSignature = signature;
    this.webGpuPostProcessPasses = passes.slice();
    this.syncWebGpuOutputNode(this.compositionCamera);
  }

  render() {
    this.sceneInput.applyCamera(this.compositionCamera);
    if (this.webGpuInitFailed || this.renderer.initialized !== true) return;
    this.webGpuPipeline.render();
  }

  private requestCompositionRender() {
    if (this.pendingRenderFrame) return;
    this.pendingRenderFrame = requestAnimationFrame(() => {
      this.pendingRenderFrame = 0;
      this.renderCompositionSnapshot();
    });
  }

  private renderCompositionSnapshot() {
    this.sceneInput.renderSnapshot(
      this.renderer,
      this.renderer.initialized === true,
    );
    this.transitionSceneInput.renderSnapshot(
      this.renderer,
      this.renderer.initialized === true,
    );
    this.render();
  }

  private updateShadowDebugPane() {
    const diagnostics = this.sceneInput.getShadowDiagnostics();
    if (diagnostics.light?.debug !== true) {
      this.shadowDebugPane.style.display = "none";
      return;
    }
    if (this.shadowDebugPane.parentElement !== document.body) {
      document.body.appendChild(this.shadowDebugPane);
    }
    const debug =
      this.sceneInput.readShadowDebugImageData(this.renderer, 64) ??
      this.sceneInput.getCachedShadowDebugImage();
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
    if (this.pendingRenderFrame) {
      cancelAnimationFrame(this.pendingRenderFrame);
      this.pendingRenderFrame = 0;
    }
    this.sceneInput.dispose();
    this.transitionSceneInput.dispose();
    this.webGpuDofNode?.dispose?.();
    this.webGpuPipeline?.dispose?.();
    this.renderer.dispose();
    this.shadowDebugPane.remove();
  }

  private syncWebGpuOutputNode(camera: CameraObjectProps | null): void {
    if (!this.webGpuPipeline) return;
    const transitionSignature = this.webGpuTransitionComposite
      ? getGpuTransitionCompositeSignature(this.webGpuTransitionComposite.layer)
      : null;
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
    const outputSignature = JSON.stringify({
      camera: signature,
      postProcess: this.webGpuPostProcessSignature,
      transition: transitionSignature,
    });
    if (outputSignature === this.webGpuOutputSignature) {
      applyGpuTransitionCompositeUniforms(
        this.webGpuTransitionComposite?.layer ?? null,
        { progress: this.webGpuTransitionComposite?.progress ?? 0 },
      );
      return;
    }
    this.webGpuOutputSignature = outputSignature;
    let outputNode = this.createCameraOutputNode(
      this.webGpuScenePass,
      camera,
      dofPass,
      lensPass,
    );
    if (this.webGpuTransitionComposite) {
      const toLensPass = this.webGpuTransitionComposite.toCamera
        ? getCameraLensPostProcessPass(
            this.webGpuTransitionComposite.toCamera,
            {
              idScope: "transition-to-camera",
              frameSize: { width: this.width, height: this.height },
            },
          )
        : null;
      const toDofPass =
        this.webGpuTransitionComposite.toCamera &&
        hasWebGpuDof(this.webGpuTransitionComposite.toCamera)
          ? createCameraDofPass(
              this.webGpuTransitionComposite.toCamera,
              "transition-to-camera",
            )
          : null;
      const toNode = this.createCameraOutputNode(
        this.webGpuTransitionScenePass,
        this.webGpuTransitionComposite.toCamera,
        toDofPass,
        toLensPass,
      );
      outputNode = createGpuTransitionCompositeNode({
        fromNode: outputNode,
        toNode,
        layer: this.webGpuTransitionComposite.layer,
        progress: this.webGpuTransitionComposite.progress,
      });
    }
    for (const postProcessPass of this.webGpuPostProcessPasses) {
      outputNode = createGpuPostProcessNode(outputNode, postProcessPass, {
        width: this.width,
        height: this.height,
      });
    }
    this.webGpuPipeline.outputNode = outputNode;
    this.webGpuPipeline.needsUpdate = true;
  }

  private createCameraOutputNode(
    scenePass: any,
    camera: CameraObjectProps | null,
    dofPass: ReturnType<typeof createCameraDofPass>,
    lensPass: ReturnType<typeof getCameraLensPostProcessPass>,
  ) {
    let outputNode =
      camera && dofPass
        ? createCameraDofModeNode(
            scenePass,
            scenePass.getViewZNode(),
            dofPass,
            {
              width: this.width,
              height: this.height,
            },
          )
        : scenePass;
    outputNode = lensPass
      ? createCameraLensNode(outputNode, lensPass, {
          width: this.width,
          height: this.height,
        })
      : outputNode;
    return outputNode;
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
