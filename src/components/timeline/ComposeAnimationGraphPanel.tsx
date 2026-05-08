import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import type { ContextMenuState } from "../../app/types";
import { getComposition3dPackage } from "../../core/composition3dPackages";
import {
  animationDefinitions,
  getAnimationDefinition,
  getAnimationDefinitionCategories,
} from "../../core/animations/registry";
import { addAnimationGraphPresetGroupToGraph, animationGraphPresets } from "../../core/animations/presets";
import { roundTenth } from "../../core/math";
import { formatTime, getTimelineTicks } from "../../core/timeline";
import { canConnectSocketTypes, getComposition3dNodeKindFromPackageId, getComposition3dSocketDefinition, graphSocketColors, type GraphCompositionMode, type SocketType } from "../../core/graphSockets";
import type {
  AnimationGraphCustomNode,
  AnimationGraphEdge,
  AnimationGraphGroup,
  AnimationGraphPort,
  AnimationGraphState,
  FrameObject,
  LayerAnimation,
  Part,
} from "../../core/types";
import { AppContextMenu } from "../AppContextMenu";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { TimelineViewportState } from "../../core/types";
import { composition3dPackagePointerDragEvent, type Composition3dPackagePointerDragDetail } from "../../lib/pointerDrag";
import {
  GraphParameterEditor,
  type GraphParameterEditorSchema,
} from "./GraphParameterEditor";
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
    options?: { implicit?: boolean },
  ) => void;
  onInspectComposition3dNode?: (nodeId: string | null) => void;
};

export type GraphNode = {
  id: string;
  label: string;
  kind: "layer" | "animation" | "time" | "group" | "out";
  x: number;
  y: number;
  width: number;
  height: number;
  details?: Record<string, string>;
};
type CustomNodeKind = "time" | (typeof animationDefinitions)[number]["property"];
type HoverConnector = {
  nodeId: string;
  port: AnimationGraphPort;
  point: { x: number; y: number };
};
type DragState =
  | {
      kind: "node";
      nodeId: string;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
    }
  | {
      kind: "edge";
      fromNodeId: string;
      fromPort: AnimationGraphPort;
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
type EdgeRegistrationDialogState = {
  edgeId?: string;
  draft?: AnimationGraphEdge;
};
type Composition3dSocketOption = {
  id: string;
  label: string;
  socket: SocketType;
};
type Composition3dConnectorOption = {
  value: string;
  label: string;
  fromSocket: string;
  toSocket: string;
  compatible: boolean;
};
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
const connectorHoverRadius = 26;
const connectorHitRadius = 26;
const marqueeThreshold = 4;
const nodeColors = {
  animationBg: "#382234",
  animationBorder: "#8a557b",
  timeBg: "#1b3143",
  timeBorder: "#7ea8d8",
  layerBg: "#252b35",
  layerBorder: "#566171",
  groupBg: "#3a2315",
  groupBorder: "#9c6232",
  outBg: "#28303a",
  outBorder: "#9aa4b2",
  hoverBorder: "#a8b0bd",
  port: "#b8c0cc",
  text: "#d9dee8",
};
const minGraphScale = 0.35;
const maxGraphScale = 2.5;
const groupPopupWidth = 560;
const groupPopupHeight = 360;
const groupGraphPadding = 120;
const groupSubgraphZoomEnabled = false;
const graphParameterOptions: Record<string, readonly { value: string; label: string }[]> = {
  ease: [
    { value: "linear", label: "Linear" },
    { value: "easeIn", label: "Ease in" },
    { value: "easeOut", label: "Ease out" },
    { value: "easeInOut", label: "Ease in-out" },
    { value: "circOut", label: "Circ out" },
    { value: "backOut", label: "Back out" },
  ],
  repeatType: [
    { value: "loop", label: "Loop" },
    { value: "reverse", label: "Reverse" },
    { value: "mirror", label: "Mirror" },
  ],
};
const timeParameterDefaults = {
  delay: "0s",
  duration: "1s",
  ease: "linear",
  repeat: "0",
  repeatType: "loop",
} satisfies Record<string, string>;

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
  graph: AnimationGraphState | undefined,
  setHover: (nodeId: string | null, port: HoverConnector | null) => void,
  setHoverEdge: (edgeId: string | null) => void,
  edges: AnimationGraphEdge[],
) {
  const hoveredNode = hitNode(point, nodes, scale);
  const connectorNode = hoveredNode ?? hitNodeLoose(point, nodes, scale) ?? null;
  const connector = connectorNode ? getNodeHoverConnector(point, connectorNode, scale) : null;
  setHover(hoveredNode?.id ?? null, connector);
  setHoverEdge(connector ? null : (hitEdge(point, edges, nodes, scale)?.id ?? null));
}

function clearGraphDragState(
  dragRef: RefObject<DragState | null>,
  previewPositionsRef: RefObject<Record<string, { x: number; y: number }> | null>,
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
  return getEdgeDropTarget(point, drag.fromNodeId, nodes, scale, graph, objects, mode);
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

function hasNodeDragMoved(drag: Extract<DragState, { kind: "node" }>, position: { x: number; y: number }) {
  return Math.abs(position.x - drag.startX) > 0.08 || Math.abs(position.y - drag.startY) > 0.08;
}

function getGroupGraphScrollLayout(nodes: GraphNode[], width: number, height: number) {
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
  if (!rects.length || !Number.isFinite(bounds.left)) {
    return { offsetX: 0, offsetY: 0, scrollWidth: width, scrollHeight: height, scrollLeft: 0, scrollTop: 0 };
  }
  const graphWidth = bounds.right - bounds.left;
  const graphHeight = bounds.bottom - bounds.top;
  const offsetX = Math.max(0, groupGraphPadding - bounds.left);
  const offsetY = Math.max(0, groupGraphPadding - bounds.top);
  const outNode = nodes.find((node) => node.kind === "out");
  const targetRect = outNode ? nodeRect(outNode) : { x: bounds.left, y: bounds.top, width: graphWidth, height: graphHeight };
  const scrollWidth = Math.max(width, bounds.right + offsetX + groupGraphPadding);
  const scrollHeight = Math.max(height, bounds.bottom + offsetY + groupGraphPadding);
  return {
    offsetX,
    offsetY,
    scrollWidth,
    scrollHeight,
    scrollLeft: Math.max(0, targetRect.x + offsetX + targetRect.width / 2 - width / 2),
    scrollTop: Math.max(0, targetRect.y + offsetY + targetRect.height / 2 - height / 2),
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
    onExitCompose,
    onScrub,
    onScrubEnd,
    onScrubStart,
    onUpdateGraph,
    onInspectComposition3dNode,
  }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const graphViewportRef = useRef<HTMLDivElement | null>(null);
    const rulerRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const pointerRef = useRef({ x: 0, y: 0 });
    const contextMenuPointRef = useRef<GraphContextMenuPoint | null>(null);
    const previewPositionsRef = useRef<Record<
      string,
      { x: number; y: number }
    > | null>(null);
    const suppressNextGraphClickRef = useRef(false);
    const pendingPopoverNodeIdRef = useRef<string | null>(null);
    const frameRef = useRef<number | null>(null);
    const activationFrameRef = useRef<number | null>(null);
    const playbackFrameRef = useRef<number | null>(null);
    const currentTimeRef = useRef(currentTime);
    const partRef = useRef<Part | null>(null);
    const projectGraphRef = useRef<AnimationGraphState | undefined>(undefined);
    const graphRef = useRef<AnimationGraphState | undefined>(undefined);
    const displayGraphRef = useRef<AnimationGraphState | undefined>(undefined);
    const nodesRef = useRef<GraphNode[]>([]);
    const selectedObjectsRef = useRef<FrameObject[]>([]);
    const viewInitializedRef = useRef(false);
    const hoverNodeIdRef = useRef<string | null>(null);
    const hoverConnectorRef = useRef<HoverConnector | null>(null);
    const hoverEdgeIdRef = useRef<string | null>(null);
    const [selectedGraphNodeIds, setSelectedGraphNodeIds] = useState<string[]>([]);
    const selectedGraphNodeIdsRef = useRef<string[]>([]);
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
    const [hoverConnector, setHoverConnector] = useState<HoverConnector | null>(
      null,
    );
    const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
    const [optimisticGraph, setOptimisticGraph] =
      useState<AnimationGraphState | null>(null);
    const [popoverNodeId, setPopoverNodeId] = useState<string | null>(null);
    const [renamingGroupNodeId, setRenamingGroupNodeId] = useState<string | null>(null);
    const popoverNodeIdRef = useRef<string | null>(null);
    const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<
      string | null
    >(null);
    const selectedGraphNodeIdRef = useRef<string | null>(null);
    const deleteSelectedNodesRef = useRef<() => void>(() => undefined);
    const copySelectedNodesRef = useRef<() => void>(() => undefined);
    const pasteGraphNodesRef = useRef<() => void>(() => undefined);
    const graphClipboardRef = useRef<GraphClipboard | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
    const [edgeRegistrationDialog, setEdgeRegistrationDialog] = useState<EdgeRegistrationDialogState | null>(null);
    const [graphScale, setGraphScale] = useState(1);
    const graphScaleRef = useRef(1);
    const timelineDuration = Math.max(part?.duration ?? 0.1, 0.1);
    const ticks = useMemo(
      () => getTimelineTicks(timelineDuration),
      [timelineDuration],
    );
    const baseGraphWorldWidth = 5200;
    const baseGraphWorldHeight = 900;
    const playheadLeft =
      timelineDuration > 0
        ? `${(currentTime / timelineDuration) * 100}%`
        : "0%";
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
    const isComposition3d = part?.renderMode === "webgl";
    const projectGraph = isComposition3d ? part?.composition3dGraph : part?.animationGraph;
    const graph = optimisticGraph ?? projectGraph;
    const selectableObjects = [
      ...(part?.background.elements ?? []),
      ...(part?.objects ?? []),
    ];
    const selectedObjects = selectedObjectIds
      .map((id) => selectableObjects.find((object) => object.id === id))
      .filter((object): object is FrameObject => Boolean(object));
    const graphViewportKey =
      selectedObjectIds.length > 0 ? selectedObjectIds.join("|") : "__empty__";
    const graphInstanceKey = `${part?.id ?? "__none__"}:${isComposition3d ? "composition3d" : "composition2d"}:${graphViewportKey}`;
    const hasSelectedGraph = isComposition3d || selectedObjects.length > 0;
    const nodes = hasSelectedGraph
      ? (isComposition3d ? buildComposition3dGraphNodes(graph, baseGraphWorldWidth, baseGraphWorldHeight) : buildGraphNodes(
          selectedObjects,
          graph,
          baseGraphWorldWidth,
          baseGraphWorldHeight,
          graphViewportKey,
        ))
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
      .map((node) => `${node.id}:${node.x},${node.y},${node.width},${node.height}`)
      .join("|");
    partRef.current = part;
    graphRef.current = graph;
    displayGraphRef.current = graph;
    nodesRef.current = nodes;
    selectedObjectsRef.current = selectedObjects;
    selectedGraphNodeIdRef.current = selectedGraphNodeId;
    selectedGraphNodeIdsRef.current = selectedGraphNodeIds;
    popoverNodeIdRef.current = popoverNodeId;
    deleteSelectedNodesRef.current = deleteSelectedNodes;
    copySelectedNodesRef.current = copySelectedNodes;
    pasteGraphNodesRef.current = pasteGraphNodes;

    useLayoutEffect(() => {
      setOptimisticGraph(null);
      viewInitializedRef.current = false;
      selectedGraphNodeIdRef.current = null;
      setSelectedGraphNodeId(null);
      onInspectComposition3dNode?.(null);
      graphScaleRef.current = 1;
      setGraphScale(1);
    }, [graphInstanceKey]);

    useEffect(() => {
      function onKeyDown(event: KeyboardEvent) {
        if (event.defaultPrevented) return;
        if (
          isEditableKeyboardTarget(event.target) ||
          isEditableKeyboardTarget(document.activeElement)
        )
          return;
        const modifier = event.metaKey || event.ctrlKey;
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
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (!selectedGraphNodeIdsRef.current.some((id) => isCustomGraphNode(id, displayGraphRef.current))) return;
        event.preventDefault();
        deleteSelectedNodesRef.current();
      }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(
      () => () => {
        if (activationFrameRef.current !== null)
          cancelAnimationFrame(activationFrameRef.current);
      },
      [],
    );

    useEffect(() => {
      if (!optimisticGraph || !projectGraph) {
        projectGraphRef.current = projectGraph;
        return;
      }
      const projectGraphChanged = projectGraphRef.current !== projectGraph;
      if (
        projectGraphChanged ||
        JSON.stringify(optimisticGraph) === JSON.stringify(projectGraph)
      )
        setOptimisticGraph(null);
      projectGraphRef.current = projectGraph;
    }, [optimisticGraph, projectGraph]);

    useLayoutEffect(() => {
      draw();
    }, [graphCanvasHeight, graphCanvasWidth, graphScale]);

    useEffect(() => {
      currentTimeRef.current = currentTime;
      if (active) scheduleDraw();
    }, [active, currentTime]);

    useEffect(() => {
      if (!active || !isPlaying) return;
      function tick() {
        currentTimeRef.current = readPlaybackPlayheadTime() ?? currentTimeRef.current;
        draw();
        playbackFrameRef.current = requestAnimationFrame(tick);
      }
      playbackFrameRef.current = requestAnimationFrame(tick);
      return () => {
        if (playbackFrameRef.current !== null) cancelAnimationFrame(playbackFrameRef.current);
        playbackFrameRef.current = null;
      };
    }, [active, isPlaying, timelineDuration]);

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
    }, [active, hasSelectedGraph, nodeLayoutKey, graphCanvasHeight, graphCanvasWidth]);

    useEffect(() => {
      const viewport = graphViewportRef.current;
      if (!viewport || !active) return;
      const resizeObserver = new ResizeObserver(() => scheduleActivationDraws());
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
      if (isComposition3d) {
        viewport.scrollLeft = Math.max(0, (graphScrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = Math.max(0, (graphScrollHeight - viewport.clientHeight) / 2);
        scheduleDraw();
        viewInitializedRef.current = true;
        return;
      }
      const selectedObjectId = selectedObjects[0]?.id;
      if (!selectedObjectId || !nodesRef.current.some((node) => node.id === `layer:${selectedObjectId}`)) return;
      centerGraphOnSelectedLayer(viewport);
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
        selectedGraphNodeId,
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
        activationFrameRef.current = remaining > 0 ? requestAnimationFrame(tick) : null;
      };
      activationFrameRef.current = requestAnimationFrame(tick);
    }

    function readPlaybackPlayheadTime() {
      const playhead = playbackPlayheadRef.current;
      if (!playhead || timelineDuration <= 0) return null;
      const value = playhead.style.getPropertyValue("--clipper-playhead-left");
      if (!value.endsWith("%")) return null;
      const percent = Number.parseFloat(value);
      if (!Number.isFinite(percent)) return null;
      return Math.min(Math.max((percent / 100) * timelineDuration, 0), timelineDuration);
    }

    function onGraphScroll() {
      scheduleDraw();
    }

    useEffect(() => {
      if (!isComposition3d || !active) return;
      function onPackagePointerDrag(event: Event) {
        const detail = (event as CustomEvent<Composition3dPackagePointerDragDetail>).detail;
        if (!detail || detail.phase !== "drop") return;
        const viewport = graphViewportRef.current;
        if (!viewport) return;
        const rect = viewport.getBoundingClientRect();
        if (detail.clientX < rect.left || detail.clientX > rect.right || detail.clientY < rect.top || detail.clientY > rect.bottom) return;
        dropComposition3dPackage(detail.packageId, detail.clientX - rect.left + viewport.scrollLeft, detail.clientY - rect.top + viewport.scrollTop);
      }
      window.addEventListener(composition3dPackagePointerDragEvent, onPackagePointerDrag);
      return () => window.removeEventListener(composition3dPackagePointerDragEvent, onPackagePointerDrag);
    }, [active, isComposition3d, graphScale]);

    function draw() {
      const canvas = canvasRef.current;
      const viewport = graphViewportRef.current;
      if (!canvas || !viewport) return;
      const scaledWidth = Math.max(1, viewport.clientWidth);
      const scaledHeight = Math.max(1, viewport.clientHeight);
      const currentPart = partRef.current;
      const currentSelectedObjects = selectedObjectsRef.current;
      if (!currentPart) return;
      if (!isComposition3d && currentSelectedObjects.length === 0) {
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
      const currentGraph = displayGraphRef.current;
      const currentNodes = nodesRef.current;
      const drawNodes = currentNodes.map((node) => ({
        ...node,
        label: node.id === renamingGroupNodeId ? "" : node.label,
        ...(previewPositionsRef.current?.[node.id] ?? {}),
      }));
      const edgeDrag =
        dragRef.current?.kind === "edge" ? dragRef.current : null;
      const marqueeDrag = dragRef.current?.kind === "marquee" ? dragRef.current : null;
      const marqueeSelectedNodeIds = marqueeDrag?.active
        ? getMarqueeSelectionPreviewIds(marqueeDrag, drawNodes, selectedGraphNodeIdsRef.current)
        : selectedGraphNodeIdsRef.current;
      drawGraphCanvas({
        canvas,
        viewport,
        width: scaledWidth,
        height: scaledHeight,
        scale: graphScaleRef.current,
        nodes: drawNodes,
        edges: getRenderableEdges(currentGraph, drawNodes, currentSelectedObjects),
        hoverNodeId: hoverNodeIdRef.current,
        selectedNodeIds: marqueeSelectedNodeIds,
        hoverConnector: hoverConnectorRef.current,
        hoverEdgeId: hoverEdgeIdRef.current,
        edgeDrag,
        previewPoint: edgeDrag
          ? { x: pointerRef.current.x / graphScaleRef.current, y: pointerRef.current.y / graphScaleRef.current }
          : null,
        progressForNode: (node) =>
          isComposition3d ? null : getNodePlaybackProgress(node, currentGraph, currentTimeRef.current, drawNodes, currentSelectedObjects),
        marqueeRect: marqueeDrag?.active ? normalizeMarqueeRect(marqueeDrag) : null,
      });
    }

    function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
      const point = canvasPoint(event, graphViewportRef.current);
      pointerRef.current = point;
      const drag = dragRef.current;
      if (drag?.kind === "node") {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        updateHoverEdge(null);
        const position = getDraggedGraphNodePosition(event, drag, graphScale);
        previewPositionsRef.current = {
          ...(previewPositionsRef.current ?? {}),
          [drag.nodeId]: position,
        };
        scheduleDraw();
        return;
      }
      if (drag?.kind === "edge") {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        updateHoverEdge(null);
        drag.x = point.x;
        drag.y = point.y;
        const target = getGraphEdgeDrop(
          point,
          drag,
          nodesRef.current,
          graphScale,
          displayGraphRef.current,
          selectedObjects,
          isComposition3d ? "composition3d" : "composition2d",
        );
        updateHover(target?.nodeId ?? null, null);
        scheduleDraw();
        return;
      }
      if (drag?.kind === "marquee") {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        updateHover(null, null);
        updateHoverEdge(null);
        drag.x = point.x;
        drag.y = point.y;
        if (!drag.active && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > marqueeThreshold) drag.active = true;
        scheduleDraw();
        return;
      }
      updateGraphHoverState(
        point,
        nodesRef.current,
        graphScale,
        displayGraphRef.current,
        updateHover,
        updateHoverEdge,
        getRenderableEdges(displayGraphRef.current, nodesRef.current, selectedObjects),
      );
    }

    function getDraggedComposition3dPackage(event: DragEvent<HTMLElement>) {
      return event.dataTransfer.getData("application/x-clipper-composition3d-package") || event.dataTransfer.getData("text/plain");
    }

    function onComposition3dDragOver(event: DragEvent<HTMLElement>) {
      if (!isComposition3d || !getComposition3dPackage(getDraggedComposition3dPackage(event))) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }

    function onComposition3dDrop(event: DragEvent<HTMLElement>) {
      const packageId = getDraggedComposition3dPackage(event);
      if (!isComposition3d || !getComposition3dPackage(packageId)) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      dropComposition3dPackage(packageId, event.clientX - rect.left + event.currentTarget.scrollLeft, event.clientY - rect.top + event.currentTarget.scrollTop);
    }

    function dropComposition3dPackage(packageId: string, canvasX: number, canvasY: number) {
      const pkg = getComposition3dPackage(packageId);
      if (!pkg) return;
      const id = `${packageId}:${Date.now().toString(36)}`;
      const position = { x: Math.max(1, Math.round(canvasX / graphScaleRef.current / gridSize)), y: Math.max(1, Math.round(canvasY / graphScaleRef.current / gridSize)) };
      commitGraphUpdate((graph) => ({
        nodes: { ...materializeGraphNodes(nodesRef.current), ...(graph?.nodes ?? {}), [id]: position, "composition3d:out": { x: Math.round(baseGraphWorldWidth / gridSize / 2), y: Math.round(baseGraphWorldHeight / gridSize / 2) } },
        edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
        customNodes: { ...(graph?.customNodes ?? {}), [id]: { kind: "animation", label: pkg.label, scopeKey: "composition3d", details: { packageId: pkg.id } } },
        groups: graph?.groups,
        parameters: graph?.parameters,
        deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
      }));
      selectGraphNode(id);
    }

    function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      const point = canvasPoint(event, graphViewportRef.current);
      const bodyNode = hitNode(point, nodesRef.current, graphScale);
      const connector = bodyNode
        ? null
        : getActiveHoverConnector(
            point,
            nodesRef.current,
            graphScale,
            hoverConnectorRef.current,
          ) ??
          hitHoverConnector(
            point,
            nodesRef.current,
            graphScale,
            hoverConnectorRef.current,
          );
      if (connector) {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        updateHoverEdge(null);
        selectGraphNode(connector.nodeId);
        const sourceNode = nodesRef.current.find(
          (node) => node.id === connector.nodeId,
        );
        const start = sourceNode ? nodeCenter(sourceNode) : connector.point;
        dragRef.current = {
          kind: "edge",
          fromNodeId: connector.nodeId,
          fromPort: connector.port,
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
        getRenderableEdges(displayGraphRef.current, nodesRef.current, selectedObjects),
        nodesRef.current,
        graphScale,
      );
      if (edge) {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        selectGraphNode(null);
        updateHoverEdge(null);
        if (isComposition3d) {
          setEdgeRegistrationDialog({ edgeId: edge.id });
          return;
        }
        commitGraphUpdate((graph) => ({
          nodes: {
            ...materializeGraphNodes(nodesRef.current),
            ...(graph?.nodes ?? {}),
          },
          edges: getRenderableEdges(
            graph,
            nodesRef.current,
            selectedObjects,
          ).filter((item) => item.id !== edge.id),
          customNodes: materializeGraphNodeDefinitions(
            nodesRef.current,
            graph?.customNodes,
            graphViewportKey,
          ),
          groups: graph?.groups,
          parameters: graph?.parameters,
          deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        }));
        scheduleDraw();
        return;
      }
      const node = bodyNode ?? hitNode(point, nodesRef.current, graphScale);
      if (!node) {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
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
      if (node.kind === "layer") {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        selectGraphNode(node.id);
        return;
      }
      if (node.details?.fixed === "true") {
        selectGraphNode(node.id);
        return;
      }
      if (event.shiftKey) {
        toggleGraphNodeSelection(node.id);
      } else {
        selectGraphNode(node.id);
      }
      const hasPopover = !isComposition3d && (
        node.kind === "group" ||
        getPopoverDetails(node, displayGraphRef.current?.parameters?.[node.id]).length > 0
      );
      pendingPopoverNodeIdRef.current = hasPopover ? node.id : null;
      setPopoverNodeId(null);
      dragRef.current = {
        kind: "node",
        nodeId: node.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: node.x,
        startY: node.y,
      };
      previewPositionsRef.current = { [node.id]: { x: node.x, y: node.y } };
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    function onClick(event: MouseEvent<HTMLCanvasElement>) {
      if (suppressNextGraphClickRef.current) {
        suppressNextGraphClickRef.current = false;
        return;
      }
      const point = canvasPoint(event, graphViewportRef.current);
      const node = hitNode(point, nodesRef.current, graphScale);
      if (node?.kind !== "group" || !node.details?.groupId) return;
      pendingPopoverNodeIdRef.current = null;
      setPopoverNodeId(null);
      selectGraphNode(node.id);
      setPopoverNodeId(node.id);
    }

    function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
      event.preventDefault();
      event.stopPropagation();
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.kind === "node" && previewPositionsRef.current?.[drag.nodeId]) {
        const position = previewPositionsRef.current[drag.nodeId];
        commitGraphUpdate((graph) => ({
          nodes: {
            ...materializeGraphNodes(nodesRef.current),
            ...(graph?.nodes ?? {}),
            [drag.nodeId]: position,
          },
          edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
          customNodes: materializeGraphNodeDefinitions(
            nodesRef.current,
            graph?.customNodes,
            graphViewportKey,
          ),
          groups: graph?.groups,
          parameters: graph?.parameters,
          deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        }));
        const moved = hasNodeDragMoved(drag, position);
        if (moved) {
          suppressNextGraphClickRef.current = true;
          selectGraphNode(null);
        }
        if (!moved) {
          const node = nodesRef.current.find((item) => item.id === drag.nodeId);
          if (!isComposition3d && pendingPopoverNodeIdRef.current === drag.nodeId) {
            setPopoverNodeId(drag.nodeId);
          }
        }
      }
      if (drag?.kind === "edge") {
        suppressNextGraphClickRef.current = true;
        const target = getGraphEdgeDrop(
          canvasPoint(event, graphViewportRef.current),
          drag,
          nodesRef.current,
          graphScale,
          displayGraphRef.current,
          selectedObjects,
          isComposition3d ? "composition3d" : "composition2d",
        );
        if (target && target.nodeId !== drag.fromNodeId) {
          const edge = createEdge(drag.fromNodeId, target.fromPort, target.nodeId, target.toPort);
          const currentEdges = filterPermittedEdges(
            getRenderableEdges(
              displayGraphRef.current,
              nodesRef.current,
              selectedObjects,
            ),
            nodesRef.current,
            isComposition3d ? "composition3d" : "composition2d",
          );
          commitGraphUpdate((graph) => ({
            nodes: {
              ...materializeGraphNodes(nodesRef.current),
              ...(graph?.nodes ?? {}),
            },
            edges: [
              ...currentEdges.filter((item) => item.id !== edge.id),
              edge,
            ],
            customNodes: materializeGraphNodeDefinitions(
              nodesRef.current,
              graph?.customNodes,
              graphViewportKey,
            ),
            groups: graph?.groups,
            parameters: graph?.parameters,
            deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
            viewport: graph?.viewport,
            viewports: graph?.viewports,
          }));
        }
      }
      if (drag?.kind === "marquee" && drag.active) {
        suppressNextGraphClickRef.current = true;
        applyMarqueeSelection(drag);
      }
      pendingPopoverNodeIdRef.current = null;
      previewPositionsRef.current = null;
      updateHover(null, null);
      updateHoverEdge(null);
      scheduleDraw();
    }

    function onPointerCancel() {
      clearGraphDragState(dragRef, previewPositionsRef, updateHover, updateHoverEdge);
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

    function selectGraphNode(nodeId: string | null) {
      selectedGraphNodeIdRef.current = nodeId;
      selectedGraphNodeIdsRef.current = nodeId ? [nodeId] : [];
      setSelectedGraphNodeId(nodeId);
      setSelectedGraphNodeIds(nodeId ? [nodeId] : []);
      onInspectComposition3dNode?.(isComposition3d ? nodeId : null);
      scheduleDraw();
    }

    function toggleGraphNodeSelection(nodeId: string) {
      const next = selectedGraphNodeIdsRef.current.includes(nodeId)
        ? selectedGraphNodeIdsRef.current.filter((id) => id !== nodeId)
        : [...selectedGraphNodeIdsRef.current, nodeId];
      selectedGraphNodeIdsRef.current = next;
      selectedGraphNodeIdRef.current = next[next.length - 1] ?? null;
      setSelectedGraphNodeIds(next);
      setSelectedGraphNodeId(next[next.length - 1] ?? null);
      onInspectComposition3dNode?.(isComposition3d ? next[next.length - 1] ?? null : null);
      scheduleDraw();
    }

    function setGraphNodeSelection(nodeIds: string[]) {
      selectedGraphNodeIdsRef.current = nodeIds;
      selectedGraphNodeIdRef.current = nodeIds[nodeIds.length - 1] ?? null;
      setSelectedGraphNodeIds(nodeIds);
      setSelectedGraphNodeId(nodeIds[nodeIds.length - 1] ?? null);
      onInspectComposition3dNode?.(isComposition3d ? nodeIds[nodeIds.length - 1] ?? null : null);
      scheduleDraw();
    }

    function applyMarqueeSelection(drag: Extract<DragState, { kind: "marquee" }>) {
      setGraphNodeSelection(getMarqueeSelectionPreviewIds(drag, nodesRef.current, selectedGraphNodeIdsRef.current));
    }

    function commitGraphUpdate(
      updater: (graph: AnimationGraphState | undefined) => AnimationGraphState,
      options: { local?: boolean; implicit?: boolean } = {},
    ) {
      const nextGraph = stripGraphViewportState(updater(graphRef.current));
      graphRef.current = nextGraph;
      nodesRef.current = isComposition3d
        ? buildComposition3dGraphNodes(nextGraph, graphWorldSize.width, graphWorldSize.height)
        : buildGraphNodes(
            selectedObjects,
            nextGraph,
            graphWorldSize.width,
            graphWorldSize.height,
            graphViewportKey,
          );
      if (options.local !== false) setOptimisticGraph(nextGraph);
      onUpdateGraph?.(() => nextGraph, { implicit: options.implicit });
    }

    function updateNodeParameter(nodeId: string, key: string, value: string) {
      commitGraphUpdate((graph) => ({
        nodes: {
          ...materializeGraphNodes(nodesRef.current),
          ...(graph?.nodes ?? {}),
        },
        edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
        customNodes: updateGraphNodeDefinitionParameter(materializeGraphNodeDefinitions(nodesRef.current, graph?.customNodes, graphViewportKey), nodeId, key, value),
        groups: graph?.groups,
        parameters: {
          ...(graph?.parameters ?? {}),
          [nodeId]: { ...(graph?.parameters?.[nodeId] ?? {}), [key]: value },
        },
        deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
    }

    function registerComposition3dEdge(edgeId: string, option: Composition3dConnectorOption) {
      commitGraphUpdate((graph) => {
        const existingEdges = getRenderableEdges(graph, nodesRef.current, selectedObjects);
        const draft = edgeRegistrationDialog?.draft;
        const source = draft ?? existingEdges.find((edge) => edge.id === edgeId);
        const registered = source
          ? createEdge(source.fromNodeId, source.fromPort, source.toNodeId, source.toPort, {
            fromSocket: option.fromSocket,
            toSocket: option.toSocket,
          })
          : null;
        const edges = registered
          ? [...existingEdges.filter((edge) => edge.id !== edgeId && edge.id !== registered.id), registered]
          : existingEdges;
        return {
          nodes: {
            ...materializeGraphNodes(nodesRef.current),
            ...(graph?.nodes ?? {}),
          },
          edges,
          customNodes: materializeGraphNodeDefinitions(nodesRef.current, graph?.customNodes, graphViewportKey),
          groups: graph?.groups,
          parameters: graph?.parameters,
          deletedNodeIds: undefined,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      setEdgeRegistrationDialog(null);
      scheduleDraw();
    }

    function deleteComposition3dEdge(edgeId: string) {
      commitGraphUpdate((graph) => ({
        nodes: {
          ...materializeGraphNodes(nodesRef.current),
          ...(graph?.nodes ?? {}),
        },
        edges: getRenderableEdges(graph, nodesRef.current, selectedObjects).filter((edge) => edge.id !== edgeId),
        customNodes: materializeGraphNodeDefinitions(nodesRef.current, graph?.customNodes, graphViewportKey),
        groups: graph?.groups,
        parameters: graph?.parameters,
        deletedNodeIds: undefined,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
      setEdgeRegistrationDialog(null);
      scheduleDraw();
    }

    function updateGroupNodeParameter(groupId: string, nodeId: string, key: string, value: string) {
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

    function replaceGroup(groupId: string, nextGroup: AnimationGraphGroup) {
      commitGraphUpdate((graph) => replaceGraphGroup(graph, groupId, nextGroup));
    }

    function replaceGraphGroup(
      graph: AnimationGraphState | undefined,
      groupId: string,
      nextGroup: AnimationGraphGroup,
    ): AnimationGraphState {
      return {
          nodes: {
            ...materializeGraphNodes(nodesRef.current),
            ...(graph?.nodes ?? {}),
          },
          edges: getRenderableEdges(graph, nodesRef.current, selectedObjects),
          customNodes: materializeGraphNodeDefinitions(
            nodesRef.current,
            graph?.customNodes,
            graphViewportKey,
          ),
          groups: {
            ...(graph?.groups ?? {}),
            [groupId]: nextGroup,
          },
          parameters: graph?.parameters,
          deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
    }

    function openContextMenu(event: MouseEvent<HTMLCanvasElement>) {
      event.preventDefault();
      event.stopPropagation();
      const point = canvasPoint(event, graphViewportRef.current);
      setPopoverNodeId(null);
      const node = hitNode(point, nodesRef.current, graphScale);
      const nodeId = node?.id;
      const previousSelectedIds = selectedGraphNodeIdsRef.current;
      const rightClickedSelectedNode = Boolean(nodeId && previousSelectedIds.includes(nodeId));
      if (nodeId && !rightClickedSelectedNode) selectGraphNode(nodeId);
      contextMenuPointRef.current = {
        graphX: point.x / graphScale / gridSize,
        graphY: point.y / graphScale / gridSize,
        nodeId,
      };
      const selectedIds = rightClickedSelectedNode ? previousSelectedIds : selectedGraphNodeIdsRef.current;
      const items =
        selectedIds.length > 1 && (!nodeId || selectedIds.includes(nodeId))
          ? [
              { label: "Group", action: () => groupSelectedNodes() },
              { label: "Copy", action: () => copySelectedNodes() },
              { label: "Delete", danger: true, action: () => deleteSelectedNodes() },
            ]
          : nodeId && graphRef.current?.customNodes?.[nodeId]?.kind === "group"
          ? [
              { label: "Rename", action: () => renameGroupNode(nodeId) },
              { label: "Ungroup", action: () => ungroupNode(nodeId) },
              { label: "Copy", action: () => copySelectedNodes() },
              { label: "Delete", danger: true, action: () => { setGraphNodeSelection([nodeId]); deleteGraphNodes([nodeId]); } },
            ]
          : nodeId && isCustomGraphNode(nodeId, displayGraphRef.current)
            ? [
              { label: "Copy", action: () => copySelectedNodes() },
              {
                label: "Delete",
                danger: true,
                action: () => { setGraphNodeSelection([nodeId]); deleteGraphNodes([nodeId]); },
              },
            ]
            : [
              ...(graphClipboardRef.current ? [{ label: "Paste", action: () => pasteGraphNodes() }] : []),
              { label: "Time", action: () => addCustomNode("time") },
              ...getAnimationDefinitionCategories().map((category) => ({
                label: category,
                children: animationDefinitions
                  .filter((definition) => definition.category === category)
                  .map((definition) => ({
                    label: definition.label,
                    action: () => addCustomNode(definition.property),
                  })),
              })),
            ];
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items,
      });
    }

    function addCustomNode(kind: CustomNodeKind) {
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
          : {
              kind: "animation" as const,
              label: definition?.label ?? formatPropertyLabel(kind),
              scopeKey: graphViewportKey,
              details: { property: kind },
            };
      commitGraphUpdate((graph) => ({
        nodes: {
          ...(graph?.nodes ?? {}),
          [id]: { x: point.graphX, y: point.graphY },
        },
        edges: graph?.edges ?? [],
        customNodes: { ...(graph?.customNodes ?? {}), [id]: node },
        parameters: graph?.parameters,
        deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds?.filter((deletedId) => deletedId !== id),
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
      contextMenuPointRef.current = null;
      setContextMenu(null);
    }

    function addGraphPreset(presetId: string) {
      const objectId = selectedObjects[0]?.id;
      if (!objectId) return;
      commitGraphUpdate((graph) => {
        const layerNodeId = `layer:${objectId}`;
        const layerPosition = graph?.nodes?.[layerNodeId] ?? nodesRef.current.find((node) => node.id === layerNodeId) ?? { x: 150, y: 25 };
        const existingGroupCount = Object.values(graph?.customNodes ?? {}).filter((node) => node.scopeKey === objectId && node.kind === "group").length;
        return addAnimationGraphPresetGroupToGraph(graph, presetId, objectId, {
          x: layerPosition.x + 8 + existingGroupCount * 2,
          y: layerPosition.y + existingGroupCount * 3,
        });
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
      const selectedIds = selectedGraphNodeIdsRef.current.filter((id) => !id.startsWith("layer:"));
      if (selectedIds.length < 2) return;
      const selectedNodes = nodesRef.current.filter((node) => selectedIds.includes(node.id));
      if (selectedNodes.length < 2) return;
      const minX = Math.min(...selectedNodes.map((node) => node.x));
      const minY = Math.min(...selectedNodes.map((node) => node.y));
      const maxX = Math.max(...selectedNodes.map((node) => node.x + node.width));
      const maxY = Math.max(...selectedNodes.map((node) => node.y + node.height));
      const groupId = `group:custom:${Date.now().toString(36)}`;
      const nodeId = `custom:group:${Date.now().toString(36)}`;
      commitGraphUpdate((graph) => {
        const customNodes = { ...(graph?.customNodes ?? {}) };
        const nodes = { ...(graph?.nodes ?? {}) };
        const parameters = { ...(graph?.parameters ?? {}) };
        const groupCustomNodes: NonNullable<AnimationGraphState["customNodes"]> = {};
        const groupNodes: AnimationGraphState["nodes"] = { [`${groupId}:out`]: { x: (maxX - minX) / 2, y: maxY - minY + 4 } };
        const groupParameters: NonNullable<AnimationGraphState["parameters"]> = {};
        for (const id of selectedIds) {
          if (customNodes[id]) groupCustomNodes[id] = { ...customNodes[id], scopeKey: groupId };
          const node = selectedNodes.find((item) => item.id === id);
          if (node) groupNodes[id] = { x: node.x - minX, y: node.y - minY };
          if (parameters[id]) groupParameters[id] = parameters[id];
          delete customNodes[id];
          delete nodes[id];
          delete parameters[id];
        }
        const internalEdges = (graph?.edges ?? []).filter((edge) => selectedIds.includes(edge.fromNodeId) && selectedIds.includes(edge.toNodeId));
        const externalEdges = (graph?.edges ?? []).filter((edge) => !selectedIds.includes(edge.fromNodeId) && !selectedIds.includes(edge.toNodeId));
        return {
          nodes: { ...nodes, [nodeId]: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) / 2 } },
          edges: externalEdges,
          customNodes: { ...customNodes, [nodeId]: { kind: "group", label: "Group", scopeKey: graphViewportKey, details: { groupId } } },
          groups: { ...(graph?.groups ?? {}), [groupId]: { id: groupId, name: "Group", nodes: groupNodes, edges: internalEdges, customNodes: groupCustomNodes, parameters: groupParameters, outNodeId: `${groupId}:out` } },
          parameters: Object.keys(parameters).length ? parameters : undefined,
          deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
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
      commitGraphUpdate((graph) => {
        const { [nodeId]: _node, ...customNodes } = graph?.customNodes ?? {};
        const { [nodeId]: _pos, ...nodes } = graph?.nodes ?? {};
        const { [groupId]: _group, ...groups } = graph?.groups ?? {};
        const restoredNodes = Object.fromEntries(Object.entries(group.nodes).filter(([id]) => id !== group.outNodeId).map(([id, pos]) => [id, { x: groupNode.x + pos.x, y: groupNode.y + pos.y }]));
        const restoredCustom = Object.fromEntries(Object.entries(group.customNodes ?? {}).map(([id, custom]) => [id, { ...custom, scopeKey: graphViewportKey }]));
        const restoredIds = new Set(Object.keys(restoredNodes));
        const internalEdges = (group.edges ?? []).filter((edge) => restoredIds.has(edge.fromNodeId) && restoredIds.has(edge.toNodeId));
        const groupOutputSources = (group.edges ?? [])
          .filter((edge) => edge.toNodeId === group.outNodeId && restoredIds.has(edge.fromNodeId))
          .map((edge) => edge.fromNodeId);
        const externalEdges = graph?.edges?.filter((edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) ?? [];
        const bridgedOutputEdges = (graph?.edges ?? []).flatMap((edge) => {
          if (edge.fromNodeId !== nodeId) return [];
          return groupOutputSources.map((sourceId) => createEdge(sourceId, "bottom", edge.toNodeId, edge.toPort));
        });
        return {
          nodes: { ...nodes, ...restoredNodes },
          edges: filterPermittedEdges([...externalEdges, ...internalEdges, ...bridgedOutputEdges], nodesRef.current.filter((node) => node.id !== nodeId).concat(buildGroupGraphNodes(group).filter((node) => node.id !== group.outNodeId).map((node) => ({ ...node, x: groupNode.x + node.x, y: groupNode.y + node.y })))),
          customNodes: { ...customNodes, ...restoredCustom },
          groups: Object.keys(groups).length ? groups : undefined,
          parameters: { ...(graph?.parameters ?? {}), ...(group.parameters ?? {}) },
          deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      selectGraphNode(null);
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
        customNodes: { ...(graph?.customNodes ?? {}), [nodeId]: { ...current, label: name } },
        groups: groupId && graph?.groups?.[groupId] ? { ...graph.groups, [groupId]: { ...graph.groups[groupId], name } } : graph?.groups,
        parameters: graph?.parameters,
        deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
      setRenamingGroupNodeId(null);
      scheduleDraw();
    }

    function deleteSelectedNodes() {
      const selectedIds = selectedGraphNodeIdsRef.current.filter((id) =>
        isCustomGraphNode(id, displayGraphRef.current),
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
            (edge) => !selectedSet.has(edge.fromNodeId) && !selectedSet.has(edge.toNodeId),
          ),
          customNodes: Object.keys(customNodes).length ? customNodes : undefined,
          groups: Object.keys(groups).length ? groups : undefined,
          parameters: Object.keys(parameters).length ? parameters : undefined,
          deletedNodeIds: isComposition3d ? undefined : Array.from(new Set([...(graph?.deletedNodeIds ?? []), ...selectedIds])),
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
        Object.entries(graph.customNodes ?? {}).filter(([id]) => selectedSet.has(id)),
      );
      const parameters = Object.fromEntries(
        Object.entries(graph.parameters ?? {}).filter(([id]) => selectedSet.has(id)),
      );
      const groupIds = new Set(
        Object.values(customNodes).map((node) => node.details?.groupId).filter(Boolean) as string[],
      );
      const sourceGroups = graphRef.current?.groups;
      const groups = sourceGroups
        ? Object.fromEntries(Object.entries(sourceGroups).filter(([id]) => groupIds.has(id)))
        : undefined;
      graphClipboardRef.current = {
        nodes,
        customNodes,
        edges: (graph.edges ?? []).filter(
          (edge) => selectedSet.has(edge.fromNodeId) && selectedSet.has(edge.toNodeId),
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
        Object.keys(clipboard.customNodes).map((id, index) => [id, `${id}:copy:${suffix}:${index}`]),
      );
      const groupIdMap = new Map(
        Object.keys(clipboard.groups ?? {}).map((id, index) => [id, `${id}:copy:${suffix}:${index}`]),
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
            details: groupId && groupIdMap.has(groupId)
              ? { ...(custom.details ?? {}), groupId: groupIdMap.get(groupId)! }
              : custom.details,
          };
          if (clipboard.parameters?.[oldId]) parameters[newId] = clipboard.parameters[oldId];
        }
        for (const [oldGroupId, newGroupId] of groupIdMap) {
          const group = clipboard.groups?.[oldGroupId];
          if (group) groups[newGroupId] = { ...group, id: newGroupId, name: `${group.name} Copy` };
        }
        const edges = [
          ...(graph?.edges ?? []),
          ...clipboard.edges.map((edge) => ({
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
          parameters: Object.keys(parameters).length ? parameters : graph?.parameters,
          deletedNodeIds: isComposition3d ? undefined : graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      setGraphNodeSelection(pastedIds);
      setContextMenu(null);
    }

    function closePopoverOnOutsidePointer(event: PointerEvent<HTMLDivElement>) {
      if (event.target === event.currentTarget) {
        setPopoverNodeId(null);
        selectGraphNode(null);
      }
    }

    function focusMainLayerNode() {
      const viewport = graphViewportRef.current;
      if (!viewport) return;
      requestAnimationFrame(() => centerGraphOnSelectedLayer(viewport));
    }

    function setGraphScaleValue(nextScale: number) {
      const clamped = clampGraphScale(nextScale);
      graphScaleRef.current = clamped;
      setGraphScale(clamped);
      return clamped;
    }

    function zoomGraphAtPoint(nextScale: number, clientX: number, clientY: number) {
      const viewport = graphViewportRef.current;
      if (!viewport) return;
      const previousScale = graphScaleRef.current;
      const clamped = setGraphScaleValue(nextScale);
      const rect = viewport.getBoundingClientRect();
      const graphX = (viewport.scrollLeft + clientX - rect.left) / previousScale;
      const graphY = (viewport.scrollTop + clientY - rect.top) / previousScale;
      requestAnimationFrame(() => {
        viewport.scrollLeft = Math.max(0, graphX * clamped - (clientX - rect.left));
        viewport.scrollTop = Math.max(0, graphY * clamped - (clientY - rect.top));
      });
    }

    function zoomGraphFromCenter(nextScale: number) {
      const viewport = graphViewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomGraphAtPoint(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    function resetGraphZoom() {
      setGraphScaleValue(1);
      focusMainLayerNode();
    }

    function onGraphWheel(event: WheelEvent<HTMLDivElement>) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      zoomGraphAtPoint(graphScaleRef.current * Math.exp(-normalizeWheelDelta(event) * 0.0012), event.clientX, event.clientY);
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

    function centerGraphOnSelectedLayer(viewport: HTMLDivElement) {
      const selectedObjectId = selectedObjects[0]?.id;
      const targetNode = selectedObjectId
        ? nodesRef.current.find((node) => node.id === `layer:${selectedObjectId}`)
        : undefined;
      const rect = targetNode ? nodeRect(targetNode) : undefined;
      viewport.scrollLeft = Math.max(
        0,
        Math.round(rect
          ? (rect.x + rect.width / 2) * graphScaleRef.current - viewport.clientWidth / 2
          : (graphScrollWidth - viewport.clientWidth) / 2),
      );
      viewport.scrollTop = Math.max(
        0,
        Math.round(rect
          ? (rect.y + rect.height / 2) * graphScaleRef.current - viewport.clientHeight / 2
          : (graphScrollHeight - viewport.clientHeight) / 2),
      );
      scheduleDraw();
    }

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
          style={{ "--clipper-playhead-left": playheadLeft } as CSSProperties}
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
          {delayMarkers.map((marker) => (
            <button
              key={marker.key}
              className="absolute top-[21px] z-50 h-1.5 w-1.5 -translate-x-1/2 rotate-45 border border-[#b9d7ff] bg-[#7ea8d8] shadow-[0_0_0_2px_rgba(126,168,216,0.14)] transition hover:scale-150"
              style={{ left: `${(marker.delay / timelineDuration) * 100}%` }}
              title={`${marker.label} delay ${formatSeconds(marker.delay)}`}
              onClick={(event) => {
                event.stopPropagation();
                scrollToGraphNode(marker.nodeId);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ))}
        </div>
          <GraphCanvasSurface
            canvasRef={canvasRef}
            viewportRef={graphViewportRef}
            scrollWidth={hasSelectedGraph ? graphScrollWidth : 0}
            scrollHeight={hasSelectedGraph ? graphScrollHeight : 0}
            hoverNodeId={hoverNodeId}
            hoverEdgeId={hoverEdgeId}
            className={`clipper-hidden-scrollbar relative min-h-0 overflow-auto rounded-b-[18px] ${isComposition3d ? "bg-[linear-gradient(180deg,#07130c_0%,#0b2012_48%,#06100a_100%)]" : "bg-[#0b0f16]"}`}
            onDragOver={onComposition3dDragOver}
            onDrop={onComposition3dDrop}
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
              {popoverNodeId ? (
                <GraphNodePopover
                  node={nodes.find((node) => node.id === popoverNodeId) ?? null}
                  group={
                    (graph as AnimationGraphState | undefined)?.groups?.[
                      nodes.find((node) => node.id === popoverNodeId)?.details?.groupId ?? ""
                    ]
                  }
                  parameters={graph?.parameters?.[popoverNodeId]}
                  viewportRef={graphViewportRef}
                  graphScale={graphScale}
                  onParameterChange={updateNodeParameter}
                  onGroupParameterChange={updateGroupNodeParameter}
                  onGroupReplace={replaceGroup}
                  onPointerDownOutside={closePopoverOnOutsidePointer}
                />
              ) : null}
              {renamingGroupNodeId ? (
        <GraphNodeRenameInput
                  node={nodes.find((node) => node.id === renamingGroupNodeId) ?? null}
                  viewportRef={graphViewportRef}
                  graphScale={graphScale}
                  onCommit={(name) => commitGroupRename(renamingGroupNodeId, name)}
                  onCancel={() => { setRenamingGroupNodeId(null); scheduleDraw(); }}
                />
              ) : null}
              {isComposition3d ? (
                <Composition3dEdgeRegistrationDialog
                  state={edgeRegistrationDialog}
                  graph={graph}
                  nodes={nodes}
                  onOpenChange={(open) => { if (!open) setEdgeRegistrationDialog(null); }}
                  onRegister={registerComposition3dEdge}
                  onDelete={deleteComposition3dEdge}
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
                  title="Add animation graph preset"
                  onClick={openGraphPresetMenu}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Add preset
                  <ChevronDown className="h-3.5 w-3.5 text-[#dfe6f3]" strokeWidth={2.6} />
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
            </>
          ) : (
            <div className="grid h-full min-h-[220px] place-items-center text-center text-sm font-semibold text-[#8b93a3]">
              Select a layer to view animation graph
            </div>
          )}
        </GraphCanvasSurface>
      </footer>
    );
  },
);

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
      <div className="pointer-events-none relative z-0 bg-[#0b0f16]" style={{ width: scrollWidth, height: scrollHeight }} aria-hidden="true" />
      {children}
    </div>
  );
}

function GraphTimeRuler({ rulerRef, ticks, sceneDuration, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: { rulerRef: RefObject<HTMLDivElement | null>; ticks: number[]; sceneDuration: number; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp: (event: PointerEvent<HTMLDivElement>) => void; onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void }) {
  const marks = useMemo(() => {
    const roundedDuration = Math.max(sceneDuration, 0);
    const labeled = new Set(ticks.map((tick) => roundTenth(tick)));
    const minorStep = roundedDuration <= 8 ? 0.5 : 1;
    const items: Array<{ time: number; kind: "major" | "medium" | "minor" }> = [];
    for (let time = 0; time <= roundedDuration; time = roundTenth(time + minorStep)) {
      const rounded = roundTenth(time);
      const isMajor = rounded === 0 || rounded === roundTenth(roundedDuration) || labeled.has(rounded);
      const isMedium = Number.isInteger(rounded);
      items.push({ time: rounded, kind: isMajor ? "major" : isMedium ? "medium" : "minor" });
    }
    if (!items.some((item) => item.time === roundTenth(roundedDuration))) items.push({ time: roundedDuration, kind: "major" });
    return items;
  }, [sceneDuration, ticks]);
  const labelTicks = useMemo(
    () => ticks.filter((tick, index) => index === 0 || formatTime(tick) !== formatTime(ticks[index - 1])),
    [ticks],
  );

  return (
    <div ref={rulerRef} className="relative h-[38px] w-full pt-1.5 text-xs text-[#858a96] tabular-nums">
      <div className="absolute inset-x-0 top-0 z-20 h-[38px]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#454b5a]" />
      {marks.map((mark) => {
        const left = sceneDuration > 0 ? `${(mark.time / sceneDuration) * 100}%` : "0%";
        const tickAlign = mark.time === 0 ? "translate-x-0" : mark.time === sceneDuration ? "-translate-x-full" : "-translate-x-1/2";
        const className = mark.kind === "major" ? "h-[16px] bg-[#596071]" : mark.kind === "medium" ? "h-[11px] bg-[#444a58]" : "h-[6px] bg-[#363b47]";
        return <span className={`pointer-events-none absolute bottom-0 w-px ${tickAlign} ${className}`} key={`${mark.time}-${mark.kind}`} style={{ left }} />;
      })}
      {labelTicks.map((tick) => {
        const isStart = tick === 0;
        const isEnd = tick === sceneDuration;
        const labelAlign = isStart ? "translate-x-0 text-left" : isEnd ? "-translate-x-full text-right" : "-translate-x-1/2 text-center";
        const left = sceneDuration > 0 ? `${(tick / sceneDuration) * 100}%` : "0%";
        return <span className={`pointer-events-none absolute top-[5px] whitespace-nowrap font-semibold ${labelAlign}`} key={tick} style={{ left }}>{formatTime(tick)}</span>;
      })}
    </div>
  );
}

export function buildGraphNodes(
  objects: FrameObject[],
  graph: AnimationGraphState | undefined,
  canvasWidth = 5200,
  canvasHeight = 900,
  graphViewportKey = "__empty__",
): GraphNode[] {
  const deletedNodeIds = new Set(graph?.deletedNodeIds ?? []);
  const verticalStackHeight = nodeHeight * 3 + nodeGap * 2;
  const stackStartY = Math.max(
    2,
    Math.round((canvasHeight / gridSize - verticalStackHeight) / 2),
  );
  const derivedNodes = objects.flatMap((object, index) => {
    const layerWidth = getNodeGridWidth(object.name || object.id);
    const descriptors = getAnimationNodeDescriptors(object).filter(
      (descriptor) => !deletedNodeIds.has(descriptor.id),
    );
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
      (descriptor) => descriptor.kind === "animation",
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
          graph?.nodes[descriptor.id] ?? { x, y: animationY },
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
          graph?.nodes[descriptor.id] ?? { x, y: timeY },
          descriptor.details,
        );
      }),
      createNode(
        layerId,
        object.name || object.id,
        "layer",
        { x: layerX, y: layerY },
        { type: object.type },
      ),
    ];
  });
  const derivedNodeIds = new Set(derivedNodes.map((node) => node.id));
      const customNodes = Object.entries(graph?.customNodes ?? {})
    .filter(([, node]) => node.scopeKey === graphViewportKey)
    .filter(([id]) => !deletedNodeIds.has(id))
    .filter(([id]) => !derivedNodeIds.has(id))
    .map(([id, node]) => {
      const details = node.kind === "group"
        ? { ...(node.details ?? {}), registered: hasGroupValidOutput(graph?.groups?.[node.details?.groupId ?? ""]) ? "true" : "false" }
        : node.details;
      return createNode(
        id,
        node.label,
        node.kind,
        graph?.nodes[id] ?? { x: 2, y: 2 },
        details,
      );
    });
  return [...derivedNodes, ...customNodes];
}

export function buildComposition3dGraphNodes(
  graph: AnimationGraphState | undefined,
  canvasWidth = 5200,
  canvasHeight = 900,
): GraphNode[] {
  const outPosition = graph?.nodes["composition3d:out"] ?? { x: Math.round(canvasWidth / gridSize / 2), y: Math.round(canvasHeight / gridSize / 2) };
  const packageNodes = Object.entries(graph?.customNodes ?? {})
    .filter(([, node]) => node.scopeKey === "composition3d")
    .map(([id, node]) => createNode(id, node.label, "animation", graph?.nodes[id] ?? { x: outPosition.x - 10, y: outPosition.y }, node.details));
  return [...packageNodes, createNode("composition3d:out", "Out", "out", outPosition, { fixed: "true" })];
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
  const nodes = Object.entries(group.customNodes ?? {}).map(([id, node]) => createNode(id, node.label, node.kind, group.nodes[id] ?? { x: 2, y: 2 }, node.details));
  return [...nodes, createNode(group.outNodeId, "Out", "out", group.nodes[group.outNodeId] ?? { x: 6, y: 10 }, { fixed: "true" })];
}

function stripGraphViewportState(
  graph: AnimationGraphState,
): AnimationGraphState {
  const { viewport: _viewport, viewports: _viewports, ...rest } = graph;
  return rest;
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
    (descriptor) => descriptor.kind === "animation",
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
  const nodeKind = kind === "group" ? "group" : kind;
  return {
    id,
    label,
    kind: nodeKind,
    x: position.x,
    y: position.y,
    width: getNodeGridWidth(label),
    height: nodeHeight,
    details,
  };
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
      kind: "animation" as const,
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
  return objects.flatMap((object) => {
    const sources = getGraphAnimationSources(object);
    const timeKeys = Array.from(
      new Set(sources.map((source) => source.timeKey)),
    );
    return sources.flatMap((source) => {
      const timeNodeId = `time:${object.id}:${timeKeys.indexOf(source.timeKey)}`;
      return [
        createEdge(source.id, "bottom", timeNodeId, "top"),
        createEdge(timeNodeId, "bottom", `layer:${object.id}`, "top"),
      ];
    });
  });
}

function getDelayMarkers(
  objects: FrameObject[],
  nodes: GraphNode[],
  graph: AnimationGraphState | undefined,
) {
  const edges = getRenderableEdges(graph, nodes, objects);
  const connectedNodeIds = getConnectedToLayerNodeIds(edges, nodes);
  const mainMarkers = nodes.flatMap((node) => {
    if (node.kind !== "time" || !connectedNodeIds.has(node.id)) return [];
    return [
      {
        nodeId: node.id,
        key: node.id,
        delay: Math.max(
          0,
          getTimeNodeStart(node, graph, edges, nodes, new Set()),
        ),
        label: node.label,
      },
    ];
  });
  const groupMarkers = nodes.flatMap((node) => {
    if (node.kind !== "group" || !connectedNodeIds.has(node.id)) return [];
    const groupId = node.details?.groupId;
    const group = groupId ? graph?.groups?.[groupId] : undefined;
    if (!group) return [];
    return getDelayMarkersForGroup(node, group, graph);
  });
  return [...mainMarkers, ...groupMarkers];
}

function getDelayMarkersForGroup(
  groupNode: GraphNode,
  group: AnimationGraphGroup,
  graph: AnimationGraphState | undefined,
) {
  const nodes = buildGroupGraphNodes(group);
  const edges = filterPermittedEdges(filterRenderableEdges(group.edges ?? [], nodes), nodes);
  const connectedNodeIds = getConnectedToGroupOutNodeIds(edges, nodes, group.outNodeId);
  const groupGraph = {
    ...graph,
    nodes: group.nodes,
    edges,
    customNodes: group.customNodes,
    parameters: { ...(graph?.parameters ?? {}), ...(group.parameters ?? {}) },
  } satisfies AnimationGraphState;
  return nodes.flatMap((node) => {
    if (node.kind !== "time" || !connectedNodeIds.has(node.id)) return [];
    return [
      {
        nodeId: groupNode.id,
        key: `${groupNode.id}:${node.id}`,
        delay: Math.max(0, getTimeNodeStart(node, groupGraph, edges, nodes, new Set())),
        label: `${groupNode.label} / ${node.label}`,
      },
    ];
  });
}

function getRenderableEdges(
  graph: AnimationGraphState | undefined,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const mode = getGraphCompositionMode(nodes);
  const automatic = hasMaterializedCodeGraph(graph, nodes)
    ? []
    : getAutoEdges(objects);
  const persisted = filterPermittedEdges(
    filterStaleAutoEdges(
      filterRenderableEdges(graph?.edges ?? [], nodes),
      nodes,
    ),
    nodes,
    mode,
  );
  return filterPermittedEdges(
    Array.from(
      new Map(
        [...automatic, ...persisted].map((edge) => [edge.id, edge]),
      ).values(),
    ),
    nodes,
    mode,
  );
}

function hasMaterializedCodeGraph(
  graph: AnimationGraphState | undefined,
  nodes: GraphNode[],
) {
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  return Object.keys(graph?.customNodes ?? {}).some(
    (nodeId) =>
      visibleNodeIds.has(nodeId) &&
      (nodeId.startsWith("animation:") || nodeId.startsWith("time:")),
  );
}

function hasGroupValidOutput(group: AnimationGraphGroup | undefined) {
  if (!group) return false;
  const outNodeId = group.outNodeId;
  const reverse = new Map<string, string[]>();
  for (const edge of group.edges ?? []) reverse.set(edge.toNodeId, [...(reverse.get(edge.toNodeId) ?? []), edge.fromNodeId]);
  const stack = [outNodeId];
  const visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const upstream of reverse.get(id) ?? []) {
      if (group.customNodes?.[upstream]?.kind === "time") return true;
      stack.push(upstream);
    }
  }
  return false;
}


function getConnectedToLayerNodeIds(
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  const reverseEdges = new Map<string, string[]>();
  for (const edge of edges)
    reverseEdges.set(edge.toNodeId, [
      ...(reverseEdges.get(edge.toNodeId) ?? []),
      edge.fromNodeId,
    ]);
  const connected = new Set<string>();
  const stack = nodes
    .filter((node) => node.kind === "layer")
    .map((node) => node.id);
  while (stack.length) {
    const current = stack.pop()!;
    if (connected.has(current)) continue;
    connected.add(current);
    for (const upstream of reverseEdges.get(current) ?? [])
      stack.push(upstream);
  }
  return connected;
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
    for (const upstream of reverseEdges.get(current) ?? []) stack.push(upstream);
  }
  return connected;
}

function isPermittedGraphEdge(
  edge: AnimationGraphEdge,
  nodes: GraphNode[],
  existingEdges: AnimationGraphEdge[] = [],
  mode: GraphCompositionMode = getGraphCompositionMode(nodes),
) {
  const from = nodes.find((node) => node.id === edge.fromNodeId);
  const to = nodes.find((node) => node.id === edge.toNodeId);
  if (!from || !to) return false;
  if (mode === "composition3d") return isPermittedComposition3dGraphEdge(from, to, edge, existingEdges);
  if (from.kind === "animation" && to.kind === "time")
    return !hasDuplicateEffectForTimeNode(from, to.id, existingEdges, nodes);
  if (from.kind === "group" && (to.kind === "time" || to.kind === "layer"))
    return hasRegisteredGroupOutput(from);
  if (from.kind === "time" && to.kind === "layer") return true;
  if (from.kind === "time" && to.kind === "out") return true;
  if (from.kind === "time" && to.kind === "time")
    return !pathExists(edge.toNodeId, edge.fromNodeId, existingEdges);
  return false;
}

function isPermittedComposition3dGraphEdge(
  from: GraphNode,
  to: GraphNode,
  edge: AnimationGraphEdge,
  existingEdges: AnimationGraphEdge[],
) {
  if (from.kind === "out") return false;
  if (pathExists(edge.toNodeId, edge.fromNodeId, existingEdges)) return false;
  const fromDefinition = getComposition3dSocketDefinition(getComposition3dGraphNodeKind(from));
  const toDefinition = getComposition3dSocketDefinition(getComposition3dGraphNodeKind(to));
  if (!fromDefinition || !toDefinition || toDefinition.accepts.length === 0) return false;
  if (!edge.fromSocket || !edge.toSocket) return true;
  const input = getComposition3dInputSocketOptions(to).find((option) => option.id === edge.toSocket);
  return input ? canConnectSocketTypes(fromDefinition.output, [input.socket]) : canConnectSocketTypes(fromDefinition.output, toDefinition.accepts);
}

function hasRegisteredGroupOutput(node: GraphNode) {
  return node.details?.registered === "true";
}

function hasDuplicateEffectForTimeNode(
  node: GraphNode,
  timeNodeId: string,
  existingEdges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  const effectKind = getGraphEffectKind(node);
  if (!effectKind) return false;
  return existingEdges.some((edge) => {
    if (edge.toNodeId !== timeNodeId || edge.fromNodeId === node.id)
      return false;
    const existingNode = nodes.find((item) => item.id === edge.fromNodeId);
    return (
      existingNode?.kind === "animation" &&
      getGraphEffectKind(existingNode) === effectKind
    );
  });
}

function getGraphEffectKind(node: GraphNode) {
  if (node.kind !== "animation") return null;
  const kind = node.details?.property ?? node.label.trim().toLowerCase();
  return kind || null;
}

function getGraphCompositionMode(nodes: GraphNode[]): GraphCompositionMode {
  return nodes.some((node) => node.id === "composition3d:out" || node.details?.packageId?.startsWith("composition3d:")) ? "composition3d" : "composition2d";
}

function getComposition3dGraphNodeKind(node: GraphNode) {
  if (node.id === "composition3d:out" || node.kind === "out") return "out";
  return getComposition3dNodeKindFromPackageId(node.details?.packageId);
}

function getGraphNodeOutputSocketType(node: GraphNode, mode: GraphCompositionMode = "composition2d"): SocketType {
  if (mode !== "composition3d") return "any";
  return getComposition3dSocketDefinition(getComposition3dGraphNodeKind(node))?.output ?? "any";
}

function getGraphNodeSocketColor(node: GraphNode, mode: GraphCompositionMode = "composition2d") {
  return graphSocketColors[getGraphNodeOutputSocketType(node, mode)];
}

function getGraphNodeRenderColors(node: GraphNode, mode: GraphCompositionMode = "composition2d") {
  const base = getGraphNodeColors(node.kind);
  if (mode !== "composition3d") return base;
  return { background: nodeColors.outBg, border: nodeColors.outBorder };
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

function filterPermittedEdges(edges: AnimationGraphEdge[], nodes: GraphNode[], mode: GraphCompositionMode = getGraphCompositionMode(nodes)) {
  const accepted: AnimationGraphEdge[] = [];
  for (const edge of edges) {
    if (isPermittedGraphEdge(edge, nodes, accepted, mode)) accepted.push(edge);
  }
  return accepted;
}

function pathExists(
  fromNodeId: string,
  toNodeId: string,
  edges: AnimationGraphEdge[],
) {
  const visited = new Set<string>();
  const stack = [fromNodeId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === toNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges)
      if (edge.fromNodeId === current) stack.push(edge.toNodeId);
  }
  return false;
}

function filterStaleAutoEdges(edges: AnimationGraphEdge[], nodes: GraphNode[]) {
  const kinds = new Map(nodes.map((node) => [node.id, node.kind]));
  return edges.filter((edge) => {
    const fromKind = kinds.get(edge.fromNodeId);
    const toKind = kinds.get(edge.toNodeId);
    if (fromKind === "layer" && toKind === "time") return false;
    if (fromKind === "time" && toKind === "animation") return false;
    return true;
  });
}

function filterRenderableEdges(
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.filter(
    (edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId),
  );
}

function isCustomGraphNode(
  nodeId: string,
  graph: AnimationGraphState | undefined,
) {
  return nodeId.startsWith("custom:") || Boolean(graph?.customNodes?.[nodeId]);
}

function createEdge(
  fromNodeId: string,
  fromPort: AnimationGraphPort,
  toNodeId: string,
  toPort: AnimationGraphPort,
  registration?: Pick<AnimationGraphEdge, "fromSocket" | "toSocket">,
): AnimationGraphEdge {
  const socketId = registration?.fromSocket && registration.toSocket ? `:${registration.fromSocket}->${registration.toSocket}` : "";
  return {
    id: `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}${socketId}`,
    fromNodeId,
    fromPort,
    toNodeId,
    toPort,
    ...registration,
  };
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
function materializeGraphNodes(nodes: GraphNode[]) {
  return Object.fromEntries(
    nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );
}

function materializeGraphNodeDefinitions(
  nodes: GraphNode[],
  existing: AnimationGraphState["customNodes"] | undefined,
  graphViewportKey: string,
) {
  const next = { ...(existing ?? {}) };
  for (const node of nodes) {
    if (node.kind === "layer" || node.kind === "out") continue;
    if (node.kind === "group" && node.details?.registered) {
      const { registered: _registered, ...details } = node.details;
      next[node.id] = { ...(next[node.id] ?? {}), kind: node.kind, label: node.label, scopeKey: graphViewportKey, details };
      continue;
    }
    next[node.id] = {
      ...(next[node.id] ?? {}),
      kind: node.kind,
      label: node.label,
      scopeKey: node.details?.packageId?.startsWith("composition3d:") ? "composition3d" : graphViewportKey,
      details: node.details,
    };
  }
  return Object.keys(next).length ? next : undefined;
}

function updateGraphNodeDefinitionParameter(
  customNodes: AnimationGraphState["customNodes"] | undefined,
  nodeId: string,
  key: string,
  value: string,
) {
  const current = customNodes?.[nodeId];
  if (!current) return customNodes;
  return {
    ...(customNodes ?? {}),
    [nodeId]: {
      ...current,
      label: key === "label" ? value : current.label,
      details: key === "label" ? current.details : { ...(current.details ?? {}), [key]: value },
    },
  };
}

function nodeRect(node: GraphNode) {
  return {
    x: node.x * gridSize,
    y: node.y * gridSize,
    width: node.width * gridSize,
    height: node.height * gridSize,
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

function normalizeRect(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function rectIntersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function isMarqueeSelectableNode(node: GraphNode) {
  return node.kind !== "layer" && node.kind !== "out";
}
function hitPort(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
) {
  return hitHoverConnector(point, nodes, scale, null);
}
function hitHoverConnector(
  point: { x: number; y: number },
  nodes: GraphNode[],
  scale = 1,
  preferred: HoverConnector | null,
): HoverConnector | null {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  const activePreferred = getActiveHoverConnector(
    point,
    nodes,
    scale,
    preferred,
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
    const connector = getNodeHoverConnector(point, node, scale);
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
): HoverConnector | null {
  if (!preferred) return null;
  const node = nodes.find((item) => item.id === preferred.nodeId);
  if (!node) return null;
  return getNodeHoverConnector(point, node, scale);
}
function hitEdge(
  point: { x: number; y: number },
  edges: AnimationGraphEdge[],
  nodes: GraphNode[],
  scale = 1,
) {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  for (const edge of edges) {
    const from = nodes.find((node) => node.id === edge.fromNodeId);
    const to = nodes.find((node) => node.id === edge.toNodeId);
    if (!from || !to) continue;
    const start = nodeCenter(from);
    const end = nodeCenter(to);
    const control = getEdgeControlPoint(start, end);
    if (Math.hypot(graphPoint.x - control.x, graphPoint.y - control.y) <= 14)
      return edge;
  }
  return null;
}
function getEdgeDropTarget(
  point: { x: number; y: number },
  fromNodeId: string,
  nodes: GraphNode[],
  scale: number,
  graph: AnimationGraphState | undefined,
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
): HoverConnector | null {
  const graphPoint = { x: point.x / scale, y: point.y / scale };
  const rect = nodeRect(node);
  if (
    graphPoint.x > rect.x &&
    graphPoint.x < rect.x + rect.width &&
    graphPoint.y > rect.y &&
    graphPoint.y < rect.y + rect.height
  )
    return null;
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
  progressForNode,
  marqueeRect,
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
  progressForNode?: (node: GraphNode) => number | null;
  marqueeRect?: { x: number; y: number; width: number; height: number } | null;
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
  ctx.translate(-(scrollLeft ?? viewport?.scrollLeft ?? 0), -(scrollTop ?? viewport?.scrollTop ?? 0));
  ctx.scale(scale, scale);
  const mode = getGraphCompositionMode(nodes);
  for (const edge of edges) drawEdge(ctx, edge, nodes, hoverEdgeId === edge.id, mode);
  if (edgeDrag && previewPoint) drawPreviewEdge(ctx, edgeDrag, previewPoint, nodes, mode);
  for (const node of nodes)
    drawNode(
      ctx,
      node,
      hoverNodeId === node.id,
      selectedNodeIds.includes(node.id),
      hoverConnector,
      progressForNode?.(node) ?? null,
      mode,
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
  mode: GraphCompositionMode = "composition2d",
) {
  const rect = nodeRect(node);
  const { background: bg, border } = getGraphNodeRenderColors(node, mode);
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
    const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    gradient.addColorStop(0, "#3f2717");
    gradient.addColorStop(1, "#22150d");
    ctx.fillStyle = gradient;
  }
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  if (hovered || selected) {
    ctx.fillStyle = selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  }
  if (progress !== null) {
    ctx.fillStyle = node.kind === "group" ? "rgba(116,70,34,0.58)" : "rgba(42,82,122,0.58)";
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
  if (connector?.nodeId === node.id) drawConnectorDot(ctx, connector.point, nodeColors.port);
}
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: AnimationGraphEdge,
  nodes: GraphNode[],
  hovered = false,
  mode: GraphCompositionMode = "composition2d",
) {
  const from = nodes.find((node) => node.id === edge.fromNodeId);
  const to = nodes.find((node) => node.id === edge.toNodeId);
  if (!from || !to) return;
  const color = hovered ? "#7f8a99" : "#646b75";
  drawArrow(
    ctx,
    nodeCenter(from),
    nodeCenter(to),
    color,
    true,
    hovered,
    mode === "composition3d" ? getComposition3dEdgeControlState(edge, from, to) : undefined,
  );
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
function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  inlineControl: boolean,
  hovered = false,
  controlState?: { registered: boolean; label?: string },
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
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
    ctx.font = "800 12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.strokeText(state.label, point.x, point.y + 17, 140);
    ctx.fillStyle = "#eef2f7";
    ctx.fillText(state.label, point.x, point.y + 17, 140);
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

function getNodePlaybackProgress(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  currentTime: number,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  if (node.kind === "group") return getGroupNodePlaybackProgress(node, graph, currentTime);
  if (node.kind !== "time") return null;
  const renderableEdges = getRenderableEdges(graph, nodes, objects);
  const parameters = graph?.parameters?.[node.id];
  const start = getTimeNodeStart(
    node,
    graph,
    renderableEdges,
    nodes,
    new Set(),
  );
  const duration = parseSeconds(
    parameters?.duration ?? node.details?.duration ?? "0s",
  );
  return getTimePlaybackProgress({
    currentTime,
    start,
    duration,
    repeat: parameters?.repeat ?? node.details?.repeat,
    repeatType: parameters?.repeatType ?? node.details?.repeatType,
  });
}

function getGroupNodePlaybackProgress(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
  currentTime: number,
) {
  const groupId = node.details?.groupId;
  const group = groupId ? graph?.groups?.[groupId] : undefined;
  if (!group) return null;
  const nodes = buildGroupGraphNodes(group);
  const edges = filterPermittedEdges(filterRenderableEdges(group.edges ?? [], nodes), nodes);
  const connectedNodeIds = getConnectedToGroupOutNodeIds(edges, nodes, group.outNodeId);
  const groupGraph = {
    ...graph,
    nodes: group.nodes,
    edges,
    customNodes: group.customNodes,
    parameters: { ...(graph?.parameters ?? {}), ...(group.parameters ?? {}) },
  } satisfies AnimationGraphState;
  const progresses = nodes.flatMap((candidate) => {
    if (candidate.kind !== "time" || !connectedNodeIds.has(candidate.id)) return [];
    const start = getTimeNodeStart(candidate, groupGraph, edges, nodes, new Set());
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
  if (repeatCount === undefined) return Math.min(Math.max(elapsed / duration, 0), 1);
  if (repeatCount !== Infinity) {
    const totalDuration = duration + repeatCount * duration;
    if (elapsed >= totalDuration) {
      if (repeatType === "reverse" || repeatType === "mirror") return repeatCount % 2 === 0 ? 0 : 1;
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
  visiting: Set<string>,
): number {
  if (visiting.has(node.id)) return 0;
  visiting.add(node.id);
  const parameters = graph?.parameters?.[node.id];
  const delay = parseSeconds(parameters?.delay ?? node.details?.delay ?? "0s");
  const upstreamTimes = edges
    .filter((edge) => edge.toNodeId === node.id)
    .map((edge) => nodes.find((candidate) => candidate.id === edge.fromNodeId))
    .filter((candidate): candidate is GraphNode =>
      Boolean(candidate && candidate.kind === "time"),
    );
  if (!upstreamTimes.length) return delay;
  return (
    Math.max(
      ...upstreamTimes.map(
        (upstream) =>
          getTimeNodeStart(upstream, graph, edges, nodes, new Set(visiting)) +
          getTimeNodeDuration(upstream, graph),
      ),
    ) + delay
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

function Composition3dEdgeRegistrationDialog({
  state,
  graph,
  nodes,
  onOpenChange,
  onRegister,
  onDelete,
}: {
  state: EdgeRegistrationDialogState | null;
  graph: AnimationGraphState | undefined;
  nodes: GraphNode[];
  onOpenChange: (open: boolean) => void;
  onRegister: (edgeId: string, option: Composition3dConnectorOption) => void;
  onDelete: (edgeId: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  useEffect(() => { if (state) setClosing(false); }, [state]);
  const edge = state?.draft ?? (state?.edgeId ? graph?.edges?.find((item) => item.id === state.edgeId) : undefined);
  const from = edge ? nodes.find((node) => node.id === edge.fromNodeId) : undefined;
  const to = edge ? nodes.find((node) => node.id === edge.toNodeId) : undefined;
  const options = from && to ? getComposition3dConnectorOptions(from, to) : [];
  const selectedValue = edge?.fromSocket && edge.toSocket ? `${edge.fromSocket}->${edge.toSocket}` : "";
  const selectedOption = options.find((option) => option.value === selectedValue) ?? null;
  if (!state) return null;
  const close = () => {
    setClosing(true);
    window.setTimeout(() => onOpenChange(false), 120);
  };
  return (
    <div className={`fixed inset-0 z-[5000] bg-black/68 backdrop-blur-[2px] ${closing ? "animate-[clipper-dialog-overlay-out_120ms_ease-in_forwards]" : "animate-[clipper-dialog-overlay-in_180ms_ease-out_forwards]"}`} onPointerDown={close}>
      <div className={`fixed inset-0 m-auto grid h-fit max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-32px))] gap-4 overflow-visible rounded-2xl border border-[#333b49] bg-[#111722] p-5 text-[#f7f7f8] shadow-[0_24px_90px_rgba(0,0,0,0.56)] ${closing ? "animate-[clipper-dialog-out_120ms_ease-in_forwards]" : "animate-[clipper-dialog-in_190ms_cubic-bezier(0.16,1,0.3,1)_forwards]"}`} onPointerDown={(event) => event.stopPropagation()}>
        <button className="absolute right-4 top-4 grid size-7 place-items-center rounded-full text-[#9b9da7] outline-none transition hover:bg-[#20232c] hover:text-white" onClick={close}>
          <span className="text-2xl leading-none">×</span>
          <span className="sr-only">Close</span>
        </button>
        <div className="flex flex-col gap-1.5 pr-9">
          <div className="text-base font-extrabold text-white">Register Connector</div>
          <div className="text-sm leading-5 text-[#9b9da7]">Choose output/input mapping for this 3D connector.</div>
        </div>
        {from && to ? <Composition3dConnectorPreview from={from} to={to} edge={edge} /> : null}
        <div className="grid gap-2">
          <label className="grid gap-1.5 text-[11px] font-bold text-[#8d96a5]">
            Input / output mapping
            <Select
              value={selectedValue}
              onValueChange={(value) => {
                const option = options.find((item) => item.value === value);
                if (state && option?.compatible) onRegister(state.edgeId ?? "__draft__", option);
              }}
            >
              <SelectTrigger className="h-9 rounded-lg border-[#2f3848] bg-[#0b1018] text-[12px] font-semibold text-[#e7edf7] focus:ring-0">
                <SelectValue placeholder="Select connector mapping" />
              </SelectTrigger>
              <SelectContent className="z-[6000] border-[#2f3848] bg-[#101620] text-[#e7edf7]">
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value} disabled={!option.compatible} className={!option.compatible ? "text-[#687180] opacity-55" : undefined}>
                      {option.label}{option.compatible ? "" : " · incompatible"}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="rounded-lg border border-[#653438] bg-[#2a1114] px-3 py-2 text-[12px] font-extrabold text-[#ffb8bd] transition hover:border-[#b6535d] hover:bg-[#3a171b]"
            onClick={() => { state?.edgeId ? onDelete(state.edgeId) : close(); }}
          >
            Delete Connector
          </button>
          <button
            className="rounded-lg border border-[#323b4b] bg-[#171e2a] px-3 py-2 text-[12px] font-extrabold text-[#dce4f0] transition hover:border-[#596579] hover:bg-[#202838]"
            onClick={close}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function getComposition3dConnectorOptions(from: GraphNode, to: GraphNode): Composition3dConnectorOption[] {
  const outputs = getComposition3dOutputSocketOptions(from);
  const inputs = getComposition3dInputSocketOptions(to);
  return outputs
    .flatMap((output) => inputs.map((input) => ({
      value: `${output.id}->${input.id}`,
      label: input.label,
      fromSocket: output.id,
      toSocket: input.id,
      compatible: canConnectSocketTypes(output.socket, [input.socket]),
    })))
    .sort((left, right) => Number(right.compatible) - Number(left.compatible) || left.label.localeCompare(right.label));
}

function Composition3dConnectorPreview({ from, to, edge }: { from: GraphNode; to: GraphNode; edge?: AnimationGraphEdge }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fromWidth = getNodeGridWidth(from.label);
    const toWidth = getNodeGridWidth(to.label);
    const width = canvas.clientWidth || 480;
    const center = { x: width / 2, y: 60 };
    const gap = 156;
    const previewNodes = [
      { ...from, width: fromWidth, x: (center.x - gap / 2 - (fromWidth * gridSize) / 2) / gridSize, y: (center.y - (nodeHeight * gridSize) / 2) / gridSize },
      { ...to, width: toWidth, x: (center.x + gap / 2 - (toWidth * gridSize) / 2) / gridSize, y: (center.y - (nodeHeight * gridSize) / 2) / gridSize },
    ];
    const height = 120;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b0f16";
    ctx.fillRect(0, 0, width, height);
    drawArrow(ctx, nodeCenter(previewNodes[0]), nodeCenter(previewNodes[1]), "#646b75", true, false, { registered: true });
    ctx.font = "800 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#8f98a8";
    ctx.fillText("out", nodeCenter(previewNodes[0]).x, nodeRect(previewNodes[0]).y - 8);
    ctx.fillText(edge?.toSocket ?? "in", nodeCenter(previewNodes[1]).x, nodeRect(previewNodes[1]).y - 8);
    for (const node of previewNodes) drawNode(ctx, node, false, false, null, null, "composition3d");
  }, [edge?.fromSocket, edge?.toSocket, from, to]);
  return (
    <div className="overflow-hidden rounded-xl border border-[#273142] bg-[#0b0f16] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <canvas ref={canvasRef} className="block h-[120px] w-full bg-[#0b0f16]" width={420} height={120} />
    </div>
  );
}

function getComposition3dOutputSocketOptions(node: GraphNode): Composition3dSocketOption[] {
  const definition = getComposition3dSocketDefinition(getComposition3dGraphNodeKind(node));
  return definition ? [{ id: "out", label: "out", socket: definition.output }] : [];
}

function getComposition3dInputSocketOptions(node: GraphNode): Composition3dSocketOption[] {
  const kind = getComposition3dGraphNodeKind(node);
  const definition = getComposition3dSocketDefinition(kind);
  if (!kind || !definition) return [];
  if (kind === "out") return [{ id: "color", label: "color", socket: "universal" }];
  if (kind === "texture") return [{ id: "uv", label: "uv", socket: "universal" }];
  if (kind === "mx_noise_vec3" || kind === "split_x" || kind === "split_y" || kind === "abs" || kind === "sin" || kind === "fract") return [{ id: "value", label: "value", socket: kind === "mx_noise_vec3" || kind === "split_x" || kind === "split_y" ? "universal" : "scalar" }];
  if (kind === "vec2") return [
    { id: "x", label: "x", socket: "scalar" },
    { id: "y", label: "y", socket: "scalar" },
  ];
  if (kind === "mix") return [
    { id: "x", label: "x", socket: "universal" },
    { id: "y", label: "y", socket: "universal" },
    { id: "a", label: "a", socket: "scalar" },
  ];
  if (kind === "smoothstep") return [
    { id: "edge0", label: "edge0", socket: "scalar" },
    { id: "edge1", label: "edge1", socket: "scalar" },
    { id: "x", label: "x", socket: "scalar" },
  ];
  if (kind === "clamp") return [
    { id: "value", label: "value", socket: "scalar" },
    { id: "min", label: "min", socket: "scalar" },
    { id: "max", label: "max", socket: "scalar" },
  ];
  if (kind === "pow") return [
    { id: "value", label: "value", socket: "scalar" },
    { id: "exponent", label: "exponent", socket: "scalar" },
  ];
  if (kind === "max" || kind === "min") return [
    { id: "in0", label: "in0", socket: "scalar" },
    { id: "in1", label: "in1", socket: "scalar" },
  ];
  if (kind === "mul" || kind === "add" || kind === "sub" || kind === "div") return [
    { id: "in0", label: "in0", socket: "universal" },
    { id: "in1", label: "in1", socket: "universal" },
  ];
  return definition.accepts.length ? [{ id: "in", label: "in", socket: definition.accepts[0] }] : [];
}

function getComposition3dEdgeControlState(edge: AnimationGraphEdge, from: GraphNode, to: GraphNode) {
  if (!edge.fromSocket || !edge.toSocket) return { registered: false };
  const label = getComposition3dEdgeLabel(edge, from, to);
  return { registered: true, label };
}

function getComposition3dEdgeLabel(edge: AnimationGraphEdge, _from: GraphNode, to: GraphNode) {
  const inputLabel = getComposition3dInputSocketOptions(to).find((option) => option.id === edge.toSocket)?.label ?? edge.toSocket;
  return inputLabel ?? "";
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
  useEffect(() => { valueRef.current = value; }, [value]);
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
    return () => document.removeEventListener("pointerdown", commitOnOutsidePointer, true);
  }, [onCommit]);
  if (!node || !viewportRef.current) return null;
  const viewportRect = viewportRef.current.getBoundingClientRect();
  const rect = nodeRect(node);
  const left = viewportRect.left + rect.x * graphScale - viewportRef.current.scrollLeft;
  const top = viewportRect.top + rect.y * graphScale - viewportRef.current.scrollTop;
  const width = rect.width * graphScale;
  const height = rect.height * graphScale;
  return createPortal(
    <input
      ref={inputRef}
      className="fixed z-[6000] appearance-none border-0 px-2 text-center text-[12px] font-normal text-[#d9dee8] outline-none"
      style={{ left: left + graphScale, top: top + graphScale, width: Math.max(1, width - graphScale * 2), height: Math.max(1, height - graphScale * 2), background: nodeColors.groupBg }}
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

function GraphNodePopover({
  node,
  group,
  parameters,
  viewportRef,
  graphScale,
  onParameterChange,
  onGroupParameterChange,
  onGroupReplace,
  onPointerDownOutside,
}: {
  node: GraphNode | null;
  group?: AnimationGraphGroup;
  parameters?: Record<string, string>;
  viewportRef: RefObject<HTMLDivElement | null>;
  graphScale: number;
  onParameterChange: (nodeId: string, key: string, value: string) => void;
  onGroupParameterChange?: (groupId: string, nodeId: string, key: string, value: string) => void;
  onGroupReplace?: (groupId: string, nextGroup: AnimationGraphGroup) => void;
  onPointerDownOutside: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  if (!node) return null;
  const viewport = viewportRef.current;
  if (!viewport) return null;
  const details = getPopoverDetails(node, parameters);
  const isGroup = node.kind === "group";
  if (!isGroup && details.length === 0) return null;
  const schema = isGroup ? undefined : getParameterEditorSchema(node, details);
  const viewportRect = viewport.getBoundingClientRect();
  const rect = nodeRect(node);
  const width = isGroup ? Math.min(560, window.innerWidth - 32) : schema!.width;
  const height = isGroup ? Math.min(360, window.innerHeight - 32) : schema!.height;
  const nodeLeft =
    viewportRect.left + rect.x * graphScale - viewport.scrollLeft;
  const nodeTop = viewportRect.top + rect.y * graphScale - viewport.scrollTop;
  const nodeWidth = rect.width * graphScale;
  const nodeHeightPx = rect.height * graphScale;
  const left = isGroup
    ? Math.max(16, Math.min(nodeLeft + nodeWidth / 2 - width / 2, window.innerWidth - width - 16))
    : (() => {
        const preferredLeft = nodeLeft + nodeWidth + 12;
        const fallbackLeft = nodeLeft - width - 12;
        const minLeft = 8;
        const maxLeft = window.innerWidth - width - 8;
        return preferredLeft <= maxLeft
          ? preferredLeft
          : Math.max(minLeft, Math.min(fallbackLeft, maxLeft));
      })();
  const top = isGroup
    ? Math.max(16, Math.min(nodeTop - height - 16, window.innerHeight - height - 16))
    : (() => {
        const minTop = 8;
        const maxTop = window.innerHeight - height - 8;
        return Math.max(minTop, Math.min(nodeTop + nodeHeightPx / 2 - height / 2, maxTop));
      })();
  return createPortal(
    <div
      className="fixed inset-0 z-[5000]"
      onPointerDown={onPointerDownOutside}
    >
        <div
          className={`fixed z-[5000] overflow-hidden rounded-xl border text-[11px] text-[#cbd3df] shadow-[0_16px_44px_rgba(0,0,0,0.42)] backdrop-blur ${isGroup ? "border-[#394255] bg-[#0b0f16]" : "border-[#394255] bg-[#101620]/95 p-3"}`}
        style={{ left, top, width, height: isGroup ? height : undefined }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {isGroup ? (
          onGroupParameterChange && onGroupReplace ? (
            <GroupSubgraphPreview group={group} groupId={node.details?.groupId} onParameterChange={onGroupParameterChange} onGroupReplace={onGroupReplace} />
          ) : null
        ) : (
          <>
            <div className="mb-2 min-w-0 truncate text-[12px] font-extrabold text-white">
              {node.label}
            </div>
            <GraphParameterEditor
              schema={schema!}
              onChange={(key, value) => onParameterChange(node.id, key, value)}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function GroupSubgraphPreview({
  group,
  groupId,
  onParameterChange,
  onGroupReplace,
}: {
  group?: AnimationGraphGroup;
  groupId?: string;
  onParameterChange: (groupId: string, nodeId: string, key: string, value: string) => void;
  onGroupReplace: (groupId: string, nextGroup: AnimationGraphGroup) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const hoverConnectorRef = useRef<HoverConnector | null>(null);
  const layoutRef = useRef<{ groupId?: string; offsetX: number; offsetY: number; scrollWidth: number; scrollHeight: number; scrollLeft: number; scrollTop: number } | null>(null);
  const graphScaleRef = useRef(1);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverConnector, setHoverConnector] = useState<HoverConnector | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [popoverNodeId, setPopoverNodeId] = useState<string | null>(null);
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
  const width = groupPopupWidth;
  const height = groupPopupHeight;
  if (layoutRef.current?.groupId !== groupId) {
    const layout = getGroupGraphScrollLayout(buildGroupGraphNodes(editableGroup), width, height);
    layoutRef.current = { groupId, ...layout };
  }
  const getGroupViewData = () => {
    const layout = layoutRef.current ?? { offsetX: 0, offsetY: 0, scrollWidth: width, scrollHeight: height, scrollLeft: 0, scrollTop: 0 };
    const nodes = buildGroupGraphNodes(editableGroup).map((node) => ({
      ...node,
      x: node.x + layout.offsetX / gridSize,
      y: node.y + layout.offsetY / gridSize,
      ...(previewPositionsRef.current?.[node.id] ?? {}),
    }));
    const displayGraph = { nodes: editableGroup.nodes, edges: editableGroup.edges ?? [], customNodes: editableGroup.customNodes, groups: undefined, parameters: editableGroup.parameters } satisfies AnimationGraphState;
    return {
      layout,
      nodes,
      displayGraph,
      displayEdges: filterPermittedEdges(filterRenderableEdges(editableGroup.edges ?? [], nodes), nodes),
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
  const zoomGroupAtPoint = (nextScale: number, clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previousScale = graphScaleRef.current;
    const clamped = setGroupScaleValue(nextScale);
    const rect = viewport.getBoundingClientRect();
    const graphX = (viewport.scrollLeft + clientX - rect.left) / previousScale;
    const graphY = (viewport.scrollTop + clientY - rect.top) / previousScale;
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, graphX * clamped - (clientX - rect.left));
      viewport.scrollTop = Math.max(0, graphY * clamped - (clientY - rect.top));
      drawGroupCanvas();
    });
  };
  const onGroupWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (zoomEnabled && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      zoomGroupAtPoint(graphScaleRef.current * Math.exp(-normalizeWheelDelta(event) * 0.0012), event.clientX, event.clientY);
      return;
    }
    requestAnimationFrame(drawGroupCanvas);
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event, viewportRef.current);
    const drag = dragRef.current;
    if (drag?.kind === "node") {
      setPopoverNodeId(null);
      setHoverEdgeId(null);
      const position = getDraggedGraphNodePosition(event, drag, graphScaleRef.current);
      previewPositionsRef.current = { ...(previewPositionsRef.current ?? {}), [drag.nodeId]: position };
      drawGroupCanvas();
      return;
    }
    if (drag?.kind === "edge") {
      setPopoverNodeId(null);
      setHoverEdgeId(null);
      drag.x = point.x;
      drag.y = point.y;
      const view = getGroupViewData();
      const target = getGraphEdgeDrop(point, drag, view.nodes, graphScaleRef.current, view.displayGraph, []);
      updateHover(target?.nodeId ?? null, null);
      drawGroupCanvas();
      return;
    }
    if (drag?.kind === "marquee") {
      setPopoverNodeId(null);
      setHoverEdgeId(null);
      updateHover(null, null);
      drag.x = point.x;
      drag.y = point.y;
      if (!drag.active && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > marqueeThreshold) drag.active = true;
      drawGroupCanvas();
      return;
    }
    const view = getGroupViewData();
    updateGraphHoverState(point, view.nodes, graphScaleRef.current, view.displayGraph, updateHover, setHoverEdgeId, view.displayEdges);
  };
  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = canvasPoint(event, viewportRef.current);
    const bodyNode = hitNode(point, nodes, graphScaleRef.current);
    const connector = bodyNode ? null : hitHoverConnector(point, nodes, graphScaleRef.current, hoverConnectorRef.current);
    if (connector) {
      setPopoverNodeId(null);
      const source = nodes.find((node) => node.id === connector.nodeId);
      const start = source ? nodeCenter(source) : point;
      setSelectedNodeIds([connector.nodeId]);
      setHoverEdgeId(null);
      dragRef.current = { kind: "edge", fromNodeId: connector.nodeId, fromPort: connector.port, startX: start.x, startY: start.y, x: point.x, y: point.y };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const edge = hitEdge(point, displayEdges, nodes, graphScaleRef.current);
    if (edge) {
      setPopoverNodeId(null);
      setHoverEdgeId(null);
      commitGroup({ ...editableGroup, edges: (editableGroup.edges ?? []).filter((item) => item.id !== edge.id) });
      return;
    }
    const node = bodyNode;
    if (!node) {
      setPopoverNodeId(null);
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
    setSelectedNodeIds(event.shiftKey ? (selectedNodeIds.includes(node.id) ? selectedNodeIds.filter((id) => id !== node.id) : [...selectedNodeIds, node.id]) : [node.id]);
    setPopoverNodeId(null);
    setHoverEdgeId(null);
    dragRef.current = { kind: "node", nodeId: node.id, startClientX: event.clientX, startClientY: event.clientY, startX: node.x, startY: node.y };
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
      if (!moved) {
        const node = getGroupViewData().nodes.find((item) => item.id === drag.nodeId);
        setPopoverNodeId(node && getPopoverDetails(node, editableGroup.parameters?.[node.id]).length > 0 ? node.id : null);
      }
      const view = getGroupViewData();
      commitGroup({
        ...editableGroup,
        nodes: {
          ...editableGroup.nodes,
          [drag.nodeId]: { x: position.x - view.layout.offsetX / gridSize, y: position.y - view.layout.offsetY / gridSize },
        },
      });
    }
    if (drag?.kind === "edge") {
      setPopoverNodeId(null);
      const point = canvasPoint(event, viewportRef.current);
      const view = getGroupViewData();
      const target = getGraphEdgeDrop(point, drag, view.nodes, graphScaleRef.current, view.displayGraph, []);
      if (target && target.nodeId !== drag.fromNodeId) {
        const edge = createEdge(drag.fromNodeId, target.fromPort, target.nodeId, target.toPort);
        commitGroup({ ...editableGroup, edges: filterPermittedEdges([...view.displayEdges.filter((item) => item.id !== edge.id), edge], view.nodes) });
      }
    }
    if (drag?.kind === "marquee" && drag.active) {
      setPopoverNodeId(null);
      const view = getGroupViewData();
      setSelectedNodeIds(getMarqueeSelectionPreviewIds(drag, view.nodes, selectedNodeIds));
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
    const marqueeDrag = dragRef.current?.kind === "marquee" ? dragRef.current : null;
    const marqueeSelectedNodeIds = marqueeDrag?.active ? getMarqueeSelectionPreviewIds(marqueeDrag, view.nodes, selectedNodeIds) : selectedNodeIds;
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
      marqueeRect: marqueeDrag?.active ? normalizeMarqueeRect(marqueeDrag) : null,
    });
  };
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const layout = layoutRef.current;
    if (!viewport || !layout || layout.groupId !== groupId) return;
    requestAnimationFrame(() => {
      viewport.scrollLeft = layout.scrollLeft * graphScaleRef.current;
      viewport.scrollTop = layout.scrollTop * graphScaleRef.current;
      drawGroupCanvas();
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
      className="clipper-hidden-scrollbar relative h-[360px] min-w-0 overflow-auto bg-[#0b0f16]"
      onScroll={drawGroupCanvas}
      onWheel={onGroupWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { setPopoverNodeId(null); clearGraphDragState(dragRef, previewPositionsRef, updateHover, setHoverEdgeId); }}
      onPointerLeave={() => { updateHover(null, null); setHoverEdgeId(null); }}
    >
      {popoverNodeId ? (
        <GraphNodePopover
          node={nodes.find((node) => node.id === popoverNodeId) ?? null}
          parameters={editableGroup.parameters?.[popoverNodeId]}
          viewportRef={viewportRef}
          graphScale={graphScale}
          onParameterChange={(nodeId, key, value) => {
            if (!groupId) return;
            commitGroup({
              ...editableGroup,
              parameters: {
                ...(editableGroup.parameters ?? {}),
                [nodeId]: { ...(editableGroup.parameters?.[nodeId] ?? {}), [key]: value },
              },
            });
          }}
          onPointerDownOutside={() => setPopoverNodeId(null)}
        />
      ) : null}
    </GraphCanvasSurface>
  );
}

export function getPopoverDetails(
  node: GraphNode,
  parameters?: Record<string, string>,
) {
  if (node.kind === "group" || node.kind === "out") return [];
  const composition3dKind = getComposition3dGraphNodeKind(node);
  if (composition3dKind || node.details?.packageId?.startsWith("composition3d:")) return getComposition3dPopoverDetails(composition3dKind ?? "package", node, parameters);
  if (node.kind === "time") {
    return Object.entries(timeParameterDefaults).map(
      ([key, value]) => [key, parameters?.[key] ?? node.details?.[key] ?? value] as [string, string],
    );
  }
  const defaults =
    node.kind === "animation"
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

function getComposition3dPopoverDetails(
  kind: NonNullable<ReturnType<typeof getComposition3dGraphNodeKind>> | "package",
  node: GraphNode,
  parameters?: Record<string, string>,
) {
  const defaults: Array<[string, string]> = [["label", node.label]];
  if (kind === "color") defaults.push(["value", "[1, 1, 1, 1]"]);
  else if (kind === "texture") defaults.push(["asset", "assets/texture.png"]);
  else if (kind === "time") defaults.push(["scale", "1"], ["offset", "0"]);
  else if (kind === "mx_noise_vec3") defaults.push(["scale", "1"]);
  else if (kind === "mix") defaults.push(["factor", "0.5"]);
  else if (kind === "smoothstep") defaults.push(["edge0", "0"], ["edge1", "1"]);
  else if (kind === "mul" || kind === "add") defaults.push(["amount", "1"]);
  else defaults.push(["enabled", "1"]);
  return defaults.map(([key, value]) => [key, parameters?.[key] ?? node.details?.[key] ?? value] as [string, string]);
}

function getParameterEditorSchema(
  node: GraphNode,
  details: Array<[string, string]>,
): GraphParameterEditorSchema {
  const composition3dKind = getComposition3dGraphNodeKind(node);
  if (composition3dKind || node.details?.packageId?.startsWith("composition3d:")) return getComposition3dParameterEditorSchema(composition3dKind ?? "package", details);
  const definition =
    node.kind === "animation"
      ? getAnimationDefinition(node.details?.property)
      : undefined;
  if (definition) {
    const values = Object.fromEntries(details);
    return {
      width: definition.popover?.width ?? 210,
      height:
        definition.popover?.height ??
        Math.min(
          220,
          56 + definition.fieldGroups.flatMap((group) => group.fields).length * 34,
        ),
      groups: definition.fieldGroups.map((group) => ({
        id: group.id,
        label: group.label,
        columns: group.columns,
        fields: group.fields.map((field) => ({
          key: field.key,
          label: field.label,
          value: values[field.key] ?? field.defaultValue,
          unit: getGraphParameterUnit(field.key),
          options: graphParameterOptions[field.key],
        })),
      })),
    };
  }

  return {
    width: 210,
    height: Math.min(220, 56 + details.length * 34),
    groups: [
      {
        id: "parameters",
          fields: details.map(([key, value]) => ({ key, label: key, value, unit: getGraphParameterUnit(key), options: graphParameterOptions[key] })),
      },
    ],
  };
}

export function getGraphNodeParameterEditorSchema(node: GraphNode, parameters?: Record<string, string>) {
  const details = getPopoverDetails(node, parameters);
  if (details.length === 0) return null;
  return getParameterEditorSchema(node, details);
}

function getComposition3dParameterEditorSchema(
  kind: NonNullable<ReturnType<typeof getComposition3dGraphNodeKind>> | "package",
  details: Array<[string, string]>,
): GraphParameterEditorSchema {
  const textFields = new Set(["label", "asset", "value"]);
  const labelByKey: Record<string, string> = {
    asset: "Asset",
    edge0: "Edge 0",
    edge1: "Edge 1",
    factor: "Factor",
    label: "Label",
    value: "Value",
  };
  return {
    width: kind === "texture" || kind === "color" ? 260 : 220,
    height: Math.min(260, 58 + details.length * 34),
    groups: [
      {
        id: "composition3d",
        label: "TSL parameters",
        fields: details.map(([key, value]) => ({
          key,
          label: labelByKey[key] ?? titleCase(key),
          value,
          type: textFields.has(key) ? "text" : "number",
        })),
      },
    ],
  };
}

function titleCase(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function getGraphParameterUnit(key: string) {
  return key === "delay" || key === "duration" ? "s" : undefined;
}

function getGraphNodeColors(kind: GraphNode["kind"]) {
  if (kind === "animation") return { background: nodeColors.animationBg, border: nodeColors.animationBorder };
  if (kind === "time") return { background: nodeColors.timeBg, border: nodeColors.timeBorder };
  if (kind === "group") return { background: nodeColors.groupBg, border: nodeColors.groupBorder };
  if (kind === "out") return { background: nodeColors.outBg, border: nodeColors.outBorder };
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
