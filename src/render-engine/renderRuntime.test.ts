import { describe, expect, it } from "vitest";
import {
  buildFrameObjectParentTransformLookup,
  evaluateBackgroundLayer,
  evaluateFrameObject,
} from "./renderRuntime";
import {
  advanceTimeSensitiveSceneTime,
  applyAdjustmentLayersToSceneTime,
  applyPlaybackAdjustmentLayersToSceneTime,
  applyAdjustmentLayersToVisualStyle,
  getSceneTimeForTimeSensitiveDisplayTime,
  getTimeSensitiveDisplayDuration,
  getTimeSensitiveDisplayTime,
} from "../core/adjustments";
import { installedEffectPackages } from "../core/effects/registry";
import {
  applyTransitionLayersToVisualStyle,
  getTransitionFinishTime,
  getTransitionProgress,
  renderTransitionSequence,
} from "../core/transitions";
import type {
  AdjustmentLayer,
  BackgroundLayer,
  FrameObject,
} from "../core/types";

const baseObject: FrameObject = {
  id: "template-object",
  name: "Template Object",
  type: "template",
  selector: "[data-object-id='template-object']",
  bounds: { x: 0, y: 0, width: 400, height: 200 },
  style: {},
};

function getScale(transform: unknown) {
  const match =
    typeof transform === "string" ? /scale\(([^)]+)\)/.exec(transform) : null;
  return match ? Number(match[1]) : Number.NaN;
}

describe("render runtime", () => {
  it("requires installed effect packages to declare folder groups", () => {
    expect(
      installedEffectPackages.every((effect) =>
        effect.group.split("/").every((part) => part.trim().length > 0),
      ),
    ).toBe(true);
  });

  it("quantizes scene time for frame-skip adjustment layers", () => {
    const layers = [
      {
        id: "adj",
        name: "Skip",
        start: 1,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.frameSkip" as const,
          params: { every: 3 },
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(1.11, layers, 30)).toBe(1.1);
    expect(applyAdjustmentLayersToSceneTime(0.9, layers, 30)).toBe(0.9);
  });

  it("freezes scene time at the adjustment layer start", () => {
    const layers = [
      {
        id: "adj",
        name: "Freeze",
        start: 2,
        duration: 3,
        effect: {
          effectId: "clipper.adjustment.freezeFrame" as const,
          params: {},
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(2.75, layers, 30)).toBe(2);
    expect(applyAdjustmentLayersToSceneTime(1.75, layers, 30)).toBe(1.75);
  });

  it("remaps scene time by speed relative to the layer start", () => {
    const layers = [
      {
        id: "adj",
        name: "Speed",
        start: 2,
        duration: 3,
        effect: {
          effectId: "clipper.adjustment.speedChange" as const,
          params: { speed: 0.5 },
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(3, layers, 30)).toBe(2.5);
  });

  it("keeps speed changes inside the adjusted layer window", () => {
    const layers = [
      {
        id: "adj",
        name: "Speed",
        start: 2,
        duration: 3,
        effect: {
          effectId: "clipper.adjustment.speedChange" as const,
          params: { speed: 4 },
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(3, layers, 30)).toBeCloseTo(
      4.9666667,
    );
  });

  it("expands player display time and duration for time-sensitive speed changes", () => {
    const layers = [
      {
        id: "adj",
        name: "Speed",
        start: 5,
        duration: 5,
        effect: {
          effectId: "clipper.adjustment.speedChange" as const,
          params: { speed: 0.5 },
        },
      },
    ];

    expect(getTimeSensitiveDisplayTime(4, layers, 30)).toBe(4);
    expect(getTimeSensitiveDisplayTime(7, layers, 30)).toBe(9);
    expect(getTimeSensitiveDisplayTime(12, layers, 30)).toBe(17);
    expect(getTimeSensitiveDisplayDuration(23, layers, 30)).toBe(28);
  });

  it("converts speed-adjusted display time back to slowed scene time", () => {
    const layers = [
      {
        id: "adj",
        name: "Speed",
        start: 5,
        duration: 5,
        effect: {
          effectId: "clipper.adjustment.speedChange" as const,
          params: { speed: 0.5 },
        },
      },
    ];

    expect(getSceneTimeForTimeSensitiveDisplayTime(7, 23, layers, 30)).toBe(6);
    expect(advanceTimeSensitiveSceneTime(5, 2, 23, layers, 30)).toBe(6);
  });

  it("advances the scene playhead eight times faster inside speed changes", () => {
    const layers = [
      {
        id: "adj",
        name: "Speed",
        start: 5,
        duration: 7,
        effect: {
          effectId: "clipper.adjustment.speedChange" as const,
          params: { speed: 8 },
        },
      },
    ];

    expect(advanceTimeSensitiveSceneTime(5, 0.25, 23, layers, 30)).toBe(7);
    expect(advanceTimeSensitiveSceneTime(5, 0.875, 23, layers, 30)).toBe(12);
  });

  it("does not double-apply speed changes after playback clock advancement", () => {
    const layers = [
      {
        id: "adj",
        name: "Speed",
        start: 5,
        duration: 7,
        effect: {
          effectId: "clipper.adjustment.speedChange" as const,
          params: { speed: 8 },
        },
      },
    ];
    const playheadTime = advanceTimeSensitiveSceneTime(5, 0.25, 23, layers, 30);

    expect(
      applyPlaybackAdjustmentLayersToSceneTime(playheadTime, layers, 30),
    ).toBe(7);
    expect(
      applyAdjustmentLayersToSceneTime(playheadTime, layers, 30),
    ).toBeCloseTo(11.9666667);
  });

  it("does not expand player display time for non-time-sensitive adjustments", () => {
    const layers = [
      {
        id: "adj",
        name: "Freeze",
        start: 5,
        duration: 5,
        effect: {
          effectId: "clipper.adjustment.freezeFrame" as const,
          params: {},
        },
      },
    ];

    expect(getTimeSensitiveDisplayTime(7, layers, 30)).toBe(7);
    expect(getTimeSensitiveDisplayDuration(23, layers, 30)).toBe(23);
  });

  it("loops scene time through the configured stutter window", () => {
    const layers = [
      {
        id: "adj",
        name: "Loop",
        start: 2,
        duration: 3,
        effect: {
          effectId: "clipper.adjustment.loopStutter" as const,
          params: { window: 0.5 },
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(2.4, layers, 30)).toBeCloseTo(2.4);
    expect(applyAdjustmentLayersToSceneTime(2.6, layers, 30)).toBeCloseTo(2.1);
  });

  it("reverses scene time within the adjustment layer", () => {
    const layers = [
      {
        id: "adj",
        name: "Reverse",
        start: 2,
        duration: 3,
        effect: { effectId: "clipper.adjustment.reverse" as const, params: {} },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(2, layers, 30)).toBeCloseTo(
      4.9666667,
    );
    expect(applyAdjustmentLayersToSceneTime(3, layers, 30)).toBeCloseTo(
      3.9666667,
    );
  });

  it("boomerangs scene time forward then backward", () => {
    const layers = [
      {
        id: "adj",
        name: "Boomerang",
        start: 2,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.boomerang" as const,
          params: {},
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(3, layers, 30)).toBe(4);
    expect(applyAdjustmentLayersToSceneTime(5, layers, 30)).toBeCloseTo(
      3.9666667,
    );
  });

  it("composes visual adjustment filters from active layers", () => {
    const layers: AdjustmentLayer[] = [
      {
        id: "grade",
        name: "Colour Grade",
        start: 1,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.colourGrade" as const,
          params: { brightness: 40, contrast: 10, saturation: 80, hue: 12 },
        },
      },
      {
        id: "blur",
        name: "Blur",
        start: 6,
        duration: 2,
        effect: {
          effectId: "clipper.adjustment.blur" as const,
          params: { radius: 6 },
        },
      },
    ];

    expect(applyAdjustmentLayersToVisualStyle(2.5, layers, 30).filter).toBe(
      "brightness(1.4) contrast(1.1) saturate(1.8) hue-rotate(12deg)",
    );
    expect(
      applyAdjustmentLayersToVisualStyle(5.5, layers, 30).filter,
    ).toBeUndefined();
  });

  it("composes visual adjustment overlays from active layers", () => {
    const layers: AdjustmentLayer[] = [
      {
        id: "dust",
        name: "Film Dust",
        start: 1,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.filmDust" as const,
          params: { intensity: 0.3, density: 1, drift: 0, target: "camera" },
        },
      },
      {
        id: "vignette",
        name: "Vignette",
        start: 1,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.vignette" as const,
          params: { intensity: 0.5, softness: 0.6 },
        },
      },
      {
        id: "leak",
        name: "Light Leak",
        start: 6,
        duration: 2,
        effect: {
          effectId: "clipper.adjustment.lightLeak" as const,
          params: { intensity: 0.4 },
        },
      },
    ];

    const active = applyAdjustmentLayersToVisualStyle(2.5, layers, 30).overlays;
    expect(active?.map((overlay) => overlay.id)).toEqual([
      "dust:film-dust",
      "vignette:vignette",
    ]);
    expect(active?.map((overlay) => overlay.target ?? "camera")).toEqual([
      "camera",
      "camera",
    ]);
    expect(active?.[0].style.opacity).toBe(0.3);
    expect(
      applyAdjustmentLayersToVisualStyle(5.5, layers, 30).overlays,
    ).toBeUndefined();
  });

  it("builds a deterministic film emulation look from modular artifact overlays", () => {
    const layers: AdjustmentLayer[] = [
      {
        id: "film",
        name: "Film Emulation",
        start: 0,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.filmEmulation" as const,
          params: {
            intensity: 0.8,
            target: "frame",
            stock: "fadedArchive",
            grain: 0.5,
            dust: 0.3,
            scratches: 0.2,
            halation: 0.4,
            flicker: 0,
            gateWeave: 0,
            vignette: 0.25,
            seed: 42,
          },
        },
      },
    ];

    const style = applyAdjustmentLayersToVisualStyle(1.25, layers, 30);

    expect(style.filter).toContain("brightness(");
    expect(style.filter).toContain("sepia(");
    expect(style.overlays?.map((overlay) => overlay.id)).toEqual([
      "film:film-emulation-grain",
      "film:film-emulation-damage",
      "film:film-emulation-halation",
      "film:film-emulation-gate",
    ]);
    expect(style.overlays?.map((overlay) => overlay.target)).toEqual([
      "frame",
      "frame",
      "frame",
      "frame",
    ]);
    expect(style.overlays?.[0].style.backgroundImage).toContain(
      "data:image/svg+xml",
    );
  });

  it("keeps swipe transition visual styles separate from sequence animation", () => {
    const layers = [
      {
        id: "swipe",
        name: "Swipe",
        start: 2,
        duration: 4,
        midPoint: 2,
        effect: { effectId: "clipper.transition.swipe" as const, params: {} },
      },
    ];

    expect(
      applyTransitionLayersToVisualStyle(3, layers, 30).cameraStyle?.transform,
    ).toBeUndefined();
    expect(
      applyTransitionLayersToVisualStyle(6.5, layers, 30).cameraStyle,
    ).toBeUndefined();
  });

  it("renders transition sequences as A/B/t styles", () => {
    const layer = {
      id: "swipe",
      name: "Swipe",
      start: 2,
      duration: 4,
      midPoint: 2,
      effect: {
        effectId: "clipper.transition.swipe" as const,
        params: { ease: "linear" as const },
      },
    };

    expect(renderTransitionSequence(3, layer, 30)).toMatchObject({
      aStyle: { transform: "translate3d(-25%, 0, 0)" },
      bStyle: { transform: "translate3d(75%, 0, 0)" },
    });
  });

  it("uses transition marker duration as the natural finish time", () => {
    const layer = {
      id: "swipe",
      name: "Swipe",
      start: 2,
      duration: 8,
      midPoint: 4,
      effect: {
        effectId: "clipper.transition.swipe" as const,
        params: { ease: "linear" as const, transitionTime: 1.5 },
      },
    };

    expect(getTransitionFinishTime(layer)).toBe(8);
    expect(getTransitionProgress(6, layer)).toBe(0.5);
    expect(getTransitionProgress(10, layer)).toBe(1);
  });

  it("nests zoom transition frames on the same in-and-out scale curve", () => {
    const layer = {
      id: "zoom",
      name: "Zoom",
      start: 0,
      duration: 10,
      midPoint: 5,
      effect: {
        effectId: "clipper.transition.zoomIn" as const,
        params: {
          direction: "in" as const,
          ease: "inAndOut" as const,
          zoom: 2,
          cutPoint: 0.8,
        },
      },
    };

    const atCut = renderTransitionSequence(8, layer, 30);
    const afterCut = renderTransitionSequence(9, layer, 30);

    expect(atCut.aStyle?.opacity).toBe(0);
    expect(atCut.bStyle?.opacity).toBe(1);
    expect(getScale(atCut.bStyle?.transform)).toBeCloseTo(
      getScale(atCut.aStyle?.transform) / 2,
    );
    expect(getScale(afterCut.bStyle?.transform)).toBeGreaterThan(
      getScale(atCut.bStyle?.transform),
    );
  });

  it("uses zoom transition background color behind scaled frames", () => {
    const layer = {
      id: "zoom",
      name: "Zoom",
      start: 0,
      duration: 10,
      midPoint: 5,
      effect: {
        effectId: "clipper.transition.zoomIn" as const,
        params: {
          direction: "in" as const,
          zoom: 2,
          backgroundColor: "#444444",
        },
      },
    };

    expect(renderTransitionSequence(4, layer, 30).frameStyle).toMatchObject({
      backgroundColor: "#444444",
    });
  });

  it("uses package-owned point params for light leak focus", () => {
    const layers: AdjustmentLayer[] = [
      {
        id: "leak",
        name: "Light Leak",
        start: 1,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.lightLeak" as const,
          params: { focusX: 64, focusY: 22, drift: 0 },
        },
      },
    ];

    expect(
      String(
        applyAdjustmentLayersToVisualStyle(2.5, layers, 30).overlays?.[0].style
          .backgroundImage,
      ),
    ).toContain("circle at 64% 22%");
  });

  it("leaves scene time unchanged for visual-only adjustments", () => {
    const layers = [
      {
        id: "grade",
        name: "Colour Grade",
        start: 1,
        duration: 4,
        effect: {
          effectId: "clipper.adjustment.colourGrade" as const,
          params: { contrast: 1.4 },
        },
      },
    ];

    expect(applyAdjustmentLayersToSceneTime(2, layers, 30)).toBe(2);
  });

  it("evaluates code-backed templates from explicit time", () => {
    const object = {
      ...baseObject,
      template: {
        kind: "html" as const,
        source:
          "({ time, progress }) => ({ content: `<strong>${time.toFixed(1)}</strong>`, style: { opacity: progress } })",
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

  it("combines animations and template transforms deterministically", () => {
    const object = {
      ...baseObject,
      animations: [
        {
          id: "move",
          tracks: [
            {
              property: "x" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "x:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "x:1",
                  time: 4,
                  value: 100,
                  easingToNext: "linear" as const,
                },
              ],
            },
            {
              property: "rotate" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "rotate:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "rotate:1",
                  time: 4,
                  value: 90,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 4 },
        },
      ],
      template: {
        kind: "html" as const,
        source: "() => ({ style: { transform: 'scale(2)' } })",
      },
    };

    const evaluated = evaluateFrameObject(object, 2, 4);

    expect(evaluated.renderStyle.transform).toBe(
      "translateX(50px) rotate(45deg) scale(2)",
    );
  });

  it("builds parent transforms from evaluated parent keyframes", () => {
    const parent = {
      ...baseObject,
      id: "parent",
      name: "Parent",
      style: { transform: "scale(2)" },
      animations: [
        {
          id: "parent-move",
          tracks: [
            {
              property: "x" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "x:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "x:1",
                  time: 4,
                  value: 100,
                  easingToNext: "linear" as const,
                },
              ],
            },
            {
              property: "rotate" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "rotate:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "rotate:1",
                  time: 4,
                  value: 90,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 4 },
        },
      ],
    };
    const child = {
      ...baseObject,
      id: "child",
      name: "Child",
      parentId: "parent",
      animations: [
        {
          id: "child-move",
          tracks: [
            {
              property: "x" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "x:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "x:1",
                  time: 4,
                  value: 40,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 4 },
        },
      ],
    };

    const transforms = buildFrameObjectParentTransformLookup(
      [parent, child],
      2,
      4,
    );

    expect(transforms.get("child")).toBe(
      "translateX(50px) rotate(45deg) scale(2)",
    );
  });

  it("can evaluate objects with animations disabled for static editing", () => {
    const object = {
      ...baseObject,
      animations: [
        {
          id: "fade-move",
          tracks: [
            {
              property: "opacity" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "opacity:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "opacity:1",
                  time: 4,
                  value: 1,
                  easingToNext: "linear" as const,
                },
              ],
            },
            {
              property: "x" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "x:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "x:1",
                  time: 4,
                  value: 100,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 4 },
        },
      ],
    };

    const evaluated = evaluateFrameObject(object, 2, 4, { animations: false });

    expect(evaluated.renderStyle.opacity).toBeUndefined();
    expect(evaluated.renderStyle.transform).toBeUndefined();
    expect(evaluated.timeSensitive).toBe(false);
  });

  it("keeps object layout finite when scrubbing a single position keyframe", () => {
    const object = {
      ...baseObject,
      bounds: { x: 320, y: 180, width: 120, height: 80 },
      animations: [
        {
          id: "keyframe:x:start",
          tracks: [
            {
              property: "x" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "x:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "x:1",
                  time: 1 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 0.1, ease: "linear" as const },
        },
        {
          id: "keyframe:y:start",
          tracks: [
            {
              property: "y" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "y:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "y:1",
                  time: 1 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 0.1, ease: "linear" as const },
        },
      ],
    };

    const evaluated = evaluateFrameObject(object, 2, 4);

    expect(evaluated.bounds).toEqual({
      x: 320,
      y: 180,
      width: 120,
      height: 80,
    });
    expect(evaluated.renderStyle.transform).toBe(
      "translateX(0px) translateY(0px)",
    );
  });

  it("preserves rich text when a template only contributes style", () => {
    const object = {
      ...baseObject,
      type: "text" as const,
      content: "Styled",
      richText: [
        { text: "Styled", bold: true, italic: false, underline: false },
      ],
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
        {
          ...baseObject,
          id: "left",
          selector: "[data-object-id='left']",
          bounds: { x: -100, y: 40, width: 50, height: 60 },
        },
        {
          ...baseObject,
          id: "right",
          selector: "[data-object-id='right']",
          bounds: { x: 1800, y: 960, width: 260, height: 200 },
          animations: [
            {
              id: "fade",
              tracks: [
                {
                  property: "opacity" as const,
                  valueType: "number" as const,
                  points: [
                    {
                      id: "opacity:0",
                      time: 0 / 1,
                      value: 0,
                      easingToNext: "linear" as const,
                    },
                    {
                      id: "opacity:1",
                      time: 4,
                      value: 1,
                      easingToNext: "linear" as const,
                    },
                  ],
                },
              ],
              options: { duration: 2 },
            },
          ],
        },
      ],
    };

    const evaluated = evaluateBackgroundLayer(background, 1, 2);

    expect(evaluated.fillStyle).toMatchObject({
      left: -100,
      top: 0,
      width: 2160,
      height: 1160,
    });
    expect(evaluated.timeSensitive).toBe(true);
  });

  it("can evaluate backgrounds with layer and element animations disabled", () => {
    const background: BackgroundLayer = {
      id: "background",
      name: "Background",
      style: { background: "#111" },
      animations: [
        {
          id: "fade",
          tracks: [
            {
              property: "opacity" as const,
              valueType: "number" as const,
              points: [
                {
                  id: "opacity:0",
                  time: 0 / 1,
                  value: 0,
                  easingToNext: "linear" as const,
                },
                {
                  id: "opacity:1",
                  time: 4,
                  value: 1,
                  easingToNext: "linear" as const,
                },
              ],
            },
          ],
          options: { duration: 2 },
        },
      ],
      elements: [
        {
          ...baseObject,
          id: "element",
          selector: "[data-object-id='element']",
          animations: [
            {
              id: "move",
              tracks: [
                {
                  property: "x" as const,
                  valueType: "number" as const,
                  points: [
                    {
                      id: "x:0",
                      time: 0 / 1,
                      value: 0,
                      easingToNext: "linear" as const,
                    },
                    {
                      id: "x:1",
                      time: 4,
                      value: 100,
                      easingToNext: "linear" as const,
                    },
                  ],
                },
              ],
              options: { duration: 2 },
            },
          ],
        },
      ],
    };

    const evaluated = evaluateBackgroundLayer(background, 1, 2, {
      animations: false,
    });

    expect(evaluated.renderStyle.opacity).toBeUndefined();
    expect(evaluated.elements[0].renderStyle.transform).toBeUndefined();
    expect(evaluated.timeSensitive).toBe(false);
  });
});
