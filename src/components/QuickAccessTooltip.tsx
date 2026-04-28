import type { ReactElement } from "react";

export function QuickAccessTooltip({ name, description, shortcut, children }: { name: string; description: string; shortcut: string; children: ReactElement }) {
  return (
    <span className="group/quick-tooltip relative inline-grid">
      {children}
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 hidden w-max max-w-[180px] -translate-x-1/2 rounded-[10px] border border-[#2d313b] bg-[#11141a] px-2.5 py-2 text-[11px] leading-snug text-[#dfe2ea] opacity-0 shadow-[0_18px_60px_rgba(0,0,0,0.42)] group-hover/quick-tooltip:block group-hover/quick-tooltip:animate-[clipper-tooltip-in_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]">
        <span className="flex items-center justify-between gap-3">
          <strong className="block text-[11px] font-bold text-[#f7f7f8]">{name}</strong>
          {shortcut ? <kbd className="rounded-[5px] border border-[#3b4150] bg-[#171920] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#dfe2ea]">{shortcut}</kbd> : null}
        </span>
        <span className="mt-1 block text-[10px] text-[#9b9da7]">{description}</span>
      </span>
    </span>
  );
}
