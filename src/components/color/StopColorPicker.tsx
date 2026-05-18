import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeHexColor } from "./colorMath";
import { SolidColorPickerPanel } from "./SolidColorPickerPanel";

export function StopColorPicker({
  value,
  onChange,
  onPreview,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  onPreview?: (value: string) => void;
  onCommit?: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const latestRef = useRef(value);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    latestRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 240;
    const height = 220;
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
              className="fixed z-[7200] grid w-[240px] gap-2 overflow-hidden rounded-xl border border-[#2d313b] bg-[#101116] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.48)]"
              style={{ left: position.left, top: position.top }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <SolidColorPickerPanel
                value={value}
                variant="compact"
                onChange={(next) => {
                  latestRef.current = next;
                  if (onPreview) onPreview(next);
                  else onChange(next);
                }}
                onCommit={() => {
                  onChange(latestRef.current);
                  onCommit?.();
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
