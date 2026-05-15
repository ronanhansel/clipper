import { ColorSelector, normalizeHexColor } from "../ColorSelector";

export function KeyframedColorInput({
  label,
  value,
  allowAlpha = false,
  hasKeyframe = false,
  onToggleKeyframe,
  onChange,
  onPreview,
}: {
  label: string;
  value: string;
  allowAlpha?: boolean;
  hasKeyframe?: boolean;
  onToggleKeyframe?: () => void;
  onChange: (value: string) => void;
  onPreview?: (value: string) => void;
}) {
  const displayColor = normalizeHexColor(value);

  const diamond = onToggleKeyframe ? (
    <button
      aria-label={
        hasKeyframe
          ? `Remove ${label} keyframe at playhead`
          : `Add ${label} keyframe at playhead`
      }
      aria-pressed={hasKeyframe}
      className={`h-2 w-2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
        hasKeyframe
          ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
          : "border-[#6f7684] bg-[#12151d] hover:border-white"
      }`}
      title={
        hasKeyframe
          ? `Remove ${label} keyframe at playhead`
          : `Add ${label} keyframe at playhead`
      }
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleKeyframe();
      }}
    />
  ) : undefined;

  return (
    <div className="grid gap-1.5 text-[11px] font-extrabold text-[#aeb6c4]">
      {label}
      <ColorSelector
        value={value}
        onChange={onChange}
        onPreview={onPreview}
        variant="default"
        pickerMode="solid"
        allowAlpha={allowAlpha}
        leftSlot={diamond}
      />
    </div>
  );
}
