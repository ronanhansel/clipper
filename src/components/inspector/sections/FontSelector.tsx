import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { mutedCaps } from "../../../app/config";
import { clipperHost } from "../../../app/clipperHost";
import { graphicDefaultFontFamily } from "../../../core/graphics/inspectorSettings";
import { cn } from "../../../lib/utils";
import { Input } from "../../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";

export type FontOption = { value: string; label: string; source?: string };

export const defaultFontFamily = graphicDefaultFontFamily;
export const defaultFontOption: FontOption = {
  value: defaultFontFamily,
  label: "System",
};

let cachedSystemFontOptions: FontOption[] | null = null;
let systemFontOptionsRequest: Promise<FontOption[]> | null = null;
const maxVisibleFontOptions = 80;

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fontOptions = useMemo(() => {
    const merged = [defaultFontOption, ...systemFontOptions];
    if (value && !merged.some((option) => option.value === value)) {
      merged.splice(1, 0, { value, label: formatFontValueLabel(value) });
    }
    return merged;
  }, [systemFontOptions, value]);
  const selectedFontLabel = useMemo(
    () =>
      fontOptions.find((option) => option.value === value)?.label ??
      formatFontValueLabel(value),
    [fontOptions, value],
  );
  const visibleFontOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedOption = fontOptions.find((option) => option.value === value);
    const matches = normalizedQuery
      ? fontOptions.filter((option) =>
          option.label.toLowerCase().includes(normalizedQuery),
        )
      : fontOptions;
    const capped = matches.slice(0, maxVisibleFontOptions);
    if (
      selectedOption &&
      !capped.some((option) => option.value === selectedOption.value)
    ) {
      return [selectedOption, ...capped.slice(0, maxVisibleFontOptions - 1)];
    }
    return capped;
  }, [fontOptions, query, value]);

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

  function selectFont(option: FontOption) {
    onChange(option.value, option);
    setOpen(false);
    setQuery("");
  }

  return (
    <label className={`grid gap-1.5 ${mutedCaps}`}>
      Font
      <span className="relative block">
        <Popover
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              aria-expanded={open}
              className={cn(
                "flex h-[42px] w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 text-xs font-bold text-[#dfe2ea] outline-none transition hover:border-[var(--clipper-accent)] focus:border-[var(--clipper-accent)] focus:ring-2 focus:ring-[rgb(var(--clipper-accent-rgb)/0.2)]",
                onToggleKeyframe ? "pl-8" : "",
                hasKeyframe ? "border-white" : "",
              )}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {selectedFontLabel}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-[#9b9da7]" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] gap-2 p-2">
            <Input
              autoFocus
              className="h-8"
              placeholder="Search fonts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="grid max-h-72 overflow-y-auto pr-1" role="listbox">
              {visibleFontOptions.map((option) => (
                <button
                  key={option.value}
                  aria-selected={option.value === value}
                  className={cn(
                    "min-w-0 rounded-[7px] px-2 py-1.5 text-left text-xs font-bold text-[#dfe2ea] outline-none transition hover:bg-[#252936] focus:bg-[#252936]",
                    option.value === value ? "bg-[#2f3442] text-white" : "",
                  )}
                  role="option"
                  type="button"
                  onClick={() => selectFont(option)}
                >
                  <span className="block truncate">{option.label}</span>
                </button>
              ))}
              {visibleFontOptions.length === 0 ? (
                <div className="px-2 py-2 text-xs font-bold text-[#858b99]">
                  No fonts found
                </div>
              ) : null}
              {fontOptions.length > visibleFontOptions.length ? (
                <div className="px-2 py-2 text-[11px] font-bold text-[#858b99]">
                  Showing {visibleFontOptions.length} of {fontOptions.length}
                </div>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
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
