import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import toast from "react-hot-toast";
import { TIMELINE_MOTION_PART_ID, type ContextMenuState, type MotionMarkerSelection, type TimelineBlankContextTarget, type TimelineNodeContextTarget } from "../../types";
import { normalizeMendedZoomMarkerFocus } from "../../../core/markers";
import { clamp, roundTenth, roundTwo } from "../../../core/math";
import { getMotionMarkerViews } from "../../../core/motionEffects";
import { buildLinearTimeline } from "../../../core/timeline";
import type { AdjustmentLayer, MotionMarker, Part, TranslationMarker, ZoomMarker } from "../../../core/types";
import { applyAdjustmentLayerOverwrite, applyMotionMarkerOverwrite, applySceneMotionMarkerOverwrite, placeMotionMarkerOnTimeline, withMotionMarkers } from "./timelineMutationHelpers";
import type { SceneMotionMarkerUpdate } from "./useTimelineProjectActions";

export type TimelineNodeClipboard =
  | { kind: "adjustment"; nodes: Array<{ absoluteStart: number; layer: AdjustmentLayer }> }
  | { kind: "translation"; nodes: Array<{ absoluteStart: number; partId: string; marker: TranslationMarker }> }
  | { kind: "zoom"; nodes: Array<{ absoluteStart: number; partId: string; marker: ZoomMarker }> };

type SceneTimelineClipboardState = {
  id: string;
  name: string;
  adjustmentLayers?: AdjustmentLayer[];
  compositions: Part[];
  motionMarkers?: MotionMarker[];
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
  timeline: Part[];
  deleteCompositionsFromTimeline: (compositionIds: string[]) => void;
  selectAdjustmentLayer: (layerId: string) => void;
  selectPart: (partId: string) => void;
  selectMotionMarker: (partId: string, markerId: string) => void;
  selectMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  setAppContextMenu: (menu: ContextMenuState) => void;
  setFocusPickZoomMarker: (selection: MotionMarkerSelection | null) => void;
  setPositionPickTranslationMarker: (selection: MotionMarkerSelection | null) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectedMotionMarker: (selection: MotionMarkerSelection | null) => void;
  setSelectedMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  updateSceneAdjustmentLayers: (updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[]) => void;
  updateSceneMotionMarkers: (updater: (markers: { zoomMarkers: ZoomMarker[]; translationMarkers: TranslationMarker[] }) => SceneMotionMarkerUpdate) => void;
  updateSceneParts: (updater: (parts: Part[]) => Part[]) => void;
};

export function uniqueTimelineMarkerSelections<T extends { partId: string; markerId: string }>(selection: T[]) {
  return Array.from(new Map(selection.map((item) => [`${item.partId}:${item.markerId}`, item])).values());
}

function pastedTimelineNodeId(prefix: string, index: number) {
  return `${prefix}_${Date.now().toString(36)}_${index.toString(36)}`;
}

function getZoomMarkers(item: { motionMarkers?: MotionMarker[] }) {
  return getMotionMarkerViews(item).zoomMarkers;
}

function getTranslationMarkers(item: { motionMarkers?: MotionMarker[] }) {
  return getMotionMarkerViews(item).translationMarkers;
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
  timeline,
  deleteCompositionsFromTimeline,
  selectAdjustmentLayer,
  selectPart,
  selectMotionMarker,
  selectMotionMarkers,
  setAppContextMenu,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  updateSceneAdjustmentLayers,
  updateSceneMotionMarkers,
  updateSceneParts,
}: UseTimelineClipboardCommandsInput) {
  const timelineNodeClipboardRef = useRef<TimelineNodeClipboard | null>(null);

  function getSelectedTimelineNodeClipboard(showToast = false): TimelineNodeClipboard | null {
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
    const zoomSelection = motionSelection;
    const zoomNodes = zoomSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getZoomMarkers(scene).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart ? getZoomMarkers(timelinePart).find((item) => item.id === selection.markerId) : undefined;
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start! + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (zoomNodes.length > 0) return { kind: "zoom", nodes: zoomNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    const translationSelection = motionSelection;
    const translationNodes = translationSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getTranslationMarkers(scene).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart ? getTranslationMarkers(timelinePart).find((item) => item.id === selection.markerId) : undefined;
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start! + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (translationNodes.length > 0) return { kind: "translation", nodes: translationNodes.sort((a, b) => a.absoluteStart - b.absoluteStart) };

    if (showToast && (selectedPartId || selectedParts.length > 0)) toast.error("Compositions can't be copied.");
    return null;
  }

  function getTimelineNodeClipboardForTarget(target: TimelineNodeContextTarget): TimelineNodeClipboard | null {
    if (target.kind === "part") return null;

    if (target.kind === "adjustment") {
      const layer = scene.adjustmentLayers?.find((item) => item.id === target.layerId);
      return layer ? { kind: "adjustment", nodes: [{ absoluteStart: layer.start, layer }] } : null;
    }

    if (target.partId === TIMELINE_MOTION_PART_ID) {
      const zoomMarker = getZoomMarkers(scene).find((item) => item.id === target.markerId);
      if (zoomMarker) return { kind: "zoom", nodes: [{ absoluteStart: zoomMarker.start, partId: TIMELINE_MOTION_PART_ID, marker: zoomMarker }] };
      const translationMarker = getTranslationMarkers(scene).find((item) => item.id === target.markerId);
      return translationMarker ? { kind: "translation", nodes: [{ absoluteStart: translationMarker.start, partId: TIMELINE_MOTION_PART_ID, marker: translationMarker }] } : null;
    }

    const timelinePart = timeline.find((item) => item.id === target.partId);
    if (!timelinePart) return null;

    const zoomMarker = getZoomMarkers(timelinePart).find((item) => item.id === target.markerId);
    if (zoomMarker) return { kind: "zoom", nodes: [{ absoluteStart: timelinePart.start! + zoomMarker.start, partId: timelinePart.id, marker: zoomMarker }] };
    const translationMarker = getTranslationMarkers(timelinePart).find((item) => item.id === target.markerId);
    return translationMarker ? { kind: "translation", nodes: [{ absoluteStart: timelinePart.start! + translationMarker.start, partId: timelinePart.id, marker: translationMarker }] } : null;
  }

  function deleteTimelineClipboardNodes(clipboard: TimelineNodeClipboard) {
    if (clipboard.kind === "adjustment") {
      const layerIds = new Set(clipboard.nodes.map((node) => node.layer.id));
      updateSceneAdjustmentLayers((layers) => layers.filter((layer) => !layerIds.has(layer.id)));
      setSelectedAdjustmentLayerId(null);
      setSelectedAdjustmentLayers([]);
      return;
    }

    if (clipboard.kind === "zoom") {
      if (clipboard.nodes.some((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
        const markerIds = new Set(clipboard.nodes.map((node) => node.marker.id));
        updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers.filter((marker) => !markerIds.has(marker.id))), translationMarkers }));
        setSelectedMotionMarker(null);
        setSelectedMotionMarkers([]);
        setFocusPickZoomMarker(null);
        return;
      }
      const markerIdsByPart = new Map<string, Set<string>>();
      for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
      updateSceneParts((parts) => parts.map((item) => {
        const markerIds = markerIdsByPart.get(item.id);
        return markerIds ? withMotionMarkers(item, getZoomMarkers(item).filter((marker) => !markerIds.has(marker.id)), getTranslationMarkers(item)) : item;
      }));
      setSelectedMotionMarker(null);
      setSelectedMotionMarkers([]);
      setFocusPickZoomMarker(null);
      return;
    }

    if (clipboard.nodes.some((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
      const markerIds = new Set(clipboard.nodes.map((node) => node.marker.id));
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => ({ zoomMarkers, translationMarkers: translationMarkers.filter((marker) => !markerIds.has(marker.id)) }));
      setSelectedMotionMarker(null);
      setSelectedMotionMarkers([]);
      setPositionPickTranslationMarker(null);
      return;
    }

    const markerIdsByPart = new Map<string, Set<string>>();
    for (const node of clipboard.nodes) markerIdsByPart.set(node.partId, (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id));
    updateSceneParts((parts) => parts.map((item) => {
      const markerIds = markerIdsByPart.get(item.id);
      return markerIds ? withMotionMarkers(item, getZoomMarkers(item), getTranslationMarkers(item).filter((marker) => !markerIds.has(marker.id))) : item;
    }));
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function deleteSelectedTimelineNodes() {
    const adjustmentLayerIds = selectedAdjustmentLayers.length > 0 ? selectedAdjustmentLayers.map((selection) => selection.layerId) : selectedAdjustmentLayer ? [selectedAdjustmentLayer.id] : [];
    const compositionIds = selectedParts.length > 0 ? selectedParts.map((selection) => selection.partId) : selectedPartId && !selectedMotionMarker ? [selectedPartId] : [];
    const motionSelection = uniqueTimelineMarkerSelections(selectedMotionMarkers.length > 0 ? selectedMotionMarkers : selectedMotionMarker ? [selectedMotionMarker] : []);
    const zoomSelection = motionSelection;
    const translationSelection = motionSelection;
    const hasSelection = adjustmentLayerIds.length > 0 || compositionIds.length > 0 || zoomSelection.length > 0 || translationSelection.length > 0;
    if (!hasSelection) return false;

    if (compositionIds.length > 0) deleteCompositionsFromTimeline(compositionIds);

    const adjustmentNodes = (scene.adjustmentLayers ?? []).filter((layer) => adjustmentLayerIds.includes(layer.id)).map((layer) => ({ absoluteStart: layer.start, layer }));
    if (adjustmentNodes.length > 0) deleteTimelineClipboardNodes({ kind: "adjustment", nodes: adjustmentNodes });

    const zoomNodes = zoomSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getZoomMarkers(scene).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart ? getZoomMarkers(timelinePart).find((item) => item.id === selection.markerId) : undefined;
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start! + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (zoomNodes.length > 0) deleteTimelineClipboardNodes({ kind: "zoom", nodes: zoomNodes });

    const translationNodes = translationSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getTranslationMarkers(scene).find((item) => item.id === selection.markerId);
        return marker ? [{ absoluteStart: marker.start, partId: TIMELINE_MOTION_PART_ID, marker }] : [];
      }
      const timelinePart = timeline.find((item) => item.id === selection.partId);
      const marker = timelinePart ? getTranslationMarkers(timelinePart).find((item) => item.id === selection.markerId) : undefined;
      return timelinePart && marker ? [{ absoluteStart: timelinePart.start! + marker.start, partId: timelinePart.id, marker }] : [];
    });
    if (translationNodes.length > 0) deleteTimelineClipboardNodes({ kind: "translation", nodes: translationNodes });

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
    const clipboard = timelineNodeClipboardRef.current;
    if (!clipboard) return false;

    const pasteStart = clamp(targetStart ?? currentSceneTimeRef.current, 0, sceneDurationSeconds);
    const sourceStart = Math.min(...clipboard.nodes.map((node) => node.absoluteStart));

    if (clipboard.kind === "adjustment") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
        return { ...node.layer, id: pastedTimelineNodeId("adj", index), name: `${node.layer.name} copy`, start: roundTenth(start) };
      });
      updateSceneAdjustmentLayers((layers) => applyAdjustmentLayerOverwrite([...layers, ...pastedLayers], new Set(pastedLayers.map((layer) => layer.id))));
      selectAdjustmentLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "zoom") {
      const pastedSelections: MotionMarkerSelection[] = [];
      if (clipboard.nodes.every((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
        const pastedMarkers = clipboard.nodes.map((node, index) => ({ ...node.marker, id: pastedTimelineNodeId("zom", index), start: roundTwo(clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds)) }));
        updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite([...zoomMarkers, ...pastedMarkers], translationMarkers, new Set(pastedMarkers.map((marker) => marker.id))));
        selectMotionMarkers(pastedMarkers.map((marker) => ({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id })));
        return true;
      }
      updateSceneParts((parts) => {
        const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
        const pastedSegments = clipboard.nodes.flatMap((node, index) => {
          const absoluteStart = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
          const marker = { ...node.marker, id: pastedTimelineNodeId("zom", index) };
          return placeMotionMarkerOnTimeline(marker, absoluteStart, timelineParts);
        });
        const insertedIds = new Set(pastedSegments.map((segment) => segment.marker.id));
        pastedSelections.push(...pastedSegments.map((segment) => ({ partId: segment.partId, markerId: segment.marker.id })));

        return parts.map((item) => {
          const itemSegments = pastedSegments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
          return itemSegments.length > 0 ? applyMotionMarkerOverwrite(item, [...getZoomMarkers(item), ...itemSegments], getTranslationMarkers(item), insertedIds) : item;
        });
      });
      if (pastedSelections.length === 0) return false;
      selectMotionMarkers(pastedSelections);
      return true;
    }

    const pastedSelections: MotionMarkerSelection[] = [];
    if (clipboard.nodes.every((node) => node.partId === TIMELINE_MOTION_PART_ID)) {
      const pastedMarkers = clipboard.nodes.map((node, index) => ({ ...node.marker, id: pastedTimelineNodeId("trn", index), start: roundTwo(clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds)) }));
      updateSceneMotionMarkers(({ zoomMarkers, translationMarkers }) => applySceneMotionMarkerOverwrite(zoomMarkers, [...translationMarkers, ...pastedMarkers], new Set(pastedMarkers.map((marker) => marker.id))));
      selectMotionMarkers(pastedMarkers.map((marker) => ({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id })));
      return true;
    }
    updateSceneParts((parts) => {
      const timelineParts = buildLinearTimeline({ ...scene, compositions: parts });
      const pastedSegments = clipboard.nodes.flatMap((node, index) => {
        const absoluteStart = clamp(pasteStart + node.absoluteStart - sourceStart, 0, sceneDurationSeconds);
        const marker = { ...node.marker, id: pastedTimelineNodeId("trn", index) };
        return placeMotionMarkerOnTimeline(marker, absoluteStart, timelineParts);
      });
      const insertedIds = new Set(pastedSegments.map((segment) => segment.marker.id));
      pastedSelections.push(...pastedSegments.map((segment) => ({ partId: segment.partId, markerId: segment.marker.id })));

      return parts.map((item) => {
        const itemSegments = pastedSegments.filter((segment) => segment.partId === item.id).map((segment) => segment.marker);
        return itemSegments.length > 0 ? applyMotionMarkerOverwrite(item, getZoomMarkers(item), [...getTranslationMarkers(item), ...itemSegments], insertedIds) : item;
      });
    });
    if (pastedSelections.length === 0) return false;
    selectMotionMarkers(pastedSelections);
    return true;
  }

  function pasteTimelineNodesSilently() {
    pasteTimelineNodes();
  }

  function openTimelineBlankContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineBlankContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const pasteStart = target.time;
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Paste", action: () => { pasteTimelineNodes(pasteStart); }, disabled: !timelineNodeClipboardRef.current },
      ],
    });
  }

  function openTimelineNodeContextMenu(event: ReactMouseEvent<HTMLElement>, target: TimelineNodeContextTarget) {
    event.preventDefault();
    event.stopPropagation();
    const targetKey = `${"partId" in target ? target.partId : ""}:${"markerId" in target ? target.markerId : "layerId" in target ? target.layerId : ""}`;
    const targetAlreadySelected = target.kind === "adjustment"
      ? selectedAdjustmentLayers.some((selection) => selection.layerId === target.layerId) || selectedAdjustmentLayerId === target.layerId
      : target.kind === "part"
        ? selectedParts.some((selection) => selection.partId === target.partId) || selectedPartId === target.partId
        : selectedMotionMarkers.some((selection) => `${selection.partId}:${selection.markerId}` === targetKey) || (selectedMotionMarker?.partId === target.partId && selectedMotionMarker.markerId === target.markerId);
    const menuClipboard = targetAlreadySelected ? getSelectedTimelineNodeClipboard() : getTimelineNodeClipboardForTarget(target);
    if (target.kind === "adjustment") selectAdjustmentLayer(target.layerId);
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
          toast.success(`${menuClipboard.nodes.length} timeline node${menuClipboard.nodes.length === 1 ? "" : "s"} cut`);
        } },
        { label: "Paste", action: () => { pasteTimelineNodes(target.time); }, disabled: !timelineNodeClipboardRef.current },
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
