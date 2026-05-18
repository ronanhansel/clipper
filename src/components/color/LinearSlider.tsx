import React, { useEffect, useRef, type PointerEvent } from "react";
import { clamp } from "../../core/math";
import { clampPercent } from "./colorMath";

export type LinearSliderProps = {
  valuePercent: number;
  trackClassName: string;
  trackStyle?: React.CSSProperties;
  thumbClassName: string;
  thumbStyle?: React.CSSProperties;
  trackRef?: React.MutableRefObject<HTMLDivElement | null>;
  thumbRef?: React.MutableRefObject<HTMLSpanElement | null>;
  onDragStart?: () => void;
  onPreviewPercent: (valuePercent: number) => void;
  onCommit?: () => void;
};

export function LinearSlider({
  valuePercent,
  trackClassName,
  trackStyle,
  thumbClassName,
  thumbStyle,
  trackRef,
  thumbRef,
  onDragStart,
  onPreviewPercent,
  onCommit,
}: LinearSliderProps) {
  const internalTrackRef = useRef<HTMLDivElement | null>(null);
  const internalThumbRef = useRef<HTMLSpanElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  function setTrack(el: HTMLDivElement | null) {
    internalTrackRef.current = el;
    if (trackRef) trackRef.current = el;
  }

  function setThumb(el: HTMLSpanElement | null) {
    internalThumbRef.current = el;
    if (thumbRef) thumbRef.current = el;
  }

  useEffect(() => {
    if (internalThumbRef.current)
      internalThumbRef.current.style.left = `${valuePercent}%`;
  }, [valuePercent]);

  function updateFromEvent(event: PointerEvent<HTMLDivElement>) {
    const rect =
      rectRef.current ?? internalTrackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = clampPercent(
      String(
        Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100),
      ),
    );
    if (internalThumbRef.current)
      internalThumbRef.current.style.left = `${next}%`;
    onPreviewPercent(next);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    rectRef.current = null;
    event.currentTarget.style.willChange = "";
    onCommit?.();
  }

  return (
    <div className="relative py-1.5">
      <div
        ref={setTrack}
        className={trackClassName}
        style={trackStyle}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          rectRef.current = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.willChange = "contents";
          onDragStart?.();
          updateFromEvent(event);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          updateFromEvent(event);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        <span
          ref={setThumb}
          className={thumbClassName}
          style={{ ...thumbStyle, left: `${valuePercent}%` }}
        />
      </div>
    </div>
  );
}
