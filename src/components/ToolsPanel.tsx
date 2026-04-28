import { buttonBase, mutedCaps, panelCard } from "../app/config";
import type { TimelineMode } from "../core/types";

export function ToolsPanel({ timelineMode, canSnapMiddle, onAddAdjustmentLayer, onAddTranslationMarker, onAddZoomMarker, onSnapMiddle }: { timelineMode: TimelineMode; canSnapMiddle: boolean; onAddAdjustmentLayer: () => void; onAddTranslationMarker: () => void; onAddZoomMarker: () => void; onSnapMiddle: () => void }) {
  const isCompositionMode = timelineMode === "composition";

  return (
    <section className="grid gap-3">
      <button className={`${buttonBase} w-full border-[var(--clipper-accent)] text-left text-[var(--clipper-accent)]`}>Select / Move</button>
      {isCompositionMode ? <div className="grid gap-2 rounded-xl border border-[#2d313b] bg-[#111319] p-3">
        <span className={mutedCaps}>Adjust</span>
        <button className={`${buttonBase} w-full text-left`} onClick={onAddAdjustmentLayer}>Frame Skip</button>
      </div> : null}
      {isCompositionMode ? <div className="grid gap-2 rounded-xl border border-[#2d313b] bg-[#111319] p-3">
        <span className={mutedCaps}>Motion</span>
        <button className={`${buttonBase} w-full text-left`} onClick={onAddZoomMarker}>Zoom</button>
        <button className={`${buttonBase} w-full text-left`} onClick={onAddTranslationMarker}>Pan</button>
        {canSnapMiddle ? <button className={`${buttonBase} w-full border-[var(--clipper-accent-strong)] text-left text-[var(--clipper-accent)]`} title="Mend the neighboring zoom edges to the playhead" onClick={onSnapMiddle}>Mend</button> : null}
      </div> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Edit mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}
