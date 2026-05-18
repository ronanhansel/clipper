import { motionEasePresets } from "../../core/easing";
import type { MotionEase } from "../../core/types";
import { SelectItem } from "../ui/select";

export const defaultMotionEaseSelectValue = "default";

const explicitEasePreviewItems: {
  value: string;
  label: string;
  ease: MotionEase;
}[] = motionEasePresets.map((preset) => ({
  value: preset.value,
  label: preset.label,
  ease: preset.value,
}));

const defaultEasePreviewItems: {
  value: string;
  label: string;
  ease: MotionEase;
}[] = explicitEasePreviewItems.map((item) =>
  item.ease === "easeInOut"
    ? { ...item, value: defaultMotionEaseSelectValue }
    : item,
);

export function motionEaseSelectValue(
  ease: MotionEase | undefined,
  explicit = false,
) {
  if (explicit) return ease ?? "";
  return ease && ease !== "easeInOut" ? ease : defaultMotionEaseSelectValue;
}

export function EaseSelectItems({
  includeLinear = true,
  defaultInOut = false,
}: {
  includeLinear?: boolean;
  defaultInOut?: boolean;
}) {
  const items = defaultInOut
    ? defaultEasePreviewItems
    : explicitEasePreviewItems;
  return (
    <>
      {items
        .filter((item) => includeLinear || item.value !== "linear")
        .map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            variant="ease"
            ease={item.ease}
          >
            {item.label}
          </SelectItem>
        ))}
    </>
  );
}
