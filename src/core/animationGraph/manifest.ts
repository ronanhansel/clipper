import type {
  AnimationGraphNodeManifest,
  AnimationGraphNodePackage,
} from "./types";

type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

export function createAnimationGraphNodePackage(
  manifestSource: string,
): AnimationGraphNodePackage {
  return parseAnimationGraphManifest(
    manifestSource,
  ) as AnimationGraphNodePackage;
}

function parseAnimationGraphManifest(
  source: string,
): AnimationGraphNodeManifest {
  const lines = source.split(/\r?\n/);
  const root: Record<string, YamlValue> = {};
  const stack: {
    indent: number;
    value: Record<string, YamlValue> | YamlValue[];
  }[] = [{ indent: -1, value: root }];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const line = withoutComment.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent)
      stack.pop();

    const parent = stack[stack.length - 1].value;
    if (line.startsWith("- ")) {
      if (!Array.isArray(parent))
        throw new Error(
          `Invalid animation graph manifest list item: ${rawLine}`,
        );
      const item = parseListItem(line.slice(2));
      parent.push(item);
      if (isRecord(item)) stack.push({ indent, value: item });
      continue;
    }

    if (Array.isArray(parent))
      throw new Error(
        `Invalid animation graph manifest object field inside list: ${rawLine}`,
      );
    const separator = line.indexOf(":");
    if (separator < 0)
      throw new Error(`Invalid animation graph manifest line: ${rawLine}`);

    const key = line.slice(0, separator).trim();
    let valueSource = line.slice(separator + 1).trim();
    if (valueSource === "[" || valueSource === "{") {
      const continuation = collectInlineBlock(lines, index, valueSource);
      valueSource = continuation.source;
      index = continuation.endIndex;
    }
    if (!valueSource) {
      const inlineBlock = getNextInlineBlock(lines, index, indent);
      if (inlineBlock) {
        parent[key] = parseScalarOrInline(inlineBlock.source);
        index = inlineBlock.endIndex;
        continue;
      }
      const nextContainer = getNextContainer(lines, rawLine, indent);
      parent[key] = nextContainer;
      stack.push({ indent, value: nextContainer });
      continue;
    }

    parent[key] = parseScalarOrInline(valueSource);
  }

  return root as unknown as AnimationGraphNodeManifest;
}

function collectInlineBlock(
  lines: string[],
  startIndex: number,
  opener: string,
) {
  const closer = opener === "[" ? "]" : "}";
  const parts = [opener];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    parts.push(line);
    if (line === closer || line.endsWith(closer))
      return { source: parts.join(""), endIndex: index };
  }
  return { source: parts.join(""), endIndex: startIndex };
}

function getNextInlineBlock(
  lines: string[],
  startIndex: number,
  currentIndent: number,
) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const withoutComment = rawLine.replace(/\s+#.*$/, "");
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^\s*/)?.[0].length ?? 0;
    const line = withoutComment.trim();
    if (indent <= currentIndent) return null;
    if (line === "[" || line === "{")
      return collectInlineBlock(lines, index, line);
    return null;
  }
  return null;
}

function getNextContainer(
  lines: string[],
  currentLine: string,
  currentIndent: number,
): Record<string, YamlValue> | YamlValue[] {
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
  if (source.startsWith("{") || source.startsWith("["))
    return JSON.parse(stripJsonTrailingCommas(source));
  if (source === "true") return true;
  if (source === "false") return false;
  if (source === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(source)) return Number(source);
  return source.replace(/^"(.*)"$/, "$1");
}

function stripJsonTrailingCommas(source: string) {
  return source.replace(/,\s*([}\]])/g, "$1");
}

function isRecord(value: YamlValue): value is Record<string, YamlValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
