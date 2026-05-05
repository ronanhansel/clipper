import { Crosshair } from "lucide-react";
import type { ComponentProps } from "react";
import { mutedCaps } from "../../app/config";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

type NumberInputProps = ComponentProps<typeof Input>;

type CoordinateAxis = {
  ariaLabel?: string;
  disabled?: boolean;
  label?: string;
  max?: number;
  min?: number;
  numberScrubMode?: NumberInputProps["numberScrubMode"];
  onChange: (value: string) => void;
  onNumberScrubEnd?: NumberInputProps["onNumberScrubEnd"];
  onNumberScrubPreview?: NumberInputProps["onNumberScrubPreview"];
  resetValue?: NumberInputProps["resetValue"];
  step?: NumberInputProps["step"];
  value: NumberInputProps["value"];
};

type Coordinate2DFieldProps = {
  className?: string;
  disabledReason?: string;
  label: string;
  onPick?: () => void;
  pickLabel?: string;
  picking?: boolean;
  x: CoordinateAxis;
  y: CoordinateAxis;
};

export function Coordinate2DField({ className, disabledReason, label, onPick, pickLabel, picking = false, x, y }: Coordinate2DFieldProps) {
  const disabled = Boolean(disabledReason) || Boolean(x.disabled && y.disabled);

  return (
    <div className={cn("grid gap-1.5", disabled ? "opacity-50" : "", className)} title={disabledReason}>
      <span className={mutedCaps}>{label}</span>
      <div className={cn("grid items-end gap-2", onPick ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px]" : "grid-cols-2")}>
        <CoordinateAxisInput axis={x} fallbackLabel="X" fieldLabel={label} />
        <CoordinateAxisInput axis={y} fallbackLabel="Y" fieldLabel={label} />
        {onPick ? <PickButton active={picking} disabled={disabled} label={pickLabel ?? `Pick ${label.toLowerCase()} from frame`} onClick={onPick} /> : null}
      </div>
    </div>
  );
}

function CoordinateAxisInput({ axis, fallbackLabel, fieldLabel }: { axis: CoordinateAxis; fallbackLabel: "X" | "Y"; fieldLabel: string }) {
  const axisLabel = axis.label ?? fallbackLabel;

  return (
    <label className={`grid gap-1 ${mutedCaps}`}>
      {axisLabel}
      <Input
        aria-label={axis.ariaLabel ?? `${fieldLabel} ${axisLabel}`}
        disabled={axis.disabled}
        max={axis.max}
        min={axis.min}
        numberScrubCommitThrottleMs={16}
        numberScrubMode={axis.numberScrubMode}
        resetValue={axis.resetValue}
        step={axis.step}
        type="number"
        value={axis.value}
        onChange={(event) => axis.onChange(event.target.value)}
        onNumberScrubEnd={axis.onNumberScrubEnd}
        onNumberScrubPreview={axis.onNumberScrubPreview}
      />
    </label>
  );
}

export function PickButton({ active = false, disabled = false, label, onClick }: { active?: boolean; disabled?: boolean; label: string; onClick?: () => void }) {
  return (
    <button
      className={cn(
        "grid h-8 w-10 place-items-center rounded-[9px] border transition",
        disabled
          ? "cursor-not-allowed border-[#2d313b] bg-[#171920] text-[#6f7480]"
          : active
            ? "border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] text-white"
            : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c]",
      )}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Crosshair size={16} />
    </button>
  );
}
