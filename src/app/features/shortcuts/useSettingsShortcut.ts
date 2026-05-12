import { useEffect } from "react";
import { isTextEditingTarget } from "./useGlobalEditorShortcuts";

type SettingsShortcutOptions = {
  setSettingsOpen: (open: boolean) => void;
};

export function useSettingsShortcut({
  setSettingsOpen,
}: SettingsShortcutOptions) {
  useEffect(() => {
    function openSettingsShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== ",") return;
      if (
        isTextEditingTarget(event.target as HTMLElement | null) ||
        isTextEditingTarget(document.activeElement as HTMLElement | null)
      )
        return;
      event.preventDefault();
      setSettingsOpen(true);
    }

    window.addEventListener("keydown", openSettingsShortcut);
    const unsubscribeSettingsShortcut = window.clipper?.onSettingsShortcut?.(
      () => setSettingsOpen(true),
    );
    return () => {
      window.removeEventListener("keydown", openSettingsShortcut);
      unsubscribeSettingsShortcut?.();
    };
  }, [setSettingsOpen]);
}
