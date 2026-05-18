import React from "react";
import {
  type FillValue,
  type GradientType,
  type RadialShape,
} from "../../core/fillValue";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  FillInlineKeyframeDiamond,
  findFillKeyframeState,
} from "./FillInlineKeyframeDiamond";
import type { FillKeyframeConfig } from "./types";

const fieldClass =
  "h-7 border-0 bg-transparent px-2 text-left text-xs font-bold text-[#dfe2ea] focus:ring-0";
const unitFieldClass =
  "h-7 border-0 bg-transparent pl-7 pr-2 text-left text-xs font-bold text-[#dfe2ea] focus:ring-0";
const labelClass = "text-[10px] font-bold text-[#6f7684]";

export function FillGeometryControls({
  value,
  keyframeStates,
  onToggleKeyframe,
  onChange,
}: {
  value: FillValue;
  keyframeStates?: FillKeyframeConfig[];
  onToggleKeyframe?: (path: string) => void;
  onChange: (value: FillValue) => void;
}) {
  const renderInputField = (
    label: string,
    path: string | null,
    input: React.ReactNode,
  ) => (
    <label className={labelClass}>
      {label}
      <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
        {input}
        <FillInlineKeyframeDiamond
          state={path ? findFillKeyframeState(keyframeStates, path) : undefined}
          onToggleKeyframe={onToggleKeyframe}
        />
      </div>
    </label>
  );

  if (value.gradientType === "linear") {
    return (
      <div className="grid grid-cols-1 gap-1.5">
        {renderInputField(
          "Angle",
          "style.fill.linearAngle",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={360}
            step={1}
            unitPrefix="°"
            numberScrubMode="continuous"
            value={value.linearAngle}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, linearAngle: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  if (value.gradientType === "radial") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        <label className={labelClass}>
          Shape
          <Select
            value={value.radialShape}
            onValueChange={(next) =>
              onChange({ ...value, radialShape: next as RadialShape })
            }
          >
            <SelectTrigger className="h-7 w-full rounded-[8px] border-[#2d313b] bg-[#171920] px-2 text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[7100] bg-[#11141a]">
              <SelectGroup>
                <SelectItem value="circle">Circle</SelectItem>
                <SelectItem value="ellipse">Ellipse</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>
        {renderInputField(
          "Radius X",
          "style.fill.radialRadiusX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={200}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.radialRadiusX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, radialRadiusX: Math.round(next) });
            }}
          />,
        )}
        {value.radialShape === "ellipse"
          ? renderInputField(
              "Radius Y",
              "style.fill.radialRadiusY",
              <Input
                className={unitFieldClass}
                type="number"
                min={0}
                max={200}
                step={1}
                unitPrefix="%"
                numberScrubMode="continuous"
                value={value.radialRadiusY}
                onChange={(e) => {
                  const next = Number(e.currentTarget.value);
                  if (!Number.isFinite(next)) return;
                  onChange({ ...value, radialRadiusY: Math.round(next) });
                }}
              />,
            )
          : null}
        {renderInputField(
          "Center X",
          "style.fill.radialCenterX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.radialCenterX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, radialCenterX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center Y",
          "style.fill.radialCenterY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.radialCenterY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, radialCenterY: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  if (value.gradientType === "conic") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {renderInputField(
          "From Angle",
          "style.fill.conicFromAngle",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={360}
            step={1}
            unitPrefix="°"
            numberScrubMode="continuous"
            value={value.conicFromAngle}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, conicFromAngle: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center X",
          "style.fill.conicCenterX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.conicCenterX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, conicCenterX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center Y",
          "style.fill.conicCenterY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.conicCenterY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, conicCenterY: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  if (value.gradientType === "diamond") {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {renderInputField(
          "Rotation",
          "style.fill.diamondRotation",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={360}
            step={1}
            unitPrefix="°"
            numberScrubMode="continuous"
            value={value.diamondRotation}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondRotation: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Radius X",
          "style.fill.diamondRadiusX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={200}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondRadiusX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondRadiusX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Radius Y",
          "style.fill.diamondRadiusY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={200}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondRadiusY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondRadiusY: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center X",
          "style.fill.diamondCenterX",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondCenterX}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondCenterX: Math.round(next) });
            }}
          />,
        )}
        {renderInputField(
          "Center Y",
          "style.fill.diamondCenterY",
          <Input
            className={unitFieldClass}
            type="number"
            min={0}
            max={100}
            step={1}
            unitPrefix="%"
            numberScrubMode="continuous"
            value={value.diamondCenterY}
            onChange={(e) => {
              const next = Number(e.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onChange({ ...value, diamondCenterY: Math.round(next) });
            }}
          />,
        )}
      </div>
    );
  }

  return null;
}

export { fieldClass, unitFieldClass, labelClass };
