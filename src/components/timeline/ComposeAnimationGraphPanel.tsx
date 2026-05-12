import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent,
} from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import type { ContextMenuState } from "../../app/types";
import {
  animationDefinitions,
  type AnimationControllerFieldGroup,
  getAnimationDefinition,
  getAnimationDefinitionCategories,
} from "../../core/animationGraph/builtins/effect/cssEffects/registry";
import {
  addAnimationGraphPresetGroupToGraph,
  animationGraphPresets,
} from "../../core/animationGraph/presets";
import { roundTenth, roundTwo } from "../../core/math";
import { frameObjectFromBackgroundLayer } from "../../core/frameInteraction";
import { formatTime, getTimelineTicks } from "../../core/timeline";
import {
  getAnimationGraphTemporalStart,
  type AnimationGraphTemporalNode,
} from "../../core/animationGraphSequencing";
import { expandAnimationGraphGroups } from "../../core/animationGraphGroups";
import { getTypedAnimationGraphConnectionError } from "../../core/animationGraph/compatibility";
import { isPermittedComposition2dAnimationGraphEdge } from "../../core/animationGraph/connectionRules";
import { createTypedAnimationGraphNode } from "../../core/animationGraph/nodeRegistry";
import {
  animationGraphNodeRegistry,
  getAnimationGraphNodeDefinition,
  getAnimationGraphNodeDefinitions,
} from "../../core/animationGraph/registry";
import { compileAnimationGraph } from "../../core/animationGraph/compiler";
import type {
  AnimationGraph as StrictAnimationGraph,
  AnimationGraphDiagnostic,
  AnimationGraphEdge as StrictAnimationGraphEdge,
  AnimationGraphNode as StrictAnimationGraphNode,
  GraphPortDefinition,
} from "../../core/animationGraph/types";
import { updateAnimationGraphNodeParameter } from "../../core/graphParameters";
import {
  getComposition2dSocketDefinition,
  graphSocketColors,
  type GraphCompositionMode,
  type SocketType,
} from "../../core/graphSockets";
import type {
  AnimationGraphCustomNode,
  AnimationGraphEdge,
  AnimationGraphGroup,
  AnimationGraphPort,
  AnimationGraphState,
  FrameObject,
  LayerAnimation,
  Part,
  AnimationGraphValueType,
  TypedAnimationGraphNode,
  TypedAnimationGraphState,
} from "../../core/types";
import { AppContextMenu } from "../AppContextMenu";
import {
  buildPathMenuTree,
  createPathContextMenuChildren,
  createPathContextMenuItems,
  type PathMenuNode,
} from "../ui/pathContextMenu";
import type { TimelineViewportState } from "../../core/types";
import type { GraphParameterEditorSchema } from "./GraphParameterEditor";
import {
  isStrictComposition2dGraph,
  createStrictComposition2dEdgeFromDrag,
  getEmptyStrictComposition2dCanvasDiagnostics,
  getStrictComposition2dConnectionError,
  getStrictComposition2dCanvasDiagnostics,
  getStrictComposition2dParameterEditorSchema,
  getStrictComposition2dPorts,
  saveStrictComposition2dGraph,
  updateStrictComposition2dEditorNodeParameter,
  type StrictComposition2dCanvasDiagnostics,
  type StrictComposition2dEdgeDebugSummary,
  type StrictComposition2dEditorGraph,
} from "./StrictComposition2dGraphPanel";
import { useTimelineScrubber } from "./useTimelineScrubber";

type Props = {
  active: boolean;
  currentTime: number;
  isPlaying: boolean;
  part: Part | null;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  scrubbingRef: RefObject<boolean>;
  scrubSnapEnabled: boolean;
  selectedObjectIds: string[];
  graphEnabled: boolean;
  selectedGraphNodeIds: string[];
  timelineViewportState: TimelineViewportState;
  onExitCompose: () => void;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onTimelineViewportStateChange: (
    updater: (state: TimelineViewportState) => TimelineViewportState,
  ) => void;
  onUpdateGraph?: (
    updater: (graph: AnimationGraphState | undefined) => AnimationGraphState,
    options?: { implicit?: boolean; mode?: GraphCompositionMode },
  ) => void;
  onComposeGraphScopeChange?: (
    scopeKey: string | null,
    validNodeIds: string[],
  ) => void;
  onGraphEnabledChange?: (enabled: boolean) => void;
  onSelectGraphNodes?: (nodeIds: string[]) => void;
  onInspectGraphNode?: (nodeId: string | null) => void;
};

export type GraphNode = {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  details?: Record<string, string>;
  typedNode?: StrictAnimationGraphNode;
};
type CustomNodeKind =
  | "effect"
  | "time"
  | "split"
  | "condition"
  | "oscillate"
  | (typeof animationDefinitions)[number]["property"];
type HoverConnector = {
  nodeId: string;
  port: AnimationGraphPort;
  point: { x: number; y: number };
  fromSocket?: string;
  portId?: string;
  dynamicFromSocket?: boolean;
};
type DragState =
  | {
      kind: "node";
      nodeId: string;
      nodeKind: GraphNode["kind"];
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      nodeStartPositions: Record<string, { x: number; y: number }>;
    }
  | {
      kind: "edge";
      fromNodeId: string;
      fromPort: AnimationGraphPort;
      fromSocket?: string;
      portId?: string;
      fromNode: GraphNode;
      startX: number;
      startY: number;
      x: number;
      y: number;
    }
  | {
      kind: "marquee";
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      shiftKey: boolean;
      active: boolean;
      scale: number;
    };
type DelayMarkerDragState = {
  marker: DelayMarker;
  pointerId: number;
  moved: boolean;
};
type DelayMarker = {
  nodeId: string;
  parameterNodeId: string;
  key: string;
  delay: number;
  localDelay: number;
  label: string;
  groupId?: string;
  draggable?: boolean;
};
type GraphContextMenuPoint = {
  graphX: number;
  graphY: number;
  nodeId?: string;
};
type GraphClipboard = {
  nodes: AnimationGraphState["nodes"];
  customNodes: NonNullable<AnimationGraphState["customNodes"]>;
  edges: AnimationGraphEdge[];
  parameters?: NonNullable<AnimationGraphState["parameters"]>;
  groups?: NonNullable<AnimationGraphState["groups"]>;
};
type RenderableGraphEdge = AnimationGraphEdge;
type EditorGraphEdge = AnimationGraphEdge | StrictAnimationGraphEdge;
type GraphUpdateState = AnimationGraphState;
type TemporalNodeRole = "active" | "modified";
type GraphCanvasSurfaceProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  scrollWidth: number;
  scrollHeight: number;
  hoverNodeId: string | null;
  hoverEdgeId?: string | null;
  className?: string;
  canvasClassName?: string;
  onScroll?: () => void;
  onWheel?: (event: WheelEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLCanvasElement>) => void;
  children?: ReactNode;
};

const gridSize = 18;
const minNodeWidth = 3;
const maxNodeWidth = 12;
const nodeHeight = 2;
const nodeGap = 4;
const portGap = 7;
const strictPortSize = 8;
const connectorHoverRadius = 26;
const connectorHitRadius = 16;
const edgeControlHitRadius = 14;
const marqueeThreshold = 4;
const nodeColors = {
  animationBg: "#382234",
  animationBorder: "#8a557b",
  timeBg: "#1b3143",
  timeBorder: "#7ea8d8",
  splitBg: "#1b3143",
  splitBorder: "#7ea8d8",
  modifierBg: "#2c2234",
  modifierBorder: "#735284",
  layerBg: "#252b35",
  layerBorder: "#566171",
  groupBg: "#3a2315",
  groupBorder: "#9c6232",
  threeBg: "#183326",
  threeBorder: "#4fa36a",
  outBg: "#28303a",
  outBorder: "#9aa4b2",
  hoverBorder: "#a8b0bd",
  port: "#b8c0cc",
  text: "#d9dee8",
};
const minGraphScale = 0.35;
const maxGraphScale = 2.5;
const groupGraphPadding = 120;
const composition2dOutNodeId = "composition2d:out";
const groupSubgraphZoomEnabled = true;
const baseGraphWorldWidth = 5200;
const baseGraphWorldHeight = 900;
const graphParameterOptions: Record<
  string,
  readonly { value: string; label: string }[]
> = {
  ease: [
    { value: "linear", label: "Linear" },
    { value: "easeIn", label: "Ease in" },
    { value: "easeOut", label: "Ease out" },
    { value: "easeInOut", label: "Ease in-out" },
    { value: "inAndOut", label: "In and out" },
    { value: "expoIn", label: "Expo in" },
    { value: "expoOut", label: "Expo out" },
    { value: "circOut", label: "Circ out" },
    { value: "backOut", label: "Back out" },
  ],
  repeatType: [
    { value: "loop", label: "Loop" },
    { value: "reverse", label: "Reverse" },
    { value: "mirror", label: "Mirror" },
  ],
  schedule: [
    { value: "relative", label: "Relative" },
    { value: "absolute", label: "Absolute" },
  ],
  mode: [
    { value: "word", label: "Word" },
    { value: "character", label: "Character" },
  ],
  order: [
    { value: "forward", label: "Forward" },
    { value: "reverse", label: "Reverse" },
    { value: "center", label: "Center" },
  ],
  repeatScope: [
    { value: "sequence", label: "Sequence" },
    { value: "item", label: "Item" },
  ],
  matchType: [{ value: "textEquals", label: "Text equals" }],
  action: [
    { value: "setDelay", label: "Set delay" },
    { value: "sendToOutput", label: "Send to output" },
    { value: "duplicateToOutput", label: "Duplicate to output" },
  ],
  conditionCount: [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ],
  outputPort: [
    { value: "1", label: "Output 1" },
    { value: "2", label: "Output 2" },
    { value: "3", label: "Output 3" },
    { value: "4", label: "Output 4" },
  ],
};
const timeParameterDefaults = {
  delay: "0s",
  duration: "1s",
  ease: "linear",
  repeat: "0",
  repeatType: "loop",
  schedule: "relative",
} satisfies Record<string, string>;
const splitParameterDefaults = {
  mode: "word",
  stagger: "0.06s",
  order: "forward",
  repeatScope: "sequence",
} satisfies Record<string, string>;
const conditionParameterDefaults = {
  conditionCount: "1",
  matchType: "textEquals",
  value: "",
  action: "setDelay",
  delay: "0s",
  outputPort: "1",
} satisfies Record<string, string>;

const hiddenAddNodeKinds = new Set(["source", "out", "macro"]);

type StrictGraphNodeMenuItem = { kind: string; label: string };
type StrictGraphNodeMenuGroup = PathMenuNode<StrictGraphNodeMenuItem>;

export function getStrictGraphNodeMenuGroups() {
  return buildPathMenuTree(
    getAnimationGraphNodeDefinitions()
      .filter((definition) => !hiddenAddNodeKinds.has(definition.kind))
      .filter((definition) => isCanvasSupportedStrictNodeKind(definition.kind))
      .map((definition) => ({
        path: getStrictGraphNodeMenuPath(definition),
        value: { kind: definition.kind, label: definition.label },
      })),
  );
}

function getStrictGraphNodeMenuPath(definition: {
  label: string;
  category: string;
  kind: string;
  menuPath?: string;
}) {
  return (
    definition.menuPath ??
    `${getGraphNodeMenuRootLabel(definition)}:${definition.label}`
  );
}

function getGraphNodeMenuRootLabel(definition: {
  category: string;
  kind: string;
}) {
  if (definition.kind.startsWith("value:")) return "Value";
  if (definition.kind.startsWith("geometry:")) return "Geometry";
  if (definition.kind.startsWith("effect:")) return "Effect";
  return definition.category === "control" ? "Controller" : "Node";
}

function clampGraphScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, minGraphScale), maxGraphScale);
}

function normalizeWheelDelta(event: WheelEvent) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 600;
  return event.deltaY;
}

function updateGraphHoverState(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale: number,
  setHover: (nodeId: string | null, port: HoverConnector | null) => void,
  setHoverEdge: (edgeId: string | null) => void,
  edges: AnimationGraphEdge[],
) {
  const hoveredNode = hitNode(point, nodes, scale);
  const edge = hoveredNode ? null : hitEdge(point, edges, nodes, scale);
  if (edge) {
    setHover(null, null);
    setHoverEdge(edge.id);
    return;
  }
  const connectorNode =
    hoveredNode ?? hitNodeLoose(point, nodes, scale) ?? null;
  const connector = hoveredNode
    ? null
    : connectorNode
      ? getNodeHoverConnector(point, connectorNode, scale, edges)
      : null;
  setHover(hoveredNode?.id ?? null, connector);
  setHoverEdge(null);
}

function clearGraphDragState(
  dragRef: RefObject<DragState | null>,
  previewPositionsRef: RefObject<Record<
    string,
    { x: number; y: number }
  > | null>,
  setHover: (nodeId: string | null, port: HoverConnector | null) => void,
  setHoverEdge?: (edgeId: string | null) => void,
) {
  dragRef.current = null;
  previewPositionsRef.current = null;
  setHover(null, null);
  setHoverEdge?.(null);
}

function getGraphEdgeDrop(
  point: { x: number; y: number },
  drag: Extract<DragState, { kind: "edge" }>,
  nodes: GraphNode[],
  scale: number,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
  mode: GraphCompositionMode = "composition2d",
) {
  return getEdgeDropTarget(
    point,
    drag.fromNodeId,
    nodes,
    scale,
    graph,
    objects,
    mode,
  );
}

export function getGraphEdgeDropEdge(
  point: { x: number; y: number },
  drag: Extract<DragState, { kind: "edge" }>,
  nodes: GraphNode[],
  scale: number,
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  objects: FrameObject[],
  mode: GraphCompositionMode = "composition2d",
) {
  const portTarget = hitPort(point, nodes, scale);
  const nodeTarget = portTarget
    ? (nodes.find((node) => node.id === portTarget.nodeId) ?? null)
    : hitNode(point, nodes, scale);
  if (!nodeTarget || nodeTarget.id === drag.fromNodeId) return null;
  const fromNode =
    nodes.find((node) => node.id === drag.fromNodeId) ?? drag.fromNode;
  if (!fromNode) return null;
  if (mode === "composition2d") {
    const strictEdge = createStrictComposition2dEdgeFromDrag(
      { portId: drag.portId ?? drag.fromSocket },
      fromNode,
      nodeTarget,
      portTarget?.portId,
      getRenderableEdges(graph, nodes, objects),
    );
    if (!strictEdge) return null;
    return isPermittedGraphEdge(
      strictEdge,
      nodes,
      getRenderableEdges(graph, nodes, objects),
      mode,
    )
      ? (strictEdge as any)
      : null;
  }
  const existingEdges = getRenderableEdges(graph, nodes, objects);
  const ports = getBestEdgePorts(fromNode, nodeTarget);
  const edge = createEdge(
    drag.fromNodeId,
    ports.fromPort,
    nodeTarget.id,
    ports.toPort,
    getGraphEdgeSocketRegistration(drag, existingEdges),
  );
  if (isPermittedGraphEdge(edge, nodes, existingEdges, mode)) return edge;
  if (mode !== "background") return null;
  const reversePorts = getBestEdgePorts(nodeTarget, fromNode);
  const reverseEdge = createEdge(
    nodeTarget.id,
    reversePorts.fromPort,
    drag.fromNodeId,
    reversePorts.toPort,
  );
  return isPermittedGraphEdge(reverseEdge, nodes, existingEdges, mode)
    ? reverseEdge
    : null;
}

export function getGraphEdgesAfterEdgeDrop(
  edge: EditorGraphEdge,
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  nodes: GraphNode[],
  objects: FrameObject[],
  mode: GraphCompositionMode = "composition2d",
) {
  const currentEdges = filterPermittedEdges(
    getRenderableEdges(graph, nodes, objects),
    nodes,
    mode,
  );
  return [
    ...currentEdges.filter((item) => item.id !== edge.id),
    edge as AnimationGraphEdge,
  ];
}

function materializeGraphNodesAfterEdgeDrop(
  nodes: GraphNode[],
  existing: AnimationGraphState["nodes"] | undefined,
  edge: EditorGraphEdge,
) {
  const materialized = materializeGraphNodes(nodes, existing);
  if (!isStrictGraphEdge(edge)) return materialized;
  const fromNode = nodes.find((node) => node.id === edge.from.nodeId);
  if (fromNode?.kind !== "condition") return materialized;
  const outputId = edge.from.portId;
  if (!outputId?.startsWith("output:")) return materialized;
  const current = materialized[fromNode.id];
  if (
    !current ||
    typeof current !== "object" ||
    !("kind" in current) ||
    !("config" in current)
  )
    return materialized;
  const config = normalizeStrictConditionEditorConfig(current.config);
  if (config.outputs.some((output) => output.id === outputId))
    return materialized;
  const nextConfig = {
    ...config,
    outputs: [
      ...config.outputs,
      { id: outputId, label: outputId.replace(/^output:/, "Output ") },
    ],
  };
  return {
    ...materialized,
    [fromNode.id]: {
      ...current,
      config: nextConfig,
    },
  };
}

function getGraphEdgeSocketRegistration(
  drag: Extract<DragState, { kind: "edge" }>,
  existingEdges: readonly AnimationGraphEdge[],
) {
  if (!drag.fromSocket) return undefined;
  if (drag.fromSocket === "output:next") {
    const fromSocket = getNextGraphNodeOutputSocket(
      drag.fromNode,
      existingEdges,
    );
    return fromSocket ? { fromSocket } : undefined;
  }
  return { fromSocket: drag.fromSocket };
}

function hasGraphEdgeDropTarget(
  point: { x: number; y: number },
  drag: Extract<DragState, { kind: "edge" }>,
  nodes: GraphNode[],
  scale: number,
) {
  const portTarget = hitPort(point, nodes, scale);
  const targetId = portTarget?.nodeId ?? hitNode(point, nodes, scale)?.id;
  return Boolean(targetId && targetId !== drag.fromNodeId);
}

function getGraphEdgeDropError(
  point: { x: number; y: number },
  drag: Extract<DragState, { kind: "edge" }>,
  nodes: GraphNode[],
  scale: number,
  existingEdges: AnimationGraphEdge[] = [],
) {
  const portTarget = hitPort(point, nodes, scale);
  const targetId = portTarget?.nodeId ?? hitNode(point, nodes, scale)?.id;
  if (!targetId || targetId === drag.fromNodeId) return null;
  const fromNode =
    nodes.find((node) => node.id === drag.fromNodeId) ?? drag.fromNode;
  const toNode = nodes.find((node) => node.id === targetId);
  if (
    fromNode &&
    toNode &&
    getGraphCompositionMode(nodes) === "composition2d"
  ) {
    return getStrictComposition2dConnectionError(
      fromNode,
      toNode,
      drag.portId ?? drag.fromSocket,
      portTarget?.portId,
      existingEdges,
    );
  }
  if (!fromNode?.typedNode || !toNode?.typedNode) return null;
  if (hasDuplicateEffectMixInput(fromNode, toNode, existingEdges, nodes))
    return "Effect Mix already has that CSS effect.";
  if (
    !isLegacyTypedAnimationGraphNode(fromNode.typedNode) ||
    !isLegacyTypedAnimationGraphNode(toNode.typedNode)
  )
    return null;
  return getTypedAnimationGraphConnectionError(
    fromNode.typedNode,
    toNode.typedNode,
    drag.fromSocket,
  );
}

function getDraggedGraphNodePosition(
  event: PointerEvent<HTMLCanvasElement>,
  drag: Extract<DragState, { kind: "node" }>,
  scale: number,
) {
  return {
    x: drag.startX + (event.clientX - drag.startClientX) / (gridSize * scale),
    y: drag.startY + (event.clientY - drag.startClientY) / (gridSize * scale),
  };
}

function hasNodeDragMoved(
  drag: Extract<DragState, { kind: "node" }>,
  position: { x: number; y: number },
) {
  return (
    Math.abs(position.x - drag.startX) > 0.08 ||
    Math.abs(position.y - drag.startY) > 0.08
  );
}

function getGroupGraphScrollLayout(
  nodes: GraphNode[],
  width: number,
  height: number,
) {
  const bounds = getGraphNodesBounds(nodes);
  if (!bounds) {
    return {
      offsetX: 0,
      offsetY: 0,
      scrollWidth: width,
      scrollHeight: height,
      scrollLeft: 0,
      scrollTop: 0,
    };
  }
  const graphWidth = bounds.right - bounds.left;
  const graphHeight = bounds.bottom - bounds.top;
  const centerOffsetX = width / 2 - (bounds.left + graphWidth / 2);
  const centerOffsetY = height / 2 - (bounds.top + graphHeight / 2);
  const offsetX = Math.max(groupGraphPadding - bounds.left, centerOffsetX);
  const offsetY = Math.max(groupGraphPadding - bounds.top, centerOffsetY);
  const targetRect = {
    x: bounds.left,
    y: bounds.top,
    width: graphWidth,
    height: graphHeight,
  };
  const scrollWidth = Math.max(
    width,
    bounds.right + offsetX + groupGraphPadding,
  );
  const scrollHeight = Math.max(
    height,
    bounds.bottom + offsetY + groupGraphPadding,
  );
  return {
    offsetX,
    offsetY,
    scrollWidth,
    scrollHeight,
    scrollLeft: Math.max(
      0,
      targetRect.x + offsetX + targetRect.width / 2 - width / 2,
    ),
    scrollTop: Math.max(
      0,
      targetRect.y + offsetY + targetRect.height / 2 - height / 2,
    ),
  };
}

function getGraphNodesBounds(nodes: GraphNode[]) {
  const rects = nodes.map(nodeRect);
  const bounds = rects.reduce(
    (next, rect) => ({
      left: Math.min(next.left, rect.x),
      top: Math.min(next.top, rect.y),
      right: Math.max(next.right, rect.x + rect.width),
      bottom: Math.max(next.bottom, rect.y + rect.height),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
  if (!rects.length || !Number.isFinite(bounds.left)) return null;
  return {
    x: bounds.left,
    y: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
    ...bounds,
  };
}

export const ComposeAnimationGraphPanel = memo(
  function ComposeAnimationGraphPanel({
    active,
    currentTime,
    isPlaying,
    part,
    playbackPlayheadRef,
    scrubbingRef,
    scrubSnapEnabled,
    selectedObjectIds,
    graphEnabled,
    selectedGraphNodeIds,
    onExitCompose,
    onScrub,
    onScrubEnd,
    onScrubStart,
    onUpdateGraph,
    onComposeGraphScopeChange,
    onGraphEnabledChange,
    onSelectGraphNodes,
    onInspectGraphNode,
  }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const graphViewportRef = useRef<HTMLDivElement | null>(null);
    const rulerRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const delayMarkerDragRef = useRef<DelayMarkerDragState | null>(null);
    const suppressNextDelayMarkerClickRef = useRef(false);
    const [draggingDelayMarker, setDraggingDelayMarker] = useState<{
      key: string;
      delay: number;
    } | null>(null);
    const pointerRef = useRef({ x: 0, y: 0 });
    const contextMenuPointRef = useRef<GraphContextMenuPoint | null>(null);
    const previewPositionsRef = useRef<Record<
      string,
      { x: number; y: number }
    > | null>(null);
    const suppressNextGraphClickRef = useRef(false);
    const frameRef = useRef<number | null>(null);
    const activationFrameRef = useRef<number | null>(null);
    const currentTimeRef = useRef(currentTime);
    const partRef = useRef<Part | null>(null);
    const projectGraphRef = useRef<AnimationGraphState | undefined>(undefined);
    const graphRef = useRef<AnimationGraphState | undefined>(undefined);
    const displayGraphRef = useRef<AnimationGraphState | undefined>(undefined);
    const strictDisplayGraphRef = useRef<StrictAnimationGraph | undefined>(
      undefined,
    );
    const pendingGraphSyncRef = useRef<AnimationGraphState | null>(null);
    const dragStartGraphRef = useRef<AnimationGraphState | null>(null);
    const nodesRef = useRef<GraphNode[]>([]);
    const selectedObjectsRef = useRef<FrameObject[]>([]);
    const viewInitializedRef = useRef(false);
    const hoverNodeIdRef = useRef<string | null>(null);
    const hoverConnectorRef = useRef<HoverConnector | null>(null);
    const hoverEdgeIdRef = useRef<string | null>(null);
    const selectedGraphNodeIdsRef = useRef<string[]>([]);
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
    const [hoverConnector, setHoverConnector] = useState<HoverConnector | null>(
      null,
    );
    const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
    const [optimisticGraph, setOptimisticGraph] = useState<
      AnimationGraphState | StrictAnimationGraph | null
    >(null);
    const [graphDraftRevision, setGraphDraftRevision] = useState(0);
    const [activeGroupNodeId, setActiveGroupNodeId] = useState<string | null>(
      null,
    );
    const [renamingGroupNodeId, setRenamingGroupNodeId] = useState<
      string | null
    >(null);
    const selectedGraphNodeIdRef = useRef<string | null>(null);
    const deleteSelectedNodesRef = useRef<() => void>(() => undefined);
    const copySelectedNodesRef = useRef<() => void>(() => undefined);
    const pasteGraphNodesRef = useRef<() => void>(() => undefined);
    const graphClipboardRef = useRef<GraphClipboard | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
    const [graphScale, setGraphScale] = useState(1);
    const graphScaleRef = useRef(1);
    const timelineDuration = Math.max(part?.duration ?? 0.1, 0.1);
    const ticks = useMemo(
      () => getTimelineTicks(timelineDuration),
      [timelineDuration],
    );
    const displayCurrentTime = currentTime;
    const playheadLeft =
      timelineDuration > 0
        ? `${(displayCurrentTime / timelineDuration) * 100}%`
        : "0%";
    useLayoutEffect(() => {
      if (isPlaying) return;
      playbackPlayheadRef.current?.style.setProperty(
        "--clipper-playhead-left",
        playheadLeft,
      );
    }, [isPlaying, playbackPlayheadRef, playheadLeft]);
    const { startScrub, continueScrub, endScrub } = useTimelineScrubber({
      duration: timelineDuration,
      displayDuration: timelineDuration,
      playbackPlayheadRef,
      scrubbingRef,
      timelineRef: rulerRef,
      viewportRef: graphViewportRef,
      autoScroll: false,
      snapEnabled: scrubSnapEnabled,
      snapBoundaries: [],
      onScrub,
      onScrubStart,
      onScrubEnd,
    });
    const projectGraph = part?.animationGraph;
    const fullGraph =
      pendingGraphSyncRef.current ?? optimisticGraph ?? projectGraph;
    const selectableObjects = part
      ? [
          frameObjectFromBackgroundLayer(part.background),
          ...part.background.elements,
          ...part.objects,
        ]
      : [];
    const selectedObjects = selectedObjectIds
      .map((id) => selectableObjects.find((object) => object.id === id))
      .filter((object): object is FrameObject => Boolean(object));
    const graphViewportKey =
      selectedObjectIds.length > 0 ? selectedObjectIds.join("|") : "__empty__";
    const graphMode: GraphCompositionMode = "composition2d";
    const selectedLayerGraphId =
      graphMode === "composition2d" && selectedObjects.length === 1
        ? selectedObjects[0].id
        : undefined;
    const graph = getSelectedComposition2dLayerGraph(
      fullGraph,
      selectedLayerGraphId,
      graphMode,
    );
    const legacyGraph = undefined;
    const customNodeScopeKey = graphViewportKey;
    const graphInstanceKey = `${part?.id ?? "__none__"}:composition2d:${graphViewportKey}`;
    const hasSelectedGraph = selectedObjects.length > 0;
    const nodes = hasSelectedGraph
      ? buildGraphNodes(
          selectedObjects,
          graph,
          baseGraphWorldWidth,
          baseGraphWorldHeight,
          graphViewportKey,
          graphMode,
        )
      : [];
    const graphWorldSize = getGraphContentSize(
      nodes,
      baseGraphWorldWidth,
      baseGraphWorldHeight,
    );
    const graphCanvasWidth = graphWorldSize.width;
    const graphCanvasHeight = graphWorldSize.height;
    const graphScrollWidth = graphWorldSize.width * graphScale;
    const graphScrollHeight = graphWorldSize.height * graphScale;
    const delayMarkers = getDelayMarkers(selectedObjects, nodes, graph);
    const nodeLayoutKey = nodes
      .map(
        (node) => `${node.id}:${node.x},${node.y},${node.width},${node.height}`,
      )
      .join("|");
    partRef.current = part;
    graphRef.current = fullGraph as any;
    if (isStrictComposition2dGraph(graph)) {
      strictDisplayGraphRef.current = graph;
      displayGraphRef.current = undefined;
    } else {
      strictDisplayGraphRef.current = undefined;
      displayGraphRef.current = graph;
    }
    nodesRef.current = nodes;
    selectedObjectsRef.current = selectedObjects;
    selectedGraphNodeIdRef.current = selectedGraphNodeIds.at(-1) ?? null;
    selectedGraphNodeIdsRef.current = selectedGraphNodeIds;
    deleteSelectedNodesRef.current = deleteSelectedNodes;
    copySelectedNodesRef.current = copySelectedNodes;
    pasteGraphNodesRef.current = pasteGraphNodes;

    useLayoutEffect(() => {
      setOptimisticGraph(null);
      pendingGraphSyncRef.current = null;
      viewInitializedRef.current = false;
      graphScaleRef.current = 1;
      setGraphScale(1);
    }, [graphInstanceKey]);

    useEffect(() => {
      onComposeGraphScopeChange?.(
        hasSelectedGraph ? graphInstanceKey : null,
        nodes.map((node) => node.id),
      );
    }, [graphInstanceKey, hasSelectedGraph, nodeLayoutKey]);

    useEffect(() => {
      onInspectGraphNode?.(selectedGraphNodeIds.at(-1) ?? null);
      scheduleDraw();
    }, [selectedGraphNodeIds.join("|")]);

    useEffect(() => {
      function onKeyDown(event: KeyboardEvent) {
        if (event.defaultPrevented) return;
        if (
          isEditableKeyboardTarget(event.target) ||
          isEditableKeyboardTarget(document.activeElement)
        )
          return;
        const modifier = event.metaKey || event.ctrlKey;
        if (
          modifier &&
          (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
        ) {
          pendingGraphSyncRef.current = null;
          setOptimisticGraph(null);
          return;
        }
        if (modifier && event.key.toLowerCase() === "c") {
          event.preventDefault();
          copySelectedNodesRef.current();
          return;
        }
        if (modifier && event.key.toLowerCase() === "v") {
          event.preventDefault();
          pasteGraphNodesRef.current();
          return;
        }
        if (modifier) return;
        if (!active) return;
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (selectedGraphNodeIdsRef.current.length === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        deleteSelectedNodesRef.current();
      }
      window.addEventListener("keydown", onKeyDown, true);
      return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [active]);

    useEffect(
      () => () => {
        if (activationFrameRef.current !== null)
          cancelAnimationFrame(activationFrameRef.current);
      },
      [],
    );

    useEffect(() => {
      if (projectGraphRef.current !== projectGraph) {
        pendingGraphSyncRef.current = null;
        setOptimisticGraph(null);
      }
      projectGraphRef.current = projectGraph as any;
    }, [projectGraph]);

    useLayoutEffect(() => {
      draw();
    }, [graphCanvasHeight, graphCanvasWidth, graphScale, graphDraftRevision]);

    useEffect(() => {
      currentTimeRef.current = displayCurrentTime;
      if (active) scheduleDraw();
    }, [active, displayCurrentTime]);

    useLayoutEffect(() => {
      if (!active) return;
      draw();
      scheduleDraw();
      scheduleActivationDraws();
    }, [active]);

    useLayoutEffect(() => {
      if (!active) return;
      scheduleDraw();
      scheduleActivationDraws();
    }, [
      active,
      hasSelectedGraph,
      nodeLayoutKey,
      graphCanvasHeight,
      graphCanvasWidth,
    ]);

    useEffect(() => {
      const viewport = graphViewportRef.current;
      if (!viewport || !active) return;
      const resizeObserver = new ResizeObserver(() =>
        scheduleActivationDraws(),
      );
      resizeObserver.observe(viewport);
      return () => resizeObserver.disconnect();
    }, [active]);

    useLayoutEffect(() => {
      const viewport = graphViewportRef.current;
      if (
        !viewport ||
        !active ||
        viewInitializedRef.current ||
        viewport.clientWidth <= 1 ||
        viewport.clientHeight <= 1 ||
        !hasSelectedGraph
      )
        return;
      centerGraphOnNodes(viewport, nodesRef.current);
      viewInitializedRef.current = true;
    }, [
      hasSelectedGraph,
      active,
      graphInstanceKey,
      graphCanvasHeight,
      graphCanvasWidth,
      graphScale,
      nodeLayoutKey,
      selectedObjects.map((object) => object.id).join("|"),
    ]);

    useEffect(
      () => draw(),
      [
        part,
        selectedObjectIds.join("|"),
        hoverNodeId,
        hoverConnector,
        hoverEdgeId,
        selectedGraphNodeIds.join("|"),
        graphScale,
      ],
    );

    function scheduleDraw() {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        draw();
      });
    }

    function scheduleActivationDraws() {
      if (activationFrameRef.current !== null)
        cancelAnimationFrame(activationFrameRef.current);
      let remaining = 5;
      const tick = () => {
        draw();
        remaining -= 1;
        activationFrameRef.current =
          remaining > 0 ? requestAnimationFrame(tick) : null;
      };
      activationFrameRef.current = requestAnimationFrame(tick);
    }

    function onGraphScroll() {
      scheduleDraw();
    }

    function draw() {
      const canvas = canvasRef.current;
      const viewport = graphViewportRef.current;
      if (!canvas || !viewport) return;
      const scaledWidth = Math.max(1, viewport.clientWidth);
      const scaledHeight = Math.max(1, viewport.clientHeight);
      const currentPart = partRef.current;
      const currentSelectedObjects = selectedObjectsRef.current;
      if (!currentPart) return;
      if (currentSelectedObjects.length === 0) {
        drawGraphCanvas({
          canvas,
          viewport,
          width: scaledWidth,
          height: scaledHeight,
          scale: graphScaleRef.current,
          nodes: [],
          edges: [],
          hoverNodeId: null,
          selectedNodeIds: [],
          hoverConnector: null,
          hoverEdgeId: null,
          edgeDrag: null,
          previewPoint: null,
          marqueeRect: null,
        });
        return;
      }
      const currentGraph =
        strictDisplayGraphRef.current ?? displayGraphRef.current;
      const currentNodes = nodesRef.current;
      const drawNodes = currentNodes.map((node) => ({
        ...node,
        label: node.id === renamingGroupNodeId ? "" : node.label,
        ...(previewPositionsRef.current?.[node.id] ?? {}),
      }));
      const edgeDrag =
        dragRef.current?.kind === "edge" ? dragRef.current : null;
      const marqueeDrag =
        dragRef.current?.kind === "marquee" ? dragRef.current : null;
      const marqueeSelectedNodeIds = marqueeDrag?.active
        ? getMarqueeSelectionPreviewIds(
            marqueeDrag,
            drawNodes,
            selectedGraphNodeIdsRef.current,
          )
        : selectedGraphNodeIdsRef.current;
      const diagnostics = isStrictComposition2dGraph(
        currentGraph as StrictAnimationGraph | undefined,
      )
        ? getStrictComposition2dCanvasDiagnostics(
            compileAnimationGraph(
              currentGraph as unknown as StrictAnimationGraph,
              {
                trace: true,
              },
            ),
          )
        : undefined;
      drawGraphCanvas({
        canvas,
        viewport,
        width: scaledWidth,
        height: scaledHeight,
        scale: graphScaleRef.current,
        nodes: drawNodes,
        edges: getRenderableEdges(
          currentGraph,
          drawNodes,
          currentSelectedObjects,
        ),
        hoverNodeId: hoverNodeIdRef.current,
        selectedNodeIds: marqueeSelectedNodeIds,
        hoverConnector: hoverConnectorRef.current,
        hoverEdgeId: hoverEdgeIdRef.current,
        edgeDrag,
        previewPoint: edgeDrag
          ? {
              x: pointerRef.current.x / graphScaleRef.current,
              y: pointerRef.current.y / graphScaleRef.current,
            }
          : null,
        ...getGraphPlaybackDrawSemantics({
          graph: displayGraphRef.current,
          nodes: drawNodes,
          objects: currentSelectedObjects,
          currentTime: currentTimeRef.current,
          disabled: false,
        }),
        marqueeRect: marqueeDrag?.active
          ? normalizeMarqueeRect(marqueeDrag)
          : null,
        diagnostics,
      });
    }

    function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
      const point = canvasPoint(event, graphViewportRef.current);
      pointerRef.current = point;
      const drag = dragRef.current;
      if (drag?.kind === "node") {
        setActiveGroupNodeId(null);
        updateHoverEdge(null);
        const position = getDraggedGraphNodePosition(event, drag, graphScale);
        const delta = {
          x: position.x - drag.startX,
          y: position.y - drag.startY,
        };
        previewPositionsRef.current = Object.fromEntries(
          Object.entries(drag.nodeStartPositions).map(([nodeId, start]) => [
            nodeId,
            { x: start.x + delta.x, y: start.y + delta.y },
          ]),
        );
        scheduleDraw();
        return;
      }
      if (drag?.kind === "edge") {
        setActiveGroupNodeId(null);
        updateHoverEdge(null);
        drag.x = point.x;
        drag.y = point.y;
        const currentGraph =
          strictDisplayGraphRef.current ?? displayGraphRef.current;
        const edge = getGraphEdgeDropEdge(
          point,
          drag,
          nodesRef.current,
          graphScale,
          currentGraph,
          selectedObjects,
          graphMode,
        );
        updateHover(edge ? getEditorEdgeToNodeId(edge as any) : null, null);
        scheduleDraw();
        return;
      }
      if (drag?.kind === "marquee") {
        setActiveGroupNodeId(null);
        updateHover(null, null);
        updateHoverEdge(null);
        drag.x = point.x;
        drag.y = point.y;
        if (
          !drag.active &&
          Math.hypot(
            event.clientX - drag.startClientX,
            event.clientY - drag.startClientY,
          ) > marqueeThreshold
        )
          drag.active = true;
        scheduleDraw();
        return;
      }
      updateGraphHoverState(
        point,
        nodesRef.current,
        graphScale,
        updateHover,
        updateHoverEdge,
        getRenderableEdges(
          strictDisplayGraphRef.current ?? displayGraphRef.current,
          nodesRef.current,
          selectedObjects,
        ),
      );
    }

    function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (event.button !== 0) return;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      const point = canvasPoint(event, graphViewportRef.current);
      const bodyNode = hitNode(point, nodesRef.current, graphScale);
      const currentGraph =
        strictDisplayGraphRef.current ?? displayGraphRef.current;
      const renderableEdges = getRenderableEdges(
        currentGraph,
        nodesRef.current,
        selectedObjects,
      );
      const connector = getGraphPointerDownConnector(
        point,
        nodesRef.current,
        graphScale,
        hoverConnectorRef.current,
        renderableEdges,
      );
      if (connector) {
        setActiveGroupNodeId(null);
        updateHoverEdge(null);
        selectGraphNode(connector.nodeId);
        const sourceNode = nodesRef.current.find(
          (node) => node.id === connector.nodeId,
        );
        if (!sourceNode) return;
        const start = nodeCenter(sourceNode);
        dragRef.current = {
          kind: "edge",
          fromNodeId: connector.nodeId,
          fromPort: connector.port,
          fromSocket: connector.dynamicFromSocket
            ? graphMode === "composition2d"
              ? connector.portId
              : getNextGraphNodeOutputSocket(
                  sourceNode,
                  getRenderableEdges(
                    currentGraph,
                    nodesRef.current,
                    selectedObjects,
                  ),
                )
            : connector.fromSocket,
          portId: connector.portId,
          fromNode: sourceNode,
          startX: start.x,
          startY: start.y,
          x: point.x,
          y: point.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const edge = hitEdge(
        point,
        getRenderableEdges(currentGraph, nodesRef.current, selectedObjects),
        nodesRef.current,
        graphScale,
      );
      if (edge) {
        setActiveGroupNodeId(null);
        selectGraphNode(null);
        updateHoverEdge(null);
        commitGraphUpdate((graph) => ({
          nodes: {
            ...(graph?.nodes ?? {}),
            ...materializeGraphNodes(nodesRef.current, graph?.nodes),
          },
          edges: getRenderableEdges(
            graph,
            nodesRef.current,
            selectedObjects,
          ).filter((item) => item.id !== edge.id),
          customNodes: materializeGraphNodeDefinitions(
            nodesRef.current,
            graph?.customNodes,
            customNodeScopeKey,
          ),
          groups: graph?.groups,
          parameters: graph?.parameters,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        }));
        scheduleDraw();
        return;
      }
      const node = bodyNode ?? hitNode(point, nodesRef.current, graphScale);
      if (!node) {
        setActiveGroupNodeId(null);
        if (!event.shiftKey) selectGraphNode(null);
        dragRef.current = {
          kind: "marquee",
          startClientX: event.clientX,
          startClientY: event.clientY,
          startX: point.x,
          startY: point.y,
          x: point.x,
          y: point.y,
          shiftKey: event.shiftKey,
          active: false,
          scale: graphScaleRef.current,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (node.kind === "group" && !event.shiftKey) {
        selectGraphNode(node.id);
        setActiveGroupNodeId(node.id);
        suppressNextGraphClickRef.current = true;
        return;
      }
      const dragSelectionIds = selectedGraphNodeIdsRef.current.includes(node.id)
        ? selectedGraphNodeIdsRef.current
        : [node.id];
      if (event.shiftKey) {
        toggleGraphNodeSelection(node.id);
      } else {
        if (!selectedGraphNodeIdsRef.current.includes(node.id))
          selectGraphNode(node.id);
      }
      setActiveGroupNodeId(null);
      dragRef.current = {
        kind: "node",
        nodeId: node.id,
        nodeKind: node.kind,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: node.x,
        startY: node.y,
        nodeStartPositions: Object.fromEntries(
          dragSelectionIds.flatMap((id) => {
            const selectedNode = nodesRef.current.find(
              (item) => item.id === id,
            );
            return selectedNode
              ? [[id, { x: selectedNode.x, y: selectedNode.y }]]
              : [];
          }),
        ),
      };
      dragStartGraphRef.current =
        pendingGraphSyncRef.current ?? graphRef.current ?? null;
      previewPositionsRef.current = dragRef.current.nodeStartPositions;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    function onClick(event: MouseEvent<HTMLCanvasElement>) {
      if (suppressNextGraphClickRef.current) {
        suppressNextGraphClickRef.current = false;
        return;
      }
      setActiveGroupNodeId(null);
    }

    function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
      event.preventDefault();
      event.stopPropagation();
      const drag = dragRef.current;
      dragRef.current = null;
      dragStartGraphRef.current = null;
      if (drag?.kind === "node" && previewPositionsRef.current?.[drag.nodeId]) {
        const position = previewPositionsRef.current[drag.nodeId];
        commitGraphUpdate((graph) => ({
          nodes: {
            ...(graph?.nodes ?? {}),
            ...applyGraphNodePositions(
              materializeGraphNodes(nodesRef.current, graph?.nodes),
              previewPositionsRef.current,
            ),
          },
          edges: graph?.edges ?? [],
          customNodes: graph?.customNodes,
          groups: graph?.groups,
          parameters: graph?.parameters,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        }));
        const moved = hasNodeDragMoved(drag, position);
        if (moved) {
          suppressNextGraphClickRef.current = true;
          setGraphNodeSelection(Object.keys(drag.nodeStartPositions));
        }
        if (!moved) {
          if (drag.nodeKind === "group") {
            suppressNextGraphClickRef.current = true;
            setActiveGroupNodeId(drag.nodeId);
          }
        }
      }
      if (drag?.kind === "edge") {
        suppressNextGraphClickRef.current = true;
        const currentGraph =
          strictDisplayGraphRef.current ?? displayGraphRef.current;
        const edge = getGraphEdgeDropEdge(
          canvasPoint(event, graphViewportRef.current),
          drag,
          nodesRef.current,
          graphScale,
          currentGraph,
          selectedObjects,
          graphMode,
        );
        if (edge) {
          commitGraphUpdate((graph) => ({
            nodes: {
              ...(graph?.nodes ?? {}),
              ...materializeGraphNodesAfterEdgeDrop(
                nodesRef.current,
                graph?.nodes,
                edge,
              ),
            },
            edges: getGraphEdgesAfterEdgeDrop(
              edge,
              currentGraph,
              nodesRef.current,
              selectedObjects,
              graphMode,
            ),
            customNodes: materializeGraphNodeDefinitions(
              nodesRef.current,
              graph?.customNodes,
              customNodeScopeKey,
            ),
            groups: graph?.groups,
            parameters: graph?.parameters,
            viewport: graph?.viewport,
            viewports: graph?.viewports,
          }));
        } else if (
          graphMode === "composition2d" &&
          hasGraphEdgeDropTarget(
            canvasPoint(event, graphViewportRef.current),
            drag,
            nodesRef.current,
            graphScale,
          )
        ) {
          toast.error(
            getGraphEdgeDropError(
              canvasPoint(event, graphViewportRef.current),
              drag,
              nodesRef.current,
              graphScale,
              getRenderableEdges(
                currentGraph,
                nodesRef.current,
                selectedObjects,
              ),
            ) ?? "Incompatible effect graph connection.",
          );
        }
      }
      if (drag?.kind === "marquee" && drag.active) {
        suppressNextGraphClickRef.current = true;
        applyMarqueeSelection(drag);
      }
      setActiveGroupNodeId(null);
      previewPositionsRef.current = null;
      updateHover(null, null);
      updateHoverEdge(null);
      scheduleDraw();
    }

    function onPointerCancel() {
      if (dragRef.current?.kind === "node" && dragStartGraphRef.current) {
        applyGraphDraft(() => dragStartGraphRef.current!);
        setOptimisticGraph(dragStartGraphRef.current);
      }
      dragStartGraphRef.current = null;
      clearGraphDragState(
        dragRef,
        previewPositionsRef,
        updateHover,
        updateHoverEdge,
      );
      scheduleDraw();
    }

    function onPointerLeave() {
      if (dragRef.current) return;
      updateHover(null, null);
      updateHoverEdge(null);
      scheduleDraw();
    }

    function updateHover(nodeId: string | null, port: HoverConnector | null) {
      const samePort =
        hoverConnectorRef.current?.nodeId === port?.nodeId &&
        hoverConnectorRef.current?.port === port?.port;
      const samePoint =
        Math.round(hoverConnectorRef.current?.point.x ?? -1) ===
          Math.round(port?.point.x ?? -2) &&
        Math.round(hoverConnectorRef.current?.point.y ?? -1) ===
          Math.round(port?.point.y ?? -2);
      if (hoverNodeIdRef.current === nodeId && samePort && samePoint) return;
      hoverNodeIdRef.current = nodeId;
      hoverConnectorRef.current = port;
      setHoverNodeId(nodeId);
      setHoverConnector(port);
    }

    function updateHoverEdge(edgeId: string | null) {
      if (hoverEdgeIdRef.current === edgeId) return;
      hoverEdgeIdRef.current = edgeId;
      setHoverEdgeId(edgeId);
    }

    function commitGraphNodeSelection(nodeIds: string[]) {
      selectedGraphNodeIdsRef.current = nodeIds;
      selectedGraphNodeIdRef.current = nodeIds.at(-1) ?? null;
      onSelectGraphNodes?.(nodeIds);
      scheduleDraw();
    }

    function selectGraphNode(nodeId: string | null) {
      commitGraphNodeSelection(nodeId ? [nodeId] : []);
    }

    function toggleGraphNodeSelection(nodeId: string) {
      const next = selectedGraphNodeIdsRef.current.includes(nodeId)
        ? selectedGraphNodeIdsRef.current.filter((id) => id !== nodeId)
        : [...selectedGraphNodeIdsRef.current, nodeId];
      commitGraphNodeSelection(next);
    }

    function setGraphNodeSelection(nodeIds: string[]) {
      commitGraphNodeSelection(nodeIds);
    }

    function applyMarqueeSelection(
      drag: Extract<DragState, { kind: "marquee" }>,
    ) {
      setGraphNodeSelection(
        getMarqueeSelectionPreviewIds(
          drag,
          nodesRef.current,
          selectedGraphNodeIdsRef.current,
        ),
      );
    }

    function commitGraphUpdate(
      updater: (graph: GraphUpdateState | undefined) => GraphUpdateState,
      options: { local?: boolean; implicit?: boolean } = {},
    ) {
      const nextGraph = applyGraphDraft(updater);
      if (options.local !== false) setOptimisticGraph(nextGraph as any);
      onUpdateGraph?.(() => nextGraph as any, {
        implicit: options.implicit,
        mode: graphMode,
      });
    }

    function applyGraphDraft(
      updater: (graph: GraphUpdateState | undefined) => GraphUpdateState,
    ) {
      const baseGraph = pendingGraphSyncRef.current ?? graphRef.current;
      const baseLayerGraph = getSelectedComposition2dLayerGraph(
        baseGraph,
        selectedLayerGraphId,
        graphMode,
      );
      const nextLayerGraph = stripGraphViewportState(updater(baseLayerGraph));
      const nextGraph = setSelectedComposition2dLayerGraph(
        baseGraph,
        nextLayerGraph as AnimationGraphState | StrictAnimationGraph,
        selectedLayerGraphId,
        graphMode,
      );
      graphRef.current = nextGraph as any;
      if (
        graphMode === "composition2d" &&
        isStrictComposition2dGraph(nextLayerGraph)
      ) {
        strictDisplayGraphRef.current = nextLayerGraph;
        displayGraphRef.current = undefined;
      } else {
        strictDisplayGraphRef.current = undefined;
        displayGraphRef.current = nextLayerGraph as AnimationGraphState;
      }
      pendingGraphSyncRef.current = nextGraph as any;
      setGraphDraftRevision((revision) => revision + 1);
      nodesRef.current = buildGraphNodes(
        selectedObjects,
        getSelectedComposition2dLayerGraph(
          nextGraph,
          selectedLayerGraphId,
          graphMode,
        ),
        graphWorldSize.width,
        graphWorldSize.height,
        graphViewportKey,
        graphMode,
      );
      return nextGraph;
    }

    function updateNodeParameter(nodeId: string, key: string, value: string) {
      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (graphMode === "composition2d" && node?.typedNode) {
        commitGraphUpdate(
          (graph) =>
            updateStrictComposition2dEditorNodeParameter(
              {
                nodes: {
                  ...(graph?.nodes ?? {}),
                  ...materializeGraphNodes(nodesRef.current, graph?.nodes),
                },
                edges: getRenderableEdges(
                  graph,
                  nodesRef.current,
                  selectedObjects,
                ),
                viewport: graph?.viewport,
              } satisfies StrictComposition2dEditorGraph,
              nodeId,
              key,
              value,
            ) as AnimationGraphState,
        );
        return;
      }
      commitGraphUpdate((graph) =>
        updateAnimationGraphNodeParameter(
          {
            nodes: {
              ...(graph?.nodes ?? {}),
              ...materializeGraphNodes(nodesRef.current, graph?.nodes),
            },
            edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
            customNodes: materializeGraphNodeDefinitions(
              nodesRef.current,
              graph?.customNodes,
              customNodeScopeKey,
            ),
            groups: graph?.groups,
            parameters: graph?.parameters,
            viewport: graph?.viewport,
            viewports: graph?.viewports,
          },
          nodeId,
          key,
          value,
        ),
      );
    }

    function updateGroupNodeParameter(
      groupId: string,
      nodeId: string,
      key: string,
      value: string,
    ) {
      commitGraphUpdate((graph) => {
        const group = graph?.groups?.[groupId];
        if (!group) return graph ?? { nodes: {}, edges: [] };
        return replaceGraphGroup(graph, groupId, {
          ...group,
          parameters: {
            ...(group.parameters ?? {}),
            [nodeId]: { ...(group.parameters?.[nodeId] ?? {}), [key]: value },
          },
        });
      });
    }

    function updateDelayMarker(marker: DelayMarker, delay: number) {
      const localDelay = Math.max(
        0,
        delay - (marker.delay - marker.localDelay),
      );
      if (marker.groupId) {
        updateGroupNodeParameter(
          marker.groupId,
          marker.parameterNodeId,
          "delay",
          formatSeconds(localDelay),
        );
        return;
      }
      updateNodeParameter(
        marker.parameterNodeId,
        "delay",
        formatSeconds(localDelay),
      );
    }

    function readDelayMarkerTime(event: PointerEvent<HTMLElement>) {
      const rect = event.currentTarget.parentElement?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      return Math.max(
        0,
        Math.min(
          timelineDuration,
          ((event.clientX - rect.left) / rect.width) * timelineDuration,
        ),
      );
    }

    function startDelayMarkerDrag(
      event: PointerEvent<HTMLButtonElement>,
      marker: DelayMarker,
    ) {
      event.preventDefault();
      event.stopPropagation();
      delayMarkerDragRef.current = {
        marker,
        pointerId: event.pointerId,
        moved: false,
      };
      setDraggingDelayMarker({ key: marker.key, delay: marker.delay });
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    function continueDelayMarkerDrag(event: PointerEvent<HTMLButtonElement>) {
      const drag = delayMarkerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      drag.moved = true;
      const nextDelay = readDelayMarkerTime(event);
      setDraggingDelayMarker({ key: drag.marker.key, delay: nextDelay });
      updateDelayMarker(drag.marker, nextDelay);
    }

    function endDelayMarkerDrag(event: PointerEvent<HTMLButtonElement>) {
      const drag = delayMarkerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const nextDelay = readDelayMarkerTime(event);
      delayMarkerDragRef.current = null;
      setDraggingDelayMarker(null);
      if (drag.moved) {
        suppressNextDelayMarkerClickRef.current = true;
        updateDelayMarker(drag.marker, nextDelay);
      }
    }

    function replaceGroup(groupId: string, nextGroup: AnimationGraphGroup) {
      commitGraphUpdate((graph) =>
        replaceGraphGroup(graph, groupId, nextGroup),
      );
    }

    function replaceGraphGroup(
      graph: AnimationGraphState | undefined,
      groupId: string,
      nextGroup: AnimationGraphGroup,
    ): AnimationGraphState {
      return {
        nodes: {
          ...(graph?.nodes ?? {}),
          ...materializeGraphNodes(nodesRef.current, graph?.nodes),
        },
        edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
        customNodes: materializeGraphNodeDefinitions(
          nodesRef.current,
          graph?.customNodes,
          customNodeScopeKey,
        ),
        groups: {
          ...(graph?.groups ?? {}),
          [groupId]: nextGroup,
        },
        parameters: graph?.parameters,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      };
    }

    function openContextMenu(event: MouseEvent<HTMLCanvasElement>) {
      event.preventDefault();
      event.stopPropagation();
      const point = canvasPoint(event, graphViewportRef.current);
      setActiveGroupNodeId(null);
      const node = hitNode(point, nodesRef.current, graphScale);
      const nodeId = node?.id;
      const previousSelectedIds = selectedGraphNodeIdsRef.current;
      const rightClickedSelectedNode = Boolean(
        nodeId && previousSelectedIds.includes(nodeId),
      );
      if (nodeId && !rightClickedSelectedNode) selectGraphNode(nodeId);
      contextMenuPointRef.current = {
        graphX: point.x / graphScale / gridSize,
        graphY: point.y / graphScale / gridSize,
        nodeId,
      };
      const selectedIds = rightClickedSelectedNode
        ? previousSelectedIds
        : selectedGraphNodeIdsRef.current;
      const items =
        selectedIds.length > 1 && (!nodeId || selectedIds.includes(nodeId))
          ? [
              { label: "Group", action: () => groupSelectedNodes() },
              { label: "Copy", action: () => copySelectedNodes() },
              {
                label: "Delete",
                danger: true,
                action: () => deleteSelectedNodes(),
              },
            ]
          : nodeId && graphRef.current?.customNodes?.[nodeId]?.kind === "group"
            ? [
                { label: "Rename", action: () => renameGroupNode(nodeId) },
                { label: "Ungroup", action: () => ungroupNode(nodeId) },
                { label: "Copy", action: () => copySelectedNodes() },
                {
                  label: "Delete",
                  danger: true,
                  action: () => {
                    setGraphNodeSelection([nodeId]);
                    deleteGraphNodes([nodeId]);
                  },
                },
              ]
            : nodeId &&
                isDeletableGraphNode(
                  nodeId,
                  displayGraphRef.current,
                  strictDisplayGraphRef.current,
                )
              ? [
                  { label: "Copy", action: () => copySelectedNodes() },
                  {
                    label: "Delete",
                    danger: true,
                    action: () => {
                      setGraphNodeSelection([nodeId]);
                      deleteGraphNodes([nodeId]);
                    },
                  },
                ]
              : [
                  ...(graphClipboardRef.current
                    ? [{ label: "Paste", action: () => pasteGraphNodes() }]
                    : []),
                  ...getStrictGraphNodeMenuGroups().map((group) => ({
                    label: group.label,
                    children: createPathContextMenuChildren(group, (node) =>
                      addStrictGraphNode(node.kind, node.label),
                    ),
                  })),
                ];
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items,
      });
    }

    function addCustomNode(
      kind: CustomNodeKind,
      override?: { label?: string; details?: Record<string, string> },
    ) {
      const point = contextMenuPointRef.current;
      if (!point) return;
      const id = `custom:${kind}:${Date.now().toString(36)}`;
      const definition = getAnimationDefinition(kind);
      const node: AnimationGraphCustomNode =
        kind === "time"
          ? {
              kind: "time" as const,
              label: "Time",
              scopeKey: graphViewportKey,
              details: { delay: "0s", duration: "1s", ease: "linear" },
            }
          : kind === "split"
            ? {
                kind: "split" as const,
                label: "Split",
                scopeKey: graphViewportKey,
                details: splitParameterDefaults,
              }
            : kind === "condition"
              ? {
                  kind: "condition" as const,
                  label: "Condition",
                  scopeKey: graphViewportKey,
                  details: conditionParameterDefaults,
                }
              : kind === "effect"
                ? {
                    kind: "effectMix" as const,
                    label: "Effect Mix",
                    scopeKey: graphViewportKey,
                    details: {},
                  }
                : {
                    kind: "effect" as const,
                    label:
                      override?.label ??
                      definition?.label ??
                      formatPropertyLabel(kind),
                    scopeKey: graphViewportKey,
                    details: override?.details ?? { property: kind },
                  };
      commitGraphUpdate((graph) => {
        const position = { x: point.graphX, y: point.graphY };
        const nodeKind = isGraphNodeKind(node.kind) ? node.kind : null;
        const typedKind = nodeKind
          ? getComposition2dTypedNodeKind(nodeKind)
          : null;
        const typedNode = typedKind
          ? createTypedAnimationGraphNode(
              id,
              typedKind,
              position,
              node.details,
              node.label,
            )
          : undefined;
        return {
          nodes: {
            ...(graph?.nodes ?? {}),
            ...materializeGraphNodes(nodesRef.current, graph?.nodes),
            [id]: typedNode ?? position,
          },
          edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
          customNodes: typedNode
            ? graph?.customNodes
            : { ...(graph?.customNodes ?? {}), [id]: node },
          groups: graph?.groups,
          parameters: graph?.parameters,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      contextMenuPointRef.current = null;
      setContextMenu(null);
    }

    function addStrictGraphNode(kind: string, label?: string) {
      const point = contextMenuPointRef.current;
      if (!point) return;
      const id = `node:${kind}:${Date.now().toString(36)}`;
      const position = { x: point.graphX, y: point.graphY };
      const strictNode = createStrictAnimationGraphNode(id, kind, position);
      if (!strictNode) return;
      const definition = getAnimationGraphNodeDefinition(kind);
      commitGraphUpdate((graph) => ({
        nodes: {
          ...(graph?.nodes ?? {}),
          ...materializeGraphNodes(nodesRef.current, graph?.nodes),
          [id]: strictNode,
        } as AnimationGraphState["nodes"],
        edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
        customNodes: graph?.customNodes,
        groups: graph?.groups,
        parameters: graph?.parameters,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
      contextMenuPointRef.current = null;
      setContextMenu(null);
      if (label ?? definition?.label)
        toast.success(`Added ${label ?? definition?.label}`);
    }

    function addGraphPreset(presetId: string) {
      const objectId = selectedObjects[0]?.id;
      if (!objectId) return;
      commitGraphUpdate((graph) => {
        const layerNodeId = `layer:${objectId}`;
        const layerPosition = graph?.nodes?.[layerNodeId] ??
          nodesRef.current.find((node) => node.id === layerNodeId) ?? {
            x: 150,
            y: 25,
          };
        const existingGroupCount = Object.values(
          graph?.customNodes ?? {},
        ).filter(
          (node) => node.scopeKey === objectId && node.kind === "group",
        ).length;
        return addAnimationGraphPresetGroupToGraph(
          graph as StrictAnimationGraph | undefined,
          presetId,
          objectId,
          {
            x: layerPosition.x + 8 + existingGroupCount * 2,
            y: layerPosition.y + existingGroupCount * 3,
          },
        ) as unknown as AnimationGraphState;
      });
      setContextMenu(null);
    }

    function openGraphPresetMenu(event: MouseEvent<HTMLButtonElement>) {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const estimatedMenuHeight = animationGraphPresets.length * 30 + 8;
      setContextMenu({
        x: rect.left,
        y: rect.top - estimatedMenuHeight,
        items: animationGraphPresets.map((preset) => ({
          label: preset.label,
          action: () => addGraphPreset(preset.id),
        })),
      });
    }

    function groupSelectedNodes() {
      const selectedIds = selectedGraphNodeIdsRef.current.filter(
        (id) => !id.startsWith("layer:"),
      );
      if (selectedIds.length < 2) return;
      const selectedNodes = nodesRef.current.filter((node) =>
        selectedIds.includes(node.id),
      );
      if (selectedNodes.length < 2) return;
      const minX = Math.min(...selectedNodes.map((node) => node.x));
      const minY = Math.min(...selectedNodes.map((node) => node.y));
      const maxX = Math.max(
        ...selectedNodes.map((node) => node.x + node.width),
      );
      const maxY = Math.max(
        ...selectedNodes.map((node) => node.y + node.height),
      );
      const groupId = `group:custom:${Date.now().toString(36)}`;
      const nodeId = `custom:group:${Date.now().toString(36)}`;
      commitGraphUpdate((graph) => {
        const customNodes = { ...(graph?.customNodes ?? {}) };
        const nodes = { ...(graph?.nodes ?? {}) };
        const parameters = { ...(graph?.parameters ?? {}) };
        const groupCustomNodes: NonNullable<
          AnimationGraphState["customNodes"]
        > = {};
        const groupInNodeId = `${groupId}:in`;
        const groupOutNodeId = `${groupId}:out`;
        const groupNodes: AnimationGraphState["nodes"] = {
          [groupInNodeId]: { x: (maxX - minX) / 2, y: -4 },
          [`${groupId}:out`]: { x: (maxX - minX) / 2, y: maxY - minY + 4 },
        };
        const groupParameters: NonNullable<AnimationGraphState["parameters"]> =
          {};
        for (const id of selectedIds) {
          if (customNodes[id])
            groupCustomNodes[id] = { ...customNodes[id], scopeKey: groupId };
          const node = selectedNodes.find((item) => item.id === id);
          if (
            !groupCustomNodes[id] &&
            node &&
            node.kind !== "layer" &&
            node.kind !== "out"
          ) {
            const customNode = toAnimationGraphCustomNode(node, groupId);
            if (customNode) groupCustomNodes[id] = customNode;
          }
          if (node) groupNodes[id] = { x: node.x - minX, y: node.y - minY };
          if (parameters[id]) groupParameters[id] = parameters[id];
          delete customNodes[id];
          delete nodes[id];
          delete parameters[id];
        }
        const renderableEdges = getRenderableEdges(
          graph,
          nodesRef.current,
          selectedObjectsRef.current,
        );
        const internalEdges = renderableEdges.filter(
          (edge) =>
            selectedIds.includes(edge.fromNodeId) &&
            selectedIds.includes(edge.toNodeId),
        );
        const incomingEdges = renderableEdges.filter(
          (edge) =>
            !selectedIds.includes(edge.fromNodeId) &&
            selectedIds.includes(edge.toNodeId),
        );
        const outgoingEdges = renderableEdges.filter(
          (edge) =>
            selectedIds.includes(edge.fromNodeId) &&
            !selectedIds.includes(edge.toNodeId),
        );
        const rootNodeIds = selectedIds.filter(
          (id) => !internalEdges.some((edge) => edge.toNodeId === id),
        );
        const sinkNodeIds = selectedIds.filter(
          (id) => !internalEdges.some((edge) => edge.fromNodeId === id),
        );
        const externalEdges = (graph?.edges ?? []).filter(
          (edge) =>
            !selectedIds.includes(edge.fromNodeId) &&
            !selectedIds.includes(edge.toNodeId),
        );
        for (const edge of incomingEdges) {
          if (customNodes[edge.fromNodeId]) continue;
          const sourceNode = nodesRef.current.find(
            (node) => node.id === edge.fromNodeId,
          );
          if (
            !sourceNode ||
            sourceNode.kind === "layer" ||
            sourceNode.kind === "out"
          )
            continue;
          const customNode = toAnimationGraphCustomNode(
            sourceNode,
            customNodeScopeKey,
          );
          if (customNode) customNodes[edge.fromNodeId] = customNode;
        }
        const boundaryEdges = [
          ...incomingEdges.map((edge) =>
            createEdge(edge.fromNodeId, edge.fromPort, nodeId, "top", {
              fromSocket: edge.fromSocket,
              toSocket: edge.toSocket,
            }),
          ),
          ...outgoingEdges.map((edge) =>
            createEdge(nodeId, "bottom", edge.toNodeId, edge.toPort, {
              fromSocket: edge.fromSocket,
              toSocket: edge.toSocket,
            }),
          ),
        ];
        const groupInputEdges = incomingEdges.map((edge) =>
          createEdge(groupInNodeId, "bottom", edge.toNodeId, edge.toPort, {
            fromSocket: edge.fromSocket,
            toSocket: edge.toSocket,
          }),
        );
        const defaultGroupInputEdges = incomingEdges.length
          ? []
          : rootNodeIds.map((id) =>
              createEdge(groupInNodeId, "bottom", id, "top"),
            );
        const groupOutputEdges = outgoingEdges.map((edge) =>
          createEdge(edge.fromNodeId, edge.fromPort, groupOutNodeId, "top", {
            fromSocket: edge.fromSocket,
            toSocket: edge.toSocket,
          }),
        );
        const defaultGroupOutputEdges = outgoingEdges.length
          ? []
          : sinkNodeIds.map((id) =>
              createEdge(id, "bottom", groupOutNodeId, "top"),
            );
        return {
          nodes: {
            ...nodes,
            [nodeId]: {
              x: minX + (maxX - minX) / 2,
              y: minY + (maxY - minY) / 2,
            },
          },
          edges: filterPermittedEdges(
            [...externalEdges, ...boundaryEdges],
            nodesRef.current
              .filter((node) => !selectedIds.includes(node.id))
              .concat({
                id: nodeId,
                label: "Group",
                kind: "group",
                x: minX + (maxX - minX) / 2,
                y: minY + (maxY - minY) / 2,
                width: maxNodeWidth,
                height: nodeHeight,
                details: { groupId, registered: "true" },
              }),
          ),
          customNodes: {
            ...customNodes,
            [nodeId]: {
              kind: "group",
              label: "Group",
              scopeKey: customNodeScopeKey,
              details: { groupId },
            },
          },
          groups: {
            ...(graph?.groups ?? {}),
            [groupId]: {
              id: groupId,
              name: "Group",
              nodes: groupNodes,
              edges: [
                ...incomingEdges,
                ...filterPermittedEdges(
                  [
                    ...groupInputEdges,
                    ...defaultGroupInputEdges,
                    ...internalEdges,
                    ...groupOutputEdges,
                    ...defaultGroupOutputEdges,
                  ],
                  [
                    {
                      id: groupInNodeId,
                      label: "In",
                      kind: "layer",
                      x: (maxX - minX) / 2,
                      y: -4,
                      width: minNodeWidth,
                      height: nodeHeight,
                    },
                    ...selectedNodes.map((node) => ({
                      ...node,
                      x: node.x - minX,
                      y: node.y - minY,
                    })),
                    {
                      id: groupOutNodeId,
                      label: "Out",
                      kind: "out",
                      x: (maxX - minX) / 2,
                      y: maxY - minY + 4,
                      width: minNodeWidth,
                      height: nodeHeight,
                    },
                  ],
                ),
              ],
              customNodes: groupCustomNodes,
              parameters: groupParameters,
              inNodeId: groupInNodeId,
              outNodeId: groupOutNodeId,
            },
          },
          parameters: Object.keys(parameters).length ? parameters : undefined,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      selectGraphNode(nodeId);
      setContextMenu(null);
    }

    function ungroupNode(nodeId: string) {
      const groupId = graphRef.current?.customNodes?.[nodeId]?.details?.groupId;
      const group = groupId ? graphRef.current?.groups?.[groupId] : undefined;
      const groupNode = nodesRef.current.find((node) => node.id === nodeId);
      if (!groupId || !group || !groupNode) return;
      const restoredSelectionIds = Object.keys(group.nodes).filter(
        (id) => id !== group.outNodeId && id !== group.inNodeId,
      );
      commitGraphUpdate((graph) => {
        const { [nodeId]: _node, ...customNodes } = graph?.customNodes ?? {};
        const { [nodeId]: _pos, ...nodes } = graph?.nodes ?? {};
        const { [groupId]: _group, ...groups } = graph?.groups ?? {};
        const restoredNodes = Object.fromEntries(
          Object.entries(group.nodes)
            .filter(([id]) => id !== group.outNodeId && id !== group.inNodeId)
            .map(([id, pos]) => [
              id,
              { x: groupNode.x + pos.x, y: groupNode.y + pos.y },
            ]),
        );
        const restoredCustom = Object.fromEntries(
          Object.entries(group.customNodes ?? {}).map(([id, custom]) => [
            id,
            { ...custom, scopeKey: customNodeScopeKey },
          ]),
        );
        const restoredIds = new Set(Object.keys(restoredNodes));
        const internalEdges = (group.edges ?? []).filter(
          (edge) =>
            restoredIds.has(edge.fromNodeId) && restoredIds.has(edge.toNodeId),
        );
        const incomingEdges = (group.edges ?? []).filter(
          (edge) =>
            !restoredIds.has(edge.fromNodeId) && restoredIds.has(edge.toNodeId),
        );
        const groupOutputSources = (group.edges ?? [])
          .filter(
            (edge) =>
              edge.toNodeId === group.outNodeId &&
              restoredIds.has(edge.fromNodeId),
          )
          .map((edge) => edge.fromNodeId);
        const externalEdges =
          graph?.edges?.filter(
            (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId,
          ) ?? [];
        const bridgedOutputEdges = (graph?.edges ?? []).flatMap((edge) => {
          if (edge.fromNodeId !== nodeId) return [];
          return groupOutputSources.map((sourceId) =>
            createEdge(sourceId, "bottom", edge.toNodeId, edge.toPort, {
              fromSocket: edge.fromSocket,
              toSocket: edge.toSocket,
            }),
          );
        });
        return {
          nodes: { ...nodes, ...restoredNodes },
          edges: filterPermittedEdges(
            [
              ...externalEdges,
              ...incomingEdges,
              ...internalEdges,
              ...bridgedOutputEdges,
            ],
            nodesRef.current
              .filter((node) => node.id !== nodeId)
              .concat(
                buildGroupGraphNodes(group)
                  .filter((node) => node.id !== group.outNodeId)
                  .map((node) => ({
                    ...node,
                    x: groupNode.x + node.x,
                    y: groupNode.y + node.y,
                  })),
              ),
          ),
          customNodes: { ...customNodes, ...restoredCustom },
          groups: Object.keys(groups).length ? groups : undefined,
          parameters: {
            ...(graph?.parameters ?? {}),
            ...(group.parameters ?? {}),
          },
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      setGraphNodeSelection(restoredSelectionIds);
      setContextMenu(null);
    }

    function renameGroupNode(nodeId: string) {
      setRenamingGroupNodeId(nodeId);
      setContextMenu(null);
      scheduleDraw();
    }

    function commitGroupRename(nodeId: string, nextName: string) {
      const current = graphRef.current?.customNodes?.[nodeId];
      const name = nextName.trim();
      if (!current || !name) {
        setRenamingGroupNodeId(null);
        scheduleDraw();
        return;
      }
      const groupId = current.details?.groupId;
      commitGraphUpdate((graph) => ({
        nodes: graph?.nodes ?? {},
        edges: graph?.edges ?? [],
        customNodes: {
          ...(graph?.customNodes ?? {}),
          [nodeId]: { ...current, label: name },
        },
        groups:
          groupId && graph?.groups?.[groupId]
            ? { ...graph.groups, [groupId]: { ...graph.groups[groupId], name } }
            : graph?.groups,
        parameters: graph?.parameters,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
      setRenamingGroupNodeId(null);
      scheduleDraw();
    }

    function deleteSelectedNodes() {
      const selectedIds = selectedGraphNodeIdsRef.current.filter((id) =>
        isDeletableGraphNode(
          id,
          displayGraphRef.current,
          strictDisplayGraphRef.current,
        ),
      );
      deleteGraphNodes(selectedIds);
    }

    function deleteGraphNodes(selectedIds: string[]) {
      if (selectedIds.length === 0) return;
      commitGraphUpdate((graph) => {
        const nodes = { ...(graph?.nodes ?? {}) };
        const customNodes = { ...(graph?.customNodes ?? {}) };
        const parameters = { ...(graph?.parameters ?? {}) };
        const groups = { ...(graph?.groups ?? {}) };
        const selectedSet = new Set(selectedIds);
        for (const id of selectedIds) {
          const groupId = customNodes[id]?.details?.groupId;
          delete nodes[id];
          delete customNodes[id];
          delete parameters[id];
          if (groupId) delete groups[groupId];
        }
        return {
          nodes,
          edges: (graph?.edges ?? []).filter(
            (edge) =>
              !selectedSet.has(getEditorEdgeFromNodeId(edge as any)) &&
              !selectedSet.has(getEditorEdgeToNodeId(edge as any)),
          ),
          customNodes: Object.keys(customNodes).length
            ? customNodes
            : undefined,
          groups: Object.keys(groups).length ? groups : undefined,
          parameters: Object.keys(parameters).length ? parameters : undefined,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      setGraphNodeSelection([]);
      setContextMenu(null);
    }

    function copySelectedNodes() {
      const graph = displayGraphRef.current;
      const selectedIds = selectedGraphNodeIdsRef.current.filter((id) =>
        isCustomGraphNode(id, graph),
      );
      if (!graph || selectedIds.length === 0) return;
      const selectedSet = new Set(selectedIds);
      const nodes = Object.fromEntries(
        Object.entries(graph.nodes ?? {}).filter(([id]) => selectedSet.has(id)),
      );
      const customNodes = Object.fromEntries(
        Object.entries(graph.customNodes ?? {}).filter(([id]) =>
          selectedSet.has(id),
        ),
      );
      const parameters = Object.fromEntries(
        Object.entries(graph.parameters ?? {}).filter(([id]) =>
          selectedSet.has(id),
        ),
      );
      const groupIds = new Set(
        Object.values(customNodes)
          .map((node) => node.details?.groupId)
          .filter(Boolean) as string[],
      );
      const sourceGroups = graphRef.current?.groups;
      const groups = sourceGroups
        ? Object.fromEntries(
            Object.entries(sourceGroups).filter(([id]) => groupIds.has(id)),
          )
        : undefined;
      graphClipboardRef.current = {
        nodes,
        customNodes,
        edges: (graph.edges ?? []).filter(
          (edge) =>
            selectedSet.has(edge.fromNodeId) && selectedSet.has(edge.toNodeId),
        ),
        parameters: Object.keys(parameters).length ? parameters : undefined,
        groups: groups && Object.keys(groups).length ? groups : undefined,
      };
      setContextMenu(null);
    }

    function pasteGraphNodes() {
      const clipboard = graphClipboardRef.current;
      if (!clipboard || Object.keys(clipboard.customNodes).length === 0) return;
      const suffix = Date.now().toString(36);
      const nodeIdMap = new Map(
        Object.keys(clipboard.customNodes).map((id, index) => [
          id,
          `${id}:copy:${suffix}:${index}`,
        ]),
      );
      const groupIdMap = new Map(
        Object.keys(clipboard.groups ?? {}).map((id, index) => [
          id,
          `${id}:copy:${suffix}:${index}`,
        ]),
      );
      const pastedIds = Array.from(nodeIdMap.values());
      commitGraphUpdate((graph) => {
        const nodes = { ...(graph?.nodes ?? {}) };
        const customNodes = { ...(graph?.customNodes ?? {}) };
        const parameters = { ...(graph?.parameters ?? {}) };
        const groups = { ...(graph?.groups ?? {}) };
        for (const [oldId, newId] of nodeIdMap) {
          const position = clipboard.nodes[oldId] ?? { x: 0, y: 0 };
          nodes[newId] = { x: position.x + 2, y: position.y + 2 };
          const custom = clipboard.customNodes[oldId];
          const groupId = custom.details?.groupId;
          customNodes[newId] = {
            ...custom,
            details:
              groupId && groupIdMap.has(groupId)
                ? {
                    ...(custom.details ?? {}),
                    groupId: groupIdMap.get(groupId)!,
                  }
                : custom.details,
          };
          if (clipboard.parameters?.[oldId])
            parameters[newId] = clipboard.parameters[oldId];
        }
        for (const [oldGroupId, newGroupId] of groupIdMap) {
          const group = clipboard.groups?.[oldGroupId];
          if (group)
            groups[newGroupId] = {
              ...group,
              id: newGroupId,
              name: `${group.name} Copy`,
            };
        }
        const edges = [
          ...((graph?.edges ?? []) as AnimationGraphEdge[]),
          ...clipboard.edges.map((edge: AnimationGraphEdge) => ({
            ...edge,
            id: `${nodeIdMap.get(edge.fromNodeId) ?? edge.fromNodeId}:${edge.fromPort}->${nodeIdMap.get(edge.toNodeId) ?? edge.toNodeId}:${edge.toPort}`,
            fromNodeId: nodeIdMap.get(edge.fromNodeId) ?? edge.fromNodeId,
            toNodeId: nodeIdMap.get(edge.toNodeId) ?? edge.toNodeId,
          })),
        ];
        return {
          nodes,
          edges,
          customNodes,
          groups: Object.keys(groups).length ? groups : graph?.groups,
          parameters: Object.keys(parameters).length
            ? parameters
            : graph?.parameters,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      setGraphNodeSelection(pastedIds);
      setContextMenu(null);
    }

    function focusMainLayerNode() {
      const viewport = graphViewportRef.current;
      if (!viewport) return;
      requestAnimationFrame(() =>
        centerGraphOnNodes(viewport, nodesRef.current),
      );
    }

    function setGraphScaleValue(nextScale: number) {
      const clamped = clampGraphScale(nextScale);
      graphScaleRef.current = clamped;
      setGraphScale(clamped);
      return clamped;
    }

    function zoomGraphAtPoint(
      nextScale: number,
      clientX: number,
      clientY: number,
    ) {
      const viewport = graphViewportRef.current;
      if (!viewport) return;
      const previousScale = graphScaleRef.current;
      const clamped = setGraphScaleValue(nextScale);
      const rect = viewport.getBoundingClientRect();
      const graphX =
        (viewport.scrollLeft + clientX - rect.left) / previousScale;
      const graphY = (viewport.scrollTop + clientY - rect.top) / previousScale;
      requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(
          0,
          graphX * clamped - (clientX - rect.left),
        );
        viewport.scrollTop = Math.max(
          0,
          graphY * clamped - (clientY - rect.top),
        );
      });
    }

    function zoomGraphFromCenter(nextScale: number) {
      const viewport = graphViewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomGraphAtPoint(
        nextScale,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    }

    function resetGraphZoom() {
      setGraphScaleValue(1);
      focusMainLayerNode();
    }

    function onGraphWheel(event: WheelEvent<HTMLDivElement>) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      zoomGraphAtPoint(
        graphScaleRef.current * Math.exp(-normalizeWheelDelta(event) * 0.0012),
        event.clientX,
        event.clientY,
      );
    }

    function scrollToGraphNode(nodeId: string) {
      const viewport = graphViewportRef.current;
      const targetNode = nodesRef.current.find((node) => node.id === nodeId);
      if (!viewport || !targetNode) return;
      const rect = nodeRect(targetNode);
      viewport.scrollLeft = Math.max(
        0,
        rect.x * graphScale +
          (rect.width * graphScale) / 2 -
          viewport.clientWidth / 2,
      );
      viewport.scrollTop = Math.max(
        0,
        rect.y * graphScale +
          (rect.height * graphScale) / 2 -
          viewport.clientHeight / 2,
      );
      scheduleDraw();
    }

    function centerGraphOnNodes(
      viewport: HTMLDivElement,
      graphNodes: GraphNode[],
    ) {
      const rect = getGraphNodesBounds(graphNodes);
      viewport.scrollLeft = Math.max(
        0,
        Math.round(
          rect
            ? (rect.x + rect.width / 2) * graphScaleRef.current -
                viewport.clientWidth / 2
            : (graphScrollWidth - viewport.clientWidth) / 2,
        ),
      );
      viewport.scrollTop = Math.max(
        0,
        Math.round(
          rect
            ? (rect.y + rect.height / 2) * graphScaleRef.current -
                viewport.clientHeight / 2
            : (graphScrollHeight - viewport.clientHeight) / 2,
        ),
      );
      scheduleDraw();
    }

    function returnToMainGraph() {
      setActiveGroupNodeId(null);
      requestAnimationFrame(() => {
        const viewport = graphViewportRef.current;
        if (!viewport) return;
        centerGraphOnNodes(viewport, nodesRef.current);
      });
    }

    const activeGroupNode = activeGroupNodeId
      ? (nodes.find((node) => node.id === activeGroupNodeId) ?? null)
      : null;
    const activeGroupId = activeGroupNode?.details?.groupId;
    const activeGroup = activeGroupId
      ? (graph as AnimationGraphState | undefined)?.groups?.[activeGroupId]
      : undefined;
    const compileStatus = isStrictComposition2dGraph(
      graph as StrictAnimationGraph | undefined,
    )
      ? getStrictComposition2dCanvasDiagnostics(
          compileAnimationGraph(graph as unknown as StrictAnimationGraph, {
            trace: true,
          }),
        )
      : getEmptyStrictComposition2dCanvasDiagnostics();
    const compileErrors = compileStatus.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    const compileWarnings = compileStatus.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "warning",
    );
    const [issuePanelType, setIssuePanelType] = useState<
      "error" | "warning" | null
    >(null);
    const selectedDebug = selectedGraphNodeIds
      .map((nodeId) => ({
        nodeId,
        node: nodes.find((node) => node.id === nodeId),
        diagnostics: compileStatus.nodes.get(nodeId),
      }))
      .filter((item) => item.node || item.diagnostics)
      .at(-1);
    useEffect(() => {
      if (issuePanelType === "warning" && compileWarnings.length === 0)
        setIssuePanelType(null);
      if (issuePanelType === "error" && compileErrors.length === 0)
        setIssuePanelType(null);
    }, [compileErrors.length, compileWarnings.length, issuePanelType]);

    return (
      <footer
        data-timeline-panel
        className="relative grid h-full min-h-0 select-none grid-rows-[34px_38px_minmax(0,1fr)] gap-1.5 overflow-hidden border-t border-[#1d2028] bg-[#141821] px-[22px] pb-0 pt-2.5"
      >
        <div className="relative flex items-center justify-between text-[12px] text-[#9b9da7]">
          <div
            className="relative z-10 flex rounded-full border border-[#2d313b] bg-[#111319] p-1"
            aria-label="Timeline mode"
          >
            <button
              className="rounded-full bg-[var(--clipper-accent)] px-3 py-1 text-xs font-extrabold text-[var(--clipper-accent-foreground)] transition"
              onClick={() => undefined}
            >
              Compose
            </button>
            <button
              className="rounded-full px-3 py-1 text-xs font-extrabold text-[#9b9da7] transition hover:text-white"
              onClick={onExitCompose}
            >
              Direct
            </button>
          </div>
          <button
            className={`relative z-10 rounded-full border px-3 py-1 text-xs font-extrabold transition ${
              graphEnabled
                ? "border-[#f4ecdc] bg-[#f4ecdc] text-[#14110d]"
                : "border-[#303746] bg-[#111319] text-[#9b9da7] hover:border-[#5f6878] hover:text-white"
            }`}
            onClick={() => onGraphEnabledChange?.(!graphEnabled)}
            title={
              graphEnabled
                ? "Effect graph controls compose preview"
                : "Effect graph ignored; render all elements"
            }
          >
            Graph {graphEnabled ? "On" : "Off"}
          </button>
          <div className="relative z-10 flex items-center gap-2">
            <button
              className="rounded-full border border-[#303746] px-2 py-1 text-[11px] font-bold text-[#c7ceda] transition hover:border-[#5f6878] hover:text-white"
              onClick={() => zoomGraphFromCenter(graphScaleRef.current / 1.15)}
              title="Zoom graph out"
            >
              -
            </button>
            <button
              className="min-w-[54px] rounded-full border border-transparent px-2 py-1 text-center text-[12px] text-[#dfe2ea] tabular-nums transition hover:border-[#5f6878] hover:text-white"
              onClick={resetGraphZoom}
              title="Reset graph zoom"
            >
              {Math.round(graphScale * 100)}%
            </button>
            <button
              className="rounded-full border border-[#303746] px-2 py-1 text-[11px] font-bold text-[#c7ceda] transition hover:border-[#5f6878] hover:text-white"
              onClick={() => zoomGraphFromCenter(graphScaleRef.current * 1.15)}
              title="Zoom graph in"
            >
              +
            </button>
          </div>
        </div>
        <div
          ref={playbackPlayheadRef}
          className="relative min-h-0 overflow-visible"
        >
          <div
            className="pointer-events-none absolute top-[12px] z-40 h-3 w-2.5 rounded-[2px] bg-[var(--clipper-accent)]"
            style={{
              left: "var(--clipper-playhead-left)",
              clipPath: "polygon(0 0, 100% 0, 100% 68%, 50% 100%, 0 68%)",
              transform: "translateX(-50%)",
            }}
          />
          <GraphTimeRuler
            rulerRef={rulerRef}
            ticks={ticks}
            sceneDuration={timelineDuration}
            onPointerDown={startScrub}
            onPointerMove={continueScrub}
            onPointerUp={endScrub}
            onPointerCancel={endScrub}
          />
          {delayMarkers.map((marker, index) => {
            const colocatedIndex = delayMarkers
              .slice(0, index)
              .filter(
                (item) => Math.abs(item.delay - marker.delay) < 0.0001,
              ).length;
            return (
              <button
                key={marker.key}
                className="absolute z-50 h-1.5 w-1.5 -translate-x-1/2 rotate-45 cursor-default touch-none border border-[#b9d7ff] bg-[#7ea8d8] shadow-[0_0_0_2px_rgba(126,168,216,0.14)] transition hover:scale-150"
                style={{
                  left: `${((draggingDelayMarker?.key === marker.key ? draggingDelayMarker.delay : marker.delay) / timelineDuration) * 100}%`,
                  top: `${21 + colocatedIndex * 7}px`,
                }}
                title={`${marker.label} delay ${formatSeconds(marker.delay)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (suppressNextDelayMarkerClickRef.current) {
                    suppressNextDelayMarkerClickRef.current = false;
                    return;
                  }
                  scrollToGraphNode(marker.nodeId);
                }}
                onPointerDown={
                  marker.draggable === false
                    ? undefined
                    : (event) => startDelayMarkerDrag(event, marker)
                }
                onPointerMove={
                  marker.draggable === false
                    ? undefined
                    : continueDelayMarkerDrag
                }
                onPointerUp={
                  marker.draggable === false ? undefined : endDelayMarkerDrag
                }
                onPointerCancel={
                  marker.draggable === false ? undefined : endDelayMarkerDrag
                }
              />
            );
          })}
        </div>
        {activeGroupNode ? (
          <div className="relative min-h-0 overflow-hidden rounded-b-[18px] bg-[#0b0f16]">
            <div className="pointer-events-none absolute left-3 top-3 z-50 flex items-center gap-2">
              <button
                className="pointer-events-auto rounded-full border border-[#394255] bg-[#141b27]/95 px-3 py-1.5 text-[11px] font-extrabold text-[#dfe6f3] shadow-[0_10px_30px_rgba(0,0,0,0.32)] transition hover:border-[#6f7c91] hover:text-white"
                onClick={returnToMainGraph}
                onPointerDown={(event) => event.stopPropagation()}
              >
                Exit {activeGroupNode.label}
              </button>
            </div>
            <GroupSubgraphPreview
              group={activeGroup}
              graph={graph}
              groupNodeId={activeGroupNode.id}
              groupId={activeGroupId}
              currentTime={currentTime}
              objects={selectedObjects}
              onGroupReplace={replaceGroup}
            />
          </div>
        ) : (
          <GraphCanvasSurface
            canvasRef={canvasRef}
            viewportRef={graphViewportRef}
            scrollWidth={hasSelectedGraph ? graphScrollWidth : 0}
            scrollHeight={hasSelectedGraph ? graphScrollHeight : 0}
            hoverNodeId={hoverNodeId}
            hoverEdgeId={hoverEdgeId}
            className="clipper-hidden-scrollbar relative min-h-0 overflow-auto rounded-b-[18px] bg-[#0b0f16]"
            onScroll={onGraphScroll}
            onWheel={onGraphWheel}
            onClick={onClick}
            onContextMenu={openContextMenu}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerLeave={onPointerLeave}
          >
            {hasSelectedGraph ? (
              <>
                {renamingGroupNodeId ? (
                  <GraphNodeRenameInput
                    node={
                      nodes.find((node) => node.id === renamingGroupNodeId) ??
                      null
                    }
                    viewportRef={graphViewportRef}
                    graphScale={graphScale}
                    onCommit={(name) =>
                      commitGroupRename(renamingGroupNodeId, name)
                    }
                    onCancel={() => {
                      setRenamingGroupNodeId(null);
                      scheduleDraw();
                    }}
                  />
                ) : null}
                <AppContextMenu
                  menu={contextMenu}
                  onClose={() => {
                    contextMenuPointRef.current = null;
                    setContextMenu(null);
                  }}
                />
                <div className="sticky bottom-3 left-3 z-40 flex w-fit items-center gap-2">
                  <button
                    className="flex items-center gap-1.5 rounded-full border border-[#303746] bg-[#121722]/90 px-3 py-1.5 text-[11px] font-semibold text-[#c7ceda] shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:border-[#5f6878] hover:text-white"
                    title="Add effect graph preset"
                    onClick={openGraphPresetMenu}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    Add preset
                    <ChevronDown
                      className="h-3.5 w-3.5 text-[#dfe6f3]"
                      strokeWidth={2.6}
                    />
                  </button>
                  <button
                    className="rounded-full border border-[#303746] bg-[#121722]/90 px-3 py-1.5 text-[11px] font-semibold text-[#c7ceda] shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:border-[#5f6878] hover:text-white"
                    title="Scroll to selected layer node at 100%"
                    onClick={focusMainLayerNode}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    Scroll to node
                  </button>
                </div>
                <GraphIssueIndicator
                  viewportRef={graphViewportRef}
                  errorCount={compileErrors.length}
                  warningCount={compileWarnings.length}
                  onToggle={setIssuePanelType}
                />
                <GraphIssuePanel
                  type={issuePanelType}
                  viewportRef={graphViewportRef}
                  errors={compileErrors}
                  warnings={compileWarnings}
                  nodes={nodes}
                  onClose={() => setIssuePanelType(null)}
                />
                {selectedDebug ? (
                  <div className="pointer-events-none sticky bottom-3 left-full z-40 ml-auto mr-3 grid max-w-[360px] gap-2 rounded-2xl border border-[#303746] bg-[#10151f]/95 p-3 text-[11px] text-[#c7ceda] shadow-[0_18px_50px_rgba(0,0,0,0.34)]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-extrabold text-[#f2f5fb]">
                        Debug{" "}
                        {selectedDebug.node?.label ?? selectedDebug.nodeId}
                      </span>
                      <span className="rounded-full border border-[#303746] px-2 py-0.5 text-[10px] font-bold uppercase text-[#8f98a8]">
                        {compileStatus.status}
                      </span>
                    </div>
                    {(selectedDebug.diagnostics?.messages.length ?? 0) > 0 ? (
                      <div className="grid gap-1 text-[#ffd0a3]">
                        {selectedDebug.diagnostics?.messages
                          .slice(0, 4)
                          .map((message) => (
                            <div key={message}>{message}</div>
                          ))}
                      </div>
                    ) : null}
                    {(selectedDebug.diagnostics?.traces.length ?? 0) > 0 ? (
                      <div className="grid gap-1 text-[#a8d7ff]">
                        {selectedDebug.diagnostics?.traces
                          .slice(0, 5)
                          .map((trace) => (
                            <div key={trace}>{trace}</div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="grid h-full min-h-[220px] place-items-center text-center text-sm font-semibold text-[#8b93a3]">
                Select a layer to view effect graph
              </div>
            )}
          </GraphCanvasSurface>
        )}
      </footer>
    );
  },
);

function GraphIssueIndicator({
  viewportRef,
  errorCount,
  warningCount,
  onToggle,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  errorCount: number;
  warningCount: number;
  onToggle: (
    updater: (type: "error" | "warning" | null) => "error" | "warning" | null,
  ) => void;
}) {
  if (
    (errorCount === 0 && warningCount === 0) ||
    typeof document === "undefined"
  )
    return null;
  const rect = viewportRef.current?.getBoundingClientRect();
  const right = rect ? Math.max(16, window.innerWidth - rect.right + 12) : 16;
  const bottom = rect
    ? Math.max(16, window.innerHeight - rect.bottom + 12)
    : 24;
  return createPortal(
    <div
      className="fixed z-[1000] flex items-center justify-end gap-2"
      style={{ right, bottom }}
    >
      {errorCount > 0 ? (
        <button
          className="grid h-8 min-w-8 place-items-center rounded-full border border-[#303746] bg-[#321414]/96 px-2 text-[12px] font-black tabular-nums text-[#ffb7b7] shadow-[0_14px_36px_rgba(0,0,0,0.36)] transition hover:border-[#667186] hover:text-white"
          title="Show graph errors"
          onClick={() =>
            onToggle((type) => (type === "error" ? null : "error"))
          }
        >
          {errorCount}
        </button>
      ) : null}
      {warningCount > 0 ? (
        <button
          className="flex h-8 items-center gap-1.5 rounded-full border border-[#303746] bg-[#1b1710]/95 px-3 text-[11px] font-extrabold text-[#ffd88a] shadow-[0_14px_36px_rgba(0,0,0,0.36)] transition hover:border-[#667186] hover:text-[#fff0c2]"
          title="Show graph warnings"
          onClick={() =>
            onToggle((type) => (type === "warning" ? null : "warning"))
          }
        >
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
          {warningCount}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

function GraphIssuePanel({
  type,
  viewportRef,
  errors,
  warnings,
  nodes,
  onClose,
}: {
  type: "error" | "warning" | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  errors: AnimationGraphDiagnostic[];
  warnings: AnimationGraphDiagnostic[];
  nodes: GraphNode[];
  onClose: () => void;
}) {
  const [renderedType, setRenderedType] = useState<"error" | "warning" | null>(
    type,
  );
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (type) {
      setRenderedType(type);
      setClosing(false);
      return undefined;
    }
    if (!renderedType) return undefined;
    setClosing(true);
    const timeout = window.setTimeout(() => {
      setRenderedType(null);
      setClosing(false);
    }, 140);
    return () => window.clearTimeout(timeout);
  }, [renderedType, type]);

  useEffect(() => {
    if (!renderedType || typeof document === "undefined") return undefined;
    const onPointerDown = (event: Event) => {
      const panel = panelRef.current;
      if (panel?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, renderedType]);

  const issues = renderedType === "error" ? errors : warnings;
  if (!renderedType || issues.length === 0 || typeof document === "undefined")
    return null;
  const rect = viewportRef.current?.getBoundingClientRect();
  const panelWidth = 360;
  const right = rect ? Math.max(16, window.innerWidth - rect.right + 12) : 16;
  const bottom = rect
    ? Math.max(16, window.innerHeight - rect.bottom + 54)
    : 64;
  const maxHeight = rect ? Math.max(180, Math.min(420, rect.height - 76)) : 360;
  return createPortal(
    <div
      ref={panelRef}
      className={`fixed z-[1000] grid origin-bottom-right gap-2 rounded-lg border border-[#303746] bg-[#11151d]/98 p-2.5 text-[11px] text-[#d6d9e1] shadow-[0_24px_70px_rgba(0,0,0,0.48)] transition duration-150 ease-out ${
        closing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100"
      }`}
      style={{ right, bottom, width: panelWidth, maxHeight }}
      role="dialog"
      aria-label={renderedType === "error" ? "Graph errors" : "Graph warnings"}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#252b37] pb-2">
        <div
          className={`flex items-center gap-2 font-extrabold ${
            renderedType === "error" ? "text-[#ffb7b7]" : "text-[#ffd88a]"
          }`}
        >
          {issues.length} {renderedType === "error" ? "error" : "warning"}
          {issues.length === 1 ? "" : "s"}
        </div>
        <button
          className="rounded border border-[#313845] px-1.5 py-0.5 text-[10px] font-bold text-[#aeb6c4] transition hover:border-[#667186] hover:text-white"
          onClick={onClose}
        >
          x
        </button>
      </div>
      <div className="clipper-hidden-scrollbar grid gap-2 overflow-auto pr-1">
        {issues.map((warning, index) => (
          <div
            key={`${warning.message}:${warning.nodeId ?? ""}:${warning.edgeId ?? ""}:${index}`}
            className="rounded-md border border-[#303746] bg-[#171d28] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
          >
            <div
              className={`mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                warning.severity === "error"
                  ? "text-[#ffb7b7]"
                  : "text-[#ffd88a]"
              }`}
            >
              {formatGraphWarningLocation(warning, nodes)}
            </div>
            <div className="leading-5 text-[#e8ebf2]">{warning.message}</div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function formatGraphWarningLocation(
  warning: AnimationGraphDiagnostic,
  nodes: GraphNode[],
) {
  const node = warning.nodeId
    ? nodes.find((candidate) => candidate.id === warning.nodeId)
    : null;
  if (node) return node.label;
  if (warning.nodeId) return warning.nodeId;
  if (warning.edgeId) return "Edge";
  return "Graph";
}

function GraphCanvasSurface({
  canvasRef,
  viewportRef,
  scrollWidth,
  scrollHeight,
  hoverNodeId,
  hoverEdgeId,
  className = "relative overflow-hidden bg-[#0b0f16]",
  canvasClassName = "block bg-[#0b0f16]",
  onScroll,
  onWheel,
  onDragOver,
  onDrop,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  children,
}: GraphCanvasSurfaceProps) {
  return (
    <div
      ref={viewportRef}
      className={className}
      onPointerDown={(event) => event.stopPropagation()}
      onScroll={onScroll}
      onWheel={onWheel}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="sticky left-0 top-0 z-10 h-0 overflow-visible">
        <canvas
          ref={canvasRef}
          className={`${canvasClassName} ${hoverNodeId || hoverEdgeId ? "cursor-pointer" : "cursor-default"}`}
          width={1}
          height={1}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
        />
      </div>
      <div
        className="pointer-events-none relative z-0 bg-[#0b0f16]"
        style={{ width: scrollWidth, height: scrollHeight }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

function GraphTimeRuler({
  rulerRef,
  ticks,
  sceneDuration,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  rulerRef: RefObject<HTMLDivElement | null>;
  ticks: number[];
  sceneDuration: number;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const marks = useMemo(() => {
    const roundedDuration = Math.max(sceneDuration, 0);
    const labeled = new Set(ticks.map((tick) => roundTenth(tick)));
    const minorStep = roundedDuration <= 8 ? 0.5 : 1;
    const items: Array<{ time: number; kind: "major" | "medium" | "minor" }> =
      [];
    for (
      let time = 0;
      time <= roundedDuration;
      time = roundTenth(time + minorStep)
    ) {
      const rounded = roundTenth(time);
      const isMajor =
        rounded === 0 ||
        rounded === roundTenth(roundedDuration) ||
        labeled.has(rounded);
      const isMedium = Number.isInteger(rounded);
      items.push({
        time: rounded,
        kind: isMajor ? "major" : isMedium ? "medium" : "minor",
      });
    }
    if (!items.some((item) => item.time === roundTenth(roundedDuration)))
      items.push({ time: roundedDuration, kind: "major" });
    return items;
  }, [sceneDuration, ticks]);
  const labelTicks = useMemo(
    () =>
      ticks.filter(
        (tick, index) =>
          index === 0 || formatTime(tick) !== formatTime(ticks[index - 1]),
      ),
    [ticks],
  );

  return (
    <div
      ref={rulerRef}
      className="relative h-[38px] w-full pt-1.5 text-xs text-[#858a96] tabular-nums"
    >
      <div
        className="absolute inset-x-0 top-0 z-20 h-[38px]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#454b5a]" />
      {marks.map((mark) => {
        const left =
          sceneDuration > 0 ? `${(mark.time / sceneDuration) * 100}%` : "0%";
        const tickAlign =
          mark.time === 0
            ? "translate-x-0"
            : mark.time === sceneDuration
              ? "-translate-x-full"
              : "-translate-x-1/2";
        const className =
          mark.kind === "major"
            ? "h-[16px] bg-[#596071]"
            : mark.kind === "medium"
              ? "h-[11px] bg-[#444a58]"
              : "h-[6px] bg-[#363b47]";
        return (
          <span
            className={`pointer-events-none absolute bottom-0 w-px ${tickAlign} ${className}`}
            key={`${mark.time}-${mark.kind}`}
            style={{ left }}
          />
        );
      })}
      {labelTicks.map((tick) => {
        const isStart = tick === 0;
        const isEnd = tick === sceneDuration;
        const labelAlign = isStart
          ? "translate-x-0 text-left"
          : isEnd
            ? "-translate-x-full text-right"
            : "-translate-x-1/2 text-center";
        const left =
          sceneDuration > 0 ? `${(tick / sceneDuration) * 100}%` : "0%";
        return (
          <span
            className={`pointer-events-none absolute top-[5px] whitespace-nowrap font-semibold ${labelAlign}`}
            key={tick}
            style={{ left }}
          >
            {formatTime(tick)}
          </span>
        );
      })}
    </div>
  );
}

export function buildGraphNodes(
  objects: FrameObject[],
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  canvasWidth = 5200,
  canvasHeight = 900,
  graphViewportKey = "__empty__",
  mode: GraphCompositionMode = "composition2d",
): GraphNode[] {
  const legacyGraph = isStrictComposition2dGraph(graph) ? undefined : graph;
  const customNodeScopeKey = graphViewportKey;
  const verticalStackHeight = nodeHeight * 3 + nodeGap * 2;
  const stackStartY = Math.max(
    2,
    Math.round((canvasHeight / gridSize - verticalStackHeight) / 2),
  );
  const strictSourceObjectIds =
    mode === "composition2d"
      ? new Set(
          Object.values(graph?.nodes ?? {}).flatMap((node) =>
            node &&
            typeof node === "object" &&
            "kind" in node &&
            (node as { kind?: unknown }).kind === "source" &&
            "config" in node &&
            typeof (node as { config?: { objectId?: unknown } }).config
              ?.objectId === "string"
              ? [(node as { config: { objectId: string } }).config.objectId]
              : [],
          ),
        )
      : null;
  const derivedNodes = objects.flatMap((object, index) => {
    if (strictSourceObjectIds?.has(object.id)) return [];
    const layerWidth = getNodeGridWidth(object.name || object.id);
    const descriptors = graph ? [] : getAnimationNodeDescriptors(object);
    const clusterWidth = getObjectClusterWidth(object);
    const totalWidth =
      objects.reduce((width, item) => width + getObjectClusterWidth(item), 0) +
      Math.max(0, objects.length - 1) * nodeGap;
    const groupStartX = Math.max(
      2,
      Math.round((canvasWidth / gridSize - totalWidth) / 2),
    );
    const previousWidth = objects
      .slice(0, index)
      .reduce(
        (width, item) => width + getObjectClusterWidth(item) + nodeGap,
        0,
      );
    const clusterStartX = groupStartX + previousWidth;
    const layerX = clusterStartX + Math.round((clusterWidth - layerWidth) / 2);
    const animationY = stackStartY;
    const timeY = animationY + nodeGap;
    const layerY = timeY + nodeGap;
    const layerId = `layer:${object.id}`;
    const timeDescriptors = descriptors.filter(
      (descriptor) => descriptor.kind === "time",
    );
    const animationDescriptors = descriptors.filter(
      (descriptor) => descriptor.kind === "effect",
    );
    return [
      ...animationDescriptors.map((descriptor, descriptorIndex) => {
        const x =
          clusterStartX +
          getPackedOffset(animationDescriptors, descriptorIndex);
        return createNode(
          descriptor.id,
          descriptor.label,
          descriptor.kind,
          getGraphNodePositionOrDefault(graph?.nodes[descriptor.id], {
            x,
            y: animationY,
          }),
          descriptor.details,
        );
      }),
      ...timeDescriptors.map((descriptor, descriptorIndex) => {
        const width = getNodeGridWidth(descriptor.label);
        const x =
          clusterStartX +
          Math.round((clusterWidth - width) / 2) +
          (descriptorIndex - Math.floor(timeDescriptors.length / 2)) *
            (width + 1);
        return createNode(
          descriptor.id,
          descriptor.label,
          descriptor.kind,
          getGraphNodePositionOrDefault(graph?.nodes[descriptor.id], {
            x,
            y: timeY,
          }),
          descriptor.details,
        );
      }),
      createNode(
        layerId,
        mode === "composition2d" ? "Source" : object.name || object.id,
        "layer",
        getGraphNodePositionOrDefault(graph?.nodes[layerId], {
          x: layerX,
          y: layerY,
        }),
        {
          type: object.type,
          role: mode === "composition2d" ? "source" : "layer",
        },
      ),
    ];
  });
  const derivedNodeIds = new Set(derivedNodes.map((node) => node.id));
  const customNodes =
    mode === "composition2d"
      ? []
      : Object.entries(legacyGraph?.customNodes ?? {})
          .filter(([, node]) => node.scopeKey === customNodeScopeKey)
          .filter(([id]) => !derivedNodeIds.has(id))
          .flatMap(([id, node]) => {
            if (!isGraphNodeKind(node.kind)) return [];
            const details =
              node.kind === "group"
                ? {
                    ...(node.details ?? {}),
                    registered: hasGroupValidOutput(
                      legacyGraph?.groups?.[node.details?.groupId ?? ""],
                    )
                      ? "true"
                      : "false",
                  }
                : node.details;
            return [
              createNode(
                id,
                node.label,
                node.kind,
                legacyGraph?.nodes[id] ?? { x: 2, y: 2 },
                details,
              ),
            ];
          });
  const customNodeIds = new Set(customNodes.map((node) => node.id));
  const visibleTypedNodeIds = getVisibleComposition2dTypedNodeIds(
    graph,
    objects,
  );
  const typedNodesFromGraph = Object.entries(graph?.nodes ?? {})
    .filter(
      ([id, node]) =>
        (!visibleTypedNodeIds || visibleTypedNodeIds.has(id)) &&
        !derivedNodeIds.has(id) &&
        !customNodeIds.has(id) &&
        id !== composition2dOutNodeId &&
        node &&
        typeof node === "object" &&
        "kind" in node &&
        "config" in node,
    )
    .map(([id, node]) => {
      const typed = node as TypedAnimationGraphNode;
      return createNodeFromTypedNode(id, typed);
    });
  if (mode !== "composition2d") return [...derivedNodes, ...customNodes];
  const sourceNodes = derivedNodes.filter((node) => node.kind === "layer");
  const defaultOutPosition = sourceNodes.length
    ? {
        x: Math.max(...sourceNodes.map((node) => node.x + node.width + 4)),
        y: sourceNodes[0].y,
      }
    : {
        x: Math.round(canvasWidth / gridSize / 2),
        y: Math.round(canvasHeight / gridSize / 2),
      };
  return [
    ...derivedNodes,
    ...customNodes,
    ...typedNodesFromGraph,
    createNode(
      composition2dOutNodeId,
      "Out",
      "out",
      getGraphNodePositionOrDefault(
        graph?.nodes[composition2dOutNodeId],
        defaultOutPosition,
      ),
      undefined,
    ),
  ];
}

function getGraphNodePositionOrDefault(
  node:
    | AnimationGraphState["nodes"][string]
    | StrictAnimationGraph["nodes"][string]
    | undefined,
  fallback: { x: number; y: number },
) {
  const position =
    node && typeof node === "object" && "position" in node
      ? node.position
      : node;
  return hasFiniteGraphPoint(position) ? position : fallback;
}

function getVisibleComposition2dTypedNodeIds(
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  objects: FrameObject[],
) {
  if (!graph) return null;
  const objectIds = new Set(objects.map((object) => object.id));
  const typedNodes = Object.fromEntries(
    Object.entries(graph.nodes ?? {}).filter(
      ([, node]) =>
        node && typeof node === "object" && "kind" in node && "config" in node,
    ),
  ) as Record<string, TypedAnimationGraphNode>;
  if (isStrictComposition2dGraph(graph))
    return new Set(Object.keys(typedNodes));
  if (
    !isStrictComposition2dGraph(graph) &&
    "layers" in graph &&
    Array.isArray(graph.layers) &&
    graph.layers.length
  )
    return new Set(Object.keys(typedNodes));
  const sourceIds = Object.entries(typedNodes).flatMap(([id, node]) =>
    node.kind === "source" && objectIds.has(node.config.objectId) ? [id] : [],
  );
  if (sourceIds.length === 0) return null;
  const outIds = new Set(
    Object.entries(typedNodes).flatMap(([id, node]) =>
      node.kind === "out" ? [id] : [],
    ),
  );
  const neighbors = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    const fromNodeId = getEditorEdgeFromNodeId(edge);
    const toNodeId = getEditorEdgeToNodeId(edge);
    if (outIds.has(fromNodeId) || outIds.has(toNodeId)) continue;
    if (!neighbors.has(fromNodeId)) neighbors.set(fromNodeId, new Set());
    if (!neighbors.has(toNodeId)) neighbors.set(toNodeId, new Set());
    neighbors.get(fromNodeId)!.add(toNodeId);
    neighbors.get(toNodeId)!.add(fromNodeId);
  }
  const visible = new Set([...sourceIds, ...outIds]);
  const stack = [...sourceIds];
  while (stack.length) {
    const nodeId = stack.pop()!;
    for (const next of neighbors.get(nodeId) ?? []) {
      if (visible.has(next)) continue;
      visible.add(next);
      stack.push(next);
    }
  }
  for (const nodeId of Object.keys(typedNodes))
    if (!neighbors.has(nodeId) && !outIds.has(nodeId)) visible.add(nodeId);
  return visible;
}

export function getGraphContentSize(
  nodes: Array<{ x: number; y: number; width: number; height: number }>,
  minWidth: number,
  minHeight: number,
) {
  const padding = gridSize * 8;
  const maxRight = nodes.reduce((right, node) => {
    const rect = nodeRect(node as GraphNode);
    return Math.max(right, rect.x + rect.width + padding);
  }, minWidth);
  const maxBottom = nodes.reduce((bottom, node) => {
    const rect = nodeRect(node as GraphNode);
    return Math.max(bottom, rect.y + rect.height + padding);
  }, minHeight);
  return {
    width: Math.max(minWidth, Math.ceil(maxRight)),
    height: Math.max(minHeight, Math.ceil(maxBottom)),
  };
}

function buildGroupGraphNodes(group: AnimationGraphGroup): GraphNode[] {
  const nodes = Object.entries(group.customNodes ?? {}).flatMap(([id, node]) =>
    isGraphNodeKind(node.kind)
      ? [
          createNode(
            id,
            node.label,
            node.kind,
            group.nodes[id] ?? { x: 2, y: 2 },
            node.details,
          ),
        ]
      : [],
  );
  const inNode = group.inNodeId
    ? createNode(
        group.inNodeId,
        "In",
        "layer",
        group.nodes[group.inNodeId] ?? { x: 6, y: -4 },
        { source: "group" },
      )
    : null;
  return [
    ...(inNode ? [inNode] : []),
    ...nodes,
    createNode(
      group.outNodeId,
      "Out",
      "out",
      group.nodes[group.outNodeId] ?? { x: 6, y: 10 },
      undefined,
    ),
  ];
}

function buildGroupGraphContextNodes(
  group: AnimationGraphGroup,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
): GraphNode[] {
  const nodes = buildGroupGraphNodes(group);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const externalIds = new Set(
    (group.edges ?? []).flatMap((edge) => [edge.fromNodeId, edge.toNodeId]),
  );
  const derivedNodes = objects.flatMap((object) =>
    getAnimationNodeDescriptors(object),
  );
  const externalNodes = Array.from(externalIds).flatMap((id) => {
    if (nodeIds.has(id)) return [];
    const customNode = graph?.customNodes?.[id];
    if (customNode && isGraphNodeKind(customNode.kind))
      return [
        createNode(
          id,
          customNode.label,
          customNode.kind,
          graph?.nodes[id] ?? { x: 0, y: 0 },
          customNode.details,
        ),
      ];
    const derivedNode = derivedNodes.find((node) => node.id === id);
    if (!derivedNode) return [];
    return [
      createNode(
        id,
        derivedNode.label,
        derivedNode.kind,
        graph?.nodes[id] ?? { x: 0, y: 0 },
        derivedNode.details,
      ),
    ];
  });
  return [...nodes, ...externalNodes];
}

function buildGroupEquivalentGraphContext(
  groupNodeId: string | undefined,
  group: AnimationGraphGroup,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
  parentEdges: AnimationGraphEdge[] = graph?.edges ?? [],
  parentNodes: GraphNode[] = [],
) {
  const baseNodes = buildGroupGraphContextNodes(group, graph, objects);
  const nodesById = new Map(baseNodes.map((node) => [node.id, node]));
  const parentSources = groupNodeId
    ? parentEdges.filter((edge) => edge.toNodeId === groupNodeId)
    : [];
  const parentTargets = groupNodeId
    ? parentEdges.filter((edge) => edge.fromNodeId === groupNodeId)
    : [];
  for (const edge of [...parentSources, ...parentTargets]) {
    if (!nodesById.has(edge.toNodeId)) {
      const node = getGraphContextNode(
        edge.toNodeId,
        graph,
        objects,
        parentNodes,
      );
      if (node) nodesById.set(node.id, node);
    }
    if (!nodesById.has(edge.fromNodeId)) {
      const sourceNode = getGraphContextNode(
        edge.fromNodeId,
        graph,
        objects,
        parentNodes,
      );
      if (sourceNode) nodesById.set(sourceNode.id, sourceNode);
    }
  }
  const nodes = Array.from(nodesById.values());
  const contextGraph = graph
    ? {
        ...graph,
        customNodes: {
          ...(graph.customNodes ?? {}),
          ...(groupNodeId
            ? {
                [groupNodeId]: {
                  kind: "group" as const,
                  label: "Group",
                  scopeKey: group.id,
                  details: { groupId: group.id },
                },
              }
            : {}),
        },
        groups: { ...(graph.groups ?? {}), [group.id]: group },
      }
    : undefined;
  const expanded = contextGraph
    ? expandAnimationGraphGroups({
        graph: contextGraph,
        baseCustomNodes: {},
        baseParameters: graph?.parameters ?? {},
        parentEdges,
        includeGroupNode: (nodeId) => nodeId === groupNodeId,
      })
    : null;
  const edges = filterPermittedEdges(
    filterRenderableEdges(expanded?.edges ?? group.edges ?? [], nodes),
    nodes,
  );
  const customNodes = Object.fromEntries(
    nodes.flatMap((node) => {
      if (node.kind === "layer" || node.kind === "out") return [];
      const customNode = toAnimationGraphCustomNode(node, group.id);
      return customNode ? [[node.id, customNode]] : [];
    }),
  ) satisfies NonNullable<AnimationGraphState["customNodes"]>;
  return { nodes, edges, customNodes };
}

function getGraphContextNode(
  nodeId: string,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
  parentNodes: GraphNode[],
) {
  const parentNode = parentNodes.find((node) => node.id === nodeId);
  if (parentNode) return parentNode;
  const customNode = graph?.customNodes?.[nodeId];
  if (customNode && isGraphNodeKind(customNode.kind))
    return createNode(
      nodeId,
      customNode.label,
      customNode.kind,
      graph?.nodes[nodeId] ?? { x: 0, y: 0 },
      customNode.details,
    );
  for (const object of objects) {
    if (nodeId === `layer:${object.id}`)
      return createNode(
        nodeId,
        object.name || object.id,
        "layer",
        { x: 0, y: 0 },
        { type: object.type },
      );
    const descriptor = getAnimationNodeDescriptors(object).find(
      (item) => item.id === nodeId,
    );
    if (descriptor)
      return createNode(
        nodeId,
        descriptor.label,
        descriptor.kind,
        graph?.nodes[nodeId] ?? { x: 0, y: 0 },
        descriptor.details,
      );
  }
  return null;
}

function stripGraphViewportState(
  graph: AnimationGraphState | StrictAnimationGraph,
): AnimationGraphState | StrictAnimationGraph {
  const { viewport: _viewport, ...rest } = graph;
  if (isStrictComposition2dGraph(graph as StrictAnimationGraph)) {
    return {
      ...(rest as StrictAnimationGraph),
      nodes: roundGraphNodes(
        rest.nodes,
      ) as unknown as StrictAnimationGraph["nodes"],
    };
  }
  const { viewports: _viewports, ...withoutViewports } =
    rest as AnimationGraphState;
  return {
    ...withoutViewports,
    nodes: roundGraphNodes(rest.nodes),
  } as AnimationGraphState;
}

export function getSelectedComposition2dLayerGraph(
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  layerId: string | undefined,
  mode: GraphCompositionMode,
): AnimationGraphState | undefined {
  if (mode !== "composition2d" || !layerId)
    return graph as AnimationGraphState | undefined;
  if (isStrictComposition2dGraph(graph))
    return graph as unknown as AnimationGraphState;
  return undefined;
}

export function setSelectedComposition2dLayerGraph(
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  layerGraph: AnimationGraphState | StrictAnimationGraph,
  layerId: string | undefined,
  mode: GraphCompositionMode,
): AnimationGraphState | StrictAnimationGraph {
  if (mode !== "composition2d" || !layerId) return layerGraph;
  return saveStrictComposition2dGraph(
    layerGraph as StrictComposition2dEditorGraph,
    isStrictComposition2dGraph(graph) ? graph : undefined,
    layerId,
  );
}

function getEditorEdgeToNodeId(
  edge: AnimationGraphEdge | StrictAnimationGraphEdge,
) {
  return "to" in edge ? edge.to.nodeId : edge.toNodeId;
}

function getEditorEdgeFromNodeId(
  edge: AnimationGraphEdge | StrictAnimationGraphEdge,
) {
  return "from" in edge ? edge.from.nodeId : edge.fromNodeId;
}

function getEditorEdgeFromSocket(
  edge: AnimationGraphEdge | StrictAnimationGraphEdge,
) {
  return "from" in edge ? edge.from.portId : edge.fromSocket;
}

function getEditorEdgeToSocket(
  edge: AnimationGraphEdge | StrictAnimationGraphEdge,
) {
  return "to" in edge ? edge.to.portId : edge.toSocket;
}

function getLegacyEdge(edge: RenderableGraphEdge): AnimationGraphEdge | null {
  return "from" in edge ? null : edge;
}

function getEditorLegacyEdge(edge: EditorGraphEdge): AnimationGraphEdge | null {
  return "from" in edge ? null : edge;
}

function roundGraphNodes(
  nodes:
    | AnimationGraphState["nodes"]
    | StrictAnimationGraph["nodes"]
    | undefined,
) {
  return Object.fromEntries(
    Object.entries(nodes ?? {}).map(([id, node]) => {
      if (
        node &&
        typeof node === "object" &&
        "position" in node &&
        "kind" in node
      ) {
        const typedNode = node as TypedAnimationGraphNode;
        const position = roundGraphNodePosition(typedNode.position);
        return [id, { ...typedNode, position, x: position.x, y: position.y }];
      }
      return [id, roundGraphNodePosition(node)];
    }),
  );
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], .monaco-editor, .cm-editor",
    ),
  );
}

function getObjectClusterWidth(object: FrameObject) {
  const animationDescriptors = getAnimationNodeDescriptors(object).filter(
    (descriptor) => descriptor.kind === "effect",
  );
  const animationWidth = animationDescriptors.reduce(
    (width, descriptor, index) =>
      width + getNodeGridWidth(descriptor.label) + (index > 0 ? 1 : 0),
    0,
  );
  return Math.max(
    getNodeGridWidth(object.name || object.id),
    animationWidth,
    minNodeWidth,
  );
}

function getPackedOffset(descriptors: Array<{ label: string }>, index: number) {
  return descriptors
    .slice(0, index)
    .reduce(
      (offset, descriptor) => offset + getNodeGridWidth(descriptor.label) + 1,
      0,
    );
}

function createNode(
  id: string,
  label: string,
  kind: GraphNode["kind"],
  position: { x: number; y: number },
  details?: Record<string, string>,
): GraphNode {
  const safePosition = sanitizeGraphPoint(position);
  const nodeKind = kind === "group" ? "group" : kind;
  const typedKind = getComposition2dTypedNodeKind(nodeKind);
  const typedNode = typedKind
    ? createTypedAnimationGraphNode(id, typedKind, safePosition, details, label)
    : undefined;
  if (typedNode?.kind === "source") {
    const sourceStructureType = getTypedSourceOutputType(details?.type);
    typedNode.outputs = typedNode.outputs.map((socket) =>
      socket.id === "structure"
        ? { ...socket, type: sourceStructureType }
        : socket,
    );
    typedNode.config = {
      ...typedNode.config,
      objectId: id.startsWith("layer:") ? id.slice("layer:".length) : id,
    };
  }
  return {
    id,
    label,
    kind: nodeKind,
    x: safePosition.x,
    y: safePosition.y,
    width: getNodeGridWidth(label),
    height: nodeHeight,
    details,
    typedNode,
  };
}

function createNodeFromTypedNode(
  id: string,
  typed: StrictAnimationGraphNode &
    Partial<Pick<TypedAnimationGraphNode, "label" | "x" | "y">>,
): GraphNode {
  const label =
    typed.label ??
    getAnimationGraphNodeDefinition(typed.kind)?.label ??
    typed.kind;
  const uiKind: GraphNode["kind"] =
    typed.kind === "source"
      ? "layer"
      : typed.kind === "effect"
        ? isSingleEffectNode(typed)
          ? "effect"
          : "effectMix"
        : typed.kind;
  return {
    id,
    label,
    kind: uiKind,
    ...sanitizeGraphPoint({
      x: typed.position?.x ?? typed.x ?? 0,
      y: typed.position?.y ?? typed.y ?? 0,
    }),
    width: getNodeGridWidth(label),
    height: nodeHeight,
    details: getTypedNodeDetails(typed),
    typedNode: typed,
  };
}

function createStrictAnimationGraphNode(
  id: string,
  kind: string,
  position: { x: number; y: number },
): StrictAnimationGraphNode | null {
  const definition = getAnimationGraphNodeDefinition(kind);
  if (!definition || !isCanvasSupportedStrictNodeKind(kind)) return null;
  return {
    id,
    kind,
    position: roundGraphNodePosition(position),
    config: definition.createDefaultConfig({ graphId: "editor" }),
  };
}

function isCanvasSupportedStrictNodeKind(kind: string) {
  return (
    kind === "time" ||
    kind === "split" ||
    kind === "condition" ||
    kind.startsWith("value:") ||
    kind.startsWith("effect:") ||
    kind.startsWith("geometry:")
  );
}

function getTypedNodeDetails(
  typed: StrictAnimationGraphNode &
    Partial<Pick<TypedAnimationGraphNode, "label" | "x" | "y">>,
): Record<string, string> | undefined {
  if (isLegacyEffectNode(typed)) {
    if (!isSingleEffectNode(typed)) return undefined;
    const effect = typed.config.effects[0];
    if (!effect) return undefined;
    return {
      property: effect.property,
      ...(effect.from !== undefined ? { from: String(effect.from) } : {}),
      ...(effect.to !== undefined ? { to: String(effect.to) } : {}),
      ...Object.fromEntries(
        Object.entries(effect.values).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    };
  }
  const definition = getAnimationGraphNodeDefinition(typed.kind);
  const controlKeys = new Set(
    definition?.controls?.flatMap((group) =>
      group.fields.map((field) => field.key),
    ) ?? [],
  );
  return Object.fromEntries(
    Object.entries(
      typeof typed.config === "object" && typed.config !== null
        ? typed.config
        : {},
    ).flatMap(([key, value]) =>
      (controlKeys.size === 0 || controlKeys.has(key)) &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
        ? [[key, String(value)]]
        : [],
    ),
  );
}

function getTypedSourceOutputType(
  objectType: string | undefined,
): AnimationGraphValueType {
  if (objectType === "text") return "Structure.TextObject";
  if (objectType === "rect" || objectType === "svg") return "Structure.Shape";
  return "Structure.Object";
}

function getComposition2dTypedNodeKind(
  kind: GraphNode["kind"],
): TypedAnimationGraphNode["kind"] | null {
  if (kind === "layer") return "source";
  if (kind === "effect" || kind === "effectMix") return "effect";
  if (
    kind === "time" ||
    kind === "split" ||
    kind === "condition" ||
    kind === "group" ||
    kind === "out"
  )
    return kind;
  return null;
}

function isGraphNodeKind(
  kind: AnimationGraphCustomNode["kind"],
): kind is Extract<GraphNode["kind"], AnimationGraphCustomNode["kind"]> {
  return (
    kind === "effect" ||
    kind === "time" ||
    kind === "split" ||
    kind === "condition" ||
    kind === "group" ||
    kind === "effectMix" ||
    kind === "oscillate"
  );
}

function toAnimationGraphCustomNode(
  node: GraphNode,
  scopeKey: string,
): AnimationGraphCustomNode | null {
  if (!isGraphNodeKind(node.kind as AnimationGraphCustomNode["kind"]))
    return null;
  return {
    kind: node.kind as AnimationGraphCustomNode["kind"],
    label: node.label,
    scopeKey,
    details: node.details,
  };
}

function isLegacyTypedAnimationGraphNode(
  node: StrictAnimationGraphNode | undefined,
): node is TypedAnimationGraphNode {
  return Boolean(
    node &&
    typeof (node as Partial<TypedAnimationGraphNode>).label === "string" &&
    Array.isArray((node as Partial<TypedAnimationGraphNode>).inputs) &&
    Array.isArray((node as Partial<TypedAnimationGraphNode>).outputs),
  );
}

function isSingleEffectNode(
  node: StrictAnimationGraphNode,
): node is Extract<TypedAnimationGraphNode, { kind: "effect" }> {
  return isLegacyEffectNode(node) && node.config.effects.length === 1;
}

function isLegacyEffectNode(
  node: StrictAnimationGraphNode,
): node is Extract<TypedAnimationGraphNode, { kind: "effect" }> {
  return (
    node.kind === "effect" &&
    typeof node.config === "object" &&
    node.config !== null &&
    Array.isArray((node.config as { effects?: unknown }).effects)
  );
}

function getAnimationNodeDescriptors(object: FrameObject): Array<{
  id: string;
  label: string;
  kind: GraphNode["kind"];
  details?: Record<string, string>;
}> {
  const sources = getGraphAnimationSources(object);
  const timeKeys = Array.from(new Set(sources.map((source) => source.timeKey)));
  const timeNodes = timeKeys.map((timeKey, index) => {
    const source = sources.find((item) => item.timeKey === timeKey)!;
    return {
      id: `time:${object.id}:${index}`,
      label: "Time",
      kind: "time" as const,
      details: {
        delay: formatSeconds(source.delay),
        duration: formatSeconds(source.duration),
        ease: source.ease,
      },
    };
  });
  return [
    ...timeNodes,
    ...sources.map((source) => ({
      id: source.id,
      label: source.label,
      kind: "effect" as const,
      details: source.details,
    })),
  ];
}

export function getGraphAnimationSources(object: FrameObject) {
  const sources: Array<{
    id: string;
    label: string;
    timeKey: string;
    delay: number;
    duration: number;
    ease: string;
    details: Record<string, string>;
  }> = [];
  for (const animation of object.animations ?? []) {
    if (animation.id.startsWith("graph:")) continue;
    for (const definition of animationDefinitions) {
      const details = definition.getDetails(animation);
      if (!details) continue;
      sources.push(
        createAnimationSource(
          object.id,
          `anim:${animation.id}:${definition.property}`,
          definition.label,
          animation.options.delay ?? 0,
          animation.options.duration,
          String(formatEase(animation.options.ease)),
          details,
        ),
      );
    }
  }
  return sources;
}

function createAnimationSource(
  objectId: string,
  idPart: string,
  label: string,
  delay: number,
  duration: number,
  ease: string,
  details: Record<string, string>,
) {
  const timeKey = `${roundGraphNumber(delay)}:${roundGraphNumber(duration)}`;
  return {
    id: `animation:${objectId}:${idPart}`,
    label,
    timeKey,
    delay,
    duration,
    ease,
    details,
  };
}

function getAutoEdges(objects: FrameObject[]) {
  return objects.map((object) =>
    createEdge(`layer:${object.id}`, "right", composition2dOutNodeId, "left"),
  );
}

function getDelayMarkers(
  objects: FrameObject[],
  nodes: GraphNode[],
  graph: AnimationGraphState | undefined,
): DelayMarker[] {
  const timingContext = buildGraphEquivalentTimingContext(
    graph,
    nodes,
    objects,
  );
  const edges = timingContext.edges;
  const roles = getTemporalNodeRoles(
    timingContext.nodes,
    timingContext.graph,
    objects,
  );
  const connectedNodeIds = getConnectedToOutputNodeIds(
    edges,
    timingContext.nodes,
    composition2dOutNodeId,
  );
  const mainMarkers = nodes.flatMap((node) => {
    if (
      (node.kind !== "time" &&
        node.kind !== "split" &&
        node.kind !== "condition") ||
      roles.get(node.id) !== "active" ||
      !connectedNodeIds.has(node.id)
    )
      return [];
    const timingNode =
      timingContext.nodes.find((candidate) => candidate.id === node.id) ?? node;
    const delay =
      node.kind === "time"
        ? getTimeNodeStart(
            timingNode,
            timingContext.graph,
            edges,
            timingContext.nodes,
            objects,
            new Set(),
          )
        : getModifierNodeStart(
            timingNode,
            timingContext.graph,
            edges,
            timingContext.nodes,
            objects,
          );
    return [
      {
        nodeId: node.id,
        parameterNodeId:
          node.kind === "time"
            ? node.id
            : (getModifierSourceTimeNodeId(node.id, edges, nodes) ?? node.id),
        key: node.id,
        delay: Math.max(0, delay),
        localDelay: parseSeconds(
          timingContext.graph?.parameters?.[node.id]?.delay ??
            node.details?.delay ??
            "0s",
        ),
        label: node.label,
        draggable: node.kind === "time",
      },
      ...getConditionDelayMarkers(
        node,
        timingContext.graph,
        edges,
        timingContext.nodes,
        objects,
      ),
    ];
  });
  const groupMarkers = nodes.flatMap((node) => {
    if (node.kind !== "group") return [];
    const groupId = node.details?.groupId;
    const group = groupId ? graph?.groups?.[groupId] : undefined;
    if (!group) return [];
    return getDelayMarkersForGroup(node, group, graph, objects, edges, nodes);
  });
  return [...mainMarkers, ...groupMarkers];
}

function getDelayMarkersForGroup(
  groupNode: GraphNode,
  group: AnimationGraphGroup,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
  parentEdges: AnimationGraphEdge[],
  parentNodes: GraphNode[],
) {
  const context = buildGroupEquivalentGraphContext(
    groupNode.id,
    group,
    graph,
    objects,
    parentEdges,
    parentNodes,
  );
  const { edges, nodes } = context;
  const connectedNodeIds = getConnectedToGroupOutNodeIds(
    edges,
    nodes,
    group.outNodeId,
  );
  const parentConnectedNodeIds = getConnectedToOutputNodeIds(
    parentEdges,
    parentNodes,
    composition2dOutNodeId,
  );
  const groupGraph = {
    ...graph,
    nodes: group.nodes,
    edges,
    customNodes: context.customNodes,
    parameters: { ...(graph?.parameters ?? {}), ...(group.parameters ?? {}) },
  } satisfies AnimationGraphState;
  return nodes.flatMap((node) => {
    if (group.customNodes?.[node.id]?.kind !== "time") return [];
    const connectedToOutput = connectedNodeIds.has(node.id);
    const connectedToParentOutput = parentConnectedNodeIds.has(groupNode.id);
    if (!connectedToOutput || !connectedToParentOutput) return [];
    return [
      {
        nodeId: groupNode.id,
        parameterNodeId: node.id,
        key: `${groupNode.id}:${node.id}`,
        delay: Math.max(
          0,
          getTimeNodeStart(node, groupGraph, edges, nodes, objects, new Set()),
        ),
        localDelay: parseSeconds(
          group.parameters?.[node.id]?.delay ?? node.details?.delay ?? "0s",
        ),
        label: `${groupNode.label} / ${node.label}`,
        groupId: group.id,
        draggable: true,
      },
    ];
  });
}

function getConditionDelayMarkers(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  objects: FrameObject[],
): DelayMarker[] {
  if (node.kind !== "condition") return [];
  const sourceSplitId = edges.find(
    (edge) =>
      edge.toNodeId === node.id &&
      nodes.find((candidate) => candidate.id === edge.fromNodeId)?.kind ===
        "split",
  )?.fromNodeId;
  const splitNode = sourceSplitId
    ? nodes.find((candidate) => candidate.id === sourceSplitId)
    : undefined;
  if (!splitNode) return [];
  const params = graph?.parameters?.[node.id] ?? {};
  const details = node.details ?? {};
  const splitParams = graph?.parameters?.[splitNode.id] ?? {};
  const mode = splitParams.mode ?? splitNode.details?.mode ?? "word";
  const count = Math.min(
    4,
    Math.max(
      1,
      Number.parseInt(
        params.conditionCount ?? details.conditionCount ?? "1",
        10,
      ) || 1,
    ),
  );
  return Array.from({ length: count }).flatMap((_, ruleIndex) => {
    const suffix = ruleIndex === 0 ? "" : String(ruleIndex + 1);
    if (
      (params[`matchType${suffix}`] ?? details[`matchType${suffix}`]) !==
        "textEquals" ||
      (params[`action${suffix}`] ?? details[`action${suffix}`]) !== "setDelay"
    )
      return [];
    const value = params[`value${suffix}`] ?? details[`value${suffix}`] ?? "";
    const delay = Math.max(
      0,
      parseSeconds(
        params[`delay${suffix}`] ?? details[`delay${suffix}`] ?? "0s",
      ),
    );
    return objects.flatMap((object) =>
      getGraphTextTokens(object, mode).flatMap((token, index) =>
        token === value
          ? [
              {
                nodeId: node.id,
                parameterNodeId: node.id,
                key: `${node.id}:rule:${ruleIndex}:token:${object.id}:${index}`,
                delay,
                localDelay: delay,
                label: `${node.label} / ${token}`,
                draggable: false,
              },
            ]
          : [],
      ),
    );
  });
}

export function getRenderableEdges(
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const mode = getGraphCompositionMode(nodes);
  const automatic = graph ? [] : getAutoEdges(objects);
  const persisted = filterPermittedEdges(
    filterStaleAutoEdges(
      filterRenderableEdges(graph?.edges ?? [], nodes),
      nodes,
    ),
    nodes,
    mode,
  );
  const renderable = filterPermittedEdges(
    Array.from(
      new Map(
        [...automatic, ...persisted].map((edge) => [edge.id, edge]),
      ).values(),
    ),
    nodes,
    mode,
  );
  return mode === "composition2d"
    ? renderable
    : normalizeRenderableConditionEdgeSockets(renderable, nodes);
}

function normalizeRenderableConditionEdgeSockets(
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  return edges.map((edge) => {
    const from = nodes.find((node) => node.id === edge.fromNodeId);
    if (from?.kind !== "condition" || edge.fromSocket) return edge;
    const routeId = makeLegacyConditionRouteId(edge.id);
    return {
      ...edge,
      fromSocket: `output:${routeId}`,
      id: `${edge.id}:output:${routeId}`,
    };
  });
}

function makeLegacyConditionRouteId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash.toString(36).padStart(2, "0").slice(-2);
}

function hasGroupValidOutput(group: AnimationGraphGroup | undefined) {
  if (!group) return false;
  const outNodeId = group.outNodeId;
  const reverse = new Map<string, string[]>();
  for (const edge of group.edges ?? [])
    reverse.set(edge.toNodeId, [
      ...(reverse.get(edge.toNodeId) ?? []),
      edge.fromNodeId,
    ]);
  const stack = [outNodeId];
  const visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (group.inNodeId && id === group.inNodeId) return true;
    for (const upstream of reverse.get(id) ?? []) {
      if (
        group.customNodes?.[upstream]?.kind === "time" ||
        group.customNodes?.[upstream]?.kind === "split" ||
        group.customNodes?.[upstream]?.kind === "condition"
      )
        return true;
      stack.push(upstream);
    }
  }
  return false;
}

function getConnectedToOutputNodeIds(
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  outNodeId: string,
) {
  return getConnectedToGroupOutNodeIds(edges, nodes, outNodeId);
}

function getConnectedToGroupOutNodeIds(
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  outNodeId: string,
) {
  const reverseEdges = new Map<string, string[]>();
  for (const edge of edges)
    reverseEdges.set(edge.toNodeId, [
      ...(reverseEdges.get(edge.toNodeId) ?? []),
      edge.fromNodeId,
    ]);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const connected = new Set<string>();
  const stack = [outNodeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (connected.has(current) || !nodeIds.has(current)) continue;
    connected.add(current);
    for (const upstream of reverseEdges.get(current) ?? [])
      stack.push(upstream);
  }
  return connected;
}

function isPermittedGraphEdge(
  edge: EditorGraphEdge,
  nodes: GraphNode[],
  existingEdges: EditorGraphEdge[] = [],
  mode: GraphCompositionMode = getGraphCompositionMode(nodes),
) {
  const fromNodeId = getEditorEdgeFromNodeId(edge);
  const toNodeId = getEditorEdgeToNodeId(edge);
  const from = nodes.find((node) => node.id === fromNodeId);
  const to = nodes.find((node) => node.id === toNodeId);
  if (!from || !to) return false;
  if (mode !== "composition2d") return false;
  if (!isStrictGraphEdge(edge)) return false;
  const strictPermitted = isPermittedStrictComposition2dGraphEdge(
    edge,
    from,
    to,
    existingEdges.filter(isStrictGraphEdge),
  );
  if (!strictPermitted) return false;
  if (
    hasDuplicateEffectMixInput(
      from,
      to,
      existingEdges.filter(isStrictGraphEdge),
      nodes,
    )
  )
    return false;
  return true;
}

function isStrictGraphEdge(
  edge: EditorGraphEdge,
): edge is StrictAnimationGraphEdge {
  return "from" in edge && "to" in edge;
}

function isPermittedStrictComposition2dGraphEdge(
  edge: StrictAnimationGraphEdge,
  from: GraphNode,
  to: GraphNode,
  existingEdges: StrictAnimationGraphEdge[],
) {
  if (
    pathExists(
      getEditorEdgeToNodeId(edge),
      getEditorEdgeFromNodeId(edge),
      existingEdges,
    )
  )
    return false;
  if (from.kind === "condition" && !getStrictEdgeFromPortId(edge)) return false;
  const error = getStrictComposition2dConnectionError(
    from,
    to,
    getStrictEdgeFromPortId(edge),
    getStrictEdgeToPortId(edge),
    existingEdges,
  );
  return !error;
}

function hasDuplicateEffectMixInput(
  from: GraphNode,
  to: GraphNode,
  existingEdges: EditorGraphEdge[],
  nodes: GraphNode[],
) {
  if (!isCssEffectNode(from) || !isEffectMixNode(to)) return false;
  const incomingProperties = getUpstreamCssEffectProperties(
    to.id,
    existingEdges,
    nodes,
  );
  return getCssEffectProperties(from).some((property) =>
    incomingProperties.has(property),
  );
}

function getUpstreamCssEffectProperties(
  nodeId: string,
  edges: EditorGraphEdge[],
  nodes: GraphNode[],
) {
  const properties = new Set<string>();
  const visited = new Set<string>();
  const stack = edges
    .filter((edge) => getEditorEdgeToNodeId(edge) === nodeId)
    .map((edge) => getEditorEdgeFromNodeId(edge));
  while (stack.length) {
    const currentId = stack.pop()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const node = nodes.find((candidate) => candidate.id === currentId);
    if (!node || !isCssEffectNode(node)) continue;
    for (const property of getCssEffectProperties(node))
      properties.add(property);
    for (const edge of edges.filter(
      (candidate) => getEditorEdgeToNodeId(candidate) === currentId,
    ))
      stack.push(getEditorEdgeFromNodeId(edge));
  }
  return properties;
}

function isEffectMixNode(node: GraphNode) {
  return Boolean(
    node.typedNode &&
    isLegacyEffectNode(node.typedNode) &&
    node.typedNode.config.effects.length === 0,
  );
}

function isCssEffectNode(node: GraphNode) {
  return Boolean(node.typedNode && isLegacyEffectNode(node.typedNode));
}

function getCssEffectProperties(node: GraphNode) {
  return node.typedNode && isLegacyEffectNode(node.typedNode)
    ? node.typedNode.config.effects.map((effect) => effect.property)
    : [];
}

function getGraphEffectKind(node: GraphNode) {
  if (node.kind !== "effect") return null;
  const kind = node.details?.property ?? node.label.trim().toLowerCase();
  return kind || null;
}

function getGraphCompositionMode(_nodes: GraphNode[]): GraphCompositionMode {
  return "composition2d";
}

function getGraphNodeOutputSocketType(
  node: GraphNode,
  mode: GraphCompositionMode = "composition2d",
): SocketType {
  if (node.typedNode && isLegacyTypedAnimationGraphNode(node.typedNode))
    return mapTypedValueToSocketType(node.typedNode.outputs[0]?.type);
  const strictOutput =
    getStrictComposition2dPorts(node)
      .filter((port) => port.direction === "output")
      .find((port) => port.role === "main") ??
    getStrictComposition2dPorts(node).find(
      (port) => port.direction === "output",
    );
  if (strictOutput?.type.kind === "animation") return "renderable";
  if (strictOutput?.type.kind === "value") return "scalar";
  return getComposition2dSocketDefinition(node.kind)?.output ?? "any";
}

function mapTypedValueToSocketType(
  valueType: AnimationGraphValueType | undefined,
): SocketType {
  if (valueType?.startsWith("Structure.") || valueType === "Effect.CSSEffect")
    return "renderable";
  if (valueType === "AnimationController") return "time";
  if (valueType?.startsWith("Value.")) return "scalar";
  return "any";
}

function getGraphNodeSocketColor(
  node: GraphNode,
  mode: GraphCompositionMode = "composition2d",
) {
  return graphSocketColors[getGraphNodeOutputSocketType(node, mode)];
}

function getGraphNodeRenderColors(
  node: GraphNode,
  mode: GraphCompositionMode = "composition2d",
  temporalRole?: TemporalNodeRole,
) {
  const base = getGraphNodeColors(node.kind);
  if (
    (node.kind === "time" ||
      node.kind === "split" ||
      node.kind === "oscillate") &&
    temporalRole === "modified"
  )
    return {
      background: nodeColors.modifierBg,
      border: nodeColors.modifierBorder,
    };
  return base;
}

function blendHexColors(baseHex: string, accentHex: string, amount: number) {
  const base = hexToRgb(baseHex);
  const accent = hexToRgb(accentHex);
  return `rgb(${Math.round(base.red + (accent.red - base.red) * amount)}, ${Math.round(base.green + (accent.green - base.green) * amount)}, ${Math.round(base.blue + (accent.blue - base.blue) * amount)})`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function filterPermittedEdges(
  edges: RenderableGraphEdge[],
  nodes: GraphNode[],
  mode: GraphCompositionMode = getGraphCompositionMode(nodes),
) {
  const accepted: RenderableGraphEdge[] = [];
  for (const edge of edges) {
    if (isPermittedGraphEdge(edge, nodes, accepted, mode)) accepted.push(edge);
  }
  return accepted;
}

function pathExists(
  fromNodeId: string,
  toNodeId: string,
  edges: Array<AnimationGraphEdge | StrictAnimationGraphEdge>,
) {
  const visited = new Set<string>();
  const stack = [fromNodeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === toNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges)
      if (getEditorEdgeFromNodeId(edge) === current)
        stack.push(getEditorEdgeToNodeId(edge));
  }
  return false;
}

function filterStaleAutoEdges(edges: AnimationGraphEdge[], nodes: GraphNode[]) {
  return edges.filter((edge) => {
    const fromNode = nodes.find(
      (node) => node.id === getEditorEdgeFromNodeId(edge),
    );
    const toNode = nodes.find(
      (node) => node.id === getEditorEdgeToNodeId(edge),
    );
    return Boolean(fromNode && toNode);
  });
}

function filterRenderableEdges(
  edges: Array<AnimationGraphEdge | StrictAnimationGraphEdge>,
  nodes: GraphNode[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.filter(
    (edge) =>
      nodeIds.has(getEditorEdgeFromNodeId(edge)) &&
      nodeIds.has(getEditorEdgeToNodeId(edge)),
  ) as AnimationGraphEdge[];
}

function isCustomGraphNode(
  nodeId: string,
  graph: AnimationGraphState | undefined,
) {
  return nodeId.startsWith("custom:") || Boolean(graph?.customNodes?.[nodeId]);
}

function isDeletableGraphNode(
  nodeId: string,
  graph: AnimationGraphState | undefined,
  strictGraph: StrictAnimationGraph | undefined,
) {
  if (isCustomGraphNode(nodeId, graph)) return true;
  const strictNode = strictGraph?.nodes?.[nodeId];
  if (!strictNode) return false;
  return strictNode.kind !== "source" && strictNode.kind !== "out";
}

function createEdge(
  fromNodeId: string,
  fromPort: AnimationGraphPort,
  toNodeId: string,
  toPort: AnimationGraphPort,
  registration?: Pick<AnimationGraphEdge, "fromSocket" | "toSocket">,
): AnimationGraphEdge {
  const socketId =
    registration?.fromSocket || registration?.toSocket
      ? `:${registration.fromSocket ?? "any"}->${registration.toSocket ?? "any"}`
      : "";
  return {
    id: `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}${socketId}`,
    fromNodeId,
    fromPort,
    toNodeId,
    toPort,
    ...registration,
  };
}

function getStrictEdgeFromPortId(
  edge: AnimationGraphEdge | StrictAnimationGraphEdge,
) {
  return (edge as Partial<StrictAnimationGraphEdge>).from?.portId;
}

function getStrictEdgeToPortId(
  edge: AnimationGraphEdge | StrictAnimationGraphEdge,
) {
  return (edge as Partial<StrictAnimationGraphEdge>).to?.portId;
}

export function updateStrictConditionNodeParameter(
  graph: AnimationGraphState,
  nodeId: string,
  key: string,
  value: string,
): AnimationGraphState {
  const current = graph.nodes[nodeId];
  if (!current || typeof current !== "object" || !("kind" in current))
    return graph;
  const node = current as TypedAnimationGraphNode;
  if (node.kind !== "condition") return graph;
  const config = normalizeStrictConditionEditorConfig(node.config);
  const values = strictConditionConfigToEditorValues(config);
  let nextValues = { ...values, [key]: value };
  if (key === "conditionCount")
    nextValues = resizeConditionEditorValues(nextValues, value);
  if (key === "__deleteCondition")
    nextValues = deleteConditionEditorRule(
      nextValues,
      Number.parseInt(value, 10),
    );
  const nextConfig = editorValuesToStrictConditionConfig(
    nextValues,
    config.outputs,
  );
  return {
    ...graph,
    nodes: {
      ...graph.nodes,
      [nodeId]: createTypedAnimationGraphNode(
        nodeId,
        "condition",
        node.position,
        nextConfig,
        node.label,
      ) as AnimationGraphState["nodes"][string],
    },
    parameters: graph.parameters,
  };
}

function normalizeStrictConditionEditorConfig(config: unknown) {
  const raw =
    typeof config === "object" && config !== null
      ? (config as { outputs?: unknown; rules?: unknown })
      : {};
  const outputs = Array.isArray(raw.outputs)
    ? raw.outputs.flatMap((output) =>
        output && typeof output === "object" && "id" in output
          ? [
              {
                id: String((output as { id: unknown }).id),
                label: String(
                  (output as { label?: unknown }).label ??
                    String((output as { id: unknown }).id).replace(
                      /^output:/,
                      "Output ",
                    ),
                ),
              },
            ]
          : [],
      )
    : [];
  const rules = Array.isArray(raw.rules) ? raw.rules : [];
  return { outputs, rules };
}

function strictConditionConfigToEditorValues(
  config: ReturnType<typeof normalizeStrictConditionEditorConfig>,
) {
  const values: Record<string, string> = {
    conditionCount: String(Math.max(1, config.rules.length || 1)),
  };
  config.rules.forEach((rule, index) => {
    if (!rule || typeof rule !== "object") return;
    const suffix = index === 0 ? "" : String(index + 1);
    const raw = rule as Record<string, unknown>;
    values[`matchType${suffix}`] = "textEquals";
    values[`value${suffix}`] = String(raw.value ?? "");
    values[`action${suffix}`] = String(raw.action ?? "setDelay");
    values[`delay${suffix}`] = formatSeconds(Number(raw.delay ?? 0));
    values[`outputPort${suffix}`] = String(
      raw.output ?? config.outputs[index]?.id ?? `output:${index + 1}`,
    );
  });
  return values;
}

function editorValuesToStrictConditionConfig(
  values: Record<string, string>,
  previousOutputs: readonly { id: string; label: string }[],
) {
  const count = Math.min(
    4,
    Math.max(1, Number.parseInt(values.conditionCount ?? "1", 10) || 1),
  );
  const outputIds = new Set<string>();
  const rules = Array.from({ length: count }, (_, index) => {
    const suffix = index === 0 ? "" : String(index + 1);
    const action = values[`action${suffix}`] ?? "setDelay";
    const output = values[`outputPort${suffix}`] || `output:${index + 1}`;
    if (action !== "setDelay") outputIds.add(output);
    return {
      target: "value" as const,
      operator: "equals" as const,
      value: values[`value${suffix}`] ?? "",
      action: action as "setDelay" | "sendToOutput" | "duplicateToOutput",
      output,
      delay: parseSeconds(values[`delay${suffix}`] ?? "0s"),
    };
  });
  return {
    outputs: Array.from(outputIds).map((id) => ({
      id,
      label: id.replace(/^output:/, "Output "),
    })),
    rules,
  };
}

function resizeConditionEditorValues(
  values: Record<string, string>,
  count: string,
) {
  return { ...values, conditionCount: count };
}

function deleteConditionEditorRule(
  values: Record<string, string>,
  index: number,
) {
  const count = Math.min(
    4,
    Math.max(1, Number.parseInt(values.conditionCount ?? "1", 10) || 1),
  );
  if (index <= 1 || index > count) return values;
  const next: Record<string, string> = {
    ...values,
    conditionCount: String(count - 1),
  };
  for (let current = index; current < count; current += 1) {
    const from = current === 1 ? "" : String(current + 1);
    const to = current === 1 ? "" : String(current);
    for (const key of ["matchType", "value", "action", "outputPort", "delay"])
      next[`${key}${to}`] = values[`${key}${from}`] ?? "";
  }
  const last = count === 1 ? "" : String(count);
  for (const key of ["matchType", "value", "action", "outputPort", "delay"])
    delete next[`${key}${last}`];
  return next;
}

function getNodeGridWidth(label: string) {
  return Math.min(
    maxNodeWidth,
    Math.max(minNodeWidth, Math.ceil((label.length * 5.8 + 18) / gridSize)),
  );
}
function formatPropertyLabel(property: string) {
  return property
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
function materializeGraphNodes(
  nodes: GraphNode[],
  existing?: AnimationGraphState["nodes"],
) {
  return Object.fromEntries(
    nodes.map((node) => {
      const position = roundGraphNodePosition(node);
      const current = existing?.[node.id];
      if (
        current &&
        typeof current === "object" &&
        "kind" in current &&
        "config" in current
      )
        return [
          node.id,
          {
            ...(current as TypedAnimationGraphNode),
            position,
            x: position.x,
            y: position.y,
          },
        ];
      if (node.typedNode)
        return [
          node.id,
          {
            ...node.typedNode,
            position,
            x: position.x,
            y: position.y,
          },
        ];
      return [node.id, position];
    }),
  );
}

function applyGraphNodePositions(
  nodes: AnimationGraphState["nodes"],
  positions: Record<string, { x: number; y: number }> | null,
) {
  if (!positions) return nodes;
  const next = { ...(nodes ?? {}) };
  for (const [nodeId, position] of Object.entries(positions)) {
    const rounded = roundGraphNodePosition(position);
    const node = next[nodeId];
    if (
      node &&
      typeof node === "object" &&
      "kind" in node &&
      "config" in node
    ) {
      next[nodeId] = {
        ...(node as TypedAnimationGraphNode),
        position: rounded,
        x: rounded.x,
        y: rounded.y,
      } as unknown as AnimationGraphState["nodes"][string];
    } else {
      next[nodeId] = rounded;
    }
  }
  return next;
}

function roundGraphNodePositions(
  nodes: AnimationGraphState["nodes"] | undefined,
) {
  return Object.fromEntries(
    Object.entries(nodes ?? {}).map(([id, position]) => [
      id,
      roundGraphNodePosition(position),
    ]),
  );
}

function roundGraphNodePosition(position: { x: number; y: number }) {
  const safePosition = sanitizeGraphPoint(position);
  return { x: roundTwo(safePosition.x), y: roundTwo(safePosition.y) };
}

function sanitizeGraphPoint(position: { x?: number; y?: number } | undefined) {
  const x = position?.x;
  const y = position?.y;
  return {
    x: typeof x === "number" && Number.isFinite(x) ? x : 0,
    y: typeof y === "number" && Number.isFinite(y) ? y : 0,
  };
}

function hasFiniteGraphPoint(
  position: { x?: number; y?: number } | undefined,
): position is { x: number; y: number } {
  return (
    typeof position?.x === "number" &&
    Number.isFinite(position.x) &&
    typeof position.y === "number" &&
    Number.isFinite(position.y)
  );
}

function materializeGraphNodeDefinitions(
  nodes: GraphNode[],
  existing: AnimationGraphState["customNodes"] | undefined,
  graphViewportKey: string,
) {
  const next = { ...(existing ?? {}) };
  for (const node of nodes) {
    if (node.typedNode) continue;
    if (node.kind === "layer" || node.kind === "out") continue;
    const customNode = toAnimationGraphCustomNode(node, graphViewportKey);
    if (!customNode) continue;
    if (node.kind === "group" && node.details?.registered) {
      const { registered: _registered, ...details } = node.details;
      next[node.id] = {
        ...(next[node.id] ?? {}),
        ...customNode,
        scopeKey: graphViewportKey,
        details,
      };
      continue;
    }
    next[node.id] = {
      ...(next[node.id] ?? {}),
      ...customNode,
    };
  }
  return Object.keys(next).length ? next : undefined;
}

function nodeRect(node: GraphNode) {
  const x = Number.isFinite(node.x) ? node.x : 0;
  const y = Number.isFinite(node.y) ? node.y : 0;
  const width = Number.isFinite(node.width) ? node.width : minNodeWidth;
  const height = Number.isFinite(node.height) ? node.height : nodeHeight;
  return {
    x: x * gridSize,
    y: y * gridSize,
    width: width * gridSize,
    height: height * gridSize,
  };
}
function canvasPoint(
  event: PointerEvent<HTMLCanvasElement> | MouseEvent<HTMLCanvasElement>,
  viewport: HTMLDivElement | null,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + (viewport?.scrollLeft ?? 0),
    y: event.clientY - rect.top + (viewport?.scrollTop ?? 0),
  };
}
function hitNode(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
) {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  return (
    nodes.find((node) => {
      const rect = nodeRect(node);
      return (
        graphPoint.x >= rect.x &&
        graphPoint.x <= rect.x + rect.width &&
        graphPoint.y >= rect.y &&
        graphPoint.y <= rect.y + rect.height
      );
    }) ?? null
  );
}
function hitNodeLoose(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
) {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  return (
    nodes.find((node) => {
      const rect = nodeRect(node);
      const pad = connectorHoverRadius;
      return (
        graphPoint.x >= rect.x - pad &&
        graphPoint.x <= rect.x + rect.width + pad &&
        graphPoint.y >= rect.y - pad &&
        graphPoint.y <= rect.y + rect.height + pad
      );
    }) ?? null
  );
}

function normalizeMarqueeRect(drag: Extract<DragState, { kind: "marquee" }>) {
  return normalizeRect(
    { x: drag.startX / drag.scale, y: drag.startY / drag.scale },
    { x: drag.x / drag.scale, y: drag.y / drag.scale },
  );
}

function getMarqueeSelectionPreviewIds(
  drag: Extract<DragState, { kind: "marquee" }>,
  nodes: GraphNode[],
  selectedNodeIds: string[],
) {
  const rect = normalizeMarqueeRect(drag);
  const hitIds = nodes
    .filter((node) => isMarqueeSelectableNode(node))
    .filter((node) => rectIntersects(rect, nodeRect(node)))
    .map((node) => node.id);
  if (!drag.shiftKey) return hitIds;
  const next = new Set(selectedNodeIds);
  for (const id of hitIds) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return Array.from(next);
}

function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function rectIntersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function isMarqueeSelectableNode(node: GraphNode) {
  return true;
}
function hitPort(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
) {
  return hitHoverConnector(point, nodes, scale, null);
}
export function getGraphPointerDownConnector(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
  preferred: HoverConnector | null = null,
  edges: readonly AnimationGraphEdge[] = [],
): HoverConnector | null {
  if (hitNode(point, nodes, scale)) return null;
  if (hitEdge(point, edges as RenderableGraphEdge[], nodes, scale)) return null;
  return (
    getActiveHoverConnector(point, nodes, scale, preferred, edges) ??
    hitHoverConnector(point, nodes, scale, preferred, edges)
  );
}
function hitHoverConnector(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
  preferred: HoverConnector | null,
  edges: readonly AnimationGraphEdge[] = [],
): HoverConnector | null {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  const activePreferred = getActiveHoverConnector(
    point,
    nodes,
    scale,
    preferred,
    edges,
  );
  if (
    activePreferred &&
    Math.hypot(
      graphPoint.x - activePreferred.point.x,
      graphPoint.y - activePreferred.point.y,
    ) <= connectorHitRadius
  )
    return activePreferred;
  for (const node of nodes) {
    if (!hitNodeLoose(point, [node], scale)) continue;
    const connector = getNodeHoverConnector(point, node, scale, edges);
    if (!connector) continue;
    if (
      Math.hypot(
        graphPoint.x - connector.point.x,
        graphPoint.y - connector.point.y,
      ) <= connectorHitRadius
    )
      return connector;
  }
  return null;
}
function getActiveHoverConnector(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
  preferred: HoverConnector | null,
  edges: readonly AnimationGraphEdge[] = [],
): HoverConnector | null {
  if (!preferred) return null;
  const node = nodes.find((item) => item.id === preferred.nodeId);
  if (!node) return null;
  return getNodeHoverConnector(point, node, scale, edges);
}
function hitEdge(
  point: { x: number; y: number },
  edges: RenderableGraphEdge[],
  nodes: GraphNode[],
  scale = 1,
) {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  const mode = getGraphCompositionMode(nodes);
  for (const edge of edges) {
    const from = nodes.find(
      (node) => node.id === getEditorEdgeFromNodeId(edge),
    );
    const to = nodes.find((node) => node.id === getEditorEdgeToNodeId(edge));
    if (!from || !to) continue;
    const start = getEdgeEndpointPoint(from, edge, "from", edges, mode);
    const end = getEdgeEndpointPoint(to, edge, "to", edges, mode);
    const control = getEdgeControlPoint(start, end);
    if (
      Math.hypot(graphPoint.x - control.x, graphPoint.y - control.y) <=
      edgeControlHitRadius
    )
      return edge;
  }
  return null;
}
function getEdgeDropTarget(
  point: { x: number; y: number },
  fromNodeId: string,
  nodes: GraphNode[],
  scale: number,
  graph: AnimationGraphState | StrictAnimationGraph | undefined,
  objects: FrameObject[],
  mode: GraphCompositionMode = getGraphCompositionMode(nodes),
) {
  const portTarget = hitPort(point, nodes, scale);
  const nodeTarget = portTarget
    ? (nodes.find((node) => node.id === portTarget.nodeId) ?? null)
    : hitNode(point, nodes, scale);
  if (!nodeTarget || nodeTarget.id === fromNodeId) return null;
  const fromNode = nodes.find((node) => node.id === fromNodeId);
  if (!fromNode) return null;
  if (mode === "composition2d") {
    const edge = createStrictComposition2dEdgeFromDrag(
      {
        portId: undefined,
      },
      fromNode,
      nodeTarget,
      portTarget?.portId,
      getRenderableEdges(graph, nodes, objects),
    );
    const existingEdges = getRenderableEdges(graph, nodes, objects);
    return isPermittedGraphEdge(edge, nodes, existingEdges, mode)
      ? {
          nodeId: nodeTarget.id,
          fromPort: "right" as const,
          toPort: "left" as const,
        }
      : null;
  }
  const ports = getBestEdgePorts(fromNode, nodeTarget);
  const edge = createEdge(
    fromNodeId,
    ports.fromPort,
    nodeTarget.id,
    ports.toPort,
  );
  const existingEdges = getRenderableEdges(graph, nodes, objects);
  return isPermittedGraphEdge(edge, nodes, existingEdges, mode)
    ? { nodeId: nodeTarget.id, fromPort: ports.fromPort, toPort: ports.toPort }
    : null;
}
function portPoint(node: GraphNode, port: AnimationGraphPort) {
  const rect = nodeRect(node);
  if (port === "top")
    return { x: rect.x + rect.width / 2, y: rect.y - portGap };
  if (port === "right")
    return { x: rect.x + rect.width + portGap, y: rect.y + rect.height / 2 };
  if (port === "bottom")
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height + portGap };
  return { x: rect.x - portGap, y: rect.y + rect.height / 2 };
}
function nodeCenter(node: GraphNode) {
  const rect = nodeRect(node);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
function getNodeHoverConnector(
  point: { x: number; y: number },
  node: GraphNode,
  scale = 1,
  edges: readonly AnimationGraphEdge[] = [],
): HoverConnector | null {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  const rect = nodeRect(node);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const closestX = Math.min(Math.max(graphPoint.x, rect.x), right);
  const closestY = Math.min(Math.max(graphPoint.y, rect.y), bottom);
  if (
    Math.hypot(graphPoint.x - closestX, graphPoint.y - closestY) >
    connectorHoverRadius
  )
    return null;
  const withinX = graphPoint.x >= rect.x && graphPoint.x <= right;
  const withinY = graphPoint.y >= rect.y && graphPoint.y <= bottom;
  const strictPorts = getStrictComposition2dPorts(node, edges);
  if (strictPorts.length) {
    const closest = strictPorts
      .map((port) => ({
        port,
        squarePoint: strictPortPoint(node, port, edges),
        connectorPoint: strictPortConnectorPoint(node, port, edges),
      }))
      .sort(
        (a, b) =>
          Math.hypot(
            graphPoint.x - a.squarePoint.x,
            graphPoint.y - a.squarePoint.y,
          ) -
          Math.hypot(
            graphPoint.x - b.squarePoint.x,
            graphPoint.y - b.squarePoint.y,
          ),
      )[0];
    if (
      closest &&
      Math.min(
        Math.hypot(
          graphPoint.x - closest.squarePoint.x,
          graphPoint.y - closest.squarePoint.y,
        ),
        Math.hypot(
          graphPoint.x - closest.connectorPoint.x,
          graphPoint.y - closest.connectorPoint.y,
        ),
      ) <= connectorHitRadius
    )
      return {
        nodeId: node.id,
        port: closest.port.direction === "output" ? "right" : "left",
        point: closest.connectorPoint,
        fromSocket: closest.port.id,
        portId: closest.port.id,
        dynamicFromSocket:
          node.kind === "condition" && closest.port.id === "new-output",
      };
  }
  if (
    graphPoint.x > rect.x &&
    graphPoint.x < right &&
    graphPoint.y > rect.y &&
    graphPoint.y < bottom
  )
    return null;
  if (
    hasGraphNodeDynamicOutputSockets(node) &&
    graphPoint.x > right &&
    withinY
  ) {
    return {
      nodeId: node.id,
      port: "right",
      point: { x: right + portGap, y: graphPoint.y },
      fromSocket: "new-output",
      dynamicFromSocket: true,
    };
  }
  if (withinX) {
    const port = graphPoint.y < rect.y ? "top" : "bottom";
    return {
      nodeId: node.id,
      port,
      point: {
        x: graphPoint.x,
        y: port === "top" ? rect.y - portGap : bottom + portGap,
      },
    };
  }
  if (withinY) {
    const port = graphPoint.x < rect.x ? "left" : "right";
    return {
      nodeId: node.id,
      port,
      point: {
        x: port === "left" ? rect.x - portGap : right + portGap,
        y: graphPoint.y,
      },
    };
  }
  const corner = {
    x: graphPoint.x < rect.x ? rect.x : right,
    y: graphPoint.y < rect.y ? rect.y : bottom,
  };
  const dx = graphPoint.x - corner.x;
  const dy = graphPoint.y - corner.y;
  const length = Math.max(Math.hypot(dx, dy), 0.001);
  const port =
    Math.abs(dx) > Math.abs(dy)
      ? dx < 0
        ? "left"
        : "right"
      : dy < 0
        ? "top"
        : "bottom";
  return {
    nodeId: node.id,
    port,
    point: {
      x: corner.x + (dx / length) * portGap,
      y: corner.y + (dy / length) * portGap,
    },
  };
}
function drawMessage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  message: string,
) {
  ctx.fillStyle = "#8b93a3";
  ctx.font = "700 14px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function drawGraphCanvas({
  canvas,
  viewport,
  width,
  height,
  scale,
  scrollLeft,
  scrollTop,
  nodes,
  edges,
  hoverNodeId,
  selectedNodeIds,
  hoverConnector,
  hoverEdgeId,
  edgeDrag,
  previewPoint,
  temporalRoles,
  progressForNode,
  marqueeRect,
  diagnostics,
}: {
  canvas: HTMLCanvasElement;
  viewport?: HTMLDivElement | null;
  width: number;
  height: number;
  scale: number;
  scrollLeft?: number;
  scrollTop?: number;
  nodes: GraphNode[];
  edges: AnimationGraphEdge[];
  hoverNodeId: string | null;
  selectedNodeIds: string[];
  hoverConnector: HoverConnector | null;
  hoverEdgeId?: string | null;
  edgeDrag?: Extract<DragState, { kind: "edge" }> | null;
  previewPoint?: { x: number; y: number } | null;
  temporalRoles?: Map<string, TemporalNodeRole>;
  progressForNode?: (node: GraphNode) => number | null;
  marqueeRect?: { x: number; y: number; width: number; height: number } | null;
  diagnostics?: StrictComposition2dCanvasDiagnostics;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const backingWidth = Math.round(width * ratio);
  const backingHeight = Math.round(height * ratio);
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b0f16";
  ctx.fillRect(0, 0, width, height);
  ctx.translate(
    -(scrollLeft ?? viewport?.scrollLeft ?? 0),
    -(scrollTop ?? viewport?.scrollTop ?? 0),
  );
  ctx.scale(scale, scale);
  const mode = getGraphCompositionMode(nodes);
  for (const edge of edges)
    drawEdge(
      ctx,
      edge,
      nodes,
      edges,
      hoverEdgeId === edge.id,
      mode,
      diagnostics?.edges.get(edge.id),
    );
  if (edgeDrag && previewPoint)
    drawPreviewEdge(ctx, edgeDrag, previewPoint, nodes, mode);
  for (const node of nodes)
    drawNode(
      ctx,
      node,
      hoverNodeId === node.id,
      selectedNodeIds.includes(node.id),
      hoverConnector,
      progressForNode?.(node) ?? null,
      temporalRoles?.get(node.id),
      mode,
      edges,
    );
  if (marqueeRect) drawMarquee(ctx, marqueeRect);
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  hovered: boolean,
  selected: boolean,
  connector: HoverConnector | null,
  progress: number | null = null,
  temporalRole: TemporalNodeRole | undefined,
  mode: GraphCompositionMode = "composition2d",
  edges: readonly AnimationGraphEdge[] = [],
) {
  const rect = nodeRect(node);
  const { background: bg, border } = getGraphNodeRenderColors(
    node,
    mode,
    temporalRole,
  );
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.globalAlpha = 1;
  ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.5;
  if (hovered || selected) {
    ctx.shadowColor = border;
    ctx.shadowBlur = selected ? 18 : 14;
  }
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  if (node.kind === "group") {
    const gradient = ctx.createLinearGradient(
      rect.x,
      rect.y,
      rect.x + rect.width,
      rect.y + rect.height,
    );
    gradient.addColorStop(0, "#3f2717");
    gradient.addColorStop(1, "#22150d");
    ctx.fillStyle = gradient;
  }
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  if (hovered || selected) {
    ctx.fillStyle = selected
      ? "rgba(255,255,255,0.12)"
      : "rgba(255,255,255,0.08)";
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  }
  if (progress !== null && temporalRole !== "modified") {
    ctx.fillStyle =
      node.kind === "group" ? "rgba(116,70,34,0.58)" : "rgba(42,82,122,0.58)";
    ctx.fillRect(
      rect.x + 1,
      rect.y + 1,
      Math.max(0, rect.width - 2) * progress,
      Math.max(0, rect.height - 2),
    );
  }
  const gloss = ctx.createLinearGradient(
    rect.x,
    rect.y,
    rect.x,
    rect.y + rect.height,
  );
  gloss.addColorStop(0, "rgba(255,255,255,0.055)");
  gloss.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = gloss;
  ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  ctx.fillStyle = nodeColors.text;
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    node.label,
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    rect.width - 12,
  );
  for (const port of getStrictComposition2dPorts(node, edges))
    drawPortSquare(
      ctx,
      strictPortPoint(node, port, edges),
      getStrictPortColor(port),
    );
  if (connector?.nodeId === node.id)
    drawConnectorDot(ctx, connector.point, "#f3f6fb");
}

function strictPortPoint(
  node: GraphNode,
  port: GraphPortDefinition,
  edges: readonly RenderableGraphEdge[] = [],
) {
  const rect = nodeRect(node);
  const ports = getStrictComposition2dPorts(node, edges).filter(
    (candidate) => candidate.direction === port.direction,
  );
  const index = Math.max(
    0,
    ports.findIndex((candidate) => candidate.id === port.id),
  );
  return {
    x: port.direction === "output" ? rect.x + rect.width : rect.x,
    y: rect.y + ((index + 1) * rect.height) / (ports.length + 1),
  };
}

function strictPortConnectorPoint(
  node: GraphNode,
  port: GraphPortDefinition,
  edges: readonly RenderableGraphEdge[] = [],
) {
  const point = strictPortPoint(node, port, edges);
  return {
    x: port.direction === "output" ? point.x + portGap : point.x - portGap,
    y: point.y,
  };
}

function getStrictPortColor(port: GraphPortDefinition) {
  if (port.type.kind === "value") return "#b48cff";
  if (port.type.kind === "anyValue") return "#d49cff";
  return nodeColors.port;
}

function hasGraphNodeDynamicOutputSockets(node: GraphNode) {
  return Boolean(
    animationGraphNodeRegistry.get(node.kind)?.getNextOutputSocket,
  );
}

function getNextGraphNodeOutputSocket(
  node: GraphNode,
  edges: readonly AnimationGraphEdge[],
) {
  return animationGraphNodeRegistry
    .get(node.kind)
    ?.getNextOutputSocket?.(node, edges);
}

function getConditionOutputOptions(
  node: GraphNode,
  edges: readonly AnimationGraphEdge[],
) {
  const configOutputs =
    node.typedNode?.kind === "condition"
      ? normalizeStrictConditionEditorConfig(node.typedNode.config).outputs.map(
          (output) => output.id,
        )
      : [];
  const sockets = Array.from(
    new Set([
      ...configOutputs,
      ...getConditionOutputSockets(node.id, edges),
      getNextConditionOutputPortId(node, edges) ?? "output:1",
    ]),
  ).filter((id) => id !== "default");
  return sockets.map((socket, index) => ({
    value: socket,
    label: socket.replace(/^output:/, "Output ") || `Output ${index + 1}`,
  }));
}

function getConditionOutputSockets(
  nodeId: string,
  edges: readonly RenderableGraphEdge[],
) {
  return Array.from(
    new Set(
      edges
        .filter((edge) => getEditorEdgeFromNodeId(edge) === nodeId)
        .map((edge) => readConditionOutputSocket(getEditorEdgeFromSocket(edge)))
        .filter((socket): socket is string => Boolean(socket)),
    ),
  );
}

function getNextConditionOutputPortId(
  node: GraphNode,
  edges: readonly RenderableGraphEdge[],
) {
  if (node.kind !== "condition") return undefined;
  const used = new Set(
    edges
      .filter((edge) => getEditorEdgeFromNodeId(edge) === node.id)
      .map((edge) => getEditorEdgeFromSocket(edge))
      .filter((id): id is string => Boolean(id)),
  );
  for (let index = 1; index <= used.size + 1; index += 1) {
    const id = `output:${index}`;
    if (!used.has(id)) return id;
  }
  return "output:1";
}

function readConditionOutputSocket(socketId: string | undefined) {
  return socketId?.startsWith("output:") ? socketId : undefined;
}
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: RenderableGraphEdge,
  nodes: GraphNode[],
  edges: RenderableGraphEdge[],
  hovered = false,
  mode: GraphCompositionMode = "composition2d",
  debug?: StrictComposition2dEdgeDebugSummary,
) {
  const from = nodes.find((node) => node.id === getEditorEdgeFromNodeId(edge));
  const to = nodes.find((node) => node.id === getEditorEdgeToNodeId(edge));
  if (!from || !to) return;
  const color = hovered ? "#7f8a99" : "#646b75";
  const fromPoint = getEdgeEndpointPoint(from, edge, "from", edges, mode);
  const toPoint = getEdgeEndpointPoint(to, edge, "to", edges, mode);
  const segmentColors = getEdgeSegmentColors(from, to, edge, edges, mode);
  drawArrow(
    ctx,
    fromPoint,
    toPoint,
    color,
    true,
    hovered,
    getComposition2dEdgeControlState(edge, nodes, edges, debug),
    segmentColors,
  );
}

function getEdgeEndpointPoint(
  node: GraphNode,
  edge: RenderableGraphEdge,
  endpoint: "from" | "to",
  edges: readonly RenderableGraphEdge[],
  mode: GraphCompositionMode,
) {
  if (mode !== "composition2d") return nodeCenter(node);
  const portId =
    endpoint === "from"
      ? getEditorEdgeFromSocket(edge)
      : getEditorEdgeToSocket(edge);
  const port = getStrictComposition2dPorts(node, edges).find(
    (candidate) =>
      candidate.id === portId &&
      candidate.direction === (endpoint === "from" ? "output" : "input"),
  );
  return port ? strictPortPoint(node, port, edges) : nodeCenter(node);
}

function getEdgeSegmentColors(
  fromNode: GraphNode,
  toNode: GraphNode,
  edge: RenderableGraphEdge,
  edges: readonly RenderableGraphEdge[],
  mode: GraphCompositionMode,
) {
  if (mode !== "composition2d") return undefined;
  const fromPortId = getEditorEdgeFromSocket(edge);
  const toPortId = getEditorEdgeToSocket(edge);
  const fromPort = getStrictComposition2dPorts(fromNode, edges).find(
    (port) => port.id === fromPortId && port.direction === "output",
  );
  const toPort = getStrictComposition2dPorts(toNode, edges).find(
    (port) => port.id === toPortId && port.direction === "input",
  );
  if (!fromPort || !toPort) return undefined;
  return {
    from: getStrictPortColor(fromPort),
    to: getStrictPortColor(toPort),
  };
}

function getComposition2dEdgeControlState(
  edge: RenderableGraphEdge,
  nodes: GraphNode[],
  edges: RenderableGraphEdge[],
  debug?: StrictComposition2dEdgeDebugSummary,
) {
  if (debug?.diagnostic)
    return { registered: false, label: debug.diagnostic.message };
  const from = nodes.find((node) => node.id === getEditorEdgeFromNodeId(edge));
  if (from?.kind !== "condition") return undefined;
  const label = getConditionEdgeOutputLabel(edge, edges);
  return { registered: Boolean(label), label };
}

function getConditionEdgeOutputLabel(
  edge: RenderableGraphEdge,
  edges: RenderableGraphEdge[],
) {
  const socket = readConditionOutputSocket(getEditorEdgeFromSocket(edge));
  if (!socket) return undefined;
  const sockets = getConditionOutputSockets(
    getEditorEdgeFromNodeId(edge),
    edges,
  );
  const index = sockets.indexOf(socket);
  return index >= 0 ? String(index + 1) : undefined;
}
function drawPreviewEdge(
  ctx: CanvasRenderingContext2D,
  edge: Extract<DragState, { kind: "edge" }>,
  point: { x: number; y: number },
  nodes: GraphNode[],
  mode: GraphCompositionMode = "composition2d",
) {
  const color = "#d8dee9";
  drawArrow(ctx, { x: edge.startX, y: edge.startY }, point, color, false);
}
function drawMarquee(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
) {
  ctx.save();
  ctx.fillStyle = "rgba(21,157,255,0.1)";
  ctx.strokeStyle = "#159dff";
  ctx.lineWidth = 1;
  ctx.shadowColor = "rgba(21,157,255,0.18)";
  ctx.shadowBlur = 0;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(21,157,255,0.18)";
  ctx.strokeRect(rect.x - 1, rect.y - 1, rect.width + 2, rect.height + 2);
  ctx.restore();
}
function drawConnectorDot(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  color = nodeColors.port,
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "#242b35";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
function drawPortSquare(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  color = nodeColors.port,
) {
  const half = strictPortSize / 2;
  ctx.fillStyle = color;
  ctx.fillRect(point.x - half, point.y - half, strictPortSize, strictPortSize);
}
function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  inlineControl: boolean,
  hovered = false,
  controlState?: { registered: boolean; label?: string },
  segmentColors?: { from: string; to: string },
) {
  ctx.lineWidth = 2.25;
  if (segmentColors && inlineControl) {
    const control = getEdgeControlPoint(from, to);
    ctx.strokeStyle = segmentColors.from;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(control.x, control.y);
    ctx.stroke();
    ctx.strokeStyle = segmentColors.to;
    ctx.beginPath();
    ctx.moveTo(control.x, control.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  } else {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  if (!inlineControl) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - 10 * Math.cos(angle - 0.45),
      to.y - 10 * Math.sin(angle - 0.45),
    );
    ctx.lineTo(
      to.x - 10 * Math.cos(angle + 0.45),
      to.y - 10 * Math.sin(angle + 0.45),
    );
    ctx.closePath();
    ctx.fill();
    return;
  }
  drawEdgeControl(
    ctx,
    getEdgeControlPoint(from, to),
    Math.atan2(to.y - from.y, to.x - from.x),
    hovered,
    controlState,
  );
}
function drawEdgeControl(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  angle: number,
  hovered = false,
  state?: { registered: boolean; label?: string },
) {
  const registered = state?.registered ?? true;
  ctx.fillStyle = hovered ? "#454b55" : "#2f3339";
  ctx.strokeStyle = hovered ? "#99a3b2" : "#535a64";
  ctx.lineWidth = 1.5;
  if (hovered) {
    ctx.shadowColor = "rgba(185, 200, 220, 0.5)";
    ctx.shadowBlur = 12;
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = hovered ? "#ffffff" : "#d3d7de";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (registered) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(3, 0);
    ctx.lineTo(-3, 5);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.font = "800 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", point.x, point.y + 0.5);
  }
  if (registered && state?.label) {
    ctx.font = "800 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.strokeText(state.label, point.x, point.y + 20, 140);
    ctx.fillStyle = "#eef2f7";
    ctx.fillText(state.label, point.x, point.y + 20, 140);
  }
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}
function getEdgeControlPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  return {
    x: from.x + (to.x - from.x) * 0.5,
    y: from.y + (to.y - from.y) * 0.5,
  };
}

function getBestEdgePorts(
  from: GraphNode,
  to: GraphNode,
): { fromPort: AnimationGraphPort; toPort: AnimationGraphPort } {
  const fromRect = nodeRect(from);
  const toRect = nodeRect(to);
  const fromCenter = {
    x: fromRect.x + fromRect.width / 2,
    y: fromRect.y + fromRect.height / 2,
  };
  const toCenter = {
    x: toRect.x + toRect.width / 2,
    y: toRect.y + toRect.height / 2,
  };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) > Math.abs(dy))
    return dx > 0
      ? { fromPort: "right", toPort: "left" }
      : { fromPort: "left", toPort: "right" };
  return dy > 0
    ? { fromPort: "bottom", toPort: "top" }
    : { fromPort: "top", toPort: "bottom" };
}

function getGraphPlaybackDrawSemantics({
  graph,
  nodes,
  contextNodes = nodes,
  objects,
  currentTime,
  disabled = false,
}: {
  graph: AnimationGraphState | undefined;
  nodes: GraphNode[];
  contextNodes?: GraphNode[];
  objects: FrameObject[];
  currentTime: number;
  disabled?: boolean;
}) {
  if (disabled)
    return {
      temporalRoles: new Map<string, TemporalNodeRole>(),
      progressForNode: () => null,
    };
  const timingContext = buildGraphEquivalentTimingContext(
    graph,
    contextNodes,
    objects,
  );
  return {
    temporalRoles: getTemporalNodeRoles(
      timingContext.nodes,
      timingContext.graph,
      objects,
    ),
    progressForNode: (node: GraphNode) =>
      getNodePlaybackProgress(
        node,
        timingContext.graph,
        currentTime,
        timingContext.nodes,
        objects,
      ),
  };
}

function buildGraphEquivalentTimingContext(
  graph: AnimationGraphState | undefined,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const parentEdges = getRenderableEdges(graph, nodes, objects);
  const expanded = graph
    ? expandAnimationGraphGroups({
        graph,
        baseCustomNodes: graph.customNodes ?? {},
        baseParameters: graph.parameters ?? {},
        parentEdges,
        includeGroupNode: (nodeId) => nodesById.get(nodeId)?.kind === "group",
      })
    : null;
  for (const node of nodes) {
    if (node.kind !== "group") continue;
    const groupId = node.details?.groupId;
    const group = groupId ? graph?.groups?.[groupId] : undefined;
    if (!group) continue;
    for (const groupNode of buildGroupGraphContextNodes(
      group,
      graph,
      objects,
    )) {
      if (!nodesById.has(groupNode.id)) nodesById.set(groupNode.id, groupNode);
    }
  }
  const contextNodes = Array.from(nodesById.values());
  const edges = filterPermittedEdges(
    filterRenderableEdges(expanded?.edges ?? parentEdges, contextNodes),
    contextNodes,
  );
  return {
    nodes: contextNodes,
    edges,
    graph: {
      ...(graph ?? { nodes: {}, edges: [] }),
      edges,
      customNodes: expanded?.customNodes ?? graph?.customNodes,
      parameters: expanded?.parameters ?? graph?.parameters,
    } satisfies AnimationGraphState,
  };
}

function getNodePlaybackProgress(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  currentTime: number,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  if (node.kind === "group")
    return getGroupNodePlaybackProgress(node, graph, currentTime, objects);
  const renderableEdges = getRenderableEdges(graph, nodes, objects);
  const temporalRole = getTemporalNodeRoles(nodes, graph, objects).get(node.id);
  if (node.kind === "split") {
    if (temporalRole !== "active") return null;
    return getTimePlaybackProgress({
      currentTime,
      start: getModifierNodeStart(node, graph, renderableEdges, nodes, objects),
      duration: getModifierNodeDuration(
        node,
        graph,
        renderableEdges,
        nodes,
        objects,
      ),
    });
  }
  if (node.kind === "condition") {
    if (temporalRole !== "active") return null;
    return getTimePlaybackProgress({
      currentTime,
      start: getModifierNodeStart(node, graph, renderableEdges, nodes, objects),
      duration: getModifierNodeDuration(
        node,
        graph,
        renderableEdges,
        nodes,
        objects,
      ),
    });
  }
  if (node.kind !== "time") return null;
  if (temporalRole === "modified") return null;
  const parameters = graph?.parameters?.[node.id];
  const start = getTimeNodeStart(
    node,
    graph,
    renderableEdges,
    nodes,
    objects,
    new Set(),
  );
  const duration = getEffectiveTimeNodeDuration(
    node.id,
    graph,
    renderableEdges,
    nodes,
    objects,
  );
  return getTimePlaybackProgress({
    currentTime,
    start,
    duration,
    repeat: parameters?.repeat ?? node.details?.repeat,
    repeatType: parameters?.repeatType ?? node.details?.repeatType,
  });
}

function getSplitNodePlaybackProgress(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  currentTime: number,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const renderableEdges = getRenderableEdges(graph, nodes, objects);
  const parameters = graph?.parameters?.[node.id];
  const stagger = parseSeconds(
    parameters?.stagger ?? node.details?.stagger ?? "0s",
  );
  const order = parameters?.order ?? node.details?.order ?? "forward";
  const repeatScope =
    parameters?.repeatScope ?? node.details?.repeatScope ?? "sequence";
  const mode = parameters?.mode ?? node.details?.mode ?? "word";
  const tokenCount = getSplitNodeTokenCount(
    node.id,
    renderableEdges,
    objects,
    mode,
  );
  const maxOffset = getSplitMaxTokenOffset(tokenCount, stagger, order);
  const upstreamTimes = renderableEdges
    .filter((edge) => edge.toNodeId === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.fromNodeId))
    .filter((candidate): candidate is GraphNode =>
      Boolean(candidate && candidate.kind === "time"),
    );
  if (!upstreamTimes.length) return 0;
  const progresses = upstreamTimes.map((timeNode) => {
    const timeParameters = graph?.parameters?.[timeNode.id];
    const start = getTimeNodeStart(
      timeNode,
      graph,
      renderableEdges,
      nodes,
      objects,
      new Set(),
    );
    const baseDuration = parseSeconds(
      timeParameters?.duration ?? timeNode.details?.duration ?? "0s",
    );
    const duration =
      repeatScope === "sequence" ? baseDuration + maxOffset : baseDuration;
    return getTimePlaybackProgress({
      currentTime,
      start,
      duration,
      repeat: timeParameters?.repeat ?? timeNode.details?.repeat,
      repeatType: timeParameters?.repeatType ?? timeNode.details?.repeatType,
    });
  });
  return progresses.length ? Math.max(...progresses) : null;
}

function getSplitNodeTokenCount(
  splitNodeId: string,
  edges: AnimationGraphEdge[],
  objects: FrameObject[],
  mode: string,
) {
  const layerIds = objects
    .map((object) => `layer:${object.id}`)
    .filter((layerId) => graphPathReachesNode(splitNodeId, layerId, edges));
  const countFor = (layerId: string) => {
    const objectId = layerId.replace(/^layer:/, "");
    const object = objects.find((item) => item.id === objectId);
    if (!object || object.type !== "text") return 1;
    const text =
      object.richText?.map((segment) => segment.text).join("") ??
      object.content ??
      "";
    if (!text) return 1;
    if (mode === "character")
      return Math.max(
        1,
        Array.from(text).filter((char) => char !== "\n" && !/\s/.test(char))
          .length,
      );
    return Math.max(1, (text.match(/\S+/g) ?? []).length);
  };
  const counts = layerIds.map((layerId) => countFor(layerId));
  return counts.length ? Math.max(...counts) : 1;
}

function graphPathReachesNode(
  startNodeId: string,
  targetNodeId: string,
  edges: AnimationGraphEdge[],
) {
  const stack = [startNodeId];
  const visited = new Set<string>();
  while (stack.length) {
    const nodeId = stack.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    for (const edge of edges.filter(
      (candidate) => candidate.fromNodeId === nodeId,
    )) {
      if (edge.toNodeId === targetNodeId) return true;
      if (!edge.toNodeId.startsWith("layer:")) stack.push(edge.toNodeId);
    }
  }
  return false;
}

function getSplitMaxTokenOffset(count: number, stagger: number, order: string) {
  const safeCount = Math.max(1, count);
  const safeStagger = Math.max(0, stagger);
  if (order === "center") return ((safeCount - 1) / 2) * safeStagger;
  return Math.max(0, safeCount - 1) * safeStagger;
}

function getEffectiveTimeNodeDuration(
  timeNodeId: string,
  graph: AnimationGraphState | undefined,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const timeNode = nodes.find((node) => node.id === timeNodeId);
  if (!timeNode) return 0;
  const baseDuration = parseSeconds(
    graph?.parameters?.[timeNodeId]?.duration ??
      timeNode.details?.duration ??
      "0s",
  );
  const splitNode = getDirectTemporalModifier(timeNodeId, edges, nodes);
  if (!splitNode) return baseDuration;
  const params = graph?.parameters?.[splitNode.id];
  if (
    (params?.repeatScope ?? splitNode.details?.repeatScope ?? "sequence") !==
    "sequence"
  )
    return baseDuration;
  const stagger = parseSeconds(
    params?.stagger ?? splitNode.details?.stagger ?? "0s",
  );
  const order = params?.order ?? splitNode.details?.order ?? "forward";
  const mode = params?.mode ?? splitNode.details?.mode ?? "word";
  return (
    baseDuration +
    getSplitMaxTokenOffset(
      getSplitNodeTokenCount(splitNode.id, edges, objects, mode),
      stagger,
      order,
    )
  );
}

function getTemporalNodeRoles(
  nodes: GraphNode[],
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
) {
  const edges = getRenderableEdges(graph, nodes, objects);
  const roles = new Map<string, TemporalNodeRole>();
  const outputConnected = nodes.some(
    (node) => node.id === composition2dOutNodeId,
  )
    ? getConnectedToOutputNodeIds(edges, nodes, composition2dOutNodeId)
    : null;
  for (const node of nodes) {
    if (outputConnected && !outputConnected.has(node.id)) continue;
    if (node.kind === "group") {
      const modifier = getDirectTemporalModifier(node.id, edges, nodes);
      if (modifier && (!outputConnected || outputConnected.has(modifier.id)))
        roles.set(
          modifier.id,
          getDirectTemporalModifier(modifier.id, edges, nodes)
            ? "modified"
            : "active",
        );
      continue;
    }
    if (node.kind !== "time") continue;
    const modifier = getDirectTemporalModifier(node.id, edges, nodes);
    if (!modifier) {
      roles.set(node.id, "active");
      continue;
    }
    roles.set(node.id, "modified");
    roles.set(
      modifier.id,
      getDirectTemporalModifier(modifier.id, edges, nodes)
        ? "modified"
        : "active",
    );
  }
  return roles;
}

function getDirectTemporalModifier(
  nodeId: string,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  const edge = edges.find(
    (candidate) =>
      candidate.fromNodeId === nodeId &&
      ["split", "condition", "oscillate"].includes(
        nodes.find((node) => node.id === candidate.toNodeId)?.kind ?? "",
      ),
  );
  return edge
    ? nodes.find(
        (node) =>
          node.id === edge.toNodeId &&
          (node.kind === "split" ||
            node.kind === "condition" ||
            node.kind === "oscillate"),
      )
    : undefined;
}

function getGraphTextTokens(object: FrameObject, mode: string) {
  if (object.type !== "text") return [object.name];
  const text =
    object.richText?.map((segment) => segment.text).join("") ??
    object.content ??
    "";
  if (!text) return [];
  if (mode === "character")
    return Array.from(text).filter((char) => char !== "\n" && !/\s/.test(char));
  return text.match(/\S+/g) ?? [];
}

function getModifierSourceTimeNodeId(
  modifierId: string,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  return edges.find(
    (edge) =>
      edge.toNodeId === modifierId &&
      nodes.find((node) => node.id === edge.fromNodeId)?.kind === "time",
  )?.fromNodeId;
}

function getModifierSourceGroupNodeId(
  modifierId: string,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  return edges.find(
    (edge) =>
      edge.toNodeId === modifierId &&
      nodes.find((node) => node.id === edge.fromNodeId)?.kind === "group",
  )?.fromNodeId;
}

function getModifierNodeStart(
  modifierNode: GraphNode,
  graph: AnimationGraphState | undefined,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const sourceTimeId = getModifierSourceTimeNodeId(
    modifierNode.id,
    edges,
    nodes,
  );
  const sourceTimeNode = sourceTimeId
    ? nodes.find((node) => node.id === sourceTimeId && node.kind === "time")
    : undefined;
  if (sourceTimeNode)
    return getTimeNodeStart(
      sourceTimeNode,
      graph,
      edges,
      nodes,
      objects,
      new Set(),
    );
  const sourceGroupId = getModifierSourceGroupNodeId(
    modifierNode.id,
    edges,
    nodes,
  );
  const sourceGroupNode = sourceGroupId
    ? nodes.find((node) => node.id === sourceGroupId && node.kind === "group")
    : undefined;
  return sourceGroupNode
    ? getGroupOutputTimeStart(sourceGroupNode, graph, objects)
    : 0;
}

function getModifierNodeDuration(
  modifierNode: GraphNode,
  graph: AnimationGraphState | undefined,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const sourceTimeId = getModifierSourceTimeNodeId(
    modifierNode.id,
    edges,
    nodes,
  );
  if (sourceTimeId)
    return getEffectiveTimeNodeDuration(
      sourceTimeId,
      graph,
      edges,
      nodes,
      objects,
    );
  const sourceGroupId = getModifierSourceGroupNodeId(
    modifierNode.id,
    edges,
    nodes,
  );
  const sourceGroupNode = sourceGroupId
    ? nodes.find((node) => node.id === sourceGroupId && node.kind === "group")
    : undefined;
  return sourceGroupNode
    ? getGroupOutputTimeDuration(sourceGroupNode, graph, objects)
    : 0;
}

function getGroupOutputTimeStart(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
) {
  const output = getGroupOutputTimeSemantics(node, graph, objects);
  return output.length ? Math.max(...output.map((item) => item.start)) : 0;
}

function getGroupOutputTimeDuration(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
) {
  const output = getGroupOutputTimeSemantics(node, graph, objects);
  return output.length ? Math.max(...output.map((item) => item.duration)) : 0;
}

function getGroupOutputTimeSemantics(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  objects: FrameObject[],
) {
  const groupId = node.details?.groupId;
  const group = groupId ? graph?.groups?.[groupId] : undefined;
  if (!group) return [];
  const nodes = buildGroupGraphContextNodes(group, graph, objects);
  const edges = filterPermittedEdges(
    filterRenderableEdges(group.edges ?? [], nodes),
    nodes,
  );
  const connectedNodeIds = getConnectedToGroupOutNodeIds(
    edges,
    nodes,
    group.outNodeId,
  );
  const groupGraph = {
    ...graph,
    nodes: group.nodes,
    edges,
    customNodes: group.customNodes,
    parameters: { ...(graph?.parameters ?? {}), ...(group.parameters ?? {}) },
  } satisfies AnimationGraphState;
  return nodes.flatMap((candidate) => {
    if (
      group.customNodes?.[candidate.id]?.kind !== "time" ||
      !connectedNodeIds.has(candidate.id)
    )
      return [];
    return [
      {
        start: getTimeNodeStart(
          candidate,
          groupGraph,
          edges,
          nodes,
          objects,
          new Set(),
        ),
        duration: getEffectiveTimeNodeDuration(
          candidate.id,
          groupGraph,
          edges,
          nodes,
          objects,
        ),
      },
    ];
  });
}

function getGroupNodePlaybackProgress(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  currentTime: number,
  objects: FrameObject[],
) {
  const groupId = node.details?.groupId;
  const group = groupId ? graph?.groups?.[groupId] : undefined;
  if (!group) return null;
  const nodes = buildGroupGraphContextNodes(group, graph, objects);
  const edges = filterPermittedEdges(
    filterRenderableEdges(group.edges ?? [], nodes),
    nodes,
  );
  const connectedNodeIds = getConnectedToGroupOutNodeIds(
    edges,
    nodes,
    group.outNodeId,
  );
  const groupGraph = {
    ...graph,
    nodes: group.nodes,
    edges,
    customNodes: group.customNodes,
    parameters: { ...(graph?.parameters ?? {}), ...(group.parameters ?? {}) },
  } satisfies AnimationGraphState;
  const progresses = nodes.flatMap((candidate) => {
    if (
      group.customNodes?.[candidate.id]?.kind !== "time" ||
      !connectedNodeIds.has(candidate.id)
    )
      return [];
    const start = getTimeNodeStart(
      candidate,
      groupGraph,
      edges,
      nodes,
      objects,
      new Set(),
    );
    const parameters = groupGraph.parameters?.[candidate.id];
    return [
      getTimePlaybackProgress({
        currentTime,
        start,
        duration: getTimeNodeDuration(candidate, groupGraph),
        repeat: parameters?.repeat ?? candidate.details?.repeat,
        repeatType: parameters?.repeatType ?? candidate.details?.repeatType,
      }),
    ];
  });
  return progresses.length ? Math.max(...progresses) : null;
}

function getTimePlaybackProgress({
  currentTime,
  start,
  duration,
  repeat,
  repeatType = "loop",
}: {
  currentTime: number;
  start: number;
  duration: number;
  repeat?: string;
  repeatType?: string;
}) {
  if (currentTime < start) return 0;
  if (duration <= 0) return 1;
  const elapsed = currentTime - start;
  const repeatCount = parseGraphRepeatCount(repeat);
  if (repeatCount === undefined)
    return Math.min(Math.max(elapsed / duration, 0), 1);
  if (repeatCount !== Infinity) {
    const totalDuration = duration + repeatCount * duration;
    if (elapsed >= totalDuration) {
      if (repeatType === "reverse" || repeatType === "mirror")
        return repeatCount % 2 === 0 ? 0 : 1;
      return 1;
    }
  }
  const cycleIndex = Math.floor(elapsed / duration);
  const rawProgress = (elapsed % duration) / duration;
  return repeatType === "reverse" || repeatType === "mirror"
    ? cycleIndex % 2 === 1
      ? 1 - rawProgress
      : rawProgress
    : rawProgress;
}

function parseGraphRepeatCount(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  if (value === "Infinity") return Infinity;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : undefined;
}

function getTimeNodeStart(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  objects: FrameObject[],
  visiting: Set<string>,
): number {
  const temporalNodes = nodes.flatMap((candidate) => {
    if (candidate.kind !== "time" && candidate.kind !== "split") return [];
    return [
      {
        id: candidate.id,
        kind: candidate.kind,
        details: {
          ...(candidate.details ?? {}),
          ...(graph?.parameters?.[candidate.id] ?? {}),
        },
      } satisfies AnimationGraphTemporalNode,
    ];
  });
  const temporalNode = temporalNodes.find(
    (candidate) => candidate.id === node.id,
  );
  if (!temporalNode) return 0;
  return getAnimationGraphTemporalStart(
    temporalNode,
    {
      edges,
      nodes: temporalNodes,
      getMode: (candidate) =>
        candidate.kind === "split" ? "overlay" : "stack",
      getScheduleMode: (candidate) =>
        candidate.details?.schedule === "absolute" ? "absolute" : "relative",
      getDelay: (candidate) => parseSeconds(candidate.details?.delay ?? "0s"),
      getDuration: (candidate) =>
        parseSeconds(candidate.details?.duration ?? "0s"),
      getSplitTokenCount: (candidate) =>
        getSplitNodeTokenCount(
          candidate.id,
          edges,
          objects,
          candidate.details?.mode ?? "word",
        ),
    },
    visiting,
  );
}

function getTimeNodeDuration(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
) {
  return parseSeconds(
    graph?.parameters?.[node.id]?.duration ?? node.details?.duration ?? "0s",
  );
}

function isConnectedToLayer(
  nodeId: string,
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  const nodeKinds = new Map(nodes.map((node) => [node.id, node.kind]));
  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (nodeKinds.get(current) === "layer") return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges)
      if (edge.fromNodeId === current) stack.push(edge.toNodeId);
  }
  return false;
}

function parseSeconds(value: string) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function GraphNodeRenameInput({
  node,
  viewportRef,
  graphScale,
  onCommit,
  onCancel,
}: {
  node: GraphNode | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  graphScale: number;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(node?.label ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    setValue(node?.label ?? "");
    valueRef.current = node?.label ?? "";
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [node?.id, node?.label]);
  useEffect(() => {
    const commitOnOutsidePointer = (event: globalThis.PointerEvent) => {
      if (event.target === inputRef.current) return;
      onCommit(valueRef.current);
    };
    document.addEventListener("pointerdown", commitOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", commitOnOutsidePointer, true);
  }, [onCommit]);
  if (!node || !viewportRef.current) return null;
  const viewportRect = viewportRef.current.getBoundingClientRect();
  const rect = nodeRect(node);
  const left =
    viewportRect.left + rect.x * graphScale - viewportRef.current.scrollLeft;
  const top =
    viewportRect.top + rect.y * graphScale - viewportRef.current.scrollTop;
  const width = rect.width * graphScale;
  const height = rect.height * graphScale;
  return createPortal(
    <input
      ref={inputRef}
      className="fixed z-[6000] appearance-none border-0 px-2 text-center text-[12px] font-normal text-[#d9dee8] outline-none"
      style={{
        left: left + graphScale,
        top: top + graphScale,
        width: Math.max(1, width - graphScale * 2),
        height: Math.max(1, height - graphScale * 2),
        background: nodeColors.groupBg,
      }}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(value);
        if (event.key === "Escape") onCancel();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />,
    document.body,
  );
}

function GroupSubgraphPreview({
  group,
  graph,
  groupNodeId,
  groupId,
  currentTime,
  objects,
  onGroupReplace,
}: {
  group?: AnimationGraphGroup;
  graph: AnimationGraphState | undefined;
  groupNodeId?: string;
  groupId?: string;
  currentTime: number;
  objects: FrameObject[];
  onGroupReplace: (groupId: string, nextGroup: AnimationGraphGroup) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewPositionsRef = useRef<Record<
    string,
    { x: number; y: number }
  > | null>(null);
  const hoverConnectorRef = useRef<HoverConnector | null>(null);
  const layoutRef = useRef<{
    groupId?: string;
    offsetX: number;
    offsetY: number;
    scrollWidth: number;
    scrollHeight: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const graphScaleRef = useRef(1);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverConnector, setHoverConnector] = useState<HoverConnector | null>(
    null,
  );
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [graphScale, setGraphScale] = useState(1);
  const zoomEnabled = groupSubgraphZoomEnabled;
  const [localGroup, setLocalGroup] = useState(group);
  useEffect(() => setLocalGroup(group), [group]);
  if (!group) {
    return (
      <div className="grid h-[244px] place-items-center rounded-lg border border-[#394255] bg-[#0b0f16] text-center text-[12px] font-bold text-[#c08f62]">
        Missing group data{groupId ? `: ${groupId}` : ""}
      </div>
    );
  }
  const editableGroup = localGroup ?? group;
  const width = baseGraphWorldWidth;
  const height = baseGraphWorldHeight;
  if (layoutRef.current?.groupId !== groupId) {
    const layout = getGroupGraphScrollLayout(
      buildGroupGraphNodes(editableGroup),
      width,
      height,
    );
    layoutRef.current = { groupId, ...layout };
  }
  const getGroupViewData = () => {
    const layout = layoutRef.current ?? {
      offsetX: 0,
      offsetY: 0,
      scrollWidth: width,
      scrollHeight: height,
      scrollLeft: 0,
      scrollTop: 0,
    };
    const nodes = buildGroupGraphNodes(editableGroup).map((node) => ({
      ...node,
      x: node.x + layout.offsetX / gridSize,
      y: node.y + layout.offsetY / gridSize,
      ...(previewPositionsRef.current?.[node.id] ?? {}),
    }));
    const equivalentContext = buildGroupEquivalentGraphContext(
      groupNodeId,
      editableGroup,
      graph,
      objects,
    );
    const contextNodes = equivalentContext.nodes.map((node) => ({
      ...node,
      x: node.x + layout.offsetX / gridSize,
      y: node.y + layout.offsetY / gridSize,
      ...(previewPositionsRef.current?.[node.id] ?? {}),
    }));
    const displayGraph = {
      nodes: editableGroup.nodes,
      edges: equivalentContext.edges,
      customNodes: equivalentContext.customNodes,
      groups: undefined,
      parameters: editableGroup.parameters,
    } satisfies AnimationGraphState;
    return {
      layout,
      nodes,
      contextNodes,
      displayGraph,
      displayEdges: filterPermittedEdges(
        filterRenderableEdges(editableGroup.edges ?? [], nodes),
        nodes,
      ),
    };
  };
  const { layout, nodes, displayGraph, displayEdges } = getGroupViewData();
  const commitGroup = (nextGroup: AnimationGraphGroup) => {
    setLocalGroup(nextGroup);
    if (!groupId) return;
    onGroupReplace(groupId, nextGroup);
  };
  const updateHover = (nodeId: string | null, port: HoverConnector | null) => {
    setHoverNodeId(nodeId);
    setHoverConnector(port);
    hoverConnectorRef.current = port;
  };
  const setGroupScaleValue = (nextScale: number) => {
    const clamped = clampGraphScale(nextScale);
    graphScaleRef.current = clamped;
    setGraphScale(clamped);
    return clamped;
  };
  const zoomGroupAtPoint = (
    nextScale: number,
    clientX: number,
    clientY: number,
  ) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previousScale = graphScaleRef.current;
    const clamped = setGroupScaleValue(nextScale);
    const rect = viewport.getBoundingClientRect();
    const graphX = (viewport.scrollLeft + clientX - rect.left) / previousScale;
    const graphY = (viewport.scrollTop + clientY - rect.top) / previousScale;
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(
        0,
        graphX * clamped - (clientX - rect.left),
      );
      viewport.scrollTop = Math.max(0, graphY * clamped - (clientY - rect.top));
      drawGroupCanvas();
    });
  };
  const onGroupWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (zoomEnabled && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      zoomGroupAtPoint(
        graphScaleRef.current * Math.exp(-normalizeWheelDelta(event) * 0.0012),
        event.clientX,
        event.clientY,
      );
      return;
    }
    requestAnimationFrame(drawGroupCanvas);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event, viewportRef.current);
    const drag = dragRef.current;
    if (drag?.kind === "node") {
      setHoverEdgeId(null);
      const position = getDraggedGraphNodePosition(
        event,
        drag,
        graphScaleRef.current,
      );
      previewPositionsRef.current = {
        ...(previewPositionsRef.current ?? {}),
        [drag.nodeId]: position,
      };
      drawGroupCanvas();
      return;
    }
    if (drag?.kind === "edge") {
      setHoverEdgeId(null);
      drag.x = point.x;
      drag.y = point.y;
      const view = getGroupViewData();
      const target = getGraphEdgeDrop(
        point,
        drag,
        view.nodes,
        graphScaleRef.current,
        view.displayGraph,
        [],
      );
      updateHover(target?.nodeId ?? null, null);
      drawGroupCanvas();
      return;
    }
    if (drag?.kind === "marquee") {
      setHoverEdgeId(null);
      updateHover(null, null);
      drag.x = point.x;
      drag.y = point.y;
      if (
        !drag.active &&
        Math.hypot(
          event.clientX - drag.startClientX,
          event.clientY - drag.startClientY,
        ) > marqueeThreshold
      )
        drag.active = true;
      drawGroupCanvas();
      return;
    }
    const view = getGroupViewData();
    updateGraphHoverState(
      point,
      view.nodes,
      graphScaleRef.current,
      updateHover,
      setHoverEdgeId,
      view.displayEdges,
    );
  };
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = canvasPoint(event, viewportRef.current);
    const bodyNode = hitNode(point, nodes, graphScaleRef.current);
    const connector = getGraphPointerDownConnector(
      point,
      nodes,
      graphScaleRef.current,
      hoverConnectorRef.current,
      displayEdges,
    );
    if (connector) {
      const source = nodes.find((node) => node.id === connector.nodeId);
      if (!source) return;
      const start = nodeCenter(source);
      setSelectedNodeIds([connector.nodeId]);
      setHoverEdgeId(null);
      dragRef.current = {
        kind: "edge",
        fromNodeId: connector.nodeId,
        fromPort: connector.port,
        fromSocket: connector.fromSocket,
        portId: connector.portId,
        fromNode: source,
        startX: start.x,
        startY: start.y,
        x: point.x,
        y: point.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const edge = hitEdge(point, displayEdges, nodes, graphScaleRef.current);
    if (edge) {
      setHoverEdgeId(null);
      commitGroup({
        ...editableGroup,
        edges: (editableGroup.edges ?? []).filter(
          (item) => item.id !== edge.id,
        ),
      });
      return;
    }
    const node = bodyNode;
    if (!node) {
      setSelectedNodeIds([]);
      setHoverEdgeId(null);
      dragRef.current = {
        kind: "marquee",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: point.x,
        startY: point.y,
        x: point.x,
        y: point.y,
        shiftKey: event.shiftKey,
        active: false,
        scale: graphScaleRef.current,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    setSelectedNodeIds(
      event.shiftKey
        ? selectedNodeIds.includes(node.id)
          ? selectedNodeIds.filter((id) => id !== node.id)
          : [...selectedNodeIds, node.id]
        : [node.id],
    );
    setHoverEdgeId(null);
    dragRef.current = {
      kind: "node",
      nodeId: node.id,
      nodeKind: node.kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: node.x,
      startY: node.y,
      nodeStartPositions: { [node.id]: { x: node.x, y: node.y } },
    };
    previewPositionsRef.current = { [node.id]: { x: node.x, y: node.y } };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "node" && previewPositionsRef.current?.[drag.nodeId]) {
      const position = previewPositionsRef.current[drag.nodeId];
      previewPositionsRef.current = null;
      const moved = hasNodeDragMoved(drag, position);
      if (moved) setSelectedNodeIds([]);
      const view = getGroupViewData();
      commitGroup({
        ...editableGroup,
        nodes: {
          ...editableGroup.nodes,
          [drag.nodeId]: {
            x: position.x - view.layout.offsetX / gridSize,
            y: position.y - view.layout.offsetY / gridSize,
          },
        },
      });
    }
    if (drag?.kind === "edge") {
      const point = canvasPoint(event, viewportRef.current);
      const view = getGroupViewData();
      const target = getGraphEdgeDrop(
        point,
        drag,
        view.nodes,
        graphScaleRef.current,
        view.displayGraph,
        [],
      );
      if (target && target.nodeId !== drag.fromNodeId) {
        const edge = createEdge(
          drag.fromNodeId,
          target.fromPort,
          target.nodeId,
          target.toPort,
        );
        commitGroup({
          ...editableGroup,
          edges: filterPermittedEdges(
            [...view.displayEdges.filter((item) => item.id !== edge.id), edge],
            view.nodes,
          ),
        });
      } else if (
        hasGraphEdgeDropTarget(point, drag, view.nodes, graphScaleRef.current)
      ) {
        toast.error(
          getGraphEdgeDropError(
            point,
            drag,
            view.nodes,
            graphScaleRef.current,
          ) ?? "Incompatible effect graph connection.",
        );
      }
    }
    if (drag?.kind === "marquee" && drag.active) {
      const view = getGroupViewData();
      setSelectedNodeIds(
        getMarqueeSelectionPreviewIds(drag, view.nodes, selectedNodeIds),
      );
    }
    updateHover(null, null);
    setHoverEdgeId(null);
  };
  const drawGroupCanvas = () => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const view = getGroupViewData();
    const edgeDrag = dragRef.current?.kind === "edge" ? dragRef.current : null;
    const marqueeDrag =
      dragRef.current?.kind === "marquee" ? dragRef.current : null;
    const marqueeSelectedNodeIds = marqueeDrag?.active
      ? getMarqueeSelectionPreviewIds(marqueeDrag, view.nodes, selectedNodeIds)
      : selectedNodeIds;
    drawGraphCanvas({
      canvas,
      viewport,
      width: Math.max(1, viewport.clientWidth),
      height: Math.max(1, viewport.clientHeight),
      scale: graphScale,
      nodes: view.nodes,
      edges: view.displayEdges,
      hoverNodeId,
      selectedNodeIds: marqueeSelectedNodeIds,
      hoverConnector,
      hoverEdgeId,
      edgeDrag,
      previewPoint: edgeDrag ? { x: edgeDrag.x, y: edgeDrag.y } : null,
      ...getGraphPlaybackDrawSemantics({
        graph: view.displayGraph,
        nodes: view.nodes,
        contextNodes: view.contextNodes,
        objects,
        currentTime,
      }),
      marqueeRect: marqueeDrag?.active
        ? normalizeMarqueeRect(marqueeDrag)
        : null,
    });
  };

  const centerGroupGraph = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const bounds = getGraphNodesBounds(getGroupViewData().nodes);
    if (!bounds) return;
    viewport.scrollLeft = Math.max(
      0,
      Math.round(
        (bounds.x + bounds.width / 2) * graphScaleRef.current -
          viewport.clientWidth / 2,
      ),
    );
    viewport.scrollTop = Math.max(
      0,
      Math.round(
        (bounds.y + bounds.height / 2) * graphScaleRef.current -
          viewport.clientHeight / 2,
      ),
    );
    drawGroupCanvas();
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const layout = layoutRef.current;
    if (!viewport || !layout || layout.groupId !== groupId) return;
    requestAnimationFrame(() => {
      centerGroupGraph();
    });
  }, [groupId]);
  useLayoutEffect(() => {
    drawGroupCanvas();
  });
  return (
    <GraphCanvasSurface
      canvasRef={canvasRef}
      viewportRef={viewportRef}
      scrollWidth={layout.scrollWidth * graphScale}
      scrollHeight={layout.scrollHeight * graphScale}
      hoverNodeId={hoverNodeId}
      hoverEdgeId={hoverEdgeId}
      className="clipper-hidden-scrollbar relative h-full min-w-0 overflow-auto bg-[#0b0f16]"
      onScroll={drawGroupCanvas}
      onWheel={onGroupWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        clearGraphDragState(
          dragRef,
          previewPositionsRef,
          updateHover,
          setHoverEdgeId,
        );
      }}
      onPointerLeave={() => {
        updateHover(null, null);
        setHoverEdgeId(null);
      }}
    />
  );
}

export function getPopoverDetails(
  node: GraphNode,
  parameters?: Record<string, string>,
) {
  if (node.kind === "group" || node.kind === "out") return [];
  if (node.kind === "time") {
    return Object.entries(timeParameterDefaults).map(
      ([key, value]) =>
        [key, parameters?.[key] ?? node.details?.[key] ?? value] as [
          string,
          string,
        ],
    );
  }
  if (node.kind === "split") {
    return Object.entries(splitParameterDefaults).map(
      ([key, value]) =>
        [key, parameters?.[key] ?? node.details?.[key] ?? value] as [
          string,
          string,
        ],
    );
  }
  if (node.kind === "condition") {
    return Object.entries(conditionParameterDefaults).map(
      ([key, value]) =>
        [key, parameters?.[key] ?? node.details?.[key] ?? value] as [
          string,
          string,
        ],
    );
  }
  if (node.kind === "oscillate") {
    return Object.entries(node.details ?? {}).map(
      ([key, value]) => [key, parameters?.[key] ?? value] as [string, string],
    );
  }
  const defaults =
    node.kind === "effect"
      ? getAnimationValueDetails(node)
      : Object.entries(node.details ?? {})
          .filter(
            ([key]) => !["type", "source", "property", "effect"].includes(key),
          )
          .slice(0, 5);
  return defaults.map(
    ([key, value]) => [key, parameters?.[key] ?? value] as [string, string],
  );
}

function getParameterEditorSchema(
  node: GraphNode,
  details: Array<[string, string]>,
  edges: readonly AnimationGraphEdge[] = [],
): GraphParameterEditorSchema {
  const strictSchema = getStrictComposition2dParameterEditorSchema(node, edges);
  if (strictSchema) return strictSchema;
  const definition =
    node.kind === "effect"
      ? getAnimationDefinition(node.details?.property)
      : undefined;
  if (definition) {
    const values = Object.fromEntries(details);
    const calculatedHeight = getParameterEditorEstimatedHeight(
      definition.fieldGroups,
    );
    return {
      width: definition.popover?.width ?? 210,
      height: Math.max(definition.popover?.height ?? 0, calculatedHeight),
      groups: definition.fieldGroups.map((group) => ({
        id: group.id,
        label: group.label,
        columns: group.columns,
        fields: group.fields.map((field) => ({
          key: field.key,
          label: field.label,
          value: values[field.key] ?? field.defaultValue,
          unit: getGraphParameterUnit(field.key),
          min: field.min,
          max: field.max,
          step: field.step,
          options: graphParameterOptions[field.key],
        })),
      })),
    };
  }

  if (node.kind === "condition") {
    const values =
      node.typedNode?.kind === "condition"
        ? strictConditionConfigToEditorValues(
            normalizeStrictConditionEditorConfig(node.typedNode.config),
          )
        : Object.fromEntries(details);
    const outputOptions = getConditionOutputOptions(node, edges);
    const count = Math.min(
      4,
      Math.max(1, Number.parseInt(values.conditionCount ?? "1", 10) || 1),
    );
    const ruleGroups = Array.from({ length: count }, (_, index) => {
      const suffix = index === 0 ? "" : String(index + 1);
      const action = values[`action${suffix}`] ?? "setDelay";
      return {
        id: `condition-rule-${index + 1}`,
        label: `Condition ${index + 1}`,
        fields: [
          {
            key: `matchType${suffix}`,
            label: "matchType",
            value: values[`matchType${suffix}`] ?? "textEquals",
            options: graphParameterOptions.matchType,
          },
          {
            key: `value${suffix}`,
            label: "value",
            value: values[`value${suffix}`] ?? "",
            type: "text" as const,
          },
          {
            key: `action${suffix}`,
            label: "action",
            value: action,
            options: graphParameterOptions.action,
          },
          ...(action === "setDelay"
            ? [
                {
                  key: `delay${suffix}`,
                  label: "delay",
                  value: values[`delay${suffix}`] ?? "0s",
                  type: "number" as const,
                  unit: "s",
                  min: 0,
                  max: 120,
                  step: 0.1,
                },
              ]
            : [
                {
                  key: `outputPort${suffix}`,
                  label: "output",
                  value:
                    values[`outputPort${suffix}`] ??
                    outputOptions[Math.min(index, outputOptions.length - 1)]
                      ?.value ??
                    "",
                  options: outputOptions,
                },
              ]),
          ...(index > 0
            ? [
                {
                  key: "__deleteCondition",
                  label: "Trash",
                  value: String(index + 1),
                  type: "button" as const,
                },
              ]
            : []),
        ],
      };
    });
    return {
      width: 240,
      height: 96 + count * 232,
      groups: [
        ...ruleGroups,
        ...(count < 4
          ? [
              {
                id: "condition-add",
                fields: [
                  {
                    key: "conditionCount",
                    label: "+ Add condition",
                    value: String(count + 1),
                    type: "button" as const,
                  },
                ],
              },
            ]
          : []),
      ],
    };
  }
  if (node.kind === "oscillate")
    return {
      width: 220,
      height: 128,
      groups: [
        {
          id: "osc",
          fields: [
            {
              key: "amount",
              label: "amount",
              value: Object.fromEntries(details).amount ?? "1",
              type: "number",
              min: -1000,
              max: 1000,
              step: 0.1,
            },
            {
              key: "speed",
              label: "speed",
              value: Object.fromEntries(details).speed ?? "1",
              type: "number",
              min: -20,
              max: 20,
              step: 0.1,
            },
          ],
        },
      ],
    };

  return {
    width: 210,
    height: 56 + details.length * 34,
    groups: [
      {
        id: "parameters",
        fields: details.map(([key, value]) => ({
          key,
          label: key,
          value,
          unit: getGraphParameterUnit(key),
          ...getFallbackGraphNumberFieldBounds(key),
          options: graphParameterOptions[key],
        })),
      },
    ],
  };
}

function getParameterEditorEstimatedHeight(
  groups: readonly AnimationControllerFieldGroup[],
) {
  const hasSectionLabels = groups.some((group) => group.label);
  if (!hasSectionLabels) {
    const fieldCount = groups.reduce(
      (count, group) => count + group.fields.length,
      0,
    );
    return 56 + fieldCount * 34;
  }
  return (
    72 +
    groups.reduce((height, group) => {
      const columns = Math.max(1, group.columns ?? 1);
      const rows = Math.ceil(group.fields.length / columns);
      return height + (group.label ? 22 : 0) + rows * 58 + 16;
    }, 0)
  );
}

export function getGraphNodeParameterEditorSchema(
  node: GraphNode,
  parameters?: Record<string, string>,
  edges: readonly AnimationGraphEdge[] = [],
) {
  const strictSchema = getStrictComposition2dParameterEditorSchema(node, edges);
  if (strictSchema) return strictSchema;
  const details = getPopoverDetails(node, parameters);
  if (details.length === 0) return null;
  return getParameterEditorSchema(node, details, edges);
}

function getGraphParameterUnit(key: string) {
  return key === "delay" || key === "duration" || key === "stagger"
    ? "s"
    : undefined;
}

function getFallbackGraphNumberFieldBounds(key: string) {
  if (key === "delay") return { min: 0, max: 120, step: 0.1 };
  if (key === "duration") return { min: 0.01, max: 120, step: 0.1 };
  if (key === "stagger") return { min: 0, max: 60, step: 0.05 };
  if (key === "repeat") return { min: 0, max: 999, step: 1 };
  if (key === "edge0" || key === "edge1" || key === "factor")
    return { min: 0, max: 1, step: 0.01 };
  if (key === "amount") return { min: -1000, max: 1000, step: 0.1 };
  if (key === "speed") return { min: -20, max: 20, step: 0.1 };
  return undefined;
}

function getGraphNodeColors(kind: GraphNode["kind"]) {
  if (kind === "effect")
    return {
      background: nodeColors.animationBg,
      border: nodeColors.animationBorder,
    };
  if (kind === "time")
    return { background: nodeColors.timeBg, border: nodeColors.timeBorder };
  if (kind === "oscillate")
    return { background: nodeColors.timeBg, border: nodeColors.timeBorder };
  if (kind === "split")
    return { background: nodeColors.splitBg, border: nodeColors.splitBorder };
  if (kind === "condition")
    return { background: nodeColors.splitBg, border: nodeColors.splitBorder };
  if (kind === "group")
    return { background: nodeColors.groupBg, border: nodeColors.groupBorder };
  if (kind === "out")
    return { background: nodeColors.outBg, border: nodeColors.outBorder };
  return { background: nodeColors.layerBg, border: nodeColors.layerBorder };
}

function getAnimationValueDetails(node: GraphNode) {
  const property = node.details?.property;
  const definition = getAnimationDefinition(property);
  if (definition)
    return definition.fieldGroups.flatMap((group) =>
      group.fields.map(
        (field) =>
          [field.key, node.details?.[field.key] ?? field.defaultValue] as [
            string,
            string,
          ],
      ),
    );
  if (property)
    return [
      ["from", node.details?.from ?? "0"],
      ["to", node.details?.to ?? "0"],
    ];
  return [];
}

function formatEase(ease: LayerAnimation["options"]["ease"]) {
  return Array.isArray(ease) ? "custom" : (ease ?? "linear");
}
function roundGraphNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}
function formatSeconds(value: number) {
  return `${roundGraphNumber(value)}s`;
}
