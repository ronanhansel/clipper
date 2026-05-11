import type { AnimationGraphNodePackage } from "../types";
import { createAnimationGraphNodePackage } from "../manifest";
import toast from "react-hot-toast";
import conditionManifest from "./condition/manifest.yml?raw";
import { conditionNodeLogic } from "./condition/logic";
import effectManifest from "./effect/manifest.yml?raw";
import { effectNodeLogic } from "./effect/logic";
import groupManifest from "./group/manifest.yml?raw";
import { groupNodeLogic } from "./group/logic";
import outManifest from "./out/manifest.yml?raw";
import { outNodeLogic } from "./out/logic";
import sourceManifest from "./source/manifest.yml?raw";
import { sourceNodeLogic } from "./source/logic";
import splitManifest from "./split/manifest.yml?raw";
import { splitNodeLogic } from "./split/logic";
import timeManifest from "./time/manifest.yml?raw";
import { timeNodeLogic } from "./time/logic";

export const sourceNodePackage = createBuiltInAnimationGraphNodePackage(
  "Source",
  sourceManifest,
  sourceNodeLogic,
);
export const timeNodePackage = createBuiltInAnimationGraphNodePackage(
  "Time",
  timeManifest,
  timeNodeLogic,
);
export const splitNodePackage = createBuiltInAnimationGraphNodePackage(
  "Split",
  splitManifest,
  splitNodeLogic,
);
export const conditionNodePackage = createBuiltInAnimationGraphNodePackage(
  "Condition",
  conditionManifest,
  conditionNodeLogic,
);
export const effectNodePackage = createBuiltInAnimationGraphNodePackage(
  "Effect Mix",
  effectManifest,
  effectNodeLogic,
);
export const groupNodePackage = createBuiltInAnimationGraphNodePackage(
  "Group",
  groupManifest,
  groupNodeLogic,
);
export const outNodePackage = createBuiltInAnimationGraphNodePackage(
  "Out",
  outManifest,
  outNodeLogic,
);

export const builtInAnimationGraphNodePackages = [
  sourceNodePackage,
  timeNodePackage,
  splitNodePackage,
  conditionNodePackage,
  effectNodePackage,
  groupNodePackage,
  outNodePackage,
].filter(Boolean) as AnimationGraphNodePackage[];

function createBuiltInAnimationGraphNodePackage(
  label: string,
  manifestSource: string,
  logic: Partial<AnimationGraphNodePackage>,
) {
  try {
    return {
      ...createAnimationGraphNodePackage(manifestSource),
      ...logic,
    } as AnimationGraphNodePackage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to load animation graph node package "${label}".`,
      error,
    );
    toast.error(`Skipped graph node "${label}": ${message}`);
    return null;
  }
}
