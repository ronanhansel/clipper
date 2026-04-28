import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function QuickAccessTooltip({ name, description, shortcut, children }: { name: string; description: string; shortcut: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align="center">
        <span className="flex items-center justify-between gap-3">
          <strong className="block text-[11px] font-bold text-[#f7f7f8]">{name}</strong>
          {shortcut ? <kbd className="rounded-[5px] border border-[#3b4150] bg-[#171920] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#dfe2ea]">{shortcut}</kbd> : null}
        </span>
        <span className="mt-1 block text-[10px] text-[#9b9da7]">{description}</span>
      </TooltipContent>
    </Tooltip>
  );
}
