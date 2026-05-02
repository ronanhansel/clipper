import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { clipperHost } from "../clipperHost";
import toast from "react-hot-toast";
import { maxProjectHistoryActions, projectHistoryCoalesceMs } from "../config";
import { getDirectoryPath } from "../features/file-manager/fileManagerPaths";
import { projectPersistenceService } from "../services/projectPersistenceService";
import { getProjectContentSnapshot, useProjectDocumentState } from "../state/projectStore";
import type { Mode, ProjectUpdater } from "../types";
import { compositionFromSource } from "../../core/compositionSource";
import { defaultTimelineMode, normalizeProject, replacePartInProject, serializeProjectForSave } from "../../core/project";
import type { EditorState, Part, ProjectManifest, TimelineMode } from "../../core/types";
import { clipperContainerPath, writeStoredActiveProjectManifestPath } from "./activeProjectManifest";
import { getProjectCompositionSources, getSyncedCompositionSources } from "./projectSources";
import type { Command } from "../features/file-manager/operations/Command";

type ProjectHistoryEntry = { project: ProjectManifest; implicitFileOperation?: boolean; fileCommand?: Command };
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
  openProjectManifest: () => Promise<void>;
  project: ProjectManifest;
  projectRef: MutableRefObject<ProjectManifest>;
  replaceProject: (nextProject: ProjectManifest, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  redoProjectChange: () => Promise<void> | void;
  reloadProject: () => Promise<void>;
  saveAllChanges: () => Promise<void>;
  saveAllChangesRef: MutableRefObject<(() => Promise<void>) | null>;
  saveProject: (projectToSave?: ProjectManifest) => Promise<void>;
  savedCompositionSourcesSnapshot: string;
  savedProjectSnapshot: string;
  scheduleImplicitFileOperationSave: (projectOverride?: ProjectManifest, errorMessage?: string) => void;
  setCompositionSources: (sources: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  syncCompositionSourcesFromProject: (nextProject: ProjectManifest) => void;
  undoProjectChange: () => Promise<void> | void;
  updateCompositionFromSource: (basePart: Part, source: string, options?: { syncSource?: boolean; history?: boolean }) => Promise<void>;
  updateEditorState: (updater: (state: EditorState) => EditorState, options?: { history?: boolean; coalesceHistory?: boolean }) => void;
  updateProject: (updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) => void;
  watchedProjectDirectory: string;
};

export type UseProjectDocumentControllerInput = {
  applyStoredEditorState: (editorState: EditorState, fallbackSceneId: string) => void;
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
  const { project, setProject, savedProjectSnapshot, setSavedProjectSnapshot, compositionSources, setCompositionSources, savedCompositionSourcesSnapshot, setSavedCompositionSourcesSnapshot } = useProjectDocumentState();
  const [activeProjectManifestPath, setActiveProjectManifestPath] = useState(initialProjectManifestPath);
  const [fileSystemRevision, setFileSystemRevision] = useState(0);
  const [isFileSystemBusy, setIsFileSystemBusy] = useState(false);
  const pendingFileOperationsRef = useRef(0);
  const lastGoodProjectRef = useRef<ProjectManifest | null>(null);
  const lastGoodSavedSnapshotsRef = useRef<SavedSnapshots | null>(null);
  const projectRef = useRef(project);
  const compositionSourcesRef = useRef(compositionSources);
  const activeProjectManifestPathRef = useRef(activeProjectManifestPath);
  const savedProjectSnapshotRef = useRef(savedProjectSnapshot);
  const savedCompositionSourcesSnapshotRef = useRef(savedCompositionSourcesSnapshot);
  const projectHistoryRef = useRef<{ past: ProjectHistoryEntry[]; future: ProjectHistoryEntry[] }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const fileSystemQueueGenerationRef = useRef(0);
  const fileSystemRecoveryPromiseRef = useRef<Promise<void> | null>(null);
  const implicitFileOperationBatchActiveRef = useRef(false);
  const implicitFileOperationActiveCountRef = useRef(0);
  const implicitFileOperationSaveVersionRef = useRef(0);
  const implicitFileOperationSaveTimeoutRef = useRef(0);
  const saveAllChangesRef = useRef<(() => Promise<void>) | null>(null);
  const watchedProjectDirectory = getDirectoryPath(activeProjectManifestPath);

  const replaceProject = useCallback((nextProject: ProjectManifest, options: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean } = {}) => {
    let normalizedProject = normalizeProject(nextProject);
    const currentProject = projectRef.current;
    let nextCompositionSources = normalizedProject.compositionSources ?? getProjectCompositionSources(normalizedProject);
    if (options.syncSources !== false) {
      nextCompositionSources = getSyncedCompositionSources(normalizedProject, currentProject, compositionSourcesRef.current);
      normalizedProject = normalizeProject({ ...normalizedProject, compositionSources: nextCompositionSources });
    } else {
      nextCompositionSources = compositionSourcesRef.current;
    }
    const sortedSources = (sources: Record<string, string> | undefined) => sources ? Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) : undefined;
    const projectForCompare = (p: ProjectManifest) => ({ ...p, compositionSources: sortedSources(p.compositionSources) });
    if (JSON.stringify(projectForCompare(normalizedProject)) === JSON.stringify(projectForCompare(currentProject))) return;

    if (options.history !== false) {
      const now = Date.now();
      const isCoalescedAction = options.coalesceHistory !== false && now - lastProjectHistoryAtRef.current < projectHistoryCoalesceMs && projectHistoryRef.current.past.length > 0;
      projectHistoryRef.current = {
        past: isCoalescedAction ? projectHistoryRef.current.past : [...projectHistoryRef.current.past, { project: currentProject }].slice(-maxProjectHistoryActions),
        future: [],
      };
      lastProjectHistoryAtRef.current = now;
    }

    projectRef.current = normalizedProject;
    setProject(normalizedProject);
    setTimelineMode(normalizedProject.editorState?.timelineMode ?? defaultTimelineMode);
    compositionSourcesRef.current = nextCompositionSources;
    setCompositionSources(nextCompositionSources);
  }, []);

  function updateEditorState(updater: (state: EditorState) => EditorState, options: { history?: boolean; coalesceHistory?: boolean } = {}) {
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

    projectRef.current = nextProject;
    setProject(nextProject);
  }

  function updateProject(updater: ProjectUpdater, options?: { history?: boolean; syncSources?: boolean; coalesceHistory?: boolean }) {
    const nextProject = typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
  }

  function getSavedProjectSnapshotProject() {
    try {
      return JSON.parse(savedProjectSnapshotRef.current) as ProjectManifest;
    } catch {
      return undefined;
    }
  }

  function syncCompositionSourcesFromProject(nextProject: ProjectManifest) {
    const nextSources = getProjectCompositionSources(nextProject);
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
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

  function applyEditorState(editorState: EditorState) {
    applyStoredEditorState(editorState, "");
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
    const activeManifestPath = clipperContainerPath(manifestPath);
    const loadedCompositionSources = getProjectCompositionSources(normalizedProject);

    await storeActiveProjectManifestPath(activeManifestPath);
    setActiveProjectManifestPath(activeManifestPath);
    resetProjectHistory();
    replaceProject(normalizedProject, { history: false, syncSources: false });
    applyEditorState(normalizedProject.editorState!);
    setCompositionSources(loadedCompositionSources);
    setSavedProjectSnapshot(getProjectContentSnapshot(normalizedProject));
    setSavedCompositionSourcesSnapshot(JSON.stringify(loadedCompositionSources));
    setSourceStatus(manifestPath === activeManifestPath ? nextSourceStatus : `Migrated ${manifestPath} to ${activeManifestPath}. Save to write the .clipper container.`);
  }

  const reloadProjectFromDisk = useCallback(async () => {
    try {
      const { project: loadedProject } = await projectPersistenceService.loadProject({ manifestPath: activeProjectManifestPathRef.current });
      const normalizedProject = normalizeProject(loadedProject);
      replaceProject(normalizedProject, { history: false, syncSources: false });
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
    await reloadProjectFromDisk();
  }

  function restoreLastGoodProject() {
    if (!lastGoodProjectRef.current) return;
    const restored = lastGoodProjectRef.current;
    projectRef.current = restored;
    setProject(restored);
    syncCompositionSourcesFromProject(restored);
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
        past: [...projectHistoryRef.current.past, { project: previousProject, fileCommand: command }].slice(-maxProjectHistoryActions),
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
        await previousEntry.fileCommand.undo();
        await reloadProject();
        projectHistoryRef.current = {
          past: projectHistoryRef.current.past.slice(0, -1),
          future: [{ project: stateBeforeUndo, fileCommand: previousEntry.fileCommand }, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
        };
        lastProjectHistoryAtRef.current = 0;
        return;
      }

      // Detect file operations before applying undo
      const restoredProject = preserveCurrentPageMode(previousEntry.project);

      projectHistoryRef.current = {
        past: projectHistoryRef.current.past.slice(0, -1),
        future: [{ project: projectRef.current, implicitFileOperation: previousEntry.implicitFileOperation }, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
      };
      lastProjectHistoryAtRef.current = 0;
      projectRef.current = restoredProject;
      setProject(restoredProject);
      setTimelineMode(timelineModeRef.current);
      syncCompositionSourcesFromProject(restoredProject);
      if (previousEntry.implicitFileOperation) scheduleImplicitFileOperationSave(restoredProject);
    });
  }

  function redoProjectChange() {
    return enqueueHistoryOperation(async () => {
      const nextEntry = projectHistoryRef.current.future[0];
      if (!nextEntry) return;

      if (nextEntry.fileCommand) {
        const stateBeforeRedo = projectRef.current;
        await nextEntry.fileCommand.redo();
        await reloadProject();
        projectHistoryRef.current = {
          past: [...projectHistoryRef.current.past, { project: stateBeforeRedo, fileCommand: nextEntry.fileCommand }].slice(-maxProjectHistoryActions),
          future: projectHistoryRef.current.future.slice(1),
        };
        lastProjectHistoryAtRef.current = 0;
        return;
      }

      // Detect file operations before applying redo
      const restoredProject = preserveCurrentPageMode(nextEntry.project);

      projectHistoryRef.current = {
        past: [...projectHistoryRef.current.past, { project: projectRef.current, implicitFileOperation: nextEntry.implicitFileOperation }].slice(-maxProjectHistoryActions),
        future: projectHistoryRef.current.future.slice(1),
      };
      lastProjectHistoryAtRef.current = 0;
      projectRef.current = restoredProject;
      setProject(restoredProject);
      setTimelineMode(timelineModeRef.current);
      syncCompositionSourcesFromProject(restoredProject);
      if (nextEntry.implicitFileOperation) scheduleImplicitFileOperationSave(restoredProject);
    });
  }

  async function updateCompositionFromSource(basePart: Part, source: string, options: { syncSource?: boolean; history?: boolean } = {}) {
    const nextSources = { ...compositionSourcesRef.current, [basePart.filePath]: source };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    const compositionId = basePart.compositionId ?? basePart.id;
    const nextPart = await compositionFromSource({ ...basePart, id: compositionId }, source);
    const nextProject = replacePartInProject({ ...projectRef.current, compositionSources: nextSources }, compositionId, (currentPart) => ({
      ...nextPart,
      motionMarkers: currentPart.motionMarkers,
      snapshot: currentPart.snapshot,
    }));

    replaceProject(nextProject, { history: options.history, syncSources: options.syncSource !== false });
    setSourceStatus(`Preview updated from ${nextPart.filePath}.`);
  }

  async function saveProject(projectToSave = projectRef.current) {
    const syncedSources = getSyncedCompositionSources(projectToSave, getSavedProjectSnapshotProject(), compositionSourcesRef.current);
    if (syncedSources !== compositionSourcesRef.current) {
      compositionSourcesRef.current = syncedSources;
      setCompositionSources(syncedSources);
    }
    const embeddedProject = normalizeProject({ ...projectToSave, compositionSources: syncedSources });
    const persistedProject = serializeProjectForSave(embeddedProject);
    const projectSnapshot = getProjectContentSnapshot(persistedProject);
    const compositionSourcesSnapshot = JSON.stringify(persistedProject.compositionSources ?? {});

    try {
      const result = await projectPersistenceService.saveProject({ manifestPath: activeProjectManifestPathRef.current, project: persistedProject });
      const nextSavedProjectSnapshot = result.projectSnapshot ? getProjectContentSnapshot(JSON.parse(result.projectSnapshot) as ProjectManifest) : projectSnapshot;
      const nextSavedCompositionSourcesSnapshot = result.compositionSourcesSnapshot || compositionSourcesSnapshot;
      setSavedProjectSnapshot(nextSavedProjectSnapshot);
      setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
      savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
      savedCompositionSourcesSnapshotRef.current = nextSavedCompositionSourcesSnapshot;
      setSourceStatus(result.sourceStatus);
    } catch (error) {
      notifyError(error, "Unable to save project.");
    }
  }

  async function saveAllChanges() {
    await saveProject(projectRef.current);
  }

  function scheduleImplicitFileOperationSave(projectOverride = projectRef.current, errorMessage = "Unable to save file operation.") {
    if (!implicitFileOperationBatchActiveRef.current) {
      beginQueuedFileSystemOperation();
      implicitFileOperationBatchActiveRef.current = true;
    }

    const projectSources = projectOverride === projectRef.current ? compositionSourcesRef.current : getProjectCompositionSources(projectOverride);
    const projectToSave = normalizeProject({ ...projectOverride, compositionSources: projectSources });
    const projectSnapshot = getProjectContentSnapshot(projectToSave);
    const compositionSourcesSnapshot = JSON.stringify(projectToSave.compositionSources ?? {});
    setSavedProjectSnapshot(projectSnapshot);
    setSavedCompositionSourcesSnapshot(compositionSourcesSnapshot);
    savedProjectSnapshotRef.current = projectSnapshot;
    savedCompositionSourcesSnapshotRef.current = compositionSourcesSnapshot;

    const operationGeneration = fileSystemQueueGenerationRef.current;
    const saveVersion = ++implicitFileOperationSaveVersionRef.current;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      enqueueHistoryOperation(async () => {
        try {
          if (fileSystemRecoveryPromiseRef.current) await fileSystemRecoveryPromiseRef.current;
          if (operationGeneration !== fileSystemQueueGenerationRef.current) throw new Error("File operation save cancelled because an earlier operation failed.");
          const result = await projectPersistenceService.saveProject({ manifestPath: activeProjectManifestPathRef.current, project: projectToSave });
          if (saveVersion !== implicitFileOperationSaveVersionRef.current) return;
          setSourceStatus(result.sourceStatus);
          lastGoodProjectRef.current = projectRef.current;
        } catch (error) {
          if (saveVersion !== implicitFileOperationSaveVersionRef.current) return;
          notifyError(error, errorMessage);
          restoreLastGoodProject();
          startFileSystemRecovery(false);
          throw error;
        } finally {
          if (saveVersion !== implicitFileOperationSaveVersionRef.current) return;
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

  useEffect(() => {
    saveAllChangesRef.current = saveAllChanges;
  });

  useEffect(() => () => {
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
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
    openProjectManifest,
    project,
    projectRef,
    replaceProject,
    redoProjectChange,
    reloadProject,
    saveAllChanges,
    saveAllChangesRef,
    saveProject,
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
  };
}
