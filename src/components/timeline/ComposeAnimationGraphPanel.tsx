import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ContextMenuState } from "../../app/types";
import {
  animationDefinitions,
  getAnimationDefinition,
  getAnimationDefinitionCategories,
} from "../../core/animations/registry";
import { roundTenth } from "../../core/math";
import { formatTime, getTimelineTicks } from "../../core/timeline";
import type {
  AnimationGraphCustomNode,
  AnimationGraphEdge,
  AnimationGraphPort,
  AnimationGraphState,
  FrameObject,
  LayerAnimation,
  Part,
} from "../../core/types";
import { AppContextMenu } from "../AppContextMenu";
import type { TimelineViewportState } from "../../core/types";
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
};

type GraphNode = {
  id: string;
  label: string;
  kind: "layer" | "animation" | "time";
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
    };
type GraphContextMenuPoint = {
  graphX: number;
  graphY: number;
  nodeId?: string;
};

const gridSize = 18;
const minNodeWidth = 3;
const maxNodeWidth = 12;
const nodeHeight = 2;
const nodeGap = 4;
const portGap = 7;
const connectorHoverRadius = 26;
const connectorHitRadius = 26;
const nodeColors = {
  animationBg: "#382234",
  animationBorder: "#8a557b",
  timeBg: "#1b3143",
  timeBorder: "#7ea8d8",
  layerBg: "#252b35",
  layerBorder: "#566171",
  hoverBorder: "#a8b0bd",
  port: "#b8c0cc",
  text: "#d9dee8",
};
const minGraphScale = 0.35;
const maxGraphScale = 2.5;

function clampGraphScale(scale: number) {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(Math.max(scale, minGraphScale), maxGraphScale);
}

function normalizeWheelDelta(event: WheelEvent) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 600;
  return event.deltaY;
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
    const pendingPopoverNodeIdRef = useRef<string | null>(null);
    const frameRef = useRef<number | null>(null);
    const activationFrameRef = useRef<number | null>(null);
    const playbackFrameRef = useRef<number | null>(null);
    const currentTimeRef = useRef(currentTime);
    const partRef = useRef<Part | null>(null);
    const graphRef = useRef<AnimationGraphState | undefined>(undefined);
    const nodesRef = useRef<GraphNode[]>([]);
    const selectedObjectsRef = useRef<FrameObject[]>([]);
    const viewInitializedRef = useRef(false);
    const hoverNodeIdRef = useRef<string | null>(null);
    const hoverConnectorRef = useRef<HoverConnector | null>(null);
    const hoverEdgeIdRef = useRef<string | null>(null);
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
    const [hoverConnector, setHoverConnector] = useState<HoverConnector | null>(
      null,
    );
    const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
    const [optimisticGraph, setOptimisticGraph] =
      useState<AnimationGraphState | null>(null);
    const [popoverNodeId, setPopoverNodeId] = useState<string | null>(null);
    const popoverNodeIdRef = useRef<string | null>(null);
    const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<
      string | null
    >(null);
    const selectedGraphNodeIdRef = useRef<string | null>(null);
    const deleteCustomNodeRef = useRef<(nodeId: string) => void>(() => undefined);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
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
    const projectGraph = part?.animationGraph;
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
    const graphInstanceKey = `${part?.id ?? "__none__"}:${graphViewportKey}`;
    const hasSelectedGraph = selectedObjects.length > 0;
    const nodes = hasSelectedGraph
      ? buildGraphNodes(
          selectedObjects,
          graph,
          baseGraphWorldWidth,
          baseGraphWorldHeight,
          graphViewportKey,
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
      .map((node) => `${node.id}:${node.x},${node.y},${node.width},${node.height}`)
      .join("|");
    partRef.current = part;
    graphRef.current = graph;
    nodesRef.current = nodes;
    selectedObjectsRef.current = selectedObjects;
    selectedGraphNodeIdRef.current = selectedGraphNodeId;
    popoverNodeIdRef.current = popoverNodeId;
    deleteCustomNodeRef.current = deleteCustomNode;

    useLayoutEffect(() => {
      setOptimisticGraph(null);
      viewInitializedRef.current = false;
      selectedGraphNodeIdRef.current = null;
      setSelectedGraphNodeId(null);
      graphScaleRef.current = 1;
      setGraphScale(1);
    }, [graphInstanceKey]);

    useEffect(() => {
      function onKeyDown(event: KeyboardEvent) {
        if (event.defaultPrevented) return;
        if (event.key !== "Backspace" && event.key !== "Delete") return;
        if (
          isEditableKeyboardTarget(event.target) ||
          isEditableKeyboardTarget(document.activeElement)
        )
          return;
        const selectedNodeId = selectedGraphNodeIdRef.current;
        if (!selectedNodeId || !isCustomGraphNode(selectedNodeId, graphRef.current)) return;
        event.preventDefault();
        deleteCustomNodeRef.current(selectedNodeId);
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
      if (!optimisticGraph || !projectGraph) return;
      if (JSON.stringify(optimisticGraph) === JSON.stringify(projectGraph))
        setOptimisticGraph(null);
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

    function draw() {
      const canvas = canvasRef.current;
      const viewport = graphViewportRef.current;
      if (!canvas || !viewport) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const ratio = window.devicePixelRatio || 1;
      const scaledWidth = Math.max(1, viewport.clientWidth);
      const scaledHeight = Math.max(1, viewport.clientHeight);
      const backingWidth = Math.round(scaledWidth * ratio);
      const backingHeight = Math.round(scaledHeight * ratio);
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      canvas.style.width = `${scaledWidth}px`;
      canvas.style.height = `${scaledHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, scaledWidth, scaledHeight);
      ctx.fillStyle = "#0b0f16";
      ctx.fillRect(0, 0, scaledWidth, scaledHeight);
      ctx.translate(-viewport.scrollLeft, -viewport.scrollTop);
      ctx.scale(graphScaleRef.current, graphScaleRef.current);
      const currentPart = partRef.current;
      const currentSelectedObjects = selectedObjectsRef.current;
      if (!currentPart)
        return drawMessage(
          ctx,
          graphCanvasWidth,
          graphCanvasHeight,
          "Move the playhead over a composition to edit its animation graph.",
        );
      if (currentSelectedObjects.length === 0) return;
      const currentGraph = graphRef.current;
      const currentNodes = nodesRef.current;
      const drawNodes = currentNodes.map((node) => ({
        ...node,
        ...(previewPositionsRef.current?.[node.id] ?? {}),
      }));
      for (const edge of getRenderableEdges(
        currentGraph,
        drawNodes,
        currentSelectedObjects,
      ))
        drawEdge(ctx, edge, drawNodes, hoverEdgeIdRef.current === edge.id);
      const edgeDrag =
        dragRef.current?.kind === "edge" ? dragRef.current : null;
      if (edgeDrag)
        drawPreviewEdge(ctx, edgeDrag, {
          x: pointerRef.current.x / graphScaleRef.current,
          y: pointerRef.current.y / graphScaleRef.current,
        });
      for (const node of drawNodes)
        drawNode(
          ctx,
          node,
          hoverNodeIdRef.current === node.id,
          selectedGraphNodeIdRef.current === node.id,
          hoverConnectorRef.current,
          getNodePlaybackProgress(
            node,
            currentGraph,
            currentTimeRef.current,
            drawNodes,
            currentSelectedObjects,
          ),
        );
    }

    function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
      const point = canvasPoint(event, graphViewportRef.current);
      pointerRef.current = point;
      const drag = dragRef.current;
      if (drag?.kind === "node") {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        updateHoverEdge(null);
        const dx =
          (event.clientX - drag.startClientX) / (gridSize * graphScale);
        const dy =
          (event.clientY - drag.startClientY) / (gridSize * graphScale);
        previewPositionsRef.current = {
          ...(previewPositionsRef.current ?? {}),
          [drag.nodeId]: { x: drag.startX + dx, y: drag.startY + dy },
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
        const target = getEdgeDropTarget(
          point,
          drag.fromNodeId,
          nodesRef.current,
          graphScale,
          graphRef.current,
          selectedObjects,
        );
        updateHover(target?.nodeId ?? null, null);
        scheduleDraw();
        return;
      }
      const hoveredNode = hitNode(point, nodesRef.current, graphScale);
      const hoveredInteractiveNode =
        hoveredNode && isInteractiveGraphNode(hoveredNode, graphRef.current)
          ? hoveredNode
          : null;
      const connectorNode =
        hoveredNode ??
        hitNode(point, nodesRef.current, graphScale) ??
        hitNodeLoose(point, nodesRef.current, graphScale) ??
        null;
      const connector = connectorNode
        ? getNodeHoverConnector(point, connectorNode, graphScale)
        : null;
      updateHover(hoveredInteractiveNode?.id ?? null, connector);
      const edge = connector
        ? null
        : hitEdge(
            point,
            getRenderableEdges(
              graphRef.current,
              nodesRef.current,
              selectedObjects,
            ),
            nodesRef.current,
            graphScale,
          );
      updateHoverEdge(edge?.id ?? null);
    }

    function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(null);
      const point = canvasPoint(event, graphViewportRef.current);
      const connector =
        getActiveHoverConnector(
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
        getRenderableEdges(graphRef.current, nodesRef.current, selectedObjects),
        nodesRef.current,
        graphScale,
      );
      if (edge) {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        selectGraphNode(null);
        updateHoverEdge(null);
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
          parameters: graph?.parameters,
          deletedNodeIds: graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        }));
        scheduleDraw();
        return;
      }
      const node = hitNode(point, nodesRef.current, graphScale);
      if (!node) {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        selectGraphNode(null);
        return;
      }
      if (node.kind === "layer") {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        selectGraphNode(node.id);
        return;
      }
      if (
        getPopoverDetails(node, graphRef.current?.parameters?.[node.id])
          .length === 0
      ) {
        pendingPopoverNodeIdRef.current = null;
        setPopoverNodeId(null);
        return;
      }
      pendingPopoverNodeIdRef.current = node.id;
      selectGraphNode(node.id);
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
          parameters: graph?.parameters,
          deletedNodeIds: graph?.deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        }));
        const moved = position.x !== drag.startX || position.y !== drag.startY;
        if (!moved && pendingPopoverNodeIdRef.current === drag.nodeId)
          setPopoverNodeId(drag.nodeId);
      }
      if (drag?.kind === "edge") {
        const target = getEdgeDropTarget(
          canvasPoint(event, graphViewportRef.current),
          drag.fromNodeId,
          nodesRef.current,
          graphScale,
          graphRef.current,
          selectedObjects,
        );
        if (target && target.nodeId !== drag.fromNodeId) {
          const edge: AnimationGraphEdge = {
            id: `${drag.fromNodeId}:${target.fromPort}->${target.nodeId}:${target.toPort}`,
            fromNodeId: drag.fromNodeId,
            fromPort: target.fromPort,
            toNodeId: target.nodeId,
            toPort: target.toPort,
          };
          const currentEdges = filterPermittedEdges(
            getRenderableEdges(
              graphRef.current,
              nodesRef.current,
              selectedObjects,
            ),
            nodesRef.current,
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
            parameters: graph?.parameters,
            deletedNodeIds: graph?.deletedNodeIds,
            viewport: graph?.viewport,
            viewports: graph?.viewports,
          }));
        }
      }
      pendingPopoverNodeIdRef.current = null;
      previewPositionsRef.current = null;
      updateHover(null, null);
      updateHoverEdge(null);
      scheduleDraw();
    }

    function onPointerCancel() {
      dragRef.current = null;
      previewPositionsRef.current = null;
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
      setSelectedGraphNodeId(nodeId);
      scheduleDraw();
    }

    function commitGraphUpdate(
      updater: (graph: AnimationGraphState | undefined) => AnimationGraphState,
      options: { local?: boolean; implicit?: boolean } = {},
    ) {
      const nextGraph = stripGraphViewportState(updater(graphRef.current));
      graphRef.current = nextGraph;
      nodesRef.current = buildGraphNodes(
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
        customNodes: materializeGraphNodeDefinitions(
          nodesRef.current,
          graph?.customNodes,
          graphViewportKey,
        ),
        parameters: {
          ...(graph?.parameters ?? {}),
          [nodeId]: { ...(graph?.parameters?.[nodeId] ?? {}), [key]: value },
        },
        deletedNodeIds: graph?.deletedNodeIds,
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
    }

    function openContextMenu(event: MouseEvent<HTMLCanvasElement>) {
      event.preventDefault();
      event.stopPropagation();
      const point = canvasPoint(event, graphViewportRef.current);
      setPopoverNodeId(null);
      const node = hitNode(point, nodesRef.current, graphScale);
      const nodeId = node?.id;
      selectGraphNode(nodeId ?? null);
      contextMenuPointRef.current = {
        graphX: point.x / graphScale / gridSize,
        graphY: point.y / graphScale / gridSize,
        nodeId,
      };
      const items =
        nodeId && isCustomGraphNode(nodeId, graphRef.current)
          ? [
              {
                label: "Delete",
                danger: true,
                action: () => deleteCustomNode(nodeId),
              },
            ]
          : [
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
        deletedNodeIds: graph?.deletedNodeIds?.filter((deletedId) => deletedId !== id),
        viewport: graph?.viewport,
        viewports: graph?.viewports,
      }));
      contextMenuPointRef.current = null;
      setContextMenu(null);
    }

    function deleteCustomNode(nodeId: string) {
      if (!isCustomGraphNode(nodeId, graphRef.current)) return;
      commitGraphUpdate((graph) => {
        const { [nodeId]: _removedNode, ...customNodes } =
          graph?.customNodes ?? {};
        const { [nodeId]: _removedPosition, ...nodes } = graph?.nodes ?? {};
        const { [nodeId]: _removedParameters, ...parameters } =
          graph?.parameters ?? {};
        const deletedNodeIds = Array.from(
          new Set([...(graph?.deletedNodeIds ?? []), nodeId]),
        );
        return {
          nodes,
          edges: (graph?.edges ?? []).filter(
            (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId,
          ),
          customNodes: Object.keys(customNodes).length
            ? customNodes
            : undefined,
          parameters: Object.keys(parameters).length ? parameters : undefined,
          deletedNodeIds,
          viewport: graph?.viewport,
          viewports: graph?.viewports,
        };
      });
      if (selectedGraphNodeIdRef.current === nodeId) selectGraphNode(null);
      if (popoverNodeIdRef.current === nodeId) setPopoverNodeId(null);
      contextMenuPointRef.current = null;
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
          <div className="relative z-10 flex items-center gap-3">
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
              key={marker.nodeId}
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
        <div
          ref={graphViewportRef}
          className="clipper-hidden-scrollbar relative min-h-0 overflow-auto rounded-b-[18px] bg-[#0b0f16]"
          onPointerDown={(event) => event.stopPropagation()}
          onScroll={onGraphScroll}
          onWheel={onGraphWheel}
        >
          {hasSelectedGraph ? (
            <>
              <div className="sticky left-0 top-0 z-10 h-0 overflow-visible">
                <canvas
                  ref={canvasRef}
                  className={`block bg-[#0b0f16] ${hoverNodeId ? "cursor-pointer" : "cursor-default"}`}
                  width={1}
                  height={1}
                  onContextMenu={openContextMenu}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                />
              </div>
              <div
                className="relative bg-[#0b0f16]"
                style={{
                  width: graphScrollWidth,
                  height: graphScrollHeight,
                }}
                aria-hidden="true"
              />
              {popoverNodeId ? (
                <GraphNodePopover
                  node={nodes.find((node) => node.id === popoverNodeId) ?? null}
                  parameters={graph?.parameters?.[popoverNodeId]}
                  viewportRef={graphViewportRef}
                  graphScale={graphScale}
                  onParameterChange={updateNodeParameter}
                  onPointerDownOutside={closePopoverOnOutsidePointer}
                />
              ) : null}
              <AppContextMenu
                menu={contextMenu}
                onClose={() => {
                  contextMenuPointRef.current = null;
                  setContextMenu(null);
                }}
              />
              <button
                className="sticky bottom-3 left-3 z-40 rounded-full border border-[#303746] bg-[#121722]/90 px-3 py-1.5 text-[11px] font-semibold text-[#c7ceda] shadow-[0_10px_30px_rgba(0,0,0,0.28)] transition hover:border-[#5f6878] hover:text-white"
                title="Scroll to selected layer node at 100%"
                onClick={focusMainLayerNode}
                onPointerDown={(event) => event.stopPropagation()}
              >
                Scroll to node
              </button>
            </>
          ) : (
            <div className="grid h-full min-h-[220px] place-items-center text-center text-sm font-semibold text-[#8b93a3]">
              Select a layer to view animation graph
            </div>
          )}
        </div>
      </footer>
    );
  },
);

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
    .map(([id, node]) =>
      createNode(
        id,
        node.label,
        node.kind,
        graph?.nodes[id] ?? { x: 2, y: 2 },
        node.details,
      ),
    );
  return [...derivedNodes, ...customNodes];
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
  return {
    id,
    label,
    kind,
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
  return nodes.flatMap((node) => {
    if (node.kind !== "time" || !connectedNodeIds.has(node.id)) return [];
    return [
      {
        nodeId: node.id,
        delay: Math.max(
          0,
          getTimeNodeStart(node, graph, edges, nodes, new Set()),
        ),
        label: node.label,
      },
    ];
  });
}

function getRenderableEdges(
  graph: AnimationGraphState | undefined,
  nodes: GraphNode[],
  objects: FrameObject[],
) {
  const automatic = hasMaterializedCodeGraph(graph, nodes)
    ? []
    : getAutoEdges(objects);
  const persisted = filterPermittedEdges(
    filterStaleAutoEdges(
      filterRenderableEdges(graph?.edges ?? [], nodes),
      nodes,
    ),
    nodes,
  );
  return filterPermittedEdges(
    Array.from(
      new Map(
        [...automatic, ...persisted].map((edge) => [edge.id, edge]),
      ).values(),
    ),
    nodes,
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

function isPermittedGraphEdge(
  edge: AnimationGraphEdge,
  nodes: GraphNode[],
  existingEdges: AnimationGraphEdge[] = [],
) {
  const from = nodes.find((node) => node.id === edge.fromNodeId);
  const to = nodes.find((node) => node.id === edge.toNodeId);
  if (!from || !to) return false;
  if (from.kind === "animation" && to.kind === "time")
    return !hasDuplicateEffectForTimeNode(from, to.id, existingEdges, nodes);
  if (from.kind === "time" && to.kind === "layer") return true;
  if (from.kind === "time" && to.kind === "time")
    return !pathExists(edge.toNodeId, edge.fromNodeId, existingEdges);
  return false;
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

function filterPermittedEdges(edges: AnimationGraphEdge[], nodes: GraphNode[]) {
  const accepted: AnimationGraphEdge[] = [];
  for (const edge of edges) {
    if (isPermittedGraphEdge(edge, nodes, accepted)) accepted.push(edge);
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
): AnimationGraphEdge {
  return {
    id: `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`,
    fromNodeId,
    fromPort,
    toNodeId,
    toPort,
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
    if (node.kind === "layer") continue;
    next[node.id] = {
      ...(next[node.id] ?? {}),
      kind: node.kind,
      label: node.label,
      scopeKey: graphViewportKey,
      details: node.details,
    };
  }
  return Object.keys(next).length ? next : undefined;
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
  return isPermittedGraphEdge(edge, nodes, existingEdges)
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
function drawNode(
  ctx: CanvasRenderingContext2D,
  node: GraphNode,
  hovered: boolean,
  selected: boolean,
  connector: HoverConnector | null,
  progress: number | null = null,
) {
  const rect = nodeRect(node);
  const bg =
    node.kind === "animation"
      ? nodeColors.animationBg
      : node.kind === "time"
        ? nodeColors.timeBg
        : nodeColors.layerBg;
  const border =
    node.kind === "animation"
      ? nodeColors.animationBorder
      : node.kind === "time"
        ? nodeColors.timeBorder
        : nodeColors.layerBorder;
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.globalAlpha = node.kind === "time" ? 0.82 : 1;
  ctx.lineWidth = selected ? 2.5 : hovered ? 2 : 1.5;
  if (hovered || selected) {
    ctx.shadowColor = border;
    ctx.shadowBlur = selected ? 18 : 14;
  }
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  if (hovered || selected) {
    ctx.fillStyle = selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
  }
  if (progress !== null) {
    const fill = ctx.createLinearGradient(
      rect.x,
      rect.y,
      rect.x + rect.width,
      rect.y,
    );
    fill.addColorStop(0, "rgba(42,82,122,0.72)");
    fill.addColorStop(1, "rgba(31,61,92,0.42)");
    ctx.fillStyle = fill;
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
  if (connector?.nodeId === node.id) drawConnectorDot(ctx, connector.point);
}
function drawEdge(
  ctx: CanvasRenderingContext2D,
  edge: AnimationGraphEdge,
  nodes: GraphNode[],
  hovered = false,
) {
  const from = nodes.find((node) => node.id === edge.fromNodeId);
  const to = nodes.find((node) => node.id === edge.toNodeId);
  if (!from || !to) return;
  drawArrow(
    ctx,
    nodeCenter(from),
    nodeCenter(to),
    hovered ? "#7f8a99" : "#646b75",
    true,
    hovered,
  );
}
function drawPreviewEdge(
  ctx: CanvasRenderingContext2D,
  edge: Extract<DragState, { kind: "edge" }>,
  point: { x: number; y: number },
) {
  drawArrow(ctx, { x: edge.startX, y: edge.startY }, point, "#d8dee9", false);
}
function drawConnectorDot(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
) {
  ctx.fillStyle = nodeColors.port;
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
  );
}
function drawEdgeControl(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  angle: number,
  hovered = false,
) {
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
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-3, -5);
  ctx.lineTo(3, 0);
  ctx.lineTo(-3, 5);
  ctx.stroke();
  ctx.restore();
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
  if (duration <= 0) return currentTime >= start ? 1 : 0;
  return Math.min(Math.max((currentTime - start) / duration, 0), 1);
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

function GraphNodePopover({
  node,
  parameters,
  viewportRef,
  graphScale,
  onParameterChange,
  onPointerDownOutside,
}: {
  node: GraphNode | null;
  parameters?: Record<string, string>;
  viewportRef: RefObject<HTMLDivElement | null>;
  graphScale: number;
  onParameterChange: (nodeId: string, key: string, value: string) => void;
  onPointerDownOutside: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  if (!node) return null;
  const viewport = viewportRef.current;
  if (!viewport) return null;
  const details = getPopoverDetails(node, parameters);
  if (details.length === 0) return null;
  const schema = getParameterEditorSchema(node, details);
  const viewportRect = viewport.getBoundingClientRect();
  const rect = nodeRect(node);
  const { width, height } = schema;
  const nodeLeft =
    viewportRect.left + rect.x * graphScale - viewport.scrollLeft;
  const nodeTop = viewportRect.top + rect.y * graphScale - viewport.scrollTop;
  const nodeWidth = rect.width * graphScale;
  const nodeHeightPx = rect.height * graphScale;
  const preferredLeft = nodeLeft + nodeWidth + 12;
  const fallbackLeft = nodeLeft - width - 12;
  const minLeft = viewportRect.left + 8;
  const maxLeft = viewportRect.right - width - 8;
  const minTop = viewportRect.top + 8;
  const maxTop = viewportRect.bottom - height - 8;
  const left =
    preferredLeft <= maxLeft
      ? preferredLeft
      : Math.max(minLeft, Math.min(fallbackLeft, maxLeft));
  const top = Math.max(
    minTop,
    Math.min(nodeTop + nodeHeightPx / 2 - height / 2, maxTop),
  );
  return createPortal(
    <div
      className="fixed inset-0 z-[1000]"
      onPointerDown={onPointerDownOutside}
    >
      <div
        className="fixed rounded-xl border border-[#394255] bg-[#101620]/95 p-3 text-[11px] text-[#cbd3df] shadow-[0_16px_44px_rgba(0,0,0,0.42)] backdrop-blur"
        style={{ left, top, width }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="mb-2 min-w-0 truncate text-[12px] font-extrabold text-white">
          {node.label}
        </div>
        <GraphParameterEditor
          schema={schema}
          onChange={(key, value) => onParameterChange(node.id, key, value)}
        />
      </div>
    </div>,
    document.body,
  );
}

function getPopoverDetails(
  node: GraphNode,
  parameters?: Record<string, string>,
) {
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

function getParameterEditorSchema(
  node: GraphNode,
  details: Array<[string, string]>,
): GraphParameterEditorSchema {
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
        fields: details.map(([key, value]) => ({ key, label: key, value })),
      },
    ],
  };
}

function isInteractiveGraphNode(
  node: GraphNode,
  graph: AnimationGraphState | undefined,
) {
  return (
    node.kind !== "layer" &&
    getPopoverDetails(node, graph?.parameters?.[node.id]).length > 0
  );
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
