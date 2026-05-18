import {
  formatCameraPreviewFilter,
  formatCameraPreviewTransform,
  getLayeredCameraPreviewTransform,
  type CameraPreviewTransform,
} from "../../../core/camera";
import {
  getMotionMarkerViews,
  motionBlocksToMotionMarkers,
} from "../../../core/motionEffects";
import type {
  MotionMarker,
  Part,
  TimelineMode,
  TimelineMotionLayerState,
} from "../../../core/types";
import { TIMELINE_MOTION_PART_ID } from "../../types";

export type BuildMotionCameraPreviewInput = {
  activeTimelinePart: { start: number } | null | undefined;
  hiddenMotionLayerIds: Set<string>;
  isPickingTranslationPosition: boolean;
  isPickingZoomFocus: boolean;
  markerId: string;
  motionLayers: TimelineMotionLayerState[];
  part: Part;
  partId: string;
  previewTime: number;
  scene: { compositions: Part[]; motionMarkers?: MotionMarker[] };
  timelineMode: TimelineMode;
  updater: (marker: MotionMarker) => MotionMarker;
};

export function buildMotionMarkerCameraPreviewTransform(
  input: BuildMotionCameraPreviewInput,
): CameraPreviewTransform | null {
  const {
    activeTimelinePart,
    hiddenMotionLayerIds,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    markerId,
    motionLayers,
    part,
    partId,
    previewTime,
    scene,
    timelineMode,
    updater,
  } = input;

  if (timelineMode !== "direct" || isPickingZoomFocus) return null;

  if (partId === TIMELINE_MOTION_PART_ID) {
    const activeStart = activeTimelinePart?.start ?? 0;
    const previewMotionMarkers = getMotionMarkerViews(scene).motionMarkers.map(
      (marker) => {
        const adjusted = { ...marker, start: marker.start - activeStart };
        return marker.id === markerId
          ? { ...updater(adjusted), start: adjusted.start }
          : adjusted;
      },
    );
    return getLayeredCameraPreviewTransform(
      {
        ...part,
        motionMarkers: motionBlocksToMotionMarkers(previewMotionMarkers),
      },
      motionLayers,
      previewTime,
      {
        hiddenLayerIds: hiddenMotionLayerIds,
        pickingTranslationPosition: isPickingTranslationPosition,
      },
    );
  }

  const previewPart = scene.compositions.find((item) => item.id === partId);
  if (!previewPart || previewPart.id !== part.id) return null;

  const previewMotionMarkers = getMotionMarkerViews(
    previewPart,
  ).motionMarkers.map((marker) => {
    return marker.id === markerId ? updater(marker) : marker;
  });
  return getLayeredCameraPreviewTransform(
    {
      ...previewPart,
      motionMarkers: motionBlocksToMotionMarkers(previewMotionMarkers),
    },
    motionLayers,
    previewTime,
    {
      hiddenLayerIds: hiddenMotionLayerIds,
      pickingTranslationPosition: isPickingTranslationPosition,
    },
  );
}

export function applyCameraPreviewToElement(
  element: HTMLElement | null,
  transform: CameraPreviewTransform,
): void {
  if (!element) return;
  element.style.transform = formatCameraPreviewTransform(transform);
  element.style.filter = formatCameraPreviewFilter(transform) ?? "";
}
