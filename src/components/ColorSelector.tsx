import { Palette, Pipette } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import toast from "react-hot-toast";
import { clamp } from "../core/math";
import { Input } from "./ui/input";

export function ColorSelector({ value, onChange, onPreview }: { value: string; onChange: (value: string) => void; onPreview?: (value: string) => void }) {
  const pickerId = useRef(`clr_${Math.random().toString(36).slice(2)}`);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const boardRectRef = useRef<DOMRect | null>(null);
  const hueRectRef = useRef<DOMRect | null>(null);
  const boardDotRef = useRef<HTMLSpanElement | null>(null);
  const hueDotRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizeHexColor(value));
  const [hue, setHue] = useState(hexToHsv(normalizeHexColor(value)).h);
  const nextColorRef = useRef(draft);
  const nextHueRef = useRef(hue);
  const changeFrameRef = useRef(0);
  const previewFrameRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const next = normalizeHexColor(value);
    const nextHue = hexToHsv(next).h;
    setDraft(next);
    setHue(nextHue);
    nextColorRef.current = next;
    nextHueRef.current = nextHue;
    moveDots(hexToHsv(next), nextHue);
  }, [value]);

  useEffect(() => () => {
    if (changeFrameRef.current) cancelAnimationFrame(changeFrameRef.current);
    if (previewFrameRef.current) cancelAnimationFrame(previewFrameRef.current);
  }, []);

  useEffect(() => {
    function closeOtherPicker(event: Event) {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== pickerId.current) setOpen(false);
    }

    window.addEventListener("clipper:color-picker-open", closeOtherPicker);
    return () => window.removeEventListener("clipper:color-picker-open", closeOtherPicker);
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown, { capture: true });
  }, [open]);

  function togglePicker() {
    setOpen((current) => {
      const next = !current;
      if (next) window.dispatchEvent(new CustomEvent("clipper:color-picker-open", { detail: { id: pickerId.current } }));
      return next;
    });
  }

  function moveDots(nextHsv: { h: number; s: number; v: number }, nextHue: number) {
    if (boardDotRef.current) {
      boardDotRef.current.style.left = `${nextHsv.s * 100}%`;
      boardDotRef.current.style.top = `${(1 - nextHsv.v) * 100}%`;
    }
    if (hueDotRef.current) hueDotRef.current.style.left = `${(nextHue / 360) * 100}%`;
  }

  function scheduleChange(next: string, nextHue = nextHueRef.current) {
    nextColorRef.current = next;
    nextHueRef.current = nextHue;
    moveDots(hexToHsv(next), nextHue);

    if (!previewFrameRef.current) {
      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = 0;
        setDraft(nextColorRef.current);
        setHue(nextHueRef.current);
      });
    }
    if (draggingRef.current) {
      onPreview?.(nextColorRef.current);
      return;
    }
    if (changeFrameRef.current) return;
    changeFrameRef.current = requestAnimationFrame(() => {
      changeFrameRef.current = 0;
      onChange(nextColorRef.current);
    });
  }

  function commitDragChange() {
    draggingRef.current = false;
    if (changeFrameRef.current) cancelAnimationFrame(changeFrameRef.current);
    changeFrameRef.current = 0;
    onChange(nextColorRef.current);
  }

  function pickFromBoard(event: PointerEvent<HTMLDivElement>) {
    const rect = boardRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const valueLevel = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    scheduleChange(hsvToHex(nextHueRef.current, saturation, valueLevel));
  }

  function pickHue(event: PointerEvent<HTMLDivElement>) {
    const rect = hueRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const nextHue = Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360);
    const hsv = hexToHsv(nextColorRef.current);
    scheduleChange(hsvToHex(nextHue, hsv.s, hsv.v), nextHue);
  }

  async function pickFromScreen() {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) {
      toast.error("Eyedropper is not supported in this runtime.");
      return;
    }

    try {
      const result = await new EyeDropper().open();
      scheduleChange(normalizeHexColor(result.sRGBHex));
    } catch {
      // User cancelled the picker.
    }
  }

  const hsv = hexToHsv(draft);

  return (
    <div ref={rootRef} className="relative">
      <div className="grid grid-cols-[1fr_38px] gap-2">
        <button className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2 text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)]" onClick={togglePicker}>
          <span className="flex items-center gap-2"><span className="h-5 w-5 rounded-md border border-white/20" style={{ background: draft }} /><Palette size={14} />{draft}</span>
        </button>
        <button className="grid place-items-center rounded-[10px] border border-[#2d313b] bg-[#171920] text-[#dfe2ea] transition hover:border-white hover:text-white" title="Sample colour from screen" onClick={() => void pickFromScreen()}><Pipette size={15} /></button>
      </div>
      {open ? <div className="absolute left-0 top-[calc(100%+8px)] z-50 grid w-[246px] gap-3 rounded-2xl border border-[#2d313b] bg-[#101116] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.48)]" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
        <div className="relative h-[146px] touch-none cursor-crosshair overflow-hidden rounded-xl" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue} 100% 50%)` }} onPointerDown={(event) => { event.preventDefault(); draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); boardRectRef.current = event.currentTarget.getBoundingClientRect(); pickFromBoard(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickFromBoard(event); }} onPointerUp={() => { boardRectRef.current = null; commitDragChange(); }} onPointerCancel={() => { boardRectRef.current = null; commitDragChange(); }}>
          <span ref={boardDotRef} className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left,top]" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div className="relative h-4 touch-none cursor-ew-resize rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]" onPointerDown={(event) => { event.preventDefault(); draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); hueRectRef.current = event.currentTarget.getBoundingClientRect(); pickHue(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickHue(event); }} onPointerUp={() => { hueRectRef.current = null; commitDragChange(); }} onPointerCancel={() => { hueRectRef.current = null; commitDragChange(); }}>
          <span ref={hueDotRef} className="pointer-events-none absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]" style={{ left: `${(hue / 360) * 100}%` }} />
        </div>
        <Input value={draft} onChange={(event) => scheduleChange(normalizeHexColor(event.target.value))} />
      </div> : null}
    </div>
  );
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const expanded = /^#[0-9a-fA-F]{3}$/.test(trimmed) ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}` : trimmed;
  return /^#[0-9a-fA-F]{6}$/.test(expanded) ? expanded.toUpperCase() : "#000000";
}

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{3}$/.test(value.trim()) || /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

export function getEditableColorStyleEntries(style: Record<string, string | number>) {
  const colorKeys = new Set(["background", "backgroundColor", "color", "borderColor", "fill", "stroke"]);
  return Object.entries(style).flatMap(([key, value]) => (colorKeys.has(key) && typeof value === "string" && isHexColor(value) ? [[key, value] as [string, string]] : []));
}

export function formatStyleLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function hexToHsv(hex: string) {
  const normalized = normalizeHexColor(hex).slice(1);
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0 && max === r) h = 60 * (((g - b) / delta) % 6);
  if (delta !== 0 && max === g) h = 60 * ((b - r) / delta + 2);
  if (delta !== 0 && max === b) h = 60 * ((r - g) / delta + 4);
  return { h: Math.round(h < 0 ? h + 360 : h), s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
