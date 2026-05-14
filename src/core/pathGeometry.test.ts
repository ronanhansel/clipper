import { describe, expect, it } from "vitest";
import {
  getPathGeometryBounds,
  transformPathGeometrySegmentsToBounds,
  type PathGeometrySegment,
} from "./pathGeometry";

describe("path geometry", () => {
  it("maps persisted path segments into moved object bounds", () => {
    const segments: PathGeometrySegment[] = [
      { kind: "line", start: { x: 100, y: 80 }, end: { x: 300, y: 180 } },
    ];

    const transformed = transformPathGeometrySegmentsToBounds(segments, {
      x: 500,
      y: 400,
      width: 200,
      height: 100,
    });

    expect(transformed[0].start).toEqual({ x: 500, y: 400 });
    expect(transformed[0].end).toEqual({ x: 700, y: 500 });
  });

  it("preserves Bezier handle proportions when object bounds are scaled", () => {
    const segments: PathGeometrySegment[] = [
      {
        kind: "curve",
        start: { x: 100, y: 100 },
        c1: { x: 150, y: 50 },
        c2: { x: 250, y: 250 },
        end: { x: 300, y: 200 },
      },
    ];
    const sourceBounds = getPathGeometryBounds(segments);
    const targetBounds = {
      x: sourceBounds.x + 20,
      y: sourceBounds.y + 40,
      width: sourceBounds.width * 2,
      height: sourceBounds.height * 0.5,
    };

    const transformed = transformPathGeometrySegmentsToBounds(
      segments,
      targetBounds,
    );
    const transformedBounds = getPathGeometryBounds(transformed);

    expect(transformedBounds.x).toBeCloseTo(targetBounds.x, 0);
    expect(transformedBounds.y).toBeCloseTo(targetBounds.y, 0);
    expect(transformedBounds.width).toBeCloseTo(targetBounds.width, 0);
    expect(transformedBounds.height).toBeCloseTo(targetBounds.height, 0);
    expect(transformed[0].c1!.x).toBeLessThan(transformed[0].end.x);
    expect(transformed[0].c2!.y).toBeGreaterThan(transformed[0].start.y);
  });

  it("includes cubic extrema in path bounds", () => {
    const bounds = getPathGeometryBounds(
      [
        {
          kind: "curve",
          start: { x: 0, y: 0 },
          c1: { x: 0, y: 300 },
          c2: { x: 100, y: 300 },
          end: { x: 100, y: 0 },
        },
      ],
      1,
    );

    expect(bounds).toEqual({ x: 0, y: 0, width: 100, height: 225 });
  });
});
