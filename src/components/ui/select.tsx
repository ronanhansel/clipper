import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type EaseValue, easeProgress } from "../../core/easing";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    data-radix-select-trigger=""
    className={cn(
      "flex h-8 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 py-1.5 text-xs font-semibold text-white outline-none transition placeholder:text-[#69707f] focus:border-[var(--clipper-accent)] focus:ring-2 focus:ring-[rgb(var(--clipper-accent-rgb)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-3.5 shrink-0 text-[#9b9da7]" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectScrollUpButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <ChevronUp className="size-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

export const SelectScrollDownButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <ChevronDown className="size-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(
  (
    { className, children, position = "popper", onCloseAutoFocus, ...props },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-[90] max-h-96 min-w-[8rem] cursor-pointer overflow-hidden rounded-[10px] border border-[#2d313b] bg-[#11141a] text-[#f7f7f8] shadow-[0_18px_60px_rgba(0,0,0,0.42)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          requestAnimationFrame(() => {
            (document.activeElement as HTMLElement | null)?.blur();
          });
        }}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

type SelectItemEase = EaseValue;

type SelectItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
  variant?: "default" | "ease";
  ease?: SelectItemEase;
  previewLabel?: string;
};

const easePreviewHoverDelayMs = 600;
const easePreviewSkipDelayMs = 900;
const easePreviewDuration = "1.85s";
const easePreviewMotionPortion = 0.78;
let lastEasePreviewOpenTime = 0;

function selectItemEaseFromValue(value: string | undefined): SelectItemEase {
  return value === "easeIn" ||
    value === "easeOut" ||
    value === "easeInOut" ||
    value === "inAndOut" ||
    value === "expoIn" ||
    value === "expoOut" ||
    value === "circOut" ||
    value === "backOut" ||
    value === "snap"
    ? value
    : "linear";
}

function easePreviewPath(ease: SelectItemEase) {
  const width = 132;
  const height = 72;
  const segments = 96;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const x = index / segments;
    const y = 1 - easeProgress(x, ease);
    return `${index === 0 ? "M" : "L"} ${(x * width).toFixed(2)} ${(y * height).toFixed(2)}`;
  }).join(" ");
}

function easePreviewSampleValues(
  ease: SelectItemEase,
  map: (time: number, progress: number) => number,
) {
  const segments = 80;
  const values = Array.from({ length: segments + 1 }, (_, index) => {
    const time = index / segments;
    return map(time, easeProgress(time, ease)).toFixed(2);
  });
  return [...values, values[values.length - 1]].join(";");
}

function easePreviewKeyTimes() {
  const segments = 80;
  const keyTimes = Array.from({ length: segments + 1 }, (_, index) =>
    ((index / segments) * easePreviewMotionPortion).toFixed(3),
  );
  return [...keyTimes, "1.000"].join(";");
}

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(
  (
    {
      className,
      children,
      variant = "default",
      ease,
      previewLabel,
      value,
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      ...props
    },
    ref,
  ) => {
    const [previewOpen, setPreviewOpen] = useState(false);
    const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previewEase =
      variant === "ease" ? (ease ?? selectItemEaseFromValue(value)) : null;
    const label =
      previewLabel ?? (typeof children === "string" ? children : value);
    // Only build the SVG sample arrays once the popover actually opens. Mounting
    // a Select with N items previously paid this cost N times up-front.
    const preview = useMemo(() => {
      if (!previewEase || !previewOpen) return null;
      const graphKeyTimes = easePreviewKeyTimes();
      return {
        path: easePreviewPath(previewEase),
        graphKeyTimes,
        graphXValues: easePreviewSampleValues(
          previewEase,
          (time) => time * 132,
        ),
        graphYValues: easePreviewSampleValues(
          previewEase,
          (_time, progress) => (1 - progress) * 72,
        ),
        railXValues: easePreviewSampleValues(
          previewEase,
          (_time, progress) => 6 + progress * 142,
        ),
      };
    }, [previewEase, previewOpen]);

    function clearPreviewTimer() {
      if (!previewTimerRef.current) return;
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    function openPreviewAfterDelay() {
      if (!preview) return;
      clearPreviewTimer();
      if (Date.now() - lastEasePreviewOpenTime <= easePreviewSkipDelayMs) {
        setPreviewOpen(true);
        lastEasePreviewOpenTime = Date.now();
        return;
      }

      previewTimerRef.current = setTimeout(() => {
        setPreviewOpen(true);
        lastEasePreviewOpenTime = Date.now();
        previewTimerRef.current = null;
      }, easePreviewHoverDelayMs);
    }

    function closePreview() {
      clearPreviewTimer();
      setPreviewOpen(false);
    }

    useEffect(() => closePreview, []);

    const item = (
      <SelectPrimitive.Item
        ref={ref}
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-[7px] py-1.5 pl-7 pr-2 text-xs font-semibold outline-none transition focus:bg-[#20232c] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          className,
        )}
        value={value}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          if (!event.defaultPrevented) openPreviewAfterDelay();
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          closePreview();
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          closePreview();
        }}
        {...props}
      >
        <span className="absolute left-2 flex size-4 items-center justify-center">
          <SelectPrimitive.ItemIndicator>
            <Check className="size-4 text-[var(--clipper-accent)]" />
          </SelectPrimitive.ItemIndicator>
        </span>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );

    if (!previewEase || variant !== "ease") return item;

    return (
      <Tooltip open={previewOpen}>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          sideOffset={16}
          className="w-[190px] max-w-none overflow-hidden rounded-[8px] border-[#343946] bg-[#10131a] p-0 shadow-[0_22px_70px_rgba(0,0,0,0.54)] data-[state=instant-open]:animate-[clipper-tooltip-in_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
        >
          {preview ? (
            <>
              <div className="border-b border-[#252a35] bg-[radial-gradient(circle_at_72%_0%,rgb(var(--clipper-accent-rgb)/0.18),transparent_42%),linear-gradient(180deg,#171b24,#10131a)] px-3 py-2">
                <strong className="block text-[11px] font-extrabold text-white">
                  {label}
                </strong>
                <span className="mt-0.5 block text-[10px] font-medium text-[#8d94a3]">
                  Timing preview
                </span>
              </div>
              <div className="grid gap-3 px-3 py-3">
                <svg
                  viewBox="0 0 132 72"
                  className="h-[82px] w-full overflow-visible"
                  aria-hidden="true"
                >
                  <path
                    d="M 0 72 L 132 0"
                    stroke="#2d3340"
                    strokeDasharray="3 5"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M 0 72 L 0 0 M 0 72 L 132 72"
                    stroke="#3a404c"
                    strokeWidth="1"
                  />
                  <path
                    d={preview.path}
                    fill="none"
                    stroke="var(--clipper-accent)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                  />
                  <circle
                    r="4.5"
                    fill="#37d6c2"
                    filter="drop-shadow(0 0 8px rgba(55,214,194,0.75))"
                  >
                    <animate
                      attributeName="cx"
                      dur={easePreviewDuration}
                      repeatCount="indefinite"
                      keyTimes={preview.graphKeyTimes}
                      values={preview.graphXValues}
                    />
                    <animate
                      attributeName="cy"
                      dur={easePreviewDuration}
                      repeatCount="indefinite"
                      keyTimes={preview.graphKeyTimes}
                      values={preview.graphYValues}
                    />
                  </circle>
                </svg>
                <svg
                  viewBox="0 0 154 12"
                  className="h-3 w-full overflow-visible"
                  aria-hidden="true"
                >
                  <line
                    x1="6"
                    y1="6"
                    x2="148"
                    y2="6"
                    stroke="#252a35"
                    strokeLinecap="round"
                    strokeWidth="4"
                  />
                  <circle
                    cx="6"
                    cy="6"
                    r="6"
                    fill="var(--clipper-accent)"
                    filter="drop-shadow(0 0 10px rgb(var(--clipper-accent-rgb)/0.45))"
                  >
                    <animate
                      attributeName="cx"
                      dur={easePreviewDuration}
                      repeatCount="indefinite"
                      keyTimes={preview.graphKeyTimes}
                      values={preview.railXValues}
                    />
                  </circle>
                </svg>
              </div>
            </>
          ) : null}
        </TooltipContent>
      </Tooltip>
    );
  },
);
SelectItem.displayName = SelectPrimitive.Item.displayName;
