import type { AdjustmentEffectPackage } from "../../types";
import { createAdjustmentEffectPackage } from "../../manifest";
import blurManifest from "./blur/manifest.yml?raw";
import { blurLogic } from "./blur/logic";
import boomerangManifest from "./boomerang/manifest.yml?raw";
import { boomerangLogic } from "./boomerang/logic";
import colourGradeManifest from "./colourGrade/manifest.yml?raw";
import { colourGradeLogic } from "./colourGrade/logic";
import filmDustManifest from "./filmDust/manifest.yml?raw";
import { filmDustLogic } from "./filmDust/logic";
import filmScratchesManifest from "./filmScratches/manifest.yml?raw";
import { filmScratchesLogic } from "./filmScratches/logic";
import frameSkipManifest from "./frameSkip/manifest.yml?raw";
import { frameSkipLogic } from "./frameSkip/logic";
import freezeFrameManifest from "./freezeFrame/manifest.yml?raw";
import { freezeFrameLogic } from "./freezeFrame/logic";
import lightLeakManifest from "./lightLeak/manifest.yml?raw";
import { lightLeakLogic } from "./lightLeak/logic";
import lenseManifest from "./lense/manifest.yml?raw";
import { lenseLogic } from "./lense/logic";
import loopStutterManifest from "./loopStutter/manifest.yml?raw";
import { loopStutterLogic } from "./loopStutter/logic";
import reverseManifest from "./reverse/manifest.yml?raw";
import { reverseLogic } from "./reverse/logic";
import speedChangeManifest from "./speedChange/manifest.yml?raw";
import { speedChangeLogic } from "./speedChange/logic";
import vignetteManifest from "./vignette/manifest.yml?raw";
import { vignetteLogic } from "./vignette/logic";

export { getFrameSkipEvery, quantizeFrameSkipTime } from "./frameSkip/logic";
export { getLoopWindow } from "./loopStutter/logic";
export { getSpeed } from "./speedChange/logic";

export const blurEffect = createAdjustmentEffectPackage(blurManifest, blurLogic);
export const boomerangEffect = createAdjustmentEffectPackage(boomerangManifest, boomerangLogic);
export const colourGradeEffect = createAdjustmentEffectPackage(colourGradeManifest, colourGradeLogic);
export const filmDustEffect = createAdjustmentEffectPackage(filmDustManifest, filmDustLogic);
export const filmScratchesEffect = createAdjustmentEffectPackage(filmScratchesManifest, filmScratchesLogic);
export const frameSkipEffect = createAdjustmentEffectPackage(frameSkipManifest, frameSkipLogic);
export const freezeFrameEffect = createAdjustmentEffectPackage(freezeFrameManifest, freezeFrameLogic);
export const lightLeakEffect = createAdjustmentEffectPackage(lightLeakManifest, lightLeakLogic);
export const lenseEffect = createAdjustmentEffectPackage(lenseManifest, lenseLogic);
export const loopStutterEffect = createAdjustmentEffectPackage(loopStutterManifest, loopStutterLogic);
export const reverseEffect = createAdjustmentEffectPackage(reverseManifest, reverseLogic);
export const speedChangeEffect = createAdjustmentEffectPackage(speedChangeManifest, speedChangeLogic);
export const vignetteEffect = createAdjustmentEffectPackage(vignetteManifest, vignetteLogic);

export const builtInAdjustmentEffects = [
  frameSkipEffect,
  freezeFrameEffect,
  speedChangeEffect,
  loopStutterEffect,
  reverseEffect,
  boomerangEffect,
  colourGradeEffect,
  blurEffect,
  filmDustEffect,
  filmScratchesEffect,
  vignetteEffect,
  lightLeakEffect,
  lenseEffect,
] as const satisfies readonly AdjustmentEffectPackage[];
