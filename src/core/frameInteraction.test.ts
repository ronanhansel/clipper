import { describe, expect, it } from "vitest";
import {
  constrainDragDeltaToDominantAxis,
  getBoundsWithPreviewTransform,
  getFrameObjectPreviewTransform,
  getFrameObjectWithPreviewBounds,
  getObjectDragSnap,
  getResizedObjects,
} from "./frameInteraction";
import type { FrameObject } from "./types";

describe("frame interaction", () => {
  const rect = (
    id: string,
    bounds: FrameObject["bounds"],
    hidden = false,
  ): FrameObject => ({
    id,
    name: id,
    type: "rect",
    selector: `[data-object-id='${id}']`,
    bounds,
    hidden,
    style: {},
  });

  it("leaves unconstrained drag deltas unchanged", () => {
    expect(constrainDragDeltaToDominantAxis({ x: 24, y: -12 }, false)).toEqual({
      x: 24,
      y: -12,
    });
  });

  it("locks constrained drag deltas to the dominant horizontal axis", () => {
    expect(constrainDragDeltaToDominantAxis({ x: 24, y: -12 }, true)).toEqual({
      x: 24,
      y: 0,
    });
  });

  it("locks constrained drag deltas to the dominant vertical axis", () => {
    expect(constrainDragDeltaToDominantAxis({ x: 8, y: -20 }, true)).toEqual({
      x: 0,
      y: -20,
    });
  });

  it("snaps object drag to frame center", () => {
    const drag = {
      origin: { x: 0, y: 0 },
      partId: "part",
      objects: [rect("selected", { x: 100, y: 100, width: 200, height: 100 })],
    };

    expect(getObjectDragSnap(drag, { x: 759, y: 389 }, [], 8)).toEqual({
      delta: { x: 760, y: 390 },
      guides: [
        { axis: "x", position: 960 },
        { axis: "y", position: 540 },
      ],
    });
  });

  it("snaps object drag to object edge", () => {
    const drag = {
      origin: { x: 0, y: 0 },
      partId: "part",
      objects: [rect("selected", { x: 100, y: 100, width: 100, height: 100 })],
    };

    expect(
      getObjectDragSnap(
        drag,
        { x: 197, y: 0 },
        [rect("target", { x: 300, y: 400, width: 100, height: 100 })],
        8,
      ),
    ).toEqual({
      delta: { x: 200, y: 0 },
      guides: [{ axis: "x", position: 300 }],
    });
  });

  it("excludes selected and hidden objects from drag snap targets", () => {
    const selected = rect("selected", {
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    });
    const drag = {
      origin: { x: 0, y: 0 },
      partId: "part",
      objects: [selected],
    };

    expect(
      getObjectDragSnap(
        drag,
        { x: 197, y: 0 },
        [
          selected,
          rect("hidden", { x: 300, y: 100, width: 100, height: 100 }, true),
        ],
        8,
      ),
    ).toEqual({ delta: { x: 197, y: 0 }, guides: [] });
  });

  it("does not snap object drag beyond threshold", () => {
    const drag = {
      origin: { x: 0, y: 0 },
      partId: "part",
      objects: [rect("selected", { x: 100, y: 100, width: 100, height: 100 })],
    };

    expect(
      getObjectDragSnap(
        drag,
        { x: 189, y: 0 },
        [rect("target", { x: 300, y: 400, width: 100, height: 100 })],
        8,
      ),
    ).toEqual({ delta: { x: 189, y: 0 }, guides: [] });
  });

  it("uses closest object drag snap guide", () => {
    const drag = {
      origin: { x: 0, y: 0 },
      partId: "part",
      objects: [rect("selected", { x: 100, y: 100, width: 100, height: 100 })],
    };

    expect(
      getObjectDragSnap(
        drag,
        { x: 196, y: 0 },
        [
          rect("far", { x: 300, y: 400, width: 100, height: 100 }),
          rect("near", { x: 298, y: 400, width: 100, height: 100 }),
        ],
        8,
      ),
    ).toEqual({
      delta: { x: 198, y: 0 },
      guides: [{ axis: "x", position: 298 }],
    });
  });

  it("snaps object drag axes independently", () => {
    const drag = {
      origin: { x: 0, y: 0 },
      partId: "part",
      objects: [rect("selected", { x: 100, y: 100, width: 100, height: 100 })],
    };

    expect(
      getObjectDragSnap(
        drag,
        { x: 197, y: 297 },
        [rect("target", { x: 300, y: 400, width: 100, height: 100 })],
        8,
      ),
    ).toEqual({
      delta: { x: 200, y: 300 },
      guides: [
        { axis: "x", position: 300 },
        { axis: "y", position: 400 },
      ],
    });
  });

  it("uses object transform for preview selection bounds when no animation transform exists", () => {
    const object: FrameObject = {
      id: "text",
      name: "Text",
      type: "text",
      selector: "[data-object-id='text']",
      bounds: { x: 100, y: 80, width: 200, height: 60 },
      style: { transform: "translate3d(500px, 120px, 0) scale(1.5)" },
      content: "Text",
    };

    expect(getFrameObjectWithPreviewBounds(object, 0, 1).bounds).toEqual({
      x: 550,
      y: 185,
      width: 300,
      height: 90,
    });
  });

  it("keeps transformed object resize anchored in display space", () => {
    const object: FrameObject = {
      id: "text",
      name: "Text",
      type: "text",
      selector: "[data-object-id='text']",
      bounds: { x: 100, y: 80, width: 200, height: 60 },
      style: { transform: "translate3d(500px, 120px, 0) scale(1.5)" },
      content: "Text",
    };
    const transform = getFrameObjectPreviewTransform(object, 0, 1);
    const displaySelectionBox = getBoundsWithPreviewTransform(
      object.bounds,
      transform,
    );

    const [resized] = getResizedObjects(
      {
        origin: { x: 0, y: 0 },
        handle: "right",
        partId: "part",
        selectionBox: object.bounds,
        displaySelectionBox,
        aspectRatio: displaySelectionBox.width / displaySelectionBox.height,
        objectPreviewTransforms: { [object.id]: transform },
        objects: [
          {
            id: object.id,
            name: object.name,
            selector: object.selector,
            type: object.type,
            bounds: object.bounds,
          },
        ],
        preservedObjects: [
          {
            id: object.id,
            name: object.name,
            selector: object.selector,
            type: object.type,
            bounds: object.bounds,
          },
        ],
        mode: "resize",
      },
      { x: 30, y: 0 },
    );

    expect(resized.bounds).toEqual({ x: 105, y: 80, width: 220, height: 60 });
    expect(getBoundsWithPreviewTransform(resized.bounds, transform)).toEqual({
      x: 550,
      y: 185,
      width: 330,
      height: 90,
    });
  });

  it("keeps percent-translated text resize anchored in display space", () => {
    const object: FrameObject = {
      id: "text",
      name: "Text",
      type: "text",
      selector: "[data-object-id='text']",
      bounds: { x: 960, y: 540, width: 320, height: 120 },
      style: { transform: "translate(-50%, -50%)", fontSize: 48 },
      content: "Text",
    };
    const transform = getFrameObjectPreviewTransform(object, 0, 1);
    const displaySelectionBox = getBoundsWithPreviewTransform(
      object.bounds,
      transform,
    );

    expect(displaySelectionBox).toEqual({
      x: 800,
      y: 480,
      width: 320,
      height: 120,
    });

    const [resized] = getResizedObjects(
      {
        origin: { x: 0, y: 0 },
        handle: "bottom",
        partId: "part",
        selectionBox: object.bounds,
        displaySelectionBox,
        aspectRatio: displaySelectionBox.width / displaySelectionBox.height,
        objectPreviewTransforms: { [object.id]: transform },
        objects: [
          {
            id: object.id,
            name: object.name,
            selector: object.selector,
            type: object.type,
            bounds: object.bounds,
          },
        ],
        preservedObjects: [
          {
            id: object.id,
            name: object.name,
            selector: object.selector,
            type: object.type,
            bounds: object.bounds,
          },
        ],
        mode: "resize",
      },
      { x: 0, y: 40 },
    );

    expect(resized.bounds).toEqual({ x: 960, y: 560, width: 320, height: 160 });
    expect(getBoundsWithPreviewTransform(resized.bounds, transform)).toEqual({
      x: 800,
      y: 480,
      width: 320,
      height: 160,
    });
  });
});
