import type {
  AdjustmentEffectId,
  EffectId,
  MotionEffectId,
  TransitionEffectId,
} from "../types";
import { builtInAdjustmentEffects } from "./adjustments";
import { builtInMotionEffects } from "./motion";
import { builtInTransitionEffects } from "./transitions";
import type {
  AdjustmentEffectPackage,
  EffectPackage,
  MotionEffectPackage,
  TransitionEffectPackage,
} from "./types";

export const installedEffectPackages: readonly EffectPackage[] = [
  ...builtInAdjustmentEffects,
  ...builtInMotionEffects,
  ...builtInTransitionEffects,
] as const;

export const effectPackageRegistry = new Map<EffectId, EffectPackage>(
  installedEffectPackages.map((definition) => [definition.id, definition]),
);

export const adjustmentEffectPackages = installedEffectPackages.filter(
  (definition): definition is AdjustmentEffectPackage =>
    definition.category === "adjustment",
);

export const motionEffectPackages = installedEffectPackages.filter(
  (definition): definition is MotionEffectPackage =>
    definition.category === "motion",
);

export const transitionEffectPackages = installedEffectPackages.filter(
  (definition): definition is TransitionEffectPackage =>
    definition.category === "transition",
);

export const defaultAdjustmentEffectPackage = adjustmentEffectPackages[0];

export const defaultMotionEffectPackage = motionEffectPackages[0];

export const defaultTransitionEffectPackage = transitionEffectPackages[0];

export function getEffectPackage(effectId: string) {
  return effectPackageRegistry.get(effectId as EffectId);
}

export function effectBlocksMending(effectId: string | undefined) {
  return Boolean(
    effectId && getEffectPackage(effectId)?.tags?.includes("blocksMending"),
  );
}

export function getMotionEffectPackage(effectId: string) {
  const definition = getEffectPackage(effectId);
  return definition?.category === "motion"
    ? (definition as MotionEffectPackage)
    : undefined;
}

export function getAdjustmentEffectPackage(effectId: string) {
  const definition = getEffectPackage(effectId);
  return definition?.category === "adjustment"
    ? (definition as AdjustmentEffectPackage)
    : undefined;
}

export function getTransitionEffectPackage(effectId: string) {
  const definition = getEffectPackage(effectId);
  return definition?.category === "transition"
    ? (definition as TransitionEffectPackage)
    : undefined;
}

export function getEffectDragType(effectId: string) {
  return `application/x-clipper-effect-${effectId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

export function getMotionEffectByKind(kind: MotionEffectPackage["kind"]) {
  return motionEffectPackages.find((definition) => definition.kind === kind);
}

export function normalizeAdjustmentEffectId(
  effectId: string | undefined,
): AdjustmentEffectId {
  return (
    getAdjustmentEffectPackage(effectId ?? "")?.id ??
    defaultAdjustmentEffectPackage.id
  );
}

export function normalizeMotionEffectId(
  effectId: string | undefined,
): MotionEffectId {
  return (
    getMotionEffectPackage(effectId ?? "")?.id ?? defaultMotionEffectPackage.id
  );
}

export function normalizeTransitionEffectId(
  effectId: string | undefined,
): TransitionEffectId {
  return (
    getTransitionEffectPackage(effectId ?? "")?.id ??
    (defaultTransitionEffectPackage?.id as TransitionEffectId) ??
    "clipper.transition.swipe"
  );
}
