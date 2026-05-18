import { useEffect } from "react";
import { isTextEditingTarget } from "../features/shortcuts/useGlobalEditorShortcuts";

export function usePointerFocusCleanup() {
  useEffect(() => {
    function blurPointerFocusedControl(event: PointerEvent) {
      if (event.pointerType === "keyboard") return;
      const target = event.target as HTMLElement | null;
      const control = target?.closest(
        "button, [role='button'], [role='switch'], [role='checkbox'], [role='combobox'], [data-radix-select-trigger]",
      ) as HTMLElement | null;
      if (!control || isTextEditingTarget(control)) return;
      requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active === control || control.contains(active)))
          active.blur();
      });
    }

    document.addEventListener("pointerup", blurPointerFocusedControl, true);
    document.addEventListener("click", blurPointerFocusedControl, true);
    return () => {
      document.removeEventListener(
        "pointerup",
        blurPointerFocusedControl,
        true,
      );
      document.removeEventListener("click", blurPointerFocusedControl, true);
    };
  }, []);
}
