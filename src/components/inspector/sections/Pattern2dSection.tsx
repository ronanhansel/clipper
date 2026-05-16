import { mutedCaps } from "../../../app/config";
import {
  PATTERN_2D_PRESETS,
  type Pattern2DPreset,
  type Pattern2DPresetId,
  getPattern2dDefaults,
  getPattern2dPreset,
} from "../../../core/graphics/pattern2d";
import type { FrameObject, JsonValue } from "../../../core/types";
import { livePreviewScrubCommitThrottleMs } from "../../../app/services/scrubInteractionService";
import { ColorSelector } from "../../ColorSelector";
import { Checkbox } from "../../ui/checkbox";
import { useObjectInspector } from "../objectInspectorContext";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

export function Pattern2dSection() {
  const { object, onChange } = useObjectInspector();
  const props = object.props ?? {};
  const presetId = (
    typeof props.preset === "string" && props.preset in PATTERN_2D_PRESETS
      ? props.preset
      : "polkaDots"
  ) as Pattern2DPresetId;
  const preset = getPattern2dPreset(presetId);
  const seed = typeof props.seed === "number" ? props.seed : 1;

  function setProps(
    updater: (current: Record<string, JsonValue>) => Record<string, JsonValue>,
  ) {
    onChange((current) => ({
      ...current,
      props: updater(current.props ?? {}),
    }));
  }

  function selectPreset(nextId: Pattern2DPresetId) {
    setProps(() => ({
      preset: nextId,
      seed,
      ...getPattern2dDefaults(nextId),
    }));
  }

  function setParam(key: string, value: JsonValue) {
    setProps((current) => ({ ...current, [key]: value }));
  }

  function randomize() {
    setProps((current) => ({
      ...current,
      seed: Math.floor(Math.random() * 1_000_000) + 1,
    }));
  }

  return (
    <div className="grid gap-2">
      <span className={mutedCaps}>Pattern</span>
      <label className={`grid gap-1.5 ${mutedCaps}`}>
        Preset
        <Select
          value={presetId}
          onValueChange={(value) => selectPreset(value as Pattern2DPresetId)}
        >
          <SelectTrigger className="h-[42px] rounded-[10px] px-3 text-xs font-bold text-[#dfe2ea]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(Object.values(PATTERN_2D_PRESETS) as Pattern2DPreset[]).map(
                (item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ),
              )}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <div className="grid gap-2">
        {preset.params.map((param) => {
          const raw = props[param.key];
          if (param.kind === "number") {
            const value =
              typeof raw === "number" && Number.isFinite(raw)
                ? raw
                : param.default;
            return (
              <label key={param.key} className={`grid gap-1.5 ${mutedCaps}`}>
                {param.label}
                <Input
                  className="h-[42px] rounded-[10px] px-3 text-xs font-bold"
                  type="number"
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 1}
                  numberScrubMode="preview"
                  numberScrubCommitThrottleMs={livePreviewScrubCommitThrottleMs}
                  value={value}
                  onNumberScrubPreview={(next) => setParam(param.key, next)}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) setParam(param.key, next);
                  }}
                />
              </label>
            );
          }
          if (param.kind === "color") {
            const value = typeof raw === "string" ? raw : param.default;
            return (
              <div key={param.key} className="grid gap-1.5">
                <span className={mutedCaps}>{param.label}</span>
                <ColorSelector
                  value={value}
                  allowAlpha
                  onChange={(next) => setParam(param.key, next)}
                />
              </div>
            );
          }
          if (param.kind === "select") {
            const value = typeof raw === "string" ? raw : param.default;
            return (
              <label key={param.key} className={`grid gap-1.5 ${mutedCaps}`}>
                {param.label}
                <Select
                  value={value}
                  onValueChange={(next) => setParam(param.key, next)}
                >
                  <SelectTrigger className="h-[42px] rounded-[10px] px-3 text-xs font-bold text-[#dfe2ea]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {param.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>
            );
          }
          const value = typeof raw === "boolean" ? raw : param.default;
          return (
            <label
              key={param.key}
              className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]"
            >
              <Checkbox
                checked={value}
                onCheckedChange={(checked) =>
                  setParam(param.key, checked === true)
                }
              />
              <span>{param.label}</span>
            </label>
          );
        })}
      </div>
      {preset.randomized ? (
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-[13px] py-[9px] text-sm font-medium text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c]"
          onClick={randomize}
        >
          Randomize
        </button>
      ) : null}
    </div>
  );
}
