import type { ComponentProps } from "react";
import type { FrameObject, LightObjectKind } from "../../../core/types";
import { DEFAULT_LIGHT_OBJECT_PROPS } from "../../../core/types";
import { ColorSelector } from "../../ColorSelector";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Switch } from "../../ui/switch";
import { useObjectInspector } from "../objectInspectorContext";

const LIGHT_KIND_OPTIONS: Array<{ value: LightObjectKind; label: string }> = [
  { value: "directional", label: "Directional" },
  { value: "spot", label: "Spot" },
  { value: "point", label: "Point" },
  { value: "ambient", label: "Ambient" },
];

export function LightObjectSection() {
  const { object, onChange, onPreview } = useObjectInspector();
  const props = {
    ...DEFAULT_LIGHT_OBJECT_PROPS,
    ...(object.props ?? {}),
  };
  const kind = readLightKind(props.kind);

  function updateProps(
    updater: (props: Record<string, unknown>) => void,
    preview = false,
  ) {
    const apply = preview && onPreview ? onPreview : onChange;
    apply((current: FrameObject) => {
      const nextProps = { ...(current.props ?? {}) };
      updater(nextProps);
      return { ...current, props: nextProps };
    });
  }

  function setNumber(key: "intensity" | "range" | "angle" | "softness") {
    return (value: string | number, preview = false) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      updateProps((next) => {
        next[key] =
          key === "angle"
            ? clamp(numeric, 1, 175)
            : key === "softness"
              ? clamp(numeric, 0.001, 1)
              : Math.max(0, numeric);
      }, preview);
    };
  }

  return (
    <section className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="text-[11px] font-medium text-[#9aa3b6]">Type</label>
        <Select
          value={kind}
          onValueChange={(value) =>
            updateProps((next) => {
              next.kind = readLightKind(value);
              next.castShadow =
                value === "directional" ||
                value === "spot" ||
                value === "point";
            })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIGHT_KIND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LightInput
          label="Intensity"
          type="number"
          value={readNumber(props.intensity, 1)}
          min={0}
          step={0.05}
          onCommit={setNumber("intensity")}
          onPreview={setNumber("intensity")}
        />
        {kind === "point" || kind === "spot" ? (
          <LightInput
            label="Range"
            type="number"
            value={readNumber(props.range, 1200)}
            min={1}
            step={10}
            onCommit={setNumber("range")}
            onPreview={setNumber("range")}
          />
        ) : null}
        {kind === "spot" ? (
          <>
            <LightInput
              label="Angle"
              type="number"
              value={readNumber(props.angle, 45)}
              min={1}
              max={175}
              step={1}
              onCommit={setNumber("angle")}
              onPreview={setNumber("angle")}
            />
            <LightInput
              label="Softness"
              type="number"
              value={readNumber(props.softness, 0.25)}
              min={0.001}
              max={1}
              step={0.01}
              onCommit={setNumber("softness")}
              onPreview={setNumber("softness")}
            />
          </>
        ) : null}
      </div>

      {kind === "directional" || kind === "spot" || kind === "point" ? (
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <label className="text-[11px] font-medium text-[#9aa3b6]">
            Cast Shadows
          </label>
          <Switch
            checked={Boolean(props.castShadow)}
            onCheckedChange={(checked) =>
              updateProps((next) => {
                next.castShadow = checked;
              })
            }
          />
        </div>
      ) : null}

      {kind === "point" || kind === "spot" ? (
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <label className="text-[11px] font-medium text-[#9aa3b6]">
            Show Range
          </label>
          <Switch
            checked={props.showRange !== false}
            onCheckedChange={(checked) =>
              updateProps((next) => {
                next.showRange = checked;
              })
            }
          />
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <label className="text-[11px] font-medium text-[#9aa3b6]">Debug</label>
        <Switch
          checked={props.debug !== false}
          onCheckedChange={(checked) =>
            updateProps((next) => {
              next.debug = checked;
            })
          }
        />
      </div>

      {kind !== "ambient" ? (
        <div className="grid gap-1.5">
          <label className="text-[11px] font-medium text-[#9aa3b6]">
            Color
          </label>
          <ColorSelector
            value={typeof props.color === "string" ? props.color : "#fff4d6"}
            onChange={(value) =>
              updateProps((next) => {
                next.color = value;
              })
            }
            onPreview={(value) =>
              updateProps((next) => {
                next.color = value;
              }, true)
            }
            variant="default"
            pickerMode="solid"
          />
        </div>
      ) : null}
    </section>
  );
}

function LightInput({
  label,
  value,
  onCommit,
  onPreview,
  ...props
}: {
  label: string;
  value: number;
  onCommit: (value: string | number, preview?: boolean) => void;
  onPreview: (value: string | number, preview?: boolean) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-medium text-[#9aa3b6]">{label}</span>
      <Input
        {...props}
        value={value}
        numberScrubMode="preview"
        onChange={(event) => onCommit(event.target.value)}
        onNumberScrubCommit={(next) => onCommit(next)}
        onNumberScrubPreview={(next) => onPreview(next, true)}
      />
    </label>
  );
}

function readLightKind(value: unknown): LightObjectKind {
  if (
    value === "ambient" ||
    value === "directional" ||
    value === "point" ||
    value === "spot"
  ) {
    return value;
  }
  return "directional";
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
