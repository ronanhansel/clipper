import type {
  AdjustmentEffectId,
  EffectCategory,
  EffectId,
  MotionEffectId,
  TransitionEffectId,
} from "../types";
import { builtInAdjustmentEffects } from "./adjustments";
import { builtInMotionEffects } from "./motion";
import { builtInTransitionEffects } from "./transitions";
import type {
  AdjustmentEffectPackage,
  EffectCategoryDeclaration,
  EffectPackage,
  MotionEffectPackage,
  TransitionEffectPackage,
} from "./types";

type EffectTimelineDropMode = "point" | "placement";

export type EffectTimelineMetadata = {
  laneCategory: "adjust" | "motion" | "transition";
  previewCategory: EffectPackage["category"];
  gradient: {
    from: string;
    to: string;
    text: string;
  };
  adornment?: "center-divider";
  dropMode: EffectTimelineDropMode;
  defaultDurationSeconds?: number;
};

export type EffectCategoryMetadata = EffectCategoryDeclaration["library"] & {
  category: EffectCategory;
  timeline?: EffectTimelineMetadata;
};

export type EffectCategoryRegistryDeclaration = EffectCategoryDeclaration & {
  library: EffectCategoryDeclaration["library"];
  timeline: EffectCategoryDeclaration["timeline"] & EffectTimelineMetadata;
};

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

export const builtInEffectCategoryDeclarations = [
  {
    category: "transition",
    library: {
      label: "Transition",
      accent: "#ff8c42",
      icon: "transition",
      libraryOrder: 0,
    },
    timeline: {
      label: "Transition",
      defaultLayerName: "Transitions",
      laneCategory: "transition",
      previewCategory: "transition",
      gradient: { from: "#ff8c42", to: "#cc5500", text: "#ffffff" },
      adornment: "center-divider",
      dropMode: "point",
    },
    defaults: {
      defaultPackageId: defaultTransitionEffectPackage?.id,
      fallbackPackageId: defaultTransitionEffectPackage?.id,
    },
  },
  {
    category: "adjustment",
    library: {
      label: "Adjust",
      accent: "#a78bfa",
      icon: "adjustment",
      libraryOrder: 1,
    },
    timeline: {
      label: "Adjustment",
      defaultLayerName: "Adjustments",
      laneCategory: "adjust",
      previewCategory: "adjustment",
      gradient: { from: "#a78bfa", to: "#6d28d9", text: "#ffffff" },
      dropMode: "placement",
    },
    defaults: {
      defaultPackageId: defaultAdjustmentEffectPackage?.id,
      fallbackPackageId: defaultAdjustmentEffectPackage?.id,
    },
  },
  {
    category: "motion",
    library: {
      label: "Motion",
      accent: "#1bb8c9",
      icon: "motion",
      libraryOrder: 2,
    },
    timeline: {
      label: "Motion",
      defaultLayerName: "Motion",
      laneCategory: "motion",
      previewCategory: "motion",
      gradient: { from: "#1bb8c9", to: "#087482", text: "#ffffff" },
      dropMode: "point",
    },
    defaults: {
      defaultPackageId: defaultMotionEffectPackage?.id,
      fallbackPackageId: defaultMotionEffectPackage?.id,
    },
  },
] as const satisfies readonly EffectCategoryRegistryDeclaration[];

const effectCategoryDeclarations = new Map<
  EffectCategory,
  EffectCategoryRegistryDeclaration
>(
  builtInEffectCategoryDeclarations.map((declaration) => [
    declaration.category,
    declaration,
  ]),
);

export type EffectLibrarySectionDefinition = {
  category: EffectPackage["category"];
  label: string;
  metadata: EffectCategoryMetadata;
  packages: readonly EffectPackage[];
};

export function registerEffectCategoryMetadata(
  metadata: EffectCategoryMetadata,
) {
  const current = getEffectCategoryDeclaration(metadata.category);
  const baseTimeline = current?.timeline ?? {
    label: metadata.label,
    laneCategory: "motion" as const,
    previewCategory: metadata.category,
    gradient: { from: metadata.accent, to: metadata.accent, text: "#ffffff" },
    dropMode: "point" as const,
  };
  registerEffectCategoryDeclaration({
    category: metadata.category,
    library: {
      label: metadata.label,
      accent: metadata.accent,
      icon: metadata.icon,
      libraryOrder: metadata.libraryOrder,
    },
    timeline: {
      ...baseTimeline,
      ...(metadata.timeline ?? {}),
      label: baseTimeline.label,
    },
    defaults: current?.defaults,
    validatePackage: current?.validatePackage,
  });
}

export function registerEffectCategoryDeclaration(
  declaration: EffectCategoryRegistryDeclaration,
) {
  effectCategoryDeclarations.set(declaration.category, declaration);
}

export function getEffectCategoryDeclaration(category: EffectCategory) {
  return effectCategoryDeclarations.get(category);
}

export function getEffectCategoryMetadata(category: EffectCategory) {
  const declaration = getEffectCategoryDeclaration(category);
  return declaration
    ? {
        category: declaration.category,
        ...declaration.library,
        timeline: declaration.timeline,
      }
    : undefined;
}

export function getEffectCategoryLabel(category: EffectCategory) {
  return getEffectCategoryMetadata(category)?.label ?? category;
}

export function getEffectCategoryAccent(category: EffectCategory) {
  return getEffectCategoryMetadata(category)?.accent ?? "#6f7684";
}

export function getEffectCategoryIcon(category: EffectCategory) {
  return getEffectCategoryMetadata(category)?.icon ?? "effect";
}

export function getEffectTimelineMetadata(category: EffectCategory) {
  return getEffectCategoryDeclaration(category)?.timeline;
}

export function getEffectTimelineGradient(category: EffectCategory) {
  return getEffectTimelineMetadata(category)?.gradient;
}

export function getEffectTimelineAdornments(category: EffectCategory) {
  return getEffectTimelineMetadata(category)?.adornment;
}

export function getEffectTimelineLaneCategory(category: EffectCategory) {
  return getEffectTimelineMetadata(category)?.laneCategory;
}

export function getEffectTimelineDropMode(category: EffectCategory) {
  return getEffectTimelineMetadata(category)?.dropMode ?? "point";
}

export function getDefaultEffectPackageId(category: EffectCategory) {
  return getEffectCategoryDeclaration(category)?.defaults?.defaultPackageId;
}

export function getFallbackEffectPackageId(category: EffectCategory) {
  return getEffectCategoryDeclaration(category)?.defaults?.fallbackPackageId;
}

export function getEffectPackageTimelineMetadata(effectId: string) {
  const effect = getEffectPackage(effectId);
  return effect ? getEffectTimelineMetadata(effect.category) : undefined;
}

export function getEffectPackageTimelineLaneCategory(effectId: string) {
  return getEffectPackageTimelineMetadata(effectId)?.laneCategory;
}

export function getEffectPackageTimelineDefaultDuration(effectId: string) {
  const effect = getEffectPackage(effectId);
  if (!effect) return undefined;
  return (
    effect.defaultDuration ??
    getEffectTimelineMetadata(effect.category)?.defaultDurationSeconds
  );
}

export function registerEffectPackage(packageDefinition: EffectPackage) {
  const validationMessage = validateEffectPackage(packageDefinition);
  if (validationMessage) throw new Error(validationMessage);
  const index = effectPackages.findIndex(
    (candidate) => candidate.id === packageDefinition.id,
  );
  if (index >= 0) effectPackages[index] = packageDefinition;
  else effectPackages.push(packageDefinition);
  effectPackageRegistry.set(packageDefinition.id, packageDefinition);
  syncEffectCategoryArrays();
}

export function validateEffectPackage(packageDefinition: EffectPackage) {
  const declaration = getEffectCategoryDeclaration(packageDefinition.category);
  return (
    declaration?.validatePackage?.({
      packageDefinition,
      categoryDeclaration: declaration,
    }) ?? null
  );
}

export function registerEffectPackages(
  packageDefinitions: readonly EffectPackage[],
) {
  for (const packageDefinition of packageDefinitions)
    registerEffectPackage(packageDefinition);
}

export function getEffectLibrarySections(): readonly EffectLibrarySectionDefinition[] {
  return Array.from(effectCategoryDeclarations.keys())
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
            timeline: {
              laneCategory: "motion",
              previewCategory: category,
              gradient: { from: "#6f7684", to: "#424854", text: "#f0f2f6" },
              dropMode: "point",
            },
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

export function getEffectPackagesByCategory(
  category: EffectPackage["category"],
) {
  if (category === "motion") return motionEffectPackages;
  if (category === "adjustment") return adjustmentEffectPackages;
  if (category === "transition") return transitionEffectPackages;
  return effectPackages.filter(
    (definition) => definition.category === category,
  );
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
    (getDefaultEffectPackageId("adjustment") as AdjustmentEffectId) ??
    defaultAdjustmentEffectPackage.id
  );
}

export function normalizeMotionEffectId(
  effectId: string | undefined,
): MotionEffectId {
  return (
    getMotionEffectPackage(effectId ?? "")?.id ??
    (getDefaultEffectPackageId("motion") as MotionEffectId) ??
    defaultMotionEffectPackage.id
  );
}

export function normalizeTransitionEffectId(
  effectId: string | undefined,
): TransitionEffectId {
  return (
    getTransitionEffectPackage(effectId ?? "")?.id ??
    (getDefaultEffectPackageId("transition") as TransitionEffectId) ??
    (getFallbackEffectPackageId("transition") as TransitionEffectId) ??
    (defaultTransitionEffectPackage?.id as TransitionEffectId)
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
