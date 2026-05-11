import type { AdjustmentEffectPackage } from "../../types";
import { createAdjustmentEffectPackage } from "../../manifest";
import blurManifest from "./blur/manifest.yml?raw";
import { blurLogic } from "./blur/logic";
import opacityManifest from "./opacity/manifest.yml?raw";
import { opacityLogic } from "./opacity/logic";
import boomerangManifest from "./boomerang/manifest.yml?raw";
import { boomerangLogic } from "./boomerang/logic";
import colourGradeManifest from "./colourGrade/manifest.yml?raw";
import { colourGradeLogic } from "./colourGrade/logic";
import directionalBlurManifest from "./directionalBlur/manifest.yml?raw";
import { directionalBlurLogic } from "./directionalBlur/logic";
import filmEmulationManifest from "./filmEmulation/manifest.yml?raw";
import { filmEmulationLogic } from "./filmEmulation/logic";
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
import lensManifest from "./lens/manifest.yml?raw";
import { lensLogic } from "./lens/logic";
import loopStutterManifest from "./loopStutter/manifest.yml?raw";
import { loopStutterLogic } from "./loopStutter/logic";
import glowBlurManifest from "./glowBlur/manifest.yml?raw";
import { glowBlurLogic } from "./glowBlur/logic";
import pixelBlurManifest from "./pixelBlur/manifest.yml?raw";
import { pixelBlurLogic } from "./pixelBlur/logic";
import radialBlurManifest from "./radialBlur/manifest.yml?raw";
import { radialBlurLogic } from "./radialBlur/logic";
import reverseManifest from "./reverse/manifest.yml?raw";
import { reverseLogic } from "./reverse/logic";
import speedChangeManifest from "./speedChange/manifest.yml?raw";
import { speedChangeLogic } from "./speedChange/logic";
import vignetteManifest from "./vignette/manifest.yml?raw";
import { vignetteLogic } from "./vignette/logic";
import vhsTrackingManifest from "./vhsTracking/manifest.yml?raw";
import { vhsTrackingLogic } from "./vhsTracking/logic";

export { getFrameSkipEvery, quantizeFrameSkipTime } from "./frameSkip/logic";
export { getLoopWindow } from "./loopStutter/logic";
export { getSpeed } from "./speedChange/logic";

export const blurEffect = createAdjustmentEffectPackage(
  blurManifest,
  blurLogic,
);
export const opacityEffect = createAdjustmentEffectPackage(
  opacityManifest,
  opacityLogic,
);
export const boomerangEffect = createAdjustmentEffectPackage(
  boomerangManifest,
  boomerangLogic,
);
export const colourGradeEffect = createAdjustmentEffectPackage(
  colourGradeManifest,
  colourGradeLogic,
);
export const directionalBlurEffect = createAdjustmentEffectPackage(
  directionalBlurManifest,
  directionalBlurLogic,
);
export const filmEmulationEffect = createAdjustmentEffectPackage(
  filmEmulationManifest,
  filmEmulationLogic,
);
export const filmDustEffect = createAdjustmentEffectPackage(
  filmDustManifest,
  filmDustLogic,
);
export const filmScratchesEffect = createAdjustmentEffectPackage(
  filmScratchesManifest,
  filmScratchesLogic,
);
export const frameSkipEffect = createAdjustmentEffectPackage(
  frameSkipManifest,
  frameSkipLogic,
);
export const freezeFrameEffect = createAdjustmentEffectPackage(
  freezeFrameManifest,
  freezeFrameLogic,
);
export const glowBlurEffect = createAdjustmentEffectPackage(
  glowBlurManifest,
  glowBlurLogic,
);
export const lightLeakEffect = createAdjustmentEffectPackage(
  lightLeakManifest,
  lightLeakLogic,
);
export const lensEffect = createAdjustmentEffectPackage(
  lensManifest,
  lensLogic,
);
export const loopStutterEffect = createAdjustmentEffectPackage(
  loopStutterManifest,
  loopStutterLogic,
);
export const pixelBlurEffect = createAdjustmentEffectPackage(
  pixelBlurManifest,
  pixelBlurLogic,
);
export const radialBlurEffect = createAdjustmentEffectPackage(
  radialBlurManifest,
  radialBlurLogic,
);
export const reverseEffect = createAdjustmentEffectPackage(
  reverseManifest,
  reverseLogic,
);
export const speedChangeEffect = createAdjustmentEffectPackage(
  speedChangeManifest,
  speedChangeLogic,
);
export const vignetteEffect = createAdjustmentEffectPackage(
  vignetteManifest,
  vignetteLogic,
);
export const vhsTrackingEffect = createAdjustmentEffectPackage(
  vhsTrackingManifest,
  vhsTrackingLogic,
);

export const builtInAdjustmentEffects = [
  frameSkipEffect,
  freezeFrameEffect,
  speedChangeEffect,
  loopStutterEffect,
  reverseEffect,
  boomerangEffect,
  colourGradeEffect,
  opacityEffect,
  blurEffect,
  directionalBlurEffect,
  radialBlurEffect,
  glowBlurEffect,
  pixelBlurEffect,
  filmEmulationEffect,
  filmDustEffect,
  filmScratchesEffect,
  vignetteEffect,
  lightLeakEffect,
  lensEffect,
  vhsTrackingEffect,
] as const satisfies readonly AdjustmentEffectPackage[];
