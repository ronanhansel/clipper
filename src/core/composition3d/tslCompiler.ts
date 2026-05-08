import type { Composition3dCompileOptions, Composition3dGraph, Composition3dNode, Composition3dNodeInput } from "./types";
import { getComposition3dSocketDefinition, isUniversalToScalarCast, type SocketType } from "../graphSockets";

export function compileComposition3dGraphToTsl(graph: Composition3dGraph, options: Composition3dCompileOptions) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outNode = nodes.get(graph.outNodeId);
  if (!outNode) throw new Error(`Composition3d graph missing out node '${graph.outNodeId}'.`);
  if (outNode.kind !== "out") throw new Error("Composition3d graph output must be an out node.");
  return resolveInput(outNode, "color", nodes, options, new Set());
}

function compileNode(node: Composition3dNode, nodes: Map<string, Composition3dNode>, options: Composition3dCompileOptions, stack: Set<string>): unknown {
  if (stack.has(node.id)) throw new Error(`Composition3d graph contains cycle at '${node.id}'.`);
  stack.add(node.id);
  assertRegisteredInputs(node);

  const { tsl } = options;
  let value: unknown;
  if (node.kind === "time") value = options.time ?? tsl.time;
  else if (node.kind === "uv") value = tsl.uv();
  else if (node.kind === "texture") value = compileTextureNode(node, nodes, options, stack);
  else if (node.kind === "color") value = compileColorNode(node, options);
  else if (node.kind === "mx_noise_vec3") value = tsl.mx_noise_vec3(resolveInput(node, "value", nodes, options, stack));
  else if (node.kind === "split_x") value = toChannelSocketValue(resolveInput(node, "value", nodes, options, stack), "x");
  else if (node.kind === "split_y") value = toChannelSocketValue(resolveInput(node, "value", nodes, options, stack), "y");
  else if (node.kind === "vec2") value = tsl.vec2(resolveInput(node, "x", nodes, options, stack), resolveInput(node, "y", nodes, options, stack));
  else if (node.kind === "mul") value = tsl.mul(...resolveVariadicInputs(node, nodes, options, stack, 2));
  else if (node.kind === "add") value = tsl.add(...resolveVariadicInputs(node, nodes, options, stack, 2));
  else if (node.kind === "sub") value = tsl.sub(resolveInput(node, "in0", nodes, options, stack), resolveInput(node, "in1", nodes, options, stack));
  else if (node.kind === "div") value = tsl.div(resolveInput(node, "in0", nodes, options, stack), resolveInput(node, "in1", nodes, options, stack));
  else if (node.kind === "abs") value = tsl.abs(resolveInput(node, "value", nodes, options, stack));
  else if (node.kind === "max") value = tsl.max(resolveInput(node, "in0", nodes, options, stack), resolveInput(node, "in1", nodes, options, stack));
  else if (node.kind === "min") value = tsl.min(resolveInput(node, "in0", nodes, options, stack), resolveInput(node, "in1", nodes, options, stack));
  else if (node.kind === "pow") value = tsl.pow(resolveInput(node, "value", nodes, options, stack), resolveInput(node, "exponent", nodes, options, stack));
  else if (node.kind === "sin") value = tsl.sin(resolveInput(node, "value", nodes, options, stack));
  else if (node.kind === "fract") value = tsl.fract(resolveInput(node, "value", nodes, options, stack));
  else if (node.kind === "clamp") value = tsl.clamp(resolveInput(node, "value", nodes, options, stack), resolveInput(node, "min", nodes, options, stack), resolveInput(node, "max", nodes, options, stack));
  else if (node.kind === "mix") value = tsl.mix(resolveInput(node, "x", nodes, options, stack), resolveInput(node, "y", nodes, options, stack), resolveInput(node, "a", nodes, options, stack));
  else if (node.kind === "smoothstep") value = tsl.smoothstep(resolveInput(node, "edge0", nodes, options, stack), resolveInput(node, "edge1", nodes, options, stack), resolveInput(node, "x", nodes, options, stack));
  else if (node.kind === "out") value = resolveInput(node, "color", nodes, options, stack);
  else throw new Error("Unsupported composition3d node kind.");

  stack.delete(node.id);
  return value;
}

function compileTextureNode(node: Composition3dNode, nodes: Map<string, Composition3dNode>, options: Composition3dCompileOptions, stack: Set<string>) {
  const asset = node.params?.asset;
  if (typeof asset !== "string" || asset.length === 0) throw new Error(`Composition3d texture node '${node.id}' requires string asset param.`);
  const uv = node.inputs?.uv ? resolveInputReference(node.inputs.uv, nodes, options, stack, "universal") : undefined;
  return options.tsl.texture(options.loadTexture(asset), uv);
}

function compileColorNode(node: Composition3dNode, options: Composition3dCompileOptions) {
  const value = node.params?.value;
  if (!Array.isArray(value) || value.length !== 4 || value.some((channel) => typeof channel !== "number")) throw new Error(`Composition3d color node '${node.id}' requires vec4 numeric value param.`);
  return options.tsl.color(...value);
}

function resolveInput(node: Composition3dNode, name: string, nodes: Map<string, Composition3dNode>, options: Composition3dCompileOptions, stack: Set<string>) {
  assertRegisteredInput(node, name);
  const input = node.inputs?.[name];
  if (!input) throw new Error(`Composition3d node '${node.id}' missing '${name}' input.`);
  return resolveInputReference(input, nodes, options, stack, getExpectedInputSocketType(node, name));
}

function resolveInputReference(input: Composition3dNodeInput, nodes: Map<string, Composition3dNode>, options: Composition3dCompileOptions, stack: Set<string>, expectedSocket?: SocketType) {
  const source = nodes.get(input.nodeId);
  if (!source) throw new Error(`Composition3d graph missing node '${input.nodeId}'.`);
  const value = compileNode(source, nodes, options, stack);
  const sourceSocket = getComposition3dSocketDefinition(source.kind)?.output;
  return sourceSocket && expectedSocket && isUniversalToScalarCast(sourceSocket, expectedSocket) ? toScalarSocketValue(value) : value;
}

function resolveVariadicInputs(node: Composition3dNode, nodes: Map<string, Composition3dNode>, options: Composition3dCompileOptions, stack: Set<string>, min = 1) {
  const entries = Object.entries(node.inputs ?? {}).sort(([left], [right]) => inputOrder(left) - inputOrder(right));
  for (const [name] of entries) assertRegisteredInput(node, name);
  if (entries.length < min) throw new Error(`Composition3d node '${node.id}' requires at least ${min} input${min === 1 ? "" : "s"}.`);
  return entries.map(([, input]) => resolveInputReference(input, nodes, options, stack));
}

function getExpectedInputSocketType(node: Composition3dNode, name: string): SocketType | undefined {
  const definition = getComposition3dSocketDefinition(node.kind);
  if (definition?.scalarInputs?.includes(name)) return "scalar";
  if (node.kind === "texture" && name === "uv") return "universal";
  if (node.kind === "mx_noise_vec3" && name === "value") return "universal";
  if ((node.kind === "split_x" || node.kind === "split_y") && name === "value") return "universal";
  if (node.kind === "sin" && name === "value") return "scalar";
  if (node.kind === "fract" && name === "value") return "scalar";
  if (node.kind === "clamp" && (name === "value" || name === "min" || name === "max")) return "scalar";
  if (node.kind === "out" && name === "color") return "universal";
  return undefined;
}

function assertRegisteredInput(node: Composition3dNode, name: string) {
  if (!isRegisteredInput(node.kind, name)) throw new Error(`Composition3d node '${node.id}' does not support '${name}' input.`);
}

function assertRegisteredInputs(node: Composition3dNode) {
  for (const name of Object.keys(node.inputs ?? {})) assertRegisteredInput(node, name);
}

function isRegisteredInput(kind: Composition3dNode["kind"], name: string) {
  if (kind === "out") return name === "color";
  if (kind === "texture") return name === "uv";
  if (kind === "mx_noise_vec3" || kind === "split_x" || kind === "split_y" || kind === "abs" || kind === "sin" || kind === "fract") return name === "value";
  if (kind === "vec2") return name === "x" || name === "y";
  if (kind === "sub" || kind === "div" || kind === "max" || kind === "min") return name === "in0" || name === "in1";
  if (kind === "pow") return name === "value" || name === "exponent";
  if (kind === "clamp") return name === "value" || name === "min" || name === "max";
  if (kind === "mix") return name === "x" || name === "y" || name === "a";
  if (kind === "smoothstep") return name === "edge0" || name === "edge1" || name === "x";
  if (kind === "mul" || kind === "add") return /^in\d+$/.test(name);
  return false;
}

function toChannelSocketValue(value: unknown, channel: "x" | "y") {
  if (value && typeof value === "object") {
    const candidate = value as { r?: unknown; g?: unknown; x?: unknown; y?: unknown };
    if (channel === "x" && candidate.x !== undefined) return candidate.x;
    if (channel === "x" && candidate.r !== undefined) return candidate.r;
    if (channel === "y" && candidate.y !== undefined) return candidate.y;
    if (channel === "y" && candidate.g !== undefined) return candidate.g;
  }
  return value;
}

function toScalarSocketValue(value: unknown) {
  if (value && typeof value === "object") {
    const candidate = value as { r?: unknown; x?: unknown };
    if (candidate.r !== undefined) return candidate.r;
    if (candidate.x !== undefined) return candidate.x;
  }
  return value;
}

function inputOrder(name: string) {
  const number = Number(name.replace(/^in/, ""));
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
}
