export type ClipperPointerDragPhase = "move" | "drop" | "cancel";

export type ClipperPointerDragDetail<TPayload extends Record<string, unknown>> = TPayload & {
  phase: ClipperPointerDragPhase;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
};

export type PointerDragPreviewDetail = {
  active: boolean;
};

export const effectPointerDragEvent = "clipper:effect-pointer-drag";
export const effectDragPreviewEvent = "clipper:effect-drag-preview";
export const compositionPointerDragEvent = "clipper:composition-pointer-drag";
export const compositionDragPreviewEvent = "clipper:composition-drag-preview";

export type EffectPointerDragDetail = ClipperPointerDragDetail<{
  effect: string;
}>;

export type CompositionPointerDragDetail = ClipperPointerDragDetail<{
  compositionId: string;
  duration: number;
  label: string;
}>;

type StartPointerDragOptions<TPayload extends Record<string, unknown>> = {
  accent: string;
  eventName: string;
  label: string;
  payload: TPayload;
  pointerEvent: Pick<PointerEvent, "clientX" | "clientY" | "button" | "preventDefault">;
  previewEventName?: string;
};

const dragGhostOffset = { x: 10, y: -10 };
let activePointerDragCleanup: (() => void) | null = null;

export function startClipperPointerDrag<TPayload extends Record<string, unknown>>({ accent, eventName, label, payload, pointerEvent, previewEventName }: StartPointerDragOptions<TPayload>) {
  if (pointerEvent.button !== 0) return;
  pointerEvent.preventDefault();

  const ghost = document.createElement("span");
  ghost.textContent = label;
  ghost.style.cssText = `position:fixed;top:0;left:0;z-index:9999;box-sizing:border-box;min-width:104px;pointer-events:none;border:1px solid ${accent};border-radius:9px;background:#111319;color:#f1f3f7;padding:7px 10px;font:700 11px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 14px 34px rgba(0,0,0,0.36),0 0 0 4px color-mix(in srgb, ${accent} 18%, transparent);will-change:transform;`;
  document.body.appendChild(ghost);

  let cleanupTimeout = window.setTimeout(cleanup, 30000);
  let cleanedUp = false;

  function moveGhost(clientX: number, clientY: number) {
    if (clientX === 0 && clientY === 0) return;
    ghost.style.transform = `translate3d(${clientX + dragGhostOffset.x}px, ${clientY + dragGhostOffset.y}px, 0)`;
  }

  function emit(phase: ClipperPointerDragPhase, event: globalThis.PointerEvent) {
    window.dispatchEvent(new CustomEvent<ClipperPointerDragDetail<TPayload>>(eventName, { detail: { ...payload, phase, clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey } }));
  }

  function onPointerMove(event: globalThis.PointerEvent) {
    moveGhost(event.clientX, event.clientY);
    emit("move", event);
  }

  function onPointerUp(event: globalThis.PointerEvent) {
    emit("drop", event);
    cleanup();
  }

  function onPointerCancel(event: globalThis.PointerEvent) {
    emit("cancel", event);
    cleanup();
  }

  function onPreview(event: Event) {
    const active = Boolean((event as CustomEvent<PointerDragPreviewDetail>).detail?.active);
    ghost.style.opacity = active ? "0" : "1";
  }

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (activePointerDragCleanup === cleanup) activePointerDragCleanup = null;
    window.clearTimeout(cleanupTimeout);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerCancel, true);
    if (previewEventName) window.removeEventListener(previewEventName, onPreview);
    ghost.remove();
  }

  moveGhost(pointerEvent.clientX, pointerEvent.clientY);
  activePointerDragCleanup?.();
  activePointerDragCleanup = cleanup;
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  if (previewEventName) window.addEventListener(previewEventName, onPreview);

  return cleanup;
}

export function setClipperPointerDragPreview(previewEventName: string, active: boolean) {
  window.dispatchEvent(new CustomEvent<PointerDragPreviewDetail>(previewEventName, { detail: { active } }));
}
