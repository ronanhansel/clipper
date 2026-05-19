import {
  defaultPropertyRegistry,
  evaluateProperty,
} from "../../../core/propertyRegistry";
import { type EaseValue, getEaseControlPoints } from "../../../core/easing";
import type {
  FrameObject,
  PropertyKeyframePoint,
  PropertyTrack,
} from "../../../core/types";
import type {
  CameraPathData,
  CameraPathHandle,
  CameraPathKeyframe,
  CameraPathSample,
} from "./cameraPathOverlay";

const SUBSAMPLES = 16;

const AXIS_PATHS = {
  x: "props.position.x",
  y: "props.position.y",
  z: "props.position.z",
} as const;

type AxisKey = keyof typeof AXIS_PATHS;

/**
 * Build the camera-path overlay data from a camera object's animation
 * tracks.
 *
 * Returns null when the camera has no positional keyframes; the caller
 * uses that to clear the overlay.
 *
 * The merged keyframe time list is the union across the three axis
 * tracks. Per-axis bezier handles are derived from the per-axis
 * `easingToNext` of the track point that owns the segment.
 *
 * Handle math: each handle sits along its own axis, anchored to one
 * end of an axis-local segment. The "out" handle of segment i on axis
 * `a` lives at `startKf + cp1.x * (endKf[a] - startKf[a]) * unitA`.
 * The "in" handle lives at `endKf + (cp2.x - 1) * (endKf[a] - startKf[a])
 * * unitA`. When the per-axis segment has zero length on an axis (the
 * keyframe values are equal) the handle is omitted — there's no axis
 * to slide along.
 */
export function buildCameraPathData(input: {
  camera: FrameObject;
  selectedKeyframeIndex: number | null;
}): CameraPathData | null {
  const { camera } = input;
  const tracks = camera.tracks ?? {};
  const xTrack = tracks[AXIS_PATHS.x];
  const yTrack = tracks[AXIS_PATHS.y];
  const zTrack = tracks[AXIS_PATHS.z];

  if (
    !xTrack?.points.length &&
    !yTrack?.points.length &&
    !zTrack?.points.length
  ) {
    return null;
  }

  const baseProps = readBaseCameraPosition(camera);
  const sampleAt = (time: number): CameraPathSample => ({
    x: numberAt(xTrack, time, baseProps.x),
    y: numberAt(yTrack, time, baseProps.y),
    z: numberAt(zTrack, time, baseProps.z),
  });

  const timeSet = new Set<number>();
  for (const t of [xTrack, yTrack, zTrack]) {
    if (!t) continue;
    for (const p of t.points) timeSet.add(p.time);
  }
  if (timeSet.size === 0) return null;

  const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);

  // Dense polyline samples for the dashed path.
  const samples: CameraPathSample[] = [];
  samples.push(sampleAt(sortedTimes[0]));
  for (let i = 0; i < sortedTimes.length - 1; i += 1) {
    const start = sortedTimes[i];
    const end = sortedTimes[i + 1];
    for (let s = 1; s <= SUBSAMPLES; s += 1) {
      const t = start + ((end - start) * s) / SUBSAMPLES;
      samples.push(sampleAt(t));
    }
  }

  const keyframes: CameraPathKeyframe[] = sortedTimes.map((time) => ({
    time,
    position: sampleAt(time),
  }));

  const handles: CameraPathHandle[] = [];

  // Handles only become visible (and thus are picked) when a keyframe
  // is selected. We still build the data unconditionally so swaps don't
  // need a re-derive — the overlay filters by `selectedKeyframeIndex`.
  for (let i = 0; i < keyframes.length; i += 1) {
    const kf = keyframes[i];
    for (const axis of ["x", "y", "z"] as AxisKey[]) {
      const trackPath = AXIS_PATHS[axis];
      const track = axis === "x" ? xTrack : axis === "y" ? yTrack : zTrack;
      if (!track) continue;
      // Find this axis's own segment indices for the in/out handles.
      // The merged keyframe `kf.time` may not match an axis-local
      // keyframe — in that case there's no axis-local segment endpoint
      // and we don't draw a handle for that side on that axis.
      const ownPoints = track.points;
      const ownIndex = ownPoints.findIndex(
        (p) => Math.abs(p.time - kf.time) < 1e-6,
      );
      if (ownIndex < 0) continue;

      // Outgoing handle: edits ownPoints[ownIndex].easingToNext cp1.
      if (ownIndex < ownPoints.length - 1) {
        const startPoint = ownPoints[ownIndex];
        const endPoint = ownPoints[ownIndex + 1];
        const startVal = numericPointValue(startPoint.value);
        const endVal = numericPointValue(endPoint.value);
        if (
          startVal != null &&
          endVal != null &&
          Math.abs(endVal - startVal) > 1e-6
        ) {
          const cp = getEaseControlPoints(
            easeValueFor(startPoint.easingToNext),
          );
          const cp1x = cp[0];
          const axisDelta = endVal - startVal;
          const handlePos = withAxisOffset(kf.position, axis, cp1x * axisDelta);
          handles.push({
            id: `${trackPath}:${ownIndex}:out`,
            keyframeIndex: i,
            keyframeTime: kf.time,
            axis,
            side: "out",
            position: handlePos,
            origin: kf.position,
            axisDelta,
            currentCp: cp1x,
            trackPath,
            pointIndex: ownIndex,
          });
        }
      }

      // Incoming handle: edits ownPoints[ownIndex - 1].easingToNext cp2.
      if (ownIndex > 0) {
        const startPoint = ownPoints[ownIndex - 1];
        const endPoint = ownPoints[ownIndex];
        const startVal = numericPointValue(startPoint.value);
        const endVal = numericPointValue(endPoint.value);
        if (
          startVal != null &&
          endVal != null &&
          Math.abs(endVal - startVal) > 1e-6
        ) {
          const cp = getEaseControlPoints(
            easeValueFor(startPoint.easingToNext),
          );
          const cp2x = cp[2];
          const axisDelta = endVal - startVal;
          const offset = (cp2x - 1) * axisDelta;
          const handlePos = withAxisOffset(kf.position, axis, offset);
          handles.push({
            id: `${trackPath}:${ownIndex - 1}:in`,
            keyframeIndex: i,
            keyframeTime: kf.time,
            axis,
            side: "in",
            position: handlePos,
            origin: kf.position,
            axisDelta,
            currentCp: cp2x,
            trackPath,
            pointIndex: ownIndex - 1,
          });
        }
      }
    }
  }

  return {
    samples,
    keyframes,
    handles,
    selectedKeyframeIndex: input.selectedKeyframeIndex,
  };
}

function withAxisOffset(
  base: CameraPathSample,
  axis: AxisKey,
  delta: number,
): CameraPathSample {
  if (axis === "x") return { x: base.x + delta, y: base.y, z: base.z };
  if (axis === "y") return { x: base.x, y: base.y + delta, z: base.z };
  return { x: base.x, y: base.y, z: base.z + delta };
}

/**
 * `PropertyKeyframePoint.easingToNext` admits arbitrary strings (e.g.
 * `cubic-bezier(...)`) on top of the named MotionEase set and a tuple,
 * but `getEaseControlPoints` only knows the named/tuple cases. Anything
 * else collapses to linear control points — same fallback the timeline
 * panel uses.
 */
function easeValueFor(
  ease: PropertyKeyframePoint["easingToNext"],
): EaseValue | undefined {
  if (ease == null) return undefined;
  if (typeof ease === "string") {
    return getEaseControlPoints(ease as EaseValue) as EaseValue;
  }
  return ease;
}

function readBaseCameraPosition(object: { props?: unknown }): {
  x: number;
  y: number;
  z: number;
} {
  const raw = (object.props ?? {}) as Record<string, unknown>;
  const pos = raw.position as Record<string, unknown> | undefined;
  const num = (key: "x" | "y" | "z") => {
    const n = pos?.[key];
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  };
  return { x: num("x"), y: num("y"), z: num("z") };
}

function numberAt(
  track: PropertyTrack | undefined,
  time: number,
  fallback: number,
): number {
  if (!track || track.points.length === 0) return fallback;
  const definition = defaultPropertyRegistry.get("props.position.x");
  if (!definition) return fallback;
  const value = evaluateProperty(fallback, track, time, definition);
  return typeof value === "number" ? value : fallback;
}

function numericPointValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}
