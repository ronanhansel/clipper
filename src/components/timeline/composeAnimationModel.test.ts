import { describe, expect, it } from "vitest";
import {
  buildComposeAnimationTimelineLayers,
  buildComposeAnimationTimelineRows,
  getComposeAnimationAttributeKeyframeAtTime,
  getComposeAnimationAttributeTracks,
  getComposeAnimationLayerKeyframes,
  getComposeParentOptions,
  getNearestComposeAnimationKeyframeValue,
  moveComposeGenericPropertyKeyframe,
  moveComposeGenericPropertyKeyframesAtTime,
  removeComposeGenericPropertyKeyframeSelections,
} from "./composeAnimationModel";
import { evaluateObjectState } from "../../core/propertyRegistry";
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

  it("builds expanded attribute rows from generic property tracks", () => {
    const object = {
      ...frameObject("shape"),
      tracks: {
        "bounds.x": {
          valueType: "number",
          points: [
            { time: 1, value: 0 },
            { time: 3, value: 100 },
            { time: 5, value: 200 },
          ],
        },
        "style.opacity": {
          valueType: "number",
          points: [
            { time: 1, value: 0 },
            { time: 5, value: 1 },
          ],
        },
      },
    } satisfies FrameObject;
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

  it("reads per-attribute keyframe times directly from generic track points", () => {
    const object = {
      ...frameObject("shape"),
      tracks: {
        "bounds.x": {
          valueType: "number",
          points: [
            { time: 1, value: 0 },
            { time: 3, value: 100 },
            { time: 5, value: 200 },
          ],
        },
        "style.opacity": {
          valueType: "number",
          points: [
            { time: 1, value: 0 },
            { time: 5, value: 1 },
          ],
        },
      },
    } satisfies FrameObject;
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const tracks = getComposeAnimationAttributeTracks(layer);

    expect(tracks.find((track) => track.key === "x")?.keyframes).toMatchObject([
      { animationId: "property:bounds.x", time: 1, value: 0 },
      { animationId: "property:bounds.x", time: 3, value: 100 },
      { animationId: "property:bounds.x", time: 5, value: 200 },
    ]);
    expect(
      getComposeAnimationLayerKeyframes(layer).map((keyframe) => keyframe.time),
    ).toEqual([1, 3, 5]);
  });

  it("builds timeline attribute rows from generic property tracks", () => {
    const object = {
      ...frameObject("shape"),
      tracks: {
        "bounds.x": {
          valueType: "number",
          points: [
            { id: "x-0", time: 0, value: 10 },
            { id: "x-1", time: 2, value: 110 },
          ],
        },
        "style.opacity": {
          valueType: "number",
          points: [
            { id: "o-0", time: 0, value: 0.25 },
            { id: "o-1", time: 2, value: 1 },
          ],
        },
      },
    } satisfies FrameObject;
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const tracks = getComposeAnimationAttributeTracks(layer);

    expect(tracks.map((track) => track.id)).toEqual(["opacity", "x"]);
    expect(tracks.find((track) => track.key === "x")?.keyframes).toMatchObject([
      {
        animationId: "property:bounds.x",
        pointId: "x-0",
        propertyPath: "bounds.x",
        time: 0,
        value: 10,
      },
      {
        animationId: "property:bounds.x",
        pointId: "x-1",
        propertyPath: "bounds.x",
        time: 2,
        value: 110,
      },
    ]);
  });

  it("moves generic property keyframes from timeline interactions", () => {
    const object = {
      ...frameObject("shape"),
      tracks: {
        "bounds.x": {
          valueType: "number",
          points: [
            { id: "x-0", time: 0, value: 10 },
            { id: "x-1", time: 2, value: 110 },
          ],
        },
        "bounds.y": {
          valueType: "number",
          points: [
            { id: "y-0", time: 0, value: 20 },
            { id: "y-1", time: 2, value: 220 },
          ],
        },
      },
    } satisfies FrameObject;

    const movedTrack = moveComposeGenericPropertyKeyframe(
      object,
      "property:bounds.x",
      1,
      6,
    );
    expect(
      movedTrack.tracks?.["bounds.x"]?.points.map((point) => point.time),
    ).toEqual([1, 2]);

    const movedGroup = moveComposeGenericPropertyKeyframesAtTime(
      object,
      2,
      3,
      6,
    );
    expect(
      movedGroup.tracks?.["bounds.x"]?.points.map((point) => point.time),
    ).toEqual([0, 3]);
    expect(
      movedGroup.tracks?.["bounds.y"]?.points.map((point) => point.time),
    ).toEqual([0, 3]);
  });

  it("removes generic property keyframes while preserving final evaluated value", () => {
    const object = {
      ...frameObject("shape"),
      tracks: {
        "bounds.x": {
          valueType: "number",
          points: [
            { id: "x-0", time: 0, value: 10 },
            { id: "x-1", time: 2, value: 110 },
          ],
        },
      },
    } satisfies FrameObject;

    const withoutFirst = removeComposeGenericPropertyKeyframeSelections(
      object,
      [{ animationId: "property:bounds.x", key: "x", time: 0 }],
      1,
      6,
    );
    const withoutFinal = removeComposeGenericPropertyKeyframeSelections(
      withoutFirst,
      [{ animationId: "property:bounds.x", key: "x", time: 2 }],
      1,
      6,
    );

    expect(withoutFinal.tracks).toBeUndefined();
    expect(evaluateObjectState(withoutFinal, 1).bounds.x).toBe(110);
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

  it("uses nearest existing generic attribute value for playhead lookup", () => {
    const object = {
      ...frameObject("shape"),
      tracks: {
        "style.opacity": {
          valueType: "number",
          points: [
            { time: 1, value: 0 },
            { time: 3, value: 0.5 },
            { time: 5, value: 1 },
          ],
        },
      },
    } satisfies FrameObject;
    const [layer] = buildComposeAnimationTimelineLayers(
      partWithObjects([object]),
    );
    const [track] = getComposeAnimationAttributeTracks(layer);

    expect(getNearestComposeAnimationKeyframeValue(track, 2.8)).toBe(0.5);
    expect(getComposeAnimationAttributeKeyframeAtTime(track, 3)).toMatchObject({
      animationId: "property:style.opacity",
      time: 3,
      value: 0.5,
    });
    expect(getComposeAnimationAttributeKeyframeAtTime(track, 2.8)).toBeNull();
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
