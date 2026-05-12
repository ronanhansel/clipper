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
  macros?: Record<string, AnimationGraphMacro>;
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
  | "vector"
  | "stringArray"
  | "numberArray"
  | "colorArray"
  | "booleanArray"
  | "vectorArray";

export type GraphPortType =
  | { kind: "animation"; structures?: readonly StructureStream["kind"][] }
  | { kind: "value"; valueType: ValueStreamType }
  | { kind: "field"; valueType: ValueStreamType }
  | { kind: "anyValue" };

export type GraphPortRole =
  | "main"
  | "parameter"
  | "condition-default"
  | "condition-output"
  | "macro-input"
  | "macro-output";

export type AnimationGraphMacro = {
  id: string;
  label: string;
  ports: readonly GraphPortDefinition[];
  nodes: Record<GraphNodeId, AnimationGraphNode>;
  edges: AnimationGraphEdge[];
  defaults?: Record<GraphPortId, unknown>;
};

export type AnimationGraphMacroNodeConfig = {
  macroId: string;
  ports: readonly GraphPortDefinition[];
  defaults?: Record<GraphPortId, unknown>;
};

export type EvaluationDomain =
  | "object"
  | "textToken"
  | "valueArray"
  | "shapeElement"
  | "shape"
  | "pathPoint"
  | "pathSegment"
  | "contour"
  | "instance";

export type FieldAttributeName =
  | "objectId"
  | "index"
  | "value"
  | "type"
  | "time"
  | "position"
  | "bounds"
  | string;

export type AttributeContext = {
  objectId?: string;
  index?: number;
  value?: unknown;
  type?: string;
  time?: number;
  position?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  tangent?: { x: number; y: number };
  normal?: { x: number; y: number };
  count?: number;
  length?: number;
  color?: string;
  opacity?: number;
  custom?: Record<string, unknown>;
};

export type GeometryPoint = {
  x: number;
  y: number;
  tangent?: { x: number; y: number };
  normal?: { x: number; y: number };
  attributes?: Record<string, unknown>;
};

export type GeometryPath = {
  type: "path";
  points: GeometryPoint[];
  closed?: boolean;
  strokeWidth?: number;
  attributes?: Record<string, unknown>;
};

export type GeometryShape = {
  type: "shape";
  paths: GeometryPath[];
  color?: string;
  opacity?: number;
  attributes?: Record<string, unknown>;
};

export type GeometryShapeGroup = {
  type: "shapeGroup";
  shapes: GeometryShape[];
  instances?: GeometryInstance[];
  attributes?: Record<string, unknown>;
};

export type GeometryMesh2d = {
  type: "mesh2d";
  vertices: GeometryPoint[];
  indices: number[];
  attributes?: Record<string, unknown>;
};

export type GeometryInstance = {
  shape: GeometryShape | GeometryPath;
  position: { x: number; y: number };
  rotation?: number;
  scale?: number;
  color?: string;
  opacity?: number;
  attributes?: Record<string, unknown>;
};

export type GeneratedGeometry =
  | GeometryShape
  | GeometryPath
  | GeometryShapeGroup
  | GeometryMesh2d;

export type FieldOperator =
  | "equals"
  | "contains"
  | "notContains"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type Field<T = unknown> =
  | { kind: "constant"; value: T }
  | { kind: "attribute"; name: FieldAttributeName }
  | { kind: "math"; operator: MathFieldOperator; inputs: readonly Field[] }
  | {
      kind: "random";
      seed: string | number;
      min?: Field<number>;
      max?: Field<number>;
    }
  | {
      kind: "compare";
      operator: FieldOperator;
      left: Field;
      right: Field;
    };

export type MathFieldOperator =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "clamp"
  | "remap"
  | "min"
  | "max"
  | "abs"
  | "round";

export type DomainMask = {
  domain: EvaluationDomain;
  mask: boolean[];
};

export type FieldEvaluationContext = {
  domain: EvaluationDomain;
  items: readonly AttributeContext[];
  time?: number;
  frame?: number;
};

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
  | {
      kind: "richText";
      objectId: string;
      domain: "textToken";
      tokenIndexes: number[];
      selection?: DomainMask;
    }
  | { kind: "shape"; objectId: string }
  | {
      kind: "geometry";
      objectId: string;
      structureType: GeneratedGeometry["type"];
      domain: EvaluationDomain;
      geometry: GeneratedGeometry;
      bounds: { x: number; y: number; width: number; height: number };
      pointCount: number;
      segmentCount: number;
      attributes?: Record<string, unknown>;
    }
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
  groupId?: string;
  macroId?: string;
  outputId?: GraphPortId;
};

export type AnimationGraphStreamTrace = {
  streamId: string;
  kind: GraphStreamKind;
  domain?: EvaluationDomain;
  structureKind?: StructureStream["kind"];
  tokenCount?: number;
  pointCount?: number;
  segmentCount?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  generatedStructureType?: GeneratedGeometry["type"];
  maskCount?: number;
  valueType?: ValueStreamType;
  effectCount?: number;
  controllerSummary?: string;
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

export type GraphOperationKind =
  | "nodeExecution"
  | "valueEvaluation"
  | "streamTransformation"
  | "effectAppend"
  | "branchRouting"
  | "outputCollection";

export type GraphOperation = {
  id: string;
  kind: GraphOperationKind;
  nodeId: GraphNodeId;
  nodeKind: string;
  inputEdges: GraphEdgeId[];
  outputEdges: GraphEdgeId[];
};

export type AnimationGraphProgram = {
  operations: GraphOperation[];
  nodeIds: GraphNodeId[];
  edgeIds: GraphEdgeId[];
  outNodeIds: GraphNodeId[];
  diagnostics: AnimationGraphDiagnostic[];
};

export type ConditionOutputPortConfig = {
  id: GraphPortId;
  label: string;
};

export type AnimationGraphConditionConfig = {
  outputs?: readonly ConditionOutputPortConfig[];
  rules: readonly {
    target: "value" | "type";
    operator: FieldOperator;
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
  time?: number;
  frame?: number;
  connectedOutputPorts?: ReadonlySet<GraphPortId>;
};

export type NodeExecutionResult = {
  outputs: ReadonlyMap<GraphPortId, readonly GraphStream[]>;
  diagnostics?: readonly AnimationGraphDiagnostic[];
};

export type AnimationGraphControlOption = {
  value: string;
  label: string;
};

export type AnimationGraphControlField = {
  key: string;
  label: string;
  type?: "number" | "text" | "color" | "button";
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly AnimationGraphControlOption[];
};

export type AnimationGraphControlGroup = {
  id: string;
  label?: string;
  columns?: number;
  fields: readonly AnimationGraphControlField[];
};

export type AnimationGraphNodeDefinition = {
  kind: string;
  label: string;
  category: "control" | "value" | "effect";
  menuPath?: string;
  controls?: readonly AnimationGraphControlGroup[];
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
