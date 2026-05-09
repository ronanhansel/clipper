import { useEffect } from "react";

type SettingsShortcutOptions = {
  setSettingsOpen: (open: boolean) => void;
};

export function useSettingsShortcut({
  setSettingsOpen,
}: SettingsShortcutOptions) {
  useEffect(() => {
    function openSettingsShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key !== ",") return;
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
