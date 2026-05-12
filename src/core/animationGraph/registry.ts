import { builtInAnimationGraphNodePackages } from "./builtins";
import {
  animationInputPort,
  animationOutputPort,
  cloneAnimationStream,
  isAnimationStream,
} from "./builtins/helpers";
import { conditionNodeDefinition } from "./builtins/condition/definition";
import { macroNodeDefinition } from "./builtins/macro/definition";
import { geometryNodeDefinitions } from "./builtins/geometry/definition";
import { outNodeDefinition } from "./builtins/out/definition";
import { sourceNodeDefinition } from "./builtins/source/definition";
import { splitNodeDefinition } from "./builtins/split/definition";
import { timeNodeDefinition } from "./builtins/time/definition";
import { valueNodeDefinitions } from "./builtins/value/definition";
import { virtualNodeDefinitions } from "./builtins/virtual/definition";
import type { EffectPackage } from "../effects/types";
import { getGraphEffectPackages } from "../effects/registry";
import type {
  AnimationController,
  AnimationGraphDiagnostic,
  AnimationGraphNodeDefinition,
  AnimationGraphNodePackage,
  Field,
  GraphPortDefinition,
  GraphStream,
  ValueStream,
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
  const controls = getGraphParamControls(effectPackage);
  return {
    kind: `effect:${effectPackage.id}`,
    label: graphMetadata?.label ?? effectPackage.label,
    category: "effect",
    ...(controls.length
      ? {
          controls: [
            {
              id: "parameters",
              fields: controls.map((control) => ({
                key: control.key,
                label: control.label,
                type:
                  control.type === "number"
                    ? ("number" as const)
                    : control.type === "boolean"
                      ? undefined
                      : control.type === "color"
                        ? ("color" as const)
                        : undefined,
                defaultValue: control.defaultValue,
                min: "min" in control ? control.min : undefined,
                max: "max" in control ? control.max : undefined,
                step: "step" in control ? control.step : undefined,
                options:
                  control.type === "select" ? control.options : undefined,
              })),
            },
          ],
        }
      : {}),
    getPorts: () => [
      animationInputPort(
        "in",
        "In",
        acceptedStructureKinds,
        undefined,
        "multi",
      ),
      ...getGraphParameterTypeBusPorts(effectPackage),
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
      const parameterResult = getGraphValueInputParams(effectPackage, inputs);
      const config = node.config as { params?: Record<string, unknown> };
      const params = {
        ...getGraphDefaultParams(effectPackage),
        ...(config?.params ?? {}),
        ...parameterResult.params,
      };
      const inputStreams = (inputs.get("in") ?? []).filter(isAnimationStream);
      const unsupported = inputStreams.filter(
        (stream) =>
          !(acceptedStructureKinds?.includes(stream.structure.kind) ?? true),
      );
      const output = inputStreams
        .filter((stream) => !unsupported.includes(stream))
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
      return {
        outputs: new Map([["out", output]]),
        diagnostics: [
          ...parameterResult.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            nodeId: node.id,
          })),
          ...unsupported.map((stream) => ({
            severity: "error" as const,
            message: `Effect package "${effectPackage.id}" does not support "${stream.structure.kind}" streams.`,
            nodeId: node.id,
            portId: "in",
          })),
        ],
      };
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
  macroNodeDefinition,
  ...geometryNodeDefinitions,
  ...virtualNodeDefinitions,
  ...valueNodeDefinitions,
  outNodeDefinition,
  ...getGraphEffectPackages().map(createEffectAnimationGraphNodeDefinition),
]);

function getGraphParameterPorts(effectPackage: EffectPackage) {
  return getGraphParamControls(effectPackage).map((control) => ({
    id: control.key,
    label: control.label,
    direction: "input" as const,
    cardinality:
      effectPackage.graph?.paramPorts?.[control.key]?.conflict === "multi"
        ? ("multi" as const)
        : ("single" as const),
    type: effectPackage.graph?.paramPorts?.[control.key]?.acceptsField
      ? { kind: "anyValue" as const }
      : {
          kind: "value" as const,
          valueType: getGraphParamValueType(
            effectPackage,
            control.key,
            control.type,
          ),
        },
    role: "parameter" as const,
  }));
}

function getGraphParameterTypeBusPorts(effectPackage: EffectPackage) {
  const ports = new Map<string, GraphPortDefinition>();
  for (const control of getGraphParamControls(effectPackage)) {
    const type = effectPackage.graph?.paramPorts?.[control.key]?.acceptsField
      ? ("anyValue" as const)
      : getGraphParamValueType(effectPackage, control.key, control.type);
    const key = typeof type === "string" ? `value:${type}` : type;
    if (ports.has(key)) continue;
    ports.set(
      key,
      type === "anyValue"
        ? anyValueInputPort("input:anyValue", "Value Inputs", "multi")
        : valueInputPort(
            `input:${type}`,
            `${formatValueTypeLabel(type)} Inputs`,
            type,
            "multi",
          ),
    );
  }
  return Array.from(ports.values());
}

function valueInputPort(
  id: string,
  label: string,
  valueType: ValueStreamType,
  cardinality: GraphPortDefinition["cardinality"] = "single",
): GraphPortDefinition {
  return {
    id,
    label,
    direction: "input",
    cardinality,
    type: { kind: "value", valueType },
    role: "parameter",
  };
}

function anyValueInputPort(
  id: string,
  label: string,
  cardinality: GraphPortDefinition["cardinality"] = "single",
): GraphPortDefinition {
  return {
    id,
    label,
    direction: "input",
    cardinality,
    type: { kind: "anyValue" },
    role: "parameter",
  };
}

function formatValueTypeLabel(valueType: ValueStreamType) {
  return valueType
    .replace(/Array$/, " Array")
    .replace(/^[a-z]/, (match) => match.toUpperCase());
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
  inputs: ReadonlyMap<string, readonly GraphStream[]>,
) {
  const params: Record<string, unknown> = {};
  const diagnostics: AnimationGraphDiagnostic[] = [];
  for (const control of getGraphParamControls(effectPackage)) {
    const streams = (inputs.get(control.key) ?? []).filter(
      isValueOrFieldStream,
    );
    if (!streams.length) continue;
    const metadata = effectPackage.graph?.paramPorts?.[control.key];
    const conflict = metadata?.conflict ?? "single";
    if (streams.length > 1 && conflict !== "multi") {
      diagnostics.push({
        severity: conflict === "error" ? "error" : "warning",
        message: `Parameter port "${control.key}" received ${streams.length} values; using first value.`,
        portId: control.key,
      });
    }
    const accepted = streams.filter((stream) =>
      acceptsParamStream(effectPackage, control.key, control.type, stream),
    );
    if (accepted.length !== streams.length) {
      diagnostics.push({
        severity: "error",
        message: `Parameter port "${control.key}" received incompatible value type.`,
        portId: control.key,
      });
    }
    if (!accepted.length) continue;
    params[control.key] =
      conflict === "multi"
        ? accepted.map(readParamStreamValue)
        : readParamStreamValue(accepted[0]);
  }
  return { params, diagnostics };
}

function getValueType(controlType: string): ValueStreamType {
  if (controlType === "boolean") return "boolean";
  if (controlType === "color") return "color";
  if (controlType === "select") return "string";
  return "number";
}

function getGraphParamValueType(
  effectPackage: EffectPackage,
  key: string,
  controlType: string,
) {
  return (
    effectPackage.graph?.paramPorts?.[key]?.valueType ??
    getValueType(controlType)
  );
}

function isValueOrFieldStream(stream: GraphStream): stream is ValueStream {
  return "valueType" in stream && "value" in stream;
}

function acceptsParamStream(
  effectPackage: EffectPackage,
  key: string,
  controlType: string,
  stream: ValueStream,
) {
  const metadata = effectPackage.graph?.paramPorts?.[key];
  if (isFieldValue(stream.value) && metadata?.acceptsField !== true)
    return false;
  return (
    stream.valueType === getGraphParamValueType(effectPackage, key, controlType)
  );
}

function readParamStreamValue(stream: ValueStream) {
  return stream.value;
}

function isFieldValue(value: unknown): value is Field {
  return typeof value === "object" && value !== null && "kind" in value;
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
