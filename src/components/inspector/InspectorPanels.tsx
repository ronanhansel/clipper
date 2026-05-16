import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Trash2,
  Underline,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import {
  MAX_PART_DURATION_SECONDS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type BackgroundLayer,
  type Bounds,
  type CompositionRenderMode,
  type FrameObject,
  type MotionEase,
  type Part,
  type PartFrame,
  type Point,
  type TransitionLayer,
} from "../../core/types";
import {
  getFillValue,
  removePropertyKeyframe,
  upsertPropertyKeyframe,
} from "../../core/propertyRegistry";
import { clamp, roundTenth, roundTwo } from "../../core/math";
import {
  getAdjustmentEffectPackage,
  defaultMotionEffectPackage,
  getMotionEffectByKind,
  getMotionEffectPackage,
  getTransitionEffectPackage,
} from "../../core/effects/registry";
import {
  getTransitionMarkerTime,
  normalizeSymmetricTransitionLayer,
} from "../../core/transitions";
import type {
  AdjustmentEffectPointControl,
  MotionMendTransitionOption,
  TransitionEffectParamControl,
} from "../../core/effects/types";
import { getMotionMarkerViews } from "../../core/motionEffects";
import { cameraTranslationToFramePoint } from "../../core/camera";
import type { MotionMarker } from "../../core/types";
import { minimumZoomDuration, mutedCaps, panelCard } from "../../app/config";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { TooltipProvider } from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import {
  formatStyleLabel,
  getEditableColorStyleEntries,
  isHexColor,
} from "../ColorSelector";
import { KeyframedColorInput, KeyframedFillInput } from "./KeyframedColorInput";
import { Coordinate2DField, PickButton } from "./Coordinate2DField";
import { DropShadowEffectControl } from "./DropShadowEffectControl";
import { EffectControls } from "./EffectControls";
import {
  defaultMotionEaseSelectValue,
  EaseSelectItems,
  motionEaseSelectValue,
} from "../timeline/EaseSelectItems";
import {
  graphicBoundsKeys,
  graphicTextDefaults,
} from "../../core/graphics/inspectorSettings";
import { type ComposeAnimationAttributeKey } from "../timeline/composeAnimationModel";
import { readPlayheadTime } from "../../app/features/playback/usePlayheadTime";
import { livePreviewScrubCommitThrottleMs } from "../../app/services/scrubInteractionService";
import {
  type BoundsAnimationKey,
  coerceInspectorAttributeValue,
  effectInputDescriptors,
  getEvaluatedAttributeValue,
  getPropertyTrackKeyframeAtTime,
  hasPropertyTrack,
  isBoundsAnimationKey,
  propertyPathForAttribute,
  readFillPathValue,
} from "./inspectorShared";
import { FontSelector } from "./sections/FontSelector";
import { getInspectorTypeDefinition } from "./inspectorRegistry";
import {
  ObjectInspectorProvider,
  type ObjectInspectorHelpers,
} from "./objectInspectorContext";
import type { EffectInputConfig } from "./inspectorShared";

export { preloadSystemFontOptions } from "./sections/FontSelector";

export function FrameInspector({
  part,
  canSnapMiddle,
  onDurationChange,
  onBackgroundChange,
  onRenderModeChange,
  onSnapMiddle,
}: {
  part: Part;
  canSnapMiddle: boolean;
  onDurationChange: (duration: number) => void;
  onBackgroundChange: (
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) => void;
  onRenderModeChange: (renderMode: CompositionRenderMode) => void;
  onSnapMiddle: () => void;
}) {
  const motionViews = getMotionMarkerViews(part);
  const markerEnd = Math.max(
    0,
    ...motionViews.motionMarkers.map(
      (marker) => marker.start + marker.duration,
    ),
  );
  const minimumDuration = roundTenth(Math.max(0.1, markerEnd));
  function updateDuration(value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    onDurationChange(
      roundTenth(clamp(numeric, minimumDuration, MAX_PART_DURATION_SECONDS)),
    );
  }

  function updateBackgroundStretch(checked: boolean) {
    onBackgroundChange((background) => ({
      ...background,
      stretchToElements: checked || undefined,
    }));
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Duration
        <Input
          type="number"
          min={minimumDuration}
          max={MAX_PART_DURATION_SECONDS}
          step={0.1}
          value={part.duration}
          onChange={(event) => updateDuration(event.target.value)}
        />
      </label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Render mode
        <Select
          value={part.renderMode ?? "dom"}
          onValueChange={(value) =>
            onRenderModeChange(value as CompositionRenderMode)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="dom">DOM</SelectItem>
              <SelectItem value="webgl">WebGL</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]">
        <Checkbox
          checked={Boolean(part.background.stretchToElements)}
          onCheckedChange={(checked) =>
            updateBackgroundStretch(checked === true)
          }
        />
        <span>Stretch background</span>
      </label>
      {canSnapMiddle ? (
        <div className="grid gap-2">
          <span className={mutedCaps}>Mend</span>
          <div className="grid gap-2">
            <button
              className={snapButtonClass(false, canSnapMiddle)}
              title="Mend adjacent compositions"
              aria-pressed={false}
              onClick={onSnapMiddle}
            >
              Mend
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ObjectInspector = memo(function ObjectInspector({
  object,
  currentTime = 0,
  liveScrubClock = false,
  lockBounds = false,
  onChange,
  onPreview,
}: {
  object: FrameObject;
  currentTime?: number;
  liveScrubClock?: boolean;
  lockBounds?: boolean;
  onChange: (updater: (object: FrameObject) => FrameObject) => void;
  onPreview?: (updater: (object: FrameObject) => FrameObject) => void;
}) {
  // Don't subscribe to the live playhead clock at the inspector root -- that
  // would rerender the entire ~3.7k-line tree on every tick. Callbacks read
  // the live time on demand via readEffectiveTime(); leaf components that
  // need to react visually subscribe themselves via usePlayheadTime.
  function readEffectiveTime() {
    if (!liveScrubClock) return currentTime;
    return readPlayheadTime(currentTime);
  }

  const fontWeight = Number(
    object.style.fontWeight ?? graphicTextDefaults.fontWeight,
  );
  const fontStyle = String(
    object.style.fontStyle ?? graphicTextDefaults.fontStyle,
  );
  const textDecoration = String(
    object.style.textDecoration ?? graphicTextDefaults.textDecoration,
  );

  const textButtonBase =
    "grid h-9 place-items-center rounded-[9px] border text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)]";

  function updateBounds(key: keyof Bounds, value: string) {
    onChange((current) => ({
      ...current,
      bounds: { ...current.bounds, [key]: Number(value) || 0 },
    }));
  }

  function previewBounds(key: keyof Bounds, value: number) {
    onPreview?.((current) => ({
      ...current,
      bounds: { ...current.bounds, [key]: Number.isFinite(value) ? value : 0 },
    }));
  }

  function updateStyleColor(key: string, value: string) {
    onChange((current) => ({
      ...current,
      style: { ...current.style, [key]: value },
    }));
  }

  function updateTextContent(value: string) {
    onChange((current) => ({
      ...current,
      content: value,
      richText: undefined,
    }));
  }

  function updateStyleValue(key: string, value: string | number) {
    onChange((current) => ({
      ...current,
      style: { ...current.style, [key]: value },
    }));
  }

  function updateStyleNumber(key: string, value: string) {
    updateStyleValue(key, Number(value) || 0);
  }

  function updateTransform(key: string, value: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    onChange((current) => ({
      ...current,
      transform: {
        ...(typeof current.transform === "object" ? current.transform : {}),
        [key]: num,
      },
    }));
  }

  function previewTransform(key: string, value: number) {
    onPreview?.((current) => ({
      ...current,
      transform: {
        ...(typeof current.transform === "object" ? current.transform : {}),
        [key]: value,
      },
    }));
  }

  function previewStyleNumber(key: string, value: number) {
    onPreview?.((current) => ({
      ...current,
      style: { ...current.style, [key]: Number.isFinite(value) ? value : 0 },
    }));
  }

  function toggleBold() {
    updateStyleValue("fontWeight", fontWeight >= 700 ? 400 : 700);
  }

  function toggleItalic() {
    updateStyleValue("fontStyle", fontStyle === "italic" ? "normal" : "italic");
  }

  function hasTextDecoration(value: "underline" | "line-through") {
    return textDecoration.split(" ").includes(value);
  }

  function toggleTextDecoration(value: "underline" | "line-through") {
    const decorations = new Set(
      textDecoration === "none"
        ? []
        : textDecoration.split(" ").filter(Boolean),
    );
    if (decorations.has(value)) decorations.delete(value);
    else decorations.add(value);
    updateStyleValue(
      "textDecoration",
      decorations.size > 0 ? Array.from(decorations).join(" ") : "none",
    );
  }

  function toggleStrikethrough() {
    toggleTextDecoration("line-through");
  }

  function toggleUnderline() {
    toggleTextDecoration("underline");
  }

  function textButtonClass(active: boolean) {
    return `${textButtonBase} ${active ? "border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] text-white" : "border-[#2d313b] bg-[#171920]"}`;
  }

  function keyframeValue(
    key: ComposeAnimationAttributeKey,
    fallback: number | string,
  ) {
    const propertyValue = getEvaluatedAttributeValue(
      object,
      key,
      readEffectiveTime(),
    );
    return propertyValue !== null
      ? (propertyValue as number | string)
      : fallback;
  }

  function hasAttributeKeyframes(key: ComposeAnimationAttributeKey) {
    return hasPropertyTrack(object, propertyPathForAttribute(key));
  }

  function keyframeAtCurrentTime(key: ComposeAnimationAttributeKey) {
    return getPropertyTrackKeyframeAtTime(
      object,
      propertyPathForAttribute(key),
      readEffectiveTime(),
    );
  }

  function toggleKeyframe(
    key: ComposeAnimationAttributeKey,
    value: number | string,
  ) {
    const propertyPath = propertyPathForAttribute(key);
    if (!propertyPath) return;
    const time = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, propertyPath, time);
    if (existing) {
      onChange((obj) =>
        removePropertyKeyframe(obj, propertyPath, existing.time, time),
      );
    } else {
      onChange((obj) =>
        upsertPropertyKeyframe(
          obj,
          propertyPath,
          time,
          coerceInspectorAttributeValue(key, value),
        ),
      );
    }
  }

  function upsertKeyframeValues(
    entries: readonly {
      key: ComposeAnimationAttributeKey;
      value: number | string;
    }[],
  ) {
    const time = readEffectiveTime();
    onChange((current) =>
      entries.reduce((next, entry) => {
        const path = propertyPathForAttribute(entry.key);
        if (!path) return next;
        return upsertPropertyKeyframe(
          next,
          path,
          time,
          coerceInspectorAttributeValue(entry.key, entry.value),
        );
      }, current),
    );
  }

  function removeKeyframesAtCurrentTime(
    keys: readonly ComposeAnimationAttributeKey[],
  ) {
    const time = readEffectiveTime();
    onChange((current) =>
      keys.reduce((next, key) => {
        const path = propertyPathForAttribute(key);
        const existing = getPropertyTrackKeyframeAtTime(next, path, time);
        if (!existing || !path) return next;
        return removePropertyKeyframe(next, path, existing.time, time);
      }, current),
    );
  }

  function toggleLinkedKeyframes(
    keys: readonly [BoundsAnimationKey, BoundsAnimationKey],
    values: readonly [number | string, number | string],
  ) {
    const hasAny = keys.some((key) => Boolean(keyframeAtCurrentTime(key)));
    if (hasAny) {
      removeKeyframesAtCurrentTime(keys);
      return;
    }
    upsertKeyframeValues([
      { key: keys[0], value: values[0] },
      { key: keys[1], value: values[1] },
    ]);
  }

  function commitKeyframedValue(
    key: ComposeAnimationAttributeKey | undefined,
    value: string,
    fallbackCommit: (value: string) => void,
    type: "number" | "text",
  ) {
    if (!key) return;
    const nextValue = type === "number" ? Number(value) : value;
    if (type === "number" && !Number.isFinite(nextValue)) return;
    if (!hasAttributeKeyframes(key)) {
      fallbackCommit(value);
      return;
    }
    upsertKeyframeValues([{ key, value: nextValue }]);
  }

  function commitLinkedKeyframedValue(
    keys: readonly [BoundsAnimationKey, BoundsAnimationKey],
    changedKey: BoundsAnimationKey,
    value: string,
    fallbackCommit: (value: string) => void,
  ) {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;
    const [firstKey, secondKey] = keys;
    const firstActive = hasAttributeKeyframes(firstKey);
    const secondActive = hasAttributeKeyframes(secondKey);
    const shouldWriteKeyframes = firstActive || secondActive;
    if (!shouldWriteKeyframes) {
      fallbackCommit(value);
      return;
    }
    const firstValue =
      changedKey === firstKey
        ? nextValue
        : Number(keyframeValue(firstKey, object.bounds[firstKey]));
    const secondValue =
      changedKey === secondKey
        ? nextValue
        : Number(keyframeValue(secondKey, object.bounds[secondKey]));
    if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) return;
    upsertKeyframeValues([
      { key: firstKey, value: firstValue },
      { key: secondKey, value: secondValue },
    ]);
  }

  function renderKeyframedInput({
    label,
    animationKey,
    value,
    type = "number",
    min,
    max,
    step,
    onCommit,
    onPreviewNumber,
    linkedKeys,
  }: EffectInputConfig) {
    const fieldValue = animationKey
      ? keyframeValue(animationKey, value)
      : value;
    const active = linkedKeys
      ? linkedKeys.some((key) => Boolean(keyframeAtCurrentTime(key)))
      : animationKey
        ? Boolean(keyframeAtCurrentTime(animationKey))
        : false;
    return (
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        {label}
        <span className="relative block">
          <Input
            className={`pr-8 ${active ? "border-white" : ""}`}
            type={type}
            min={min}
            max={max}
            step={step}
            numberScrubMode={type === "number" ? "preview" : undefined}
            numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
            value={fieldValue}
            onNumberScrubCommit={
              type === "number" ? (value) => onCommit(String(value)) : undefined
            }
            onNumberScrubPreview={onPreviewNumber}
            onChange={(event) =>
              linkedKeys &&
              animationKey &&
              type === "number" &&
              isBoundsAnimationKey(animationKey)
                ? commitLinkedKeyframedValue(
                    linkedKeys,
                    animationKey,
                    event.target.value,
                    onCommit,
                  )
                : commitKeyframedValue(
                    animationKey,
                    event.target.value,
                    onCommit,
                    type,
                  )
            }
          />
          {animationKey ? (
            <button
              aria-label={
                active
                  ? `Remove ${label} keyframe at playhead`
                  : `Add ${label} keyframe at playhead`
              }
              aria-pressed={active}
              className={`absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
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
                // Keep focused input from blurring/re-rendering before click toggles.
                event.preventDefault();
              }}
              onClick={(event) => {
                event.preventDefault();
                if (linkedKeys && animationKey) {
                  const [firstKey, secondKey] = linkedKeys;
                  const firstValue = keyframeValue(
                    firstKey,
                    object.bounds[firstKey],
                  );
                  const secondValue = keyframeValue(
                    secondKey,
                    object.bounds[secondKey],
                  );
                  toggleLinkedKeyframes(linkedKeys, [firstValue, secondValue]);
                  return;
                }
                toggleKeyframe(animationKey, fieldValue);
              }}
            />
          ) : null}
        </span>
      </label>
    );
  }

  const helpers: ObjectInspectorHelpers = {
    object,
    currentTime,
    liveScrubClock,
    lockBounds,
    onChange,
    onPreview,
    readEffectiveTime,
    updateBounds,
    previewBounds,
    updateStyleColor,
    updateTextContent,
    updateStyleValue,
    updateStyleNumber,
    previewStyleNumber,
    updateTransform,
    previewTransform,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    toggleStrikethrough,
    hasTextDecoration,
    textButtonClass,
    keyframeValue,
    hasAttributeKeyframes,
    keyframeAtCurrentTime,
    toggleKeyframe,
    toggleLinkedKeyframes,
    commitKeyframedValue,
    commitLinkedKeyframedValue,
    renderKeyframedInput,
  };

  const definition = getInspectorTypeDefinition(object.type);

  return (
    <ObjectInspectorProvider value={helpers}>
      <div className="grid gap-3">
        {definition.sections.map((Section, index) => (
          <Section key={index} />
        ))}
      </div>
    </ObjectInspectorProvider>
  );
});

export function AdjustmentInspector({
  layer,
  sceneDuration,
  pickingPointKey,
  canSnapMiddle,
  onChange,
  onPreviewLayer,
  onClearPreview,
  onDelete,
  onPickPoint,
  onSnapMiddle,
}: {
  layer: AdjustmentLayer;
  sceneDuration: number;
  pickingPointKey?: string | null;
  canSnapMiddle: boolean;
  onChange: (updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  onPreviewLayer?: (
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) => void;
  onClearPreview?: () => void;
  onDelete: () => void;
  onPickPoint?: (control: AdjustmentEffectPointControl) => void;
  onSnapMiddle: () => void;
}) {
  const effect = getAdjustmentEffectPackage(layer.effect.effectId);

  function updateText(key: "name", value: string) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => {
      if (key === "start")
        return {
          ...current,
          start: roundTenth(
            clamp(numeric, 0, Math.max(sceneDuration - current.duration, 0)),
          ),
        };
      return {
        ...current,
        duration: roundTenth(
          clamp(numeric, 0.1, Math.max(sceneDuration - current.start, 0.1)),
        ),
      };
    });
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Name
        <Input
          value={layer.name}
          onChange={(event) => updateText("name", event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Start
          <Input
            type="number"
            min={0}
            max={sceneDuration - layer.duration}
            step={0.1}
            value={layer.start}
            onChange={(event) => updateNumber("start", event.target.value)}
          />
        </label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Duration
          <Input
            type="number"
            min={0.1}
            max={sceneDuration - layer.start}
            step={0.1}
            value={layer.duration}
            onChange={(event) => updateNumber("duration", event.target.value)}
          />
        </label>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Effect
        <Input value={effect?.label ?? layer.effect.effectId} readOnly />
      </label>
      <EffectControls
        effect={effect}
        layer={layer}
        pickingPointKey={pickingPointKey}
        onChange={onChange}
        onPreviewLayer={onPreviewLayer}
        onClearPreview={onClearPreview}
        onPickPoint={onPickPoint}
      />
      {canSnapMiddle ? (
        <div className="grid gap-2">
          <span className={mutedCaps}>Mend</span>
          <div className="grid gap-2">
            <button
              className={snapButtonClass(false, canSnapMiddle)}
              title="Mend adjacent adjustment layers"
              aria-pressed={false}
              onClick={onSnapMiddle}
            >
              Mend
            </button>
          </div>
        </div>
      ) : null}
      <button
        className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]"
        onClick={onDelete}
      >
        <Trash2 size={15} />
        Delete
      </button>
    </div>
  );
}

function snapButtonClass(active: boolean, enabled = true) {
  if (active)
    return "rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] px-3 py-2.5 text-center text-xs font-bold text-[var(--clipper-accent)] transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]";
  return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
}

export function EmptyInspector() {
  return (
    <div className={panelCard}>
      <span>No selection</span>
      <strong className="text-[13px]">Nothing selected</strong>
      <small className="text-[#9b9da7]">
        Select a composition, marker, or object to edit its settings.
      </small>
    </div>
  );
}

export function TransitionInspector({
  layer,
  onChange,
  onPreviewLayer,
  onClearPreview,
  onDelete,
}: {
  layer: TransitionLayer;
  onChange: (updater: (layer: TransitionLayer) => TransitionLayer) => void;
  onPreviewLayer?: (
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) => void;
  onClearPreview?: () => void;
  onDelete: () => void;
}) {
  const effect = getTransitionEffectPackage(layer.effect.effectId);
  const ease = (layer.effect.params?.ease as MotionEase) ?? "easeInOut";
  const markerTime = getTransitionMarkerTime(layer);

  function getParamValue(control: TransitionEffectParamControl) {
    const value = layer.effect.params?.[control.key];
    if (control.type === "boolean")
      return typeof value === "boolean" ? value : control.defaultValue;
    if (control.type === "color")
      return typeof value === "string" && isHexColor(value)
        ? value
        : control.defaultValue;
    if (control.type === "select")
      return typeof value === "string" ? value : control.defaultValue;
    if (control.key === "seed") return getTransitionSeedValue(control, value);
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : control.defaultValue;
  }

  function updateName(value: string) {
    onChange((current) => ({ ...current, name: value }));
  }

  function updateEase(value: string) {
    const easeValue =
      value === defaultMotionEaseSelectValue
        ? "easeInOut"
        : (value as MotionEase);
    onChange((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, ease: easeValue },
      },
    }));
  }

  function commitDuration(value: string) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return;
    onChange((current) => {
      const duration = clamp(numeric, 0.1, MAX_PART_DURATION_SECONDS);
      return normalizeSymmetricTransitionLayer({
        ...current,
        start: getTransitionMarkerTime(current) - duration / 2,
        duration,
      });
    });
  }

  function commitMarkerTime(value: string) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return;
    onChange((current) =>
      normalizeSymmetricTransitionLayer({
        ...current,
        start:
          clamp(numeric, 0, MAX_PART_DURATION_SECONDS) - current.duration / 2,
      }),
    );
  }

  function updateParam(control: TransitionEffectParamControl, value: unknown) {
    const nextValue =
      control.type === "number"
        ? getTransitionParamNumericValue(control, String(value))
        : control.type === "boolean"
          ? value === true
          : control.type === "color"
            ? isHexColor(String(value))
              ? String(value)
              : control.defaultValue
            : String(value);
    onChange((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [control.key]: nextValue },
      },
    }));
  }

  function previewParam(
    control: Extract<TransitionEffectParamControl, { type: "number" }>,
    value: number,
  ) {
    const nextValue = getTransitionParamNumericValue(control, String(value));
    onPreviewLayer?.((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [control.key]: nextValue },
      },
    }));
  }

  function renderParamControl(control: TransitionEffectParamControl) {
    if (control.type === "boolean") {
      return (
        <label
          className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]"
          key={control.key}
        >
          <Checkbox
            checked={Boolean(getParamValue(control))}
            onCheckedChange={(checked) =>
              updateParam(control, checked === true)
            }
          />
          <span>{control.label}</span>
        </label>
      );
    }

    if (control.type === "color") {
      return (
        <div className="col-span-2" key={control.key}>
          <KeyframedColorInput
            label={control.label}
            value={String(getParamValue(control))}
            onChange={(value) => updateParam(control, value)}
          />
        </div>
      );
    }

    return (
      <label className={`grid gap-1.5 ${mutedCaps}`} key={control.key}>
        {control.label}
        {control.type === "select" ? (
          <Select
            value={String(getParamValue(control))}
            onValueChange={(value) => updateParam(control, value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {control.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <Input
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={getParamValue(control) as number}
            resetValue={control.defaultValue}
            numberScrubMode="preview"
            numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
            onChange={(event) => updateParam(control, event.target.value)}
            onNumberScrubPreview={(value) => previewParam(control, value)}
            onNumberScrubEnd={onClearPreview}
          />
        )}
      </label>
    );
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Name
        <Input
          value={layer.name}
          placeholder={effect?.label ?? "Transition"}
          onChange={(event) => updateName(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Duration
          <Input
            type="number"
            min={0.1}
            max={MAX_PART_DURATION_SECONDS}
            step={0.1}
            value={roundTwo(layer.duration)}
            onChange={(event) => commitDuration(event.target.value)}
          />
        </label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Marker time
          <Input
            type="number"
            min={0}
            max={MAX_PART_DURATION_SECONDS}
            step={0.1}
            value={roundTwo(markerTime)}
            onChange={(event) => commitMarkerTime(event.target.value)}
          />
        </label>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Effect
        <Input value={effect?.label ?? layer.effect.effectId} readOnly />
      </label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Ease
        <Select value={motionEaseSelectValue(ease)} onValueChange={updateEase}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <TooltipProvider delayDuration={1000} skipDelayDuration={0}>
              <SelectGroup>
                <EaseSelectItems defaultInOut />
              </SelectGroup>
            </TooltipProvider>
          </SelectContent>
        </Select>
      </label>
      {effect?.paramControls?.length ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-[#9b9da7]">
              Effect Settings
            </span>
            {effect.timelineTags?.length ? (
              <span className="rounded-[3px] border border-white/20 bg-black/24 px-1.5 py-1 text-[9px] font-black uppercase leading-none tracking-[0.12em] text-white/80">
                {effect.timelineTags[0]?.label}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {effect.paramControls.map((control) => renderParamControl(control))}
          </div>
        </>
      ) : null}
      <button
        className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]"
        onClick={onDelete}
      >
        <Trash2 size={15} />
        Delete
      </button>
    </div>
  );
}

function getTransitionParamNumericValue(
  control: Extract<TransitionEffectParamControl, { type: "number" }>,
  value: string,
) {
  const fallback = control.defaultValue;
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) numeric = fallback;
  if (typeof control.min === "number") numeric = Math.max(control.min, numeric);
  if (typeof control.max === "number") numeric = Math.min(control.max, numeric);
  if (control.step && Number.isInteger(control.step))
    numeric = Math.round(numeric);
  return numeric;
}

function getTransitionSeedValue(
  control: TransitionEffectParamControl,
  value: unknown,
) {
  if (control.type !== "number") return control.defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value))
    return control.defaultValue;
  if (
    control.step &&
    Number.isInteger(control.step) &&
    Number.isInteger(control.defaultValue) &&
    value > 0 &&
    value < 1
  )
    return Math.round(value * 100);
  return value;
}

export function MotionInspector({
  marker,
  part,
  selectedMarkerCount,
  selectedSnapInActive,
  selectedSnapOutActive,
  middleSnapActive,
  middleEase,
  middleTransitionMode,
  pickingFocus,
  pickingPosition,
  pickingTracker,
  canSnapMiddle,
  onChange,
  onPreviewMarker,
  onPreviewPickPoint,
  onPreviewScrubStart,
  onPreviewScrubEnd,
  onClearPreview,
  onChangeFocus,
  onChangeSelectedSnap,
  onChangeMiddleTransition,
  onChangeMiddleEase,
  onDelete,
  onPickFocus,
  onPickPosition,
  onPickTracker,
  onSnapMiddle,
}: {
  marker: MotionMarker;
  part: Part;
  selectedMarkerCount: number;
  selectedSnapInActive: boolean;
  selectedSnapOutActive: boolean;
  middleSnapActive: boolean;
  middleEase?: MotionEase;
  middleTransitionMode: "instant" | "transition";
  pickingFocus: boolean;
  pickingPosition: boolean;
  pickingTracker: boolean;
  canSnapMiddle: boolean;
  onChange: (
    updater: (marker: MotionMarker, part: Part) => MotionMarker,
  ) => void;
  onPreviewMarker?: (updater: (marker: MotionMarker) => MotionMarker) => void;
  onPreviewPickPoint?: (point: Point | null) => void;
  onPreviewScrubStart?: () => void;
  onPreviewScrubEnd?: () => void;
  onClearPreview?: () => void;
  onChangeFocus?: (focus: Point) => void;
  onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void;
  onChangeMiddleTransition: (mode: "instant" | "transition") => void;
  onChangeMiddleEase: (ease: MotionEase | undefined) => void;
  onDelete: () => void;
  onPickFocus?: () => void;
  onPickPosition?: () => void;
  onPickTracker?: () => void;
  onSnapMiddle: () => void;
}) {
  const isMultiSelection = selectedMarkerCount > 1;
  const markerKind = marker.kind;
  const effectId =
    marker.effectId ??
    getMotionEffectByKind(markerKind)?.id ??
    defaultMotionEffectPackage.id;
  const defaultName = getMotionEffectPackage(effectId)?.label ?? "Motion";
  const positionDisabledReason =
    markerKind === "pan" && marker.followId
      ? "Pan position is controlled by the tracker."
      : undefined;
  const [draftScale, setDraftScale] = useState(() =>
    roundTwo(clamp(marker.scale ?? 1, 1, 5)),
  );

  useEffect(() => {
    setDraftScale(roundTwo(clamp(marker.scale ?? 1, 1, 5)));
  }, [marker.id, marker.scale]);

  useEffect(() => () => onClearPreview?.(), []);

  function finishPreviewScrub() {
    onClearPreview?.();
    onPreviewScrubEnd?.();
  }

  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current, currentPart) => {
      if (key === "start")
        return {
          ...current,
          start: roundTenth(
            clamp(
              numeric,
              0,
              Math.max(currentPart.duration - current.duration, 0),
            ),
          ),
        };
      return {
        ...current,
        duration: roundTenth(
          clamp(
            numeric,
            minimumZoomDuration,
            currentPart.duration - current.start,
          ),
        ),
      };
    });
  }

  function updateName(value: string) {
    onChange((current) => ({ ...current, name: value.trim() || undefined }));
  }

  function updateFocus(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    const focus = marker.focus ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 };
    onChangeFocus?.({
      ...focus,
      [key]: Math.round(
        clamp(numeric, 0, key === "x" ? FRAME_WIDTH : FRAME_HEIGHT),
      ),
    });
  }

  function previewFocus(key: keyof Point, value: number) {
    const focus = marker.focus ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 };
    const nextFocus = {
      ...focus,
      [key]: Math.round(
        clamp(value, 0, key === "x" ? FRAME_WIDTH : FRAME_HEIGHT),
      ),
    };
    if (pickingFocus) onPreviewPickPoint?.(nextFocus);
    onPreviewMarker?.((current) => ({ ...current, focus: nextFocus }));
  }

  function commitScale(value = draftScale) {
    const nextScale = roundTwo(clamp(value, 1, 5));
    setDraftScale(nextScale);
    finishPreviewScrub();
    if (nextScale === roundTwo(marker.scale ?? 1)) return;
    onChange((current) => ({ ...current, scale: nextScale }));
  }

  function updateDraftScale(value: string) {
    const nextScale = roundTwo(clamp(Number(value) || 1, 1, 5));
    setDraftScale(nextScale);
    onPreviewMarker?.((current) => ({ ...current, scale: nextScale }));
  }

  function updatePosition(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => ({
      ...current,
      position: {
        ...(current.position ?? { x: 0, y: 0 }),
        [key]: Math.round(numeric),
      },
    }));
  }

  function previewPosition(key: keyof Point, value: number) {
    const nextPosition = {
      ...(marker.position ?? { x: 0, y: 0 }),
      [key]: Math.round(value),
    };
    if (pickingPosition)
      onPreviewPickPoint?.(cameraTranslationToFramePoint(nextPosition));
    onPreviewMarker?.((current) => ({
      ...current,
      position: {
        ...(current.position ?? { x: 0, y: 0 }),
        [key]: Math.round(value),
      },
    }));
  }

  function updateRotation(value: string) {
    onChange((current) => ({
      ...current,
      rotation: Math.round(Number(value) || 0),
    }));
  }

  function previewRotation(value: number) {
    onPreviewMarker?.((current) => ({
      ...current,
      rotation: Math.round(value),
    }));
  }

  function updatePerspective(key: "z" | "rotateX" | "rotateY", value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => {
      const perspective = {
        ...current.perspective,
        [key]: Math.round(numeric),
      };
      return {
        ...current,
        perspective,
        params: { ...current.params, perspective },
      };
    });
  }

  function previewPerspective(key: "z" | "rotateX" | "rotateY", value: number) {
    const perspective = { ...marker.perspective, [key]: Math.round(value) };
    onPreviewMarker?.((current) => ({ ...current, perspective }));
  }

  function updateFollowId(value: string) {
    const followId = value.trim();
    onChange((current) => ({ ...current, followId: followId || undefined }));
  }

  function updateEase(value: string) {
    onChange((current) => ({
      ...current,
      ease:
        value === defaultMotionEaseSelectValue
          ? undefined
          : (value as MotionEase),
    }));
  }

  function updateMiddleEase(value: string) {
    onChangeMiddleEase(
      value === defaultMotionEaseSelectValue
        ? undefined
        : (value as MotionEase),
    );
  }

  function middleTransitionButtonClass(active: boolean) {
    return `rounded-[9px] border px-3 py-2 text-xs font-bold transition ${active ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#dfe2ea] hover:border-[#37d6c2] hover:bg-[#20232c]"}`;
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Name
        <Input
          value={marker.name ?? ""}
          placeholder={defaultName}
          disabled={isMultiSelection}
          title={
            isMultiSelection
              ? "Rename one selected marker at a time."
              : undefined
          }
          onChange={(event) => updateName(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Start
          <Input
            type="number"
            min={0}
            max={part.duration - marker.duration}
            resetValue={0}
            step={0.1}
            value={marker.start}
            onChange={(event) => updateNumber("start", event.target.value)}
          />
        </label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Duration
          <Input
            type="number"
            min={minimumZoomDuration}
            max={part.duration - marker.start}
            resetValue={1}
            step={0.1}
            value={marker.duration}
            onChange={(event) => updateNumber("duration", event.target.value)}
          />
        </label>
        {markerKind === "rotate" ? (
          <label className={`grid gap-1.5 ${mutedCaps}`}>
            Rotation
            <Input
              type="number"
              numberScrubMode="preview"
              numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
              resetValue={15}
              step={1}
              value={marker.rotation ?? 0}
              onNumberScrubStart={onPreviewScrubStart}
              onNumberScrubPreview={(v) => previewRotation(v)}
              onNumberScrubEnd={finishPreviewScrub}
              onChange={(event) => updateRotation(event.target.value)}
            />
          </label>
        ) : markerKind === "perspective" ? (
          <>
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Z
              <Input
                type="number"
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
                resetValue={0}
                step={1}
                value={marker.perspective?.z ?? 0}
                onNumberScrubStart={onPreviewScrubStart}
                onNumberScrubPreview={(v) => previewPerspective("z", v)}
                onNumberScrubEnd={finishPreviewScrub}
                onChange={(event) => updatePerspective("z", event.target.value)}
              />
            </label>
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Tilt X
              <Input
                type="number"
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
                resetValue={8}
                step={1}
                value={marker.perspective?.rotateX ?? 0}
                onNumberScrubStart={onPreviewScrubStart}
                onNumberScrubPreview={(v) => previewPerspective("rotateX", v)}
                onNumberScrubEnd={finishPreviewScrub}
                onChange={(event) =>
                  updatePerspective("rotateX", event.target.value)
                }
              />
            </label>
          </>
        ) : null}
      </div>
      {markerKind === "zoom" ? (
        <Coordinate2DField
          label="Focus"
          pickLabel="Pick focus from frame"
          picking={pickingFocus}
          x={{
            max: FRAME_WIDTH,
            min: 0,
            numberScrubMode: "preview",
            onChange: (value) => updateFocus("x", value),
            onNumberScrubEnd: finishPreviewScrub,
            onNumberScrubPreview: (value) => previewFocus("x", value),
            onNumberScrubStart: onPreviewScrubStart,
            resetValue: FRAME_WIDTH / 2,
            step: 1,
            value: marker.focus?.x ?? FRAME_WIDTH / 2,
          }}
          y={{
            max: FRAME_HEIGHT,
            min: 0,
            numberScrubMode: "preview",
            onChange: (value) => updateFocus("y", value),
            onNumberScrubEnd: finishPreviewScrub,
            onNumberScrubPreview: (value) => previewFocus("y", value),
            onNumberScrubStart: onPreviewScrubStart,
            resetValue: FRAME_HEIGHT / 2,
            step: 1,
            value: marker.focus?.y ?? FRAME_HEIGHT / 2,
          }}
          onPick={onPickFocus}
        />
      ) : null}
      {markerKind === "pan" ? (
        <Coordinate2DField
          disabledReason={positionDisabledReason}
          label="Position"
          pickLabel={positionDisabledReason ?? "Pick pan target from frame"}
          picking={pickingPosition}
          x={{
            disabled: Boolean(positionDisabledReason),
            numberScrubMode: "preview",
            onChange: (value) => updatePosition("x", value),
            onNumberScrubEnd: finishPreviewScrub,
            onNumberScrubPreview: (value) => previewPosition("x", value),
            onNumberScrubStart: onPreviewScrubStart,
            resetValue: 0,
            step: 1,
            value: marker.position?.x ?? 0,
          }}
          y={{
            disabled: Boolean(positionDisabledReason),
            numberScrubMode: "preview",
            onChange: (value) => updatePosition("y", value),
            onNumberScrubEnd: finishPreviewScrub,
            onNumberScrubPreview: (value) => previewPosition("y", value),
            onNumberScrubStart: onPreviewScrubStart,
            resetValue: 0,
            step: 1,
            value: marker.position?.y ?? 0,
          }}
          onPick={onPickPosition}
        />
      ) : null}
      {markerKind === "zoom" ? (
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Scale
          <div className="grid grid-cols-[1fr_52px] items-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-2.5 py-2">
            <input
              aria-label="Zoom scale"
              className="h-1.5 min-w-0 accent-[#37d6c2] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#37d6c2] [&::-webkit-slider-thumb]:bg-[var(--clipper-accent)] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#37d6c2] [&::-moz-range-thumb]:bg-[var(--clipper-accent)]"
              type="range"
              min={1}
              max={5}
              step={0.01}
              value={draftScale}
              onChange={(event) => updateDraftScale(event.target.value)}
              onPointerDown={onPreviewScrubStart}
              onPointerUp={() => commitScale()}
              onKeyDown={onPreviewScrubStart}
              onKeyUp={() => commitScale()}
              onBlur={() => commitScale()}
            />
            <span className="text-right text-xs font-extrabold text-[#dfe2ea] tabular-nums">
              {draftScale.toFixed(2)}
            </span>
          </div>
        </label>
      ) : null}
      {markerKind === "perspective" ? (
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Tilt Y
          <Input
            type="number"
            numberScrubMode="preview"
            numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
            resetValue={0}
            step={1}
            value={marker.perspective?.rotateY ?? 0}
            onNumberScrubStart={onPreviewScrubStart}
            onNumberScrubPreview={(v) => previewPerspective("rotateY", v)}
            onNumberScrubEnd={finishPreviewScrub}
            onChange={(event) =>
              updatePerspective("rotateY", event.target.value)
            }
          />
        </label>
      ) : null}
      {markerKind === "pan" ? (
        <label className={`grid gap-1.5 ${mutedCaps}`}>
          Tracker
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input
              value={marker.followId ?? ""}
              placeholder="object-id"
              onChange={(event) => updateFollowId(event.target.value)}
            />
            <PickButton
              active={pickingTracker}
              label="Pick tracker target from frame"
              onClick={onPickTracker}
            />
          </div>
        </label>
      ) : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Ease
        <Select
          value={motionEaseSelectValue(marker.ease)}
          onValueChange={updateEase}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <TooltipProvider delayDuration={1000} skipDelayDuration={0}>
              <SelectGroup>
                <EaseSelectItems defaultInOut />
              </SelectGroup>
            </TooltipProvider>
          </SelectContent>
        </Select>
      </label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={snapButtonClass(selectedSnapInActive, true)}
            aria-pressed={selectedSnapInActive}
            onClick={() =>
              onChangeSelectedSnap("snapIn", !selectedSnapInActive)
            }
          >
            Snap in
          </button>
          <button
            className={snapButtonClass(selectedSnapOutActive, true)}
            aria-pressed={selectedSnapOutActive}
            onClick={() =>
              onChangeSelectedSnap("snapOut", !selectedSnapOutActive)
            }
          >
            Snap out
          </button>
        </div>
        {canSnapMiddle || middleSnapActive ? (
          <div className="grid gap-2">
            <button
              className={snapButtonClass(middleSnapActive, canSnapMiddle)}
              disabled={!canSnapMiddle && !middleSnapActive}
              title={
                middleSnapActive
                  ? "Unmend the neighboring edges"
                  : "Mend the neighboring edges"
              }
              aria-pressed={middleSnapActive}
              onClick={onSnapMiddle}
            >
              {middleSnapActive ? "Unmend" : "Mend"}
            </button>
          </div>
        ) : null}
        {middleSnapActive ? (
          <div className="grid gap-1.5">
            <span className={mutedCaps}>Mend handoff</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={middleTransitionButtonClass(
                  middleTransitionMode === "instant",
                )}
                aria-pressed={middleTransitionMode === "instant"}
                onClick={() => onChangeMiddleTransition("instant")}
              >
                Instant
              </button>
              <button
                className={middleTransitionButtonClass(
                  middleTransitionMode === "transition",
                )}
                aria-pressed={middleTransitionMode === "transition"}
                onClick={() => onChangeMiddleTransition("transition")}
              >
                Transition
              </button>
            </div>
            {middleTransitionMode === "transition" ? (
              <label className={`grid gap-1.5 ${mutedCaps}`}>
                Mend ease
                <Select
                  value={motionEaseSelectValue(middleEase)}
                  onValueChange={updateMiddleEase}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <TooltipProvider delayDuration={1000} skipDelayDuration={0}>
                      <SelectGroup>
                        <EaseSelectItems includeLinear={false} defaultInOut />
                      </SelectGroup>
                    </TooltipProvider>
                  </SelectContent>
                </Select>
              </label>
            ) : null}
            {middleTransitionMode === "transition" ? (
              <MendVisualSection
                marker={marker}
                effectId={effectId}
                onChange={onChange}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]"
        onClick={onDelete}
      >
        <Trash2 size={15} />
        Delete
      </button>
    </div>
  );
}

// ── Mend visual helper ─────────────────────────────────────────────

function MendVisualSection({
  marker,
  effectId,
  onChange,
}: {
  marker: MotionMarker;
  effectId: string;
  onChange: (
    updater: (marker: MotionMarker, part: Part) => MotionMarker,
  ) => void;
}) {
  const mendOptions = getMotionEffectPackage(effectId)?.mendTransitionOptions;
  if (!mendOptions || mendOptions.length === 0) return null;

  const params = (marker.params ?? {}) as Record<string, unknown>;
  const selectedKey = (params.mendVisual as string | undefined) ?? "none";
  const selectedOption = mendOptions.find((opt) => opt.key === selectedKey);

  function setMendVisual(key: string) {
    onChange((current) => {
      const option = mendOptions!.find((opt) => opt.key === key);
      const nextParams = { ...current.params } as Record<string, unknown>;
      if (option) {
        nextParams.mendVisual = key;
        for (const [paramKey, value] of Object.entries(option.defaultParams)) {
          if (nextParams[paramKey] === undefined) nextParams[paramKey] = value;
        }
      } else {
        delete nextParams.mendVisual;
        for (const opt of mendOptions!) {
          for (const control of opt.paramControls) {
            delete nextParams[control.key];
          }
        }
      }
      return { ...current, params: nextParams };
    });
  }

  function updateParamValue(
    control: MotionMendTransitionOption["paramControls"][number],
    value: string,
  ) {
    onChange((current) => {
      const numeric = control.type === "number" ? Number(value) || 0 : value;
      const nextParams = {
        ...current.params,
        [control.key]: control.type === "number" ? numeric : value,
      } as Record<string, unknown>;
      return { ...current, params: nextParams };
    });
  }

  function getParamValue(
    control: MotionMendTransitionOption["paramControls"][number],
  ) {
    const raw = (params as Record<string, unknown>)[control.key];
    return String(raw ?? control.defaultValue);
  }

  return (
    <div className="grid gap-1.5">
      <span className={mutedCaps}>Mend visual</span>
      <Select value={selectedKey} onValueChange={setMendVisual}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {mendOptions.map((opt) => (
            <SelectItem key={opt.key} value={opt.key}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectedOption
        ? selectedOption.paramControls.map((control) => (
            <label className={`grid gap-1.5 ${mutedCaps}`} key={control.key}>
              {control.label}
              {control.type === "number" ? (
                <Input
                  type="number"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={getParamValue(control)}
                  resetValue={control.defaultValue}
                  numberScrubMode="continuous"
                  numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
                  onChange={(event) =>
                    updateParamValue(control, event.target.value)
                  }
                />
              ) : (
                <Select
                  value={getParamValue(control)}
                  onValueChange={(value) => updateParamValue(control, value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {control.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </label>
          ))
        : null}
    </div>
  );
}
