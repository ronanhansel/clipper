import { ChevronDown, Trash2 } from "lucide-react";
import { useState } from "react";
import { mutedCaps } from "../../../app/config";
import type {
  FrameObject,
  LayerAnimation,
  MotionEase,
} from "../../../core/types";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { TooltipProvider } from "../../ui/tooltip";
import {
  EaseSelectItems,
  motionEaseSelectValue,
} from "../../timeline/EaseSelectItems";

const TEXT_ANIMATOR_PROPERTIES = [
  { key: "opacity", label: "Opacity", unit: "" },
  { key: "x", label: "Position X", unit: "px" },
  { key: "y", label: "Position Y", unit: "px" },
  { key: "scale", label: "Scale", unit: "" },
  { key: "rotate", label: "Rotation", unit: "deg" },
  { key: "blur", label: "Blur", unit: "px" },
] as const;

type TextAnimatorPropertyKey = (typeof TEXT_ANIMATOR_PROPERTIES)[number]["key"];

const TEXT_ANIMATOR_DEFAULT_FROM: Record<TextAnimatorPropertyKey, number> = {
  opacity: 0,
  x: 0,
  y: 40,
  scale: 0.85,
  rotate: 0,
  blur: 0,
};

const TEXT_ANIMATOR_DEFAULT_TO: Record<TextAnimatorPropertyKey, number> = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
  blur: 0,
};

const TEXT_ANIMATOR_SPLIT_MODES = [
  { value: "character", label: "Character" },
  { value: "word", label: "Word" },
  { value: "line", label: "Line" },
] as const;

const TEXT_ANIMATOR_ORDERS = [
  { value: "forward", label: "Forward" },
  { value: "reverse", label: "Reverse" },
  { value: "center", label: "Center" },
  { value: "random", label: "Random" },
] as const;

const TEXT_ANIMATOR_SHAPES = [
  { value: "square", label: "Square" },
  { value: "rampUp", label: "Ramp up" },
  { value: "rampDown", label: "Ramp down" },
  { value: "triangle", label: "Triangle" },
  { value: "round", label: "Round" },
  { value: "smooth", label: "Smooth" },
] as const;

const TEXT_ANIMATOR_ANCHORS = [
  { value: "token", label: "Token" },
  { value: "word", label: "Word" },
  { value: "line", label: "Line" },
  { value: "all", label: "Whole" },
] as const;

export function VerticalAlignIcon({
  align,
}: {
  align: "top" | "middle" | "bottom";
}) {
  if (align === "top") {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 20 20"
      >
        <path
          d="M4 3.5h12M10 16V7M6.5 10.5 10 7l3.5 3.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  if (align === "bottom") {
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 20 20"
      >
        <path
          d="M4 16.5h12M10 4v9M6.5 9.5 10 13l3.5-3.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
      <path
        d="M5 10h10M10 3.5v4M7.7 5.8 10 8.1l2.3-2.3M10 16.5v-4M7.7 14.2l2.3-2.3 2.3 2.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function TextBoxLayoutIcon({
  mode,
}: {
  mode: "overflow" | "auto-height" | "fixed";
}) {
  if (mode === "overflow")
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 20 20"
      >
        <path
          d="M4 5.5h7M4 10h7M4 14.5h7M11 10h5M13.7 7.3 16.4 10l-2.7 2.7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  if (mode === "auto-height")
    return (
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 20 20"
      >
        <path
          d="M4 5.5h8M4 10h8M4 14.5h8M15 3.8v12.4M12.8 6l2.2-2.2L17.2 6M12.8 14l2.2 2.2 2.2-2.2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    );
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 20 20">
      <rect
        x="4"
        y="4"
        width="12"
        height="12"
        rx="1.8"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M7 8h6M7 12h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function TextAnimatorsSection({
  object,
  onChange,
}: {
  object: FrameObject;
  onChange: (updater: (object: FrameObject) => FrameObject) => void;
}) {
  const animators = (object.animations ?? []).filter(
    (animation) => animation.options.split,
  );
  // Only mount the (heavy) animator cards on demand. They contain ~25 inputs
  // and 6 Selects each, so eagerly mounting them at inspector-open time was
  // the dominant text-object lag source.
  const [expanded, setExpanded] = useState(animators.length > 0);

  function updateAnimators(
    updater: (animators: LayerAnimation[]) => LayerAnimation[],
  ) {
    onChange((current) => {
      const all = current.animations ?? [];
      const splits = all.filter((animation) => animation.options.split);
      const others = all.filter((animation) => !animation.options.split);
      const next = updater(splits);
      const merged = [...others, ...next];
      return { ...current, animations: merged.length > 0 ? merged : undefined };
    });
  }

  function addAnimator() {
    setExpanded(true);
    updateAnimators((current) => [
      ...current,
      createDefaultTextAnimator(current.length + 1),
    ]);
  }

  function removeAnimator(id: string) {
    updateAnimators((current) =>
      current.filter((animator) => animator.id !== id),
    );
  }

  function updateAnimator(
    id: string,
    updater: (animator: LayerAnimation) => LayerAnimation,
  ) {
    updateAnimators((current) =>
      current.map((animator) =>
        animator.id === id ? updater(animator) : animator,
      ),
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className={`flex flex-1 items-center gap-1.5 ${mutedCaps}`}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown
            className={`h-3 w-3 transition ${expanded ? "" : "-rotate-90"}`}
          />
          <span>Text Animators ({animators.length})</span>
        </button>
        <button
          type="button"
          className="rounded-[8px] border border-[#2d313b] bg-[#171920] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c]"
          onClick={addAnimator}
        >
          Add
        </button>
      </div>
      {expanded ? (
        animators.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[#2d313b] bg-[#13151c] px-3 py-2.5 text-[11px] leading-relaxed text-[#a7adbb]">
            No animators yet. Animate characters, words, or lines.
          </p>
        ) : (
          animators.map((animator) => (
            <TextAnimatorCard
              key={animator.id}
              animator={animator}
              onChange={(updater) => updateAnimator(animator.id, updater)}
              onRemove={() => removeAnimator(animator.id)}
            />
          ))
        )
      ) : null}
    </div>
  );
}

function TextAnimatorCard({
  animator,
  onChange,
  onRemove,
}: {
  animator: LayerAnimation;
  onChange: (updater: (animator: LayerAnimation) => LayerAnimation) => void;
  onRemove: () => void;
}) {
  const split = animator.options.split ?? { mode: "character" };
  const enabled = animator.enabled !== false;
  const enabledProperties = new Set<TextAnimatorPropertyKey>(
    animator.tracks
      .map((track) => track.property)
      .filter((property): property is TextAnimatorPropertyKey =>
        TEXT_ANIMATOR_PROPERTIES.some((entry) => entry.key === property),
      ),
  );

  function setEnabled(next: boolean) {
    onChange((current) => ({ ...current, enabled: next }));
  }

  function setName(value: string) {
    onChange((current) => ({ ...current, name: value }));
  }

  function setOptions(
    updater: (options: LayerAnimation["options"]) => LayerAnimation["options"],
  ) {
    onChange((current) => ({
      ...current,
      options: updater(current.options),
    }));
  }

  function setSplit(
    updater: (
      split: NonNullable<LayerAnimation["options"]["split"]>,
    ) => NonNullable<LayerAnimation["options"]["split"]>,
  ) {
    setOptions((current) => ({
      ...current,
      split: updater(current.split ?? { mode: "character" }),
    }));
  }

  function toggleProperty(key: TextAnimatorPropertyKey, next: boolean) {
    onChange((current) => {
      const filtered = current.tracks.filter((track) => track.property !== key);
      if (!next) return { ...current, tracks: filtered };
      const delay = current.options.delay ?? 0;
      const duration = current.options.duration;
      return {
        ...current,
        tracks: [
          ...filtered,
          {
            property: key,
            valueType: "number",
            points: [
              {
                id: `from-${key}`,
                time: delay,
                value: TEXT_ANIMATOR_DEFAULT_FROM[key],
              },
              {
                id: `to-${key}`,
                time: delay + duration,
                value: TEXT_ANIMATOR_DEFAULT_TO[key],
              },
            ],
          },
        ],
      };
    });
  }

  function setPropertyValue(
    key: TextAnimatorPropertyKey,
    end: "from" | "to",
    value: number,
  ) {
    onChange((current) => {
      const tracks = current.tracks.map((track) => {
        if (track.property !== key) return track;
        const points = [...track.points].sort((a, b) => a.time - b.time);
        const target = end === "from" ? points[0] : points[points.length - 1];
        if (!target) return track;
        target.value = value;
        return { ...track, points };
      });
      return { ...current, tracks };
    });
  }

  function shiftTrackTimes(delay: number, duration: number) {
    onChange((current) => ({
      ...current,
      tracks: current.tracks.map((track) => {
        if (track.points.length < 2) return track;
        const sorted = [...track.points].sort((a, b) => a.time - b.time);
        const first = { ...sorted[0], time: delay };
        const last = {
          ...sorted[sorted.length - 1],
          time: delay + duration,
        };
        return { ...track, points: [first, last] };
      }),
    }));
  }

  return (
    <div className="grid gap-2 rounded-[10px] border border-[#2d313b] bg-[#13151c] p-2.5">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
        />
        <Input
          className="h-[30px] flex-1 rounded-[8px] px-2 text-[11px] font-bold"
          value={animator.name ?? ""}
          placeholder={`Animator ${animator.id.slice(0, 4)}`}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          aria-label="Remove animator"
          className="grid h-[30px] w-[30px] place-items-center rounded-[8px] border border-[#3b2a2a] bg-[#231516] text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1 ${mutedCaps}`}>
          Split
          <Select
            value={split.mode}
            onValueChange={(value) =>
              setSplit((current) => ({
                ...current,
                mode: value as "character" | "word" | "line",
              }))
            }
          >
            <SelectTrigger className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold text-[#dfe2ea]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TEXT_ANIMATOR_SPLIT_MODES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        <label className={`grid gap-1 ${mutedCaps}`}>
          Order
          <Select
            value={split.order ?? "forward"}
            onValueChange={(value) =>
              setSplit((current) => ({
                ...current,
                order: value as "forward" | "reverse" | "center" | "random",
              }))
            }
          >
            <SelectTrigger className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold text-[#dfe2ea]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TEXT_ANIMATOR_ORDERS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
      </div>

      {split.order === "random" ? (
        <label className={`grid gap-1 ${mutedCaps}`}>
          Seed
          <Input
            className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold"
            type="number"
            step={1}
            value={split.seed ?? 1}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isFinite(next)) return;
              setSplit((current) => ({
                ...current,
                seed: Math.max(1, Math.floor(next)),
              }));
            }}
          />
        </label>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <label className={`grid gap-1 ${mutedCaps}`}>
          Delay
          <Input
            className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold"
            type="number"
            step={0.05}
            value={animator.options.delay ?? 0}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              const next = Math.max(0, value);
              setOptions((current) => ({ ...current, delay: next }));
              shiftTrackTimes(next, animator.options.duration);
            }}
          />
        </label>
        <label className={`grid gap-1 ${mutedCaps}`}>
          Duration
          <Input
            className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold"
            type="number"
            step={0.05}
            min={0.05}
            value={animator.options.duration}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              const next = Math.max(0.05, value);
              setOptions((current) => ({ ...current, duration: next }));
              shiftTrackTimes(animator.options.delay ?? 0, next);
            }}
          />
        </label>
        <label className={`grid gap-1 ${mutedCaps}`}>
          Stagger
          <Input
            className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold"
            type="number"
            step={0.01}
            value={split.stagger ?? 0}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              setSplit((current) => ({
                ...current,
                stagger: Math.max(0, value),
              }));
            }}
          />
        </label>
      </div>

      <label className={`grid gap-1 ${mutedCaps}`}>
        Ease
        <Select
          value={motionEaseSelectValue(
            typeof animator.options.ease === "string"
              ? animator.options.ease
              : undefined,
          )}
          onValueChange={(value) => {
            const ease = value === "linear" ? "linear" : (value as MotionEase);
            setOptions((current) => ({ ...current, ease }));
          }}
        >
          <SelectTrigger className="h-[34px] rounded-[8px] px-2 text-[11px] font-bold text-[#dfe2ea]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <TooltipProvider delayDuration={1000} skipDelayDuration={0}>
                <EaseSelectItems />
              </TooltipProvider>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>

      <div className="grid gap-2 rounded-[8px] border border-[#23262d] bg-[#0f1116] p-2">
        <span className={mutedCaps}>Range Selector</span>
        <div className="grid grid-cols-3 gap-2">
          <label className={`grid gap-1 ${mutedCaps}`}>
            Start
            <Input
              className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={split.start ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setSplit((current) => ({
                  ...current,
                  start: Math.min(1, Math.max(0, value)),
                }));
              }}
            />
          </label>
          <label className={`grid gap-1 ${mutedCaps}`}>
            End
            <Input
              className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={split.end ?? 1}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setSplit((current) => ({
                  ...current,
                  end: Math.min(1, Math.max(0, value)),
                }));
              }}
            />
          </label>
          <label className={`grid gap-1 ${mutedCaps}`}>
            Offset
            <Input
              className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold"
              type="number"
              step={0.05}
              value={split.offset ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setSplit((current) => ({ ...current, offset: value }));
              }}
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className={`grid gap-1 ${mutedCaps}`}>
            Shape
            <Select
              value={split.shape ?? "square"}
              onValueChange={(value) =>
                setSplit((current) => ({
                  ...current,
                  shape: value as
                    | "square"
                    | "rampUp"
                    | "rampDown"
                    | "triangle"
                    | "round"
                    | "smooth",
                }))
              }
            >
              <SelectTrigger className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold text-[#dfe2ea]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TEXT_ANIMATOR_SHAPES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className={`grid gap-1 ${mutedCaps}`}>
            Ease High
            <Input
              className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={split.easeHigh ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setSplit((current) => ({
                  ...current,
                  easeHigh: Math.min(1, Math.max(0, value)),
                }));
              }}
            />
          </label>
          <label className={`grid gap-1 ${mutedCaps}`}>
            Ease Low
            <Input
              className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={split.easeLow ?? 0}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                setSplit((current) => ({
                  ...current,
                  easeLow: Math.min(1, Math.max(0, value)),
                }));
              }}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={`grid gap-1 ${mutedCaps}`}>
            Anchor
            <Select
              value={split.anchor ?? "token"}
              onValueChange={(value) =>
                setSplit((current) => ({
                  ...current,
                  anchor: value as "token" | "word" | "line" | "all",
                }))
              }
            >
              <SelectTrigger className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold text-[#dfe2ea]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {TEXT_ANIMATOR_ANCHORS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
          <label className={`grid gap-1 ${mutedCaps}`}>
            Repeat scope
            <Select
              value={split.repeatScope ?? "sequence"}
              onValueChange={(value) =>
                setSplit((current) => ({
                  ...current,
                  repeatScope: value as "sequence" | "item",
                }))
              }
            >
              <SelectTrigger className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold text-[#dfe2ea]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="sequence">Sequence</SelectItem>
                  <SelectItem value="item">Item</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>

      <div className="grid gap-2 rounded-[8px] border border-[#23262d] bg-[#0f1116] p-2">
        <span className={mutedCaps}>Properties</span>
        {TEXT_ANIMATOR_PROPERTIES.map((property) => {
          const active = enabledProperties.has(property.key);
          const track = animator.tracks.find(
            (track) => track.property === property.key,
          );
          const sortedPoints = track
            ? [...track.points].sort((a, b) => a.time - b.time)
            : [];
          const fromValue =
            typeof sortedPoints[0]?.value === "number"
              ? (sortedPoints[0].value as number)
              : TEXT_ANIMATOR_DEFAULT_FROM[property.key];
          const toValue =
            typeof sortedPoints[sortedPoints.length - 1]?.value === "number"
              ? (sortedPoints[sortedPoints.length - 1].value as number)
              : TEXT_ANIMATOR_DEFAULT_TO[property.key];
          return (
            <div
              key={property.key}
              className="grid grid-cols-[auto_1fr_1fr] items-center gap-2"
            >
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#a7adbb]">
                <Checkbox
                  checked={active}
                  onCheckedChange={(checked) =>
                    toggleProperty(property.key, Boolean(checked))
                  }
                />
                <span>{property.label}</span>
              </label>
              <Input
                className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold disabled:opacity-40"
                type="number"
                step={
                  property.key === "scale" || property.key === "opacity"
                    ? 0.05
                    : 1
                }
                disabled={!active}
                value={fromValue}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setPropertyValue(property.key, "from", value);
                }}
                placeholder="From"
              />
              <Input
                className="h-[30px] rounded-[8px] px-2 text-[11px] font-bold disabled:opacity-40"
                type="number"
                step={
                  property.key === "scale" || property.key === "opacity"
                    ? 0.05
                    : 1
                }
                disabled={!active}
                value={toValue}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) return;
                  setPropertyValue(property.key, "to", value);
                }}
                placeholder="To"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function createDefaultTextAnimator(index: number): LayerAnimation {
  const id = `text-animator-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
  return {
    id,
    name: `Animator ${index}`,
    enabled: true,
    target: "self",
    tracks: [
      {
        property: "y",
        valueType: "number",
        points: [
          { id: `${id}:y:from`, time: 0, value: 40 },
          { id: `${id}:y:to`, time: 0.6, value: 0 },
        ],
      },
      {
        property: "opacity",
        valueType: "number",
        points: [
          { id: `${id}:o:from`, time: 0, value: 0 },
          { id: `${id}:o:to`, time: 0.6, value: 1 },
        ],
      },
    ],
    options: {
      duration: 0.6,
      delay: 0,
      ease: "easeOut",
      split: {
        mode: "character",
        stagger: 0.05,
        order: "forward",
      },
    },
  };
}
