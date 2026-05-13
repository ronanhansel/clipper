import { describe, expect, it } from "vitest";
import {
  buildComposeAnimationTimelineLayers,
  buildComposeAnimationTimelineRows,
  createComposeAnimationAttributeKeyframeAnimation,
  getComposeAnimationAttributeKeyframeAtTime,
  getComposeAnimationAttributeTracks,
  getComposeAnimationLayerKeyframes,
  getNearestComposeAnimationKeyframeValue,
  removeComposeAnimationAttributeKeyframe,
  removeComposeAnimationKeyframeSelections,
  upsertComposeAnimationAttributeKeyframe,
} from "./composeAnimationModel";
import type { FrameObject, Part } from "../../core/types";

describe("buildComposeAnimationTimelineLayers", () => {
  it("builds composition-owned timeline rows", () => {
    const layers = buildComposeAnimationTimelineLayers({
      id: "part",
      filePath: "part",
      duration: 5,
      frame: { width: 1920, height: 1080, style: {} },
      background: {
        id: "background",
        name: "Background",
        style: {},
        elements: [frameObject("bg-element")],
      },
      objects: [frameObject("text")],
      snapshot: [],
      motionMarkers: [],
    } satisfies Part);

    expect(layers.map((layer) => layer.id)).toEqual([
      "text",
      "bg-element",
      "background",
    ]);
  });

  it("builds expanded attribute rows from layer keyframes", () => {
    const object = {
      ...frameObject("shape"),
      animations: [
        {
          id: "move",
          name: "Move",
          keyframes: { x: [0, 100, 200] as const, opacity: [0, 1] as const },
          options: { delay: 1, duration: 4 },
        },
      ],
    };
    const layers = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const rows = buildComposeAnimationTimelineRows(
      layers,
      new Set(["shape"]),
      new Set(),
    );

    expect(rows.map((row) => row.id)).toEqual([
      "shape",
      "shape:attribute:opacity",
      "shape:attribute:x",
      "background",
    ]);
  });

  it("derives per-attribute keyframe times from animation delay and duration", () => {
    const object = {
      ...frameObject("shape"),
      animations: [
        {
          id: "move",
          name: "Move",
          keyframes: { x: [0, 100, 200] as const, opacity: [0, 1] as const },
          options: { delay: 1, duration: 4 },
        },
      ],
    };
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const tracks = getComposeAnimationAttributeTracks(layer);

    expect(tracks.find((track) => track.key === "x")?.keyframes).toEqual([
      { animationId: "move", time: 1, value: 0 },
      { animationId: "move", time: 3, value: 100 },
      { animationId: "move", time: 5, value: 200 },
    ]);
    expect(
      getComposeAnimationLayerKeyframes(layer).map((keyframe) => keyframe.time),
    ).toEqual([1, 3, 5]);
  });

  it("creates single-attribute keyframe animations at the playhead", () => {
    const animation = createComposeAnimationAttributeKeyframeAnimation(
      "opacity",
      0.65,
      2.25,
      6,
    );

    expect(animation).toMatchObject({
      name: "Opacity keyframe",
      keyframes: { opacity: [0.65, 0.65] },
      options: { delay: 2.25, duration: 0.1, ease: "linear" },
    });
  });

  it("uses nearest existing attribute value for new playhead keyframes", () => {
    const object = {
      ...frameObject("shape"),
      animations: [
        {
          id: "fade",
          name: "Fade",
          keyframes: { opacity: [0, 0.5, 1] as const },
          options: { delay: 1, duration: 4 },
        },
      ],
    };
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const [track] = getComposeAnimationAttributeTracks(layer);

    expect(getNearestComposeAnimationKeyframeValue(track, 2.8)).toBe(0.5);
    expect(getComposeAnimationAttributeKeyframeAtTime(track, 3)).toEqual({
      animationId: "fade",
      time: 3,
      value: 0.5,
    });
    expect(getComposeAnimationAttributeKeyframeAtTime(track, 2.8)).toBeNull();
  });

  it("updates an existing keyframe when playhead time already matches", () => {
    const animations = upsertComposeAnimationAttributeKeyframe(
      [
        {
          id: "fade",
          name: "Fade",
          keyframes: { opacity: [0, 0.5, 1] },
          options: { delay: 1, duration: 4 },
        },
      ],
      "opacity",
      0.75,
      3,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes.opacity).toEqual([0, 0.75, 1]);
  });

  it("inserts a playhead keyframe animation when no existing keyframe matches", () => {
    const animations = upsertComposeAnimationAttributeKeyframe(
      [
        {
          id: "fade",
          name: "Fade",
          keyframes: { opacity: [0, 1] },
          options: { duration: 2 },
        },
      ],
      "opacity",
      0.4,
      1,
      6,
    );

    expect(animations).toHaveLength(2);
    expect(animations[1]).toMatchObject({
      keyframes: { opacity: [0.4, 0.4] },
      options: { delay: 1, duration: 0.1, ease: "linear" },
    });
  });

  it("removes a keyframe at the playhead without removing other values", () => {
    const animations = removeComposeAnimationAttributeKeyframe(
      [
        {
          id: "fade",
          name: "Fade",
          keyframes: { opacity: [0, 0.5, 1] },
          options: { delay: 1, duration: 4 },
        },
      ],
      "opacity",
      3,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes.opacity).toEqual([0, 1]);
  });

  it("removes a synthetic current-time keyframe animation completely", () => {
    const animations = removeComposeAnimationAttributeKeyframe(
      [
        {
          id: "keyframe:opacity:test",
          name: "Opacity keyframe",
          keyframes: { opacity: [0.4, 0.4] },
          options: { delay: 1, duration: 0.1, ease: "linear" },
        },
      ],
      "opacity",
      1,
      6,
    );

    expect(animations).toEqual([]);
  });

  it("does not turn a hidden synthetic endpoint into an adjacent keyframe", () => {
    const animations = upsertComposeAnimationAttributeKeyframe(
      [
        {
          id: "keyframe:opacity:test",
          name: "Opacity keyframe",
          keyframes: { opacity: [0, 0] },
          options: { delay: 1, duration: 0.1, ease: "linear" },
        },
      ],
      "opacity",
      1,
      1.1,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes.opacity).toEqual([1, 1]);
  });

  it("removes a synthetic keyframe from its hidden endpoint time", () => {
    const animations = removeComposeAnimationAttributeKeyframe(
      [
        {
          id: "keyframe:opacity:test",
          name: "Opacity keyframe",
          keyframes: { opacity: [0.4, 0.4] },
          options: { delay: 1, duration: 0.1, ease: "linear" },
        },
      ],
      "opacity",
      1.1,
      6,
    );

    expect(animations).toEqual([]);
  });

  it("removes selected keyframes across attributes without touching others", () => {
    const animations = removeComposeAnimationKeyframeSelections(
      [
        {
          id: "move",
          name: "Move",
          keyframes: { opacity: [1, 0, 1], x: [0, 20, 40] },
          options: { duration: 4 },
        },
        {
          id: "scale",
          name: "Scale",
          keyframes: { scale: [1, 2] },
          options: { delay: 1, duration: 2 },
        },
      ],
      [
        { animationId: "move", key: "opacity", time: 2 },
        { animationId: "scale", key: "scale", time: 3 },
      ],
      6,
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].keyframes).toEqual({
      opacity: [1, 1],
      x: [0, 20, 40],
    });
  });
});

function frameObject(id: string): FrameObject {
  return {
    id,
    type: "text",
    name: id,
    selector: `#${id}`,
    bounds: { x: 0, y: 0, width: 100, height: 40 },
    style: {},
  };
}

function partWithObjects(objects: FrameObject[]): Part {
  return {
    id: "part",
    filePath: "part",
    duration: 6,
    frame: { width: 1920, height: 1080, style: {} },
    background: {
      id: "background",
      name: "Background",
      style: {},
      elements: [],
    },
    objects,
    snapshot: [],
    motionMarkers: [],
  };
}
