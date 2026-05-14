import { FRAME_WIDTH, type Bounds, type Point } from "./types";

type RectLike = Pick<DOMRectReadOnly, "left" | "top" | "width">;

export type FramePortalOverlayTransform = {
  left: number;
  top: number;
  scale: number;
};

export function getFramePortalOverlayTransform(
  frameRect: RectLike,
  hostRect: RectLike,
  frameScale: number,
): FramePortalOverlayTransform {
  return {
    left: frameRect.left - hostRect.left,
    top: frameRect.top - hostRect.top,
    scale: frameRect.width / (FRAME_WIDTH * frameScale),
  };
}

export function viewportPointToPortal(
  point: Point,
  transform: FramePortalOverlayTransform,
): Point {
  return {
    x: transform.left + point.x * transform.scale,
    y: transform.top + point.y * transform.scale,
  };
}

export function viewportBoundsToPortal(
  bounds: Bounds,
  transform: FramePortalOverlayTransform,
): Bounds {
  return {
    x: transform.left + bounds.x * transform.scale,
    y: transform.top + bounds.y * transform.scale,
    width: bounds.width * transform.scale,
    height: bounds.height * transform.scale,
  };
}
