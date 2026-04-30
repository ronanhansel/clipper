import { roundTwo } from "./math";
import { getMotionEffectByKind, getMotionEffectPackage, motionEffectPackages } from "./effects/registry";
import type { MotionBlock, MotionBlockEffectKind, MotionEffectId, MotionEffectKind, MotionMarker, PerspectiveSettings, Point } from "./types";

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

export function getMotionBlockEffectKind(block: { effectId?: string }): MotionBlockEffectKind | null {
  return block.effectId ? getMotionEffectDefinition(block.effectId)?.kind ?? null : null;
}

export function isMotionKind(marker: MotionMarker, kind: MotionBlockEffectKind) {
  return marker.kind === kind;
}

export function normalizeMotionBlocks(blocks: MotionBlock[] | undefined): MotionBlock[] {
  const sourceBlocks = blocks ?? [];
  return sourceBlocks.flatMap((block) => {
    const definition = getMotionEffectDefinition(block.effectId ?? "clipper.motion.pan");
    if (!definition) return [];
    const params = normalizeMotionBlockParams(block);
    return [{
      ...block,
      name: normalizeOptionalString(block.name),
      layerId: block.layerId || definition.id,
      start: roundTwo(block.start),
      duration: roundTwo(Math.max(block.duration, 0.1)),
      params,
      ease: block.ease ?? params.ease,
      focus: normalizePoint(block.focus) ?? params.focus,
      followId: block.followId ?? params.followId,
      mendInId: block.mendInId ?? params.mendInId,
      mendOutId: block.mendOutId ?? params.mendOutId,
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

export function motionBlocksToMotionMarkers(blocks: MotionBlock[]): MotionMarker[] {
  const markers = normalizeMotionBlocks(blocks).map((block) => {
    const kind = getMotionBlockEffectKind(block) ?? "pan";
    const definition = getMotionEffectByKind(kind) ?? getMotionEffectByKind("pan")!;
    return {
      ...block,
      kind,
      effectId: block.effectId ?? definition.id,
      layerId: block.layerId ?? definition.id,
    };
  });
  return Array.from(new Map(markers.map((marker) => [marker.id, marker])).values()).sort((left, right) => left.start - right.start);
}

export function motionMarkersToMotionBlocks(markers: MotionMarker[]): MotionBlock[] {
  return normalizeMotionBlocks(markers.map((marker) => ({ ...marker, effectId: marker.effectId ?? getMotionEffectByKind(marker.kind)?.id })));
}

export function getCanonicalMotionMarkers(input: { motionMarkers?: MotionMarker[] }) {
  return motionBlocksToMotionMarkers(input.motionMarkers ?? []);
}

export function getMotionMarkerViews(input: { motionMarkers?: MotionMarker[] }) {
  const motionMarkers = getCanonicalMotionMarkers(input);
  return { motionMarkers };
}

export function withCanonicalMotionMarkers(motionMarkers: MotionMarker[]) {
  return {
    motionMarkers: motionBlocksToMotionMarkers(motionMarkers),
  };
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

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
