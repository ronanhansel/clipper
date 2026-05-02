import type { AdjustmentEffectDefinition, MotionEffectDefinition, TransitionEffectDefinition } from "../types";
import type { AdjustmentEffectPackage, MotionEffectPackage, TransitionEffectPackage } from "./types";
import { createAdjustmentLayer } from "./builtins/adjustments/helpers";

type MotionEffectManifest = MotionEffectDefinition;
type AdjustmentEffectManifest = AdjustmentEffectDefinition;
type TransitionEffectManifest = TransitionEffectDefinition;

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export type MotionEffectLogic = Pick<MotionEffectPackage, "createDefaultBlock">;

export type AdjustmentEffectLogic = Partial<Pick<AdjustmentEffectPackage, "applySceneTime" | "applyVisualStyle" | "getDisplayElapsed" | "validate">>;

export type TransitionEffectLogic = Partial<Pick<TransitionEffectPackage, "applyVisualStyle">>;

export function createMotionEffectPackage(manifestSource: string, logic: MotionEffectLogic): MotionEffectPackage {
  return { ...parseEffectManifest<MotionEffectManifest>(manifestSource), ...logic };
}

export function createAdjustmentEffectPackage(manifestSource: string, logic: AdjustmentEffectLogic = {}): AdjustmentEffectPackage {
  const manifest = parseEffectManifest<AdjustmentEffectManifest>(manifestSource);
  return {
    ...manifest,
    ...logic,
    createDefaultLayer: (input) => createAdjustmentLayer(input, manifest.name, manifest.id, manifest.defaultParams),
  };
}

export function createTransitionEffectPackage(manifestSource: string, logic: TransitionEffectLogic = {}): TransitionEffectPackage {
  const manifest = parseEffectManifest<TransitionEffectManifest>(manifestSource);
  return {
    ...manifest,
    ...logic,
    createDefaultLayer: (input) => ({
      id: input.id,
      layerId: input.layerId,
      name: manifest.name,
      start: input.start,
      duration: input.duration,
      midPoint: input.midPoint,
      effect: { effectId: manifest.id, params: manifest.defaultParams },
    }),
  };
}

function parseEffectManifest<T>(source: string): T {
  const lines = source.split(/\r?\n/);
  const root: Record<string, YamlValue> = {};
  const stack: { indent: number; value: Record<string, YamlValue> | YamlValue[] }[] = [{ indent: -1, value: root }];

  for (const rawLine of lines) {
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const line = withoutComment.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();

    const parent = stack[stack.length - 1].value;
    if (line.startsWith("- ")) {
      if (!Array.isArray(parent)) throw new Error(`Invalid manifest list item: ${rawLine}`);
      const item = parseListItem(line.slice(2));
      parent.push(item);
      if (isRecord(item)) stack.push({ indent, value: item });
      continue;
    }

    if (Array.isArray(parent)) throw new Error(`Invalid manifest object field inside list: ${rawLine}`);
    const separator = line.indexOf(":");
    if (separator < 0) throw new Error(`Invalid manifest line: ${rawLine}`);

    const key = line.slice(0, separator).trim();
    const valueSource = line.slice(separator + 1).trim();
    if (!valueSource) {
      const nextContainer = getNextContainer(lines, rawLine, indent);
      parent[key] = nextContainer;
      stack.push({ indent, value: nextContainer });
      continue;
    }

    parent[key] = parseScalarOrInline(valueSource);
  }

  normalizeEffectGroups(root);
  return root as T;
}

function normalizeEffectGroups(root: Record<string, YamlValue>) {
  const groups = root.groups;
  if (Array.isArray(groups)) {
    const normalized = groups.map((group) => String(group).trim()).filter(Boolean);
    root.groups = normalized;
    root.group = normalized.join("/");
    return;
  }

  if (typeof root.group === "string") root.groups = root.group.split("/").map((group) => group.trim()).filter(Boolean);
}

function getNextContainer(lines: string[], currentLine: string, currentIndent: number): Record<string, YamlValue> | YamlValue[] {
  const start = lines.indexOf(currentLine) + 1;
  for (const line of lines.slice(start)) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent <= currentIndent) return {};
    return line.trim().startsWith("- ") ? [] : {};
  }
  return {};
}

function parseListItem(source: string): YamlValue {
  if (!source.includes(":")) return parseScalarOrInline(source);
  const separator = source.indexOf(":");
  const key = source.slice(0, separator).trim();
  const valueSource = source.slice(separator + 1).trim();
  return { [key]: parseScalarOrInline(valueSource) };
}

function parseScalarOrInline(source: string): YamlValue {
  if (source.startsWith("{") || source.startsWith("[")) return JSON.parse(source);
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(source)) return Number(source);
  return source.replace(/^"(.*)"$/, "$1");
}

function isRecord(value: YamlValue): value is Record<string, YamlValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
