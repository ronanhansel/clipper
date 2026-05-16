import { graphicTextDefaults } from "../../../core/graphics/inspectorSettings";
import { isHexColor } from "../../ColorSelector";
import { KeyframedColorInput } from "../KeyframedColorInput";
import { useObjectInspector } from "../objectInspectorContext";
import { LiveAttributeKeyframeIndicator } from "../scrubLive";

/**
 * `style.color` colour input with keyframe diamond. Used by default and text
 * sections; rect skips this (uses background fill instead).
 *
 * The fallback colour for text objects uses the graphic text defaults; for
 * non-text objects we fall back to the same default since both currently use
 * the same hex.
 */
export function StyleColorSection() {
  const {
    object,
    liveScrubClock,
    currentTime,
    keyframeValue,
    toggleKeyframe,
    commitKeyframedValue,
    updateStyleValue,
    onPreview,
  } = useObjectInspector();

  const fallbackColor = isHexColor(String(object.style.color ?? ""))
    ? String(object.style.color)
    : graphicTextDefaults.color;

  return (
    <LiveAttributeKeyframeIndicator
      object={object}
      attributeKey="color"
      liveScrubClock={liveScrubClock}
      currentTime={currentTime}
      render={(active) => (
        <KeyframedColorInput
          label="Colour"
          value={String(object.style.color ?? fallbackColor)}
          allowAlpha
          hasKeyframe={active}
          onToggleKeyframe={() =>
            toggleKeyframe(
              "color",
              keyframeValue(
                "color",
                String(object.style.color ?? fallbackColor),
              ),
            )
          }
          onChange={(value) =>
            commitKeyframedValue(
              "color",
              value,
              (nextValue) => updateStyleValue("color", nextValue),
              "text",
            )
          }
          onPreview={(value) =>
            onPreview?.((current) => ({
              ...current,
              style: { ...current.style, color: value },
            }))
          }
        />
      )}
    />
  );
}
