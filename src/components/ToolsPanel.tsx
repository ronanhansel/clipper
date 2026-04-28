import { buttonBase, mutedCaps, panelCard } from "../app/config";
import type { TimelineMode } from "../core/types";
import type { DragEvent } from "react";

export function ToolsPanel({ timelineMode, canSnapMiddle, onAddAdjustmentLayer, onAddRotationMarker, onAddTranslationMarker, onAddZoomMarker, onSnapMiddle }: { timelineMode: TimelineMode; canSnapMiddle: boolean; onAddAdjustmentLayer: () => void; onAddRotationMarker: () => void; onAddTranslationMarker: () => void; onAddZoomMarker: () => void; onSnapMiddle: () => void }) {
  const isCompositionMode = timelineMode === "composition";

  function startEffectDrag(event: DragEvent<HTMLButtonElement>, effect: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-clipper-effect", effect);
    event.dataTransfer.setData(`application/x-clipper-effect-${effect.replace(":", "-").toLowerCase()}`, "1");
    event.dataTransfer.setData("text/plain", effect);
    const dragImage = document.createElement("span");
    dragImage.style.cssText = "position:fixed;top:-20px;left:-20px;width:1px;height:1px;opacity:0;";
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 0, 0);
    window.requestAnimationFrame(() => dragImage.remove());
  }

  return (
    <section className="grid gap-3">
      <button className={`${buttonBase} w-full border-[var(--clipper-accent)] text-left text-[var(--clipper-accent)]`}>Select / Move</button>
      {isCompositionMode ? <div className="grid gap-2 rounded-xl border border-[#2d313b] bg-[#111319] p-3">
        <span className={mutedCaps}>Adjust</span>
        <button draggable className={`${buttonBase} w-full cursor-grab text-left active:cursor-grabbing`} onDragStart={(event) => startEffectDrag(event, "adjust:frameSkip")}>Frame Skip</button>
      </div> : null}
      {isCompositionMode ? <div className="grid gap-2 rounded-xl border border-[#2d313b] bg-[#111319] p-3">
        <span className={mutedCaps}>Motion</span>
        <button draggable className={`${buttonBase} w-full cursor-grab text-left active:cursor-grabbing`} onDragStart={(event) => startEffectDrag(event, "motion:zoom")}>Zoom</button>
        <button draggable className={`${buttonBase} w-full cursor-grab text-left active:cursor-grabbing`} onDragStart={(event) => startEffectDrag(event, "motion:pan")}>Pan</button>
        <button draggable className={`${buttonBase} w-full cursor-grab text-left active:cursor-grabbing`} onDragStart={(event) => startEffectDrag(event, "motion:rotate")}>Rotate</button>
        {canSnapMiddle ? <button className={`${buttonBase} w-full border-[var(--clipper-accent-strong)] text-left text-[var(--clipper-accent)]`} title="Mend the neighboring zoom edges to the playhead" onClick={onSnapMiddle}>Mend</button> : null}
      </div> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Edit mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}
