import { createElement, useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { clipperHost } from "../clipperHost";
import toast from "react-hot-toast";
import { maxProjectHistoryActions, projectHistoryCoalesceMs } from "../config";
import { getDirectoryPath } from "../features/file-manager/fileManagerPaths";
import { getEditableRootPath, projectPersistenceService } from "../services/projectPersistenceService";
import { getProjectContentSnapshot, useProjectDocumentState } from "../state/projectStore";
import type { Mode, ProjectUpdater } from "../types";
import { compositionFromSource } from "../../core/compositionSource";
import { defaultTimelineMode, normalizeProject, replacePartInProject, serializeProjectForSave } from "../../core/project";
import type { EditorState, Part, ProjectManifest, TimelineMode } from "../../core/types";
import { writeStoredActiveProjectManifestPath } from "./activeProjectManifest";
import { getProjectCompositionSources, getSyncedCompositionSources } from "./projectSources";
import type { Command } from "../features/file-manager/operations/Command";

type ProjectHistoryEntry = { project: ProjectManifest; compositionSources: Record<string, string>; implicitFileOperation?: boolean; fileCommand?: Command };
type SavedSnapshots = { project: string; compositionSources: string };

export type ProjectDocumentController = {
  activeProjectManifestPath: string;
  activeProjectManifestPathRef: MutableRefObject<string>;
  compositionSources: Record<string, string>;
  compositionSourcesRef: MutableRefObject<Record<string, string>>;
  executeFileManagerCommand: (command: Command) => Promise<void>;
  fileSystemRevision: number;
  implicitFileOperation: <T extends unknown[]>(operation: (...args: T) => Promise<void> | void) => (...args: T) => void;
  isFileSystemBusy: boolean;
  lastSavedAt: number | null;
  openProjectManifest: () => Promise<void>;
  project: ProjectManifest;
  projectRef: MutableRefObject<ProjectManifest>;
  replaceProject: (nextProject: ProjectManifest, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  redoProjectChange: () => Promise<void> | void;
  reloadProject: () => Promise<void>;
  reloadProjectFromWatcher: (changedPath?: string) => Promise<void>;
  saveAllChanges: () => Promise<void>;
  savedCompositionSourcesSnapshot: string;
  savedProjectSnapshot: string;
  scheduleImplicitFileOperationSave: (projectOverride?: ProjectManifest, errorMessage?: string) => void;
  setCompositionSources: (sources: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  syncCompositionSourcesFromProject: (nextProject: ProjectManifest) => void;
  undoProjectChange: () => Promise<void> | void;
  updateCompositionFromSource: (basePart: Part, source: string, options?: { syncSource?: boolean; history?: boolean }) => Promise<void>;
  updateEditorState: (updater: (state: EditorState) => EditorState, options?: { history?: boolean; coalesceHistory?: boolean; autosave?: boolean }) => void;
  updateProject: (updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  watchedProjectDirectory: string;
  writeEditorTextFile: (filePath: string, source: string) => Promise<void>;
};

export type UseProjectDocumentControllerInput = {
  applyStoredEditorState: (editorState: EditorState, fallbackSceneId: string, options?: { preserveMarkerSelection?: boolean }) => void;
  centerPreviewScrollRef: RefObject<HTMLDivElement | null>;
  defaultEditorState: EditorState;
  initialProjectManifestPath: string;
  modeRef: MutableRefObject<Mode>;
  notifyError: (error: unknown, fallback: string) => void;
  notifyOpenSuccess: (path: string) => void;
  setSourceStatus: (status: string) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  timelineModeRef: MutableRefObject<TimelineMode>;
};

export function useProjectDocumentController({ applyStoredEditorState, centerPreviewScrollRef, defaultEditorState, initialProjectManifestPath, modeRef, notifyError, notifyOpenSuccess, setSourceStatus, setTimelineMode, timelineModeRef }: UseProjectDocumentControllerInput): ProjectDocumentController {
  const { project, setProject, setProjectDocument, savedProjectSnapshot, setSavedProjectSnapshot, compositionSources, setCompositionSources, savedCompositionSourcesSnapshot, setSavedCompositionSourcesSnapshot } = useProjectDocumentState();
  const [activeProjectManifestPath, setActiveProjectManifestPath] = useState(initialProjectManifestPath);
  const [fileSystemRevision, setFileSystemRevision] = useState(0);
  const [isFileSystemBusy, setIsFileSystemBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() => Date.now());
  const pendingFileOperationsRef = useRef(0);
  const lastGoodProjectRef = useRef<ProjectManifest | null>(null);
  const lastGoodSavedSnapshotsRef = useRef<SavedSnapshots | null>(null);
  const projectRef = useRef(project);
  const compositionSourcesRef = useRef(compositionSources);
  const activeProjectManifestPathRef = useRef(activeProjectManifestPath);
  const savedProjectSnapshotRef = useRef(savedProjectSnapshot);
  const editableRootCacheRef = useRef<Record<string, string>>({});
  const savedCompositionSourcesSnapshotRef = useRef(savedCompositionSourcesSnapshot);
  const externalChangeConflictActiveRef = useRef(false);
  const externalChangeToastIdRef = useRef<string | null>(null);
  const suppressProjectWatcherUntilRef = useRef(0);
  const projectHistoryRef = useRef<{ past: ProjectHistoryEntry[]; future: ProjectHistoryEntry[] }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const fileSystemQueueGenerationRef = useRef(0);
  const fileSystemRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const implicitFileOperationBatchActiveRef = useRef(false);
  const implicitFileOperationActiveCountRef = useRef(0);
  const implicitFileOperationSaveVersionRef = useRef(0);
  const implicitFileOperationSaveTimeoutRef = useRef(0);
  const autosaveWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestAutosaveVersionRef = useRef(0);
  const autosaveBusyReleaseTimeoutRef = useRef(0);
  const sourceUpdateVersionRef = useRef<Record<string, number>>({});
  const watchedProjectDirectory = getDirectoryPath(activeProjectManifestPath);

  function commitProjectDocument(nextProject: ProjectManifest, nextSources: Record<string, string>) {
    projectRef.current = nextProject;
    compositionSourcesRef.current = nextSources;
    setProjectDocument(nextProject, nextSources);
  }

  const replaceProject = useCallback((nextProject: ProjectManifest, options: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean; preservePageMode?: boolean; preserveEditorState?: boolean } = {}) => {
    const currentProject = projectRef.current;
    let nextCompositionSources = nextProject.compositionSources ?? getProjectCompositionSources(nextProject);
    let normalizedProject: ProjectManifest;
    if (options.syncSources !== false) {
      nextCompositionSources = getSyncedCompositionSources(nextProject, currentProject, compositionSourcesRef.current);
      normalizedProject = normalizeProject({ ...nextProject, compositionSources: nextCompositionSources });
    } else {
      nextCompositionSources = nextProject.compositionSources ?? compositionSourcesRef.current;
      normalizedProject = normalizeProject({ ...nextProject, compositionSources: nextCompositionSources });
    }
    if (options.preserveEditorState) {
      normalizedProject = normalizeProject({
        ...normalizedProject,
        editorState: projectRef.current.editorState ?? defaultEditorState,
      });
    } else if (options.preservePageMode !== false) {
      const currentEditorState = projectRef.current.editorState ?? defaultEditorState;
      normalizedProject = normalizeProject({
        ...normalizedProject,
        editorState: {
          ...(normalizedProject.editorState ?? defaultEditorState),
          fileManagerState: currentEditorState.fileManagerState,
          mode: modeRef.current,
          timelineMode: timelineModeRef.current,
        },
      });
    }
    const sortedSources = (sources: Record<string, string> | undefined) => sources ? Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) : undefined;
    const projectForCompare = (p: ProjectManifest) => ({ ...p, compositionSources: sortedSources(p.compositionSources) });
    if (JSON.stringify(projectForCompare(normalizedProject)) === JSON.stringify(projectForCompare(currentProject))) return;

    if (options.history !== false) {
      const now = Date.now();
      const isCoalescedAction = options.coalesceHistory !== false && now - lastProjectHistoryAtRef.current < projectHistoryCoalesceMs && projectHistoryRef.current.past.length > 0;
      projectHistoryRef.current = {
        past: isCoalescedAction ? projectHistoryRef.current.past : [...projectHistoryRef.current.past, { project: currentProject, compositionSources: compositionSourcesRef.current }].slice(-maxProjectHistoryActions),
        future: [],
      };
      lastProjectHistoryAtRef.current = now;
    }

    commitProjectDocument(normalizedProject, nextCompositionSources);
    setTimelineMode(normalizedProject.editorState?.timelineMode ?? defaultTimelineMode);
    scheduleAutosave(normalizedProject);
  }, []);

  function updateEditorState(updater: (state: EditorState) => EditorState, options: { history?: boolean; coalesceHistory?: boolean; autosave?: boolean } = {}) {
    const current = projectRef.current;
    const nextProject = normalizeProject({
      ...current,
      editorState: updater(current.editorState ?? defaultEditorState),
    });
    if (JSON.stringify(nextProject.editorState) === JSON.stringify(current.editorState)) return;
    if (options.history) {
      replaceProject(nextProject, { history: true, syncSources: false, coalesceHistory: options.coalesceHistory });
      return;
    }

    commitProjectDocument(nextProject, compositionSourcesRef.current);
    if (options.autosave === false) return;
    scheduleAutosave(nextProject);
  }

  function updateProject(updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) {
    const nextProject = typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
  }

  function syncCompositionSourcesFromProject(nextProject: ProjectManifest) {
    const nextSources = getProjectCompositionSources(nextProject);
    commitProjectDocument(normalizeProject({ ...nextProject, compositionSources: nextSources }), nextSources);
  }

  function hasUnsavedProjectChanges(projectToCheck = projectRef.current) {
    const snapshots = getCurrentProjectSnapshots(projectToCheck);
    return snapshots.project !== savedProjectSnapshotRef.current || snapshots.compositionSources !== savedCompositionSourcesSnapshotRef.current;
  }

  async function hasExternalDiskChanges() {
    const diskSnapshots = await getDiskProjectSnapshots();
    const currentSnapshots = getCurrentProjectSnapshots();
    if (snapshotsEqual(diskSnapshots, currentSnapshots)) {
      markSnapshotsSaved(currentSnapshots);
      return false;
    }
    return !snapshotsEqual(diskSnapshots, { project: savedProjectSnapshotRef.current, compositionSources: savedCompositionSourcesSnapshotRef.current });
  }

  function getCurrentProjectSnapshots(projectToCheck = projectRef.current): SavedSnapshots {
    const persistedProject = serializeProjectForSave({ ...projectToCheck, compositionSources: compositionSourcesRef.current });
    return {
      project: getProjectContentSnapshot(persistedProject),
      compositionSources: JSON.stringify(persistedProject.compositionSources ?? {}),
    };
  }

  async function getDiskProjectSnapshots(): Promise<SavedSnapshots> {
    const { project: loadedProject } = await projectPersistenceService.loadProject({ manifestPath: activeProjectManifestPathRef.current });
    const normalizedProject = normalizeProject(loadedProject);
    const loadedCompositionSources = getProjectCompositionSources(normalizedProject);
    const persistedProject = serializeProjectForSave({ ...normalizedProject, compositionSources: loadedCompositionSources });
    return {
      project: getProjectContentSnapshot(persistedProject),
      compositionSources: JSON.stringify(persistedProject.compositionSources ?? {}),
    };
  }

  function snapshotsEqual(left: SavedSnapshots, right: SavedSnapshots) {
    return left.project === right.project && left.compositionSources === right.compositionSources;
  }

  function markSnapshotsSaved(snapshots: SavedSnapshots) {
    savedProjectSnapshotRef.current = snapshots.project;
    savedCompositionSourcesSnapshotRef.current = snapshots.compositionSources;
    setSavedProjectSnapshot(snapshots.project);
    setSavedCompositionSourcesSnapshot(snapshots.compositionSources);
    setLastSavedAt(Date.now());
  }

  function markLastHistoryEntryAsImplicitFileOperation() {
    const past = projectHistoryRef.current.past;
    if (past.length === 0) return;
    projectHistoryRef.current = {
      ...projectHistoryRef.current,
      past: past.map((entry, index) => (index === past.length - 1 ? { ...entry, implicitFileOperation: true } : entry)),
    };
  }

  function resetProjectHistory() {
    projectHistoryRef.current = { past: [], future: [] };
    lastProjectHistoryAtRef.current = 0;
  }

  function preserveCurrentPageMode(historyProject: ProjectManifest) {
    const currentEditorState = projectRef.current.editorState ?? defaultEditorState;
    return normalizeProject({
      ...historyProject,
      editorState: {
        ...(historyProject.editorState ?? currentEditorState),
        mode: modeRef.current,
        timelineMode: timelineModeRef.current,
      },
    });
  }

  async function storeActiveProjectManifestPath(manifestPath: string) {
    try {
      await writeStoredActiveProjectManifestPath(manifestPath);
    } catch {
      // Browser/dev can still rely on localStorage when host state is unavailable.
    }
  }

  function applyEditorState(editorState: EditorState, options?: { preserveMarkerSelection?: boolean }) {
    applyStoredEditorState(editorState, "", options);
    requestAnimationFrame(() => {
      const viewport = centerPreviewScrollRef.current;
      if (!viewport) return;
      viewport.scrollLeft = editorState.preview?.scrollLeft ?? 0;
      viewport.scrollTop = editorState.preview?.scrollTop ?? 0;
    });
  }

  async function loadProjectFromManifest(manifestPath: string) {
    const { project: loadedProject, sourceStatus: nextSourceStatus } = await projectPersistenceService.loadProject({ manifestPath });
    const normalizedProject = normalizeProject(loadedProject);
    const loadedCompositionSources = getProjectCompositionSources(normalizedProject);

    await storeActiveProjectManifestPath(manifestPath);
    setActiveProjectManifestPath(manifestPath);
    resetProjectHistory();
    replaceProject(normalizedProject, { history: false, syncSources: false, preservePageMode: false });
    applyEditorState(normalizedProject.editorState!);
    setSavedProjectSnapshot(getProjectContentSnapshot(normalizedProject));
    setSavedCompositionSourcesSnapshot(JSON.stringify(loadedCompositionSources));
    setLastSavedAt(Date.now());
    setSourceStatus(nextSourceStatus);
  }

  const reloadProjectFromDisk = useCallback(async (options?: { preserveEditorState?: boolean }) => {
    try {
      const { project: loadedProject } = await projectPersistenceService.loadProject({ manifestPath: activeProjectManifestPathRef.current });
      const normalizedProject = normalizeProject(loadedProject);
      const loadedCompositionSources = getProjectCompositionSources(normalizedProject);
      replaceProject(normalizedProject, { history: false, syncSources: false, preserveEditorState: options?.preserveEditorState });
      const persistedProject = serializeProjectForSave({ ...normalizedProject, compositionSources: loadedCompositionSources });
      const nextSavedProjectSnapshot = getProjectContentSnapshot(persistedProject);
      const nextSavedCompositionSourcesSnapshot = JSON.stringify(persistedProject.compositionSources ?? {});
      setSavedProjectSnapshot(nextSavedProjectSnapshot);
      setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
      savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
      savedCompositionSourcesSnapshotRef.current = nextSavedCompositionSourcesSnapshot;
      setLastSavedAt(Date.now());
      setSourceStatus("Project reloaded from disk.");
      setFileSystemRevision((r) => r + 1);
    } catch (error) {
      notifyError(error, "Unable to reload project.");
    }
  }, [replaceProject, setSourceStatus, notifyError]);

  const reloadProject = useCallback(async () => {
    if (pendingFileOperationsRef.current > 0) return;
    await reloadProjectFromDisk();
  }, [reloadProjectFromDisk]);

  const reloadProjectFromWatcher = useCallback(async (changedPath?: string) => {
    if (pendingFileOperationsRef.current > 0) return;
    if (!isWatchedFileManagerPath(changedPath)) return;
    if (performance.now() < suppressProjectWatcherUntilRef.current) return;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveVersionRef.current++;
    latestAutosaveVersionRef.current++;
    const currentSnapshots = getCurrentProjectSnapshots();
    const savedSnapshots = { project: savedProjectSnapshotRef.current, compositionSources: savedCompositionSourcesSnapshotRef.current };
    const diskSnapshots = await getDiskProjectSnapshots();
    if (snapshotsEqual(diskSnapshots, savedSnapshots)) return;
    if (snapshotsEqual(diskSnapshots, currentSnapshots)) {
      markSnapshotsSaved(currentSnapshots);
      setSourceStatus(changedPath ? `Saved changes detected at ${changedPath}.` : "Saved project changes detected.");
      return;
    }
    await reloadProjectFromDisk({ preserveEditorState: true });
  }, [reloadProjectFromDisk, setSourceStatus]);

  function showExternalChangeConflict(changedPath?: string) {
    externalChangeConflictActiveRef.current = true;
    setSourceStatus(changedPath ? `External change detected at ${changedPath}. Choose whether to save app changes or load disk changes.` : "External project file change detected. Choose whether to save app changes or load disk changes.");
    if (externalChangeToastIdRef.current) toast.dismiss(externalChangeToastIdRef.current);
    externalChangeToastIdRef.current = toast.custom((t) => createElement("div", { className: `flex w-[min(420px,calc(100vw-32px))] flex-col gap-3 rounded-2xl border border-[#2d313b] bg-[#12141a] p-4 text-[#f7f7f8] shadow-2xl shadow-black/50 backdrop-blur ${t.visible ? "animate-[clipper-dialog-in_190ms_cubic-bezier(0.16,1,0.3,1)_forwards]" : "animate-[clipper-dialog-out_120ms_ease-in_forwards]"}` },
      createElement("div", { className: "space-y-1" },
        createElement("div", { className: "text-sm font-semibold text-white" }, "External file change conflict"),
        createElement("div", { className: "text-xs leading-5 text-[#c5c8d2]" }, changedPath ? `${changedPath} changed on disk while app has unsaved changes.` : "Project files changed on disk while app has unsaved changes."),
        createElement("div", { className: "text-xs leading-5 text-[#9b9da7]" }, "Applies to any watched file-manager file. Choose one. Nothing will be overwritten automatically."),
      ),
      createElement("div", { className: "flex justify-end gap-2" },
        createElement("button", { className: "rounded-lg border border-[#2d313b] px-3 py-1.5 text-xs font-medium text-[#c5c8d2] hover:border-[#4a5060] hover:bg-[#20232c]", type: "button", onClick: () => toast.dismiss(t.id) }, "Decide later"),
        createElement("button", { className: "rounded-lg border border-[#2d313b] bg-[#1a1d25] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#4a5060] hover:bg-[#20232c]", type: "button", onClick: () => { externalChangeConflictActiveRef.current = false; toast.dismiss(t.id); void reloadProjectFromDisk(); } }, "Load disk changes"),
        createElement("button", { className: "rounded-lg border border-[#2d313b] bg-[#1a1d25] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#4a5060] hover:bg-[#20232c]", type: "button", onClick: () => { externalChangeConflictActiveRef.current = false; toast.dismiss(t.id); void saveProject(projectRef.current); } }, "Save app over disk"),
      ),
    ), { duration: Infinity });
  }

  function isWatchedFileManagerPath(changedPath?: string) {
    if (!changedPath) return true;
    return changedPath.includes("/file-manager/") || changedPath.startsWith("file-manager/") || changedPath.startsWith("clipper/projects/") && changedPath.includes("/file-manager/");
  }

  const enqueueHistoryOperation = useCallback(<T,>(operation: () => Promise<T> | T): Promise<T> => {
    const promise = operationQueueRef.current.catch(() => {}).then(operation);
    operationQueueRef.current = promise.catch((error) => {
      console.error("History operation failed:", error);
    }).then(() => undefined);
    return promise;
  }, []);

  function beginQueuedFileSystemOperation() {
    pendingFileOperationsRef.current++;
    if (pendingFileOperationsRef.current === 1) {
      lastGoodProjectRef.current = projectRef.current;
      lastGoodSavedSnapshotsRef.current = {
        project: savedProjectSnapshotRef.current,
        compositionSources: savedCompositionSourcesSnapshotRef.current,
      };
      setIsFileSystemBusy(true);
    }
    return fileSystemQueueGenerationRef.current;
  }

  async function finishQueuedFileSystemOperation() {
    pendingFileOperationsRef.current--;
    if (pendingFileOperationsRef.current > 0) return;

    pendingFileOperationsRef.current = 0;
    setIsFileSystemBusy(false);
    lastGoodProjectRef.current = null;
    lastGoodSavedSnapshotsRef.current = null;
    const recoveryPromise = fileSystemRecoveryPromiseRef.current;
    if (recoveryPromise) {
      await recoveryPromise;
      if (fileSystemRecoveryPromiseRef.current === recoveryPromise) fileSystemRecoveryPromiseRef.current = null;
      return;
    }
    if (hasUnsavedProjectChanges()) {
      setSourceStatus("Filesystem operation completed. Autosave paused until reload.");
      setFileSystemRevision((r) => r + 1);
      return;
    }
    await reloadProjectFromDisk();
  }

  function restoreLastGoodProject() {
    if (!lastGoodProjectRef.current) return;
    const restored = lastGoodProjectRef.current;
    const restoredSources = getProjectCompositionSources(restored);
    commitProjectDocument(restored, restoredSources);
    const snapshots = lastGoodSavedSnapshotsRef.current;
    if (!snapshots) return;
    savedProjectSnapshotRef.current = snapshots.project;
    savedCompositionSourcesSnapshotRef.current = snapshots.compositionSources;
    setSavedProjectSnapshot(snapshots.project);
    setSavedCompositionSourcesSnapshot(snapshots.compositionSources);
  }

  function startFileSystemRecovery(cancelImplicitSave = true) {
    fileSystemQueueGenerationRef.current++;
    if (cancelImplicitSave) {
      window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
      implicitFileOperationSaveVersionRef.current++;
    }
    if (!fileSystemRecoveryPromiseRef.current) fileSystemRecoveryPromiseRef.current = reloadProjectFromDisk();
  }

  const enqueueFileSystemOperation = useCallback(<T,>(operation: () => Promise<T> | T, options: { rollbackOnFailure?: boolean; errorMessage?: string } = {}) => {
    const operationGeneration = beginQueuedFileSystemOperation();

    return enqueueHistoryOperation(async () => {
      try {
        if (fileSystemRecoveryPromiseRef.current) await fileSystemRecoveryPromiseRef.current;
        if (operationGeneration !== fileSystemQueueGenerationRef.current) throw new Error("File operation cancelled because an earlier operation failed.");
        return await operation();
      } catch (error) {
        if (options.rollbackOnFailure) restoreLastGoodProject();
        if (options.errorMessage) notifyError(error, options.errorMessage);
        startFileSystemRecovery();
        throw error;
      } finally {
        await finishQueuedFileSystemOperation();
      }
    });
  }, [enqueueHistoryOperation, notifyError, reloadProjectFromDisk]);

  const executeFileManagerCommand = useCallback((command: Command) => {
    return enqueueFileSystemOperation(async () => {
      const previousProject = projectRef.current;
      await command.execute();

      projectHistoryRef.current = {
        past: [...projectHistoryRef.current.past, { project: previousProject, compositionSources: compositionSourcesRef.current, fileCommand: command }].slice(-maxProjectHistoryActions),
        future: [],
      };
      lastProjectHistoryAtRef.current = Date.now();
    });
  }, [enqueueFileSystemOperation]);

  async function openProjectManifest() {
    try {
      const manifestPath = await clipperHost.openProjectManifest();
      if (!manifestPath) return;
      await loadProjectFromManifest(manifestPath);
      notifyOpenSuccess(manifestPath);
    } catch (error) {
      notifyError(error, "Unable to open project.");
    }
  }

  function undoProjectChange() {
    return enqueueHistoryOperation(async () => {
      const previousEntry = projectHistoryRef.current.past.at(-1);
      if (!previousEntry) return;

      if (previousEntry.fileCommand) {
      const stateBeforeUndo = projectRef.current;
      const sourcesBeforeUndo = compositionSourcesRef.current;
        await previousEntry.fileCommand.undo();
        await reloadProject();
        projectHistoryRef.current = {
          past: projectHistoryRef.current.past.slice(0, -1),
          future: [{ project: stateBeforeUndo, compositionSources: sourcesBeforeUndo, fileCommand: previousEntry.fileCommand }, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
        };
        lastProjectHistoryAtRef.current = 0;
        return;
      }

      // Detect file operations before applying undo
      const restoredProject = preserveCurrentPageMode(previousEntry.project);

      projectHistoryRef.current = {
        past: projectHistoryRef.current.past.slice(0, -1),
        future: [{ project: projectRef.current, compositionSources: compositionSourcesRef.current, implicitFileOperation: previousEntry.implicitFileOperation }, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
      };
      lastProjectHistoryAtRef.current = 0;
      commitProjectDocument(restoredProject, previousEntry.compositionSources);
      setTimelineMode(timelineModeRef.current);
      applyEditorState(restoredProject.editorState ?? defaultEditorState, { preserveMarkerSelection: true });
      scheduleAutosave(restoredProject);
    });
  }

  function redoProjectChange() {
    return enqueueHistoryOperation(async () => {
      const nextEntry = projectHistoryRef.current.future[0];
      if (!nextEntry) return;

      if (nextEntry.fileCommand) {
      const stateBeforeRedo = projectRef.current;
      const sourcesBeforeRedo = compositionSourcesRef.current;
        await nextEntry.fileCommand.redo();
        await reloadProject();
        projectHistoryRef.current = {
          past: [...projectHistoryRef.current.past, { project: stateBeforeRedo, compositionSources: sourcesBeforeRedo, fileCommand: nextEntry.fileCommand }].slice(-maxProjectHistoryActions),
          future: projectHistoryRef.current.future.slice(1),
        };
        lastProjectHistoryAtRef.current = 0;
        return;
      }

      // Detect file operations before applying redo
      const restoredProject = preserveCurrentPageMode(nextEntry.project);

      projectHistoryRef.current = {
        past: [...projectHistoryRef.current.past, { project: projectRef.current, compositionSources: compositionSourcesRef.current, implicitFileOperation: nextEntry.implicitFileOperation }].slice(-maxProjectHistoryActions),
        future: projectHistoryRef.current.future.slice(1),
      };
      lastProjectHistoryAtRef.current = 0;
      commitProjectDocument(restoredProject, nextEntry.compositionSources);
      setTimelineMode(timelineModeRef.current);
      applyEditorState(restoredProject.editorState ?? defaultEditorState, { preserveMarkerSelection: true });
      scheduleAutosave(restoredProject);
    });
  }

  async function updateCompositionFromSource(basePart: Part, source: string, options: { syncSource?: boolean; history?: boolean } = {}) {
    const sourceVersion = (sourceUpdateVersionRef.current[basePart.filePath] ?? 0) + 1;
    sourceUpdateVersionRef.current = { ...sourceUpdateVersionRef.current, [basePart.filePath]: sourceVersion };
    const nextSources = { ...compositionSourcesRef.current, [basePart.filePath]: source };
    const compositionId = basePart.compositionId ?? basePart.id;
    let nextPart: Part;
    try {
      nextPart = await compositionFromSource({ ...basePart, id: compositionId }, source, readCompositionSiblingFile(basePart.filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to preview composition source.";
      nextPart = {
        ...basePart,
        id: compositionId,
        compositionError: message,
        background: { ...basePart.background, elements: [] },
        objects: [],
        snapshot: [],
      };
    }
    if (sourceUpdateVersionRef.current[basePart.filePath] !== sourceVersion) return;
    const nextProject = replacePartInProject({ ...projectRef.current, compositionSources: nextSources }, compositionId, (currentPart) => ({
      ...nextPart,
      compositionError: nextPart.compositionError,
      motionMarkers: currentPart.motionMarkers,
      snapshot: currentPart.snapshot,
    }));

    replaceProject(nextProject, { history: options.history, syncSources: options.syncSource !== false });
    setSourceStatus(nextPart.compositionError ? `Preview failed for ${nextPart.filePath}. Source saved.` : `Preview updated from ${nextPart.filePath}.`);
  }

  function readCompositionSiblingFile(sourcePath: string) {
    const sourceDirectory = getDirectoryPath(sourcePath);
    return async (relativePath: string) => {
      const projectPath = relativePath.startsWith("/") || !sourceDirectory || relativePath.startsWith(`${sourceDirectory}/`) ? relativePath : `${sourceDirectory}/${relativePath}`;
      
      const manifestPath = activeProjectManifestPathRef.current;
      if (manifestPath) {
        const rootPath = getDirectoryPath(manifestPath);
        
        let editableRoot = editableRootCacheRef.current[rootPath];
        if (editableRoot === undefined) {
          editableRoot = await getEditableRootPath(rootPath);
          editableRootCacheRef.current[rootPath] = editableRoot;
        }
        
        const fullPath = editableRoot && !projectPath.startsWith(`${editableRoot}/`) ? `${editableRoot}/${projectPath}` : projectPath;
        return clipperHost.readTextFile(fullPath);
      }
      
      return clipperHost.readTextFile(projectPath);
    };
  }

  async function saveProject(projectToSave = projectRef.current, options: { autosaveVersion?: number; errorMessage?: string; throwOnError?: boolean } = {}) {
    const syncedSources = projectToSave === projectRef.current ? compositionSourcesRef.current : getProjectCompositionSources(projectToSave);
    const embeddedProject = normalizeProject({ ...projectToSave, compositionSources: syncedSources });
    const persistedProject = serializeProjectForSave(embeddedProject);
    const projectSnapshot = getProjectContentSnapshot(persistedProject);
    const compositionSourcesSnapshot = JSON.stringify(persistedProject.compositionSources ?? {});
    const autosaveVersion = options.autosaveVersion;
    const shouldApplySaveResult = () => autosaveVersion === undefined || autosaveVersion === latestAutosaveVersionRef.current;

    window.clearTimeout(autosaveBusyReleaseTimeoutRef.current);
    setIsFileSystemBusy(true);
    const write = async () => {
      if (!shouldApplySaveResult()) return;
      if (autosaveVersion !== undefined && externalChangeConflictActiveRef.current) return;
      if (autosaveVersion !== undefined) {
        const diskSnapshots = await getDiskProjectSnapshots();
        const savedSnapshots = { project: savedProjectSnapshotRef.current, compositionSources: savedCompositionSourcesSnapshotRef.current };
        if (snapshotsEqual(diskSnapshots, { project: projectSnapshot, compositionSources: compositionSourcesSnapshot })) {
          markSnapshotsSaved(diskSnapshots);
          return;
        }
        if (!snapshotsEqual(diskSnapshots, savedSnapshots)) {
          showExternalChangeConflict();
          return;
        }
      }
      suppressProjectWatcherUntilRef.current = performance.now() + 2500;
      const result = await projectPersistenceService.saveProject({ manifestPath: activeProjectManifestPathRef.current, project: persistedProject });
      if (!shouldApplySaveResult()) return;
      const nextSavedProjectSnapshot = result.projectSnapshot ? getProjectContentSnapshot(JSON.parse(result.projectSnapshot) as ProjectManifest) : projectSnapshot;
      const nextSavedCompositionSourcesSnapshot = result.compositionSourcesSnapshot || compositionSourcesSnapshot;
      setSavedProjectSnapshot(nextSavedProjectSnapshot);
      setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
      savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
      savedCompositionSourcesSnapshotRef.current = nextSavedCompositionSourcesSnapshot;
      setLastSavedAt(Date.now());
      setSourceStatus(result.sourceStatus);
    };

    try {
      autosaveWriteQueueRef.current = autosaveWriteQueueRef.current.catch(() => {}).then(write);
      await autosaveWriteQueueRef.current;
    } catch (error) {
      if (shouldApplySaveResult()) notifyError(error, options.errorMessage ?? "Unable to autosave project.");
      if (options.throwOnError) throw error;
    } finally {
      if (!shouldApplySaveResult() || pendingFileOperationsRef.current > 0) setIsFileSystemBusy(true);
      else autosaveBusyReleaseTimeoutRef.current = window.setTimeout(() => setIsFileSystemBusy(false), 1000);
    }
  }

  async function saveAllChanges() {
    await saveProject(projectRef.current);
  }

  function scheduleAutosave(projectOverride = projectRef.current, errorMessage = "Unable to autosave project.") {
    const projectSources = projectOverride === projectRef.current ? compositionSourcesRef.current : getProjectCompositionSources(projectOverride);
    const projectToSave = normalizeProject({ ...projectOverride, compositionSources: projectSources });
    const saveVersion = ++latestAutosaveVersionRef.current;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      void saveProject(projectToSave, { autosaveVersion: saveVersion, errorMessage });
    }, 250);
  }

  async function writeEditorTextFile(filePath: string, source: string) {
    window.clearTimeout(autosaveBusyReleaseTimeoutRef.current);
    setIsFileSystemBusy(true);
    try {
      await clipperHost.writeTextFile(filePath, source);
      setLastSavedAt(Date.now());
    } finally {
      if (pendingFileOperationsRef.current > 0) setIsFileSystemBusy(true);
      else autosaveBusyReleaseTimeoutRef.current = window.setTimeout(() => setIsFileSystemBusy(false), 1000);
    }
  }

  function scheduleImplicitFileOperationSave(projectOverride = projectRef.current, errorMessage = "Unable to save file operation.") {
    if (!implicitFileOperationBatchActiveRef.current) {
      beginQueuedFileSystemOperation();
      implicitFileOperationBatchActiveRef.current = true;
    }

    const projectSources = projectOverride === projectRef.current ? compositionSourcesRef.current : getProjectCompositionSources(projectOverride);
    const projectToSave = normalizeProject({ ...projectOverride, compositionSources: projectSources });

    const operationGeneration = fileSystemQueueGenerationRef.current;
    const saveVersion = ++latestAutosaveVersionRef.current;
    implicitFileOperationSaveVersionRef.current++;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      enqueueHistoryOperation(async () => {
        try {
          if (fileSystemRecoveryPromiseRef.current) await fileSystemRecoveryPromiseRef.current;
          if (operationGeneration !== fileSystemQueueGenerationRef.current) throw new Error("File operation save cancelled because an earlier operation failed.");
          await saveProject(projectToSave, { autosaveVersion: saveVersion, errorMessage, throwOnError: true });
          if (saveVersion !== latestAutosaveVersionRef.current) return;
          lastGoodProjectRef.current = projectRef.current;
        } catch (error) {
          restoreLastGoodProject();
          startFileSystemRecovery(false);
          throw error;
        } finally {
          implicitFileOperationBatchActiveRef.current = false;
          await finishQueuedFileSystemOperation();
        }
      });
    }, 150);
  }

  function implicitFileOperation<T extends unknown[]>(operation: (...args: T) => Promise<void> | void) {
    return (...args: T) => {
      if (!implicitFileOperationBatchActiveRef.current) {
        beginQueuedFileSystemOperation();
        implicitFileOperationBatchActiveRef.current = true;
      }
      implicitFileOperationActiveCountRef.current++;

      let opResult: Promise<void> | void;
      try {
        opResult = operation(...args);
        markLastHistoryEntryAsImplicitFileOperation();
      } catch (error) {
        implicitFileOperationActiveCountRef.current = Math.max(0, implicitFileOperationActiveCountRef.current - 1);
        restoreLastGoodProject();
        startFileSystemRecovery();
        notifyError(error, "Operation failed. Reverting to last good state.");
        implicitFileOperationBatchActiveRef.current = false;
        void finishQueuedFileSystemOperation();
        return;
      }

      Promise.resolve(opResult).then(() => {
        implicitFileOperationActiveCountRef.current = Math.max(0, implicitFileOperationActiveCountRef.current - 1);
        if (implicitFileOperationActiveCountRef.current === 0) scheduleImplicitFileOperationSave();
      }).catch((error) => {
        implicitFileOperationActiveCountRef.current = Math.max(0, implicitFileOperationActiveCountRef.current - 1);
        window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
        implicitFileOperationSaveVersionRef.current++;
        restoreLastGoodProject();
        startFileSystemRecovery();
        notifyError(error, "Operation failed. Reverting to last good state.");
        implicitFileOperationBatchActiveRef.current = false;
        void finishQueuedFileSystemOperation();
      });
    };
  }

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    compositionSourcesRef.current = compositionSources;
  }, [compositionSources]);

  useEffect(() => {
    activeProjectManifestPathRef.current = activeProjectManifestPath;
  }, [activeProjectManifestPath]);

  useEffect(() => {
    savedProjectSnapshotRef.current = savedProjectSnapshot;
  }, [savedProjectSnapshot]);

  useEffect(() => {
    savedCompositionSourcesSnapshotRef.current = savedCompositionSourcesSnapshot;
  }, [savedCompositionSourcesSnapshot]);

  useEffect(() => () => {
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    window.clearTimeout(autosaveBusyReleaseTimeoutRef.current);
  }, []);

  return {
    activeProjectManifestPath,
    activeProjectManifestPathRef,
    compositionSources,
    compositionSourcesRef,
    executeFileManagerCommand,
    fileSystemRevision,
    implicitFileOperation,
    isFileSystemBusy,
    lastSavedAt,
    openProjectManifest,
    project,
    projectRef,
    replaceProject,
    redoProjectChange,
    reloadProject,
    reloadProjectFromWatcher,
    saveAllChanges,
    savedCompositionSourcesSnapshot,
    savedProjectSnapshot,
    scheduleImplicitFileOperationSave,
    setCompositionSources,
    syncCompositionSourcesFromProject,
    undoProjectChange,
    updateCompositionFromSource,
    updateEditorState,
    updateProject,
    watchedProjectDirectory,
    writeEditorTextFile,
  };
}
