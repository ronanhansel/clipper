import type { FileManagerTreeSnapshot } from "../../../components/FileManager";
import type { EditorState, Part, ProjectManifest } from "../../../core/types";
import { getDirectoryPath, reorderByIntent } from "./fileManagerPaths";

export type CompositionSourceMutationResult = {
  compositionSources: Record<string, string>;
  project: ProjectManifest;
};

function remapFolderPath(path: string, folderPath: string, nextFolderPath: string) {
  return path === folderPath || path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path;
}

function remapSourcesForFolder(sources: Record<string, string>, folderPath: string, nextFolderPath: string) {
  return Object.fromEntries(Object.entries(sources).map(([path, source]) => [path.startsWith(`${folderPath}/`) ? `${nextFolderPath}${path.slice(folderPath.length)}` : path, source]));
}

export function reorderCompositionInProject(project: ProjectManifest, compositionLibrary: Part[], sourceCompositionId: string, targetCompositionId: string, action: "before" | "after") {
  if (sourceCompositionId === targetCompositionId) return project;
  const library = project.compositionLibrary ?? compositionLibrary;
  const sourceIndex = library.findIndex((composition) => composition.id === sourceCompositionId);
  const targetIndex = library.findIndex((composition) => composition.id === targetCompositionId);
  if (sourceIndex < 0 || targetIndex < 0) return project;
  return { ...project, compositionLibrary: reorderByIntent(library, sourceIndex, targetIndex, action) };
}

export function reorderCompositionFolderInProject(project: ProjectManifest, sourceFolderPath: string, targetFolderPath: string, action: "before" | "after") {
  if (sourceFolderPath === targetFolderPath) return project;
  const folders = project.compositionFolders ?? [];
  const sourceIndex = folders.indexOf(sourceFolderPath);
  const targetIndex = folders.indexOf(targetFolderPath);
  if (sourceIndex < 0 || targetIndex < 0) return project;
  return { ...project, compositionFolders: reorderByIntent(folders, sourceIndex, targetIndex, action) };
}

export function renameCompositionFolderInProject(project: ProjectManifest, compositionSources: Record<string, string>, folderPath: string, name: string, compositionLibrary: Part[]): CompositionSourceMutationResult | null {
  const nextName = name.trim().replace(/[/\\]/g, "-");
  if (!nextName) return null;
  const parentPath = getDirectoryPath(folderPath);
  const nextFolderPath = parentPath ? `${parentPath}/${nextName}` : nextName;
  const nextSources = remapSourcesForFolder(compositionSources, folderPath, nextFolderPath);

  const nextLibrary = (project.compositionLibrary ?? compositionLibrary).map((item) => {
    if (item.filePath.startsWith(`${folderPath}/`)) {
      const nextFilePath = `${nextFolderPath}${item.filePath.slice(folderPath.length)}`;
      return { ...item, filePath: nextFilePath };
    }
    return item;
  });

  const nextTimelines = (project.timelines ?? []).map((timeline) => {
    let nextTimeline = timeline;
    if (timeline.filePath && timeline.filePath.startsWith(`${folderPath}/`)) {
      const nextFilePath = `${nextFolderPath}${timeline.filePath.slice(folderPath.length)}`;
      nextTimeline = { ...nextTimeline, id: nextFilePath, filePath: nextFilePath };
    }
    return nextTimeline;
  });

  return {
    compositionSources: nextSources,
    project: relinkEditorStateFolderPaths({
      ...project,
      compositionSources: nextSources,
      compositionFolders: (project.compositionFolders ?? []).map((path) => remapFolderPath(path, folderPath, nextFolderPath)),
      compositionLibrary: nextLibrary,
      timelines: nextTimelines,
    }, folderPath, nextFolderPath),
  };
}

export function moveCompositionFolderInProject(project: ProjectManifest, compositionSources: Record<string, string>, folderPath: string, parentFolderPath: string, compositionLibrary: Part[]): CompositionSourceMutationResult | null {
  if (parentFolderPath === folderPath || parentFolderPath.startsWith(`${folderPath}/`)) return null;
  const folderName = folderPath.slice(folderPath.lastIndexOf("/") + 1);
  const nextFolderPath = parentFolderPath ? `${parentFolderPath}/${folderName}` : folderName;
  if (nextFolderPath === folderPath) return null;
  const nextSources = remapSourcesForFolder(compositionSources, folderPath, nextFolderPath);

  const nextLibrary = (project.compositionLibrary ?? compositionLibrary).map((item) => {
    if (item.filePath.startsWith(`${folderPath}/`)) {
      const nextFilePath = `${nextFolderPath}${item.filePath.slice(folderPath.length)}`;
      return { ...item, filePath: nextFilePath };
    }
    return item;
  });

  const nextTimelines = (project.timelines ?? []).map((timeline) => {
    let nextTimeline = timeline;
    if (timeline.filePath && timeline.filePath.startsWith(`${folderPath}/`)) {
      const nextFilePath = `${nextFolderPath}${timeline.filePath.slice(folderPath.length)}`;
      nextTimeline = { ...nextTimeline, id: nextFilePath, filePath: nextFilePath };
    }
    return nextTimeline;
  });

  return {
    compositionSources: nextSources,
    project: relinkEditorStateFolderPaths({
      ...project,
      compositionSources: nextSources,
      compositionFolders: Array.from(new Set((project.compositionFolders ?? []).map((path) => remapFolderPath(path, folderPath, nextFolderPath)))),
      compositionLibrary: nextLibrary,
      timelines: nextTimelines,
    }, folderPath, nextFolderPath),
  };
}

function relinkEditorStateFolderPaths(project: ProjectManifest, folderPath: string, nextFolderPath: string): ProjectManifest {
  const editorState = project.editorState;
  if (!editorState) return project;
  return {
    ...project,
    editorState: {
      ...editorState,
      selectedSceneId: editorState.selectedSceneId ? remapFolderPath(editorState.selectedSceneId, folderPath, nextFolderPath) : editorState.selectedSceneId,
      selectedTimelineId: editorState.selectedTimelineId ? remapFolderPath(editorState.selectedTimelineId, folderPath, nextFolderPath) : editorState.selectedTimelineId,
      selectedPartId: editorState.selectedPartId ? remapFolderPath(editorState.selectedPartId, folderPath, nextFolderPath) : editorState.selectedPartId,
      editorSession: editorState.editorSession ? {
        ...editorState.editorSession,
        activeTabId: editorState.editorSession.activeTabId ? remapFolderPath(editorState.editorSession.activeTabId, folderPath, nextFolderPath) : editorState.editorSession.activeTabId,
        tabs: editorState.editorSession.tabs.map((tab) => ({ ...tab, id: remapFolderPath(tab.id, folderPath, nextFolderPath), filePath: remapFolderPath(tab.filePath, folderPath, nextFolderPath) })),
      } : editorState.editorSession,
      editor: relinkFolderKeyedState(editorState.editor, folderPath, nextFolderPath),
      code: relinkFolderKeyedState(editorState.code, folderPath, nextFolderPath),
    },
  };
}

function relinkFolderKeyedState<T>(state: Record<string, T> | undefined, folderPath: string, nextFolderPath: string): Record<string, T> | undefined {
  if (!state) return state;
  return Object.fromEntries(Object.entries(state).map(([path, value]) => [remapFolderPath(path, folderPath, nextFolderPath), value]));
}

export function deleteCompositionFolderFromProject(project: ProjectManifest, compositionSources: Record<string, string>, folderPath: string, compositionLibrary: Part[]): CompositionSourceMutationResult {
  const affectedCompositions = compositionLibrary.filter((item) => item.filePath.startsWith(`${folderPath}/`));
  const affectedIds = new Set(affectedCompositions.map((item) => item.id));
  const nextSources = Object.fromEntries(Object.entries(compositionSources).filter(([path]) => !path.startsWith(`${folderPath}/`)));
  return {
    compositionSources: nextSources,
    project: {
      ...project,
      compositionSources: nextSources,
      compositionFolders: (project.compositionFolders ?? []).filter((path) => path !== folderPath && !path.startsWith(`${folderPath}/`)),
      compositionLibrary: (project.compositionLibrary ?? compositionLibrary).map((item) => affectedIds.has(item.id) ? { ...item, source: undefined, sourceMissing: true } : item),
    },
  };
}

export function applyFileManagerTreeSnapshotToProject(project: ProjectManifest, compositionSources: Record<string, string>, compositionLibrary: Part[], snapshot: FileManagerTreeSnapshot, defaultEditorState: EditorState): CompositionSourceMutationResult {
  const library = project.compositionLibrary ?? compositionLibrary;
  const timelines = project.timelines ?? [];
  let nextSources = compositionSources;

  for (const composition of library) {
    const nextFilePath = snapshot.compositionFilePaths[composition.id];
    if (!nextFilePath || nextFilePath === composition.filePath) continue;
    const source = nextSources[composition.filePath];
    const { [composition.filePath]: _removed, ...rest } = nextSources;
    nextSources = source === undefined ? rest : { ...rest, [nextFilePath]: source };
  }

  const timelineIdMap = new Map<string, string>();
  for (const timeline of timelines) {
    const nextFilePath = snapshot.timelineFilePaths[timeline.id];
    if (!nextFilePath || nextFilePath === timeline.filePath) continue;
    timelineIdMap.set(timeline.id, nextFilePath);
  }

  const nextCompositionById = new Map(library.map((composition) => {
    const nextPath = snapshot.compositionFilePaths[composition.id] ?? composition.filePath;
    return [composition.id, { ...composition, filePath: nextPath }];
  }));

  const nextTimelineById = new Map(timelines.map((timeline) => {
    const nextPath = snapshot.timelineFilePaths[timeline.id] ?? timeline.filePath;
    return [timeline.id, {
      ...timeline,
      id: nextPath,
      filePath: nextPath,
    }];
  }));

  const orderedCompositionIds = new Set(snapshot.compositionOrder);
  const orderedTimelineIds = new Set(snapshot.timelineOrder);

  const nextCompositionLibrary = [
    ...snapshot.compositionOrder.flatMap((id) => nextCompositionById.get(id) ?? []),
    ...library.filter((composition) => !orderedCompositionIds.has(composition.id)).map((composition) => nextCompositionById.get(composition.id) ?? composition)
  ];

  const nextTimelines = [
    ...snapshot.timelineOrder.flatMap((id) => nextTimelineById.get(id) ?? []),
    ...timelines.filter((timeline) => !orderedTimelineIds.has(timeline.id)).map((timeline) => nextTimelineById.get(timeline.id) ?? timeline)
  ];

  return {
    compositionSources: nextSources,
    project: {
      ...project,
      assets: snapshot.assets,
      compositionSources: nextSources,
      compositionFolders: snapshot.compositionFolders,
      editorState: {
        ...(project.editorState ?? defaultEditorState),
        fileManagerState: snapshot.fileManagerState,
        selectedSceneId: timelineIdMap.get(project.editorState?.selectedSceneId ?? "") ?? project.editorState?.selectedSceneId,
        selectedTimelineId: timelineIdMap.get(project.editorState?.selectedTimelineId ?? "") ?? project.editorState?.selectedTimelineId,
        selectedPartId: project.editorState?.selectedPartId,
      },
      compositionLibrary: nextCompositionLibrary,
      timelines: nextTimelines,
    },
  };
}
