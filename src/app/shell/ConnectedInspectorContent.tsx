import { AgentPanel } from "../../components/AgentPanel";
import { AdjustmentInspector, ChartInspector, EmptyInspector, FrameInspector, ObjectInspector, TranslationInspector, ZoomInspector } from "../../components/inspector/InspectorPanels";
import type { AdjustmentEffectPointControl } from "../../core/effects/types";
import type { AdjustmentLayer, BackgroundLayer, FrameObject, MotionEase, Part, PartFrame, Point, TranslationMarker, ZoomMarker } from "../../core/types";
import type { RightPanelTab } from "../types";

type MarkerPick = { partId: string; markerId: string } | null;
type PointPickAdjustment = { layerId: string; control: AdjustmentEffectPointControl } | null;

type ConnectedInspectorContentProps = {
  rightPanelTab: RightPanelTab;
  part: Part;
  sourceStatus: string;
  agentContext: unknown;
  selectedZoom: ZoomMarker | null | undefined;
  selectedZoomPart: Part | null | undefined;
  selectedZoomMarkerCount: number;
  selectedZoomSnapInActive: boolean;
  selectedZoomSnapOutActive: boolean;
  selectedZoomPartMiddleSnapActive: boolean;
  selectedZoomPartMiddleTransitionMode: "instant" | "transition";
  focusPickZoomMarker: MarkerPick;
  canSnapZoomMiddle: boolean;
  selectedTranslation: TranslationMarker | null | undefined;
  selectedTranslationPart: Part | null | undefined;
  selectedTranslationMarkerCount: number;
  selectedTranslationSnapInActive: boolean;
  selectedTranslationSnapOutActive: boolean;
  selectedTranslationPartMiddleSnapActive: boolean;
  selectedTranslationPartMiddleTransitionMode: "instant" | "transition";
  positionPickTranslationMarker: MarkerPick;
  trackerPickTranslationMarker: MarkerPick;
  canSnapTranslationMiddle: boolean;
  selectedObject: FrameObject | null | undefined;
  selectedAdjustmentLayer: AdjustmentLayer | null | undefined;
  sceneDurationSeconds: number;
  pointPickAdjustment: PointPickAdjustment;
  selectedPart: Part | null | undefined;
  onUpdateZoomMarker: (partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) => void;
  onPreviewZoomScale: (partId: string, markerId: string, scale: number) => void;
  onClearZoomScalePreview: () => void;
  onUpdateZoomMarkerFocusGroup: (partId: string, markerId: string, focus: Point) => void;
  onUpdateSelectedZoomSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void;
  onUpdateZoomMiddleTransition: (part: Part, mode: "instant" | "transition") => void;
  onUpdateZoomMiddleEase: (part: Part, ease: MotionEase | undefined) => void;
  onDeleteZoomMarker: (partId: string, markerId: string) => void;
  onStartZoomFocusPick: (partId: string, markerId: string) => void;
  onSnapZoomMiddle: (part: Part) => void;
  onUpdateTranslationMarker: (partId: string, markerId: string, updater: (marker: TranslationMarker, part: Part) => TranslationMarker) => void;
  onUpdateSelectedTranslationSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void;
  onUpdateTranslationMiddleTransition: (part: Part, mode: "instant" | "transition") => void;
  onUpdateTranslationMiddleEase: (part: Part, ease: MotionEase | undefined) => void;
  onDeleteTranslationMarker: (partId: string, markerId: string) => void;
  onStartTranslationPositionPick: (partId: string, markerId: string) => void;
  onStartTranslationTrackerPick: (partId: string, markerId: string) => void;
  onSnapTranslationMiddle: (part: Part) => void;
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
  selectedZoom,
  selectedZoomPart,
  selectedZoomMarkerCount,
  selectedZoomSnapInActive,
  selectedZoomSnapOutActive,
  selectedZoomPartMiddleSnapActive,
  selectedZoomPartMiddleTransitionMode,
  focusPickZoomMarker,
  canSnapZoomMiddle,
  selectedTranslation,
  selectedTranslationPart,
  selectedTranslationMarkerCount,
  selectedTranslationSnapInActive,
  selectedTranslationSnapOutActive,
  selectedTranslationPartMiddleSnapActive,
  selectedTranslationPartMiddleTransitionMode,
  positionPickTranslationMarker,
  trackerPickTranslationMarker,
  canSnapTranslationMiddle,
  selectedObject,
  selectedAdjustmentLayer,
  sceneDurationSeconds,
  pointPickAdjustment,
  selectedPart,
  onUpdateZoomMarker,
  onPreviewZoomScale,
  onClearZoomScalePreview,
  onUpdateZoomMarkerFocusGroup,
  onUpdateSelectedZoomSnap,
  onUpdateZoomMiddleTransition,
  onUpdateZoomMiddleEase,
  onDeleteZoomMarker,
  onStartZoomFocusPick,
  onSnapZoomMiddle,
  onUpdateTranslationMarker,
  onUpdateSelectedTranslationSnap,
  onUpdateTranslationMiddleTransition,
  onUpdateTranslationMiddleEase,
  onDeleteTranslationMarker,
  onStartTranslationPositionPick,
  onStartTranslationTrackerPick,
  onSnapTranslationMiddle,
  onUpdateSelectedObject,
  onUpdateAdjustmentLayer,
  onDeleteAdjustmentLayer,
  onStartAdjustmentPointPick,
  onUpdateSelectedPartDuration,
  onUpdatePartFrame,
  onUpdatePartBackground,
}: ConnectedInspectorContentProps) {
  if (rightPanelTab === "agent") return <AgentPanel part={part} sourceStatus={sourceStatus} agentContext={agentContext} />;

  if (selectedZoom && selectedZoomPart) {
    return (
      <ZoomInspector
        marker={selectedZoom}
        part={selectedZoomPart}
        selectedMarkerCount={selectedZoomMarkerCount}
        selectedSnapInActive={selectedZoomSnapInActive}
        selectedSnapOutActive={selectedZoomSnapOutActive}
        middleSnapActive={selectedZoomPartMiddleSnapActive}
        middleTransitionMode={selectedZoomPartMiddleTransitionMode}
        pickingFocus={focusPickZoomMarker?.partId === selectedZoomPart.id && focusPickZoomMarker.markerId === selectedZoom.id}
        canSnapMiddle={canSnapZoomMiddle}
        onChange={(updater) => onUpdateZoomMarker(selectedZoomPart.id, selectedZoom.id, updater)}
        onScalePreview={(scale) => onPreviewZoomScale(selectedZoomPart.id, selectedZoom.id, scale)}
        onScalePreviewEnd={onClearZoomScalePreview}
        onChangeFocus={(focus) => onUpdateZoomMarkerFocusGroup(selectedZoomPart.id, selectedZoom.id, focus)}
        onChangeSelectedSnap={onUpdateSelectedZoomSnap}
        onChangeMiddleTransition={(mode) => onUpdateZoomMiddleTransition(selectedZoomPart, mode)}
        onChangeMiddleEase={(ease) => onUpdateZoomMiddleEase(selectedZoomPart, ease)}
        onDelete={() => onDeleteZoomMarker(selectedZoomPart.id, selectedZoom.id)}
        onPickFocus={() => onStartZoomFocusPick(selectedZoomPart.id, selectedZoom.id)}
        onSnapMiddle={() => onSnapZoomMiddle(selectedZoomPart)}
      />
    );
  }

  if (selectedTranslation && selectedTranslationPart) {
    return (
      <TranslationInspector
        marker={selectedTranslation}
        part={selectedTranslationPart}
        selectedMarkerCount={selectedTranslationMarkerCount}
        selectedSnapInActive={selectedTranslationSnapInActive}
        selectedSnapOutActive={selectedTranslationSnapOutActive}
        middleSnapActive={selectedTranslationPartMiddleSnapActive}
        middleTransitionMode={selectedTranslationPartMiddleTransitionMode}
        pickingPosition={positionPickTranslationMarker?.partId === selectedTranslationPart.id && positionPickTranslationMarker.markerId === selectedTranslation.id}
        pickingTracker={trackerPickTranslationMarker?.partId === selectedTranslationPart.id && trackerPickTranslationMarker.markerId === selectedTranslation.id}
        canSnapMiddle={canSnapTranslationMiddle}
        onChange={(updater) => onUpdateTranslationMarker(selectedTranslationPart.id, selectedTranslation.id, updater)}
        onChangeSelectedSnap={onUpdateSelectedTranslationSnap}
        onChangeMiddleTransition={(mode) => onUpdateTranslationMiddleTransition(selectedTranslationPart, mode)}
        onChangeMiddleEase={(ease) => onUpdateTranslationMiddleEase(selectedTranslationPart, ease)}
        onDelete={() => onDeleteTranslationMarker(selectedTranslationPart.id, selectedTranslation.id)}
        onPickPosition={() => onStartTranslationPositionPick(selectedTranslationPart.id, selectedTranslation.id)}
        onPickTracker={() => onStartTranslationTrackerPick(selectedTranslationPart.id, selectedTranslation.id)}
        onSnapMiddle={() => onSnapTranslationMiddle(selectedTranslationPart)}
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
        onChange={(updater) => onUpdateAdjustmentLayer(selectedAdjustmentLayer.id, updater)}
        onDelete={() => onDeleteAdjustmentLayer(selectedAdjustmentLayer.id)}
        onPickPoint={(control) => onStartAdjustmentPointPick(selectedAdjustmentLayer.id, control)}
      />
    );
  }

  if (selectedPart) return <FrameInspector part={selectedPart} onDurationChange={onUpdateSelectedPartDuration} onFrameChange={onUpdatePartFrame} onBackgroundChange={onUpdatePartBackground} />;

  return <EmptyInspector />;
}
