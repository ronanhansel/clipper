import { AgentPanel } from "../../components/AgentPanel";
import { AdjustmentInspector, ChartInspector, EmptyInspector, FrameInspector, MotionInspector, ObjectInspector } from "../../components/inspector/InspectorPanels";
import type { AdjustmentEffectPointControl } from "../../core/effects/types";
import type { AdjustmentLayer, BackgroundLayer, FrameObject, MotionEase, MotionMarker, Part, PartFrame, Point } from "../../core/types";
import type { RightPanelTab } from "../types";

type MarkerPick = { partId: string; markerId: string } | null;
type PointPickAdjustment = { layerId: string; control: AdjustmentEffectPointControl } | null;

type ConnectedInspectorContentProps = {
  rightPanelTab: RightPanelTab;
  part: Part;
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
  selectedAdjustmentLayer: AdjustmentLayer | null | undefined;
  sceneDurationSeconds: number;
  pointPickAdjustment: PointPickAdjustment;
  selectedPart: Part | null | undefined;
  onUpdateMotionMarker: (partId: string, markerId: string, updater: (marker: MotionMarker, part: Part) => MotionMarker) => void;
  onPreviewMotionScale: (partId: string, markerId: string, scale: number) => void;
  onClearMotionScalePreview: () => void;
  onUpdateMotionMarkerFocusGroup: (partId: string, markerId: string, focus: Point) => void;
  onUpdateSelectedMotionSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void;
  onUpdateMotionMiddleTransition: (part: Part, mode: "instant" | "transition") => void;
  onUpdateMotionMiddleEase: (part: Part, ease: MotionEase | undefined) => void;
  onDeleteMotionMarker: (partId: string, markerId: string) => void;
  onStartMotionFocusPick: (partId: string, markerId: string) => void;
  onStartMotionPositionPick: (partId: string, markerId: string) => void;
  onStartMotionTrackerPick: (partId: string, markerId: string) => void;
  onSnapMotionMiddle: (part: Part) => void;
  onSnapAdjustmentMiddle: () => void;
  onSnapCompositionMiddle: () => void;
  onUpdateSelectedObject: (updater: (object: FrameObject) => FrameObject) => void;
  onUpdateAdjustmentLayer: (layerId: string, updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void;
  onDeleteAdjustmentLayer: (layerId: string) => void;
  onStartAdjustmentPointPick: (layerId: string, control: AdjustmentEffectPointControl) => void;
  onUpdateSelectedPartDuration: (duration: number) => void;
  onUpdatePartFrame: (updater: (frame: PartFrame) => PartFrame) => void;
  onUpdatePartBackground: (updater: (background: BackgroundLayer) => BackgroundLayer) => void;
};

export function ConnectedInspectorContent({
  rightPanelTab,
  part,
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
  selectedAdjustmentLayer,
  sceneDurationSeconds,
  pointPickAdjustment,
  selectedPart,
  onUpdateMotionMarker,
  onPreviewMotionScale,
  onClearMotionScalePreview,
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
  onUpdateAdjustmentLayer,
  onDeleteAdjustmentLayer,
  onStartAdjustmentPointPick,
  onUpdateSelectedPartDuration,
  onUpdatePartFrame,
  onUpdatePartBackground,
}: ConnectedInspectorContentProps) {
  if (rightPanelTab === "agent") return <AgentPanel part={part} sourceStatus={sourceStatus} agentContext={agentContext} />;

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
        pickingFocus={focusPickMotionMarker?.partId === selectedMotionPart.id && focusPickMotionMarker.markerId === selectedMotion.id}
        pickingPosition={positionPickMotionMarker?.partId === selectedMotionPart.id && positionPickMotionMarker.markerId === selectedMotion.id}
        pickingTracker={trackerPickMotionMarker?.partId === selectedMotionPart.id && trackerPickMotionMarker.markerId === selectedMotion.id}
        canSnapMiddle={canSnapMotionMiddle}
        onChange={(updater) => onUpdateMotionMarker(selectedMotionPart.id, selectedMotion.id, updater)}
        onScalePreview={(scale) => onPreviewMotionScale(selectedMotionPart.id, selectedMotion.id, scale)}
        onScalePreviewEnd={onClearMotionScalePreview}
        onChangeFocus={(focus) => onUpdateMotionMarkerFocusGroup(selectedMotionPart.id, selectedMotion.id, focus)}
        onChangeSelectedSnap={onUpdateSelectedMotionSnap}
        onChangeMiddleTransition={(mode) => onUpdateMotionMiddleTransition(selectedMotionPart, mode)}
        onChangeMiddleEase={(ease) => onUpdateMotionMiddleEase(selectedMotionPart, ease)}
        onDelete={() => onDeleteMotionMarker(selectedMotionPart.id, selectedMotion.id)}
        onPickFocus={() => onStartMotionFocusPick(selectedMotionPart.id, selectedMotion.id)}
        onPickPosition={() => onStartMotionPositionPick(selectedMotionPart.id, selectedMotion.id)}
        onPickTracker={() => onStartMotionTrackerPick(selectedMotionPart.id, selectedMotion.id)}
        onSnapMiddle={() => onSnapMotionMiddle(selectedMotionPart)}
      />
    );
  }

  if (selectedObject?.type === "chart" && selectedObject.chart) return <ChartInspector object={selectedObject} onChange={onUpdateSelectedObject} />;
  if (selectedObject) return <ObjectInspector object={selectedObject} onChange={onUpdateSelectedObject} />;

  if (selectedAdjustmentLayer) {
    return (
      <AdjustmentInspector
        layer={selectedAdjustmentLayer}
        sceneDuration={sceneDurationSeconds}
        pickingPointKey={pointPickAdjustment?.layerId === selectedAdjustmentLayer.id ? `${pointPickAdjustment.control.xKey}:${pointPickAdjustment.control.yKey}` : null}
        canSnapMiddle={canSnapAdjustmentMiddle}
        onChange={(updater) => onUpdateAdjustmentLayer(selectedAdjustmentLayer.id, updater)}
        onDelete={() => onDeleteAdjustmentLayer(selectedAdjustmentLayer.id)}
        onPickPoint={(control) => onStartAdjustmentPointPick(selectedAdjustmentLayer.id, control)}
        onSnapMiddle={onSnapAdjustmentMiddle}
      />
    );
  }

  if (selectedPart) return <FrameInspector part={selectedPart} canSnapMiddle={canSnapCompositionMiddle} onDurationChange={onUpdateSelectedPartDuration} onFrameChange={onUpdatePartFrame} onBackgroundChange={onUpdatePartBackground} onSnapMiddle={onSnapCompositionMiddle} />;

  return <EmptyInspector />;
}
