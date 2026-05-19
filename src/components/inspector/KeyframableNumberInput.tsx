import { Input } from "../ui/input";
import { livePreviewScrubCommitThrottleMs } from "../../app/services/scrubInteractionService";

/**
 * Reusable keyframable number input row. Used by camera and 3D bounds
 * sections — any inspector field where a single numeric axis is both
 * keyframable on a property track and scrub-previewable.
 *
 * The diamond button toggles the keyframe at the playhead. Active
 * styling matches the existing camera section.
 */
export function KeyframableNumberInput({
  ariaLabel,
  unitPrefix,
  step,
  min,
  max,
  value,
  active,
  onPreview,
  onCommit,
  onToggleKeyframe,
}: {
  ariaLabel: string;
  unitPrefix: string;
  step: number;
  min?: number;
  max?: number;
  value: number;
  active: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
  onToggleKeyframe: () => void;
}) {
  return (
    <span className="relative block">
      <Input
        aria-label={ariaLabel}
        className={`pr-7 ${active ? "border-white" : ""}`}
        type="number"
        min={min}
        max={max}
        step={step}
        unitPrefix={unitPrefix}
        numberScrubMode="preview"
        numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
        value={value}
        onNumberScrubPreview={onPreview}
        onNumberScrubCommit={onCommit}
        onChange={(event) => {
          const num = Number(event.target.value);
          if (Number.isFinite(num)) onCommit(num);
        }}
      />
      <button
        aria-label={
          active
            ? `Remove ${ariaLabel} keyframe at playhead`
            : `Add ${ariaLabel} keyframe at playhead`
        }
        aria-pressed={active}
        className={`absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
          active
            ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
            : "border-[#6f7684] bg-[#12151d] hover:border-white"
        }`}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          onToggleKeyframe();
        }}
      />
    </span>
  );
}
