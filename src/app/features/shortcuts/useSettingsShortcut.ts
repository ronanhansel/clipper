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
    const unsubscribeSettingsShortcut =
      typeof window.clipper?.onSettingsShortcut === "function"
        ? window.clipper.onSettingsShortcut(() => setSettingsOpen(true))
        : undefined;
    return () => {
      window.removeEventListener("keydown", openSettingsShortcut);
      unsubscribeSettingsShortcut?.();
    };
  }, [setSettingsOpen]);
}
