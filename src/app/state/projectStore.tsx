import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { ProjectManifest } from "../../core/types";

type Setter<T> = T | ((current: T) => T);

export type ProjectStoreState = {
  project: ProjectManifest;
  savedProjectSnapshot: string;
  compositionSources: Record<string, string>;
  savedCompositionSourcesSnapshot: string;
};

export type ProjectStoreActions = {
  setProject: (project: Setter<ProjectManifest>) => void;
  setProjectDocument: (project: ProjectManifest, compositionSources: Record<string, string>) => void;
  setSavedProjectSnapshot: (snapshot: Setter<string>) => void;
  setCompositionSources: (sources: Setter<Record<string, string>>) => void;
  setSavedCompositionSourcesSnapshot: (snapshot: Setter<string>) => void;
};

export type ProjectStore = ProjectStoreState & ProjectStoreActions;

function resolveSetter<T>(current: T, setter: Setter<T>) {
  return typeof setter === "function" ? (setter as (current: T) => T)(current) : setter;
}

function createFieldSetter<T extends keyof ProjectStoreState>(set: StoreApi<ProjectStore>["setState"], field: T) {
  return (setter: Setter<ProjectStoreState[T]>) => set((state) => {
    const nextValue = resolveSetter(state[field], setter);
    return Object.is(nextValue, state[field]) ? state : ({ [field]: nextValue } as Pick<ProjectStoreState, T>);
  });
}

export function getProjectContentSnapshot(project: ProjectManifest) {
  return JSON.stringify(project);
}

export function getProjectFileContentSnapshot(project: ProjectManifest) {
  const { editorState: _editorState, ...contentProject } = project;
  return JSON.stringify(contentProject);
}

export function createProjectStore(initialProject: ProjectManifest, initialCompositionSources: Record<string, string> = {}) {
  const compositionSources = initialProject.compositionSources ?? initialCompositionSources;
  return createStore<ProjectStore>((set) => ({
    project: initialProject,
    savedProjectSnapshot: getProjectContentSnapshot(initialProject),
    compositionSources,
    savedCompositionSourcesSnapshot: JSON.stringify(compositionSources),
    setProject: createFieldSetter(set, "project"),
    setProjectDocument: (project, compositionSources) => set((state) => (state.project === project && state.compositionSources === compositionSources ? state : { project, compositionSources })),
    setSavedProjectSnapshot: createFieldSetter(set, "savedProjectSnapshot"),
    setCompositionSources: createFieldSetter(set, "compositionSources"),
    setSavedCompositionSourcesSnapshot: createFieldSetter(set, "savedCompositionSourcesSnapshot"),
  }));
}

const ProjectStoreContext = createContext<StoreApi<ProjectStore> | null>(null);

export function ProjectStoreProvider({ children, compositionSources = {}, project }: PropsWithChildren<{ compositionSources?: Record<string, string>; project: ProjectManifest }>) {
  const storeRef = useRef<StoreApi<ProjectStore> | null>(null);
  if (!storeRef.current) storeRef.current = createProjectStore(project, compositionSources);
  return <ProjectStoreContext.Provider value={storeRef.current}>{children}</ProjectStoreContext.Provider>;
}

export function useProjectStore<T>(selector: (store: ProjectStore) => T) {
  const store = useContext(ProjectStoreContext);
  if (!store) throw new Error("useProjectStore must be used within ProjectStoreProvider");
  return useStore(store, selector);
}

export function useProjectDocumentState() {
  return useProjectStore(useShallow((state) => ({
    project: state.project,
    setProject: state.setProject,
    setProjectDocument: state.setProjectDocument,
    savedProjectSnapshot: state.savedProjectSnapshot,
    setSavedProjectSnapshot: state.setSavedProjectSnapshot,
    compositionSources: state.compositionSources,
    setCompositionSources: state.setCompositionSources,
    savedCompositionSourcesSnapshot: state.savedCompositionSourcesSnapshot,
    setSavedCompositionSourcesSnapshot: state.setSavedCompositionSourcesSnapshot,
  })));
}
