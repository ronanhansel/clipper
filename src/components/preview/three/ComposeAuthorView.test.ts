import { describe, expect, it } from "vitest";
import type { FrameObject } from "../../../core/types";
import {
  hasTimeVaryingAuthorObjectState,
  readAuthorObjectState,
} from "./ComposeAuthorView";

function makeObject(): FrameObject {
  return {
    id: "rect-1",
    name: "Rect 1",
    type: "rect",
    selector: "[data-id='rect-1']",
    bounds: { x: 1, y: 2, width: 10, height: 20 },
    style: { opacity: 0.5 },
    transform: { translateZ: 12 },
    props: {},
    threeD: true,
  };
}

describe("ComposeAuthorView author object state", () => {
  it("reuses static objects without evaluation", () => {
    const object = makeObject();

    expect(hasTimeVaryingAuthorObjectState(object)).toBe(false);
    expect(readAuthorObjectState(object, 1)).toBe(object);
  });

  it("evaluates tracked objects", () => {
    const object = makeObject();
    object.tracks = {
      "bounds.x": {
        valueType: "number",
        points: [
          { time: 0, value: 1 },
          { time: 2, value: 3 },
        ],
      },
    };

    expect(hasTimeVaryingAuthorObjectState(object)).toBe(true);
    expect(readAuthorObjectState(object, 1)).not.toBe(object);
  });
});
