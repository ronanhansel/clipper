import type {
  AnimationGraphConditionConfig,
  AnimationGraphNodeDefinition,
  AnimationStream,
  AttributeContext,
  Field,
  GraphPortId,
  GraphStream,
  AnimationGraphDiagnostic,
  ValueStream,
} from "../../types";
import {
  attributeField,
  compareField,
  constantField,
  evaluateBooleanMask,
} from "../../fields";
import {
  animationInputPort,
  animationOutputPort,
  cloneAnimationStream,
  isAnimationStream,
  isValueStream,
} from "../helpers";

export const conditionNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "condition",
  label: "Condition",
  category: "control",
  getPorts: (node) => [
    animationInputPort("in", "In"),
    animationOutputPort("default", "Default", undefined, "condition-default"),
    ...(normalizeConditionConfig(node.config).outputs ?? []).map((output) =>
      animationOutputPort(
        output.id,
        output.label,
        undefined,
        "condition-output",
      ),
    ),
  ],
  createDefaultConfig: () => ({ outputs: [], rules: [] }),
  normalizeConfig: normalizeConditionConfig,
  execute: (input, context) => {
    const config = normalizeConditionConfig(input.node.config);
    const connected = context.connectedOutputPorts ?? new Set<GraphPortId>();
    const outputStreams = new Map<GraphPortId, GraphStream[]>();
    const diagnostics: AnimationGraphDiagnostic[] = [];
    const push = (portId: GraphPortId, stream: GraphStream) => {
      if (!connected.has(portId)) {
        diagnostics.push({
          severity: "warning",
          message: `Condition output "${portId}" is disconnected; matching streams were dropped.`,
          nodeId: input.node.id,
          portId,
          outputId: portId,
        });
        return;
      }
      outputStreams.set(portId, [...(outputStreams.get(portId) ?? []), stream]);
    };

    for (const stream of input.inputs.get("in") ?? []) {
      if (isRichTextAnimationStream(stream)) {
        diagnostics.push(
          ...routeRichTextStream(
            stream,
            config,
            push,
            input.node.id,
            getTokens(context),
          ),
        );
      } else if (isAnimationStream(stream) || isValueStream(stream)) {
        routeWholeStream(stream, config, push, input.node.id);
      }
    }

    return { outputs: outputStreams, diagnostics };
  },
};

function routeRichTextStream(
  stream: AnimationStream & {
    structure: {
      kind: "richText";
      objectId: string;
      domain: "textToken";
      tokenIndexes: number[];
    };
  },
  config: AnimationGraphConditionConfig,
  push: (portId: GraphPortId, stream: GraphStream) => void,
  nodeId: string,
  tokens: readonly string[],
) {
  const diagnostics: AnimationGraphDiagnostic[] = [];
  const defaultIndexes: number[] = [];
  const sent = new Map<GraphPortId, number[]>();
  const duplicated = new Map<GraphPortId, number[]>();
  const contexts = stream.structure.tokenIndexes.map((tokenIndex) =>
    createTextTokenContext(
      stream.structure.objectId,
      tokenIndex,
      tokens[tokenIndex] ?? tokenIndex,
    ),
  );
  const ruleMasks = config.rules.map((rule) => {
    const result = evaluateBooleanMask(ruleToField(rule), {
      domain: "textToken",
      items: contexts,
    });
    diagnostics.push(...result.diagnostics);
    return result.mask;
  });

  for (
    let activeIndex = 0;
    activeIndex < stream.structure.tokenIndexes.length;
    activeIndex += 1
  ) {
    const tokenIndex = stream.structure.tokenIndexes[activeIndex];
    let moved = false;
    for (let ruleIndex = 0; ruleIndex < config.rules.length; ruleIndex += 1) {
      const rule = config.rules[ruleIndex];
      if (!ruleMasks[ruleIndex]?.[activeIndex]) continue;
      if (rule.action === "duplicateToOutput") {
        duplicated.set(rule.output, [
          ...(duplicated.get(rule.output) ?? []),
          tokenIndex,
        ]);
        continue;
      }
      if (rule.action === "sendToOutput") {
        sent.set(rule.output, [...(sent.get(rule.output) ?? []), tokenIndex]);
        moved = true;
        break;
      }
    }
    if (!moved) defaultIndexes.push(tokenIndex);
  }

  for (const [portId, tokenIndexes] of sent)
    push(portId, richTextSubset(stream, nodeId, portId, tokenIndexes));
  for (const [portId, tokenIndexes] of duplicated)
    push(portId, richTextSubset(stream, nodeId, portId, tokenIndexes));
  if (defaultIndexes.length)
    push("default", richTextSubset(stream, nodeId, "default", defaultIndexes));
  return diagnostics;
}

function getTokens(
  context: Parameters<AnimationGraphNodeDefinition["execute"]>[1],
) {
  const text =
    context.sourceObject?.richText?.map((segment) => segment.text).join("") ??
    context.sourceObject?.content ??
    "";
  return text.match(/\S+/g) ?? [];
}

function createTextTokenContext(
  objectId: string,
  index: number,
  value: string | number,
): AttributeContext {
  return { objectId, index, value, type: "textToken" };
}

function ruleToField(
  rule: AnimationGraphConditionConfig["rules"][number],
): Field<boolean> {
  return compareField(
    attributeField(rule.target === "type" ? "type" : "value"),
    rule.operator,
    constantField(rule.value),
  );
}

function routeWholeStream(
  stream: AnimationStream | ValueStream,
  config: AnimationGraphConditionConfig,
  push: (portId: GraphPortId, stream: GraphStream) => void,
  nodeId: string,
) {
  let moved = false;
  for (const rule of config.rules) {
    if (
      !matchesRule(
        isValueStream(stream) ? stream.value : stream.structure.kind,
        rule,
      )
    )
      continue;
    if (rule.action === "duplicateToOutput")
      push(rule.output, copyStream(stream, nodeId, rule.output));
    if (rule.action === "sendToOutput") {
      push(rule.output, copyStream(stream, nodeId, rule.output));
      moved = true;
      break;
    }
  }
  if (!moved) push("default", copyStream(stream, nodeId, "default"));
}

function matchesRule(
  value: unknown,
  rule: AnimationGraphConditionConfig["rules"][number],
) {
  const actual = String(value);
  const expected = String(rule.value);
  if (rule.operator === "equals") return actual === expected;
  if (rule.operator === "contains") return actual.includes(expected);
  if (rule.operator === "notContains") return !actual.includes(expected);
  const actualNumber = Number(value);
  const expectedNumber = Number(rule.value);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber))
    return false;
  if (rule.operator === "gt") return actualNumber > expectedNumber;
  if (rule.operator === "lt") return actualNumber < expectedNumber;
  if (rule.operator === "gte") return actualNumber >= expectedNumber;
  if (rule.operator === "lte") return actualNumber <= expectedNumber;
  return false;
}

function richTextSubset(
  stream: AnimationStream & {
    structure: { kind: "richText"; objectId: string; tokenIndexes: number[] };
  },
  nodeId: string,
  portId: GraphPortId,
  tokenIndexes: number[],
) {
  return cloneAnimationStream(
    stream,
    `${nodeId}:${portId}:${tokenIndexes.join(".")}`,
    {
      ...stream.structure,
      tokenIndexes,
      selection: {
        domain: "textToken",
        mask: stream.structure.tokenIndexes.map((tokenIndex) =>
          tokenIndexes.includes(tokenIndex),
        ),
      },
    },
  );
}

function isRichTextAnimationStream(
  stream: GraphStream,
): stream is AnimationStream & {
  structure: {
    kind: "richText";
    objectId: string;
    domain: "textToken";
    tokenIndexes: number[];
  };
} {
  return isAnimationStream(stream) && stream.structure.kind === "richText";
}

function copyStream(
  stream: AnimationStream | ValueStream,
  nodeId: string,
  portId: GraphPortId,
) {
  return isAnimationStream(stream)
    ? cloneAnimationStream(stream, `${nodeId}:${portId}`)
    : { ...stream, id: `${nodeId}:${portId}` };
}

export function normalizeConditionConfig(
  config: unknown,
): AnimationGraphConditionConfig {
  if (typeof config !== "object" || config === null)
    return { outputs: [], rules: [] };
  const source = config as Partial<AnimationGraphConditionConfig>;
  return {
    outputs: Array.isArray(source.outputs) ? source.outputs : [],
    rules: Array.isArray(source.rules) ? source.rules : [],
  };
}
