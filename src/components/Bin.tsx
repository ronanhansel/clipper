import {
  ChevronDown,
  ChevronRight,
  ChartNoAxesGantt,
  Clapperboard,
  File,
  FileCode,
  FileJson,
  FileVideo,
  Folder,
  FolderOpen,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from "react";
import toast from "react-hot-toast";
import type { BinProxyImportFile } from "../app/features/file-manager/projectBinMutations";
import type { ContextMenuState } from "../app/types";
import type { CompositionClip, ProjectBinItem } from "../core/types";
import { getBinItemPath } from "../core/binPathResolver";
import { AppContextMenu } from "./AppContextMenu";
import {
  NativeTree,
  type NativeTreeApi,
  type NativeTreeNodeApi,
  type NativeTreeNodeRendererProps,
  type NativeTreeDropTarget,
  type NativeTreeDragPreviewProps,
} from "./tree/NativeTree";
import { Input } from "./ui/input";
import { getTransparentNativeDragImage } from "../lib/nativeDragImage";
import {
  clipperDragGhostClassName,
  clipperDragGhostOffset,
  compositionDragPreviewEvent,
  compositionPointerDragEvent,
  dispatchClipperPointerDrag,
  type CompositionPointerDragDetail,
  type PointerDragPreviewDetail,
} from "../lib/pointerDrag";

const ROW_HEIGHT = 30;
const INDENT = 24;
const MIN_TREE_HEIGHT = 360;

export type RegistryNode = {
  id: string;
  name: string;
  kind:
    | "folder"
    | "internal-file"
    | "composition"
    | "timeline"
    | "external-proxy";
  path?: string;
  language?: string;
  compositionId?: string;
  timelineId?: string;
  children?: RegistryNode[];
};

export type BinProps = {
  bin: ProjectBinItem[];
  compositionLibrary: CompositionClip[];
  selectedCompositionId?: string;
  onOpenFile: (
    target: string,
    options?: {
      isComposition?: boolean;
      isTimeline?: boolean;
      temporary?: boolean;
    },
  ) => void;
  createComposition: (folderId?: string) => Promise<void>;
  createFile: (folderId?: string) => void;
  createFolder: (folderId?: string) => void;
  createTimeline: (folderId?: string) => void;
  deleteItem: (itemId: string) => void;
  dropFiles: (files: BinProxyImportFile[], folderId?: string) => void;
  duplicateItem: (itemId: string) => void;
  deleteItems?: (itemIds: string[]) => void;
  duplicateItems?: (itemIds: string[]) => void;
  moveItem: (
    sourceId: string,
    targetId: string,
    action: "before" | "after" | "inside",
  ) => void;
  renameItem: (itemId: string, name: string) => void;
  revealItem: (itemId: string) => void;
};

export function Bin({
  bin,
  compositionLibrary,
  selectedCompositionId,
  onOpenFile,
  createComposition,
  createFile,
  createFolder,
  createTimeline,
  deleteItem,
  dropFiles,
  duplicateItem,
  deleteItems,
  duplicateItems,
  moveItem,
  renameItem,
  revealItem,
}: BinProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const treeRef = useRef<NativeTreeApi<RegistryNode> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeContainerRef = useRef<HTMLDivElement | null>(null);
  const draggingNodeRef = useRef<RegistryNode | null>(null);
  const externalCompositionDragRef = useRef<{
    node: RegistryNode;
    lastMouse: { x: number; y: number };
    shiftKey: boolean;
  } | null>(null);
  const externalCompositionDragFrameRef = useRef(0);
  const [rootDropVisible, setRootDropVisible] = useState(false);
  const [compositionLanePreviewActive, setCompositionLanePreviewActive] =
    useState(false);
  const copiedItemIdsRef = useRef<string[]>([]);

  const compositionDurations = useMemo(() => {
    return new Map(
      compositionLibrary.map((composition) => [
        composition.id,
        composition.duration,
      ]),
    );
  }, [compositionLibrary]);

  const treeData = useMemo<RegistryNode[]>(() => bin.map(binToRegistry), [bin]);

  const handleActivate = useCallback(
    (
      node: NativeTreeNodeApi<RegistryNode>,
      event: ReactMouseEvent<HTMLDivElement>,
    ) => {
      const data = node.data;
      if (data.kind === "composition") {
        onOpenFile(data.compositionId ?? data.id, {
          isComposition: true,
          temporary: event.detail < 2,
        });
      } else if (data.kind === "timeline") {
        onOpenFile(data.id);
      } else if (data.kind === "internal-file") {
        onOpenFile(data.id);
      } else if (data.kind === "external-proxy") {
        revealItem(data.id);
      }
    },
    [onOpenFile, revealItem],
  );

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (!containerRef.current?.contains(event.target as Node)) {
      treeRef.current?.deselectAll();
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const handleRename = useCallback(
    ({ id, name }: { id: string; name: string }) => {
      renameItem(id, name);
    },
    [renameItem],
  );

  const handleMove = useCallback(
    ({ dragIds, parentId, index }: NativeTreeDropTarget) => {
      if (!dragIds.length) return;

      if (parentId && index === -1) {
        for (const sourceId of dragIds) moveItem(sourceId, parentId, "inside");
        return;
      }

      const siblings = parentId
        ? (findNodeById(treeData, parentId)?.children ?? [])
        : treeData;
      const beforeTarget = siblings[index];
      if (beforeTarget) {
        for (const sourceId of dragIds)
          moveItem(sourceId, beforeTarget.id, "before");
        return;
      }
      const afterTarget = siblings[index - 1];
      if (afterTarget)
        for (const sourceId of dragIds)
          moveItem(sourceId, afterTarget.id, "after");
    },
    [moveItem, treeData],
  );

  const openContextMenu = useCallback(
    (
      event: ReactMouseEvent<Element>,
      node?: NativeTreeNodeApi<RegistryNode>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const items: NonNullable<ContextMenuState>["items"] = [];

      const selectedIds = treeRef.current?.selectedNodes.map((n) => n.id) ?? [];
      const hasMultiSelection = selectedIds.length > 1;
      const contextNodeIds =
        node && selectedIds.includes(node.id)
          ? selectedIds
          : node
            ? [node.id]
            : [];
      const hasCopiedItems = copiedItemIdsRef.current.length > 0;

      if (!node) {
        items.push(
          { label: "New Composition", action: () => void createComposition() },
          { label: "New Timeline", action: () => createTimeline() },
          { label: "New File", action: () => createFile() },
          { label: "New Folder", action: () => createFolder() },
          {
            label: "Paste",
            disabled: !hasCopiedItems,
            action: () => {
              const ids = copiedItemIdsRef.current;
              if (!ids.length) return;
              if (duplicateItems) duplicateItems(ids);
              else for (const id of ids) duplicateItem(id);
            },
          },
        );
      } else {
        const data = node.data;
        if (hasMultiSelection && contextNodeIds.length > 1) {
          items.push(
            {
              label: "Copy",
              action: () => {
                copiedItemIdsRef.current = contextNodeIds;
                void navigator.clipboard
                  ?.writeText(contextNodeIds.join("\n"))
                  .catch(() => {});
              },
            },
            {
              label: "Paste",
              disabled: !hasCopiedItems,
              action: () => {
                const ids = copiedItemIdsRef.current;
                if (!ids.length) return;
                if (duplicateItems) duplicateItems(ids);
                else for (const id of ids) duplicateItem(id);
              },
            },
            {
              label: "Duplicate",
              action: () => {
                if (duplicateItems) duplicateItems(contextNodeIds);
                else for (const id of contextNodeIds) duplicateItem(id);
              },
            },
            {
              label: "Delete",
              danger: true,
              action: () => {
                if (deleteItems) deleteItems(contextNodeIds);
                else for (const id of contextNodeIds) deleteItem(id);
              },
            },
          );
          setContextMenu({ items, x: event.clientX, y: event.clientY });
          return;
        }
        if (data.kind === "folder") {
          items.push(
            {
              label: "New Composition",
              action: () => void createComposition(data.id),
            },
            { label: "New Timeline", action: () => createTimeline(data.id) },
            { label: "New File", action: () => createFile(data.id) },
            { label: "New Folder", action: () => createFolder(data.id) },
            { label: "Rename", action: () => node.edit() },
            {
              label: "Copy",
              action: () => {
                copiedItemIdsRef.current = [data.id];
                void navigator.clipboard?.writeText(data.name).catch(() => {});
              },
            },
            {
              label: "Paste",
              disabled: !hasCopiedItems,
              action: () => {
                const ids = copiedItemIdsRef.current;
                if (!ids.length) return;
                if (duplicateItems) duplicateItems(ids);
                else for (const id of ids) duplicateItem(id);
              },
            },
            {
              label: "Delete",
              danger: true,
              action: () => deleteItem(data.id),
            },
          );
        } else if (data.kind === "composition") {
          items.push(
            { label: "Rename", action: () => node.edit() },
            {
              label: "Copy",
              action: () => {
                copiedItemIdsRef.current = [data.id];
                void navigator.clipboard?.writeText(data.name).catch(() => {});
              },
            },
            {
              label: "Paste",
              disabled: !hasCopiedItems,
              action: () => {
                const ids = copiedItemIdsRef.current;
                if (!ids.length) return;
                if (duplicateItems) duplicateItems(ids);
                else for (const id of ids) duplicateItem(id);
              },
            },
            { label: "Duplicate", action: () => duplicateItem(data.id) },
            { label: "Reveal in Finder", action: () => revealItem(data.id) },
            {
              label: "Delete",
              danger: true,
              action: () => deleteItem(data.id),
            },
          );
        } else {
          items.push(
            { label: "Rename", action: () => node.edit() },
            {
              label: "Copy",
              action: () => {
                copiedItemIdsRef.current = [data.id];
                void navigator.clipboard?.writeText(data.name).catch(() => {});
              },
            },
            {
              label: "Paste",
              disabled: !hasCopiedItems,
              action: () => {
                const ids = copiedItemIdsRef.current;
                if (!ids.length) return;
                if (duplicateItems) duplicateItems(ids);
                else for (const id of ids) duplicateItem(id);
              },
            },
            { label: "Duplicate", action: () => duplicateItem(data.id) },
            {
              label: "Delete",
              danger: true,
              action: () => deleteItem(data.id),
            },
          );
        }
      }

      setContextMenu({ items, x: event.clientX, y: event.clientY });
    },
    [
      createComposition,
      createFile,
      createFolder,
      createTimeline,
      deleteItem,
      duplicateItem,
      duplicateItems,
      deleteItems,
      revealItem,
    ],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const selected = treeRef.current?.selectedNodes ?? [];
      if (!selected.length) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      )
        return;

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        copiedItemIdsRef.current = selected.map((node) => node.id);
        event.preventDefault();
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "v"
      ) {
        const ids = copiedItemIdsRef.current;
        if (!ids.length) return;
        event.preventDefault();
        if (duplicateItems) duplicateItems(ids);
        else for (const id of ids) duplicateItem(id);
        return;
      }

      if (event.shiftKey && event.key === "Backspace") {
        event.preventDefault();
        const ids = getTopLevelSelection(selected);
        if (deleteItems) deleteItems(ids);
        else for (const id of ids) deleteItem(id);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [deleteItem, deleteItems, duplicateItem, duplicateItems]);

  const handleExternalDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (event.dataTransfer.files.length === 0) return;
      event.preventDefault();
      setRootDropVisible(false);
      dropFiles(toBinProxyImportFiles(event.dataTransfer.files));
    },
    [dropFiles],
  );

  const updateRootDropPreview = useCallback(
    (node: RegistryNode | null, mouse: { x: number; y: number } | null) => {
      if (!node || !mouse || !treeContainerRef.current) {
        setRootDropVisible(false);
        return;
      }
      const rect = treeContainerRef.current.getBoundingClientRect();
      const api = treeRef.current;
      if (!api) return;

      const localX = mouse.x - rect.left;
      const localY = mouse.y - rect.top;
      const dragIds = api.selectedNodes.some((n) => n.id === node.id)
        ? api.selectedNodes.map((n) => n.id)
        : [node.id];

      const dropTarget =
        localX >= 0 && localX <= rect.width
          ? (getOsFileDropTarget(api, dragIds, localY) ??
            getDefaultOsFileDropTarget(api, dragIds, localY))
          : null;

      setRootDropVisible(dropTarget?.parentId === null);
    },
    [],
  );

  const getCompositionDragDetail = useCallback(
    (
      node: RegistryNode,
      phase: CompositionPointerDragDetail["phase"],
      currentMouse: { x: number; y: number },
      shiftKey: boolean,
    ): CompositionPointerDragDetail | null => {
      if (node.kind !== "composition") return null;
      return {
        phase,
        clientX: currentMouse.x,
        clientY: currentMouse.y,
        shiftKey,
        compositionId: node.compositionId ?? node.id,
        duration: compositionDurations.get(node.compositionId ?? node.id) ?? 5,
        isEmpty: false,
        label: node.name,
        sourceMissing: false,
      };
    },
    [compositionDurations],
  );

  const handleTreeSelect = useCallback(() => {}, []);

  const getTreeDropTarget = useCallback(
    ({
      dragIds,
      localY,
      tree: api,
    }: {
      dragIds: string[];
      localY: number;
      tree: NativeTreeApi<RegistryNode>;
    }) => getOsFileDropTarget(api, dragIds, localY),
    [],
  );

  const handleCompositionDragStart = useCallback(
    (
      node: RegistryNode,
      mouse: { x: number; y: number },
      shiftKey: boolean,
    ) => {
      externalCompositionDragRef.current = {
        node,
        lastMouse: mouse,
        shiftKey,
      };
      const detail = getCompositionDragDetail(node, "move", mouse, shiftKey);
      if (detail)
        dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
    },
    [getCompositionDragDetail],
  );

  const handleDragStateChange = useCallback((node: RegistryNode | null) => {
    draggingNodeRef.current = node;
  }, []);

  const renderTreeDragPreview = useCallback(
    (props: NativeTreeDragPreviewProps) => (
      <OsFileDragPreview
        {...props}
        hideGhost={compositionLanePreviewActive}
        nodes={treeData}
        onDragPositionChange={updateRootDropPreview}
      />
    ),
    [compositionLanePreviewActive, treeData, updateRootDropPreview],
  );

  const renderRegistryTreeNode = useCallback(
    (props: NativeTreeNodeRendererProps<RegistryNode>) => (
      <RegistryTreeNode
        {...props}
        bin={bin}
        selectedCompositionId={selectedCompositionId}
        onContextMenu={openContextMenu}
        onCompositionDragStart={handleCompositionDragStart}
        onDragStateChange={handleDragStateChange}
        onDropFiles={dropFiles}
      />
    ),
    [
      bin,
      dropFiles,
      handleCompositionDragStart,
      handleDragStateChange,
      openContextMenu,
      selectedCompositionId,
    ],
  );

  const cleanupCompositionDrag = useCallback(
    (phase: "cancel" | "drop" | null) => {
      const external = externalCompositionDragRef.current;
      if (externalCompositionDragFrameRef.current)
        window.cancelAnimationFrame(externalCompositionDragFrameRef.current);
      externalCompositionDragFrameRef.current = 0;
      if (external && phase) {
        const detail = getCompositionDragDetail(
          external.node,
          phase,
          external.lastMouse,
          external.shiftKey,
        );
        if (detail)
          dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
      }
      externalCompositionDragRef.current = null;
      setRootDropVisible(false);
      treeRef.current?.endDrag();
    },
    [getCompositionDragDetail],
  );

  useEffect(() => {
    function updateCompositionLanePreview(event: Event) {
      setCompositionLanePreviewActive(
        Boolean(
          (event as CustomEvent<PointerDragPreviewDetail>).detail?.active,
        ),
      );
    }

    window.addEventListener(
      compositionDragPreviewEvent,
      updateCompositionLanePreview,
    );
    return () =>
      window.removeEventListener(
        compositionDragPreviewEvent,
        updateCompositionLanePreview,
      );
  }, []);

  useEffect(() => {
    function updateExternalDrag(event: globalThis.DragEvent) {
      const node = externalCompositionDragRef.current?.node;
      if (!node || node.kind !== "composition") return;
      const mouse = { x: event.clientX, y: event.clientY };
      externalCompositionDragRef.current = {
        node,
        lastMouse: mouse,
        shiftKey: event.shiftKey,
      };
      if (externalCompositionDragFrameRef.current) return;
      externalCompositionDragFrameRef.current = window.requestAnimationFrame(
        () => {
          externalCompositionDragFrameRef.current = 0;
          const active = externalCompositionDragRef.current;
          if (!active) return;
          const detail = getCompositionDragDetail(
            active.node,
            "move",
            active.lastMouse,
            active.shiftKey,
          );
          if (detail)
            dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
        },
      );
    }

    function cleanupOnDrop(event: globalThis.DragEvent) {
      // Do not pre-empt NativeTree's onDrop handler. We only need this global
      // cleanup when a drag ends outside of the bin surface.
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target))
        return;
      cleanupCompositionDrag("drop");
    }

    function cleanupOnCancel() {
      cleanupCompositionDrag("cancel");
    }

    window.addEventListener("dragover", updateExternalDrag, true);
    window.addEventListener("drop", cleanupOnDrop, true);
    window.addEventListener("dragend", cleanupOnCancel, true);
    window.addEventListener("blur", cleanupOnCancel);
    return () => {
      window.removeEventListener("dragover", updateExternalDrag, true);
      window.removeEventListener("drop", cleanupOnDrop, true);
      window.removeEventListener("dragend", cleanupOnCancel, true);
      window.removeEventListener("blur", cleanupOnCancel);
      cleanupCompositionDrag("cancel");
    };
  }, [cleanupCompositionDrag, getCompositionDragDetail]);

  const totalRowCount = countNodes(treeData);
  const treeHeight = Math.max(MIN_TREE_HEIGHT, totalRowCount * ROW_HEIGHT);

  const initialOpenState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const node of treeData) {
      if (node.children?.length) state[node.id] = true;
    }
    return state;
  }, [treeData]);

  return (
    <section
      ref={containerRef}
      data-bin-panel
      className="group/filetree min-h-0 min-w-0 overflow-auto rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3"
      onContextMenu={(e) => openContextMenu(e)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget)
          treeRef.current?.deselectAll();
      }}
      onDrop={handleExternalDrop}
      onDragOver={(e) => {
        if (hasExternalFiles(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setRootDropVisible(true);
        }
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        )
          return;
        setRootDropVisible(false);
      }}
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h3 className="text-[13px] text-[#aeb3c1]">Bin</h3>
      </div>
      <div
        ref={treeContainerRef}
        className={`relative timeline-scrollbar min-h-0 overflow-y-auto pr-1 pt-px ${
          rootDropVisible
            ? "bg-[var(--clipper-accent-muted-surface)] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_0_0_2px_var(--clipper-accent)]"
            : ""
        }`}
      >
        <NativeTree<RegistryNode>
          ref={treeRef}
          onEmptyAreaClick={() => treeRef.current?.deselectAll()}
          data={treeData}
          height={treeHeight}
          idAccessor="id"
          indent={INDENT}
          initialOpenState={initialOpenState}
          isInternal={(node) => node.kind === "folder"}
          movable
          openByDefault={false}
          rowHeight={ROW_HEIGHT}
          width="100%"
          onActivate={handleActivate}
          onMove={handleMove}
          onRename={handleRename}
          onSelect={handleTreeSelect}
          getDropTarget={getTreeDropTarget}
          renderDragPreview={renderTreeDragPreview}
        >
          {renderRegistryTreeNode}
        </NativeTree>
      </div>
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

function binToRegistry(item: ProjectBinItem): RegistryNode {
  if (item.kind === "folder") {
    return {
      id: item.id,
      name: item.name,
      kind: "folder",
      children: (item.children ?? []).map(binToRegistry),
    };
  }
  if (item.kind === "internal-file") {
    return {
      id: item.id,
      name: item.name,
      kind: "internal-file",
      language: item.language,
    };
  }
  if (item.kind === "composition") {
    return {
      id: item.id,
      name: item.name,
      kind: "composition",
      compositionId: item.compositionId,
    };
  }
  if (item.kind === "timeline") {
    return {
      id: item.id,
      name: item.name,
      kind: "timeline",
      timelineId: item.timelineId,
    };
  }
  return {
    id: item.id,
    name: item.name,
    kind: "external-proxy",
    path: item.path,
  };
}

function RegistryTreeNode({
  node,
  dragHandle,
  style,
  bin,
  selectedCompositionId,
  onContextMenu,
  onCompositionDragStart,
  onDragStateChange,
  onDropFiles,
}: NativeTreeNodeRendererProps<RegistryNode> & {
  bin: ProjectBinItem[];
  selectedCompositionId?: string;
  onContextMenu: (
    event: ReactMouseEvent,
    node: NativeTreeNodeApi<RegistryNode>,
  ) => void;
  onCompositionDragStart: (
    node: RegistryNode,
    mouse: { x: number; y: number },
    shiftKey: boolean,
  ) => void;
  onDragStateChange: (node: RegistryNode | null) => void;
  onDropFiles: (files: BinProxyImportFile[], folderId?: string) => void;
}) {
  const data = node.data;
  const [editDraft, setEditDraft] = useState(data.name);
  const editSubmittedRef = useRef(false);

  useEffect(() => {
    if (node.isEditing) {
      editSubmittedRef.current = false;
      setEditDraft(data.name);
    }
  }, [data.name, node.isEditing]);

  useEffect(() => {
    if (!node.isDragging) return;
    onDragStateChange(node.data);
    return () => onDragStateChange(null);
  }, [node.isDragging, node.data, onDragStateChange]);

  function submitEdit() {
    if (editSubmittedRef.current) return;
    editSubmittedRef.current = true;
    const nextName = editDraft.trim();
    if (nextName && nextName !== data.name) node.submit(nextName);
    else node.reset();
  }

  function cancelEdit() {
    editSubmittedRef.current = true;
    node.reset();
  }

  const Icon =
    data.kind === "folder"
      ? node.isOpen
        ? FolderOpen
        : Folder
      : data.kind === "composition" || data.kind === "timeline"
        ? Clapperboard
        : data.name.endsWith(".ts")
          ? FileCode
          : data.name.endsWith(".json")
            ? FileJson
            : data.name.toLowerCase().endsWith(".mp4")
              ? FileVideo
              : File;

  const isSelected =
    data.kind === "composition" && data.compositionId === selectedCompositionId;

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (node.isEditing) return;
    if (data.kind === "timeline") {
      event.dataTransfer.setData(
        "application/x-clipper-timeline",
        data.timelineId ?? data.id,
      );
    }
    if (data.kind === "composition") {
      event.dataTransfer.setData(
        "application/x-clipper-composition",
        data.compositionId ?? data.id,
      );
      onCompositionDragStart(
        data,
        { x: event.clientX, y: event.clientY },
        event.shiftKey,
      );
    }
    if (data.kind === "internal-file" || data.kind === "external-proxy") {
      const path = getBinItemPath(bin, data.id);
      if (path)
        event.dataTransfer.setData("application/x-clipper-bin-path", path);
    }
    event.dataTransfer.setDragImage(getTransparentNativeDragImage(), 0, 0);
  }

  return (
    <div
      ref={dragHandle}
      data-bin-row="true"
      style={style}
      className={`relative box-border grid h-full min-w-0 cursor-pointer select-none grid-cols-[16px_18px_minmax(0,1fr)_auto] items-center gap-1.5 border px-1.5 text-[13px] ${
        node.isDragging
          ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] opacity-60"
          : node.willReceiveDropWithin
            ? `border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] ${
                node.willReceiveDropBlockStart ? "" : "border-t-transparent"
              } ${node.willReceiveDropBlockEnd ? "" : "border-b-transparent"}`
            : node.isSelected || (node.isFocused && node.tree.hasFocus)
              ? "border-transparent bg-[#242733]"
              : "border-transparent hover:bg-[#20232c]"
      } ${isSelected ? "text-[#7aa2f7]" : "text-[#f7f7f8]"}`}
      onContextMenu={(e) => onContextMenu(e, node)}
      onClick={(e) => {
        if (!e.metaKey && !e.shiftKey && data.kind === "folder") node.toggle();
      }}
      onDragStartCapture={handleDragStart}
      onDragOver={(event) => {
        if (hasExternalFiles(event.dataTransfer) && data.kind === "folder") {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0 || data.kind !== "folder")
          return;
        event.preventDefault();
        event.stopPropagation();
        onDropFiles(toBinProxyImportFiles(event.dataTransfer.files), data.id);
      }}
    >
      {data.kind === "folder" ? (
        <button
          className="grid h-4 w-4 place-items-center rounded text-current hover:bg-black/15"
          onClick={(e) => {
            e.stopPropagation();
            node.toggle();
          }}
          type="button"
        >
          {node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span />
      )}
      <Icon size={data.kind === "folder" ? 17 : 16} className="text-current" />
      {node.isEditing ? (
        <Input
          className="h-5 min-w-0 rounded border border-[#3b82f6] bg-[#0e1015] px-1 text-xs text-[#c4c8d4] outline-none"
          value={editDraft}
          autoFocus
          onBlur={submitEdit}
          onChange={(e) => setEditDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
        />
      ) : (
        <span className="truncate text-xs">{data.name}</span>
      )}
    </div>
  );
}

function OsFileDragPreview({
  hideGhost,
  id,
  isDragging,
  mouse,
  nodes,
  onDragPositionChange,
}: NativeTreeDragPreviewProps & {
  hideGhost: boolean;
  nodes: RegistryNode[];
  onDragPositionChange: (
    node: RegistryNode | null,
    mouse: { x: number; y: number } | null,
  ) => void;
}) {
  const nodeData = id ? findNodeById(nodes, id) : null;

  useEffect(() => {
    onDragPositionChange(
      isDragging ? nodeData : null,
      isDragging ? mouse : null,
    );
  }, [isDragging, mouse, nodeData, onDragPositionChange]);

  if (!isDragging || !nodeData || !mouse || hideGhost) return null;

  const Icon =
    nodeData.kind === "folder"
      ? Folder
      : nodeData.kind === "composition" || nodeData.kind === "timeline"
        ? Clapperboard
        : File;

  return (
    <div
      className={clipperDragGhostClassName}
      style={{
        transform: `translate3d(${mouse.x + clipperDragGhostOffset.x}px, ${mouse.y + clipperDragGhostOffset.y}px, 0)`,
      }}
    >
      <Icon size={15} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {nodeData.name}
      </span>
    </div>
  );
}

function getOsFileDropTarget(
  api: NativeTreeApi<RegistryNode>,
  dragIds: string[],
  localY: number,
): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (
    !visibleNodes.length ||
    localY < 0 ||
    localY > visibleNodes.length * ROW_HEIGHT
  )
    return canDropRegistryRoot(api, dragIds)
      ? { dragIds, parentId: null, index: visibleNodes.length }
      : null;
  const rowIndex = Math.max(
    0,
    Math.min(visibleNodes.length - 1, Math.floor(localY / ROW_HEIGHT)),
  );
  const node = visibleNodes[rowIndex];
  if (!node) return null;
  const yInRow = localY - rowIndex * ROW_HEIGHT;
  // Drop into any folder (open or closed) when cursor is in the middle zone
  if (
    node.isInternal &&
    yInRow > ROW_HEIGHT * 0.25 &&
    yInRow < ROW_HEIGHT * 0.75
  )
    return { dragIds, parentId: node.id, index: -1 };
  // Drop between rows: reposition relative to parent
  return {
    dragIds,
    parentId: node.parent?.id ?? null,
    index: node.childIndex + (yInRow >= ROW_HEIGHT / 2 ? 1 : 0),
  };
}

function getDefaultOsFileDropTarget(
  api: NativeTreeApi<RegistryNode>,
  dragIds: string[],
  localY: number,
): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  const rowIndex = Math.max(
    0,
    Math.min(visibleNodes.length - 1, Math.floor(localY / ROW_HEIGHT)),
  );
  const node = visibleNodes[rowIndex];
  const yInRow = localY - rowIndex * ROW_HEIGHT;
  if (
    node.isInternal &&
    yInRow > ROW_HEIGHT * 0.25 &&
    yInRow < ROW_HEIGHT * 0.75
  )
    return { dragIds, parentId: node.id, index: -1 };
  return { dragIds, parentId: node.id, index: -1 };
}

function canDropRegistryRoot(
  api: NativeTreeApi<RegistryNode>,
  dragIds: string[],
) {
  const dragNodes = dragIds.flatMap(
    (id) => api.visibleNodes.find((node) => node.id === id) ?? [],
  );
  return (
    dragNodes.length === dragIds.length &&
    dragNodes.every((node) => node.parent !== null)
  );
}

function findNodeById(nodes: RegistryNode[], id: string): RegistryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function countNodes(nodes: RegistryNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children) count += countNodes(node.children);
  }
  return count;
}

function getTopLevelSelection(nodes: NativeTreeNodeApi<RegistryNode>[]) {
  const selectedIds = new Set(nodes.map((node) => node.id));
  return nodes
    .filter((node) => {
      let parent = node.parent;
      while (parent) {
        if (selectedIds.has(parent.id)) return false;
        parent = parent.parent;
      }
      return true;
    })
    .map((node) => node.id);
}

export type OsFileNode = RegistryNode;

function toBinProxyImportFiles(files: FileList): BinProxyImportFile[] {
  return Array.from(files).map((file) => ({
    name: file.name,
    path:
      window.clipper?.getDroppedFilePath?.(file) ||
      (file as File & { path?: string }).path ||
      file.name,
  }));
}

function hasExternalFiles(dataTransfer: DataTransfer) {
  return (
    dataTransfer.files.length > 0 ||
    Array.from(dataTransfer.types).includes("Files")
  );
}
