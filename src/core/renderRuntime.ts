import { evaluateLayerAnimations } from "./animations";
import { FRAME_HEIGHT, FRAME_WIDTH, type BackgroundLayer, type FrameObject, type FrameTemplate, type MotionEase, type MotionTrack, type Point } from "./types";

export type RenderStyle = Record<string, string | number | undefined>;

export type TemplateRenderContext = {
  time: number;
  duration: number;
  progress: number;
  frame: { width: number; height: number };
  object: Pick<FrameObject, "id" | "name" | "bounds" | "style" | "content">;
};

export type TemplateRenderResult = string | { content?: string; style?: RenderStyle };

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

const templateCache = new Map<string, (context: TemplateRenderContext) => TemplateRenderResult>();

export function evaluateFrameObject(object: FrameObject, time: number, duration: number, options: RenderEvaluationOptions = {}): EvaluatedFrameObject {
  const animationsEnabled = options.animations ?? true;
  const motionStyle = animationsEnabled ? getMotionPreviewAnimation(object.motion, time) : {};
  const layerAnimationStyle = animationsEnabled && object.animations ? evaluateLayerAnimations(object.animations, time) : {};
  const templateRender = object.template ? renderFrameTemplate(object.template, object, time, duration) : null;

  // Merge: layer animation style takes precedence over motion style
  const mergedMotionStyle = { ...motionStyle, ...layerAnimationStyle };
  const motionTransform = typeof mergedMotionStyle.transform === "string" ? mergedMotionStyle.transform : "";
  const templateTransform = typeof templateRender?.style?.transform === "string" ? templateRender.style.transform : "";
  const renderStyle: RenderStyle = {
    ...mergedMotionStyle,
    ...templateRender?.style,
  };
  if (motionTransform || templateTransform) renderStyle.transform = `${motionTransform} ${templateTransform}`.trim();
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

export function evaluateBackgroundLayer(background: BackgroundLayer, time: number, duration: number, options: RenderEvaluationOptions = {}): EvaluatedBackgroundLayer {
  const animationsEnabled = options.animations ?? true;
  const fillBounds = getBackgroundLayerFillBounds(background);
  const elements = background.elements.map((element) => evaluateFrameObject(element, time, duration, options));
  const layerMotion = animationsEnabled ? getMotionPreviewAnimation(background.motion, time) : {};
  const layerAnimationStyle = animationsEnabled && background.animations ? evaluateLayerAnimations(background.animations, time) : {};

  return {
    ...background,
    elements,
    renderStyle: { ...layerMotion, ...layerAnimationStyle },
    fillStyle: {
      ...background.style,
      left: fillBounds.x,
      top: fillBounds.y,
      width: fillBounds.width,
      height: fillBounds.height,
    },
    timeSensitive: animationsEnabled && (Boolean(background.motion) || Boolean(background.animations?.length) || elements.some((element) => element.timeSensitive)),
  };
}

export function isTimeSensitiveFrameObject(object: FrameObject) {
  return Boolean(object.motion) || Boolean(object.animations?.length) || Boolean(object.template && !object.template.static);
}

export function renderFrameTemplate(template: FrameTemplate, object: FrameObject, time: number, duration: number) {
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
    const message = error instanceof Error ? error.message : "Template render failed.";
    return {
      content: `<pre style="margin:0;white-space:pre-wrap;">${escapeTemplateError(message)}</pre>`,
      style: { color: "#ff6b7a", background: "rgba(80,0,18,0.78)", padding: 16, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
    };
  }
}

function compileFrameTemplate(source: string) {
  const cached = templateCache.get(source);
  if (cached) return cached;

  const compiled = Function(`"use strict"; const template = (${source}); if (typeof template !== "function") throw new Error("Frame template source must evaluate to a function."); return template;`)() as (context: TemplateRenderContext) => TemplateRenderResult;
  templateCache.set(source, compiled);
  return compiled;
}

function escapeTemplateError(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function getMotionPreviewAnimation(motion: FrameObject["motion"] | BackgroundLayer["motion"] | undefined, time: number): RenderStyle {
  if (!motion) return {};
  const progress = getMotionProgress(motion, time);
  const transforms: string[] = [];
  const pathPosition = getMotionPathPosition(motion, progress);

  if (pathPosition) transforms.push(`translate(${Math.round(pathPosition.x)}px, ${Math.round(pathPosition.y)}px)`);
  if (motion.x) transforms.push(`translateX(${Math.round(interpolate(motion.x, progress))}px)`);
  if (motion.y) transforms.push(`translateY(${Math.round(interpolate(motion.y, progress))}px)`);
  if (motion.rotate) transforms.push(`rotate(${interpolate(motion.rotate, progress).toFixed(2)}deg)`);
  if (motion.skewX) transforms.push(`skewX(${interpolate(motion.skewX, progress).toFixed(2)}deg)`);
  if (motion.skewY) transforms.push(`skewY(${interpolate(motion.skewY, progress).toFixed(2)}deg)`);
  if (motion.scale) transforms.push(`scale(${interpolate(motion.scale, progress).toFixed(4)})`);
  if (motion.scaleX) transforms.push(`scaleX(${interpolate(motion.scaleX, progress).toFixed(4)})`);
  if (motion.scaleY) transforms.push(`scaleY(${interpolate(motion.scaleY, progress).toFixed(4)})`);

  return {
    opacity: motion.opacity ? interpolate(motion.opacity, progress) : undefined,
    transform: transforms.length > 0 ? transforms.join(" ") : undefined,
  };
}

export function getMotionTranslation(motion: MotionTrack | undefined, time: number): Point {
  if (!motion) return { x: 0, y: 0 };
  const progress = getMotionProgress(motion, time);
  const pathPosition = getMotionPathPosition(motion, progress) ?? { x: 0, y: 0 };
  return {
    x: pathPosition.x + (motion.x ? interpolate(motion.x, progress) : 0),
    y: pathPosition.y + (motion.y ? interpolate(motion.y, progress) : 0),
  };
}

function getMotionProgress(motion: MotionTrack, time: number) {
  const delay = motion.delay ?? 0;
  const elapsed = Math.max(time - delay, 0);
  const cycleTime = motion.loop && motion.duration > 0 ? elapsed % motion.duration : elapsed;
  return easeProgress(clamp(motion.duration > 0 ? cycleTime / motion.duration : 1, 0, 1), motion.ease);
}

function getMotionPathPosition(motion: MotionTrack, progress: number): Point | null {
  const points = motion.path;
  if (!points?.length) return null;
  if (points.length === 1) return points[0];

  const closed = Boolean(motion.loop && points.length > 2);
  const segmentCount = closed ? points.length : points.length - 1;
  const scaled = clamp(progress, 0, 1) * segmentCount;
  const segmentIndex = Math.min(Math.floor(scaled), segmentCount - 1);
  const t = scaled - segmentIndex;
  const current = getPathPoint(points, segmentIndex, closed);
  const next = getPathPoint(points, segmentIndex + 1, closed);
  const previous = getPathPoint(points, segmentIndex - 1, closed) ?? current;
  const afterNext = getPathPoint(points, segmentIndex + 2, closed) ?? next;

  return {
    x: catmullRom(previous.x, current.x, next.x, afterNext.x, t),
    y: catmullRom(previous.y, current.y, next.y, afterNext.y, t),
  };
}

function getPathPoint(points: readonly Point[], index: number, closed: boolean) {
  if (closed) return points[(index + points.length) % points.length];
  return points[Math.min(Math.max(index, 0), points.length - 1)];
}

function catmullRom(previous: number, current: number, next: number, afterNext: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * current) + (-previous + next) * t + (2 * previous - 5 * current + 4 * next - afterNext) * t2 + (-previous + 3 * current - 3 * next + afterNext) * t3);
}

export function getBackgroundLayerFillBounds(background: BackgroundLayer) {
  if (!background.stretchToElements || background.elements.length === 0) {
    return { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT };
  }

  const bounds = background.elements.map((element) => element.bounds);
  const left = Math.min(0, ...bounds.map((item) => item.x));
  const top = Math.min(0, ...bounds.map((item) => item.y));
  const right = Math.max(FRAME_WIDTH, ...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(FRAME_HEIGHT, ...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function interpolate(range: readonly [number, number], progress: number) {
  return range[0] + (range[1] - range[0]) * progress;
}

export function easeProgress(value: number, ease: MotionEase | undefined) {
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(value);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return easeInOutCubic(value);
  if (ease === "backOut") return backOut(value);
  return value;
}

export function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function backOut(value: number) {
  return 1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
