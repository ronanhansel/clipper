import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { maxProjectHistoryActions, projectHistoryCoalesceMs } from "../config";
import { projectPersistenceService } from "../services/projectPersistenceService";
import {
  getProjectContentSnapshot,
  useProjectDocumentState,
} from "../state/projectStore";
import type { Mode, ProjectUpdater } from "../types";
import { compositionFromSource } from "../../core/compositionSource";
import {
  defaultTimelineMode,
  normalizeProject,
  replacePartInProject,
  serializeProjectForSave,
} from "../../core/project";
import type {
  EditorState,
  Part,
  ProjectManifest,
  TimelineMode,
} from "../../core/types";
import type { Command } from "../features/file-manager/operations/Command";
import { writeStoredActiveProjectManifestPath } from "./activeProjectManifest";
import {
  getProjectCompositionSources,
  getSyncedCompositionSources,
} from "./projectSources";

type ProjectHistoryEntry = {
  project: ProjectManifest;
  compositionSources: Record<string, string>;
  historyGroup?: string;
  implicitFileOperation?: boolean;
  fileCommand?: Command;
};

export type ProjectDocumentController = {
  activeProjectManifestPath: string;
  activeProjectManifestPathRef: MutableRefObject<string>;
  compositionSources: Record<string, string>;
  compositionSourcesRef: MutableRefObject<Record<string, string>>;
  executeBinCommand: (command: Command) => Promise<void>;
  fileSystemRevision: number;
  implicitFileOperation: <T extends unknown[]>(
    operation: (...args: T) => Promise<void> | void,
  ) => (...args: T) => void;
  isFileSystemBusy: boolean;
  lastSavedAt: number | null;
  openProjectManifest: () => Promise<void>;
  project: ProjectManifest;
  projectRef: MutableRefObject<ProjectManifest>;
  replaceProject: (
    nextProject: ProjectManifest,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
    },
  ) => void;
  redoProjectChange: () => Promise<void> | void;
  requestUiPersist: () => void;
  saveAllChanges: () => Promise<void>;
  savedCompositionSourcesSnapshot: string;
  savedProjectSnapshot: string;
  scheduleImplicitFileOperationSave: (
    projectOverride?: ProjectManifest,
    errorMessage?: string,
  ) => void;
  setCompositionSources: (
    sources:
      | Record<string, string>
      | ((current: Record<string, string>) => Record<string, string>),
  ) => void;
  syncCompositionSourcesFromProject: (nextProject: ProjectManifest) => void;
  undoProjectChange: () => Promise<void> | void;
  updateCompositionFromSource: (
    basePart: Part,
    source: string,
    options?: { syncSource?: boolean; history?: boolean },
  ) => Promise<void>;
  updateEditorState: (
    updater: (state: EditorState) => EditorState,
    options?: {
      history?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
      autosave?: boolean;
    },
  ) => void;
  updateProject: (
    updater: ProjectUpdater,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
    },
  ) => void;
  writeEditorTextFile: (filePath: string, source: string) => Promise<void>;
};

export type UseProjectDocumentControllerInput = {
  applyStoredEditorState: (
    editorState: EditorState,
    fallbackSceneId: string,
    options?: { preserveMarkerSelection?: boolean },
  ) => void;
  centerPreviewScrollRef: RefObject<HTMLDivElement | null>;
  defaultEditorState: EditorState;
  initialProjectManifestPath: string;
  modeRef: MutableRefObject<Mode>;
  notifyError: (error: unknown, fallback: string) => void;
  notifyOpenSuccess: (path: string) => void;
  setSourceStatus: (status: string) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  timelineModeRef: MutableRefObject<TimelineMode>;
  uiPersistRef: MutableRefObject<{
    selectedComposeObjectIds: string[];
  }>;
};

export function useProjectDocumentController({
  applyStoredEditorState,
  centerPreviewScrollRef,
  defaultEditorState,
  initialProjectManifestPath,
  modeRef,
  notifyError,
  notifyOpenSuccess,
  setSourceStatus,
  setTimelineMode,
  timelineModeRef,
  uiPersistRef,
}: UseProjectDocumentControllerInput): ProjectDocumentController {
  const {
    project,
    setProjectDocument,
    savedProjectSnapshot,
    setSavedProjectSnapshot,
    compositionSources,
    setCompositionSources,
    savedCompositionSourcesSnapshot,
    setSavedCompositionSourcesSnapshot,
  } = useProjectDocumentState();
  const [activeProjectManifestPath, setActiveProjectManifestPath] = useState(
    initialProjectManifestPath,
  );
  const [fileSystemRevision, setFileSystemRevision] = useState(0);
  const [isFileSystemBusy, setIsFileSystemBusy] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(() =>
    Date.now(),
  );

  const projectRef = useRef(project);
  const compositionSourcesRef = useRef(compositionSources);
  const activeProjectManifestPathRef = useRef(activeProjectManifestPath);
  const savedProjectSnapshotRef = useRef(savedProjectSnapshot);
  const savedCompositionSourcesSnapshotRef = useRef(
    savedCompositionSourcesSnapshot,
  );
  const projectHistoryRef = useRef<{
    past: ProjectHistoryEntry[];
    future: ProjectHistoryEntry[];
  }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autosaveWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const autosaveTimeoutRef = useRef(0);
  const implicitFileOperationSaveTimeoutRef = useRef(0);
  const latestAutosaveVersionRef = useRef(0);
  const pendingFileOperationsRef = useRef(0);
  const sourceUpdateVersionRef = useRef<Record<string, number>>({});
  const projectDocumentVersionRef = useRef(0);
  const implicitFileOperationBatchActiveRef = useRef(false);
  const implicitFileOperationActiveCountRef = useRef(0);

  function commitProjectDocument(
    nextProject: ProjectManifest,
    nextSources: Record<string, string>,
  ) {
    projectDocumentVersionRef.current++;
    projectRef.current = nextProject;
    compositionSourcesRef.current = nextSources;
    setProjectDocument(nextProject, nextSources);
  }

  const replaceProject = useCallback(
    (
      nextProject: ProjectManifest,
      options: {
        history?: boolean;
        syncSources?: boolean;
        coalesceHistory?: boolean;
        historyGroup?: string;
        preservePageMode?: boolean;
        preserveEditorState?: boolean;
      } = {},
    ) => {
      const currentProject = projectRef.current;
      let nextCompositionSources =
        nextProject.compositionSources ??
        getProjectCompositionSources(nextProject);
      let normalizedProject: ProjectManifest;
      if (options.syncSources !== false) {
        nextCompositionSources = getSyncedCompositionSources(
          nextProject,
          currentProject,
          compositionSourcesRef.current,
        );
      }
      normalizedProject = normalizeProject({
        ...nextProject,
        compositionSources: nextCompositionSources,
      });
      if (options.preserveEditorState) {
        normalizedProject = normalizeProject({
          ...normalizedProject,
          editorState: projectRef.current.editorState ?? defaultEditorState,
        });
      } else if (options.preservePageMode !== false) {
        const currentEditorState =
          projectRef.current.editorState ?? defaultEditorState;
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
      if (JSON.stringify(normalizedProject) === JSON.stringify(currentProject))
        return;

      if (options.history !== false) {
        const now = Date.now();
        const isCoalescedAction =
          options.coalesceHistory !== false &&
          options.historyGroup !== undefined &&
          now - lastProjectHistoryAtRef.current < projectHistoryCoalesceMs &&
          projectHistoryRef.current.past.at(-1)?.historyGroup ===
            options.historyGroup;
        projectHistoryRef.current = {
          past: isCoalescedAction
            ? projectHistoryRef.current.past
            : [
                ...projectHistoryRef.current.past,
                {
                  project: currentProject,
                  compositionSources: compositionSourcesRef.current,
                  historyGroup: options.historyGroup,
                },
              ].slice(-maxProjectHistoryActions),
          future: [],
        };
        lastProjectHistoryAtRef.current = now;
      }

      commitProjectDocument(normalizedProject, nextCompositionSources);
      setTimelineMode(
        normalizedProject.editorState?.timelineMode ?? defaultTimelineMode,
      );
      scheduleAutosave(normalizedProject);
    },
    [],
  );

  function updateEditorState(
    updater: (state: EditorState) => EditorState,
    options: {
      history?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
      autosave?: boolean;
    } = {},
  ) {
    const current = projectRef.current;
    const nextProject = normalizeProject({
      ...current,
      editorState: updater(current.editorState ?? defaultEditorState),
    });
    if (
      JSON.stringify(nextProject.editorState) ===
      JSON.stringify(current.editorState)
    )
      return;
    if (options.history) {
      replaceProject(nextProject, {
        history: true,
        syncSources: false,
        coalesceHistory: options.coalesceHistory,
        historyGroup: options.historyGroup,
      });
      return;
    }

    commitProjectDocument(nextProject, compositionSourcesRef.current);
    if (options.autosave === false) return;
    scheduleAutosave(nextProject);
  }

  function updateProject(
    updater: ProjectUpdater,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
    },
  ) {
    const nextProject =
      typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
  }

  function syncCompositionSourcesFromProject(nextProject: ProjectManifest) {
    const nextSources = getProjectCompositionSources(nextProject);
    commitProjectDocument(
      normalizeProject({ ...nextProject, compositionSources: nextSources }),
      nextSources,
    );
  }

  function getCurrentProjectSnapshots(projectToCheck = projectRef.current): {
    project: string;
    compositionSources: string;
  } {
    const persistedProject = serializeProjectForSave({
      ...projectToCheck,
      compositionSources: compositionSourcesRef.current,
    });
    return {
      project: getProjectContentSnapshot(persistedProject),
      compositionSources: JSON.stringify(
        persistedProject.compositionSources ?? {},
      ),
    };
  }

  function resetProjectHistory() {
    projectHistoryRef.current = { past: [], future: [] };
    lastProjectHistoryAtRef.current = 0;
  }

  function preserveCurrentPageMode(historyProject: ProjectManifest) {
    const currentEditorState =
      projectRef.current.editorState ?? defaultEditorState;
    return normalizeProject({
      ...historyProject,
      editorState: {
        ...(historyProject.editorState ?? currentEditorState),
        mode: modeRef.current,
        timelineMode: timelineModeRef.current,
      },
    });
  }

  async function storeActiveProjectManifestPath(projectPath: string) {
    try {
      await writeStoredActiveProjectManifestPath(projectPath);
    } catch {
      // Browser/dev can still rely on localStorage when host state is unavailable.
    }
  }

  function applyEditorState(
    editorState: EditorState,
    options?: { preserveMarkerSelection?: boolean },
  ) {
    applyStoredEditorState(editorState, "", options);
    requestAnimationFrame(() => {
      const viewport = centerPreviewScrollRef.current;
      if (!viewport) return;
      viewport.scrollLeft = editorState.preview?.scrollLeft ?? 0;
      viewport.scrollTop = editorState.preview?.scrollTop ?? 0;
    });
  }

  async function loadProjectFromPath(projectPath: string) {
    const { project: loadedProject, sourceStatus: nextSourceStatus } =
      await projectPersistenceService.loadProject({ projectPath });
    const normalizedProject = normalizeProject(loadedProject);
    const loadedCompositionSources =
      getProjectCompositionSources(normalizedProject);
    const persistedProject = serializeProjectForSave({
      ...normalizedProject,
      compositionSources: loadedCompositionSources,
    });
    const nextSavedProjectSnapshot =
      getProjectContentSnapshot(persistedProject);
    const nextSavedCompositionSourcesSnapshot = JSON.stringify(
      persistedProject.compositionSources ?? {},
    );

    await storeActiveProjectManifestPath(projectPath);
    setActiveProjectManifestPath(projectPath);
    resetProjectHistory();
    replaceProject(normalizedProject, {
      history: false,
      syncSources: false,
      preservePageMode: false,
    });
    applyEditorState(normalizedProject.editorState ?? defaultEditorState);
    setSavedProjectSnapshot(nextSavedProjectSnapshot);
    setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
    savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
    savedCompositionSourcesSnapshotRef.current =
      nextSavedCompositionSourcesSnapshot;
    setLastSavedAt(Date.now());
    setSourceStatus(nextSourceStatus);
  }

  const enqueueHistoryOperation = useCallback(
    <T>(operation: () => Promise<T> | T): Promise<T> => {
      const promise = operationQueueRef.current.catch(() => {}).then(operation);
      operationQueueRef.current = promise
        .catch((error) => {
          console.error("History operation failed:", error);
        })
        .then(() => undefined);
      return promise;
    },
    [],
  );

  function beginQueuedFileSystemOperation() {
    pendingFileOperationsRef.current++;
    if (pendingFileOperationsRef.current === 1) setIsFileSystemBusy(true);
    return Date.now();
  }

  async function finishQueuedFileSystemOperation() {
    pendingFileOperationsRef.current--;
    if (pendingFileOperationsRef.current > 0) return;
    pendingFileOperationsRef.current = 0;
    setIsFileSystemBusy(false);
    setFileSystemRevision((r) => r + 1);
    scheduleAutosave(projectRef.current);
  }

  const enqueueFileSystemOperation = useCallback(
    <T>(
      operation: () => Promise<T> | T,
      options: { rollbackOnFailure?: boolean; errorMessage?: string } = {},
    ) => {
      beginQueuedFileSystemOperation();
      return enqueueHistoryOperation(async () => {
        try {
          return await operation();
        } catch (error) {
          if (options.errorMessage) notifyError(error, options.errorMessage);
          throw error;
        } finally {
          await finishQueuedFileSystemOperation();
        }
      });
    },
    [enqueueHistoryOperation, notifyError],
  );

  const executeBinCommand = useCallback(
    (command: Command) => {
      return enqueueFileSystemOperation(async () => {
        const previousProject = projectRef.current;
        await command.execute();
        projectHistoryRef.current = {
          past: [
            ...projectHistoryRef.current.past,
            {
              project: previousProject,
              compositionSources: compositionSourcesRef.current,
              fileCommand: command,
            },
          ].slice(-maxProjectHistoryActions),
          future: [],
        };
        lastProjectHistoryAtRef.current = Date.now();
      });
    },
    [enqueueFileSystemOperation],
  );

  async function openProjectManifest() {
    try {
      const projectPath = await window.clipper?.openProjectManifest?.();
      if (!projectPath) return;
      await loadProjectFromPath(projectPath);
      notifyOpenSuccess(projectPath);
    } catch (error) {
      notifyError(error, "Unable to open project.");
    }
  }

  function undoProjectChange() {
    return enqueueHistoryOperation(async () => {
      const previousEntry = projectHistoryRef.current.past.at(-1);
      if (!previousEntry) return;
      if (previousEntry.fileCommand) await previousEntry.fileCommand.undo();
      const restoredProject = preserveCurrentPageMode(previousEntry.project);
      projectHistoryRef.current = {
        past: projectHistoryRef.current.past.slice(0, -1),
        future: [
          {
            project: projectRef.current,
            compositionSources: compositionSourcesRef.current,
            implicitFileOperation: previousEntry.implicitFileOperation,
            fileCommand: previousEntry.fileCommand,
          },
          ...projectHistoryRef.current.future,
        ].slice(0, maxProjectHistoryActions),
      };
      lastProjectHistoryAtRef.current = 0;
      commitProjectDocument(restoredProject, previousEntry.compositionSources);
      setTimelineMode(timelineModeRef.current);
      applyEditorState(restoredProject.editorState ?? defaultEditorState, {
        preserveMarkerSelection: true,
      });
      scheduleAutosave(restoredProject);
    });
  }

  function redoProjectChange() {
    return enqueueHistoryOperation(async () => {
      const nextEntry = projectHistoryRef.current.future[0];
      if (!nextEntry) return;
      if (nextEntry.fileCommand) await nextEntry.fileCommand.redo();
      const restoredProject = preserveCurrentPageMode(nextEntry.project);
      projectHistoryRef.current = {
        past: [
          ...projectHistoryRef.current.past,
          {
            project: projectRef.current,
            compositionSources: compositionSourcesRef.current,
            implicitFileOperation: nextEntry.implicitFileOperation,
            fileCommand: nextEntry.fileCommand,
          },
        ].slice(-maxProjectHistoryActions),
        future: projectHistoryRef.current.future.slice(1),
      };
      lastProjectHistoryAtRef.current = 0;
      commitProjectDocument(restoredProject, nextEntry.compositionSources);
      setTimelineMode(timelineModeRef.current);
      applyEditorState(restoredProject.editorState ?? defaultEditorState, {
        preserveMarkerSelection: true,
      });
      scheduleAutosave(restoredProject);
    });
  }

  async function updateCompositionFromSource(
    basePart: Part,
    source: string,
    options: { syncSource?: boolean; history?: boolean } = {},
  ) {
    const sourceVersion =
      (sourceUpdateVersionRef.current[basePart.filePath] ?? 0) + 1;
    const sourceBaseProjectVersion = projectDocumentVersionRef.current;
    sourceUpdateVersionRef.current = {
      ...sourceUpdateVersionRef.current,
      [basePart.filePath]: sourceVersion,
    };
    const compositionId = basePart.compositionId ?? basePart.id;
    let nextPart: Part;
    let parseError: string | undefined;
    try {
      nextPart = await compositionFromSource(
        { ...basePart, id: compositionId },
        source,
        readCompositionSiblingFile(basePart.filePath),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to preview composition source.";
      parseError = message;
      nextPart = {
        ...basePart,
        id: compositionId,
        compositionError: message,
      };
    }
    if (sourceUpdateVersionRef.current[basePart.filePath] !== sourceVersion)
      return;
    if (projectDocumentVersionRef.current !== sourceBaseProjectVersion) return;
    const nextProject = replacePartInProject(
      {
        ...projectRef.current,
        compositionSources: {
          ...compositionSourcesRef.current,
          [basePart.filePath]: source,
        },
      },
      compositionId,
      (currentPart) =>
        parseError
          ? {
              ...currentPart,
              compositionError: parseError,
            }
          : {
              ...nextPart,
              compositionError: undefined,
              motionMarkers: currentPart.motionMarkers,
              snapshot: currentPart.snapshot,
            },
    );

    replaceProject(nextProject, {
      history: options.history,
      syncSources: false,
    });
    setSourceStatus(
      parseError
        ? `Preview failed for ${basePart.filePath}.`
        : `Preview updated from ${basePart.filePath}.`,
    );
  }

  function readCompositionSiblingFile(sourcePath: string) {
    const sourceDirectory = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
    return async (relativePath: string) => {
      const projectPath =
        relativePath.startsWith("/") ||
        !sourceDirectory ||
        relativePath.startsWith(`${sourceDirectory}/`)
          ? relativePath
          : `${sourceDirectory}/${relativePath}`;
      return compositionSourcesRef.current[projectPath] ?? "";
    };
  }

  function withUiPersistedFields(project: ProjectManifest): ProjectManifest {
    const ids = uiPersistRef.current.selectedComposeObjectIds;
    return {
      ...project,
      editorState: {
        ...(project.editorState ?? defaultEditorState),
        selectedComposeObjectIds: ids.length ? ids : undefined,
      },
    };
  }

  function requestUiPersist() {
    scheduleAutosave(projectRef.current);
  }

  async function saveProject(
    projectToSave = projectRef.current,
    options: {
      autosaveVersion?: number;
      errorMessage?: string;
      throwOnError?: boolean;
    } = {},
  ) {
    const projectWithUi = withUiPersistedFields(projectToSave);
    const syncedSources =
      projectToSave === projectRef.current
        ? compositionSourcesRef.current
        : getProjectCompositionSources(projectWithUi);
    const embeddedProject = normalizeProject({
      ...projectWithUi,
      compositionSources: syncedSources,
    });
    const persistedProject = serializeProjectForSave(embeddedProject);
    const projectSnapshot = getProjectContentSnapshot(persistedProject);
    const compositionSourcesSnapshot = JSON.stringify(
      persistedProject.compositionSources ?? {},
    );
    const autosaveVersion = options.autosaveVersion;
    const shouldApplySaveResult = () =>
      autosaveVersion === undefined ||
      autosaveVersion === latestAutosaveVersionRef.current;

    setIsFileSystemBusy(true);
    const write = async () => {
      if (!shouldApplySaveResult()) return;
      const result = await projectPersistenceService.saveProject({
        projectPath: activeProjectManifestPathRef.current,
        project: persistedProject,
      });
      if (!shouldApplySaveResult()) return;
      const nextSavedProjectSnapshot = result.projectSnapshot
        ? getProjectContentSnapshot(
            JSON.parse(result.projectSnapshot) as ProjectManifest,
          )
        : projectSnapshot;
      setSavedProjectSnapshot(nextSavedProjectSnapshot);
      setSavedCompositionSourcesSnapshot(compositionSourcesSnapshot);
      savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
      savedCompositionSourcesSnapshotRef.current = compositionSourcesSnapshot;
      setLastSavedAt(Date.now());
      setSourceStatus(result.sourceStatus);
    };

    try {
      autosaveWriteQueueRef.current = autosaveWriteQueueRef.current
        .catch(() => {})
        .then(write);
      await autosaveWriteQueueRef.current;
    } catch (error) {
      if (shouldApplySaveResult())
        notifyError(
          error,
          options.errorMessage ?? "Unable to autosave project.",
        );
      if (options.throwOnError) throw error;
    } finally {
      if (!shouldApplySaveResult() || pendingFileOperationsRef.current > 0)
        setIsFileSystemBusy(true);
      else setIsFileSystemBusy(false);
    }
  }

  async function saveAllChanges() {
    await saveProject(projectRef.current);
  }

  function scheduleAutosave(
    projectOverride = projectRef.current,
    errorMessage = "Unable to autosave project.",
  ) {
    const projectWithUi = withUiPersistedFields(projectOverride);
    const projectSources =
      projectOverride === projectRef.current
        ? compositionSourcesRef.current
        : getProjectCompositionSources(projectWithUi);
    const projectToSave = normalizeProject({
      ...projectWithUi,
      compositionSources: projectSources,
    });
    const saveVersion = ++latestAutosaveVersionRef.current;
    window.clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = window.setTimeout(() => {
      void saveProject(projectToSave, {
        autosaveVersion: saveVersion,
        errorMessage,
      });
    }, 250);
  }

  async function writeEditorTextFile(filePath: string, source: string) {
    const nextSources = {
      ...compositionSourcesRef.current,
      [filePath]: source,
    };
    compositionSourcesRef.current = nextSources;
    setCompositionSources(nextSources);
    scheduleAutosave(projectRef.current);
  }

  function scheduleImplicitFileOperationSave(
    projectOverride = projectRef.current,
    errorMessage = "Unable to save file operation.",
  ) {
    const projectWithUi = withUiPersistedFields(projectOverride);
    const projectSources =
      projectOverride === projectRef.current
        ? compositionSourcesRef.current
        : getProjectCompositionSources(projectWithUi);
    const projectToSave = normalizeProject({
      ...projectWithUi,
      compositionSources: projectSources,
    });
    const saveVersion = ++latestAutosaveVersionRef.current;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      void saveProject(projectToSave, {
        autosaveVersion: saveVersion,
        errorMessage,
      });
    }, 150);
  }

  function implicitFileOperation<T extends unknown[]>(
    operation: (...args: T) => Promise<void> | void,
  ) {
    return (...args: T) => {
      if (!implicitFileOperationBatchActiveRef.current) {
        beginQueuedFileSystemOperation();
        implicitFileOperationBatchActiveRef.current = true;
      }
      implicitFileOperationActiveCountRef.current++;
      Promise.resolve()
        .then(() => operation(...args))
        .then(() => {
          markLastHistoryEntryAsImplicitFileOperation();
          implicitFileOperationActiveCountRef.current = Math.max(
            0,
            implicitFileOperationActiveCountRef.current - 1,
          );
          if (implicitFileOperationActiveCountRef.current === 0) {
            implicitFileOperationBatchActiveRef.current = false;
            scheduleImplicitFileOperationSave();
            void finishQueuedFileSystemOperation();
          }
        })
        .catch((error) => {
          implicitFileOperationActiveCountRef.current = Math.max(
            0,
            implicitFileOperationActiveCountRef.current - 1,
          );
          implicitFileOperationBatchActiveRef.current = false;
          notifyError(error, "Operation failed.");
          void finishQueuedFileSystemOperation();
        });
    };
  }

  function markLastHistoryEntryAsImplicitFileOperation() {
    const past = projectHistoryRef.current.past;
    if (past.length === 0) return;
    projectHistoryRef.current = {
      ...projectHistoryRef.current,
      past: past.map((entry, index) =>
        index === past.length - 1
          ? { ...entry, implicitFileOperation: true }
          : entry,
      ),
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
    savedCompositionSourcesSnapshotRef.current =
      savedCompositionSourcesSnapshot;
  }, [savedCompositionSourcesSnapshot]);

  useEffect(
    () => () => {
      window.clearTimeout(autosaveTimeoutRef.current);
      window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    },
    [],
  );

  return {
    activeProjectManifestPath,
    activeProjectManifestPathRef,
    compositionSources,
    compositionSourcesRef,
    executeBinCommand,
    fileSystemRevision,
    implicitFileOperation,
    isFileSystemBusy,
    lastSavedAt,
    openProjectManifest,
    project,
    projectRef,
    replaceProject,
    redoProjectChange,
    requestUiPersist,
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
    writeEditorTextFile,
  };
}
