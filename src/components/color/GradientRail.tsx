import React, { useEffect, useRef, type PointerEvent } from "react";
import { clamp } from "../../core/math";
import { getStopHandleLeft } from "./gradientLegacy";

type GradientRailStop = {
  color: string;
  position: number;
};

export type GradientRailProps<TStop extends GradientRailStop> = {
  stops: TStop[];
  formatPreview: (stops: TStop[]) => string;
  railClassName: string;
  railStyle?: React.CSSProperties;
  getStopKey: (stop: TStop, index: number) => string;
  renderStopHandle?: (stop: TStop, index: number) => React.ReactNode;
  onPreviewPosition: (index: number, position: number) => void;
  onCommitPosition: (index: number, position: number) => void;
};

export function GradientRail<TStop extends GradientRailStop>({
  stops,
  formatPreview,
  railClassName,
  railStyle,
  getStopKey,
  renderStopHandle,
  onPreviewPosition,
  onCommitPosition,
}: GradientRailProps<TStop>) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const stopHandleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const railRectRef = useRef<DOMRect | null>(null);
  const dragRef = useRef<{ index: number; position: number } | null>(null);
  const initialPreview = formatPreview(stops);

  useEffect(() => {
    stopHandleRefs.current.length = stops.length;
  }, [stops.length]);

  useEffect(() => {
    if (railRef.current) railRef.current.style.backgroundImage = initialPreview;
  }, [initialPreview]);

  function getPosition(event: PointerEvent<HTMLElement>) {
    const rect =
      railRectRef.current ?? railRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return Math.round(
      clamp((event.clientX - rect.left) / rect.width, 0, 1) * 100,
    );
  }

  function previewPosition(index: number, position: number) {
    const handle = stopHandleRefs.current[index];
    if (handle) handle.style.left = getStopHandleLeft(position);
    if (railRef.current) {
      const next = stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, position } : stop,
      ) as TStop[];
      railRef.current.style.backgroundImage = formatPreview(next);
    }
    dragRef.current = { index, position };
    onPreviewPosition(index, position);
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    railRectRef.current = railRef.current?.getBoundingClientRect() ?? null;
    event.currentTarget.style.willChange = "left";
    const position = getPosition(event);
    if (position === null) return;
    previewPosition(index, position);
  }

  function handlePointerMove(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const position = getPosition(event);
    if (position === null) return;
    previewPosition(index, position);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    railRectRef.current = null;
    event.currentTarget.style.willChange = "";
    const pending = dragRef.current;
    dragRef.current = null;
    if (!pending) return;
    onCommitPosition(pending.index, pending.position);
  }

  return (
    <div className="relative h-[54px] px-2 pt-5">
      <div
        ref={railRef}
        className={railClassName}
        style={{ ...railStyle, backgroundImage: initialPreview }}
      />
      {stops.map((stop, index) => (
        <button
          ref={(element) => {
            stopHandleRefs.current[index] = element;
          }}
          key={getStopKey(stop, index)}
          className="absolute top-[14px] grid h-8 w-5 -translate-x-1/2 place-items-start will-change-[left]"
          style={{ left: getStopHandleLeft(stop.position) }}
          type="button"
          onPointerDown={(event) => handlePointerDown(event, index)}
          onPointerMove={(event) => handlePointerMove(event, index)}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          {renderStopHandle ? (
            renderStopHandle(stop, index)
          ) : (
            <span className="h-6 w-5 rounded bg-[#343944] p-0.5 shadow-[0_6px_16px_rgba(0,0,0,0.35)] after:absolute after:left-1/2 after:top-[22px] after:-translate-x-1/2 after:border-x-[5px] after:border-t-[6px] after:border-x-transparent after:border-t-[#343944]">
              <span
                className="block h-full rounded-[3px] border border-white/10"
                style={{ background: stop.color }}
              />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
