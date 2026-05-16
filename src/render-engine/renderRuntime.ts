import { evaluateLayerAnimations } from "../core/animations";
import { type FillValue, fillValueToCss, isFillValue } from "../core/fillValue";
import { evaluateObjectState } from "../core/propertyRegistry";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type BackgroundLayer,
  type FrameObject,
  type FrameTemplate,
  type MotionEase,
} from "../core/types";

export type RenderStyle = Record<string, string | number | undefined>;

export type TemplateRenderContext = {
  time: number;
  duration: number;
  progress: number;
  frame: { width: number; height: number };
  object: Pick<FrameObject, "id" | "name" | "bounds" | "style" | "content">;
};

export type TemplateRenderResult =
  | string
  | { content?: string; style?: RenderStyle };

export type EvaluatedFrameObject = FrameObject & {
  renderContent?: string;
  renderStyle: RenderStyle;
  renderRichText?: FrameObject["richText"];
  timeSensitive: boolean;
};

export type EvaluatedBackgroundLayer = Omit<BackgroundLayer, "elements"> & {
  renderStyle: RenderStyle;
  fillStyle: RenderStyle;
  elements: EvaluatedFrameObject[];
  timeSensitive: boolean;
};

export type RenderEvaluationOptions = {
  animations?: boolean;
};

const templateCache = new Map<
  string,
  (context: TemplateRenderContext) => TemplateRenderResult
>();

export function evaluateFrameObject(
  object: FrameObject,
  time: number,
  duration: number,
  options: RenderEvaluationOptions = {},
): EvaluatedFrameObject {
  const animationsEnabled = options.animations ?? true;
  const trackedObject = animationsEnabled
    ? evaluateObjectState(object, time)
    : object;
  const objectAnimations =
    trackedObject.type === "text"
      ? object.animations?.filter((animation) => !animation.options.split)
      : object.animations;
  const layerAnimationStyle =
    animationsEnabled && objectAnimations
      ? evaluateLayerAnimations(objectAnimations, time)
      : {};
  const templateRender = trackedObject.template
    ? renderFrameTemplate(trackedObject.template, trackedObject, time, duration)
    : null;

  const propertyTrackStyle = renderStyleFromPropertyTracks(trackedObject);
  const mergedMotionStyle = { ...propertyTrackStyle, ...layerAnimationStyle };
  const motionTransform =
    typeof layerAnimationStyle.transform === "string"
      ? layerAnimationStyle.transform
      : "";
  const propertyTransform =
    typeof propertyTrackStyle.transform === "string"
      ? propertyTrackStyle.transform
      : "";
  const templateTransform =
    typeof templateRender?.style?.transform === "string"
      ? templateRender.style.transform
      : "";
  const renderStyle: RenderStyle = {
    ...mergedMotionStyle,
    ...templateRender?.style,
  };
  if (motionTransform || propertyTransform || templateTransform)
    renderStyle.transform =
      `${motionTransform} ${propertyTransform} ${templateTransform}`
        .replace(/\s+/g, " ")
        .trim();
  const renderContent = templateRender?.content ?? trackedObject.content;
  const renderRichText = templateRender?.content
    ? undefined
    : trackedObject.richText;

  return {
    ...trackedObject,
    renderContent,
    renderRichText,
    renderStyle,
    timeSensitive:
      animationsEnabled && isTimeSensitiveFrameObject(trackedObject),
  };
}

export function buildFrameObjectParentTransformLookup(
  objects: FrameObject[],
  time: number,
  duration: number,
  animationsEnabled = true,
) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  // stores the full cumulative transform for an object (parent chain + own)
  const fullTransforms = new Map<string, string>();
  const visiting = new Set<string>();

  function fullTransform(object: FrameObject): string {
    if (fullTransforms.has(object.id))
      return fullTransforms.get(object.id) ?? "";
    if (visiting.has(object.id)) return "";
    visiting.add(object.id);

    const evaluated = evaluateFrameObject(object, time, duration, {
      animations: animationsEnabled,
    });
    // bounds.x/y animate as left/top on the element itself, so children must
    // inherit the delta between the animated position and the base position as
    // a translate — not the absolute position (which would double-apply).
    const dx = evaluated.bounds.x - object.bounds.x;
    const dy = evaluated.bounds.y - object.bounds.y;
    const boundsTranslate =
      dx !== 0 || dy !== 0 ? `translate(${dx}px, ${dy}px)` : "";
    // renderStyle.transform includes rotation, scale, translateX/Y from
    // property tracks and motion animations — all of these propagate to children
    const animationTransform =
      typeof evaluated.renderStyle.transform === "string"
        ? evaluated.renderStyle.transform
        : "";
    const ownTransform = `${boundsTranslate} ${animationTransform}`.trim();
    const parent = object.parentId ? byId.get(object.parentId) : null;
    const parentFull = parent ? fullTransform(parent) : "";
    const value = `${parentFull} ${ownTransform}`.trim();
    visiting.delete(object.id);
    fullTransforms.set(object.id, value);
    return value;
  }

  // build full transforms for all objects that have a parent
  for (const object of objects) {
    if (object.parentId) fullTransform(object);
  }

  // return only the parent's cumulative transform for each child
  const parentTransforms = new Map<string, string>();
  for (const object of objects) {
    if (!object.parentId) continue;
    const parent = byId.get(object.parentId);
    if (!parent) continue;
    parentTransforms.set(object.id, fullTransform(parent));
  }

  return parentTransforms;
}

export function evaluateBackgroundLayer(
  background: BackgroundLayer,
  time: number,
  duration: number,
  options: RenderEvaluationOptions = {},
): EvaluatedBackgroundLayer {
  const animationsEnabled = options.animations ?? true;
  const fillBounds = getBackgroundLayerFillBounds(background);
  const elements = background.elements.map((element) =>
    evaluateFrameObject(element, time, duration, options),
  );
  const layerAnimationStyle =
    animationsEnabled && background.animations
      ? evaluateLayerAnimations(background.animations, time)
      : {};
  return {
    ...background,
    elements,
    renderStyle: { ...layerAnimationStyle },
    fillStyle: {
      ...background.style,
      left: fillBounds.x,
      top: fillBounds.y,
      width: fillBounds.width,
      height: fillBounds.height,
    },
    timeSensitive:
      animationsEnabled &&
      (Boolean(background.animations?.length) ||
        elements.some((element) => element.timeSensitive)),
  };
}

export function isTimeSensitiveFrameObject(object: FrameObject) {
  return (
    Boolean(object.animations?.length) ||
    Boolean(object.template && !object.template.static) ||
    Boolean(object.tracks && Object.keys(object.tracks).length > 0)
  );
}

function renderStyleFromPropertyTracks(object: FrameObject): RenderStyle {
  const transform = transformStyleFromRecord(
    readObjectRecord(object, "transform"),
  );
  const shadowStyle = shadowRenderStyle(
    readObjectShadowRecord(object),
    object.type,
  );
  const filter = composeFilterStyle(
    readObjectRecord(object, "filter"),
    shadowStyle.filterPart,
  );
  const background = resolveBackgroundStyle(object.style.backgroundColor);
  const textStrokeStyle = textStrokeRenderStyle(
    object,
    readObjectStrokeRecord(object),
  );
  return {
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    opacity: styleValue(object.style.opacity),
    color: styleValue(object.style.color),
    backgroundColor: background.backgroundColor,
    backgroundImage: background.backgroundImage,
    transform,
    filter,
    boxShadow: shadowStyle.boxShadow,
    textShadow: shadowStyle.textShadow,
    WebkitTextStroke: textStrokeStyle.webkitTextStroke,
    paintOrder: textStrokeStyle.paintOrder,
  };
}

function resolveBackgroundStyle(raw: unknown): {
  backgroundColor: string | number | undefined;
  backgroundImage: string | undefined;
} {
  if (isFillValue(raw)) {
    const fill = raw as unknown as FillValue;
    if (fill.mode === "gradient") {
      return {
        backgroundColor: "transparent",
        backgroundImage: fillValueToCss(fill),
      };
    }
    return {
      backgroundColor: fillValueToCss(fill),
      backgroundImage: "none",
    };
  }
  if (typeof raw === "string" && isCssGradientString(raw)) {
    return { backgroundColor: "transparent", backgroundImage: raw };
  }
  return { backgroundColor: styleValue(raw), backgroundImage: "none" };
}

function isCssGradientString(value: string) {
  return /^(repeating-)?(linear|radial|conic)-gradient\(/i.test(value.trim());
}

function readObjectRecord(object: FrameObject, key: "transform" | "filter") {
  const value = (object as unknown as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readObjectShadowRecord(object: FrameObject): Record<string, unknown> {
  const value = (object as unknown as Record<string, unknown>).shadow;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readObjectStrokeRecord(object: FrameObject): Record<string, unknown> {
  const value = (object as unknown as Record<string, unknown>).stroke;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textStrokeRenderStyle(
  object: FrameObject,
  stroke: Record<string, unknown>,
): { webkitTextStroke?: string; paintOrder?: string } {
  if (object.type !== "text") return {};
  if (!stroke || stroke.enabled === false) return {};
  const widthRaw =
    typeof stroke.width === "number" && Number.isFinite(stroke.width)
      ? stroke.width
      : 0;
  const width = Math.max(0, widthRaw);
  if (width <= 0) return {};
  const rgba = shadowColorToRgba(stroke.color, stroke.alpha);
  if (!rgba) return {};
  return {
    webkitTextStroke: `${width.toFixed(2)}px ${rgba}`,
    paintOrder: "stroke fill",
  };
}

function transformStyleFromRecord(record: Record<string, unknown>) {
  const transforms: string[] = [];
  appendTransform(transforms, record.perspective, "perspective", "px");
  appendTransform(transforms, record.translateX, "translateX", "px");
  appendTransform(transforms, record.translateY, "translateY", "px");
  appendTransform(transforms, record.translateZ, "translateZ", "px");
  appendTransform(transforms, record.scale, "scale", "");
  appendTransform(transforms, record.scaleX, "scaleX", "");
  appendTransform(transforms, record.scaleY, "scaleY", "");
  appendTransform(transforms, record.rotate, "rotate", "deg");
  appendTransform(transforms, record.rotateX, "rotateX", "deg");
  appendTransform(transforms, record.rotateY, "rotateY", "deg");
  appendTransform(transforms, record.rotateZ, "rotateZ", "deg");
  appendTransform(transforms, record.skewX, "skewX", "deg");
  appendTransform(transforms, record.skewY, "skewY", "deg");
  return transforms.length ? transforms.join(" ") : undefined;
}

function appendTransform(
  transforms: string[],
  value: unknown,
  name: string,
  unit: string,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  transforms.push(`${name}(${value}${unit})`);
}

function filterStyleFromRecord(record: Record<string, unknown>) {
  return typeof record.blur === "number" && Number.isFinite(record.blur)
    ? `blur(${Math.max(0, record.blur).toFixed(2)}px)`
    : undefined;
}

function shadowColorToRgba(hex: unknown, alphaPct: unknown): string | null {
  const sanitizedHex = typeof hex === "string" ? hex.trim() : "";
  if (!sanitizedHex.startsWith("#")) return null;
  const raw = sanitizedHex.slice(1);
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const pct =
    typeof alphaPct === "number" && Number.isFinite(alphaPct) ? alphaPct : 100;
  const a = Math.max(0, Math.min(1, pct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}

type ShadowGeometry = {
  x: number;
  y: number;
  blur: number;
  spread: number;
  rgba: string;
};

function readShadowGeometry(
  shadow: Record<string, unknown>,
): ShadowGeometry | null {
  if (shadow.enabled === false) return null;
  const x =
    typeof shadow.x === "number" && Number.isFinite(shadow.x) ? shadow.x : 0;
  const y =
    typeof shadow.y === "number" && Number.isFinite(shadow.y) ? shadow.y : 0;
  const blur =
    typeof shadow.blur === "number" && Number.isFinite(shadow.blur)
      ? Math.max(0, shadow.blur)
      : 0;
  const spreadRaw =
    typeof shadow.spread === "number" && Number.isFinite(shadow.spread)
      ? Math.max(0, shadow.spread)
      : 0;
  const spread = Math.min(spreadRaw, 64);
  const rgba = shadowColorToRgba(shadow.color, shadow.alpha);
  if (!rgba) return null;
  const isDefault = x === 0 && y === 0 && blur === 0 && spread === 0;
  if (isDefault && shadow.enabled !== true) return null;
  return { x, y, blur, spread, rgba };
}

type ShadowRenderStyle = {
  filterPart?: string;
  boxShadow?: string;
  textShadow?: string;
};

function shadowRenderStyle(
  shadow: Record<string, unknown>,
  type: FrameObject["type"],
): ShadowRenderStyle {
  const geom = readShadowGeometry(shadow);
  if (!geom) return {};
  const { x, y, blur, spread, rgba } = geom;
  if (type === "rect" || type === "pattern2d") {
    return {
      boxShadow:
        x.toFixed(2) +
        "px " +
        y.toFixed(2) +
        "px " +
        blur.toFixed(2) +
        "px " +
        spread.toFixed(2) +
        "px " +
        rgba,
    };
  }
  // Text/image/svg/html/template/etc. use filter: drop-shadow so the browser
  // promotes a compositor layer and caches the rasterized source. drop-shadow
  // has no spread parameter, so the spread input is disabled in the inspector
  // for these types and we render blur only — never silently fold spread into
  // blur, which would lie about what the field controls.
  return {
    filterPart:
      "drop-shadow(" +
      x.toFixed(2) +
      "px " +
      y.toFixed(2) +
      "px " +
      blur.toFixed(2) +
      "px " +
      rgba +
      ")",
  };
}

function composeFilterStyle(
  filter: Record<string, unknown>,
  shadowFilterPart?: string,
): string | undefined {
  const parts: string[] = [];
  const blur = filterStyleFromRecord(filter);
  if (blur) parts.push(blur);
  if (shadowFilterPart) parts.push(shadowFilterPart);
  return parts.length ? parts.join(" ") : undefined;
}

function styleValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

export function renderFrameTemplate(
  template: FrameTemplate,
  object: FrameObject,
  time: number,
  duration: number,
) {
  try {
    const renderer = compileFrameTemplate(template.source);
    const result = renderer({
      time,
      duration,
      progress: clamp(duration > 0 ? time / duration : 0, 0, 1),
      frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      object: {
        id: object.id,
        name: object.name,
        bounds: object.bounds,
        style: object.style,
        content: object.content,
      },
    });

    if (typeof result === "string") return { content: result };
    if (!result || typeof result !== "object") return { content: "" };
    return { content: result.content, style: result.style ?? {} };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Template render failed.";
    return {
      content: `<pre style="margin:0;white-space:pre-wrap;">${escapeTemplateError(message)}</pre>`,
      style: {
        color: "#ff6b7a",
        background: "rgba(80,0,18,0.78)",
        padding: 16,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
    };
  }
}

function compileFrameTemplate(source: string) {
  const cached = templateCache.get(source);
  if (cached) return cached;

  const compiled = Function(
    `"use strict"; const template = (${source}); if (typeof template !== "function") throw new Error("Frame template source must evaluate to a function."); return template;`,
  )() as (context: TemplateRenderContext) => TemplateRenderResult;
  templateCache.set(source, compiled);
  return compiled;
}

function escapeTemplateError(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getBackgroundLayerFillBounds(background: BackgroundLayer) {
  if (!background.stretchToElements || background.elements.length === 0) {
    return { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT };
  }

  const bounds = background.elements.map((element) => element.bounds);
  const left = Math.min(0, ...bounds.map((item) => item.x));
  const top = Math.min(0, ...bounds.map((item) => item.y));
  const right = Math.max(
    FRAME_WIDTH,
    ...bounds.map((item) => item.x + item.width),
  );
  const bottom = Math.max(
    FRAME_HEIGHT,
    ...bounds.map((item) => item.y + item.height),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function interpolate(
  range: readonly [number, number],
  progress: number,
) {
  return range[0] + (range[1] - range[0]) * progress;
}

export function easeProgress(value: number, ease: MotionEase | undefined) {
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(value);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return easeInOutCubic(value);
  if (ease === "inAndOut") return inAndOutEase(value);
  if (ease === "expoIn") return expoIn(value);
  if (ease === "expoOut") return expoOut(value);
  if (ease === "backOut") return backOut(value);
  return value;
}

export function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function expoIn(value: number) {
  if (value <= 0) return 0;
  return Math.pow(2, 10 * value - 10);
}

function inAndOutEase(value: number) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value < 0.5
    ? Math.pow(2, 20 * value - 10) / 2
    : (2 - Math.pow(2, -20 * value + 10)) / 2;
}

function expoOut(value: number) {
  if (value >= 1) return 1;
  return 1 - Math.pow(2, -10 * value);
}

function backOut(value: number) {
  return (
    1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
