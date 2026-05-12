import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { clipperHost } from "../clipperHost";
import toast from "react-hot-toast";
import { maxProjectHistoryActions, projectHistoryCoalesceMs } from "../config";
import { getDirectoryPath } from "../features/file-manager/fileManagerPaths";
import {
  getEditableRootPath,
  projectPersistenceService,
} from "../services/projectPersistenceService";
import {
  getProjectContentSnapshot,
  getProjectFileContentSnapshot,
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
import { writeStoredActiveProjectManifestPath } from "./activeProjectManifest";
import {
  getProjectCompositionSources,
  getSyncedCompositionSources,
} from "./projectSources";
import {
  classifyProjectAutosaveWrite,
  classifyProjectFileChange,
} from "./projectFileChangeClassifier";
import type { Command } from "../features/file-manager/operations/Command";
import {
  applyCompositionGraphTransaction,
  carryCompositionGraphTransactionRevisions,
  getCompositionGraphRevision,
  preserveNewerCompositionGraphTransactions,
} from "../../core/compositionGraphTransactions";

type ProjectHistoryEntry = {
  project: ProjectManifest;
  compositionSources: Record<string, string>;
  historyGroup?: string;
  implicitFileOperation?: boolean;
  fileCommand?: Command;
};
type SavedSnapshots = { project: string; compositionSources: string };
type DiskSnapshotBundle = {
  full: SavedSnapshots;
  fileContent: SavedSnapshots;
  projectMetadata: SavedSnapshots;
};

export type ProjectDocumentController = {
  activeProjectManifestPath: string;
  activeProjectManifestPathRef: MutableRefObject<string>;
  compositionSources: Record<string, string>;
  compositionSourcesRef: MutableRefObject<Record<string, string>>;
  executeFileManagerCommand: (command: Command) => Promise<void>;
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
      preserveNewerGraphTransactions?: boolean;
    },
  ) => void;
  redoProjectChange: () => Promise<void> | void;
  reloadProject: () => Promise<void>;
  reloadProjectFromWatcher: (changedPath?: string) => Promise<void>;
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
      preserveNewerGraphTransactions?: boolean;
    },
  ) => void;
  watchedProjectDirectory: string;
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
}: UseProjectDocumentControllerInput): ProjectDocumentController {
  const {
    project,
    setProject,
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
  const pendingFileOperationsRef = useRef(0);
  const lastGoodProjectRef = useRef<ProjectManifest | null>(null);
  const lastGoodSavedSnapshotsRef = useRef<DiskSnapshotBundle | null>(null);
  const projectRef = useRef(project);
  const compositionSourcesRef = useRef(compositionSources);
  const activeProjectManifestPathRef = useRef(activeProjectManifestPath);
  const savedProjectSnapshotRef = useRef(savedProjectSnapshot);
  const editableRootCacheRef = useRef<Record<string, string>>({});
  const savedCompositionSourcesSnapshotRef = useRef(
    savedCompositionSourcesSnapshot,
  );
  const savedFileContentSnapshotsRef = useRef<SavedSnapshots | null>(null);
  const externalChangeConflictActiveRef = useRef(false);
  const externalChangeToastIdRef = useRef<string | null>(null);
  const projectHistoryRef = useRef<{
    past: ProjectHistoryEntry[];
    future: ProjectHistoryEntry[];
  }>({ past: [], future: [] });
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
  const projectDocumentVersionRef = useRef(0);
  const watchedProjectDirectory = getDirectoryPath(activeProjectManifestPath);

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
        preserveNewerGraphTransactions?: boolean;
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
        normalizedProject = normalizeProject({
          ...nextProject,
          compositionSources: nextCompositionSources,
        });
        carryCompositionGraphTransactionRevisions(
          nextProject,
          normalizedProject,
        );
      } else {
        nextCompositionSources =
          nextProject.compositionSources ?? compositionSourcesRef.current;
        normalizedProject = normalizeProject({
          ...nextProject,
          compositionSources: nextCompositionSources,
        });
        carryCompositionGraphTransactionRevisions(
          nextProject,
          normalizedProject,
        );
      }
      if (options.preserveNewerGraphTransactions)
        normalizedProject = preserveNewerCompositionGraphTransactions(
          currentProject,
          normalizedProject,
        );
      if (
        options.syncSources !== false &&
        options.preserveNewerGraphTransactions
      ) {
        nextCompositionSources = getSyncedCompositionSources(
          normalizedProject,
          currentProject,
          nextCompositionSources,
        );
        const preSourceResyncProject = normalizedProject;
        normalizedProject = normalizeProject({
          ...normalizedProject,
          compositionSources: nextCompositionSources,
        });
        carryCompositionGraphTransactionRevisions(
          preSourceResyncProject,
          normalizedProject,
        );
      }
      if (options.preserveEditorState) {
        const preEditorStateProject = normalizedProject;
        normalizedProject = normalizeProject({
          ...normalizedProject,
          editorState: projectRef.current.editorState ?? defaultEditorState,
        });
        carryCompositionGraphTransactionRevisions(
          preEditorStateProject,
          normalizedProject,
        );
      } else if (options.preservePageMode !== false) {
        const currentEditorState =
          projectRef.current.editorState ?? defaultEditorState;
        const prePageModeProject = normalizedProject;
        normalizedProject = normalizeProject({
          ...normalizedProject,
          editorState: {
            ...(normalizedProject.editorState ?? defaultEditorState),
            fileManagerState: currentEditorState.fileManagerState,
            mode: modeRef.current,
            timelineMode: timelineModeRef.current,
          },
        });
        carryCompositionGraphTransactionRevisions(
          prePageModeProject,
          normalizedProject,
        );
      }
      const sortedSources = (sources: Record<string, string> | undefined) =>
        sources
          ? Object.fromEntries(
              Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)),
            )
          : undefined;
      const projectForCompare = (p: ProjectManifest) => ({
        ...p,
        compositionSources: sortedSources(p.compositionSources),
      });
      if (
        JSON.stringify(projectForCompare(normalizedProject)) ===
        JSON.stringify(projectForCompare(currentProject))
      )
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
      preserveNewerGraphTransactions?: boolean;
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

  function hasUnsavedProjectChanges(projectToCheck = projectRef.current) {
    const snapshots = getCurrentProjectSnapshots(projectToCheck);
    return (
      snapshots.project !== savedProjectSnapshotRef.current ||
      snapshots.compositionSources !==
        savedCompositionSourcesSnapshotRef.current
    );
  }

  async function hasExternalDiskChanges() {
    const diskSnapshots = await getDiskProjectSnapshotBundle();
    const currentSnapshots = getCurrentProjectSnapshots();
    if (snapshotsEqual(diskSnapshots.full, currentSnapshots)) {
      markSnapshotsSaved(currentSnapshots);
      return false;
    }
    return !snapshotsEqual(
      diskSnapshots.fileContent,
      getSavedProjectFileContentSnapshots(),
    );
  }

  function getCurrentProjectSnapshots(
    projectToCheck = projectRef.current,
  ): SavedSnapshots {
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

  function getCurrentProjectFileContentSnapshots(
    projectToCheck = projectRef.current,
  ): SavedSnapshots {
    const persistedProject = serializeProjectForSave({
      ...projectToCheck,
      compositionSources: compositionSourcesRef.current,
    });
    return getProjectFileContentSnapshots(persistedProject);
  }

  function getCurrentProjectMetadataSnapshots(
    projectToCheck = projectRef.current,
  ): SavedSnapshots {
    const persistedProject = serializeProjectForSave({
      ...projectToCheck,
      compositionSources: compositionSourcesRef.current,
    });
    return getProjectMetadataSnapshots(persistedProject);
  }

  function getProjectFileContentSnapshots(
    projectToCheck: ProjectManifest,
  ): SavedSnapshots {
    return {
      project: getProjectFileContentSnapshot(projectToCheck),
      compositionSources: JSON.stringify(
        projectToCheck.compositionSources ?? {},
      ),
    };
  }

  function getProjectMetadataSnapshots(
    projectToCheck: ProjectManifest,
  ): SavedSnapshots {
    const {
      compositionLibrary: _compositionLibrary,
      compositionFolders: _compositionFolders,
      compositionOrder: _compositionOrder,
      compositionSources: _compositionSources,
      compositions: _compositions,
      editorState: _editorState,
      scenes: _scenes,
      timelineOrder: _timelineOrder,
      timelines: _timelines,
      ...projectMetadata
    } = projectToCheck;
    return {
      project: JSON.stringify(projectMetadata),
      compositionSources: "{}",
    };
  }

  function getSavedProjectFileContentSnapshots(): SavedSnapshots {
    if (savedFileContentSnapshotsRef.current)
      return savedFileContentSnapshotsRef.current;
    try {
      return {
        project: getProjectFileContentSnapshot(
          JSON.parse(savedProjectSnapshotRef.current) as ProjectManifest,
        ),
        compositionSources: savedCompositionSourcesSnapshotRef.current,
      };
    } catch {
      return {
        project: savedProjectSnapshotRef.current,
        compositionSources: savedCompositionSourcesSnapshotRef.current,
      };
    }
  }

  function getSavedProjectMetadataSnapshots(): SavedSnapshots {
    try {
      return getProjectMetadataSnapshots(
        JSON.parse(savedProjectSnapshotRef.current) as ProjectManifest,
      );
    } catch {
      return {
        project: savedProjectSnapshotRef.current,
        compositionSources: "{}",
      };
    }
  }

  async function getDiskProjectSnapshots(): Promise<SavedSnapshots> {
    return (await getDiskProjectSnapshotBundle()).full;
  }

  async function getDiskProjectSnapshotBundle(): Promise<DiskSnapshotBundle> {
    const { project: loadedProject } =
      await projectPersistenceService.loadProject({
        manifestPath: activeProjectManifestPathRef.current,
      });
    const normalizedProject = normalizeProject(loadedProject);
    const loadedCompositionSources =
      getProjectCompositionSources(normalizedProject);
    const persistedProject = serializeProjectForSave({
      ...normalizedProject,
      compositionSources: loadedCompositionSources,
    });
    const full = {
      project: getProjectContentSnapshot(persistedProject),
      compositionSources: JSON.stringify(
        persistedProject.compositionSources ?? {},
      ),
    };
    return {
      full,
      fileContent: getProjectFileContentSnapshots(persistedProject),
      projectMetadata: getProjectMetadataSnapshots(persistedProject),
    };
  }

  function snapshotsEqual(left: SavedSnapshots, right: SavedSnapshots) {
    return (
      left.project === right.project &&
      left.compositionSources === right.compositionSources
    );
  }

  function markSnapshotsSaved(snapshots: SavedSnapshots) {
    savedProjectSnapshotRef.current = snapshots.project;
    savedCompositionSourcesSnapshotRef.current = snapshots.compositionSources;
    savedFileContentSnapshotsRef.current = getProjectFileContentSnapshots(
      JSON.parse(snapshots.project) as ProjectManifest,
    );
    setSavedProjectSnapshot(snapshots.project);
    setSavedCompositionSourcesSnapshot(snapshots.compositionSources);
    setLastSavedAt(Date.now());
  }

  function markFileContentSnapshotsSaved(snapshots: SavedSnapshots) {
    savedFileContentSnapshotsRef.current = snapshots;
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

  async function storeActiveProjectManifestPath(manifestPath: string) {
    try {
      await writeStoredActiveProjectManifestPath(manifestPath);
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

  async function loadProjectFromManifest(manifestPath: string) {
    const { project: loadedProject, sourceStatus: nextSourceStatus } =
      await projectPersistenceService.loadProject({ manifestPath });
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
    const nextSavedFileContentSnapshots =
      getProjectFileContentSnapshots(persistedProject);

    await storeActiveProjectManifestPath(manifestPath);
    setActiveProjectManifestPath(manifestPath);
    resetProjectHistory();
    replaceProject(normalizedProject, {
      history: false,
      syncSources: false,
      preservePageMode: false,
    });
    applyEditorState(normalizedProject.editorState!);
    setSavedProjectSnapshot(nextSavedProjectSnapshot);
    setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
    savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
    savedCompositionSourcesSnapshotRef.current =
      nextSavedCompositionSourcesSnapshot;
    savedFileContentSnapshotsRef.current = nextSavedFileContentSnapshots;
    setLastSavedAt(Date.now());
    setSourceStatus(nextSourceStatus);
  }

  const reloadProjectFromDisk = useCallback(
    async (options?: { preserveEditorState?: boolean }) => {
      try {
        const { project: loadedProject } =
          await projectPersistenceService.loadProject({
            manifestPath: activeProjectManifestPathRef.current,
          });
        const normalizedProject = normalizeProject(loadedProject);
        const loadedCompositionSources =
          getProjectCompositionSources(normalizedProject);
        const persistedDiskProject = serializeProjectForSave({
          ...normalizedProject,
          compositionSources: loadedCompositionSources,
        });
        replaceProject(normalizedProject, {
          history: false,
          syncSources: false,
          preserveEditorState: options?.preserveEditorState,
          preserveNewerGraphTransactions: true,
        });
        const nextSavedProjectSnapshot =
          getProjectContentSnapshot(persistedDiskProject);
        const nextSavedCompositionSourcesSnapshot = JSON.stringify(
          persistedDiskProject.compositionSources ?? {},
        );
        const nextSavedFileContentSnapshots =
          getProjectFileContentSnapshots(persistedDiskProject);
        setSavedProjectSnapshot(nextSavedProjectSnapshot);
        setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
        savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
        savedCompositionSourcesSnapshotRef.current =
          nextSavedCompositionSourcesSnapshot;
        savedFileContentSnapshotsRef.current = nextSavedFileContentSnapshots;
        setLastSavedAt(Date.now());
        setSourceStatus("Project reloaded from disk.");
        setFileSystemRevision((r) => r + 1);
      } catch (error) {
        notifyError(error, "Unable to reload project.");
      }
    },
    [replaceProject, setSourceStatus, notifyError],
  );

  const reloadProject = useCallback(async () => {
    if (pendingFileOperationsRef.current > 0) return;
    await reloadProjectFromDisk();
  }, [reloadProjectFromDisk]);

  const reloadProjectFromWatcher = useCallback(
    async (changedPath?: string) => {
      if (pendingFileOperationsRef.current > 0) return;
      if (!isWatchedFileManagerPath(changedPath)) return;
      window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
      implicitFileOperationSaveVersionRef.current++;
      latestAutosaveVersionRef.current++;
      const currentSnapshots = getCurrentProjectSnapshots();
      const currentFileContentSnapshots =
        getCurrentProjectFileContentSnapshots();
      const savedFileContentSnapshots = getSavedProjectFileContentSnapshots();
      const diskSnapshots = await getDiskProjectSnapshotBundle();
      const decision = classifyProjectFileChange({
        currentFileContentSnapshots,
        currentSnapshots,
        diskSnapshots,
        hasUnsavedAppChanges: hasUnsavedProjectChanges(),
        savedFileContentSnapshots,
      });
      if (decision === "ignore") return;
      if (decision === "mark-saved") {
        markSnapshotsSaved(currentSnapshots);
        setSourceStatus(
          changedPath
            ? `Saved changes detected at ${changedPath}.`
            : "Saved project changes detected.",
        );
        return;
      }
      if (decision === "mark-file-content-saved") {
        markFileContentSnapshotsSaved(diskSnapshots.fileContent);
        return;
      }
      if (decision === "conflict") {
        showExternalChangeConflict(changedPath);
        return;
      }
      await reloadProjectFromDisk({ preserveEditorState: true });
    },
    [reloadProjectFromDisk, setSourceStatus],
  );

  function showExternalChangeConflict(changedPath?: string) {
    externalChangeConflictActiveRef.current = true;
    setSourceStatus(
      changedPath
        ? `External change detected at ${changedPath}. Choose whether to save app changes or load disk changes.`
        : "External project file change detected. Choose whether to save app changes or load disk changes.",
    );
    if (externalChangeToastIdRef.current)
      toast.dismiss(externalChangeToastIdRef.current);
    externalChangeToastIdRef.current = toast.custom(
      (t) =>
        createElement(
          "div",
          {
            className: `flex w-[min(420px,calc(100vw-32px))] flex-col gap-3 rounded-2xl border border-[#2d313b] bg-[#12141a] p-4 text-[#f7f7f8] shadow-2xl shadow-black/50 backdrop-blur ${t.visible ? "animate-[clipper-dialog-in_190ms_cubic-bezier(0.16,1,0.3,1)_forwards]" : "animate-[clipper-dialog-out_120ms_ease-in_forwards]"}`,
          },
          createElement(
            "div",
            { className: "space-y-1" },
            createElement(
              "div",
              { className: "text-sm font-semibold text-white" },
              "External file change conflict",
            ),
            createElement(
              "div",
              { className: "text-xs leading-5 text-[#c5c8d2]" },
              changedPath
                ? `${changedPath} changed on disk while app has unsaved changes.`
                : "Project files changed on disk while app has unsaved changes.",
            ),
            createElement(
              "div",
              { className: "text-xs leading-5 text-[#9b9da7]" },
              "Applies to any watched file-manager file. Choose one. Nothing will be overwritten automatically.",
            ),
          ),
          createElement(
            "div",
            { className: "flex justify-end gap-2" },
            createElement(
              "button",
              {
                className:
                  "rounded-lg border border-[#2d313b] px-3 py-1.5 text-xs font-medium text-[#c5c8d2] hover:border-[#4a5060] hover:bg-[#20232c]",
                type: "button",
                onClick: () => toast.dismiss(t.id),
              },
              "Decide later",
            ),
            createElement(
              "button",
              {
                className:
                  "rounded-lg border border-[#2d313b] bg-[#1a1d25] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#4a5060] hover:bg-[#20232c]",
                type: "button",
                onClick: () => {
                  externalChangeConflictActiveRef.current = false;
                  toast.dismiss(t.id);
                  void reloadProjectFromDisk();
                },
              },
              "Load disk changes",
            ),
            createElement(
              "button",
              {
                className:
                  "rounded-lg border border-[#2d313b] bg-[#1a1d25] px-3 py-1.5 text-xs font-semibold text-white hover:border-[#4a5060] hover:bg-[#20232c]",
                type: "button",
                onClick: () => {
                  externalChangeConflictActiveRef.current = false;
                  toast.dismiss(t.id);
                  void saveProject(projectRef.current, { force: true });
                },
              },
              "Save app over disk",
            ),
          ),
        ),
      { duration: Infinity },
    );
  }

  function isWatchedFileManagerPath(changedPath?: string) {
    if (!changedPath) return true;
    return (
      changedPath.includes("/file-manager/") ||
      changedPath.startsWith("file-manager/") ||
      (changedPath.startsWith("clipper/projects/") &&
        changedPath.includes("/file-manager/"))
    );
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
    if (pendingFileOperationsRef.current === 1) {
      lastGoodProjectRef.current = projectRef.current;
      lastGoodSavedSnapshotsRef.current = {
        full: {
          project: savedProjectSnapshotRef.current,
          compositionSources: savedCompositionSourcesSnapshotRef.current,
        },
        fileContent: getSavedProjectFileContentSnapshots(),
        projectMetadata: getSavedProjectMetadataSnapshots(),
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
      if (fileSystemRecoveryPromiseRef.current === recoveryPromise)
        fileSystemRecoveryPromiseRef.current = null;
      return;
    }
    if (hasUnsavedProjectChanges()) {
      setSourceStatus(
        "Filesystem operation completed. Autosave paused until reload.",
      );
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
    savedProjectSnapshotRef.current = snapshots.full.project;
    savedCompositionSourcesSnapshotRef.current =
      snapshots.full.compositionSources;
    savedFileContentSnapshotsRef.current = snapshots.fileContent;
    setSavedProjectSnapshot(snapshots.full.project);
    setSavedCompositionSourcesSnapshot(snapshots.full.compositionSources);
  }

  function startFileSystemRecovery(cancelImplicitSave = true) {
    fileSystemQueueGenerationRef.current++;
    if (cancelImplicitSave) {
      window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
      implicitFileOperationSaveVersionRef.current++;
    }
    if (!fileSystemRecoveryPromiseRef.current)
      fileSystemRecoveryPromiseRef.current = reloadProjectFromDisk();
  }

  const enqueueFileSystemOperation = useCallback(
    <T>(
      operation: () => Promise<T> | T,
      options: { rollbackOnFailure?: boolean; errorMessage?: string } = {},
    ) => {
      const operationGeneration = beginQueuedFileSystemOperation();

      return enqueueHistoryOperation(async () => {
        try {
          if (fileSystemRecoveryPromiseRef.current)
            await fileSystemRecoveryPromiseRef.current;
          if (operationGeneration !== fileSystemQueueGenerationRef.current)
            throw new Error(
              "File operation cancelled because an earlier operation failed.",
            );
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
    },
    [enqueueHistoryOperation, notifyError, reloadProjectFromDisk],
  );

  const executeFileManagerCommand = useCallback(
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
          future: [
            {
              project: stateBeforeUndo,
              compositionSources: sourcesBeforeUndo,
              fileCommand: previousEntry.fileCommand,
            },
            ...projectHistoryRef.current.future,
          ].slice(0, maxProjectHistoryActions),
        };
        lastProjectHistoryAtRef.current = 0;
        return;
      }

      const restoredProject = preserveCurrentPageMode(previousEntry.project);

      projectHistoryRef.current = {
        past: projectHistoryRef.current.past.slice(0, -1),
        future: [
          {
            project: projectRef.current,
            compositionSources: compositionSourcesRef.current,
            implicitFileOperation: previousEntry.implicitFileOperation,
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

      if (nextEntry.fileCommand) {
        const stateBeforeRedo = projectRef.current;
        const sourcesBeforeRedo = compositionSourcesRef.current;
        await nextEntry.fileCommand.redo();
        await reloadProject();
        projectHistoryRef.current = {
          past: [
            ...projectHistoryRef.current.past,
            {
              project: stateBeforeRedo,
              compositionSources: sourcesBeforeRedo,
              fileCommand: nextEntry.fileCommand,
            },
          ].slice(-maxProjectHistoryActions),
          future: projectHistoryRef.current.future.slice(1),
        };
        lastProjectHistoryAtRef.current = 0;
        return;
      }

      const restoredProject = preserveCurrentPageMode(nextEntry.project);

      projectHistoryRef.current = {
        past: [
          ...projectHistoryRef.current.past,
          {
            project: projectRef.current,
            compositionSources: compositionSourcesRef.current,
            implicitFileOperation: nextEntry.implicitFileOperation,
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
    const sourceBaseGraphRevision = getCompositionGraphRevision(
      basePart.animationGraph,
    );
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
    if (parseError) {
      const nextProject = replacePartInProject(
        projectRef.current,
        compositionId,
        (currentPart) => ({
          ...currentPart,
          compositionError: parseError,
        }),
      );

      replaceProject(nextProject, {
        history: options.history,
        syncSources: false,
      });
      setSourceStatus(`Preview failed for ${basePart.filePath}.`);
      return;
    }

    const parsedGraph = nextPart.animationGraph;
    let nextProject = replacePartInProject(
      {
        ...projectRef.current,
        compositionSources: compositionSourcesRef.current,
      },
      compositionId,
      (currentPart) => ({
        ...nextPart,
        compositionError: undefined,
        animationGraph: currentPart.animationGraph,
        motionMarkers: currentPart.motionMarkers,
        snapshot: currentPart.snapshot,
      }),
    );
    if (parsedGraph) {
      nextProject = applyCompositionGraphTransaction(nextProject, {
        origin: "source",
        baseRevision: sourceBaseGraphRevision,
        compositionId,
        filePath: basePart.filePath,
        graph: parsedGraph,
        mode: "composition2d",
      });
    }

    replaceProject(nextProject, {
      history: options.history,
      syncSources: false,
    });
    setSourceStatus(
      nextPart.compositionError
        ? `Preview failed for ${nextPart.filePath}. Source saved.`
        : `Preview updated from ${nextPart.filePath}.`,
    );
  }

  function readCompositionSiblingFile(sourcePath: string) {
    const sourceDirectory = getDirectoryPath(sourcePath);
    return async (relativePath: string) => {
      const projectPath =
        relativePath.startsWith("/") ||
        !sourceDirectory ||
        relativePath.startsWith(`${sourceDirectory}/`)
          ? relativePath
          : `${sourceDirectory}/${relativePath}`;

      const manifestPath = activeProjectManifestPathRef.current;
      if (manifestPath) {
        const rootPath = getDirectoryPath(manifestPath);

        let editableRoot = editableRootCacheRef.current[rootPath];
        if (editableRoot === undefined) {
          editableRoot = await getEditableRootPath(rootPath);
          editableRootCacheRef.current[rootPath] = editableRoot;
        }

        const fullPath =
          editableRoot && !projectPath.startsWith(`${editableRoot}/`)
            ? `${editableRoot}/${projectPath}`
            : projectPath;
        return clipperHost.readTextFile(fullPath);
      }

      return clipperHost.readTextFile(projectPath);
    };
  }

  async function saveProject(
    projectToSave = projectRef.current,
    options: {
      autosaveVersion?: number;
      errorMessage?: string;
      force?: boolean;
      throwOnError?: boolean;
    } = {},
  ) {
    const syncedSources =
      projectToSave === projectRef.current
        ? compositionSourcesRef.current
        : getProjectCompositionSources(projectToSave);
    const embeddedProject = normalizeProject({
      ...projectToSave,
      compositionSources: syncedSources,
    });
    const persistedProject = serializeProjectForSave(embeddedProject);
    const projectSnapshot = getProjectContentSnapshot(persistedProject);
    const compositionSourcesSnapshot = JSON.stringify(
      persistedProject.compositionSources ?? {},
    );
    const projectFileContentSnapshots =
      getProjectFileContentSnapshots(persistedProject);
    const projectMetadataSnapshots =
      getProjectMetadataSnapshots(persistedProject);
    const autosaveVersion = options.autosaveVersion;
    const shouldApplySaveResult = () =>
      autosaveVersion === undefined ||
      autosaveVersion === latestAutosaveVersionRef.current;

    window.clearTimeout(autosaveBusyReleaseTimeoutRef.current);
    setIsFileSystemBusy(true);
    const write = async () => {
      if (!shouldApplySaveResult()) return;
      if (!options.force && externalChangeConflictActiveRef.current) return;
      if (!options.force) {
        const diskSnapshots = await getDiskProjectSnapshotBundle();
        const savedFileContentSnapshots = getSavedProjectFileContentSnapshots();
        const writeDecision = classifyProjectAutosaveWrite({
          diskSnapshots,
          savedFileContentSnapshots,
          savedMetadataSnapshots: getSavedProjectMetadataSnapshots(),
          targetFileContentSnapshots: projectFileContentSnapshots,
          targetMetadataSnapshots: projectMetadataSnapshots,
          targetSnapshots: {
            project: projectSnapshot,
            compositionSources: compositionSourcesSnapshot,
          },
        });
        if (writeDecision === "mark-saved") {
          markSnapshotsSaved(diskSnapshots.full);
          return;
        }
        if (writeDecision === "mark-file-content-saved-and-write")
          markFileContentSnapshotsSaved(diskSnapshots.fileContent);
        if (writeDecision === "conflict") {
          showExternalChangeConflict();
          return;
        }
      }
      if (!shouldApplySaveResult()) return;
      const result = await projectPersistenceService.saveProject({
        manifestPath: activeProjectManifestPathRef.current,
        project: persistedProject,
      });
      if (!shouldApplySaveResult()) {
        markFileContentSnapshotsSaved(projectFileContentSnapshots);
        return;
      }
      const nextSavedProjectSnapshot = result.projectSnapshot
        ? getProjectContentSnapshot(
            JSON.parse(result.projectSnapshot) as ProjectManifest,
          )
        : projectSnapshot;
      const nextSavedCompositionSourcesSnapshot =
        result.compositionSourcesSnapshot || compositionSourcesSnapshot;
      setSavedProjectSnapshot(nextSavedProjectSnapshot);
      setSavedCompositionSourcesSnapshot(nextSavedCompositionSourcesSnapshot);
      savedProjectSnapshotRef.current = nextSavedProjectSnapshot;
      savedCompositionSourcesSnapshotRef.current =
        nextSavedCompositionSourcesSnapshot;
      savedFileContentSnapshotsRef.current = projectFileContentSnapshots;
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
      else
        autosaveBusyReleaseTimeoutRef.current = window.setTimeout(
          () => setIsFileSystemBusy(false),
          1000,
        );
    }
  }

  async function saveAllChanges() {
    await saveProject(projectRef.current);
  }

  function scheduleAutosave(
    projectOverride = projectRef.current,
    errorMessage = "Unable to autosave project.",
  ) {
    const projectSources =
      projectOverride === projectRef.current
        ? compositionSourcesRef.current
        : getProjectCompositionSources(projectOverride);
    const projectToSave = normalizeProject({
      ...projectOverride,
      compositionSources: projectSources,
    });
    const saveVersion = ++latestAutosaveVersionRef.current;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      void saveProject(projectToSave, {
        autosaveVersion: saveVersion,
        errorMessage,
      });
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
      else
        autosaveBusyReleaseTimeoutRef.current = window.setTimeout(
          () => setIsFileSystemBusy(false),
          1000,
        );
    }
  }

  function scheduleImplicitFileOperationSave(
    projectOverride = projectRef.current,
    errorMessage = "Unable to save file operation.",
  ) {
    if (!implicitFileOperationBatchActiveRef.current) {
      beginQueuedFileSystemOperation();
      implicitFileOperationBatchActiveRef.current = true;
    }

    const projectSources =
      projectOverride === projectRef.current
        ? compositionSourcesRef.current
        : getProjectCompositionSources(projectOverride);
    const projectToSave = normalizeProject({
      ...projectOverride,
      compositionSources: projectSources,
    });

    const operationGeneration = fileSystemQueueGenerationRef.current;
    const saveVersion = ++latestAutosaveVersionRef.current;
    implicitFileOperationSaveVersionRef.current++;
    window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
    implicitFileOperationSaveTimeoutRef.current = window.setTimeout(() => {
      enqueueHistoryOperation(async () => {
        try {
          if (fileSystemRecoveryPromiseRef.current)
            await fileSystemRecoveryPromiseRef.current;
          if (operationGeneration !== fileSystemQueueGenerationRef.current)
            throw new Error(
              "File operation save cancelled because an earlier operation failed.",
            );
          await saveProject(projectToSave, {
            autosaveVersion: saveVersion,
            errorMessage,
            throwOnError: true,
          });
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

  function implicitFileOperation<T extends unknown[]>(
    operation: (...args: T) => Promise<void> | void,
  ) {
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
        implicitFileOperationActiveCountRef.current = Math.max(
          0,
          implicitFileOperationActiveCountRef.current - 1,
        );
        restoreLastGoodProject();
        startFileSystemRecovery();
        notifyError(error, "Operation failed. Reverting to last good state.");
        implicitFileOperationBatchActiveRef.current = false;
        void finishQueuedFileSystemOperation();
        return;
      }

      Promise.resolve(opResult)
        .then(() => {
          implicitFileOperationActiveCountRef.current = Math.max(
            0,
            implicitFileOperationActiveCountRef.current - 1,
          );
          if (implicitFileOperationActiveCountRef.current === 0)
            scheduleImplicitFileOperationSave();
        })
        .catch((error) => {
          implicitFileOperationActiveCountRef.current = Math.max(
            0,
            implicitFileOperationActiveCountRef.current - 1,
          );
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
    savedCompositionSourcesSnapshotRef.current =
      savedCompositionSourcesSnapshot;
  }, [savedCompositionSourcesSnapshot]);

  useEffect(
    () => () => {
      window.clearTimeout(implicitFileOperationSaveTimeoutRef.current);
      window.clearTimeout(autosaveBusyReleaseTimeoutRef.current);
    },
    [],
  );

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
