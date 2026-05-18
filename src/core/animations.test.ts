import { describe, expect, it } from "vitest";
import { evaluateLayerAnimations, evaluateNumericTrack } from "./animations";
import type {
  AnimationTrack,
  AnimationTrackProperty,
  LayerAnimation,
  KeyframePoint,
} from "./types";

function track(
  property: AnimationTrackProperty,
  points: { time: number; value: number }[],
): AnimationTrack {
  return {
    property,
    valueType: "number",
    points: points.map((pt, i) => ({
      id: `${property}:${i}`,
      time: pt.time,
      value: pt.value,
      easingToNext: "linear",
    })),
  };
}

describe("evaluateLayerAnimations with canonical tracks", () => {
  it("interpolates numeric property between two absolute-time points", () => {
    const animations: LayerAnimation[] = [
      {
        id: "fade",
        tracks: [
          track("opacity", [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ]),
        ],
        options: { duration: 1 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 0.5).opacity).toBeCloseTo(0.5);
  });

  it("returns first value before first point", () => {
    const animations: LayerAnimation[] = [
      {
        id: "fade",
        tracks: [
          track("opacity", [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ]),
        ],
        options: { duration: 1 },
      },
    ];

    expect(evaluateLayerAnimations(animations, -0.5).opacity).toBe(0);
  });

  it("returns last value after last point", () => {
    const animations: LayerAnimation[] = [
      {
        id: "fade",
        tracks: [
          track("opacity", [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ]),
        ],
        options: { duration: 1 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 1.5).opacity).toBe(1);
  });

  it("evaluates width and height at absolute time points", () => {
    const animations: LayerAnimation[] = [
      {
        id: "resize",
        tracks: [
          track("width", [{ time: 0, value: 100 }]),
          track("height", [{ time: 0, value: 40 }]),
        ],
        options: { duration: 1 },
      },
      {
        id: "resize-end",
        tracks: [
          track("width", [{ time: 1, value: 220 }]),
          track("height", [{ time: 1, value: 80 }]),
        ],
        options: { duration: 1 },
      },
    ];

    const result = evaluateLayerAnimations(animations, 1);
    expect(result.width).toBe(220);
    expect(result.height).toBe(80);
  });

  it("tweens between two absolute-time points with easing", () => {
    const animations: LayerAnimation[] = [
      {
        id: "fade",
        tracks: [
          {
            property: "opacity",
            valueType: "number",
            points: [
              { id: "opacity:0", time: 0, value: 0, easingToNext: "easeIn" },
              { id: "opacity:1", time: 1, value: 1, easingToNext: "linear" },
            ],
          },
        ],
        options: { duration: 1 },
      },
    ];

    const opacity = evaluateLayerAnimations(animations, 0.5).opacity;
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(0.5);
  });

  it("merges tracks from multiple animations", () => {
    const animations: LayerAnimation[] = [
      {
        id: "in",
        tracks: [track("opacity", [{ time: 0, value: 0 }])],
        options: { duration: 1 },
      },
      {
        id: "out",
        tracks: [track("opacity", [{ time: 1, value: 1 }])],
        options: { duration: 1 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 0.5).opacity).toBeCloseTo(0.5);
  });

  it("adds transforms from merged tracks", () => {
    const animations: LayerAnimation[] = [
      {
        id: "move",
        tracks: [
          track("x", [{ time: 0, value: 0 }]),
          track("rotate", [{ time: 0, value: 0 }]),
        ],
        options: { duration: 1 },
      },
      {
        id: "move-end",
        tracks: [
          track("x", [{ time: 1, value: 100 }]),
          track("rotate", [{ time: 1, value: 90 }]),
        ],
        options: { duration: 1 },
      },
    ];

    const result = evaluateLayerAnimations(animations, 0.5);
    expect(result.transform).toContain("translateX(50px)");
    expect(result.transform).toContain("rotate(45deg)");
  });

  it("falls back to options.ease when keyframe easingToNext is unset", () => {
    const linearAnimations: LayerAnimation[] = [
      {
        id: "fade-linear",
        tracks: [
          {
            property: "opacity",
            valueType: "number",
            points: [
              { id: "opacity:0", time: 0, value: 0 },
              { id: "opacity:1", time: 1, value: 1 },
            ],
          },
        ],
        options: { duration: 1 },
      },
    ];
    const easedAnimations: LayerAnimation[] = [
      {
        id: "fade-eased",
        tracks: [
          {
            property: "opacity",
            valueType: "number",
            points: [
              { id: "opacity:0", time: 0, value: 0 },
              { id: "opacity:1", time: 1, value: 1 },
            ],
          },
        ],
        options: { duration: 1, ease: "easeOut" },
      },
    ];

    const linear = evaluateLayerAnimations(linearAnimations, 0.5).opacity;
    const eased = evaluateLayerAnimations(easedAnimations, 0.5).opacity;
    expect(linear).toBeCloseTo(0.5);
    expect(eased).toBeGreaterThan(0.5);
  });

  it("prefers per-point easingToNext over options.ease", () => {
    const animations: LayerAnimation[] = [
      {
        id: "fade",
        tracks: [
          {
            property: "opacity",
            valueType: "number",
            points: [
              { id: "opacity:0", time: 0, value: 0, easingToNext: "linear" },
              { id: "opacity:1", time: 1, value: 1, easingToNext: "linear" },
            ],
          },
        ],
        options: { duration: 1, ease: "easeOut" },
      },
    ];
    expect(evaluateLayerAnimations(animations, 0.5).opacity).toBeCloseTo(0.5);
  });

  it("evaluates discrete color tracks via hold", () => {
    const animations: LayerAnimation[] = [
      {
        id: "color-anim",
        tracks: [
          {
            property: "color",
            valueType: "color",
            points: [
              { id: "color:0", time: 0, value: "red" },
              { id: "color:1", time: 1, value: "blue" },
            ],
          },
        ],
        options: { duration: 1 },
      },
    ];

    expect(evaluateLayerAnimations(animations, 0.4).color).toBe("red");
    expect(evaluateLayerAnimations(animations, 0.6).color).toBe("red");
    expect(evaluateLayerAnimations(animations, 1).color).toBe("blue");
  });
});
