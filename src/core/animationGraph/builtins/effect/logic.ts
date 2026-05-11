import type { AnimationGraphNodePackage } from "../../types";
import { registerAnimationGraphConnectionRule } from "../../ruleRegistry";
import { parsePrimitive, readPrimitive, readString } from "../helpers";
import { getAnimationDefinition } from "./cssEffects/registry";

export const effectNodeLogic = {
  normalizeConfig: (config) => ({
    effects: readCssEffects(config),
  }),
} as const satisfies Partial<AnimationGraphNodePackage>;

function readCssEffects(config: object) {
  if (
    "effects" in config &&
    Array.isArray((config as { effects?: unknown }).effects) &&
    (config as { effects: unknown[] }).effects.length
  )
    return (config as { effects: Record<string, unknown>[] }).effects.flatMap(
      normalizeCssEffect,
    );
  const property = readString(config, "property", "");
  return normalizeCssEffect({
    property,
    from: readPrimitive(config, "from"),
    to: readPrimitive(config, "to"),
    values: readAnimationValues(config),
  });
}

function normalizeCssEffect(effect: Record<string, unknown>) {
  const property = typeof effect.property === "string" ? effect.property : "";
  const definition = getAnimationDefinition(property);
  if (!definition) return [];
  const values = Object.fromEntries(
    definition.fieldGroups
      .flatMap((group) => group.fields)
      .flatMap((field) => {
        const value = readEffectValue(effect, field.key);
        return value === undefined
          ? [[field.key, parsePrimitive(field.defaultValue)]]
          : [[field.key, value]];
      }),
  );
  return [{ property, values }];
}

function readEffectValue(effect: Record<string, unknown>, key: string) {
  if (key === "from" && effect.from !== undefined) return effect.from;
  if (key === "to" && effect.to !== undefined) return effect.to;
  const values = effect.values;
  if (values && typeof values === "object" && !Array.isArray(values))
    return (values as Record<string, unknown>)[key];
  return effect[key];
}

function readAnimationValues(config: object) {
  return Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) =>
      key === "property" ||
      key === "from" ||
      key === "to" ||
      typeof value === "object"
        ? []
        : [[key, typeof value === "string" ? parsePrimitive(value) : value]],
    ),
  );
}

registerAnimationGraphConnectionRule(
  "noDuplicateEffectForTime",
  ({ from, to, existingEdges, nodes }) => {
    if (to.kind !== "time") return true;
    const effectKind = from.details?.property;
    if (!effectKind) return true;
    return !existingEdges.some((edge) => {
      if (edge.toNodeId !== to.id || edge.fromNodeId === from.id) return false;
      const existingNode = nodes.find((node) => node.id === edge.fromNodeId);
      return existingNode?.details?.property === effectKind;
    });
  },
);
