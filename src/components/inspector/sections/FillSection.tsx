import {
  getFillValue,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../../core/propertyRegistry";
import { KeyframedFillInput } from "../KeyframedColorInput";
import {
  getPropertyTrackKeyframeAtTime,
  readFillPathValue,
} from "../inspectorShared";
import { useObjectInspector } from "../objectInspectorContext";
import { LiveFillKeyframeStates } from "../scrubLive";

/**
 * Generic background-fill keyframed input. Used by every object type that
 * shows a fill (default + rect + text). Identical structurally; the registry
 * decides who renders it.
 */
export function FillSection() {
  const {
    object,
    liveScrubClock,
    currentTime,
    readEffectiveTime,
    onChange,
    onPreview,
  } = useObjectInspector();

  return (
    <LiveFillKeyframeStates
      object={object}
      liveScrubClock={liveScrubClock}
      currentTime={currentTime}
    >
      {(states) => (
        <KeyframedFillInput
          label="Background"
          fillValue={getFillValue(object)}
          keyframeStates={states}
          onToggleKeyframe={(path) => {
            const time = readEffectiveTime();
            const existing = getPropertyTrackKeyframeAtTime(object, path, time);
            if (existing) {
              onChange((obj) =>
                removePropertyKeyframe(obj, path, existing.time, time),
              );
            } else {
              const fill = getFillValue(object);
              const value = readFillPathValue(fill, path);
              onChange((obj) => upsertPropertyKeyframe(obj, path, time, value));
            }
          }}
          onChange={(fill) =>
            onChange((current) => ({
              ...current,
              style: {
                ...current.style,
                backgroundColor: fill as unknown as string,
              },
            }))
          }
          onPreview={(fill) =>
            onPreview?.((current) => ({
              ...current,
              style: {
                ...current.style,
                backgroundColor: fill as unknown as string,
              },
            }))
          }
        />
      )}
    </LiveFillKeyframeStates>
  );
}
