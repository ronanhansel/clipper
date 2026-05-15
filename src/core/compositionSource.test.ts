import { describe, expect, it } from "vitest";
import { evaluateObjectState } from "./propertyRegistry";
import { compositionFromSource } from "./compositionSource";
import type { Part } from "./types";

const basePart: Part = {
  id: "comp-1",
  filePath: "compositions/comp-1.composition.json",
  duration: 5,
  frame: { width: 1920, height: 1080, style: {} },
  background: {
    id: "background",
    name: "Background",
    style: {},
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

describe("composition JSON source integration", () => {
  it("loads custom renderer source files into renderable content", async () => {
    const part = await compositionFromSource(
      basePart,
      JSON.stringify({
        id: "comp-1",
        duration: 5,
        frame: { width: 1920, height: 1080 },
        objects: [
          {
            id: "hero",
            type: "custom-renderer",
            bounds: { x: 0, y: 0, width: 400, height: 240 },
            source: { kind: "file", path: "components/Hero.html" },
          },
        ],
      }),
      async (relativePath) => {
        expect(relativePath).toBe("components/Hero.html");
        return "<div data-hero>Hero renderer</div>";
      },
    );

    expect(part.objects[0]).toMatchObject({
      id: "hero",
      type: "custom-renderer",
      content: "<div data-hero>Hero renderer</div>",
    });
  });

  it("contains missing custom renderer source errors inside the object", async () => {
    const part = await compositionFromSource(
      basePart,
      JSON.stringify({
        id: "comp-1",
        duration: 5,
        frame: { width: 1920, height: 1080 },
        objects: [
          {
            id: "hero",
            type: "custom-renderer",
            bounds: { x: 0, y: 0, width: 400, height: 240 },
            source: { kind: "file", path: "components/Missing.html" },
          },
        ],
      }),
      async () => {
        throw new Error("Missing renderer file");
      },
    );

    expect(part.compositionError).toBeUndefined();
    expect(part.objects[0]?.content).toContain("Missing renderer file");
    expect(part.objects[0]?.style).toMatchObject({
      color: "#ff6b7a",
      padding: 16,
    });
  });

  it("evaluates custom renderer prop tracks for renderer delivery", async () => {
    const part = await compositionFromSource(
      basePart,
      JSON.stringify({
        id: "comp-1",
        duration: 5,
        frame: { width: 1920, height: 1080 },
        objects: [
          {
            id: "hero",
            type: "custom-renderer",
            bounds: { x: 0, y: 0, width: 400, height: 240 },
            content: "<div data-hero></div>",
            props: { density: 0.2 },
            tracks: {
              "props.density": {
                valueType: "number",
                points: [
                  { time: 0, value: 0.2 },
                  { time: 2, value: 0.8 },
                ],
              },
            },
          },
        ],
      }),
    );

    expect(evaluateObjectState(part.objects[0]!, 1).props.density).toBe(0.5);
  });

  it("throws structured parse errors for invalid property tracks", async () => {
    await expect(
      compositionFromSource(
        basePart,
        JSON.stringify({
          id: "comp-1",
          duration: 5,
          frame: { width: 1920, height: 1080 },
          objects: [
            {
              id: "hero",
              type: "custom-renderer",
              bounds: { x: 0, y: 0, width: 400, height: 240 },
              tracks: {
                "props.density": {
                  valueType: "vector",
                  points: "bad",
                },
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow(/Unsupported track value type/);
  });
});
