import { describe, expect, it } from "vitest";
import {
  applyTimelineBlockPreview,
  clearTimelineBlockPreview,
} from "./timelineLayers";

describe("timeline block previews", () => {
  it("previews width without losing the original inline width", () => {
    const element = createPreviewElement();
    element.style.width = "120px";

    applyTimelineBlockPreview(element, { deltaX: 10, width: 80 });
    applyTimelineBlockPreview(element, { deltaX: 20, width: 90 });

    expect(element.style.width).toBe("90px");
    clearTimelineBlockPreview(element);
    expect(element.style.width).toBe("120px");
  });

  it("clears preview width when the block had no inline width", () => {
    const element = createPreviewElement();

    applyTimelineBlockPreview(element, { deltaX: 10, width: 80 });
    clearTimelineBlockPreview(element);

    expect(element.style.width).toBe("");
  });
});

function createPreviewElement() {
  const style = {
    background: "",
    color: "",
    height: "",
    transform: "",
    width: "",
    willChange: "",
    zIndex: "",
    removeProperty(property: string) {
      this[property as keyof typeof style] = "" as never;
    },
  };
  return { dataset: {}, parentElement: null, style } as unknown as HTMLElement;
}
