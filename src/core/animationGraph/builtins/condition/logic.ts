import { nanoid } from "nanoid";
import type { AnimationGraphNodePackage } from "../../types";
import { readNumber, readPrimitive, readString } from "../helpers";

export const conditionNodeLogic = {
  normalizeConfig: (config) => {
    if ("rules" in config && Array.isArray(config.rules)) return config;
    const count = Math.min(
      4,
      Math.max(1, Math.trunc(readNumber(config, "conditionCount", 1))),
    );
    return {
      rules: Array.from({ length: count }, (_, index) => {
        const suffix = index === 0 ? "" : String(index + 1);
        return {
          target: "value",
          operator:
            readString(config, `matchType${suffix}`, "textEquals") ===
            "textEquals"
              ? "equals"
              : "contains",
          value: readPrimitive(config, `value${suffix}`) ?? "",
          action: readConditionAction(config, `action${suffix}`),
          output: readConditionOutput(config, suffix, index + 1),
          delay: readNumber(config, `delay${suffix}`, 0),
        };
      }),
    };
  },
  getOutputPortCount: (node, edges = []) => {
    if (!node.id) return 0;
    return new Set(
      edges
        .filter((edge) => edge.fromNodeId === node.id)
        .map((edge) => readOutputSocketId(edge.fromSocket))
        .filter(Boolean),
    ).size;
  },
  getNextOutputSocket: (node, edges) => {
    const used = new Set(
      edges
        .filter((edge) => edge.fromNodeId === node.id)
        .map((edge) => readOutputSocketId(edge.fromSocket))
        .filter(Boolean),
    );
    let socketId = makeConditionSocketId();
    while (used.has(socketId)) socketId = makeConditionSocketId();
    return `output:${socketId}`;
  },
} as const satisfies Partial<AnimationGraphNodePackage>;

function readConditionAction(config: object, key: string) {
  const value = readString(config, key, "setDelay");
  return value === "sendToOutput" || value === "duplicateToOutput"
    ? value
    : "setDelay";
}

function readConditionOutput(config: object, suffix: string, fallback: number) {
  return readString(
    config,
    `outputPort${suffix}`,
    readString(config, `output${suffix}`, String(fallback)),
  );
}

function readOutputSocketId(socketId: string | undefined) {
  return socketId?.match(/^output:(.+)$/)?.[1];
}

function makeConditionSocketId() {
  return nanoid(2);
}

import { registerAnimationGraphConnectionRule } from "../../ruleRegistry";

registerAnimationGraphConnectionRule(
  "activeConditionOutput",
  ({ from, edge }) => {
    const output = readOutputSocketId(edge.fromSocket);
    if (!output) return true;
    return edge.fromSocket?.startsWith("output:") ?? false;
  },
);
