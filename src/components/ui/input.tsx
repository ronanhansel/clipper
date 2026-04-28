import { useEffect, useRef, type ChangeEvent, type ComponentProps, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "../../lib/utils";

const pixelsPerScrubStep = 4;
const numberScrubActivationDistance = 3;
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
  initialValue: string;
  input: HTMLInputElement;
  lastCommitAt: number;
  mode: NumberScrubMode;
  onChange?: ComponentProps<"input">["onChange"];
  remainder: number;
  step: number;
  throttleMs: number;
  value: number;
};

type PendingNumberScrubState = Omit<NumberScrubState, "initialBodyCursor" | "initialInputCursor" | "lastCommitAt" | "remainder"> & {
  originX: number;
  originY: number;
};

export function Input({ className, type = "text", numberScrubMode = "commit", numberScrubCommitThrottleMs = defaultNumberScrubCommitThrottleMs, onBlur, onChange, onFocus, onKeyDown, onPointerDown, ...props }: InputProps) {
  const scrubRef = useRef<NumberScrubState | null>(null);
  const pendingScrubRef = useRef<PendingNumberScrubState | null>(null);
  const focusedValueRef = useRef<string | null>(null);

  useEffect(() => {
    if (type !== "number") return;

    function cancelPendingScrub() {
      pendingScrubRef.current = null;
    }

    function stopScrub(commit = true, restore = false) {
      const scrub = scrubRef.current;
      if (!scrub) return;

      scrub.input.style.cursor = scrub.initialInputCursor;
      document.body.style.cursor = scrub.initialBodyCursor;
      if (restore) restoreScrubValue(scrub);
      else if (commit) commitInputValue(scrub.input);
      scrubRef.current = null;
      if (document.pointerLockElement === scrub.input) document.exitPointerLock();
    }

    function startScrub(pending: PendingNumberScrubState, initialRemainder = 0) {
      const { input } = pending;
      const initialInputCursor = input.style.cursor;
      const initialBodyCursor = document.body.style.cursor;
      input.style.cursor = "ew-resize";
      document.body.style.cursor = "ew-resize";
      scrubRef.current = {
        ...pending,
        initialBodyCursor,
        initialInputCursor,
        lastCommitAt: performance.now(),
        remainder: initialRemainder,
      };
      pendingScrubRef.current = null;
      input.requestPointerLock?.();
    }

    function updateScrub(event: MouseEvent) {
      const pending = pendingScrubRef.current;
      if (pending) {
        if ((event.buttons & 1) !== 1) {
          cancelPendingScrub();
          return;
        }

        const deltaX = event.clientX - pending.originX;
        const deltaY = event.clientY - pending.originY;
        if (Math.hypot(deltaX, deltaY) < numberScrubActivationDistance) return;

        event.preventDefault();
        startScrub(pending, deltaX / pixelsPerScrubStep);
        return;
      }

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
      if (document.pointerLockElement) return;

      const activeInput = scrubRef.current?.input;
      stopScrub(true, true);
      activeInput?.blur();
    }

    function stopScrubOnMouseUp() {
      cancelPendingScrub();
      stopScrub();
    }

    function stopScrubOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      const activeInput = scrubRef.current?.input;
      cancelPendingScrub();
      stopScrub(true, true);
      activeInput?.blur();
    }

    document.addEventListener("mousemove", updateScrub);
    document.addEventListener("mouseup", stopScrubOnMouseUp);
    document.addEventListener("keydown", stopScrubOnEscape, true);
    document.addEventListener("pointerlockchange", stopScrubOnPointerUnlock);
    return () => {
      document.removeEventListener("mousemove", updateScrub);
      document.removeEventListener("mouseup", stopScrubOnMouseUp);
      document.removeEventListener("keydown", stopScrubOnEscape, true);
      document.removeEventListener("pointerlockchange", stopScrubOnPointerUnlock);
      cancelPendingScrub();
      if (scrubRef.current) stopScrub(false);
    };
  }, [type]);

  function startNumberScrub(event: PointerEvent<HTMLInputElement>) {
    if (type === "number" && isNumberInputSpinnerHit(event)) {
      event.stopPropagation();
      return;
    }

    onPointerDown?.(event);
    if (event.defaultPrevented || type !== "number" || event.button !== 0) return;

    const input = event.currentTarget;
    if (props.disabled || props.readOnly) return;

    const value = Number(input.value);
    if (!Number.isFinite(value)) return;

    input.focus();

    const step = getInputStep(input);
    pendingScrubRef.current = {
      decimals: getStepDecimals(step),
      initialValue: input.value,
      input,
      mode: numberScrubMode,
      onChange,
      originX: event.clientX,
      originY: event.clientY,
      step,
      throttleMs: Math.max(0, numberScrubCommitThrottleMs),
      value,
    };
  }

  function blurOnConfirmKey(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || (event.key !== "Enter" && event.key !== "Escape")) return;
    if (event.key === "Escape") restoreInputValue(event.currentTarget, focusedValueRef.current, onChange);
    event.currentTarget.blur();
  }

  function rememberFocusedValue(event: FocusEvent<HTMLInputElement>) {
    focusedValueRef.current = event.currentTarget.value;
    onFocus?.(event);
  }

  function clearFocusedValue(event: FocusEvent<HTMLInputElement>) {
    onBlur?.(event);
    focusedValueRef.current = null;
  }

  return (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-white outline-none transition placeholder:text-[#69707f] focus:border-[var(--clipper-accent)] focus:ring-2 focus:ring-[rgb(var(--clipper-accent-rgb)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#ff6b6b] aria-invalid:ring-[#ff6b6b]/20",
        className,
      )}
      onBlur={clearFocusedValue}
      onKeyDown={blurOnConfirmKey}
      onChange={onChange}
      onFocus={rememberFocusedValue}
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

function restoreInputValue(input: HTMLInputElement, value: string | null, onChange?: ComponentProps<"input">["onChange"]) {
  if (value === null || input.value === value) return;
  setNativeInputValue(input, value);
  commitInputValue(input);
  onChange?.({ target: input, currentTarget: input } as ChangeEvent<HTMLInputElement>);
}

function restoreScrubValue(scrub: NumberScrubState) {
  restoreInputValue(scrub.input, scrub.initialValue, scrub.onChange);
}

function isNumberInputSpinnerHit(event: PointerEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (input.type !== "number") return false;

  const bounds = input.getBoundingClientRect();
  const spinnerWidth = Math.min(24, bounds.width * 0.35);
  return event.clientX >= bounds.right - spinnerWidth;
}
