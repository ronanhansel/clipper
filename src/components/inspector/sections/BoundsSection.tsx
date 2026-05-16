import { graphicBoundsKeys } from "../../../core/graphics/inspectorSettings";
import type { BoundsAnimationKey } from "../inspectorShared";
import { useObjectInspector } from "../objectInspectorContext";
import { KeyframedRow } from "../scrubLive";

/**
 * Bounds grid (x / y / width / height) with linked-pair keyframe toggles.
 * Hidden when `lockBounds` is true (e.g. composition background).
 */
export function BoundsSection() {
  const {
    object,
    lockBounds,
    liveScrubClock,
    currentTime,
    hasAttributeKeyframes,
    previewBounds,
    updateBounds,
    renderKeyframedInput,
  } = useObjectInspector();

  if (lockBounds) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {graphicBoundsKeys.map((key) => {
        const linkedKeys:
          | readonly [BoundsAnimationKey, BoundsAnimationKey]
          | undefined =
          key === "x" || key === "y"
            ? ["x", "y"]
            : key === "width" || key === "height"
              ? ["width", "height"]
              : undefined;
        // Subscribe per-row so rows without a track stay stable on tick.
        const hasTrack = linkedKeys
          ? linkedKeys.some((k) => hasAttributeKeyframes(k))
          : hasAttributeKeyframes(key);
        return (
          <KeyframedRow
            key={key}
            liveScrubClock={liveScrubClock}
            currentTime={currentTime}
            hasTrack={hasTrack}
            render={() =>
              renderKeyframedInput({
                label: key,
                animationKey: key,
                linkedKeys,
                value: object.bounds[key],
                onPreviewNumber: (value) => previewBounds(key, value),
                onCommit: (value) => updateBounds(key, value),
              })
            }
          />
        );
      })}
    </div>
  );
}
