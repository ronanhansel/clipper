import * as SwitchPrimitive from "@radix-ui/react-switch";
import { type ComponentPropsWithoutRef, type ElementRef, forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-[#3b4150] bg-[#171920] p-0.5 outline-none transition focus-visible:border-[var(--clipper-accent)] focus-visible:ring-2 focus-visible:ring-[rgb(var(--clipper-accent-rgb)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-[var(--clipper-accent)] data-[state=checked]:bg-[var(--clipper-accent)]",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-[#dfe2ea] shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-[var(--clipper-accent-foreground)]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
