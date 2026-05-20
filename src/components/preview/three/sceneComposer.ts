import * as THREE from "three";

/**
 * Input bag passed to each `ComposerPass.render` call. Pass implementations
 * read from `inputColor` (and optionally `inputDepth`), draw to `output`
 * (or to the default framebuffer when `output` is null), and use `width`
 * and `height` for any internal RT sizing.
 */
export interface ComposerPassRenderInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputColor: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputDepth: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output: any | null;
  width: number;
  height: number;
}

export interface ComposerPass {
  /** Stable id for debugging. */
  readonly id: string;
  render(input: ComposerPassRenderInput): void;
  /** Optional: composer notifies passes on resize so they can resize internal RTs. */
  setSize?(width: number, height: number): void;
  dispose(): void;
}

export interface SceneComposerOptions {
  width: number;
  height: number;
}

const FULLSCREEN_VERT = `
  varying vec2 v_uv;
  void main() {
    v_uv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLIT_FRAG = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_image;
  void main() {
    gl_FragColor = texture2D(u_image, v_uv);
  }
`;

/**
 * Shared fullscreen-quad scene + camera used by built-in passes. We keep
 * this module-scoped so a process only ever pays for one geometry. Each
 * pass instantiates its own ShaderMaterial and Mesh; they all reuse the
 * same plane geometry.
 */
const FULLSCREEN_GEOMETRY = new THREE.PlaneGeometry(2, 2);
const FULLSCREEN_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * Built-in fullscreen-quad pass that copies its `inputColor` texture to
 * its `output` target (or to the default framebuffer when `output` is
 * null). `SceneComposer` uses an internal instance to present the
 * primary RT when no custom passes are registered.
 */
export class BlitPass implements ComposerPass {
  readonly id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly material: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly scene: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly mesh: any;

  constructor(id: string = "blit") {
    this.id = id;
    this.material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLIT_FRAG,
      uniforms: { u_image: { value: null } },
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(FULLSCREEN_GEOMETRY, this.material);
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
  }

  render(input: ComposerPassRenderInput): void {
    this.material.uniforms.u_image.value = input.inputColor;
    input.renderer.setRenderTarget(input.output);
    input.renderer.render(this.scene, FULLSCREEN_CAMERA);
  }

  dispose(): void {
    this.material.dispose();
    // Geometry is module-shared; do not dispose here.
  }
}

/**
 * Minimal scene composer. Owns a primary `WebGLRenderTarget` (with a
 * `DepthTexture` attached) and a secondary plain colour RT used as a
 * ping-pong target between passes.
 *
 * `render(scene, camera)` flow:
 *   1. Render the scene into the primary RT.
 *   2. With zero passes: built-in `BlitPass` copies primary → default FB.
 *   3. With N passes: ping-pong primary ↔ secondary, last pass writes to
 *      the default FB (output: null).
 *
 * The composer never auto-disposes user-supplied passes (callers may
 * share them across compositions). It does dispose its built-in blit
 * pass and both RTs in `dispose()`.
 */
export class SceneComposer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly primaryRenderTarget: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly secondaryRenderTarget: any;

  private passes: ComposerPass[] = [];
  private readonly presentBlit: BlitPass;
  private width: number;
  private height: number;

  constructor(opts: SceneComposerOptions) {
    this.width = Math.max(1, Math.floor(opts.width));
    this.height = Math.max(1, Math.floor(opts.height));

    const depthTexture = new THREE.DepthTexture(
      this.width,
      this.height,
      THREE.UnsignedShortType,
    );
    // RGBA16F so the bokeh gather can work in linear-light HDR. Karis's
    // weight = 1/(1+luma) prefilter produces premultiplied values that
    // exceed [0,1] mid-pipeline; an RGBA8 RT would clamp them and
    // collapse bokeh "shape" into mush. Half-float is enough — full
    // float doubles bandwidth for no visual gain at 1080p.
    this.primaryRenderTarget = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      {
        depthBuffer: true,
        depthTexture,
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.LinearSRGBColorSpace,
      },
    );
    this.secondaryRenderTarget = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        colorSpace: THREE.LinearSRGBColorSpace,
      },
    );
    this.presentBlit = new BlitPass("composer.present");
  }

  setPasses(passes: ComposerPass[]): void {
    this.passes = passes.slice();
    for (const pass of this.passes) {
      pass.setSize?.(this.width, this.height);
    }
  }

  getPasses(): readonly ComposerPass[] {
    return this.passes;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.primaryRenderTarget.setSize(w, h);
    this.secondaryRenderTarget.setSize(w, h);
    for (const pass of this.passes) {
      pass.setSize?.(w, h);
    }
  }

  render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scene: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    camera: any,
  ): void {
    // 1. Render scene into the primary RT.
    renderer.setRenderTarget(this.primaryRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);

    // 2. Run passes (or built-in present blit if none).
    if (this.passes.length === 0) {
      this.presentBlit.render({
        renderer,
        inputColor: this.primaryRenderTarget.texture,
        inputDepth: this.primaryRenderTarget.depthTexture ?? null,
        output: null,
        width: this.width,
        height: this.height,
      });
    } else {
      let readRT = this.primaryRenderTarget;
      let writeRT = this.secondaryRenderTarget;
      for (let i = 0; i < this.passes.length; i++) {
        const pass = this.passes[i];
        const isLast = i === this.passes.length - 1;
        const output = isLast ? null : writeRT;
        pass.render({
          renderer,
          inputColor: readRT.texture,
          inputDepth: readRT.depthTexture ?? null,
          output,
          width: this.width,
          height: this.height,
        });
        if (!isLast) {
          const tmp = readRT;
          readRT = writeRT;
          writeRT = tmp;
        }
      }
    }

    // 3. Restore default framebuffer for any subsequent direct renders
    // (e.g. CSS3DRenderer paints, or future overlay layers).
    renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.presentBlit.dispose();
    this.primaryRenderTarget.depthTexture?.dispose?.();
    this.primaryRenderTarget.dispose();
    this.secondaryRenderTarget.dispose();
  }
}
