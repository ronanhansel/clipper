import { ChevronDown, Eye, EyeOff, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { mutedCaps } from "../../app/config";
import { livePreviewScrubCommitThrottleMs } from "../../app/services/scrubInteractionService";
import {
  STROKE_DEFAULTS,
  evaluateObjectState,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../core/propertyRegistry";
import type {
  FrameObject,
  JsonValue,
  StrokeEffect,
  StrokePosition,
  StrokeStyle,
} from "../../core/types";
import { ColorSelector } from "../ColorSelector";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  readPlayheadTime,
  usePlayheadTime,
} from "../../app/features/playback/usePlayheadTime";

type StrokeField = "width" | "color" | "alpha" | "start" | "end" | "spacing";

const STROKE_PATHS: Record<StrokeField, string> = {
  width: "stroke.width",
  color: "stroke.color",
  alpha: "stroke.alpha",
  start: "stroke.start",
  end: "stroke.end",
  spacing: "stroke.spacing",
};

type ResolvedStroke = Required<Omit<StrokeEffect, "position" | "style">> & {
  position: StrokePosition;
  style: StrokeStyle;
};

function getEvaluatedStroke(object: FrameObject, time: number): ResolvedStroke {
  const evaluated = evaluateObjectState(object, time);
  const stroke = evaluated.stroke as Record<string, JsonValue>;
  return {
    enabled:
      typeof stroke.enabled === "boolean"
        ? stroke.enabled
        : STROKE_DEFAULTS.enabled,
    width:
      typeof stroke.width === "number" ? stroke.width : STROKE_DEFAULTS.width,
    color:
      typeof stroke.color === "string" ? stroke.color : STROKE_DEFAULTS.color,
    alpha:
      typeof stroke.alpha === "number" ? stroke.alpha : STROKE_DEFAULTS.alpha,
    position: isStrokePosition(stroke.position)
      ? stroke.position
      : STROKE_DEFAULTS.position,
    start:
      typeof stroke.start === "number" ? stroke.start : STROKE_DEFAULTS.start,
    end: typeof stroke.end === "number" ? stroke.end : STROKE_DEFAULTS.end,
    style: isStrokeStyle(stroke.style) ? stroke.style : STROKE_DEFAULTS.style,
    spacing:
      typeof stroke.spacing === "number"
        ? stroke.spacing
        : STROKE_DEFAULTS.spacing,
  };
}

function isStrokeStyle(value: unknown): value is StrokeStyle {
  return (
    value === "solid" ||
    value === "dashed" ||
    value === "dotted" ||
    value === "dashDot"
  );
}

function isStrokePosition(value: unknown): value is StrokePosition {
  return value === "outside" || value === "center" || value === "inside";
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

export function StrokeEffectControl({
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
  const hasStroke = Boolean(object.stroke);
  const isText = object.type === "text";
  const liveTime = usePlayheadTime(liveScrubClock);
  const evaluated = useMemo(
    () => getEvaluatedStroke(object, liveTime),
    [object, liveTime],
  );

  function readEffectiveTime() {
    if (!liveScrubClock) return currentTime;
    return readPlayheadTime(currentTime);
  }

  function ensureStroke(
    updater: (stroke: StrokeEffect) => StrokeEffect,
  ): (object: FrameObject) => FrameObject {
    return (current) => ({
      ...current,
      stroke: updater(current.stroke ?? {}),
    });
  }

  function addStroke() {
    onChange(() => ({
      ...object,
      stroke: { ...STROKE_DEFAULTS },
    }));
    setOpen(true);
  }

  function removeStroke() {
    onChange((current) => {
      const next = { ...current };
      delete next.stroke;
      const tracks = { ...(current.tracks ?? {}) };
      let trackChanged = false;
      for (const path of Object.values(STROKE_PATHS)) {
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
      ensureStroke((stroke) => ({
        ...stroke,
        enabled: stroke.enabled === false ? true : false,
      })),
    );
  }

  function commitField(field: StrokeField, nextValue: number | string) {
    const path = STROKE_PATHS[field];
    const hasTrack = Boolean(object.tracks?.[path]?.points.length);
    if (hasTrack) {
      const time = readEffectiveTime();
      onChange((current) =>
        upsertPropertyKeyframe(current, path, time, nextValue),
      );
      return;
    }
    onChange(
      ensureStroke((stroke) => ({
        ...stroke,
        [field]: nextValue,
      })),
    );
  }

  function previewField(field: StrokeField, nextValue: number | string) {
    if (!onPreview) return;
    onPreview(
      ensureStroke((stroke) => ({
        ...stroke,
        [field]: nextValue,
      })),
    );
  }

  function toggleKeyframe(field: StrokeField, value: number | string) {
    const path = STROKE_PATHS[field];
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
      const colorHasTrack = Boolean(tracks[STROKE_PATHS.color]?.points.length);
      let next: FrameObject = current;
      if (colorHasTrack) {
        next = upsertPropertyKeyframe(
          next,
          STROKE_PATHS.color,
          time,
          sanitized,
        );
      } else {
        next = {
          ...next,
          stroke: { ...(next.stroke ?? {}), color: sanitized },
        };
      }
      return next;
    });
  }

  function previewColor(hex: string) {
    if (!onPreview) return;
    const sanitized = hex.startsWith("#") ? hex : `#${hex}`;
    onPreview(
      ensureStroke((stroke) => ({
        ...stroke,
        color: sanitized,
      })),
    );
  }

  function commitAlphaPct(raw: string) {
    const numeric = clamp(Number(raw) || 0, 0, 100);
    commitField("alpha", numeric);
  }

  function commitPosition(value: StrokePosition) {
    onChange(
      ensureStroke((stroke) => ({
        ...stroke,
        position: value,
      })),
    );
  }

  function commitStyle(value: StrokeStyle) {
    onChange(
      ensureStroke((stroke) => ({
        ...stroke,
        style: value,
      })),
    );
  }

  function fieldHasKeyframe(field: StrokeField) {
    return Boolean(getKeyframeAtTime(object, STROKE_PATHS[field], liveTime));
  }

  const swatchRgba = partsToRgba(evaluated.color, evaluated.alpha);
  const colorPickerValue = evaluated.color;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className={mutedCaps}>Stroke</span>
        {!hasStroke ? (
          <button
            aria-label="Add stroke"
            title="Add stroke"
            type="button"
            className="grid h-6 w-6 place-items-center rounded-[6px] border border-[#2d313b] bg-[#171920] text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c]"
            onClick={addStroke}
          >
            <Plus size={14} />
          </button>
        ) : null}
      </div>
      {hasStroke ? (
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
                Stroke
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                aria-label={evaluated.enabled ? "Hide stroke" : "Show stroke"}
                title={evaluated.enabled ? "Hide stroke" : "Show stroke"}
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
                aria-label="Remove stroke"
                title="Remove stroke"
                className="grid h-6 w-6 place-items-center rounded-[6px] text-[#dfe2ea] transition hover:bg-[#20232c]"
                onClick={(event) => {
                  event.preventDefault();
                  removeStroke();
                }}
              >
                <Minus size={14} />
              </button>
            </div>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[320px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#dfe2ea]">Stroke</span>
            </div>
            <div className="grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-2">
              <span className={mutedCaps}>Width</span>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  numberScrubMode="preview"
                  numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
                  className={`pr-8 ${
                    fieldHasKeyframe("width") ? "border-white" : ""
                  }`}
                  value={evaluated.width}
                  onNumberScrubPreview={(value) =>
                    previewField("width", Math.max(0, value))
                  }
                  onNumberScrubCommit={(value) =>
                    commitField("width", Math.max(0, value))
                  }
                  onChange={(event) => {
                    const numeric = Number(event.target.value);
                    if (!Number.isFinite(numeric)) return;
                    commitField("width", Math.max(0, numeric));
                  }}
                />
                <KeyframeDiamond
                  label="Width"
                  active={fieldHasKeyframe("width")}
                  onClick={() => toggleKeyframe("width", evaluated.width)}
                />
              </div>
              <span className={mutedCaps}>Position</span>
              <Select value={evaluated.position} onValueChange={commitPosition}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="outside">Outside</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="inside">Inside</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className={mutedCaps}>Style</span>
              <Select
                value={evaluated.style}
                onValueChange={(value) => commitStyle(value as StrokeStyle)}
                disabled={isText}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="solid">Solid</SelectItem>
                    <SelectItem value="dashed">Dashed</SelectItem>
                    <SelectItem value="dotted">Dotted</SelectItem>
                    <SelectItem value="dashDot">Dash & Dot</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {isText ? null : (
                <>
                  <span className={mutedCaps}>Start</span>
                  <StrokeOffsetInput
                    label="Start"
                    value={evaluated.start}
                    hasKeyframe={fieldHasKeyframe("start")}
                    onCommit={(value) => commitField("start", value)}
                    onPreviewNumber={(value) => previewField("start", value)}
                    onToggleKeyframe={() =>
                      toggleKeyframe("start", evaluated.start)
                    }
                  />
                  <span className={mutedCaps}>End</span>
                  <StrokeOffsetInput
                    label="End"
                    value={evaluated.end}
                    hasKeyframe={fieldHasKeyframe("end")}
                    onCommit={(value) => commitField("end", value)}
                    onPreviewNumber={(value) => previewField("end", value)}
                    onToggleKeyframe={() =>
                      toggleKeyframe("end", evaluated.end)
                    }
                  />
                  {evaluated.style !== "solid" ? (
                    <>
                      <span className={mutedCaps}>Spacing</span>
                      <StrokeSpacingInput
                        value={evaluated.spacing}
                        hasKeyframe={fieldHasKeyframe("spacing")}
                        onCommit={(value) => commitField("spacing", value)}
                        onPreviewNumber={(value) =>
                          previewField("spacing", value)
                        }
                        onToggleKeyframe={() =>
                          toggleKeyframe("spacing", evaluated.spacing)
                        }
                      />
                    </>
                  ) : null}
                </>
              )}
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

function StrokeOffsetInput({
  label,
  value,
  hasKeyframe,
  onCommit,
  onPreviewNumber,
  onToggleKeyframe,
}: {
  label: string;
  value: number;
  hasKeyframe: boolean;
  onCommit: (value: number) => void;
  onPreviewNumber: (value: number) => void;
  onToggleKeyframe: () => void;
}) {
  const pct = Math.round(clamp(value, 0, 1) * 100);
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={100}
        step={1}
        unitPrefix="%"
        numberScrubMode="preview"
        numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
        className={`pr-8 ${hasKeyframe ? "border-white" : ""}`}
        value={pct}
        onNumberScrubPreview={(next) =>
          onPreviewNumber(clamp(next, 0, 100) / 100)
        }
        onNumberScrubCommit={(next) => onCommit(clamp(next, 0, 100) / 100)}
        onChange={(event) => {
          const numeric = Number(event.target.value);
          if (!Number.isFinite(numeric)) return;
          onCommit(clamp(numeric, 0, 100) / 100);
        }}
      />
      <KeyframeDiamond
        label={label}
        active={hasKeyframe}
        onClick={onToggleKeyframe}
      />
    </div>
  );
}

function StrokeSpacingInput({
  value,
  hasKeyframe,
  onCommit,
  onPreviewNumber,
  onToggleKeyframe,
}: {
  value: number;
  hasKeyframe: boolean;
  onCommit: (value: number) => void;
  onPreviewNumber: (value: number) => void;
  onToggleKeyframe: () => void;
}) {
  const pct = Math.round(clamp(value, 0, 4) * 100);
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={400}
        step={1}
        unitPrefix="%"
        numberScrubMode="preview"
        numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
        className={`pr-8 ${hasKeyframe ? "border-white" : ""}`}
        value={pct}
        onNumberScrubPreview={(next) =>
          onPreviewNumber(clamp(next, 0, 400) / 100)
        }
        onNumberScrubCommit={(next) => onCommit(clamp(next, 0, 400) / 100)}
        onChange={(event) => {
          const numeric = Number(event.target.value);
          if (!Number.isFinite(numeric)) return;
          onCommit(clamp(numeric, 0, 400) / 100);
        }}
      />
      <KeyframeDiamond
        label="Spacing"
        active={hasKeyframe}
        onClick={onToggleKeyframe}
      />
    </div>
  );
}
