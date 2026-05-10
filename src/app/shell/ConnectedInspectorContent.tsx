import { useCallback, useRef } from "react";
import { AgentPanel } from "../../components/AgentPanel";
import {
  AdjustmentInspector,
  GraphNodeInspector,
  EmptyInspector,
  FrameInspector,
  MotionInspector,
  ObjectInspector,
  TransitionInspector,
} from "../../components/inspector/InspectorPanels";
import type { AdjustmentEffectPointControl } from "../../core/effects/types";
import type {
  AdjustmentLayer,
  BackgroundLayer,
  CompositionRenderMode,
  FrameObject,
  MotionEase,
  MotionMarker,
  Part,
  PartFrame,
  Point,
  TransitionLayer,
} from "../../core/types";
import type { RightPanelTab } from "../types";

type MarkerPick = { partId: string; markerId: string } | null;
type PointPickAdjustment = {
  layerId: string;
  control: AdjustmentEffectPointControl;
} | null;

type ConnectedInspectorContentProps = {
  rightPanelTab: RightPanelTab;
  part: Part;
  projectDirectory?: string;
  composeMode: boolean;
  sourceStatus: string;
  agentContext: unknown;
  selectedMotion: MotionMarker | null | undefined;
  selectedMotionPart: Part | null | undefined;
  selectedMotionMarkerCount: number;
  selectedMotionSnapInActive: boolean;
  selectedMotionSnapOutActive: boolean;
  selectedMotionPartMiddleSnapActive: boolean;
  selectedMotionPartMiddleEase: MotionEase | undefined;
  selectedMotionPartMiddleTransitionMode: "instant" | "transition";
  focusPickMotionMarker: MarkerPick;
  canSnapMotionMiddle: boolean;
  canSnapAdjustmentMiddle: boolean;
  canSnapCompositionMiddle: boolean;
  positionPickMotionMarker: MarkerPick;
  trackerPickMotionMarker: MarkerPick;
  selectedObject: FrameObject | null | undefined;
  selectedGraphObject: FrameObject | null | undefined;
  isPlaying: boolean;
  selectedAdjustmentLayer: AdjustmentLayer | null | undefined;
  selectedTransitionLayer: TransitionLayer | null | undefined;
  sceneDurationSeconds: number;
  pointPickAdjustment: PointPickAdjustment;
  selectedPart: Part | null | undefined;
  selectedGraphNodeId: string | null;
  onUpdateMotionMarker: (
    partId: string,
    markerId: string,
    updater: (marker: MotionMarker, part: Part) => MotionMarker,
  ) => void;
  onPreviewMotionMarker: (
    partId: string,
    markerId: string,
    updater: (marker: MotionMarker) => MotionMarker,
  ) => void;
  onPreviewMotionPickPoint: (point: Point | null) => void;
  onMotionPreviewScrubStart: () => void;
  onMotionPreviewScrubEnd: () => void;
  onClearMotionPreview: () => void;
  onUpdateMotionMarkerFocusGroup: (
    partId: string,
    markerId: string,
    focus: Point,
  ) => void;
  onUpdateSelectedMotionSnap: (
    key: "snapIn" | "snapOut",
    enabled: boolean,
  ) => void;
  onUpdateMotionMiddleTransition: (
    part: Part,
    mode: "instant" | "transition",
  ) => void;
  onUpdateMotionMiddleEase: (part: Part, ease: MotionEase | undefined) => void;
  onDeleteMotionMarker: (partId: string, markerId: string) => void;
  onStartMotionFocusPick: (partId: string, markerId: string) => void;
  onStartMotionPositionPick: (partId: string, markerId: string) => void;
  onStartMotionTrackerPick: (partId: string, markerId: string) => void;
  onSnapMotionMiddle: (part: Part) => void;
  onSnapAdjustmentMiddle: () => void;
  onSnapCompositionMiddle: () => void;
  onUpdateSelectedObject: (
    updater: (object: FrameObject) => FrameObject,
  ) => void;
  onPreviewSelectedObject: (
    updater: (object: FrameObject) => FrameObject,
  ) => void;
  onUpdateAdjustmentLayer: (
    layerId: string,
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) => void;
  onPreviewAdjustmentLayer: (
    layerId: string,
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) => void;
  onClearAdjustmentPreview: () => void;
  onDeleteAdjustmentLayer: (layerId: string) => void;
  onUpdateTransitionLayer: (
    layerId: string,
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) => void;
  onPreviewTransitionLayer: (
    layerId: string,
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) => void;
  onClearTransitionPreview: () => void;
  onDeleteTransitionLayer: (layerId: string) => void;
  onStartAdjustmentPointPick: (
    layerId: string,
    control: AdjustmentEffectPointControl,
  ) => void;
  onUpdateSelectedPartDuration: (duration: number) => void;
  onUpdatePartFrame: (updater: (frame: PartFrame) => PartFrame) => void;
  onUpdatePartBackground: (
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) => void;
  onPreviewPartFrame: (updater: (frame: PartFrame) => PartFrame) => void;
  onPreviewPartBackground: (
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) => void;
  onUpdatePartRenderMode: (renderMode: CompositionRenderMode) => void;
  onUpdateGraphNodeParameter: (
    nodeId: string,
    key: string,
    value: string,
    options?: {
      history?: boolean;
      mode?: import("../../core/graphSockets").GraphCompositionMode;
    },
  ) => void;
  onReloadProject?: () => Promise<void>;
};

export function ConnectedInspectorContent({
  rightPanelTab,
  part,
  projectDirectory,
  composeMode,
  sourceStatus,
  agentContext,
  selectedMotion,
  selectedMotionPart,
  selectedMotionMarkerCount,
  selectedMotionSnapInActive,
  selectedMotionSnapOutActive,
  selectedMotionPartMiddleSnapActive,
  selectedMotionPartMiddleEase,
  selectedMotionPartMiddleTransitionMode,
  focusPickMotionMarker,
  canSnapMotionMiddle,
  canSnapAdjustmentMiddle,
  canSnapCompositionMiddle,
  positionPickMotionMarker,
  trackerPickMotionMarker,
  selectedObject,
  selectedGraphObject,
  isPlaying,
  selectedAdjustmentLayer,
  selectedTransitionLayer,
  sceneDurationSeconds,
  pointPickAdjustment,
  selectedPart,
  selectedGraphNodeId,
  onUpdateMotionMarker,
  onPreviewMotionMarker,
  onPreviewMotionPickPoint,
  onMotionPreviewScrubStart,
  onMotionPreviewScrubEnd,
  onClearMotionPreview,
  onUpdateMotionMarkerFocusGroup,
  onUpdateSelectedMotionSnap,
  onUpdateMotionMiddleTransition,
  onUpdateMotionMiddleEase,
  onDeleteMotionMarker,
  onStartMotionFocusPick,
  onStartMotionPositionPick,
  onStartMotionTrackerPick,
  onSnapMotionMiddle,
  onSnapAdjustmentMiddle,
  onSnapCompositionMiddle,
  onUpdateSelectedObject,
  onPreviewSelectedObject,
  onUpdateAdjustmentLayer,
  onPreviewAdjustmentLayer,
  onClearAdjustmentPreview,
  onDeleteAdjustmentLayer,
  onUpdateTransitionLayer,
  onPreviewTransitionLayer,
  onClearTransitionPreview,
  onDeleteTransitionLayer,
  onStartAdjustmentPointPick,
  onUpdateSelectedPartDuration,
  onUpdatePartBackground,
  onUpdatePartRenderMode,
  onUpdateGraphNodeParameter,
  onReloadProject,
}: ConnectedInspectorContentProps) {
  const stableSelectedObjectRef = useRef<FrameObject | null | undefined>(
    selectedObject,
  );
  const updateSelectedObjectRef = useRef(onUpdateSelectedObject);
  const previewSelectedObjectRef = useRef(onPreviewSelectedObject);
  if (!isPlaying) stableSelectedObjectRef.current = selectedObject;
  updateSelectedObjectRef.current = onUpdateSelectedObject;
  previewSelectedObjectRef.current = onPreviewSelectedObject;
  const inspectorSelectedObject = isPlaying
    ? stableSelectedObjectRef.current
    : selectedObject;
  const stableUpdateSelectedObject = useCallback(
    (updater: (object: FrameObject) => FrameObject) =>
      updateSelectedObjectRef.current(updater),
    [],
  );
  const stablePreviewSelectedObject = useCallback(
    (updater: (object: FrameObject) => FrameObject) =>
      previewSelectedObjectRef.current(updater),
    [],
  );

  if (rightPanelTab === "agent")
    return (
      <AgentPanel
        part={part}
        projectDirectory={projectDirectory}
        sourceStatus={sourceStatus}
        agentContext={agentContext}
        onReloadProject={onReloadProject}
      />
    );

  if (selectedMotion && selectedMotionPart) {
    return (
      <MotionInspector
        marker={selectedMotion}
        part={selectedMotionPart}
        selectedMarkerCount={selectedMotionMarkerCount}
        selectedSnapInActive={selectedMotionSnapInActive}
        selectedSnapOutActive={selectedMotionSnapOutActive}
        middleSnapActive={selectedMotionPartMiddleSnapActive}
        middleEase={selectedMotionPartMiddleEase}
        middleTransitionMode={selectedMotionPartMiddleTransitionMode}
        pickingFocus={
          focusPickMotionMarker?.partId === selectedMotionPart.id &&
          focusPickMotionMarker.markerId === selectedMotion.id
        }
        pickingPosition={
          positionPickMotionMarker?.partId === selectedMotionPart.id &&
          positionPickMotionMarker.markerId === selectedMotion.id
        }
        pickingTracker={
          trackerPickMotionMarker?.partId === selectedMotionPart.id &&
          trackerPickMotionMarker.markerId === selectedMotion.id
        }
        canSnapMiddle={canSnapMotionMiddle}
        onChange={(updater) =>
          onUpdateMotionMarker(
            selectedMotionPart.id,
            selectedMotion.id,
            updater,
          )
        }
        onPreviewMarker={(updater) =>
          onPreviewMotionMarker(
            selectedMotionPart.id,
            selectedMotion.id,
            updater,
          )
        }
        onPreviewPickPoint={onPreviewMotionPickPoint}
        onPreviewScrubStart={onMotionPreviewScrubStart}
        onPreviewScrubEnd={onMotionPreviewScrubEnd}
        onClearPreview={onClearMotionPreview}
        onChangeFocus={(focus) =>
          onUpdateMotionMarkerFocusGroup(
            selectedMotionPart.id,
            selectedMotion.id,
            focus,
          )
        }
        onChangeSelectedSnap={onUpdateSelectedMotionSnap}
        onChangeMiddleTransition={(mode) =>
          onUpdateMotionMiddleTransition(selectedMotionPart, mode)
        }
        onChangeMiddleEase={(ease) =>
          onUpdateMotionMiddleEase(selectedMotionPart, ease)
        }
        onDelete={() =>
          onDeleteMotionMarker(selectedMotionPart.id, selectedMotion.id)
        }
        onPickFocus={() =>
          onStartMotionFocusPick(selectedMotionPart.id, selectedMotion.id)
        }
        onPickPosition={() =>
          onStartMotionPositionPick(selectedMotionPart.id, selectedMotion.id)
        }
        onPickTracker={() =>
          onStartMotionTrackerPick(selectedMotionPart.id, selectedMotion.id)
        }
        onSnapMiddle={() => onSnapMotionMiddle(selectedMotionPart)}
      />
    );
  }

  if (composeMode && selectedGraphNodeId)
    return (
      <GraphNodeInspector
        part={part}
        selectedObject={selectedGraphObject ?? null}
        nodeId={selectedGraphNodeId}
        onParameterChange={onUpdateGraphNodeParameter}
      />
    );

  if (inspectorSelectedObject)
    return (
      <ObjectInspector
        object={inspectorSelectedObject}
        onChange={stableUpdateSelectedObject}
        onPreview={stablePreviewSelectedObject}
      />
    );

  if (selectedTransitionLayer) {
    return (
      <TransitionInspector
        layer={selectedTransitionLayer}
        onChange={(updater) =>
          onUpdateTransitionLayer(selectedTransitionLayer.id, updater)
        }
        onPreviewLayer={(updater) =>
          onPreviewTransitionLayer(selectedTransitionLayer.id, updater)
        }
        onClearPreview={onClearTransitionPreview}
        onDelete={() => onDeleteTransitionLayer(selectedTransitionLayer.id)}
      />
    );
  }

  if (selectedAdjustmentLayer) {
    return (
      <AdjustmentInspector
        layer={selectedAdjustmentLayer}
        sceneDuration={sceneDurationSeconds}
        pickingPointKey={
          pointPickAdjustment?.layerId === selectedAdjustmentLayer.id
            ? `${pointPickAdjustment.control.xKey}:${pointPickAdjustment.control.yKey}`
            : null
        }
        canSnapMiddle={canSnapAdjustmentMiddle}
        onChange={(updater) =>
          onUpdateAdjustmentLayer(selectedAdjustmentLayer.id, updater)
        }
        onPreviewLayer={(updater) =>
          onPreviewAdjustmentLayer(selectedAdjustmentLayer.id, updater)
        }
        onClearPreview={onClearAdjustmentPreview}
        onDelete={() => onDeleteAdjustmentLayer(selectedAdjustmentLayer.id)}
        onPickPoint={(control) =>
          onStartAdjustmentPointPick(selectedAdjustmentLayer.id, control)
        }
        onSnapMiddle={onSnapAdjustmentMiddle}
      />
    );
  }

  if (selectedPart)
    return (
      <FrameInspector
        part={selectedPart}
        canSnapMiddle={canSnapCompositionMiddle}
        onDurationChange={onUpdateSelectedPartDuration}
        onBackgroundChange={onUpdatePartBackground}
        onRenderModeChange={onUpdatePartRenderMode}
        onSnapMiddle={onSnapCompositionMiddle}
      />
    );

  return <EmptyInspector />;
}
