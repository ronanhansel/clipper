import type { MotionEffectPackage } from "../../types";
import { createMotionEffectPackage } from "../../manifest";
import panManifest from "./pan/manifest.yml?raw";
import { panMotionLogic } from "./pan/logic";
import perspectiveManifest from "./perspective/manifest.yml?raw";
import { perspectiveMotionLogic } from "./perspective/logic";
import rotateManifest from "./rotate/manifest.yml?raw";
import { rotateMotionLogic } from "./rotate/logic";
import zoomManifest from "./zoom/manifest.yml?raw";
import { zoomMotionLogic } from "./zoom/logic";

export const panMotionEffect = createMotionEffectPackage(
  panManifest,
  panMotionLogic,
);
export const perspectiveMotionEffect = createMotionEffectPackage(
  perspectiveManifest,
  perspectiveMotionLogic,
);
export const rotateMotionEffect = createMotionEffectPackage(
  rotateManifest,
  rotateMotionLogic,
);
export const zoomMotionEffect = createMotionEffectPackage(
  zoomManifest,
  zoomMotionLogic,
);

export const builtInMotionEffects = [
  zoomMotionEffect,
  panMotionEffect,
  rotateMotionEffect,
  perspectiveMotionEffect,
] as const satisfies readonly MotionEffectPackage[];
