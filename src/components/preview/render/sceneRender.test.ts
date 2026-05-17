import { describe, expect, it } from "vitest";
import {
  renderCompositionPreview,
  renderEffectPreview,
  renderScenePreview,
} from "./sceneRender";
import type { CompositionClip } from "../../../core/types";
import type {
  PostProcessPass,
  TransitionVisualStyle,
} from "../../../core/effects/types";

const identityCamera = {
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  rotation: 0,
  rotateX: 0,
  rotateY: 0,
  perspective: 1800,
  motionBlur: 0,
};

const viewport = { width: 1920, height: 1080 };

describe("renderScenePreview", () => {
  it("formats identity camera transform", () => {
    const result = renderScenePreview({
      sceneCamera: identityCamera,
      visualAdjustmentFilter: undefined,
      transitionVisual: undefined,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport,
      frameScale: 1,
    });
    expect(result.cameraTransform).toMatch(/translate3d\(0px, 0px, 0px\)/);
    expect(result.cameraTransform).toMatch(/scale\(1\)/);
    expect(result.cameraFilter).toBeUndefined();
  });

  it("includes motion blur filter when motionBlur > 0", () => {
    const result = renderScenePreview({
      sceneCamera: { ...identityCamera, motionBlur: 4 },
      visualAdjustmentFilter: undefined,
      transitionVisual: undefined,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport,
      frameScale: 1,
    });
    expect(result.cameraFilter).toBe("blur(4px)");
  });

  it("merges adjustment filter with transition filter when no composite", () => {
    const transition: TransitionVisualStyle = { filter: "contrast(1.2)" };
    const result = renderScenePreview({
      sceneCamera: identityCamera,
      visualAdjustmentFilter: "brightness(1.1)",
      transitionVisual: transition,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport,
      frameScale: 1,
    });
    expect(result.visualAdjustmentFilter).toBe("brightness(1.1) contrast(1.2)");
  });

  it("drops adjustment filter under transition composite", () => {
    const transition: TransitionVisualStyle = { filter: "contrast(1.2)" };
    const result = renderScenePreview({
      sceneCamera: identityCamera,
      visualAdjustmentFilter: "brightness(1.1)",
      transitionVisual: transition,
      visualOverlays: undefined,
      useTransitionComposite: true,
      viewport,
      frameScale: 1,
    });
    expect(result.visualAdjustmentFilter).toBeUndefined();
    expect(result.cameraExtraTransform).toBeUndefined();
  });

  it("derives frame style with export tile offsets", () => {
    const result = renderScenePreview({
      sceneCamera: identityCamera,
      visualAdjustmentFilter: undefined,
      transitionVisual: undefined,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport,
      exportTileViewport: { x: 100, y: 50 },
      frameScale: 0.5,
    });
    expect(result.frameStyle.left).toBe(-100);
    expect(result.frameStyle.top).toBe(-50);
    expect(result.frameStyle.transform).toBe("scale(0.5)");
  });

  it("returns same camera transform for same input", () => {
    const a = renderScenePreview({
      sceneCamera: identityCamera,
      visualAdjustmentFilter: undefined,
      transitionVisual: undefined,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport,
      frameScale: 1,
    });
    const b = renderScenePreview({
      sceneCamera: identityCamera,
      visualAdjustmentFilter: undefined,
      transitionVisual: undefined,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport,
      frameScale: 1,
    });
    expect(a.cameraTransform).toBe(b.cameraTransform);
  });
});

describe("renderCompositionPreview", () => {
  it("returns part metadata with background fallback", () => {
    const composition = {
      id: "comp-1",
      duration: 5,
      frame: { style: { backgroundColor: "#abc" } },
    } as unknown as CompositionClip;
    const result = renderCompositionPreview({
      composition,
      localTime: 1.25,
      duration: 5,
      viewport,
      frameScale: 2,
    });
    expect(result.partId).toBe("comp-1");
    expect(result.localTime).toBe(1.25);
    expect(result.background).toBe("#abc");
    expect(result.frameStyle.transform).toBe("scale(2)");
  });

  it("falls back to black when no background", () => {
    const composition = {
      id: "comp-2",
      duration: 5,
      frame: { style: {} },
    } as unknown as CompositionClip;
    const result = renderCompositionPreview({
      composition,
      localTime: 0,
      duration: 5,
      viewport,
      frameScale: 1,
    });
    expect(result.background).toBe("#000");
    expect(result.frameStyle.transform).toBeUndefined();
  });
});

describe("renderEffectPreview", () => {
  it("forwards pass with viewport dimensions and background", () => {
    const pass: PostProcessPass = {
      id: "lens:lens-postprocess",
      kind: "lens-postprocess",
      target: "final",
      requiresLiveDomSource: true,
    };
    const result = renderEffectPreview({
      pass,
      viewport,
      background: "#111",
    });
    expect(result.pass).toBe(pass);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.background).toBe("#111");
  });
});
