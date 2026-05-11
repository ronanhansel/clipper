import { evaluateLayerAnimations } from "../core/animations";
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
  const objectAnimations =
    object.type === "text"
      ? object.animations?.filter((animation) => !animation.options.split)
      : object.animations;
  const layerAnimationStyle =
    animationsEnabled && objectAnimations
      ? evaluateLayerAnimations(objectAnimations, time)
      : {};
  const templateRender = object.template
    ? renderFrameTemplate(object.template, object, time, duration)
    : null;

  const mergedMotionStyle = { ...layerAnimationStyle };
  const motionTransform =
    typeof mergedMotionStyle.transform === "string"
      ? mergedMotionStyle.transform
      : "";
  const templateTransform =
    typeof templateRender?.style?.transform === "string"
      ? templateRender.style.transform
      : "";
  const renderStyle: RenderStyle = {
    ...mergedMotionStyle,
    ...templateRender?.style,
  };
  if (motionTransform || templateTransform)
    renderStyle.transform = `${motionTransform} ${templateTransform}`.trim();
  const renderContent = templateRender?.content ?? object.content;
  const renderRichText = templateRender?.content ? undefined : object.richText;

  return {
    ...object,
    renderContent,
    renderRichText,
    renderStyle,
    timeSensitive: animationsEnabled && isTimeSensitiveFrameObject(object),
  };
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
    Boolean(object.template && !object.template.static)
  );
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
