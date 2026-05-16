import { mutedCaps } from "../../../app/config";
import {
  formatStyleLabel,
  getEditableColorStyleEntries,
} from "../../ColorSelector";
import { KeyframedColorInput } from "../KeyframedColorInput";
import type { ComposeAnimationAttributeKey } from "../../timeline/composeAnimationModel";
import { useObjectInspector } from "../objectInspectorContext";
import { LiveAttributeKeyframeIndicator } from "../scrubLive";

/**
 * Renders any extra editable colour-style entries on the object's style
 * (beyond `style.color`, which has its own section). Skipped fields per type:
 * - text:   `color`        (handled by StyleColorSection)
 * - rect:   `backgroundColor`, `color`
 * - pattern2d: all (no editable colour entries)
 */
export function StyleColorEntriesSection() {
  const {
    object,
    liveScrubClock,
    currentTime,
    keyframeValue,
    toggleKeyframe,
    commitKeyframedValue,
    updateStyleColor,
    onPreview,
  } = useObjectInspector();

  const isText = object.type === "text";
  const isRect = object.type === "rect";
  const isPattern2d = object.type === "pattern2d";

  const entries = isPattern2d
    ? []
    : getEditableColorStyleEntries(object.style).filter(
        ([key]) =>
          !(isText && key === "color") &&
          !(isRect && key === "backgroundColor") &&
          !(isRect && key === "color"),
      );

  if (entries.length === 0) return null;

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Colours</span>
      <div className="grid gap-2">
        {entries.map(([key, value]) => (
          <LiveAttributeKeyframeIndicator
            key={key}
            object={object}
            attributeKey={key as ComposeAnimationAttributeKey}
            liveScrubClock={liveScrubClock}
            currentTime={currentTime}
            render={(active) => (
              <KeyframedColorInput
                label={formatStyleLabel(key)}
                value={value}
                hasKeyframe={active}
                onToggleKeyframe={() =>
                  toggleKeyframe(
                    key as ComposeAnimationAttributeKey,
                    keyframeValue(key as ComposeAnimationAttributeKey, value),
                  )
                }
                onChange={(nextValue) =>
                  commitKeyframedValue(
                    key as ComposeAnimationAttributeKey,
                    nextValue,
                    (val) => updateStyleColor(key, val),
                    "text",
                  )
                }
                onPreview={(nextValue) =>
                  onPreview?.((current) => ({
                    ...current,
                    style: { ...current.style, [key]: nextValue },
                  }))
                }
              />
            )}
          />
        ))}
      </div>
    </div>
  );
}
