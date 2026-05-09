import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
} from "react";
import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-[120] max-w-[180px] rounded-[10px] border border-[#2d313b] bg-[#11141a] px-2.5 py-2 text-[11px] leading-snug text-[#dfe2ea] shadow-[0_18px_60px_rgba(0,0,0,0.42)] data-[state=closed]:animate-[clipper-tooltip-out_90ms_ease-in_forwards] data-[state=delayed-open]:animate-[clipper-tooltip-in_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]",
        className,
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="fill-[#11141a]" />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
