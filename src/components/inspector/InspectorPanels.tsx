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
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import {
  ColorSelector,
  formatStyleLabel,
  getEditableColorStyleEntries,
  isHexColor,
} from "../ColorSelector";
import { clipperHost } from "../../app/clipperHost";
import { Coordinate2DField, PickButton } from "./Coordinate2DField";
import { EffectControls } from "./EffectControls";
import type {
  GraphParameterEditorField,
  GraphParameterEditorSchema,
} from "../timeline/GraphParameterEditor";
import {
  buildComposition3dGraphNodes,
  getGraphNodeParameterEditorSchema,
} from "../timeline/ComposeAnimationGraphPanel";

const defaultFontFamily =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const defaultFontOption = { value: defaultFontFamily, label: "System" };
const defaultMotionEaseSelectValue = "default";
const easePreviewHoverDelayMs = 600;
const easePreviewSkipDelayMs = 900;
const easePreviewDuration = "1.45s";
const easePreviewItems = [
  {
    value: defaultMotionEaseSelectValue,
    label: "Ease in-out",
    ease: "easeInOut" as const,
  },
  { value: "linear", label: "Linear", ease: "linear" as const },
  { value: "easeIn", label: "Ease in", ease: "easeIn" as const },
  { value: "easeOut", label: "Ease out", ease: "easeOut" as const },
  { value: "circOut", label: "Circ out", ease: "circOut" as const },
  { value: "backOut", label: "Back out", ease: "backOut" as const },
];
const explicitEasePreviewItems = easePreviewItems.map((item) =>
  item.ease === "easeInOut" ? { ...item, value: "easeInOut" } : item,
);

let lastEasePreviewOpenTime = 0;

type FontOption = { value: string; label: string };

let cachedSystemFontOptions: FontOption[] | null = null;
let systemFontOptionsRequest: Promise<FontOption[]> | null = null;

function loadSystemFontOptions() {
  if (cachedSystemFontOptions) return Promise.resolve(cachedSystemFontOptions);
  systemFontOptionsRequest ??= clipperHost
    .listSystemFonts()
    .then((fonts) => fonts.map((font) => ({ value: font, label: font })))
    .catch((error) => {
      console.warn("Unable to load system fonts.", error);
      return [];
    });
  return systemFontOptionsRequest.then((options) => {
    cachedSystemFontOptions = options;
    return options;
  });
}

function formatFontValueLabel(value: string) {
  if (value === defaultFontFamily) return defaultFontOption.label;
  return (
    value
      .split(",")[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, "") || value
  );
}

function motionEaseSelectValue(ease: MotionEase | undefined, explicit = false) {
  if (explicit) return ease ?? "";
  return ease && ease !== "easeInOut" ? ease : defaultMotionEaseSelectValue;
}

function easePreviewProgress(value: number, ease: MotionEase) {
  if (ease === "easeOut" || ease === "circOut")
    return 1 - Math.pow(1 - value, 3);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut")
    return value < 0.5
      ? 4 * value * value * value
      : 1 - Math.pow(-2 * value + 2, 3) / 2;
  if (ease === "backOut")
    return (
      1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
    );
  return value;
}

function easePreviewPath(ease: MotionEase) {
  const width = 132;
  const height = 72;
  const segments = 96;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const x = index / segments;
    const y = 1 - easePreviewProgress(x, ease);
    return `${index === 0 ? "M" : "L"} ${(x * width).toFixed(2)} ${(y * height).toFixed(2)}`;
  }).join(" ");
}

function easePreviewSampleValues(
  ease: MotionEase,
  map: (time: number, progress: number) => number,
) {
  const segments = 80;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const time = index / segments;
    return map(time, easePreviewProgress(time, ease)).toFixed(2);
  }).join(";");
}

function easePreviewKeyTimes() {
  const segments = 80;
  return Array.from({ length: segments + 1 }, (_, index) =>
    (index / segments).toFixed(3),
  ).join(";");
}

function EaseSelectItem({
  value,
  label,
  ease,
}: {
  value: string;
  label: string;
  ease: MotionEase;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const path = easePreviewPath(ease);
  const graphKeyTimes = easePreviewKeyTimes();
  const graphXValues = easePreviewSampleValues(ease, (time) => time * 132);
  const graphYValues = easePreviewSampleValues(
    ease,
    (_time, progress) => (1 - progress) * 72,
  );
  const railXValues = easePreviewSampleValues(
    ease,
    (_time, progress) => 6 + progress * 142,
  );

  function clearPreviewTimer() {
    if (!previewTimerRef.current) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }

  function openPreviewAfterDelay() {
    clearPreviewTimer();
    if (Date.now() - lastEasePreviewOpenTime <= easePreviewSkipDelayMs) {
      setPreviewOpen(true);
      lastEasePreviewOpenTime = Date.now();
      return;
    }

    previewTimerRef.current = setTimeout(() => {
      setPreviewOpen(true);
      lastEasePreviewOpenTime = Date.now();
      previewTimerRef.current = null;
    }, easePreviewHoverDelayMs);
  }

  function closePreview() {
    clearPreviewTimer();
    setPreviewOpen(false);
  }

  useEffect(() => closePreview, []);

  return (
    <Tooltip open={previewOpen}>
      <TooltipTrigger asChild>
        <SelectItem
          value={value}
          onPointerEnter={openPreviewAfterDelay}
          onPointerLeave={closePreview}
          onPointerDown={closePreview}
        >
          {label}
        </SelectItem>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        sideOffset={16}
        className="w-[190px] max-w-none overflow-hidden rounded-[8px] border-[#343946] bg-[#10131a] p-0 shadow-[0_22px_70px_rgba(0,0,0,0.54)] data-[state=instant-open]:animate-[clipper-tooltip-in_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
      >
        <div className="border-b border-[#252a35] bg-[radial-gradient(circle_at_72%_0%,rgb(var(--clipper-accent-rgb)/0.18),transparent_42%),linear-gradient(180deg,#171b24,#10131a)] px-3 py-2">
          <strong className="block text-[11px] font-extrabold text-white">
            {label}
          </strong>
          <span className="mt-0.5 block text-[10px] font-medium text-[#8d94a3]">
            Timing preview
          </span>
        </div>
        <div className="grid gap-3 px-3 py-3">
          <svg
            viewBox="0 0 132 72"
            className="h-[82px] w-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d="M 0 72 L 132 0"
              stroke="#2d3340"
              strokeDasharray="3 5"
              strokeWidth="1.2"
            />
            <path
              d="M 0 72 L 0 0 M 0 72 L 132 72"
              stroke="#3a404c"
              strokeWidth="1"
            />
            <path
              d={path}
              fill="none"
              stroke="var(--clipper-accent)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <circle
              r="4.5"
              fill="#37d6c2"
              filter="drop-shadow(0 0 8px rgba(55,214,194,0.75))"
            >
              <animate
                attributeName="cx"
                dur={easePreviewDuration}
                repeatCount="indefinite"
                keyTimes={graphKeyTimes}
                values={graphXValues}
              />
              <animate
                attributeName="cy"
                dur={easePreviewDuration}
                repeatCount="indefinite"
                keyTimes={graphKeyTimes}
                values={graphYValues}
              />
            </circle>
          </svg>
          <svg
            viewBox="0 0 154 12"
            className="h-3 w-full overflow-visible"
            aria-hidden="true"
          >
            <line
              x1="6"
              y1="6"
              x2="148"
              y2="6"
              stroke="#252a35"
              strokeLinecap="round"
              strokeWidth="4"
            />
            <circle
              cx="6"
              cy="6"
              r="6"
              fill="var(--clipper-accent)"
              filter="drop-shadow(0 0 10px rgb(var(--clipper-accent-rgb)/0.45))"
            >
              <animate
                attributeName="cx"
                dur={easePreviewDuration}
                repeatCount="indefinite"
                keyTimes={graphKeyTimes}
                values={railXValues}
              />
            </circle>
          </svg>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function EaseSelectItems({
  includeLinear = true,
  defaultInOut = false,
}: {
  includeLinear?: boolean;
  defaultInOut?: boolean;
}) {
  const items = defaultInOut ? easePreviewItems : explicitEasePreviewItems;
  return (
    <>
      {items
        .filter((item) => includeLinear || item.value !== "linear")
        .map((item) => (
          <EaseSelectItem key={item.value} {...item} />
        ))}
    </>
  );
}

export function FrameInspector({
  part,
  canSnapMiddle,
  onDurationChange,
  onFrameChange,
  onBackgroundChange,
  onPreviewFrame,
  onPreviewBackground,
  onRenderModeChange,
  onSnapMiddle,
}: {
  part: Part;
  canSnapMiddle: boolean;
  onDurationChange: (duration: number) => void;
  onFrameChange: (updater: (frame: PartFrame) => PartFrame) => void;
  onBackgroundChange: (
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) => void;
  onPreviewFrame?: (updater: (frame: PartFrame) => PartFrame) => void;
  onPreviewBackground?: (
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
  const backgroundStyleValue = String(part.background.style.background ?? "");
  const backgroundColorValue = isHexColor(backgroundStyleValue)
    ? backgroundStyleValue
    : "#000000";

  function updateDuration(value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    onDurationChange(
      roundTenth(clamp(numeric, minimumDuration, MAX_PART_DURATION_SECONDS)),
    );
  }

  function updateFrameBackground(value: string) {
    onFrameChange((frame) => ({
      ...frame,
      style: { ...frame.style, background: value },
    }));
  }

  function updateBackgroundColor(value: string) {
    onBackgroundChange((background) => ({
      ...background,
      style: { ...background.style, background: value },
    }));
  }

  function updateBackgroundStretch(checked: boolean) {
    onBackgroundChange((background) => ({
      ...background,
      stretchToElements: checked || undefined,
    }));
  }

  function updateBackgroundStyle(value: string) {
    try {
      const style = value.trim()
        ? (JSON.parse(value) as BackgroundLayer["style"])
        : {};
      onBackgroundChange((background) => ({ ...background, style }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
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
      <div className={`grid gap-1.5 ${mutedCaps}`}>
        <span>Frame color</span>
        <ColorSelector
          value={String(part.frame.style.background ?? "#000000")}
          onChange={updateFrameBackground}
          onPreview={(value) =>
            onPreviewFrame?.((frame) => ({
              ...frame,
              style: { ...frame.style, background: value },
            }))
          }
        />
      </div>
      <div className={`grid gap-1.5 ${mutedCaps}`}>
        <span>Background color</span>
        <ColorSelector
          value={backgroundColorValue}
          onChange={updateBackgroundColor}
          onPreview={(value) =>
            onPreviewBackground?.((background) => ({
              ...background,
              style: { ...background.style, background: value },
            }))
          }
        />
        {!isHexColor(backgroundStyleValue) && backgroundStyleValue ? (
          <small className="text-[11px] font-semibold normal-case tracking-normal text-[#8f96a3]">
            Current background is a custom style; picking a color replaces it.
          </small>
        ) : null}
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]">
        <Checkbox
          checked={Boolean(part.background.stretchToElements)}
          onCheckedChange={(checked) =>
            updateBackgroundStretch(checked === true)
          }
        />
        <span>Stretch background</span>
      </label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Background style JSON
        <Textarea
          className="min-h-[120px] resize-y font-mono"
          value={JSON.stringify(part.background.style, null, 2)}
          onChange={(event) => updateBackgroundStyle(event.target.value)}
        />
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
      <div className={panelCard}>
        <span>Constant Elements</span>
        <strong className="text-[13px]">
          {part.background.elements.length}
        </strong>
        <small className="text-[#9b9da7]">
          Edit these in the composition code as background.elements.
        </small>
      </div>
    </div>
  );
}

export function Composition3dNodeInspector({
  part,
  nodeId,
  onParameterChange,
}: {
  part: Part;
  nodeId: string;
  onParameterChange: (nodeId: string, key: string, value: string) => void;
}) {
  const node =
    buildComposition3dGraphNodes(part.composition3dGraph, 5200, 900).find(
      (item) => item.id === nodeId,
    ) ?? null;
  const schema = node
    ? getGraphNodeParameterEditorSchema(
        node,
        part.composition3dGraph?.parameters?.[node.id],
      )
    : null;
  if (!node) return <EmptyInspector />;
  return (
    <div className="grid gap-3">
      {schema ? (
        <Composition3dInspectorFields
          schema={schema}
          onChange={(key, value) => onParameterChange(node.id, key, value)}
        />
      ) : (
        <div className={`grid gap-1.5 ${mutedCaps}`}>
          No editable parameters.
        </div>
      )}
    </div>
  );
}

function Composition3dInspectorFields({
  schema,
  onChange,
}: {
  schema: GraphParameterEditorSchema;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {schema.groups.map((group) => (
        <div className="grid gap-2" key={group.id}>
          {group.label && group.id !== "composition3d" ? (
            <span className={mutedCaps}>{group.label}</span>
          ) : null}
          <div
            className={
              group.columns && group.columns > 1
                ? "grid grid-cols-2 gap-2"
                : "grid gap-3"
            }
          >
            {group.fields.map((field) => (
              <Composition3dInspectorField
                key={field.key}
                field={field}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Composition3dInspectorField({
  field,
  onChange,
}: {
  field: GraphParameterEditorField;
  onChange: (key: string, value: string) => void;
}) {
  if (field.options) {
    return (
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        {field.label}
        <Select
          value={field.value}
          onValueChange={(value) => onChange(field.key, value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
    );
  }

  return (
    <label className={`grid gap-1.5 ${mutedCaps}`}>
      {field.label}
      <Input
        type={field.type === "number" ? "number" : "text"}
        value={field.value}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
    </label>
  );
}

function FontSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [systemFontOptions, setSystemFontOptions] = useState<FontOption[]>(
    cachedSystemFontOptions ?? [],
  );
  const fontOptions = useMemo(() => {
    const merged = [defaultFontOption, ...systemFontOptions];
    if (value && !merged.some((option) => option.value === value)) {
      merged.splice(1, 0, { value, label: formatFontValueLabel(value) });
    }
    return merged;
  }, [systemFontOptions, value]);

  useEffect(() => {
    let active = true;
    void loadSystemFontOptions().then((options) => {
      if (active) setSystemFontOptions(options);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <label className={`grid gap-1.5 ${mutedCaps}`}>
      Font
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {fontOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

export const ObjectInspector = memo(function ObjectInspector({
  object,
  onChange,
  onPreview,
}: {
  object: FrameObject;
  onChange: (updater: (object: FrameObject) => FrameObject) => void;
  onPreview?: (updater: (object: FrameObject) => FrameObject) => void;
}) {
  const isText = object.type === "text";
  const isRect = object.type === "rect";
  const hasIndividualRadius = [
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
  ].some((key) => object.style[key] !== undefined);
  const [cornerRadiusExpanded, setCornerRadiusExpanded] =
    useState(hasIndividualRadius);
  const colorStyleEntries = getEditableColorStyleEntries(object.style).filter(
    ([key]) => !(isText && key === "color"),
  );
  const opacity = getObjectStyleNumber(object.style.opacity, 1);
  const opacityPercent = Math.round(
    clamp(opacity <= 1 ? opacity * 100 : opacity, 0, 100),
  );
  const cornerRadius = getObjectStyleNumber(object.style.borderRadius, 0);
  const cornerRadiusFields = [
    ["borderTopLeftRadius", "Top left"],
    ["borderTopRightRadius", "Top right"],
    ["borderBottomRightRadius", "Bottom right"],
    ["borderBottomLeftRadius", "Bottom left"],
  ] as const;
  const textColor = isHexColor(String(object.style.color ?? ""))
    ? String(object.style.color)
    : "#FFFFFF";
  const fontFamily = String(object.style.fontFamily ?? defaultFontFamily);
  const fontSize = Number(object.style.fontSize ?? 48);
  const fontWeight = Number(object.style.fontWeight ?? 400);
  const fontStyle = String(object.style.fontStyle ?? "normal");
  const textDecoration = String(object.style.textDecoration ?? "none");
  const lineHeight = Number(object.style.lineHeight ?? 1.1);
  const letterSpacing = Number(object.style.letterSpacing ?? 0);
  const textAlign = String(object.style.textAlign ?? "left");
  const verticalAlign = String(object.style.verticalAlign ?? "middle");
  const textBoxLayout = String(object.style.textBoxLayout ?? "fixed");
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

  function previewStyleNumber(key: string, value: number) {
    onPreview?.((current) => ({
      ...current,
      style: { ...current.style, [key]: Number.isFinite(value) ? value : 0 },
    }));
  }

  function updateOpacity(value: string) {
    const percent = clamp(Number(value) || 0, 0, 100);
    onChange((current) => {
      const style = { ...current.style };
      if (percent >= 100) delete style.opacity;
      else style.opacity = roundTwo(percent / 100);
      return { ...current, style };
    });
  }

  function previewOpacity(value: number) {
    const percent = clamp(Number.isFinite(value) ? value : 0, 0, 100);
    onPreview?.((current) => {
      const style = { ...current.style };
      if (percent >= 100) delete style.opacity;
      else style.opacity = roundTwo(percent / 100);
      return { ...current, style };
    });
  }

  function updateUniformCornerRadius(value: string) {
    const radius = Math.max(0, Number(value) || 0);
    onChange((current) => {
      const {
        borderTopLeftRadius,
        borderTopRightRadius,
        borderBottomRightRadius,
        borderBottomLeftRadius,
        ...style
      } = current.style;
      void borderTopLeftRadius;
      void borderTopRightRadius;
      void borderBottomRightRadius;
      void borderBottomLeftRadius;
      const nextStyle = { ...style };
      if (radius > 0) nextStyle.borderRadius = radius;
      else delete nextStyle.borderRadius;
      return { ...current, style: nextStyle };
    });
  }

  function previewUniformCornerRadius(value: number) {
    const radius = Math.max(0, Number.isFinite(value) ? value : 0);
    onPreview?.((current) => {
      const {
        borderTopLeftRadius,
        borderTopRightRadius,
        borderBottomRightRadius,
        borderBottomLeftRadius,
        ...style
      } = current.style;
      void borderTopLeftRadius;
      void borderTopRightRadius;
      void borderBottomRightRadius;
      void borderBottomLeftRadius;
      const nextStyle = { ...style };
      if (radius > 0) nextStyle.borderRadius = radius;
      else delete nextStyle.borderRadius;
      return { ...current, style: nextStyle };
    });
  }

  function updateIndividualCornerRadius(key: string, value: string) {
    const radius = Math.max(0, Number(value) || 0);
    onChange((current) => {
      const style = { ...current.style };
      if (radius > 0) style[key] = radius;
      else delete style[key];
      return { ...current, style };
    });
  }

  function previewIndividualCornerRadius(key: string, value: number) {
    const radius = Math.max(0, Number.isFinite(value) ? value : 0);
    onPreview?.((current) => {
      const style = { ...current.style };
      if (radius > 0) style[key] = radius;
      else delete style[key];
      return { ...current, style };
    });
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

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>
            {key}
            <Input
              type="number"
              numberScrubMode="preview"
              numberScrubCommitThrottleMs={16}
              value={object.bounds[key]}
              onNumberScrubPreview={(value) => previewBounds(key, value)}
              onChange={(event) => updateBounds(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      {isRect ? (
        <div className="grid gap-3 rounded-[14px] border border-[#2d313b] bg-[#111319]/72 p-3">
          <div className="flex items-center justify-between text-[13px] font-extrabold text-[#dfe2ea]">
            <span>Appearance</span>
            <span className="text-[#737884]">○</span>
          </div>
          <div className="grid grid-cols-[0.9fr_1fr_auto] gap-2">
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Opacity
              <Input
                type="number"
                min={0}
                max={100}
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={16}
                value={opacityPercent}
                onNumberScrubPreview={previewOpacity}
                onChange={(event) => updateOpacity(event.target.value)}
              />
            </label>
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Corner radius
              <Input
                type="number"
                min={0}
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={16}
                value={cornerRadius}
                onNumberScrubPreview={previewUniformCornerRadius}
                onChange={(event) =>
                  updateUniformCornerRadius(event.target.value)
                }
              />
            </label>
            <button
              className={`mt-[22px] grid h-10 w-10 place-items-center rounded-[10px] border text-sm font-extrabold transition ${cornerRadiusExpanded ? "border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.22)] text-white" : "border-[#2d313b] bg-[#171920] text-[#dfe2ea] hover:border-[var(--clipper-accent-strong)]"}`}
              aria-label="Toggle individual corner radius"
              aria-pressed={cornerRadiusExpanded}
              onClick={() => setCornerRadiusExpanded((current) => !current)}
            >
              ⌜
            </button>
          </div>
          {cornerRadiusExpanded ? (
            <div className="grid grid-cols-2 gap-2">
              {cornerRadiusFields.map(([key, label]) => (
                <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>
                  {label}
                  <Input
                    type="number"
                    min={0}
                    numberScrubMode="preview"
                    numberScrubCommitThrottleMs={16}
                    value={getObjectStyleNumber(
                      object.style[key],
                      cornerRadius,
                    )}
                    onNumberScrubPreview={(value) =>
                      previewIndividualCornerRadius(key, value)
                    }
                    onChange={(event) =>
                      updateIndividualCornerRadius(key, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {isText ? (
        <>
          <label className={`grid gap-1.5 ${mutedCaps}`}>
            Content
            <Textarea
              className="min-h-[104px] resize-y"
              value={object.content ?? ""}
              onChange={(event) => updateTextContent(event.target.value)}
            />
          </label>
          <div className={`grid gap-1.5 ${mutedCaps}`}>
            <span>Colour</span>
            <ColorSelector
              value={textColor}
              onChange={(value) => updateStyleValue("color", value)}
              onPreview={(value) =>
                onPreview?.((current) => ({
                  ...current,
                  style: { ...current.style, color: value },
                }))
              }
            />
          </div>
          <FontSelector
            value={fontFamily}
            onChange={(value) => updateStyleValue("fontFamily", value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Size
              <Input
                type="number"
                min={1}
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={16}
                value={fontSize}
                onNumberScrubPreview={(value) =>
                  previewStyleNumber("fontSize", value)
                }
                onChange={(event) =>
                  updateStyleNumber("fontSize", event.target.value)
                }
              />
            </label>
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Weight
              <Input
                type="number"
                min={100}
                max={1000}
                step={10}
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={16}
                value={fontWeight}
                onNumberScrubPreview={(value) =>
                  previewStyleNumber("fontWeight", value)
                }
                onChange={(event) =>
                  updateStyleNumber("fontWeight", event.target.value)
                }
              />
            </label>
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Line Height
              <Input
                type="number"
                min={0.1}
                step={0.05}
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={16}
                value={lineHeight}
                onNumberScrubPreview={(value) =>
                  previewStyleNumber("lineHeight", value)
                }
                onChange={(event) =>
                  updateStyleNumber("lineHeight", event.target.value)
                }
              />
            </label>
            <label className={`grid gap-1.5 ${mutedCaps}`}>
              Char Spacing
              <Input
                type="number"
                step={0.1}
                numberScrubMode="preview"
                numberScrubCommitThrottleMs={16}
                value={letterSpacing}
                onNumberScrubPreview={(value) =>
                  previewStyleNumber("letterSpacing", value)
                }
                onChange={(event) =>
                  updateStyleNumber("letterSpacing", event.target.value)
                }
              />
            </label>
          </div>
          <div className="grid grid-cols-4 gap-2" aria-label="Text style">
            <button
              className={textButtonClass(fontWeight >= 700)}
              aria-label="Bold"
              aria-pressed={fontWeight >= 700}
              title="Bold"
              onClick={toggleBold}
            >
              <Bold size={16} />
            </button>
            <button
              className={textButtonClass(fontStyle === "italic")}
              aria-label="Italic"
              aria-pressed={fontStyle === "italic"}
              title="Italic"
              onClick={toggleItalic}
            >
              <Italic size={16} />
            </button>
            <button
              className={textButtonClass(hasTextDecoration("underline"))}
              aria-label="Underline"
              aria-pressed={hasTextDecoration("underline")}
              title="Underline"
              onClick={toggleUnderline}
            >
              <Underline size={16} />
            </button>
            <button
              className={textButtonClass(hasTextDecoration("line-through"))}
              aria-label="Strikethrough"
              aria-pressed={hasTextDecoration("line-through")}
              title="Strikethrough"
              onClick={toggleStrikethrough}
            >
              <Strikethrough size={16} />
            </button>
          </div>
          <div className="grid gap-1.5">
            <span className={mutedCaps}>Alignment</span>
            <div className="grid grid-cols-4 gap-2" aria-label="Text alignment">
              <button
                className={textButtonClass(textAlign === "left")}
                aria-label="Align left"
                aria-pressed={textAlign === "left"}
                title="Align left"
                onClick={() => updateStyleValue("textAlign", "left")}
              >
                <AlignLeft size={16} />
              </button>
              <button
                className={textButtonClass(textAlign === "center")}
                aria-label="Align center"
                aria-pressed={textAlign === "center"}
                title="Align center"
                onClick={() => updateStyleValue("textAlign", "center")}
              >
                <AlignCenter size={16} />
              </button>
              <button
                className={textButtonClass(textAlign === "right")}
                aria-label="Align right"
                aria-pressed={textAlign === "right"}
                title="Align right"
                onClick={() => updateStyleValue("textAlign", "right")}
              >
                <AlignRight size={16} />
              </button>
              <button
                className={textButtonClass(textAlign === "justify")}
                aria-label="Justify"
                aria-pressed={textAlign === "justify"}
                title="Justify"
                onClick={() => updateStyleValue("textAlign", "justify")}
              >
                <AlignJustify size={16} />
              </button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className={mutedCaps}>Vertical Alignment</span>
            <div
              className="grid grid-cols-3 gap-2"
              aria-label="Text vertical alignment"
            >
              <button
                className={textButtonClass(verticalAlign === "top")}
                aria-label="Align top"
                aria-pressed={verticalAlign === "top"}
                title="Align top"
                onClick={() => updateStyleValue("verticalAlign", "top")}
              >
                <VerticalAlignIcon align="top" />
              </button>
              <button
                className={textButtonClass(verticalAlign === "middle")}
                aria-label="Align middle"
                aria-pressed={verticalAlign === "middle"}
                title="Align middle"
                onClick={() => updateStyleValue("verticalAlign", "middle")}
              >
                <VerticalAlignIcon align="middle" />
              </button>
              <button
                className={textButtonClass(verticalAlign === "bottom")}
                aria-label="Align bottom"
                aria-pressed={verticalAlign === "bottom"}
                title="Align bottom"
                onClick={() => updateStyleValue("verticalAlign", "bottom")}
              >
                <VerticalAlignIcon align="bottom" />
              </button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className={mutedCaps}>Layout</span>
            <div
              className="grid grid-cols-3 gap-2"
              aria-label="Text box layout"
            >
              <button
                className={textButtonClass(textBoxLayout === "overflow")}
                aria-label="Fixed width, overflow"
                aria-pressed={textBoxLayout === "overflow"}
                title="Fixed width, overflow"
                onClick={() => updateStyleValue("textBoxLayout", "overflow")}
              >
                <TextBoxLayoutIcon mode="overflow" />
              </button>
              <button
                className={textButtonClass(textBoxLayout === "auto-height")}
                aria-label="Fixed width, auto height"
                aria-pressed={textBoxLayout === "auto-height"}
                title="Fixed width, auto height"
                onClick={() => updateStyleValue("textBoxLayout", "auto-height")}
              >
                <TextBoxLayoutIcon mode="auto-height" />
              </button>
              <button
                className={textButtonClass(textBoxLayout === "fixed")}
                aria-label="Fixed width and height"
                aria-pressed={textBoxLayout === "fixed"}
                title="Fixed width and height"
                onClick={() => updateStyleValue("textBoxLayout", "fixed")}
              >
                <TextBoxLayoutIcon mode="fixed" />
              </button>
            </div>
          </div>
        </>
      ) : null}
      {colorStyleEntries.length > 0 ? (
        <div className="grid gap-2">
          <span className={mutedCaps}>Colours</span>
          <div className="grid gap-2">
            {colorStyleEntries.map(([key, value]) => (
              <div className={`grid gap-1.5 ${mutedCaps}`} key={key}>
                <span>{formatStyleLabel(key)}</span>
                <ColorSelector
                  value={value}
                  onChange={(nextValue) => updateStyleColor(key, nextValue)}
                  onPreview={(nextValue) =>
                    onPreview?.((current) => ({
                      ...current,
                      style: { ...current.style, [key]: nextValue },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});

function getObjectStyleNumber(
  value: string | number | undefined,
  fallback = 0,
) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  return fallback;
}

function VerticalAlignIcon({ align }: { align: "top" | "middle" | "bottom" }) {
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

function TextBoxLayoutIcon({
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
  onPreviewLayer?: (updater: (layer: TransitionLayer) => TransitionLayer) => void;
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

  function updateParam(control: TransitionEffectParamControl, value: unknown) {
    const nextValue =
      control.type === "number"
        ? getTransitionParamNumericValue(control, String(value))
        : control.type === "boolean"
          ? value === true
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
            numberScrubCommitThrottleMs={16}
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
            onChange={(event) => {
              const value = Number.parseFloat(event.target.value);
              if (Number.isFinite(value))
                onChange((current) => {
                  const duration = clamp(value, 0.1, MAX_PART_DURATION_SECONDS);
                  return normalizeSymmetricTransitionLayer({
                    ...current,
                    start: getTransitionMarkerTime(current) - duration / 2,
                    duration,
                  });
                });
            }}
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
            onChange={(event) => {
              const value = Number.parseFloat(event.target.value);
              if (Number.isFinite(value))
                onChange((current) =>
                  normalizeSymmetricTransitionLayer({
                    ...current,
                    start:
                      clamp(value, 0, MAX_PART_DURATION_SECONDS) -
                      current.duration / 2,
                  }),
                );
            }}
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
  if (control.step && Number.isInteger(control.step)) numeric = Math.round(numeric);
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
              numberScrubCommitThrottleMs={16}
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
                numberScrubCommitThrottleMs={16}
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
                numberScrubCommitThrottleMs={16}
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
            numberScrubCommitThrottleMs={16}
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
                  numberScrubCommitThrottleMs={16}
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
