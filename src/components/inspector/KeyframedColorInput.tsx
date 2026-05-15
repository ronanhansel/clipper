import type { FillValue } from "../../core/fillValue";
import {
  ColorSelector,
  FillColorSelector,
  normalizeHexColor,
} from "../ColorSelector";

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
  const diamond = onToggleKeyframe ? (
    <KeyframeDiamond
      label={label}
      active={hasKeyframe}
      onToggle={onToggleKeyframe}
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

export type FillKeyframeState = {
  path: string;
  label: string;
  hasKeyframe: boolean;
};

export function KeyframedFillInput({
  label,
  fillValue,
  keyframeStates,
  onToggleKeyframe,
  onChange,
  onPreview,
}: {
  label: string;
  fillValue: FillValue;
  keyframeStates: FillKeyframeState[];
  onToggleKeyframe: (path: string) => void;
  onChange: (fill: FillValue) => void;
  onPreview?: (fill: FillValue) => void;
}) {
  return (
    <div className="grid gap-1.5 text-[11px] font-extrabold text-[#aeb6c4]">
      {label}
      <FillColorSelector
        fillValue={fillValue}
        onFillChange={onChange}
        onFillPreview={onPreview}
        variant="default"
        keyframeStates={keyframeStates}
        onToggleKeyframe={onToggleKeyframe}
      />
    </div>
  );
}

function KeyframeDiamond({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={
        active
          ? `Remove ${label} keyframe at playhead`
          : `Add ${label} keyframe at playhead`
      }
      aria-pressed={active}
      className={`h-2 w-2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
        active
          ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
          : "border-[#6f7684] bg-[#12151d] hover:border-white"
      }`}
      title={
        active
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
        onToggle();
      }}
    />
  );
}
