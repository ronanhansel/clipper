import { describe, expect, it } from "vitest";
import {
  getFramePortalOverlayTransform,
  viewportBoundsToPortal,
  viewportPointToPortal,
} from "./overlayGeometry";

describe("overlay geometry", () => {
  it("maps viewport points into a portal host with frame offset and layout scale", () => {
    const transform = getFramePortalOverlayTransform(
      { left: 120, top: 80, width: 960 },
      { left: 20, top: 30, width: 1400 },
      1,
    );

    expect(transform).toEqual({ left: 100, top: 50, scale: 0.5 });
    expect(viewportPointToPortal({ x: 200, y: 100 }, transform)).toEqual({
      x: 200,
      y: 100,
    });
  });

  it("maps viewport bounds into the same coordinate system as portal modifiers", () => {
    const transform = getFramePortalOverlayTransform(
      { left: 50, top: 60, width: 1920 },
      { left: 10, top: 20, width: 2400 },
      2,
    );

    expect(
      viewportBoundsToPortal(
        { x: 100, y: 50, width: 300, height: 200 },
        transform,
      ),
    ).toEqual({
      x: 90,
      y: 65,
      width: 150,
      height: 100,
    });
  });
});
