import { Minus, Plus } from "lucide-react";
import {
  type FillStop,
  type FillValue,
  type GradientType,
  MAX_STOPS,
  createDefaultFillValue,
  fillValueToCss,
  generateStopId,
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
import { clampPercent, normalizeHexColor } from "./colorMath";
import { FillGeometryControls } from "./FillGeometryControls";
import {
  FillInlineKeyframeDiamond,
  findFillKeyframeState,
} from "./FillInlineKeyframeDiamond";
import { GradientRail } from "./GradientRail";
import { StopColorPicker } from "./StopColorPicker";
import type { FillKeyframeConfig } from "./types";

export function FillGradientPickerPanel({
  value,
  keyframeStates,
  onToggleKeyframe,
  onChange,
  onPreview,
}: {
  value: FillValue;
  keyframeStates?: FillKeyframeConfig[];
  onToggleKeyframe?: (path: string) => void;
  onChange: (value: FillValue) => void;
  onPreview?: (value: FillValue) => void;
}) {
  const stops =
    value.stops.length >= 2 ? value.stops : createDefaultFillValue().stops;

  function commitStop(index: number, patch: Partial<FillStop>) {
    const nextStops = stops.map((stop, i) =>
      i === index ? { ...stop, ...patch } : stop,
    );
    onChange({ ...value, stops: nextStops });
  }

  function previewStop(index: number, patch: Partial<FillStop>) {
    const nextStops = stops.map((stop, i) =>
      i === index ? { ...stop, ...patch } : stop,
    );
    onPreview?.({ ...value, stops: nextStops });
  }

  function addStop() {
    if (stops.length >= MAX_STOPS) return;
    const newStop: FillStop = {
      id: generateStopId(),
      color: "#FFFFFF",
      position: 50,
      opacity: 100,
    };
    onChange({
      ...value,
      stops: [...stops, newStop].sort((a, b) => a.position - b.position),
    });
  }

  function removeStop(index: number) {
    if (stops.length <= 2) return;
    onChange({
      ...value,
      stops: stops.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="grid gap-2 text-[#dfe2ea]">
      <div className="flex items-center justify-between gap-2">
        <Select
          value={value.gradientType}
          onValueChange={(next) =>
            onChange({ ...value, gradientType: next as GradientType })
          }
        >
          <SelectTrigger className="h-7 w-[110px] rounded-[8px] border-[#2d313b] bg-[#171920] px-2 text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[7100] bg-[#11141a]">
            <SelectGroup>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="radial">Radial</SelectItem>
              <SelectItem value="conic">Angular</SelectItem>
              <SelectItem value="diamond">Diamond</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#9aa1ad]">
          <input
            type="checkbox"
            className="accent-[var(--clipper-accent)]"
            checked={value.repeating}
            onChange={(e) =>
              onChange({ ...value, repeating: e.target.checked })
            }
          />
          Repeat
        </label>
      </div>

      <FillGeometryControls
        value={value}
        keyframeStates={keyframeStates}
        onToggleKeyframe={onToggleKeyframe}
        onChange={onChange}
      />

      <GradientRail
        stops={stops}
        formatPreview={(nextStops) =>
          fillValueToLinearPreviewCss({ ...value, stops: nextStops })
        }
        railClassName="h-7 overflow-hidden rounded-md bg-[#0b0d12] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
        railStyle={{ backgroundColor: "#0b0d12" }}
        getStopKey={(stop) => stop.id}
        onPreviewPosition={(index, position) =>
          previewStop(index, { position })
        }
        onCommitPosition={(index, position) => commitStop(index, { position })}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#aeb6c4]">Stops</span>
        <button
          className="grid size-7 place-items-center rounded text-[#dfe2ea] hover:bg-[#171920] disabled:opacity-40"
          type="button"
          onClick={addStop}
          disabled={stops.length >= MAX_STOPS}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="grid gap-1.5">
        {stops.map((stop, index) => (
          <div
            key={stop.id}
            className="grid grid-cols-[56px_minmax(0,1fr)_72px_24px] items-center gap-1.5 rounded bg-[#0c121b] px-1.5 py-1"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
              <Input
                className="h-7 border-0 bg-transparent px-2 text-left text-xs font-bold text-[#dfe2ea]"
                type="number"
                min={0}
                max={100}
                step={1}
                value={stop.position}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (!Number.isFinite(next)) return;
                  commitStop(index, {
                    position: clampPercent(String(Math.round(next))),
                  });
                }}
              />
              <FillInlineKeyframeDiamond
                state={findFillKeyframeState(
                  keyframeStates,
                  `style.fill.stops[${stop.id}].position`,
                )}
                onToggleKeyframe={onToggleKeyframe}
              />
            </div>
            <div className="grid grid-cols-[20px_minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
              <StopColorPicker
                value={stop.color}
                onPreview={(color) => previewStop(index, { color })}
                onChange={(color) => commitStop(index, { color })}
              />
              <Input
                className="h-7 border-0 bg-transparent px-1 text-xs font-bold text-[#dfe2ea]"
                value={normalizeHexColor(stop.color).slice(1)}
                onChange={(event) =>
                  commitStop(index, {
                    color: normalizeHexColor(`#${event.target.value}`),
                  })
                }
              />
              <FillInlineKeyframeDiamond
                state={findFillKeyframeState(
                  keyframeStates,
                  `style.fill.stops[${stop.id}].color`,
                )}
                onToggleKeyframe={onToggleKeyframe}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_18px] items-center rounded bg-[#171920]">
              <Input
                className="h-7 border-0 bg-transparent pl-6 pr-2 text-left text-xs font-bold text-[#dfe2ea]"
                type="number"
                min={0}
                max={100}
                step={1}
                unitPrefix="%"
                value={stop.opacity}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  if (!Number.isFinite(next)) return;
                  commitStop(index, {
                    opacity: clampPercent(String(Math.round(next))),
                  });
                }}
              />
              <FillInlineKeyframeDiamond
                state={findFillKeyframeState(
                  keyframeStates,
                  `style.fill.stops[${stop.id}].opacity`,
                )}
                onToggleKeyframe={onToggleKeyframe}
              />
            </div>
            <button
              className="grid size-6 place-items-center rounded text-[#dfe2ea] hover:bg-[#171920]"
              type="button"
              onClick={() => removeStop(index)}
            >
              <Minus size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function fillValueToLinearPreviewCss(fill: FillValue) {
  if (fill.mode === "solid") return fillValueToCss(fill);
  const linearFill: FillValue = {
    ...fill,
    gradientType: "linear",
    linearAngle: 90,
  };
  return fillValueToCss(linearFill);
}
