import { createContext, useContext, useRef, type PropsWithChildren } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { ProjectManifest } from "../../core/types";

type Setter<T> = T | ((current: T) => T);

export type ProjectStoreState = {
  project: ProjectManifest;
  savedProjectSnapshot: string;
  partSources: Record<string, string>;
  savedPartSourcesSnapshot: string;
};

export type ProjectStoreActions = {
  setProject: (project: Setter<ProjectManifest>) => void;
  setSavedProjectSnapshot: (snapshot: Setter<string>) => void;
  setPartSources: (sources: Setter<Record<string, string>>) => void;
  setSavedPartSourcesSnapshot: (snapshot: Setter<string>) => void;
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
  const { editorState: _editorState, ...contentProject } = project;
  return JSON.stringify(contentProject);
}

export function createProjectStore(initialProject: ProjectManifest, initialPartSources: Record<string, string> = {}) {
  return createStore<ProjectStore>((set) => ({
    project: initialProject,
    savedProjectSnapshot: getProjectContentSnapshot(initialProject),
    partSources: initialPartSources,
    savedPartSourcesSnapshot: JSON.stringify(initialPartSources),
    setProject: createFieldSetter(set, "project"),
    setSavedProjectSnapshot: createFieldSetter(set, "savedProjectSnapshot"),
    setPartSources: createFieldSetter(set, "partSources"),
    setSavedPartSourcesSnapshot: createFieldSetter(set, "savedPartSourcesSnapshot"),
  }));
}

const ProjectStoreContext = createContext<StoreApi<ProjectStore> | null>(null);

export function ProjectStoreProvider({ children, partSources = {}, project }: PropsWithChildren<{ partSources?: Record<string, string>; project: ProjectManifest }>) {
  const storeRef = useRef<StoreApi<ProjectStore> | null>(null);
  if (!storeRef.current) storeRef.current = createProjectStore(project, partSources);
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
    savedProjectSnapshot: state.savedProjectSnapshot,
    setSavedProjectSnapshot: state.setSavedProjectSnapshot,
    partSources: state.partSources,
    setPartSources: state.setPartSources,
    savedPartSourcesSnapshot: state.savedPartSourcesSnapshot,
    setSavedPartSourcesSnapshot: state.setSavedPartSourcesSnapshot,
  })));
}
