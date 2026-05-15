import { nanoid } from "nanoid";

export function createStableCompositionId() {
  return `composition-${nanoid()}`;
}

export function createCompositionClipId() {
  return `clip-${nanoid()}`;
}

export function createStableTimelineId() {
  return `timeline-${nanoid()}`;
}
