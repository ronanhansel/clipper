import { describe, expect, it } from "vitest";
import { resolveOsCompositionDragMetadata } from "./OsFileManager";

describe("resolveOsCompositionDragMetadata", () => {
  it("uses loaded composition duration and state for drag previews", () => {
    const metadata = resolveOsCompositionDragMetadata([
      {
        id: "compositions/title.composition.ts",
        filePath: "compositions/title.composition.ts",
        duration: 12,
        objects: [{ id: "text", name: "Text", type: "text", selector: "#text", bounds: { x: 0, y: 0, width: 100, height: 40 }, style: {} }],
        background: { id: "bg", name: "Background", style: {}, elements: [] },
        sourceMissing: true,
      },
    ], "compositions/title.composition.ts");

    expect(metadata).toEqual({
      duration: 12,
      isEmpty: false,
      filePath: "compositions/title.composition.ts",
      sourceMissing: true,
    });
  });

  it("falls back to default composition preview metadata when unloaded", () => {
    expect(resolveOsCompositionDragMetadata([], "compositions/missing.composition.ts")).toEqual({
      duration: 5,
      isEmpty: true,
      filePath: undefined,
      sourceMissing: false,
    });
  });
});
