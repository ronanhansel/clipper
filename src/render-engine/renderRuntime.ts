import { evaluateLayerAnimations } from "../core/animations";
import {
  type AnimationGraphState,
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
  bgGraph?: AnimationGraphState;
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
  const backgroundGraphStyle = compileBackgroundGraphStyle(options.bgGraph, time);
  const baseFillStyle = hasBackgroundGraphSources(options.bgGraph)
    ? stripBackgroundPaintStyle(background.style)
    : background.style;

  return {
    ...background,
    elements,
    renderStyle: { ...layerAnimationStyle },
    fillStyle: {
      ...baseFillStyle,
      ...backgroundGraphStyle,
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

export function getConnectedBackgroundSourceIds(
  graph: AnimationGraphState | undefined,
) {
  const backgroundNodeIds = new Set(
    Object.entries(graph?.customNodes ?? {})
      .filter(([, node]) => node.scopeKey === "background")
      .map(([id]) => id),
  );
  return new Set(
    (graph?.edges ?? [])
      .filter(
        (edge) =>
          edge.toNodeId === "layer:background" &&
          backgroundNodeIds.has(edge.fromNodeId),
      )
      .map((edge) => edge.fromNodeId),
  );
}

function hasBackgroundGraphSources(graph: AnimationGraphState | undefined) {
  return Object.values(graph?.customNodes ?? {}).some(
    (node) => node.scopeKey === "background",
  );
}

function stripBackgroundPaintStyle(style: RenderStyle) {
  const {
    background: _background,
    backgroundColor: _backgroundColor,
    backgroundImage: _backgroundImage,
    backgroundPosition: _backgroundPosition,
    backgroundSize: _backgroundSize,
    backgroundRepeat: _backgroundRepeat,
    ...rest
  } = style;
  return rest;
}

export function compileBackgroundGraphStyle(
  graph: AnimationGraphState | undefined,
  time = 0,
): RenderStyle {
  if (!graph?.customNodes) return {};
  const entries = Object.entries(graph.customNodes).filter(
    ([, node]) => node.scopeKey === "background",
  );
  const nodeIds = new Set(entries.map(([id]) => id));
  const sourceEdgeTargets = getConnectedBackgroundSourceIds(graph);
  if (sourceEdgeTargets.size === 0) return {};
  const style: RenderStyle = {};
  const backgroundImages: string[] = [];
  const backgroundSizes: string[] = [];
  const backgroundPositions: string[] = [];
  for (const [nodeId, node] of entries) {
    if (
      !sourceEdgeTargets.has(nodeId) &&
      node.kind !== "oscillate" &&
      node.kind !== "time"
    )
      continue;
    const details = node.details ?? {};
    const oscillation = getBackgroundNodeOscillation(
      graph,
      nodeIds,
      nodeId,
      time,
    );
    if (node.kind === "bgSolid") {
      style.backgroundColor = details.color ?? "#050505";
      continue;
    }
    if (node.kind === "bgGradient") {
      const type = details.type ?? "linear";
      const stops = details.stops ?? "#0b1020 0%, #3949ab 100%";
      const angle = details.angle ?? "135deg";
      const center = details.center ?? "center";
      backgroundImages.push(
        type === "radial"
          ? `radial-gradient(circle at ${center}, ${stops})`
          : type === "conic"
            ? `conic-gradient(from ${angle}, ${stops})`
            : `linear-gradient(${angle}, ${stops})`,
      );
      if (oscillation) {
        backgroundSizes.push(details.backgroundSize ?? "140% 140%");
        backgroundPositions.push(`${50 + oscillation}% ${50 - oscillation}%`);
      } else {
        backgroundSizes.push(details.backgroundSize ?? "auto");
        backgroundPositions.push("center");
      }
      continue;
    }
    if (node.kind === "bgPattern") {
      const color = details.color ?? "rgba(255,255,255,0.18)";
      const base = details.base ?? "transparent";
      const size = details.size ?? "32px";
      const pattern = details.pattern ?? "dots";
      if (base !== "transparent") style.backgroundColor = base;
      const position = oscillation ? `${oscillation}px 0` : "0 0";
      if (pattern === "grid") {
        backgroundImages.push(
          `linear-gradient(${color} 1px, transparent 1px)`,
          `linear-gradient(90deg, ${color} 1px, transparent 1px)`,
        );
        backgroundSizes.push(`${size} ${size}`, `${size} ${size}`);
        backgroundPositions.push(position, position);
      } else {
        backgroundImages.push(
          pattern === "stripes"
            ? `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px ${size})`
            : `radial-gradient(circle, ${color} 1.5px, transparent 1.6px)`,
        );
        backgroundSizes.push(`${size} ${size}`);
        backgroundPositions.push(position);
      }
    }
  }
  if (backgroundImages.length) {
    style.backgroundImage = backgroundImages.join(", ");
    style.backgroundSize = backgroundSizes.join(", ");
    style.backgroundPosition = backgroundPositions.join(", ");
  }
  return style;
}

export function getBackgroundNodeOscillation(
  graph: AnimationGraphState | undefined,
  nodeIds: Set<string>,
  targetNodeId: string | undefined,
  time: number,
) {
  if (!targetNodeId) return 0;
  const oscillateNodeIds = (graph?.edges ?? [])
    .filter(
      (edge) => edge.toNodeId === targetNodeId && nodeIds.has(edge.fromNodeId),
    )
    .map((edge) => edge.fromNodeId);
  return oscillateNodeIds.reduce((sum, nodeId) => {
    const node = graph?.customNodes?.[nodeId];
    if (node?.kind !== "oscillate") return sum;
    return sum + getBackgroundOscillation(node.details, time);
  }, 0);
}

function getBackgroundOscillation(
  details: Record<string, string> | undefined,
  time: number,
) {
  const amount = Number(details?.amount ?? 0);
  const speed = Number(details?.speed ?? 1);
  if (!Number.isFinite(amount) || !Number.isFinite(speed)) return 0;
  return Math.sin(time * speed * Math.PI * 2) * amount;
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

function backOut(value: number) {
  return (
    1 + 2.70158 * Math.pow(value - 1, 3) + 1.70158 * Math.pow(value - 1, 2)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
