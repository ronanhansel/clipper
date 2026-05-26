import {
  clamp,
  convertToTexture,
  Fn,
  mix,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { TransitionLayer } from "../../../core/types";

export type GpuTransitionCompositeInput = {
  fromNode: unknown;
  toNode: unknown;
  layer: TransitionLayer;
  progress: number;
};

type GpuTransitionUniformNodes = {
  progress: { value: number };
};

export function createGpuTransitionCompositeNode(
  input: GpuTransitionCompositeInput,
) {
  switch (input.layer.effect.effectId) {
    case "clipper.transition.fade":
      return createFadeTransitionNode(input);
    case "clipper.transition.swipe":
      return createSwipeTransitionNode(input);
    case "clipper.transition.scaleFade":
      return createScaleFadeTransitionNode(input);
    case "clipper.transition.zoomIn":
      return createZoomTransitionNode(input);
    default:
      throw new Error(
        `Unsupported GPU transition composite: ${input.layer.effect.effectId}`,
      );
  }
}

export function canUseGpuTransitionComposite(layer: TransitionLayer) {
  return (
    layer.effect.effectId === "clipper.transition.fade" ||
    layer.effect.effectId === "clipper.transition.swipe" ||
    layer.effect.effectId === "clipper.transition.scaleFade" ||
    layer.effect.effectId === "clipper.transition.zoomIn"
  );
}

export function getGpuTransitionCompositeSignature(layer: TransitionLayer) {
  return JSON.stringify({
    id: layer.id,
    effectId: layer.effect.effectId,
    params: layer.effect.params ?? {},
  });
}

export function applyGpuTransitionCompositeUniforms(
  targetLayer: TransitionLayer | null,
  source: Pick<GpuTransitionCompositeInput, "progress">,
) {
  const nodes = (
    targetLayer as (TransitionLayer & { gpuUniformNodes?: unknown }) | null
  )?.gpuUniformNodes;
  if (!nodes || typeof nodes !== "object" || !("progress" in nodes)) return;
  (nodes as GpuTransitionUniformNodes).progress.value = source.progress;
}

function createFadeTransitionNode(input: GpuTransitionCompositeInput) {
  const fromTexture = convertToTexture(input.fromNode);
  const toTexture = convertToTexture(input.toNode);
  const progress = createProgressUniform(input);

  return Fn(() => {
    const sourceUv = uv();
    const fromColor = fromTexture.sample(sourceUv);
    const toColor = toTexture.sample(sourceUv);
    return mix(fromColor, toColor, progress);
  })();
}

function createSwipeTransitionNode(input: GpuTransitionCompositeInput) {
  const fromTexture = convertToTexture(input.fromNode);
  const toTexture = convertToTexture(input.toNode);
  const progress = createProgressUniform(input);

  return Fn(() => {
    const sourceUv = uv();
    const fromUv = sourceUv.add(vec2(progress, 0.0));
    const toUv = sourceUv.sub(vec2(1.0 - progress, 0.0));
    const fromInside = sourceUv.x.lessThan(1.0 - progress);
    const toInside = sourceUv.x.greaterThanEqual(1.0 - progress);
    return fromInside.select(
      fromTexture.sample(fromUv),
      toInside.select(toTexture.sample(toUv), vec4(0.0, 0.0, 0.0, 1.0)),
    );
  })();
}

function createScaleFadeTransitionNode(input: GpuTransitionCompositeInput) {
  const fromTexture = convertToTexture(input.fromNode);
  const toTexture = convertToTexture(input.toNode);
  const progress = createProgressUniform(input);
  const scaleOut = getNumberParam(
    input.layer.effect.params?.scaleOut,
    1.08,
    0.5,
    2,
  );
  const scaleIn = getNumberParam(
    input.layer.effect.params?.scaleIn,
    1.08,
    0.5,
    2,
  );

  return Fn(() => {
    const sourceUv = uv();
    const fromUv = scaleUv(sourceUv, progress.mul(scaleOut - 1).add(1));
    const toUv = scaleUv(sourceUv, progress.mul(1 - scaleIn).add(scaleIn));
    const fromColor = sampleClamped(fromTexture, fromUv).mul(1.0 - progress);
    const toColor = sampleClamped(toTexture, toUv).mul(progress);
    return vec4(fromColor.rgb.add(toColor.rgb), 1.0);
  })();
}

function createZoomTransitionNode(input: GpuTransitionCompositeInput) {
  const fromTexture = convertToTexture(input.fromNode);
  const toTexture = convertToTexture(input.toNode);
  const t = createProgressUniform(input);
  const params = input.layer.effect.params;
  const direction = params?.direction === "out" ? "out" : "in";
  const zoom = getNumberParam(params?.zoom, 1.72, 1, 3);
  const cutPoint = getNumberParam(params?.cutPoint, 0.88, 0.4, 0.95);
  const fadeSoftness = getNumberParam(params?.fadeSoftness, 0, 0, 0.5);
  const background = parseHexColor(params?.backgroundColor, "#000000");
  const totalScale = t.mul(zoom - 1).add(1);
  const exitOpacity =
    fadeSoftness > 0
      ? t
          .sub(cutPoint - fadeSoftness)
          .div(fadeSoftness)
          .clamp(0, 1)
          .mul(
            t
              .sub(cutPoint - fadeSoftness)
              .div(fadeSoftness)
              .clamp(0, 1),
          )
          .mul(
            t
              .sub(cutPoint - fadeSoftness)
              .div(fadeSoftness)
              .clamp(0, 1)
              .mul(-2)
              .add(3),
          )
          .oneMinus()
      : t.lessThan(cutPoint).select(1, 0);
  const enterOpacity =
    fadeSoftness > 0
      ? t
          .sub(cutPoint)
          .div(Math.min(1, cutPoint + fadeSoftness) - cutPoint)
          .clamp(0, 1)
          .mul(
            t
              .sub(cutPoint)
              .div(Math.min(1, cutPoint + fadeSoftness) - cutPoint)
              .clamp(0, 1),
          )
          .mul(
            t
              .sub(cutPoint)
              .div(Math.min(1, cutPoint + fadeSoftness) - cutPoint)
              .clamp(0, 1)
              .mul(-2)
              .add(3),
          )
      : t.lessThan(cutPoint).select(0, 1);
  const exitScale = direction === "in" ? totalScale : 1 / totalScale;
  const enterScale = direction === "in" ? totalScale / zoom : zoom / totalScale;

  return Fn(() => {
    const sourceUv = uv();
    const fromColor = sampleClamped(fromTexture, scaleUv(sourceUv, exitScale));
    const toColor = sampleClamped(toTexture, scaleUv(sourceUv, enterScale));
    const color = vec3(background.r, background.g, background.b)
      .mul(1.0 - exitOpacity)
      .add(fromColor.rgb.mul(exitOpacity))
      .mul(1.0 - enterOpacity)
      .add(toColor.rgb.mul(enterOpacity));
    return vec4(color, 1.0);
  })();
}

function createProgressUniform(input: GpuTransitionCompositeInput) {
  const progress = uniform(input.progress);
  (
    input.layer as TransitionLayer & {
      gpuUniformNodes?: GpuTransitionUniformNodes;
    }
  ).gpuUniformNodes = {
    progress,
  };
  return clamp(progress, 0.0, 1.0);
}

function scaleUv(sourceUv: ReturnType<typeof uv>, scale: unknown) {
  return sourceUv.sub(vec2(0.5)).div(scale).add(vec2(0.5));
}

function sampleClamped(
  texture: ReturnType<typeof convertToTexture>,
  sourceUv: ReturnType<typeof uv>,
) {
  const inside = sourceUv.x
    .greaterThanEqual(0.0)
    .and(sourceUv.x.lessThanEqual(1.0))
    .and(sourceUv.y.greaterThanEqual(0.0))
    .and(sourceUv.y.lessThanEqual(1.0));
  return inside.select(texture.sample(sourceUv), vec4(0.0, 0.0, 0.0, 1.0));
}

function getNumberParam(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function parseHexColor(value: unknown, fallback: string) {
  const hex =
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : fallback;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16) / 255,
    g: Number.parseInt(hex.slice(3, 5), 16) / 255,
    b: Number.parseInt(hex.slice(5, 7), 16) / 255,
  };
}
