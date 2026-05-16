import {
  memo,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { Bounds, FrameObject, StrokeEffect } from "../../core/types";
import {
  STROKE_DEFAULTS,
  evaluateObjectState,
} from "../../core/propertyRegistry";
import {
  getMasterTimelineClockSnapshot,
  subscribeMasterTimelineClock,
} from "../../app/features/playback/playbackTimeStore";

const cornerRadiusStyleKeys = [
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
] as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBorderRadius(style: Record<string, string | number>): number {
  for (const key of cornerRadiusStyleKeys) {
    const raw = style[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function hexToRgba(hex: string, alphaPct: number) {
  const sanitized = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((c) => c + c)
          .join("")
      : sanitized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return hex;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alphaPct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

export const StrokeOverlay = memo(function StrokeOverlay({
  object,
  liveScrubClock = false,
  fallbackTime = 0,
}: {
  object: FrameObject;
  liveScrubClock?: boolean;
  fallbackTime?: number;
}) {
  const liveTime = useStrokeOverlayClock(liveScrubClock, fallbackTime);
  const [previewStroke, setPreviewStroke] = useState<StrokeEffect | null>(null);
  const [previewBounds, setPreviewBounds] = useState<Bounds | null>(null);

  useEffect(() => {
    function onStroke(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { stroke: StrokeEffect | null; objectId: string }
        | undefined;
      if (!detail || detail.objectId !== object.id) return;
      setPreviewStroke(detail.stroke);
    }
    function onBounds(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { bounds: Bounds; objectId: string }
        | undefined;
      if (!detail || detail.objectId !== object.id) return;
      setPreviewBounds(detail.bounds);
    }
    window.addEventListener("clipper:object-preview-stroke", onStroke);
    window.addEventListener("clipper:object-preview-bounds", onBounds);
    return () => {
      window.removeEventListener("clipper:object-preview-stroke", onStroke);
      window.removeEventListener("clipper:object-preview-bounds", onBounds);
    };
  }, [object.id]);

  useEffect(() => {
    setPreviewStroke(null);
    setPreviewBounds(null);
  }, [object]);

  const evaluated = useMemo(
    () => evaluateObjectState(object, liveTime),
    [object, liveTime],
  );

  const stroke =
    (previewStroke as Record<string, unknown> | null) ??
    (evaluated.stroke as Record<string, unknown>);
  const bounds = previewBounds ?? evaluated.bounds;

  if (object.type === "text") return null;
  const enabled =
    typeof stroke.enabled === "boolean"
      ? stroke.enabled
      : STROKE_DEFAULTS.enabled;
  const width = Math.max(0, readNumber(stroke.width, STROKE_DEFAULTS.width));
  if (!enabled || width <= 0) return null;

  const color =
    typeof stroke.color === "string" ? stroke.color : STROKE_DEFAULTS.color;
  const alpha = readNumber(stroke.alpha, STROKE_DEFAULTS.alpha);
  const start = clamp01(readNumber(stroke.start, STROKE_DEFAULTS.start));
  const end = clamp01(readNumber(stroke.end, STROKE_DEFAULTS.end));
  const position =
    stroke.position === "inside" || stroke.position === "center"
      ? (stroke.position as "inside" | "center")
      : "outside";

  const w = Math.max(0, readNumber(bounds.width, 0));
  const h = Math.max(0, readNumber(bounds.height, 0));
  if (w <= 0 || h <= 0) return null;

  const radius = Math.max(0, readBorderRadius(evaluated.style));

  // Position offset moves the stroke rectangle inside/outside the bounds.
  // SVG strokes are always centered on the path, so to render "outside" we
  // grow the rect by width/2 and shift the SVG by -width/2; "inside" shrinks
  // the rect by width/2; "center" leaves the rect on the bounds edge.
  const halfWidth = width / 2;
  const offset =
    position === "outside" ? halfWidth : position === "inside" ? -halfWidth : 0;
  const rectX = -offset;
  const rectY = -offset;
  const rectW = w + offset * 2;
  const rectH = h + offset * 2;
  if (rectW <= 0 || rectH <= 0) return null;

  const adjustedRadius =
    radius <= 0
      ? 0
      : Math.max(0, Math.min(Math.min(rectW, rectH) / 2, radius + offset));

  const padding = Math.ceil(width) + 2;
  const svgX = -padding;
  const svgY = -padding;
  const svgW = w + padding * 2;
  const svgH = h + padding * 2;

  const perimeter = pathPerimeter(rectW, rectH, adjustedRadius);
  const visibleStart = Math.min(start, end);
  const visibleEnd = Math.max(start, end);
  const fullCircuit = visibleStart <= 0 && visibleEnd >= 1;

  const styleKind =
    stroke.style === "dashed" ||
    stroke.style === "dotted" ||
    stroke.style === "dashDot"
      ? (stroke.style as "dashed" | "dotted" | "dashDot")
      : "solid";
  const spacing = Math.max(
    0,
    readNumber(stroke.spacing, STROKE_DEFAULTS.spacing),
  );
  const patternBase: readonly number[] =
    styleKind === "solid" ? [] : patternForStyle(styleKind, width, spacing);
  const dashArray = composeDashArray(
    patternBase,
    perimeter,
    visibleStart,
    visibleEnd,
    fullCircuit,
  );
  const dashOffset = -visibleStart * perimeter;
  const linecap: "butt" | "round" =
    styleKind === "dotted" || styleKind === "dashDot" ? "round" : "butt";

  return (
    <svg
      aria-hidden="true"
      width={svgW}
      height={svgH}
      viewBox={`${svgX} ${svgY} ${svgW} ${svgH}`}
      style={{
        position: "absolute",
        left: svgX,
        top: svgY,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <rect
        x={rectX}
        y={rectY}
        width={rectW}
        height={rectH}
        rx={adjustedRadius}
        ry={adjustedRadius}
        fill="none"
        stroke={hexToRgba(color, alpha)}
        strokeWidth={width}
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        strokeLinecap={linecap}
      />
    </svg>
  );
});

function pathPerimeter(width: number, height: number, radius: number) {
  if (radius <= 0) return 2 * (width + height);
  const r = Math.min(radius, Math.min(width, height) / 2);
  const straight = 2 * (width - 2 * r) + 2 * (height - 2 * r);
  const corners = 2 * Math.PI * r;
  return straight + corners;
}

function useStrokeOverlayClock(enabled: boolean, fallback: number) {
  return useSyncExternalStore(
    (onChange) => {
      if (!enabled) return () => {};
      return subscribeMasterTimelineClock(() => {
        const snap = getMasterTimelineClockSnapshot();
        if (snap.source !== "playback" && snap.source !== "scrub") return;
        onChange();
      });
    },
    () => {
      if (!enabled) return fallback;
      const snap = getMasterTimelineClockSnapshot();
      if (snap.source === "playback" || snap.source === "scrub") {
        return snap.displayTime;
      }
      return fallback;
    },
    () => fallback,
  );
}

function patternForStyle(
  style: "dashed" | "dotted" | "dashDot",
  width: number,
  spacing: number,
): readonly number[] {
  const w = Math.max(0.0001, width);
  const gap = Math.max(0.0001, w * spacing);
  if (style === "dotted") return [0, gap];
  if (style === "dashed") return [w * 1.5, gap];
  // dashDot: dash, gap, dot, gap
  return [w * 1.5, gap, 0, gap];
}

function composeDashArray(
  pattern: readonly number[],
  perimeter: number,
  visibleStart: number,
  visibleEnd: number,
  fullCircuit: boolean,
): string {
  const visibleLength = Math.max(0, (visibleEnd - visibleStart) * perimeter);
  const isPatterned = pattern.length > 0;

  if (!isPatterned) {
    return fullCircuit ? "none" : `${visibleLength} ${perimeter}`;
  }

  if (fullCircuit) {
    return pattern.join(" ");
  }

  const tail = perimeter - visibleLength;
  return `${pattern.join(" ")} 0 ${tail.toFixed(3)}`;
}
