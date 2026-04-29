export type TimelineLayerCategory = "adjust" | "motion" | "comp";

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
