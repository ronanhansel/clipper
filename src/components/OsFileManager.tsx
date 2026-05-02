import { ChartNoAxesGantt, ChevronDown, ChevronRight, Clapperboard, File, FileCode, FileJson, Folder, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import toast from "react-hot-toast";
import { isTextEditingTarget } from "../app/features/shortcuts/useGlobalEditorShortcuts";
import type { ContextMenuState } from "../app/types";
import { clipperHost } from "../app/clipperHost";
import { getDirectoryPath, nextNumberedName } from "../app/features/file-manager/fileManagerPaths";
import { getDisplayName, getDragPreviewDisplayName, getFileType, nextNumberedSemanticName, reconstructFileName } from "../core/fileNames";
import { createDefaultTimelineLayerState } from "../core/project";
import { getTransparentNativeDragImage } from "../lib/nativeDragImage";
import { clipperDragGhostClassName, clipperDragGhostOffset, compositionDragPreviewEvent, compositionPointerDragEvent, dispatchClipperPointerDrag, type CompositionPointerDragDetail, type PointerDragPreviewDetail } from "../lib/pointerDrag";
import { AppContextMenu } from "./AppContextMenu";
import { NativeTree, type NativeTreeApi, type NativeTreeDragPreviewProps, type NativeTreeDropTarget, type NativeTreeNodeApi, type NativeTreeNodeRendererProps } from "./tree/NativeTree";
import { Input } from "./ui/input";
import { DeleteCommand } from "../app/features/file-manager/operations/DeleteCommand";
import { RenameCommand } from "../app/features/file-manager/operations/RenameCommand";
import { CreateCommand } from "../app/features/file-manager/operations/CreateCommand";
import { MoveCommand } from "../app/features/file-manager/operations/MoveCommand";
import type { Command } from "../app/features/file-manager/operations/Command";
import { rebasePath, type PendingPathMove } from "../app/features/file-manager/optimisticPathRebase";

type OsFileNode = {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  isComposition?: boolean;
  timelineId?: string;
  children?: OsFileNode[];
};

export type OsFileManagerProps = {
  projectDirectory: string;
  selectedCompositionId?: string;
  selectedTimelineId?: string;
  fileSystemRevision?: number;
  onReloadProject: () => Promise<void>;
  onSelectComposition: (compositionId: string) => void;
  onSelectTimeline: (timelineId: string) => void;
  executeFileManagerCommand: (command: Command) => Promise<void>;
};

const ROW_HEIGHT = 30;
const INDENT = 24;
const MIN_TREE_HEIGHT = 360;

export function OsFileManager({
  projectDirectory,
  selectedCompositionId,
  selectedTimelineId,
  fileSystemRevision,
  onSelectComposition,
  onSelectTimeline,
  executeFileManagerCommand,
}: OsFileManagerProps) {
  const [treeData, setTreeData] = useState<OsFileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeContainerRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<NativeTreeApi<OsFileNode> | undefined>(undefined);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [effectiveDirectory, setEffectiveDirectory] = useState(projectDirectory);
  const loadedDirectoryRef = useRef<string | null>(null);
  const openStateRef = useRef<Record<string, boolean>>({});
  const externalDragRef = useRef<{ node: OsFileNode; lastMouse: { x: number; y: number }; shiftKey: boolean } | null>(null);
  const externalDragFrameRef = useRef(0);
  const pendingExternalDragMoveRef = useRef<{ mouse: { x: number; y: number }; shiftKey: boolean } | null>(null);
  const draggingNodeRef = useRef<OsFileNode | null>(null);
  const pendingPathMovesRef = useRef<PendingPathMove[]>([]);
  const [compositionLanePreviewActive, setCompositionLanePreviewActive] = useState(false);
  const [rootDropVisible, setRootDropVisible] = useState(false);

  const getCompositionDragDetail = useCallback((node: OsFileNode, phase: CompositionPointerDragDetail["phase"], currentMouse: { x: number; y: number }, shiftKey: boolean): CompositionPointerDragDetail => ({
    phase,
    clientX: currentMouse.x,
    clientY: currentMouse.y,
    shiftKey,
    compositionId: projectRelativeFilePath(node.path, projectDirectory),
    duration: 5,
    isEmpty: true,
    label: getDragPreviewDisplayName(node.name),
    sourceMissing: false,
  }), [projectDirectory]);

  const applyExternalCompositionDragMove = useCallback((currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    const external = externalDragRef.current;
    if (!external) return;
    external.lastMouse = currentMouse;
    external.shiftKey = shiftKey;
    const detail = getCompositionDragDetail(external.node, "move", currentMouse, shiftKey);
    dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
  }, [getCompositionDragDetail]);

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

  const ensureExternalCompositionDrag = useCallback((node: OsFileNode, currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    if (externalDragRef.current) return;
    externalDragRef.current = { node, lastMouse: currentMouse, shiftKey };
    applyExternalCompositionDragMove(currentMouse, shiftKey);
  }, [applyExternalCompositionDragMove]);

  const cleanupExternalCompositionDrag = useCallback((phase: "cancel" | "drop" | null) => {
    const external = externalDragRef.current;
    if (!external) return;
    
    if (externalDragFrameRef.current) window.cancelAnimationFrame(externalDragFrameRef.current);
    externalDragFrameRef.current = 0;
    pendingExternalDragMoveRef.current = null;
    if (phase) {
      const detail = getCompositionDragDetail(external.node, phase, external.lastMouse, external.shiftKey);
      dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
      if (phase === "cancel" || phase === "drop") treeRef.current?.endDrag();
    }
    externalDragRef.current = null;
  }, [getCompositionDragDetail]);

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
      const nodeData = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!nodeData) return;
      if (!externalDragRef.current && isDragEventInsideElement(event, containerRef.current)) return;
      const nextMouse = { x: event.clientX, y: event.clientY };
      
      if (nodeData.isComposition) {
        ensureExternalCompositionDrag(nodeData, nextMouse, event.shiftKey);
        scheduleExternalCompositionDragMove(nextMouse, event.shiftKey);
        if (!isDragEventInsideElement(event, containerRef.current)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }
      } else if (!isDragEventInsideElement(event, containerRef.current)) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
    }

    function dropExternalDrag(event: globalThis.DragEvent) {
      const nodeData = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!nodeData) return;
      if (isDragEventInsideElement(event, containerRef.current)) return;
      
      if (nodeData.isComposition) {
        if (externalDragRef.current) {
          const external = externalDragRef.current;
          external.lastMouse = { x: event.clientX, y: event.clientY };
          external.shiftKey = event.shiftKey;
          cleanupExternalCompositionDrag("drop");
        }
        event.preventDefault();
        event.stopPropagation();
      } else {
        treeRef.current?.endDrag();
        event.preventDefault();
      }
    }

    function cancelOnWindowExit(event: globalThis.DragEvent) {
      const nodeData = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!nodeData) return;
      const outsideWindow = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
      if (outsideWindow) {
        if (nodeData.isComposition) cleanupExternalCompositionDrag("cancel");
        else treeRef.current?.endDrag();
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
      cleanupExternalCompositionDrag("cancel");
    };
  }, [cleanupExternalCompositionDrag, ensureExternalCompositionDrag, scheduleExternalCompositionDragMove]);

  const execute = useCallback(async (command: Command) => {
    try {
      await executeFileManagerCommand(command);
    } catch (error) {
      console.error(error);
      pendingPathMovesRef.current = [];
      setRefreshKey((k) => k + 1);
      throw error;
    }
  }, [executeFileManagerCommand]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const entries = await clipperHost.listDirectory(projectDirectory);
        if (!cancelled) {
          const hasFileManager = entries.some((e) => e.isDirectory && e.name === "file-manager");
          setEffectiveDirectory(hasFileManager ? `${projectDirectory}/file-manager` : projectDirectory);
        }
      } catch {
        if (!cancelled) setEffectiveDirectory(projectDirectory);
      }
    }
    resolve();
    return () => { cancelled = true; };
  }, [projectDirectory]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const showInitialLoading = loadedDirectoryRef.current !== effectiveDirectory;
      if (showInitialLoading) setLoading(true);
      try {
        const children = await loadDirectoryTree(effectiveDirectory, projectDirectory);
        if (!cancelled) {
          loadedDirectoryRef.current = effectiveDirectory;
          setTreeData(children);
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Unable to load project directory.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [effectiveDirectory, refreshKey, fileSystemRevision, projectDirectory]);

  useEffect(() => {
    pendingPathMovesRef.current = [];
  }, [fileSystemRevision, effectiveDirectory]);

  useEffect(() => {
    const api = treeRef.current;
    if (!api) return;
    let targetId: string | null = null;
    if (selectedCompositionId) {
      targetId = `${effectiveDirectory}/compositions/${selectedCompositionId}.ts`;
    } else if (selectedTimelineId) {
      // Find the timeline node by its internal ID
      const timelineNode = findTimelineNodeById(treeData, selectedTimelineId);
      if (timelineNode) {
        targetId = timelineNode.id;
      }
    }
    if (targetId) {
      api.select(targetId, { align: "auto" });
      setSelectedNodeIds([targetId]);
    }
  }, [selectedCompositionId, selectedTimelineId, effectiveDirectory, treeData]);

  const handleFileActivate = useCallback(
    (nodeData: OsFileNode) => {
      const fileType = getFileType(nodeData.name, nodeData.isDirectory, nodeData.isComposition);
      const displayName = getDisplayName(nodeData.name);
      if (fileType === "composition") {
        onSelectComposition(projectRelativeFilePath(nodeData.path, projectDirectory));
      } else if (fileType === "timeline") {
        onSelectTimeline(nodeData.timelineId ?? displayName);
      }
    },
    [onSelectComposition, onSelectTimeline, projectDirectory]
  );

  const handleSelect = useCallback((nodes: NativeTreeNodeApi<OsFileNode>[]) => {
    setSelectedNodeIds(nodes.map((n) => n.id));
  }, []);

  const openContextMenu = useCallback(
    (event: ReactMouseEvent, node: NativeTreeNodeApi<OsFileNode> | null) => {
      event.preventDefault();
      event.stopPropagation();
      const items: NonNullable<ContextMenuState>["items"] = [];
      const selectedNodes = node?.isSelected ? getTopLevelOsFileNodes(node.tree.selectedNodes.map((selectedNode) => selectedNode.data)) : [];
      const shouldUseSelection = selectedNodes.length > 1;
      if (!node || node.data.path === effectiveDirectory) {
        items.push(
          { label: "New Composition", action: () => void createNewComposition(effectiveDirectory) },
          { label: "New Timeline", action: () => void createNewTimeline(effectiveDirectory) },
          { label: "New Folder", action: () => void createNewFolder(effectiveDirectory) },
          { label: "Reveal in Finder", action: () => void clipperHost.revealFile(effectiveDirectory) }
        );
      } else if (node.data.isDirectory) {
        items.push(
          { label: "New Composition", action: () => void createNewComposition(node.data.path) },
          { label: "New Timeline", action: () => void createNewTimeline(node.data.path) },
          { label: "New Folder", action: () => void createNewFolder(node.data.path) },
          { label: "Rename", action: () => node.edit() },
          { label: shouldUseSelection ? `Delete ${selectedNodes.length} items` : "Delete", action: () => void deleteNodes(shouldUseSelection ? selectedNodes : [node.data]), danger: true },
          { label: "Reveal in Finder", action: () => void clipperHost.revealFile(node.data.path) }
        );
      } else {
        items.push(
          { label: "Rename", action: () => node.edit() },
          { label: shouldUseSelection ? `Delete ${selectedNodes.length} items` : "Delete", action: () => void deleteNodes(shouldUseSelection ? selectedNodes : [node.data]), danger: true },
          { label: "Reveal in Finder", action: () => void clipperHost.revealFile(node.data.path) }
        );
        if (node.data.isComposition) {
          items.push({
            label: "Open in External Editor",
            action: () => {
              if (window.clipper?.openCompositionFile) {
                window.clipper.openCompositionFile(node.data.path);
              } else {
                void clipperHost.revealFile(node.data.path);
              }
            },
          });
        }
      }
      setContextMenu({ x: event.clientX, y: event.clientY, items });
    },
    [effectiveDirectory]
  );

  async function createNewComposition(basePath: string) {
    try {
      const parentPath = basePath === effectiveDirectory ? `${effectiveDirectory}/compositions` : basePath;
      const entries = await clipperHost.listDirectory(parentPath).catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedSemanticName("untitled", ".composition.ts", names);
      const content = `import { Composition } from "@clipper/composition-api";

export const composition = new Composition({
  duration: 5,
  frame: { width: 1920, height: 1080, style: {} },
  background: { id: "bg", name: "Background", style: {}, elements: [] },
  render() {
    return [];
      },
    });
`;
      const filePath = `${parentPath}/${name}`;
      setTreeData((current) => addNode(current, parentPath, { id: filePath, name, path: filePath, isDirectory: false, isComposition: true }));
      await execute(new CreateCommand(filePath, name, false, content));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create composition.");
    }
  }

  async function createNewTimeline(basePath: string) {
    try {
      const parentPath = basePath === effectiveDirectory ? `${effectiveDirectory}/timelines` : basePath;
      const entries = await clipperHost.listDirectory(parentPath).catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedSemanticName("New Timeline", ".timeline.json", names);
      const content = JSON.stringify({
        clips: [],
        adjustmentLayers: [],
        motionMarkers: [],
        transitionLayers: [],
        timelineLayers: createDefaultTimelineLayerState(),
        settings: {},
      }, null, 2);
      const filePath = `${parentPath}/${name}`;
      setTreeData((current) => addNode(current, parentPath, { id: filePath, name, path: filePath, isDirectory: false }));
      await execute(new CreateCommand(filePath, name, false, content));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create timeline.");
    }
  }

  async function createNewFolder(parentPath: string) {
    try {
      const entries = await clipperHost.listDirectory(parentPath).catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedName("New Folder", names);
      const folderPath = `${parentPath}/${name}`;
      setTreeData((current) => addNode(current, parentPath, { id: folderPath, name, path: folderPath, isDirectory: true, children: [] }));
      await execute(new CreateCommand(folderPath, name, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create folder.");
    }
  }

  async function deleteNode(node: OsFileNode) {
    await deleteNodes([node]);
  }

  async function deleteNodes(nodes: OsFileNode[]) {
    const nodesToDelete = getTopLevelOsFileNodes(nodes).filter((node) => {
      if (node.path !== effectiveDirectory) return true;
      toast.error("Cannot delete the project root folder.");
      return false;
    });
    if (!nodesToDelete.length) return;

    try {
      setTreeData((current) => removeNodes(current, nodesToDelete));
      await execute(new DeleteCommand(nodesToDelete.map((node) => ({ path: node.path, name: node.name, isDirectory: node.isDirectory })), effectiveDirectory));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete.");
      setRefreshKey((k) => k + 1);
    }
  }

  function removeNodes(nodes: OsFileNode[], nodesToRemove: OsFileNode[]): OsFileNode[] {
    return nodes.filter(node => !nodesToRemove.some(n => n.id === node.id))
                .map(node => ({
                  ...node,
                  children: node.children ? removeNodes(node.children, nodesToRemove) : undefined
                }));
  }

  const data = useMemo(() => treeData, [treeData]);

  const handleRename = useCallback(
    async ({ id, name }: { id: string; name: string }) => {
      let node = findNode(treeData, id);
      if (!node) {
        // ... (findNode logic)
        const parentPath = getDirectoryPath(id);
        const baseName = id.split("/").pop() || "";
        const parentEntries = await clipperHost.listDirectory(parentPath).catch(() => []);
        const found = parentEntries.find((e) => e.name === baseName);
        if (found) {
          node = { id, name: found.name, path: id, isDirectory: found.isDirectory };
        }
      }
      if (!node) {
        toast.error("Cannot rename: file information is not loaded. Try again after the tree refreshes.");
        setRefreshKey((k) => k + 1);
        return;
      }
      
      const nextFullName = reconstructFileName(name, node.name);
      const oldPath = rebasePath(node.path, pendingPathMovesRef.current);
      if (oldPath.endsWith(`/${nextFullName}`)) return; // No change
      const parentPath = getDirectoryPath(oldPath);
      const newPath = `${parentPath}/${nextFullName}`;
      pendingPathMovesRef.current.push({ oldPath, newPath });
      setTreeData((current) => renameNode(current, node.path, nextFullName));

      try {
        const entries = await clipperHost.listDirectory(parentPath);
        const exists = entries.some((e) => e.name.toLowerCase() === nextFullName.toLowerCase() && `${parentPath}/${e.name}` !== oldPath);
        if (exists) {
          toast.error(`A file or folder named "${nextFullName}" already exists.`);
          pendingPathMovesRef.current = pendingPathMovesRef.current.filter((move) => move.oldPath !== oldPath || move.newPath !== newPath);
          setTreeData((current) => renameNode(current, newPath, node.name));
          setRefreshKey((k) => k + 1);
          return;
        }
        
        const command = new RenameCommand(oldPath, nextFullName);
        await execute(command);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to rename.");
        pendingPathMovesRef.current = pendingPathMovesRef.current.filter((move) => move.oldPath !== oldPath || move.newPath !== newPath);
        setRefreshKey((k) => k + 1);
      }
    },
    [treeData, execute]
  );

  const handleMove = useCallback(
    async ({ dragIds, parentId }: NativeTreeDropTarget) => {
      const targetFolderId = parentId ?? effectiveDirectory;
      let targetFolder = targetFolderId === effectiveDirectory ? { id: effectiveDirectory, name: effectiveDirectory.split("/").pop() || "", path: effectiveDirectory, isDirectory: true } : findNode(treeData, targetFolderId);
      if (!targetFolder || !targetFolder.isDirectory) {
        const parentEntries = await clipperHost.listDirectory(targetFolderId).catch(() => []);
        if (parentEntries.length > 0) {
          targetFolder = { id: targetFolderId, name: targetFolderId.split("/").pop() || "", path: targetFolderId, isDirectory: true };
        }
      }
      if (!targetFolder || !targetFolder.isDirectory) return;
      let moved = false;
      const moves: Array<{ oldPath: string; newPath: string }> = [];
      const targetFolderPath = rebasePath(targetFolder.path, pendingPathMovesRef.current);

      for (const dragId of getTopLevelOsFileIds(dragIds)) {
        let node = findNode(treeData, dragId);
        if (!node) {
          const parts = dragId.split("/");
          const baseName = parts.pop() || "";
          const parentPath = parts.join("/");
          const parentEntries = await clipperHost.listDirectory(parentPath).catch(() => []);
          const found = parentEntries.find((e) => e.name === baseName);
          if (found) {
            node = { id: dragId, name: found.name, path: dragId, isDirectory: found.isDirectory };
          }
        }
        if (!node) {
          toast.error("Cannot move: file information is not loaded. Try again after the tree refreshes.");
          setRefreshKey((k) => k + 1);
          continue;
        }
        const oldPath = rebasePath(node.path, pendingPathMovesRef.current);
        const newPath = `${targetFolderPath}/${node.name}`;
        if (!canMoveOsFilePath(oldPath, newPath)) continue;
        moves.push({ oldPath, newPath });
        moved = true;
      }
      if (moved) {
        try {
          pendingPathMovesRef.current.push(...moves);
          setTreeData((current) => moveNodes(current, moves, effectiveDirectory));
          await execute(new MoveCommand(moves));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to move file.";
          if (message.toLowerCase().includes("already exists") || message.toLowerCase().includes("file exists")) {
            toast.error("One or more files already exist in the destination.");
          } else {
            toast.error(message);
          }
        }
      }
    },
    [effectiveDirectory, treeData, execute]
  );

  function handlePanelContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || isFileManagerInteractiveTarget(target)) return;
    openContextMenu(event, null);
  }

  const disableDrop = useCallback(
    ({ parentNode, dragNodes }: { parentNode: NativeTreeNodeApi<OsFileNode> | { isRoot: true }; dragNodes: NativeTreeNodeApi<OsFileNode>[]; index: number }) => {
      if (parentNode.isRoot) return false;
      if (!parentNode.data.isDirectory) return true;
      if (dragNodes.some((n) => parentNode.data.path.startsWith(`${n.data.path}/`))) return true;
      return false;
    },
    []
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && isTextEditingTarget(target)) return;
    deleteSelectedNodes(event);
  }

  function deleteSelectedNodes(event: Pick<ReactKeyboardEvent<HTMLElement> | KeyboardEvent, "ctrlKey" | "key" | "metaKey" | "preventDefault" | "stopPropagation">) {
    if (event.key !== "Backspace" || (!event.metaKey && !event.ctrlKey)) return false;
    if (!selectedNodeIds.length) return false;
    const nodesToDelete = selectedNodeIds.map((id) => findNode(treeData, id)).filter(Boolean) as OsFileNode[];
    if (!nodesToDelete.length) return false;
    event.preventDefault();
    event.stopPropagation();
    void deleteNodes(nodesToDelete);
    return true;
  }

  useEffect(() => {
    function onWindowPointerDown(event: globalThis.PointerEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      treeRef.current?.deselectAll();
      treeRef.current?.onBlur();
      setSelectedNodeIds([]);
    }

    window.addEventListener("pointerdown", onWindowPointerDown);
    return () => window.removeEventListener("pointerdown", onWindowPointerDown);
  }, []);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && isTextEditingTarget(target)) return;
      deleteSelectedNodes(event);
    }

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => window.removeEventListener("keydown", onWindowKeyDown, true);
  }, [selectedNodeIds, treeData]);

  function handlePanelPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || isFileManagerInteractiveTarget(target)) return;
    treeRef.current?.deselectAll();
    treeRef.current?.onBlur();
    setSelectedNodeIds([]);
  }

  function updateRootDropPreview(node: OsFileNode | null, mouse: { x: number; y: number } | null) {
    draggingNodeRef.current = node;
    if (!node || !mouse) {
      setRootDropVisible(false);
      return;
    }
    const rect = treeContainerRef.current?.getBoundingClientRect();
    const api = treeRef.current;
    if (!rect || !api) {
      setRootDropVisible(false);
      return;
    }
    const localX = mouse.x - rect.left;
    const localY = mouse.y - rect.top;
    const dragIds = api.selectedNodes.some((selectedNode) => selectedNode.id === node.id) ? api.selectedNodes.map((selectedNode) => selectedNode.id) : [node.id];
    const dropTarget = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height ? getOsFileDropTarget(api, dragIds, localY) ?? getDefaultOsFileDropTarget(api, dragIds, localY) : null;
    setRootDropVisible(dropTarget?.parentId === null);
  }

  const totalRowCount = countNodes(data);
  const treeHeight = Math.max(MIN_TREE_HEIGHT, totalRowCount * ROW_HEIGHT);
  const initialOpenState = useMemo(() => {
    if (Object.keys(openStateRef.current).length > 0) return openStateRef.current;
    const topState: Record<string, boolean> = {};
    for (const node of treeData) {
      if (node.isDirectory) topState[node.id] = true;
    }
    return topState;
  }, [treeData]);

  function handleToggle() {
    const api = treeRef.current;
    if (!api) return;
    openStateRef.current = { ...api.openState };
  }

  return (
    <section
      ref={containerRef}
      data-file-manager-panel
      className="group/filetree min-h-0 min-w-0 overflow-auto rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3"
      onContextMenu={handlePanelContextMenu}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePanelPointerDown}
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h3 className="text-[13px] text-[#aeb3c1]">File Manager</h3>
      </div>
      {loading ? (
        <div className="px-0.5 text-[13px] text-[#737884]">Loading...</div>
      ) : (
        <div ref={treeContainerRef} className={`relative ${rootDropVisible ? "bg-[var(--clipper-accent-muted-surface)] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_0_0_2px_var(--clipper-accent)]" : ""}`}>
        <NativeTree<OsFileNode>
          ref={treeRef}
          data={data}
          disableDrop={disableDrop}
          getDropTarget={({ dragIds, localY, tree: api }) => getOsFileDropTarget(api, dragIds, localY)}
          height={treeHeight}
          idAccessor="id"
          indent={INDENT}
          initialOpenState={initialOpenState}
          isInternal={(node) => node.isDirectory}
          movable
          onMove={handleMove}
          onRename={handleRename}
          onSelect={handleSelect}
          onActivate={(node) => handleFileActivate(node.data)}
          onToggle={handleToggle}
          openByDefault={false}
          paddingBottom={0}
          paddingTop={0}
          renderDragPreview={(previewProps) => <OsFileDragPreview {...previewProps} hideGhost={compositionLanePreviewActive} nodes={treeData} onDragPositionChange={updateRootDropPreview} />}
          rowHeight={ROW_HEIGHT}
          width="100%"
        >
          {(props) => <OsFileTreeNode {...props} effectiveDirectory={effectiveDirectory} onContextMenu={openContextMenu} />}
        </NativeTree>
        </div>
      )}
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

function OsFileDragPreview({ hideGhost, id, isDragging, mouse, nodes, onDragPositionChange }: NativeTreeDragPreviewProps & { hideGhost: boolean; nodes: OsFileNode[]; onDragPositionChange: (node: OsFileNode | null, mouse: { x: number; y: number } | null) => void }) {
  const nodeData = id ? findNode(nodes, id) : null;
  const internalPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDragPositionChange(isDragging ? nodeData : null, isDragging ? mouse : null);
  }, [isDragging, mouse, nodeData, onDragPositionChange]);

  if (!isDragging || !nodeData || !mouse || hideGhost) return null;
  const fileType = getFileType(nodeData.name, nodeData.isDirectory, nodeData.isComposition);
  const Icon = nodeData.isDirectory ? Folder : fileType === "composition" ? Clapperboard : fileType === "timeline" ? ChartNoAxesGantt : File;
  const contentClass = fileType === "composition" ? "text-[#38d996]" : "text-current";

  return (
    <div
      ref={internalPreviewRef}
      className={`${clipperDragGhostClassName} ${contentClass}`}
      style={{ transform: `translate3d(${mouse.x + clipperDragGhostOffset.x}px, ${mouse.y + clipperDragGhostOffset.y}px, 0)` }}
    >
      <Icon size={15} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{getDragPreviewDisplayName(nodeData.name)}</span>
    </div>
  );
}

function isDragEventInsideElement(event: globalThis.DragEvent, element: HTMLElement | null) {
  const target = event.target;
  return Boolean(element && target instanceof Node && element.contains(target));
}

function isFileManagerInteractiveTarget(target: HTMLElement) {
  return Boolean(target.closest("button,input,textarea,select,[contenteditable='true'],[data-file-manager-row='true']"));
}

function canMoveOsFilePath(oldPath: string, newPath: string) {
  return oldPath !== newPath && !newPath.startsWith(`${oldPath}/`);
}

function getOsFileDropTarget(api: NativeTreeApi<OsFileNode>, dragIds: string[], localY: number): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (!visibleNodes.length || localY < 0 || localY > visibleNodes.length * ROW_HEIGHT) return canDropOsFileRoot(api, dragIds) ? { dragIds, parentId: null, index: visibleNodes.length } : null;
  const rowIndex = Math.max(0, Math.min(visibleNodes.length - 1, Math.floor(localY / ROW_HEIGHT)));
  const node = visibleNodes[rowIndex];
  if (!node) return null;
  const yInRow = localY - rowIndex * ROW_HEIGHT;
  if (node.isInternal && node.isOpen && yInRow >= ROW_HEIGHT / 2) return { dragIds, parentId: node.id, index: 0 };
  return null;
}

function getDefaultOsFileDropTarget(api: NativeTreeApi<OsFileNode>, dragIds: string[], localY: number): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (!visibleNodes.length) return null;
  const rowIndex = Math.max(0, Math.min(visibleNodes.length - 1, Math.floor(localY / ROW_HEIGHT)));
  const node = visibleNodes[rowIndex];
  if (!node) return null;
  const yInRow = localY - rowIndex * ROW_HEIGHT;
  if (node.isInternal && yInRow > ROW_HEIGHT * 0.25 && yInRow < ROW_HEIGHT * 0.75) return { dragIds, parentId: node.id, index: 0 };
  return { dragIds, parentId: node.parent?.id ?? null, index: node.childIndex + (yInRow >= ROW_HEIGHT / 2 ? 1 : 0) };
}

function canDropOsFileRoot(api: NativeTreeApi<OsFileNode>, dragIds: string[]) {
  const dragNodes = dragIds.flatMap((id) => api.visibleNodes.find((node) => node.id === id) ?? []);
  return dragNodes.length === dragIds.length && dragNodes.every((node) => getDirectoryPath(node.data.path) !== node.data.path);
}

function OsFileTreeNode({
  dragHandle,
  node,
  style,
  effectiveDirectory,
  onContextMenu,
}: NativeTreeNodeRendererProps<OsFileNode> & {
  effectiveDirectory: string;
  onContextMenu: (event: ReactMouseEvent, node: NativeTreeNodeApi<OsFileNode>) => void;
}) {
  const data = node.data;
  const displayName = getDisplayName(data.name);
  const [editDraft, setEditDraft] = useState(displayName);
  const editSubmittedRef = useRef(false);

  useEffect(() => {
    if (node.isEditing) {
      editSubmittedRef.current = false;
      setEditDraft(displayName);
    }
  }, [displayName, node.isEditing]);

  function submitEdit() {
    if (editSubmittedRef.current) return;
    editSubmittedRef.current = true;
    const nextName = editDraft.trim();
    if (nextName) node.submit(nextName);
    else node.reset();
  }

  function cancelEdit() {
    editSubmittedRef.current = true;
    node.reset();
  }

  const isRoot = data.path === effectiveDirectory;
  const fileType = getFileType(data.name, data.isDirectory, data.isComposition);
  const Icon = data.isDirectory ? (node.isOpen ? FolderOpen : Folder) : fileType === "composition" ? Clapperboard : fileType === "timeline" ? ChartNoAxesGantt : data.name.endsWith(".ts") ? FileCode : data.name.endsWith(".json") ? FileJson : File;
  const contentClass = fileType === "composition" ? "text-[#38d996]" : "text-current";

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (node.isEditing) return;
    if (fileType === "timeline") {
      const timelineId = data.timelineId ?? displayName;
      event.dataTransfer.setData("application/x-clipper-timeline", timelineId);
    }
    if (fileType === "composition") event.dataTransfer.setData("application/x-clipper-composition", projectRelativeFilePath(data.path, effectiveDirectory));
    event.dataTransfer.setDragImage(getTransparentNativeDragImage(), 0, 0);
  }

  return (
    <div
      ref={dragHandle}
      data-file-manager-row="true"
      style={style}
      className={`relative box-border grid h-full min-w-0 cursor-pointer select-none grid-cols-[16px_18px_minmax(0,1fr)_auto] items-center gap-1.5 border px-1.5 text-[13px] ${
        node.isDragging
          ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] opacity-60"
          : node.willReceiveDropWithin
            ? `border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] ${node.willReceiveDropBlockStart ? "" : "border-t-transparent"} ${node.willReceiveDropBlockEnd ? "" : "border-b-transparent"}`
            : node.isSelected || (node.isFocused && node.tree.hasFocus)
              ? "border-transparent bg-[#242733]"
              : "border-transparent hover:bg-[#20232c]"
      }`}
      onContextMenu={(event) => onContextMenu(event, node)}
      onClick={(event) => {
        if (!event.metaKey && !event.shiftKey && node.data.isDirectory) node.toggle();
      }}
      onDragStartCapture={handleDragStart}
    >
      {node.isInternal && !isRoot ? (
        <button
          className="grid h-4 w-4 place-items-center rounded text-current hover:bg-black/15"
          aria-label={`${node.isOpen ? "Collapse" : "Expand"} ${displayName}`}
          onClick={(event) => {
            event.stopPropagation();
            node.toggle();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          type="button"
        >
          {node.isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span />
      )}
      <Icon size={data.isDirectory ? 17 : 16} className={contentClass} />
      {node.isEditing ? (
        <Input
          autoFocus
          className="h-7 min-w-0 border-[var(--clipper-accent)] bg-[#171920] px-1 py-0 text-[13px]"
          value={editDraft}
          onBlur={submitEdit}
          onChange={(event) => setEditDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitEdit();
            if (event.key === "Escape") cancelEdit();
          }}
        />
      ) : (
        <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 ${contentClass}`}>{displayName}</span>
      )}
      <span />
    </div>
  );
}

async function loadDirectoryTree(path: string, projectDirectory: string): Promise<OsFileNode[]> {
  const entries = await clipperHost.listDirectory(path);
  // Filter out the trash folder
  const sorted = entries.filter(e => e.name !== ".clipper-trash").sort((a, b) => {
    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
    return a.isDirectory ? -1 : 1;
  });
  const nodes: OsFileNode[] = [];
  for (const entry of sorted) {
    const childPath = `${path}/${entry.name}`;
    let isComposition = false;
    let timelineId: string | undefined = undefined;
    
    if (!entry.isDirectory && childPath.endsWith(".ts")) {
      try {
        const content = await clipperHost.readTextFile(childPath);
        isComposition = content.includes("new Composition({");
      } catch {
        // Ignore read errors
      }
    } else if (!entry.isDirectory && childPath.endsWith(".timeline.json")) {
      timelineId = projectRelativeFilePath(childPath, projectDirectory);
      try {
        const content = await clipperHost.readTextFile(childPath);
        JSON.parse(content);
      } catch {
        // Ignore read/parse errors
      }
    }

    const node: OsFileNode = {
      id: childPath,
      name: entry.name,
      path: childPath,
      isDirectory: entry.isDirectory,
      isComposition,
      timelineId,
    };
    if (entry.isDirectory) {
      node.children = await loadDirectoryTree(childPath, projectDirectory);
    }
    nodes.push(node);
  }
  return nodes;
}

function projectRelativeFilePath(filePath: string, rootPath: string) {
  const editableRoot = filePath.startsWith(`${rootPath}/file-manager/`) ? `${rootPath}/file-manager` : rootPath;
  const relativePath = filePath.startsWith(`${editableRoot}/`) ? filePath.slice(editableRoot.length + 1) : filePath;
  return relativePath.startsWith("file-manager/") ? relativePath.slice("file-manager/".length) : relativePath;
}

function findNode(nodes: OsFileNode[], id: string): OsFileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getTopLevelOsFileIds(ids: string[]) {
  return ids.filter((id) => !ids.some((parentId) => id !== parentId && id.startsWith(`${parentId}/`)));
}

function getTopLevelOsFileNodes(nodes: OsFileNode[]) {
  return nodes.filter((node) => !nodes.some((parent) => node.path !== parent.path && node.path.startsWith(`${parent.path}/`)));
}

function sortNodes(nodes: OsFileNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
    return a.isDirectory ? -1 : 1;
  });
}

function remapNodePath(node: OsFileNode, oldPath: string, newPath: string): OsFileNode {
  const nextNodePath = node.path === oldPath || node.path.startsWith(`${oldPath}/`) ? `${newPath}${node.path.slice(oldPath.length)}` : node.path;
  return {
    ...node,
    id: node.id === oldPath || node.id.startsWith(`${oldPath}/`) ? `${newPath}${node.id.slice(oldPath.length)}` : node.id,
    path: nextNodePath,
    name: nextNodePath.split("/").pop() || node.name,
    children: node.children?.map((child) => remapNodePath(child, oldPath, newPath)),
  };
}

function addNode(nodes: OsFileNode[], parentPath: string, nodeToAdd: OsFileNode): OsFileNode[] {
  if (findNode(nodes, nodeToAdd.id)) return nodes;
  const result = addNodeToParent(nodes, parentPath, nodeToAdd);
  return result.inserted ? result.nodes : sortNodes([...nodes, nodeToAdd]);
}

function addNodeToParent(nodes: OsFileNode[], parentPath: string, nodeToAdd: OsFileNode): { nodes: OsFileNode[]; inserted: boolean } {
  let inserted = false;
  const nextNodes = nodes.map((node) => {
    if (node.path === parentPath && node.isDirectory) {
      inserted = true;
      return { ...node, children: sortNodes([...(node.children ?? []), nodeToAdd]) };
    }
    if (!node.children) return node;
    const result = addNodeToParent(node.children, parentPath, nodeToAdd);
    if (result.inserted) inserted = true;
    return result.inserted ? { ...node, children: result.nodes } : node;
  });
  return { nodes: inserted ? sortNodes(nextNodes) : nodes, inserted };
}

function renameNode(nodes: OsFileNode[], oldPath: string, nextName: string): OsFileNode[] {
  const newPath = `${getDirectoryPath(oldPath)}/${nextName}`;
  return sortNodes(nodes.map((node) => {
    const renamed = remapNodePath(node, oldPath, newPath);
    return { ...renamed, children: renamed.children ? renameNode(renamed.children, oldPath, nextName) : undefined };
  }));
}

function takeNode(nodes: OsFileNode[], path: string): { nodes: OsFileNode[]; node: OsFileNode | null } {
  let found: OsFileNode | null = null;
  const nextNodes: OsFileNode[] = [];
  for (const node of nodes) {
    if (node.path === path) {
      found = node;
      continue;
    }
    if (node.children) {
      const result = takeNode(node.children, path);
      if (result.node) found = result.node;
      nextNodes.push({ ...node, children: result.nodes });
    } else {
      nextNodes.push(node);
    }
  }
  return { nodes: nextNodes, node: found };
}

function insertNode(nodes: OsFileNode[], parentPath: string, nodeToInsert: OsFileNode, rootPath: string): OsFileNode[] {
  if (parentPath === rootPath) return sortNodes([...nodes, nodeToInsert]);
  return sortNodes(nodes.map((node) => {
    if (node.path === parentPath && node.isDirectory) {
      return { ...node, children: sortNodes([...(node.children ?? []), nodeToInsert]) };
    }
    return { ...node, children: node.children ? insertNode(node.children, parentPath, nodeToInsert, rootPath) : undefined };
  }));
}

function moveNodes(nodes: OsFileNode[], moves: PendingPathMove[], rootPath: string): OsFileNode[] {
  return moves.reduce((currentNodes, move) => {
    const taken = takeNode(currentNodes, move.oldPath);
    if (!taken.node) return currentNodes;
    const movedNode = remapNodePath(taken.node, move.oldPath, move.newPath);
    return insertNode(taken.nodes, getDirectoryPath(move.newPath), movedNode, rootPath);
  }, nodes);
}

function findTimelineNodeById(nodes: OsFileNode[], timelineId: string): OsFileNode | null {
  for (const node of nodes) {
    if (node.timelineId === timelineId) return node;
    if (node.children) {
      const found = findTimelineNodeById(node.children, timelineId);
      if (found) return found;
    }
  }
  return null;
}

function countNodes(nodes: OsFileNode[]): number {
  return nodes.reduce((total, node) => total + 1 + (node.children ? countNodes(node.children) : 0), 0);
}
