import { useEffect, useRef } from "react";
import type { Part, ProjectManifest } from "../../core/types";

type UseProjectFileWatcherInput = {
  manifestPath: string;
  project: ProjectManifest;
  compositionSources: Record<string, string>;
  updateCompositionFromSource: (basePart: Part, source: string, options?: { syncSource?: boolean; history?: boolean }) => Promise<void>;
  replaceProject: (nextProject: ProjectManifest, options?: { history?: boolean; syncSources?: boolean }) => void;
  reloadProject: () => Promise<void>;
  notifyError: (error: unknown, fallback: string) => void;
};

const RELOAD_COOLDOWN_MS = 2000;

export function useProjectFileWatcher({
  manifestPath,
  reloadProject,
}: UseProjectFileWatcherInput) {
  const debounceRef = useRef(0);
  const reloadProjectRef = useRef(reloadProject);
  const lastReloadRef = useRef(0);
  reloadProjectRef.current = reloadProject;
  const isDirectory = !manifestPath.endsWith(".clipper");

  useEffect(() => {
    if (!isDirectory) return;

    const directories = [manifestPath.replace(/\/project\.json$/, "/file-manager")].filter(Boolean);

    void window.clipper?.watchProjectFiles?.({ files: [], directories });

    const cleanup = window.clipper?.onProjectFileChanged?.(() => {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const now = Date.now();
        if (now - lastReloadRef.current < RELOAD_COOLDOWN_MS) return;
        lastReloadRef.current = now;
        void reloadProjectRef.current();
      }, 300);
    });

    return () => {
      window.clearTimeout(debounceRef.current);
      cleanup?.();
      void window.clipper?.watchProjectFiles?.({ files: [], directories: [] });
    };
  }, [isDirectory, manifestPath]);
}
