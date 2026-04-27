import { type ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-[8px] border border-[#2d313b] bg-[#0d0f14] px-2 py-1.5 text-xs font-semibold text-white outline-none transition placeholder:text-[#69707f] focus:border-[#0099ff] focus:ring-2 focus:ring-[#0099ff]/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#ff6b6b] aria-invalid:ring-[#ff6b6b]/20",
        className,
      )}
      {...props}
    />
  );
}
