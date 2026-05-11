import { builtInAnimationGraphNodePackages } from "./builtins";
import {
  animationInputPort,
  animationOutputPort,
  cloneAnimationStream,
  isAnimationStream,
} from "./builtins/helpers";
import { conditionNodeDefinition } from "./builtins/condition/definition";
import { outNodeDefinition } from "./builtins/out/definition";
import { sourceNodeDefinition } from "./builtins/source/definition";
import { splitNodeDefinition } from "./builtins/split/definition";
import { timeNodeDefinition } from "./builtins/time/definition";
import { valueNodeDefinitions } from "./builtins/value/definition";
import type { EffectPackage } from "../effects/types";
import { getGraphEffectPackages } from "../effects/registry";
import type {
  AnimationController,
  AnimationGraphNodeDefinition,
  AnimationGraphNodePackage,
  ValueStreamType,
} from "./types";

export const animationGraphNodeRegistry = new Map<
  string,
  AnimationGraphNodePackage
>();

export function registerAnimationGraphNodePackage(
  packageDefinition: AnimationGraphNodePackage,
) {
  animationGraphNodeRegistry.set(packageDefinition.kind, packageDefinition);
}

export function registerAnimationGraphNodePackages(
  packageDefinitions: readonly AnimationGraphNodePackage[],
) {
  for (const packageDefinition of packageDefinitions)
    registerAnimationGraphNodePackage(packageDefinition);
}

registerAnimationGraphNodePackages(builtInAnimationGraphNodePackages);

export const animationGraphNodeDefinitions = Object.fromEntries(
  animationGraphNodeRegistry.entries(),
);

const noopExecute: AnimationGraphNodeDefinition["execute"] = () => ({
  outputs: new Map(),
});

export const strictAnimationGraphNodeDefinitionRegistry = new Map<
  string,
  AnimationGraphNodeDefinition
>();

export function registerAnimationGraphNodeDefinition(
  definition: AnimationGraphNodeDefinition,
) {
  strictAnimationGraphNodeDefinitionRegistry.set(definition.kind, definition);
}

export function registerAnimationGraphNodeDefinitions(
  definitions: readonly AnimationGraphNodeDefinition[],
) {
  for (const definition of definitions)
    registerAnimationGraphNodeDefinition(definition);
}

export function getAnimationGraphNodeDefinition(kind: string) {
  return strictAnimationGraphNodeDefinitionRegistry.get(kind);
}

export function getAnimationGraphNodeDefinitions() {
  return Array.from(strictAnimationGraphNodeDefinitionRegistry.values());
}

export function createEffectAnimationGraphNodeDefinition(
  effectPackage: EffectPackage,
): AnimationGraphNodeDefinition {
  const graphMetadata = effectPackage.graph;
  const acceptedStructureKinds = graphMetadata?.acceptedStructureKinds;
  return {
    kind: `effect:${effectPackage.id}`,
    label: graphMetadata?.label ?? effectPackage.label,
    category: "effect",
    getPorts: () => [
      animationInputPort("in", "In", acceptedStructureKinds),
      ...getGraphParameterPorts(effectPackage),
      animationOutputPort("out", "Out", acceptedStructureKinds),
    ],
    createDefaultConfig: () => ({
      effectId: effectPackage.id,
      params: getGraphDefaultParams(effectPackage),
    }),
    normalizeConfig: (config) => {
      const params =
        typeof config === "object" &&
        config !== null &&
        typeof (config as { params?: unknown }).params === "object" &&
        (config as { params?: unknown }).params !== null
          ? (config as { params: Record<string, unknown> }).params
          : {};
      return {
        effectId: effectPackage.id,
        params: { ...getGraphDefaultParams(effectPackage), ...params },
      };
    },
    execute: ({ node, inputs }) => {
      const config = node.config as { params?: Record<string, unknown> };
      const params = {
        ...getGraphDefaultParams(effectPackage),
        ...(config?.params ?? {}),
        ...getGraphValueInputParams(effectPackage, inputs),
      };
      const output = (inputs.get("in") ?? [])
        .filter(isAnimationStream)
        .filter(
          (stream) =>
            acceptedStructureKinds?.includes(stream.structure.kind) ?? true,
        )
        .map((stream, index) => {
          const next = cloneAnimationStream(stream, `${node.id}:out:${index}`);
          next.effects.push({
            id: `${node.id}:effect:${index}`,
            effectId: effectPackage.id,
            params,
            target: next.structure,
            controller: cloneAnimationController(stream.controller),
          });
          return next;
        });
      return { outputs: new Map([["out", output]]) };
    },
  };
}

export function registerEffectAnimationGraphNodeDefinition(
  effectPackage: EffectPackage,
) {
  registerAnimationGraphNodeDefinition(
    createEffectAnimationGraphNodeDefinition(effectPackage),
  );
}

registerAnimationGraphNodeDefinitions([
  sourceNodeDefinition,
  timeNodeDefinition,
  splitNodeDefinition,
  conditionNodeDefinition,
  ...valueNodeDefinitions,
  outNodeDefinition,
  ...getGraphEffectPackages().map(createEffectAnimationGraphNodeDefinition),
]);

function getGraphParameterPorts(effectPackage: EffectPackage) {
  return getGraphParamControls(effectPackage).map((control) => ({
    id: control.key,
    label: control.label,
    direction: "input" as const,
    cardinality: "single" as const,
    type: { kind: "value" as const, valueType: getValueType(control.type) },
    role: "parameter" as const,
  }));
}

function getGraphParamControls(effectPackage: EffectPackage) {
  return (
    effectPackage.graph?.paramControls ??
    ("paramControls" in effectPackage
      ? effectPackage.paramControls
      : undefined) ??
    []
  );
}

function getGraphDefaultParams(effectPackage: EffectPackage) {
  const defaults =
    effectPackage.graph?.defaultParams ??
    ("defaultParams" in effectPackage
      ? effectPackage.defaultParams
      : undefined) ??
    {};
  return {
    ...defaults,
    ...Object.fromEntries(
      getGraphParamControls(effectPackage).map((control) => [
        control.key,
        control.defaultValue,
      ]),
    ),
  };
}

function getGraphValueInputParams(
  effectPackage: EffectPackage,
  inputs: ReadonlyMap<string, readonly unknown[]>,
) {
  return Object.fromEntries(
    getGraphParamControls(effectPackage).flatMap((control) => {
      const stream = inputs.get(control.key)?.[0];
      return stream && typeof stream === "object" && "value" in stream
        ? [[control.key, stream.value]]
        : [];
    }),
  );
}

function getValueType(controlType: string): ValueStreamType {
  if (controlType === "boolean") return "boolean";
  if (controlType === "color") return "color";
  if (controlType === "select") return "string";
  return "number";
}

function cloneAnimationController(
  controller: AnimationController,
): AnimationController {
  return {
    ...controller,
    repeat: controller.repeat ? { ...controller.repeat } : undefined,
    stagger: controller.stagger ? { ...controller.stagger } : undefined,
  };
}
