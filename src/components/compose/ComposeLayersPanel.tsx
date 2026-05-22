import {
  Braces,
  Camera,
  ChartNoAxesColumn,
  ChevronRight,
  Code,
  Code2,
  Eye,
  EyeOff,
  Frame,
  Image,
  Layers,
  Lock,
  Palette,
  PenTool,
  Type,
  Unlock,
} from "lucide-react";
import {
  ArrowIcon,
  EllipseIcon,
  LineIcon,
  NullObjectIcon,
  PolygonIcon,
  RectIcon,
  StarIcon,
} from "../ShapeIcons";
import type { PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { memo } from "react";
import type { FrameObject, Part } from "../../core/types";
import { useDragAutoScroll } from "../../lib/useDragAutoScroll";
import { MarqueeSelectionBox } from "../timeline/TimelineSelectionBox";
import {
  buildComposeLayerTree,
  countComposeLayerNodes,
  getComposeLayerDropTarget as getComposeLayerDropTargetForTree,
  getComposeLayerNodeObjects,
  getComposeLayerReorderTargetIndex,
  syncComposeSelectedLayerIds,
  type ComposeLayerNode,
} from "./composeLayerTree";
import {
  NativeTree,
  type NativeTreeApi,
  type NativeTreeDragPreviewProps,
  type NativeTreeDropTarget,
  type NativeTreeGetDropTargetArgs,
  type NativeTreeNodeApi,
  type NativeTreeNodeRendererProps,
} from "../tree/NativeTree";

const composeLayerRowHeight = 30;
const composeLayerIndent = 24;
const composeLayerMinDropHeight = 360;

type ComposeLayersPanelProps = {
  part: Part;
  selectedObjectIds: string[];
  onSelectObjects: (objects: FrameObject[]) => void;
  onSelectFrameSettings: () => void;
  onHoverObject: (object: FrameObject | null) => void;
  onReorderObjects: (objectIds: string[], targetIndex: number) => void;
  onToggleLayerHidden?: (layerId: string) => void;
  onToggleLayerLocked?: (layerId: string) => void;
};

export function ComposeLayersPanel(props: ComposeLayersPanelProps) {
  return <MemoizedComposeLayersPanel {...props} />;
}

const MemoizedComposeLayersPanel = memo(function ComposeLayersPanelContent({
  part,
  selectedObjectIds,
  onSelectObjects,
  onSelectFrameSettings,
  onHoverObject,
  onReorderObjects,
  onToggleLayerHidden,
  onToggleLayerLocked,
}: ComposeLayersPanelProps) {
  const [openById, setOpenById] = useState<Record<string, boolean>>({
    root: true,
    frame: true,
    background: true,
    objects: true,
  });
  const [selectedLayerIds, setSelectedLayerIds] =
    useState<string[]>(selectedObjectIds);
  const [dropCursorVisible, setDropCursorVisible] = useState(false);
  const [dropPointerY, setDropPointerY] = useState<number | null>(null);
  const [dropTop, setDropTop] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const nativeTreeRef = useRef<NativeTreeApi<ComposeLayerNode> | undefined>(
    undefined,
  );
  const marqueeSelectionRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
    active: boolean;
    startScrollTop: number;
  } | null>(null);
  const marqueePointerRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );
  const previousSelectedObjectIdsRef = useRef<string[]>(selectedObjectIds);
  const treeData = useMemo(() => buildComposeLayerTree(part), [part]);
  const treeHeight = Math.max(
    composeLayerMinDropHeight,
    countComposeLayerNodes(treeData) * composeLayerRowHeight,
  );
  const {
    updateDragAutoScroll: updateMarqueeAutoScroll,
    stopDragAutoScroll: stopMarqueeAutoScroll,
  } = useDragAutoScroll({
    getScrollElement: () => getComposeLayersScrollElement(treeRef.current),
    axis: "y",
  });

  useEffect(() => {
    const previousSelectedObjectIds = previousSelectedObjectIdsRef.current;
    previousSelectedObjectIdsRef.current = selectedObjectIds;
    setSelectedLayerIds((current) =>
      syncComposeSelectedLayerIds(
        current,
        selectedObjectIds,
        previousSelectedObjectIds,
        treeData,
      ),
    );
  }, [selectedObjectIds, treeData]);

  const updateDragPosition = useCallback(
    (isDragging: boolean, mouse: { x: number; y: number } | null) => {
      const rect = treeRef.current?.getBoundingClientRect();
      if (!isDragging || !mouse || !rect) {
        setDropCursorVisible(false);
        setDropPointerY(null);
        setDropTop(null);
        return;
      }

      const localX = mouse.x - rect.left;
      const localY = mouse.y - rect.top;
      setDropPointerY(localY);
      setDropCursorVisible(
        localX >= 0 &&
          localX <= rect.width &&
          localY >= 0 &&
          localY <= treeHeight,
      );
    },
    [treeHeight],
  );

  const moveObjectLayers = useCallback(
    ({ dragIds, parentId, index }: NativeTreeDropTarget) => {
      if (parentId !== "objects") return;
      onReorderObjects(
        dragIds,
        getComposeLayerReorderTargetIndex(
          part.objects.length,
          dragIds.length,
          index,
        ),
      );
    },
    [onReorderObjects, part.objects.length],
  );

  function toggleLayerNode(node: NativeTreeNodeApi<ComposeLayerNode>) {
    if (!node.isInternal) return;
    const nextOpen = !(openById[node.id] ?? node.isOpen);
    setOpenById((current) => ({ ...current, [node.id]: nextOpen }));
    if (node.isOpen !== nextOpen) node.toggle();
  }

  function selectLayerNodes(nodes: NativeTreeNodeApi<ComposeLayerNode>[]) {
    const ids = nodes.map((node) => node.id);
    const objectIds = nodes.flatMap((node) =>
      getComposeLayerNodeObjects(node.data).map((object) => object.id),
    );
    setSelectedLayerIds(ids);
    nativeTreeRef.current?.setSelection({
      ids,
      anchor: ids[0] ?? null,
      mostRecent: ids.at(-1) ?? null,
    });
    if (nodes.length === 1 && nodes[0].data.kind === "frame") {
      onSelectFrameSettings();
      return;
    }
    onSelectObjects(
      nodes.flatMap((node) => getComposeLayerNodeObjects(node.data)),
    );
  }

  function selectLayerFromPointer(
    event: PointerEvent<HTMLDivElement>,
    node: NativeTreeNodeApi<ComposeLayerNode>,
  ) {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.shiftKey && selectedLayerIds.length > 0) {
      const visibleNodes = nativeTreeRef.current?.visibleNodes ?? [];
      const anchorId = selectedLayerIds.at(-1);
      const anchorIndex = visibleNodes.findIndex(
        (item) => item.id === anchorId,
      );
      const nodeIndex = visibleNodes.findIndex((item) => item.id === node.id);
      if (anchorIndex >= 0 && nodeIndex >= 0) {
        const start = Math.min(anchorIndex, nodeIndex);
        const end = Math.max(anchorIndex, nodeIndex);
        selectLayerNodes(visibleNodes.slice(start, end + 1));
        return;
      }
    }

    if (event.metaKey || event.ctrlKey) {
      const selected = new Set(selectedLayerIds);
      if (selected.has(node.id)) selected.delete(node.id);
      else selected.add(node.id);
      const visibleNodes = nativeTreeRef.current?.visibleNodes ?? [];
      selectLayerNodes(visibleNodes.filter((item) => selected.has(item.id)));
      return;
    }

    selectLayerNodes([node]);
  }

  function updateMarqueeSelection(currentX: number, currentY: number) {
    const start = marqueeSelectionRef.current;
    const api = nativeTreeRef.current;
    if (!start || !api) return;
    const scrollElement = getComposeLayersScrollElement(treeRef.current);
    const scrollTop = scrollElement?.scrollTop ?? 0;
    const startContentY = start.startY + start.startScrollTop;
    const currentContentY = currentY + scrollTop;
    const left = Math.min(start.startX, currentX);
    const right = Math.max(start.startX, currentX);
    const top = Math.min(startContentY, currentContentY);
    const bottom = Math.max(startContentY, currentContentY);
    const nextNodes = api.visibleNodes.filter((node) => {
      if (node.rowIndex === null) return false;
      const rowTop = node.rowIndex * composeLayerRowHeight;
      const rowBottom = rowTop + composeLayerRowHeight;
      return (
        right >= 0 &&
        left <= (treeRef.current?.clientWidth ?? 0) &&
        rowBottom >= top &&
        rowTop <= bottom
      );
    });
    selectLayerNodes(nextNodes);
  }

  function startMarquee(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      isComposeLayerInteractiveTarget(target)
    )
      return;
    const rect = treeRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    const startScrollTop =
      getComposeLayersScrollElement(treeRef.current)?.scrollTop ?? 0;
    selectLayerNodes([]);
    marqueeSelectionRef.current = {
      startX,
      startY,
      pointerId: event.pointerId,
      active: false,
      startScrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateMarqueeFromClient(clientX: number, clientY: number) {
    const start = marqueeSelectionRef.current;
    const rect = treeRef.current?.getBoundingClientRect();
    if (!start || !rect) return;
    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;
    if (
      !start.active &&
      Math.hypot(currentX - start.startX, currentY - start.startY) < 4
    )
      return;
    const scrollTop =
      getComposeLayersScrollElement(treeRef.current)?.scrollTop ?? 0;
    start.active = true;
    setMarquee({
      startX: start.startX,
      startY: start.startY + start.startScrollTop - scrollTop,
      currentX,
      currentY,
    });
    updateMarqueeSelection(currentX, currentY);
  }

  function updateMarquee(event: PointerEvent<HTMLDivElement>) {
    const start = marqueeSelectionRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    marqueePointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    updateMarqueeFromClient(event.clientX, event.clientY);
    if (start.active) {
      updateMarqueeAutoScroll(event.clientX, event.clientY, () => {
        const pointer = marqueePointerRef.current;
        if (pointer) updateMarqueeFromClient(pointer.clientX, pointer.clientY);
      });
    }
  }

  function finishMarquee(event: PointerEvent<HTMLDivElement>) {
    const start = marqueeSelectionRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const wasActive = start.active;
    marqueeSelectionRef.current = null;
    marqueePointerRef.current = null;
    stopMarqueeAutoScroll();
    setMarquee(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!wasActive) selectLayerNodes([]);
  }

  const getComposeLayerDropTarget = useCallback(
    ({
      dragIds,
      localY,
      tree: api,
    }: NativeTreeGetDropTargetArgs<ComposeLayerNode>) =>
      getComposeLayerDropTargetForTree(
        api,
        dragIds,
        localY,
        composeLayerRowHeight,
      ),
    [],
  );

  const disableComposeLayerDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: NativeTreeNodeApi<ComposeLayerNode> | { isRoot: true };
      dragNodes: NativeTreeNodeApi<ComposeLayerNode>[];
      index: number;
    }) => {
      if (parentNode.isRoot) return true;
      if (parentNode.id !== "objects") return true;
      return dragNodes.some((node) => node.data.kind !== "object");
    },
    [],
  );

  const updateDropCursorFromTarget = useCallback(
    (
      isDragging: boolean,
      target: NativeTreeDropTarget | null,
      mouse: { x: number; y: number } | null,
    ) => {
      if (!isDragging || !mouse || !treeRef.current || !target) {
        setDropTop(null);
        return;
      }
      if (target.parentId !== "objects") {
        setDropTop(null);
        return;
      }
      const api = nativeTreeRef.current;
      if (!api) {
        setDropTop(null);
        return;
      }
      const objectsIndex = api.visibleNodes.findIndex(
        (n) => n.id === "objects",
      );
      if (objectsIndex < 0) {
        setDropTop(null);
        return;
      }
      // Drop line positions are between children rows under "objects".
      const top = (objectsIndex + 1 + target.index) * composeLayerRowHeight;
      setDropTop(top);
    },
    [],
  );

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3"
      onPointerLeave={() => onHoverObject(null)}
      onPointerDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          !isComposeLayerInteractiveTarget(event.target)
        ) {
          selectLayerNodes([]);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h2 className="text-[13px] text-[#aeb3c1]">Layers</h2>
      </div>
      <div
        data-compose-layers-panel
        className="timeline-scrollbar min-h-0 flex-1 overflow-auto"
      >
        <div
          ref={treeRef}
          className="relative"
          onPointerDown={startMarquee}
          onPointerMove={updateMarquee}
          onPointerUp={finishMarquee}
          onPointerCancel={finishMarquee}
        >
          {marquee ? <ComposeLayerMarquee marquee={marquee} /> : null}
          {dropCursorVisible && dropPointerY !== null && dropTop !== null ? (
            <ProjectTreeCursor hidden={false} top={dropTop} />
          ) : null}
          <NativeTree<ComposeLayerNode>
            ref={nativeTreeRef}
            data={treeData}
            disableDrop={disableComposeLayerDrop}
            getDropTarget={getComposeLayerDropTarget}
            height={treeHeight}
            idAccessor="id"
            indent={composeLayerIndent}
            openByDefault
            rowHeight={composeLayerRowHeight}
            width="100%"
            onMove={moveObjectLayers}
            renderDragPreview={(previewProps) => (
              <ComposeLayerDragPreview
                {...previewProps}
                onDragPositionChange={updateDragPosition}
                onDropTargetChange={updateDropCursorFromTarget}
              />
            )}
            isInternal={(node) => Boolean(node.children?.length)}
            movable
            onToggle={(node) => toggleLayerNode(node)}
          >
            {(props) => (
              <ComposeLayerRow
                {...props}
                openById={openById}
                onHoverObject={onHoverObject}
                onSelectLayer={selectLayerFromPointer}
                onToggleLayer={toggleLayerNode}
                selectedLayerIds={selectedLayerIds}
                onToggleLayerHidden={onToggleLayerHidden}
                onToggleLayerLocked={onToggleLayerLocked}
              />
            )}
          </NativeTree>
        </div>
      </div>
    </section>
  );
});

function ProjectTreeCursor({ hidden, top }: { hidden?: boolean; top: number }) {
  if (hidden) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 h-0.5 rounded-full bg-[var(--clipper-accent)] shadow-[0_0_0_2px_rgb(var(--clipper-accent-rgb)/0.18)]"
      style={{ top, left: composeLayerIndent, right: 4 }}
    />
  );
}

function ComposeLayerRow({
  dragHandle,
  node,
  style,
  openById,
  selectedLayerIds,
  onHoverObject,
  onSelectLayer,
  onToggleLayer,
  onToggleLayerHidden,
  onToggleLayerLocked,
}: NativeTreeNodeRendererProps<ComposeLayerNode> & {
  openById: Record<string, boolean>;
  selectedLayerIds: string[];
  onHoverObject: (object: FrameObject | null) => void;
  onSelectLayer: (
    event: PointerEvent<HTMLDivElement>,
    node: NativeTreeNodeApi<ComposeLayerNode>,
  ) => void;
  onToggleLayer: (node: NativeTreeNodeApi<ComposeLayerNode>) => void;
  onToggleLayerHidden?: (layerId: string) => void;
  onToggleLayerLocked?: (layerId: string) => void;
}) {
  const data = node.data;
  const selected = selectedLayerIds.includes(data.id);
  const expanded = openById[node.id] ?? node.isOpen;
  const hidden = data.object?.hidden;
  const locked = data.object?.locked;
  const objectLayerId = data.object?.id ?? data.id;

  return (
    <div
      ref={data.kind === "object" ? dragHandle : undefined}
      data-compose-layer-row="true"
      className={`group box-border grid h-full min-w-0 cursor-pointer select-none grid-cols-[16px_18px_minmax(0,1fr)_auto_auto] items-center gap-1.5 border px-1.5 text-[13px] ${selected ? "border-transparent bg-[#242733] text-white" : "border-transparent text-[#dfe2ea] hover:bg-[#20232c]"} ${hidden ? "opacity-50" : ""}`}
      style={style}
      onPointerEnter={() => onHoverObject(data.object ?? null)}
      onPointerDown={(event) => onSelectLayer(event, node)}
    >
      <button
        className={`grid h-4 w-4 place-items-center rounded text-current hover:bg-black/15 ${node.isInternal ? "" : "pointer-events-none opacity-0"}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleLayer(node);
        }}
        tabIndex={node.isInternal ? 0 : -1}
      >
        <ChevronRight
          size={14}
          className={`transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      <LayerIcon node={data} />
      <span
        className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 ${data.animated ? "text-[#5599ff]" : ""}`}
        title={data.name}
      >
        {data.name}
      </span>
      {data.object ? (
        <>
          <button
            className={`grid h-full w-5 shrink-0 place-items-center rounded transition ${hidden ? "text-[#737884]" : "opacity-0 group-hover:opacity-100 text-[#737884] hover:bg-[#20232c] hover:text-white"}`}
            title={hidden ? "Show layer" : "Hide layer"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLayerHidden?.(objectLayerId);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
          <button
            className={`grid h-full w-5 shrink-0 place-items-center rounded transition ${locked ? "text-white" : "opacity-0 group-hover:opacity-100 text-[#737884] hover:bg-[#20232c] hover:text-white"}`}
            title={locked ? "Unlock layer" : "Lock layer"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLayerLocked?.(objectLayerId);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            {locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
        </>
      ) : null}
    </div>
  );
}

function ComposeLayerDragPreview({
  isDragging,
  dropTarget,
  mouse,
  onDragPositionChange,
  onDropTargetChange,
}: NativeTreeDragPreviewProps & {
  onDragPositionChange: (
    isDragging: boolean,
    mouse: { x: number; y: number } | null,
  ) => void;
  onDropTargetChange: (
    isDragging: boolean,
    dropTarget: NativeTreeDropTarget | null,
    mouse: { x: number; y: number } | null,
  ) => void;
}) {
  useEffect(() => {
    onDragPositionChange(isDragging, isDragging ? mouse : null);
    return () => onDragPositionChange(false, null);
  }, [isDragging, mouse, onDragPositionChange]);

  useEffect(() => {
    onDropTargetChange(isDragging, isDragging ? dropTarget : null, mouse);
    return () => onDropTargetChange(false, null, null);
  }, [dropTarget, isDragging, mouse, onDropTargetChange]);

  return null;
}

function ComposeLayerMarquee({
  marquee,
}: {
  marquee: {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  };
}) {
  const left = Math.min(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  const width = Math.abs(marquee.currentX - marquee.startX);
  const height = Math.abs(marquee.currentY - marquee.startY);
  return (
    <MarqueeSelectionBox
      left={left}
      top={top}
      width={width}
      height={height}
      zIndexClassName="z-30"
    />
  );
}

function isComposeLayerInteractiveTarget(target: HTMLElement) {
  return Boolean(
    target.closest(
      "button,input,textarea,select,[contenteditable='true'],[data-compose-layer-row='true']",
    ),
  );
}

function getComposeLayersScrollElement(tree: HTMLElement | null) {
  return tree?.closest<HTMLElement>("[data-compose-layers-panel]") ?? null;
}

function LayerIcon({ node }: { node: ComposeLayerNode }) {
  const className = "h-3.5 w-3.5 shrink-0 text-current";
  const objectType = node.object?.type;
  const objectName = node.object?.name;

  if (objectType === "rect") {
    const style = node.object?.style ?? {};
    if (style.borderRadius === 9999)
      return <EllipseIcon className={className} />;
    if (
      typeof style.clipPath === "string" &&
      style.clipPath.includes("50% 0%, 100% 38%")
    )
      return <PolygonIcon className={className} />;
    if (
      typeof style.clipPath === "string" &&
      style.clipPath.includes("50% 0%, 61% 35%")
    )
      return <StarIcon className={className} />;
    return <RectIcon className={className} />;
  }
  if (objectType === "text") return <Type className={className} />;
  if (objectType === "image" || objectType === "media")
    return <Image className={className} />;
  if (objectType === "svg") {
    if (objectName === "Arrow") return <ArrowIcon className={className} />;
    if (objectName === "Line") return <LineIcon className={className} />;
    return <PenTool className={className} />;
  }
  if (objectType === "null") return <NullObjectIcon className={className} />;
  if (objectType === "camera") return <Camera className={className} />;
  if (objectType === "html") return <Code2 className={className} />;
  if (objectType === "code") return <Code className={className} />;
  if (objectType === "template")
    return <TemplateLayerIcon className={className} />;
  if (objectType === "custom-renderer")
    return <ChartNoAxesColumn className={className} />;
  if (node.kind === "root") return <Layers className={className} />;
  if (node.kind === "frame") return <Frame className={className} />;
  if (node.kind === "background") return <Palette className={className} />;
  return <Braces className={className} />;
}

function TemplateLayerIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeDasharray="3 2"
        strokeWidth="2"
      />
      <path
        d="M8 10h8M8 14h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}
