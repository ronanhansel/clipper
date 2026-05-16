import { type ReactElement } from "react";
import { usePlayheadTime } from "../../app/features/playback/usePlayheadTime";
import type { FrameObject } from "../../core/types";
import type { ComposeAnimationAttributeKey } from "../timeline/composeAnimationModel";
import type { FillKeyframeState } from "./KeyframedColorInput";
import {
  getFillKeyframeStates,
  getPropertyTrackKeyframeAtTime,
  hasAnyFillTrack,
  hasPropertyTrack,
  propertyPathForAttribute,
} from "./inspectorShared";

export function LiveAttributeKeyframeIndicator({
  object,
  attributeKey,
  liveScrubClock,
  render,
}: {
  object: FrameObject;
  attributeKey: ComposeAnimationAttributeKey;
  liveScrubClock: boolean;
  currentTime: number;
  render: (active: boolean) => ReactElement;
}) {
  const path = propertyPathForAttribute(attributeKey);
  const hasTrack = hasPropertyTrack(object, path);
  // No track means the diamond can never light up live -- skip the
  // subscription so this row stays React-stable during scrub/playback.
  const time = usePlayheadTime(hasTrack && liveScrubClock);
  const active = hasTrack
    ? Boolean(getPropertyTrackKeyframeAtTime(object, path, time))
    : false;
  return render(active);
}

export function LiveTimeBoundary({
  liveScrubClock,
  enabled = true,
  children,
}: {
  liveScrubClock: boolean;
  currentTime: number;
  enabled?: boolean;
  children: () => ReactElement;
}) {
  usePlayheadTime(liveScrubClock && enabled);
  return children();
}

// One subscription per row so rows without keyframes never re-render on tick.
export function KeyframedRow({
  liveScrubClock,
  hasTrack,
  render,
}: {
  liveScrubClock: boolean;
  currentTime: number;
  hasTrack: boolean;
  render: () => ReactElement;
}) {
  usePlayheadTime(liveScrubClock && hasTrack);
  return render();
}

export function LiveFillKeyframeStates({
  object,
  liveScrubClock,
  children,
}: {
  object: FrameObject;
  liveScrubClock: boolean;
  currentTime: number;
  children: (states: FillKeyframeState[]) => ReactElement;
}) {
  const hasFillTrack = hasAnyFillTrack(object);
  const time = usePlayheadTime(liveScrubClock && hasFillTrack);
  const states = getFillKeyframeStates(object, time);
  return children(states);
}
