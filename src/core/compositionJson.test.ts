import { describe, expect, it } from "vitest";
import {
  compositionToJsonSource,
  jsonCompositionToPart,
  parseCompositionJson,
  parseCompositionJsonSource,
} from "./compositionJson";

describe("composition JSON schema", () => {
  it("accepts a minimal empty composition without background", () => {
    const result = parseCompositionJson({
      id: "comp-1",
      duration: 5,
      frame: { width: 1920, height: 1080 },
      objects: [],
    });

    expect(result).toMatchObject({
      ok: true,
      composition: {
        id: "comp-1",
        duration: 5,
        frame: { width: 1920, height: 1080 },
        objects: [],
      },
    });
    if (!result.ok) return;

    const part = jsonCompositionToPart(result.composition, {
      filePath: "compositions/comp-1.composition.json",
    });
    expect(part.background).toMatchObject({
      id: "background",
      name: "Background",
      style: { backgroundColor: "transparent" },
      elements: [],
    });
    expect(part.objects).toEqual([]);
  });

  it("parses structured objects, custom renderer props, and property tracks", () => {
    const result = parseCompositionJsonSource(
      JSON.stringify({
        id: "comp-1",
        duration: 8,
        frame: {
          width: 1920,
          height: 1080,
          style: { backgroundColor: "#111" },
        },
        objects: [
          {
            id: "hero",
            type: "custom-renderer",
            name: "Hero Renderer",
            bounds: { x: 10, y: 20, width: 300, height: 160 },
            source: { kind: "file", path: "components/Hero.tsx" },
            props: { density: 0.8 },
            tracks: {
              "bounds.x": {
                valueType: "number",
                points: [
                  { id: "x-0", time: 0, value: 10 },
                  { id: "x-1", time: 1, value: 120 },
                ],
              },
              "props.density": {
                valueType: "number",
                points: [{ time: 0, value: 0.8 }],
              },
            },
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      composition: {
        objects: [
          {
            id: "hero",
            type: "custom-renderer",
            props: { density: 0.8 },
            tracks: {
              "bounds.x": {
                valueType: "number",
                points: [
                  { id: "x-0", time: 0, value: 10 },
                  { id: "x-1", time: 1, value: 120 },
                ],
              },
            },
          },
        ],
      },
    });
  });

  it("returns structured validation errors for invalid composition data", () => {
    const result = parseCompositionJson({
      id: "bad",
      duration: "5",
      frame: { width: 1920 },
      objects: [
        {
          id: "object",
          type: "unknown",
          bounds: { x: 0, y: 0, width: 100 },
          tracks: { "bounds.x": { valueType: "number", points: "bad" } },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: "$.duration", message: "Value must be a finite number." },
        { path: "$.frame.height", message: "Value must be a finite number." },
        { path: "$.objects[0].type", message: "Unsupported object type." },
        {
          path: "$.objects[0].bounds.height",
          message: "Value must be a finite number.",
        },
        {
          path: "$.objects[0].tracks.bounds.x.points",
          message: "Track points must be an array.",
        },
      ]),
    );
  });

  it("serializes editor-owned compositions as JSON without generated imports", () => {
    const source = compositionToJsonSource({
      id: "comp-1",
      filePath: "compositions/comp-1.composition.json",
      duration: 5,
      frame: {
        width: 1920,
        height: 1080,
        style: { backgroundColor: "#050505" },
      },
      background: {
        id: "background",
        name: "Background",
        style: { backgroundColor: "transparent" },
        elements: [],
      },
      objects: [
        {
          id: "rect-1",
          name: "Rect 1",
          type: "rect",
          selector: "[data-object-id='rect-1']",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          style: { backgroundColor: "#fff" },
        },
      ],
      snapshot: [],
      motionMarkers: [],
    });

    expect(source).toContain('"objects"');
    expect(source).toContain('"rect-1"');
    expect(source).not.toContain("import");
    expect(source).not.toContain("new Composition");
  });

  it("round-trips drop-shadow effect through JSON", () => {
    const result = parseCompositionJson({
      id: "comp-shadow",
      duration: 5,
      frame: { width: 1920, height: 1080 },
      objects: [
        {
          id: "rect-shadow",
          type: "rect",
          name: "Shadow Rect",
          bounds: { x: 0, y: 0, width: 100, height: 100 },
          style: { backgroundColor: "#fff" },
          shadow: {
            enabled: true,
            x: 0,
            y: 4,
            blur: 4,
            spread: 0,
            color: "#000000",
            alpha: 25,
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const part = jsonCompositionToPart(result.composition, {
      filePath: "compositions/comp-shadow.composition.json",
    });
    expect(part.objects[0]?.shadow).toMatchObject({
      enabled: true,
      x: 0,
      y: 4,
      blur: 4,
      spread: 0,
      color: "#000000",
      alpha: 25,
    });

    const source = compositionToJsonSource(part);
    expect(source).toContain('"shadow"');
    expect(source).toContain('"alpha"');
  });
});
