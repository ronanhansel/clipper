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
  type ReactNode,
} from "react";
import {
  cancelThrottledCommit,
  createNumberScrubVirtualCursor,
  createThrottledCommitState,
  defaultNumberScrubCommitThrottleMs,
  numberScrubActivationDistance,
  pixelsPerNumberScrubStep,
  requestNumberScrubPointerLock,
  scheduleThrottledCommit,
  type NumberScrubPointerLock,
  type NumberScrubVirtualCursor,
  type ThrottledCommitState,
} from "../../app/services/scrubInteractionService";
import { cn } from "../../lib/utils";

export const numberInputScrubStartEvent = "clipper:number-input-scrub-start";
export const numberInputScrubEndEvent = "clipper:number-input-scrub-end";

type NumberScrubMode = "commit" | "continuous" | "preview" | "none";

type InputProps = ComponentProps<"input"> & {
  numberScrubMode?: NumberScrubMode;
  numberScrubCommitThrottleMs?: number;
  resetValue?: string | number;
  unitPrefix?: ReactNode;
  unitPrefixClassName?: string;
  onNumberScrubCommit?: (value: number) => void;
  onNumberScrubPreview?: (value: number) => void;
  onNumberScrubStart?: () => void;
  onNumberScrubEnd?: () => void;
};

type NumberScrubState = {
  commitState: ThrottledCommitState<number>;
  decimals: number;
  initialInputCursor: string;
  initialValue: string;
  input: HTMLInputElement;
  mode: NumberScrubMode;
  onChange?: ComponentProps<"input">["onChange"];
  onCommit?: (value: number) => void;
  onPreview?: (value: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  pointerLock: NumberScrubPointerLock | null;
  pointerId: number;
  remainder: number;
  step: number;
  throttleMs: number;
  value: number;
  virtualCursor: NumberScrubVirtualCursor;
};

type PendingNumberScrubState = Omit<
  NumberScrubState,
  "commitState" | "initialInputCursor" | "remainder" | "virtualCursor"
> & {
  originX: number;
  originY: number;
  pointerId: number;
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
  onNumberScrubCommit,
  onNumberScrubPreview,
  onNumberScrubStart,
  onNumberScrubEnd,
  onPointerDown,
  unitPrefix,
  unitPrefixClassName,
  ...props
}: InputProps) {
  const scrubRef = useRef<NumberScrubState | null>(null);
  const pendingScrubRef = useRef<PendingNumberScrubState | null>(null);
  const onNumberScrubCommitRef = useRef(onNumberScrubCommit);
  const committingNumberValueRef = useRef(false);
  const numberScrubActiveRef = useRef(false);
  const focusedValueRef = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [numberDraftValue, setNumberDraftValue] = useState<string | null>(null);
  const [scrubDraftValue, setScrubDraftValue] = useState<string | null>(null);
  const { resetValue, ...inputProps } = props;
  const hasReset = resetValue !== undefined;
  onNumberScrubCommitRef.current = onNumberScrubCommit;
  const canReset =
    resetValue !== undefined &&
    String(props.value ?? "") !== String(resetValue);

  useEffect(() => {
    if (type !== "number" || numberScrubMode === "none") return;
    let cleanupDeferred = false;
    let listenersDetached = false;

    function detachScrubListeners() {
      if (listenersDetached) return;
      listenersDetached = true;
      document.removeEventListener("mousemove", updateScrub);
      document.removeEventListener("pointerup", stopScrubOnPointerUp, true);
      document.removeEventListener(
        "pointercancel",
        stopScrubOnPointerCancel,
        true,
      );
      document.removeEventListener("keydown", stopScrubOnEscape, true);
    }

    function cancelPendingScrub(releasePointerLock = true) {
      const pending = pendingScrubRef.current;
      if (pending?.input.hasPointerCapture(pending.pointerId))
        pending.input.releasePointerCapture(pending.pointerId);
      if (releasePointerLock) pending?.pointerLock?.release();
      pendingScrubRef.current = null;
    }

    function stopScrub(commit = true, restore = false) {
      const scrub = scrubRef.current;
      if (!scrub) return;

      if (scrub.input.hasPointerCapture(scrub.pointerId))
        scrub.input.releasePointerCapture(scrub.pointerId);
      scrub.input.style.cursor = scrub.initialInputCursor;
      cancelThrottledCommit(scrub.commitState);
      scrubRef.current = null;

      const inputToCommit = scrub.input;
      const onCommitCb = scrub.onCommit;
      const onEndCb = scrub.onEnd;
      const scrubVal = scrub.value;

      const finishScrub = () => {
        scrub.virtualCursor.cleanup();
        const scheduler = inputToCommit.ownerDocument.defaultView ?? window;
        scheduler.requestAnimationFrame(() => {
          scheduler.requestAnimationFrame(() => {
            scheduler.setTimeout(() => {
              setScrubDraftValue(null);
              if (restore) {
                restoreScrubValue(scrub);
              } else if (commit) {
                commitNumberInputValue(inputToCommit);
                onCommitCb?.(scrubVal);
              }
              onEndCb?.();
            }, 0);
          });
        });
      };

      if (scrub.pointerLock) {
        scrub.pointerLock.release(finishScrub);
      } else {
        finishScrub();
      }

      numberScrubActiveRef.current = false;
      window.dispatchEvent(new Event(numberInputScrubEndEvent));
      if (cleanupDeferred) detachScrubListeners();
    }

    function startScrub(
      pending: PendingNumberScrubState,
      initialRemainder = 0,
      event: MouseEvent,
    ) {
      const { input } = pending;
      const initialInputCursor = input.style.cursor;
      numberScrubActiveRef.current = true;
      input.blur();
      window.getSelection()?.removeAllRanges();
      input.style.cursor = "none";
      const pointerLock = requestNumberScrubPointerLock(input.ownerDocument);
      scrubRef.current = {
        ...pending,
        pointerLock,
        commitState: createThrottledCommitState<number>(),
        initialInputCursor,
        remainder: initialRemainder,
        virtualCursor: createNumberScrubVirtualCursor(
          { clientX: pending.originX, clientY: pending.originY },
          event.view?.document ?? document,
        ),
      };
      scrubRef.current.commitState.lastCommitAt = performance.now();
      cancelPendingScrub(false);
      window.dispatchEvent(new Event(numberInputScrubStartEvent));
      scrubRef.current.onStart?.();
    }

    function updateScrub(event: MouseEvent) {
      const pending = pendingScrubRef.current;
      if (pending) {
        const pointerLocked = pending.pointerLock?.locked() ?? false;
        if (!pointerLocked && (event.buttons & 1) !== 1) {
          cancelPendingScrub();
          return;
        }

        const deltaX = pointerLocked
          ? event.movementX
          : event.clientX - pending.originX;
        const deltaY = pointerLocked
          ? event.movementY
          : event.clientY - pending.originY;
        const movedDistance = Math.hypot(deltaX, deltaY);
        if (movedDistance < numberScrubActivationDistance) return;

        event.preventDefault();
        startScrub(pending, deltaX / pixelsPerNumberScrubStep, event);
        return;
      }

      const scrub = scrubRef.current;
      if (!scrub) return;

      const delta =
        scrub.remainder +
        scrub.virtualCursor.move(event) / pixelsPerNumberScrubStep;
      const wholeSteps = delta > 0 ? Math.floor(delta) : Math.ceil(delta);
      scrub.remainder = delta - wholeSteps;
      if (wholeSteps === 0) return;

      const nextValue = roundNumberToDecimals(
        clampInputValue(scrub.input, scrub.value + wholeSteps * scrub.step),
        scrub.decimals,
      );
      if (nextValue === scrub.value) return;

      scrub.value = nextValue;
      const formatted = formatScrubValue(nextValue, scrub.decimals);
      setNativeInputValue(scrub.input, formatted);
      // Keep React-controlled value in sync during scrubbing.
      // Parent inspector rerenders can otherwise overwrite native DOM writes.
      setScrubDraftValue(formatted);

      if (scrub.mode === "continuous") {
        scheduleThrottledCommit(
          scrub.commitState,
          nextValue,
          scrub.throttleMs,
          () => commitNumberInputValue(scrub.input),
        );
      } else if (scrub.mode === "preview") {
        scrub.onPreview?.(nextValue);
      }
    }

    function stopScrubOnPointerUp(event: globalThis.PointerEvent) {
      const activeScrub = scrubRef.current;
      if (!activeScrub) {
        cancelPendingScrub();
        return;
      }
      if (event.pointerId !== activeScrub.pointerId) return;
      if (activeScrub.input.hasPointerCapture(event.pointerId))
        activeScrub.input.releasePointerCapture(event.pointerId);
      stopScrub();
    }

    function stopScrubOnPointerCancel(event: globalThis.PointerEvent) {
      const activeScrub = scrubRef.current;
      if (!activeScrub || event.pointerId !== activeScrub.pointerId) return;
      if (activeScrub.input.hasPointerCapture(event.pointerId))
        activeScrub.input.releasePointerCapture(event.pointerId);
      stopScrub(false, true);
    }

    function stopScrubOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      const activeInput = scrubRef.current?.input;
      cancelPendingScrub();
      stopScrub(true, true);
      activeInput?.blur();
    }

    document.addEventListener("mousemove", updateScrub);
    document.addEventListener("pointerup", stopScrubOnPointerUp, true);
    document.addEventListener("pointercancel", stopScrubOnPointerCancel, true);
    document.addEventListener("keydown", stopScrubOnEscape, true);
    return () => {
      if (scrubRef.current) {
        cleanupDeferred = true;
        return;
      }
      detachScrubListeners();
      cancelPendingScrub();
      numberScrubActiveRef.current = false;
    };
  }, [numberScrubMode, type]);

  function startNumberScrub(event: PointerEvent<HTMLInputElement>) {
    if (type === "number" && isNumberInputSpinnerHit(event)) {
      event.stopPropagation();
      return;
    }

    onPointerDown?.(event);
    if (
      event.defaultPrevented ||
      type !== "number" ||
      numberScrubMode === "none" ||
      event.button !== 0
    )
      return;

    const input = event.currentTarget;
    if (props.disabled || props.readOnly) return;

    const value = parseInputNumber(input.value);
    if (!Number.isFinite(value)) return;

    const step = getInputStep(input);
    input.setPointerCapture(event.pointerId);
    pendingScrubRef.current = {
      decimals: getStepDecimals(step),
      initialValue: input.value,
      input,
      mode: numberScrubMode,
      onChange,
      onCommit: onNumberScrubCommitRef.current,
      onPreview: onNumberScrubPreview,
      onStart: onNumberScrubStart,
      onEnd: onNumberScrubEnd,
      originX: event.clientX,
      originY: event.clientY,
      pointerId: event.pointerId,
      pointerLock: null,
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
    if (type === "number" && !numberScrubActiveRef.current)
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
    type === "number" && scrubDraftValue !== null
      ? scrubDraftValue
      : type === "number" && focused && numberDraftValue !== null
        ? numberDraftValue
        : type === "number"
          ? formatNumberInputValue(inputProps.value, props.step)
          : inputProps.value;
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
          unitPrefix ? "pl-7" : "",
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
      {unitPrefix ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-2 top-1/2 z-10 -translate-y-1/2 select-none text-xs font-bold text-[#8f96a6]",
            unitPrefixClassName,
          )}
        >
          {unitPrefix}
        </span>
      ) : null}
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
