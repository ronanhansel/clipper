export type TimelineBlockPreview = { start: number; duration: number };
export type TimelineBlockPreviewMap = Record<string, TimelineBlockPreview>;
export type TimelineBlockPreviewKind = "composition" | "adjustment" | "motion";

export function timelineBlockPreviewKey(kind: TimelineBlockPreviewKind, id: string, markerId?: string) {
  return markerId ? `${kind}:${id}:${markerId}` : `${kind}:${id}`;
}
