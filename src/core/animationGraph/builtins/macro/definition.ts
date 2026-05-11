import type {
  AnimationGraphMacroNodeConfig,
  AnimationGraphNodeDefinition,
  GraphPortDefinition,
} from "../../types";

export const macroNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "macro",
  label: "Macro",
  category: "control",
  getPorts: (node) => [...normalizeMacroNodeConfig(node.config).ports],
  createDefaultConfig: () => ({ macroId: "", ports: [] }),
  normalizeConfig: normalizeMacroNodeConfig,
  execute: () => ({ outputs: new Map() }),
};

function normalizeMacroNodeConfig(
  config: unknown,
): AnimationGraphMacroNodeConfig {
  if (typeof config !== "object" || config === null)
    return { macroId: "", ports: [] };
  const candidate = config as Partial<AnimationGraphMacroNodeConfig>;
  return {
    macroId: typeof candidate.macroId === "string" ? candidate.macroId : "",
    ports: Array.isArray(candidate.ports)
      ? candidate.ports.filter(isMacroPort)
      : [],
    defaults:
      typeof candidate.defaults === "object" && candidate.defaults !== null
        ? candidate.defaults
        : undefined,
  };
}

function isMacroPort(port: unknown): port is GraphPortDefinition {
  if (typeof port !== "object" || port === null) return false;
  const candidate = port as GraphPortDefinition;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    (candidate.direction === "input" || candidate.direction === "output") &&
    (candidate.cardinality === "single" || candidate.cardinality === "multi") &&
    typeof candidate.type === "object" &&
    candidate.type !== null
  );
}
