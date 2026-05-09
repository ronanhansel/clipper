import type { TransitionEffectPackage } from "../../types";
import { createTransitionEffectPackage } from "../../manifest";
import fadeManifest from "./fade/manifest.yml?raw";
import { fadeTransitionLogic } from "./fade/logic";
import filmBurnManifest from "./filmBurn/manifest.yml?raw";
import { filmBurnTransitionLogic } from "./filmBurn/logic";
import lightLeakBandsManifest from "./lightLeakBands/manifest.yml?raw";
import { lightLeakBandsTransitionLogic } from "./lightLeakBands/logic";
import scaleFadeManifest from "./scaleFade/manifest.yml?raw";
import { scaleFadeTransitionLogic } from "./scaleFade/logic";
import swipeManifest from "./swipe/manifest.yml?raw";
import { swipeTransitionLogic } from "./swipe/logic";

export const fadeTransitionEffect = createTransitionEffectPackage(
  fadeManifest,
  fadeTransitionLogic,
);
export const filmBurnTransitionEffect = createTransitionEffectPackage(
  filmBurnManifest,
  filmBurnTransitionLogic,
);
export const lightLeakBandsTransitionEffect = createTransitionEffectPackage(
  lightLeakBandsManifest,
  lightLeakBandsTransitionLogic,
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
  filmBurnTransitionEffect,
  lightLeakBandsTransitionEffect,
  fadeTransitionEffect,
  scaleFadeTransitionEffect,
] as const satisfies readonly TransitionEffectPackage[];
