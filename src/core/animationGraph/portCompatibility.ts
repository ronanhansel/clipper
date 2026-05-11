import type {
  AnimationGraphEdge,
  GraphPortDefinition,
  GraphPortType,
} from "./types";

export function areGraphPortsCompatible(
  fromPort: GraphPortDefinition | undefined,
  toPort: GraphPortDefinition | undefined,
) {
  return Boolean(
    fromPort &&
    toPort &&
    fromPort.direction === "output" &&
    toPort.direction === "input" &&
    areGraphPortTypesCompatible(fromPort.type, toPort.type),
  );
}

export function getGraphPortCompatibilityError(
  fromPort: GraphPortDefinition | undefined,
  toPort: GraphPortDefinition | undefined,
) {
  if (!fromPort) return "Missing output port.";
  if (!toPort) return "Missing input port.";
  if (fromPort.direction !== "output")
    return `${fromPort.label} is not an output.`;
  if (toPort.direction !== "input") return `${toPort.label} is not an input.`;
  if (areGraphPortTypesCompatible(fromPort.type, toPort.type)) return null;
  return `Cannot connect ${formatGraphPortType(fromPort.type)} to ${formatGraphPortType(toPort.type)}.`;
}

export function areGraphPortTypesCompatible(
  fromType: GraphPortType,
  toType: GraphPortType,
) {
  if (fromType.kind === "value") {
    return (
      toType.kind === "anyValue" ||
      (toType.kind === "value" && fromType.valueType === toType.valueType)
    );
  }
  if (fromType.kind === "field") {
    return (
      toType.kind === "anyValue" ||
      (toType.kind === "field" && fromType.valueType === toType.valueType)
    );
  }
  if (fromType.kind !== "animation" || toType.kind !== "animation")
    return false;
  if (!toType.structures?.length || !fromType.structures?.length) return true;
  return fromType.structures.some((structure) =>
    toType.structures?.includes(structure),
  );
}

export function validateAnimationGraphEdgePorts(input: {
  edge: AnimationGraphEdge;
  fromPort: GraphPortDefinition | undefined;
  toPort: GraphPortDefinition | undefined;
}) {
  const message = getGraphPortCompatibilityError(input.fromPort, input.toPort);
  return message
    ? [
        {
          severity: "error" as const,
          message,
          edgeId: input.edge.id,
          nodeId: input.toPort ? input.edge.to.nodeId : input.edge.from.nodeId,
          portId: input.toPort ? input.edge.to.portId : input.edge.from.portId,
          outputId: input.fromPort ? input.edge.from.portId : undefined,
        },
      ]
    : [];
}

function formatGraphPortType(type: GraphPortType) {
  if (type.kind === "value") return `Value.${type.valueType}`;
  if (type.kind === "field") return `Field.${type.valueType}`;
  if (type.kind === "anyValue") return "Value";
  return type.structures?.length
    ? `Animation.${type.structures.join("|")}`
    : "Animation";
}
