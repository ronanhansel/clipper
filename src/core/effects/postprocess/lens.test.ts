import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAdjustmentLayersToPostProcessPasses, applyAdjustmentLayersToVisualStyle } from "../../adjustments";
import type { AdjustmentLayer } from "../../types";
import { applyExportPostProcessFrame, hasExportPostProcessPasses, isPngDataUrl, isValidExportPostProcessFrameResult, type ExportPostProcessRenderer } from "./exportFrameBridge";
import { getLensPostProcessUniforms, lensPostProcessKind } from "./lens";
import { getLiveDomPostProcessCapability, getLiveDomPostProcessPreflight, LiveDomCapabilityProbe, LiveDomTextureUploader, prepareLiveDomPostProcessSource, uploadLiveDomElementToTexture } from "./liveDomCapability";
import { LiveDomPostProcessRenderer } from "./liveDomRenderer";
import { adjustmentLayersRequireLiveDomPostProcessSource, collectLiveDomPostProcessRequirement } from "./liveDomRequirement";
import { createLensExportPostProcessRenderer, LensPostProcessRenderer, selectLensPostProcessPass } from "./lensWebGlRenderer";
import { withLensFrameBackground } from "./lens";
import { selectLiveDomPostProcessPass, withPostProcessFrameBackground } from "./passes";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lens post-process parameters", () => {
  it("preserves signed lens uniforms and derives pixel radius from frame width", () => {
    const layer = lensLayer({ focusX: 140, focusY: -20, radius: 200, softness: -1, magnification: 4, distortion: 2, chromaticAberration: 2, rimWidth: 2, rimOpacity: -1, dimAmount: 4 });
    const uniforms = getLensPostProcessUniforms(layer, { width: 1920, height: 1080 });

    expect(uniforms.focus).toEqual({ x: 1.4, y: -0.2 });
    expect(uniforms.radiusPixels).toBe(3840);
    expect(uniforms.softness).toBe(-1);
    expect(uniforms.magnification).toBe(4);
    expect(uniforms.distortion).toBe(2);
    expect(uniforms.chromaticAberrationPixels).toBe(2);
    expect(uniforms.rimWidth).toBe(2);
    expect(uniforms.rimOpacity).toBe(-1);
    expect(uniforms.dimAmount).toBe(4);
    expect(uniforms.frameBackground).toEqual({ r: 0, g: 0, b: 0 });
    expect("aspectRatio" in uniforms).toBe(false);
  });

  it("preserves circular pixel radius across aspect changes", () => {
    expect(getLensPostProcessUniforms(lensLayer({ radius: 25 }), { width: 1000, height: 1000 }).radiusPixels).toBe(250);
    expect(getLensPostProcessUniforms(lensLayer({ radius: 25 }), { width: 1000, height: 500 }).radiusPixels).toBe(250);
  });

  it("injects frame background colors into lens pass uniforms", () => {
    expect(withLensFrameBackground(testLensPass(), "#369").uniforms.frameBackground).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
    expect(withLensFrameBackground(testLensPass(), "rgb(12, 34, 56)").uniforms.frameBackground).toEqual({ r: 12 / 255, g: 34 / 255, b: 56 / 255 });
    expect(withLensFrameBackground(testLensPass(), "not-a-color").uniforms.frameBackground).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("lens WebGL renderer", () => {
  it("reinitializes WebGL resources when reused with a different output canvas", () => {
    const firstCanvas = fakeCanvasElement({});
    const secondCanvas = fakeCanvasElement({});
    let firstCanvasProgramDeletes = 0;
    firstCanvas.context.deleteProgram = () => { firstCanvasProgramDeletes += 1; };
    const renderer = new LensPostProcessRenderer();

    expect(renderer.render(firstCanvas, fakeImageBitmap(), testLensPass(), 16, 16)).toBe(true);
    expect(renderer.render(secondCanvas, fakeImageBitmap(), testLensPass(), 16, 16)).toBe(true);
    expect(firstCanvasProgramDeletes).toBe(1);

    renderer.destroy();
  });
});

describe("live DOM post-process capability", () => {
  it("keeps live post-process disabled until explicitly opted in", () => {
    const source = fakeSource({ layoutSubtree: true, requestPaint: () => {} });
    const gl = fakeGl({ texElementImage2D: () => true });

    expect(getLiveDomPostProcessCapability({ optIn: false, sourceElement: source, gl })).toMatchObject({ supported: false, reason: "not-opted-in" });
  });

  it("requires layout subtree and texElementImage2D support", () => {
    const gl = fakeGl({ texElementImage2D: () => true });

    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: fakeSource({ requestPaint: () => {} }), gl })).toMatchObject({ supported: false, reason: "missing-layout-subtree" });
    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: fakeSource({ layoutsubtree: true }), gl })).toMatchObject({ supported: true, reason: "available", paint: null });
    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: fakeSource({ layoutSubtree: true, requestPaint: () => {} }), gl: fakeGl({}) })).toMatchObject({ supported: false, reason: "missing-tex-element-image" });
  });

  it("detects supported API variants and uploads with compatible signatures", () => {
    const calls: unknown[][] = [];
    const source = fakeSource({ layoutsubtree: true, paint: () => {} });
    const gl = fakeGl({ extension: { texElementImage2D: (...args: unknown[]) => { calls.push(args); return true; } } });

    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: source, gl })).toMatchObject({ supported: true, layoutSubtree: "layoutsubtree", paint: "paint", texElementImage2D: "extension" });
    expect(uploadLiveDomElementToTexture(gl, source)).toBe(true);
    expect(calls[0]?.at(-1)).toBe(source);
  });

  it("preflights persistent non-GL failures before probing WebGL upload support", () => {
    let extensionChecks = 0;
    const gl = fakeGl({ getExtension: () => { extensionChecks += 1; return null; } });

    expect(getLiveDomPostProcessPreflight({ optIn: true, sourceElement: fakeSource({ requestPaint: () => {} }) })).toMatchObject({ supported: false, reason: "missing-layout-subtree" });
    expect(extensionChecks).toBe(0);

    const source = fakeSource({ layoutSubtree: true, requestPaint: () => {} });
    expect(getLiveDomPostProcessPreflight({ optIn: true, sourceElement: source })).toMatchObject({ supported: true, reason: "available" });
    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: source, gl })).toMatchObject({ supported: false, reason: "missing-tex-element-image" });
    expect(extensionChecks).toBeGreaterThan(0);
  });

  it("detects and invokes onpaint variants", () => {
    let sourcePaints = 0;
    let canvasPaints = 0;
    const gl = fakeGl({ texElementImage2D: () => true });
    const source = fakeSource({ layoutSubtree: true, onpaint: () => { sourcePaints += 1; } });
    const canvas = fakeCanvas({ onpaint: () => { canvasPaints += 1; } });

    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: source, canvas, gl })).toMatchObject({ supported: true, paint: "onpaint" });
    prepareLiveDomPostProcessSource(source, canvas);
    expect(sourcePaints).toBe(1);
    expect(canvasPaints).toBe(0);

    const canvasOnlySource = fakeSource({ layoutSubtree: true });
    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: canvasOnlySource, canvas, gl })).toMatchObject({ supported: true, paint: "canvas.onpaint" });
    prepareLiveDomPostProcessSource(canvasOnlySource, canvas);
    expect(canvasPaints).toBe(1);
  });

  it("does not treat layoutsubtree markup alone as runtime API support", () => {
    const gl = fakeGl({ texElementImage2D: () => true });
    const source = fakeSource({});
    const canvas = fakeCanvas({ requestPaint: () => {}, hasAttribute: (name: string) => name === "layoutsubtree" });

    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: source, canvas, gl })).toMatchObject({ supported: false, reason: "missing-layout-subtree" });
  });

  it("supports canvas layoutsubtree sources and falls back to uploading the source canvas", () => {
    const calls: unknown[][] = [];
    const source = fakeSource({});
    const canvas = fakeCanvas({ layoutSubtree: true, requestPaint: () => {}, hasAttribute: (name: string) => name === "layoutsubtree" });
    const gl = fakeGl({ extension: { texElementImage2D: (...args: unknown[]) => {
      calls.push(args);
      return args.at(-1) === canvas;
    } } });

    expect(getLiveDomPostProcessCapability({ optIn: true, sourceElement: source, canvas, gl })).toMatchObject({ supported: true, layoutSubtree: "canvas.layoutSubtree", paint: "canvas.requestPaint" });
    expect(uploadLiveDomElementToTexture(gl, source, canvas)).toBe(true);
    expect(calls.at(-1)?.at(-1)).toBe(canvas);
  });

  it("caches the working live DOM upload source and signature after the first successful probe", () => {
    const source = fakeSource({});
    const canvas = fakeCanvas({ layoutSubtree: true });
    const calls: unknown[][] = [];
    const gl = fakeGl({ texElementImage2D: (...args: unknown[]) => {
      calls.push(args);
      return args.length === 4 && args.at(-1) === canvas;
    } });
    const uploader = new LiveDomTextureUploader();

    expect(uploader.upload(gl, source, canvas)).toBe(true);
    expect(calls).toHaveLength(5);
    expect(uploader.upload(gl, source, canvas)).toBe(true);
    expect(calls).toHaveLength(6);
    expect(calls.at(-1)).toEqual(calls[4]);
  });

  it("caches live DOM capability probing after the first WebGL extension lookup", () => {
    let extensionChecks = 0;
    const source = fakeSource({ layoutSubtree: true });
    const probe = new LiveDomCapabilityProbe();
    const gl = fakeGl({ getExtension: () => {
      extensionChecks += 1;
      return { texElementImage2D: () => true };
    } });

    expect(probe.getCapability({ optIn: true, sourceElement: source, gl })).toMatchObject({ supported: true, texElementImage2D: "extension" });
    expect(probe.getCapability({ optIn: true, sourceElement: source, gl })).toMatchObject({ supported: true, texElementImage2D: "extension" });
    expect(extensionChecks).toBe(1);
  });

  it("passes the render canvas as the upload fallback when no separate source canvas is provided", () => {
    const source = fakeSource({});
    const canvas = fakeCanvasElement({ layoutSubtree: true });
    const uploadedSources: unknown[] = [];
    canvas.context.texElementImage2D = (...args: unknown[]) => {
      uploadedSources.push(args.at(-1));
      return args.at(-1) === canvas;
    };
    const renderer = new LiveDomPostProcessRenderer();

    const result = renderer.render({ canvas, sourceElement: source, pass: testLensPass(), width: 1920, height: 1080, optIn: true });

    expect(result.rendered).toBe(true);
    expect(uploadedSources).toContain(canvas);
    renderer.destroy();
  });

  it("guards incompatible live DOM uploads after all candidates fail", () => {
    const source = fakeSource({});
    const canvas = fakeCanvasElement({ layoutSubtree: true });
    let uploadAttempts = 0;
    canvas.context.texElementImage2D = () => {
      uploadAttempts += 1;
      return false;
    };
    const renderer = new LiveDomPostProcessRenderer();

    expect(renderer.render({ canvas, sourceElement: source, pass: testLensPass(), width: 1920, height: 1080, optIn: true })).toMatchObject({ rendered: false, capability: { reason: "missing-tex-element-image" } });
    expect(uploadAttempts).toBeGreaterThan(0);
    const attemptsAfterFirstFailure = uploadAttempts;
    expect(renderer.render({ canvas, sourceElement: source, pass: testLensPass(), width: 1920, height: 1080, optIn: true })).toMatchObject({ rendered: false, capability: { reason: "missing-tex-element-image" } });
    expect(uploadAttempts).toBe(attemptsAfterFirstFailure);
    renderer.destroy();
  });
});

describe("lens post-process pass collection", () => {
  it("collects active lense passes separately from CSS visual styles", () => {
    const layers: AdjustmentLayer[] = [lensLayer({ target: "frame", focusX: 25, focusY: 75 })];

    const passes = applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, { width: 1920, height: 1080 });

    expect(applyAdjustmentLayersToVisualStyle(1.5, layers, 30).overlays).toBeUndefined();
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ id: "lens:lense-postprocess", kind: lensPostProcessKind, target: "final", requiresLiveDomSource: true });
    expect(passes[0].uniforms.focus).toEqual({ x: 0.25, y: 0.75 });
  });

  it("preserves CSS-safe visual adjustments when lense is also active", () => {
    const layers: AdjustmentLayer[] = [
      lensLayer({ focusX: 25 }),
      adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
    ];

    expect(applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, { width: 1920, height: 1080 })).toHaveLength(1);
    expect(applyAdjustmentLayersToVisualStyle(1.5, layers, 30).filter).toContain("blur");
  });

  it("ignores inactive lense layers", () => {
    expect(applyAdjustmentLayersToPostProcessPasses(5, [lensLayer({})], 30, { width: 1920, height: 1080 })).toEqual([]);
  });

  it("separates output-level live source markers from active passes", () => {
    const layers: AdjustmentLayer[] = [lensLayer({}), adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 })];

    expect(adjustmentLayersRequireLiveDomPostProcessSource(layers)).toBe(true);
    expect(collectLiveDomPostProcessRequirement({ sceneTime: 0.5, layers, frameRate: 30, frameSize: { width: 1920, height: 1080 } })).toMatchObject({ requiresLiveDomSource: false, passes: [] });
    expect(collectLiveDomPostProcessRequirement({ sceneTime: 1.5, layers, frameRate: 30, frameSize: { width: 1920, height: 1080 } })).toMatchObject({ requiresLiveDomSource: true });
    expect(adjustmentLayersRequireLiveDomPostProcessSource([adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 })])).toBe(false);
  });

  it("makes first-slice single lens rendering explicit when multiple lens passes are active", () => {
    const passes = applyAdjustmentLayersToPostProcessPasses(1.5, [lensLayer({ focusX: 10 }), { ...lensLayer({ focusX: 90 }), id: "lens-2" }], 30, { width: 1920, height: 1080 });

    expect(passes).toHaveLength(2);
    expect(selectLensPostProcessPass(passes)).toMatchObject({ pass: { id: "lens:lense-postprocess" }, droppedPassCount: 1 });
  });

  it("selects live DOM post-process passes independently of lens kind", () => {
    const passes = applyAdjustmentLayersToPostProcessPasses(1.5, [lensLayer({ focusX: 10 }), { ...lensLayer({ focusX: 90 }), id: "lens-2" }], 30, { width: 1920, height: 1080 });

    expect(selectLiveDomPostProcessPass(passes)).toMatchObject({ pass: { id: "lens:lense-postprocess", requiresLiveDomSource: true }, droppedPassCount: 1 });
  });

  it("applies frame background through the generic post-process decorator", () => {
    expect(withPostProcessFrameBackground(testLensPass(), "#369").uniforms.frameBackground).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
  });
});

describe("export post-process routing helpers", () => {
  it("preserves the direct export route when no post-process pass is active", () => {
    expect(hasExportPostProcessPasses(undefined)).toBe(false);
    expect(hasExportPostProcessPasses([])).toBe(false);
    expect(hasExportPostProcessPasses([testLensPass()])).toBe(true);
  });

  it("validates PNG-only bridge input and explicit applied results", () => {
    const pngDataUrl = "data:image/png;base64,AAAA";

    expect(isPngDataUrl(pngDataUrl)).toBe(true);
    expect(isPngDataUrl("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isValidExportPostProcessFrameResult({ applied: true, outputDataUrl: pngDataUrl, droppedPassCount: 0 })).toBe(true);
    expect(isValidExportPostProcessFrameResult({ applied: false, outputDataUrl: pngDataUrl, droppedPassCount: 0 })).toBe(false);
    expect(isValidExportPostProcessFrameResult({ applied: true, outputDataUrl: "data:image/jpeg;base64,AAAA", droppedPassCount: 0 })).toBe(false);
  });

  it("returns the direct route when the generic export bridge has no passes", async () => {
    await expect(applyExportPostProcessFrame({ width: 16, height: 16, sourceDataUrl: "data:image/png;base64,AAAA", passes: [] }, [])).resolves.toEqual({ applied: false, outputDataUrl: "data:image/png;base64,AAAA", droppedPassCount: 0 });
  });

  it("dispatches lens through a generic export renderer", async () => {
    installExportBridgeDomMocks();
    const calls: unknown[] = [];
    const renderer = createLensExportPostProcessRenderer({
      render: (canvas, source, pass, width, height) => {
        calls.push({ source, pass, width, height });
        canvas.toDataURL = () => "data:image/png;base64,BBBB";
        return true;
      },
    } as LensPostProcessRenderer);

    const result = await applyExportPostProcessFrame({ width: 16, height: 16, sourceDataUrl: "data:image/png;base64,AAAA", passes: [testLensPass()] }, [renderer]);

    expect(result).toEqual({ applied: true, outputDataUrl: "data:image/png;base64,BBBB", droppedPassCount: 0 });
    expect(calls).toHaveLength(1);
  });

  it("fails explicitly for active pass kinds without an export renderer", async () => {
    installExportBridgeDomMocks();
    await expect(applyExportPostProcessFrame({ width: 16, height: 16, sourceDataUrl: "data:image/png;base64,AAAA", passes: [testUnsupportedPass()] }, [])).rejects.toThrow(/no registered export renderer/);
  });

  it("reports dropped passes through the generic renderer limit", async () => {
    installExportBridgeDomMocks();
    const renderer: ExportPostProcessRenderer = {
      kind: lensPostProcessKind,
      maxPassesPerFrame: 1,
      render: ({ canvas }) => {
        canvas.toDataURL = () => "data:image/png;base64,BBBB";
        return true;
      },
    };

    const result = await applyExportPostProcessFrame({ width: 16, height: 16, sourceDataUrl: "data:image/png;base64,AAAA", passes: [testLensPass(), { ...testLensPass(), id: "test:lens-2" }] }, [renderer]);

    expect(result).toMatchObject({ applied: true, droppedPassCount: 1 });
  });
});

function lensLayer(params: AdjustmentLayer["effect"]["params"]): AdjustmentLayer {
  return adjustmentLayer("lens", "clipper.adjustment.lense", params);
}

function adjustmentLayer(id: string, effectId: AdjustmentLayer["effect"]["effectId"], params: AdjustmentLayer["effect"]["params"]): AdjustmentLayer {
  return {
    id,
    name: id,
    start: 1,
    duration: 2,
    effect: { effectId, params },
  };
}

function fakeSource(shape: Record<string, unknown>) {
  return { style: {}, ...shape } as unknown as Element;
}

function fakeCanvas(shape: Record<string, unknown>) {
  return shape as unknown as HTMLCanvasElement;
}

function fakeGl(shape: { texElementImage2D?: (...args: unknown[]) => unknown; extension?: { texElementImage2D?: (...args: unknown[]) => unknown } | null; getExtension?: (name: string) => unknown }) {
  return {
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    texElementImage2D: shape.texElementImage2D,
    getExtension: shape.getExtension ?? (() => shape.extension ?? null),
  } as unknown as WebGLRenderingContext & { texElementImage2D?: (...args: unknown[]) => unknown };
}

function fakeCanvasElement(shape: Record<string, unknown>) {
  const context = fakeRenderableGl({});
  return {
    ...shape,
    style: {},
    width: 0,
    height: 0,
    context,
    getContext: () => context,
  } as unknown as HTMLCanvasElement & { context: ReturnType<typeof fakeRenderableGl> };
}

function fakeRenderableGl(shape: { texElementImage2D?: (...args: unknown[]) => unknown }) {
  const gl = {
    TEXTURE_2D: 3553,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    ARRAY_BUFFER: 34962,
    STATIC_DRAW: 35044,
    FLOAT: 5126,
    TRIANGLES: 4,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    CLAMP_TO_EDGE: 33071,
    LINEAR: 9729,
    TEXTURE0: 33984,
    UNPACK_FLIP_Y_WEBGL: 37440,
    texElementImage2D: shape.texElementImage2D,
    getExtension: () => null,
    isContextLost: () => false,
    createShader: () => ({}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    deleteShader: () => {},
    createProgram: () => ({}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    deleteProgram: () => {},
    useProgram: () => {},
    getAttribLocation: () => 0,
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    deleteBuffer: () => {},
    createTexture: () => ({}),
    bindTexture: () => {},
    texParameteri: () => {},
    deleteTexture: () => {},
    getUniformLocation: () => ({}),
    viewport: () => {},
    activeTexture: () => {},
    pixelStorei: () => {},
    texImage2D: () => {},
    uniform1i: () => {},
    uniform2f: () => {},
    uniform1f: () => {},
    uniform3f: () => {},
    drawArrays: () => {},
    readPixels: (_x: number, _y: number, _width: number, _height: number, _format: number, _type: number, pixels: Uint8Array) => {
      pixels[0] = 255;
      pixels[1] = 255;
      pixels[2] = 255;
      pixels[3] = 255;
    },
  };
  return gl as unknown as WebGLRenderingContext & { texElementImage2D?: (...args: unknown[]) => unknown };
}

function fakeImageBitmap() {
  return { close: () => {} } as unknown as ImageBitmap;
}

function installExportBridgeDomMocks() {
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob() })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => fakeImageBitmap()));
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      if (tagName !== "canvas") throw new Error(`Unexpected test element: ${tagName}`);
      return { width: 0, height: 0, toDataURL: () => "data:image/png;base64,CCCC" };
    },
  });
}

function testUnsupportedPass() {
  return {
    ...testLensPass(),
    id: "test:unsupported",
    kind: "clipper.postprocess.unsupported",
  } as unknown as ReturnType<typeof testLensPass>;
}

function testLensPass() {
  return {
    id: "test:lens",
    kind: lensPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: {
      focus: { x: 0.5, y: 0.5 },
      radiusPixels: 200,
      softness: 1,
      magnification: 1.5,
      distortion: 0,
      chromaticAberrationPixels: 0,
      rimWidth: 0.04,
      rimOpacity: 0,
      dimAmount: 0,
      frameBackground: { r: 0, g: 0, b: 0 },
    },
  } as const;
}
