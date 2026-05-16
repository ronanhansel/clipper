import { mutedCaps } from "../../../app/config";
import { DropShadowEffectControl } from "../DropShadowEffectControl";
import { effectInputDescriptors } from "../inspectorShared";
import { useObjectInspector } from "../objectInspectorContext";
import { KeyframedRow } from "../scrubLive";

/**
 * Effects grid (opacity / blur / transform / etc.) plus the drop-shadow
 * control. Always rendered for every object type.
 */
export function EffectsSection() {
  const {
    object,
    liveScrubClock,
    currentTime,
    hasAttributeKeyframes,
    updateStyleNumber,
    previewStyleNumber,
    updateTransform,
    previewTransform,
    renderKeyframedInput,
    onChange,
    onPreview,
  } = useObjectInspector();

  return (
    <>
      <div className="grid gap-2">
        <span className={mutedCaps}>Effects</span>
        <div className="grid grid-cols-2 gap-2">
          {effectInputDescriptors.map((descriptor) => {
            const config = descriptor.build({
              object,
              updateStyleNumber,
              previewStyleNumber,
              updateTransform,
              previewTransform,
            });
            return (
              <KeyframedRow
                key={descriptor.key}
                liveScrubClock={liveScrubClock}
                currentTime={currentTime}
                hasTrack={
                  config.animationKey
                    ? hasAttributeKeyframes(config.animationKey)
                    : false
                }
                render={() => renderKeyframedInput(config)}
              />
            );
          })}
        </div>
      </div>
      <DropShadowEffectControl
        object={object}
        currentTime={currentTime}
        liveScrubClock={liveScrubClock}
        onChange={onChange}
        onPreview={onPreview}
      />
    </>
  );
}
