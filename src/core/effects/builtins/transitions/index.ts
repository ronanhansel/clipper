import type { TransitionEffectPackage } from "../../types";
import { createTransitionEffectPackage } from "../../manifest";
import swipeManifest from "./swipe/manifest.yml?raw";
import { swipeTransitionLogic } from "./swipe/logic";

export const swipeTransitionEffect = createTransitionEffectPackage(swipeManifest, swipeTransitionLogic);

export const builtInTransitionEffects = [
  swipeTransitionEffect,
] as const satisfies readonly TransitionEffectPackage[];
