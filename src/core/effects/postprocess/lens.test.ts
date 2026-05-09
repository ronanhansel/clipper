import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAdjustmentLayersToPostProcessPasses,
  applyAdjustmentLayersToVisualStyle,
  applyAdjustmentLayersToVisualStyleAfterLayer,
  applyAdjustmentLayersToVisualStyleBeforeLayer,
  buildAdjustmentExecutionPlan,
  filterAdjustmentExecutionPlan,
  getVisualStyleForAdjustmentPlan,
} from "../../adjustments";
import type { AdjustmentLayer } from "../../types";
import {
  applyExportPostProcessFrame,
  applyExportRawPostProcessFrame,
  bgraBytesToRgbaClamped,
  hasExportPostProcessPasses,
  isPngDataUrl,
  isValidExportPostProcessFrameResult,
  isValidExportRawFramePayload,
  isValidExportRawPostProcessFrameResult,
  rgbaBytesToBgra,
  webGlReadPixelsRgbaToTopLeftRgba,
  type ExportPostProcessRenderer,
} from "./exportFrameBridge";
import {
  getLensPostProcessUniforms,
  getShapeMaskUniforms,
  lensPostProcessKind,
} from "./lens";
import {
  captureLiveDomElementToCanvas,
  getLiveDomPostProcessCapability,
  getLiveDomPostProcessPreflight,
  LiveDomCapabilityProbe,
  prepareLiveDomPostProcessSource,
} from "./liveDomCapability";
import { LiveDomPostProcessRenderer } from "./liveDomRenderer";
import {
  adjustmentLayersRequireLiveDomPostProcessSource,
  collectLiveDomPostProcessRequirement,
} from "./liveDomRequirement";
import {
  createLensExportPostProcessRenderer,
  createLensPostProcessRenderer,
  selectLensPostProcessPass,
  type LensPostProcessRenderer,
} from "./lensWebGlRenderer";
import { withLensFrameBackground } from "./lens";
import {
  selectLiveDomPostProcessPass,
  withPostProcessFrameBackground,
} from "./passes";
import {
  createDefaultExportPostProcessRenderers,
  createDefaultPostProcessRenderer,
  getDefaultPostProcessPackages,
  registerPostProcessPackage,
} from "./registry";
import { vhsTrackingPostProcessKind } from "./vhsTracking";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lens post-process parameters", () => {
  it("preserves signed lens uniforms and derives pixel radius from frame width", () => {
    const layer = lensLayer({
      focusX: 140,
      focusY: -20,
      radius: 200,
      softness: -1,
      magnification: 4,
      distortion: 2,
      chromaticAberration: 2,
      rimWidth: 2,
      rimOpacity: -1,
      dimAmount: 4,
    });
    const uniforms = getLensPostProcessUniforms(layer, {
      width: 1920,
      height: 1080,
    });

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
    expect(
      getLensPostProcessUniforms(lensLayer({ radius: 25 }), {
        width: 1000,
        height: 1000,
      }).radiusPixels,
    ).toBe(250);
    expect(
      getLensPostProcessUniforms(lensLayer({ radius: 25 }), {
        width: 1000,
        height: 500,
      }).radiusPixels,
    ).toBe(250);
  });

  it("injects frame background colors into lens pass uniforms", () => {
    expect(
      withLensFrameBackground(testLensPass(), "#369").uniforms.frameBackground,
    ).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
    expect(
      withLensFrameBackground(testLensPass(), "rgb(12, 34, 56)").uniforms
        .frameBackground,
    ).toEqual({ r: 12 / 255, g: 34 / 255, b: 56 / 255 });
    expect(
      withLensFrameBackground(testLensPass(), "not-a-color").uniforms
        .frameBackground,
    ).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("returns mask disabled by default with safe zeroed preview and feathered inside apply", () => {
    const mask = getShapeMaskUniforms(lensLayer({}));
    expect(mask.enabled).toBe(false);
    expect(mask.preview).toBe(false);
    expect(mask.applyInside).toBe(true);
    expect(mask.shape).toBe("circular");
    expect(mask.focus).toEqual({ x: 0.5, y: 0.5 });
    expect(mask.radiusX).toBe(200);
    expect(mask.radiusY).toBe(200);
    expect(mask.feather).toBe(20);
  });

  it("enabled mask creates expected focus/radius/feather/applyInside/shape", () => {
    const mask = getShapeMaskUniforms(
      lensLayer({
        chromaticAberrationUseMask: true,
        chromaticAberrationMaskPreview: true,
        chromaticAberrationMaskInvert: true,
        chromaticAberrationMaskShape: "circular",
        chromaticAberrationMaskFocusX: 30,
        chromaticAberrationMaskFocusY: 70,
        chromaticAberrationMaskRadius: 400,
        chromaticAberrationMaskFeather: 50,
      }),
    );
    expect(mask.enabled).toBe(true);
    expect(mask.preview).toBe(true);
    expect(mask.applyInside).toBe(false);
    expect(mask.shape).toBe("circular");
    expect(mask.focus).toEqual({ x: 0.3, y: 0.7 });
    expect(mask.radiusX).toBe(400);
    expect(mask.radiusY).toBe(400);
    expect(mask.feather).toBe(50);
  });

  it("ellipsoid shape uses separate radiusX/Y while ignoring single radius fallback", () => {
    const mask = getShapeMaskUniforms(
      lensLayer({
        chromaticAberrationUseMask: true,
        chromaticAberrationMaskShape: "ellipsoid",
        chromaticAberrationMaskRadius: 100,
        chromaticAberrationMaskRadiusX: 300,
        chromaticAberrationMaskRadiusY: 150,
      }),
    );
    expect(mask.shape).toBe("ellipsoid");
    expect(mask.radiusX).toBe(300);
    expect(mask.radiusY).toBe(150);
  });

  it("circular shape uses single radius for both axes", () => {
    const mask = getShapeMaskUniforms(
      lensLayer({
        chromaticAberrationUseMask: true,
        chromaticAberrationMaskShape: "circular",
        chromaticAberrationMaskRadius: 350,
        chromaticAberrationMaskRadiusX: 999,
        chromaticAberrationMaskRadiusY: 999,
      }),
    );
    expect(mask.radiusX).toBe(350);
    expect(mask.radiusY).toBe(350);
  });

  it("clamps mask radius to minimum of 1 and feather to non-negative", () => {
    const mask = getShapeMaskUniforms(
      lensLayer({
        chromaticAberrationUseMask: true,
        chromaticAberrationMaskRadius: -5,
        chromaticAberrationMaskFeather: -10,
      }),
    );
    expect(mask.radiusX).toBe(1);
    expect(mask.radiusY).toBe(1);
    expect(mask.feather).toBe(0);
  });

  it("falls back to circular for unknown shape strings", () => {
    const params: AdjustmentLayer["effect"]["params"] = {
      chromaticAberrationUseMask: true,
      // @ts-expect-error -- intentionally using an unsupported legacy shape to test runtime fallback to "circular"
      chromaticAberrationMaskShape: "square",
      chromaticAberrationMaskRadius: 300,
      chromaticAberrationMaskRadiusX: 500,
      chromaticAberrationMaskRadiusY: 600,
    };
    const mask = getShapeMaskUniforms(lensLayer(params));
    expect(mask.shape).toBe("circular");
    expect(mask.radiusX).toBe(300);
    expect(mask.radiusY).toBe(300);
  });

  it("mask is included in getLensPostProcessUniforms output", () => {
    const uniforms = getLensPostProcessUniforms(
      lensLayer({
        chromaticAberrationUseMask: true,
        chromaticAberrationMaskInvert: true,
        chromaticAberrationMaskFocusX: 25,
        chromaticAberrationMaskRadius: 500,
      }),
      { width: 1920, height: 1080 },
    );
    expect(uniforms.chromaticAberrationMask).toMatchObject({
      enabled: true,
      applyInside: false,
      focus: { x: 0.25, y: 0.5 },
      radiusX: 500,
      radiusY: 500,
    });
    expect(uniforms.focus).toEqual({ x: 0.5, y: 0.5 });
    expect(uniforms.chromaticAberrationPixels).toBe(0.55);
  });
});

describe("lens WebGL renderer", () => {
  it("uploads DOM image sources with WebGL Y flip enabled", () => {
    const canvas = fakeCanvasElement({});
    const source = fakeSource({}) as unknown as TexImageSource;
    const pixelStoreCalls: unknown[][] = [];
    const texImageCalls: unknown[][] = [];
    canvas.context.pixelStorei = (...args: unknown[]) => {
      pixelStoreCalls.push(args);
    };
    canvas.context.texImage2D = (...args: unknown[]) => {
      texImageCalls.push(args);
    };
    const renderer = createLensPostProcessRenderer();

    expect(renderer.render(canvas, source, testLensPass(), 16, 16)).toBe(true);
    expect(pixelStoreCalls).toContainEqual([
      canvas.context.UNPACK_FLIP_Y_WEBGL,
      true,
    ]);
    expect(texImageCalls[0]?.at(-1)).toBe(source);

    renderer.destroy();
  });

  it("reinitializes WebGL resources when reused with a different output canvas", () => {
    const firstCanvas = fakeCanvasElement({});
    const secondCanvas = fakeCanvasElement({});
    let firstCanvasProgramDeletes = 0;
    firstCanvas.context.deleteProgram = () => {
      firstCanvasProgramDeletes += 1;
    };
    const renderer = createLensPostProcessRenderer();

    expect(
      renderer.render(firstCanvas, fakeImageBitmap(), testLensPass(), 16, 16),
    ).toBe(true);
    expect(
      renderer.render(secondCanvas, fakeImageBitmap(), testLensPass(), 16, 16),
    ).toBe(true);
    expect(firstCanvasProgramDeletes).toBe(1);

    renderer.destroy();
  });
});

describe("live DOM post-process capability", () => {
  it("keeps live post-process disabled until explicitly opted in", () => {
    const source = fakeSource({ layoutSubtree: true, requestPaint: () => {} });
    const canvas = fakeCanvas({
      layoutSubtree: true,
      context2d: fakeDrawElementContext({}),
    });

    expect(
      getLiveDomPostProcessCapability({
        optIn: false,
        sourceElement: source,
        canvas,
      }),
    ).toMatchObject({ supported: false, reason: "not-opted-in" });
  });

  it("requires layout subtree and drawElementImage support", () => {
    const canvas = fakeCanvas({
      layoutSubtree: true,
      context2d: fakeDrawElementContext({}),
    });

    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: fakeSource({ requestPaint: () => {} }),
        canvas,
      }),
    ).toMatchObject({ supported: true, reason: "available" });
    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: fakeSource({}),
        canvas: fakeCanvas({ context2d: fakeDrawElementContext({}) }),
      }),
    ).toMatchObject({ supported: false, reason: "missing-layout-subtree" });
    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: fakeSource({
          layoutSubtree: true,
          requestPaint: () => {},
        }),
        canvas: fakeCanvas({ layoutSubtree: true, context2d: {} }),
      }),
    ).toMatchObject({ supported: false, reason: "missing-draw-element-image" });
  });

  it("captures live DOM with drawElementImage", () => {
    const calls: unknown[][] = [];
    const source = fakeSource({ layoutsubtree: true, paint: () => {} });
    const sourceCanvas = fakeCanvas({
      layoutSubtree: true,
      context2d: fakeDrawElementContext({ calls }),
    });
    const captureCanvas = fakeCanvas({ context2d: fakeDrawElementContext({}) });

    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: source,
        canvas: sourceCanvas,
      }),
    ).toMatchObject({
      supported: true,
      layoutSubtree: "canvas.layoutSubtree",
      paint: "paint",
      drawElementImage: "context",
    });
    expect(
      captureLiveDomElementToCanvas(
        source,
        sourceCanvas,
        captureCanvas,
        1920,
        1080,
      ),
    ).toBe(true);
    expect(calls[0]).toEqual([source, 0, 0, 1920, 1080]);
  });

  it("preflights persistent non-capture failures before probing drawElementImage support", () => {
    let contextChecks = 0;
    const canvas = fakeCanvas({
      layoutSubtree: true,
      getContext: () => {
        contextChecks += 1;
        return null;
      },
    });

    expect(
      getLiveDomPostProcessPreflight({
        optIn: true,
        sourceElement: fakeSource({ requestPaint: () => {} }),
      }),
    ).toMatchObject({ supported: false, reason: "missing-layout-subtree" });
    expect(contextChecks).toBe(0);

    const source = fakeSource({ layoutSubtree: true, requestPaint: () => {} });
    expect(
      getLiveDomPostProcessPreflight({ optIn: true, sourceElement: source }),
    ).toMatchObject({ supported: true, reason: "available" });
    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: source,
        canvas,
      }),
    ).toMatchObject({ supported: false, reason: "missing-draw-element-image" });
    expect(contextChecks).toBeGreaterThan(0);
  });

  it("detects and invokes onpaint variants", () => {
    let sourcePaints = 0;
    let canvasPaints = 0;
    const source = fakeSource({
      layoutSubtree: true,
      onpaint: () => {
        sourcePaints += 1;
      },
    });
    const canvas = fakeCanvas({
      layoutSubtree: true,
      context2d: fakeDrawElementContext({}),
      onpaint: () => {
        canvasPaints += 1;
      },
    });

    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: source,
        canvas,
      }),
    ).toMatchObject({ supported: true, paint: "onpaint" });
    prepareLiveDomPostProcessSource(source, canvas);
    expect(sourcePaints).toBe(1);
    expect(canvasPaints).toBe(0);

    const canvasOnlySource = fakeSource({ layoutSubtree: true });
    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: canvasOnlySource,
        canvas,
      }),
    ).toMatchObject({ supported: true, paint: "canvas.onpaint" });
    prepareLiveDomPostProcessSource(canvasOnlySource, canvas);
    expect(canvasPaints).toBe(1);
  });

  it("does not treat layoutsubtree markup alone as runtime API support", () => {
    const source = fakeSource({});
    const canvas = fakeCanvas({
      requestPaint: () => {},
      context2d: fakeDrawElementContext({}),
      hasAttribute: (name: string) => name === "layoutsubtree",
    });

    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: source,
        canvas,
      }),
    ).toMatchObject({ supported: false, reason: "missing-layout-subtree" });
  });

  it("supports canvas layoutsubtree sources", () => {
    const calls: unknown[][] = [];
    const source = fakeSource({});
    const canvas = fakeCanvas({
      layoutSubtree: true,
      requestPaint: () => {},
      context2d: fakeDrawElementContext({ calls }),
      hasAttribute: (name: string) => name === "layoutsubtree",
    });
    const captureCanvas = fakeCanvas({ context2d: fakeDrawElementContext({}) });

    expect(
      getLiveDomPostProcessCapability({
        optIn: true,
        sourceElement: source,
        canvas,
      }),
    ).toMatchObject({
      supported: true,
      layoutSubtree: "canvas.layoutSubtree",
      paint: "canvas.requestPaint",
    });
    expect(
      captureLiveDomElementToCanvas(source, canvas, captureCanvas, 16, 16),
    ).toBe(true);
    expect(calls.at(-1)).toEqual([source, 0, 0, 16, 16]);
  });

  it("caches live DOM capability probing after the first drawElementImage lookup", () => {
    let contextChecks = 0;
    const source = fakeSource({ layoutSubtree: true });
    const canvas = fakeCanvas({
      layoutSubtree: true,
      getContext: () => {
        contextChecks += 1;
        return fakeDrawElementContext({});
      },
    });
    const probe = new LiveDomCapabilityProbe();

    expect(
      probe.getCapability({ optIn: true, sourceElement: source, canvas }),
    ).toMatchObject({ supported: true, drawElementImage: "context" });
    expect(
      probe.getCapability({ optIn: true, sourceElement: source, canvas }),
    ).toMatchObject({ supported: true, drawElementImage: "context" });
    expect(contextChecks).toBe(1);
  });

  it("captures with drawElementImage then uploads the capture canvas through normal texImage2D", () => {
    installLiveDomCaptureCanvasMock();
    const source = fakeSource({});
    const drawCalls: unknown[][] = [];
    const texImageSources: unknown[] = [];
    const canvas = fakeCanvasElement({
      layoutSubtree: true,
      context2d: fakeDrawElementContext({ calls: drawCalls }),
    });
    canvas.context.texImage2D = (...args: unknown[]) => {
      texImageSources.push(args.at(-1));
    };
    const renderer = new LiveDomPostProcessRenderer();

    const result = renderer.render({
      canvas,
      sourceElement: source,
      pass: testLensPass(),
      width: 1920,
      height: 1080,
      optIn: true,
    });

    expect(result.rendered).toBe(true);
    expect(drawCalls).toContainEqual([source, 0, 0, 1920, 1080]);
    expect(texImageSources.at(-1)).not.toBe(source);
    renderer.destroy();
  });

  it("guards incompatible live DOM capture after drawElementImage fails", () => {
    installLiveDomCaptureCanvasMock();
    const source = fakeSource({});
    let captureAttempts = 0;
    const canvas = fakeCanvasElement({
      layoutSubtree: true,
      context2d: fakeDrawElementContext({
        drawElementImage: () => {
          captureAttempts += 1;
          throw new Error("capture failed");
        },
      }),
    });
    const renderer = new LiveDomPostProcessRenderer();

    expect(
      renderer.render({
        canvas,
        sourceElement: source,
        pass: testLensPass(),
        width: 1920,
        height: 1080,
        optIn: true,
      }),
    ).toMatchObject({
      rendered: false,
      capability: { reason: "missing-draw-element-image" },
    });
    expect(captureAttempts).toBeGreaterThan(0);
    const attemptsAfterFirstFailure = captureAttempts;
    expect(
      renderer.render({
        canvas,
        sourceElement: source,
        pass: testLensPass(),
        width: 1920,
        height: 1080,
        optIn: true,
      }),
    ).toMatchObject({
      rendered: false,
      capability: { reason: "missing-draw-element-image" },
    });
    expect(captureAttempts).toBe(attemptsAfterFirstFailure);
    renderer.destroy();
  });
});

describe("lens post-process pass collection", () => {
  it("collects active lens passes separately from CSS visual styles", () => {
    const layers: AdjustmentLayer[] = [
      lensLayer({ target: "frame", focusX: 25, focusY: 75 }),
    ];

    const passes = applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, {
      width: 1920,
      height: 1080,
    });

    expect(
      applyAdjustmentLayersToVisualStyle(1.5, layers, 30).overlays,
    ).toEqual([]);
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      id: "lens:lens-postprocess",
      kind: lensPostProcessKind,
      target: "final",
      requiresLiveDomSource: true,
    });
    expect(
      (passes[0] as ReturnType<typeof testLensPass>).uniforms.focus,
    ).toEqual({ x: 0.25, y: 0.75 });
  });

  it("preserves CSS-safe visual adjustments when lens is also active", () => {
    const layers: AdjustmentLayer[] = [
      adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
      lensLayer({ focusX: 25 }),
    ];

    expect(
      applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, {
        width: 1920,
        height: 1080,
      }),
    ).toHaveLength(1);
    expect(
      applyAdjustmentLayersToVisualStyle(1.5, layers, 30).filter,
    ).toContain("blur");
  });

  it("splits visual adjustments around post-process layer for cumulative top-to-bottom output", () => {
    const layers: AdjustmentLayer[] = [
      adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
      lensLayer({ focusX: 25 }),
    ];
    const pass = applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, {
      width: 1920,
      height: 1080,
    })[0];

    expect(pass.sourceLayerId).toBe("lens");
    expect(
      applyAdjustmentLayersToVisualStyleBeforeLayer(
        1.5,
        layers,
        pass.sourceLayerId,
        30,
      ).filter,
    ).toBe("blur(8px)");
    expect(
      applyAdjustmentLayersToVisualStyleAfterLayer(
        1.5,
        layers,
        pass.sourceLayerId,
        30,
      ).filter,
    ).toBeUndefined();
  });

  it("keeps filters above lens on final output when blur sits above lens", () => {
    const layers: AdjustmentLayer[] = [
      lensLayer({ focusX: 25 }),
      adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
    ];
    const pass = applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, {
      width: 1920,
      height: 1080,
    })[0];

    expect(
      applyAdjustmentLayersToVisualStyleBeforeLayer(
        1.5,
        layers,
        pass.sourceLayerId,
        30,
      ).filter,
    ).toBeUndefined();
    expect(
      applyAdjustmentLayersToVisualStyleAfterLayer(
        1.5,
        layers,
        pass.sourceLayerId,
        30,
      ).filter,
    ).toBe("blur(8px)");
  });

  it("wraps film emulation overlays below lens into the lens source", () => {
    const layers: AdjustmentLayer[] = [
      adjustmentLayer("film", "clipper.adjustment.filmEmulation", {
        grain: 0.4,
        dust: 0.4,
        scratches: 0.3,
        halation: 0.2,
        target: "camera",
      }),
      lensLayer({ focusX: 25 }),
    ];
    const pass = applyAdjustmentLayersToPostProcessPasses(1.5, layers, 30, {
      width: 1920,
      height: 1080,
    })[0];

    expect(
      applyAdjustmentLayersToVisualStyleBeforeLayer(
        1.5,
        layers,
        pass.sourceLayerId,
        30,
      ).overlays?.map((overlay) => overlay.id),
    ).toEqual([
      "film:film-emulation-grain",
      "film:film-emulation-damage",
      "film:film-emulation-halation",
      "film:film-emulation-gate",
    ]);
    expect(
      applyAdjustmentLayersToVisualStyleAfterLayer(
        1.5,
        layers,
        pass.sourceLayerId,
        30,
      ).overlays,
    ).toBeUndefined();
  });

  it("keeps adjustment filters cumulative in timeline order", () => {
    const layers: AdjustmentLayer[] = [
      adjustmentLayer("colour-grade", "clipper.adjustment.colour-grade", {
        brightness: 15,
        contrast: 20,
        saturation: 0,
        hue: 0,
      }),
      adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
      adjustmentLayer("colour-grade-2", "clipper.adjustment.colour-grade", {
        brightness: 0,
        contrast: 5,
        saturation: 10,
        hue: 15,
      }),
    ];

    expect(applyAdjustmentLayersToVisualStyle(1.5, layers, 30).filter).toBe(
      "blur(8px)",
    );
  });

  it("builds a reusable execution plan with visual and post-process steps in layer order", () => {
    const layers: AdjustmentLayer[] = [
      adjustmentLayer("lower-blur", "clipper.adjustment.blur", { radius: 8 }),
      lensLayer({ focusX: 25 }),
      adjustmentLayer("upper-blur", "clipper.adjustment.blur", { radius: 4 }),
    ];

    const plan = buildAdjustmentExecutionPlan(1.5, layers, 30, {
      width: 1920,
      height: 1080,
    });
    const lensStep = plan.steps.find((step) => step.layer.id === "lens");

    expect(plan.steps.map((step) => step.layer.id)).toEqual([
      "lower-blur",
      "lens",
      "upper-blur",
    ]);
    expect(
      getVisualStyleForAdjustmentPlan(
        filterAdjustmentExecutionPlan(plan, "before", lensStep?.layer.id),
      ).filter,
    ).toBe("blur(8px)");
    expect(
      getVisualStyleForAdjustmentPlan(
        filterAdjustmentExecutionPlan(plan, "after", lensStep?.layer.id),
      ).filter,
    ).toBe("blur(4px)");
    expect(lensStep?.postProcessPasses?.[0]).toMatchObject({
      sourceLayerId: "lens",
      kind: lensPostProcessKind,
    });
  });

  it("ignores inactive lens layers", () => {
    expect(
      applyAdjustmentLayersToPostProcessPasses(5, [lensLayer({})], 30, {
        width: 1920,
        height: 1080,
      }),
    ).toEqual([]);
  });

  it("separates output-level live source markers from active passes", () => {
    const layers: AdjustmentLayer[] = [
      lensLayer({}),
      adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
    ];

    expect(adjustmentLayersRequireLiveDomPostProcessSource(layers)).toBe(true);
    expect(
      collectLiveDomPostProcessRequirement({
        sceneTime: 0.5,
        layers,
        frameRate: 30,
        frameSize: { width: 1920, height: 1080 },
      }),
    ).toMatchObject({ requiresLiveDomSource: false, passes: [] });
    expect(
      collectLiveDomPostProcessRequirement({
        sceneTime: 1.5,
        layers,
        frameRate: 30,
        frameSize: { width: 1920, height: 1080 },
      }),
    ).toMatchObject({ requiresLiveDomSource: true });
    expect(
      adjustmentLayersRequireLiveDomPostProcessSource([
        adjustmentLayer("blur", "clipper.adjustment.blur", { radius: 8 }),
      ]),
    ).toBe(false);
  });

  it("makes first-slice single lens rendering explicit when multiple lens passes are active", () => {
    const passes = applyAdjustmentLayersToPostProcessPasses(
      1.5,
      [
        lensLayer({ focusX: 10 }),
        { ...lensLayer({ focusX: 90 }), id: "lens-2" },
      ],
      30,
      { width: 1920, height: 1080 },
    );

    expect(passes).toHaveLength(2);
    expect(selectLensPostProcessPass(passes)).toMatchObject({
      pass: { id: "lens:lens-postprocess" },
      droppedPassCount: 1,
    });
  });

  it("selects live DOM post-process passes independently of lens kind", () => {
    const passes = applyAdjustmentLayersToPostProcessPasses(
      1.5,
      [
        lensLayer({ focusX: 10 }),
        { ...lensLayer({ focusX: 90 }), id: "lens-2" },
      ],
      30,
      { width: 1920, height: 1080 },
    );

    expect(selectLiveDomPostProcessPass(passes)).toMatchObject({
      pass: { id: "lens:lens-postprocess", requiresLiveDomSource: true },
      droppedPassCount: 1,
    });
  });

  it("applies frame background through the generic post-process decorator", () => {
    expect(
      (
        withPostProcessFrameBackground(testLensPass(), "#369") as ReturnType<
          typeof testLensPass
        >
      ).uniforms.frameBackground,
    ).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
  });

  it("leaves unsupported pass backgrounds unchanged through the generic decorator", () => {
    const pass = testUnsupportedPass();

    expect(withPostProcessFrameBackground(pass, "#369")).toBe(pass);
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
    expect(
      isValidExportPostProcessFrameResult({
        applied: true,
        outputDataUrl: pngDataUrl,
        droppedPassCount: 0,
      }),
    ).toBe(true);
    expect(
      isValidExportPostProcessFrameResult({
        applied: false,
        outputDataUrl: pngDataUrl,
        droppedPassCount: 0,
      }),
    ).toBe(false);
    expect(
      isValidExportPostProcessFrameResult({
        applied: true,
        outputDataUrl: "data:image/jpeg;base64,AAAA",
        droppedPassCount: 0,
      }),
    ).toBe(false);
  });

  it("returns the direct route when the generic export bridge has no passes", async () => {
    await expect(
      applyExportPostProcessFrame(
        {
          width: 16,
          height: 16,
          sourceDataUrl: "data:image/png;base64,AAAA",
          passes: [],
        },
        [],
      ),
    ).resolves.toEqual({
      applied: false,
      outputDataUrl: "data:image/png;base64,AAAA",
      droppedPassCount: 0,
    });
  });

  it("dispatches lens through a generic export renderer", async () => {
    const { image } = installExportBridgeDomMocks();
    const calls: unknown[] = [];
    const renderer = createLensExportPostProcessRenderer({
      render: (canvas, source, pass, width, height) => {
        calls.push({ source, pass, width, height });
        canvas.toDataURL = () => "data:image/png;base64,BBBB";
        return true;
      },
    } as LensPostProcessRenderer);

    const result = await applyExportPostProcessFrame(
      {
        width: 16,
        height: 16,
        sourceDataUrl: "data:image/png;base64,AAAA",
        passes: [testLensPass()],
      },
      [renderer],
    );

    expect(result).toEqual({
      applied: true,
      outputDataUrl: "data:image/png;base64,BBBB",
      droppedPassCount: 0,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ source: image });
  });

  it("exposes lens as a default post-process package without hard-coding export call sites", () => {
    expect(
      getDefaultPostProcessPackages().map((definition) => definition.kind),
    ).toContain(lensPostProcessKind);
  });

  it("exposes VHS tracking as a default post-process package", () => {
    expect(
      getDefaultPostProcessPackages().map((definition) => definition.kind),
    ).toContain(vhsTrackingPostProcessKind);
    expect(
      createDefaultPostProcessRenderer(vhsTrackingPostProcessKind),
    ).not.toBe(null);
    expect(
      createDefaultExportPostProcessRenderers(new Map()).some(
        (renderer) => renderer.kind === vhsTrackingPostProcessKind,
      ),
    ).toBe(true);
  });

  it("registers post-process packages without editing preview or export call sites", () => {
    registerPostProcessPackage({
      kind: "test.postprocess.dynamic",
      createRenderer: () =>
        createDefaultPostProcessRenderer(lensPostProcessKind)!,
      createExportRenderer: () => ({
        kind: "test.postprocess.dynamic",
        render: () => true,
      }),
    });

    expect(
      createDefaultPostProcessRenderer("test.postprocess.dynamic"),
    ).not.toBe(null);
    expect(
      createDefaultExportPostProcessRenderers(new Map()).some(
        (renderer) => renderer.kind === "test.postprocess.dynamic",
      ),
    ).toBe(true);
  });

  it("creates default export renderers from the package registry", () => {
    const renderer = createDefaultExportPostProcessRenderers(new Map()).find(
      (candidate) => candidate.kind === lensPostProcessKind,
    );

    expect(renderer).toMatchObject({
      kind: lensPostProcessKind,
      maxPassesPerFrame: 1,
    });
  });

  it("decodes export sources as DOM images so WebGL unpack flip applies", async () => {
    const { image } = installExportBridgeDomMocks();
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    let renderedSource: TexImageSource | null = null;
    const renderer: ExportPostProcessRenderer = {
      kind: lensPostProcessKind,
      render: ({ canvas, source }) => {
        renderedSource = source;
        canvas.toDataURL = () => "data:image/png;base64,BBBB";
        return true;
      },
    };

    await applyExportPostProcessFrame(
      {
        width: 16,
        height: 16,
        sourceDataUrl: "data:image/png;base64,AAAA",
        passes: [testLensPass()],
      },
      [renderer],
    );

    expect(renderedSource).toBe(image);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("fails explicitly for active pass kinds without an export renderer", async () => {
    installExportBridgeDomMocks();
    await expect(
      applyExportPostProcessFrame(
        {
          width: 16,
          height: 16,
          sourceDataUrl: "data:image/png;base64,AAAA",
          passes: [testUnsupportedPass()],
        },
        [],
      ),
    ).rejects.toThrow(/no registered export renderer/);
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

    const result = await applyExportPostProcessFrame(
      {
        width: 16,
        height: 16,
        sourceDataUrl: "data:image/png;base64,AAAA",
        passes: [testLensPass(), { ...testLensPass(), id: "test:lens-2" }],
      },
      [renderer],
    );

    expect(result).toMatchObject({ applied: true, droppedPassCount: 1 });
  });

  it("converts BGRA and RGBA bytes without changing row order", () => {
    const topLeftThenRight = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128]);

    expect([...bgraBytesToRgbaClamped(topLeftThenRight)]).toEqual([
      30, 20, 10, 255, 60, 50, 40, 128,
    ]);
    expect([
      ...rgbaBytesToBgra(new Uint8Array([30, 20, 10, 255, 60, 50, 40, 128])),
    ]).toEqual([...topLeftThenRight]);
  });

  it("flips WebGL readPixels rows back to top-left frame orientation", () => {
    const bottomRowThenTopRow = new Uint8Array([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);

    expect([
      ...webGlReadPixelsRgbaToTopLeftRgba(bottomRowThenTopRow, 2, 2),
    ]).toEqual([7, 8, 9, 255, 10, 11, 12, 255, 1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it("validates raw bridge requests and results", () => {
    const frame = {
      width: 2,
      height: 1,
      pixelFormat: "bgra" as const,
      data: new Uint8Array(8),
    };

    expect(isValidExportRawFramePayload(frame, 2, 1)).toBe(true);
    expect(
      isValidExportRawFramePayload({ ...frame, pixelFormat: "rgb" }, 2, 1),
    ).toBe(false);
    expect(
      isValidExportRawFramePayload({ ...frame, data: new Uint8Array(4) }, 2, 1),
    ).toBe(false);
    expect(
      isValidExportRawPostProcessFrameResult(
        { applied: true, outputFrame: frame, droppedPassCount: 0 },
        2,
        1,
      ),
    ).toBe(true);
    expect(
      isValidExportRawPostProcessFrameResult(
        {
          applied: true,
          outputFrame: { ...frame, height: 2 },
          droppedPassCount: 0,
        },
        2,
        1,
      ),
    ).toBe(false);
  });

  it("dispatches raw frames through the generic renderer and returns top-left RGBA", async () => {
    installRawExportBridgeDomMocks({
      readPixels: [1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255],
    });
    const calls: unknown[] = [];
    const renderer: ExportPostProcessRenderer = {
      kind: lensPostProcessKind,
      render: ({ source, width, height }) => {
        calls.push({ source, width, height });
        return true;
      },
    };

    const result = await applyExportRawPostProcessFrame(
      {
        width: 2,
        height: 2,
        sourceFrame: {
          width: 2,
          height: 2,
          pixelFormat: "bgra",
          data: new Uint8Array(16),
        },
        passes: [testLensPass()],
      },
      [renderer],
    );

    expect(result.applied).toBe(true);
    expect(result.outputFrame.pixelFormat).toBe("rgba");
    expect(result.outputFrame.data).toBeInstanceOf(Uint8Array);
    expect([...(result.outputFrame.data as Uint8Array)]).toEqual([
      7, 8, 9, 255, 10, 11, 12, 255, 1, 2, 3, 255, 4, 5, 6, 255,
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ width: 2, height: 2 });
  });

  it("keeps the raw direct route unchanged when no passes are active", async () => {
    const sourceFrame = {
      width: 1,
      height: 1,
      pixelFormat: "bgra" as const,
      data: new Uint8Array([1, 2, 3, 4]),
    };

    await expect(
      applyExportRawPostProcessFrame(
        { width: 1, height: 1, sourceFrame, passes: [] },
        [],
      ),
    ).resolves.toEqual({
      applied: false,
      outputFrame: sourceFrame,
      droppedPassCount: 0,
    });
  });

  it("fails raw routing explicitly for active pass kinds without an export renderer", async () => {
    installRawExportBridgeDomMocks({ readPixels: [0, 0, 0, 255] });

    await expect(
      applyExportRawPostProcessFrame(
        {
          width: 1,
          height: 1,
          sourceFrame: {
            width: 1,
            height: 1,
            pixelFormat: "bgra",
            data: new Uint8Array(4),
          },
          passes: [testUnsupportedPass()],
        },
        [],
      ),
    ).rejects.toThrow(/no registered export renderer/);
  });
});

function lensLayer(
  params: AdjustmentLayer["effect"]["params"],
): AdjustmentLayer {
  return adjustmentLayer("lens", "clipper.adjustment.lens", params);
}

function adjustmentLayer(
  id: string,
  effectId: AdjustmentLayer["effect"]["effectId"],
  params: AdjustmentLayer["effect"]["params"],
): AdjustmentLayer {
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
  const canvas = {
    ...shape,
    getContext: (type: string) =>
      typeof shape.getContext === "function"
        ? (shape.getContext as (type: string) => unknown)(type)
        : type === "2d"
          ? (shape.context2d ?? null)
          : null,
  } as HTMLCanvasElement;
  if (shape.context2d && typeof shape.context2d === "object") {
    (shape.context2d as { canvas?: HTMLCanvasElement }).canvas = canvas;
  }
  return canvas;
}

function fakeCanvasElement(shape: Record<string, unknown>) {
  const context = fakeRenderableGl({});
  const canvas = {
    ...shape,
    style: {},
    width: 0,
    height: 0,
    context,
    getContext: (type: string) =>
      typeof shape.getContext === "function"
        ? (shape.getContext as (type: string) => unknown)(type)
        : type === "2d"
          ? (shape.context2d ?? null)
          : context,
  } as unknown as HTMLCanvasElement & {
    context: ReturnType<typeof fakeRenderableGl>;
  };
  if (shape.context2d && typeof shape.context2d === "object") {
    (shape.context2d as { canvas?: HTMLCanvasElement }).canvas = canvas;
  }
  return canvas;
}

function fakeDrawElementContext(shape: {
  calls?: unknown[][];
  drawElementImage?: (...args: unknown[]) => unknown;
}) {
  return {
    canvas: undefined as unknown as HTMLCanvasElement,
    clearRect: () => {},
    drawImage: () => {},
    drawElementImage: (...args: unknown[]) => {
      shape.calls?.push(args);
      return shape.drawElementImage ? shape.drawElementImage(...args) : true;
    },
  };
}

function installLiveDomCaptureCanvasMock() {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      if (tagName !== "canvas")
        throw new Error(`Unexpected test element: ${tagName}`);
      return fakeCanvas({ context2d: fakeDrawElementContext({}) });
    },
  });
}

function fakeRenderableGl(_shape: Record<string, never>) {
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
    readPixels: (
      _x: number,
      _y: number,
      _width: number,
      _height: number,
      _format: number,
      _type: number,
      pixels: Uint8Array,
    ) => {
      pixels[0] = 255;
      pixels[1] = 255;
      pixels[2] = 255;
      pixels[3] = 255;
    },
  };
  return gl as unknown as WebGLRenderingContext;
}

function fakeImageBitmap() {
  return { close: () => {} } as unknown as ImageBitmap;
}

function installExportBridgeDomMocks() {
  const image = new TestImage() as unknown as HTMLImageElement;
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        return image;
      }
    },
  );
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      if (tagName !== "canvas")
        throw new Error(`Unexpected test element: ${tagName}`);
      return {
        width: 0,
        height: 0,
        toDataURL: () => "data:image/png;base64,CCCC",
      };
    },
  });
  return { image };
}

function installRawExportBridgeDomMocks({
  readPixels,
}: {
  readPixels: number[];
}) {
  const canvases: Array<ReturnType<typeof fakeRawCanvas>> = [];
  vi.stubGlobal(
    "ImageData",
    class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      colorSpace: string;

      constructor(
        data: Uint8ClampedArray,
        width: number,
        height: number,
        options?: { colorSpace?: string },
      ) {
        this.data = data;
        this.width = width;
        this.height = height;
        this.colorSpace = options?.colorSpace ?? "srgb";
      }
    },
  );
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      if (tagName !== "canvas")
        throw new Error(`Unexpected test element: ${tagName}`);
      const canvas = fakeRawCanvas(readPixels);
      canvases.push(canvas);
      return canvas;
    },
  });
  return { canvases };
}

function fakeRawCanvas(readPixelValues: number[]) {
  const canvas = {
    width: 0,
    height: 0,
    putImageDataCalls: [] as unknown[],
    getContext: (kind: string) => {
      if (kind === "2d") {
        return {
          putImageData: (imageData: unknown, x: number, y: number) =>
            canvas.putImageDataCalls.push({ imageData, x, y }),
          getImageData: () => ({
            data: new Uint8ClampedArray(readPixelValues),
          }),
        };
      }
      if (kind === "webgl") {
        if (canvas.putImageDataCalls.length > 0) return null;
        return {
          RGBA: 6408,
          UNSIGNED_BYTE: 5121,
          isContextLost: () => false,
          readPixels: (
            _x: number,
            _y: number,
            _width: number,
            _height: number,
            _format: number,
            _type: number,
            pixels: Uint8Array,
          ) => pixels.set(readPixelValues),
        };
      }
      return null;
    },
  };
  return canvas as unknown as HTMLCanvasElement & {
    putImageDataCalls: unknown[];
  };
}

class TestImage {
  complete = false;
  naturalWidth = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private source = "";

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.complete = true;
    this.naturalWidth = 16;
    this.onload?.();
  }
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
      chromaticAberrationMask: {
        enabled: false,
        preview: false,
        applyInside: true,
        shape: "circular",
        focus: { x: 0.5, y: 0.5 },
        radiusX: 200,
        radiusY: 200,
        feather: 20,
      },
    },
  } as const;
}
