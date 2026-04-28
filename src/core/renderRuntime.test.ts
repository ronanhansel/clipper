import { describe, expect, it } from "vitest";
import { evaluateBackgroundLayer, evaluateFrameObject, getMotionTranslation } from "./renderRuntime";
import { applyAdjustmentLayersToSceneTime } from "./adjustments";
import type { BackgroundLayer, FrameObject } from "./types";

const baseObject: FrameObject = {
  id: "template-object",
  name: "Template Object",
  type: "template",
  selector: "[data-object-id='template-object']",
  bounds: { x: 0, y: 0, width: 400, height: 200 },
  style: {},
};

describe("render runtime", () => {
  it("quantizes scene time for frame-skip adjustment layers", () => {
    const layers = [{ id: "adj", name: "Skip", start: 1, duration: 4, effect: { kind: "frameSkip" as const, every: 3 } }];

    expect(applyAdjustmentLayersToSceneTime(1.11, layers, 30)).toBe(1.1);
    expect(applyAdjustmentLayersToSceneTime(0.9, layers, 30)).toBe(0.9);
  });

  it("evaluates code-backed templates from explicit time", () => {
    const object = {
      ...baseObject,
      template: {
        kind: "html" as const,
        source: "({ time, progress }) => ({ content: `<strong>${time.toFixed(1)}</strong>`, style: { opacity: progress } })",
      },
    };

    const evaluated = evaluateFrameObject(object, 2, 4);

    expect(evaluated.renderContent).toBe("<strong>2.0</strong>");
    expect(evaluated.renderStyle.opacity).toBe(0.5);
    expect(evaluated.timeSensitive).toBe(true);
  });

  it("keeps static templates out of preview-time invalidation", () => {
    const object = {
      ...baseObject,
      template: {
        kind: "html" as const,
        static: true,
        source: "() => '<span>Static</span>'",
      },
    };

    expect(evaluateFrameObject(object, 0, 4).timeSensitive).toBe(false);
  });

  it("combines motion and template transforms deterministically", () => {
    const object = {
      ...baseObject,
      motion: { duration: 4, x: [0, 100] as const, rotate: [0, 90] as const },
      template: {
        kind: "html" as const,
        source: "() => ({ style: { transform: 'scale(2)' } })",
      },
    };

    const evaluated = evaluateFrameObject(object, 2, 4);

    expect(evaluated.renderStyle.transform).toBe("translateX(50px) rotate(45.00deg) scale(2)");
  });

  it("evaluates smooth motion paths for followed objects", () => {
    const motion = { duration: 4, path: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] };

    const evaluated = evaluateFrameObject({ ...baseObject, motion }, 2, 4);
    const translation = getMotionTranslation(motion, 2);

    expect(evaluated.renderStyle.transform).toBe("translate(100px, 0px)");
    expect(translation).toEqual({ x: 100, y: 0 });
  });

  it("can evaluate objects with motion disabled for static editing", () => {
    const object = {
      ...baseObject,
      motion: { duration: 4, opacity: [0, 1] as const, x: [0, 100] as const },
    };

    const evaluated = evaluateFrameObject(object, 2, 4, { animations: false });

    expect(evaluated.renderStyle.opacity).toBeUndefined();
    expect(evaluated.renderStyle.transform).toBeUndefined();
    expect(evaluated.timeSensitive).toBe(false);
  });

  it("preserves rich text when a template only contributes style", () => {
    const object = {
      ...baseObject,
      type: "text" as const,
      content: "Styled",
      richText: [{ text: "Styled", bold: true, italic: false, underline: false }],
      template: {
        kind: "html" as const,
        source: "() => ({ style: { opacity: 0.25 } })",
      },
    };

    const evaluated = evaluateFrameObject(object, 1, 4);

    expect(evaluated.renderContent).toBe("Styled");
    expect(evaluated.renderRichText).toEqual(object.richText);
    expect(evaluated.renderStyle.opacity).toBe(0.25);
  });

  it("returns escaped in-frame content for template failures", () => {
    const object = {
      ...baseObject,
      template: {
        kind: "html" as const,
        source: "() => { throw new Error('<bad template>') }",
      },
    };

    const evaluated = evaluateFrameObject(object, 1, 4);

    expect(evaluated.renderContent).toContain("&lt;bad template&gt;");
    expect(evaluated.renderStyle.color).toBe("#ff6b7a");
  });

  it("evaluates stretched background fill bounds and element sensitivity", () => {
    const background: BackgroundLayer = {
      id: "background",
      name: "Background",
      style: { background: "#111" },
      stretchToElements: true,
      elements: [
        { ...baseObject, id: "left", selector: "[data-object-id='left']", bounds: { x: -100, y: 40, width: 50, height: 60 } },
        { ...baseObject, id: "right", selector: "[data-object-id='right']", bounds: { x: 1800, y: 960, width: 260, height: 200 }, motion: { duration: 2, opacity: [0, 1] } },
      ],
    };

    const evaluated = evaluateBackgroundLayer(background, 1, 2);

    expect(evaluated.fillStyle).toMatchObject({ left: -100, top: 0, width: 2160, height: 1160 });
    expect(evaluated.timeSensitive).toBe(true);
  });

  it("can evaluate backgrounds with layer and element motion disabled", () => {
    const background: BackgroundLayer = {
      id: "background",
      name: "Background",
      style: { background: "#111" },
      motion: { duration: 2, opacity: [0, 1] },
      elements: [{ ...baseObject, id: "element", selector: "[data-object-id='element']", motion: { duration: 2, x: [0, 100] } }],
    };

    const evaluated = evaluateBackgroundLayer(background, 1, 2, { animations: false });

    expect(evaluated.renderStyle.opacity).toBeUndefined();
    expect(evaluated.elements[0].renderStyle.transform).toBeUndefined();
    expect(evaluated.timeSensitive).toBe(false);
  });
});
