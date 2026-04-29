import { roundTwo } from "./math";
import { getMotionEffectByKind, getMotionEffectPackage, motionEffectPackages } from "./effects/registry";
import type { MotionBlock, MotionBlockEffectKind, MotionEffectId, MotionEffectKind, PerspectiveSettings, Point, TranslationMarker, ZoomMarker } from "./types";

export const motionEffectDefinitions = motionEffectPackages;

export const motionEffectRegistry = new Map<MotionEffectId, (typeof motionEffectDefinitions)[number]>(motionEffectDefinitions.map((definition) => [definition.id as MotionEffectId, definition]));

export function getMotionEffectDefinition(effectId: string) {
  return getMotionEffectPackage(effectId);
}

export function getMotionEffectDefinitionByKind(kind: MotionBlockEffectKind) {
  return getMotionEffectByKind(kind);
}

export function getMotionEffectDragType(effectId: string) {
  return `application/x-clipper-effect-${effectId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

export function getMotionBlockEffectKind(block: Pick<MotionBlock, "effectId">): MotionBlockEffectKind | null {
  return block.effectId ? getMotionEffectDefinition(block.effectId)?.kind ?? null : null;
}

export function isZoomMotionBlock(block: Pick<MotionBlock, "effectId">) {
  return getMotionBlockEffectKind(block) === "zoom";
}

export function isTranslationMotionBlock(block: Pick<MotionBlock, "effectId">) {
  return !isZoomMotionBlock(block);
}

export function normalizeMotionBlocks(blocks: MotionBlock[] | undefined): MotionBlock[] {
  const sourceBlocks = blocks ?? [];
  return sourceBlocks.flatMap((block) => {
    const definition = getMotionEffectDefinition(block.effectId ?? "clipper.motion.pan");
    if (!definition) return [];
    const params = normalizeMotionBlockParams(block);
    return [{
      ...block,
      layerId: block.layerId || definition.id,
      start: roundTwo(block.start),
      duration: roundTwo(Math.max(block.duration, 0.1)),
      params,
      ease: block.ease ?? params.ease,
      focus: normalizePoint(block.focus) ?? params.focus,
      followId: block.followId ?? params.followId,
      middleEase: block.middleEase ?? params.middleEase,
      middleTransition: block.middleTransition ?? params.middleTransition,
      perspective: normalizePerspective(block.perspective) ?? params.perspective,
      position: normalizePoint(block.position) ?? params.position,
      rotation: normalizeOptionalNumber(block.rotation) ?? params.rotation,
      scale: normalizeOptionalNumber(block.scale) ?? params.scale,
      snapIn: block.snapIn ?? params.snapIn,
      snapOut: block.snapOut ?? params.snapOut,
    }];
  });
}

export function motionBlocksToZoomMarkers(blocks: MotionBlock[]): ZoomMarker[] {
  return blocks.flatMap((block) => {
    if (!isZoomMotionBlock(block)) return [];
      return [{ ...block, effectId: "clipper.motion.zoom", layerId: block.layerId ?? "clipper.motion.zoom", focus: block.focus ?? { x: 960, y: 540 }, scale: block.scale ?? 1.8, params: block.params ?? {} }];
  });
}

export function motionBlocksToTranslationMarkers(blocks: MotionBlock[]): TranslationMarker[] {
  return blocks.flatMap((block) => {
    if (!isTranslationMotionBlock(block)) return [];
    const effectId = block.effectId === "clipper.motion.rotate" || block.effectId === "clipper.motion.perspective" ? block.effectId : "clipper.motion.pan";
    const params = block.params ?? {};
    const perspective = block.perspective ?? params.perspective;
    return [{ ...block, effectId, layerId: block.layerId ?? effectId, position: block.position ?? { x: 0, y: 0 }, perspective, params: perspective ? { ...params, perspective } : params }];
  });
}

export function createDefaultMotionBlock(kind: MotionEffectKind, input: { id: string; layerId: string; start: number; duration: number; focus: Point; position: Point }): MotionBlock {
  return getMotionEffectByKind(kind)?.createDefaultBlock(input) ?? getMotionEffectByKind("pan")!.createDefaultBlock(input);
}

export function createDefaultMotionBlockByEffectId(effectId: string, input: { id: string; layerId: string; start: number; duration: number; focus: Point; position: Point }): MotionBlock {
  return getMotionEffectPackage(effectId)?.createDefaultBlock(input) ?? getMotionEffectByKind("pan")!.createDefaultBlock(input);
}

function normalizeMotionBlockParams(block: MotionBlock): MotionBlock["params"] & {
  focus?: Point;
  position?: Point;
  perspective?: PerspectiveSettings;
  scale?: number;
  rotation?: number;
} {
  const params = block.params ?? {};
  return {
    ...params,
    focus: normalizePoint(params.focus),
    position: normalizePoint(params.position),
    scale: normalizeOptionalNumber(params.scale),
    rotation: normalizeOptionalNumber(params.rotation),
    perspective: normalizePerspective(params.perspective),
  };
}

function normalizePoint(value: unknown): Point | undefined {
  if (!value || typeof value !== "object") return undefined;
  const point = value as Partial<Point>;
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: roundTwo(x), y: roundTwo(y) } : undefined;
}

function normalizeOptionalNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? roundTwo(numeric) : undefined;
}

function normalizePerspective(value: unknown): PerspectiveSettings | undefined {
  if (!value || typeof value !== "object") return undefined;
  const perspective = value as PerspectiveSettings;
  return {
    z: normalizeOptionalNumber(perspective.z),
    rotateX: normalizeOptionalNumber(perspective.rotateX),
    rotateY: normalizeOptionalNumber(perspective.rotateY),
  };
}
