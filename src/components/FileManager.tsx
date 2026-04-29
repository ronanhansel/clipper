import { ChartNoAxesGantt, ChevronDown, ChevronRight, Clapperboard, File as FileIcon, Folder, Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type PropsWithChildren } from "react";
import { SimpleTree, Tree, type CursorProps, type DragPreviewProps, type MoveHandler, type NodeApi, type NodeRendererProps, type RowRendererProps, type TreeApi } from "react-arborist";
import type { ContextMenuItem, ContextMenuState } from "../app/types";
import { getParentAssetId, type AssetSortMode } from "../core/assetTree";
import type { AssetItem, CompositionClip, FileManagerState, FileManagerStateNode, TimelineDocument } from "../core/types";
import { compositionDragPreviewEvent, compositionPointerDragEvent, startClipperPointerDrag } from "../lib/pointerDrag";
import { AppContextMenu } from "./AppContextMenu";
import { Input } from "./ui/input";

type ProjectFileTreeNode =
  | { id: string; kind: "folder"; path: string; name: string; children: ProjectFileTreeNode[] }
  | { id: string; kind: "composition"; name: string; composition: CompositionClip }
  | { id: string; kind: "timeline"; name: string; timeline: TimelineDocument };

type FileManagerTreeNode =
  | { id: string; kind: "project-folder"; path: string; name: string; children: FileManagerTreeNode[] }
  | { id: string; kind: "composition"; name: string; composition: CompositionClip }
  | { id: string; kind: "timeline"; name: string; timeline: TimelineDocument }
  | { id: string; kind: "asset-folder"; asset: AssetItem; name: string; children: FileManagerTreeNode[] }
  | { id: string; kind: "asset-file"; asset: AssetItem; name: string };

type FileManagerDropTarget = { dragIds: string[]; parentId: string | null; index: number };

export type FileManagerTreeSnapshot = {
  assets: AssetItem[];
  compositionFilePaths: Record<string, string>;
  compositionFolders: string[];
  compositionOrder: string[];
  fileManagerState: FileManagerState;
  timelineFilePaths: Record<string, string>;
  timelineOrder: string[];
};

const FILE_MANAGER_ROW_HEIGHT = 30;
const FILE_MANAGER_INDENT = 24;
const FILE_MANAGER_TOP_DROP_PADDING = 0;
const FILE_MANAGER_BOTTOM_DROP_PADDING = 0;
const FILE_MANAGER_MIN_DROP_HEIGHT = 360;

export type FileManagerProps = {
  assets: AssetItem[];
  compositions: CompositionClip[];
  compositionFolders: string[];
  fileManagerState?: FileManagerState;
  compositionRootPath: string;
  timelines: TimelineDocument[];
  timelineCompositionIds: Set<string>;
  onAddComposition: (compositionId: string) => void;
  onCopyAsset: (assetId: string) => void;
  onCopyCompositionPath: (compositionId: string) => void;
  onCreateComposition: (folderPath?: string) => void;
  onCreateCompositionFolder: (parentFolderPath?: string) => void;
  onCreateFolder: (parentFolderId?: string) => void;
  onCreateTimeline: () => void;
  onDeleteAsset: (assetId: string) => void;
  onDeleteComposition: (compositionId: string) => void;
  onDeleteCompositionFolder: (folderPath: string) => void;
  onDeleteTimeline: (timelineId: string) => void;
  onDropFiles: (files: FileList, targetFolderId?: string) => void;
  onDuplicateAsset: (assetId: string) => void;
  onDuplicateComposition: (compositionId: string) => void;
  onMoveComposition: (compositionId: string, folderPath: string) => void;
  onMoveTimeline: (timelineId: string, folderPath: string) => void;
  onApplyTreeSnapshot: (snapshot: FileManagerTreeSnapshot) => void;
  onFileManagerStateChange: (state: FileManagerState) => void;
  onRenameAsset: (assetId: string, name: string) => void;
  onRenameComposition: (compositionId: string, name: string) => void;
  onRenameCompositionFolder: (folderPath: string, name: string) => void;
  onRenameTimeline: (timelineId: string, name: string) => void;
  onRevealAssetRoot: () => void;
  onRevealComposition: (compositionId?: string) => void;
  onRevealCompositionFolder: (folderPath: string) => void;
  onSelectTimeline: (timelineId: string) => void;
  onSortAssets: (parentFolderId: string | null, mode: AssetSortMode) => void;
};

type FileManagerContextValue = FileManagerProps & {
  contextMenu: ContextMenuState;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  clearTreeFocus: () => void;
  registerTreeFocusClearer: (clearer: (() => void) | null) => void;
  setContextMenu: (menu: ContextMenuState) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setSelectedNodeIds: (nodeIds: string[]) => void;
};

const FileManagerContext = createContext<FileManagerContextValue | null>(null);

function useFileManager() {
  const context = useContext(FileManagerContext);
  if (!context) throw new Error("useFileManager must be used within FileManagerProvider");
  return context;
}

function FileManagerProvider({ children, ...props }: PropsWithChildren<FileManagerProps>) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const selectedNodeId = selectedNodeIds[0] ?? null;
  const treeFocusClearerRef = useRef<(() => void) | null>(null);
  const clearTreeFocus = useCallback(() => treeFocusClearerRef.current?.(), []);
  const registerTreeFocusClearer = useCallback((clearer: (() => void) | null) => {
    treeFocusClearerRef.current = clearer;
  }, []);
  const setSelectedNodeId = useCallback((nodeId: string | null) => setSelectedNodeIds(nodeId ? [nodeId] : []), []);
  const value = useMemo<FileManagerContextValue>(() => ({ ...props, contextMenu, selectedNodeId, selectedNodeIds, clearTreeFocus, registerTreeFocusClearer, setContextMenu, setSelectedNodeId, setSelectedNodeIds }), [props, contextMenu, selectedNodeId, selectedNodeIds, clearTreeFocus, registerTreeFocusClearer, setSelectedNodeId]);
  return <FileManagerContext.Provider value={value}>{children}</FileManagerContext.Provider>;
}

export function FileManager(props: FileManagerProps) {
  return <FileManagerProvider {...props}><FileManagerPanel /></FileManagerProvider>;
}

function FileManagerPanel() {
  const { assets, compositions, compositionFolders, fileManagerState, compositionRootPath, timelines, contextMenu, selectedNodeIds, clearTreeFocus, setContextMenu, setSelectedNodeIds, onCopyAsset, onCreateComposition, onCreateCompositionFolder, onCreateFolder, onCreateTimeline, onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder, onDeleteTimeline, onDropFiles, onMoveComposition, onMoveTimeline, onRevealAssetRoot, onSortAssets } = useFileManager();
  const managerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function clearSelectionOnOutsidePointer(event: globalThis.PointerEvent) {
      if (managerRef.current?.contains(event.target as Node)) return;
      clearTreeFocus();
      setSelectedNodeIds([]);
    }

    window.addEventListener("pointerdown", clearSelectionOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", clearSelectionOnOutsidePointer);
  }, [clearTreeFocus, setSelectedNodeIds]);

  function openProjectMenu(event: ReactMouseEvent<HTMLElement>) {
    if (event.currentTarget !== event.target) return;
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "New composition", action: () => onCreateComposition() },
        { label: "New composition folder", action: () => onCreateCompositionFolder() },
        { label: "New timeline", action: onCreateTimeline },
        { label: "New asset folder", action: () => onCreateFolder() },
        { label: "Reveal assets in Finder", action: onRevealAssetRoot },
        { label: "Sort assets by", children: getAssetSortMenuItems(null, onSortAssets) },
      ],
    });
  }

  function openCreateMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: [
        { label: "New folder", action: () => onCreateCompositionFolder() },
        { label: "New timeline", action: onCreateTimeline },
        { label: "New composition", action: () => onCreateComposition() },
      ],
    });
  }

  function handleProjectDragOver(event: DragEvent<HTMLElement>) {
    if (event.dataTransfer.files.length > 0 || event.dataTransfer.types.includes("application/x-clipper-composition") || event.dataTransfer.types.includes("application/x-clipper-timeline")) event.preventDefault();
  }

  function handleProjectDrop(event: DragEvent<HTMLElement>) {
    const compositionId = event.dataTransfer.getData("application/x-clipper-composition");
    const timelineId = event.dataTransfer.getData("application/x-clipper-timeline");
    if (compositionId) {
      event.preventDefault();
      onMoveComposition(compositionId, compositionRootPath);
      return;
    }
    if (timelineId) {
      event.preventDefault();
      onMoveTimeline(timelineId, compositionRootPath);
      return;
    }
    if (event.dataTransfer.files.length > 0) {
      event.preventDefault();
      onDropFiles(event.dataTransfer.files);
    }
  }

  function handleFileManagerPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    window.setTimeout(() => {
      clearTreeFocus();
      setSelectedNodeIds([]);
    }, 0);
  }

  function handleFileManagerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    if (event.key !== "Backspace" || (!event.metaKey && !event.ctrlKey)) return;
    if (!selectedNodeIds.length) return;

    const nodes = getTopLevelSelectedFileTreeNodes(buildUnifiedFileTree(compositions, compositionFolders, compositionRootPath, timelines, assets), selectedNodeIds);
    if (!nodes.length) return;
    event.preventDefault();
    event.stopPropagation();
    deleteFileTreeNodes(nodes, timelines.length, { onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder, onDeleteTimeline });
  }

  return (
    <section ref={managerRef} className="min-h-0 min-w-0 overflow-auto rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3" onContextMenu={openProjectMenu} onDragOver={handleProjectDragOver} onDrop={handleProjectDrop} onKeyDown={handleFileManagerKeyDown} onPointerDown={handleFileManagerPointerDown}>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h3 className="text-[13px] font-semibold text-[#aeb3c1]">File Manager</h3>
        <button className="grid h-7 w-7 place-items-center rounded-md text-[#dfe2ea] hover:bg-[#20232c]" aria-label="Create file manager item" onClick={openCreateMenu} type="button"><Plus size={17} /></button>
      </div>
      <UnifiedFileManagerTree />
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

function UnifiedFileManagerTree() {
  const { assets, compositions, compositionFolders: folders, compositionRootPath: rootPath, fileManagerState, timelines, onApplyTreeSnapshot, onFileManagerStateChange, onRenameAsset, onRenameComposition, onRenameCompositionFolder: onRenameFolder, onRenameTimeline, registerTreeFocusClearer, setSelectedNodeId: onSelectNode, setSelectedNodeIds: onSelectNodes, onSelectTimeline } = useFileManager();
  const rawTree = useMemo(() => buildUnifiedFileTree(compositions, folders, rootPath, timelines, assets), [assets, compositions, folders, rootPath, timelines]);
  const [tree, setTree] = useState(() => syncFileTreeToSavedState(rawTree, fileManagerState?.tree));
  const initialOpenState = useMemo(() => fileManagerState?.openState ?? getFileTreeOpenState(tree), []);
  const visibleRowCount = countFileTreeNodes(tree);
  const rowDropHeight = visibleRowCount * FILE_MANAGER_ROW_HEIGHT + FILE_MANAGER_TOP_DROP_PADDING;
  const contentDropHeight = rowDropHeight + FILE_MANAGER_BOTTOM_DROP_PADDING;
  const treeHeight = Math.max(FILE_MANAGER_MIN_DROP_HEIGHT, contentDropHeight);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const arboristTreeRef = useRef<TreeApi<FileManagerTreeNode> | undefined>(undefined);
  const draggingNodeRef = useRef<FileManagerTreeNode | null>(null);
  const orderReferenceTreeRef = useRef<FileManagerTreeNode[] | null>(null);
  const latestTreeRef = useRef(tree);
  const nativeMoveCompletedRef = useRef(false);
  const fallbackDropAppliedRef = useRef(false);
  const fallbackDragIdRef = useRef<string | null>(null);
  const fallbackDropRef = useRef<FileManagerDropTarget | null>(null);
  const marqueeSelectionRef = useRef<{ startX: number; startY: number; pointerId: number; active: boolean } | null>(null);
  const [dropCursorVisible, setDropCursorVisible] = useState(false);
  const [dropPointerY, setDropPointerY] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const updateDragPosition = useCallback((node: FileManagerTreeNode | null, mouse: { x: number; y: number } | null) => {
    draggingNodeRef.current = node;
    if (node && fallbackDragIdRef.current !== node.id) {
      fallbackDragIdRef.current = node.id;
      fallbackDropAppliedRef.current = false;
      nativeMoveCompletedRef.current = false;
    }
    const rect = treeRef.current?.getBoundingClientRect();
    if (!node || !mouse || !rect) {
      setDropCursorVisible(false);
      setDropPointerY(null);
      fallbackDropRef.current = null;
      return;
    }
    const localX = mouse.x - rect.left;
    const localY = mouse.y - rect.top;
    setDropPointerY(localY);
    const api = arboristTreeRef.current;
    const dragIds = api?.state.dnd.dragIds.includes(node.id) ? api.state.dnd.dragIds : [node.id];
    fallbackDropRef.current = api ? getPointerFileTreeDrop(api, latestTreeRef.current, dragIds, localX, localY, rect.width) ?? getArboristFileTreeDrop(api, latestTreeRef.current, node.id, localX, localY, rect.width, treeHeight) : null;
    setDropCursorVisible(localX >= 0 && localX <= rect.width && localY >= FILE_MANAGER_TOP_DROP_PADDING && localY <= rowDropHeight && visibleRowCount > 0);
  }, [rowDropHeight, tree.length, treeHeight, visibleRowCount]);

  const applyTreeMove = useCallback((dragIds: string[], parentId: string | null, index: number) => {
    const simpleTree = new SimpleTree<FileManagerTreeNode>(latestTreeRef.current);
    dragIds.forEach((id, offset) => simpleTree.move({ id, parentId, index: index + offset }));
    const nextTree = simpleTree.data;
    latestTreeRef.current = nextTree;
    orderReferenceTreeRef.current = nextTree;
    setTree(nextTree);
    onApplyTreeSnapshot(createFileManagerTreeSnapshot(nextTree, rootPath, arboristTreeRef.current?.openState));
  }, [onApplyTreeSnapshot, rootPath]);

  useEffect(() => {
    setTree((current) => {
      const orderedTree = syncFileTreeToPreviousOrder(rawTree, orderReferenceTreeRef.current ?? current);
      const nextTree = syncFileTreeToSavedState(orderedTree, fileManagerState?.tree);
      latestTreeRef.current = nextTree;
      orderReferenceTreeRef.current = null;
      return nextTree;
    });
  }, [fileManagerState?.tree, rawTree]);

  useEffect(() => {
    registerTreeFocusClearer(() => {
      arboristTreeRef.current?.deselectAll();
      arboristTreeRef.current?.onBlur();
      onSelectNode(null);
    });
    return () => registerTreeFocusClearer(null);
  }, [onSelectNode, registerTreeFocusClearer]);

  function updateMarqueeSelection(currentX: number, currentY: number) {
    const start = marqueeSelectionRef.current;
    const api = arboristTreeRef.current;
    if (!start || !api) return;
    const left = Math.min(start.startX, currentX);
    const right = Math.max(start.startX, currentX);
    const top = Math.min(start.startY, currentY);
    const bottom = Math.max(start.startY, currentY);
    const nextIds = api.visibleNodes.flatMap((node) => {
      if (node.rowIndex === null) return [];
      const rowTop = node.rowIndex * FILE_MANAGER_ROW_HEIGHT + FILE_MANAGER_TOP_DROP_PADDING;
      const rowBottom = rowTop + FILE_MANAGER_ROW_HEIGHT;
      return right >= 0 && left <= (treeRef.current?.clientWidth ?? 0) && rowBottom >= top && rowTop <= bottom ? [node.id] : [];
    });
    api.setSelection({ ids: nextIds, anchor: nextIds[0] ?? null, mostRecent: nextIds.at(-1) ?? null });
    onSelectNodes(nextIds);
  }

  function handleMarqueePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (isFileManagerInteractiveTarget(target)) return;
    const rect = treeRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    arboristTreeRef.current?.deselectAll();
    arboristTreeRef.current?.onBlur();
    onSelectNodes([]);
    marqueeSelectionRef.current = { startX, startY, pointerId: event.pointerId, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function suppressEmptyTreePointerFocus(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || isFileManagerInteractiveTarget(target)) return;
    event.preventDefault();
  }

  function handleMarqueePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = marqueeSelectionRef.current;
    const rect = treeRef.current?.getBoundingClientRect();
    if (!start || start.pointerId !== event.pointerId || !rect) return;
    const currentX = event.clientX - rect.left;
    const currentY = event.clientY - rect.top;
    if (!start.active && Math.hypot(currentX - start.startX, currentY - start.startY) < 4) return;
    start.active = true;
    setMarquee({ startX: start.startX, startY: start.startY, currentX, currentY });
    updateMarqueeSelection(currentX, currentY);
  }

  function finishMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const start = marqueeSelectionRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const wasActive = start.active;
    marqueeSelectionRef.current = null;
    setMarquee(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!wasActive) {
      window.setTimeout(() => {
        arboristTreeRef.current?.deselectAll();
        arboristTreeRef.current?.onBlur();
        onSelectNodes([]);
      }, 0);
    }
  }

  useEffect(() => {
    function hideDropCursor() {
      draggingNodeRef.current = null;
      fallbackDropRef.current = null;
      fallbackDragIdRef.current = null;
      setDropCursorVisible(false);
      setDropPointerY(null);
    }

    function maybeApplyFallbackDrop() {
      const fallbackDrop = fallbackDropRef.current;
      window.setTimeout(() => {
        if (fallbackDrop && !nativeMoveCompletedRef.current && !fallbackDropAppliedRef.current) {
          fallbackDropAppliedRef.current = true;
          applyTreeMove(fallbackDrop.dragIds, fallbackDrop.parentId, fallbackDrop.index);
        }
        nativeMoveCompletedRef.current = false;
        hideDropCursor();
      }, 0);
    }

    window.addEventListener("dragend", maybeApplyFallbackDrop, true);
    window.addEventListener("drop", maybeApplyFallbackDrop, true);
    return () => {
      window.removeEventListener("dragend", maybeApplyFallbackDrop, true);
      window.removeEventListener("drop", maybeApplyFallbackDrop, true);
    };
  }, [applyTreeMove]);

  const handleMove: MoveHandler<FileManagerTreeNode> = ({ dragIds, parentId, index }) => {
    nativeMoveCompletedRef.current = true;
    applyTreeMove(dragIds, parentId, index);
  };

  function handleRename({ id, name }: { id: string; name: string }) {
    const node = findFileTreeNode(tree, id);
    if (!node) return;
    if (node.kind === "asset-file" || node.kind === "asset-folder") onRenameAsset(node.asset.id, name);
    if (node.kind === "project-folder") onRenameFolder(node.path, name);
    if (node.kind === "composition") onRenameComposition(node.composition.id, name);
    if (node.kind === "timeline") onRenameTimeline(node.timeline.id, name);
  }

  function handleActivate(node: { data: FileManagerTreeNode }) {
    if (node.data.kind === "timeline") onSelectTimeline(node.data.timeline.id);
  }

  function handleSelect(nodes: NodeApi<FileManagerTreeNode>[]) {
    onSelectNodes(nodes.map((node) => node.id));
  }

  function handleToggle() {
    window.setTimeout(() => onFileManagerStateChange(createFileManagerState(latestTreeRef.current, arboristTreeRef.current?.openState)), 0);
  }

  function disableDrop({ parentNode, dragNodes, index }: { parentNode: NodeApi<FileManagerTreeNode>; dragNodes: NodeApi<FileManagerTreeNode>[]; index: number }) {
    const draggedNodes = dragNodes.map((node) => node.data);
    const parentNodeData = parentNode.isRoot ? null : parentNode.data;
    const draggedIds = new Set(draggedNodes.map((node) => node.id));
    const siblings = getFileTreeChildren(tree, parentNodeData?.id ?? null).filter((node) => !draggedIds.has(node.id));
    const disabled = !draggedNodes.length || draggedNodes.some((draggedNode) => !canDropFileTreeNode(draggedNode, parentNodeData, siblings, index));
    if (disabled) setDropCursorVisible(false);
    return disabled;
  }

  return <div ref={treeRef} className="relative" onPointerDownCapture={suppressEmptyTreePointerFocus} onPointerDown={handleMarqueePointerDown} onPointerMove={handleMarqueePointerMove} onPointerUp={finishMarquee} onPointerCancel={finishMarquee}>{marquee ? <FileManagerMarquee marquee={marquee} /> : null}<Tree<FileManagerTreeNode> ref={arboristTreeRef} data={tree} disableDrop={disableDrop} height={treeHeight} idAccessor="id" indent={FILE_MANAGER_INDENT} initialOpenState={initialOpenState} onActivate={handleActivate} onMove={handleMove} onRename={handleRename} onSelect={handleSelect} onToggle={handleToggle} openByDefault={!fileManagerState?.openState} overscanCount={4} paddingBottom={FILE_MANAGER_BOTTOM_DROP_PADDING} paddingTop={FILE_MANAGER_TOP_DROP_PADDING} rowHeight={FILE_MANAGER_ROW_HEIGHT} width="100%" renderCursor={(cursorProps) => <ProjectTreeCursor {...cursorProps} hidden={!dropCursorVisible || dropPointerY === null || Math.abs(cursorProps.top - dropPointerY) > FILE_MANAGER_ROW_HEIGHT / 2} />} renderDragPreview={(previewProps) => <UnifiedTreeDragPreview {...previewProps} nodes={tree} onDragPositionChange={updateDragPosition} />} renderRow={(rowProps) => <FileManagerTreeRow {...rowProps} />}>{(nodeProps) => <UnifiedTreeNode {...nodeProps} />}</Tree></div>;
}

function isFileManagerInteractiveTarget(target: HTMLElement) {
  return Boolean(target.closest("button,input,textarea,select,[contenteditable='true'],[data-file-manager-row='true']"));
}

function FileManagerTreeRow({ attrs, children, innerRef, node }: RowRendererProps<FileManagerTreeNode>) {
  const { onSelectTimeline } = useFileManager();

  return <div {...attrs} ref={innerRef} onFocus={(event) => event.stopPropagation()} onClick={(event) => {
    node.handleClick(event);
    if (!event.metaKey && !event.shiftKey && isFileTreeFolderNode(node.data)) node.toggle();
    if (node.data.kind === "timeline" && !event.metaKey && !event.shiftKey) onSelectTimeline(node.data.timeline.id);
  }}>
    {children}
  </div>;
}

function UnifiedTreeNode({ dragHandle, node, style }: NodeRendererProps<FileManagerTreeNode>) {
  const { assets, timelines, onAddComposition, onCopyAsset, onCopyCompositionPath, onCreateFolder: onCreateAssetFolder, onCreateComposition, onCreateCompositionFolder: onCreateFolder, onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder: onDeleteFolder, onDeleteTimeline, onDuplicateAsset, onDuplicateComposition, setContextMenu: onOpenMenu, onRevealComposition, onSelectTimeline, onSortAssets } = useFileManager();
  const data = node.data;
  const [editDraft, setEditDraft] = useState(data.name);

  useEffect(() => {
    if (node.isEditing) setEditDraft(data.name);
  }, [data.name, node.isEditing]);

  function submitEdit() {
    const nextName = editDraft.trim();
    if (nextName) node.submit(nextName);
    else node.reset();
  }

  function openMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const selectedNodes = getTopLevelSelectedNodeData(node.tree.selectedNodes);
    if (node.isSelected && selectedNodes.length > 1) {
      const selectedCompositions = selectedNodes.filter((selectedNode): selectedNode is Extract<FileManagerTreeNode, { kind: "composition" }> => selectedNode.kind === "composition");
      const selectedAssets = selectedNodes.filter((selectedNode): selectedNode is Extract<FileManagerTreeNode, { kind: "asset-file" | "asset-folder" }> => selectedNode.kind === "asset-file" || selectedNode.kind === "asset-folder");
      const selectedTimelines = selectedNodes.filter((selectedNode): selectedNode is Extract<FileManagerTreeNode, { kind: "timeline" }> => selectedNode.kind === "timeline");
      const canDeleteSelection = selectedTimelines.length === 0 || timelines.length - selectedTimelines.length >= 1;
      onOpenMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          { label: `Add ${selectedCompositions.length} to timeline`, action: () => selectedCompositions.forEach((selectedNode) => onAddComposition(selectedNode.composition.id)), disabled: selectedCompositions.length === 0 },
          { label: `Duplicate ${selectedAssets.length + selectedCompositions.length} items`, action: () => { selectedAssets.forEach((selectedNode) => onDuplicateAsset(selectedNode.asset.id)); selectedCompositions.forEach((selectedNode) => onDuplicateComposition(selectedNode.composition.id)); }, disabled: selectedAssets.length + selectedCompositions.length === 0 },
          { label: `Delete ${selectedNodes.length} items`, action: () => deleteFileTreeNodes(selectedNodes, timelines.length, { onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder: onDeleteFolder, onDeleteTimeline }), danger: true, disabled: !canDeleteSelection },
        ],
      });
      return;
    }
    if (data.kind === "asset-file" || data.kind === "asset-folder") {
      const parentFolderId = data.kind === "asset-folder" ? data.asset.id : getParentAssetId(assets, data.asset.id);
      onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "Rename", action: () => node.edit() }, { label: "Copy path", action: () => onCopyAsset(data.asset.id) }, { label: "Duplicate", action: () => onDuplicateAsset(data.asset.id) }, { label: "New folder", action: () => onCreateAssetFolder(parentFolderId ?? undefined) }, { label: "Sort by", children: getAssetSortMenuItems(parentFolderId, onSortAssets) }, { label: "Delete", action: () => onDeleteAsset(data.asset.id), danger: true }] });
      return;
    }
    if (data.kind === "project-folder") {
      onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "New composition", action: () => onCreateComposition(data.path) }, { label: "New folder", action: () => onCreateFolder(data.path) }, { label: "Rename", action: () => node.edit() }, { label: "Delete", action: () => onDeleteFolder(data.path), danger: true }] });
      return;
    }
    if (data.kind === "timeline") {
      onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "Rename", action: () => node.edit() }, { label: "Delete", action: () => onDeleteTimeline(data.timeline.id), danger: true, disabled: timelines.length <= 1 }] });
      return;
    }
    onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "Add to timeline", action: () => onAddComposition(data.composition.id) }, { label: "Rename", action: () => node.edit() }, { label: "Duplicate", action: () => onDuplicateComposition(data.composition.id) }, { label: "Copy path", action: () => onCopyCompositionPath(data.composition.id) }, { label: "Reveal in Finder", action: () => onRevealComposition(data.composition.id) }, { label: "Delete", action: () => onDeleteComposition(data.composition.id), danger: true }] });
  }

  const Icon = data.kind === "asset-file" ? FileIcon : data.kind === "timeline" ? ChartNoAxesGantt : data.kind === "composition" ? Clapperboard : Folder;
  const label = data.kind === "timeline" ? `${data.name}.timeline` : data.name;

  function startCompositionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (data.kind !== "composition" || node.isEditing) return;
    event.stopPropagation();
    startClipperPointerDrag({
      accent: "#38a86d",
      eventName: compositionPointerDragEvent,
      label: data.name,
      payload: { compositionId: data.composition.id, duration: data.composition.duration, label: data.name },
      pointerEvent: event,
      previewEventName: compositionDragPreviewEvent,
    });
  }

  return <div ref={dragHandle} data-file-manager-row="true" style={style} className={`relative box-border grid h-full min-w-0 cursor-pointer grid-cols-[16px_18px_minmax(0,1fr)_auto] items-center gap-1.5 border px-1.5 text-[13px] font-bold ${node.isDragging ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] opacity-60" : node.willReceiveDrop ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)]" : node.isSelected || (node.isFocused && node.tree.hasFocus) ? "border-transparent bg-[#242733]" : "border-transparent hover:bg-[#20232c]"}`} onContextMenu={openMenu} onPointerDown={startCompositionDrag}>
    {node.isInternal ? <button className="grid h-4 w-4 place-items-center rounded text-current hover:bg-black/15" aria-label={`${node.isOpen ? "Collapse" : "Expand"} ${data.name}`} onClick={(event) => { event.stopPropagation(); node.toggle(); }} onDoubleClick={(event) => event.stopPropagation()} type="button">{node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span />}
    <Icon size={data.kind === "asset-file" || data.kind === "composition" || data.kind === "timeline" ? 16 : 17} className="text-current" />
    {node.isEditing ? <Input autoFocus className="h-7 min-w-0 border-[var(--clipper-accent)] bg-[#171920] px-1 py-0 text-[13px] font-bold" value={editDraft} onBlur={submitEdit} onChange={(event) => setEditDraft(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") submitEdit(); if (event.key === "Escape") node.reset(); }} /> : <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1">{label}</span>}
    <span />
  </div>;
}

function UnifiedTreeDragPreview({ id, isDragging, mouse, nodes, onDragPositionChange }: DragPreviewProps & { nodes: FileManagerTreeNode[]; onDragPositionChange: (node: FileManagerTreeNode | null, mouse: { x: number; y: number } | null) => void }) {
  const [forceHidden, setForceHidden] = useState(false);
  const node = id ? findFileTreeNode(nodes, id) : null;

  useEffect(() => {
    if (isDragging) setForceHidden(false);
  }, [id, isDragging]);

  useEffect(() => {
    onDragPositionChange(isDragging ? node : null, isDragging ? mouse : null);
    return () => onDragPositionChange(null, null);
  }, [isDragging, mouse, node, onDragPositionChange]);

  useEffect(() => {
    function hidePreview() {
      setForceHidden(true);
      onDragPositionChange(null, null);
    }
    window.addEventListener("dragend", hidePreview);
    window.addEventListener("drop", hidePreview);
    window.addEventListener("pointerup", hidePreview);
    return () => {
      window.removeEventListener("dragend", hidePreview);
      window.removeEventListener("drop", hidePreview);
      window.removeEventListener("pointerup", hidePreview);
    };
  }, [onDragPositionChange]);

  if (!isDragging || forceHidden || !node || !mouse) return null;
  const Icon = node.kind === "asset-file" ? FileIcon : node.kind === "timeline" ? ChartNoAxesGantt : node.kind === "composition" ? Clapperboard : Folder;
  return <div className="pointer-events-none fixed z-[9999] inline-grid max-w-[260px] grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-[8px] border border-[var(--clipper-accent)] bg-[#242128] px-2.5 py-1.5 text-xs font-bold text-[#f2f3f7] shadow-2xl" style={{ left: mouse.x + 12, top: mouse.y + 12 }}>
    <Icon size={15} />
    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{node.kind === "timeline" ? `${node.name}.timeline` : node.name}</span>
  </div>;
}

function FileManagerMarquee({ marquee }: { marquee: { startX: number; startY: number; currentX: number; currentY: number } }) {
  const left = Math.min(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  const width = Math.abs(marquee.currentX - marquee.startX);
  const height = Math.abs(marquee.currentY - marquee.startY);
  return <div className="pointer-events-none absolute z-30 border border-[#159dff] bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)]" style={{ left, top, width, height }} />;
}

function ProjectTreeCursor({ hidden, top, left, indent }: CursorProps & { hidden?: boolean }) {
  if (hidden) return null;
  return <div className="pointer-events-none absolute z-20 h-0.5 rounded-full bg-[var(--clipper-accent)] shadow-[0_0_0_2px_rgb(var(--clipper-accent-rgb)/0.18)]" style={{ top, left: left + indent, right: 4 }} />;
}

function buildProjectFileTree(compositions: CompositionClip[], folders: string[], rootPath: string, timelines: TimelineDocument[]): ProjectFileTreeNode[] {
  const root: Extract<ProjectFileTreeNode, { kind: "folder" }> = { id: folderNodeId(""), kind: "folder", path: "", name: "", children: [] };
  for (const folder of folders) ensureCompositionFolder(root, rootPath, relativeCompositionPath(folder, rootPath).split("/").filter(Boolean));
  for (const composition of compositions) {
    const parts = relativeCompositionPath(composition.filePath, rootPath).split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;
    const folder = ensureCompositionFolder(root, rootPath, parts);
    folder.children.push({ id: compositionNodeId(composition.id), kind: "composition", name: composition.name, composition });
  }
  for (const timeline of timelines) {
    const folderPath = getTimelineFolderPath(timeline, rootPath);
    const parts = relativeCompositionPath(folderPath, rootPath).split("/").filter(Boolean);
    ensureCompositionFolder(root, rootPath, parts).children.push({ id: timelineNodeId(timeline.id), kind: "timeline", name: timeline.name, timeline });
  }
  return root.children;
}

function buildUnifiedFileTree(compositions: CompositionClip[], folders: string[], rootPath: string, timelines: TimelineDocument[], assets: AssetItem[]): FileManagerTreeNode[] {
  return [
    ...buildProjectFileTree(compositions, folders, rootPath, timelines).map(projectNodeToFileNode),
    ...assets.map(assetToFileNode),
  ];
}

function projectNodeToFileNode(node: ProjectFileTreeNode): FileManagerTreeNode {
  if (node.kind === "folder") return { id: projectFolderNodeId(node.path), kind: "project-folder", path: node.path, name: node.name, children: node.children.map(projectNodeToFileNode) };
  if (node.kind === "composition") return { id: compositionNodeId(node.composition.id), kind: "composition", name: node.name, composition: node.composition };
  return { id: timelineNodeId(node.timeline.id), kind: "timeline", name: node.name, timeline: node.timeline };
}

function assetToFileNode(asset: AssetItem): FileManagerTreeNode {
  if (asset.kind === "folder") return { id: assetNodeId(asset.id), kind: "asset-folder", asset, name: asset.name, children: (asset.children ?? []).map(assetToFileNode) };
  return { id: assetNodeId(asset.id), kind: "asset-file", asset, name: asset.name };
}

function projectFolderNodeId(path: string) {
  return `project-folder:${path}`;
}

function assetNodeId(assetId: string) {
  return `asset:${assetId}`;
}

function folderNodeId(path: string) {
  return `folder:${path}`;
}

function compositionNodeId(compositionId: string) {
  return `composition:${compositionId}`;
}

function timelineNodeId(timelineId: string) {
  return `timeline:${timelineId}`;
}

function getTimelineFolderPath(timeline: TimelineDocument, rootPath: string) {
  if (!timeline.filePath) return rootPath;
  const directory = getDirectoryPath(timeline.filePath);
  return directory && timeline.filePath.startsWith(`${rootPath}/`) ? directory : rootPath;
}

function ensureCompositionFolder(root: Extract<ProjectFileTreeNode, { kind: "folder" }>, rootPath: string, parts: string[]) {
  let current = root;
  let path = rootPath;
  for (const part of parts) {
    path = `${path}/${part}`;
    let next = current.children.find((node): node is Extract<ProjectFileTreeNode, { kind: "folder" }> => node.kind === "folder" && node.path === path);
    if (!next) {
      next = { id: folderNodeId(path), kind: "folder", path, name: part, children: [] };
      current.children.push(next);
    }
    current = next;
  }
  return current;
}

function getFileTreeOpenState(nodes: FileManagerTreeNode[]): Record<string, boolean> {
  return nodes.reduce<Record<string, boolean>>((openState, node) => {
    if (node.kind !== "project-folder" && node.kind !== "asset-folder") return openState;
    openState[node.id] = true;
    Object.assign(openState, getFileTreeOpenState(node.children));
    return openState;
  }, {});
}

function isFileTreeFolderNode(node: FileManagerTreeNode): node is Extract<FileManagerTreeNode, { kind: "project-folder" | "asset-folder" }> {
  return node.kind === "project-folder" || node.kind === "asset-folder";
}

function countFileTreeNodes(nodes: FileManagerTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + ((node.kind === "project-folder" || node.kind === "asset-folder") ? countFileTreeNodes(node.children) : 0), 0);
}

function findFileTreeNode(nodes: FileManagerTreeNode[], nodeId: string): FileManagerTreeNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.kind === "project-folder" || node.kind === "asset-folder") {
      const child = findFileTreeNode(node.children, nodeId);
      if (child) return child;
    }
  }
  return null;
}

function getTopLevelSelectedFileTreeNodes(nodes: FileManagerTreeNode[], selectedIds: string[]): FileManagerTreeNode[] {
  const selectedIdSet = new Set(selectedIds);
  const selectedNodes: FileManagerTreeNode[] = [];
  for (const node of nodes) {
    if (selectedIdSet.has(node.id)) {
      selectedNodes.push(node);
      continue;
    }
    if (node.kind === "project-folder" || node.kind === "asset-folder") selectedNodes.push(...getTopLevelSelectedFileTreeNodes(node.children, selectedIds));
  }
  return selectedNodes;
}

function getTopLevelSelectedNodeData(selectedNodes: NodeApi<FileManagerTreeNode>[]): FileManagerTreeNode[] {
  return selectedNodes.filter((selectedNode) => !selectedNodes.some((candidate) => candidate !== selectedNode && candidate.isAncestorOf(selectedNode))).map((selectedNode) => selectedNode.data);
}

function deleteFileTreeNodes(nodes: FileManagerTreeNode[], timelineCount: number, actions: Pick<FileManagerProps, "onDeleteAsset" | "onDeleteComposition" | "onDeleteCompositionFolder" | "onDeleteTimeline">) {
  const selectedTimelineCount = nodes.filter((node) => node.kind === "timeline").length;
  const canDeleteTimelines = selectedTimelineCount === 0 || timelineCount - selectedTimelineCount >= 1;
  for (const node of nodes) {
    if (node.kind === "asset-file" || node.kind === "asset-folder") actions.onDeleteAsset(node.asset.id);
    if (node.kind === "project-folder") actions.onDeleteCompositionFolder(node.path);
    if (node.kind === "composition") actions.onDeleteComposition(node.composition.id);
    if (node.kind === "timeline" && canDeleteTimelines) actions.onDeleteTimeline(node.timeline.id);
  }
}

function getFileTreeChildren(nodes: FileManagerTreeNode[], parentId: string | null): FileManagerTreeNode[] {
  if (!parentId) return nodes;
  const parent = findFileTreeNode(nodes, parentId);
  if (parent?.kind === "project-folder" || parent?.kind === "asset-folder") return parent.children;
  return [];
}

function canDropFileTreeNode(draggedNode: FileManagerTreeNode, parentNode: FileManagerTreeNode | null, siblings: FileManagerTreeNode[], index: number) {
  if (draggedNode.kind === "asset-file" || draggedNode.kind === "asset-folder") {
    if (parentNode && parentNode.kind !== "asset-folder") return false;
    if (parentNode?.kind === "asset-folder") return true;
    return !!getUnifiedAssetReorderTarget(siblings.filter((node) => node.id !== draggedNode.id), index);
  }

  if (parentNode && parentNode.kind !== "project-folder") return false;
  return true;
}

function getPointerFileTreeDrop(api: TreeApi<FileManagerTreeNode>, tree: FileManagerTreeNode[], dragIds: string[], localX: number, localY: number, width: number): FileManagerDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (!visibleNodes.length || localX < 0 || localX > width || localY < FILE_MANAGER_TOP_DROP_PADDING || localY > FILE_MANAGER_TOP_DROP_PADDING + visibleNodes.length * FILE_MANAGER_ROW_HEIGHT) return null;

  const rowIndex = Math.max(0, Math.min(visibleNodes.length - 1, Math.floor((localY - FILE_MANAGER_TOP_DROP_PADDING) / FILE_MANAGER_ROW_HEIGHT)));
  const node = visibleNodes[rowIndex];
  if (!node) return null;

  const yInRow = localY - FILE_MANAGER_TOP_DROP_PADDING - rowIndex * FILE_MANAGER_ROW_HEIGHT;
  const inTopHalf = yInRow < FILE_MANAGER_ROW_HEIGHT / 2;
  const inMiddle = yInRow > FILE_MANAGER_ROW_HEIGHT / 4 && yInRow < FILE_MANAGER_ROW_HEIGHT * 0.75;
  const atTop = !inMiddle && inTopHalf;
  const hoverLevel = Math.round(Math.max(0, localX - FILE_MANAGER_INDENT) / FILE_MANAGER_INDENT);
  const drop = getNodePointerDropTarget(node, hoverLevel, inTopHalf, inMiddle, atTop);
  return drop && canDropFileTreeTarget(tree, dragIds, drop.parentId, drop.index) ? { ...drop, dragIds } : null;
}

function getArboristFileTreeDrop(api: TreeApi<FileManagerTreeNode>, tree: FileManagerTreeNode[], draggedId: string, localX: number, localY: number, width: number, height: number): FileManagerDropTarget | null {
  const destination = api.state.dnd;
  if (localX < 0 || localX > width || localY < FILE_MANAGER_TOP_DROP_PADDING || localY > height || !destination.dragIds.includes(draggedId) || destination.index === null) return null;
  const parentId = destination.parentId === "__REACT_ARBORIST_INTERNAL_ROOT__" ? null : destination.parentId;
  return canDropFileTreeTarget(tree, destination.dragIds, parentId, destination.index) ? { dragIds: destination.dragIds, parentId, index: destination.index } : null;
}

function getNodePointerDropTarget(node: NodeApi<FileManagerTreeNode>, hoverLevel: number, inTopHalf: boolean, inMiddle: boolean, atTop: boolean): Omit<FileManagerDropTarget, "dragIds"> | null {
  if (node.isInternal && inMiddle) return { parentId: node.id, index: 0 };

  const [above, below] = getFileTreeNodesAroundCursor(node, inTopHalf, inMiddle, atTop);
  if (!above) return { parentId: fileTreeNodeParentId(below), index: 0 };
  if (above.isLeaf || above.isClosed) return walkFileTreeDropUpFrom(above, clampFileTreeLevel(hoverLevel, below?.level ?? 0, above.level));
  if (above.isOpen && !above.children?.length) {
    const level = clampFileTreeLevel(hoverLevel, 0, above.level + 1);
    return level > above.level ? { parentId: above.id, index: 0 } : walkFileTreeDropUpFrom(above, level);
  }
  return { parentId: above.id, index: 0 };
}

function getFileTreeNodesAroundCursor(node: NodeApi<FileManagerTreeNode>, inTopHalf: boolean, inMiddle: boolean, atTop: boolean): [NodeApi<FileManagerTreeNode> | null, NodeApi<FileManagerTreeNode> | null] {
  if (node.isInternal) {
    if (atTop) return [node.prev, node];
    if (inMiddle) return [node, node];
    return [node, node.next];
  }
  return inTopHalf ? [node.prev, node] : [node, node.next];
}

function walkFileTreeDropUpFrom(node: NodeApi<FileManagerTreeNode>, level: number): Omit<FileManagerDropTarget, "dragIds"> {
  let drop = node;
  while (drop.parent && drop.level > level) drop = drop.parent;
  return { parentId: fileTreeNodeParentId(drop.parent), index: drop.childIndex + 1 };
}

function fileTreeNodeParentId(node: NodeApi<FileManagerTreeNode> | null | undefined) {
  return node && !node.isRoot ? node.id : null;
}

function clampFileTreeLevel(level: number, min: number, max: number) {
  return Math.max(min, Math.min(max, level));
}

function canDropFileTreeTarget(tree: FileManagerTreeNode[], dragIds: string[], parentId: string | null, index: number) {
  const draggedNodes = dragIds.flatMap((id) => {
    const node = findFileTreeNode(tree, id);
    return node ? [node] : [];
  });
  const parentNode = parentId ? findFileTreeNode(tree, parentId) : null;
  const draggedIdSet = new Set(dragIds);
  const siblings = getFileTreeChildren(tree, parentId).filter((node) => !draggedIdSet.has(node.id));
  return draggedNodes.length === dragIds.length && draggedNodes.every((draggedNode) => canDropFileTreeNode(draggedNode, parentNode, siblings, index));
}

function createFileManagerTreeSnapshot(nodes: FileManagerTreeNode[], rootPath: string, openState?: Record<string, boolean>): FileManagerTreeSnapshot {
  const snapshot: FileManagerTreeSnapshot = { assets: [], compositionFilePaths: {}, compositionFolders: [], compositionOrder: [], fileManagerState: createFileManagerState(nodes, openState), timelineFilePaths: {}, timelineOrder: [] };
  for (const node of nodes) {
    if (node.kind === "asset-file" || node.kind === "asset-folder") snapshot.assets.push(assetFromFileTreeNode(node));
    else collectProjectTreeSnapshot(node, rootPath, snapshot);
  }
  return snapshot;
}

function createFileManagerState(nodes: FileManagerTreeNode[], openState?: Record<string, boolean>): FileManagerState {
  return { tree: nodes.map(fileTreeNodeToStateNode), openState: openState ?? {} };
}

function fileTreeNodeToStateNode(node: FileManagerTreeNode): FileManagerStateNode {
  if (node.kind === "project-folder" || node.kind === "asset-folder") return { id: node.id, children: node.children.map(fileTreeNodeToStateNode) };
  return { id: node.id };
}

function collectProjectTreeSnapshot(node: FileManagerTreeNode, parentPath: string, snapshot: FileManagerTreeSnapshot) {
  if (node.kind === "project-folder") {
    const folderPath = `${parentPath}/${node.name}`;
    snapshot.compositionFolders.push(folderPath);
    for (const child of node.children) collectProjectTreeSnapshot(child, folderPath, snapshot);
    return;
  }
  if (node.kind === "composition") {
    snapshot.compositionOrder.push(node.composition.id);
    snapshot.compositionFilePaths[node.composition.id] = `${parentPath}/${getFileName(node.composition.filePath)}`;
    return;
  }
  if (node.kind === "timeline") {
    snapshot.timelineOrder.push(node.timeline.id);
    snapshot.timelineFilePaths[node.timeline.id] = `${parentPath}/${getFileName(node.timeline.filePath || `${node.timeline.id}.timeline.json`)}`;
  }
}

function assetFromFileTreeNode(node: Extract<FileManagerTreeNode, { kind: "asset-file" | "asset-folder" }>): AssetItem {
  if (node.kind === "asset-file") return node.asset;
  return { ...node.asset, children: node.children.flatMap((child) => child.kind === "asset-file" || child.kind === "asset-folder" ? [assetFromFileTreeNode(child)] : []) };
}

function syncFileTreeToSavedState(rawNodes: FileManagerTreeNode[], stateNodes?: FileManagerStateNode[]): FileManagerTreeNode[] {
  if (!stateNodes?.length) return rawNodes;
  const remaining = [...rawNodes];
  const next: FileManagerTreeNode[] = [];

  for (const stateNode of stateNodes) {
    const rawIndex = remaining.findIndex((node) => node.id === stateNode.id);
    if (rawIndex < 0) continue;
    const [rawNode] = remaining.splice(rawIndex, 1);
    if ((rawNode.kind === "project-folder" || rawNode.kind === "asset-folder") && stateNode.children) next.push({ ...rawNode, children: syncFileTreeToSavedState(rawNode.children, stateNode.children) } as FileManagerTreeNode);
    else next.push(rawNode);
  }

  return [...next, ...remaining];
}

function syncFileTreeToPreviousOrder(rawNodes: FileManagerTreeNode[], previousNodes: FileManagerTreeNode[]): FileManagerTreeNode[] {
  if (!previousNodes.length) return rawNodes;
  const remaining = [...rawNodes];
  const next: FileManagerTreeNode[] = [];

  for (const previousNode of previousNodes) {
    const rawIndex = remaining.findIndex((node) => isSameFileTreeNode(node, previousNode));
    if (rawIndex < 0) continue;
    const [rawNode] = remaining.splice(rawIndex, 1);
    next.push(syncFileTreeNodeToPreviousOrder(rawNode, previousNode));
  }

  return [...next, ...remaining];
}

function syncFileTreeNodeToPreviousOrder(rawNode: FileManagerTreeNode, previousNode: FileManagerTreeNode): FileManagerTreeNode {
  if ((rawNode.kind === "project-folder" || rawNode.kind === "asset-folder") && (previousNode.kind === "project-folder" || previousNode.kind === "asset-folder")) {
    return { ...rawNode, children: syncFileTreeToPreviousOrder(rawNode.children, previousNode.children) } as FileManagerTreeNode;
  }
  return rawNode;
}

function isSameFileTreeNode(node: FileManagerTreeNode, other: FileManagerTreeNode) {
  if (node.id === other.id) return true;
  return node.kind === "project-folder" && other.kind === "project-folder" && node.name === other.name;
}

function applyFileTreeOrder(nodes: FileManagerTreeNode[], orderByParent: Record<string, string[]>, parentId: string | null = null): FileManagerTreeNode[] {
  const ordered = orderFileTreeSiblings(nodes, orderByParent[fileTreeParentKey(parentId)]);
  return ordered.map((node) => {
    if (node.kind === "project-folder" || node.kind === "asset-folder") return { ...node, children: applyFileTreeOrder(node.children, orderByParent, node.id) };
    return node;
  });
}

function orderFileTreeSiblings(nodes: FileManagerTreeNode[], order?: string[]) {
  if (!order?.length) return nodes;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const orderedNodes = order.flatMap((id) => {
    const node = nodeById.get(id);
    if (!node) return [];
    nodeById.delete(id);
    return [node];
  });
  return [...orderedNodes, ...nodeById.values()];
}

function moveFileTreeOrder(orderByParent: Record<string, string[]>, tree: FileManagerTreeNode[], draggedId: string, orderedDraggedId: string, parentId: string | null, index: number): Record<string, string[]> {
  const next = { ...orderByParent };
  for (const [key, order] of Object.entries(next)) next[key] = order.filter((id) => id !== draggedId);
  const parentKey = fileTreeParentKey(parentId);
  const siblings = getFileTreeChildren(tree, parentId).filter((node) => node.id !== draggedId).map((node) => node.id);
  const baseOrder = next[parentKey]?.filter((id) => siblings.includes(id)) ?? siblings;
  const insertionIndex = Math.max(0, Math.min(index, baseOrder.length));
  next[parentKey] = [...baseOrder.slice(0, insertionIndex), orderedDraggedId, ...baseOrder.slice(insertionIndex)];
  return next;
}

function fileTreeParentKey(parentId: string | null) {
  return parentId ?? "__root__";
}

function getMovedFolderPath(folderPath: string, parentFolderPath: string) {
  const folderName = folderPath.slice(folderPath.lastIndexOf("/") + 1);
  return parentFolderPath ? `${parentFolderPath}/${folderName}` : folderName;
}

function getUnifiedTimelineReorderTarget(siblings: FileManagerTreeNode[], index: number): { timeline: TimelineDocument; action: "before" | "after" } | null {
  for (let nextIndex = index; nextIndex < siblings.length; nextIndex += 1) {
    const node = siblings[nextIndex];
    if (node.kind === "timeline") return { timeline: node.timeline, action: "before" };
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const node = siblings[previousIndex];
    if (node.kind === "timeline") return { timeline: node.timeline, action: "after" };
  }
  return null;
}

function getUnifiedCompositionReorderTarget(siblings: FileManagerTreeNode[], index: number): { composition: CompositionClip; action: "before" | "after" } | null {
  for (let nextIndex = index; nextIndex < siblings.length; nextIndex += 1) {
    const node = siblings[nextIndex];
    if (node.kind === "composition") return { composition: node.composition, action: "before" };
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const node = siblings[previousIndex];
    if (node.kind === "composition") return { composition: node.composition, action: "after" };
  }
  return null;
}

function getUnifiedFolderReorderTarget(siblings: FileManagerTreeNode[], index: number): { folder: Extract<FileManagerTreeNode, { kind: "project-folder" }>; action: "before" | "after" } | null {
  for (let nextIndex = index; nextIndex < siblings.length; nextIndex += 1) {
    const node = siblings[nextIndex];
    if (node.kind === "project-folder") return { folder: node, action: "before" };
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const node = siblings[previousIndex];
    if (node.kind === "project-folder") return { folder: node, action: "after" };
  }
  return null;
}

function getUnifiedAssetReorderTarget(siblings: FileManagerTreeNode[], index: number): { asset: AssetItem; action: "before" | "after" } | null {
  for (let nextIndex = index; nextIndex < siblings.length; nextIndex += 1) {
    const node = siblings[nextIndex];
    if (node.kind === "asset-file" || node.kind === "asset-folder") return { asset: node.asset, action: "before" };
  }
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const node = siblings[previousIndex];
    if (node.kind === "asset-file" || node.kind === "asset-folder") return { asset: node.asset, action: "after" };
  }
  return null;
}

function getDirectoryPath(relativePath: string) {
  const slashIndex = relativePath.lastIndexOf("/");
  return slashIndex > 0 ? relativePath.slice(0, slashIndex) : "";
}

function getFileName(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

function relativeCompositionPath(filePath: string, rootPath: string) {
  return filePath === rootPath ? "" : filePath.startsWith(`${rootPath}/`) ? filePath.slice(rootPath.length + 1) : filePath;
}

function getAssetSortMenuItems(parentFolderId: string | null, onSortAssets: (parentFolderId: string | null, mode: AssetSortMode) => void): ContextMenuItem[] {
  return [
    { label: "Folders first", action: () => onSortAssets(parentFolderId, "folders-first") },
    { label: "A to Z", action: () => onSortAssets(parentFolderId, "name-asc") },
    { label: "Z to A", action: () => onSortAssets(parentFolderId, "name-desc") },
  ];
}
