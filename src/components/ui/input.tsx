import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type FocusEvent,
  type InputEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import { cn } from "../../lib/utils";

const pixelsPerScrubStep = 12;
const numberScrubActivationDistance = 8;
const defaultNumberScrubCommitThrottleMs = 80;

export const numberInputScrubStartEvent = "clipper:number-input-scrub-start";
export const numberInputScrubEndEvent = "clipper:number-input-scrub-end";

type NumberScrubMode = "commit" | "continuous" | "preview";

type InputProps = ComponentProps<"input"> & {
  numberScrubMode?: NumberScrubMode;
  numberScrubCommitThrottleMs?: number;
  resetValue?: string | number;
  onNumberScrubPreview?: (value: number) => void;
  onNumberScrubStart?: () => void;
  onNumberScrubEnd?: () => void;
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
  onPreview?: (value: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  remainder: number;
  step: number;
  throttleMs: number;
  value: number;
};

type PendingNumberScrubState = Omit<
  NumberScrubState,
  "initialBodyCursor" | "initialInputCursor" | "lastCommitAt" | "remainder"
> & {
  lockRequested?: boolean;
  movementX: number;
  movementY: number;
  originX: number;
  originY: number;
};

export function Input({
  className,
  type = "text",
  numberScrubMode = "commit",
  numberScrubCommitThrottleMs = defaultNumberScrubCommitThrottleMs,
  onBlur,
  onChange,
  onDoubleClick,
  onFocus,
  onKeyDown,
  onNumberScrubPreview,
  onNumberScrubStart,
  onNumberScrubEnd,
  onPointerDown,
  ...props
}: InputProps) {
  const scrubRef = useRef<NumberScrubState | null>(null);
  const pendingScrubRef = useRef<PendingNumberScrubState | null>(null);
  const committingNumberValueRef = useRef(false);
  const focusedValueRef = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [numberDraftValue, setNumberDraftValue] = useState<string | null>(null);
  const { resetValue, ...inputProps } = props;
  const hasReset = resetValue !== undefined;
  const canReset =
    resetValue !== undefined &&
    String(props.value ?? "") !== String(resetValue);

  useEffect(() => {
    if (type !== "number") return;

    function cancelPendingScrub() {
      const pending = pendingScrubRef.current;
      if (pending?.lockRequested && ownsPointerLock(pending.input)) {
        document.exitPointerLock();
      }
      pendingScrubRef.current = null;
    }

    function stopScrub(commit = true, restore = false) {
      const scrub = scrubRef.current;
      if (!scrub) return;

      scrub.input.style.cursor = scrub.initialInputCursor;
      document.body.style.cursor = scrub.initialBodyCursor;
      if (restore) restoreScrubValue(scrub);
      else if (commit) commitNumberInputValue(scrub.input);
      scrub.onEnd?.();
      scrubRef.current = null;
      if (ownsPointerLock(scrub.input)) document.exitPointerLock();
      window.dispatchEvent(new Event(numberInputScrubEndEvent));
    }

    function startScrub(
      pending: PendingNumberScrubState,
      initialRemainder = 0,
    ) {
      const { input } = pending;
      const initialInputCursor = input.style.cursor;
      const initialBodyCursor = document.body.style.cursor;
      input.blur();
      window.getSelection()?.removeAllRanges();
      input.style.cursor = "none";
      document.body.style.cursor = "none";
      scrubRef.current = {
        ...pending,
        initialBodyCursor,
        initialInputCursor,
        lastCommitAt: performance.now(),
        remainder: initialRemainder,
      };
      pendingScrubRef.current = null;
      window.dispatchEvent(new Event(numberInputScrubStartEvent));
      scrubRef.current.onStart?.();
    }

    function updateScrub(event: MouseEvent) {
      const pending = pendingScrubRef.current;
      if (pending) {
        if ((event.buttons & 1) !== 1) {
          cancelPendingScrub();
          return;
        }

        const pointerLocked = ownsPointerLock(pending.input);
        if (pointerLocked) {
          pending.movementX += event.movementX;
          pending.movementY += event.movementY;
        }
        const deltaX = pointerLocked
          ? pending.movementX
          : event.clientX - pending.originX;
        const deltaY = pointerLocked
          ? pending.movementY
          : event.clientY - pending.originY;
        if (Math.hypot(deltaX, deltaY) < numberScrubActivationDistance) return;

        event.preventDefault();
        if (!pending.lockRequested) {
          pending.lockRequested = true;
          requestPointerLockSafely(pending.input);
        }
        startScrub(pending, deltaX / pixelsPerScrubStep);
        return;
      }

      const scrub = scrubRef.current;
      if (!scrub) return;

      const delta = scrub.remainder + event.movementX / pixelsPerScrubStep;
      const wholeSteps = delta > 0 ? Math.floor(delta) : Math.ceil(delta);
      scrub.remainder = delta - wholeSteps;
      if (wholeSteps === 0) return;

      const nextValue = roundNumberToDecimals(
        clampInputValue(scrub.input, scrub.value + wholeSteps * scrub.step),
        scrub.decimals,
      );
      if (nextValue === scrub.value) return;

      scrub.value = nextValue;
      setNativeInputValue(
        scrub.input,
        formatScrubValue(nextValue, scrub.decimals),
      );

      if (scrub.mode === "continuous") {
        const now = performance.now();
        if (now - scrub.lastCommitAt >= scrub.throttleMs) {
          scrub.lastCommitAt = now;
          commitNumberInputValue(scrub.input);
        }
      } else if (scrub.mode === "preview") {
        scrub.onPreview?.(nextValue);
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
      document.removeEventListener(
        "pointerlockchange",
        stopScrubOnPointerUnlock,
      );
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
    if (event.defaultPrevented || type !== "number" || event.button !== 0)
      return;

    const input = event.currentTarget;
    if (props.disabled || props.readOnly) return;

    const value = parseInputNumber(input.value);
    if (!Number.isFinite(value)) return;

    const step = getInputStep(input);
    pendingScrubRef.current = {
      decimals: getStepDecimals(step),
      initialValue: input.value,
      input,
      lockRequested: false,
      mode: numberScrubMode,
      movementX: 0,
      movementY: 0,
      onChange,
      onPreview: onNumberScrubPreview,
      onStart: onNumberScrubStart,
      onEnd: onNumberScrubEnd,
      originX: event.clientX,
      originY: event.clientY,
      step,
      throttleMs: Math.max(0, numberScrubCommitThrottleMs),
      value,
    };
  }

  function blurOnConfirmKey(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      (event.key !== "Enter" && event.key !== "Escape")
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restoreInputValue(event.currentTarget, focusedValueRef.current, onChange);
    }
    event.currentTarget.blur();
  }

  function selectNumberOnDoubleClick(event: ReactMouseEvent<HTMLInputElement>) {
    onDoubleClick?.(event);
    if (event.defaultPrevented || type !== "number") return;

    event.currentTarget.select();
  }

  function rememberFocusedValue(event: FocusEvent<HTMLInputElement>) {
    setFocused(true);
    focusedValueRef.current = event.currentTarget.value;
    if (type === "number") setNumberDraftValue(event.currentTarget.value);
    onFocus?.(event);
  }

  function clearFocusedValue(event: FocusEvent<HTMLInputElement>) {
    if (type === "number")
      clampAndCommitInputValue(event.currentTarget, onChange);
    onBlur?.(event);
    setFocused(false);
    focusedValueRef.current = null;
    setNumberDraftValue(null);
  }

  function changeInputValue(event: ChangeEvent<HTMLInputElement>) {
    if (type === "number" && focused && !committingNumberValueRef.current) {
      setNumberDraftValue(normalizeNumberDraftValue(event.target.value));
      return;
    }
    onChange?.(event);
  }

  function inputInputValue(event: InputEvent<HTMLInputElement>) {
    if (type === "number" && focused && !committingNumberValueRef.current) {
      setNumberDraftValue(
        normalizeNumberDraftValue((event.target as HTMLInputElement).value),
      );
      return;
    }
    inputProps.onInput?.(event);
  }

  function commitNumberInputValue(input: HTMLInputElement) {
    committingNumberValueRef.current = true;
    commitInputValue(input);
    committingNumberValueRef.current = false;
  }

  function resetInputValue() {
    const input = inputRef.current;
    if (!input || resetValue === undefined) return;
    restoreInputValue(input, String(resetValue), onChange);
    input.focus();
  }

  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayedValue =
    type === "number" && focused && numberDraftValue !== null
      ? numberDraftValue
      : formatNumberInputValue(inputProps.value, props.step);
  const renderedType = type === "number" ? "text" : type;

  return (
    <span className="relative block w-full">
      <input
        ref={inputRef}
        type={renderedType}
        {...inputProps}
        inputMode={type === "number" ? "decimal" : inputProps.inputMode}
        className={cn(
          "flex h-8 w-full rounded-[8px] border border-[#2d313b] bg-[#171920] px-2 py-1.5 text-xs font-semibold text-white outline-none transition placeholder:text-[#69707f] focus:border-[var(--clipper-accent)] focus:ring-2 focus:ring-[rgb(var(--clipper-accent-rgb)/0.2)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[#ff6b6b] aria-invalid:ring-[#ff6b6b]/20",
          canReset ? "pr-8" : "",
          className,
        )}
        onBlur={clearFocusedValue}
        onDoubleClick={selectNumberOnDoubleClick}
        onKeyDown={blurOnConfirmKey}
        value={displayedValue}
        onChange={changeInputValue}
        onFocus={rememberFocusedValue}
        onInput={inputInputValue}
        onPointerDown={startNumberScrub}
      />
      {focused && hasReset ? (
        <button
          aria-label="Reset field"
          className={cn(
            "absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-[6px] text-[#9da3b2] transition",
            canReset
              ? "hover:bg-[#252936] hover:text-white"
              : "cursor-default opacity-45",
          )}
          disabled={!canReset}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={resetInputValue}
        >
          <svg
            aria-hidden="true"
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 16 16"
          >
            <path
              d="M4.2 5.2A4.5 4.5 0 1 1 3.5 10"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
            <path
              d="M4.2 2.5v2.7h2.7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

function requestPointerLockSafely(input: HTMLInputElement) {
  try {
    const lockTarget = getPointerLockTarget(input);
    const lockRequest = lockTarget.requestPointerLock?.();
    void Promise.resolve(lockRequest).catch(() => {
      // Pointer lock is optional; number scrubbing still works without it.
    });
  } catch {
    // Some embedded documents reject pointer lock synchronously.
  }
}

function getPointerLockTarget(input: HTMLInputElement): HTMLElement {
  return input.ownerDocument.body || input;
}

function ownsPointerLock(input: HTMLInputElement) {
  const lockedElement = input.ownerDocument.pointerLockElement;
  return (
    lockedElement === input || lockedElement === getPointerLockTarget(input)
  );
}

function getInputStep(input: HTMLInputElement) {
  if (!input.step || input.step === "any") return 1;
  const step = Number(input.step);
  return Number.isFinite(step) && step > 0 ? step : 1;
}

function getStepDecimals(step: number) {
  const [, decimals = ""] = String(step).split(".");
  return Math.min(decimals.length, 2);
}

function clampInputValue(input: HTMLInputElement, value: number) {
  const min = input.min === "" ? -Infinity : Number(input.min);
  const max = input.max === "" ? Infinity : Number(input.max);
  return Math.min(
    Math.max(value, Number.isFinite(min) ? min : -Infinity),
    Number.isFinite(max) ? max : Infinity,
  );
}

function parseInputNumber(value: string) {
  return Number(value);
}

function normalizeNumberDraftValue(value: string) {
  return value.replace(/,/g, ".");
}

function formatScrubValue(value: number, decimals: number) {
  if (decimals === 0) return String(Math.round(value));
  return roundNumberToDecimals(value, decimals)
    .toFixed(decimals)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function roundNumberToDecimals(value: number, decimals: number) {
  const factor = 10 ** Math.min(Math.max(decimals, 0), 2);
  return Math.round(value * factor) / factor;
}

function getStepDecimalsFromValue(step: ComponentProps<"input">["step"]) {
  if (step === undefined || step === "any") return 2;
  const numericStep = Number(step);
  return Number.isFinite(numericStep) && numericStep > 0
    ? getStepDecimals(numericStep)
    : 2;
}

function formatNumberInputValue(
  value: ComponentProps<"input">["value"],
  step: ComponentProps<"input">["step"],
) {
  if (value === undefined || value === null || value === "") return value;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return value;
  return formatScrubValue(numeric, getStepDecimalsFromValue(step));
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(input, value);
}

function commitInputValue(input: HTMLInputElement) {
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clampAndCommitInputValue(
  input: HTMLInputElement,
  onChange?: ComponentProps<"input">["onChange"],
) {
  const value = parseInputNumber(input.value);
  if (!Number.isFinite(value)) return;
  const clamped = clampInputValue(input, value);
  const formatted = formatScrubValue(
    clamped,
    getStepDecimals(getInputStep(input)),
  );
  if (input.value !== formatted) setNativeInputValue(input, formatted);
  commitInputValue(input);
  onChange?.({
    target: input,
    currentTarget: input,
  } as ChangeEvent<HTMLInputElement>);
}

function restoreInputValue(
  input: HTMLInputElement,
  value: string | null,
  onChange?: ComponentProps<"input">["onChange"],
) {
  if (value === null || input.value === value) return;
  setNativeInputValue(input, value);
  commitInputValue(input);
  onChange?.({
    target: input,
    currentTarget: input,
  } as ChangeEvent<HTMLInputElement>);
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
