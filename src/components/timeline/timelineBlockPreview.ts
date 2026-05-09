export type TimelineBlockPreview = {
  start: number;
  duration: number;
  midPoint?: number;
  blocked?: boolean;
};
export type TimelineBlockPreviewMap = Record<string, TimelineBlockPreview>;
export type TimelineBlockPreviewKind =
  | "composition"
  | "adjustment"
  | "motion"
  | "transition";

export function timelineBlockPreviewKey(
  kind: TimelineBlockPreviewKind,
  id: string,
  markerId?: string,
) {
  return markerId ? `${kind}:${id}:${markerId}` : `${kind}:${id}`;
}
