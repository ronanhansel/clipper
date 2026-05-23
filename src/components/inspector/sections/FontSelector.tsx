import { useEffect, useMemo, useState } from "react";
import { mutedCaps } from "../../../app/config";
import { clipperHost } from "../../../app/clipperHost";
import { graphicDefaultFontFamily } from "../../../core/graphics/inspectorSettings";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

export type FontOption = { value: string; label: string; source?: string };

export const defaultFontFamily = graphicDefaultFontFamily;
export const defaultFontOption: FontOption = {
  value: defaultFontFamily,
  label: "System",
};

let cachedSystemFontOptions: FontOption[] | null = null;
let systemFontOptionsRequest: Promise<FontOption[]> | null = null;

export function preloadSystemFontOptions() {
  void loadSystemFontOptions();
}

export function loadSystemFontOptions() {
  if (cachedSystemFontOptions) return Promise.resolve(cachedSystemFontOptions);
  systemFontOptionsRequest ??= clipperHost
    .listSystemFonts()
    .then((fonts) =>
      fonts.map((font) => ({
        value: font.family,
        label: font.family,
        source: font.source,
      })),
    )
    .catch((error) => {
      console.warn("Unable to load system fonts.", error);
      return [];
    });
  return systemFontOptionsRequest.then((options) => {
    cachedSystemFontOptions = options;
    return options;
  });
}

export function formatFontValueLabel(value: string) {
  if (value === defaultFontFamily) return defaultFontOption.label;
  return (
    value
      .split(",")[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, "") || value
  );
}

export function FontSelector({
  value,
  fontSource,
  hasKeyframe = false,
  onToggleKeyframe,
  onChange,
  onResolveFontSource,
}: {
  value: string;
  fontSource?: string;
  hasKeyframe?: boolean;
  onToggleKeyframe?: () => void;
  onChange: (value: string, option?: FontOption) => void;
  onResolveFontSource?: (option: FontOption) => void;
}) {
  const [systemFontOptions, setSystemFontOptions] = useState<FontOption[]>(
    cachedSystemFontOptions ?? [],
  );
  const fontOptions = useMemo(() => {
    const merged = [defaultFontOption, ...systemFontOptions];
    if (value && !merged.some((option) => option.value === value)) {
      merged.splice(1, 0, { value, label: formatFontValueLabel(value) });
    }
    return merged;
  }, [systemFontOptions, value]);

  useEffect(() => {
    // Already populated from cache -- skip the async round-trip and the extra
    // setState/render that comes with it on every mount.
    if (cachedSystemFontOptions) {
      setSystemFontOptions(cachedSystemFontOptions);
      return;
    }
    let active = true;
    void loadSystemFontOptions().then((options) => {
      if (active) setSystemFontOptions(options);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const option = fontOptions.find(
      (option) => option.value === value && option.source,
    );
    if (option?.source && option.source !== fontSource) {
      onResolveFontSource?.(option);
    }
  }, [fontOptions, fontSource, onResolveFontSource, value]);

  return (
    <label className={`grid gap-1.5 ${mutedCaps}`}>
      Font
      <span className="relative block">
        <Select
          value={value}
          onValueChange={(nextValue) =>
            onChange(
              nextValue,
              fontOptions.find((option) => option.value === nextValue),
            )
          }
        >
          <SelectTrigger
            className={`h-[42px] rounded-[10px] px-3 text-xs font-bold text-[#dfe2ea] ${onToggleKeyframe ? "pl-8" : ""} ${hasKeyframe ? "border-white" : ""}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {fontOptions.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  style={
                    option.value === defaultFontFamily
                      ? undefined
                      : {
                          fontFamily: `"${option.value}", ${defaultFontFamily}`,
                          contentVisibility: "auto",
                          containIntrinsicSize: "26px",
                        }
                  }
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {onToggleKeyframe ? (
          <button
            aria-label={
              hasKeyframe
                ? "Remove Font keyframe at playhead"
                : "Add Font keyframe at playhead"
            }
            aria-pressed={hasKeyframe}
            className={`absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] border transition hover:scale-125 ${
              hasKeyframe
                ? "border-white bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                : "border-[#6f7684] bg-[#12151d] hover:border-white"
            }`}
            title={
              hasKeyframe
                ? "Remove Font keyframe at playhead"
                : "Add Font keyframe at playhead"
            }
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleKeyframe();
            }}
          />
        ) : null}
      </span>
    </label>
  );
}
