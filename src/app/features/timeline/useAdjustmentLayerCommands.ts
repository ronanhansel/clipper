import { defaultAdjustmentEffectPackage, getAdjustmentEffectPackage } from "../../../core/effects/registry";
import type { AdjustmentEffectPointControl } from "../../../core/effects/types";
import { roundToPrecision, roundTenth, roundTwo } from "../../../core/math";
import { getAdjustmentPlacement, getTimelineMarkerMendLayerId, getSelectedActiveMiddleMend, getSelectedMotionMiddleSnap, getMotionMiddleSnap, isMotionMiddleSnapActive, type TimelineMendMarker } from "../../../core/timeline";
import type { AdjustmentEffectId, AdjustmentLayer, TimelineLayerState } from "../../../core/types";
import { applyAdjustmentLayerOverwrite } from "./timelineMutationHelpers";

type PointPickAdjustment = { layerId: string; control: AdjustmentEffectPointControl } | null;
type UpdateSceneAdjustmentLayers = (updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[]) => void;

type UseAdjustmentLayerCommandsInput = {
  currentSceneTimeRef: { current: number };
  pointPickAdjustment: PointPickAdjustment;
  scene: {
    adjustmentLayers?: AdjustmentLayer[];
  };
  sceneDurationSeconds: number;
  selectedAdjustmentLayerId: string | null;
  timelineLayers: TimelineLayerState;
  pausePlaybackAtCurrentTime: () => void;
  selectAdjustmentLayer: (layerId: string) => void;
  setFocusPickZoomMarker: (selection: { partId: string; markerId: string } | null) => void;
  setFramePickPreviewPoint: (point: null) => void;
  setPointPickAdjustment: (selection: PointPickAdjustment) => void;
  setPositionPickTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectedPartId: (id: string) => void;
  setTrackerPickTranslationMarker: (selection: { partId: string; markerId: string } | null) => void;
  timelinePrecision: number;
  updateSceneAdjustmentLayers: UpdateSceneAdjustmentLayers;
};

export function useAdjustmentLayerCommands({
  currentSceneTimeRef,
  pointPickAdjustment,
  scene,
  sceneDurationSeconds,
  selectedAdjustmentLayerId,
  timelineLayers,
  pausePlaybackAtCurrentTime,
  selectAdjustmentLayer,
  setFocusPickZoomMarker,
  setFramePickPreviewPoint,
  setPointPickAdjustment,
  setPositionPickTranslationMarker,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedPartId,
  setTrackerPickTranslationMarker,
  timelinePrecision,
  updateSceneAdjustmentLayers,
}: UseAdjustmentLayerCommandsInput) {
  function updateAdjustmentLayer(layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) {
    updateSceneAdjustmentLayers((layers) => applyAdjustmentLayerOverwrite(layers.map((layer) => (layer.id === layerId ? updater(layer) : layer)), new Set([layerId])));
  }

  function moveAdjustmentLayer(layerId: string, start: number, targetLayerId?: string) {
    updateAdjustmentLayer(layerId, (layer) => ({ ...layer, layerId: targetLayerId ?? layer.layerId, start: roundToPrecision(Math.max(start, 0), timelinePrecision) }));
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers([{ layerId }]);
    setSelectedPartId("");
  }

  function addAdjustmentLayer() {
    addAdjustmentLayerAt(defaultAdjustmentEffectPackage.id, currentSceneTimeRef.current, timelineLayers.adjustmentLayers?.[0]?.id);
  }

  function addAdjustmentLayerAt(effectId: AdjustmentEffectId, sceneTime: number, layerId?: string) {
    const effect = getAdjustmentEffectPackage(effectId);
    if (!effect) return;
    const placement = getAdjustmentPlacement(scene.adjustmentLayers, sceneDurationSeconds, sceneTime);
    const layer = effect.createDefaultLayer({ id: `adj_${Date.now().toString(36)}`, layerId, start: placement.start, duration: placement.duration });
    updateSceneAdjustmentLayers((layers) => applyAdjustmentLayerOverwrite([...layers, layer], new Set([layer.id])));
    selectAdjustmentLayer(layer.id);
  }

  function deleteAdjustmentLayer(layerId: string) {
    updateSceneAdjustmentLayers((layers) => layers.filter((layer) => layer.id !== layerId));
    if (pointPickAdjustment?.layerId === layerId) setPointPickAdjustment(null);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
  }

  function snapAdjustmentMiddle() {
    const markers: TimelineMendMarker[] = (scene.adjustmentLayers ?? []).map((layer) => ({
      id: layer.id,
      start: layer.start,
      duration: layer.duration,
      effectId: layer.effect.effectId,
      layerId: layer.layerId ?? layer.effect.effectId,
      snapIn: layer.snapIn,
      snapOut: layer.snapOut,
      mendInId: layer.mendInId,
      mendOutId: layer.mendOutId,
    }));
    const selectedIds = selectedAdjustmentLayerId ? [selectedAdjustmentLayerId] : [];
    const snap = getSelectedActiveMiddleMend(markers, selectedIds, getTimelineMarkerMendLayerId)
      ?? getSelectedMotionMiddleSnap(markers, selectedIds, getTimelineMarkerMendLayerId)
      ?? getMotionMiddleSnap(markers, currentSceneTimeRef.current, getTimelineMarkerMendLayerId);
    if (!snap) return;
    const middleSnapActive = isMotionMiddleSnapActive(markers, snap);
    const nextBounds = new Map(markers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut, mendInId: marker.mendInId, mendOutId: marker.mendOutId }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair: { previousId: string; nextId: string }) => [pair.previousId, pair.nextId]));
    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, mendOutId: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, mendInId: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, mendOutId: pair.nextId });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, mendInId: pair.previousId });
      }
    }
    updateSceneAdjustmentLayers((layers) => applyAdjustmentLayerOverwrite(layers.map((layer) => {
      if (!mendedIds.has(layer.id)) return layer;
      const bounds = nextBounds.get(layer.id);
      if (!bounds) return layer;
      return { ...layer, start: roundToPrecision(bounds.start, timelinePrecision), duration: roundToPrecision(bounds.end - bounds.start, timelinePrecision), snapIn: bounds.snapIn, snapOut: bounds.snapOut, mendInId: bounds.mendInId, mendOutId: bounds.mendOutId };
    }), mendedIds));
    const nextLayerId = snap.pairs[snap.pairs.length - 1]?.nextId ?? snap.pairs[0]?.previousId;
    if (nextLayerId) {
      setSelectedAdjustmentLayerId(nextLayerId);
      setSelectedAdjustmentLayers([{ layerId: nextLayerId }]);
    }
  }

  function startAdjustmentPointPick(layerId: string, control: AdjustmentEffectPointControl) {
    if (pointPickAdjustment?.layerId === layerId && pointPickAdjustment.control.xKey === control.xKey && pointPickAdjustment.control.yKey === control.yKey) {
      setPointPickAdjustment(null);
      setFramePickPreviewPoint(null);
      return;
    }

    selectAdjustmentLayer(layerId);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    pausePlaybackAtCurrentTime();
    setPointPickAdjustment({ layerId, control });
    setFramePickPreviewPoint(null);
  }

  return {
    addAdjustmentLayer,
    addAdjustmentLayerAt,
    deleteAdjustmentLayer,
    moveAdjustmentLayer,
    snapAdjustmentMiddle,
    startAdjustmentPointPick,
    updateAdjustmentLayer,
  };
}
