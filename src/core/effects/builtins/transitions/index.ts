import type { TransitionEffectPackage } from "../../types";
import { createTransitionEffectPackage } from "../../manifest";
import fadeManifest from "./fade/manifest.yml?raw";
import { fadeTransitionLogic } from "./fade/logic";
import scaleFadeManifest from "./scaleFade/manifest.yml?raw";
import { scaleFadeTransitionLogic } from "./scaleFade/logic";
import swipeManifest from "./swipe/manifest.yml?raw";
import { swipeTransitionLogic } from "./swipe/logic";

export const fadeTransitionEffect = createTransitionEffectPackage(
  fadeManifest,
  fadeTransitionLogic,
);
export const scaleFadeTransitionEffect = createTransitionEffectPackage(
  scaleFadeManifest,
  scaleFadeTransitionLogic,
);
export const swipeTransitionEffect = createTransitionEffectPackage(
  swipeManifest,
  swipeTransitionLogic,
);

export const builtInTransitionEffects = [
  swipeTransitionEffect,
  fadeTransitionEffect,
  scaleFadeTransitionEffect,
] as const satisfies readonly TransitionEffectPackage[];
