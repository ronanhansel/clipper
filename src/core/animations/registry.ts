import { builtInAnimationDefinitions } from "./builtins";
import type { AnimationDefinition } from "./types";

export type {
  AnimationControllerField,
  AnimationControllerFieldGroup,
  AnimationDefinition,
  AnimationMaterializationContext,
} from "./types";

export { builtInAnimationDefinitions } from "./builtins";

export const installedAnimationDefinitions = [
  ...builtInAnimationDefinitions,
] as const satisfies readonly AnimationDefinition[];

export const animationDefinitionRegistry = new Map(
  installedAnimationDefinitions.map((definition) => [definition.property, definition]),
);

export const animationDefinitions = installedAnimationDefinitions;

export function getAnimationDefinition(property: string | undefined) {
  return property ? animationDefinitionRegistry.get(property) : undefined;
}

export function getAnimationDefinitionCategories() {
  return Array.from(new Set(installedAnimationDefinitions.map((definition) => definition.category)));
}
