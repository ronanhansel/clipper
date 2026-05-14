import type { Bounds, Point } from "./types";

export type PathGeometrySegment = {
  kind: "line" | "curve";
  start: Point;
  end: Point;
  c1?: Point;
  c2?: Point;
};

export function getPathGeometryCubicPoint(
  start: Point,
  c1: Point,
  c2: Point,
  end: Point,
  t: number,
) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x:
      mt2 * mt * start.x +
      3 * mt2 * t * c1.x +
      3 * mt * t2 * c2.x +
      t2 * t * end.x,
    y:
      mt2 * mt * start.y +
      3 * mt2 * t * c1.y +
      3 * mt * t2 * c2.y +
      t2 * t * end.y,
  };
}

function getCubicAxisExtrema(p0: number, p1: number, p2: number, p3: number) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = -p0 + p1;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return [];
    const t = -c / b;
    return t > 0 && t < 1 ? [t] : [];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)].filter(
    (t) => t > 0 && t < 1,
  );
}

export function getPathGeometryRenderPoints<T extends PathGeometrySegment>(
  segments: T[],
) {
  return segments.flatMap((segment) => {
    if (segment.kind !== "curve" || !segment.c1 || !segment.c2) {
      return [segment.start, segment.end];
    }
    const extrema = [
      ...getCubicAxisExtrema(
        segment.start.x,
        segment.c1.x,
        segment.c2.x,
        segment.end.x,
      ),
      ...getCubicAxisExtrema(
        segment.start.y,
        segment.c1.y,
        segment.c2.y,
        segment.end.y,
      ),
    ];
    return [0, 1, ...extrema].map((t) =>
      getPathGeometryCubicPoint(
        segment.start,
        segment.c1!,
        segment.c2!,
        segment.end,
        t,
      ),
    );
  });
}

export function getPathGeometryBounds<T extends PathGeometrySegment>(
  segments: T[],
  minSize = 10,
): Bounds {
  const points = getPathGeometryRenderPoints(segments);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  let x = Math.floor(Math.min(...xs));
  let y = Math.floor(Math.min(...ys));
  let maxX = Math.ceil(Math.max(...xs));
  let maxY = Math.ceil(Math.max(...ys));
  if (maxX - x < minSize) {
    const centerX = (x + maxX) / 2;
    x = Math.floor(centerX - minSize / 2);
    maxX = Math.ceil(centerX + minSize / 2);
  }
  if (maxY - y < minSize) {
    const centerY = (y + maxY) / 2;
    y = Math.floor(centerY - minSize / 2);
    maxY = Math.ceil(centerY + minSize / 2);
  }
  return {
    x,
    y,
    width: Math.max(1, maxX - x),
    height: Math.max(1, maxY - y),
  };
}

export function transformPathGeometrySegmentsToBounds<
  T extends PathGeometrySegment,
>(segments: T[], bounds: Bounds): T[] {
  if (segments.length === 0) return segments;
  const sourceBounds = getPathGeometryBounds(segments);
  const scaleX = bounds.width / Math.max(sourceBounds.width, 1);
  const scaleY = bounds.height / Math.max(sourceBounds.height, 1);
  const transformPoint = (point: Point) => ({
    x: bounds.x + (point.x - sourceBounds.x) * scaleX,
    y: bounds.y + (point.y - sourceBounds.y) * scaleY,
  });
  return segments.map((segment) => ({
    ...segment,
    start: transformPoint(segment.start),
    end: transformPoint(segment.end),
    c1: segment.c1 ? transformPoint(segment.c1) : undefined,
    c2: segment.c2 ? transformPoint(segment.c2) : undefined,
  }));
}
