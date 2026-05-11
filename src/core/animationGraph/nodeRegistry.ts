import type {
  AnimationGraphNodePosition,
  TypedAnimationGraphNode,
} from "../types";
import { animationGraphNodeDefinitions as registryDefinitions } from "./registry";

const definitions = registryDefinitions as Record<
  TypedAnimationGraphNode["kind"],
  (typeof registryDefinitions)[string]
>;

export const animationGraphNodeDefinitions = definitions;

export function createTypedAnimationGraphNode(
  id: string,
  kind: TypedAnimationGraphNode["kind"],
  position: AnimationGraphNodePosition,
  config:
    | Partial<TypedAnimationGraphNode["config"]>
    | Record<string, string> = {},
  label?: string,
): TypedAnimationGraphNode {
  const definition = definitions[kind];
  const normalizedConfig = definition.normalizeConfig?.(config) ?? {};
  return {
    id,
    kind,
    label: label || definition.label,
    position,
    x: position.x,
    y: position.y,
    inputs: definition.inputs,
    outputs: definition.outputs,
    config: normalizedConfig,
  } as TypedAnimationGraphNode;
}
