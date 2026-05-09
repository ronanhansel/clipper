import { describe, expect, it } from "vitest";
import type { CompositionClip } from "../../../core/types";
import { resolveCanonicalComposition } from "./compositionIdentity";

const frame = { width: 1920 as const, height: 1080 as const, style: {} };
const background = { id: "bg", name: "Background", style: {}, elements: [] };

function composition(id: string, filePath: string): CompositionClip {
  return {
    id,
    filePath,
    duration: 5,
    frame,
    background,
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

describe("composition identity", () => {
  it("prefers canonical library file paths over stale timeline copies", () => {
    const library = [
      composition("composition-b", "compositions/B renamed.composition.ts"),
    ];
    const timeline = [
      {
        ...composition("composition-b", "compositions/B.composition.ts"),
        start: 0,
      },
    ];

    expect(
      resolveCanonicalComposition(library, timeline, "composition-b")?.filePath,
    ).toBe("compositions/B renamed.composition.ts");
  });

  it("resolves timeline clip copies through compositionId before falling back", () => {
    const library = [
      composition("composition-source", "compositions/source.composition.ts"),
    ];
    const timeline = [
      {
        ...composition("clip-instance", "compositions/stale.composition.ts"),
        compositionId: "composition-source",
        start: 0,
      },
    ];

    expect(
      resolveCanonicalComposition(library, timeline, "clip-instance")?.filePath,
    ).toBe("compositions/source.composition.ts");
  });
});
