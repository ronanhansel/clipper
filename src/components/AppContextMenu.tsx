import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appNoDragRegion } from "../app/config";
import type { ContextMenuItem, ContextMenuState } from "../app/types";

type ContextMenuPlacement = "left" | "right";

export function AppContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!menu) return;
    function close() {
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <ContextMenuPanel
      items={menu.items}
      position={{ x: menu.x, y: menu.y }}
      onClose={onClose}
    />,
    document.body,
  );
}

function ContextMenuPanel({
  items,
  position,
  anchorRect,
  onClose,
  onPlacementChange,
}: {
  items: ContextMenuItem[];
  position?: { x: number; y: number };
  anchorRect?: DOMRect;
  onClose: () => void;
  onPlacementChange?: (placement: ContextMenuPlacement) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [resolvedPosition, setResolvedPosition] = useState(
    position ?? { x: 0, y: 0 },
  );

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    const gap = 6;
    const margin = 8;
    let x = position?.x ?? (anchorRect ? anchorRect.right + gap : 0);
    let y = position?.y ?? (anchorRect ? anchorRect.top : 0);

    let placement: ContextMenuPlacement = "right";
    if (anchorRect && x + rect.width > window.innerWidth - margin) {
      x = anchorRect.left - rect.width - gap;
      placement = "left";
    }
    if (x + rect.width > window.innerWidth - margin)
      x = window.innerWidth - rect.width - margin;
    if (y + rect.height > window.innerHeight - margin)
      y = window.innerHeight - rect.height - margin;

    setResolvedPosition({ x: Math.max(margin, x), y: Math.max(margin, y) });
    onPlacementChange?.(placement);
  }, [anchorRect, items, onPlacementChange, position]);

  return (
    <div
      ref={ref}
      className={`${appNoDragRegion} fixed z-[70] min-w-[160px] rounded-lg border border-[#2d313b] bg-[#15171e] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.45)]`}
      style={{ left: resolvedPosition.x, top: resolvedPosition.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {items.map((item) => (
        <ContextMenuRow item={item} key={item.label} onClose={onClose} />
      ))}
    </div>
  );
}

function ContextMenuRow({
  item,
  onClose,
}: {
  item: ContextMenuItem;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [submenuPlacement, setSubmenuPlacement] =
    useState<ContextMenuPlacement>("right");
  const hasChildren = Boolean(item.children?.length);
  const bridgeClass =
    submenuPlacement === "right"
      ? "left-full [clip-path:polygon(0_0,100%_50%,0_100%)]"
      : "right-full [clip-path:polygon(100%_0,0_50%,100%_100%)]";

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`flex w-full items-center justify-between gap-5 rounded-md px-2.5 py-1.5 text-left text-xs font-bold ${item.danger ? "text-[#ffb4b4] hover:bg-[#301b1d]" : "text-[#dfe2ea] hover:bg-[#20232c]"} disabled:pointer-events-none disabled:opacity-50`}
        disabled={item.disabled}
        onClick={() => {
          if (hasChildren) return;
          item.action?.();
          onClose();
        }}
      >
        <span>{item.label}</span>
        {hasChildren ? <span className="text-[#737884]">›</span> : null}
      </button>
      {hasChildren && open ? (
        <div
          className={`absolute -top-3 z-50 h-[calc(100%+24px)] w-8 ${bridgeClass}`}
        />
      ) : null}
      {hasChildren && open && rowRef.current ? (
        <ContextMenuPanel
          anchorRect={rowRef.current.getBoundingClientRect()}
          items={item.children ?? []}
          onClose={onClose}
          onPlacementChange={setSubmenuPlacement}
        />
      ) : null}
    </div>
  );
}
