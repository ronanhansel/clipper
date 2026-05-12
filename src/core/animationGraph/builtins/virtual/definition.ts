import type {
  AnimationGraphNodeDefinition,
  AnimationStream,
} from "../../types";
import {
  animationOutputPort,
  defaultAnimationController,
  readNumber,
  readString,
} from "../helpers";
import {
  graphicControlDefaults,
  graphicTextControlGroups,
  graphicTextDefaults,
} from "../../../graphics/inspectorSettings";

type VirtualTextConfig = Record<string, unknown>;

export const virtualTextNodeDefinition: AnimationGraphNodeDefinition = {
  kind: "virtual:text",
  label: "Text",
  category: "control",
  menuPath: "Source:Text",
  controls: graphicTextControlGroups,
  getPorts: () => [animationOutputPort("out", "Out", ["text"])],
  createDefaultConfig: () => graphicControlDefaults(graphicTextControlGroups),
  normalizeConfig: (config) =>
    typeof config === "object" && config ? config : {},
  execute: ({ node }, context) => {
    const config = node.config as VirtualTextConfig;
    const objectId = `graph:${context.graph.id}:${node.id}`;
    const content = readString(config, "content", graphicTextDefaults.content);
    const stream: AnimationStream = {
      id: `${node.id}:out:${objectId}`,
      structure: { kind: "text", objectId },
      controller: { ...defaultAnimationController },
      effects: [],
      renderObject: {
        id: objectId,
        name: readString(config, "name", "Text"),
        type: "text",
        selector: `.${objectId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        content,
        bounds: {
          x: readNumber(config, "x", graphicTextDefaults.x),
          y: readNumber(config, "y", graphicTextDefaults.y),
          width: readNumber(config, "width", graphicTextDefaults.width),
          height: readNumber(config, "height", graphicTextDefaults.height),
        },
        style: {
          color: readString(config, "color", graphicTextDefaults.color),
          fontSize: readNumber(
            config,
            "fontSize",
            graphicTextDefaults.fontSize,
          ),
          fontFamily: readString(
            config,
            "fontFamily",
            graphicTextDefaults.fontFamily,
          ),
          fontWeight: String(
            readNumber(config, "fontWeight", graphicTextDefaults.fontWeight),
          ),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: readString(
            config,
            "textAlign",
            graphicTextDefaults.textAlign,
          ),
          lineHeight: readNumber(
            config,
            "lineHeight",
            graphicTextDefaults.lineHeight,
          ),
          letterSpacing: readNumber(
            config,
            "letterSpacing",
            graphicTextDefaults.letterSpacing,
          ),
          backgroundColor: "transparent",
        },
        generatedByGraph: true,
      },
    };
    return { outputs: new Map([["out", [stream]]]) };
  },
};

export const virtualNodeDefinitions = [virtualTextNodeDefinition];
