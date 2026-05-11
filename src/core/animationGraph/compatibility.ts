import type {
  AnimationGraphEdge,
  AnimationGraphValueType,
  TypedAnimationGraphState,
} from "../types";
import type { TypedAnimationGraphNode } from "../types";

const friendlyTypeLabels: Record<AnimationGraphValueType, string> = {
  "Structure.Shape": "Shape",
  "Structure.TextObject": "Text",
  "Structure.RichTextObject": "Rich Text",
  "Structure.Object": "Object",
  "Value.String": "String",
  "Value.Number": "Number",
  "Value.Color": "Color",
  "Value.Boolean": "Boolean",
  "Value.StringArray": "String Array",
  "Value.NumberArray": "Number Array",
  "Effect.CSSEffect": "CSS Effect",
  AnimationController: "Animation Controller",
  CompiledAnimation: "Compiled Animation",
};

function friendlyType(type: string): string {
  return friendlyTypeLabels[type as AnimationGraphValueType] ?? type;
}

function friendlyAccepts(accepts: readonly string[]): string {
  return accepts.map(friendlyType).join(", ");
}

export function isTypedAnimationGraphEdgeCompatible(
  graph: TypedAnimationGraphState,
  edge: AnimationGraphEdge,
) {
  const fromNode = graph.nodes[edge.fromNodeId];
  const toNode = graph.nodes[edge.toNodeId];
  if (!fromNode || !toNode) return false;
  const fromSocket = fromNode.outputs.find(
    (socket) => socket.id === edge.fromSocket,
  );
  const toSocket = toNode.inputs.find((socket) => socket.id === edge.toSocket);
  return areTypedSocketsCompatible(fromSocket, toSocket);
}

export function canConnectTypedAnimationGraphNodes(
  fromNode: TypedAnimationGraphNode,
  toNode: TypedAnimationGraphNode,
  fromSocketId?: string,
  toSocketId?: string,
) {
  return (
    getTypedAnimationGraphConnectionError(
      fromNode,
      toNode,
      fromSocketId,
      toSocketId,
    ) === null
  );
}

export function getTypedAnimationGraphConnectionError(
  fromNode: TypedAnimationGraphNode,
  toNode: TypedAnimationGraphNode,
  fromSocketId?: string,
  toSocketId?: string,
) {
  const fromSocket = fromSocketId
    ? fromNode.outputs.find((socket) => socket.id === fromSocketId)
    : fromNode.outputs[0];
  if (!fromSocket)
    return fromSocketId
      ? `${fromNode.label} has no output socket "${fromSocketId}".`
      : `${fromNode.label} has no output socket.`;
  const toSocket = toSocketId
    ? toNode.inputs.find((socket) => socket.id === toSocketId)
    : toNode.inputs.find(
        (candidate) =>
          candidate.type === fromSocket.type ||
          candidate.accepts?.includes(fromSocket.type),
      );
  if (!toSocket)
    return toSocketId
      ? `${toNode.label} has no input socket "${toSocketId}".`
      : `Cannot connect ${friendlyType(fromSocket.type)} to ${toNode.label}.`;
  if (areTypedSocketsCompatible(fromSocket, toSocket)) return null;
  const accepted = toSocket.accepts?.length
    ? friendlyAccepts(toSocket.accepts)
    : friendlyType(toSocket.type);
  return `Cannot connect ${friendlyType(fromSocket.type)} to ${accepted}.`;
}

function areTypedSocketsCompatible(
  fromSocket: { type: string } | undefined,
  toSocket: { type: string; accepts?: readonly string[] } | undefined,
) {
  return Boolean(
    fromSocket &&
    toSocket &&
    (fromSocket.type === toSocket.type ||
      toSocket.accepts?.includes(fromSocket.type)),
  );
}
