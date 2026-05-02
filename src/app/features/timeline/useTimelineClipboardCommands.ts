import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import toast from "react-hot-toast";
import { TIMELINE_MOTION_PART_ID, type ContextMenuState, type MotionMarkerSelection, type TimelineBlankContextTarget, type TimelineNodeContextTarget } from "../../types";
import { clamp, roundToPrecision } from "../../../core/math";
import { getEffectPackage } from "../../../core/effects/registry";
import { getMotionMarkerViews } from "../../../core/motionEffects";
import { buildLinearTimeline } from "../../../core/timeline";
import type { AdjustmentLayer, MotionMarker, Part, TransitionLayer } from "../../../core/types";
import { requestFileManagerFindMedia } from "../../../lib/fileManagerEvents";
import { applyAdjustmentLayerOverwrite, applyMotionMarkerOverwrite, applySceneMotionMarkerOverwrite, placeMotionMarkerOnTimeline, withMotionMarkers } from "./timelineMutationHelpers";
import type { SceneMotionMarkerUpdate } from "./useTimelineProjectActions";

export type TimelineNodeClipboard =
  | { kind: "adjustment"; nodes: Array<{ absoluteStart: number; layer: AdjustmentLayer }> }
  | { kind: "composition"; nodes: Array<{ absoluteStart: number; part: Part }> }
  | { kind: "motion"; nodes: Array<{ absoluteStart: number; partId: string; marker: MotionMarker }> }
  | { kind: "transition"; nodes: Array<{ absoluteStart: number; layer: TransitionLayer }> };

type SceneTimelineClipboardState = {
  id: string;
  adjustmentLayers?: AdjustmentLayer[];
  compositions: Part[];
  motionMarkers?: MotionMarker[];
  transitionLayers?: TransitionLayer[];
};

type UseTimelineClipboardCommandsInput = {
  currentSceneTimeRef: { current: number };
  scene: SceneTimelineClipboardState;
  sceneDurationSeconds: number;
  selectedAdjustmentLayer: AdjustmentLayer | null | undefined;
  selectedAdjustmentLayerId: string | null;
  selectedAdjustmentLayers: Array<{ layerId: string }>;
  selectedPartId: string;
  selectedParts: Array<{ partId: string }>;
  selectedMotionMarkers: MotionMarkerSelection[];
  selectedMotionMarker: MotionMarkerSelection | null;
  selectedTransitionLayerId: string | null;
  selectedTransitionLayers: Array<{ layerId: string }>;
  timeline: Part[];
  deleteCompositionsFromTimeline: (compositionIds: string[]) => void;
  selectAdjustmentLayer: (layerId: string) => void;
  selectPart: (partId: string) => void;
  selectMotionMarker: (partId: string, markerId: string) => void;
  selectMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  selectTransitionLayer: (layerId: string) => void;
  setAppContextMenu: (menu: ContextMenuState) => void;
  setFocusPickZoomMarker: (selection: MotionMarkerSelection | null) => void;
  setPositionPickTranslationMarker: (selection: MotionMarkerSelection | null) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectedMotionMarker: (selection: MotionMarkerSelection | null) => void;
  setSelectedMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  setSelectedTransitionLayerId: (id: string | null) => void;
  setSelectedTransitionLayers: (selection: Array<{ layerId: string }>) => void;
  timelinePrecision: number;
  updateSceneAdjustmentLayers: (updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[]) => void;
  updateSceneMotionMarkers: (updater: (markers: MotionMarker[]) => SceneMotionMarkerUpdate) => void;
  updateSceneParts: (updater: (parts: Part[]) => Part[]) => void;
  updateSceneTransitionLayers: (updater: (layers: TransitionLayer[]) => TransitionLayer[]) => void;
};

export function uniqueTimelineMarkerSelections<T extends { partId: string; markerId: string }>(selection: T[]) {
  return Array.from(new Map(selection.map((item) => [`${item.partId}:${item.markerId}`, item])).values());
}

function pastedTimelineNodeId(prefix: string, index: number) {
  return `${prefix}_${Date.now().toString(36)}_${index.toString(36)}`;
}

function getMotionMarkers(item: { motionMarkers?: MotionMarker[] }) {
  return getMotionMarkerViews(item).motionMarkers;
}

function getCompositionPasteShift(pastedParts: Part[], existingParts: Part[]) {
  let shift = 0;
  const maxAttempts = Math.max(1, pastedParts.length * existingParts.length + 1);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let nextShift: number | null = null;
    for (const pastedPart of pastedParts) {
      const layerId = pastedPart.layerId ?? "comp";
      const sourceStart = pastedPart.start ?? 0;
      const start = sourceStart + shift;
      const end = start + pastedPart.duration;
      for (const existingPart of existingParts) {
        if ((existingPart.layerId ?? "comp") !== layerId) continue;
        const existingStart = existingPart.start ?? 0;
        const existingEnd = existingStart + existingPart.duration;
        if (!(start < existingEnd && end > existingStart)) continue;
        const candidateShift = existingEnd - sourceStart;
        if (candidateShift <= shift) continue;
        nextShift = nextShift === null ? candidateShift : Math.min(nextShift, candidateShift);
      }
    }
    if (nextShift === null) return shift;
    shift = nextShift;
  }
  return shift;
}

function getTransitionPasteShift(pastedLayers: TransitionLayer[], existingLayers: TransitionLayer[]) {
  let shift = 0;
  const maxAttempts = Math.max(1, pastedLayers.length * existingLayers.length + 1);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let nextShift: number | null = null;
    for (const pastedLayer of pastedLayers) {
      if (!getEffectPackage(pastedLayer.effect.effectId)?.tags?.includes("blocksOverlap")) continue;
      const rowKey = pastedLayer.layerId ?? pastedLayer.effect.effectId;
      const start = pastedLayer.start + shift;
      const end = start + pastedLayer.duration;
      for (const existingLayer of existingLayers) {
        if ((existingLayer.layerId ?? existingLayer.effect.effectId) !== rowKey) continue;
        const existingEnd = existingLayer.start + existingLayer.duration;
        if (!(start < existingEnd && end > existingLayer.start)) continue;
        const candidateShift = existingEnd - pastedLayer.start;
        if (candidateShift <= shift) continue;
        nextShift = nextShift === null ? candidateShift : Math.min(nextShift, candidateShift);
      }
    }
    if (nextShift === null) return shift;
    shift = nextShift;
  }
  return shift;
}

export function useTimelineClipboardCommands({
  currentSceneTimeRef,
  scene,
  sceneDurationSeconds,
  selectedAdjustmentLayer,
  selectedAdjustmentLayerId,
  selectedAdjustmentLayers,
  selectedPartId,
  selectedParts,
  selectedMotionMarkers,
  selectedMotionMarker,
  selectedTransitionLayerId,
  selectedTransitionLayers,
  timeline,
  deleteCompositionsFromTimeline,
  selectAdjustmentLayer,
  selectPart,
  selectMotionMarker,
  selectMotionMarkers,
  selectTransitionLayer,
  setAppContextMenu,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  setSelectedTransitionLayerId,
  setSelectedTransitionLayers,
  timelinePrecision,
  updateSceneAdjustmentLayers,
  updateSceneMotionMarkers,
  updateSceneParts,
  updateSceneTransitionLayers,
}: UseTimelineClipboardCommandsInput) {
  const timelineNodeClipboardRef = useRef<TimelineNodeClipboard | null>(null);

  function getSelectedTimelineNodeClipboard(showToast = false): TimelineNodeClipboard | null {
    if (selectedParts.length > 0) {
      const nodes = selectedParts.flatMap((selection) => {
        const part = timeline.find((item) => item.id === selection.partId);
        return part ? [{ absoluteStart: part.start ?? 0, part }] : [];
      });
      if (nodes.length > 0) return { kind: "composition", nodes };
    }

    if (selectedPartId && !selectedMotionMarker) {
      const part = timeline.find((item) => item.id === selectedPartId);
      if (part) return { kind: "composition", nodes: [{ absoluteStart: part.start ?? 0, part }] };
    }

    if (selectedTransitionLayers.length > 0) {
      const nodes = selectedTransitionLayers.flatMap((selection) => {
        const layer = scene.transitionLayers?.find((item) => item.id === selection.layerId);
        return layer ? [{ absoluteStart: layer.start, layer }] : [];
      });
      if (nodes.length > 0) return { kind: "transition", nodes };
    }

    if (selectedTransitionLayerId) {
      const layer = scene.transitionLayers?.find((item) => item.id === selectedTransitionLayerId);
      if (layer) return { kind: "transition", nodes: [{ absoluteStart: layer.start, layer }] };
    }

    if (selectedAdjustmentLayers.length > 0) {
      const nodes = selectedAdjustmentLayers.flatMap((selection) => {
        const layer = scene.adjustmentLayers?.find((item) => item.id === selection.layerId);
        return layer ? [{ absoluteStart: layer.start, layer }] : [];
      });
      if (nodes.length > 0) return { kind: "adjustment", nodes };
    }

    if (selectedAdjustmentLayer) {
      return { kind: "adjustment", nodes: [{ absoluteStart: selectedAdjustmentLayer.start, layer: selectedAdjustmentLayer }] };
    }

    const motionSelection = uniqueTimelineMarkerSelections(selectedMotionMarkers.length > 0 ? selectedMotionMarkers : selectedMotionMarker ? [selectedMotionMarker] : []);
    const motionNodes = motionSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getMotionMarkers(scene).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart ? getMotionMarkers(timelinePart).find((item) => item.id === selection.markerId) : undefined;
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start! + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (motionNodes.length > 0) return { kind: "motion", nodes: motionNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    if (showToast && (selectedPartId || selectedParts.length > 0)) toast.error("No copyable timeline nodes selected.");
    return null;
  }

  function getTimelineNodeClipboardForTarget(target: TimelineNodeContextTarget): TimelineNodeClipboard | null {
    if (target.kind === "part") {
      const part = timeline.find((item) => item.id === target.partId);
      return part ? { kind: "composition", nodes: [{ absoluteStart: part.start ?? 0, part }] } : null;
    }

    if (target.kind === "adjustment") {
      const layer = scene.adjustmentLayers?.find((item) => item.id === target.layerId);
      return layer ? { kind: "adjustment", nodes: [{ absoluteStart: layer.start, layer }] } : null;
    }

    if (target.kind === "transition") {
      const layer = scene.transitionLayers?.find((item) => item.id === target.layerId);
      return layer ? { kind: "transition", nodes: [{ absoluteStart: layer.start, layer }] } : null;
    }

    if (target.kind !== "motion") return null;

    if (target.partId === TIMELINE_MOTION_PART_ID) {
      const motionMarker = getMotionMarkers(scene).find((item) => item.id === target.markerId);
      return motionMarker ? { kind: "motion", nodes: [{ absoluteStart: motionMarker.start, partId: TIMELINE_MOTION_PART_ID, marker: motionMarker }] } : null;
    }

    const timelinePart = timeline.find((item) => item.id === target.partId);
    if (!timelinePart) return null;

    const motionMarker = getMotionMarkers(timelinePart).find((item) => item.id === target.markerId);
    return motionMarker ? { kind: "motion", nodes: [{ absoluteStart: timelinePart.start! + motionMarker.start, partId: timelinePart.id, marker: motionMarker }] } : null;
  }

  function deleteTimelineClipboardNodes(clipboard: TimelineNodeClipboard) {
    if (clipboard.kind === "composition") {
      deleteCompositionsFromTimeline(clipboard.nodes.map((node) => node.part.id));
      return;
    }

    if (clipboard.kind === "adjustment") {
      const layerIds = new Set(clipboard.nodes.map((node) => node.layer.id));
      updateSceneAdjustmentLayers((layers) => layers.filter((layer) => !layerIds.has(layer.id)));
      setSelectedAdjustmentLayerId(null);
      setSelectedAdjustmentLayers([]);
      return;
    }

    if (clipboard.kind === "transition") {
      const layerIds = new Set(clipboard.nodes.map((node) => node.layer.id));
      updateSceneTransitionLayers((layers) => layers.filter((layer) => !layerIds.has(layer.id)));
      setSelectedTransitionLayerId(null);
      setSelectedTransitionLayers([]);
      return;
    }

    if (clipboard.kind === "motion") {
      if (clipboard.nodes.some((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
        const markerIds = new Set(clipboard.nodes.map((node) => node.marker.id));
        updateSceneMotionMarkers((markers) => ({ motionMarkers: markers.filter((marker) => !markerIds.has(marker.id)) }));
        setSelectedMotionMarker(null);
        setSelectedMotionMarkers([]);
        setFocusPickZoomMarker(null);
        setPositionPickTranslationMarker(null);
        return;
      }
      const markerIdsByPart = new Map<string, Set<string>>();
      for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
      updateSceneParts((parts) => parts.map((item) => {
        const markerIds = markerIdsByPart.get(item.id);
        return markerIds ? withMotionMarkers(item, getMotionMarkers(item).filter((marker) => !markerIds.has(marker.id))) : item;
      }));
      setSelectedMotionMarker(null);
      setSelectedMotionMarkers([]);
      setFocusPickZoomMarker(null);
      setPositionPickTranslationMarker(null);
      return;
    }
  }

  function deleteSelectedTimelineNodes() {
    const adjustmentLayerIds = selectedAdjustmentLayers.length > 0 ? selectedAdjustmentLayers.map((selection) => selection.layerId) : selectedAdjustmentLayer ? [selectedAdjustmentLayer.id] : [];
    const transitionLayerIds = selectedTransitionLayers.length > 0 ? selectedTransitionLayers.map((selection) => selection.layerId) : selectedTransitionLayerId ? [selectedTransitionLayerId] : [];
    const compositionIds = selectedParts.length > 0 ? selectedParts.map((selection) => selection.partId) : selectedPartId && !selectedMotionMarker ? [selectedPartId] : [];
    const motionSelection = uniqueTimelineMarkerSelections(selectedMotionMarkers.length > 0 ? selectedMotionMarkers : selectedMotionMarker ? [selectedMotionMarker] : []);
    const hasSelection = adjustmentLayerIds.length > 0 || transitionLayerIds.length > 0 || compositionIds.length > 0 || motionSelection.length > 0;
    if (!hasSelection) return false;

    if (compositionIds.length > 0) deleteCompositionsFromTimeline(compositionIds);

    const adjustmentNodes = (scene.adjustmentLayers ?? []).filter((layer) => adjustmentLayerIds.includes(layer.id)).map((layer) => ({ absoluteStart: layer.start, layer }));
    if (adjustmentNodes.length > 0) deleteTimelineClipboardNodes({ kind: "adjustment", nodes: adjustmentNodes });

    const transitionNodes = (scene.transitionLayers ?? []).filter((layer) => transitionLayerIds.includes(layer.id)).map((layer) => ({ absoluteStart: layer.start, layer }));
    if (transitionNodes.length > 0) deleteTimelineClipboardNodes({ kind: "transition", nodes: transitionNodes });

    const motionNodes = motionSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getMotionMarkers(scene).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart ? getMotionMarkers(timelinePart).find((item) => item.id === selection.markerId) : undefined;
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start! + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (motionNodes.length > 0) deleteTimelineClipboardNodes({ kind: "motion", nodes: motionNodes });

    return true;
  }

  function copySelectedTimelineNodes(showToast = false) {
    const clipboard = getSelectedTimelineNodeClipboard(showToast);
    if (!clipboard) return false;
    timelineNodeClipboardRef.current = clipboard;
    return true;
  }

  function cutSelectedTimelineNodes() {
    const clipboard = getSelectedTimelineNodeClipboard(true);
    if (!clipboard) return false;

    timelineNodeClipboardRef.current = clipboard;
    deleteTimelineClipboardNodes(clipboard);

    toast.success(`${clipboard.nodes.length} timeline node${clipboard.nodes.length === 1 ? "" : "s"} cut`);
    return true;
  }

  function pasteTimelineNodes(targetStart?: number) {
    return pasteTimelineNodesAt(targetStart);
  }

  function pasteTimelineNodesAt(targetStart?: number, targetCompositionLayerId?: string) {
    const clipboard = timelineNodeClipboardRef.current;
    if (!clipboard) return false;

    const pasteStart = clamp(targetStart ?? currentSceneTimeRef.current, 0, sceneDurationSeconds);
    const sourceStart = Math.min(...clipboard.nodes.map((node) => node.absoluteStart));

    if (clipboard.kind === "composition") {
      const sourceLayerId = clipboard.nodes.at(0)?.part.layerId ?? "comp";
      const pastedParts = clipboard.nodes.map((node, index) => {
        const layerId = targetCompositionLayerId ?? node.part.layerId ?? "comp";
        const layerOffset = targetCompositionLayerId && (node.part.layerId ?? "comp") !== sourceLayerId ? 0 : node.absoluteStart - sourceStart;
        const id = pastedTimelineNodeId("clip", index);
        return { ...node.part, id, start: pasteStart + layerOffset, layerId, compositionId: node.part.compositionId ?? node.part.id };
      });

      const startShift = getCompositionPasteShift(pastedParts, timeline);

      const finalParts = pastedParts.map((part) => ({ ...part, start: roundToPrecision(Math.max((part.start ?? 0) + startShift, 0), timelinePrecision) }));
      updateSceneParts((parts) => [...parts, ...finalParts]);
      selectPart(finalParts.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "adjustment") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
        return { ...node.layer, id: pastedTimelineNodeId("adj", index), name: `${node.layer.name} copy`, start: roundToPrecision(start, timelinePrecision) };
      });
      updateSceneAdjustmentLayers((layers) => applyAdjustmentLayerOverwrite([...layers, ...pastedLayers], new Set(pastedLayers.map((layer) => layer.id))));
      selectAdjustmentLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "transition") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
        return { ...node.layer, id: pastedTimelineNodeId("trn", index), name: `${node.layer.name} copy`, start };
      });
      updateSceneTransitionLayers((layers) => {
        const startShift = getTransitionPasteShift(pastedLayers, layers);
        const finalLayers = pastedLayers.map((layer) => ({ ...layer, start: roundToPrecision(Math.max(layer.start + startShift, 0), timelinePrecision) }));
        return [...layers, ...finalLayers];
      });
      selectTransitionLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "motion") {
      const pastedSelections: MotionMarkerSelection[] = [];
      if (clipboard.nodes.every((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
        const pastedMarkers = clipboard.nodes.map((node, index) => ({ ...node.marker, id: pastedTimelineNodeId("mot", index), start: roundToPrecision(clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds), timelinePrecision) }));
        updateSceneMotionMarkers((markers) => applySceneMotionMarkerOverwrite([...markers, ...pastedMarkers], new Set(pastedMarkers.map((marker) => marker.id))));
        selectMotionMarkers(pastedMarkers.map((marker) => ({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id })));
        return true;
      }
      updateSceneParts((parts) => {
        const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
        const pastedSegments = clipboard.nodes.flatMap((node, index) => {
          const absoluteStart = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
          const marker = { ...node.marker, id: pastedTimelineNodeId("mot", index) };
          return placeMotionMarkerOnTimeline(marker, absoluteStart, timelineParts);
        });
        const insertedIds = new Set(pastedSegments.map((segment) => segment.marker.id));
        pastedSelections.push(...pastedSegments.map((segment) => ({ partId: segment.partId, markerId: segment.marker.id })));

        return parts.map((item) => {
          const itemSegments = pastedSegments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
          return itemSegments.length > 0 ? applyMotionMarkerOverwrite(item, [...getMotionMarkers(item), ...itemSegments], insertedIds) : item;
        });
      });
      if (pastedSelections.length === 0) return false;
      selectMotionMarkers(pastedSelections);
      return true;
    }
  }

  function pasteTimelineNodesSilently() {
    pasteTimelineNodesAt();
  }

  function openTimelineBlankContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineBlankContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const pasteStart = target.time;
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Paste", action: () => { pasteTimelineNodesAt(pasteStart, target.compositionLayerId); }, disabled: !timelineNodeClipboardRef.current },
      ],
    });
  }

  function openTimelineNodeContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const targetKey = target.kind === "motion" ? `${target.partId}:${target.markerId}` : target.kind === "adjustment" || target.kind === "transition" ? target.layerId : target.kind === "part" ? target.partId : "";
    const targetAlreadySelected = target.kind === "adjustment"
      ? selectedAdjustmentLayers.some((selection) => selection.layerId === target.layerId) || selectedAdjustmentLayerId === target.layerId
      : target.kind === "part"
        ? selectedParts.some((selection) => selection.partId === target.partId) || selectedPartId === target.partId
        : target.kind === "transition"
          ? selectedTransitionLayers.some((selection) => selection.layerId === target.layerId) || selectedTransitionLayerId === target.layerId
          : selectedMotionMarkers.some((selection) => `${selection.partId}:${selection.markerId}` === targetKey) || (selectedMotionMarker?.partId === (target as { partId: string }).partId && selectedMotionMarker?.markerId === (target as { markerId: string }).markerId);
    const menuClipboard = targetAlreadySelected ? getSelectedTimelineNodeClipboard() : getTimelineNodeClipboardForTarget(target);
    const targetPart = target.kind === "part" ? timeline.find((part) => part.id === target.partId) : null;
    const targetCompositionId = targetPart?.compositionId ?? targetPart?.id ?? "";
    const targetFileName = targetPart?.filePath.split("/").pop() || targetPart?.filePath || "";
    if (target.kind === "adjustment") selectAdjustmentLayer(target.layerId);
    if (target.kind === "transition") selectTransitionLayer(target.layerId);
    if (target.kind === "part" && !targetAlreadySelected) selectPart(target.partId);
    if (target.kind === "motion") selectMotionMarker(target.partId, target.markerId);
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Copy", action: () => {
          if (!menuClipboard) return;
          timelineNodeClipboardRef.current = menuClipboard;
        } },
        { label: "Cut", action: () => {
          if (!menuClipboard) return;
          timelineNodeClipboardRef.current = menuClipboard;
          deleteTimelineClipboardNodes(menuClipboard);
        } },
        { label: "Paste", action: () => { pasteTimelineNodesAt(target.time, target.compositionLayerId); }, disabled: !timelineNodeClipboardRef.current },
        { label: "Find media in project", action: () => { if (targetCompositionId && targetFileName) requestFileManagerFindMedia({ compositionId: targetCompositionId, fileName: targetFileName }); }, disabled: target.kind !== "part" || !targetPart?.sourceMissing },
        { label: "Delete", danger: true, action: () => {
          if (target.kind === "part") deleteCompositionsFromTimeline(targetAlreadySelected ? selectedParts.map((selection) => selection.partId) : [target.partId]);
          if (target.kind !== "part" && menuClipboard) deleteTimelineClipboardNodes(menuClipboard);
        } },
      ],
    });
  }

  return {
    copySelectedTimelineNodes,
    cutSelectedTimelineNodes,
    deleteSelectedTimelineNodes,
    openTimelineBlankContextMenu,
    openTimelineNodeContextMenu,
    pasteTimelineNodesSilently,
  };
}
