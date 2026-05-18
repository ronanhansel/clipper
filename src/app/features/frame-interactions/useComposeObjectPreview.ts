import type {
  FrameObject,
  PartFrame,
  BackgroundLayer,
} from "../../../core/types";
import {
  type FillValue,
  fillValueToCss,
  isFillValue,
} from "../../../core/fillValue";

type UseComposeObjectPreviewParams = {
  frameViewportRef: React.RefObject<HTMLDivElement | null>;
  selectedObject: FrameObject | null;
  part: { background: BackgroundLayer; frame: PartFrame };
};

const lengthPreviewStyleKeys = new Set([
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "fontSize",
  "letterSpacing",
]);

function cssEscape(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

function cssStylePropertyName(key: string) {
  return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function previewShadowRgba(color: string, alphaPct: number) {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alphaPct / 100));
  return "rgba(" + r + ", " + g + ", " + b + ", " + a.toFixed(2) + ")";
}

function formatPreviewStyleValue(key: string, value: string | number) {
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);
  if (key === "fontSize")
    return `calc(${value}px * var(--clipper-scale-preview, 1))`;
  return lengthPreviewStyleKeys.has(key) ? `${value}px` : String(value);
}

function applyPreviewShadowStyle(target: HTMLElement, object: FrameObject) {
  const shadow = object.shadow;
  if (!shadow || shadow.enabled === false) return;
  const x =
    typeof shadow.x === "number" && Number.isFinite(shadow.x) ? shadow.x : 0;
  const y =
    typeof shadow.y === "number" && Number.isFinite(shadow.y) ? shadow.y : 0;
  const blur =
    typeof shadow.blur === "number" && Number.isFinite(shadow.blur)
      ? Math.max(0, shadow.blur)
      : 0;
  const spread =
    typeof shadow.spread === "number" && Number.isFinite(shadow.spread)
      ? Math.max(0, Math.min(64, shadow.spread))
      : 0;
  const color = typeof shadow.color === "string" ? shadow.color : "#000000";
  const alpha = typeof shadow.alpha === "number" ? shadow.alpha : 100;
  const rgba = previewShadowRgba(color, alpha);
  if (!rgba) return;
  target.style.removeProperty("filter");
  target.style.removeProperty("text-shadow");
  target.style.removeProperty("box-shadow");
  if (object.type === "rect" || object.type === "pattern2d") {
    target.style.boxShadow =
      x.toFixed(2) +
      "px " +
      y.toFixed(2) +
      "px " +
      blur.toFixed(2) +
      "px " +
      spread.toFixed(2) +
      "px " +
      rgba;
  } else {
    target.style.filter =
      "drop-shadow(" +
      x.toFixed(2) +
      "px " +
      y.toFixed(2) +
      "px " +
      blur.toFixed(2) +
      "px " +
      rgba +
      ")";
  }
}

export function useComposeObjectPreview({
  frameViewportRef,
  selectedObject,
  part,
}: UseComposeObjectPreviewParams) {
  function previewSelectedObject(
    updater: (object: FrameObject) => FrameObject,
  ) {
    const source = selectedObject;
    if (!source) return;
    const next = updater(source);
    const selector =
      next.id === part.background.id
        ? `[data-layer-id="${cssEscape(next.id)}"]`
        : `[data-clipper-render-object-id="${cssEscape(next.id)}"]`;
    const target =
      frameViewportRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.style.left = `${next.bounds.x}px`;
    target.style.top = `${next.bounds.y}px`;
    target.style.width = `${next.bounds.width}px`;
    target.style.height = `${next.bounds.height}px`;
    window.dispatchEvent(
      new CustomEvent("clipper:object-preview-bounds", {
        detail: { bounds: next.bounds, objectId: next.id },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("clipper:object-preview-stroke", {
        detail: { stroke: next.stroke ?? null, objectId: next.id },
      }),
    );
    for (const [key, value] of Object.entries(next.style)) {
      if (value === undefined)
        target.style.removeProperty(cssStylePropertyName(key));
      else if (key === "backgroundColor" && isFillValue(value)) {
        const fill = value as unknown as FillValue;
        if (fill.mode === "gradient") {
          target.style.setProperty("background-color", "transparent");
          target.style.setProperty("background-image", fillValueToCss(fill));
        } else {
          target.style.setProperty("background-color", fillValueToCss(fill));
          target.style.setProperty("background-image", "none");
        }
      } else
        target.style.setProperty(
          cssStylePropertyName(key),
          formatPreviewStyleValue(key, value),
        );
    }
    if (next.transform && typeof next.transform === "object") {
      const t = next.transform as Record<string, unknown>;
      const parts: string[] = [];
      const pushTransform = (key: string, unit: string) => {
        const v = t[key];
        if (typeof v === "number" && Number.isFinite(v))
          parts.push(`${key}(${v}${unit})`);
      };
      pushTransform("perspective", "px");
      pushTransform("translateX", "px");
      pushTransform("translateY", "px");
      pushTransform("translateZ", "px");
      pushTransform("scale", "");
      pushTransform("scaleX", "");
      pushTransform("scaleY", "");
      pushTransform("rotate", "deg");
      pushTransform("rotateX", "deg");
      pushTransform("rotateY", "deg");
      pushTransform("rotateZ", "deg");
      pushTransform("skewX", "deg");
      pushTransform("skewY", "deg");
      target.style.transform = parts.length ? parts.join(" ") : "";
    }
    if (next.shadow) {
      const shadow = next.shadow;
      if (shadow.enabled === false) {
        target.style.removeProperty("filter");
        target.style.removeProperty("text-shadow");
        target.style.removeProperty("box-shadow");
      } else {
        applyPreviewShadowStyle(target, next);
      }
    }
  }

  function previewPartFrame(updater: (frame: PartFrame) => PartFrame) {
    const next = updater(part.frame);
    const target = frameViewportRef.current?.querySelector<HTMLElement>(
      "[data-clipper-frame-content]",
    );
    const background = next.style.background;
    if (target && background !== undefined)
      target.style.background = String(background);
  }

  function previewPartBackground(
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) {
    const next = updater(part.background);
    const target = frameViewportRef.current?.querySelector<HTMLElement>(
      `[data-layer-id="${cssEscape(next.id)}"] > div`,
    );
    const background = next.style.background;
    if (target && background !== undefined)
      target.style.background = String(background);
  }

  return {
    previewSelectedObject,
    previewPartFrame,
    previewPartBackground,
  };
}
