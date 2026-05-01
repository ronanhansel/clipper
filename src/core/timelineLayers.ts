import type { TimelineAdjustmentLayerState, TimelineCompositionLayerState, TimelineLayerState, TimelineMotionLayerState, TimelineTransitionLayerState } from "./types";

export type TimelineLayerCategory = "transition" | "adjust" | "motion" | "comp";
export type TimelineLayerStateKey = "compositionLayers" | "adjustmentLayers" | "motionLayers" | "transitionLayers";
export type TimelineLayerStateItem = TimelineCompositionLayerState | TimelineAdjustmentLayerState | TimelineMotionLayerState | TimelineTransitionLayerState;

export type TimelineLayerRow = {
  key: string;
  category: TimelineLayerCategory;
  accent: string;
};

export type TimelineLayerLayout = {
  rows: TimelineLayerRow[];
  starts: number[];
  heights: number[];
};

export type TimelineLayerDragPreview = {
  targetLayerId?: string;
  deltaY: number;
  height?: number;
};

export function getTimelineLayerRowAtY(layout: TimelineLayerLayout, y: number, category?: TimelineLayerCategory) {
  const index = layout.rows.findIndex((row, rowIndex) => {
    if (category && row.category !== category) return false;
    return y >= layout.starts[rowIndex] && y <= layout.starts[rowIndex] + layout.heights[rowIndex];
  });
  return index < 0 ? null : { row: layout.rows[index], index };
}

export function getTimelineLayerRowAtClientY(layout: TimelineLayerLayout, containerRect: Pick<DOMRect, "top"> | null | undefined, clientY: number, category?: TimelineLayerCategory) {
  if (!containerRect) return null;
  return getTimelineLayerRowAtY(layout, clientY - containerRect.top, category);
}

export function getTimelineLayerDragPreview(layout: TimelineLayerLayout, sourceLayerId: string | undefined, targetLayerId: string | undefined): TimelineLayerDragPreview {
  if (!sourceLayerId || !targetLayerId) return { targetLayerId, deltaY: 0 };
  const sourceIndex = layout.rows.findIndex((row) => row.key === sourceLayerId);
  const targetIndex = layout.rows.findIndex((row) => row.key === targetLayerId);
  if (sourceIndex < 0 || targetIndex < 0) return { targetLayerId, deltaY: 0 };
  return {
    targetLayerId,
    deltaY: layout.starts[targetIndex] - layout.starts[sourceIndex],
    height: layout.heights[targetIndex],
  };
}

export function getTimelineLayerStateKey(category: TimelineLayerCategory): TimelineLayerStateKey {
  if (category === "comp") return "compositionLayers";
  if (category === "adjust") return "adjustmentLayers";
  if (category === "transition") return "transitionLayers";
  return "motionLayers";
}

export function getTimelineStateLayers(state: TimelineLayerState, category: TimelineLayerCategory, defaults: TimelineLayerState): TimelineLayerStateItem[] {
  const key = getTimelineLayerStateKey(category);
  return state[key]?.length ? state[key]! : defaults[key] ?? [];
}

export function insertTimelineStateLayer<T extends TimelineLayerStateItem>(layers: T[], layer: T, targetLayerId?: string, placement: "before" | "after" = "after") {
  const targetIndex = targetLayerId ? layers.findIndex((item) => item.id === targetLayerId) : -1;
  if (targetIndex < 0) return [...layers, layer];
  const next = [...layers];
  next.splice(placement === "before" ? targetIndex : targetIndex + 1, 0, layer);
  return next;
}

export function renameTimelineStateLayer(state: TimelineLayerState, category: TimelineLayerCategory, layerId: string, name: string, defaults: TimelineLayerState): TimelineLayerState {
  const key = getTimelineLayerStateKey(category);
  return { ...state, [key]: getTimelineStateLayers(state, category, defaults).map((layer) => (layer.id === layerId ? { ...layer, name } : layer)) };
}

export function toggleTimelineStateLayerHidden(state: TimelineLayerState, category: TimelineLayerCategory, layerId: string, defaults: TimelineLayerState): TimelineLayerState {
  const key = getTimelineLayerStateKey(category);
  return { ...state, [key]: getTimelineStateLayers(state, category, defaults).map((layer) => (layer.id === layerId ? { ...layer, hidden: !layer.hidden || undefined } : layer)) };
}

export function toggleTimelineStateLayerLocked(state: TimelineLayerState, category: TimelineLayerCategory, layerId: string, defaults: TimelineLayerState): TimelineLayerState {
  const key = getTimelineLayerStateKey(category);
  return { ...state, [key]: getTimelineStateLayers(state, category, defaults).map((layer) => (layer.id === layerId ? { ...layer, locked: !layer.locked || undefined } : layer)) };
}

export function moveTimelineStateLayer(state: TimelineLayerState, category: TimelineLayerCategory, layerId: string, direction: "up" | "down", defaults: TimelineLayerState): TimelineLayerState {
  const key = getTimelineLayerStateKey(category);
  const layers = getTimelineStateLayers(state, category, defaults);
  const index = layers.findIndex((layer) => layer.id === layerId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= layers.length) return state;
  const nextLayers = [...layers];
  [nextLayers[index], nextLayers[targetIndex]] = [nextLayers[targetIndex], nextLayers[index]];
  return { ...state, [key]: nextLayers };
}

export function removeTimelineStateLayer(state: TimelineLayerState, category: TimelineLayerCategory, layerId: string, defaults: TimelineLayerState): TimelineLayerState {
  const key = getTimelineLayerStateKey(category);
  const layers = getTimelineStateLayers(state, category, defaults);
  if (layers.length <= 1) return state;
  return { ...state, [key]: layers.filter((layer) => layer.id !== layerId) };
}

export function computeBulkLayerTargets(
  layout: TimelineLayerLayout,
  category: TimelineLayerCategory,
  sourceLayerId: string | undefined,
  cursorLayerId: string | undefined,
  moveTargets: Array<{ id: string; layerId?: string }>,
  defaultLayerKey: string,
): Map<string, string> {
  const categoryRows = layout.rows.filter((row) => row.category === category);
  const normalizedSource = sourceLayerId ?? defaultLayerKey;
  const sourceIdx = categoryRows.findIndex((row) => row.key === normalizedSource);
  const cursorIdx = cursorLayerId ? categoryRows.findIndex((row) => row.key === cursorLayerId) : sourceIdx;
  if (sourceIdx < 0 || cursorIdx < 0) {
    const fallback = cursorLayerId ?? sourceLayerId ?? normalizedSource;
    return new Map(moveTargets.map((t) => [t.id, fallback]));
  }
  const layerIdxDelta = cursorIdx - sourceIdx;
  const result = new Map<string, string>();
  for (const target of moveTargets) {
    const targetSourceLayer = target.layerId ?? defaultLayerKey;
    const targetSrcIdx = categoryRows.findIndex((row) => row.key === targetSourceLayer);
    if (targetSrcIdx < 0) {
      result.set(target.id, cursorLayerId ?? normalizedSource);
      continue;
    }
    const newIdx = Math.max(0, Math.min(targetSrcIdx + layerIdxDelta, categoryRows.length - 1));
    result.set(target.id, categoryRows[newIdx].key);
  }
  return result;
}

export function getTimelineBlockLayerPreview(layout: TimelineLayerLayout, category: TimelineLayerCategory, sourceLayerId: string | undefined, clientY: number, containerRect: Pick<DOMRect, "top"> | null | undefined) {
  const targetLayerId = getTimelineLayerRowAtClientY(layout, containerRect, clientY, category)?.row.key;
  return getTimelineLayerDragPreview(layout, sourceLayerId, targetLayerId);
}

export function applyTimelineBlockPreview(element: HTMLElement, options: { deltaX: number; deltaY?: number; height?: number; resizeProperty?: string; blocked?: boolean }) {
  element.style.transform = `translate3d(${options.deltaX}px, ${options.deltaY ?? 0}px, 0)`;
  if (options.height !== undefined) element.style.height = `${options.height}px`;
  else element.style.removeProperty("height");
  element.style.willChange = "transform";
  element.style.zIndex = "25";
  if (options.blocked) {
    if (!element.dataset.originalBackground) element.dataset.originalBackground = element.style.background;
    element.style.background = "linear-gradient(180deg, #dc2626, #991b1b)";
    element.style.color = "#ffffff";
  } else if (element.dataset.originalBackground) {
    element.style.background = element.dataset.originalBackground;
    delete element.dataset.originalBackground;
    element.style.removeProperty("color");
  }
  element.parentElement?.style.setProperty("overflow", "visible");
}

export function clearTimelineBlockPreview(element: HTMLElement, resizeProperty = "--clipper-timeline-resize-width") {
  element.style.removeProperty("transform");
  element.style.removeProperty(resizeProperty);
  element.style.removeProperty("height");
  element.style.removeProperty("will-change");
  element.style.removeProperty("z-index");
  if (element.dataset.originalBackground) {
    element.style.background = element.dataset.originalBackground;
    delete element.dataset.originalBackground;
  }
  element.style.removeProperty("color");
  element.parentElement?.style.removeProperty("overflow");
}
