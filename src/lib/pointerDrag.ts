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
  isEmpty: boolean;
  label: string;
  sourceMissing: boolean;
}>;

let activeCompositionPointerDrag: CompositionPointerDragDetail | null = null;

export function setActiveCompositionPointerDrag(detail: CompositionPointerDragDetail | null) {
  activeCompositionPointerDrag = detail;
}

export function getActiveCompositionPointerDrag() {
  return activeCompositionPointerDrag;
}

export function dispatchClipperPointerDrag<TPayload extends Record<string, unknown>>(eventName: string, detail: ClipperPointerDragDetail<TPayload>) {
  if (eventName === compositionPointerDragEvent) {
    setActiveCompositionPointerDrag(detail.phase === "move" ? detail as unknown as CompositionPointerDragDetail : null);
  }
  window.dispatchEvent(new CustomEvent<ClipperPointerDragDetail<TPayload>>(eventName, { detail }));
}

type StartPointerDragOptions<TPayload extends Record<string, unknown>> = {
  accent: string;
  activationDelayMs?: number;
  eventName: string;
  label: string;
  payload: TPayload;
  pointerEvent: Pick<PointerEvent, "clientX" | "clientY" | "button" | "preventDefault" | "shiftKey">;
  previewEventName?: string;
  skipPreventDefault?: boolean;
};

export const clipperDragGhostOffset = { x: 12, y: 12 };
export const clipperDragGhostClassName = "clipper-drag-preview pointer-events-none fixed left-0 top-0 z-[9999] inline-grid min-w-[104px] max-w-[260px] grid-cols-[16px_minmax(0,1fr)] items-center gap-2 rounded-[9px] border border-[var(--clipper-accent)] bg-[#111319] px-2.5 py-[7px] text-[11px] font-bold text-[#f1f3f7] shadow-[0_14px_34px_rgba(0,0,0,0.36),0_0_0_4px_color-mix(in_srgb,var(--clipper-accent)_18%,transparent)]";
const defaultPointerDragActivationDelayMs = 160;
let activePointerDragCleanup: (() => void) | null = null;

export function getClipperDragGhostCssText(accent: string) {
  return `position:fixed;top:0;left:0;z-index:9999;box-sizing:border-box;min-width:104px;max-width:260px;pointer-events:none;border:1px solid ${accent};border-radius:9px;background:#111319;color:#f1f3f7;padding:7px 10px;font:700 11px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 14px 34px rgba(0,0,0,0.36),0 0 0 4px color-mix(in srgb, ${accent} 18%, transparent);will-change:transform;`;
}

export function startClipperPointerDrag<TPayload extends Record<string, unknown>>({ accent, activationDelayMs = defaultPointerDragActivationDelayMs, eventName, label, payload, pointerEvent, previewEventName, skipPreventDefault }: StartPointerDragOptions<TPayload>) {
  if (pointerEvent.button !== 0) return;
  if (!skipPreventDefault) pointerEvent.preventDefault();

  let ghost: HTMLSpanElement | null = null;
  let active = false;
  let lastPointer = { clientX: pointerEvent.clientX, clientY: pointerEvent.clientY, shiftKey: pointerEvent.shiftKey };
  const activationTimeout = window.setTimeout(activate, activationDelayMs);
  let cleanupTimeout = window.setTimeout(cleanup, 30000);
  let cleanedUp = false;

  function activate() {
    if (cleanedUp || active) return;
    active = true;
    ghost = document.createElement("span");
    ghost.textContent = label;
    ghost.style.cssText = getClipperDragGhostCssText(accent);
    document.body.appendChild(ghost);
    moveGhost(lastPointer.clientX, lastPointer.clientY);
    emitFromPointer("move", lastPointer);
  }

  function moveGhost(clientX: number, clientY: number) {
    if (!ghost) return;
    if (clientX === 0 && clientY === 0) return;
    ghost.style.transform = `translate3d(${clientX + clipperDragGhostOffset.x}px, ${clientY + clipperDragGhostOffset.y}px, 0)`;
  }

  function emitFromPointer(phase: ClipperPointerDragPhase, pointer: typeof lastPointer) {
    const detail = { ...payload, phase, clientX: pointer.clientX, clientY: pointer.clientY, shiftKey: pointer.shiftKey } as ClipperPointerDragDetail<TPayload>;
    dispatchClipperPointerDrag(eventName, detail);
  }

  function emit(phase: ClipperPointerDragPhase, event: globalThis.PointerEvent) {
    const detail = { ...payload, phase, clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey } as ClipperPointerDragDetail<TPayload>;
    dispatchClipperPointerDrag(eventName, detail);
  }

  function emitFromMouse(phase: ClipperPointerDragPhase, event: globalThis.MouseEvent) {
    const detail = { ...payload, phase, clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey } as ClipperPointerDragDetail<TPayload>;
    dispatchClipperPointerDrag(eventName, detail);
  }

  function onPointerMove(event: globalThis.PointerEvent) {
    lastPointer = { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey };
    if (!active) return;
    moveGhost(event.clientX, event.clientY);
    emit("move", event);
  }

  function onPointerUp(event: globalThis.PointerEvent) {
    if (!active) {
      cleanup();
      return;
    }
    emit("drop", event);
    cleanup();
  }

  function onPointerCancel(event: globalThis.PointerEvent) {
    if (active) emit("cancel", event);
    cleanup();
  }

  function onMouseUp(event: globalThis.MouseEvent) {
    if (active) emitFromMouse("drop", event);
    cleanup();
  }

  function onPreview(event: Event) {
    const active = Boolean((event as CustomEvent<PointerDragPreviewDetail>).detail?.active);
    if (ghost) ghost.style.opacity = active ? "0" : "1";
  }

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    if (activePointerDragCleanup === cleanup) activePointerDragCleanup = null;
    window.clearTimeout(activationTimeout);
    window.clearTimeout(cleanupTimeout);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerCancel, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerCancel, true);
    document.removeEventListener("mouseup", onMouseUp, true);
    if (previewEventName) window.removeEventListener(previewEventName, onPreview);
    ghost?.remove();
  }

  activePointerDragCleanup?.();
  activePointerDragCleanup = cleanup;
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerCancel, true);
  document.addEventListener("mouseup", onMouseUp, true);
  if (previewEventName) window.addEventListener(previewEventName, onPreview);

  return cleanup;
}

export function setClipperPointerDragPreview(previewEventName: string, active: boolean) {
  window.dispatchEvent(new CustomEvent<PointerDragPreviewDetail>(previewEventName, { detail: { active } }));
}

export function cancelActiveClipperPointerDrag() {
  activePointerDragCleanup?.();
}
