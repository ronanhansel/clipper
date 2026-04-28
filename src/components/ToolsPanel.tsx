import { buttonBase, panelCard } from "../app/config";
import type { TimelineMode } from "../core/types";

export function ToolsPanel({ timelineMode, canSnapMiddle, onAddTranslationMarker, onAddZoomMarker, onSnapMiddle }: { timelineMode: TimelineMode; canSnapMiddle: boolean; onAddTranslationMarker: () => void; onAddZoomMarker: () => void; onSnapMiddle: () => void }) {
  const isCompositionMode = timelineMode === "composition";

  return (
    <section className="grid gap-3">
      <button className={`${buttonBase} w-full border-[var(--clipper-accent)] text-left text-[var(--clipper-accent)]`}>Select / Move</button>
      {isCompositionMode ? <button className={`${buttonBase} w-full text-left`} onClick={onAddZoomMarker}>Add Zoom Marker</button> : null}
      {isCompositionMode ? <button className={`${buttonBase} w-full text-left`} onClick={onAddTranslationMarker}>Add Pan Marker</button> : null}
      {isCompositionMode && canSnapMiddle ? <button className={`${buttonBase} w-full border-[var(--clipper-accent-strong)] text-left text-[var(--clipper-accent)]`} title="Mend the neighboring zoom edges to the playhead" onClick={onSnapMiddle}>Mend</button> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Edit mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}
