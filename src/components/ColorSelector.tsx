import { Droplet, Minus, Palette, Pipette, Plus } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { clamp } from "../core/math";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function ColorSelector({
  value,
  onChange,
  onPreview,
  variant = "default",
  pickerMode = "solid",
  allowGradient,
}: {
  value: string;
  onChange: (value: string) => void;
  onPreview?: (value: string) => void;
  variant?: "default" | "compact";
  pickerMode?: "solid" | "gradient" | "solid-gradient";
  /** @deprecated use pickerMode="solid-gradient" */
  allowGradient?: boolean;
}) {
  const resolvedPickerMode = allowGradient ? "solid-gradient" : pickerMode;
  const showsModeTabs = resolvedPickerMode === "solid-gradient";
  const showsGradient = resolvedPickerMode !== "solid";
  const pickerId = useRef(`clr_${Math.random().toString(36).slice(2)}`);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const boardRectRef = useRef<DOMRect | null>(null);
  const hueRectRef = useRef<DOMRect | null>(null);
  const boardDotRef = useRef<HTMLSpanElement | null>(null);
  const hueDotRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [portalPosition, setPortalPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [gradientDraft, setGradientDraft] = useState(parseGradientValue(value));
  const [draft, setDraft] = useState(
    normalizeHexColor(gradientDraft.stops[0]?.color ?? value),
  );
  const [hue, setHue] = useState(
    hexToHsv(normalizeHexColor(gradientDraft.stops[0]?.color ?? value)).h,
  );
  const [mode, setMode] = useState<"solid" | "gradient">(
    resolvedPickerMode === "gradient" ||
      (resolvedPickerMode === "solid-gradient" && isGradientValue(value))
      ? "gradient"
      : "solid",
  );
  const nextColorRef = useRef(draft);
  const nextHueRef = useRef(hue);
  const changeFrameRef = useRef(0);
  const previewFrameRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const nextGradient = parseGradientValue(value);
    setGradientDraft(nextGradient);
    if (resolvedPickerMode === "gradient") setMode("gradient");
    else if (resolvedPickerMode === "solid") setMode("solid");
    else if (isGradientValue(value)) setMode("gradient");
    const next = normalizeHexColor(value);
    const nextHue = hexToHsv(next).h;
    setDraft(next);
    setHue(nextHue);
    nextColorRef.current = next;
    nextHueRef.current = nextHue;
    moveDots(hexToHsv(next), nextHue);
  }, [resolvedPickerMode, value]);

  useEffect(
    () => () => {
      if (changeFrameRef.current) cancelAnimationFrame(changeFrameRef.current);
      if (previewFrameRef.current)
        cancelAnimationFrame(previewFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    function closeOtherPicker(event: Event) {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== pickerId.current) setOpen(false);
    }

    window.addEventListener("clipper:color-picker-open", closeOtherPicker);
    return () =>
      window.removeEventListener("clipper:color-picker-open", closeOtherPicker);
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePortalPosition();

    function closeOnOutsidePointerDown(event: globalThis.PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      )
        setOpen(false);
    }

    function updateOnViewportChange() {
      updatePortalPosition();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown, {
      capture: true,
    });
    window.addEventListener("resize", updateOnViewportChange);
    window.addEventListener("scroll", updateOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown, {
        capture: true,
      });
      window.removeEventListener("resize", updateOnViewportChange);
      window.removeEventListener("scroll", updateOnViewportChange, true);
    };
  }, [mode, open, resolvedPickerMode]);

  function togglePicker() {
    setOpen((current) => {
      const next = !current;
      if (next)
        window.dispatchEvent(
          new CustomEvent("clipper:color-picker-open", {
            detail: { id: pickerId.current },
          }),
        );
      return next;
    });
  }

  function updatePortalPosition() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = showsGradient ? 300 : isCompact ? 210 : 246;
    const estimatedHeight = showsGradient ? 300 : isCompact ? 210 : 280;
    const belowTop = rect.bottom + 6;
    const aboveTop = rect.top - estimatedHeight - 6;
    setPortalPosition({
      left: Math.max(
        8,
        Math.min(window.innerWidth - width - 8, rect.right - width),
      ),
      top:
        belowTop + estimatedHeight <= window.innerHeight - 8
          ? belowTop
          : Math.max(8, aboveTop),
    });
  }

  function moveDots(
    nextHsv: { h: number; s: number; v: number },
    nextHue: number,
  ) {
    if (boardDotRef.current) {
      boardDotRef.current.style.left = `${nextHsv.s * 100}%`;
      boardDotRef.current.style.top = `${(1 - nextHsv.v) * 100}%`;
    }
    if (hueDotRef.current)
      hueDotRef.current.style.left = `${(nextHue / 360) * 100}%`;
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
    const rect =
      boardRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const valueLevel = clamp(
      1 - (event.clientY - rect.top) / rect.height,
      0,
      1,
    );
    scheduleChange(hsvToHex(nextHueRef.current, saturation, valueLevel));
  }

  function pickHue(event: PointerEvent<HTMLDivElement>) {
    const rect =
      hueRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const nextHue = Math.round(
      clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360,
    );
    const hsv = hexToHsv(nextColorRef.current);
    scheduleChange(hsvToHex(nextHue, hsv.s, hsv.v), nextHue);
  }

  async function pickFromScreen() {
    const EyeDropper = (
      window as unknown as {
        EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
      }
    ).EyeDropper;
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

  function commitGradient(next: GradientValue) {
    setGradientDraft(next);
    const formatted = formatGradientValue(next);
    onChange(formatted);
  }

  const hsv = hexToHsv(draft);
  const isCompact = variant === "compact";
  const compactLabel = draft.toUpperCase();
  const pickerPanel = open ? (
    <div
      ref={popupRef}
      className={
        isCompact
          ? `grid ${showsGradient ? "h-[300px] w-[300px]" : "w-[210px]"} max-h-[calc(100vh-16px)] gap-2 overflow-y-auto rounded-xl border border-[#2d313b] bg-[#101116] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.48)]`
          : `grid ${showsGradient ? "h-[300px] w-[300px]" : "w-[246px]"} max-h-[calc(100vh-16px)] gap-3 overflow-y-auto rounded-2xl border border-[#2d313b] bg-[#101116] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.48)]`
      }
      style={
        portalPosition
          ? {
              position: "fixed",
              left: portalPosition.left,
              top: portalPosition.top,
              zIndex: 7000,
            }
          : undefined
      }
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {showsModeTabs ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#0a0b0f] p-1">
          <button
            className={`h-7 rounded-md text-[11px] font-extrabold ${mode === "solid" ? "bg-[#2a2d34] text-white" : "text-[#9aa1ad]"}`}
            onClick={() => setMode("solid")}
          >
            Solid
          </button>
          <button
            className={`h-7 rounded-md text-[11px] font-extrabold ${mode === "gradient" ? "bg-[#2a2d34] text-white" : "text-[#9aa1ad]"}`}
            onClick={() => setMode("gradient")}
          >
            Gradient
          </button>
        </div>
      ) : null}
      {mode === "solid" ? (
        <SolidColorPickerPanel
          value={draft}
          variant={variant}
          onChange={scheduleChange}
          onCommit={commitDragChange}
        />
      ) : null}
      {mode === "gradient" ? (
        <GradientPickerPanel value={gradientDraft} onChange={commitGradient} />
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative">
      <div
        className={
          isCompact
            ? "grid grid-cols-[1fr_24px] gap-1.5"
            : "grid grid-cols-[1fr_38px] gap-2"
        }
      >
        <button
          className={
            isCompact
              ? "flex h-6 w-full min-w-0 items-center justify-between gap-1.5 rounded border border-[#2d313b] bg-[#0c121b] px-1.5 text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)]"
              : "flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2 text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)]"
          }
          onClick={togglePicker}
        >
          <span
            className={
              isCompact
                ? "flex min-w-0 items-center gap-1.5"
                : "flex items-center gap-2"
            }
          >
            <span
              className={
                isCompact
                  ? "h-4 w-4 rounded border border-white/20"
                  : "h-5 w-5 rounded-md border border-white/20"
              }
              style={{
                background:
                  mode === "gradient"
                    ? formatGradientValue(gradientDraft)
                    : draft,
              }}
            />
            {mode === "gradient" ? (
              <Droplet size={isCompact ? 11 : 14} />
            ) : (
              <Palette size={isCompact ? 11 : 14} />
            )}
            <span className={isCompact ? "min-w-0 truncate" : undefined}>
              {isCompact ? compactLabel : draft}
            </span>
          </span>
        </button>
        <button
          className={
            isCompact
              ? "grid h-6 w-6 place-items-center rounded border border-[#2d313b] bg-[#0c121b] text-[#dfe2ea] transition hover:border-white hover:text-white"
              : "grid place-items-center rounded-[10px] border border-[#2d313b] bg-[#171920] text-[#dfe2ea] transition hover:border-white hover:text-white"
          }
          title="Sample colour from screen"
          onClick={() => void pickFromScreen()}
        >
          <Pipette size={isCompact ? 12 : 15} />
        </button>
      </div>
      {pickerPanel ? createPortal(pickerPanel, document.body) : null}
    </div>
  );
}

export function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:\d*\.?\d+))?\s*\)$/i,
  );
  if (rgbMatch)
    return rgbToHex(
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
    );
  const expanded = /^#[0-9a-fA-F]{3}$/.test(trimmed)
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    : trimmed;
  return /^#[0-9a-fA-F]{6}$/.test(expanded)
    ? expanded.toUpperCase()
    : "#000000";
}

export function isHexColor(value: string) {
  return (
    /^#[0-9a-fA-F]{3}$/.test(value.trim()) ||
    /^#[0-9a-fA-F]{6}$/.test(value.trim())
  );
}

export function getEditableColorStyleEntries(
  style: Record<string, string | number>,
) {
  const colorKeys = new Set([
    "background",
    "backgroundColor",
    "color",
    "borderColor",
    "fill",
    "stroke",
  ]);
  return Object.entries(style).flatMap(([key, value]) =>
    colorKeys.has(key) && typeof value === "string" && isHexColor(value)
      ? [[key, value] as [string, string]]
      : [],
  );
}

export function formatStyleLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

type GradientValue = {
  type: "linear" | "radial" | "conic";
  angle: string;
  center: string;
  backgroundSize: string;
  stops: { color: string; position: number; opacity: number }[];
};

function SolidColorPickerPanel({
  value,
  variant,
  onChange,
  onCommit,
}: {
  value: string;
  variant: "default" | "compact";
  onChange: (value: string, hue?: number) => void;
  onCommit?: () => void;
}) {
  const boardRectRef = useRef<DOMRect | null>(null);
  const hueRectRef = useRef<DOMRect | null>(null);
  const boardDotRef = useRef<HTMLSpanElement | null>(null);
  const hueDotRef = useRef<HTMLSpanElement | null>(null);
  const [draft, setDraft] = useState(normalizeHexColor(value));
  const [hue, setHue] = useState(hexToHsv(normalizeHexColor(value)).h);
  const isCompact = variant === "compact";

  useEffect(() => {
    const next = normalizeHexColor(value);
    const nextHue = hexToHsv(next).h;
    setDraft(next);
    setHue(nextHue);
    moveDots(hexToHsv(next), nextHue);
  }, [value]);

  function moveDots(
    nextHsv: { h: number; s: number; v: number },
    nextHue: number,
  ) {
    if (boardDotRef.current) {
      boardDotRef.current.style.left = `${nextHsv.s * 100}%`;
      boardDotRef.current.style.top = `${(1 - nextHsv.v) * 100}%`;
    }
    if (hueDotRef.current)
      hueDotRef.current.style.left = `${(nextHue / 360) * 100}%`;
  }

  function apply(next: string, nextHue = hue) {
    setDraft(next);
    setHue(nextHue);
    moveDots(hexToHsv(next), nextHue);
    onChange(next, nextHue);
  }

  function pickFromBoard(event: PointerEvent<HTMLDivElement>) {
    const rect =
      boardRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const valueLevel = clamp(
      1 - (event.clientY - rect.top) / rect.height,
      0,
      1,
    );
    apply(hsvToHex(hue, saturation, valueLevel));
  }

  function pickHue(event: PointerEvent<HTMLDivElement>) {
    const rect =
      hueRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const nextHue = Math.round(
      clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360,
    );
    const hsv = hexToHsv(draft);
    apply(hsvToHex(nextHue, hsv.s, hsv.v), nextHue);
  }

  const hsv = hexToHsv(draft);
  return (
    <>
      <div
        className={
          isCompact
            ? "relative h-[132px] touch-none cursor-crosshair overflow-hidden rounded-lg"
            : "relative h-[146px] touch-none cursor-crosshair overflow-hidden rounded-xl"
        }
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue} 100% 50%)`,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          boardRectRef.current = event.currentTarget.getBoundingClientRect();
          pickFromBoard(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            pickFromBoard(event);
        }}
        onPointerUp={() => {
          boardRectRef.current = null;
          onCommit?.();
        }}
        onPointerCancel={() => {
          boardRectRef.current = null;
          onCommit?.();
        }}
      >
        <span
          ref={boardDotRef}
          className={
            isCompact
              ? "pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left,top]"
              : "pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left,top]"
          }
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        className={
          isCompact
            ? "relative h-3 touch-none cursor-ew-resize rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
            : "relative h-4 touch-none cursor-ew-resize rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
        }
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          hueRectRef.current = event.currentTarget.getBoundingClientRect();
          pickHue(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            pickHue(event);
        }}
        onPointerUp={() => {
          hueRectRef.current = null;
          onCommit?.();
        }}
        onPointerCancel={() => {
          hueRectRef.current = null;
          onCommit?.();
        }}
      >
        <span
          ref={hueDotRef}
          className={
            isCompact
              ? "pointer-events-none absolute top-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]"
              : "pointer-events-none absolute top-1/2 h-6 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]"
          }
          style={{ left: `${(hue / 360) * 100}%` }}
        />
      </div>
      <Input
        value={draft}
        className={isCompact ? "h-7 text-xs" : undefined}
        onChange={(event) => apply(normalizeHexColor(event.target.value))}
      />
    </>
  );
}

function GradientPickerPanel({
  value,
  onChange,
}: {
  value: GradientValue;
  onChange: (value: GradientValue) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const stopHandleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragFrameRef = useRef(0);
  const draggingStopRef = useRef(false);
  const pendingDragRef = useRef<{ index: number; position: number } | null>(
    null,
  );
  const sourceStops = value.stops.length ? value.stops : defaultGradientStops();
  const [displayStops, setDisplayStops] = useState(sourceStops);
  const stops = displayStops.length ? displayStops : sourceStops;
  const preview = formatGradientValue({ ...value, stops });

  useEffect(() => {
    if (!draggingStopRef.current) setDisplayStops(sourceStops);
  }, [value]);

  useEffect(
    () => () => {
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
    },
    [],
  );

  function updateStop(index: number, patch: Partial<(typeof stops)[number]>) {
    const nextStops = stops.map((stop, stopIndex) =>
      stopIndex === index ? { ...stop, ...patch } : stop,
    );
    setDisplayStops(nextStops);
    onChange({ ...value, stops: nextStops });
  }

  function addStop() {
    onChange({
      ...value,
      stops: [...stops, { color: "#FFFFFF", position: 50, opacity: 100 }].sort(
        (a, b) => a.position - b.position,
      ),
    });
  }

  function removeStop(index: number) {
    if (stops.length <= 2) return;
    onChange({
      ...value,
      stops: stops.filter((_, stopIndex) => stopIndex !== index),
    });
  }

  function pickStopPosition(event: PointerEvent<HTMLElement>, index: number) {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    const position = Math.round(
      clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100,
    );
    draggingStopRef.current = true;
    const handle = stopHandleRefs.current[index];
    if (handle) handle.style.left = getStopHandleLeft(position);
    pendingDragRef.current = {
      index,
      position,
    };
    if (dragFrameRef.current) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = 0;
      const pending = pendingDragRef.current;
      pendingDragRef.current = null;
      if (!pending) return;
      updateStop(pending.index, { position: pending.position });
    });
  }

  function finishStopDrag() {
    draggingStopRef.current = false;
  }

  return (
    <div className="grid gap-2 text-[#dfe2ea]">
      <div className="flex items-center justify-between gap-3">
        <Select
          value={value.type}
          onValueChange={(nextType) =>
            onChange({ ...value, type: nextType as GradientValue["type"] })
          }
        >
          <SelectTrigger className="h-7 w-[132px] rounded-[8px] border-[#2d313b] bg-[#171920] px-2 text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[7100] bg-[#11141a]">
            <SelectGroup>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="radial">Radial</SelectItem>
              <SelectItem value="conic">Angular</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="relative h-[54px] px-2 pt-5">
        <div
          ref={railRef}
          className="h-7 rounded-md border border-white/10"
          style={{ background: preview }}
        />
        {stops.map((stop, index) => (
          <button
            ref={(element) => {
              stopHandleRefs.current[index] = element;
            }}
            key={`${stop.color}-${index}`}
            className="absolute top-[14px] grid h-8 w-5 -translate-x-1/2 place-items-start"
            style={{
              left: getStopHandleLeft(stop.position),
            }}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              pickStopPosition(event, index);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                pickStopPosition(event, index);
            }}
            onPointerUp={finishStopDrag}
            onPointerCancel={finishStopDrag}
          >
            <span className="h-6 w-5 rounded bg-[#343944] p-0.5 shadow-[0_6px_16px_rgba(0,0,0,0.35)] after:absolute after:left-1/2 after:top-[22px] after:-translate-x-1/2 after:border-x-[5px] after:border-t-[6px] after:border-x-transparent after:border-t-[#343944]">
              <span
                className="block h-full rounded-[3px] border border-white/10"
                style={{ background: stop.color }}
              />
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#aeb6c4]">Stops</span>
        <button
          className="grid size-7 place-items-center rounded text-[#dfe2ea] hover:bg-[#171920]"
          type="button"
          onClick={addStop}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="grid gap-1.5">
        {stops.map((stop, index) => (
          <div
            key={`${stop.position}-${index}`}
            className="grid grid-cols-[54px_minmax(0,1fr)_52px_24px] items-center gap-1.5 rounded bg-[#0c121b] px-1.5 py-1"
          >
            <Input
              className="h-7 border-0 bg-[#171920] px-1.5 text-center text-xs font-bold text-[#dfe2ea]"
              value={`${stop.position}%`}
              onChange={(event) =>
                updateStop(index, {
                  position: clampPercent(event.target.value),
                })
              }
            />
            <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center rounded bg-[#171920]">
              <StopColorPicker
                value={stop.color}
                onChange={(color) => updateStop(index, { color })}
              />
              <Input
                className="h-7 border-0 bg-transparent px-1 text-xs font-bold text-[#dfe2ea]"
                value={normalizeHexColor(stop.color).slice(1)}
                onChange={(event) =>
                  updateStop(index, {
                    color: normalizeHexColor(`#${event.target.value}`),
                  })
                }
              />
            </div>
            <Input
              className="h-7 border-0 bg-[#171920] px-1.5 text-center text-xs font-bold text-[#dfe2ea]"
              value={`${stop.opacity}%`}
              onChange={(event) =>
                updateStop(index, { opacity: clampPercent(event.target.value) })
              }
            />
            <button
              className="grid size-6 place-items-center rounded text-[#dfe2ea] hover:bg-[#171920]"
              type="button"
              onClick={() => removeStop(index)}
            >
              <Minus size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StopColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 210;
    const height = 210;
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left)),
      top:
        rect.bottom + height + 6 <= window.innerHeight - 8
          ? rect.bottom + 6
          : Math.max(8, rect.top - height - 6),
    });
    function closeOnOutside(event: globalThis.PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !buttonRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, {
        capture: true,
      });
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className="ml-1 size-4 rounded-sm border border-white/15"
        style={{ background: normalizeHexColor(value) }}
        type="button"
        onClick={() => setOpen((current) => !current)}
      />
      {open && position
        ? createPortal(
            <div
              ref={popupRef}
              className="fixed z-[7200] grid w-[210px] gap-2 rounded-xl border border-[#2d313b] bg-[#101116] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.48)]"
              style={{ left: position.left, top: position.top }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SolidColorPickerPanel
                value={value}
                variant="compact"
                onChange={onChange}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function isGradientValue(value: string) {
  return /^(linear|radial|conic)-gradient\(/i.test(value.trim());
}

function parseGradientValue(value: string): GradientValue {
  const trimmed = value.trim();
  const type = trimmed.startsWith("radial-gradient")
    ? "radial"
    : trimmed.startsWith("conic-gradient")
      ? "conic"
      : "linear";
  const body =
    trimmed.match(/^[^(]+\((.*)\)$/)?.[1] ?? "135deg, #FFFFFF 0%, #999999 100%";
  const parts = splitGradientArgs(body);
  const first = parts[0] ?? "135deg";
  const stopParts = parts.length > 1 ? parts.slice(1) : parts;
  return {
    type,
    angle:
      type === "linear" ? first : first.replace(/^from\s+/i, "") || "135deg",
    center: first.match(/at\s+(.+)$/i)?.[1] ?? "center",
    backgroundSize: "140% 140%",
    stops: stopParts
      .map(parseGradientStop)
      .filter(Boolean) as GradientValue["stops"],
  };
}

function formatGradientValue(value: GradientValue) {
  const stops = (value.stops.length ? value.stops : defaultGradientStops())
    .map(
      (stop) =>
        `${formatStopColor(stop.color, stop.opacity)} ${stop.position}%`,
    )
    .join(", ");
  if (value.type === "radial")
    return `radial-gradient(circle at ${value.center || "center"}, ${stops})`;
  if (value.type === "conic")
    return `conic-gradient(from ${value.angle || "135deg"}, ${stops})`;
  return `linear-gradient(${value.angle || "135deg"}, ${stops})`;
}

function splitGradientArgs(value: string) {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      args.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(value.slice(start).trim());
  return args.filter(Boolean);
}

function parseGradientStop(value: string) {
  const color = value.match(/#[0-9a-fA-F]{3,6}|rgba?\([^)]*\)/)?.[0];
  if (!color) return null;
  const position = value.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? "0";
  return {
    color: normalizeHexColor(color),
    position: clampPercent(position),
    opacity: 100,
  };
}

function formatStopColor(color: string, opacity: number) {
  if (opacity >= 100) return normalizeHexColor(color);
  const hex = normalizeHexColor(color).slice(1);
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity / 100)).toFixed(2)})`;
}

function defaultGradientStops() {
  return [
    { color: "#FFFFFF", position: 0, opacity: 100 },
    { color: "#999999", position: 100, opacity: 100 },
  ];
}

function clampPercent(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : 0;
}

function getStopHandleLeft(position: number) {
  return `calc(${position}% + ${8 - position * 0.16}px)`;
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
  return {
    h: Math.round(h < 0 ? h + 360 : h),
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((channel) =>
      clampColorChannel((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function clampColorChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
