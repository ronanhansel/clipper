import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import toast from "react-hot-toast";
import {
  TIMELINE_MOTION_PART_ID,
  type ContextMenuState,
  type MotionMarkerSelection,
  type TimelineBlankContextTarget,
  type TimelineNodeContextTarget,
} from "../../types";
import { clamp, roundToPrecision } from "../../../core/math";
import { getEffectPackage } from "../../../core/effects/registry";
import { getMotionMarkerViews } from "../../../core/motionEffects";
import { buildLinearTimeline } from "../../../core/timeline";
import type {
  AdjustmentLayer,
  MotionMarker,
  Part,
  TransitionLayer,
} from "../../../core/types";
import { requestFileManagerFindMedia } from "../../../lib/fileManagerEvents";
import {
  applyAdjustmentLayerOverwrite,
  applyMotionMarkerOverwrite,
  applySceneMotionMarkerOverwrite,
  placeMotionMarkerOnTimeline,
  withMotionMarkers,
} from "./timelineMutationHelpers";
import type { SceneMotionMarkerUpdate } from "./useTimelineProjectActions";

export type TimelineNodeClipboard =
  | {
      kind: "adjustment";
      nodes: Array<{ absoluteStart: number; layer: AdjustmentLayer }>;
    }
  | { kind: "composition"; nodes: Array<{ absoluteStart: number; part: Part }> }
  | {
      kind: "motion";
      nodes: Array<{
        absoluteStart: number;
        partId: string;
        marker: MotionMarker;
      }>;
    }
  | {
      kind: "transition";
      nodes: Array<{ absoluteStart: number; layer: TransitionLayer }>;
    }
  | { kind: "mixed"; nodes: TimelineClipboardNode[] };

type TimelineClipboardNode =
  | { kind: "adjustment"; absoluteStart: number; layer: AdjustmentLayer }
  | { kind: "composition"; absoluteStart: number; part: Part }
  | {
      kind: "motion";
      absoluteStart: number;
      partId: string;
      marker: MotionMarker;
    }
  | { kind: "transition"; absoluteStart: number; layer: TransitionLayer };

type SceneTimelineClipboardState = {
  id: string;
  adjustmentLayers?: AdjustmentLayer[];
  compositions: Part[];
  motionMarkers?: MotionMarker[];
  transitionLayers?: TransitionLayer[];
};

type TimelineMaskClipboard = {
  enabled: boolean;
  preview: boolean;
  invert: boolean;
  shape: "circular" | "ellipsoid";
  focusX: number;
  focusY: number;
  radius: number;
  radiusX: number;
  radiusY: number;
  feather: number;
};

type AdjustmentMaskParamKeys = {
  enabled: string;
  preview: string;
  invert: string;
  shape: string;
  focusX: string;
  focusY: string;
  radius: string;
  radiusX: string;
  radiusY: string;
  feather: string;
};

const adjustmentMaskParamKeysByEffectId: Record<
  string,
  AdjustmentMaskParamKeys
> = {
  "clipper.adjustment.filmEmulation": {
    enabled: "useMask",
    preview: "maskPreview",
    invert: "maskInvert",
    shape: "maskShape",
    focusX: "maskFocusX",
    focusY: "maskFocusY",
    radius: "maskRadius",
    radiusX: "maskRadiusX",
    radiusY: "maskRadiusY",
    feather: "maskFeather",
  },
  "clipper.adjustment.lens": {
    enabled: "chromaticAberrationUseMask",
    preview: "chromaticAberrationMaskPreview",
    invert: "chromaticAberrationMaskInvert",
    shape: "chromaticAberrationMaskShape",
    focusX: "chromaticAberrationMaskFocusX",
    focusY: "chromaticAberrationMaskFocusY",
    radius: "chromaticAberrationMaskRadius",
    radiusX: "chromaticAberrationMaskRadiusX",
    radiusY: "chromaticAberrationMaskRadiusY",
    feather: "chromaticAberrationMaskFeather",
  },
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
  openCompositionInEditor: (compositionId: string) => void;
  prerenderComposition?: (compositionId: string) => void | Promise<void>;
  selectAdjustmentLayer: (layerId: string) => void;
  selectPart: (partId: string) => void;
  selectMotionMarker: (partId: string, markerId: string) => void;
  selectMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  selectTransitionLayer: (layerId: string) => void;
  setAppContextMenu: (menu: ContextMenuState) => void;
  setFocusPickZoomMarker: (selection: MotionMarkerSelection | null) => void;
  setPositionPickTranslationMarker: (
    selection: MotionMarkerSelection | null,
  ) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectedMotionMarker: (selection: MotionMarkerSelection | null) => void;
  setSelectedMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  setSelectedParts: (selection: Array<{ partId: string }>) => void;
  setSelectedTransitionLayerId: (id: string | null) => void;
  setSelectedTransitionLayers: (selection: Array<{ layerId: string }>) => void;
  timelinePrecision: number;
  updateSceneAdjustmentLayers: (
    updater: (layers: AdjustmentLayer[]) => AdjustmentLayer[],
  ) => void;
  updateSceneMotionMarkers: (
    updater: (markers: MotionMarker[]) => SceneMotionMarkerUpdate,
  ) => void;
  updateSceneParts: (updater: (parts: Part[]) => Part[]) => void;
  updateSceneTransitionLayers: (
    updater: (layers: TransitionLayer[]) => TransitionLayer[],
  ) => void;
};

export function uniqueTimelineMarkerSelections<
  T extends { partId: string; markerId: string },
>(selection: T[]) {
  return Array.from(
    new Map(
      selection.map((item) => [`${item.partId}:${item.markerId}`, item]),
    ).values(),
  );
}

function pastedTimelineNodeId(prefix: string, index: number) {
  return `${prefix}_${Date.now().toString(36)}_${index.toString(36)}`;
}

function getMotionMarkers(item: { motionMarkers?: MotionMarker[] }) {
  return getMotionMarkerViews(item).motionMarkers;
}

function getAdjustmentMaskParamKeys(
  layer: Pick<AdjustmentLayer, "effect"> | null | undefined,
) {
  if (!layer) return null;
  return adjustmentMaskParamKeysByEffectId[layer.effect.effectId] ?? null;
}

function getAdjustmentMaskClipboard(
  layer: Pick<AdjustmentLayer, "effect"> | null | undefined,
): TimelineMaskClipboard | null {
  const keys = getAdjustmentMaskParamKeys(layer);
  if (!keys || !layer) return null;
  const params = layer.effect.params ?? {};
  return {
    enabled: Boolean(params[keys.enabled]),
    preview: Boolean(params[keys.preview]),
    invert: Boolean(params[keys.invert]),
    shape: params[keys.shape] === "ellipsoid" ? "ellipsoid" : "circular",
    focusX: finiteMaskNumber(params[keys.focusX], 50),
    focusY: finiteMaskNumber(params[keys.focusY], 50),
    radius: finiteMaskNumber(params[keys.radius], 200),
    radiusX: finiteMaskNumber(params[keys.radiusX], 200),
    radiusY: finiteMaskNumber(params[keys.radiusY], 200),
    feather: finiteMaskNumber(params[keys.feather], 20),
  };
}

function applyAdjustmentMaskClipboard(
  layer: AdjustmentLayer,
  clipboard: TimelineMaskClipboard,
): AdjustmentLayer {
  const keys = getAdjustmentMaskParamKeys(layer);
  if (!keys) return layer;
  return {
    ...layer,
    effect: {
      ...layer.effect,
      params: {
        ...layer.effect.params,
        [keys.enabled]: clipboard.enabled,
        [keys.preview]: clipboard.preview,
        [keys.invert]: clipboard.invert,
        [keys.shape]: clipboard.shape,
        [keys.focusX]: clipboard.focusX,
        [keys.focusY]: clipboard.focusY,
        [keys.radius]: clipboard.radius,
        [keys.radiusX]: clipboard.radiusX,
        [keys.radiusY]: clipboard.radiusY,
        [keys.feather]: clipboard.feather,
      },
    },
  };
}

function finiteMaskNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function applyAdjustmentSettings(
  source: AdjustmentLayer,
  target: AdjustmentLayer,
): AdjustmentLayer {
  return {
    ...source,
    id: target.id,
    layerId: target.layerId,
    start: target.start,
    duration: target.duration,
    mendInId: target.mendInId,
    mendOutId: target.mendOutId,
    snapIn: target.snapIn,
    snapOut: target.snapOut,
  };
}

function applyTransitionSettings(
  source: TransitionLayer,
  target: TransitionLayer,
): TransitionLayer {
  return {
    ...source,
    id: target.id,
    layerId: target.layerId,
    start: target.start,
    duration: target.duration,
    mendInId: target.mendInId,
    mendOutId: target.mendOutId,
    snapIn: target.snapIn,
    snapOut: target.snapOut,
  };
}

function applyMotionSettings(
  source: MotionMarker,
  target: MotionMarker,
): MotionMarker {
  return {
    ...source,
    id: target.id,
    layerId: target.layerId,
    start: target.start,
    duration: target.duration,
    mendInId: target.mendInId,
    mendOutId: target.mendOutId,
    snapIn: target.snapIn,
    snapOut: target.snapOut,
  };
}

function getCompositionPasteShift(pastedParts: Part[], existingParts: Part[]) {
  let shift = 0;
  const maxAttempts = Math.max(
    1,
    pastedParts.length * existingParts.length + 1,
  );
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
        nextShift =
          nextShift === null
            ? candidateShift
            : Math.min(nextShift, candidateShift);
      }
    }
    if (nextShift === null) return shift;
    shift = nextShift;
  }
  return shift;
}

function getTransitionPasteShift(
  pastedLayers: TransitionLayer[],
  existingLayers: TransitionLayer[],
) {
  let shift = 0;
  const maxAttempts = Math.max(
    1,
    pastedLayers.length * existingLayers.length + 1,
  );
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let nextShift: number | null = null;
    for (const pastedLayer of pastedLayers) {
      if (
        !getEffectPackage(pastedLayer.effect.effectId)?.tags?.includes(
          "blocksOverlap",
        )
      )
        continue;
      const rowKey = pastedLayer.layerId ?? pastedLayer.effect.effectId;
      const start = pastedLayer.start + shift;
      const end = start + pastedLayer.duration;
      for (const existingLayer of existingLayers) {
        if ((existingLayer.layerId ?? existingLayer.effect.effectId) !== rowKey)
          continue;
        const existingEnd = existingLayer.start + existingLayer.duration;
        if (!(start < existingEnd && end > existingLayer.start)) continue;
        const candidateShift = existingEnd - pastedLayer.start;
        if (candidateShift <= shift) continue;
        nextShift =
          nextShift === null
            ? candidateShift
            : Math.min(nextShift, candidateShift);
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
  openCompositionInEditor,
  prerenderComposition,
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
  setSelectedParts,
  setSelectedTransitionLayerId,
  setSelectedTransitionLayers,
  timelinePrecision,
  updateSceneAdjustmentLayers,
  updateSceneMotionMarkers,
  updateSceneParts,
  updateSceneTransitionLayers,
}: UseTimelineClipboardCommandsInput) {
  const timelineNodeClipboardRef = useRef<TimelineNodeClipboard | null>(null);
  const timelineMaskClipboardRef = useRef<TimelineMaskClipboard | null>(null);

  function getSelectedTimelineNodeClipboard(
    showToast = false,
  ): TimelineNodeClipboard | null {
    const selectedPartIds = new Set(
      selectedParts.map((selection) => selection.partId),
    );
    const compositionNodes = selectedParts.flatMap((selection) => {
      const part = timeline.find((item) => item.id === selection.partId);
      return part
        ? [
            {
              kind: "composition" as const,
              absoluteStart: part.start ?? 0,
              part,
            },
          ]
        : [];
    });
    if (
      compositionNodes.length === 0 &&
      selectedPartId &&
      !selectedMotionMarker &&
      selectedMotionMarkers.length === 0 &&
      selectedAdjustmentLayers.length === 0 &&
      selectedTransitionLayers.length === 0
    ) {
      const part = timeline.find((item) => item.id === selectedPartId);
      if (part)
        compositionNodes.push({
          kind: "composition",
          absoluteStart: part.start ?? 0,
          part,
        });
    }

    const transitionNodes = selectedTransitionLayers.flatMap((selection) => {
      const layer = scene.transitionLayers?.find(
        (item) => item.id === selection.layerId,
      );
      return layer
        ? [{ kind: "transition" as const, absoluteStart: layer.start, layer }]
        : [];
    });
    if (
      transitionNodes.length === 0 &&
      selectedTransitionLayerId &&
      compositionNodes.length === 0 &&
      selectedMotionMarkers.length === 0 &&
      selectedAdjustmentLayers.length === 0
    ) {
      const layer = scene.transitionLayers?.find(
        (item) => item.id === selectedTransitionLayerId,
      );
      if (layer)
        transitionNodes.push({
          kind: "transition",
          absoluteStart: layer.start,
          layer,
        });
    }

    const adjustmentNodes = selectedAdjustmentLayers.flatMap((selection) => {
      const layer = scene.adjustmentLayers?.find(
        (item) => item.id === selection.layerId,
      );
      return layer
        ? [{ kind: "adjustment" as const, absoluteStart: layer.start, layer }]
        : [];
    });
    if (
      adjustmentNodes.length === 0 &&
      selectedAdjustmentLayer &&
      compositionNodes.length === 0 &&
      selectedMotionMarkers.length === 0 &&
      transitionNodes.length === 0
    )
      adjustmentNodes.push({
        kind: "adjustment",
        absoluteStart: selectedAdjustmentLayer.start,
        layer: selectedAdjustmentLayer,
      });

    const motionSelection = uniqueTimelineMarkerSelections(
      selectedMotionMarkers.length > 0
        ? selectedMotionMarkers
        : selectedMotionMarker
          ? [selectedMotionMarker]
          : [],
    );
    const motionNodes = motionSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getMotionMarkers(scene).find(
          (item) => item.id === selection.markerId,
        );
        return marker
          ? [
              {
                kind: "motion" as const,
                absoluteStart: marker.start,
                partId: TIMELINE_MOTION_PART_ID,
                marker,
              },
            ]
          : [];
      }
      if (selectedPartIds.has(selection.partId)) return [];
      const timelinePart = timeline.find(
        (item) => item.id === selection.partId,
      );
      const marker = timelinePart
        ? getMotionMarkers(timelinePart).find(
            (item) => item.id === selection.markerId,
          )
        : undefined;
      return timelinePart && marker
        ? [
            {
              kind: "motion" as const,
              absoluteStart: timelinePart.start! + marker.start,
              partId: timelinePart.id,
              marker,
            },
          ]
        : [];
    });

    const nodes: TimelineClipboardNode[] = [
      ...compositionNodes,
      ...transitionNodes,
      ...adjustmentNodes,
      ...motionNodes,
    ].sort((a, b) => a.absoluteStart - b.absoluteStart);
    const kinds = new Set(nodes.map((node) => node.kind));
    if (kinds.size > 1) return { kind: "mixed", nodes };
    if (kinds.has("composition"))
      return {
        kind: "composition",
        nodes: compositionNodes.map(({ absoluteStart, part }) => ({
          absoluteStart,
          part,
        })),
      };
    if (kinds.has("transition"))
      return {
        kind: "transition",
        nodes: transitionNodes.map(({ absoluteStart, layer }) => ({
          absoluteStart,
          layer,
        })),
      };
    if (kinds.has("adjustment"))
      return {
        kind: "adjustment",
        nodes: adjustmentNodes.map(({ absoluteStart, layer }) => ({
          absoluteStart,
          layer,
        })),
      };
    if (kinds.has("motion"))
      return {
        kind: "motion",
        nodes: motionNodes.map(({ absoluteStart, partId, marker }) => ({
          absoluteStart,
          partId,
          marker,
        })),
      };

    if (showToast && (selectedPartId || selectedParts.length > 0))
      toast.error("No copyable timeline nodes selected.");
    return null;
  }

  function getTimelineNodeClipboardForTarget(
    target: TimelineNodeContextTarget,
  ): TimelineNodeClipboard | null {
    if (target.kind === "part") {
      const part = timeline.find((item) => item.id === target.partId);
      return part
        ? {
            kind: "composition",
            nodes: [{ absoluteStart: part.start ?? 0, part }],
          }
        : null;
    }

    if (target.kind === "adjustment") {
      const layer = scene.adjustmentLayers?.find(
        (item) => item.id === target.layerId,
      );
      return layer
        ? { kind: "adjustment", nodes: [{ absoluteStart: layer.start, layer }] }
        : null;
    }

    if (target.kind === "transition") {
      const layer = scene.transitionLayers?.find(
        (item) => item.id === target.layerId,
      );
      return layer
        ? { kind: "transition", nodes: [{ absoluteStart: layer.start, layer }] }
        : null;
    }

    if (target.kind !== "motion") return null;

    if (target.partId === TIMELINE_MOTION_PART_ID) {
      const motionMarker = getMotionMarkers(scene).find(
        (item) => item.id === target.markerId,
      );
      return motionMarker
        ? {
            kind: "motion",
            nodes: [
              {
                absoluteStart: motionMarker.start,
                partId: TIMELINE_MOTION_PART_ID,
                marker: motionMarker,
              },
            ],
          }
        : null;
    }

    const timelinePart = timeline.find((item) => item.id === target.partId);
    if (!timelinePart) return null;

    const motionMarker = getMotionMarkers(timelinePart).find(
      (item) => item.id === target.markerId,
    );
    return motionMarker
      ? {
          kind: "motion",
          nodes: [
            {
              absoluteStart: timelinePart.start! + motionMarker.start,
              partId: timelinePart.id,
              marker: motionMarker,
            },
          ],
        }
      : null;
  }

  function deleteTimelineClipboardNodes(clipboard: TimelineNodeClipboard) {
    if (clipboard.kind === "mixed") {
      const compositionNodes = clipboard.nodes
        .filter(
          (
            node,
          ): node is Extract<TimelineClipboardNode, { kind: "composition" }> =>
            node.kind === "composition",
        )
        .map(({ absoluteStart, part }) => ({ absoluteStart, part }));
      const adjustmentNodes = clipboard.nodes
        .filter(
          (
            node,
          ): node is Extract<TimelineClipboardNode, { kind: "adjustment" }> =>
            node.kind === "adjustment",
        )
        .map(({ absoluteStart, layer }) => ({ absoluteStart, layer }));
      const transitionNodes = clipboard.nodes
        .filter(
          (
            node,
          ): node is Extract<TimelineClipboardNode, { kind: "transition" }> =>
            node.kind === "transition",
        )
        .map(({ absoluteStart, layer }) => ({ absoluteStart, layer }));
      const motionNodes = clipboard.nodes
        .filter(
          (node): node is Extract<TimelineClipboardNode, { kind: "motion" }> =>
            node.kind === "motion",
        )
        .map(({ absoluteStart, partId, marker }) => ({
          absoluteStart,
          partId,
          marker,
        }));
      if (compositionNodes.length > 0)
        deleteTimelineClipboardNodes({
          kind: "composition",
          nodes: compositionNodes,
        });
      if (adjustmentNodes.length > 0)
        deleteTimelineClipboardNodes({
          kind: "adjustment",
          nodes: adjustmentNodes,
        });
      if (transitionNodes.length > 0)
        deleteTimelineClipboardNodes({
          kind: "transition",
          nodes: transitionNodes,
        });
      if (motionNodes.length > 0)
        deleteTimelineClipboardNodes({ kind: "motion", nodes: motionNodes });
      return;
    }

    if (clipboard.kind === "composition") {
      deleteCompositionsFromTimeline(
        clipboard.nodes.map((node) => node.part.id),
      );
      return;
    }

    if (clipboard.kind === "adjustment") {
      const layerIds = new Set(clipboard.nodes.map((node) => node.layer.id));
      updateSceneAdjustmentLayers((layers) =>
        layers.filter((layer) => !layerIds.has(layer.id)),
      );
      setSelectedAdjustmentLayerId(null);
      setSelectedAdjustmentLayers([]);
      return;
    }

    if (clipboard.kind === "transition") {
      const layerIds = new Set(clipboard.nodes.map((node) => node.layer.id));
      updateSceneTransitionLayers((layers) =>
        layers.filter((layer) => !layerIds.has(layer.id)),
      );
      setSelectedTransitionLayerId(null);
      setSelectedTransitionLayers([]);
      return;
    }

    if (clipboard.kind === "motion") {
      if (
        clipboard.nodes.some((node) => node.partId === TIMELINE_MOTION_PART_ID)
      ) {
        const markerIds = new Set(
          clipboard.nodes.map((node) => node.marker.id),
        );
        updateSceneMotionMarkers((markers) => ({
          motionMarkers: markers.filter((marker) => !markerIds.has(marker.id)),
        }));
        setSelectedMotionMarker(null);
        setSelectedMotionMarkers([]);
        setFocusPickZoomMarker(null);
        setPositionPickTranslationMarker(null);
        return;
      }
      const markerIdsByPart = new Map<string, Set<string>>();
      for (const node of clipboard.nodes)
        markerIdsByPart.set(
          node.partId,
          (markerIdsByPart.get(node.partId) ?? new Set()).add(node.marker.id),
        );
      updateSceneParts((parts) =>
        parts.map((item) => {
          const markerIds = markerIdsByPart.get(item.id);
          return markerIds
            ? withMotionMarkers(
                item,
                getMotionMarkers(item).filter(
                  (marker) => !markerIds.has(marker.id),
                ),
              )
            : item;
        }),
      );
      setSelectedMotionMarker(null);
      setSelectedMotionMarkers([]);
      setFocusPickZoomMarker(null);
      setPositionPickTranslationMarker(null);
      return;
    }
  }

  function deleteSelectedTimelineNodes() {
    const adjustmentLayerIds =
      selectedAdjustmentLayers.length > 0
        ? selectedAdjustmentLayers.map((selection) => selection.layerId)
        : selectedAdjustmentLayer
          ? [selectedAdjustmentLayer.id]
          : [];
    const transitionLayerIds =
      selectedTransitionLayers.length > 0
        ? selectedTransitionLayers.map((selection) => selection.layerId)
        : selectedTransitionLayerId
          ? [selectedTransitionLayerId]
          : [];
    const compositionIds =
      selectedParts.length > 0
        ? selectedParts.map((selection) => selection.partId)
        : selectedPartId && !selectedMotionMarker
          ? [selectedPartId]
          : [];
    const motionSelection = uniqueTimelineMarkerSelections(
      selectedMotionMarkers.length > 0
        ? selectedMotionMarkers
        : selectedMotionMarker
          ? [selectedMotionMarker]
          : [],
    );
    const hasSelection =
      adjustmentLayerIds.length > 0 ||
      transitionLayerIds.length > 0 ||
      compositionIds.length > 0 ||
      motionSelection.length > 0;
    if (!hasSelection) return false;

    if (compositionIds.length > 0)
      deleteCompositionsFromTimeline(compositionIds);

    const adjustmentNodes = (scene.adjustmentLayers ?? [])
      .filter((layer) => adjustmentLayerIds.includes(layer.id))
      .map((layer) => ({ absoluteStart: layer.start, layer }));
    if (adjustmentNodes.length > 0)
      deleteTimelineClipboardNodes({
        kind: "adjustment",
        nodes: adjustmentNodes,
      });

    const transitionNodes = (scene.transitionLayers ?? [])
      .filter((layer) => transitionLayerIds.includes(layer.id))
      .map((layer) => ({ absoluteStart: layer.start, layer }));
    if (transitionNodes.length > 0)
      deleteTimelineClipboardNodes({
        kind: "transition",
        nodes: transitionNodes,
      });

    const motionNodes = motionSelection.flatMap((selection) => {
      if (selection.partId === TIMELINE_MOTION_PART_ID) {
        const marker = getMotionMarkers(scene).find(
          (item) => item.id === selection.markerId,
        );
        return marker
          ? [
              {
                absoluteStart: marker.start,
                partId: TIMELINE_MOTION_PART_ID,
                marker,
              },
            ]
          : [];
      }
      const timelinePart = timeline.find(
        (item) => item.id === selection.partId,
      );
      const marker = timelinePart
        ? getMotionMarkers(timelinePart).find(
            (item) => item.id === selection.markerId,
          )
        : undefined;
      return timelinePart && marker
        ? [
            {
              absoluteStart: timelinePart.start! + marker.start,
              partId: timelinePart.id,
              marker,
            },
          ]
        : [];
    });
    if (motionNodes.length > 0)
      deleteTimelineClipboardNodes({ kind: "motion", nodes: motionNodes });

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

    toast.success(
      `${clipboard.nodes.length} timeline node${clipboard.nodes.length === 1 ? "" : "s"} cut`,
    );
    return true;
  }

  function pasteTimelineNodes(targetStart?: number) {
    return pasteTimelineNodesAt(targetStart);
  }

  function pasteTimelineNodesAt(
    targetStart?: number,
    targetCompositionLayerId?: string,
  ) {
    const clipboard = timelineNodeClipboardRef.current;
    if (!clipboard) return false;

    const pasteStart = clamp(
      targetStart ?? currentSceneTimeRef.current,
      0,
      sceneDurationSeconds,
    );
    const sourceStart = Math.min(
      ...clipboard.nodes.map((node) => node.absoluteStart),
    );

    if (clipboard.kind === "mixed") {
      const compositionNodes = clipboard.nodes.filter(
        (
          node,
        ): node is Extract<TimelineClipboardNode, { kind: "composition" }> =>
          node.kind === "composition",
      );
      const adjustmentNodes = clipboard.nodes.filter(
        (
          node,
        ): node is Extract<TimelineClipboardNode, { kind: "adjustment" }> =>
          node.kind === "adjustment",
      );
      const transitionNodes = clipboard.nodes.filter(
        (
          node,
        ): node is Extract<TimelineClipboardNode, { kind: "transition" }> =>
          node.kind === "transition",
      );
      const motionNodes = clipboard.nodes.filter(
        (node): node is Extract<TimelineClipboardNode, { kind: "motion" }> =>
          node.kind === "motion",
      );
      const pastedParts = compositionNodes.map((node, index) => ({
        ...node.part,
        id: pastedTimelineNodeId("clip", index),
        start: pasteStart + node.absoluteStart - sourceStart,
        layerId: targetCompositionLayerId ?? node.part.layerId ?? "comp",
        compositionId: node.part.compositionId ?? node.part.id,
      }));
      const sharedShift =
        pastedParts.length > 0
          ? getCompositionPasteShift(pastedParts, timeline)
          : 0;
      const shiftedPasteStart = pasteStart + sharedShift;
      const finalParts = pastedParts.map((part) => ({
        ...part,
        start: roundToPrecision(
          Math.max((part.start ?? 0) + sharedShift, 0),
          timelinePrecision,
        ),
      }));
      const pastedSelections: MotionMarkerSelection[] = [];

      if (adjustmentNodes.length > 0) {
        const pastedLayers = adjustmentNodes.map((node, index) => ({
          ...node.layer,
          id: pastedTimelineNodeId("adj", index),
          start: roundToPrecision(
            clamp(
              shiftedPasteStart + node.absoluteStart - sourceStart,
              0,
              sceneDurationSeconds,
            ),
            timelinePrecision,
          ),
        }));
        updateSceneAdjustmentLayers((layers) =>
          applyAdjustmentLayerOverwrite(
            [...layers, ...pastedLayers],
            new Set(pastedLayers.map((layer) => layer.id)),
          ),
        );
        setSelectedAdjustmentLayers(
          pastedLayers.map((layer) => ({ layerId: layer.id })),
        );
        setSelectedAdjustmentLayerId(pastedLayers.at(-1)?.id ?? null);
      }

      if (transitionNodes.length > 0) {
        const pastedLayers = transitionNodes.map((node, index) => ({
          ...node.layer,
          id: pastedTimelineNodeId("trn", index),
          start: roundToPrecision(
            clamp(
              shiftedPasteStart + node.absoluteStart - sourceStart,
              0,
              sceneDurationSeconds,
            ),
            timelinePrecision,
          ),
        }));
        updateSceneTransitionLayers((layers) => [...layers, ...pastedLayers]);
        setSelectedTransitionLayers(
          pastedLayers.map((layer) => ({ layerId: layer.id })),
        );
        setSelectedTransitionLayerId(pastedLayers.at(-1)?.id ?? null);
      }

      const sceneMotionNodes = motionNodes.filter(
        (node) => node.partId === TIMELINE_MOTION_PART_ID,
      );
      if (sceneMotionNodes.length > 0) {
        const pastedMarkers = sceneMotionNodes.map((node, index) => ({
          ...node.marker,
          id: pastedTimelineNodeId("mot", index),
          start: roundToPrecision(
            clamp(
              shiftedPasteStart + node.absoluteStart - sourceStart,
              0,
              sceneDurationSeconds,
            ),
            timelinePrecision,
          ),
        }));
        updateSceneMotionMarkers((markers) =>
          applySceneMotionMarkerOverwrite(
            [...markers, ...pastedMarkers],
            new Set(pastedMarkers.map((marker) => marker.id)),
          ),
        );
        pastedSelections.push(
          ...pastedMarkers.map((marker) => ({
            partId: TIMELINE_MOTION_PART_ID,
            markerId: marker.id,
          })),
        );
      }

      const partMotionNodes = motionNodes.filter(
        (node) => node.partId !== TIMELINE_MOTION_PART_ID,
      );
      updateSceneParts((parts) => {
        const nextParts = [...parts, ...finalParts];
        if (partMotionNodes.length === 0) return nextParts;
        const timelineParts = buildLinearTimeline({
          ...scene,
          compositions: nextParts,
        });
        const pastedSegments = partMotionNodes.flatMap((node, index) => {
          const absoluteStart = clamp(
            shiftedPasteStart + node.absoluteStart - sourceStart,
            0,
            sceneDurationSeconds,
          );
          const marker = {
            ...node.marker,
            id: pastedTimelineNodeId("mot", index + sceneMotionNodes.length),
          };
          return placeMotionMarkerOnTimeline(
            marker,
            absoluteStart,
            timelineParts,
          );
        });
        const insertedIds = new Set(
          pastedSegments.map((segment) => segment.marker.id),
        );
        pastedSelections.push(
          ...pastedSegments.map((segment) => ({
            partId: segment.partId,
            markerId: segment.marker.id,
          })),
        );
        return nextParts.map((item) => {
          const itemSegments = pastedSegments
            .filter((segment) => segment.partId === item.id)
            .map((segment) => segment.marker);
          return itemSegments.length > 0
            ? applyMotionMarkerOverwrite(
                item,
                [...getMotionMarkers(item), ...itemSegments],
                insertedIds,
              )
            : item;
        });
      });

      setSelectedParts(finalParts.map((part) => ({ partId: part.id })));
      setSelectedMotionMarkers(pastedSelections);
      setSelectedMotionMarker(pastedSelections.at(-1) ?? null);
      setFocusPickZoomMarker(null);
      setPositionPickTranslationMarker(null);
      return (
        finalParts.length > 0 ||
        adjustmentNodes.length > 0 ||
        transitionNodes.length > 0 ||
        motionNodes.length > 0
      );
    }

    if (clipboard.kind === "composition") {
      const pastedParts = clipboard.nodes.map((node, index) => {
        const layerId = targetCompositionLayerId ?? node.part.layerId ?? "comp";
        const layerOffset = node.absoluteStart - sourceStart;
        const id = pastedTimelineNodeId("clip", index);
        return {
          ...node.part,
          id,
          start: pasteStart + layerOffset,
          layerId,
          compositionId: node.part.compositionId ?? node.part.id,
        };
      });

      const startShift = getCompositionPasteShift(pastedParts, timeline);

      const finalParts = pastedParts.map((part) => ({
        ...part,
        start: roundToPrecision(
          Math.max((part.start ?? 0) + startShift, 0),
          timelinePrecision,
        ),
      }));
      updateSceneParts((parts) => [...parts, ...finalParts]);
      selectPart(finalParts.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "adjustment") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(
          pasteStart + node.absoluteStart - sourceStart,
          0,
          sceneDurationSeconds,
        );
        return {
          ...node.layer,
          id: pastedTimelineNodeId("adj", index),
          start: roundToPrecision(start, timelinePrecision),
        };
      });
      updateSceneAdjustmentLayers((layers) =>
        applyAdjustmentLayerOverwrite(
          [...layers, ...pastedLayers],
          new Set(pastedLayers.map((layer) => layer.id)),
        ),
      );
      selectAdjustmentLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "transition") {
      const pastedLayers = clipboard.nodes.map((node, index) => {
        const start = clamp(
          pasteStart + node.absoluteStart - sourceStart,
          0,
          sceneDurationSeconds,
        );
        return {
          ...node.layer,
          id: pastedTimelineNodeId("trn", index),
          start,
        };
      });
      updateSceneTransitionLayers((layers) => {
        const startShift = getTransitionPasteShift(pastedLayers, layers);
        const finalLayers = pastedLayers.map((layer) => ({
          ...layer,
          start: roundToPrecision(
            Math.max(layer.start + startShift, 0),
            timelinePrecision,
          ),
        }));
        return [...layers, ...finalLayers];
      });
      selectTransitionLayer(pastedLayers.at(-1)?.id ?? "");
      return true;
    }

    if (clipboard.kind === "motion") {
      const pastedSelections: MotionMarkerSelection[] = [];
      if (
        clipboard.nodes.every((node) => node.partId === TIMELINE_MOTION_PART_ID)
      ) {
        const pastedMarkers = clipboard.nodes.map((node, index) => ({
          ...node.marker,
          id: pastedTimelineNodeId("mot", index),
          start: roundToPrecision(
            clamp(
              pasteStart + node.absoluteStart - sourceStart,
              0,
              sceneDurationSeconds,
            ),
            timelinePrecision,
          ),
        }));
        updateSceneMotionMarkers((markers) =>
          applySceneMotionMarkerOverwrite(
            [...markers, ...pastedMarkers],
            new Set(pastedMarkers.map((marker) => marker.id)),
          ),
        );
        selectMotionMarkers(
          pastedMarkers.map((marker) => ({
            partId: TIMELINE_MOTION_PART_ID,
            markerId: marker.id,
          })),
        );
        return true;
      }
      updateSceneParts((parts) => {
        const timelineParts = buildLinearTimeline({
          ...scene,
          compositions: parts,
        });
        const pastedSegments = clipboard.nodes.flatMap((node, index) => {
          const absoluteStart = clamp(
            pasteStart + node.absoluteStart - sourceStart,
            0,
            sceneDurationSeconds,
          );
          const marker = {
            ...node.marker,
            id: pastedTimelineNodeId("mot", index),
          };
          return placeMotionMarkerOnTimeline(
            marker,
            absoluteStart,
            timelineParts,
          );
        });
        const insertedIds = new Set(
          pastedSegments.map((segment) => segment.marker.id),
        );
        pastedSelections.push(
          ...pastedSegments.map((segment) => ({
            partId: segment.partId,
            markerId: segment.marker.id,
          })),
        );

        return parts.map((item) => {
          const itemSegments = pastedSegments
            .filter((segment) => segment.partId === item.id)
            .map((segment) => segment.marker);
          return itemSegments.length > 0
            ? applyMotionMarkerOverwrite(
                item,
                [...getMotionMarkers(item), ...itemSegments],
                insertedIds,
              )
            : item;
        });
      });
      if (pastedSelections.length === 0) return false;
      selectMotionMarkers(pastedSelections);
      return true;
    }
  }

  function pasteTimelineAttributes() {
    const clipboard = timelineNodeClipboardRef.current;
    if (!clipboard) return false;

    if (clipboard.nodes.length === 1 && clipboard.kind === "adjustment") {
      const sourceLayer = clipboard.nodes[0].layer;
      const targetIds =
        selectedAdjustmentLayers.length > 0
          ? selectedAdjustmentLayers.map((selection) => selection.layerId)
          : selectedAdjustmentLayerId
            ? [selectedAdjustmentLayerId]
            : [];
      const targetIdSet = new Set(targetIds);
      const matchingTargetIds = new Set(
        (scene.adjustmentLayers ?? [])
          .filter(
            (layer) =>
              targetIdSet.has(layer.id) &&
              layer.effect.effectId === sourceLayer.effect.effectId,
          )
          .map((layer) => layer.id),
      );
      if (matchingTargetIds.size > 0) {
        updateSceneAdjustmentLayers((layers) =>
          layers.map((layer) =>
            matchingTargetIds.has(layer.id)
              ? applyAdjustmentSettings(sourceLayer, layer)
              : layer,
          ),
        );
        return true;
      }
    }

    if (clipboard.nodes.length === 1 && clipboard.kind === "transition") {
      const sourceLayer = clipboard.nodes[0].layer;
      const targetIds =
        selectedTransitionLayers.length > 0
          ? selectedTransitionLayers.map((selection) => selection.layerId)
          : selectedTransitionLayerId
            ? [selectedTransitionLayerId]
            : [];
      const targetIdSet = new Set(targetIds);
      const matchingTargetIds = new Set(
        (scene.transitionLayers ?? [])
          .filter(
            (layer) =>
              targetIdSet.has(layer.id) &&
              layer.effect.effectId === sourceLayer.effect.effectId,
          )
          .map((layer) => layer.id),
      );
      if (matchingTargetIds.size > 0) {
        updateSceneTransitionLayers((layers) =>
          layers.map((layer) =>
            matchingTargetIds.has(layer.id)
              ? applyTransitionSettings(sourceLayer, layer)
              : layer,
          ),
        );
        return true;
      }
    }

    if (clipboard.nodes.length === 1 && clipboard.kind === "motion") {
      const sourceMarker = clipboard.nodes[0].marker;
      const motionSelection = uniqueTimelineMarkerSelections(
        selectedMotionMarkers.length > 0
          ? selectedMotionMarkers
          : selectedMotionMarker
            ? [selectedMotionMarker]
            : [],
      );
      const timelineMotionTargetIds = new Set<string>();
      const compositionTargetIdsByPart = new Map<string, Set<string>>();

      for (const selection of motionSelection) {
        if (selection.partId === TIMELINE_MOTION_PART_ID) {
          const targetMarker = getMotionMarkers(scene).find(
            (marker) => marker.id === selection.markerId,
          );
          if (targetMarker?.effectId === sourceMarker.effectId)
            timelineMotionTargetIds.add(selection.markerId);
          continue;
        }
        const targetPart = timeline.find(
          (part) => part.id === selection.partId,
        );
        const targetMarker = targetPart
          ? getMotionMarkers(targetPart).find(
              (marker) => marker.id === selection.markerId,
            )
          : undefined;
        if (targetMarker?.effectId === sourceMarker.effectId)
          compositionTargetIdsByPart.set(
            selection.partId,
            (compositionTargetIdsByPart.get(selection.partId) ?? new Set()).add(
              selection.markerId,
            ),
          );
      }

      if (
        timelineMotionTargetIds.size > 0 ||
        compositionTargetIdsByPart.size > 0
      ) {
        if (timelineMotionTargetIds.size > 0) {
          updateSceneMotionMarkers((markers) => ({
            motionMarkers: markers.map((marker) =>
              timelineMotionTargetIds.has(marker.id)
                ? applyMotionSettings(sourceMarker, marker)
                : marker,
            ),
          }));
        }
        if (compositionTargetIdsByPart.size > 0) {
          updateSceneParts((parts) =>
            parts.map((item) => {
              const targetIds = compositionTargetIdsByPart.get(item.id);
              return targetIds
                ? withMotionMarkers(
                    item,
                    getMotionMarkers(item).map((marker) =>
                      targetIds.has(marker.id)
                        ? applyMotionSettings(sourceMarker, marker)
                        : marker,
                    ),
                  )
                : item;
            }),
          );
        }
        return true;
      }
    }

    return false;
  }

  function pasteTimelineMask(targetLayerId: string | null) {
    const clipboard = timelineMaskClipboardRef.current;
    if (!clipboard || !targetLayerId) return false;
    const targetLayer = (scene.adjustmentLayers ?? []).find(
      (layer) => layer.id === targetLayerId,
    );
    if (!getAdjustmentMaskParamKeys(targetLayer)) return false;
    updateSceneAdjustmentLayers((layers) =>
      layers.map((layer) =>
        layer.id === targetLayerId
          ? applyAdjustmentMaskClipboard(layer, clipboard)
          : layer,
      ),
    );
    return true;
  }

  function pasteTimelineNodesSilently() {
    pasteTimelineNodesAt();
  }

  function pasteTimelineAttributesSilently() {
    pasteTimelineAttributes();
  }

  function openTimelineBlankContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    target: TimelineBlankContextTarget,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const pasteStart = target.time;
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: "Paste",
          action: () => {
            pasteTimelineNodesAt(pasteStart, target.compositionLayerId);
          },
          disabled: !timelineNodeClipboardRef.current,
        },
        {
          label: "Paste Attributes",
          action: () => {
            pasteTimelineAttributes();
          },
          disabled: !timelineNodeClipboardRef.current,
        },
      ],
    });
  }

  function openTimelineNodeContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    target: TimelineNodeContextTarget,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const targetKey =
      target.kind === "motion"
        ? `${target.partId}:${target.markerId}`
        : target.kind === "adjustment" || target.kind === "transition"
          ? target.layerId
          : target.kind === "part"
            ? target.partId
            : "";
    const targetAlreadySelected =
      target.kind === "adjustment"
        ? selectedAdjustmentLayers.some(
            (selection) => selection.layerId === target.layerId,
          ) || selectedAdjustmentLayerId === target.layerId
        : target.kind === "part"
          ? selectedParts.some(
              (selection) => selection.partId === target.partId,
            ) || selectedPartId === target.partId
          : target.kind === "transition"
            ? selectedTransitionLayers.some(
                (selection) => selection.layerId === target.layerId,
              ) || selectedTransitionLayerId === target.layerId
            : selectedMotionMarkers.some(
                (selection) =>
                  `${selection.partId}:${selection.markerId}` === targetKey,
              ) ||
              (selectedMotionMarker?.partId ===
                (target as { partId: string }).partId &&
                selectedMotionMarker?.markerId ===
                  (target as { markerId: string }).markerId);
    const menuClipboard = targetAlreadySelected
      ? getSelectedTimelineNodeClipboard()
      : getTimelineNodeClipboardForTarget(target);
    const targetAdjustmentLayer =
      target.kind === "adjustment"
        ? (scene.adjustmentLayers ?? []).find(
            (layer) => layer.id === target.layerId,
          )
        : null;
    const menuMaskClipboard = getAdjustmentMaskClipboard(targetAdjustmentLayer);
    const hasCopiedMask = Boolean(timelineMaskClipboardRef.current);
    const targetSupportsMask = Boolean(
      getAdjustmentMaskParamKeys(targetAdjustmentLayer),
    );
    const copyItem = {
      label: "Copy",
      action: () => {
        if (!menuClipboard) return;
        timelineNodeClipboardRef.current = menuClipboard;
      },
    };
    const copyMaskItem = {
      label: "Copy Mask",
      action: () => {
        if (!menuMaskClipboard) return;
        timelineMaskClipboardRef.current = menuMaskClipboard;
      },
      disabled: !menuMaskClipboard,
    };
    const pasteItem = {
      label: "Paste",
      action: () => {
        pasteTimelineNodesAt(target.time, target.compositionLayerId);
      },
      disabled: !timelineNodeClipboardRef.current,
    };
    const pasteMaskItem = {
      label: "Paste Mask",
      action: () => {
        pasteTimelineMask(targetAdjustmentLayer?.id ?? null);
      },
      disabled: !hasCopiedMask || !targetSupportsMask,
    };
    const targetPart =
      target.kind === "part"
        ? timeline.find((part) => part.id === target.partId)
        : null;
    const targetCompositionId =
      targetPart?.compositionId ?? targetPart?.id ?? "";
    const targetFileName =
      targetPart?.filePath.split("/").pop() || targetPart?.filePath || "";
    if (target.kind === "adjustment") selectAdjustmentLayer(target.layerId);
    if (target.kind === "transition") selectTransitionLayer(target.layerId);
    if (target.kind === "part" && !targetAlreadySelected)
      selectPart(target.partId);
    if (target.kind === "motion")
      selectMotionMarker(target.partId, target.markerId);
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        menuMaskClipboard
          ? { label: "Copy", children: [copyItem, copyMaskItem] }
          : copyItem,
        {
          label: "Cut",
          action: () => {
            if (!menuClipboard) return;
            timelineNodeClipboardRef.current = menuClipboard;
            deleteTimelineClipboardNodes(menuClipboard);
          },
        },
        hasCopiedMask
          ? { label: "Paste", children: [pasteItem, pasteMaskItem] }
          : pasteItem,
        {
          label: "Paste Attributes",
          action: () => {
            pasteTimelineAttributes();
          },
          disabled: !timelineNodeClipboardRef.current,
        },
        {
          label: "Open in editor",
          action: () => {
            if (targetCompositionId)
              openCompositionInEditor(targetCompositionId);
          },
          disabled: target.kind !== "part" || !targetCompositionId,
        },
        {
          label: targetPart?.prerender ? "Unmark prerender" : "Mark prerender",
          action: () => {
            if (target.kind === "part") prerenderComposition?.(target.partId);
          },
          disabled:
            target.kind !== "part" ||
            !targetCompositionId ||
            !prerenderComposition,
        },
        {
          label: "Find media in project",
          action: () => {
            if (targetCompositionId && targetFileName)
              requestFileManagerFindMedia({
                compositionId: targetCompositionId,
                fileName: targetFileName,
              });
          },
          disabled: target.kind !== "part" || !targetPart?.sourceMissing,
        },
        {
          label: "Delete",
          danger: true,
          action: () => {
            if (target.kind === "part")
              deleteCompositionsFromTimeline(
                targetAlreadySelected
                  ? selectedParts.map((selection) => selection.partId)
                  : [target.partId],
              );
            if (target.kind !== "part" && menuClipboard)
              deleteTimelineClipboardNodes(menuClipboard);
          },
        },
      ],
    });
  }

  return {
    copySelectedTimelineNodes,
    cutSelectedTimelineNodes,
    deleteSelectedTimelineNodes,
    openTimelineBlankContextMenu,
    openTimelineNodeContextMenu,
    pasteTimelineAttributesSilently,
    pasteTimelineNodesSilently,
  };
}
