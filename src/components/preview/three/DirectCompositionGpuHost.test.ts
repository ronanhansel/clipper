import { describe, expect, it } from "vitest";
import type { TimelinePreviewStackPart } from "../../../core/timeline";
import type { CompositionClip } from "../../../core/types";
import {
  getDirectSourceSlotCacheSlots,
  getDirectSourceSlotKey,
  hasDirectGpuPostProcessInputs,
  mergeDirectSourceSlotCache,
  shouldRenderDirectLiveClockFallback,
  shouldUseDirectSourceParentClock,
} from "./DirectCompositionGpuHost";

function sourceSlot(
  id: string,
  start: number,
  options: { compositionId?: string; layerId?: string } = {},
): TimelinePreviewStackPart {
  return {
    part: { id, duration: 1, ...options } as CompositionClip,
    start,
    previewTime: 0,
  };
}

function cacheIds(cache: Parameters<typeof getDirectSourceSlotCacheSlots>[0]) {
  return getDirectSourceSlotCacheSlots(cache).map((item) => item.part.id);
}

function directPart(id: string, objects: unknown[]): CompositionClip {
  return { id, duration: 3, objects } as unknown as CompositionClip;
}

describe("DirectCompositionGpuHost source slot cache", () => {
  it("keeps a source mounted when returning A -> B -> A", () => {
    const first = sourceSlot("a", 0);
    const second = sourceSlot("b", 1);

    const withFirst = mergeDirectSourceSlotCache({ stacks: [] }, [first]);
    const withSecond = mergeDirectSourceSlotCache(withFirst, [second]);
    const withFirstAgain = mergeDirectSourceSlotCache(withSecond, [first]);

    expect(cacheIds(withSecond)).toEqual(["b", "a"]);
    expect(cacheIds(withFirstAgain)).toEqual(["a", "b"]);
  });

  it("evicts oldest inactive slots and never evicts the current stack", () => {
    const current = [sourceSlot("a", 0), sourceSlot("b", 1)];
    const withOld = mergeDirectSourceSlotCache({ stacks: [] }, [
      sourceSlot("old", 2),
    ]);

    const next = mergeDirectSourceSlotCache(withOld, current, [], {
      slotLimit: 1,
    });

    expect(cacheIds(next)).toEqual(["a", "b"]);
  });

  it("keeps pinned transition targets alongside the active source", () => {
    const first = sourceSlot("from", 0);
    const second = sourceSlot("to", 1);

    const cache = mergeDirectSourceSlotCache({ stacks: [] }, [first], [second]);

    expect(cacheIds(cache)).toEqual(["from", "to"]);
  });

  it("preserves cached slots when Direct host renders through an empty gap", () => {
    const first = sourceSlot("a", 0);
    const cache = mergeDirectSourceSlotCache({ stacks: [] }, [first]);
    const throughGap = mergeDirectSourceSlotCache(cache, []);

    expect(cacheIds(throughGap)).toEqual(["a"]);
  });

  it("keys slots by composition identity plus timeline start and layer", () => {
    const first = sourceSlot("clip-a", 0, {
      compositionId: "shared",
      layerId: "layer-a",
    });
    const second = sourceSlot("clip-b", 5, {
      compositionId: "shared",
      layerId: "layer-a",
    });
    const third = sourceSlot("clip-c", 0, {
      compositionId: "shared",
      layerId: "layer-b",
    });

    expect(getDirectSourceSlotKey(first)).not.toEqual(
      getDirectSourceSlotKey(second),
    );
    expect(getDirectSourceSlotKey(first)).not.toEqual(
      getDirectSourceSlotKey(third),
    );
  });
});

describe("shouldRenderDirectLiveClockFallback", () => {
  it("lets scheduler own playback frames when available", () => {
    expect(
      shouldRenderDirectLiveClockFallback({
        hasScheduler: true,
        source: "playback",
      }),
    ).toBe(false);
  });

  it("keeps playback fallback when no scheduler is available", () => {
    expect(
      shouldRenderDirectLiveClockFallback({
        hasScheduler: false,
        source: "playback",
      }),
    ).toBe(true);
  });

  it("keeps scrub fallback even with a scheduler", () => {
    expect(
      shouldRenderDirectLiveClockFallback({
        hasScheduler: true,
        source: "scrub",
      }),
    ).toBe(true);
  });

  it("skips idle fallback", () => {
    expect(
      shouldRenderDirectLiveClockFallback({
        hasScheduler: false,
        source: "idle",
      }),
    ).toBe(false);
  });
});

describe("shouldUseDirectSourceParentClock", () => {
  it("skips whole-source live clock for static code-only sources", () => {
    expect(
      shouldUseDirectSourceParentClock({
        animationsEnabled: true,
        parts: [
          directPart("code-part", [
            {
              id: "code",
              name: "Code",
              type: "code",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              style: {},
              props: { source: "./Widget.tsx" },
            },
          ]),
        ],
      }),
    ).toBe(false);
  });

  it("skips whole-source live clock for tracked native objects", () => {
    expect(
      shouldUseDirectSourceParentClock({
        animationsEnabled: true,
        parts: [
          directPart("tracked-part", [
            {
              id: "rect",
              name: "Rect",
              type: "rect",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              style: {},
              tracks: {
                "bounds.x": {
                  valueType: "number",
                  points: [{ time: 0, value: 0 }],
                },
              },
            },
          ]),
        ],
      }),
    ).toBe(false);
  });

  it("skips whole-source live clock for media sources", () => {
    expect(
      shouldUseDirectSourceParentClock({
        animationsEnabled: false,
        parts: [
          directPart("media-part", [
            {
              id: "media",
              name: "Media",
              type: "media",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              style: { src: "clipper://media/movie.mp4" },
            },
          ]),
        ],
      }),
    ).toBe(false);
  });

  it("keeps whole-source live clock for tracked DOM-capture sources", () => {
    expect(
      shouldUseDirectSourceParentClock({
        animationsEnabled: true,
        parts: [
          directPart("html-part", [
            {
              id: "html",
              name: "HTML",
              type: "html",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              style: {},
              tracks: {
                "props.value": {
                  valueType: "number",
                  points: [{ time: 0, value: 0 }],
                },
              },
            },
          ]),
        ],
      }),
    ).toBe(true);
  });

  it("keeps whole-source live clock for nested composition sources", () => {
    expect(
      shouldUseDirectSourceParentClock({
        animationsEnabled: false,
        parts: [
          directPart("nested-part", [
            {
              id: "nested",
              name: "Nested",
              type: "composition",
              bounds: { x: 0, y: 0, width: 100, height: 100 },
              style: {},
              props: { compositionId: "child" },
            },
          ]),
        ],
      }),
    ).toBe(true);
  });
});

describe("hasDirectGpuPostProcessInputs", () => {
  it("returns false when Direct has no adjustment or transition layers", () => {
    expect(
      hasDirectGpuPostProcessInputs({
        adjustmentLayers: undefined,
        transitionLayers: [],
      }),
    ).toBe(false);
  });

  it("returns true when adjustment layers are present", () => {
    expect(
      hasDirectGpuPostProcessInputs({
        adjustmentLayers: [{} as never],
        transitionLayers: [],
      }),
    ).toBe(true);
  });

  it("returns true when transition layers are present", () => {
    expect(
      hasDirectGpuPostProcessInputs({
        adjustmentLayers: [],
        transitionLayers: [{} as never],
      }),
    ).toBe(true);
  });
});
