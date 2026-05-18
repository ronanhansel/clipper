import { Pipette } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { clamp } from "../../core/math";
import {
  clampPercent,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  rgbChannels,
} from "./colorMath";
import {
  FillInlineKeyframeDiamond,
  findFillKeyframeState,
} from "./FillInlineKeyframeDiamond";
import { LinearSlider } from "./LinearSlider";
import type { FillKeyframeConfig } from "./types";

export type SolidColorPickerPanelProps = {
  value: string;
  alpha?: number;
  allowAlpha?: boolean;
  variant: "default" | "compact";
  onChange: (value: string, hue?: number) => void;
  onAlphaChange?: (alpha: number) => void;
  onCommit?: () => void;
  onPickFromScreen?: () => void;
  keyframeStates?: FillKeyframeConfig[];
  onToggleKeyframe?: (path: string) => void;
};

/**
 * Performant solid color picker. During drag, no React state updates fire —
 * all visual changes happen via direct DOM mutations on refs. State updates
 * only on commit (release / hex input / external value change).
 *
 * - Board background, dot position
 * - Hue slider thumb position + thumb background
 * - Alpha track gradient + thumb background + thumb position
 *
 * are all updated imperatively from refs in `syncDom()`.
 */
export function SolidColorPickerPanel({
  value,
  alpha = 100,
  allowAlpha = false,
  variant,
  onChange,
  onAlphaChange,
  onCommit,
  onPickFromScreen,
  keyframeStates,
  onToggleKeyframe,
}: SolidColorPickerPanelProps) {
  const isCompact = variant === "compact";

  const initialColor = normalizeHexColor(value);
  const initialHue = hexToHsv(initialColor).h;
  const initialAlpha = clampPercent(String(alpha));

  const colorRef = useRef(initialColor);
  const hueRef = useRef(initialHue);
  const alphaRef = useRef(initialAlpha);
  const draggingRef = useRef(false);

  const [snapshot, setSnapshot] = useState({
    color: initialColor,
    hue: initialHue,
    alpha: initialAlpha,
  });

  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardDotRef = useRef<HTMLSpanElement | null>(null);
  const boardRectRef = useRef<DOMRect | null>(null);
  const hueThumbRef = useRef<HTMLSpanElement | null>(null);
  const alphaTrackRef = useRef<HTMLDivElement | null>(null);
  const alphaThumbRef = useRef<HTMLSpanElement | null>(null);

  const syncDom = useCallback(() => {
    const c = colorRef.current;
    const h = hueRef.current;
    const a = alphaRef.current;
    const hsv = hexToHsv(c);
    if (boardRef.current) {
      boardRef.current.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${h} 100% 50%)`;
    }
    if (boardDotRef.current) {
      boardDotRef.current.style.left = `${hsv.s * 100}%`;
      boardDotRef.current.style.top = `${(1 - hsv.v) * 100}%`;
    }
    if (hueThumbRef.current) {
      hueThumbRef.current.style.background = `hsl(${h} 100% 50%)`;
    }
    if (alphaTrackRef.current) {
      alphaTrackRef.current.style.backgroundImage = `linear-gradient(to right, transparent, ${c}), repeating-conic-gradient(#888 0% 25%, #555 0% 50%)`;
    }
    if (alphaThumbRef.current && allowAlpha) {
      const { red, green, blue } = rgbChannels(c);
      alphaThumbRef.current.style.background = `rgba(${red}, ${green}, ${blue}, ${a / 100})`;
    }
  }, [allowAlpha]);

  useEffect(() => {
    if (draggingRef.current) return;
    const next = normalizeHexColor(value);
    const nextHue = hexToHsv(next).h;
    const nextAlpha = clampPercent(String(alpha));
    colorRef.current = next;
    hueRef.current = nextHue;
    alphaRef.current = nextAlpha;
    setSnapshot({ color: next, hue: nextHue, alpha: nextAlpha });
    syncDom();
  }, [alpha, syncDom, value]);

  function commitSnapshot() {
    setSnapshot({
      color: colorRef.current,
      hue: hueRef.current,
      alpha: alphaRef.current,
    });
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
    const next = hsvToHex(hueRef.current, saturation, valueLevel);
    colorRef.current = next;
    syncDom();
    onChange(next, hueRef.current);
  }

  function startBoardDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    boardRectRef.current = event.currentTarget.getBoundingClientRect();
    draggingRef.current = true;
    pickFromBoard(event);
  }

  function moveBoardDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    pickFromBoard(event);
  }

  function endBoardDrag() {
    boardRectRef.current = null;
    draggingRef.current = false;
    commitSnapshot();
    onCommit?.();
  }

  function huePreviewPercent(percent: number) {
    const nextHue = Math.round((percent / 100) * 360);
    hueRef.current = nextHue;
    const hsv = hexToHsv(colorRef.current);
    const next = hsvToHex(nextHue, hsv.s, hsv.v);
    colorRef.current = next;
    syncDom();
    onChange(next, nextHue);
  }

  function alphaPreviewPercent(percent: number) {
    alphaRef.current = percent;
    syncDom();
    onAlphaChange?.(percent);
  }

  return (
    <>
      <div
        className={
          isCompact
            ? "relative h-[132px] touch-none cursor-crosshair"
            : "relative h-[146px] touch-none cursor-crosshair"
        }
        onPointerDown={startBoardDrag}
        onPointerMove={moveBoardDrag}
        onPointerUp={endBoardDrag}
        onPointerCancel={endBoardDrag}
      >
        <div
          ref={boardRef}
          className="absolute inset-0 overflow-hidden rounded-md"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${snapshot.hue} 100% 50%)`,
          }}
        />
        <span
          ref={boardDotRef}
          className={
            isCompact
              ? "pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left,top]"
              : "pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left,top]"
          }
          style={{
            left: `${hexToHsv(snapshot.color).s * 100}%`,
            top: `${(1 - hexToHsv(snapshot.color).v) * 100}%`,
          }}
        />
      </div>
      <LinearSlider
        valuePercent={(snapshot.hue / 360) * 100}
        thumbRef={hueThumbRef}
        trackClassName={
          isCompact
            ? "relative h-3 touch-none rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
            : "relative h-4 touch-none rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]"
        }
        thumbClassName="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]"
        thumbStyle={{ background: `hsl(${snapshot.hue} 100% 50%)` }}
        onDragStart={() => {
          draggingRef.current = true;
        }}
        onPreviewPercent={huePreviewPercent}
        onCommit={() => {
          draggingRef.current = false;
          commitSnapshot();
          onCommit?.();
        }}
      />
      {allowAlpha ? (
        <LinearSlider
          valuePercent={snapshot.alpha}
          trackRef={alphaTrackRef}
          thumbRef={alphaThumbRef}
          trackClassName={
            isCompact
              ? "relative h-3 touch-none rounded-full"
              : "relative h-4 touch-none rounded-full"
          }
          trackStyle={{
            backgroundImage: `linear-gradient(to right, transparent, ${snapshot.color}), repeating-conic-gradient(#888 0% 25%, #555 0% 50%)`,
            backgroundSize: `100% 100%, 12px 12px`,
          }}
          thumbClassName="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)] will-change-[left]"
          thumbStyle={{
            background: `rgba(${rgbChannels(snapshot.color).red}, ${rgbChannels(snapshot.color).green}, ${rgbChannels(snapshot.color).blue}, ${snapshot.alpha / 100})`,
          }}
          onDragStart={() => {
            draggingRef.current = true;
          }}
          onPreviewPercent={alphaPreviewPercent}
          onCommit={() => {
            draggingRef.current = false;
            commitSnapshot();
            onCommit?.();
          }}
        />
      ) : null}
      <div className="flex gap-2">
        <div
          className={`flex min-w-0 flex-1 items-center rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 transition focus-within:border-[var(--clipper-accent)] focus-within:ring-2 focus-within:ring-[rgb(var(--clipper-accent-rgb)/0.2)] ${isCompact ? "h-7" : "h-8"}`}
        >
          <input
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white outline-none"
            value={snapshot.color}
            onChange={(event) => {
              const next = normalizeHexColor(event.target.value);
              const nextHue = hexToHsv(next).h;
              colorRef.current = next;
              hueRef.current = nextHue;
              syncDom();
              setSnapshot({
                color: next,
                hue: nextHue,
                alpha: alphaRef.current,
              });
              onChange(next, nextHue);
              onCommit?.();
            }}
          />
          <FillInlineKeyframeDiamond
            state={findFillKeyframeState(keyframeStates, "style.fill.color")}
            onToggleKeyframe={onToggleKeyframe}
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
