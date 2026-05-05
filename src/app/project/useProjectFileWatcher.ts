import { useEffect, useRef } from "react";
type UseProjectFileWatcherInput = {
  manifestPath: string;
  reloadProject: () => Promise<void>;
  isFileSystemBusy?: boolean;
};

const RELOAD_COOLDOWN_MS = 2000;

export function useProjectFileWatcher({
  manifestPath,
  reloadProject,
  isFileSystemBusy,
}: UseProjectFileWatcherInput) {
  const debounceRef = useRef(0);
  const reloadProjectRef = useRef(reloadProject);
  const lastReloadRef = useRef(0);
  const isFileSystemBusyRef = useRef(isFileSystemBusy);
  reloadProjectRef.current = reloadProject;
  isFileSystemBusyRef.current = isFileSystemBusy;
  useEffect(() => {
    const directories = [manifestPath.replace(/\/project\.json$/, "/file-manager")].filter(Boolean);

    void window.clipper?.watchProjectFiles?.({ files: [], directories });

    const cleanup = window.clipper?.onProjectFileChanged?.(() => {
      if (isFileSystemBusyRef.current) return;
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const now = Date.now();
        if (now - lastReloadRef.current < RELOAD_COOLDOWN_MS) return;
        if (isFileSystemBusyRef.current) return;
        lastReloadRef.current = now;
        void reloadProjectRef.current();
      }, 300);
    });

    return () => {
      window.clearTimeout(debounceRef.current);
      cleanup?.();
      void window.clipper?.watchProjectFiles?.({ files: [], directories: [] });
    };
  }, [manifestPath]);
}
