import { Minus, Plus } from "lucide-react";
import { useRef } from "react";
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
import { GradientRail } from "./GradientRail";
import {
  type GradientValue,
  defaultGradientStops,
  formatGradientValue,
} from "./gradientLegacy";
import { StopColorPicker } from "./StopColorPicker";

export function GradientPickerPanel({
  value,
  onChange,
  onPreview,
}: {
  value: GradientValue;
  onChange: (value: GradientValue) => void;
  onPreview?: (value: GradientValue) => void;
}) {
  const sourceStops = value.stops.length ? value.stops : defaultGradientStops();
  const stopsRef = useRef(sourceStops);
  stopsRef.current = sourceStops;

  function commitStop(
    index: number,
    patch: Partial<(typeof sourceStops)[number]>,
  ) {
    const nextStops = stopsRef.current.map((stop, stopIndex) =>
      stopIndex === index ? { ...stop, ...patch } : stop,
    );
    onChange({ ...value, stops: nextStops });
  }

  function previewStopColor(index: number, color: string) {
    const next = stopsRef.current.map((stop, stopIndex) =>
      stopIndex === index ? { ...stop, color } : stop,
    );
    onPreview?.({ ...value, stops: next });
  }

  function previewStopPosition(index: number, position: number) {
    const next = stopsRef.current.map((stop, stopIndex) =>
      stopIndex === index ? { ...stop, position } : stop,
    );
    onPreview?.({ ...value, stops: next });
  }

  function addStop() {
    onChange({
      ...value,
      stops: [
        ...sourceStops,
        { color: "#FFFFFF", position: 50, opacity: 100 },
      ].sort((a, b) => a.position - b.position),
    });
  }

  function removeStop(index: number) {
    if (sourceStops.length <= 2) return;
    onChange({
      ...value,
      stops: sourceStops.filter((_, stopIndex) => stopIndex !== index),
    });
  }

  return (
    <div className="grid gap-2 text-[#dfe2ea]">
      <div className="flex items-center justify-between gap-3">
        <Select
          value={value.type}
          onValueChange={(nextType) =>
            onChange({ ...value, type: nextType as GradientValue["type"] })
          }
        >
          <SelectTrigger className="h-7 w-[132px] rounded-[8px] border-[#2d313b] bg-[#171920] px-2 text-xs font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[7100] bg-[#11141a]">
            <SelectGroup>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="radial">Radial</SelectItem>
              <SelectItem value="conic">Angular</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <GradientRail
        stops={sourceStops}
        formatPreview={(nextStops) =>
          formatGradientValue({
            ...value,
            stops: nextStops.map((stop, index) => ({
              ...stop,
              opacity: sourceStops[index]?.opacity ?? 100,
            })),
          })
        }
        railClassName="h-7 rounded-md border border-white/10"
        getStopKey={(stop, index) => `${stop.color}-${index}`}
        onPreviewPosition={previewStopPosition}
        onCommitPosition={(index, position) => commitStop(index, { position })}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-[#aeb6c4]">Stops</span>
        <button
          className="grid size-7 place-items-center rounded text-[#dfe2ea] hover:bg-[#171920]"
          type="button"
          onClick={addStop}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="grid gap-1.5">
        {sourceStops.map((stop, index) => (
          <div
            key={`${stop.position}-${index}`}
            className="grid grid-cols-[54px_minmax(0,1fr)_52px_24px] items-center gap-1.5 rounded bg-[#0c121b] px-1.5 py-1"
          >
            <Input
              className="h-7 border-0 bg-[#171920] px-1.5 text-center text-xs font-bold text-[#dfe2ea]"
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
            <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center rounded bg-[#171920]">
              <StopColorPicker
                value={stop.color}
                onPreview={(color) => previewStopColor(index, color)}
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
            </div>
            <Input
              className="h-7 border-0 bg-[#171920] px-1.5 text-center text-xs font-bold text-[#dfe2ea]"
              type="number"
              min={0}
              max={100}
              step={1}
              value={stop.opacity}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (!Number.isFinite(next)) return;
                commitStop(index, {
                  opacity: clampPercent(String(Math.round(next))),
                });
              }}
            />
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
