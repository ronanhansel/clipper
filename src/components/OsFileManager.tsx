import {
  Box,
  ChartNoAxesGantt,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  File,
  FileCode,
  FileJson,
  Folder,
  FolderOpen,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import toast from "react-hot-toast";
import { isTextEditingTarget } from "../app/features/shortcuts/useGlobalEditorShortcuts";
import type { ContextMenuState } from "../app/types";
import { clipperHost } from "../app/clipperHost";
import {
  getDirectoryPath,
  nextNumberedName,
} from "../app/features/file-manager/fileManagerPaths";
import {
  getDisplayName,
  getDragPreviewDisplayName,
  getFileType,
  nextNumberedSemanticName,
  reconstructFileName,
} from "../core/fileNames";
import { createDefaultTimelineLayerState } from "../core/project";
import type {
  CompositionClip,
  FileManagerState,
  TimelineDocument,
} from "../core/types";
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
import { AppContextMenu } from "./AppContextMenu";
import {
  NativeTree,
  type NativeTreeApi,
  type NativeTreeDragPreviewProps,
  type NativeTreeDropTarget,
  type NativeTreeNodeApi,
  type NativeTreeNodeRendererProps,
} from "./tree/NativeTree";
import { Input } from "./ui/input";
import { DeleteCommand } from "../app/features/file-manager/operations/DeleteCommand";
import { RenameCommand } from "../app/features/file-manager/operations/RenameCommand";
import { CreateCommand } from "../app/features/file-manager/operations/CreateCommand";
import { MoveCommand } from "../app/features/file-manager/operations/MoveCommand";
import type { Command } from "../app/features/file-manager/operations/Command";
import {
  rebasePath,
  type PendingPathMove,
} from "../app/features/file-manager/optimisticPathRebase";

const agentProviderLabels = {
  opencode: "OpenCode",
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
} as const;

export type OsFileNode = {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  isComposition?: boolean;
  isComposition3d?: boolean;
  timelineId?: string;
  children?: OsFileNode[];
};

export type OsFileManagerProps = {
  projectDirectory: string;
  compositionLibrary?: CompositionClip[];
  selectedCompositionId?: string;
  selectedTimelineId?: string;
  fileSystemRevision?: number;
  fileManagerState?: FileManagerState;
  onReloadProject: () => Promise<void>;
  onSelectComposition: (compositionId: string) => void;
  onSelectTimeline: (timelineId: string) => void;
  onOpenFile: (
    filePath: string,
    options?: { isComposition?: boolean; temporary?: boolean },
  ) => void;
  executeFileManagerCommand: (command: Command) => Promise<void>;
  onFileManagerStateChange: (state: FileManagerState) => void;
  onCompositionPathMoves?: (
    moves: Array<{ oldPath: string; newPath: string }>,
    options?: { save?: boolean },
  ) => void;
};

export type OsFileOperationStatus = "queued" | "running" | "succeeded";

export type OsFileOperation = {
  id: number;
  kind: "create" | "rename" | "move" | "delete";
  status: OsFileOperationStatus;
  command: Command;
  pathMoves?: PendingPathMove[];
  projectPathMoves?: PendingPathMove[];
  reloadProjectAfterCommit?: boolean;
  apply: (nodes: OsFileNode[]) => OsFileNode[];
  isObserved: (nodes: OsFileNode[]) => boolean;
};

type PendingOsFileMove = PendingPathMove & {
  state: "in-flight" | "settling";
};

const ROW_HEIGHT = 30;
const INDENT = 24;
const MIN_TREE_HEIGHT = 360;

export function OsFileManager({
  projectDirectory,
  compositionLibrary = [],
  selectedCompositionId,
  selectedTimelineId,
  fileSystemRevision,
  fileManagerState,
  onSelectComposition,
  onSelectTimeline,
  onOpenFile,
  executeFileManagerCommand,
  onFileManagerStateChange,
  onCompositionPathMoves,
  onReloadProject,
}: OsFileManagerProps) {
  const [treeData, setTreeData] = useState<OsFileNode[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeContainerRef = useRef<HTMLDivElement | null>(null);
  const treeRef = useRef<NativeTreeApi<OsFileNode> | undefined>(undefined);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [effectiveDirectory, setEffectiveDirectory] =
    useState(projectDirectory);
  const loadedDirectoryRef = useRef<string | null>(null);
  const externalDragRef = useRef<{
    node: OsFileNode;
    lastMouse: { x: number; y: number };
    shiftKey: boolean;
  } | null>(null);
  const externalDragFrameRef = useRef(0);
  const pendingExternalDragMoveRef = useRef<{
    mouse: { x: number; y: number };
    shiftKey: boolean;
  } | null>(null);
  const draggingNodeRef = useRef<OsFileNode | null>(null);
  const baseTreeDataRef = useRef<OsFileNode[]>([]);
  const operationQueueRef = useRef<OsFileOperation[]>([]);
  const operationProcessingRef = useRef(false);
  const nextOperationIdRef = useRef(1);
  const committedProjectReloadPendingRef = useRef(false);
  const osFilePathIdsRef = useRef(new Map<string, string>());
  const syncedActiveSelectionRef = useRef<SyncedOsFileSelection>(null);
  const [compositionLanePreviewActive, setCompositionLanePreviewActive] =
    useState(false);
  const [rootDropVisible, setRootDropVisible] = useState(false);

  const getCompositionDragDetail = useCallback(
    (
      node: OsFileNode,
      phase: CompositionPointerDragDetail["phase"],
      currentMouse: { x: number; y: number },
      shiftKey: boolean,
    ): CompositionPointerDragDetail | null => {
      return createOsCompositionDragDetail(
        compositionLibrary,
        node.path,
        node.name,
        projectDirectory,
        phase,
        currentMouse,
        shiftKey,
      );
    },
    [compositionLibrary, projectDirectory],
  );

  const applyExternalCompositionDragMove = useCallback(
    (currentMouse: { x: number; y: number }, shiftKey: boolean) => {
      const external = externalDragRef.current;
      if (!external) return;
      external.lastMouse = currentMouse;
      external.shiftKey = shiftKey;
      const detail = getCompositionDragDetail(
        external.node,
        "move",
        currentMouse,
        shiftKey,
      );
      if (!detail) return;
      dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
    },
    [getCompositionDragDetail],
  );

  const scheduleExternalCompositionDragMove = useCallback(
    (currentMouse: { x: number; y: number }, shiftKey: boolean) => {
      pendingExternalDragMoveRef.current = { mouse: currentMouse, shiftKey };
      if (externalDragFrameRef.current) return;
      externalDragFrameRef.current = window.requestAnimationFrame(() => {
        externalDragFrameRef.current = 0;
        const pending = pendingExternalDragMoveRef.current;
        pendingExternalDragMoveRef.current = null;
        if (pending)
          applyExternalCompositionDragMove(pending.mouse, pending.shiftKey);
      });
    },
    [applyExternalCompositionDragMove],
  );

  const ensureExternalCompositionDrag = useCallback(
    (
      node: OsFileNode,
      currentMouse: { x: number; y: number },
      shiftKey: boolean,
    ) => {
      if (externalDragRef.current) return;
      externalDragRef.current = { node, lastMouse: currentMouse, shiftKey };
      applyExternalCompositionDragMove(currentMouse, shiftKey);
    },
    [applyExternalCompositionDragMove],
  );

  const cleanupExternalCompositionDrag = useCallback(
    (phase: "cancel" | "drop" | null) => {
      const external = externalDragRef.current;
      if (!external) return;

      if (externalDragFrameRef.current)
        window.cancelAnimationFrame(externalDragFrameRef.current);
      externalDragFrameRef.current = 0;
      pendingExternalDragMoveRef.current = null;
      if (phase) {
        const detail = getCompositionDragDetail(
          external.node,
          phase,
          external.lastMouse,
          external.shiftKey,
        );
        if (!detail) return;
        dispatchClipperPointerDrag(compositionPointerDragEvent, detail);
        if (phase === "cancel" || phase === "drop") treeRef.current?.endDrag();
      }
      externalDragRef.current = null;
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
    function onNativeDragEnd() {
      cleanupExternalCompositionDrag("cancel");
    }

    function updateExternalDrag(event: globalThis.DragEvent) {
      const nodeData = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!nodeData) return;
      if (
        !externalDragRef.current &&
        isDragEventInsideElement(event, containerRef.current)
      )
        return;
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
      } else if (nodeData.timelineId) {
        treeRef.current?.endDrag();
      } else {
        treeRef.current?.endDrag();
        event.preventDefault();
      }
    }

    function cancelOnWindowExit(event: globalThis.DragEvent) {
      const nodeData = externalDragRef.current?.node ?? draggingNodeRef.current;
      if (!nodeData) return;
      const outsideWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;
      if (outsideWindow) {
        if (!nodeData.isComposition) treeRef.current?.endDrag();
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
  }, [
    cleanupExternalCompositionDrag,
    ensureExternalCompositionDrag,
    scheduleExternalCompositionDragMove,
  ]);

  const applyQueuedOperations = useCallback((baseNodes: OsFileNode[]) => {
    return renderOsFileOperationTree(baseNodes, operationQueueRef.current);
  }, []);

  const getStableOsFileUiId = useCallback((path: string) => {
    const existing = osFilePathIdsRef.current.get(path);
    if (existing) return existing;
    const id = `os-file:${path}`;
    osFilePathIdsRef.current.set(path, id);
    return id;
  }, []);

  const preserveOsFileUiIdForMove = useCallback(
    (oldPath: string, newPath: string) => {
      preserveStableOsFileMoveIds(
        osFilePathIdsRef.current,
        [...treeData, ...baseTreeDataRef.current],
        oldPath,
        newPath,
      );
    },
    [treeData],
  );

  const loadStableDirectoryTree = useCallback(
    (path: string) =>
      loadDirectoryTree(path, projectDirectory, getStableOsFileUiId),
    [getStableOsFileUiId, projectDirectory],
  );

  const rebaseTreeFromQueue = useCallback(() => {
    setTreeData(applyQueuedOperations(baseTreeDataRef.current));
  }, [applyQueuedOperations]);

  const processOperationQueue = useCallback(async () => {
    if (operationProcessingRef.current) return;
    operationProcessingRef.current = true;
    try {
      while (true) {
        const operation = operationQueueRef.current.find(
          (item) => item.status === "queued",
        );
        if (!operation) break;
        operation.status = "running";
        try {
          await executeFileManagerCommand(operation.command);
          operation.status = "succeeded";
          if (operation.reloadProjectAfterCommit)
            committedProjectReloadPendingRef.current = true;
          operationQueueRef.current = pruneObservedOsFileOperations(
            baseTreeDataRef.current,
            operationQueueRef.current,
          );
          rebaseTreeFromQueue();
        } catch (error) {
          console.error(error);
          const rollback = rollbackFailedOsFileOperations(
            operationQueueRef.current,
            operation.id,
          );
          operationQueueRef.current = rollback.operations;
          const rolledBackOperations = rollback.rolledBackOperations.length
            ? rollback.rolledBackOperations
            : [operation];
          const rollbackMoves = reverseProjectPathMoves(
            rolledBackOperations.flatMap((item) => item.projectPathMoves ?? []),
          );
          if (rollbackMoves.length)
            onCompositionPathMoves?.(rollbackMoves, { save: false });
          rebaseTreeFromQueue();
          toast.error(
            error instanceof Error
              ? error.message
              : defaultOsFileOperationError(operation.kind),
          );
          setRefreshKey((k) => k + 1);
        }
      }
      if (committedProjectReloadPendingRef.current) {
        committedProjectReloadPendingRef.current = false;
        await onReloadProject();
      }
    } finally {
      operationProcessingRef.current = false;
    }
  }, [
    executeFileManagerCommand,
    onCompositionPathMoves,
    onReloadProject,
    rebaseTreeFromQueue,
  ]);

  const enqueueOperation = useCallback(
    (operation: Omit<OsFileOperation, "id" | "status">) => {
      const queuedOperation: OsFileOperation = {
        ...operation,
        id: nextOperationIdRef.current++,
        status: "queued",
      };
      operationQueueRef.current = [
        ...operationQueueRef.current,
        queuedOperation,
      ];
      rebaseTreeFromQueue();
      void processOperationQueue();
    },
    [processOperationQueue, rebaseTreeFromQueue],
  );

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        const entries = await clipperHost.listDirectory(projectDirectory);
        if (!cancelled) {
          const hasFileManager = entries.some(
            (e) => e.isDirectory && e.name === "file-manager",
          );
          setEffectiveDirectory(
            hasFileManager
              ? `${projectDirectory}/file-manager`
              : projectDirectory,
          );
        }
      } catch {
        if (!cancelled) setEffectiveDirectory(projectDirectory);
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [projectDirectory]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const children = await loadStableDirectoryTree(effectiveDirectory);
        if (!cancelled) {
          baseTreeDataRef.current = children;
          operationQueueRef.current = pruneObservedOsFileOperations(
            children,
            operationQueueRef.current,
          );
          loadedDirectoryRef.current = effectiveDirectory;
          setTreeData(applyQueuedOperations(children));
        }
      } catch (error) {
        if (!cancelled)
          toast.error(
            error instanceof Error
              ? error.message
              : "Unable to load project directory.",
          );
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveDirectory,
    refreshKey,
    fileSystemRevision,
    projectDirectory,
    applyQueuedOperations,
    loadStableDirectoryTree,
  ]);

  useEffect(() => {
    if (loadedDirectoryRef.current !== effectiveDirectory)
      operationQueueRef.current = [];
  }, [fileSystemRevision, effectiveDirectory]);

  useEffect(() => {
    const api = treeRef.current;
    if (!api) return;
    let targetId: string | null = null;
    let activeSelectionKey: string | null = null;
    if (selectedCompositionId) {
      const composition = compositionLibrary.find(
        (item) => item.id === selectedCompositionId,
      );
      const compositionPath = composition
        ? `${effectiveDirectory}/${composition.filePath}`
        : null;
      targetId = compositionPath
        ? (findNodeByPath(treeData, compositionPath)?.id ?? null)
        : null;
      activeSelectionKey = `composition:${selectedCompositionId}`;
    } else if (selectedTimelineId) {
      // Find the timeline node by its internal ID
      const timelineNode = findTimelineNodeById(treeData, selectedTimelineId);
      if (timelineNode) {
        targetId = timelineNode.id;
      }
      activeSelectionKey = `timeline:${selectedTimelineId}`;
    }
    if (
      !shouldSyncActiveOsFileSelection(
        api.selectedNodes.map((node) => node.id),
        syncedActiveSelectionRef.current,
        activeSelectionKey,
        targetId,
      )
    )
      return;
    if (targetId) {
      api.select(targetId, { align: "auto" });
      syncedActiveSelectionRef.current = {
        key: activeSelectionKey!,
        nodeId: targetId,
      };
      setSelectedNodeIds([targetId]);
    }
  }, [
    compositionLibrary,
    selectedCompositionId,
    selectedTimelineId,
    effectiveDirectory,
    treeData,
  ]);

  const handleFileActivate = useCallback(
    (nodeData: OsFileNode, event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      const fileType = getFileType(
        nodeData.name,
        nodeData.isDirectory,
        nodeData.isComposition,
      );
      const displayName = getDisplayName(nodeData.name);
      const temporary = event.detail < 2;
      if (fileType === "composition") {
        const compositionId = resolveOsCompositionId(
          compositionLibrary,
          nodeData.path,
          projectDirectory,
        );
        if (!temporary && compositionId) onSelectComposition(compositionId);
        onOpenFile(nodeData.path, { isComposition: true, temporary });
      } else if (fileType === "timeline") {
        onOpenFile(nodeData.path, { temporary });
      } else if (!nodeData.isDirectory) {
        onOpenFile(nodeData.path, { temporary });
      }
    },
    [
      compositionLibrary,
      onOpenFile,
      onSelectComposition,
      onSelectTimeline,
      projectDirectory,
    ],
  );

  const handleSelect = useCallback((nodes: NativeTreeNodeApi<OsFileNode>[]) => {
    setSelectedNodeIds(nodes.map((n) => n.id));
  }, []);

  const openContextMenu = useCallback(
    (event: ReactMouseEvent, node: NativeTreeNodeApi<OsFileNode> | null) => {
      event.preventDefault();
      event.stopPropagation();
      const items: NonNullable<ContextMenuState>["items"] = [];
      const selectedNodes = node?.isSelected
        ? getTopLevelOsFileNodes(
            node.tree.selectedNodes.map((selectedNode) => selectedNode.data),
          )
        : [];
      const shouldUseSelection = selectedNodes.length > 1;
      const targetPath = !node ? effectiveDirectory : node.data.path;
      const agentProvider = getSelectedAgentProvider();
      if (!node || node.data.path === effectiveDirectory) {
        items.push(
          { label: "New File", action: () => void createNewFile(targetPath) },
          {
            label: "Composition",
            children: getCompositionCreateMenuItems(targetPath),
          },
          {
            label: "New Timeline",
            action: () => void createNewTimeline(targetPath),
          },
          {
            label: "New Folder",
            action: () => void createNewFolder(targetPath),
          },
          {
            label: `Open ${agentProviderLabels[agentProvider]} Here`,
            action: () =>
              void clipperHost.openAgentTerminal(targetPath, agentProvider),
          },
          {
            label: "Copy path",
            action: () => void copyOsPathsToClipboard([targetPath]),
          },
          {
            label: "Reveal in Finder",
            action: () => void clipperHost.revealFile(targetPath),
          },
        );
      } else if (node.data.isDirectory) {
        items.push(
          {
            label: "New File",
            action: () => void createNewFile(node.data.path),
          },
          {
            label: "Composition",
            children: getCompositionCreateMenuItems(node.data.path),
          },
          {
            label: "New Timeline",
            action: () => void createNewTimeline(node.data.path),
          },
          {
            label: "New Folder",
            action: () => void createNewFolder(node.data.path),
          },
          {
            label: `Open ${agentProviderLabels[agentProvider]} Here`,
            action: () =>
              void clipperHost.openAgentTerminal(node.data.path, agentProvider),
          },
          { label: "Rename", action: () => node.edit() },
          {
            label: shouldUseSelection
              ? `Copy ${selectedNodes.length} paths`
              : "Copy path",
            action: () =>
              void copyOsPathsToClipboard(
                (shouldUseSelection ? selectedNodes : [node.data]).map(
                  (item) => item.path,
                ),
              ),
          },
          {
            label: "Reveal in Finder",
            action: () => void clipperHost.revealFile(node.data.path),
          },
          {
            label: shouldUseSelection
              ? `Delete ${selectedNodes.length} items`
              : "Delete",
            action: () =>
              void deleteNodes(
                shouldUseSelection ? selectedNodes : [node.data],
              ),
            danger: true,
          },
        );
      } else {
        items.push(
          { label: "Rename", action: () => node.edit() },
          {
            label: shouldUseSelection
              ? `Copy ${selectedNodes.length} paths`
              : "Copy path",
            action: () =>
              void copyOsPathsToClipboard(
                (shouldUseSelection ? selectedNodes : [node.data]).map(
                  (item) => item.path,
                ),
              ),
          },
          {
            label: "Reveal in Finder",
            action: () => void clipperHost.revealFile(node.data.path),
          },
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
        items.push({
          label: shouldUseSelection
            ? `Delete ${selectedNodes.length} items`
            : "Delete",
          action: () =>
            void deleteNodes(shouldUseSelection ? selectedNodes : [node.data]),
          danger: true,
        });
      }
      setContextMenu({ x: event.clientX, y: event.clientY, items });
    },
    [effectiveDirectory],
  );

  async function createNewFile(basePath: string) {
    try {
      const parentPath = basePath;
      const entries = await clipperHost
        .listDirectory(parentPath)
        .catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedName("untitled.txt", names);
      const filePath = `${parentPath}/${name}`;
      const node = {
        id: getStableOsFileUiId(filePath),
        name,
        path: filePath,
        isDirectory: false,
      };
      enqueueOperation({
        kind: "create",
        command: new CreateCommand(filePath, name, false, ""),
        apply: (nodes) => addNode(nodes, parentPath, node),
        isObserved: (nodes) => Boolean(findNodeByPath(nodes, filePath)),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create file.",
      );
    }
  }

  function getCompositionCreateMenuItems(basePath: string) {
    return [
      {
        label: "Standard",
        action: () => void createNewComposition(basePath, "standard"),
      },
      {
        label: "3D (Alpha)",
        action: () => void createNewComposition(basePath, "3d"),
      },
    ];
  }

  async function createNewComposition(
    basePath: string,
    kind: "standard" | "3d" = "standard",
  ) {
    try {
      const parentPath = basePath;
      const entries = await clipperHost
        .listDirectory(parentPath)
        .catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedSemanticName(
        kind === "3d" ? "untitled-3d" : "untitled",
        ".composition.ts",
        names,
      );
      const content =
        kind === "3d"
          ? `import { Composition3D } from "@clipper/composition-api";

export const composition = new Composition3D({
  duration: 5,
  frame: { width: 1920, height: 1080, style: {} },
  composition3dGraph: {
    nodes: {},
    edges: [],
    customNodes: {},
  },
});
`
          : `import { Composition } from "@clipper/composition-api";

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
      const node = {
        id: getStableOsFileUiId(filePath),
        name,
        path: filePath,
        isDirectory: false,
        isComposition: true,
      };
      enqueueOperation({
        kind: "create",
        command: new CreateCommand(filePath, name, false, content),
        apply: (nodes) => addNode(nodes, parentPath, node),
        isObserved: (nodes) => Boolean(findNodeByPath(nodes, filePath)),
        reloadProjectAfterCommit: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create composition.",
      );
    }
  }

  async function createNewTimeline(basePath: string) {
    try {
      const parentPath = basePath;
      const entries = await clipperHost
        .listDirectory(parentPath)
        .catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedSemanticName(
        "New Timeline",
        ".timeline.json",
        names,
      );
      const content = JSON.stringify(
        {
          clips: [],
          adjustmentLayers: [],
          motionMarkers: [],
          transitionLayers: [],
          timelineLayers: createDefaultTimelineLayerState(),
          settings: {},
        },
        null,
        2,
      );
      const filePath = `${parentPath}/${name}`;
      const node = {
        id: getStableOsFileUiId(filePath),
        name,
        path: filePath,
        isDirectory: false,
      };
      enqueueOperation({
        kind: "create",
        command: new CreateCommand(filePath, name, false, content),
        apply: (nodes) => addNode(nodes, parentPath, node),
        isObserved: (nodes) => Boolean(findNodeByPath(nodes, filePath)),
        reloadProjectAfterCommit: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create timeline.",
      );
    }
  }

  async function createNewFolder(parentPath: string) {
    try {
      const entries = await clipperHost
        .listDirectory(parentPath)
        .catch(() => []);
      const names = entries.map((e) => e.name);
      const name = nextNumberedName("New Folder", names);
      const folderPath = `${parentPath}/${name}`;
      const node = {
        id: getStableOsFileUiId(folderPath),
        name,
        path: folderPath,
        isDirectory: true,
        children: [],
      };
      enqueueOperation({
        kind: "create",
        command: new CreateCommand(folderPath, name, true),
        apply: (nodes) => addNode(nodes, parentPath, node),
        isObserved: (nodes) => Boolean(findNodeByPath(nodes, folderPath)),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create folder.",
      );
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
      const targets = nodesToDelete.map((node) => ({
        path: node.path,
        name: node.name,
        isDirectory: node.isDirectory,
      }));
      const deletePathMoves = targets.map((target, index) =>
        projectRelativeMove(
          projectDirectory,
          target.path,
          `${effectiveDirectory}/.clipper-trash/${Date.now()}_${index}_${target.name}`,
        ),
      );
      onCompositionPathMoves?.(deletePathMoves);
      enqueueOperation({
        kind: "delete",
        command: new DeleteCommand(targets, effectiveDirectory),
        projectPathMoves: deletePathMoves,
        apply: (nodes) => removeNodes(nodes, nodesToDelete),
        isObserved: (nodes) =>
          targets.every((target) => !findNodeByPath(nodes, target.path)),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete.");
      setRefreshKey((k) => k + 1);
    }
  }

  function removeNodes(
    nodes: OsFileNode[],
    nodesToRemove: OsFileNode[],
  ): OsFileNode[] {
    return nodes
      .filter((node) => !nodesToRemove.some((n) => n.id === node.id))
      .map((node) => ({
        ...node,
        children: node.children
          ? removeNodes(node.children, nodesToRemove)
          : undefined,
      }));
  }

  const data = useMemo(() => treeData, [treeData]);

  const handleRename = useCallback(
    async ({ id, name }: { id: string; name: string }) => {
      const node = findNodeById(treeData, id);
      if (!node) {
        toast.error(
          "Cannot rename: file information is not loaded. Try again after the tree refreshes.",
        );
        setRefreshKey((k) => k + 1);
        return;
      }

      const nextFullName = reconstructFileName(name, node.name);
      const oldPath = rebasePath(
        node.path,
        getQueuedOsFileMoves(operationQueueRef.current),
      );
      if (oldPath.endsWith(`/${nextFullName}`)) return; // No change
      const parentPath = getDirectoryPath(oldPath);
      const newPath = `${parentPath}/${nextFullName}`;

      const targetExists = Boolean(findNodeByPath(treeData, newPath));
      if (targetExists) {
        toast.error(`A file or folder named "${nextFullName}" already exists.`);
        return;
      }

      preserveOsFileUiIdForMove(oldPath, newPath);
      const relativeMove = projectRelativeMove(
        projectDirectory,
        oldPath,
        newPath,
      );
      onCompositionPathMoves?.([relativeMove], { save: false });
      enqueueOperation({
        kind: "rename",
        command: new RenameCommand(oldPath, nextFullName),
        pathMoves: [{ oldPath, newPath }],
        projectPathMoves: [relativeMove],
        apply: (nodes) => renameOsFileNode(nodes, oldPath, nextFullName),
        isObserved: (nodes) =>
          Boolean(findNodeByPath(nodes, newPath)) &&
          !Boolean(findNodeByPath(nodes, oldPath)),
      });
    },
    [
      treeData,
      enqueueOperation,
      onCompositionPathMoves,
      preserveOsFileUiIdForMove,
      projectDirectory,
    ],
  );

  const handleMove = useCallback(
    async ({ dragIds, parentId }: NativeTreeDropTarget) => {
      const targetFolderId = parentId ?? effectiveDirectory;
      let targetFolder =
        targetFolderId === effectiveDirectory
          ? {
              id: getStableOsFileUiId(effectiveDirectory),
              name: effectiveDirectory.split("/").pop() || "",
              path: effectiveDirectory,
              isDirectory: true,
            }
          : findNodeById(treeData, targetFolderId);
      if (!targetFolder || !targetFolder.isDirectory) return;
      let moved = false;
      const moves: Array<{ oldPath: string; newPath: string }> = [];
      const targetFolderPath = rebasePath(
        targetFolder.path,
        getQueuedOsFileMoves(operationQueueRef.current),
      );
      const targetEntries = await clipperHost
        .listDirectory(targetFolderPath)
        .catch(() => []);
      const targetNames = new Set(targetEntries.map((entry) => entry.name));

      const dragNodes = dragIds
        .map((dragId) => findNodeById(treeData, dragId))
        .filter(Boolean) as OsFileNode[];
      for (const dragNode of getTopLevelOsFileNodes(dragNodes)) {
        const node = dragNode;
        const oldPath = rebasePath(
          node.path,
          getQueuedOsFileMoves(operationQueueRef.current),
        );
        targetNames.delete(
          oldPath.startsWith(`${targetFolderPath}/`)
            ? oldPath.slice(targetFolderPath.length + 1).split("/")[0]
            : "",
        );
        const nextName = nextAvailableOsFileName(node.name, targetNames);
        const newPath = `${targetFolderPath}/${nextName}`;
        if (!canMoveOsFilePath(oldPath, newPath)) continue;
        preserveOsFileUiIdForMove(oldPath, newPath);
        moves.push({ oldPath, newPath });
        moved = true;
      }
      if (moved) {
        try {
          const relativeMoves = moves.map((move) =>
            projectRelativeMove(projectDirectory, move.oldPath, move.newPath),
          );
          onCompositionPathMoves?.(relativeMoves, { save: false });
          enqueueOperation({
            kind: "move",
            command: new MoveCommand(moves),
            pathMoves: moves,
            projectPathMoves: relativeMoves,
            apply: (nodes) => moveNodes(nodes, moves, effectiveDirectory),
            isObserved: (nodes) =>
              moves.every(
                (move) =>
                  Boolean(findNodeByPath(nodes, move.newPath)) &&
                  !Boolean(findNodeByPath(nodes, move.oldPath)),
              ),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unable to move file.";
          if (
            message.toLowerCase().includes("already exists") ||
            message.toLowerCase().includes("file exists")
          ) {
            toast.error("One or more files already exist in the destination.");
          } else {
            toast.error(message);
          }
        }
      }
    },
    [
      effectiveDirectory,
      treeData,
      enqueueOperation,
      getStableOsFileUiId,
      onCompositionPathMoves,
      preserveOsFileUiIdForMove,
      projectDirectory,
    ],
  );

  function handlePanelContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      isFileManagerInteractiveTarget(target)
    )
      return;
    openContextMenu(event, null);
  }

  const disableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: NativeTreeNodeApi<OsFileNode> | { isRoot: true };
      dragNodes: NativeTreeNodeApi<OsFileNode>[];
      index: number;
    }) => {
      if (parentNode.isRoot) return false;
      if (!parentNode.data.isDirectory) return true;
      if (
        dragNodes.some((n) =>
          parentNode.data.path.startsWith(`${n.data.path}/`),
        )
      )
        return true;
      return false;
    },
    [],
  );

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && isTextEditingTarget(target)) return;
    deleteSelectedNodes(event);
  }

  function deleteSelectedNodes(
    event: Pick<
      ReactKeyboardEvent<HTMLElement> | KeyboardEvent,
      "ctrlKey" | "key" | "metaKey" | "preventDefault" | "stopPropagation"
    >,
  ) {
    if (event.key !== "Backspace" || (!event.metaKey && !event.ctrlKey))
      return false;
    if (!selectedNodeIds.length) return false;
    const nodesToDelete = selectedNodeIds
      .map((id) => findNodeById(treeData, id))
      .filter(Boolean) as OsFileNode[];
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
    if (
      !(target instanceof HTMLElement) ||
      isFileManagerInteractiveTarget(target)
    )
      return;
    treeRef.current?.deselectAll();
    treeRef.current?.onBlur();
    setSelectedNodeIds([]);
  }

  function updateRootDropPreview(
    node: OsFileNode | null,
    mouse: { x: number; y: number } | null,
  ) {
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
    const dragIds = api.selectedNodes.some(
      (selectedNode) => selectedNode.id === node.id,
    )
      ? api.selectedNodes.map((selectedNode) => selectedNode.id)
      : [node.id];
    const dropTarget =
      localX >= 0 &&
      localX <= rect.width &&
      localY >= 0 &&
      localY <= rect.height
        ? (getOsFileDropTarget(api, dragIds, localY) ??
          getDefaultOsFileDropTarget(api, dragIds, localY))
        : null;
    setRootDropVisible(dropTarget?.parentId === null);
  }

  const totalRowCount = countNodes(data);
  const treeHeight = Math.max(MIN_TREE_HEIGHT, totalRowCount * ROW_HEIGHT);
  const initialOpenState = useMemo(() => {
    if (
      fileManagerState?.openState &&
      Object.keys(fileManagerState.openState).some((id) =>
        id.startsWith("os-file:"),
      )
    )
      return fileManagerState.openState;
    const topState: Record<string, boolean> = {};
    for (const node of treeData) {
      if (node.isDirectory) topState[node.id] = true;
    }
    return topState;
  }, [fileManagerState?.openState, treeData]);

  function handleToggle() {
    const api = treeRef.current;
    if (!api) return;
    window.setTimeout(
      () =>
        onFileManagerStateChange({
          ...fileManagerState,
          openState: {
            ...fileManagerState?.openState,
            ...treeRef.current?.openState,
          },
        }),
      0,
    );
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
      <div
        ref={treeContainerRef}
        className={`relative ${rootDropVisible ? "bg-[var(--clipper-accent-muted-surface)] shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_0_0_2px_var(--clipper-accent)]" : ""}`}
      >
        <NativeTree<OsFileNode>
          ref={treeRef}
          data={data}
          disableDrop={disableDrop}
          getDropTarget={({ dragIds, localY, tree: api }) =>
            getOsFileDropTarget(api, dragIds, localY)
          }
          height={treeHeight}
          idAccessor="id"
          indent={INDENT}
          initialOpenState={initialOpenState}
          isInternal={(node) => node.isDirectory}
          movable
          onMove={handleMove}
          onRename={handleRename}
          onSelect={handleSelect}
          onActivate={(node, event) => handleFileActivate(node.data, event)}
          onToggle={handleToggle}
          openByDefault={false}
          paddingBottom={0}
          paddingTop={0}
          renderDragPreview={(previewProps) => (
            <OsFileDragPreview
              {...previewProps}
              hideGhost={compositionLanePreviewActive}
              nodes={treeData}
              onDragPositionChange={updateRootDropPreview}
            />
          )}
          rowHeight={ROW_HEIGHT}
          width="100%"
        >
          {(props) => (
            <OsFileTreeNode
              {...props}
              compositionLibrary={compositionLibrary}
              effectiveDirectory={effectiveDirectory}
              projectDirectory={projectDirectory}
              onContextMenu={openContextMenu}
            />
          )}
        </NativeTree>
      </div>
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
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
  nodes: OsFileNode[];
  onDragPositionChange: (
    node: OsFileNode | null,
    mouse: { x: number; y: number } | null,
  ) => void;
}) {
  const nodeData = id ? findNodeById(nodes, id) : null;
  const internalPreviewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDragPositionChange(
      isDragging ? nodeData : null,
      isDragging ? mouse : null,
    );
  }, [isDragging, mouse, nodeData, onDragPositionChange]);

  if (!isDragging || !nodeData || !mouse || hideGhost) return null;
  const fileType = getFileType(
    nodeData.name,
    nodeData.isDirectory,
    nodeData.isComposition,
  );
  const Icon = nodeData.isDirectory
    ? Folder
    : fileType === "composition"
      ? Clapperboard
      : fileType === "timeline"
        ? ChartNoAxesGantt
        : File;
  const contentClass =
    fileType === "composition" ? "text-[#38d996]" : "text-current";

  return (
    <div
      ref={internalPreviewRef}
      className={`${clipperDragGhostClassName} ${contentClass}`}
      style={{
        transform: `translate3d(${mouse.x + clipperDragGhostOffset.x}px, ${mouse.y + clipperDragGhostOffset.y}px, 0)`,
      }}
    >
      <Icon size={15} />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {getDragPreviewDisplayName(nodeData.name)}
      </span>
    </div>
  );
}

function isDragEventInsideElement(
  event: globalThis.DragEvent,
  element: HTMLElement | null,
) {
  const target = event.target;
  return Boolean(element && target instanceof Node && element.contains(target));
}

function isFileManagerInteractiveTarget(target: HTMLElement) {
  return Boolean(
    target.closest(
      "button,input,textarea,select,[contenteditable='true'],[data-file-manager-row='true']",
    ),
  );
}

async function copyOsPathsToClipboard(paths: string[]) {
  if (!paths.length) return;
  try {
    await clipperHost.copyText(paths.join("\n"));
    toast.success(
      paths.length === 1 ? "Path copied" : `${paths.length} paths copied`,
    );
  } catch {
    toast.error(
      paths.length === 1 ? "Unable to copy path" : "Unable to copy paths",
    );
  }
}

function canMoveOsFilePath(oldPath: string, newPath: string) {
  return oldPath !== newPath && !newPath.startsWith(`${oldPath}/`);
}

function defaultOsFileOperationError(kind: OsFileOperation["kind"]) {
  if (kind === "create") return "Unable to create file.";
  if (kind === "rename") return "Unable to rename.";
  if (kind === "move") return "Unable to move file.";
  return "Unable to delete.";
}

function nextAvailableOsFileName(fileName: string, siblingNames: Set<string>) {
  const parsed = splitOsFileName(fileName);
  let nextName = fileName;
  let index = 2;
  while (siblingNames.has(nextName)) {
    nextName = `${parsed.base} ${index}${parsed.extension}`;
    index += 1;
  }
  siblingNames.add(nextName);
  return nextName;
}

function splitOsFileName(fileName: string) {
  const semanticSuffixes = [
    ".composition.ts",
    ".composition.json",
    ".timeline.ts",
    ".timeline.json",
  ];
  for (const suffix of semanticSuffixes) {
    if (fileName.endsWith(suffix))
      return { base: fileName.slice(0, -suffix.length), extension: suffix };
  }
  const extensionIndex = fileName.lastIndexOf(".");
  return extensionIndex > 0
    ? {
        base: fileName.slice(0, extensionIndex),
        extension: fileName.slice(extensionIndex),
      }
    : { base: fileName, extension: "" };
}

function getOsFileDropTarget(
  api: NativeTreeApi<OsFileNode>,
  dragIds: string[],
  localY: number,
): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (
    !visibleNodes.length ||
    localY < 0 ||
    localY > visibleNodes.length * ROW_HEIGHT
  )
    return canDropOsFileRoot(api, dragIds)
      ? { dragIds, parentId: null, index: visibleNodes.length }
      : null;
  const rowIndex = Math.max(
    0,
    Math.min(visibleNodes.length - 1, Math.floor(localY / ROW_HEIGHT)),
  );
  const node = visibleNodes[rowIndex];
  if (!node) return null;
  const yInRow = localY - rowIndex * ROW_HEIGHT;
  if (node.isInternal && node.isOpen && yInRow >= ROW_HEIGHT / 2)
    return { dragIds, parentId: node.id, index: 0 };
  return null;
}

function getDefaultOsFileDropTarget(
  api: NativeTreeApi<OsFileNode>,
  dragIds: string[],
  localY: number,
): NativeTreeDropTarget | null {
  const visibleNodes = api.visibleNodes;
  if (!visibleNodes.length) return null;
  const rowIndex = Math.max(
    0,
    Math.min(visibleNodes.length - 1, Math.floor(localY / ROW_HEIGHT)),
  );
  const node = visibleNodes[rowIndex];
  if (!node) return null;
  const yInRow = localY - rowIndex * ROW_HEIGHT;
  if (
    node.isInternal &&
    yInRow > ROW_HEIGHT * 0.25 &&
    yInRow < ROW_HEIGHT * 0.75
  )
    return { dragIds, parentId: node.id, index: 0 };
  return {
    dragIds,
    parentId: node.parent?.id ?? null,
    index: node.childIndex + (yInRow >= ROW_HEIGHT / 2 ? 1 : 0),
  };
}

function canDropOsFileRoot(api: NativeTreeApi<OsFileNode>, dragIds: string[]) {
  const dragNodes = dragIds.flatMap(
    (id) => api.visibleNodes.find((node) => node.id === id) ?? [],
  );
  return (
    dragNodes.length === dragIds.length &&
    dragNodes.every(
      (node) => getDirectoryPath(node.data.path) !== node.data.path,
    )
  );
}

function OsFileTreeNode({
  compositionLibrary,
  dragHandle,
  node,
  style,
  effectiveDirectory,
  projectDirectory,
  onContextMenu,
}: NativeTreeNodeRendererProps<OsFileNode> & {
  compositionLibrary: CompositionClip[];
  effectiveDirectory: string;
  projectDirectory: string;
  onContextMenu: (
    event: ReactMouseEvent,
    node: NativeTreeNodeApi<OsFileNode>,
  ) => void;
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
  const Icon = data.isDirectory
    ? node.isOpen
      ? FolderOpen
      : Folder
    : fileType === "composition"
      ? data.isComposition3d
        ? Box
        : Clapperboard
      : fileType === "timeline"
        ? ChartNoAxesGantt
        : data.name.endsWith(".ts")
          ? FileCode
          : data.name.endsWith(".json")
            ? FileJson
            : File;
  const contentClass =
    fileType === "composition" ? "text-[#38d996]" : "text-current";

  function handleDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (node.isEditing) return;
    if (fileType === "timeline") {
      const timelineId = data.timelineId ?? displayName;
      event.dataTransfer.setData("application/x-clipper-timeline", timelineId);
    }
    if (fileType === "composition") {
      const compositionId = resolveOsCompositionDragId(
        compositionLibrary,
        data.path,
        projectDirectory,
      );
      if (compositionId)
        event.dataTransfer.setData(
          "application/x-clipper-composition",
          compositionId,
        );
    }
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
        if (!event.metaKey && !event.shiftKey && node.data.isDirectory)
          node.toggle();
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
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              submitEdit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              cancelEdit();
            }
          }}
        />
      ) : (
        <span
          className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 ${contentClass}`}
        >
          {displayName}
        </span>
      )}
      <span />
    </div>
  );
}

async function loadDirectoryTree(
  path: string,
  projectDirectory: string,
  getStableId: (path: string) => string = (nodePath) => nodePath,
): Promise<OsFileNode[]> {
  const entries = await clipperHost.listDirectory(path);
  // Filter out the trash folder
  const sorted = entries
    .filter((e) => e.name !== ".clipper-trash")
    .sort((a, b) => {
      if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
      return a.isDirectory ? -1 : 1;
    });
  const nodes: OsFileNode[] = [];
  for (const entry of sorted) {
    const childPath = `${path}/${entry.name}`;
    let isComposition = false;
    let isComposition3d = false;
    let timelineId: string | undefined = undefined;

    if (!entry.isDirectory && isCompositionFilePath(childPath)) {
      try {
        if (childPath.endsWith(".composition3d.json")) {
          isComposition = true;
        } else {
          const content = await clipperHost.readTextFile(childPath);
          isComposition =
            content.includes("new Composition({") ||
            content.includes("new Composition3D({");
          isComposition3d = content.includes("new Composition3D({");
        }
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
      id: getStableId(childPath),
      name: entry.name,
      path: childPath,
      isDirectory: entry.isDirectory,
      isComposition,
      isComposition3d,
      timelineId,
    };
    if (entry.isDirectory) {
      node.children = await loadDirectoryTree(
        childPath,
        projectDirectory,
        getStableId,
      );
    }
    nodes.push(node);
  }
  return nodes;
}

function projectRelativeFilePath(filePath: string, rootPath: string) {
  const editableRoot = filePath.startsWith(`${rootPath}/file-manager/`)
    ? `${rootPath}/file-manager`
    : rootPath;
  const relativePath = filePath.startsWith(`${editableRoot}/`)
    ? filePath.slice(editableRoot.length + 1)
    : filePath;
  return relativePath.startsWith("file-manager/")
    ? relativePath.slice("file-manager/".length)
    : relativePath;
}

function projectRelativeMove(
  rootPath: string,
  oldPath: string,
  newPath: string,
) {
  return {
    oldPath: projectRelativeFilePath(oldPath, rootPath),
    newPath: projectRelativeFilePath(newPath, rootPath),
  };
}

function reverseProjectPathMoves(moves: PendingPathMove[]) {
  return moves
    .map((move) => ({ oldPath: move.newPath, newPath: move.oldPath }))
    .reverse();
}

export function resolveOsCompositionId(
  compositions: Pick<CompositionClip, "id" | "filePath">[],
  filePath: string,
  projectDirectory: string,
) {
  const relativePath = projectRelativeFilePath(filePath, projectDirectory);
  return (
    compositions.find(
      (composition) =>
        composition.filePath === relativePath ||
        composition.filePath === filePath,
    )?.id ?? null
  );
}

function resolveOsCompositionDragId(
  compositions: Pick<CompositionClip, "id" | "filePath">[],
  filePath: string,
  projectDirectory: string,
) {
  return (
    resolveOsCompositionId(compositions, filePath, projectDirectory) ??
    projectRelativeFilePath(filePath, projectDirectory)
  );
}

export function createOsCompositionDragDetail(
  compositions: Pick<
    CompositionClip,
    "id" | "filePath" | "duration" | "objects" | "background" | "sourceMissing"
  >[],
  filePath: string,
  name: string,
  projectDirectory: string,
  phase: CompositionPointerDragDetail["phase"],
  currentMouse: { x: number; y: number },
  shiftKey: boolean,
): CompositionPointerDragDetail | null {
  const compositionId = resolveOsCompositionDragId(
    compositions,
    filePath,
    projectDirectory,
  );
  const metadata = resolveOsCompositionDragMetadata(
    compositions,
    compositionId,
  );
  return {
    phase,
    clientX: currentMouse.x,
    clientY: currentMouse.y,
    shiftKey,
    compositionId,
    duration: metadata.duration,
    isEmpty: metadata.isEmpty,
    label: getDragPreviewDisplayName(metadata.filePath ?? name),
    sourceMissing: metadata.sourceMissing,
  };
}

function isCompositionFilePath(filePath: string) {
  return (
    filePath.endsWith(".composition.ts") ||
    filePath.endsWith(".composition3d.json")
  );
}

export function resolveOsCompositionDragMetadata(
  compositions: Pick<
    CompositionClip,
    "id" | "filePath" | "duration" | "objects" | "background" | "sourceMissing"
  >[],
  compositionId: string,
) {
  const composition = compositions.find(
    (item) =>
      item.id === compositionId ||
      item.filePath === compositionId ||
      item.filePath.endsWith(`/${compositionId}`),
  );
  return {
    duration: Math.max(composition?.duration ?? 5, 0.1),
    isEmpty: composition
      ? composition.objects.length === 0 &&
        composition.background.elements.length === 0
      : true,
    filePath: composition?.filePath,
    sourceMissing: Boolean(composition?.sourceMissing),
  };
}

type SyncedOsFileSelection = { key: string; nodeId: string } | null;

export function shouldSyncActiveOsFileSelection(
  currentSelectedIds: string[],
  lastSynced: SyncedOsFileSelection,
  activeSelectionKey: string | null,
  targetId: string | null,
) {
  if (!activeSelectionKey || !targetId) return false;
  if (lastSynced?.key !== activeSelectionKey) return true;
  if (lastSynced.nodeId !== targetId)
    return (
      currentSelectedIds.length === 0 ||
      (currentSelectedIds.length === 1 &&
        currentSelectedIds[0] === lastSynced.nodeId)
    );
  return currentSelectedIds.length === 0;
}

function findNodeById(nodes: OsFileNode[], id: string): OsFileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findNodeByPath(nodes: OsFileNode[], path: string): OsFileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function getTopLevelOsFileNodes(nodes: OsFileNode[]) {
  return nodes.filter(
    (node) =>
      !nodes.some(
        (parent) =>
          node.path !== parent.path && node.path.startsWith(`${parent.path}/`),
      ),
  );
}

function sortNodes(nodes: OsFileNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
    return a.isDirectory ? -1 : 1;
  });
}

function remapNodePath(
  node: OsFileNode,
  oldPath: string,
  newPath: string,
): OsFileNode {
  const nextNodePath =
    node.path === oldPath || node.path.startsWith(`${oldPath}/`)
      ? `${newPath}${node.path.slice(oldPath.length)}`
      : node.path;
  const nextNode: OsFileNode = {
    ...node,
    path: nextNodePath,
    name: nextNodePath.split("/").pop() || node.name,
  };
  if (node.children)
    nextNode.children = node.children.map((child) =>
      remapNodePath(child, oldPath, newPath),
    );
  return nextNode;
}

function addNode(
  nodes: OsFileNode[],
  parentPath: string,
  nodeToAdd: OsFileNode,
): OsFileNode[] {
  if (findNodeByPath(nodes, nodeToAdd.path)) return nodes;
  const result = addNodeToParent(nodes, parentPath, nodeToAdd);
  return result.inserted ? result.nodes : sortNodes([...nodes, nodeToAdd]);
}

function addNodeToParent(
  nodes: OsFileNode[],
  parentPath: string,
  nodeToAdd: OsFileNode,
): { nodes: OsFileNode[]; inserted: boolean } {
  let inserted = false;
  const nextNodes = nodes.map((node) => {
    if (node.path === parentPath && node.isDirectory) {
      inserted = true;
      return {
        ...node,
        children: sortNodes([...(node.children ?? []), nodeToAdd]),
      };
    }
    if (!node.children) return node;
    const result = addNodeToParent(node.children, parentPath, nodeToAdd);
    if (result.inserted) inserted = true;
    return result.inserted ? { ...node, children: result.nodes } : node;
  });
  return { nodes: inserted ? sortNodes(nextNodes) : nodes, inserted };
}

export function renameOsFileNode(
  nodes: OsFileNode[],
  oldPath: string,
  nextName: string,
): OsFileNode[] {
  const newPath = `${getDirectoryPath(oldPath)}/${nextName}`;
  return sortNodes(nodes.map((node) => remapNodePath(node, oldPath, newPath)));
}

export function applyPendingOsFileMoves(
  nodes: OsFileNode[],
  moves: PendingPathMove[],
): OsFileNode[] {
  if (!moves.length) return nodes;
  return sortNodes(
    nodes.map((node) =>
      moves.reduce(
        (currentNode, move) =>
          remapNodePath(currentNode, move.oldPath, move.newPath),
        node,
      ),
    ),
  );
}

export function retainUnobservedPendingMoves(
  nodes: OsFileNode[],
  moves: PendingPathMove[],
) {
  if (!moves.length) return moves;
  const paths = collectOsFilePaths(nodes);
  return moves.filter(
    (move) => paths.has(move.oldPath) && !paths.has(move.newPath),
  );
}

export function reconcilePendingOsFileMoves(
  nodes: OsFileNode[],
  moves: PendingOsFileMove[],
): PendingOsFileMove[] {
  if (!moves.length) return moves;
  const paths = collectOsFilePaths(nodes);
  return moves.filter((move) => {
    const newObserved = pathSetHasPathOrDescendant(paths, move.newPath);
    if (move.state === "in-flight") return true;
    return !newObserved;
  });
}

export function applyOsFileOperations(
  nodes: OsFileNode[],
  operations: Pick<OsFileOperation, "apply">[],
): OsFileNode[] {
  return operations.reduce(
    (current, operation) => operation.apply(current),
    nodes,
  );
}

export function renderOsFileOperationTree(
  nodes: OsFileNode[],
  operations: Pick<OsFileOperation, "apply">[],
): OsFileNode[] {
  return applyOsFileOperations(nodes, operations);
}

export function pruneObservedOsFileOperations(
  nodes: OsFileNode[],
  operations: OsFileOperation[],
): OsFileOperation[] {
  return operations.filter(
    (operation) =>
      operation.status !== "succeeded" || !operation.isObserved(nodes),
  );
}

export function rollbackFailedOsFileOperations(
  operations: OsFileOperation[],
  failedOperationId: number,
) {
  const failedIndex = operations.findIndex(
    (item) => item.id === failedOperationId,
  );
  if (failedIndex < 0)
    return {
      operations: operations.filter((item) => item.id !== failedOperationId),
      rolledBackOperations: [] as OsFileOperation[],
    };
  return {
    operations: operations.slice(0, failedIndex),
    rolledBackOperations: operations.slice(failedIndex),
  };
}

function getQueuedOsFileMoves(
  operations: OsFileOperation[],
): PendingPathMove[] {
  return operations.flatMap((operation) => operation.pathMoves ?? []);
}

function pathSetHasPathOrDescendant(paths: Set<string>, path: string) {
  for (const candidate of paths) {
    if (candidate === path || candidate.startsWith(`${path}/`)) return true;
  }
  return false;
}

function collectOsFilePaths(nodes: OsFileNode[], paths = new Set<string>()) {
  for (const node of nodes) {
    paths.add(node.path);
    if (node.children) collectOsFilePaths(node.children, paths);
  }
  return paths;
}

export function preserveStableOsFileMoveIds(
  idByPath: Map<string, string>,
  nodes: OsFileNode[],
  oldPath: string,
  newPath: string,
) {
  const existingNode = findNodeByPath(nodes, oldPath);
  if (existingNode) {
    registerMovedNodeIds(idByPath, existingNode, oldPath, newPath);
    return;
  }

  const existingId = idByPath.get(oldPath);
  if (existingId) idByPath.set(newPath, existingId);
}

function getSelectedAgentProvider(): keyof typeof agentProviderLabels {
  const value = window.localStorage.getItem("clipper:agent-provider");
  return value === "codex" ||
    value === "claude" ||
    value === "gemini" ||
    value === "opencode"
    ? value
    : "opencode";
}

function registerMovedNodeIds(
  idByPath: Map<string, string>,
  node: OsFileNode,
  oldPath: string,
  newPath: string,
) {
  const nextPath =
    node.path === oldPath || node.path.startsWith(`${oldPath}/`)
      ? `${newPath}${node.path.slice(oldPath.length)}`
      : node.path;
  idByPath.set(nextPath, node.id);
  for (const child of node.children ?? [])
    registerMovedNodeIds(idByPath, child, oldPath, newPath);
}

function takeNode(
  nodes: OsFileNode[],
  path: string,
): { nodes: OsFileNode[]; node: OsFileNode | null } {
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

function insertNode(
  nodes: OsFileNode[],
  parentPath: string,
  nodeToInsert: OsFileNode,
  rootPath: string,
): OsFileNode[] {
  if (parentPath === rootPath) return sortNodes([...nodes, nodeToInsert]);
  return sortNodes(
    nodes.map((node) => {
      if (node.path === parentPath && node.isDirectory) {
        return {
          ...node,
          children: sortNodes([...(node.children ?? []), nodeToInsert]),
        };
      }
      return {
        ...node,
        children: node.children
          ? insertNode(node.children, parentPath, nodeToInsert, rootPath)
          : undefined,
      };
    }),
  );
}

function moveNodes(
  nodes: OsFileNode[],
  moves: PendingPathMove[],
  rootPath: string,
): OsFileNode[] {
  return moves.reduce((currentNodes, move) => {
    const taken = takeNode(currentNodes, move.oldPath);
    if (!taken.node) return currentNodes;
    const movedNode = remapNodePath(taken.node, move.oldPath, move.newPath);
    return insertNode(
      taken.nodes,
      getDirectoryPath(move.newPath),
      movedNode,
      rootPath,
    );
  }, nodes);
}

function findTimelineNodeById(
  nodes: OsFileNode[],
  timelineId: string,
): OsFileNode | null {
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
  return nodes.reduce(
    (total, node) =>
      total + 1 + (node.children ? countNodes(node.children) : 0),
    0,
  );
}
