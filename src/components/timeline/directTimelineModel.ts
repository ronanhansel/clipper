import { defaultTimelineLayerState } from "../../core/project";
import { getAdjustmentEffectPackage, getTransitionEffectPackage } from "../../core/effects/registry";
import type { TimelineLayerCategory, TimelineLayerLayout } from "../../core/timelineLayers";
import type { TimelineLayerState, TimelineMode } from "../../core/types";
import { getTimelineRowHeight } from "./useTimelineRowResize";
import { getDisplayNameFromPath } from "../../core/fileNames";

export type DirectTimelineLayerRow = {
  key: string;
  category: TimelineLayerCategory;
  accent: string;
};

export function buildDirectTimelineModel({ mode, rowHeights, timelineLayers }: {
  mode: TimelineMode;
  rowHeights: Record<string, number>;
  timelineLayers: TimelineLayerState;
}) {
  const isCompositionMode = mode === "composition";
  const motionLayers = (timelineLayers.motionLayers !== undefined ? timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!).map(layer => ({
    ...layer,
    name: layer.name || "Motion"
  }));
  const compositionRows = (timelineLayers.compositionLayers !== undefined ? timelineLayers.compositionLayers : defaultTimelineLayerState.compositionLayers!).map(layer => ({
    ...layer,
    name: layer.name || getDisplayNameFromPath(layer.id)
  }));
  const adjustmentRows = (timelineLayers.adjustmentLayers !== undefined ? timelineLayers.adjustmentLayers : defaultTimelineLayerState.adjustmentLayers!).map((layer) => {
    const effect = getAdjustmentEffectPackage(layer.id);
    return { key: layer.id, accent: effect?.accent ?? "#8f65f2", name: layer.name || effect?.label || "Adjustment", hidden: Boolean(layer.hidden), locked: Boolean(layer.locked), effect };
  });
  const transitionRows = (timelineLayers.transitionLayers !== undefined ? timelineLayers.transitionLayers : defaultTimelineLayerState.transitionLayers!).map((layer) => {
    const effect = getTransitionEffectPackage(layer.id);
    return { key: layer.id, accent: effect?.accent ?? "#ff8c42", name: layer.name || effect?.label || "Transition", hidden: Boolean(layer.hidden), locked: Boolean(layer.locked), effect };
  });
  const directLayerRows: DirectTimelineLayerRow[] = [...transitionRows.map((row) => ({ key: row.key, category: "transition" as const, accent: row.accent })), ...adjustmentRows.map((row) => ({ key: row.key, category: "adjust" as const, accent: row.accent })), ...motionLayers.map((layer) => ({ key: layer.id, category: "motion" as const, accent: "#24b7c9" })), ...compositionRows.map((layer) => ({ key: layer.id, category: "comp" as const, accent: "#38a86d" }))];
  const layerRows: DirectTimelineLayerRow[] = isCompositionMode
    ? directLayerRows
    : compositionRows.map((layer) => ({ key: layer.id, category: "comp" as const, accent: "#38a86d" }));
  const directBaseLayerRowHeights = directLayerRows.map((row) => getTimelineRowHeight(rowHeights, row.key));
  const directLayerRowHeightByKey = new Map(directLayerRows.map((row, index) => [row.key, directBaseLayerRowHeights[index]]));
  const layerRowHeights = isCompositionMode
    ? directBaseLayerRowHeights
    : layerRows.map((row) => directLayerRowHeightByKey.get(row.key) ?? getTimelineRowHeight(rowHeights, row.key));
  const layerRowStarts = layerRowHeights.reduce<number[]>((starts, height, index) => [...starts, index === 0 ? 0 : starts[index - 1] + layerRowHeights[index - 1]], []);
  const layerLayout: TimelineLayerLayout = { rows: layerRows, starts: layerRowStarts, heights: layerRowHeights };
  const laneRowsStyle = { gridTemplateRows: layerRowHeights.map((height) => `${height}px`).join(" ") };
  const laneContentHeight = layerRowHeights.reduce((total, height) => total + height, 0);

  return {
    adjustmentRows,
    compositionRows,
    transitionRows,
    isCompositionMode,
    laneContentHeight,
    laneRowsStyle,
    layerLayout,
    layerRows,
    layerRowHeights,
    layerRowStarts,
    motionLayers,
    timelineMarkersEditable: isCompositionMode,
  };
}
