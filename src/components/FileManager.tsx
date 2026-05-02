import { ChartNoAxesGantt, ChevronDown, ChevronRight, Clapperboard, File as FileIcon, Folder, Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type PropsWithChildren } from "react";
import { isTextEditingTarget } from "../app/features/shortcuts/useGlobalEditorShortcuts";
import type { ContextMenuItem, ContextMenuState } from "../app/types";
import { getParentAssetId, type AssetSortMode } from "../core/assetTree";
import type { AssetItem, CompositionClip, FileManagerState, FileManagerStateNode, TimelineDocument } from "../core/types";
import { getTransparentNativeDragImage } from "../lib/nativeDragImage";
import { getDisplayName, getDisplayNameFromPath, getDragPreviewDisplayName, getFileType, reconstructFileName } from "../core/fileNames";
import { clipperDragGhostClassName, clipperDragGhostOffset, compositionDragPreviewEvent, compositionPointerDragEvent, dispatchClipperPointerDrag, type CompositionPointerDragDetail, type PointerDragPreviewDetail } from "../lib/pointerDrag";
import { AppContextMenu } from "./AppContextMenu";
import { NativeTree, type NativeTreeApi, type NativeTreeDragPreviewProps, type NativeTreeDropTarget, type NativeTreeNodeApi, type NativeTreeNodeRendererProps } from "./tree/NativeTree";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
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




type FileManagerDropTarget = NativeTreeDropTarget;

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
  onFindCompositionMedia: (compositionId: string, fileName: string) => void;
  findMediaRequest?: { compositionId: string; fileName: string } | null;
  onFindMediaRequestChange?: (request: { compositionId: string; fileName: string } | null) => void;
  onRenameAsset: (assetId: string, name: string) => void;
  onRenameComposition: (compositionId: string, name: string) => void;
  onRenameCompositionFolder: (folderPath: string, name: string) => void;
  onRenameTimeline: (timelineId: string, name: string) => void;
  onRevealAssetRoot: () => void;
  onRevealComposition: (compositionId?: string) => void;
  onRevealCompositionFolder: (folderPath: string) => void;
  onSelectTimeline: (timelineId: string) => void;
  onSortAssets: (parentFolderId: string | null, mode: AssetSortMode) => void;
  onReloadProject?: () => void;
};

type FileManagerContextValue = FileManagerProps & {
  contextMenu: ContextMenuState;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  clearTreeFocus: () => void;
  registerTreeFocusClearer: (clearer: (() => void) | null) => void;
  requestNodeExpansion: (nodeId: string) => void;
  registerNodeExpander: (expander: ((nodeId: string) => void) | null) => void;
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
  const nodeExpanderRef = useRef<((nodeId: string) => void) | null>(null);
  const requestNodeExpansion = useCallback((nodeId: string) => nodeExpanderRef.current?.(nodeId), []);
  const registerNodeExpander = useCallback((expander: ((nodeId: string) => void) | null) => {
    nodeExpanderRef.current = expander;
  }, []);
  const setSelectedNodeId = useCallback((nodeId: string | null) => setSelectedNodeIds(nodeId ? [nodeId] : []), []);
  const value = useMemo<FileManagerContextValue>(() => ({ ...props, contextMenu, selectedNodeId, selectedNodeIds, clearTreeFocus, registerTreeFocusClearer, requestNodeExpansion, registerNodeExpander, setContextMenu, setSelectedNodeId, setSelectedNodeIds }), [props, contextMenu, selectedNodeId, selectedNodeIds, clearTreeFocus, registerTreeFocusClearer, requestNodeExpansion, registerNodeExpander, setSelectedNodeId]);
  return <FileManagerContext.Provider value={value}>{children}</FileManagerContext.Provider>;
}

export function FileManager(props: FileManagerProps) {
  return <FileManagerProvider {...props}><FileManagerPanel /></FileManagerProvider>;
}

function FileManagerPanel() {
  const { assets, compositions, compositionFolders, fileManagerState, compositionRootPath, timelines, contextMenu, selectedNodeIds, clearTreeFocus, setContextMenu, setSelectedNodeIds, onCopyAsset, onCreateComposition, onCreateCompositionFolder, onCreateFolder, onCreateTimeline, onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder, onDeleteTimeline, onMoveComposition, onMoveTimeline, onRevealAssetRoot, onSortAssets } = useFileManager();
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
    const target = event.target;
    if (!(target instanceof HTMLElement) || isFileManagerInteractiveTarget(target)) return;
    event.preventDefault();
    event.stopPropagation();
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

  function handleFileManagerPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || isFileManagerInteractiveTarget(target)) return;
    window.setTimeout(() => {
      clearTreeFocus();
      setSelectedNodeIds([]);
    }, 0);
  }

  function handleFileManagerKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (shouldSkipFileManagerShortcut(event.target)) return;
    deleteSelectedFileManagerNodes(event);
  }

  function deleteSelectedFileManagerNodes(event: Pick<ReactKeyboardEvent<HTMLElement> | KeyboardEvent, "ctrlKey" | "key" | "metaKey" | "preventDefault" | "stopPropagation">) {
    if (event.key !== "Backspace" || (!event.metaKey && !event.ctrlKey)) return false;
    if (!selectedNodeIds.length) return false;

    const nodes = getTopLevelSelectedFileTreeNodes(buildUnifiedFileTree(compositions, compositionFolders, compositionRootPath, timelines, assets), selectedNodeIds);
    if (!nodes.length) return false;
    event.preventDefault();
    event.stopPropagation();
    deleteFileTreeNodes(nodes, timelines.length, { onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder, onDeleteTimeline });
    return true;
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (shouldSkipFileManagerShortcut(event.target)) return;
      deleteSelectedFileManagerNodes(event);
    }

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [assets, compositions, compositionFolders, compositionRootPath, onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder, onDeleteTimeline, selectedNodeIds, timelines]);

  return (
    <section ref={managerRef} data-file-manager-panel className="min-h-0 min-w-0 overflow-auto rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3" onContextMenu={openProjectMenu} onKeyDown={handleFileManagerKeyDown} onPointerDown={handleFileManagerPointerDown}>
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h3 className="text-[13px] text-[#aeb3c1]">File Manager</h3>
        <button className="grid h-7 w-7 place-items-center rounded-md text-[#dfe2ea] hover:bg-[#20232c]" aria-label="Create file manager item" onClick={openCreateMenu} type="button"><Plus size={17} /></button>
      </div>
      <UnifiedFileManagerTree />
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

const compositionFileSuffix = ".composition.ts";

export function FindMediaDialog({ findMediaRequest, onFindCompositionMedia, onFindMediaRequestChange }: { findMediaRequest: { compositionId: string; fileName: string } | null; onFindCompositionMedia: (compositionId: string, fileName: string) => void; onFindMediaRequestChange?: (request: { compositionId: string; fileName: string } | null) => void }) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(stripCompositionFileSuffix(findMediaRequest?.fileName ?? ""));
  }, [findMediaRequest]);

  function submit() {
    const name = stripCompositionFileSuffix(draft.trim());
    if (!findMediaRequest || !name) return;
    onFindCompositionMedia(findMediaRequest.compositionId, `${name}${compositionFileSuffix}`);
    onFindMediaRequestChange?.(null);
  }

  return <Dialog open={Boolean(findMediaRequest)} onOpenChange={(open) => { if (!open) onFindMediaRequestChange?.(null); }}>
    <DialogContent className="w-[min(420px,calc(100vw-32px))]">
      <DialogHeader>
        <DialogTitle>Find media in project</DialogTitle>
        <DialogDescription>Search the project folder for the missing composition source by filename.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-[#2d313b] bg-[#171920] focus-within:border-[var(--clipper-accent)]">
        <Input autoFocus className="h-9 border-0 bg-transparent focus-visible:ring-0" value={draft} placeholder="example" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} />
        <span className="grid select-none place-items-center border-l border-[#2d313b] bg-[#111319] px-3 text-sm font-bold text-[#7f8490]">{compositionFileSuffix}</span>
      </div>
      <DialogFooter>
        <button className="rounded-lg border border-[#2d313b] px-3 py-2 text-sm font-bold text-[#c7cbd6] transition hover:bg-[#20232c]" type="button" onClick={() => onFindMediaRequestChange?.(null)}>Cancel</button>
        <button className="rounded-lg bg-[var(--clipper-accent)] px-3 py-2 text-sm font-extrabold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!draft.trim()} onClick={submit}>Find</button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function stripCompositionFileSuffix(fileName: string) {
  return fileName.endsWith(compositionFileSuffix) ? fileName.slice(0, -compositionFileSuffix.length) : fileName;
}

function UnifiedFileManagerTree() {
  const { assets, compositions, compositionFolders: folders, compositionRootPath: rootPath, fileManagerState, timelines, onApplyTreeSnapshot, onFileManagerStateChange, onRenameAsset, onRenameComposition, onRenameCompositionFolder: onRenameFolder, onRenameTimeline, registerNodeExpander, registerTreeFocusClearer, setSelectedNodeId: onSelectNode, setSelectedNodeIds: onSelectNodes, onSelectTimeline } = useFileManager();
  const rawTree = useMemo(() => buildUnifiedFileTree(compositions, folders, rootPath, timelines, assets), [assets, compositions, folders, rootPath, timelines]);
  const [tree, setTree] = useState(() => syncFileTreeToSavedState(rawTree, fileManagerState?.tree));
  const initialOpenState = useMemo(() => fileManagerState?.openState ?? getFileTreeOpenState(tree), []);
  const visibleRowCount = countFileTreeNodes(tree);
  const rowDropHeight = visibleRowCount * FILE_MANAGER_ROW_HEIGHT + FILE_MANAGER_TOP_DROP_PADDING;
  const contentDropHeight = rowDropHeight + FILE_MANAGER_BOTTOM_DROP_PADDING;
  const treeHeight = Math.max(FILE_MANAGER_MIN_DROP_HEIGHT, contentDropHeight);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const nativeTreeRef = useRef<NativeTreeApi<FileManagerTreeNode> | undefined>(undefined);
  const draggingNodeRef = useRef<FileManagerTreeNode | null>(null);
  const orderReferenceTreeRef = useRef<FileManagerTreeNode[] | null>(null);
  const latestTreeRef = useRef(tree);
  const externalDragRef = useRef<{ node: Extract<FileManagerTreeNode, { kind: "composition" }>; lastMouse: { x: number; y: number }; shiftKey: boolean } | null>(null);
  const externalDragFrameRef = useRef(0);
  const pendingExternalDragMoveRef = useRef<{ mouse: { x: number; y: number }; shiftKey: boolean } | null>(null);
  const marqueeSelectionRef = useRef<{ startX: number; startY: number; pointerId: number; active: boolean } | null>(null);
  const [dropCursorVisible, setDropCursorVisible] = useState(false);
  const [dropParentId, setDropParentId] = useState<string | null | undefined>(undefined);
  const [compositionLanePreviewActive, setCompositionLanePreviewActive] = useState(false);
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);

  const hideDropCursor = useCallback(() => {
    setDropCursorVisible(false);
    setDropParentId(undefined);
  }, []);

  const updateDragPosition = useCallback((node: FileManagerTreeNode | null, mouse: { x: number; y: number } | null) => {
    draggingNodeRef.current = node;
    const rect = treeRef.current?.getBoundingClientRect();
    if (!node || !mouse || !rect) {
      hideDropCursor();
      return;
    }
    const localX = mouse.x - rect.left;
    const localY = mouse.y - rect.top;
    const outsideTree = localX < 0 || localX > rect.width || localY > treeHeight || visibleRowCount <= 0;
    if (outsideTree) {
      hideDropCursor();
      return;
    }
    const api = nativeTreeRef.current;
    const dragIds = api?.selectedNodes.some((selectedNode) => selectedNode.id === node.id) ? api.selectedNodes.map((selectedNode) => selectedNode.id) : [node.id];
    const drop = api ? getPointerFileTreeDrop(api, latestTreeRef.current, dragIds, localX, localY, rect.width) : null;
    setDropParentId(drop ? drop.parentId : undefined);
    setDropCursorVisible(true);
  }, [hideDropCursor, treeHeight, visibleRowCount]);

  const applyTreeMove = useCallback((dragIds: string[], parentId: string | null, index: number) => {
    const nextTree = moveFileTreeNodes(latestTreeRef.current, dragIds, parentId, index);
    latestTreeRef.current = nextTree;
    orderReferenceTreeRef.current = nextTree;
    setTree(nextTree);
    onApplyTreeSnapshot(createFileManagerTreeSnapshot(nextTree, rootPath, nativeTreeRef.current?.openState));
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
      nativeTreeRef.current?.deselectAll();
      nativeTreeRef.current?.onBlur();
      onSelectNode(null);
    });
    return () => registerTreeFocusClearer(null);
  }, [onSelectNode, registerTreeFocusClearer]);

  useEffect(() => {
    registerNodeExpander((nodeId: string) => {
      const api = nativeTreeRef.current;
      if (!api) return;
      api.open(nodeId);
      window.setTimeout(() => onFileManagerStateChange(createFileManagerState(latestTreeRef.current, api.openState)), 0);
    });
    return () => registerNodeExpander(null);
  }, [onFileManagerStateChange, registerNodeExpander]);

  function updateMarqueeSelection(currentX: number, currentY: number) {
    const start = marqueeSelectionRef.current;
    const api = nativeTreeRef.current;
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
    nativeTreeRef.current?.deselectAll();
    nativeTreeRef.current?.onBlur();
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
        nativeTreeRef.current?.deselectAll();
        nativeTreeRef.current?.onBlur();
        onSelectNodes([]);
      }, 0);
    }
  }

  const applyExternalCompositionDragMove = useCallback((currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    const external = externalDragRef.current;
    if (!external) return;
    external.lastMouse = currentMouse;
    external.shiftKey = shiftKey;
    dispatchExternalCompositionDrag(external.node, currentMouse, "move", shiftKey);
  }, []);

  const scheduleExternalCompositionDragMove = useCallback((currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    pendingExternalDragMoveRef.current = { mouse: currentMouse, shiftKey };
    if (externalDragFrameRef.current) return;
    externalDragFrameRef.current = window.requestAnimationFrame(() => {
      externalDragFrameRef.current = 0;
      const pending = pendingExternalDragMoveRef.current;
      pendingExternalDragMoveRef.current = null;
      if (pending) applyExternalCompositionDragMove(pending.mouse, pending.shiftKey);
    });
  }, [applyExternalCompositionDragMove]);

  const ensureExternalCompositionDrag = useCallback((compositionNode: Extract<FileManagerTreeNode, { kind: "composition" }>, currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    if (externalDragRef.current) return;
    externalDragRef.current = { node: compositionNode, lastMouse: currentMouse, shiftKey };
    applyExternalCompositionDragMove(currentMouse, shiftKey);
  }, [applyExternalCompositionDragMove]);

  const cleanupExternalCompositionDrag = useCallback((phase: "cancel" | "drop" | null) => {
    const external = externalDragRef.current;
    if (!external) return;

    if (externalDragFrameRef.current) window.cancelAnimationFrame(externalDragFrameRef.current);
    externalDragFrameRef.current = 0;
    pendingExternalDragMoveRef.current = null;

    if (phase) dispatchExternalCompositionDrag(external.node, external.lastMouse, phase, external.shiftKey);
    if (phase === "cancel" || phase === "drop") nativeTreeRef.current?.endDrag();

    externalDragRef.current = null;
  }, []);

  useEffect(() => {
    function updateCompositionLanePreview(event: Event) {
      setCompositionLanePreviewActive(Boolean((event as CustomEvent<PointerDragPreviewDetail>).detail?.active));
    }

    window.addEventListener(compositionDragPreviewEvent, updateCompositionLanePreview);
    return () => window.removeEventListener(compositionDragPreviewEvent, updateCompositionLanePreview);
  }, []);

  useEffect(() => {
    function updateCompositionLanePreview(event: Event) {
      setCompositionLanePreviewActive(Boolean((event as CustomEvent<PointerDragPreviewDetail>).detail?.active));
    }

    window.addEventListener(compositionDragPreviewEvent, updateCompositionLanePreview);
    return () => window.removeEventListener(compositionDragPreviewEvent, updateCompositionLanePreview);
  }, []);

  useEffect(() => {
    function onNativeDragEnd() {
      cleanupExternalCompositionDrag("cancel");
    }

    function updateExternalDrag(event: globalThis.DragEvent) {
      const node = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!node) return;
      if (!externalDragRef.current && isDragEventInsideElement(event, treeRef.current)) return;
      const nextMouse = { x: event.clientX, y: event.clientY };
      
      if (node.kind === "composition") {
        ensureExternalCompositionDrag(node, nextMouse, event.shiftKey);
        scheduleExternalCompositionDragMove(nextMouse, event.shiftKey);
        if (!isDragEventInsideElement(event, treeRef.current)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }
      } else if (!isDragEventInsideElement(event, treeRef.current)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    }

    function dropExternalDrag(event: globalThis.DragEvent) {
      const node = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!node) return;
      if (isDragEventInsideElement(event, treeRef.current)) return;
      
      if (node.kind === "composition") {
        if (externalDragRef.current) {
          const external = externalDragRef.current;
          external.lastMouse = { x: event.clientX, y: event.clientY };
          external.shiftKey = event.shiftKey;
          cleanupExternalCompositionDrag("drop");
        }
        event.preventDefault();
        event.stopPropagation();
      } else {
        nativeTreeRef.current?.endDrag();
        event.preventDefault();
      }
    }

    function cancelOnWindowExit(event: globalThis.DragEvent) {
      const node = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!node) return;
      const outsideWindow = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
      if (outsideWindow) {
        if (node.kind === "composition") cleanupExternalCompositionDrag("cancel");
        else nativeTreeRef.current?.endDrag();
      }
    }

    function updateShift(event: KeyboardEvent) {
      const external = externalDragRef.current;
      if (!external) return;
      scheduleExternalCompositionDragMove(external.lastMouse, event.shiftKey);
    }

    window.addEventListener("dragend", onNativeDragEnd);
    window.addEventListener("drop", dropExternalDrag, true);
    window.addEventListener("dragover", updateExternalDrag, true);
    window.addEventListener("dragleave", cancelOnWindowExit, true);
    window.addEventListener("keydown", updateShift, true);
    window.addEventListener("keyup", updateShift, true);

    return () => {
      window.removeEventListener("dragend", onNativeDragEnd);
      window.removeEventListener("drop", dropExternalDrag, true);
      window.removeEventListener("dragover", updateExternalDrag, true);
      window.removeEventListener("dragleave", cancelOnWindowExit, true);
      window.removeEventListener("keydown", updateShift, true);
      window.removeEventListener("keyup", updateShift, true);
    };
  }, [cleanupExternalCompositionDrag, ensureExternalCompositionDrag, scheduleExternalCompositionDragMove]);

  const handleMove = ({ dragIds, parentId, index }: FileManagerDropTarget) => {
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

  function handleActivate(node: NativeTreeNodeApi<FileManagerTreeNode>) {
    if (node.data.kind === "timeline") onSelectTimeline(node.data.timeline.id);
  }

  function handleSelect(nodes: NativeTreeNodeApi<FileManagerTreeNode>[]) {
    onSelectNodes(nodes.map((node) => node.id));
  }

  function handleToggle() {
    window.setTimeout(() => onFileManagerStateChange(createFileManagerState(latestTreeRef.current, nativeTreeRef.current?.openState)), 0);
  }

  function disableDrop({ parentNode, dragNodes, index }: { parentNode: NativeTreeNodeApi<FileManagerTreeNode> | { isRoot: true }; dragNodes: NativeTreeNodeApi<FileManagerTreeNode>[]; index: number }) {
    const draggedNodes = dragNodes.map((node) => node.data);
    const parentNodeData = parentNode.isRoot ? null : parentNode.data;
    const draggedIds = new Set(draggedNodes.map((node) => node.id));
    const siblings = getFileTreeChildren(tree, parentNodeData?.id ?? null).filter((node) => !draggedIds.has(node.id));
    const disabled = !draggedNodes.length || draggedNodes.some((draggedNode) => !canDropFileTreeNode(draggedNode, parentNodeData, siblings, index));
    if (disabled) hideDropCursor();
    return disabled;
  }

  const isDroppingRoot = dropParentId === null && dropCursorVisible;

  return <div ref={treeRef} className={`group/filetree relative ${isDroppingRoot ? "bg-[var(--clipper-accent-muted-surface)] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_0_0_2px_var(--clipper-accent)]" : ""}`} onPointerDownCapture={suppressEmptyTreePointerFocus} onPointerDown={handleMarqueePointerDown} onPointerMove={handleMarqueePointerMove} onPointerUp={finishMarquee} onPointerCancel={finishMarquee}>{marquee ? <FileManagerMarquee marquee={marquee} /> : null}<NativeTree<FileManagerTreeNode> ref={nativeTreeRef} data={tree} disableDrop={disableDrop} getDropTarget={({ dragIds, localX, localY, tree: api, width }) => getPointerFileTreeDrop(api, latestTreeRef.current, dragIds, localX, localY, width)} height={treeHeight} idAccessor="id" indent={FILE_MANAGER_INDENT} initialOpenState={initialOpenState} isInternal={isFileTreeFolderNode} movable onActivate={handleActivate} onMove={handleMove} onRename={handleRename} onSelect={handleSelect} onToggle={handleToggle} openByDefault={!fileManagerState?.openState} paddingBottom={FILE_MANAGER_BOTTOM_DROP_PADDING} paddingTop={FILE_MANAGER_TOP_DROP_PADDING} rowHeight={FILE_MANAGER_ROW_HEIGHT} width="100%" renderDragPreview={(previewProps) => <UnifiedTreeDragPreview {...previewProps} hideGhost={compositionLanePreviewActive} nodes={tree} onDragPositionChange={updateDragPosition} />}>{(nodeProps) => <UnifiedTreeNode {...nodeProps} />}</NativeTree></div>;
}

function isFileManagerInteractiveTarget(target: HTMLElement) {
  return Boolean(target.closest("button,input,textarea,select,[contenteditable='true'],[data-file-manager-row='true']"));
}

export function shouldSkipFileManagerShortcut(target: EventTarget | null) {
  return target instanceof HTMLElement && isTextEditingTarget(target);
}

function UnifiedTreeNode({ dragHandle, node, style }: NativeTreeNodeRendererProps<FileManagerTreeNode>) {
  const { assets, timelines, onAddComposition, onCopyAsset, onCopyCompositionPath, onCreateFolder: onCreateAssetFolder, onCreateComposition, onCreateCompositionFolder: onCreateFolder, onDeleteAsset, onDeleteComposition, onDeleteCompositionFolder: onDeleteFolder, onDeleteTimeline, onDuplicateAsset, onDuplicateComposition, requestNodeExpansion, setContextMenu: onOpenMenu, onFindMediaRequestChange, onRevealComposition, onSelectTimeline, onSortAssets } = useFileManager();
  const data = node.data;
  const displayName = data.kind === "composition" ? getDisplayNameFromPath(data.composition.filePath) :
                    data.kind === "timeline" ? getDisplayNameFromPath(data.timeline.filePath || data.timeline.id) :
                    getDisplayName(data.name);
  const [editDraft, setEditDraft] = useState(displayName);

  useEffect(() => {
    if (node.isEditing) setEditDraft(displayName);
  }, [displayName, node.isEditing]);

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
      onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "Rename", action: () => node.edit() }, { label: "Copy path", action: () => onCopyAsset(data.asset.id) }, { label: "Duplicate", action: () => onDuplicateAsset(data.asset.id) }, { label: "New folder", action: () => { onCreateAssetFolder(parentFolderId ?? undefined); if (parentFolderId) requestNodeExpansion(assetNodeId(parentFolderId)); } }, { label: "Sort by", children: getAssetSortMenuItems(parentFolderId, onSortAssets) }, { label: "Delete", action: () => onDeleteAsset(data.asset.id), danger: true }] });
      return;
    }
    if (data.kind === "project-folder") {
      onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "New composition", action: () => { onCreateComposition(data.path); requestNodeExpansion(projectFolderNodeId(data.path)); } }, { label: "New folder", action: () => { onCreateFolder(data.path); requestNodeExpansion(projectFolderNodeId(data.path)); } }, { label: "Rename", action: () => node.edit() }, { label: "Delete", action: () => onDeleteFolder(data.path), danger: true }] });
      return;
    }
    if (data.kind === "timeline") {
      onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "Rename", action: () => node.edit() }, { label: "Delete", action: () => onDeleteTimeline(data.timeline.id), danger: true, disabled: timelines.length <= 1 }] });
      return;
    }
    onOpenMenu({ x: event.clientX, y: event.clientY, items: [{ label: "Add to timeline", action: () => onAddComposition(data.composition.id) }, { label: "Rename", action: () => node.edit() }, { label: "Duplicate", action: () => onDuplicateComposition(data.composition.id) }, { label: "Copy path", action: () => onCopyCompositionPath(data.composition.id) }, { label: "Reveal in Finder", action: () => onRevealComposition(data.composition.id) }, { label: "Find media in project", action: () => onFindMediaRequestChange?.({ compositionId: data.composition.id, fileName: data.composition.filePath.split("/").pop() || data.composition.filePath }) }, { label: "Delete", action: () => onDeleteComposition(data.composition.id), danger: true }] });
  }

  const Icon = data.kind === "asset-file" ? FileIcon : data.kind === "timeline" ? ChartNoAxesGantt : data.kind === "composition" ? Clapperboard : Folder;
  const contentClass = data.kind === "composition" ? (data.composition.sourceMissing ? "text-[#8c929f]" : "text-[#38d996]") : "text-current";

  function hideNativeCompositionDragImage(event: React.DragEvent<HTMLDivElement>) {
    if (node.isEditing) return;
    event.dataTransfer.setDragImage(getTransparentNativeDragImage(), 0, 0);
    if (data.kind === "timeline") event.dataTransfer.setData("application/x-clipper-timeline", data.timeline.id);
  }

  const dropBlockClass = node.willReceiveDropWithin ? `border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] ${node.willReceiveDropBlockStart ? "" : "border-t-transparent"} ${node.willReceiveDropBlockEnd ? "" : "border-b-transparent"}` : "";

  return <div ref={dragHandle} data-file-manager-row="true" style={style} className={`relative box-border grid h-full min-w-0 cursor-pointer select-none grid-cols-[16px_18px_minmax(0,1fr)_auto] items-center gap-1.5 border px-1.5 text-[13px] ${node.isDragging ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] opacity-60" : dropBlockClass || (node.isSelected || (node.isFocused && node.tree.hasFocus) ? "border-transparent bg-[#242733]" : "border-transparent hover:bg-[#20232c]")}`} onClick={(event) => { if (!event.metaKey && !event.shiftKey && isFileTreeFolderNode(node.data)) node.toggle(); }} onContextMenu={openMenu} onDragStartCapture={hideNativeCompositionDragImage}>
    {node.isInternal ? <button className="grid h-4 w-4 place-items-center rounded text-current hover:bg-black/15" aria-label={`${node.isOpen ? "Collapse" : "Expand"} ${displayName}`} onClick={(event) => { event.stopPropagation(); node.toggle(); }} onDoubleClick={(event) => event.stopPropagation()} type="button">{node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span />}
    <Icon size={data.kind === "asset-file" || data.kind === "composition" || data.kind === "timeline" ? 16 : 17} className={contentClass} />
    {node.isEditing ? <Input autoFocus className="h-7 min-w-0 border-[var(--clipper-accent)] bg-[#171920] px-1 py-0 text-[13px]" value={editDraft} onBlur={submitEdit} onChange={(event) => setEditDraft(event.target.value)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Enter") submitEdit(); if (event.key === "Escape") node.reset(); }} /> : <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 ${contentClass}`}>{displayName}</span>}
    <span />
  </div>;
}

function UnifiedTreeDragPreview({ hideGhost, id, isDragging, mouse, nodes, onDragPositionChange }: NativeTreeDragPreviewProps & { hideGhost: boolean; nodes: FileManagerTreeNode[]; onDragPositionChange: (node: FileManagerTreeNode | null, mouse: { x: number; y: number } | null) => void }) {
  const node = id ? findFileTreeNode(nodes, id) : null;
  const internalPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDragPositionChange(isDragging ? node : null, isDragging ? mouse : null);
  }, [isDragging, mouse, node, onDragPositionChange]);

  if (!isDragging || !node || !mouse || hideGhost) return null;
  const Icon = node.kind === "asset-file" ? FileIcon : node.kind === "timeline" ? ChartNoAxesGantt : node.kind === "composition" ? Clapperboard : Folder;
  const contentClass = node.kind === "composition" ? "text-[#38d996]" : "text-current";
  const displayName = node.kind === "composition" ? getDragPreviewDisplayName(node.composition.filePath) :
                    node.kind === "timeline" ? getDragPreviewDisplayName(node.timeline.filePath || node.timeline.id) :
                    getDragPreviewDisplayName(node.name);
  return <div ref={internalPreviewRef} className={`${clipperDragGhostClassName} ${contentClass}`} style={{ transform: `translate3d(${mouse.x + clipperDragGhostOffset.x}px, ${mouse.y + clipperDragGhostOffset.y}px, 0)` }}>
    <Icon size={15} />
    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{displayName}</span>
  </div>;
}

function isDragEventInsideElement(event: globalThis.DragEvent, element: HTMLElement | null) {
  const target = event.target;
  return Boolean(element && target instanceof Node && element.contains(target));
}

function dispatchExternalCompositionDrag(node: Extract<FileManagerTreeNode, { kind: "composition" }>, mouse: { x: number; y: number }, phase: CompositionPointerDragDetail["phase"], shiftKey: boolean) {
  const composition = node.composition;
  const detail: CompositionPointerDragDetail = {
    phase,
    clientX: mouse.x,
    clientY: mouse.y,
    shiftKey,
    compositionId: composition.id,
    duration: composition.duration,
    isEmpty: composition.objects.length === 0 && composition.background.elements.length === 0,
    label: getDragPreviewDisplayName(composition.filePath),
    sourceMissing: Boolean(composition.sourceMissing),
  };
  dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
}

function FileManagerMarquee({ marquee }: { marquee: { startX: number; startY: number; currentX: number; currentY: number } }) {
  const left = Math.min(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  const width = Math.abs(marquee.currentX - marquee.startX);
  const height = Math.abs(marquee.currentY - marquee.startY);
  return <div className="pointer-events-none absolute z-30 border border-[#159dff] bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)]" style={{ left, top, width, height }} />;
}

function buildProjectFileTree(compositions: CompositionClip[], folders: string[], rootPath: string, timelines: TimelineDocument[]): ProjectFileTreeNode[] {
  const root: Extract<ProjectFileTreeNode, { kind: "folder" }> = { id: folderNodeId(""), kind: "folder", path: "", name: "", children: [] };
  for (const folder of folders) ensureCompositionFolder(root, rootPath, relativeCompositionPath(folder, rootPath).split("/").filter(Boolean));
  for (const composition of compositions) {
    const parts = relativeCompositionPath(composition.filePath, rootPath).split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) continue;
    const folder = ensureCompositionFolder(root, rootPath, parts);
    folder.children.push({ id: compositionNodeId(composition.id), kind: "composition", name: getDisplayNameFromPath(composition.filePath), composition });
  }
  for (const timeline of timelines) {
    const folderPath = getTimelineFolderPath(timeline, rootPath);
    const parts = relativeCompositionPath(folderPath, rootPath).split("/").filter(Boolean);
    ensureCompositionFolder(root, rootPath, parts).children.push({ id: timelineNodeId(timeline.id), kind: "timeline", name: getDisplayNameFromPath(timeline.filePath || timeline.id), timeline });
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
  if (node.kind === "composition") return { id: compositionNodeId(node.composition.id), kind: "composition", name: getDisplayNameFromPath(node.composition.filePath), composition: node.composition };
  return { id: timelineNodeId(node.timeline.id), kind: "timeline", name: getDisplayNameFromPath(node.timeline.filePath || node.timeline.id), timeline: node.timeline };
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

function getTopLevelSelectedNodeData(selectedNodes: NativeTreeNodeApi<FileManagerTreeNode>[]): FileManagerTreeNode[] {
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
  if (parentNode && (draggedNode.id === parentNode.id || isFileTreeNodeDescendantOf(draggedNode, parentNode.id))) return false;

  if (draggedNode.kind === "asset-file" || draggedNode.kind === "asset-folder") {
    if (parentNode && parentNode.kind !== "asset-folder") return false;
    if (parentNode?.kind === "asset-folder") return true;
    return !!getUnifiedAssetReorderTarget(siblings.filter((node) => node.id !== draggedNode.id), index);
  }

  if (parentNode && parentNode.kind !== "project-folder") return false;
  return true;
}

function isFileTreeNodeDescendantOf(node: FileManagerTreeNode, ancestorId: string): boolean {
  if (node.kind !== "project-folder" && node.kind !== "asset-folder") return false;
  return node.children.some((child) => child.id === ancestorId || isFileTreeNodeDescendantOf(child, ancestorId));
}

export function getPointerFileTreeDrop(api: NativeTreeApi<FileManagerTreeNode>, tree: FileManagerTreeNode[], dragIds: string[], localX: number, localY: number, width: number): FileManagerDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (localX < 0 || localX > width) return null;
  const rowBottom = FILE_MANAGER_TOP_DROP_PADDING + visibleNodes.length * FILE_MANAGER_ROW_HEIGHT;
  if (!visibleNodes.length || localY < FILE_MANAGER_TOP_DROP_PADDING || localY > rowBottom) {
    const index = localY < FILE_MANAGER_TOP_DROP_PADDING ? 0 : tree.length;
    return canDropFileTreeTarget(tree, dragIds, null, index) ? { dragIds, parentId: null, index } : null;
  }

  const rowIndex = Math.max(0, Math.min(visibleNodes.length - 1, Math.floor((localY - FILE_MANAGER_TOP_DROP_PADDING) / FILE_MANAGER_ROW_HEIGHT)));
  const node = visibleNodes[rowIndex];
  if (!node) return null;

  const yInRow = localY - FILE_MANAGER_TOP_DROP_PADDING - rowIndex * FILE_MANAGER_ROW_HEIGHT;
  const inTopHalf = yInRow < FILE_MANAGER_ROW_HEIGHT / 2;
  const inMiddle = yInRow > FILE_MANAGER_ROW_HEIGHT / 4 && yInRow < FILE_MANAGER_ROW_HEIGHT * 0.75;
  const atTop = !inMiddle && inTopHalf;
  const hoverLevel = Math.round(Math.max(0, localX - FILE_MANAGER_INDENT) / FILE_MANAGER_INDENT);
  const drop = getNodePointerDropTarget(node, hoverLevel, inTopHalf, inMiddle, atTop);
  if (drop && canDropFileTreeTarget(tree, dragIds, drop.parentId, drop.index)) return { ...drop, dragIds };
  const fallback = getNearestValidFileTreeDrop(tree, dragIds, drop);
  if (fallback) return { ...fallback, dragIds };
  const visibleFallback = getNearestValidVisibleFileTreeDrop(tree, dragIds, visibleNodes, rowIndex);
  return visibleFallback ? { ...visibleFallback, dragIds } : null;
}

function getNearestValidFileTreeDrop(tree: FileManagerTreeNode[], dragIds: string[], drop: Omit<FileManagerDropTarget, "dragIds"> | null): Omit<FileManagerDropTarget, "dragIds"> | null {
  if (!drop) return null;
  const siblings = getFileTreeChildren(tree, drop.parentId);
  for (let distance = 1; distance <= siblings.length + 1; distance += 1) {
    const before = drop.index - distance;
    if (before >= 0 && canDropFileTreeTarget(tree, dragIds, drop.parentId, before)) return { ...drop, index: before };
    const after = drop.index + distance;
    if (after <= siblings.length && canDropFileTreeTarget(tree, dragIds, drop.parentId, after)) return { ...drop, index: after };
  }
  return null;
}

function getNearestValidVisibleFileTreeDrop(tree: FileManagerTreeNode[], dragIds: string[], visibleNodes: NativeTreeNodeApi<FileManagerTreeNode>[], rowIndex: number): Omit<FileManagerDropTarget, "dragIds"> | null {
  for (let distance = 0; distance < visibleNodes.length; distance += 1) {
    const before = visibleNodes[rowIndex - distance];
    if (before && Number.isInteger(before.childIndex)) {
      const drops = [
        { parentId: fileTreeNodeParentId(before.parent), index: before.childIndex },
        { parentId: null, index: getRootFileTreeIndex(tree, before.id) },
      ];
      for (const drop of drops) if (drop.index >= 0 && canDropFileTreeTarget(tree, dragIds, drop.parentId, drop.index)) return drop;
    }
    const after = visibleNodes[rowIndex + distance];
    if (after && Number.isInteger(after.childIndex)) {
      const rootIndex = getRootFileTreeIndex(tree, after.id);
      const drops = [
        { parentId: fileTreeNodeParentId(after.parent), index: after.childIndex + 1 },
        { parentId: null, index: rootIndex >= 0 ? rootIndex + 1 : -1 },
      ];
      for (const drop of drops) if (drop.index >= 0 && canDropFileTreeTarget(tree, dragIds, drop.parentId, drop.index)) return drop;
    }
  }
  return null;
}

function getRootFileTreeIndex(tree: FileManagerTreeNode[], nodeId: string) {
  return tree.findIndex((node) => node.id === nodeId || isFileTreeNodeDescendantOf(node, nodeId));
}

function getNodePointerDropTarget(node: NativeTreeNodeApi<FileManagerTreeNode>, hoverLevel: number, inTopHalf: boolean, inMiddle: boolean, atTop: boolean): Omit<FileManagerDropTarget, "dragIds"> | null {
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

function getFileTreeNodesAroundCursor(node: NativeTreeNodeApi<FileManagerTreeNode>, inTopHalf: boolean, inMiddle: boolean, atTop: boolean): [NativeTreeNodeApi<FileManagerTreeNode> | null, NativeTreeNodeApi<FileManagerTreeNode> | null] {
  if (node.isInternal) {
    if (atTop) return [node.prev, node];
    if (inMiddle) return [node, node];
    return [node, node.next];
  }
  return inTopHalf ? [node.prev, node] : [node, node.next];
}

function walkFileTreeDropUpFrom(node: NativeTreeNodeApi<FileManagerTreeNode>, level: number): Omit<FileManagerDropTarget, "dragIds"> {
  let drop = node;
  while (drop.parent && drop.level > level) drop = drop.parent;
  return { parentId: fileTreeNodeParentId(drop.parent), index: drop.childIndex + 1 };
}

function fileTreeNodeParentId(node: NativeTreeNodeApi<FileManagerTreeNode> | null | undefined) {
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

export function moveFileTreeNodesForTest(nodes: FileManagerTreeNode[], dragIds: string[], parentId: string | null, index: number) {
  return moveFileTreeNodes(nodes, dragIds, parentId, index);
}

function moveFileTreeNodes(nodes: FileManagerTreeNode[], dragIds: string[], parentId: string | null, index: number): FileManagerTreeNode[] {
  const dragIdSet = new Set(dragIds);
  const removed: FileManagerTreeNode[] = [];
  const siblingIds = getFileTreeChildren(nodes, parentId).map((node) => node.id);
  const withoutDragged = removeFileTreeNodesForMove(nodes, dragIdSet, removed);
  const insertionIndex = getFileTreeMoveInsertionIndex(siblingIds, dragIdSet, index);
  return insertFileTreeNodesForMove(withoutDragged, parentId, insertionIndex, removed);
}

export function getFileTreeMoveInsertionIndex(siblingIds: string[], dragIds: ReadonlySet<string>, rawIndex: number) {
  const draggedBeforeIndex = siblingIds.filter((id, originalIndex) => dragIds.has(id) && originalIndex < rawIndex).length;
  return Math.max(0, rawIndex - draggedBeforeIndex);
}

function removeFileTreeNodesForMove(nodes: FileManagerTreeNode[], dragIds: Set<string>, removed: FileManagerTreeNode[]): FileManagerTreeNode[] {
  return nodes.flatMap((node) => {
    if (dragIds.has(node.id)) {
      removed.push(node);
      return [];
    }
    if (node.kind === "project-folder" || node.kind === "asset-folder") return [{ ...node, children: removeFileTreeNodesForMove(node.children, dragIds, removed) } as FileManagerTreeNode];
    return [node];
  });
}

function insertFileTreeNodesForMove(nodes: FileManagerTreeNode[], parentId: string | null, index: number, insertNodes: FileManagerTreeNode[]): FileManagerTreeNode[] {
  if (!parentId) return [...nodes.slice(0, index), ...insertNodes, ...nodes.slice(index)];
  return nodes.map((node) => {
    if ((node.kind === "project-folder" || node.kind === "asset-folder") && node.id === parentId) return { ...node, children: [...node.children.slice(0, index), ...insertNodes, ...node.children.slice(index)] } as FileManagerTreeNode;
    if (node.kind === "project-folder" || node.kind === "asset-folder") return { ...node, children: insertFileTreeNodesForMove(node.children, parentId, index, insertNodes) } as FileManagerTreeNode;
    return node;
  });
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
