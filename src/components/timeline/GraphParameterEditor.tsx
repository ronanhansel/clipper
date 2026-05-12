import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { ColorSelector } from "../ColorSelector";
import { EaseSelectItems } from "./EaseSelectItems";
import { TooltipProvider } from "../ui/tooltip";
import {
  isGraphInputExpression,
  isPotentialGraphInputExpression,
  type GraphInputBindingOption,
} from "../../core/graphParameterBindings";

export type GraphParameterEditorField = {
  key: string;
  label: string;
  value: string;
  type?: "number" | "text" | "color" | "gradient" | "button" | "order";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly { value: string; label: string }[];
  items?: readonly { value: string; label: string }[];
  bindingOptions?: readonly GraphInputBindingOption[];
};

export type GraphParameterEditorGroup = {
  id: string;
  label?: string;
  columns?: number;
  fields: GraphParameterEditorField[];
};

export type GraphParameterEditorSchema = {
  width: number;
  height: number;
  groups: GraphParameterEditorGroup[];
};

type GraphParameterEditorVariant = "default" | "inspector" | "timePopup";
type GraphParameterChange = (
  key: string,
  value: string,
  options?: { history?: boolean },
) => void;

export function GraphParameterEditor({
  schema,
  onChange,
  variant = "default",
}: {
  schema: GraphParameterEditorSchema;
  onChange: GraphParameterChange;
  variant?: GraphParameterEditorVariant;
}) {
  const isTimePopup = variant === "timePopup";
  const isInspector = variant === "inspector";
  const bindingOptions = getGraphParameterBindingOptions(schema);
  const [dragInputExpression, setDragInputExpression] = useState<string | null>(
    null,
  );
  return (
    <div
      className={
        isTimePopup
          ? "grid gap-2 overflow-visible"
          : "grid gap-3 overflow-visible"
      }
    >
      {schema.groups.map((group) =>
        group.label ? (
          <GraphParameterGroup
            key={group.id}
            group={group}
            variant={variant}
            onChange={onChange}
            dragInputExpression={dragInputExpression}
          />
        ) : (
          <div
            key={group.id}
            className={isTimePopup ? "grid gap-1.5" : "grid gap-1"}
          >
            {group.fields.map((field) => (
              <GraphParameterInlineField
                key={field.key}
                field={field}
                variant={variant}
                onChange={onChange}
                dragInputExpression={dragInputExpression}
              />
            ))}
          </div>
        ),
      )}
      <GraphParameterInputPalette
        options={bindingOptions}
        sticky={isInspector}
        onDragInputChange={setDragInputExpression}
      />
    </div>
  );
}

function GraphParameterGroup({
  group,
  variant,
  onChange,
  dragInputExpression,
}: {
  group: GraphParameterEditorGroup;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  dragInputExpression: string | null;
}) {
  const editSessionActiveRef = useRef(false);
  function commitEditSessionChange(key: string, value: string) {
    const history = !editSessionActiveRef.current;
    editSessionActiveRef.current = true;
    onChange(key, value, { history });
  }
  const isTimePopup = variant === "timePopup";
  return (
    <div
      className={
        variant === "inspector"
          ? `grid gap-3 ${group.id.startsWith("condition-rule-") ? "border-t border-[#2d313b] pt-3" : ""}`
          : isTimePopup
            ? "grid gap-1.5"
            : "grid gap-1.5"
      }
    >
      <div
        className={
          variant === "inspector"
            ? "text-[13px] font-extrabold text-[#9da3b2]"
            : isTimePopup
              ? "text-[14px] font-extrabold leading-none text-[#f3f6fb]"
              : "text-[10px] font-bold text-[#7f8794]"
        }
      >
        {group.label}
      </div>
      <div
        className={
          variant === "inspector"
            ? "grid gap-4"
            : isTimePopup
              ? "grid gap-1.5"
              : "grid gap-2"
        }
        style={{
          gridTemplateColumns: `repeat(${group.columns ?? 1}, minmax(0, 1fr))`,
        }}
      >
        {group.fields.map((field) => (
          <GraphParameterBoxField
            key={field.key}
            field={field}
            variant={variant}
            onChange={onChange}
            dragInputExpression={dragInputExpression}
          />
        ))}
      </div>
    </div>
  );
}

function GraphParameterInlineField({
  field,
  variant,
  onChange,
  dragInputExpression,
}: {
  field: GraphParameterEditorField;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  dragInputExpression: string | null;
}) {
  const editSessionActiveRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState(false);
  useEffect(() => {
    if (!dragInputExpression) setDropHover(false);
  }, [dragInputExpression]);
  function commitEditSessionChange(key: string, value: string) {
    const history = !editSessionActiveRef.current;
    editSessionActiveRef.current = true;
    onChange(key, value, { history });
  }
  function bindDroppedInput(event: DragEvent) {
    const value = readDroppedGraphInput(event);
    if (value) event.preventDefault();
    if (!value || !canBindGraphInput(field, value)) return;
    event.preventDefault();
    setDropHover(false);
    onChange(field.key, value, { history: true });
  }
  if (field.options)
    return (
      <GraphParameterSelectField
        field={field}
        variant={variant}
        onChange={onChange}
        inline
      />
    );
  if (field.type === "text")
    return (
      <GraphParameterTextField
        field={field}
        variant={variant}
        onChange={onChange}
        inline
      />
    );
  if (field.type === "color")
    return (
      <GraphParameterColorField
        field={field}
        variant={variant}
        onChange={onChange}
        inline
      />
    );
  if (field.type === "gradient")
    return (
      <GraphParameterGradientField
        field={field}
        variant={variant}
        onChange={onChange}
        inline
      />
    );
  if (field.type === "button")
    return <GraphParameterButtonField field={field} onChange={onChange} />;
  if (field.type === "order")
    return <GraphParameterOrderField field={field} onChange={onChange} />;
  const split = splitParameterUnit(field.value, field.unit);
  const displayValue = isGraphInputExpression(field.value)
    ? field.value
    : getNumberFieldDisplayValue(field, split.value);
  const isTimePopup = variant === "timePopup";
  const isInspector = variant === "inspector";
  const inputValue = focused && draftValue !== null ? draftValue : displayValue;
  const canScrub =
    field.key !== "repeat" &&
    displayValue !== "" &&
    !isGraphInputExpression(displayValue);
  const dropActive = Boolean(
    dragInputExpression && canBindGraphInput(field, dragInputExpression),
  );
  const dropInputClass = dropHover
    ? "border-[#64e6a2] bg-[#143326] shadow-[0_0_0_1px_rgba(100,230,162,0.45)]"
    : dropActive
      ? "border-[#8d6cff] bg-[#1f1a35]"
      : "";
  return (
    <label
      onDragOver={(event) => {
        if (dropActive) event.preventDefault();
      }}
      onDrop={bindDroppedInput}
      className={
        isInspector
          ? "grid gap-1.5"
          : isTimePopup
            ? "grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2"
            : "grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2"
      }
    >
      <span
        className={
          isInspector
            ? "text-[12px] font-bold text-[#8f96a3]"
            : isTimePopup
              ? "text-[11px] font-extrabold leading-none tracking-[-0.02em] text-[#8e97a7]"
              : "text-[10px] font-bold text-[#7f8794]"
        }
      >
        {field.label}
      </span>
      <div
        className={
          isInspector
            ? "relative min-w-0"
            : isTimePopup
              ? "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 rounded-[7px] border border-transparent bg-[#0a1019]/70 px-2 py-0.5 transition focus-within:border-[#526582] focus-within:bg-[#0b1018]"
              : "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-transparent bg-transparent px-1 transition hover:bg-[#141b27] focus-within:border-[#3d4b62] focus-within:bg-[#0b1018]"
        }
      >
        <span
          className={
            isInspector
              ? "pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[12px] font-extrabold text-[#8f96a3]"
              : isTimePopup
                ? "min-w-[10px] text-left text-[11px] font-extrabold leading-none text-[#8e97a7]"
                : "min-w-[12px] text-left text-[10px] font-bold text-[#7f8794]"
          }
        >
          {split.unit}
        </span>
        <Input
          type="text"
          inputMode={canScrub ? "decimal" : undefined}
          min={field.min}
          max={field.max}
          step={getNumberFieldStep(field)}
          numberScrubMode={!isInspector && canScrub ? "continuous" : undefined}
          numberScrubCommitThrottleMs={16}
          className={
            isInspector
              ? `${split.unit ? "pl-11" : ""} h-8 min-w-0 text-right ${dropInputClass}`
              : isTimePopup
                ? "h-5 min-w-0 border-0 bg-transparent px-0 py-0 text-right text-[11px] font-extrabold leading-none text-[#f0f4fb] [appearance:textfield] focus:border-0 focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                : "h-6 min-w-0 border-0 bg-transparent px-0 py-0 text-right text-[12px] font-semibold text-[#e4e9f2] focus:border-0 focus:ring-0"
          }
          value={inputValue}
          onFocus={() => {
            setFocused(true);
            setDraftValue(displayValue);
            editSessionActiveRef.current = false;
          }}
          onBlur={(event) => {
            if (draftValue !== null) {
              commitNumberField(
                field,
                event.currentTarget.value,
                split.unit,
                commitEditSessionChange,
                { clamp: true },
              );
            }
            setFocused(false);
            setDraftValue(null);
            editSessionActiveRef.current = false;
          }}
          onChange={(event) => {
            const value = event.target.value;
            if (
              !isAllowedNumberInput(value, field.key === "repeat") &&
              !isPotentialGraphInputExpression(value)
            )
              return;
            setDraftValue(value);
          }}
          onDragOver={(event) => {
            if (dropActive) {
              event.preventDefault();
              setDropHover(true);
            }
          }}
          onDragEnter={(event) => {
            if (dropActive) {
              event.preventDefault();
              setDropHover(true);
            }
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={bindDroppedInput}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        />
      </div>
    </label>
  );
}

function GraphParameterOrderField({
  field,
  onChange,
}: {
  field: GraphParameterEditorField;
  onChange: GraphParameterChange;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const items = field.items ?? [];
  function commitOrder(nextItems: readonly { value: string; label: string }[]) {
    onChange(field.key, JSON.stringify(nextItems.map((item) => item.value)), {
      history: true,
    });
  }
  function moveItem(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commitOrder(next);
  }
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-bold text-[#8f96a3]">
        {field.label}
      </span>
      <div className="grid gap-1">
        {items.length ? (
          items.map((item, index) => (
            <button
              key={item.value}
              type="button"
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                moveItem(dragIndex ?? index, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className="cursor-grab rounded-[6px] border border-[#30343d] bg-[#171a21] px-2 py-1.5 text-left text-[12px] font-bold text-[#dfe2ea] active:cursor-grabbing"
            >
              {item.label}
            </button>
          ))
        ) : (
          <div className="rounded-[6px] border border-[#30343d] bg-[#171a21] px-2 py-1.5 text-[12px] font-bold text-[#8f96a3]">
            No inputs
          </div>
        )}
      </div>
    </div>
  );
}

function GraphParameterBoxField({
  field,
  variant,
  onChange,
  dragInputExpression,
}: {
  field: GraphParameterEditorField;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  dragInputExpression: string | null;
}) {
  const editSessionActiveRef = useRef(false);
  const [dropHover, setDropHover] = useState(false);
  useEffect(() => {
    if (!dragInputExpression) setDropHover(false);
  }, [dragInputExpression]);
  function commitEditSessionChange(key: string, value: string) {
    const history = !editSessionActiveRef.current;
    editSessionActiveRef.current = true;
    onChange(key, value, { history });
  }
  function bindDroppedInput(event: DragEvent) {
    const value = readDroppedGraphInput(event);
    if (value) event.preventDefault();
    if (!value || !canBindGraphInput(field, value)) return;
    event.preventDefault();
    setDropHover(false);
    onChange(field.key, value, { history: true });
  }
  const [focused, setFocused] = useState(false);
  const [draftValue, setDraftValue] = useState<string | null>(null);
  if (field.options)
    return (
      <GraphParameterSelectField
        field={field}
        variant={variant}
        onChange={onChange}
      />
    );
  if (field.type === "text")
    return (
      <GraphParameterTextField
        field={field}
        variant={variant}
        onChange={onChange}
      />
    );
  if (field.type === "color")
    return (
      <GraphParameterColorField
        field={field}
        variant={variant}
        onChange={onChange}
      />
    );
  if (field.type === "gradient")
    return (
      <GraphParameterGradientField
        field={field}
        variant={variant}
        onChange={onChange}
      />
    );
  if (field.type === "button")
    return <GraphParameterButtonField field={field} onChange={onChange} />;
  if (field.type === "order")
    return <GraphParameterOrderField field={field} onChange={onChange} />;
  const split = splitParameterUnit(field.value, field.unit);
  const displayValue = isGraphInputExpression(field.value)
    ? field.value
    : getNumberFieldDisplayValue(field, split.value);
  const isInspector = variant === "inspector";
  const inputValue = focused && draftValue !== null ? draftValue : displayValue;
  const canScrub =
    field.key !== "repeat" &&
    displayValue !== "" &&
    !isGraphInputExpression(displayValue);
  const dropActive = Boolean(
    dragInputExpression && canBindGraphInput(field, dragInputExpression),
  );
  const dropInputClass = dropHover
    ? "border-[#64e6a2] bg-[#143326] shadow-[0_0_0_1px_rgba(100,230,162,0.45)]"
    : dropActive
      ? "border-[#8d6cff] bg-[#1f1a35]"
      : "";
  return (
    <label
      onDragOver={(event) => {
        if (dropActive) event.preventDefault();
      }}
      onDrop={bindDroppedInput}
      className={isInspector ? "grid gap-1.5" : "grid gap-1"}
    >
      <span
        className={
          isInspector
            ? "text-[12px] font-bold text-[#8f96a3]"
            : "text-[9px] font-bold text-[#697280]"
        }
      >
        {field.label}
      </span>
      <div
        className={
          isInspector
            ? "relative min-w-0"
            : "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-transparent bg-[#0c121b] px-1.5 transition hover:bg-[#141b27] focus-within:border-[#3d4b62] focus-within:bg-[#0b1018]"
        }
      >
        <span
          className={
            isInspector
              ? "pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[12px] font-extrabold text-[#8f96a3]"
              : "min-w-[10px] text-left text-[10px] font-bold text-[#7f8794]"
          }
        >
          {split.unit}
        </span>
        <Input
          type="text"
          inputMode={canScrub ? "decimal" : undefined}
          min={field.min}
          max={field.max}
          step={getNumberFieldStep(field)}
          numberScrubMode={!isInspector && canScrub ? "continuous" : undefined}
          numberScrubCommitThrottleMs={16}
          className={
            isInspector
              ? `${split.unit ? "pl-11" : ""} h-8 min-w-0 text-right ${dropInputClass}`
              : "h-6 min-w-0 border-0 bg-transparent px-0 py-0 text-right text-[12px] font-semibold text-[#e4e9f2] focus:border-0 focus:ring-0"
          }
          value={inputValue}
          onFocus={() => {
            setFocused(true);
            setDraftValue(displayValue);
            editSessionActiveRef.current = false;
          }}
          onBlur={(event) => {
            if (draftValue !== null) {
              commitNumberField(
                field,
                event.currentTarget.value,
                split.unit,
                commitEditSessionChange,
                { clamp: true },
              );
            }
            setFocused(false);
            setDraftValue(null);
            editSessionActiveRef.current = false;
          }}
          onChange={(event) => {
            const value = event.target.value;
            if (
              !isAllowedNumberInput(value, field.key === "repeat") &&
              !isPotentialGraphInputExpression(value)
            )
              return;
            setDraftValue(value);
          }}
          onDragOver={(event) => {
            if (dropActive) {
              event.preventDefault();
              setDropHover(true);
            }
          }}
          onDragEnter={(event) => {
            if (dropActive) {
              event.preventDefault();
              setDropHover(true);
            }
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={bindDroppedInput}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        />
      </div>
    </label>
  );
}

function GraphParameterButtonField({
  field,
  onChange,
}: {
  field: GraphParameterEditorField;
  onChange: GraphParameterChange;
}) {
  return (
    <button
      type="button"
      className="h-9 rounded-lg border border-[#344155] bg-[#111926] px-3 text-[12px] font-extrabold text-[#dce4f0] transition hover:border-[#596b85] hover:bg-[#172234]"
      onClick={() => onChange(field.key, field.value, { history: true })}
    >
      {field.label}
    </button>
  );
}

function GraphParameterTextField({
  field,
  variant,
  onChange,
  inline = false,
}: {
  field: GraphParameterEditorField;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  inline?: boolean;
}) {
  const editSessionActiveRef = useRef(false);
  function commitEditSessionChange(key: string, value: string) {
    const history = !editSessionActiveRef.current;
    editSessionActiveRef.current = true;
    onChange(key, value, { history });
  }
  const isTimePopup = variant === "timePopup";
  const [focused, setFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(field.value);
  useEffect(() => {
    if (!focused) setDraftValue(field.value);
  }, [field.value, focused]);
  const inputValue = focused ? draftValue : field.value;
  const control = (
    <Input
      className={
        variant === "inspector"
          ? "h-8 min-w-0 text-right"
          : isTimePopup
            ? "h-7 min-w-0 rounded-[7px] border-transparent bg-[#0a1019]/70 px-2 py-0 text-right text-[11px] font-extrabold leading-none text-[#f0f4fb] focus:border-[#526582] focus:ring-0"
            : "h-6 min-w-0 rounded border-transparent bg-[#0c121b] px-1.5 py-0 text-right text-[12px] font-semibold text-[#e4e9f2] hover:bg-[#141b27] focus:border-[#3d4b62] focus:ring-0"
      }
      value={inputValue}
      onFocus={() => {
        setFocused(true);
        setDraftValue(field.value);
        editSessionActiveRef.current = false;
      }}
      onBlur={() => {
        setFocused(false);
        editSessionActiveRef.current = false;
      }}
      onInput={(event) => {
        setDraftValue((event.target as HTMLInputElement).value);
        commitEditSessionChange(
          field.key,
          (event.target as HTMLInputElement).value,
        );
      }}
      onChange={(event) => {
        setDraftValue(event.target.value);
        commitEditSessionChange(field.key, event.target.value);
      }}
    />
  );
  if (inline) {
    return (
      <label
        className={
          variant === "inspector"
            ? "grid gap-1.5"
            : isTimePopup
              ? "grid grid-cols-[76px_1fr] items-center gap-2"
              : "grid grid-cols-[78px_1fr] items-center gap-2"
        }
      >
        <span
          className={
            variant === "inspector"
              ? "text-[12px] font-bold text-[#8f96a3]"
              : isTimePopup
                ? "text-[11px] font-extrabold leading-none tracking-[-0.02em] text-[#8e97a7]"
                : "text-[10px] font-bold text-[#7f8794]"
          }
        >
          {field.label}
        </span>
        {control}
      </label>
    );
  }
  return (
    <label className={variant === "inspector" ? "grid gap-1.5" : "grid gap-1"}>
      <span
        className={
          variant === "inspector"
            ? "text-[12px] font-bold text-[#8f96a3]"
            : "text-[9px] font-bold text-[#697280]"
        }
      >
        {field.label}
      </span>
      {control}
    </label>
  );
}

function GraphParameterColorField({
  field,
  variant,
  onChange,
  inline = false,
}: {
  field: GraphParameterEditorField;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  inline?: boolean;
}) {
  const isTimePopup = variant === "timePopup";
  const control = (
    <ColorSelector
      value={field.value}
      variant={variant === "inspector" ? "default" : "compact"}
      onChange={(value) => onChange(field.key, value)}
      onPreview={(value) => onChange(field.key, value, { history: false })}
    />
  );
  if (inline) {
    return (
      <label
        className={
          variant === "inspector"
            ? "grid gap-1.5"
            : isTimePopup
              ? "grid grid-cols-[76px_1fr] items-center gap-2"
              : "grid grid-cols-[78px_1fr] items-center gap-2"
        }
      >
        <span
          className={
            variant === "inspector"
              ? "text-[12px] font-bold text-[#8f96a3]"
              : isTimePopup
                ? "text-[11px] font-extrabold leading-none tracking-[-0.02em] text-[#8e97a7]"
                : "text-[10px] font-bold text-[#7f8794]"
          }
        >
          {field.label}
        </span>
        {control}
      </label>
    );
  }
  return (
    <label className={variant === "inspector" ? "grid gap-1.5" : "grid gap-1"}>
      <span
        className={
          variant === "inspector"
            ? "text-[12px] font-bold text-[#8f96a3]"
            : "text-[9px] font-bold text-[#697280]"
        }
      >
        {field.label}
      </span>
      {control}
    </label>
  );
}

function GraphParameterGradientField({
  field,
  variant,
  onChange,
  inline = false,
}: {
  field: GraphParameterEditorField;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  inline?: boolean;
}) {
  const isTimePopup = variant === "timePopup";
  const control = (
    <ColorSelector
      value={field.value}
      variant={variant === "inspector" ? "default" : "compact"}
      pickerMode="gradient"
      onChange={(value) => onChange(field.key, value)}
      onPreview={(value) => onChange(field.key, value, { history: false })}
    />
  );
  if (inline) {
    return (
      <label
        className={
          variant === "inspector"
            ? "grid gap-1.5"
            : isTimePopup
              ? "grid grid-cols-[76px_1fr] items-center gap-2"
              : "grid grid-cols-[78px_1fr] items-center gap-2"
        }
      >
        <span
          className={
            variant === "inspector"
              ? "text-[12px] font-bold text-[#8f96a3]"
              : isTimePopup
                ? "text-[11px] font-extrabold leading-none tracking-[-0.02em] text-[#8e97a7]"
                : "text-[10px] font-bold text-[#7f8794]"
          }
        >
          {field.label}
        </span>
        {control}
      </label>
    );
  }
  return (
    <label className={variant === "inspector" ? "grid gap-1.5" : "grid gap-1"}>
      <span
        className={
          variant === "inspector"
            ? "text-[12px] font-bold text-[#8f96a3]"
            : "text-[9px] font-bold text-[#697280]"
        }
      >
        {field.label}
      </span>
      {control}
    </label>
  );
}

function getNumberFieldDisplayValue(
  field: GraphParameterEditorField,
  value: string,
) {
  return isAllowedNumberInput(value, field.key === "repeat") ? value : "";
}

function GraphParameterSelectField({
  field,
  variant,
  onChange,
  inline = false,
}: {
  field: GraphParameterEditorField;
  variant: GraphParameterEditorVariant;
  onChange: GraphParameterChange;
  inline?: boolean;
}) {
  const isTimePopup = variant === "timePopup";
  const control = (
    <Select
      value={field.value}
      onValueChange={(value) => onChange(field.key, value)}
    >
      <SelectTrigger
        className={
          variant === "inspector"
            ? "h-8"
            : isTimePopup
              ? "h-6 flex-row-reverse justify-start rounded-[7px] border-transparent bg-[#0a1019]/70 px-2 text-[11px] font-extrabold leading-none text-[#f0f4fb] hover:bg-[#0c1420] focus:border-[#526582] focus:ring-0 [&>span]:ml-auto [&>span]:text-right"
              : "h-6 flex-row-reverse justify-start rounded border-transparent bg-[#0c121b] px-1.5 text-[12px] font-semibold text-[#e4e9f2] hover:bg-[#141b27] focus:border-[#3d4b62] focus:ring-0 [&>span]:ml-auto [&>span]:text-right"
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[6000]">
        <TooltipProvider delayDuration={1000} skipDelayDuration={0}>
          <SelectGroup>
            {field.key === "ease" ? (
              <EaseSelectItems />
            ) : (
              field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))
            )}
          </SelectGroup>
        </TooltipProvider>
      </SelectContent>
    </Select>
  );
  if (inline) {
    return (
      <label
        className={
          variant === "inspector"
            ? "grid gap-1.5"
            : isTimePopup
              ? "grid grid-cols-[76px_1fr] items-center gap-2"
              : "grid grid-cols-[78px_1fr] items-center gap-2"
        }
      >
        <span
          className={
            variant === "inspector"
              ? "text-[12px] font-bold text-[#8f96a3]"
              : isTimePopup
                ? "text-[11px] font-extrabold leading-none tracking-[-0.02em] text-[#8e97a7]"
                : "text-[10px] font-bold text-[#7f8794]"
          }
        >
          {field.label}
        </span>
        {control}
      </label>
    );
  }
  return (
    <label className={variant === "inspector" ? "grid gap-1.5" : "grid gap-1"}>
      <span
        className={
          variant === "inspector"
            ? "text-[12px] font-bold text-[#8f96a3]"
            : "text-[9px] font-bold text-[#697280]"
        }
      >
        {field.label}
      </span>
      {control}
    </label>
  );
}

function commitNumberField(
  field: GraphParameterEditorField,
  value: string,
  unit: string,
  onChange: GraphParameterChange,
  options: { clamp?: boolean } = {},
) {
  if (isGraphInputExpression(value)) {
    const expression = value.trim();
    if (canBindGraphInput(field, expression)) onChange(field.key, expression);
    return;
  }
  if (!isAllowedNumberInput(value, field.key === "repeat")) return;
  const nextValue = options.clamp ? clampNumberFieldValue(field, value) : value;
  onChange(field.key, `${nextValue}${unit}`);
}

function GraphParameterInputPalette({
  options,
  sticky,
  onDragInputChange,
}: {
  options: readonly GraphInputBindingOption[];
  sticky: boolean;
  onDragInputChange: (expression: string | null) => void;
}) {
  if (!options.length) return null;
  return (
    <div
      className={
        sticky
          ? "sticky bottom-0 z-20 -mx-1 mt-1 border-t border-[#2d313b] bg-[#171920]/95 px-1 pb-1.5 pt-2 backdrop-blur"
          : "mt-1"
      }
    >
      <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#777f8f]">
        Available inputs
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {options.map((option) => {
          return (
            <button
              key={`${option.nodeId}:${option.portId}`}
              type="button"
              draggable
              className="cursor-grab rounded border border-[#343a49] bg-[#151923] px-1.5 py-0.5 text-[10px] font-bold text-[#a8afbd] hover:border-[#6f61d7] hover:text-[#e7e3ff] active:cursor-grabbing"
              title={`${option.label} -> ${option.expression}`}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData(
                  "application/x-clipper-graph-input",
                  option.expression,
                );
                event.dataTransfer.setData("text/plain", option.expression);
                onDragInputChange(option.expression);
              }}
              onDragEnd={() => onDragInputChange(null)}
            >
              {option.expression}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getGraphParameterBindingOptions(schema: GraphParameterEditorSchema) {
  const options = new Map<string, GraphInputBindingOption>();
  for (const group of schema.groups) {
    for (const field of group.fields) {
      for (const option of field.bindingOptions ?? []) {
        if (!options.has(option.expression))
          options.set(option.expression, option);
      }
    }
  }
  return [...options.values()];
}

function readDroppedGraphInput(event: DragEvent) {
  const value =
    event.dataTransfer.getData("application/x-clipper-graph-input") ||
    event.dataTransfer.getData("text/plain");
  return isGraphInputExpression(value) ? value : null;
}

function hasDroppedGraphInput(
  event: DragEvent,
  field: GraphParameterEditorField,
) {
  const value = readDroppedGraphInput(event);
  return Boolean(value && canBindGraphInput(field, value));
}

function canBindGraphInput(field: GraphParameterEditorField, value: string) {
  return Boolean(
    field.bindingOptions?.some((item) => item.expression === value),
  );
}

function clampNumberFieldValue(
  field: GraphParameterEditorField,
  value: string,
) {
  if (value === "" || value.toLowerCase() === "infinity") return value;
  const numeric = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(numeric)) return value;
  const min = field.min ?? -Infinity;
  const max = field.max ?? Infinity;
  const clamped = Math.min(Math.max(numeric, min), max);
  if (numeric === clamped && /[.,]/.test(value)) return value;
  return Number.isInteger(clamped)
    ? String(clamped)
    : String(roundNumber(clamped));
}

function roundNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}

function isAllowedNumberInput(value: string, allowInfinity: boolean) {
  if (value === "") return true;
  if (allowInfinity && "Infinity".toLowerCase().startsWith(value.toLowerCase()))
    return true;
  if (value === "." || value === "-." || value === "," || value === "-,")
    return true;
  return /^-?\d*(?:[.,]\d*)?$/.test(value) && value !== "-";
}

function getNumberFieldStep(field: GraphParameterEditorField) {
  return (
    field.step ?? (field.key === "delay" || field.key === "duration" ? 0.1 : 1)
  );
}

function splitParameterUnit(value: string, fallbackUnit = "") {
  const match = value.match(/^(-?\d+(?:\.\d+)?)([a-z%]+)$/i);
  if (match) return { value: match[1], unit: match[2] };
  if (fallbackUnit) {
    const unitOnlyMatch = value.match(/^([a-z%]+)$/i);
    if (unitOnlyMatch && unitOnlyMatch[1] === fallbackUnit)
      return { value: "", unit: unitOnlyMatch[1] };
  }
  return {
    value:
      fallbackUnit && value.endsWith(fallbackUnit)
        ? value.slice(0, -fallbackUnit.length)
        : value,
    unit: fallbackUnit,
  };
}
