import type { Bounds, FrameObject, Point, SelectionPayload } from "./types";

export function boundsToPoints(bounds: Bounds): [Point, Point, Point, Point] {
  return [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
}

export function normalizeBounds(start: Point, end: Point): Bounds {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function intersects(a: Bounds, b: Bounds) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

export function createSelectionPayload(selectionBox: Bounds, objects: FrameObject[]): SelectionPayload {
  return {
    selectionBox,
    coordinates: boundsToPoints(selectionBox),
    objects: objects.filter((object) => !object.hidden && !object.locked && intersects(selectionBox, object.bounds)).map((object) => ({
      id: object.id,
      name: object.name,
      selector: object.selector,
      bounds: object.bounds,
      type: object.type,
    })),
  };
}

export function framePointFromClient(event: Pick<MouseEvent, "clientX" | "clientY">, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 1920),
    y: Math.round(((event.clientY - rect.top) / rect.height) * 1080),
  };
}
