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

export type EffectCategoryMetadata = {
  category: EffectPackage["category"];
  label: string;
  accent: string;
  icon: string;
  libraryOrder: number;
};

const effectCategoryMetadata = new Map<
  EffectPackage["category"],
  EffectCategoryMetadata
>([
  [
    "transition",
    {
      category: "transition",
      label: "Transition",
      accent: "#ff8c42",
      icon: "transition",
      libraryOrder: 0,
    },
  ],
  [
    "adjustment",
    {
      category: "adjustment",
      label: "Adjust",
      accent: "#a78bfa",
      icon: "adjustment",
      libraryOrder: 1,
    },
  ],
  [
    "motion",
    {
      category: "motion",
      label: "Motion",
      accent: "#1bb8c9",
      icon: "motion",
      libraryOrder: 2,
    },
  ],
]);

const effectPackages: EffectPackage[] = [
  ...builtInAdjustmentEffects,
  ...builtInMotionEffects,
  ...builtInTransitionEffects,
];

export const installedEffectPackages: readonly EffectPackage[] = effectPackages;

export const effectPackageRegistry = new Map<EffectId, EffectPackage>(
  installedEffectPackages.map((definition) => [definition.id, definition]),
);

export const adjustmentEffectPackages: AdjustmentEffectPackage[] =
  effectPackages.filter(
    (definition): definition is AdjustmentEffectPackage =>
      definition.category === "adjustment",
  );

export const motionEffectPackages: MotionEffectPackage[] =
  effectPackages.filter(
    (definition): definition is MotionEffectPackage =>
      definition.category === "motion",
  );

export const transitionEffectPackages: TransitionEffectPackage[] =
  effectPackages.filter(
    (definition): definition is TransitionEffectPackage =>
      definition.category === "transition",
  );

export const defaultAdjustmentEffectPackage = adjustmentEffectPackages[0];

export const defaultMotionEffectPackage = motionEffectPackages[0];

export const defaultTransitionEffectPackage = transitionEffectPackages[0];

export type EffectLibrarySectionDefinition = {
  category: EffectPackage["category"];
  label: string;
  metadata: EffectCategoryMetadata;
  packages: readonly EffectPackage[];
};

export function registerEffectCategoryMetadata(
  metadata: EffectCategoryMetadata,
) {
  effectCategoryMetadata.set(metadata.category, metadata);
}

export function getEffectCategoryMetadata(category: EffectPackage["category"]) {
  return effectCategoryMetadata.get(category);
}

export function getEffectCategoryLabel(category: EffectPackage["category"]) {
  return getEffectCategoryMetadata(category)?.label ?? category;
}

export function getEffectCategoryAccent(category: EffectPackage["category"]) {
  return getEffectCategoryMetadata(category)?.accent ?? "#6f7684";
}

export function getEffectCategoryIcon(category: EffectPackage["category"]) {
  return getEffectCategoryMetadata(category)?.icon ?? "effect";
}

export function registerEffectPackage(packageDefinition: EffectPackage) {
  const index = effectPackages.findIndex(
    (candidate) => candidate.id === packageDefinition.id,
  );
  if (index >= 0) effectPackages[index] = packageDefinition;
  else effectPackages.push(packageDefinition);
  effectPackageRegistry.set(packageDefinition.id, packageDefinition);
  syncEffectCategoryArrays();
}

export function registerEffectPackages(
  packageDefinitions: readonly EffectPackage[],
) {
  for (const packageDefinition of packageDefinitions)
    registerEffectPackage(packageDefinition);
}

export function getEffectLibrarySections(): readonly EffectLibrarySectionDefinition[] {
  return ["transition", "adjustment", "motion"]
    .map((category) => {
      const metadata = getEffectCategoryMetadata(category);
      return {
        category,
        label: metadata?.label ?? category,
        metadata:
          metadata ??
          ({
            category,
            label: category,
            accent: "#6f7684",
            icon: "effect",
            libraryOrder: Number.MAX_SAFE_INTEGER,
          } satisfies EffectCategoryMetadata),
        packages: getEffectPackagesByCategory(category),
      };
    })
    .sort((a, b) => a.metadata.libraryOrder - b.metadata.libraryOrder);
}

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

export function getEffectPackagesByCategory(category: EffectPackage["category"]) {
  if (category === "motion") return motionEffectPackages;
  if (category === "adjustment") return adjustmentEffectPackages;
  if (category === "transition") return transitionEffectPackages;
  return effectPackages.filter((definition) => definition.category === category);
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

function syncEffectCategoryArrays() {
  adjustmentEffectPackages.splice(
    0,
    adjustmentEffectPackages.length,
    ...effectPackages.filter(
      (definition): definition is AdjustmentEffectPackage =>
        definition.category === "adjustment",
    ),
  );
  motionEffectPackages.splice(
    0,
    motionEffectPackages.length,
    ...effectPackages.filter(
      (definition): definition is MotionEffectPackage =>
        definition.category === "motion",
    ),
  );
  transitionEffectPackages.splice(
    0,
    transitionEffectPackages.length,
    ...effectPackages.filter(
      (definition): definition is TransitionEffectPackage =>
        definition.category === "transition",
    ),
  );
}
