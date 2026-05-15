import { Minus, Pipette, Plus } from "lucide-react";
import React, { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  type FillValue,
  type FillStop,
  type GradientType,
  type RadialShape,
  MAX_STOPS,
  createDefaultFillValue,
  fillValueToCss,
  generateStopId,
  parseCssToFillValue,
  isFillValue,
} from "../core/fillValue";
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
  allowAlpha = false,
  allowGradient,
  leftSlot,
}: {
  value: string;
  onChange: (value: string) => void;
  onPreview?: (value: string) => void;
  variant?: "default" | "compact";
  pickerMode?: "solid" | "gradient" | "solid-gradient";
  allowAlpha?: boolean;
  /** @deprecated use pickerMode="solid-gradient" */
  allowGradient?: boolean;
  leftSlot?: React.ReactNode;
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
  const initialSolidColor = parseSolidColor(value);
  const [draft, setDraft] = useState(
    normalizeHexColor(gradientDraft.stops[0]?.color ?? initialSolidColor.hex),
  );
  const [hue, setHue] = useState(
    hexToHsv(
      normalizeHexColor(gradientDraft.stops[0]?.color ?? initialSolidColor.hex),
    ).h,
  );
  const [alpha, setAlpha] = useState(initialSolidColor.alpha);
  const [mode, setMode] = useState<"solid" | "gradient">(
    resolvedPickerMode === "gradient" ||
      (resolvedPickerMode === "solid-gradient" && isGradientValue(value))
      ? "gradient"
      : "solid",
  );
  const nextColorRef = useRef(draft);
  const nextHueRef = useRef(hue);
  const nextAlphaRef = useRef(alpha);
  const changeFrameRef = useRef(0);
  const previewFrameRef = useRef(0);
  const draggingRef = useRef(false);

  useEffect(() => {
    const nextGradient = parseGradientValue(value);
    setGradientDraft(nextGradient);
    if (resolvedPickerMode === "gradient") setMode("gradient");
    else if (resolvedPickerMode === "solid") setMode("solid");
    else if (isGradientValue(value)) setMode("gradient");
    const nextSolid = parseSolidColor(value);
    const next = nextSolid.hex;
    const nextHue = hexToHsv(next).h;
    setDraft(next);
    setHue(nextHue);
    setAlpha(nextSolid.alpha);
    nextColorRef.current = next;
    nextHueRef.current = nextHue;
    nextAlphaRef.current = nextSolid.alpha;
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
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
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
    const formatted = formatSolidColor(
      next,
      allowAlpha ? nextAlphaRef.current : 100,
    );

    if (!previewFrameRef.current) {
      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = 0;
        setDraft(nextColorRef.current);
        setHue(nextHueRef.current);
      });
    }
    if (draggingRef.current) {
      onPreview?.(formatted);
      return;
    }
    if (changeFrameRef.current) return;
    changeFrameRef.current = requestAnimationFrame(() => {
      changeFrameRef.current = 0;
      onChange(
        formatSolidColor(
          nextColorRef.current,
          allowAlpha ? nextAlphaRef.current : 100,
        ),
      );
    });
  }

  function commitDragChange() {
    draggingRef.current = false;
    if (changeFrameRef.current) cancelAnimationFrame(changeFrameRef.current);
    changeFrameRef.current = 0;
    onChange(
      formatSolidColor(
        nextColorRef.current,
        allowAlpha ? nextAlphaRef.current : 100,
      ),
    );
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

  const isCompact = variant === "compact";
  const displayColor = formatSolidColor(draft, allowAlpha ? alpha : 100);
  const hexLabel = draft.toUpperCase();
  const compactLabel = allowAlpha
    ? `${draft.toUpperCase()} ${alpha}%`
    : draft.toUpperCase();
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
          alpha={alpha}
          allowAlpha={allowAlpha}
          variant={variant}
          onChange={scheduleChange}
          onAlphaChange={(nextAlpha) => {
            nextAlphaRef.current = nextAlpha;
            setAlpha(nextAlpha);
            onChange(formatSolidColor(nextColorRef.current, nextAlpha));
          }}
          onCommit={commitDragChange}
          onPickFromScreen={pickFromScreen}
        />
      ) : null}
      {mode === "gradient" ? (
        <GradientPickerPanel value={gradientDraft} onChange={commitGradient} />
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        className={
          isCompact
            ? "flex h-6 w-full min-w-0 items-center justify-between gap-1.5 rounded border border-[#2d313b] bg-[#0c121b] px-1.5 pr-7 text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)]"
            : `flex h-[42px] w-full items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] ${leftSlot ? "pl-2 pr-3" : "px-3"}`
        }
        onClick={() => {
          if (!open) togglePicker();
        }}
      >
        {leftSlot ? (
          <span className="mr-1 flex shrink-0 items-center">{leftSlot}</span>
        ) : null}
        <span
          className={
            isCompact
              ? "flex min-w-0 items-center gap-1.5"
              : "flex min-w-0 flex-1 items-center gap-2"
          }
        >
          <span
            className={
              isCompact
                ? "h-4 w-4 rounded border border-white/20"
                : "h-5 w-5 shrink-0 rounded-md border border-white/20"
            }
            style={{
              background:
                mode === "gradient"
                  ? formatGradientValue(gradientDraft)
                  : displayColor,
            }}
          />
          {!isCompact && allowAlpha && mode === "solid" ? (
            <span className="flex min-w-0 flex-1 items-center">
              <span className="min-w-0 truncate">{hexLabel}</span>
              <span className="ml-auto flex w-16 shrink-0 items-center gap-1 pl-2">
                <span className="text-[#3a3f4a] select-none">|</span>
                <input
                  className="w-8 cursor-ew-resize select-none bg-transparent text-right text-xs font-bold text-[#9aa1ad] outline-none"
                  value={`${alpha}%`}
                  readOnly
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const startX = event.clientX;
                    const startVal = alpha;
                    const el = event.currentTarget;
                    el.setPointerCapture(event.pointerId);
                    function onMove(e: globalThis.PointerEvent) {
                      const next = clampPercent(
                        String(Math.round(startVal + (e.clientX - startX))),
                      );
                      nextAlphaRef.current = next;
                      setAlpha(next);
                      onChange(formatSolidColor(nextColorRef.current, next));
                    }
                    function onUp() {
                      el.removeEventListener("pointermove", onMove);
                      el.removeEventListener("pointerup", onUp);
                    }
                    el.addEventListener("pointermove", onMove);
                    el.addEventListener("pointerup", onUp);
                  }}
                />
              </span>
            </span>
          ) : (
            <span className="min-w-0 truncate">
              {isCompact ? compactLabel : displayColor}
            </span>
          )}
        </span>
      </button>
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

function isEditableColorValue(value: string) {
  return isHexColor(value) || parseRgbaColor(value) !== null;
}

function parseSolidColor(value: string) {
  const rgba = parseRgbaColor(value);
  if (rgba) {
    return {
      hex: rgbToHex(rgba.red, rgba.green, rgba.blue),
      alpha: Math.round(rgba.alpha * 100),
    };
  }
  return { hex: normalizeHexColor(value), alpha: 100 };
}

function parseRgbaColor(value: string) {
  const match = value
    .trim()
    .match(
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
    );
  if (!match) return null;
  return {
    red: clampColorChannel(Number(match[1])),
    green: clampColorChannel(Number(match[2])),
    blue: clampColorChannel(Number(match[3])),
    alpha: clamp(Number(match[4] ?? "1"), 0, 1),
  };
}

function formatSolidColor(hex: string, alpha: number) {
  const normalized = normalizeHexColor(hex);
  const percent = clampPercent(String(alpha));
  if (percent >= 100) return normalized;
  const channels = normalized.slice(1);
  const red = parseInt(channels.slice(0, 2), 16);
  const green = parseInt(channels.slice(2, 4), 16);
  const blue = parseInt(channels.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${(percent / 100).toFixed(2)})`;
}

export function getEditableColorStyleEntries(
  style: Record<string, string | number>,
) {
  const colorKeys = new Set([
    "backgroundColor",
    "color",
    "borderColor",
    "fill",
    "stroke",
  ]);
  return Object.entries(style).flatMap(([key, value]) =>
    colorKeys.has(key) &&
    typeof value === "string" &&
    isEditableColorValue(value)
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

export type FillKeyframeConfig = {
  path: string;
  label: string;
  hasKeyframe: boolean;
};

export type ColorSelectorFillProps = {
  fillValue: FillValue;
  onFillChange: (fill: FillValue) => void;
  onFillPreview?: (fill: FillValue) => void;
  variant?: "default" | "compact";
  leftSlot?: React.ReactNode;
  keyframeStates?: FillKeyframeConfig[];
  onToggleKeyframe?: (path: string) => void;
};

export function FillColorSelector({
  fillValue,
  onFillChange,
  onFillPreview,
  variant = "default",
  leftSlot,
  keyframeStates,
  onToggleKeyframe,
}: ColorSelectorFillProps) {
  const pickerId = useRef(`clr_${Math.random().toString(36).slice(2)}`);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [portalPosition, setPortalPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [draft, setDraft] = useState(fillValue);

  useEffect(() => {
    setDraft(fillValue);
  }, [fillValue]);

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
      if (!(target instanceof Node)) return;
      if (popupRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
      // Don't close when a Radix portal (Select, etc.) is open anywhere on the page
      if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-clipper-color-picker-portal]")
      )
        return;
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
  }, [open, draft.mode]);

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
    const width = 300;
    const estimatedHeight = 380;
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

  function commitFill(next: FillValue) {
    setDraft(next);
    onFillChange(next);
  }

  function previewFill(next: FillValue) {
    setDraft(next);
    onFillPreview?.(next);
  }

  const isCompact = variant === "compact";
  const displayCss = fillValueToCss(draft);

  const pickerPanel = open ? (
    <div
      ref={popupRef}
      className={
        isCompact
          ? "grid w-[300px] max-h-[calc(100vh-16px)] gap-2 overflow-y-auto rounded-xl border border-[#2d313b] bg-[#101116] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.48)]"
          : "grid w-[300px] max-h-[calc(100vh-16px)] gap-3 overflow-y-auto rounded-2xl border border-[#2d313b] bg-[#101116] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.48)]"
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
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#0a0b0f] p-1">
        <button
          className={`h-7 rounded-md text-[11px] font-extrabold ${draft.mode === "solid" ? "bg-[#2a2d34] text-white" : "text-[#9aa1ad]"}`}
          onClick={() => commitFill({ ...draft, mode: "solid" })}
        >
          Solid
        </button>
        <button
          className={`h-7 rounded-md text-[11px] font-extrabold ${draft.mode === "gradient" ? "bg-[#2a2d34] text-white" : "text-[#9aa1ad]"}`}
          onClick={() => commitFill(convertFillToGradient(draft))}
        >
          Gradient
        </button>
      </div>
      {draft.mode === "solid" ? (
        <SolidColorPickerPanel
          value={draft.color}
          alpha={draft.alpha}
          allowAlpha
          variant={variant}
          onChange={(color) => {
            const next = { ...draft, color: normalizeHexColor(color) };
            previewFill(next);
          }}
          onAlphaChange={(alpha) => commitFill({ ...draft, alpha })}
          onCommit={() => commitFill(draft)}
          onPickFromScreen={async () => {
            const EyeDropper = (
              window as unknown as {
                EyeDropper?: new () => {
                  open: () => Promise<{ sRGBHex: string }>;
                };
              }
            ).EyeDropper;
            if (!EyeDropper) {
              toast.error("Eyedropper is not supported in this runtime.");
              return;
            }
            try {
              const result = await new EyeDropper().open();
              commitFill({
                ...draft,
                color: normalizeHexColor(result.sRGBHex),
              });
            } catch {
              // cancelled
            }
          }}
        />
      ) : (
        <FillGradientPickerPanel
          value={draft}
          keyframeStates={keyframeStates}
          onToggleKeyframe={onToggleKeyframe}
          onChange={commitFill}
        />
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        className={
          isCompact
            ? "flex h-6 w-full min-w-0 items-center justify-between gap-1.5 rounded border border-[#2d313b] bg-[#0c121b] px-1.5 pr-7 text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)]"
            : `flex h-[42px] w-full items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] ${leftSlot ? "pl-2 pr-3" : "px-3"}`
        }
        onClick={() => {
          if (!open) togglePicker();
        }}
      >
        {leftSlot ? (
          <span className="mr-1 flex shrink-0 items-center">{leftSlot}</span>
        ) : null}
        <span
          className={
            isCompact
              ? "flex min-w-0 items-center gap-1.5"
              : "flex min-w-0 flex-1 items-center gap-2"
          }
        >
          <span
            className={
              isCompact
                ? "h-4 w-4 rounded shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                : "h-5 w-5 shrink-0 rounded-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
            }
            style={{ background: displayCss }}
          />
          <span className="min-w-0 truncate">
            {draft.mode === "solid"
              ? `${draft.color.toUpperCase()} ${draft.alpha}%`
              : `${draft.gradientType} gradient`}
          </span>
        </span>
      </button>
      {pickerPanel ? createPortal(pickerPanel, document.body) : null}
    </div>
  );
}

function FillGradientPickerPanel({
  value,
  keyframeStates,
  onToggleKeyframe,
  onChange,
}: {
  value: FillValue;
  keyframeStates?: FillKeyframeConfig[];
  onToggleKeyframe?: (path: string) => void;
  onChange: (value: FillValue) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const stopHandleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragFrameRef = useRef(0);
  const draggingStopRef = useRef(false);
  const pendingDragRef = useRef<{ index: number; position: number } | null>(
    null,
  );
  const stops =
    value.stops.length >= 2 ? value.stops : createDefaultFillValue().stops;
  const preview = fillValueToLinearPreviewCss(value);

  useEffect(
    () => () => {
      if (dragFrameRef.current) cancelAnimationFrame(dragFrameRef.current);
    },
    [],
  );

  function updateStop(index: number, patch: Partial<FillStop>) {
    const nextStops = stops.map((stop, i) =>
      i === index ? { ...stop, ...patch } : stop,
    );
    onChange({ ...value, stops: nextStops });
  }

  function addStop() {
    if (stops.length >= MAX_STOPS) return;
    const newStop: FillStop = {
      id: generateStopId(),
      color: "#FFFFFF",
      position: 50,
      opacity: 100,
    };
    onChange({
      ...value,
      stops: [...stops, newStop].sort((a, b) => a.position - b.position),
    });
  }

  function removeStop(index: number) {
    if (stops.length <= 2) return;
    onChange({
      ...value,
      stops: stops.filter((_, i) => i !== index),
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
    pendingDragRef.current = { index, position };
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
      <div className="flex items-center justify-between gap-2">
        <Select
          value={value.gradientType}
          onValueChange={(next) =>
            onChange({ ...value, gradientType: next as GradientType })
          }
        >
          <SelectTrigger className="h-7 w-[110px] rounded-[8px] border-[#2d313b] bg-[#171920] px-2 text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[7100] bg-[#11141a]">
            <SelectGroup>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="radial">Radial</SelectItem>
              <SelectItem value="conic">Angular</SelectItem>
              <SelectItem value="diamond">Diamond</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#9aa1ad]">
          <input
            type="checkbox"
            className="accent-[var(--clipper-accent)]"
            checked={value.repeating}
            onChange={(e) =>
              onChange({ ...value, repeating: e.target.checked })
            }
          />
          Repeat
        </label>
      </div>

      {/* Geometry controls per gradient type */}
      <FillGeometryControls
        value={value}
        keyframeStates={keyframeStates}
        onToggleKeyframe={onToggleKeyframe}
        onChange={onChange}
      />

      {/* Gradient preview rail */}
      <div className="relative h-[54px] px-2 pt-5">
        <div
          ref={railRef}
          className="h-7 overflow-hidden rounded-md bg-[#0b0d12] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
          style={{ backgroundColor: "#0b0d12", backgroundImage: preview }}
        />
        {stops.map((stop, index) => (
          <button
            ref={(element) => {
              stopHandleRefs.current[index] = element;
            }}
            key={stop.id}
            className="absolute top-[14px] grid h-8 w-5 -translate-x-1/2 place-items-start"
            style={{ left: getStopHandleLeft(stop.position) }}
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

      {/* Stops list */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#aeb6c4]">Stops</span>
        <button
          className="grid size-7 place-items-center rounded text-[#dfe2ea] hover:bg-[#171920] disabled:opacity-40"
          type="button"
          onClick={addStop}
          disabled={stops.length >= MAX_STOPS}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="grid gap-1.5">
        {stops.map((stop, index) => (
          <div
            key={stop.id}
            className="grid grid-cols-[74px_minmax(0,1fr)_72px_24px] items-center gap-1.5 rounded bg-[#0c121b] px-1.5 py-1"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
              <Input
                className="h-7 border-0 bg-transparent pl-6 pr-2 text-left text-xs font-bold text-[#dfe2ea]"
                type="number"
                min={0}
                max={100}
                step={1}
                unitPrefix="%"
                value={stop.position}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (!Number.isFinite(next)) return;
                  updateStop(index, {
                    position: Math.max(0, Math.min(100, Math.round(next))),
                  });
                }}
              />
              <FillInlineKeyframeDiamond
                state={findFillKeyframeState(
                  keyframeStates,
                  `style.fill.stops[${stop.id}].position`,
                )}
                onToggleKeyframe={onToggleKeyframe}
              />
            </div>
            <div className="grid grid-cols-[20px_minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
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
              <FillInlineKeyframeDiamond
                state={findFillKeyframeState(
                  keyframeStates,
                  `style.fill.stops[${stop.id}].color`,
                )}
                onToggleKeyframe={onToggleKeyframe}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
              <Input
                className="h-7 border-0 bg-transparent pl-6 pr-2 text-left text-xs font-bold text-[#dfe2ea]"
                type="number"
                min={0}
                max={100}
                step={1}
                unitPrefix="%"
                value={stop.opacity}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (!Number.isFinite(next)) return;
                  updateStop(index, {
                    opacity: Math.max(0, Math.min(100, Math.round(next))),
                  });
                }}
              />
              <FillInlineKeyframeDiamond
                state={findFillKeyframeState(
                  keyframeStates,
                  `style.fill.stops[${stop.id}].opacity`,
                )}
                onToggleKeyframe={onToggleKeyframe}
              />
            </div>
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

function FillGeometryControls({
  value,
  keyframeStates,
  onToggleKeyframe,
  onChange,
}: {
  value: FillValue;
  keyframeStates?: FillKeyframeConfig[];
  onToggleKeyframe?: (path: string) => void;
  onChange: (value: FillValue) => void;
}) {
  // Use the shared Input component for all numeric fields so we retain the tuned
  // number scrub/commit behavior. We only override visuals for compactness.
  const fieldClass =
    "h-7 border-0 bg-transparent px-2 text-left text-xs font-bold text-[#dfe2ea] focus:ring-0";
  const unitFieldClass =
    "h-7 border-0 bg-transparent pl-7 pr-2 text-left text-xs font-bold text-[#dfe2ea] focus:ring-0";
  const labelClass = "text-[10px] font-bold text-[#6f7684]";
  const renderInputField = (
    label: string,
    path: string | null,
    input: React.ReactNode,
  ) => (
    <label className={labelClass}>
      {label}
      <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
        {input}
        <FillInlineKeyframeDiamond
          state={path ? findFillKeyframeState(keyframeStates, path) : undefined}
          onToggleKeyframe={onToggleKeyframe}
        />
      </div>
    </label>
  );

  if (value.gradientType === "linear") {
    return (
      <div className="grid grid-cols-1 gap-1.5">
        {renderInputField(
          "Angle",
          "style.fill.linearAngle",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={360}
            step={1}
            unitPrefix="°"
            numberScrubMode="continuous"
            value={value.linearAngle}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, linearAngle: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  if (value.gradientType === "radial") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <label className={labelClass}>
          Shape
          <Select
            value={value.radialShape}
            onValueChange={(next) =>
              onChange({ ...value, radialShape: next as RadialShape })
            }
          >
            <SelectTrigger className="h-7 w-full rounded-[8px] border-[#2d313b] bg-[#171920] px-2 text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[7100] bg-[#11141a]">
              <SelectGroup>
                <SelectItem value="circle">Circle</SelectItem>
                <SelectItem value="ellipse">Ellipse</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        {renderInputField(
          "Radius X",
          "style.fill.radialRadiusX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={200}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.radialRadiusX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, radialRadiusX: Math.round(next) });
            }}
          />,
        )}
        {value.radialShape === "ellipse"
          ? renderInputField(
              "Radius Y",
              "style.fill.radialRadiusY",
              <Input
                className={unitFieldClass}
                type="number"
                min={0}
                max={200}
                step={1}
                unitPrefix="%"
                numberScrubMode="continuous"
                value={value.radialRadiusY}
                onChange={(e) => {
                  const next = Number(e.currentTarget.value);
                  if (!Number.isFinite(next)) return;
                  onChange({ ...value, radialRadiusY: Math.round(next) });
                }}
              />,
            )
          : null}
        {renderInputField(
          "Center X",
          "style.fill.radialCenterX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.radialCenterX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, radialCenterX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center Y",
          "style.fill.radialCenterY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.radialCenterY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, radialCenterY: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  if (value.gradientType === "conic") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {renderInputField(
          "From Angle",
          "style.fill.conicFromAngle",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={360}
            step={1}
            unitPrefix="°"
            numberScrubMode="continuous"
            value={value.conicFromAngle}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, conicFromAngle: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center X",
          "style.fill.conicCenterX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.conicCenterX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, conicCenterX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center Y",
          "style.fill.conicCenterY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.conicCenterY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, conicCenterY: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  if (value.gradientType === "diamond") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {renderInputField(
          "Rotation",
          "style.fill.diamondRotation",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={360}
            step={1}
            unitPrefix="°"
            numberScrubMode="continuous"
            value={value.diamondRotation}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondRotation: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Radius X",
          "style.fill.diamondRadiusX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={200}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondRadiusX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondRadiusX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Radius Y",
          "style.fill.diamondRadiusY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={200}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondRadiusY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondRadiusY: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center X",
          "style.fill.diamondCenterX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondCenterX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondCenterX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center Y",
          "style.fill.diamondCenterY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondCenterY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondCenterY: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  return null;
}

function findFillKeyframeState(
  keyframeStates: FillKeyframeConfig[] | undefined,
  path: string,
) {
  return keyframeStates?.find((state) => state.path === path);
}

function FillInlineKeyframeDiamond({
  state,
  onToggleKeyframe,
}: {
  state?: FillKeyframeConfig;
  onToggleKeyframe?: (path: string) => void;
}) {
  if (!state || !onToggleKeyframe)
    return <span className="block h-[18px] w-[18px]" />;
  return (
    <button
      aria-label={
        state.hasKeyframe
          ? `Remove ${state.label} keyframe at playhead`
          : `Add ${state.label} keyframe at playhead`
      }
      aria-pressed={state.hasKeyframe}
      className="grid h-[18px] w-[18px] place-items-center"
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleKeyframe(state.path);
      }}
    >
      <span
        className={`inline-block h-[8px] w-[8px] rotate-45 rounded-[1px] border transition ${
          state.hasKeyframe
            ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
            : "border-[#6f7684] bg-[#12151d] hover:border-white"
        }`}
      />
    </button>
  );
}

function fillValueToLinearPreviewCss(fill: FillValue) {
  if (fill.mode === "solid") return fillValueToCss(fill);
  const linearFill: FillValue = {
    ...fill,
    gradientType: "linear",
    linearAngle: 90,
  };
  return fillValueToCss(linearFill);
}

function convertFillToGradient(fill: FillValue): FillValue {
  if (fill.mode === "gradient") return fill;
  return {
    ...fill,
    mode: "gradient",
    stops: [
      {
        id: generateStopId(),
        color: normalizeHexColor(fill.color),
        position: 0,
        opacity: fill.alpha,
      },
      {
        id: generateStopId(),
        color: normalizeHexColor(fill.color),
        position: 100,
        opacity: fill.alpha,
      },
    ],
  };
}

function SolidColorPickerPanel({
  value,
  alpha = 100,
  allowAlpha = false,
  variant,
  onChange,
  onAlphaChange,
  onCommit,
  onPickFromScreen,
}: {
  value: string;
  alpha?: number;
  allowAlpha?: boolean;
  variant: "default" | "compact";
  onChange: (value: string, hue?: number) => void;
  onAlphaChange?: (alpha: number) => void;
  onCommit?: () => void;
  onPickFromScreen?: () => void;
}) {
  const boardRectRef = useRef<DOMRect | null>(null);
  const hueRectRef = useRef<DOMRect | null>(null);
  const boardDotRef = useRef<HTMLSpanElement | null>(null);
  const hueDotRef = useRef<HTMLSpanElement | null>(null);
  const [draft, setDraft] = useState(normalizeHexColor(value));
  const [hue, setHue] = useState(hexToHsv(normalizeHexColor(value)).h);
  const [alphaDraft, setAlphaDraft] = useState(clampPercent(String(alpha)));
  const isCompact = variant === "compact";

  useEffect(() => {
    const next = normalizeHexColor(value);
    const nextHue = hexToHsv(next).h;
    setDraft(next);
    setHue(nextHue);
    setAlphaDraft(clampPercent(String(alpha)));
    moveDots(hexToHsv(next), nextHue);
  }, [alpha, value]);

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

  function apply(next: string, nextHue = hue, nextAlpha = alphaDraft) {
    setDraft(next);
    setHue(nextHue);
    setAlphaDraft(nextAlpha);
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
      <div className="relative py-1.5">
        <div
          className={
            isCompact
              ? "relative h-3 touch-none rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
              : "relative h-4 touch-none rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
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
            className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]"
            style={{
              left: `${(hue / 360) * 100}%`,
              background: `hsl(${hue} 100% 50%)`,
            }}
          />
        </div>
      </div>
      {allowAlpha ? (
        <div className="relative py-1.5">
          <div
            className={
              isCompact
                ? "relative h-3 touch-none rounded-full"
                : "relative h-4 touch-none rounded-full"
            }
            style={{
              backgroundImage: `
                linear-gradient(to right, transparent, ${draft}),
                repeating-conic-gradient(#888 0% 25%, #555 0% 50%)
              `,
              backgroundSize: `100% 100%, 12px 12px`,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              const rect = event.currentTarget.getBoundingClientRect();
              const next = clampPercent(
                String(
                  Math.round(
                    clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100,
                  ),
                ),
              );
              setAlphaDraft(next);
              onAlphaChange?.(next);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              const rect = event.currentTarget.getBoundingClientRect();
              const next = clampPercent(
                String(
                  Math.round(
                    clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100,
                  ),
                ),
              );
              setAlphaDraft(next);
              onAlphaChange?.(next);
            }}
            onPointerUp={() => onCommit?.()}
            onPointerCancel={() => onCommit?.()}
          >
            <span
              className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]"
              style={{
                left: `${alphaDraft}%`,
                background: `rgba(${parseInt(draft.slice(1, 3), 16)}, ${parseInt(draft.slice(3, 5), 16)}, ${parseInt(draft.slice(5, 7), 16)}, ${alphaDraft / 100})`,
              }}
            />
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <div
          className={`flex min-w-0 flex-1 items-center rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 transition focus-within:border-[var(--clipper-accent)] focus-within:ring-2 focus-within:ring-[rgb(var(--clipper-accent-rgb)/0.2)] ${isCompact ? "h-7" : "h-8"}`}
        >
          <input
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none"
            value={draft}
            onChange={(event) => apply(normalizeHexColor(event.target.value))}
          />
        </div>
        <button
          className={
            isCompact
              ? "grid h-7 w-7 shrink-0 place-items-center rounded border border-[#2d313b] bg-[#0c121b] text-[#dfe2ea] transition hover:border-white hover:text-white"
              : "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#2d313b] bg-[#171920] text-[#dfe2ea] transition hover:border-white hover:text-white"
          }
          title="Sample colour from screen"
          onClick={() => onPickFromScreen?.()}
        >
          <Pipette size={isCompact ? 12 : 14} />
        </button>
      </div>
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
              type="number"
              min={0}
              max={100}
              step={1}
              value={stop.position}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                updateStop(index, {
                  position: Math.max(0, Math.min(100, Math.round(next))),
                });
              }}
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
              type="number"
              min={0}
              max={100}
              step={1}
              value={stop.opacity}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                updateStop(index, {
                  opacity: Math.max(0, Math.min(100, Math.round(next))),
                });
              }}
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
              data-clipper-color-picker-portal
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
