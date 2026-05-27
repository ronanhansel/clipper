import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  type FillValue,
  fillValueToCss,
  createDefaultFillValue,
  generateStopId,
} from "../core/fillValue";
import { clamp } from "../core/math";
import { GradientPickerPanel } from "./color/GradientPickerPanel";
import { SolidColorPickerPanel } from "./color/SolidColorPickerPanel";
import { FillGradientPickerPanel } from "./color/FillGradientPickerPanel";
import {
  clampPercent,
  formatSolidColor,
  hexToHsv,
  normalizeHexColor,
  parseSolidColor,
} from "./color/colorMath";
import {
  type GradientValue,
  formatGradientValue,
  isGradientValue,
  parseGradientValue,
} from "./color/gradientLegacy";
import type { FillKeyframeConfig } from "./color/types";

export {
  formatStyleLabel,
  getEditableColorStyleEntries,
  isHexColor,
  normalizeHexColor,
} from "./color/colorMath";
export type { FillKeyframeConfig } from "./color/types";

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
  variant?: "default" | "compact" | "dense";
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
  const [open, setOpen] = useState(false);
  const [portalPosition, setPortalPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const initialSolid = parseSolidColor(value);
  const initialGradient = parseGradientValue(value);
  const [gradientDraft, setGradientDraft] = useState(initialGradient);
  const [draftColor, setDraftColor] = useState(
    normalizeHexColor(gradientDraft.stops[0]?.color ?? initialSolid.hex),
  );
  const [alpha, setAlpha] = useState(initialSolid.alpha);
  const [mode, setMode] = useState<"solid" | "gradient">(
    resolvedPickerMode === "gradient" ||
      (resolvedPickerMode === "solid-gradient" && isGradientValue(value))
      ? "gradient"
      : "solid",
  );

  const colorRef = useRef(draftColor);
  const alphaRef = useRef(alpha);
  const onChangeRafRef = useRef(0);

  useEffect(
    () => () => {
      if (onChangeRafRef.current) cancelAnimationFrame(onChangeRafRef.current);
    },
    [],
  );

  useEffect(() => {
    const nextGradient = parseGradientValue(value);
    setGradientDraft(nextGradient);
    if (resolvedPickerMode === "gradient") setMode("gradient");
    else if (resolvedPickerMode === "solid") setMode("solid");
    else if (isGradientValue(value)) setMode("gradient");
    const nextSolid = parseSolidColor(value);
    setDraftColor(nextSolid.hex);
    setAlpha(nextSolid.alpha);
    colorRef.current = nextSolid.hex;
    alphaRef.current = nextSolid.alpha;
  }, [resolvedPickerMode, value]);

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
    const width = showsGradient ? 300 : isCompact ? 240 : 246;
    const estimatedHeight = showsGradient ? 360 : isCompact ? 220 : 280;
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

  function handleSolidPreview(nextColor: string) {
    colorRef.current = nextColor;
    if (onPreview) {
      onPreview(
        formatSolidColor(nextColor, allowAlpha ? alphaRef.current : 100),
      );
      return;
    }
    if (onChangeRafRef.current) return;
    onChangeRafRef.current = requestAnimationFrame(() => {
      onChangeRafRef.current = 0;
      onChange(
        formatSolidColor(colorRef.current, allowAlpha ? alphaRef.current : 100),
      );
    });
  }

  function handleAlphaPreview(nextAlpha: number) {
    alphaRef.current = nextAlpha;
    if (onPreview) {
      onPreview(formatSolidColor(colorRef.current, nextAlpha));
      return;
    }
    if (onChangeRafRef.current) return;
    onChangeRafRef.current = requestAnimationFrame(() => {
      onChangeRafRef.current = 0;
      onChange(formatSolidColor(colorRef.current, alphaRef.current));
    });
  }

  function handleSolidCommit() {
    if (onChangeRafRef.current) {
      cancelAnimationFrame(onChangeRafRef.current);
      onChangeRafRef.current = 0;
    }
    setDraftColor(colorRef.current);
    setAlpha(alphaRef.current);
    onChange(
      formatSolidColor(colorRef.current, allowAlpha ? alphaRef.current : 100),
    );
  }

  function commitGradient(next: GradientValue) {
    setGradientDraft(next);
    onChange(formatGradientValue(next));
  }

  function openPicker() {
    if (!open) togglePicker();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPicker();
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
      const next = normalizeHexColor(result.sRGBHex);
      colorRef.current = next;
      handleSolidCommit();
    } catch {
      // user cancelled
    }
  }

  const isCompact = variant === "compact";
  const isDense = variant === "dense";
  const displayColor = formatSolidColor(draftColor, allowAlpha ? alpha : 100);
  const hexLabel = draftColor.toUpperCase();
  const compactLabel = allowAlpha
    ? `${draftColor.toUpperCase()} ${alpha}%`
    : draftColor.toUpperCase();

  const pickerPanel = open ? (
    <div
      ref={popupRef}
      className={
        isCompact
          ? `grid ${showsGradient ? "h-[300px] w-[300px]" : "w-[240px]"} max-h-[calc(100vh-16px)] gap-2 overflow-y-auto rounded-xl border border-[#2d313b] bg-[#101116] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.48)]`
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
          value={draftColor}
          alpha={alpha}
          allowAlpha={allowAlpha}
          variant={isDense ? "default" : isCompact ? "compact" : "default"}
          onChange={handleSolidPreview}
          onAlphaChange={handleAlphaPreview}
          onCommit={handleSolidCommit}
          onPickFromScreen={pickFromScreen}
        />
      ) : null}
      {mode === "gradient" ? (
        <GradientPickerPanel
          value={gradientDraft}
          onChange={commitGradient}
          onPreview={(next) => onPreview?.(formatGradientValue(next))}
        />
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        role="button"
        tabIndex={0}
        className={
          isCompact
            ? "flex h-6 w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded border border-[#2d313b] bg-[#0c121b] px-1.5 pr-7 text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--clipper-accent)]"
            : isDense
              ? `flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--clipper-accent)]`
              : `flex h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--clipper-accent)] ${leftSlot ? "pl-2 pr-3" : "px-3"}`
        }
        onClick={openPicker}
        onKeyDown={handleTriggerKeyDown}
      >
        {leftSlot ? (
          <span className="mr-1 flex shrink-0 items-center">{leftSlot}</span>
        ) : null}
        <span
          className={
            isCompact
              ? "flex min-w-0 items-center gap-1.5"
              : isDense
                ? "flex min-w-0 flex-1 items-center gap-2"
                : "flex min-w-0 flex-1 items-center gap-2"
          }
        >
          <span
            className={
              isCompact
                ? "h-4 w-4 rounded border border-white/20"
                : isDense
                  ? "h-4 w-4 shrink-0 rounded-[4px] border border-white/20"
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
                      alphaRef.current = next;
                      setAlpha(next);
                      onChange(formatSolidColor(colorRef.current, next));
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
      </div>
      {pickerPanel ? createPortal(pickerPanel, document.body) : null}
    </div>
  );
}

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
  const draftRef = useRef(fillValue);
  const [open, setOpen] = useState(false);
  const [portalPosition, setPortalPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [draft, setDraft] = useState(fillValue);

  useEffect(() => {
    draftRef.current = fillValue;
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
    draftRef.current = next;
    setDraft(next);
    onFillChange(next);
  }

  function previewFill(next: FillValue) {
    draftRef.current = next;
    onFillPreview?.(next);
  }

  function handleSolidColorPreview(color: string) {
    const next: FillValue = {
      ...draftRef.current,
      color: normalizeHexColor(color),
    };
    previewFill(next);
  }

  function handleSolidAlphaPreview(alpha: number) {
    const next: FillValue = { ...draftRef.current, alpha };
    previewFill(next);
  }

  function handleSolidCommit() {
    commitFill(draftRef.current);
  }

  function openPicker() {
    if (!open) togglePicker();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openPicker();
  }

  async function handlePickFromScreen() {
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
        ...draftRef.current,
        color: normalizeHexColor(result.sRGBHex),
      });
    } catch {
      // cancelled
    }
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
          keyframeStates={keyframeStates}
          onToggleKeyframe={onToggleKeyframe}
          onChange={handleSolidColorPreview}
          onAlphaChange={handleSolidAlphaPreview}
          onCommit={handleSolidCommit}
          onPickFromScreen={handlePickFromScreen}
        />
      ) : (
        <FillGradientPickerPanel
          value={draft}
          keyframeStates={keyframeStates}
          onToggleKeyframe={onToggleKeyframe}
          onChange={commitFill}
          onPreview={previewFill}
        />
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        role="button"
        tabIndex={0}
        className={
          isCompact
            ? "flex h-6 w-full min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded border border-[#2d313b] bg-[#0c121b] px-1.5 pr-7 text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--clipper-accent)]"
            : `flex h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--clipper-accent)] ${leftSlot ? "pl-2 pr-3" : "px-3"}`
        }
        onClick={openPicker}
        onKeyDown={handleTriggerKeyDown}
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
      </div>
      {pickerPanel ? createPortal(pickerPanel, document.body) : null}
    </div>
  );
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
