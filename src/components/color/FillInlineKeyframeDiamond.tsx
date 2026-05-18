import React from "react";
import type { FillKeyframeConfig } from "./types";

export function findFillKeyframeState(
  keyframeStates: FillKeyframeConfig[] | undefined,
  path: string,
) {
  return keyframeStates?.find((state) => state.path === path);
}

export function FillInlineKeyframeDiamond({
  state,
  onToggleKeyframe,
}: {
  state?: FillKeyframeConfig;
  onToggleKeyframe?: (path: string) => void;
}) {
  if (!state || !onToggleKeyframe)
    return <span className="block h-[18px] w-[18px]" />;
  return (
    <button
      aria-label={
        state.hasKeyframe
          ? `Remove ${state.label} keyframe at playhead`
          : `Add ${state.label} keyframe at playhead`
      }
      aria-pressed={state.hasKeyframe}
      className="grid h-[18px] w-[18px] place-items-center"
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleKeyframe(state.path);
      }}
    >
      <span
        className={`inline-block h-[8px] w-[8px] rotate-45 rounded-[1px] border transition ${
          state.hasKeyframe
            ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
            : "border-[#6f7684] bg-[#12151d] hover:border-white"
        }`}
      />
    </button>
  );
}
