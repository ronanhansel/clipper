import { useEffect, useRef, type ComponentProps, type PointerEvent } from "react";
import { cn } from "../../lib/utils";

const pixelsPerScrubStep = 4;
const defaultNumberScrubCommitThrottleMs = 80;

type NumberScrubMode = "commit" | "continuous";

type InputProps = ComponentProps<"input"> & {
  numberScrubMode?: NumberScrubMode;
  numberScrubCommitThrottleMs?: number;
};

type NumberScrubState = {
  decimals: number;
  initialBodyCursor: string;
  initialInputCursor: string;
  input: HTMLInputElement;
  lastCommitAt: number;
  mode: NumberScrubMode;
  remainder: number;
  step: number;
  throttleMs: number;
  value: number;
};

export function Input({ className, type = "text", numberScrubMode = "commit", numberScrubCommitThrottleMs = defaultNumberScrubCommitThrottleMs, onPointerDown, ...props }: InputProps) {
  const scrubRef = useRef<NumberScrubState | null>(null);

  useEffect(() => {
    if (type !== "number") return;

    function stopScrub(commit = true) {
      const scrub = scrubRef.current;
      if (!scrub) return;

      scrub.input.style.cursor = scrub.initialInputCursor;
      document.body.style.cursor = scrub.initialBodyCursor;
      if (commit) commitInputValue(scrub.input);
      scrubRef.current = null;
      if (document.pointerLockElement === scrub.input) document.exitPointerLock();
    }

    function updateScrub(event: MouseEvent) {
      const scrub = scrubRef.current;
      if (!scrub) return;

      const delta = scrub.remainder + event.movementX / pixelsPerScrubStep;
      const wholeSteps = delta > 0 ? Math.floor(delta) : Math.ceil(delta);
      scrub.remainder = delta - wholeSteps;
      if (wholeSteps === 0) return;

      const nextValue = clampInputValue(scrub.input, scrub.value + wholeSteps * scrub.step);
      if (nextValue === scrub.value) return;

      scrub.value = nextValue;
      setNativeInputValue(scrub.input, formatScrubValue(nextValue, scrub.decimals));

      if (scrub.mode === "continuous") {
        const now = performance.now();
        if (now - scrub.lastCommitAt >= scrub.throttleMs) {
          scrub.lastCommitAt = now;
          commitInputValue(scrub.input);
        }
      }
    }

    function stopScrubOnPointerUnlock() {
      if (!document.pointerLockElement) stopScrub();
    }

    function stopScrubOnMouseUp() {
      stopScrub();
    }

    document.addEventListener("mousemove", updateScrub);
    document.addEventListener("mouseup", stopScrubOnMouseUp);
    document.addEventListener("pointerlockchange", stopScrubOnPointerUnlock);
    return () => {
      document.removeEventListener("mousemove", updateScrub);
      document.removeEventListener("mouseup", stopScrubOnMouseUp);
      document.removeEventListener("pointerlockchange", stopScrubOnPointerUnlock);
      if (scrubRef.current) stopScrub(false);
    };
  }, [type]);

  function startNumberScrub(event: PointerEvent<HTMLInputElement>) {
    onPointerDown?.(event);
    if (event.defaultPrevented || type !== "number" || event.button !== 0) return;

    const input = event.currentTarget;
    if (props.disabled || props.readOnly) return;

    const value = Number(input.value);
    if (!Number.isFinite(value)) return;

    event.preventDefault();
    input.focus();

    const step = getInputStep(input);
    const initialInputCursor = input.style.cursor;
    const initialBodyCursor = document.body.style.cursor;
    input.style.cursor = "ew-resize";
    document.body.style.cursor = "ew-resize";
    scrubRef.current = {
      decimals: getStepDecimals(step),
      initialBodyCursor,
      initialInputCursor,
      input,
      lastCommitAt: performance.now(),
      mode: numberScrubMode,
      remainder: 0,
      step,
      throttleMs: Math.max(0, numberScrubCommitThrottleMs),
      value,
    };
    input.requestPointerLock?.();
  }

  return (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-white outline-none transition placeholder:text-[#69707f] focus:border-[var(--clipper-accent)] focus:ring-2 focus:ring-[rgb(var(--clipper-accent-rgb)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#ff6b6b] aria-invalid:ring-[#ff6b6b]/20",
        className,
      )}
      onPointerDown={startNumberScrub}
      {...props}
    />
  );
}

function getInputStep(input: HTMLInputElement) {
  if (!input.step || input.step === "any") return 1;
  const step = Number(input.step);
  return Number.isFinite(step) && step > 0 ? step : 1;
}

function getStepDecimals(step: number) {
  const [, decimals = ""] = String(step).split(".");
  return decimals.length;
}

function clampInputValue(input: HTMLInputElement, value: number) {
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  return Math.min(Math.max(value, Number.isFinite(min) ? min : -Infinity), Number.isFinite(max) ? max : Infinity);
}

function formatScrubValue(value: number, decimals: number) {
  if (decimals === 0) return String(Math.round(value));
  return value.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
}

function commitInputValue(input: HTMLInputElement) {
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
