import type {
  AnimationDefinition,
  AnimationLogic,
  AnimationManifest,
} from "./types";

export function createAnimationDefinitionPackage(
  manifestSource: string,
  logic: AnimationLogic,
): AnimationDefinition {
  return { ...parseAnimationDefinitionManifest(manifestSource), ...logic };
}

export function parseAnimationDefinitionManifest(
  manifestSource: string,
): AnimationManifest {
  return JSON.parse(
    stripJsonTrailingCommas(manifestSource),
  ) as AnimationManifest;
}

function stripJsonTrailingCommas(source: string) {
  return source.replace(/,\s*([}\]])/g, "$1");
}
