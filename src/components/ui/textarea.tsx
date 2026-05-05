import { type ComponentProps, type KeyboardEvent } from "react";
import { cn } from "../../lib/utils";

export function Textarea({ className, onKeyDown, ...props }: ComponentProps<"textarea">) {
  function blurOnEscape(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.blur();
  }

  return (
    <textarea
      className={cn(
        "flex min-h-[84px] w-full rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 py-1.5 text-xs font-semibold text-white outline-none transition placeholder:text-[#69707f] focus:border-[var(--clipper-accent)] focus:ring-2 focus:ring-[rgb(var(--clipper-accent-rgb)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#ff6b6b] aria-invalid:ring-[#ff6b6b]/20",
        className,
      )}
      onKeyDown={blurOnEscape}
      {...props}
    />
  );
}
