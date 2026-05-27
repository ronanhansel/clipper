import type { FrameObject, LightObjectKind } from "../../../core/types";
import { DEFAULT_LIGHT_OBJECT_PROPS } from "../../../core/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Switch } from "../../ui/switch";
import { useObjectInspector } from "../objectInspectorContext";
import { KeyframableNumberInput } from "../KeyframableNumberInput";
import { KeyframedColorInput } from "../KeyframedColorInput";
import {
  getPropertyTrackKeyframeAtTime,
  hasPropertyTrack,
} from "../inspectorShared";
import {
  removePropertyKeyframe,
  upsertPropertyKeyframe,
  evaluateObjectState,
  setPropertyBaseValue,
} from "../../../core/propertyRegistry";

const LIGHT_KIND_OPTIONS: Array<{ value: LightObjectKind; label: string }> = [
  { value: "directional", label: "Directional" },
  { value: "spot", label: "Spot" },
  { value: "point", label: "Point" },
  { value: "ambient", label: "Ambient" },
];

export function LightObjectSection() {
  const { object, onChange, onPreview, readEffectiveTime } =
    useObjectInspector();

  const evaluated = evaluateObjectState(object, readEffectiveTime());
  const liveProps = {
    ...DEFAULT_LIGHT_OBJECT_PROPS,
    ...(evaluated.props ?? {}),
  };
  const kind = readLightKind(liveProps.kind);

  function isKeyframedNow(path: string) {
    const time = readEffectiveTime();
    return Boolean(getPropertyTrackKeyframeAtTime(object, path, time));
  }

  function toggleKeyframe(path: string, defaultValue: any) {
    const time = readEffectiveTime();
    const existing = getPropertyTrackKeyframeAtTime(object, path, time);
    if (existing) {
      onChange((current) =>
        removePropertyKeyframe(current, path, existing.time, time),
      );
    } else {
      const key = path.slice("props.".length) as keyof typeof liveProps;
      const val = liveProps[key] !== undefined ? liveProps[key] : defaultValue;
      onChange((current) => upsertPropertyKeyframe(current, path, time, val));
    }
  }

  function clampForPath(path: string, value: number): number {
    if (path === "props.angle") return clamp(value, 1, 175);
    if (path === "props.softness") return clamp(value, 0.001, 1);
    if (path === "props.intensity") return Math.max(0, value);
    if (path === "props.range") return Math.max(1, value);
    return value;
  }

  function commitNumber(path: string, value: number) {
    const clamped = clampForPath(path, value);
    if (hasPropertyTrack(object, path)) {
      const time = readEffectiveTime();
      onChange((current) =>
        upsertPropertyKeyframe(current, path, time, clamped),
      );
    } else {
      onChange((current) => setPropertyBaseValue(current, path, clamped));
    }
  }

  function previewNumber(path: string, value: number) {
    const clamped = clampForPath(path, value);
    if (onPreview) {
      onPreview((current) =>
        setPropertyBaseValue(
          evaluateObjectState(current, readEffectiveTime()) as FrameObject,
          path,
          clamped,
        ),
      );
    }
  }

  function commitColor(value: string) {
    const path = "props.color";
    if (hasPropertyTrack(object, path)) {
      const time = readEffectiveTime();
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
    } else {
      onChange((current) => setPropertyBaseValue(current, path, value));
    }
  }

  function previewColor(value: string) {
    const path = "props.color";
    if (onPreview) {
      onPreview((current) =>
        setPropertyBaseValue(
          evaluateObjectState(current, readEffectiveTime()) as FrameObject,
          path,
          value,
        ),
      );
    }
  }

  function commitBoolean(path: string, value: boolean) {
    if (hasPropertyTrack(object, path)) {
      const time = readEffectiveTime();
      onChange((current) => upsertPropertyKeyframe(current, path, time, value));
    } else {
      onChange((current) => setPropertyBaseValue(current, path, value));
    }
  }

  return (
    <section className="grid gap-3">
      <div className="grid gap-1.5">
        <label className="text-[11px] font-medium text-[#9aa3b6]">Type</label>
        <Select
          value={kind}
          onValueChange={(value) =>
            onChange((current: FrameObject) => {
              const nextProps = {
                ...(current.props ?? {}),
                kind: readLightKind(value),
                castShadow:
                  value === "directional" ||
                  value === "spot" ||
                  value === "point",
              };
              return { ...current, props: nextProps };
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
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-[#9aa3b6]">
            Intensity
          </span>
          <KeyframableNumberInput
            ariaLabel="Intensity"
            unitPrefix=""
            step={0.05}
            min={0}
            value={readNumber(liveProps.intensity, 1)}
            active={isKeyframedNow("props.intensity")}
            onCommit={(val) => commitNumber("props.intensity", val)}
            onPreview={(val) => previewNumber("props.intensity", val)}
            onToggleKeyframe={() => toggleKeyframe("props.intensity", 1)}
          />
        </label>
        {kind === "point" || kind === "spot" ? (
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-[#9aa3b6]">
              Range
            </span>
            <KeyframableNumberInput
              ariaLabel="Range"
              unitPrefix=""
              step={10}
              min={1}
              value={readNumber(liveProps.range, 1200)}
              active={isKeyframedNow("props.range")}
              onCommit={(val) => commitNumber("props.range", val)}
              onPreview={(val) => previewNumber("props.range", val)}
              onToggleKeyframe={() => toggleKeyframe("props.range", 1200)}
            />
          </label>
        ) : null}
        {kind === "spot" ? (
          <>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-medium text-[#9aa3b6]">
                Angle
              </span>
              <KeyframableNumberInput
                ariaLabel="Angle"
                unitPrefix=""
                step={1}
                min={1}
                max={175}
                value={readNumber(liveProps.angle, 45)}
                active={isKeyframedNow("props.angle")}
                onCommit={(val) => commitNumber("props.angle", val)}
                onPreview={(val) => previewNumber("props.angle", val)}
                onToggleKeyframe={() => toggleKeyframe("props.angle", 45)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-medium text-[#9aa3b6]">
                Softness
              </span>
              <KeyframableNumberInput
                ariaLabel="Softness"
                unitPrefix=""
                step={0.01}
                min={0.001}
                max={1}
                value={readNumber(liveProps.softness, 0.25)}
                active={isKeyframedNow("props.softness")}
                onCommit={(val) => commitNumber("props.softness", val)}
                onPreview={(val) => previewNumber("props.softness", val)}
                onToggleKeyframe={() => toggleKeyframe("props.softness", 0.25)}
              />
            </label>
          </>
        ) : null}
      </div>

      {kind === "directional" || kind === "spot" || kind === "point" ? (
        <KeyframableBooleanSwitch
          label="Cast Shadows"
          path="props.castShadow"
          value={Boolean(liveProps.castShadow)}
          active={isKeyframedNow("props.castShadow")}
          onToggleKeyframe={() => toggleKeyframe("props.castShadow", true)}
          onCheckedChange={(checked) =>
            commitBoolean("props.castShadow", checked)
          }
        />
      ) : null}

      {kind === "point" || kind === "spot" ? (
        <KeyframableBooleanSwitch
          label="Show Range"
          path="props.showRange"
          value={liveProps.showRange !== false}
          active={isKeyframedNow("props.showRange")}
          onToggleKeyframe={() => toggleKeyframe("props.showRange", true)}
          onCheckedChange={(checked) =>
            commitBoolean("props.showRange", checked)
          }
        />
      ) : null}

      <KeyframableBooleanSwitch
        label="Debug"
        path="props.debug"
        value={liveProps.debug !== false}
        active={isKeyframedNow("props.debug")}
        onToggleKeyframe={() => toggleKeyframe("props.debug", true)}
        onCheckedChange={(checked) => commitBoolean("props.debug", checked)}
      />

      {kind !== "ambient" ? (
        <div className="grid gap-1.5">
          <KeyframedColorInput
            label="Color"
            value={
              typeof liveProps.color === "string" ? liveProps.color : "#fff4d6"
            }
            hasKeyframe={isKeyframedNow("props.color")}
            onToggleKeyframe={() => toggleKeyframe("props.color", "#fff4d6")}
            onChange={commitColor}
            onPreview={previewColor}
          />
        </div>
      ) : null}
    </section>
  );
}

interface KeyframableBooleanSwitchProps {
  label: string;
  path: string;
  value: boolean;
  active: boolean;
  onToggleKeyframe: () => void;
  onCheckedChange: (checked: boolean) => void;
}

function KeyframableBooleanSwitch({
  label,
  value,
  active,
  onToggleKeyframe,
  onCheckedChange,
}: KeyframableBooleanSwitchProps) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs font-semibold text-[#dfe2ea]">
      <span className="text-[11px] font-medium text-[#9aa3b6]">{label}</span>
      <span className="flex items-center gap-3">
        <button
          aria-label={
            active
              ? `Remove ${label} keyframe at playhead`
              : `Add ${label} keyframe at playhead`
          }
          aria-pressed={active}
          className={`h-2 w-2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
            active
              ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
              : "border-[#6f7684] bg-[#12151d] hover:border-white"
          }`}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            onToggleKeyframe();
          }}
        />
        <Switch
          aria-label={`Toggle ${label}`}
          checked={value}
          onCheckedChange={onCheckedChange}
        />
      </span>
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
