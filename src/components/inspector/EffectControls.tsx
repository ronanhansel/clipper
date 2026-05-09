import { useState, type ReactNode } from "react";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
} from "../../core/types";
import { clamp, roundTwo } from "../../core/math";
import { mutedCaps } from "../../app/config";
import { SlidersHorizontal } from "lucide-react";
import type {
  AdjustmentEffectDisableCondition,
  AdjustmentEffectNumberParamControl,
  AdjustmentEffectPackage,
  AdjustmentEffectParamControl,
  AdjustmentEffectPointControl,
  AdjustmentEffectSection,
} from "../../core/effects/types";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Coordinate2DField } from "./Coordinate2DField";

export function EffectControls({
  effect,
  layer,
  pickingPointKey,
  onChange,
  onPreviewLayer,
  onClearPreview,
  onPickPoint,
}: {
  effect?: Pick<AdjustmentEffectPackage, "paramControls" | "pointControls">;
  layer: AdjustmentLayer;
  pickingPointKey?: string | null;
  onChange: (updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  onPreviewLayer?: (
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) => void;
  onClearPreview?: () => void;
  onPickPoint?: (control: AdjustmentEffectPointControl) => void;
}) {
  const [openControlSectionKey, setOpenControlSectionKey] = useState<
    string | null
  >(null);

  function getParamValue(control: AdjustmentEffectParamControl) {
    const value = layer.effect.params?.[control.key];
    if (control.type === "boolean")
      return typeof value === "boolean" ? value : control.defaultValue;
    if (control.type === "select")
      return typeof value === "string" ? value : control.defaultValue;
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : control.defaultValue;
  }

  function updateBooleanParam(key: string, value: boolean) {
    onChange((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [key]: value },
      },
    }));
  }

  function getInlineToggleValue(key: string, defaultValue: boolean) {
    const value = layer.effect.params?.[key];
    return typeof value === "boolean" ? value : defaultValue;
  }

  function updateParam(control: AdjustmentEffectParamControl, value: string) {
    if (
      control.type === "boolean" ||
      isAdjustmentControlDisabled(layer, control.disabledWhen)
    )
      return;
    if (control.type === "select") {
      onChange((current) => ({
        ...current,
        effect: {
          ...current.effect,
          params: { ...current.effect.params, [control.key]: value },
        },
      }));
      return;
    }

    const numeric = getParamNumericValue(control, value);
    onChange((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [control.key]: numeric },
      },
    }));
  }

  function previewParam(control: AdjustmentEffectParamControl, value: number) {
    if (
      control.type === "boolean" ||
      control.type === "select" ||
      isAdjustmentControlDisabled(layer, control.disabledWhen)
    )
      return;
    const numeric = getParamNumericValue(control, String(value));
    onPreviewLayer?.((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [control.key]: numeric },
      },
    }));
  }

  function getPointValue(
    control: AdjustmentEffectPointControl,
    axis: "x" | "y",
  ) {
    const key = axis === "x" ? control.xKey : control.yKey;
    const fallback = axis === "x" ? control.xDefault : control.yDefault;
    const value = Number(layer.effect.params?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function updatePointParam(
    control: AdjustmentEffectPointControl,
    axis: "x" | "y",
    value: string,
  ) {
    if (isAdjustmentControlDisabled(layer, control.disabledWhen)) return;
    const key = axis === "x" ? control.xKey : control.yKey;
    const numeric = getPointNumericValue(control, axis, value);
    if (numeric === null) return;
    onChange((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [key]: numeric },
      },
    }));
  }

  function previewPointParam(
    control: AdjustmentEffectPointControl,
    axis: "x" | "y",
    value: number,
  ) {
    if (isAdjustmentControlDisabled(layer, control.disabledWhen)) return;
    const key = axis === "x" ? control.xKey : control.yKey;
    const numeric = getPointNumericValue(control, axis, String(value));
    if (numeric === null) return;
    onPreviewLayer?.((current) => ({
      ...current,
      effect: {
        ...current.effect,
        params: { ...current.effect.params, [key]: numeric },
      },
    }));
  }

  function renderParam(
    control: AdjustmentEffectParamControl,
    compact?: boolean,
  ): ReactNode {
    const disabledReason = getAdjustmentControlDisabledReason(
      layer,
      control.disabledWhen,
    );
    if (control.type === "boolean") {
      return (
        <label
          className={`flex cursor-pointer items-center rounded-[10px] border border-[#2d313b] bg-[#171920] text-[#dfe2ea] font-bold transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c] ${compact ? "gap-1.5 px-2 py-1.5 text-[11px]" : "gap-3 p-3 text-sm"}`}
          key={control.key}
          title={disabledReason}
        >
          <Checkbox
            checked={Boolean(getParamValue(control))}
            disabled={Boolean(disabledReason)}
            onCheckedChange={(checked) =>
              updateBooleanParam(control.key, checked === true)
            }
          />
          <span>{control.label}</span>
        </label>
      );
    }
    const inlineToggle = control.inlineToggle;
    const controlField =
      control.type === "select" ? (
        <Select
          value={String(getParamValue(control))}
          onValueChange={(value) => updateParam(control, value)}
          disabled={Boolean(disabledReason)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {control.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={control.type}
          min={control.min}
          max={control.max}
          step={control.step}
          value={getParamValue(control) as number}
          resetValue={
            (control as AdjustmentEffectNumberParamControl).defaultValue
          }
          numberScrubMode="preview"
          numberScrubCommitThrottleMs={16}
          disabled={Boolean(disabledReason)}
          onChange={(event) => updateParam(control, event.target.value)}
          onNumberScrubEnd={onClearPreview}
          onNumberScrubPreview={(value) => previewParam(control, value)}
        />
      );
    return (
      <label
        className={`grid gap-1.5 ${mutedCaps} ${disabledReason ? "opacity-50" : ""}`}
        key={control.key}
        title={disabledReason}
      >
        {inlineToggle ? (
          <span className="flex items-center justify-between">
            <span>{control.label}</span>
            <span className="flex items-center gap-2 text-[11px] font-medium text-[#9b9da7]">
              {inlineToggle.label}
              <Checkbox
                checked={getInlineToggleValue(
                  inlineToggle.key,
                  inlineToggle.defaultValue,
                )}
                onCheckedChange={(checked) =>
                  updateBooleanParam(inlineToggle.key, checked === true)
                }
              />
            </span>
          </span>
        ) : (
          control.label
        )}
        {control.inlineSectionTrigger ? (
          <span className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            {controlField}
            {renderSectionButton(control.inlineSectionTrigger)}
          </span>
        ) : (
          controlField
        )}
      </label>
    );
  }

  function renderSectionButton(trigger: {
    label: string;
    icon?: "settings";
    iconOnly?: boolean;
    section: AdjustmentEffectSection;
  }) {
    const section = sectionMeta(trigger.section);
    const sectionKey = section.key;
    return (
      <InlineSectionButton
        getItems={() => sectionMap.get(sectionKey)?.items ?? []}
        icon={trigger.icon}
        iconOnly={trigger.iconOnly}
        label={trigger.label}
        open={openControlSectionKey === sectionKey}
        renderItems={renderSectionItems}
        sectionKey={sectionKey}
        setOpen={(open) => setOpenControlSectionKey(open ? sectionKey : null)}
      />
    );
  }

  function renderPoint(control: AdjustmentEffectPointControl): ReactNode {
    const disabledReason = getAdjustmentControlDisabledReason(
      layer,
      control.disabledWhen,
    );
    return (
      <AdjustmentPointControlField
        control={control}
        disabledReason={disabledReason}
        key={`${control.xKey}:${control.yKey}`}
        picking={pickingPointKey === `${control.xKey}:${control.yKey}`}
        xValue={getPointValue(control, "x")}
        yValue={getPointValue(control, "y")}
        onPick={() => onPickPoint?.(control)}
        onScrubEnd={onClearPreview}
        onScrubPreview={(axis, value) =>
          previewPointParam(control, axis, value)
        }
        onValueChange={(axis, value) => updatePointParam(control, axis, value)}
      />
    );
  }

  const sectionMap = new Map<string, SectionBucket>();
  const orderedItems: SectionBucket["items"] = [];
  const renderedSectionButtons = new Set<string>();
  const inlineSectionTriggerKeys = new Set(
    (effect?.paramControls ?? [])
      .map((control) => control.inlineSectionTrigger?.section)
      .filter((section): section is AdjustmentEffectSection => Boolean(section))
      .map((section) => sectionMeta(section).key),
  );

  for (const control of effect?.paramControls ?? []) {
    const node = renderParam(
      control,
      Boolean(control.inlineGroup || control.section),
    );
    collectControlNode(
      control,
      node,
      sectionMap,
      orderedItems,
      inlineSectionTriggerKeys,
      renderedSectionButtons,
      renderSectionPopoverButton,
    );
  }

  for (const control of effect?.pointControls ?? []) {
    const node = renderPoint(control);
    collectControlNode(
      control,
      node,
      sectionMap,
      orderedItems,
      inlineSectionTriggerKeys,
      renderedSectionButtons,
      renderSectionPopoverButton,
    );
  }

  for (const [sectionKey] of sectionMap.entries()) {
    if (
      inlineSectionTriggerKeys.has(sectionKey) ||
      renderedSectionButtons.has(sectionKey)
    )
      continue;
    const section = sectionMap.get(sectionKey);
    orderedItems.push({
      key: sectionKey,
      inlineGroup: section?.inlineGroup,
      node: renderSectionPopoverButton(sectionKey),
    });
  }

  return <>{renderSectionItems(orderedItems)}</>;

  function renderSectionPopoverButton(sectionKey: string) {
    const section = sectionMap.get(sectionKey);
    if (!section) return null;
    return (
      <SectionPopoverButton
        getItems={() => sectionMap.get(sectionKey)?.items ?? []}
        key={sectionKey}
        label={section.label}
        open={openControlSectionKey === sectionKey}
        renderItems={renderSectionItems}
        setOpen={(open) => setOpenControlSectionKey(open ? sectionKey : null)}
      />
    );
  }
}

type SectionBucket = {
  label: string;
  description?: string;
  display?: "dialog";
  inlineGroup?: string;
  items: { key: string; inlineGroup?: string; node: ReactNode }[];
};

function InlineSectionButton({
  icon,
  iconOnly,
  label,
  sectionKey,
  open,
  setOpen,
  getItems,
  renderItems,
}: {
  icon?: "settings";
  iconOnly?: boolean;
  label: string;
  sectionKey: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  getItems: () => SectionBucket["items"];
  renderItems: (items: SectionBucket["items"]) => ReactNode[];
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={label}
          className={`flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[8px] border border-[#2d313b] bg-[#171920] px-2.5 py-1.5 text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c] ${iconOnly ? "w-9 px-0" : ""}`}
          title={label}
          type="button"
        >
          {icon === "settings" ? (
            <SlidersHorizontal aria-hidden="true" size={15} strokeWidth={2.4} />
          ) : null}
          {iconOnly ? null : <span>{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="left">
        {renderItems(getItems())}
      </PopoverContent>
    </Popover>
  );
}

function SectionPopoverButton({
  label,
  open,
  setOpen,
  getItems,
  renderItems,
}: {
  label: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  getItems: () => SectionBucket["items"];
  renderItems: (items: SectionBucket["items"]) => ReactNode[];
}) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="rounded-[8px] border border-[#2d313b] bg-[#171920] px-2.5 py-1.5 text-left text-[11px] font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]"
          type="button"
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="left">
        {renderItems(getItems())}
      </PopoverContent>
    </Popover>
  );
}

type SectionedControl = {
  key?: string;
  xKey?: string;
  yKey?: string;
  inlineGroup?: string;
  section?: AdjustmentEffectParamControl["section"];
};

function collectControlNode(
  control: SectionedControl,
  node: ReactNode,
  sectionMap: Map<string, SectionBucket>,
  orderedItems: SectionBucket["items"],
  inlineSectionTriggerKeys: Set<string>,
  renderedSectionButtons: Set<string>,
  renderSectionPopoverButton: (sectionKey: string) => ReactNode,
) {
  if (!node) return;
  if (!control.section) {
    orderedItems.push({
      key: control.key ?? `${control.xKey}:${control.yKey}`,
      inlineGroup: control.inlineGroup,
      node,
    });
    return;
  }

  const section = sectionMeta(control.section);
  let bucket = sectionMap.get(section.key);
  if (!bucket) {
    bucket = {
      label: section.label,
      description: section.description,
      display: section.display,
      inlineGroup: section.inlineGroup,
      items: [],
    };
    sectionMap.set(section.key, bucket);
  }
  bucket.items.push({
    key: control.key ?? `${control.xKey}:${control.yKey}`,
    inlineGroup: control.inlineGroup,
    node,
  });
  if (
    !inlineSectionTriggerKeys.has(section.key) &&
    !renderedSectionButtons.has(section.key)
  ) {
    orderedItems.push({
      key: section.key,
      inlineGroup: section.inlineGroup,
      node: renderSectionPopoverButton(section.key),
    });
    renderedSectionButtons.add(section.key);
  }
}

function sectionMeta(
  sec: NonNullable<AdjustmentEffectParamControl["section"]>,
) {
  return typeof sec === "string" ? { key: sec, label: sec } : sec;
}

function renderSectionItems(items: SectionBucket["items"]): ReactNode[] {
  const result: ReactNode[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.inlineGroup !== undefined) {
      const group: ReactNode[] = [item.node];
      while (
        i + 1 < items.length &&
        items[i + 1].inlineGroup === item.inlineGroup
      ) {
        i++;
        group.push(items[i].node);
      }
      result.push(
        <div
          key={group
            .map(
              (_, index) =>
                items[i - group.length + 1 + index]?.key ?? String(index),
            )
            .join(":")}
          className="grid grid-cols-2 gap-2"
        >
          {group}
        </div>,
      );
    } else {
      result.push(item.node);
    }
  }
  return result;
}

function getParamNumericValue(
  control: Extract<AdjustmentEffectParamControl, { type: "number" }>,
  value: string,
) {
  const fallback = control.defaultValue;
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) numeric = fallback;
  if (typeof control.min === "number") numeric = Math.max(control.min, numeric);
  if (typeof control.max === "number") numeric = Math.min(control.max, numeric);
  if (control.step && Number.isInteger(control.step))
    numeric = Math.round(numeric);
  return numeric;
}

function getPointNumericValue(
  control: AdjustmentEffectPointControl,
  axis: "x" | "y",
  value: string,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const max =
    control.coordinateSpace === "percent"
      ? 100
      : axis === "x"
        ? FRAME_WIDTH
        : FRAME_HEIGHT;
  return roundTwo(clamp(numeric, 0, max));
}

function AdjustmentPointControlField({
  control,
  disabledReason,
  picking,
  xValue,
  yValue,
  onPick,
  onScrubEnd,
  onScrubPreview,
  onValueChange,
}: {
  control: AdjustmentEffectPointControl;
  disabledReason?: string;
  picking: boolean;
  xValue: number;
  yValue: number;
  onPick: () => void;
  onScrubEnd?: () => void;
  onScrubPreview?: (axis: "x" | "y", value: number) => void;
  onValueChange: (axis: "x" | "y", value: string) => void;
}) {
  const percentSpace = control.coordinateSpace === "percent";
  const disabled = Boolean(disabledReason);

  return (
    <Coordinate2DField
      disabledReason={disabledReason}
      label={control.label}
      pickLabel={
        disabledReason ??
        control.pickLabel ??
        `Pick ${control.label.toLowerCase()} from frame`
      }
      picking={picking}
      x={{
        ariaLabel: control.xLabel ?? `${control.label} X`,
        disabled,
        label: control.xLabel ?? "X",
        max: percentSpace ? 100 : FRAME_WIDTH,
        min: 0,
        numberScrubMode: "preview",
        onChange: (value) => onValueChange("x", value),
        onNumberScrubEnd: onScrubEnd,
        onNumberScrubPreview: (value) => onScrubPreview?.("x", value),
        resetValue: control.xDefault,
        step: percentSpace ? 0.5 : 1,
        value: xValue,
      }}
      y={{
        ariaLabel: control.yLabel ?? `${control.label} Y`,
        disabled,
        label: control.yLabel ?? "Y",
        max: percentSpace ? 100 : FRAME_HEIGHT,
        min: 0,
        numberScrubMode: "preview",
        onChange: (value) => onValueChange("y", value),
        onNumberScrubEnd: onScrubEnd,
        onNumberScrubPreview: (value) => onScrubPreview?.("y", value),
        resetValue: control.yDefault,
        step: percentSpace ? 0.5 : 1,
        value: yValue,
      }}
      onPick={onPick}
    />
  );
}

function conditionPredicate(
  layer: AdjustmentLayer,
  condition: AdjustmentEffectDisableCondition,
): boolean {
  if (condition.and) {
    return condition.and.every((sub) => conditionPredicate(layer, sub));
  }
  if (condition.or) {
    return condition.or.some((sub) => conditionPredicate(layer, sub));
  }
  if (!condition.key) return true;
  const value = layer.effect.params?.[condition.key];
  if ("equals" in condition) return value === condition.equals;
  return condition.truthy ? Boolean(value) : !value;
}

function getAdjustmentControlDisabledReason(
  layer: AdjustmentLayer,
  condition: AdjustmentEffectDisableCondition | undefined,
): string | undefined {
  if (!condition) return undefined;
  const disabled = conditionPredicate(layer, condition);
  return disabled
    ? (condition.reason ?? "Disabled by current settings.")
    : undefined;
}

function isAdjustmentControlDisabled(
  layer: AdjustmentLayer,
  condition: AdjustmentEffectDisableCondition | undefined,
) {
  return Boolean(getAdjustmentControlDisabledReason(layer, condition));
}
