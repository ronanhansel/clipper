import { StrokeEffectControl } from "../StrokeEffectControl";
import { useObjectInspector } from "../objectInspectorContext";

export function StrokeSection() {
  const { object, currentTime, liveScrubClock, onChange, onPreview } =
    useObjectInspector();

  return (
    <StrokeEffectControl
      object={object}
      currentTime={currentTime}
      liveScrubClock={liveScrubClock}
      onChange={onChange}
      onPreview={onPreview}
    />
  );
}
