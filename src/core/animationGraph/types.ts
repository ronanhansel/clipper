import type {
  AnimationGraphEdge as LegacyAnimationGraphEdge,
  AnimationGraphValueType,
  EffectId,
  FrameObjectType,
  MotionEase,
  TypedAnimationGraphNode,
  TypedAnimationGraphSocket,
} from "../types";
import type { EffectPackage } from "../effects/types";

export type GraphNodeId = string;
export type GraphEdgeId = string;
export type GraphPortId = string;

export type AnimationGraphViewport = {
  scrollLeft: number;
  scrollTop: number;
  zoom?: number;
};

export type AnimationGraph = {
  id: string;
  sourceObjectId: string;
  nodes: Record<GraphNodeId, AnimationGraphNode>;
  edges: AnimationGraphEdge[];
  viewport?: AnimationGraphViewport;
};

export type AnimationGraphNode = {
  id: GraphNodeId;
  kind: string;
  position: { x: number; y: number };
  config: unknown;
};

export type AnimationGraphEdge = {
  id: GraphEdgeId;
  from: { nodeId: GraphNodeId; portId: GraphPortId };
  to: { nodeId: GraphNodeId; portId: GraphPortId };
};

export type GraphPortDirection = "input" | "output";
export type GraphPortCardinality = "single" | "multi";
export type GraphStreamKind = "animation" | "value";
export type ValueStreamType =
  | "string"
  | "number"
  | "color"
  | "boolean"
  | "stringArray"
  | "numberArray";

export type GraphPortType =
  | { kind: "animation"; structures?: readonly StructureStream["kind"][] }
  | { kind: "value"; valueType: ValueStreamType }
  | { kind: "anyValue" };

export type GraphPortRole =
  | "main"
  | "parameter"
  | "condition-default"
  | "condition-output";

export type GraphPortDefinition = {
  id: GraphPortId;
  label: string;
  direction: GraphPortDirection;
  cardinality: GraphPortCardinality;
  type: GraphPortType;
  role?: GraphPortRole;
};

export type StructureStream =
  | { kind: "text"; objectId: string }
  | { kind: "richText"; objectId: string; tokenIndexes: number[] }
  | { kind: "shape"; objectId: string }
  | { kind: "object"; objectId: string };

export type AnimationController = {
  start: number;
  delay: number;
  duration: number;
  ease: MotionEase;
  schedule: "relative" | "absolute";
  repeat?: {
    count: number | "infinite";
    delay: number;
    mode: "loop" | "reverse" | "mirror";
  };
  stagger?: {
    amount: number;
    order: "forward" | "reverse" | "center";
    scope: "item" | "sequence";
  };
};

export type EffectInstruction = {
  id: string;
  effectId: EffectId;
  params: Record<string, unknown>;
  target: StructureStream;
  controller: AnimationController;
};

export type AnimationStream = {
  id: string;
  structure: StructureStream;
  controller: AnimationController;
  effects: EffectInstruction[];
};

export type ValueStream = {
  id: string;
  valueType: ValueStreamType;
  value: unknown;
};

export type GraphStream = AnimationStream | ValueStream;

export type AnimationGraphDiagnosticSeverity = "error" | "warning";
export type AnimationGraphDiagnostic = {
  severity: AnimationGraphDiagnosticSeverity;
  message: string;
  nodeId?: GraphNodeId;
  edgeId?: GraphEdgeId;
  portId?: GraphPortId;
};

export type AnimationGraphStreamTrace = {
  streamId: string;
  kind: GraphStreamKind;
  structureKind?: StructureStream["kind"];
  tokenCount?: number;
  valueType?: ValueStreamType;
  effectCount?: number;
  controller?: Pick<
    AnimationController,
    "start" | "delay" | "duration" | "ease"
  >;
};

export type AnimationGraphExecutionTraceEvent =
  | {
      type: "node";
      nodeId: GraphNodeId;
      nodeKind: string;
      inputs: Record<GraphPortId, AnimationGraphStreamTrace[]>;
      outputs: Record<GraphPortId, AnimationGraphStreamTrace[]>;
    }
  | {
      type: "edge";
      edgeId: GraphEdgeId;
      from: { nodeId: GraphNodeId; portId: GraphPortId };
      to: { nodeId: GraphNodeId; portId: GraphPortId };
      streams: AnimationGraphStreamTrace[];
    };

export type AnimationGraphExecutionTrace = {
  events: AnimationGraphExecutionTraceEvent[];
};

export type ConditionOutputPortConfig = {
  id: GraphPortId;
  label: string;
};

export type AnimationGraphConditionConfig = {
  outputs?: readonly ConditionOutputPortConfig[];
  rules: readonly {
    target: "value" | "type";
    operator:
      | "equals"
      | "contains"
      | "notContains"
      | "gt"
      | "lt"
      | "gte"
      | "lte";
    value: string | number;
    action: "setDelay" | "sendToOutput" | "duplicateToOutput";
    output: GraphPortId;
    delay?: number;
  }[];
};

export type NodeCreationContext = {
  graphId: string;
  sourceObjectId?: string;
  effectPackage?: EffectPackage;
};

export type NodeExecutionInput = {
  node: AnimationGraphNode;
  inputs: ReadonlyMap<GraphPortId, readonly GraphStream[]>;
};

export type CompileContext = {
  graph: AnimationGraph;
  sourceObject?: {
    id: string;
    type: FrameObjectType;
    content?: string;
    richText?: readonly { text: string }[];
  };
  connectedOutputPorts?: ReadonlySet<GraphPortId>;
};

export type NodeExecutionResult = {
  outputs: ReadonlyMap<GraphPortId, readonly GraphStream[]>;
  diagnostics?: readonly AnimationGraphDiagnostic[];
};

export type AnimationGraphNodeDefinition = {
  kind: string;
  label: string;
  category: "control" | "value" | "effect";
  getPorts(node: AnimationGraphNode): GraphPortDefinition[];
  createDefaultConfig(context: NodeCreationContext): unknown;
  normalizeConfig(config: unknown): unknown;
  execute(
    input: NodeExecutionInput,
    context: CompileContext,
  ): NodeExecutionResult;
};

export type AnimationGraphNodeManifestSocket = {
  id: string;
  label: string;
  type: AnimationGraphValueType;
  accepts?: readonly AnimationGraphValueType[];
};

export type AnimationGraphNodeManifest = {
  id: string;
  kind: TypedAnimationGraphNode["kind"];
  name: string;
  label: string;
  inputs: readonly AnimationGraphNodeManifestSocket[];
  outputs: readonly AnimationGraphNodeManifestSocket[];
  connectionRules?: readonly string[];
  flow?: {
    producesController?: boolean;
    timingMode?: "stack" | "overlay";
    transparent?: boolean;
  };
};

export type AnimationGraphNodePackage = AnimationGraphNodeManifest & {
  inputs: readonly TypedAnimationGraphSocket[];
  outputs: readonly TypedAnimationGraphSocket[];
  normalizeConfig?(config: object): TypedAnimationGraphNode["config"];
  getOutputPortCount?(
    node: { id?: string; details?: Record<string, string> },
    edges?: readonly LegacyAnimationGraphEdge[],
  ): number;
  getNextOutputSocket?(
    node: { id: string; details?: Record<string, string> },
    edges: readonly LegacyAnimationGraphEdge[],
  ): string;
};
