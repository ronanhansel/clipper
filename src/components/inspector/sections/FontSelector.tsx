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

export type FontOption = { value: string; label: string };

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
    .then((fonts) => fonts.map((font) => ({ value: font, label: font })))
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
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
    if (cachedSystemFontOptions) return;
    let active = true;
    void loadSystemFontOptions().then((options) => {
      if (active) setSystemFontOptions(options);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <label className={`grid gap-1.5 ${mutedCaps}`}>
      Font
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-[42px] rounded-[10px] px-3 text-xs font-bold text-[#dfe2ea]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {fontOptions.map((option) => (
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
