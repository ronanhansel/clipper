import { buttonBase, mutedCaps, panelCard } from "../app/config";
import { adjustmentEffectPackages, installedEffectPackages, motionEffectPackages } from "../core/effects/registry";
import type { TimelineMode } from "../core/types";
import { useRef } from "react";
import type { DragEvent, PointerEvent } from "react";

const effectDragLabels: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.label])),
};

const effectDragAccents: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.accent])),
};

const effectDragGhostOffset = { x: 14, y: 14 };
let activeEffectDragCleanup: (() => void) | null = null;
let activeEffectDragStart: { time: number; x: number; y: number } | null = null;

export type EffectPointerDragDetail = {
  phase: "move" | "drop" | "cancel";
  effect: string;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
};

function getDraggedEffect(event: DragEvent<HTMLElement>) {
  const types = Array.from(event.dataTransfer.types);
  return types.some((type) => type.startsWith("application/x-clipper-effect"));
}

export function ToolsPanel({ timelineMode, canSnapMiddle, onAddAdjustmentLayer, onAddRotationMarker, onAddTranslationMarker, onAddZoomMarker, onSnapMiddle }: { timelineMode: TimelineMode; canSnapMiddle: boolean; onAddAdjustmentLayer: () => void; onAddRotationMarker: () => void; onAddTranslationMarker: () => void; onAddZoomMarker: () => void; onSnapMiddle: () => void }) {
  const isCompositionMode = timelineMode === "composition";
  const toolsPanelRef = useRef<HTMLElement | null>(null);

  function startEffectDrag(event: PointerEvent<HTMLButtonElement>, effect: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    const ghost = document.createElement("span");
    const accent = effectDragAccents[effect] ?? "var(--clipper-accent)";
    const startedAt = performance.now();
    const startPoint = { x: event.clientX, y: event.clientY };
    ghost.textContent = effectDragLabels[effect] ?? effect;
    ghost.style.cssText = `position:fixed;top:0;left:0;z-index:9999;box-sizing:border-box;min-width:116px;pointer-events:none;border:1px solid ${accent};border-radius:10px;background:#111319;color:#f1f3f7;padding:9px 12px;font:700 12px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 14px 34px rgba(0,0,0,0.36),0 0 0 4px color-mix(in srgb, ${accent} 18%, transparent);will-change:transform;`;
    document.body.appendChild(ghost);

    function moveGhost(clientX: number, clientY: number) {
      if (clientX === 0 && clientY === 0) return;
      ghost.style.transform = `translate3d(${clientX + effectDragGhostOffset.x}px, ${clientY + effectDragGhostOffset.y}px, 0)`;
    }

    function setGhostHidden(hidden: boolean) {
      ghost.style.opacity = hidden ? "0" : "1";
    }

    function onDrag(event: globalThis.DragEvent) {
      moveGhost(event.clientX, event.clientY);
      const sourcePanel = toolsPanelRef.current;
      if (!sourcePanel || event.clientX === 0 && event.clientY === 0) return;
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
      if (!hoveredElement || !sourcePanel.contains(hoveredElement)) return;
      const moved = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
      if (performance.now() - startedAt > 120 && moved > 24) cleanup();
    }

    function emitPointerDrag(phase: EffectPointerDragDetail["phase"], pointerEvent: globalThis.PointerEvent) {
      window.dispatchEvent(new CustomEvent<EffectPointerDragDetail>("clipper:effect-pointer-drag", { detail: { phase, effect, clientX: pointerEvent.clientX, clientY: pointerEvent.clientY, shiftKey: pointerEvent.shiftKey } }));
    }

    function onPointerMove(pointerEvent: globalThis.PointerEvent) {
      moveGhost(pointerEvent.clientX, pointerEvent.clientY);
      emitPointerDrag("move", pointerEvent);
    }

    function onPointerUp(pointerEvent: globalThis.PointerEvent) {
      emitPointerDrag("drop", pointerEvent);
      cleanup();
    }

    function onPointerCancel(pointerEvent: globalThis.PointerEvent) {
      emitPointerDrag("cancel", pointerEvent);
      cleanup();
    }

    function onPreview(event: Event) {
      const active = Boolean((event as CustomEvent<{ active: boolean }>).detail?.active);
      setGhostHidden(active);
    }

    let cleanupTimeout = window.setTimeout(cleanup, 30000);
    let cleanedUp = false;

    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      if (activeEffectDragCleanup === cleanup) activeEffectDragCleanup = null;
      activeEffectDragStart = null;
      window.clearTimeout(cleanupTimeout);
      window.removeEventListener("drag", onDrag, true);
      window.removeEventListener("dragover", onDrag, true);
      window.removeEventListener("dragend", cleanup, true);
      window.removeEventListener("drop", cleanup, true);
      window.removeEventListener("pointerup", cleanup, true);
      window.removeEventListener("mouseup", cleanup, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("pointerup", cleanup, true);
      document.removeEventListener("mouseup", cleanup, true);
      window.removeEventListener("clipper:effect-drag-preview", onPreview);
      ghost.remove();
    }

    moveGhost(event.clientX, event.clientY);
    activeEffectDragCleanup?.();
    activeEffectDragCleanup = cleanup;
    activeEffectDragStart = { time: startedAt, x: startPoint.x, y: startPoint.y };
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("clipper:effect-drag-preview", onPreview);
  }

  function cleanupSourceEffectDrag(event: DragEvent<HTMLElement>) {
    if (!getDraggedEffect(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
    if (!activeEffectDragStart) return;
    const moved = Math.hypot(event.clientX - activeEffectDragStart.x, event.clientY - activeEffectDragStart.y);
    if (performance.now() - activeEffectDragStart.time > 120 && moved > 24) activeEffectDragCleanup?.();
  }

  function cleanupNoopEffectDrop(event: DragEvent<HTMLElement>) {
    if (!getDraggedEffect(event)) return;
    event.preventDefault();
    activeEffectDragCleanup?.();
  }

  return (
    <section ref={toolsPanelRef} className="grid gap-3" onDragEnter={cleanupSourceEffectDrag} onDragOver={cleanupSourceEffectDrag} onDrop={cleanupNoopEffectDrop}>
      <button className={`${buttonBase} w-full border-[var(--clipper-accent)] text-left text-[var(--clipper-accent)]`}>Select / Move</button>
      {isCompositionMode ? <div className="grid gap-2 rounded-xl border border-[#2d313b] bg-[#111319] p-3">
        <span className={mutedCaps}>Adjust</span>
        {adjustmentEffectPackages.map((definition) => <button className={`${buttonBase} w-full cursor-grab text-left active:cursor-grabbing`} key={definition.id} onPointerDown={(event) => startEffectDrag(event, definition.id)}>{definition.label}</button>)}
      </div> : null}
      {isCompositionMode ? <div className="grid gap-2 rounded-xl border border-[#2d313b] bg-[#111319] p-3">
        <span className={mutedCaps}>Motion</span>
        {motionEffectPackages.map((definition) => <button className={`${buttonBase} w-full cursor-grab text-left active:cursor-grabbing`} key={definition.id} onPointerDown={(event) => startEffectDrag(event, definition.id)}>{definition.label}</button>)}
        {canSnapMiddle ? <button className={`${buttonBase} w-full border-[var(--clipper-accent-strong)] text-left text-[var(--clipper-accent)]`} title="Mend the neighboring zoom edges to the playhead" onClick={onSnapMiddle}>Mend</button> : null}
      </div> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Edit mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}
