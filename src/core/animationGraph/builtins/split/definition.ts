import type {
  AnimationGraphNodeDefinition,
  AnimationStream,
} from "../../types";
import {
  animationInputPort,
  animationOutputPort,
  cloneAnimationStream,
  isAnimationStream,
  readString,
} from "../helpers";

export const splitNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "split",
  label: "Split",
  category: "control",
  getPorts: () => [
    animationInputPort("in", "In", ["text"]),
    animationOutputPort("tokens", "Tokens", ["richText"]),
  ],
  createDefaultConfig: () => ({ mode: "word" }),
  normalizeConfig: (config) =>
    typeof config === "object" && config !== null ? config : { mode: "word" },
  execute: (input, context) => {
    const mode = readString(
      splitNodeDefinition.normalizeConfig(input.node.config) as object,
      "mode",
      "word",
    );
    const text =
      context.sourceObject?.richText?.map((segment) => segment.text).join("") ??
      context.sourceObject?.content ??
      "";
    const tokenCount =
      mode === "character"
        ? text.length
        : text.trim()
          ? text.trim().split(/\s+/).length
          : 0;
    const streams = (input.inputs.get("in") ?? [])
      .filter(isTextAnimationStream)
      .map((stream, index) =>
        cloneAnimationStream(stream, `${input.node.id}:tokens:${index}`, {
          kind: "richText",
          objectId: stream.structure.objectId,
          tokenIndexes: Array.from(
            { length: tokenCount },
            (_, tokenIndex) => tokenIndex,
          ),
        }),
      );
    return { outputs: new Map([["tokens", streams]]) };
  },
};

function isTextAnimationStream(stream: unknown): stream is AnimationStream & {
  structure: { kind: "text"; objectId: string };
} {
  return isAnimationStream(stream) && stream.structure.kind === "text";
}
