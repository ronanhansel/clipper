import { describe, expect, it } from "vitest";
import {
  defaultPropertyRegistry,
  evaluateCompositionState,
  evaluateObjectState,
  evaluateProperty,
  removePropertyKeyframe,
  setPropertyBaseValue,
  upsertPropertyKeyframe,
} from "./propertyRegistry";
import type { FrameObject, Part, PropertyTrack } from "./types";

const object: FrameObject = {
  id: "rect-1",
  name: "Rect 1",
  type: "rect",
  selector: "[data-object-id='rect-1']",
  bounds: { x: 10, y: 20, width: 100, height: 50 },
  style: { opacity: 0.5, backgroundColor: "#111" },
  props: { density: 0.2 },
};

describe("property registry and evaluated state", () => {
  it("evaluates base value when no track exists", () => {
    const definition = defaultPropertyRegistry.require("bounds.x");

    expect(evaluateProperty(10, undefined, 1, definition)).toBe(10);
  });

  it("holds single-point tracks and endpoints", () => {
    const definition = defaultPropertyRegistry.require("bounds.x");
    const track: PropertyTrack = {
      valueType: "number",
      points: [{ time: 2, value: 80 }],
    };

    expect(evaluateProperty(10, track, 0, definition)).toBe(80);
    expect(evaluateProperty(10, track, 8, definition)).toBe(80);
  });

  it("interpolates numeric and color tracks", () => {
    const xDefinition = defaultPropertyRegistry.require("bounds.x");
    const colorDefinition = defaultPropertyRegistry.require(
      "style.backgroundColor",
    );

    expect(
      evaluateProperty(
        0,
        {
          valueType: "number",
          points: [
            { time: 0, value: 0 },
            { time: 2, value: 100 },
          ],
        },
        1,
        xDefinition,
      ),
    ).toBe(50);
    expect(
      evaluateProperty(
        "#111",
        {
          valueType: "color" as const,
          points: [
            { time: 0, value: "#111" },
            { time: 2, value: "#fff" },
          ],
        },
        1,
        colorDefinition,
      ),
    ).toBe("rgba(136, 136, 136, 1.00)");
  });

  it("evaluates canonical object state from absolute property tracks", () => {
    const evaluated = evaluateObjectState(
      {
        ...object,
        tracks: {
          "bounds.x": {
            valueType: "number",
            points: [
              { time: 0, value: 10 },
              { time: 2, value: 110 },
            ],
          },
          "bounds.width": {
            valueType: "number",
            points: [
              { time: 0, value: 100 },
              { time: 2, value: 200 },
            ],
          },
          "style.opacity": {
            valueType: "number",
            points: [
              { time: 0, value: 0.5 },
              { time: 2, value: 1 },
            ],
          },
          "props.density": {
            valueType: "number",
            points: [
              { time: 0, value: 0.2 },
              { time: 2, value: 0.8 },
            ],
          },
        },
      },
      1,
    );

    expect(evaluated.bounds).toEqual({
      x: 60,
      y: 20,
      width: 150,
      height: 50,
    });
    expect(evaluated.style.opacity).toBe(0.75);
    expect(evaluated.props.density).toBe(0.5);
  });

  it("evaluates every object in a composition", () => {
    const composition: Part = {
      id: "comp-1",
      filePath: "comp-1.composition.json",
      duration: 5,
      frame: { width: 1920, height: 1080, style: {} },
      background: {
        id: "background",
        name: "Background",
        style: {},
        elements: [],
      },
      objects: [
        {
          ...object,
          tracks: {
            "bounds.y": {
              valueType: "number",
              points: [
                { time: 0, value: 20 },
                { time: 1, value: 60 },
              ],
            },
          },
        },
      ],
      snapshot: [],
      motionMarkers: [],
    };

    expect(evaluateCompositionState(composition, 0.5).objects[0].bounds.y).toBe(
      40,
    );
  });

  it("interpolates color tracks between mid-points", () => {
    const definition = defaultPropertyRegistry.require("style.backgroundColor");
    const track = {
      valueType: "color" as const,
      points: [
        { time: 0, value: "#000000" },
        { time: 1, value: "#ffffff" },
      ],
    };

    const midValue = evaluateProperty("#000", track, 0.5, definition);
    // Midpoint of 0 and 255 is 128
    expect(midValue).toBe("rgba(128, 128, 128, 1.00)");
  });

  it("upserts animated edits as keyframes and static edits as base values", () => {
    const animated = upsertPropertyKeyframe(
      object,
      "bounds.x",
      1,
      42,
      defaultPropertyRegistry,
    );
    const staticEdit = setPropertyBaseValue(object, "bounds.x", 42);

    expect(animated.bounds.x).toBe(10);
    expect(animated.tracks?.["bounds.x"].points).toMatchObject([
      { id: "rect-1:bounds.x:1", time: 1, value: 42 },
    ]);
    expect(staticEdit.bounds.x).toBe(42);
  });

  it("preserves current evaluated value as base when deleting the final keyframe", () => {
    const animated: FrameObject = {
      ...object,
      tracks: {
        "bounds.x": {
          valueType: "number",
          points: [
            { time: 0, value: 10 },
            { time: 2, value: 110 },
          ],
        },
      },
    };

    const withoutFirst = removePropertyKeyframe(animated, "bounds.x", 0, 1);
    const withoutFinal = removePropertyKeyframe(withoutFirst, "bounds.x", 2, 1);

    expect(withoutFinal.bounds.x).toBe(110);
    expect(withoutFinal.tracks?.["bounds.x"]).toBeUndefined();
  });

  it("evaluates shadow record only when shadow is set", () => {
    expect(evaluateObjectState(object, 0).shadow).toEqual({});
    const withShadow: FrameObject = {
      ...object,
      shadow: { enabled: true },
    };
    expect(evaluateObjectState(withShadow, 0).shadow).toMatchObject({
      enabled: true,
      x: 0,
      y: 4,
      blur: 4,
      spread: 0,
      color: "#000000",
      alpha: 25,
    });
  });

  it("upserts and interpolates shadow keyframes", () => {
    const withShadow: FrameObject = {
      ...object,
      shadow: {
        enabled: true,
        x: 0,
        y: 4,
        blur: 4,
        color: "#000000",
        alpha: 25,
      },
    };
    let next = upsertPropertyKeyframe(withShadow, "shadow.x", 0, 0);
    next = upsertPropertyKeyframe(next, "shadow.x", 1, 20);
    expect(evaluateObjectState(next, 0.5).shadow.x).toBe(10);
  });

  it("interpolates shadow color across keyframes", () => {
    const withShadow: FrameObject = {
      ...object,
      shadow: { color: "#000000", alpha: 25 },
    };
    let next = upsertPropertyKeyframe(withShadow, "shadow.color", 0, "#000000");
    next = upsertPropertyKeyframe(next, "shadow.color", 1, "#ffffff");
    const mid = evaluateObjectState(next, 0.5).shadow.color;
    expect(typeof mid).toBe("string");
    expect(String(mid).startsWith("rgba(")).toBe(true);
  });
});
