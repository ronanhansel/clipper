import {
  getPathGeometryBounds,
  getPathGeometryRenderPoints,
  transformPathGeometrySegmentsToBounds,
} from "../../../core/pathGeometry";
import type { Bounds, FrameObject, Point } from "../../../core/types";

export type ComposeDrawTool =
  | "rect"
  | "line"
  | "arrow"
  | "ellipse"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "text"
  | "textPath"
  | "pattern2d"
  | "null"
  | "code";

export type ShapeDrawPreview = {
  bounds: Bounds;
  start: Point;
  end: Point;
  points?: Point[];
  path?: string;
  joints?: Point[];
  handles?: Array<{ anchor: Point; handle: Point }>;
};

export type PathSegment = {
  kind: "line" | "curve";
  start: Point;
  end: Point;
  c1?: Point;
  c2?: Point;
};

export type PathDraft = {
  tool: "pen" | "textPath";
  start: Point;
  segments: PathSegment[];
  pointerId: number | null;
  downPoint: Point | null;
  current: PathSegment | null;
  outHandle: Point | null;
  previewPoint: Point | null;
  anchor: Point | null;
  closed: boolean;
  disconnected: boolean;
};

type ClipperPathStyle = {
  tool: "pen" | "textPath";
  segments: PathSegment[];
  closed?: boolean;
};

export function isSvgDrawTool(tool: ComposeDrawTool) {
  return (
    tool === "line" ||
    tool === "arrow" ||
    tool === "pen" ||
    tool === "pencil" ||
    tool === "textPath"
  );
}

export function isPathDrawTool(tool: ComposeDrawTool) {
  return (
    tool === "line" ||
    tool === "arrow" ||
    tool === "pen" ||
    tool === "pencil" ||
    tool === "textPath"
  );
}

export function isBezierDrawTool(
  tool: ComposeDrawTool,
): tool is "pen" | "textPath" {
  return tool === "pen" || tool === "textPath";
}

export function getDrawToolName(tool: ComposeDrawTool) {
  switch (tool) {
    case "rect":
      return "Rectangle";
    case "line":
      return "Line";
    case "arrow":
      return "Arrow";
    case "ellipse":
      return "Ellipse";
    case "polygon":
      return "Polygon";
    case "star":
      return "Star";
    case "pen":
      return "Pen";
    case "pencil":
      return "Pencil";
    case "text":
      return "Text";
    case "textPath":
      return "Text on path";
    case "null":
      return "Null object";
    case "pattern2d":
      return "Pattern";
    case "code":
      return "Code";
  }
}

export function getDirectedDrawBounds(points: Point[], minSize = 10) {
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

export function computeShapeDrawBox(
  start: { x: number; y: number },
  end: { x: number; y: number },
  constrain: boolean,
) {
  let rawW = end.x - start.x;
  let rawH = end.y - start.y;
  if (constrain) {
    const size = Math.max(Math.abs(rawW), Math.abs(rawH));
    rawW = rawW < 0 ? -size : size;
    rawH = rawH < 0 ? -size : size;
  }
  const x = Math.round(Math.min(start.x, start.x + rawW));
  const y = Math.round(Math.min(start.y, start.y + rawH));
  const width = Math.round(Math.abs(rawW));
  const height = Math.round(Math.abs(rawH));
  return { x, y, width, height };
}

export function getDrawAxisSnap(
  candidates: { position: number; influence: number }[],
  stops: number[],
  threshold: number,
) {
  let closest: {
    endOffset: number;
    position: number;
    distance: number;
  } | null = null;
  for (const candidate of candidates) {
    if (candidate.influence <= 0) continue;
    for (const stop of stops) {
      const distance = Math.abs(stop - candidate.position);
      if (distance > threshold) continue;
      if (closest && distance >= closest.distance) continue;
      closest = {
        endOffset: (stop - candidate.position) / candidate.influence,
        position: stop,
        distance,
      };
    }
  }
  return closest;
}

function localDrawPoint(point: Point, bounds: Bounds) {
  return {
    x: point.x - bounds.x,
    y: point.y - bounds.y,
  };
}

function buildNormalizedPathFromSegments(
  segments: PathSegment[],
  bounds: Bounds,
  closed = false,
) {
  const path = segments
    .map((segment, index) => {
      const start = localDrawPoint(segment.start, bounds);
      const end = localDrawPoint(segment.end, bounds);
      const previous = segments[index - 1];
      const startsSubpath =
        index === 0 ||
        !previous ||
        getPointDistance(previous.end, segment.start) >= 0.5;
      const move = startsSubpath
        ? `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} `
        : "";
      if (segment.kind === "curve" && segment.c1 && segment.c2) {
        const c1 = localDrawPoint(segment.c1, bounds);
        const c2 = localDrawPoint(segment.c2, bounds);
        return `${move}C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
      }
      return `${move}L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
    })
    .join(" ");
  return closed ? `${path} Z` : path;
}

export function getPenPathData(segments: PathSegment[], closed = false) {
  const bounds = getPathGeometryBounds(segments);
  return {
    bounds,
    path: buildNormalizedPathFromSegments(segments, bounds, closed),
  };
}

export function getPenPreviewData(
  segments: PathSegment[],
  handles: Array<{ anchor: Point; handle: Point }> = [],
  joints: Point[] = [],
  closed = false,
) {
  const points = [
    ...getPathGeometryRenderPoints(segments),
    ...handles.flatMap(({ anchor, handle }) => [anchor, handle]),
    ...joints,
  ];
  const bounds = getDirectedDrawBounds(points);
  return {
    bounds,
    path:
      segments.length > 0
        ? buildNormalizedPathFromSegments(segments, bounds, closed)
        : "",
  };
}

export function parseClipperPathStyle(value: string | number | undefined) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<ClipperPathStyle>;
    if (
      (parsed.tool !== "pen" && parsed.tool !== "textPath") ||
      !Array.isArray(parsed.segments)
    )
      return null;
    return parsed as ClipperPathStyle;
  } catch {
    return null;
  }
}

export function getLastPathPoint(draft: PathDraft) {
  return (
    draft.anchor ??
    draft.segments[draft.segments.length - 1]?.end ??
    draft.start
  );
}

export function createPathSegment(
  start: Point,
  end: Point,
  c1?: Point | null,
  c2?: Point | null,
): PathSegment {
  const hasC1 = c1 && Math.hypot(c1.x - start.x, c1.y - start.y) >= 0.5;
  const hasC2 = c2 && Math.hypot(c2.x - end.x, c2.y - end.y) >= 0.5;
  if (!hasC1 && !hasC2) return { kind: "line", start, end };
  return {
    kind: "curve",
    start,
    end,
    c1: c1 ?? start,
    c2: c2 ?? end,
  };
}

export function getMirroredPoint(anchor: Point, handle: Point) {
  return { x: anchor.x * 2 - handle.x, y: anchor.y * 2 - handle.y };
}

export function getPointDistance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function getDraftPreviewSegments(draft: PathDraft) {
  const last = getLastPathPoint(draft);
  const previewPoint = draft.previewPoint;
  if (
    !previewPoint ||
    draft.closed ||
    draft.disconnected ||
    getPointDistance(last, previewPoint) < 0.5
  )
    return draft.segments;
  return [
    ...draft.segments,
    createPathSegment(last, previewPoint, draft.outHandle, null),
  ];
}

function getPathSegmentJoints(segments: PathSegment[]) {
  if (segments.length === 0) return [];
  return [segments[0].start, ...segments.map((segment) => segment.end)];
}

export function getDraftJoints(draft: PathDraft, segments = draft.segments) {
  const joints = getPathSegmentJoints(segments);
  const anchor = draft.anchor;
  if (
    anchor &&
    !joints.some((point) => getPointDistance(point, anchor) < 0.5)
  ) {
    joints.push(anchor);
  }
  return joints;
}

export function getPathDraftSnapPoint(draft: PathDraft, point: Point) {
  const snapTargets = getDraftJoints(draft);
  return (
    snapTargets.find((target) => getPointDistance(target, point) <= 8) ?? point
  );
}

function smoothPencilPoints(points: Point[]) {
  if (points.length < 4) return points;
  let smoothed = points;
  for (let pass = 0; pass < 2; pass += 1) {
    const next: Point[] = [smoothed[0]];
    for (let index = 0; index < smoothed.length - 1; index += 1) {
      const current = smoothed[index];
      const following = smoothed[index + 1];
      next.push(
        {
          x: current.x * 0.75 + following.x * 0.25,
          y: current.y * 0.75 + following.y * 0.25,
        },
        {
          x: current.x * 0.25 + following.x * 0.75,
          y: current.y * 0.25 + following.y * 0.75,
        },
      );
    }
    next.push(smoothed[smoothed.length - 1]);
    smoothed = next;
  }
  return smoothed;
}

function buildSmoothPencilPath(points: Point[], bounds: Bounds) {
  if (points.length === 0) return "";
  if (points.length < 3) {
    return points
      .map((point, index) => {
        const local = localDrawPoint(point, bounds);
        return `${index === 0 ? "M" : "L"} ${local.x.toFixed(2)} ${local.y.toFixed(2)}`;
      })
      .join(" ");
  }
  const [first, ...rest] = points;
  const firstLocal = localDrawPoint(first, bounds);
  const commands = [`M ${firstLocal.x.toFixed(2)} ${firstLocal.y.toFixed(2)}`];
  for (let index = 0; index < rest.length - 1; index += 1) {
    const control = localDrawPoint(rest[index], bounds);
    const next = rest[index + 1];
    const midpoint = localDrawPoint(
      {
        x: (rest[index].x + next.x) / 2,
        y: (rest[index].y + next.y) / 2,
      },
      bounds,
    );
    commands.push(
      `Q ${control.x.toFixed(2)} ${control.y.toFixed(2)}, ${midpoint.x.toFixed(2)} ${midpoint.y.toFixed(2)}`,
    );
  }
  const last = localDrawPoint(points[points.length - 1], bounds);
  commands.push(`L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`);
  return commands.join(" ");
}

export function getPathDrawData(
  tool: ComposeDrawTool,
  start: Point,
  end: Point,
  points: Point[] = [start, end],
) {
  const pencilPoints = tool === "pencil" ? smoothPencilPoints(points) : points;
  const sourcePoints = tool === "pencil" ? pencilPoints : [start, end];
  const bounds = getDirectedDrawBounds(sourcePoints);
  const localStart = localDrawPoint(start, bounds);
  const localEnd = localDrawPoint(end, bounds);
  const path =
    tool === "pencil"
      ? buildSmoothPencilPath(pencilPoints, bounds)
      : tool === "pen" || tool === "textPath"
        ? `M ${localStart.x.toFixed(2)} ${localStart.y.toFixed(2)} C ${((localStart.x + localEnd.x) / 2).toFixed(2)} ${localStart.y.toFixed(2)}, ${((localStart.x + localEnd.x) / 2).toFixed(2)} ${localEnd.y.toFixed(2)}, ${localEnd.x.toFixed(2)} ${localEnd.y.toFixed(2)}`
        : `M ${localStart.x.toFixed(2)} ${localStart.y.toFixed(2)} L ${localEnd.x.toFixed(2)} ${localEnd.y.toFixed(2)}`;
  return { bounds, path };
}

export function getSvgDrawContent(
  tool: ComposeDrawTool,
  start: Point,
  end: Point,
  points?: Point[],
  pathOverride?: string,
  boundsOverride?: Bounds,
) {
  const { bounds, path } = getPathDrawData(tool, start, end, points);
  const viewBoxBounds = boundsOverride ?? bounds;
  const drawPath = pathOverride ?? path;
  const strokeWidth = tool === "pencil" ? 5 : 4;
  const marker = tool === "arrow" ? ' marker-end="url(#arrowhead)"' : "";
  const textPath =
    tool === "textPath"
      ? `<text fill="#ffffff" font-family="system-ui, sans-serif" font-size="48" font-weight="500"><textPath href="#draw-path" startOffset="50%" text-anchor="middle">Text on path</textPath></text>`
      : "";

  const strokeAttr =
    tool === "textPath"
      ? 'stroke="none"'
      : `stroke="#D5D5D5" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${marker}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${Math.max(1, viewBoxBounds.width)} ${Math.max(1, viewBoxBounds.height)}" preserveAspectRatio="none" style="display:block;overflow:visible"><defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth" viewBox="0 0 8 8" preserveAspectRatio="xMidYMid meet"><path d="M0,0 L8,4 L0,8 Z" fill="#D5D5D5"/></marker></defs><path id="draw-path" d="${drawPath}" fill="none" ${strokeAttr}/>${textPath}</svg>`;
}

export function isTextPathObject(object: FrameObject) {
  return parseClipperPathStyle(object.style.clipperPath)?.tool === "textPath";
}

export function mergePathSegments(left: PathSegment, right: PathSegment) {
  if (left.kind === "line" && right.kind === "line") {
    return createPathSegment(left.start, right.end);
  }
  return createPathSegment(
    left.start,
    right.end,
    left.kind === "curve" ? left.c1 : left.start,
    right.kind === "curve" ? right.c2 : right.end,
  );
}

export function removePathJoint(
  segments: PathSegment[],
  segmentIndex: number,
  control: "start" | "end" | "c1" | "c2",
  closed: boolean,
) {
  if (control !== "start" && control !== "end") return segments;
  if (segments.length <= 1) return segments;
  if (control === "start" && segmentIndex === 0) {
    if (!closed) return segments.slice(1);
    const first = segments[0];
    const last = segments[segments.length - 1];
    return [...segments.slice(1, -1), mergePathSegments(last, first)];
  }
  if (control !== "end") return segments;
  if (closed && segmentIndex === segments.length - 1) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    return [...segments.slice(1, -1), mergePathSegments(last, first)];
  }
  if (segmentIndex === segments.length - 1) return segments.slice(0, -1);
  const current = segments[segmentIndex];
  const next = segments[segmentIndex + 1];
  return [
    ...segments.slice(0, segmentIndex),
    mergePathSegments(current, next),
    ...segments.slice(segmentIndex + 2),
  ];
}

export function denormalizePathSegments(
  pathStyle: { segments: PathSegment[] },
  objectBounds: Bounds,
) {
  return transformPathGeometrySegmentsToBounds(
    pathStyle.segments.map((segment) => ({
      ...segment,
      start: { ...segment.start },
      end: { ...segment.end },
      c1: segment.c1 ? { ...segment.c1 } : undefined,
      c2: segment.c2 ? { ...segment.c2 } : undefined,
    })),
    objectBounds,
  );
}

export function buildPathObjectUpdate(
  segments: PathSegment[],
  tool: "pen" | "textPath",
  closed: boolean,
) {
  const { bounds, path } = getPenPathData(segments, closed);
  const end = segments[segments.length - 1]?.end ?? bounds;
  return {
    bounds,
    content: getSvgDrawContent(
      tool,
      segments[0]?.start ?? bounds,
      end,
      undefined,
      path,
      bounds,
    ),
    clipperPath: JSON.stringify({ tool, segments, closed }),
  };
}

export function updateTextPathOffsetInContent(content: string, offset: number) {
  const nextOffset = `${Math.max(0, Math.min(100, offset)).toFixed(2)}%`;
  return content.replace(
    /(<textPath\b[^>]*\sstartOffset=")([^"]+)(")/,
    `$1${nextOffset}$3`,
  );
}
