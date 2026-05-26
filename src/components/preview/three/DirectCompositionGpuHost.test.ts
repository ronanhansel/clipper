import { describe, expect, it } from "vitest";
import type { TimelinePreviewStackPart } from "../../../core/timeline";
import type { CompositionClip } from "../../../core/types";
import {
  getDirectSourceSlotCacheSlots,
  getDirectSourceSlotKey,
  mergeDirectSourceSlotCache,
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
