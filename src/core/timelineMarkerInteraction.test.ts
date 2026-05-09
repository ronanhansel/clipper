import { describe, expect, it } from "vitest";
import { buildLinearTimeline } from "./timeline";
import {
  getTimelineMarkerMoveState,
  getTimelineMarkerResizeCommits,
  getTimelineMarkerResizePreviewMap,
  getTimelineMarkerResizeState,
} from "./timelineMarkerInteraction";
import { motionBlocksToMotionMarkers } from "./motionEffects";
import type { PartFrame, Scene, TimelinePart } from "./types";
import type { TimelineLayerLayout } from "./timelineLayers";

const frame: PartFrame = { width: 1920, height: 1080, style: {} };
const background = { id: "bg", name: "Background", style: {}, elements: [] };
const baseScene: Scene = {
  id: "scene",
  compositions: [
    {
      id: "a",
      filePath: "A.composition.ts",
      duration: 10,
      frame,
      background,
      objects: [],
      snapshot: [],
      motionMarkers: [],
    },
  ],
};

const motionLayout: TimelineLayerLayout = {
  rows: [
    { key: "camera", category: "motion", accent: "#fff" },
    { key: "camera-2", category: "motion", accent: "#fff" },
  ],
  starts: [0, 40],
  heights: [40, 40],
};

describe("timeline marker interactions", () => {
  it("derives marker move commits without changing marker duration", () => {
    const timeline = buildLinearTimeline({
      ...baseScene,
      compositions: [
        {
          ...baseScene.compositions[0],
          motionMarkers: motionBlocksToMotionMarkers([
            {
              id: "rightmost",
              effectId: "clipper.motion.zoom",
              layerId: "camera",
              start: 8,
              duration: 2,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
            },
          ]),
        },
      ],
    });
    const marker = timeline[0].motionMarkers[0];
    const dragItems = [
      {
        partId: timeline[0].id,
        markerId: marker.id,
        absoluteStart: timeline[0].start + marker.start,
        duration: marker.duration,
      },
    ];

    const state = getTimelineMarkerMoveState({
      timeline,
      dragItems,
      rawDeltaSeconds: -1.5,
      timelineDuration: 15,
      snap: false,
      snapBoundaries: [],
      snapThresholdSeconds: 0.1,
      motionKind: marker.kind,
      activePartIds: new Map([
        [`${timeline[0].id}:${marker.id}`, timeline[0].id],
      ]),
      layerLayout: motionLayout,
      sourceLayerId: "camera",
      markerLayerLookup: new Map([
        [`${timeline[0].id}:${marker.id}`, "camera"],
      ]),
      containerRect: { top: 0 },
      clientY: 10,
      isLayerLocked: () => false,
    });

    expect(state.moves).toEqual([
      {
        sourcePartId: "a",
        markerId: "rightmost",
        targetPartId: "a",
        start: 6.5,
        targetLayerId: "camera",
      },
    ]);
    expect(dragItems[0].duration).toBe(2);
  });

  it("derives marker row moves separately from time moves", () => {
    const timeline = buildLinearTimeline({
      ...baseScene,
      compositions: [
        {
          ...baseScene.compositions[0],
          motionMarkers: motionBlocksToMotionMarkers([
            {
              id: "zoom",
              effectId: "clipper.motion.zoom",
              layerId: "camera",
              start: 2,
              duration: 2,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
            },
          ]),
        },
      ],
    });
    const marker = timeline[0].motionMarkers[0];
    const dragItems = [
      {
        partId: timeline[0].id,
        markerId: marker.id,
        absoluteStart: 2,
        duration: 2,
      },
    ];

    const state = getTimelineMarkerMoveState({
      timeline,
      dragItems,
      rawDeltaSeconds: 0,
      timelineDuration: 15,
      snap: false,
      snapBoundaries: [],
      snapThresholdSeconds: 0.1,
      motionKind: marker.kind,
      activePartIds: new Map([
        [`${timeline[0].id}:${marker.id}`, timeline[0].id],
      ]),
      layerLayout: motionLayout,
      sourceLayerId: "camera",
      markerLayerLookup: new Map([
        [`${timeline[0].id}:${marker.id}`, "camera"],
      ]),
      containerRect: { top: 0 },
      clientY: 60,
      isLayerLocked: () => false,
    });

    expect(state.moves[0]).toMatchObject({
      start: 2,
      targetLayerId: "camera-2",
    });
    expect(state.layerTargets.get("a:zoom")).toBe("camera-2");
  });

  it("keeps resize derivation isolated to resize state", () => {
    const markers = [
      {
        id: "first",
        sourcePartId: "a",
        sourcePartStart: 0,
        start: 0,
        duration: 2,
        mendOutId: "second",
      },
      {
        id: "second",
        sourcePartId: "a",
        sourcePartStart: 0,
        start: 2,
        duration: 2,
        mendInId: "first",
      },
    ];

    const resized = getTimelineMarkerResizeState({
      markers,
      markerId: "first",
      sourcePartId: "a",
      action: "end",
      deltaSeconds: 0.5,
      precision: 2,
    });

    expect(getTimelineMarkerResizeCommits(resized, 2)).toEqual([
      { sourcePartId: "a", markerId: "first", absoluteStart: 0, duration: 2.5 },
      {
        sourcePartId: "a",
        markerId: "second",
        absoluteStart: 2.5,
        duration: 1.5,
      },
    ]);
    expect(
      getTimelineMarkerResizePreviewMap(resized)
        .get("a")
        ?.map((marker) => ({
          id: marker.id,
          start: marker.start,
          duration: marker.duration,
        })),
    ).toEqual([
      { id: "first", start: 0, duration: 2.5 },
      { id: "second", start: 2.5, duration: 1.5 },
    ]);
  });
});
