import type { AnimationDefinition } from "./types";
import { createAnimationDefinitionPackage } from "./manifest";
import toast from "react-hot-toast";
import blurManifest from "./blur/manifest.yml?raw";
import { blurAnimationLogic } from "./blur/logic";
import opacityManifest from "./opacity/manifest.yml?raw";
import { opacityAnimationLogic } from "./opacity/logic";
import positionManifest from "./position/manifest.yml?raw";
import { positionAnimationLogic } from "./position/logic";
import rotateManifest from "./rotate/manifest.yml?raw";
import { rotateAnimationLogic } from "./rotate/logic";
import scaleManifest from "./scale/manifest.yml?raw";
import { scaleAnimationLogic } from "./scale/logic";

export const positionAnimation = createBuiltInAnimationDefinitionPackage(
  "Position",
  positionManifest,
  positionAnimationLogic,
);
export const opacityAnimation = createBuiltInAnimationDefinitionPackage(
  "Opacity",
  opacityManifest,
  opacityAnimationLogic,
);
export const blurAnimation = createBuiltInAnimationDefinitionPackage(
  "Blur",
  blurManifest,
  blurAnimationLogic,
);
export const scaleAnimation = createBuiltInAnimationDefinitionPackage(
  "Scale",
  scaleManifest,
  scaleAnimationLogic,
);
export const rotateAnimation = createBuiltInAnimationDefinitionPackage(
  "Rotate",
  rotateManifest,
  rotateAnimationLogic,
);

export const builtInAnimationDefinitions = [
  positionAnimation,
  opacityAnimation,
  blurAnimation,
  scaleAnimation,
  rotateAnimation,
].filter(Boolean) as AnimationDefinition[];

function createBuiltInAnimationDefinitionPackage(
  label: string,
  manifestSource: string,
  logic: Parameters<typeof createAnimationDefinitionPackage>[1],
) {
  try {
    return createAnimationDefinitionPackage(manifestSource, logic);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load animation definition "${label}".`, error);
    toast.error(`Skipped animation "${label}": ${message}`);
    return null;
  }
}
