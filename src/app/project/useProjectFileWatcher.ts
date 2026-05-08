import { useEffect, useRef } from "react";
type UseProjectFileWatcherInput = {
  manifestPath: string;
  reloadProject: (changedPath?: string) => Promise<void>;
  isFileSystemBusy?: boolean;
};

const RELOAD_DEBOUNCE_MS = 250;

export function useProjectFileWatcher({
  manifestPath,
  reloadProject,
  isFileSystemBusy,
}: UseProjectFileWatcherInput) {
  const debounceRef = useRef(0);
  const queuedPathRef = useRef<string | undefined>(undefined);
  const reloadingRef = useRef(false);
  const reloadProjectRef = useRef(reloadProject);
  const isFileSystemBusyRef = useRef(isFileSystemBusy);
  reloadProjectRef.current = reloadProject;
  isFileSystemBusyRef.current = isFileSystemBusy;
  useEffect(() => {
    const directories = [manifestPath.replace(/\/project\.json$/, "/file-manager")].filter(Boolean);

    void window.clipper?.watchProjectFiles?.({ files: [], directories });

    const flushReload = async () => {
      if (isFileSystemBusyRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
          void flushReload();
        }, RELOAD_DEBOUNCE_MS);
        return;
      }
      if (reloadingRef.current) return;
      const changedPath = queuedPathRef.current;
      queuedPathRef.current = undefined;
      reloadingRef.current = true;
      try {
        await reloadProjectRef.current(changedPath);
      } finally {
        reloadingRef.current = false;
        if (queuedPathRef.current && !isFileSystemBusyRef.current) {
          window.clearTimeout(debounceRef.current);
          debounceRef.current = window.setTimeout(() => {
            void flushReload();
          }, RELOAD_DEBOUNCE_MS);
        }
      }
    };

    const cleanup = window.clipper?.onProjectFileChanged?.((changedPath) => {
      queuedPathRef.current = changedPath;
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void flushReload();
      }, RELOAD_DEBOUNCE_MS);
    });

    return () => {
      window.clearTimeout(debounceRef.current);
      cleanup?.();
      void window.clipper?.watchProjectFiles?.({ files: [], directories: [] });
    };
  }, [manifestPath]);
}
