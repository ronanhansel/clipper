import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type {
  AdjustmentLayerSelection,
  CompositionSelection,
  ContextMenuState,
  MotionMarkerSelection,
  TimelineBlankContextTarget,
  TimelineNodeContextTarget,
} from "../../app/types";
import type { PrerenderCacheCoverage } from "../../app/features/preview/usePrerenderCache";
import type {
  TimelineMarkerMove,
  TimelineMarkerResize,
} from "../../core/timeline";
import type {
  AdjustmentEffectId,
  AdjustmentLayer,
  FrameObject,
  MotionEffectId,
  MotionEffectKind,
  MotionMarker,
  Part,
  TimelineLayerState,
  TimelineMode,
  TimelineMotionLayerKind,
  TimelinePart,
  TimelineViewportState,
  TransitionEffectId,
  TransitionLayer,
} from "../../core/types";

export type TimelinePanelProps = {
  timelineName: string;
  timeline: TimelinePart[];
  motionMarkers: Part["motionMarkers"];
  timelineLayers: TimelineLayerState;
  adjustmentLayers: AdjustmentLayer[];
  timelineViewportState: TimelineViewportState;
  mode: TimelineMode;
  selectedPartId: string;
  selectedParts: CompositionSelection[];
  selectedMotionMarkerPartId: string | null;
  selectedMotionMarkerId: string | null;
  selectedMotionMarkers: MotionMarkerSelection[];
  selectedAdjustmentLayerId: string | null;
  selectedAdjustmentLayers: AdjustmentLayerSelection[];
  sceneDuration: number;
  currentSceneTime: number;
  isPlaying: boolean;
  playbackPlayheadRef: RefObject<HTMLDivElement | null>;
  scrubbingRef: RefObject<boolean>;
  fastSelectEnabled: boolean;
  scrubCommitThrottleMs: number;
  defaultNewMarkerDurationSeconds: number;
  timelineEndPaddingFraction: number;
  timelinePrecision: number;
  scrubSnapEnabled: boolean;
  prerenderCacheCoverage?: PrerenderCacheCoverage | null;
  prerenderedCompositionIds?: Set<string>;
  prerenderedCompositionRanges?: Array<{
    compositionId: string;
    start: number;
    end: number;
  }>;
  onScrub: (time: number) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
  onModeChange: (mode: TimelineMode) => void;
  onTimelineViewportStateChange: (
    updater: (state: TimelineViewportState) => TimelineViewportState,
  ) => void;
  onTimelineLayersChange: (
    updater: (state: TimelineLayerState) => TimelineLayerState,
    options?: { history?: boolean },
  ) => void;
  onAddCompositionLayer: (
    targetLayerId?: string,
    placement?: "before" | "after",
  ) => void;
  onRemoveCompositionLayer: (layerId: string) => void;
  onAddAdjustmentLayer: (
    targetLayerId?: string,
    placement?: "before" | "after",
  ) => void;
  onRemoveAdjustmentLayer: (layerId: string) => void;
  onAddMotionLayer: (
    kind?: TimelineMotionLayerKind,
    targetLayerId?: string,
    placement?: "before" | "after",
  ) => void;
  onRemoveMotionLayer: (layerId: string) => void;
  onSelectPart: (id: string) => void;
  onOpenComposePart: (id: string) => void;
  onSelectMotionMarker: (partId: string, markerId: string) => void;
  onSelectMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  onSelectAdjustmentLayer: (layerId: string) => void;
  onSelectAdjustmentLayers: (selection: AdjustmentLayerSelection[]) => void;
  onSelectTimelineNodes: (selection: {
    adjustmentLayers: AdjustmentLayerSelection[];
    compositions: CompositionSelection[];
    motionMarkers: MotionMarkerSelection[];
    transitionLayers: Array<{ layerId: string }>;
  }) => void;
  onClearTimelineSelection: () => void;
  onOpenNodeContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    target: TimelineNodeContextTarget,
  ) => void;
  onOpenBlankContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    target: TimelineBlankContextTarget,
  ) => void;
  onMoveAdjustmentLayer: (
    layerId: string,
    start: number,
    targetLayerId?: string,
  ) => void;
  onMoveAdjustmentLayers?: (
    moves: Array<{ layerId: string; start: number; targetLayerId?: string }>,
  ) => void;
  onUpdateAdjustmentLayer: (
    layerId: string,
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) => void;
  onReorderPart: (sourcePartId: string, targetPartId: string) => void;
  onMoveComposition: (
    compositionId: string,
    start: number,
    targetLayerId?: string,
  ) => void;
  onMoveCompositions: (
    moves: Array<{
      compositionId: string;
      start: number;
      targetLayerId?: string;
    }>,
  ) => void;
  onUpdateComposition: (
    compositionId: string,
    updater: (composition: Part) => Part,
  ) => void;
  onMoveMotionMarker: (
    sourcePartId: string,
    markerId: string,
    targetPartId: string,
    start: number,
    targetLayerId?: string,
  ) => void;
  onMoveMotionMarkers: (moves: TimelineMarkerMove[]) => void;
  onUpdateMotionMarkers: (
    partId: string,
    updater: (markers: MotionMarker[], part: Part) => MotionMarker[],
  ) => void;
  onResizeMotionMarkers: (resizes: TimelineMarkerResize[]) => void;
  onAddComposition: (
    compositionId: string,
    targetLayerId?: string,
    start?: number,
  ) => void;
  onOpenTimeline: (timelineId: string) => void;
  onAddAdjustmentEffect: (
    effectId: AdjustmentEffectId,
    sceneTime: number,
    layerId?: string,
  ) => void;
  onAddMotionEffect: (
    effectId: MotionEffectId,
    layerId: string,
    sceneTime: number,
  ) => void;
  transitionLayers?: TransitionLayer[];
  selectedTransitionLayerId?: string | null;
  selectedTransitionLayers?: Array<{ layerId: string }>;
  onAddTransitionEffect?: (
    effectId: TransitionEffectId,
    sceneTime: number,
    layerId?: string,
  ) => void;
  onSelectTransitionLayer?: (layerId: string) => void;
  onSelectTransitionLayers?: (selection: Array<{ layerId: string }>) => void;
  onMoveTransitionLayer?: (
    layerId: string,
    start: number,
    targetLayerId?: string,
  ) => void;
  onMoveTransitionLayers?: (
    moves: Array<{ layerId: string; start: number; targetLayerId?: string }>,
  ) => void;
  onShiftTimelineGapMarkers?: (moves: {
    gapStart: number;
    gapEnd: number;
    delta: number;
    compositions: Array<{ compositionId: string; start: number }>;
    adjustmentLayers: Array<{ layerId: string; start: number }>;
    motionMarkers: Array<{ markerId: string; start: number }>;
    transitionLayers: Array<{ layerId: string; start: number }>;
  }) => void;
  onUpdateTransitionLayer?: (
    layerId: string,
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) => void;
  composeAnimationPart?: Part | null;
  selectedObjectIds?: string[];
  onExitCompose?: () => void;
  onSelectComposeObjects?: (objects: FrameObject[]) => void;
  onPersistComposeSelection?: (objectIds: string[]) => void;
  onRenameComposeAnimationLayer?: (layerId: string, name: string) => void;
  onUpdateComposeBackgroundAnimation?: (
    updater: (
      animations: import("../../core/types").LayerAnimation[],
    ) => import("../../core/types").LayerAnimation[],
  ) => void;
  onUpdateComposeObjectAnimation?: (
    objectId: string,
    updater: (
      animations: import("../../core/types").LayerAnimation[],
    ) => import("../../core/types").LayerAnimation[],
  ) => void;
  setAppContextMenu?: (menu: ContextMenuState) => void;
};

export type EffectDragPreview = {
  category: "adjustment" | "motion" | "composition" | "transition";
  effectId?: string;
  isEmpty?: boolean;
  kind?: MotionEffectKind;
  layerKey: string;
  label?: string;
  sourceMissing?: boolean;
  blocked?: boolean;
  start: number;
  duration: number;
  initialClientX: number;
  initialStart: number;
};

export type AbsoluteTimelineMarker<
  T extends { id: string; start: number; duration: number },
> = T & {
  sourcePartId: string;
  sourcePartStart: number;
};

export type TimelinePartMotionView = TimelinePart & {
  motionMarkers: MotionMarker[];
};
