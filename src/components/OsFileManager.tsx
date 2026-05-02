import { ChartNoAxesGantt, ChevronDown, ChevronRight, Clapperboard, File, FileCode, FileJson, Folder, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Tree, type DragPreviewProps, type MoveHandler, type NodeApi, type NodeRendererProps, type RowRendererProps, type TreeApi } from "react-arborist";
import toast from "react-hot-toast";
import type { ContextMenuState } from "../app/types";
import { clipperHost } from "../app/clipperHost";
import { getDirectoryPath, nextNumberedName } from "../app/features/file-manager/fileManagerPaths";
import { getDisplayName, getFileType, nextNumberedSemanticName, reconstructFileName } from "../app/features/file-manager/fileNames";
import { getTransparentNativeDragImage } from "../lib/nativeDragImage";
import { compositionDragPreviewEvent, compositionPointerDragEvent, setActiveCompositionPointerDrag, type CompositionPointerDragDetail, type PointerDragPreviewDetail } from "../lib/pointerDrag";
import { AppContextMenu } from "./AppContextMenu";
import { ArboristClickRow } from "./tree/ArboristClickRow";
import { Input } from "./ui/input";
import { DeleteCommand } from "../app/features/file-manager/operations/DeleteCommand";
import { RenameCommand } from "../app/features/file-manager/operations/RenameCommand";
import { CreateCommand } from "../app/features/file-manager/operations/CreateCommand";
import { MoveCommand } from "../app/features/file-manager/operations/MoveCommand";
import type { Command } from "../app/features/file-manager/operations/Command";

type OsFileNode = {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  isComposition?: boolean;
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

let isExternalCompositionDragActiveGlobal = false;

const ROW_HEIGHT = 30;
const INDENT = 24;
const MIN_TREE_HEIGHT = 360;

const isOutsideFileManagerRef = { current: false };

export function OsFileManager({
  projectDirectory,
  selectedCompositionId,
  selectedTimelineId,
  fileSystemRevision,
  onReloadProject,
  onSelectComposition,
  onSelectTimeline,
  executeFileManagerCommand,
}: OsFileManagerProps) {
  const [treeData, setTreeData] = useState<OsFileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const externalCompositionDragActiveRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<TreeApi<OsFileNode> | undefined>(undefined);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [effectiveDirectory, setEffectiveDirectory] = useState(projectDirectory);
  const openStateRef = useRef<Record<string, boolean>>({});
  const managerRef = useRef<HTMLElement>(null);
  const externalDragRef = useRef<{ nodeName: string; ghost: HTMLSpanElement; lastMouse: { x: number; y: number }; shiftKey: boolean } | null>(null);
  const externalDragFrameRef = useRef(0);
  const pendingExternalDragMoveRef = useRef<{ mouse: { x: number; y: number }; shiftKey: boolean } | null>(null);
  const draggingNodeRef = useRef<OsFileNode | null>(null);

  const applyExternalCompositionDragMove = useCallback((currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    const external = externalDragRef.current;
    if (!external) return;
    external.lastMouse = currentMouse;
    external.shiftKey = shiftKey;
    if (currentMouse.x !== 0 || currentMouse.y !== 0) external.ghost.style.transform = `translate3d(${currentMouse.x + 10}px, ${currentMouse.y - 10}px, 0)`;

    const detail: CompositionPointerDragDetail = {
      phase: "move",
      clientX: currentMouse.x,
      clientY: currentMouse.y,
      shiftKey,
      compositionId: getDisplayName(external.nodeName),
      duration: 5,
      isEmpty: true,
      label: getDisplayName(external.nodeName),
      sourceMissing: false,
    };
    setActiveCompositionPointerDrag(detail);
    window.dispatchEvent(new CustomEvent<CompositionPointerDragDetail>(compositionPointerDragEvent, { detail }));
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

  const ensureExternalCompositionDrag = useCallback((nodeName: string, currentMouse: { x: number; y: number }, shiftKey: boolean) => {
    if (externalDragRef.current) return;
    const ghost = document.createElement("span");
    ghost.textContent = nodeName;
    ghost.style.cssText = "position:fixed;top:0;left:0;z-index:9999;box-sizing:border-box;min-width:104px;pointer-events:none;border:1px solid #38a86d;border-radius:9px;background:#111319;color:#f1f3f7;padding:7px 10px;font:700 11px system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;box-shadow:0 14px 34px rgba(0,0,0,0.36),0 0 0 4px color-mix(in srgb, #38a86d 18%, transparent);will-change:transform;";
    document.body.appendChild(ghost);
    externalDragRef.current = { nodeName, ghost, lastMouse: currentMouse, shiftKey };
    applyExternalCompositionDragMove(currentMouse, shiftKey);
  }, [applyExternalCompositionDragMove]);

  const endArboristDrag = useCallback(() => {
    treeRef.current?.hideCursor();
  }, []);

  const cleanupExternalCompositionDrag = useCallback((phase: "cancel" | "drop" | null) => {
    const external = externalDragRef.current;
    document.documentElement.style.cursor = "";
    if (phase !== "drop") {
      window.setTimeout(() => {
        externalCompositionDragActiveRef.current = false;
        isExternalCompositionDragActiveGlobal = false;
        containerRef.current?.toggleAttribute("data-external-composition-drag", false);
        const previewEl = document.querySelector(".group\\/filetree .clipper-drag-preview") as HTMLElement;
        if (previewEl) previewEl.style.opacity = "1";
      }, 0);
    }
    if (!external) return;
    if (externalDragFrameRef.current) window.cancelAnimationFrame(externalDragFrameRef.current);
    externalDragFrameRef.current = 0;
    pendingExternalDragMoveRef.current = null;
    if (phase) {
      const detail: CompositionPointerDragDetail = {
        phase,
        clientX: external.lastMouse.x,
        clientY: external.lastMouse.y,
        shiftKey: external.shiftKey,
        compositionId: getDisplayName(external.nodeName),
        duration: 5,
        isEmpty: true,
        label: getDisplayName(external.nodeName),
        sourceMissing: false,
      };
      if (phase === "cancel" || phase === "drop") setActiveCompositionPointerDrag(null);
      window.dispatchEvent(new CustomEvent<CompositionPointerDragDetail>(compositionPointerDragEvent, { detail }));
    }
    external.ghost.remove();
    externalDragRef.current = null;
    isOutsideFileManagerRef.current = false;
    if (phase === "cancel" || phase === "drop") endArboristDrag();
  }, [endArboristDrag]);

  useEffect(() => {
    function onNativeDragEnd() {
      cleanupExternalCompositionDrag("cancel");
    }

    function updateExternalDrag(event: globalThis.DragEvent) {
      const nodeData = draggingNodeRef.current;
      if (!nodeData || !nodeData.isComposition) return;
      const nextMouse = { x: event.clientX, y: event.clientY };
      const outsideFileManager = !isPointOverFileManagerPanel(event.clientX, event.clientY);
      isOutsideFileManagerRef.current = outsideFileManager;
      if (!outsideFileManager) {
        cleanupExternalCompositionDrag("cancel");
        return;
      }
      const overTimeline = isPointOverTimelinePanel(event.clientX, event.clientY);
      suppressNativeExternalDrag(event, overTimeline);
      externalCompositionDragActiveRef.current = true;
      isExternalCompositionDragActiveGlobal = true;
      containerRef.current?.toggleAttribute("data-external-composition-drag", true);
      ensureExternalCompositionDrag(nodeData.name, nextMouse, event.shiftKey);
      scheduleExternalCompositionDragMove(nextMouse, event.shiftKey);
      const previewEl = document.querySelector(".group\\/filetree .clipper-drag-preview") as HTMLElement;
      if (previewEl) previewEl.style.opacity = "0";
    }

    function dropExternalDrag(event: globalThis.DragEvent) {
      const external = externalDragRef.current;
      if (!external) return;
      const overTimeline = isPointOverTimelinePanel(event.clientX, event.clientY);
      suppressNativeExternalDrag(event, overTimeline);
      external.lastMouse = { x: event.clientX, y: event.clientY };
      external.shiftKey = event.shiftKey;
      cleanupExternalCompositionDrag(overTimeline ? "drop" : "cancel");
    }

    function cancelOnWindowExit(event: globalThis.DragEvent) {
      const external = externalDragRef.current;
      if (!external) return;
      const outsideWindow = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
      if (outsideWindow) cleanupExternalCompositionDrag("cancel");
    }

    function updateShift(event: KeyboardEvent) {
      const external = externalDragRef.current;
      if (!external) return;
      scheduleExternalCompositionDragMove(external.lastMouse, event.shiftKey);
    }

    function updatePreviewVisibility(event: Event) {
      const active = Boolean((event as CustomEvent<PointerDragPreviewDetail>).detail?.active);
      const external = externalDragRef.current;
      if (external) external.ghost.style.opacity = active ? "0" : "1";
    }

    window.addEventListener("dragend", onNativeDragEnd);
    window.addEventListener("drop", dropExternalDrag, true);
    window.addEventListener("dragover", updateExternalDrag, true);
    window.addEventListener("dragleave", cancelOnWindowExit, true);
    window.addEventListener("keydown", updateShift, true);
    window.addEventListener("keyup", updateShift, true);
    window.addEventListener(compositionDragPreviewEvent, updatePreviewVisibility);
    return () => {
      window.removeEventListener("dragend", onNativeDragEnd);
      window.removeEventListener("drop", dropExternalDrag, true);
      window.removeEventListener("dragover", updateExternalDrag, true);
      window.removeEventListener("dragleave", cancelOnWindowExit, true);
      window.removeEventListener("keydown", updateShift, true);
      window.removeEventListener("keyup", updateShift, true);
      window.removeEventListener(compositionDragPreviewEvent, updatePreviewVisibility);
      cleanupExternalCompositionDrag("cancel");
    };
  }, [cleanupExternalCompositionDrag, ensureExternalCompositionDrag, scheduleExternalCompositionDragMove]);

  const execute = useCallback(async (command: Command) => {
    try {
      await executeFileManagerCommand(command);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      console.error(error);
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
      setLoading(true);
      try {
        const children = await loadDirectoryTree(effectiveDirectory);
        if (!cancelled) setTreeData(children);
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
  }, [effectiveDirectory, refreshKey, fileSystemRevision]);

  useEffect(() => {
    const api = treeRef.current;
    if (!api) return;
    let targetId: string | null = null;
    if (selectedCompositionId) {
      targetId = `${effectiveDirectory}/compositions/${selectedCompositionId}.ts`;
    } else if (selectedTimelineId) {
      targetId = `${effectiveDirectory}/timelines/${selectedTimelineId}.timeline.json`;
    }
    if (targetId) {
      api.select(targetId, { align: "auto" });
      setSelectedNodeIds([targetId]);
    }
  }, [selectedCompositionId, selectedTimelineId, effectiveDirectory]);

  const handleFileActivate = useCallback(
    (nodeData: OsFileNode) => {
      const fileType = getFileType(nodeData.name, nodeData.isDirectory, nodeData.isComposition);
      const displayName = getDisplayName(nodeData.name);
      if (fileType === "composition") {
        onSelectComposition(displayName);
      } else if (fileType === "timeline") {
        onSelectTimeline(displayName);
      }
    },
    [onSelectComposition, onSelectTimeline]
  );

  const handleSelect = useCallback((nodes: NodeApi<OsFileNode>[]) => {
    setSelectedNodeIds(nodes.map((n) => n.id));
  }, []);

  const openContextMenu = useCallback(
    (event: ReactMouseEvent, node: NodeApi<OsFileNode> | null) => {
      event.preventDefault();
      event.stopPropagation();
      const items: NonNullable<ContextMenuState>["items"] = [];
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
          { label: "Delete", action: () => void deleteNode(node.data), danger: true },
          { label: "Reveal in Finder", action: () => void clipperHost.revealFile(node.data.path) }
        );
      } else {
        items.push(
          { label: "Rename", action: () => node.edit() },
          { label: "Delete", action: () => void deleteNode(node.data), danger: true },
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
      await clipperHost.createDirectory(parentPath).catch(() => {});
      const entries = await clipperHost.listDirectory(parentPath);
      const names = entries.map((e) => e.name);
      const name = nextNumberedSemanticName("untitled", ".composition.ts", names);
      const displayName = getDisplayName(name);
      const content = `import { Composition } from "@clipper/composition-api";

export const composition = new Composition({
  name: ${JSON.stringify(displayName)},
  duration: 5,
  frame: { width: 1920, height: 1080, style: {} },
  background: { id: "bg", name: "Background", style: {}, elements: [] },
  render() {
    return [];
  },
});
`;
      const filePath = `${parentPath}/${name}`;
      await clipperHost.writeTextFile(filePath, content);
      await execute(new CreateCommand(filePath, name, false, content));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create composition.");
    }
  }

  async function createNewTimeline(basePath: string) {
    try {
      const parentPath = basePath === effectiveDirectory ? `${effectiveDirectory}/timelines` : basePath;
      await clipperHost.createDirectory(parentPath).catch(() => {});
      const entries = await clipperHost.listDirectory(parentPath);
      const names = entries.map((e) => e.name);
      const name = nextNumberedSemanticName("untitled", ".timeline.json", names);
      const displayName = getDisplayName(name);
      const content = JSON.stringify({
        id: crypto.randomUUID(),
        name: displayName,
        clips: [],
      }, null, 2);
      const filePath = `${parentPath}/${name}`;
      await clipperHost.writeTextFile(filePath, content);
      await execute(new CreateCommand(filePath, name, false, content));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create timeline.");
    }
  }

  async function createNewFolder(parentPath: string) {
    try {
      const entries = await clipperHost.listDirectory(parentPath);
      const names = entries.map((e) => e.name);
      const name = nextNumberedName("New Folder", names);
      const folderPath = `${parentPath}/${name}`;
      await clipperHost.createDirectory(folderPath);
      await execute(new CreateCommand(folderPath, name, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create folder.");
    }
  }

  async function deleteNode(node: OsFileNode) {
    try {
      if (node.path === effectiveDirectory) {
        toast.error("Cannot delete the project root folder.");
        return;
      }
      
      const command = new DeleteCommand(node.path, node.name, node.isDirectory, effectiveDirectory);
      await execute(command);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete.");
    }
  }

  async function deleteNodes(nodes: OsFileNode[]) {
    if (!nodes.length) return;
    
    // Filter to top-level nodes to avoid conflicts (don't delete child if parent is deleted)
    const nodesToDelete = nodes.filter(node => !nodes.some(parent => node.path.startsWith(`${parent.path}/`)));

    // Optimistically update UI
    setTreeData(prev => removeNodes(prev, nodesToDelete));

    for (const node of nodesToDelete) {
      await deleteNode(node);
    }
  }

  function removeNodes(nodes: OsFileNode[], nodesToRemove: OsFileNode[]): OsFileNode[] {
    return nodes.filter(node => !nodesToRemove.some(n => n.id === node.id))
                .map(node => ({
                  ...node,
                  children: node.children ? removeNodes(node.children, nodesToRemove) : undefined
                }));
  }

  async function deleteDirectoryRecursively(path: string) {
    const entries = await clipperHost.listDirectory(path);
    for (const entry of entries) {
      const childPath = `${path}/${entry.name}`;
      if (entry.isDirectory) {
        await deleteDirectoryRecursively(childPath);
      } else {
        await clipperHost.trashFile(childPath);
      }
    }
    await clipperHost.trashFile(path);
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
      const oldPath = node.path;
      if (oldPath.endsWith(`/${nextFullName}`)) return; // No change

      try {
        const parentPath = getDirectoryPath(oldPath);
        const entries = await clipperHost.listDirectory(parentPath);
        const exists = entries.some((e) => e.name.toLowerCase() === nextFullName.toLowerCase() && `${parentPath}/${e.name}` !== oldPath);
        if (exists) {
          toast.error(`A file or folder named "${nextFullName}" already exists.`);
          setRefreshKey((k) => k + 1);
          return;
        }
        
        const command = new RenameCommand(oldPath, nextFullName);
        await execute(command);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to rename.");
        setRefreshKey((k) => k + 1);
      }
    },
    [treeData, execute]
  );

  const handleMove: MoveHandler<OsFileNode> = useCallback(
    async ({ dragIds, parentId }) => {
      if (externalCompositionDragActiveRef.current || isOutsideFileManagerRef.current) return;
      if (!parentId || parentId === "__REACT_ARBORIST_INTERNAL_ROOT__") return;
      let targetFolder = findNode(treeData, parentId);
      if (!targetFolder || !targetFolder.isDirectory) {
        const parentEntries = await clipperHost.listDirectory(parentId).catch(() => []);
        if (parentEntries.length > 0) {
          targetFolder = { id: parentId, name: parentId.split("/").pop() || "", path: parentId, isDirectory: true };
        }
      }
      if (!targetFolder || !targetFolder.isDirectory) return;
      let moved = false;
      const moves: Array<{ oldPath: string; newPath: string }> = [];

      for (const dragId of dragIds) {
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
        const newPath = `${targetFolder.path}/${node.name}`;
        if (node.path === newPath) continue;
        try {
          await clipperHost.renameFile(node.path, newPath);
          moves.push({ oldPath: node.path, newPath });
          moved = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to move file.";
          if (message.toLowerCase().includes("already exists") || message.toLowerCase().includes("file exists")) {
            toast.error(`"${node.name}" already exists in the destination.`);
          } else {
            toast.error(message);
          }
        }
      }
      if (moved) {
        await execute(new MoveCommand(moves));
      }
    },
    [treeData, execute]
  );

  function handlePanelContextMenu(event: ReactMouseEvent<HTMLElement>) {
    if (event.currentTarget !== event.target) return;
    openContextMenu(event, null);
  }

  const disableDrop = useCallback(
    ({ parentNode, dragNodes }: { parentNode: NodeApi<OsFileNode>; dragNodes: NodeApi<OsFileNode>[]; index: number }) => {
      if (isOutsideFileManagerRef.current) return true;
      if (externalCompositionDragActiveRef.current) return true;
      if (parentNode.isRoot) return true;
      if (!parentNode.data.isDirectory) return true;
      if (dragNodes.some((n) => parentNode.data.path.startsWith(`${n.data.path}/`))) return true;
      return false;
    },
    []
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Backspace" || (!event.metaKey && !event.ctrlKey)) return;
    if (!selectedNodeIds.length) return;
    event.preventDefault();
    event.stopPropagation();
    const nodesToDelete = selectedNodeIds.map((id) => findNode(treeData, id)).filter(Boolean) as OsFileNode[];
    void deleteNodes(nodesToDelete);
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
    >
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h3 className="text-[13px] font-semibold text-[#aeb3c1]">File Manager</h3>
      </div>
      {loading ? (
        <div className="px-0.5 text-[13px] text-[#737884]">Loading...</div>
      ) : (
        <Tree<OsFileNode>
          ref={treeRef}
          data={data}
          disableDrop={disableDrop}
          height={treeHeight}
          idAccessor="id"
          indent={INDENT}
          initialOpenState={initialOpenState}
          onMove={handleMove}
          onRename={handleRename}
          onSelect={handleSelect}
          onToggle={handleToggle}
          openByDefault={false}
          overscanCount={4}
          paddingBottom={0}
          paddingTop={0}
          renderDragPreview={(previewProps) => <OsFileDragPreview {...previewProps} nodes={treeData} onDragPositionChange={(node) => { draggingNodeRef.current = node; }} />}
          rowHeight={ROW_HEIGHT}
          width="100%"
          renderRow={(props) => (
            <OsFileTreeRow
              {...props}
              onClick={(event, node) => {
                if (!event.metaKey && !event.shiftKey && node.data.isDirectory) {
                  node.toggle();
                }
                if (!event.metaKey && !event.shiftKey && !node.data.isDirectory) {
                  handleFileActivate(node.data);
                }
              }}
            />
          )}
        >
          {(props) => <OsFileTreeNode {...props} effectiveDirectory={effectiveDirectory} onContextMenu={openContextMenu} />}
        </Tree>
      )}
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

function OsFileDragPreview({ id, isDragging, mouse, nodes, onDragPositionChange }: DragPreviewProps & { nodes: OsFileNode[]; onDragPositionChange: (node: OsFileNode | null) => void }) {
  const nodeData = id ? findNode(nodes, id) : null;
  const internalPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDragPositionChange(isDragging ? nodeData : null);
  }, [isDragging, nodeData, onDragPositionChange]);

  if (!isDragging || !nodeData || !mouse) return null;

  return (
    <div
      ref={internalPreviewRef}
      className="clipper-drag-preview pointer-events-none fixed left-0 top-0 z-[100] flex items-center gap-1.5 rounded-md border border-[var(--clipper-accent)] bg-[#242733] px-2 py-1 text-[13px] font-bold text-[#dfe2ea] shadow-lg"
      style={{ width: 240, transform: `translate(${mouse.x}px, ${mouse.y}px)`, opacity: isExternalCompositionDragActiveGlobal ? 0 : 1 }}
    >
      <span className="truncate">{nodeData.name}</span>
    </div>
  );
}

function isPointOverFileManagerPanel(clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY);
  return target instanceof HTMLElement && Boolean(target.closest("[data-file-manager-panel]"));
}

function isPointOverTimelinePanel(clientX: number, clientY: number) {
  const target = document.elementFromPoint(clientX, clientY);
  return target instanceof HTMLElement && Boolean(target.closest("[data-timeline-panel]"));
}

function suppressNativeExternalDrag(event: globalThis.DragEvent, overTimeline: boolean) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = overTimeline ? "copy" : "none";
}

function OsFileTreeRow(props: RowRendererProps<OsFileNode> & { onClick?: (event: ReactMouseEvent<HTMLDivElement>, node: NodeApi<OsFileNode>) => void }) {
  return <ArboristClickRow {...props} onClick={props.onClick} />;
}

function OsFileTreeNode({
  dragHandle,
  node,
  style,
  effectiveDirectory,
  onContextMenu,
}: NodeRendererProps<OsFileNode> & {
  effectiveDirectory: string;
  onContextMenu: (event: ReactMouseEvent, node: NodeApi<OsFileNode>) => void;
}) {
  const data = node.data;
  const displayName = getDisplayName(data.name);
  const [editDraft, setEditDraft] = useState(displayName);

  useEffect(() => {
    if (node.isEditing) setEditDraft(displayName);
  }, [displayName, node.isEditing]);

  function submitEdit() {
    const nextName = editDraft.trim();
    if (nextName) node.submit(nextName);
    else node.reset();
  }

  const isRoot = data.path === effectiveDirectory;
  const fileType = getFileType(data.name, data.isDirectory, data.isComposition);
  const Icon = data.isDirectory ? (node.isOpen ? FolderOpen : Folder) : fileType === "composition" ? Clapperboard : fileType === "timeline" ? ChartNoAxesGantt : data.name.endsWith(".ts") ? FileCode : data.name.endsWith(".json") ? FileJson : File;

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (node.isEditing) return;
    if (fileType === "timeline") {
      const timelineId = displayName;
      event.dataTransfer.setData("application/x-clipper-timeline", timelineId);
    }
    event.dataTransfer.setDragImage(getTransparentNativeDragImage(), 0, 0);
  }

  return (
    <div
      ref={dragHandle}
      data-file-manager-row="true"
      style={style}
      className={`relative box-border grid h-full min-w-0 cursor-pointer select-none grid-cols-[16px_18px_minmax(0,1fr)_auto] items-center gap-1.5 border px-1.5 text-[13px] font-bold group-data-[external-composition-drag]/filetree:!border-transparent group-data-[external-composition-drag]/filetree:!bg-transparent group-data-[external-composition-drag]/filetree:!opacity-100 ${
        node.isDragging
          ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)] opacity-60"
          : node.willReceiveDrop
            ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)]"
            : node.isSelected || (node.isFocused && node.tree.hasFocus)
              ? "border-transparent bg-[#242733]"
              : "border-transparent hover:bg-[#20232c]"
      }`}
      onContextMenu={(event) => onContextMenu(event, node)}
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
      <Icon size={data.isDirectory ? 17 : 16} className="text-current" />
      {node.isEditing ? (
        <Input
          autoFocus
          className="h-7 min-w-0 border-[var(--clipper-accent)] bg-[#171920] px-1 py-0 text-[13px] font-bold"
          value={editDraft}
          onBlur={submitEdit}
          onChange={(event) => setEditDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitEdit();
            if (event.key === "Escape") node.reset();
          }}
        />
      ) : (
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1">{displayName}</span>
      )}
      <span />
    </div>
  );
}

async function loadDirectoryTree(path: string): Promise<OsFileNode[]> {
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
    
    if (!entry.isDirectory && childPath.endsWith(".ts")) {
      try {
        const content = await clipperHost.readTextFile(childPath);
        isComposition = content.includes("new Composition({");
      } catch {
        // Ignore read errors
      }
    }

    const node: OsFileNode = {
      id: childPath,
      name: entry.name,
      path: childPath,
      isDirectory: entry.isDirectory,
      isComposition,
    };
    if (entry.isDirectory) {
      node.children = await loadDirectoryTree(childPath);
    }
    nodes.push(node);
  }
  return nodes;
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

function countNodes(nodes: OsFileNode[]): number {
  return nodes.reduce((total, node) => total + 1 + (node.children ? countNodes(node.children) : 0), 0);
}
