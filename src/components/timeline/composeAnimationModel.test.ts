import { describe, expect, it } from "vitest";
import {
  buildComposeAnimationTimelineLayers,
  buildComposeAnimationTimelineRows,
  createComposeAnimationAttributeKeyframeAnimation,
  getComposeAnimationAttributeKeyframeAtTime,
  getComposeAnimationAttributeTracks,
  getComposeAnimationLayerKeyframes,
  getComposeParentOptions,
  getNearestComposeAnimationKeyframeValue,
  removeComposeAnimationAttributeKeyframe,
  removeComposeAnimationKeyframeSelections,
  upsertComposeAnimationAttributeKeyframe,
} from "./composeAnimationModel";
import { evaluateLayerAnimations } from "../../core/animations";
import type {
  AnimationTrackProperty,
  FrameObject,
  LayerAnimation,
  Part,
} from "../../core/types";

function animation(
  id: string,
  tracks: {
    property: AnimationTrackProperty;
    values: [number, number | string][];
  }[],
): LayerAnimation {
  return {
    id,
    name: id,
    tracks: tracks.map((track) => ({
      property: track.property,
      valueType:
        track.property === "color" || track.property === "backgroundColor"
          ? "color"
          : "number",
      points: track.values.map(([time, value], index) => ({
        id: `${track.property}:${index}`,
        time,
        value,
        easingToNext: "linear",
      })),
    })),
    options: { duration: 1, ease: "linear" },
  };
}

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

  it("builds expanded attribute rows from canonical tracks", () => {
    const object = {
      ...frameObject("shape"),
      animations: [
        animation("move", [
          {
            property: "x",
            values: [
              [1, 0],
              [3, 100],
              [5, 200],
            ],
          },
          {
            property: "opacity",
            values: [
              [1, 0],
              [5, 1],
            ],
          },
        ]),
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

  it("reads per-attribute keyframe times directly from point times", () => {
    const object = {
      ...frameObject("shape"),
      animations: [
        animation("move", [
          {
            property: "x",
            values: [
              [1, 0],
              [3, 100],
              [5, 200],
            ],
          },
          {
            property: "opacity",
            values: [
              [1, 0],
              [5, 1],
            ],
          },
        ]),
      ],
    };
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const tracks = getComposeAnimationAttributeTracks(layer);

    expect(tracks.find((track) => track.key === "x")?.keyframes).toMatchObject([
      { animationId: "move", time: 1, value: 0 },
      { animationId: "move", time: 3, value: 100 },
      { animationId: "move", time: 5, value: 200 },
    ]);
    expect(
      getComposeAnimationLayerKeyframes(layer).map((keyframe) => keyframe.time),
    ).toEqual([1, 3, 5]);
  });

  it("ignores stale legacy animation objects without crashing", () => {
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([
        {
          ...frameObject("shape"),
          animations: [
            {
              id: "legacy",
              keyframes: { x: [0, 100] },
              options: { duration: 1 },
            },
          ] as unknown as LayerAnimation[],
        },
      ]),
    );

    expect(getComposeAnimationAttributeTracks(layer)).toEqual([]);
  });

  it("ignores stale non-canonical animations without crashing", () => {
    const legacyAnimation = {
      id: "legacy",
      keyframes: { x: [0, 100] },
      options: { duration: 1 },
    };
    const object = {
      ...frameObject("shape"),
      animations: [legacyAnimation as unknown as LayerAnimation],
    };
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );

    expect(getComposeAnimationAttributeTracks(layer)).toEqual([]);
  });

  it("builds parent options with layer numbers and cycle prevention", () => {
    const child = { ...frameObject("child"), parentId: "parent" };
    const parent = { ...frameObject("parent") };
    const grandchild = { ...frameObject("grandchild"), parentId: "child" };
    const layers = buildComposeAnimationTimelineLayers(
      partWithObjects([child, parent, grandchild]),
    );

    expect(layers.map((layer) => `${layer.number}:${layer.id}`)).toEqual([
      "1:grandchild",
      "2:parent",
      "3:child",
      "4:background",
    ]);
    expect(
      getComposeParentOptions(layers, "parent").map((layer) => layer.id),
    ).toEqual([]);
    expect(
      getComposeParentOptions(layers, "child").map((layer) => layer.id),
    ).toEqual(["parent"]);
  });

  it("creates single-point attribute tracks at the playhead", () => {
    const created = createComposeAnimationAttributeKeyframeAnimation(
      "opacity",
      0.65,
      2.25,
      6,
    );

    expect(created).toMatchObject({
      name: "Opacity keyframes",
      tracks: [
        {
          property: "opacity",
          valueType: "number",
          points: [{ time: 2.25, value: 0.65, easingToNext: "linear" }],
        },
      ],
      options: { delay: 2.25, duration: 0.1, ease: "linear" },
    });
  });

  it("uses nearest existing attribute value for playhead lookup", () => {
    const object = {
      ...frameObject("shape"),
      animations: [
        animation("fade", [
          {
            property: "opacity",
            values: [
              [1, 0],
              [3, 0.5],
              [5, 1],
            ],
          },
        ]),
      ],
    };
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const [track] = getComposeAnimationAttributeTracks(layer);

    expect(getNearestComposeAnimationKeyframeValue(track, 2.8)).toBe(0.5);
    expect(getComposeAnimationAttributeKeyframeAtTime(track, 3)).toMatchObject({
      animationId: "fade",
      time: 3,
      value: 0.5,
    });
    expect(getComposeAnimationAttributeKeyframeAtTime(track, 2.8)).toBeNull();
  });

  it("updates an existing point when playhead time matches", () => {
    const animations = upsertComposeAnimationAttributeKeyframe(
      [
        animation("fade", [
          {
            property: "opacity",
            values: [
              [1, 0],
              [3, 0.5],
              [5, 1],
            ],
          },
        ]),
      ],
      "opacity",
      0.75,
      3,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].tracks[0].points.map((point) => point.value)).toEqual([
      0, 0.75, 1,
    ]);
  });

  it("inserts a playhead point into an existing canonical track", () => {
    const animations = upsertComposeAnimationAttributeKeyframe(
      [
        animation("fade", [
          {
            property: "opacity",
            values: [
              [0, 0],
              [2, 1],
            ],
          },
        ]),
      ],
      "opacity",
      0.4,
      1,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(
      animations[0].tracks[0].points.map((point) => [point.time, point.value]),
    ).toEqual([
      [0, 0],
      [1, 0.4],
      [2, 1],
    ]);
  });

  it("removes a keyframe at the playhead without removing other points", () => {
    const animations = removeComposeAnimationAttributeKeyframe(
      [
        animation("fade", [
          {
            property: "opacity",
            values: [
              [1, 0],
              [3, 0.5],
              [5, 1],
            ],
          },
        ]),
      ],
      "opacity",
      3,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(animations[0].tracks[0].points.map((point) => point.value)).toEqual([
      0, 1,
    ]);
  });

  it("removes a single-point animation completely", () => {
    const animations = removeComposeAnimationAttributeKeyframe(
      [animation("opacity", [{ property: "opacity", values: [[1, 0.4]] }])],
      "opacity",
      1,
      6,
    );

    expect(animations).toEqual([]);
  });

  it("inserts a later position keyframe without hidden duplicate endpoints", () => {
    const animations = upsertComposeAnimationAttributeKeyframe(
      [animation("x", [{ property: "x", values: [[0, 0]] }])],
      "x",
      120,
      4,
      6,
    );

    expect(animations).toHaveLength(1);
    expect(
      animations[0].tracks[0].points.map((point) => [point.time, point.value]),
    ).toEqual([
      [0, 0],
      [4, 120],
    ]);
  });

  it("animates position after paired inspector and drag keyframe inserts", () => {
    const firstKeyframe = upsertComposeAnimationAttributeKeyframe(
      upsertComposeAnimationAttributeKeyframe([], "x", 0, 0, 6),
      "y",
      0,
      0,
      6,
    );
    const secondKeyframe = upsertComposeAnimationAttributeKeyframe(
      upsertComposeAnimationAttributeKeyframe(firstKeyframe, "x", 120, 4, 6),
      "y",
      60,
      4,
      6,
    );

    expect(evaluateLayerAnimations(secondKeyframe, 2).transform).toBe(
      "translateX(60px) translateY(30px)",
    );
  });

  it("animates size after paired inspector keyframe inserts", () => {
    const firstKeyframe = upsertComposeAnimationAttributeKeyframe(
      upsertComposeAnimationAttributeKeyframe([], "width", 100, 0, 6),
      "height",
      80,
      0,
      6,
    );
    const secondKeyframe = upsertComposeAnimationAttributeKeyframe(
      upsertComposeAnimationAttributeKeyframe(
        firstKeyframe,
        "width",
        300,
        4,
        6,
      ),
      "height",
      160,
      4,
      6,
    );

    expect(evaluateLayerAnimations(secondKeyframe, 2)).toMatchObject({
      width: 200,
      height: 120,
    });
  });

  it("removes selected keyframes across attributes without touching others", () => {
    const animations = removeComposeAnimationKeyframeSelections(
      [
        animation("move", [
          {
            property: "opacity",
            values: [
              [0, 1],
              [2, 0],
              [4, 1],
            ],
          },
          {
            property: "x",
            values: [
              [0, 0],
              [2, 20],
              [4, 40],
            ],
          },
        ]),
        animation("scale", [
          {
            property: "scale",
            values: [
              [1, 1],
              [3, 2],
            ],
          },
        ]),
      ],
      [
        { animationId: "move", key: "opacity", time: 2 },
        { animationId: "scale", key: "scale", time: 3 },
      ],
      6,
    );

    expect(animations).toHaveLength(2);
    const move = animations.find((animation) => animation.id === "move");
    const scale = animations.find((animation) => animation.id === "scale");
    expect(move?.tracks).toHaveLength(2);
    expect(scale?.tracks).toHaveLength(1);
    expect(
      move?.tracks
        .find((track) => track.property === "opacity")
        ?.points.map((point) => point.value),
    ).toEqual([1, 1]);
    expect(
      move?.tracks
        .find((track) => track.property === "x")
        ?.points.map((point) => point.value),
    ).toEqual([0, 20, 40]);
    expect(scale?.tracks[0].points.map((point) => point.value)).toEqual([1]);
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
