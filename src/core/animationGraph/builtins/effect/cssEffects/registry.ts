import { builtInAnimationDefinitions } from ".";
import type { AnimationDefinition } from "./types";

export type {
  AnimationControllerField,
  AnimationControllerFieldGroup,
  AnimationDefinition,
  AnimationMaterializationContext,
} from "./types";

const animationDefinitionRegistry = new Map<string, AnimationDefinition>();

export function registerAnimationDefinitionPackage(
  definition: AnimationDefinition,
) {
  animationDefinitionRegistry.set(definition.property, definition);
}

export function registerAnimationDefinitionPackages(
  definitions: readonly AnimationDefinition[],
) {
  for (const definition of definitions)
    registerAnimationDefinitionPackage(definition);
}

registerAnimationDefinitionPackages(builtInAnimationDefinitions);

export const animationDefinitions = Array.from(
  animationDefinitionRegistry.values(),
);

export function getAnimationDefinition(property: string | undefined) {
  return property ? animationDefinitionRegistry.get(property) : undefined;
}

export function getAnimationDefinitionCategories() {
  return Array.from(
    new Set(animationDefinitions.map((definition) => definition.category)),
  );
}
