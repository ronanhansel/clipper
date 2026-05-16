import { ChevronDown, Eye, EyeOff, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { mutedCaps } from "../../app/config";
import { livePreviewScrubCommitThrottleMs } from "../../app/services/scrubInteractionService";
import {
  SHADOW_DEFAULTS,
  evaluateObjectState,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../core/propertyRegistry";
import type { FrameObject, JsonValue, ShadowEffect } from "../../core/types";
import { ColorSelector } from "../ColorSelector";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  readPlayheadTime,
  usePlayheadTime,
} from "../../app/features/playback/usePlayheadTime";

type ShadowField = "x" | "y" | "blur" | "spread" | "color" | "alpha";

const SHADOW_PATHS: Record<ShadowField, string> = {
  x: "shadow.x",
  y: "shadow.y",
  blur: "shadow.blur",
  spread: "shadow.spread",
  color: "shadow.color",
  alpha: "shadow.alpha",
};

function getEvaluatedShadow(
  object: FrameObject,
  time: number,
): Required<ShadowEffect> {
  const evaluated = evaluateObjectState(object, time);
  const shadow = evaluated.shadow as Record<string, JsonValue>;
  return {
    enabled:
      typeof shadow.enabled === "boolean"
        ? shadow.enabled
        : SHADOW_DEFAULTS.enabled,
    x: typeof shadow.x === "number" ? shadow.x : SHADOW_DEFAULTS.x,
    y: typeof shadow.y === "number" ? shadow.y : SHADOW_DEFAULTS.y,
    blur: typeof shadow.blur === "number" ? shadow.blur : SHADOW_DEFAULTS.blur,
    spread:
      typeof shadow.spread === "number"
        ? shadow.spread
        : SHADOW_DEFAULTS.spread,
    color:
      typeof shadow.color === "string" ? shadow.color : SHADOW_DEFAULTS.color,
    alpha:
      typeof shadow.alpha === "number" ? shadow.alpha : SHADOW_DEFAULTS.alpha,
  };
}

function roundedTrackTime(time: number) {
  return Math.round(time * 1000) / 1000;
}

function getKeyframeAtTime(
  object: FrameObject,
  path: string,
  time: number,
): { time: number } | null {
  const points = object.tracks?.[path]?.points;
  if (!points?.length) return null;
  const target = roundedTrackTime(time);
  const exact = points.find((point) => roundedTrackTime(point.time) === target);
  if (exact) return { time: exact.time };
  let nearest: { time: number } | null = null;
  let nearestDist = 0.016;
  for (const point of points) {
    const dist = Math.abs(point.time - time);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { time: point.time };
    }
  }
  return nearest;
}

function KeyframeDiamond({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={
        active
          ? `Remove ${label} keyframe at playhead`
          : `Add ${label} keyframe at playhead`
      }
      aria-pressed={active}
      title={
        active
          ? `Remove ${label} keyframe at playhead`
          : `Add ${label} keyframe at playhead`
      }
      type="button"
      className={`absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
        active
          ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
          : "border-[#6f7684] bg-[#12151d] hover:border-white"
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    />
  );
}

function partsToRgba(hex: string, alphaPct: number): string {
  const sanitized = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((c) => c + c)
          .join("")
      : sanitized;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return hex;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alphaPct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function DropShadowEffectControl({
  object,
  currentTime,
  liveScrubClock = false,
  onChange,
  onPreview,
}: {
  object: FrameObject;
  currentTime: number;
  liveScrubClock?: boolean;
  onChange: (updater: (object: FrameObject) => FrameObject) => void;
  onPreview?: (updater: (object: FrameObject) => FrameObject) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasShadow = Boolean(object.shadow);
  const supportsSpread = object.type === "rect" || object.type === "pattern2d";
  // Subscribe to the live playhead (scrub + playback) so shadow keyframe
  // diamonds and evaluated readouts stay current. When liveScrubClock is off
  // we short-circuit to avoid paying the per-tick cost.
  const liveTime = usePlayheadTime(liveScrubClock);
  const evaluated = useMemo(
    () => getEvaluatedShadow(object, liveTime),
    [object, liveTime],
  );

  function readEffectiveTime() {
    if (!liveScrubClock) return currentTime;
    return readPlayheadTime(currentTime);
  }

  function ensureShadow(
    updater: (shadow: ShadowEffect) => ShadowEffect,
  ): (object: FrameObject) => FrameObject {
    return (current) => ({
      ...current,
      shadow: updater(current.shadow ?? {}),
    });
  }

  function addShadow() {
    onChange(() => ({
      ...object,
      shadow: { ...SHADOW_DEFAULTS },
    }));
    setOpen(true);
  }

  function removeShadow() {
    onChange((current) => {
      const next = { ...current };
      delete next.shadow;
      const tracks = { ...(current.tracks ?? {}) };
      let trackChanged = false;
      for (const path of Object.values(SHADOW_PATHS)) {
        if (tracks[path]) {
          delete tracks[path];
          trackChanged = true;
        }
      }
      if (trackChanged) {
        next.tracks = Object.keys(tracks).length ? tracks : undefined;
      }
      return next;
    });
    setOpen(false);
  }

  function toggleEnabled() {
    onChange(
      ensureShadow((shadow) => ({
        ...shadow,
        enabled: shadow.enabled === false ? true : false,
      })),
    );
  }

  function commitField(field: ShadowField, nextValue: number | string) {
    const path = SHADOW_PATHS[field];
    const hasTrack = Boolean(object.tracks?.[path]?.points.length);
    if (hasTrack) {
      const time = readEffectiveTime();
      onChange((current) =>
        upsertPropertyKeyframe(current, path, time, nextValue),
      );
      return;
    }
    onChange(
      ensureShadow((shadow) => ({
        ...shadow,
        [field]: nextValue,
      })),
    );
  }

  function previewField(field: ShadowField, nextValue: number | string) {
    if (!onPreview) return;
    onPreview(
      ensureShadow((shadow) => ({
        ...shadow,
        [field]: nextValue,
      })),
    );
  }

  function toggleKeyframe(field: ShadowField, value: number | string) {
    const path = SHADOW_PATHS[field];
    const time = readEffectiveTime();
    const existing = getKeyframeAtTime(object, path, time);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, time),
      );
    } else {
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
    }
  }

  function commitColor(hex: string) {
    const sanitized = hex.startsWith("#") ? hex : `#${hex}`;
    const time = readEffectiveTime();
    onChange((current) => {
      const tracks = current.tracks ?? {};
      const colorHasTrack = Boolean(tracks[SHADOW_PATHS.color]?.points.length);
      let next: FrameObject = current;
      if (colorHasTrack) {
        next = upsertPropertyKeyframe(
          next,
          SHADOW_PATHS.color,
          time,
          sanitized,
        );
      } else {
        next = {
          ...next,
          shadow: { ...(next.shadow ?? {}), color: sanitized },
        };
      }
      return next;
    });
  }

  function previewColor(hex: string) {
    if (!onPreview) return;
    const sanitized = hex.startsWith("#") ? hex : `#${hex}`;
    onPreview(
      ensureShadow((shadow) => ({
        ...shadow,
        color: sanitized,
      })),
    );
  }

  function commitAlphaPct(raw: string) {
    const numeric = clamp(Number(raw) || 0, 0, 100);
    commitField("alpha", numeric);
  }

  function fieldHasKeyframe(field: ShadowField) {
    return Boolean(getKeyframeAtTime(object, SHADOW_PATHS[field], liveTime));
  }

  const swatchRgba = partsToRgba(evaluated.color, evaluated.alpha);
  const colorPickerValue = evaluated.color;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className={mutedCaps}>Effects</span>
        {!hasShadow ? (
          <button
            aria-label="Add drop shadow"
            title="Add drop shadow"
            type="button"
            className="grid h-6 w-6 place-items-center rounded-[6px] border border-[#2d313b] bg-[#171920] text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c]"
            onClick={addShadow}
          >
            <Plus size={14} />
          </button>
        ) : null}
      </div>
      {hasShadow ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="grid grid-cols-[28px_1fr_28px_28px] items-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] p-1.5">
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-[4px] border border-[#2d313b]"
                style={{ background: swatchRgba }}
              />
              <button
                type="button"
                className="flex items-center justify-between gap-1 rounded-[6px] px-2 py-1 text-left text-xs font-bold text-[#dfe2ea] transition hover:bg-[#20232c]"
                onClick={() => setOpen((value) => !value)}
              >
                Drop shadow
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                aria-label={
                  evaluated.enabled ? "Hide drop shadow" : "Show drop shadow"
                }
                title={
                  evaluated.enabled ? "Hide drop shadow" : "Show drop shadow"
                }
                aria-pressed={!evaluated.enabled}
                className="grid h-6 w-6 place-items-center rounded-[6px] text-[#dfe2ea] transition hover:bg-[#20232c]"
                onClick={(event) => {
                  event.preventDefault();
                  toggleEnabled();
                }}
              >
                {evaluated.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                type="button"
                aria-label="Remove drop shadow"
                title="Remove drop shadow"
                className="grid h-6 w-6 place-items-center rounded-[6px] text-[#ffb4b4] transition hover:bg-[#301b1d]"
                onClick={(event) => {
                  event.preventDefault();
                  removeShadow();
                }}
              >
                <Minus size={14} />
              </button>
            </div>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[320px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#dfe2ea]">
                Drop shadow
              </span>
            </div>
            <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-2">
              <span className={`self-start pt-2 ${mutedCaps}`}>Position</span>
              <div className="grid gap-2">
                <ShadowNumberInput
                  label="X"
                  value={evaluated.x}
                  hasKeyframe={fieldHasKeyframe("x")}
                  onCommit={(value) => commitField("x", value)}
                  onPreviewNumber={(value) => previewField("x", value)}
                  onToggleKeyframe={() => toggleKeyframe("x", evaluated.x)}
                  unitPrefix="X"
                />
                <ShadowNumberInput
                  label="Y"
                  value={evaluated.y}
                  hasKeyframe={fieldHasKeyframe("y")}
                  onCommit={(value) => commitField("y", value)}
                  onPreviewNumber={(value) => previewField("y", value)}
                  onToggleKeyframe={() => toggleKeyframe("y", evaluated.y)}
                  unitPrefix="Y"
                />
              </div>
              <span className={mutedCaps}>Blur</span>
              <ShadowNumberInput
                label="Blur"
                value={evaluated.blur}
                min={0}
                hasKeyframe={fieldHasKeyframe("blur")}
                onCommit={(value) => commitField("blur", value)}
                onPreviewNumber={(value) => previewField("blur", value)}
                onToggleKeyframe={() => toggleKeyframe("blur", evaluated.blur)}
              />
              <span
                className={`${mutedCaps} ${!supportsSpread ? "opacity-50" : ""}`}
                title={
                  !supportsSpread
                    ? "Spread is only supported on rect and pattern2d shadows"
                    : undefined
                }
              >
                Spread
              </span>
              <ShadowNumberInput
                label="Spread"
                value={supportsSpread ? evaluated.spread : 0}
                min={0}
                max={64}
                disabled={!supportsSpread}
                hasKeyframe={supportsSpread && fieldHasKeyframe("spread")}
                onCommit={(value) => commitField("spread", value)}
                onPreviewNumber={(value) => previewField("spread", value)}
                onToggleKeyframe={() =>
                  toggleKeyframe("spread", evaluated.spread)
                }
              />
              <span className={mutedCaps}>Color</span>
              <div className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-2">
                <div className="relative">
                  <ColorSelector
                    value={colorPickerValue}
                    onChange={commitColor}
                    onPreview={previewColor}
                    variant="dense"
                  />
                  <KeyframeDiamond
                    label="Color"
                    active={fieldHasKeyframe("color")}
                    onClick={() => toggleKeyframe("color", evaluated.color)}
                  />
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    unitPrefix="%"
                    numberScrubMode="preview"
                    numberScrubCommitThrottleMs={
                      livePreviewScrubCommitThrottleMs
                    }
                    className={`pr-8 ${
                      fieldHasKeyframe("alpha") ? "border-white" : ""
                    }`}
                    value={evaluated.alpha}
                    onNumberScrubPreview={(value) =>
                      previewField("alpha", clamp(value, 0, 100))
                    }
                    onNumberScrubCommit={(value) =>
                      commitField("alpha", clamp(value, 0, 100))
                    }
                    onChange={(event) => commitAlphaPct(event.target.value)}
                  />
                  <KeyframeDiamond
                    label="Alpha"
                    active={fieldHasKeyframe("alpha")}
                    onClick={() => toggleKeyframe("alpha", evaluated.alpha)}
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function ShadowNumberInput({
  label,
  value,
  min,
  max,
  hasKeyframe,
  onCommit,
  onPreviewNumber,
  onToggleKeyframe,
  unitPrefix,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  hasKeyframe: boolean;
  onCommit: (value: number) => void;
  onPreviewNumber: (value: number) => void;
  onToggleKeyframe: () => void;
  unitPrefix?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        unitPrefix={unitPrefix}
        numberScrubMode="preview"
        numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
        className={`pr-8 ${hasKeyframe ? "border-white" : ""}`}
        value={value}
        onNumberScrubPreview={(next) =>
          onPreviewNumber(applyBounds(next, min, max))
        }
        onNumberScrubCommit={(next) => onCommit(applyBounds(next, min, max))}
        onChange={(event) => {
          const numeric = Number(event.target.value);
          if (!Number.isFinite(numeric)) return;
          onCommit(applyBounds(numeric, min, max));
        }}
      />
      {disabled ? null : (
        <KeyframeDiamond
          label={label}
          active={hasKeyframe}
          onClick={onToggleKeyframe}
        />
      )}
    </div>
  );
}

function applyBounds(value: number, min?: number, max?: number) {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}
