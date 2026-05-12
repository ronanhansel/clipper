import type { MotionEase } from "../../core/types";
import { SelectItem } from "../ui/select";

export const defaultMotionEaseSelectValue = "default";
const easePreviewItems = [
  {
    value: defaultMotionEaseSelectValue,
    label: "Ease in-out",
    ease: "easeInOut" as const,
  },
  { value: "linear", label: "Linear", ease: "linear" as const },
  { value: "easeIn", label: "Ease in", ease: "easeIn" as const },
  { value: "easeOut", label: "Ease out", ease: "easeOut" as const },
  { value: "inAndOut", label: "In and out", ease: "inAndOut" as const },
  { value: "expoIn", label: "Expo in", ease: "expoIn" as const },
  { value: "expoOut", label: "Expo out", ease: "expoOut" as const },
  { value: "circOut", label: "Circ out", ease: "circOut" as const },
  { value: "backOut", label: "Back out", ease: "backOut" as const },
];
const explicitEasePreviewItems = easePreviewItems.map((item) =>
  item.ease === "easeInOut" ? { ...item, value: "easeInOut" } : item,
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
  const items = defaultInOut ? easePreviewItems : explicitEasePreviewItems;
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
