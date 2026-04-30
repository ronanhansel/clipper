import { Eye, EyeOff, Lock, MoreHorizontal, Unlock } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { getEffectPackage } from "../../core/effects/registry";
import type { EffectTimelineGradient } from "../../core/types";
import { Input } from "../ui/input";
import type { EffectDragPreview } from "./timelineTypes";

export function EffectDragPreviewBlock({ blockRef, preview }: { blockRef: RefObject<HTMLDivElement | null>; preview: EffectDragPreview }) {
  if (preview.category === "composition") {
    return <CompositionTimelineBlock blockRef={blockRef} name={preview.label ?? "Composition"} duration={preview.duration} isEmpty={Boolean(preview.isEmpty)} sourceMissing={Boolean(preview.sourceMissing)} selected={false} preview style={{ left: 0, width: 0 }} />;
  }

  const effect = preview.effectId ? getEffectPackage(preview.effectId) : undefined;
  const gradient = effect?.timelineGradient ?? getDefaultTimelineGradient(preview.category === "motion" && preview.kind === "zoom" ? "zoom" : preview.category === "adjustment" ? "adjustment" : "translation");
  const label = effect?.label ?? preview.label ?? preview.effectId ?? "Composition";

  return (
    <div ref={blockRef} className="pointer-events-none absolute left-0 top-0 z-30 box-border min-w-[18px] overflow-hidden rounded-[3px] px-3 py-2 text-xs font-bold opacity-55 shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)]" style={timelineGradientStyle(gradient)}>
      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </div>
  );
}

export function CompositionTimelineBlock({ blockRef, name, duration, isEmpty, sourceMissing, locked = false, selected, preview = false, style, dataAttributes, leftResizeEnabled = false, rightResizeEnabled = false, onClick, onDoubleClick, onPointerDown, onContextMenu, onLeftResize, onRightResize }: { blockRef?: RefObject<HTMLDivElement | null>; name: string; duration: number; isEmpty: boolean; sourceMissing: boolean; locked?: boolean; selected: boolean; preview?: boolean; style: CSSProperties; dataAttributes?: Record<string, string>; leftResizeEnabled?: boolean; rightResizeEnabled?: boolean; onClick?: () => void; onDoubleClick?: () => void; onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void; onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void; onLeftResize?: (event: PointerEvent<HTMLDivElement>) => void; onRightResize?: (event: PointerEvent<HTMLDivElement>) => void }) {
  const fillClass = preview ? "top-0" : "inset-y-0";
  const interactivityClass = preview ? "pointer-events-none z-30" : "";
  const surfaceClass = sourceMissing ? "bg-black text-[#f1f3f7]" : isEmpty ? "bg-[linear-gradient(180deg,#2b2d35,#191b21)] text-[#8c929f] opacity-75" : "bg-[linear-gradient(180deg,#38a86d,#17603c)] text-white";
  const stateClass = selected ? "z-20 opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : preview ? "opacity-90" : locked ? "opacity-45" : "opacity-90";

  function blockPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onPointerDown?.(event);
  }

  return <div ref={blockRef} data-timeline-control {...dataAttributes} role="button" tabIndex={0} className={`absolute ${fillClass} ${interactivityClass} box-border flex min-w-[34px] cursor-default items-end justify-between gap-2 overflow-hidden rounded-[3px] px-3 py-2 text-left text-[13px] leading-none shadow-[inset_1px_0_0_rgb(0_0_0/0.55),inset_-1px_0_0_rgb(0_0_0/0.55)] before:absolute before:left-1/2 before:top-2 before:-translate-x-1/2 before:text-[12px] before:font-extrabold before:text-white/25 before:content-['Clip'] ${surfaceClass} ${stateClass}`} style={style} onClick={locked ? undefined : onClick} onDoubleClick={locked ? undefined : onDoubleClick} onPointerDown={blockPointerDown} onContextMenu={locked ? undefined : onContextMenu}>
    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{sourceMissing ? `Unlinked: ${name}` : name}</span><small className="shrink-0 text-[12px] font-extrabold text-white/80">{duration}s</small>
    <div className={`absolute left-0 top-0 bottom-0 w-2 ${leftResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={leftResizeEnabled && !locked ? onLeftResize : undefined} />
    <div className={`absolute right-0 top-0 bottom-0 w-2 ${rightResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={rightResizeEnabled && !locked ? onRightResize : undefined} />
  </div>;
}

export function LayerLabel({ name, draft, editing, hidden, locked, compactControls, hideLockControl, menuOpen, canMoveDown = true, canMoveUp = true, addAfterLabel = "Add layer below", addBeforeLabel = "Add layer above", removeLabel = "Remove layer", onAddAfter, onAddBefore, onCancel, onCommit, onDraftChange, onEdit, onEffectDragOver, onEffectDrop, onMenuToggle, onMoveDown, onMoveUp, onRemove, onToggleHidden, onToggleLocked }: { name: string; draft: string; editing: boolean; hidden: boolean; locked: boolean; compactControls: boolean; hideLockControl: boolean; menuOpen?: boolean; canMoveDown?: boolean; canMoveUp?: boolean; addAfterLabel?: string; addBeforeLabel?: string; removeLabel?: string; onAddAfter?: () => void; onAddBefore?: () => void; onCancel: () => void; onCommit: () => void; onDraftChange: (value: string) => void; onEdit: () => void; onEffectDragOver?: (event: DragEvent<HTMLDivElement>) => void; onEffectDrop?: (event: DragEvent<HTMLDivElement>) => void; onMenuToggle?: () => void; onMoveDown?: () => void; onMoveUp?: () => void; onRemove?: () => void; onToggleHidden: () => void; onToggleLocked: () => void }) {
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    function updateMenuPosition() {
      const buttonRect = menuButtonRef.current?.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      if (!buttonRect || !menuRect) return;

      const gap = 6;
      const margin = 8;
      let x = buttonRect.right - menuRect.width;
      let y = buttonRect.bottom + gap;

      if (x + menuRect.width > window.innerWidth - margin) x = window.innerWidth - menuRect.width - margin;
      if (x < margin) x = margin;
      if (y + menuRect.height > window.innerHeight - margin) y = buttonRect.top - menuRect.height - gap;
      if (y < margin) y = margin;

      setMenuPosition({ x, y });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || !onMenuToggle) return;
    const closeMenu = onMenuToggle;

    function closeOnOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      closeMenu();
    }

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menuOpen, onMenuToggle]);

  return (
    <div className={`relative grid h-full grid-cols-[1fr_auto] items-start gap-2 pr-0 pt-2 transition ${hidden ? "opacity-45" : locked ? "opacity-70" : ""}`} onDragOver={locked ? undefined : onEffectDragOver} onDrop={locked ? undefined : onEffectDrop}>
      {editing ? <Input autoFocus className="h-7 min-w-0 border-[var(--clipper-accent)] bg-[#111319] text-xs font-bold text-[#dfe2ea]" value={draft} onBlur={onCommit} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCommit(); if (event.key === "Escape") onCancel(); }} /> : <button className={`relative min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md py-1 pl-0 pr-1 text-left text-[12px] font-bold transition before:absolute before:left-0 before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-[var(--clipper-accent)] before:opacity-0 before:transition-opacity ${locked ? "cursor-default text-[#ff6b6b]" : "cursor-text text-[#9b9da7] hover:bg-[#20232c]/70 hover:text-[#dfe2ea] hover:before:opacity-100 focus-visible:bg-[#20232c]/70 focus-visible:outline-none focus-visible:before:opacity-100"}`} title={locked ? "Unlock layer to rename" : "Double-click to rename"} onDoubleClick={locked ? undefined : onEdit}>{name}</button>}
      <div className="flex flex-col items-start gap-0.5 self-start justify-self-end pr-2">
        {onMenuToggle ? <button ref={menuButtonRef} data-timeline-control className="grid h-5 w-5 place-items-center rounded text-[#dfe2ea] transition hover:bg-[#20232c] hover:text-[#37d6c2]" title="Layer options" onClick={onMenuToggle}><MoreHorizontal size={13} /></button> : null}
        {compactControls ? null : <button data-timeline-control className={`grid h-5 w-5 place-items-center rounded transition ${locked ? "text-[#737884]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-[#37d6c2]"}`} title={locked ? "Unlock layer before hiding" : hidden ? "Show layer" : "Hide layer"} disabled={locked} onClick={onToggleHidden}>{hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
        {hideLockControl ? null : <button data-timeline-control className={`grid h-5 w-5 place-items-center rounded transition ${locked ? "bg-[#20232c] text-[#37d6c2]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-[#37d6c2]"}`} title={locked ? "Unlock layer" : "Lock layer"} onClick={onToggleLocked}>{locked ? <Lock size={12} /> : <Unlock size={12} />}</button>}
      </div>
      {menuOpen && typeof document !== "undefined" ? createPortal(<div ref={menuRef} data-timeline-control className="fixed z-50 grid min-w-[180px] overflow-hidden rounded-xl border border-[#2d313b] bg-[#111319] py-1 text-xs font-bold text-[#dfe2ea] shadow-[0_18px_48px_rgba(0,0,0,0.48)]" style={{ left: menuPosition?.x ?? 0, top: menuPosition?.y ?? 0, visibility: menuPosition ? "visible" : "hidden" }}>
        <button className="px-3 py-2 text-left hover:bg-[#20232c]" onClick={onToggleLocked}>{locked ? "Unlock layer" : "Lock layer"}</button>
        <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onToggleHidden}>{hidden ? "Enable layer" : "Disable layer"}</button>
        {onMoveUp && canMoveUp ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onMoveUp}>Move up</button> : null}
        {onMoveDown && canMoveDown ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onMoveDown}>Move down</button> : null}
        {onAddBefore ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onAddBefore}>{addBeforeLabel}</button> : null}
        {onAddAfter ? <button className="px-3 py-2 text-left hover:bg-[#20232c] disabled:cursor-not-allowed disabled:text-[#737884] disabled:hover:bg-transparent" disabled={locked} onClick={onAddAfter}>{addAfterLabel}</button> : null}
        {onRemove ? <button className="px-3 py-2 text-left text-[#ffb4b4] hover:bg-[#2a1719] disabled:cursor-not-allowed disabled:text-[#73575b] disabled:hover:bg-transparent" disabled={locked} onClick={onRemove}>{removeLabel}</button> : null}
      </div>, document.body) : null}
    </div>
  );
}

export function LayerResizeSeparator({ top, onPointerDown }: { top: number; onPointerDown: (event: PointerEvent<HTMLElement>) => void }) {
  return <div className="absolute left-0 right-0 z-40 h-2 -translate-y-1 cursor-row-resize transition before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:bg-[#2d313b] before:content-[''] hover:bg-[rgb(var(--clipper-accent-rgb)/0.08)] hover:before:bg-[var(--clipper-accent)]" style={{ top }} onPointerDown={onPointerDown} />;
}

export function getDefaultTimelineGradient(variant: "adjustment" | "translation" | "zoom"): EffectTimelineGradient {
  if (variant === "adjustment") return { from: "#a77cff", to: "#5f35c6", text: "#ffffff" };
  if (variant === "zoom") return { from: "#f0c95a", to: "#b88312", text: "#1a1202" };
  return { from: "#24b7c9", to: "#127c8d", text: "#ffffff" };
}

export function timelineGradientStyle(gradient: EffectTimelineGradient): CSSProperties {
  return {
    background: `linear-gradient(180deg, ${gradient.from}, ${gradient.to})`,
    color: gradient.text ?? "#ffffff",
  };
}

export function TimelineLayerLane({ hidden, locked = false, overflowVisible = false, className = "block", children, onClick, onContextMenu, onDragOver, onDrop, onPointerCancel, onPointerDown, onPointerMove, onPointerUp }: { hidden: boolean; locked?: boolean; overflowVisible?: boolean; className?: string; children: ReactNode; onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void; onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void; onDragOver?: (event: DragEvent<HTMLDivElement>) => void; onDrop?: (event: DragEvent<HTMLDivElement>) => void; onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void; onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void }) {
  return <div className={`relative h-full min-h-0 ${className} ${overflowVisible ? "overflow-visible" : "overflow-hidden"} border-x border-[#2d313b] bg-[#111319] transition ${hidden ? "opacity-35" : locked ? "opacity-55" : ""}`} onClick={onClick} onContextMenu={onContextMenu} onDragOver={onDragOver} onDrop={onDrop} onPointerCancel={onPointerCancel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>{children}</div>;
}

export function TimelineBlock({ variant, gradient, selected, locked = false, muted, squareLeft, squareRight, leftResizeEnabled = true, rightResizeEnabled = true, style, children, leftHandle, rightHandle, dataAttributes, onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLeftResize, onRightResize, onContextMenu }: { variant: "adjustment" | "translation" | "zoom"; gradient?: EffectTimelineGradient; selected: boolean; locked?: boolean; muted?: boolean; squareLeft?: boolean; squareRight?: boolean; leftResizeEnabled?: boolean; rightResizeEnabled?: boolean; style: CSSProperties; children: ReactNode; leftHandle?: ReactNode; rightHandle?: ReactNode; dataAttributes: Record<string, string>; onClick: () => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onPointerMove?: (event: PointerEvent<HTMLDivElement>) => void; onPointerUp?: (event: PointerEvent<HTMLDivElement>) => void; onPointerCancel?: (event: PointerEvent<HTMLDivElement>) => void; onLeftResize: (event: PointerEvent<HTMLDivElement>) => void; onRightResize: (event: PointerEvent<HTMLDivElement>) => void; onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void }) {
  const variantClass = variant === "adjustment" ? "min-w-[34px] text-left font-extrabold" : "min-w-[18px] font-bold";
  const selectionClass = selected ? "z-20 opacity-100 outline outline-2 -outline-offset-2 outline-[var(--clipper-accent)]" : locked ? "opacity-45" : muted ? "opacity-80" : "opacity-85";
  const radiusClass = `${squareLeft ? "rounded-l-none" : ""} ${squareRight ? "rounded-r-none" : ""}`;
  const edgeShadows = [
    squareLeft ? null : "inset 1px 0 0 rgba(0, 0, 0, 0.55)",
    squareRight ? null : "inset -1px 0 0 rgba(0, 0, 0, 0.55)",
  ].filter(Boolean).join(", ");
  const blockStyle = { ...style, ...timelineGradientStyle(gradient ?? getDefaultTimelineGradient(variant)), boxShadow: edgeShadows || undefined };

  function blockPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onPointerDown(event);
  }

  return <div data-timeline-control {...dataAttributes} role="button" tabIndex={0} className={`absolute inset-y-0 box-border cursor-default overflow-hidden rounded-[3px] px-3 py-2 text-xs ${radiusClass} ${variantClass} ${selectionClass}`} style={blockStyle} onClick={locked ? undefined : onClick} onPointerDown={blockPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={locked ? undefined : onContextMenu}>
    {children}
    <div className={`absolute left-0 top-0 bottom-0 w-2 ${leftResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={leftResizeEnabled && !locked ? onLeftResize : undefined}>{leftHandle}</div>
    <div className={`absolute right-0 top-0 bottom-0 w-2 ${rightResizeEnabled && !locked ? "cursor-ew-resize" : "pointer-events-none cursor-default"}`} onPointerDown={rightResizeEnabled && !locked ? onRightResize : undefined}>{rightHandle}</div>
  </div>;
}
