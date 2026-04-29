import type { ChartSpec } from "./chart";

export const FRAME_WIDTH = 1920;
export const FRAME_HEIGHT = 1080;
export const MAX_PART_DURATION_SECONDS = 60;
export const MAX_SCENE_DURATION_SECONDS = 30 * 60;

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type PerspectiveSettings = {
  z?: number;
  rotateX?: number;
  rotateY?: number;
};

export type FrameObjectType = "rect" | "text" | "image" | "svg" | "html" | "template" | "chart";

export type MotionEase = "linear" | "easeIn" | "easeOut" | "easeInOut" | "circOut";

export type RichTextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type FrameTemplate = {
  kind: "html";
  source: string;
  static?: boolean;
};

export type MotionTrack = {
  delay?: number;
  duration: number;
  ease?: MotionEase;
  loop?: boolean;
  opacity?: readonly [number, number];
  path?: readonly Point[];
  rotate?: readonly [number, number];
  scale?: readonly [number, number];
  scaleX?: readonly [number, number];
  scaleY?: readonly [number, number];
  skewX?: readonly [number, number];
  skewY?: readonly [number, number];
  x?: readonly [number, number];
  y?: readonly [number, number];
};

export type FrameObject = {
  id: string;
  name: string;
  type: FrameObjectType;
  selector: string;
  bounds: Bounds;
  content?: string;
  chart?: ChartSpec;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  style: Record<string, string | number>;
  motion?: MotionTrack;
  layoutId?: string;
};

export type PartFrame = {
  width: typeof FRAME_WIDTH;
  height: typeof FRAME_HEIGHT;
  style: Record<string, string | number>;
};

export type BackgroundLayer = {
  id: string;
  name: string;
  style: Record<string, string | number>;
  stretchToElements?: boolean;
  motion?: MotionTrack;
  elements: FrameObject[];
};

export type PartSnapshotLine = {
  at: string;
  description: string;
};

export type EffectCategory = "motion" | "adjustment";

export type EffectId = `${string}.${string}`;

export type MotionEffectId = EffectId;

export type AdjustmentEffectId = EffectId;

export type MotionBlockParams = Record<string, unknown> & {
  ease?: MotionEase;
  focus?: Point;
  followId?: string;
  middleEase?: MotionEase;
  middleTransition?: "transition";
  perspective?: PerspectiveSettings;
  position?: Point;
  rotation?: number;
  scale?: number;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type MotionBlock = {
  id: string;
  layerId?: string;
  effectId?: MotionEffectId;
  start: number;
  duration: number;
  params?: MotionBlockParams;
  ease?: MotionEase;
  focus?: Point;
  followId?: string;
  middleEase?: MotionEase;
  middleTransition?: "transition";
  perspective?: PerspectiveSettings;
  position?: Point;
  rotation?: number;
  scale?: number;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type ZoomMarker = MotionBlock & {
  effectId?: "clipper.motion.zoom";
  focus: Point;
  scale: number;
};

export type TranslationMarker = MotionBlock & {
  effectId?: "clipper.motion.pan" | "clipper.motion.rotate" | "clipper.motion.perspective";
  kind?: "pan" | "rotate" | "perspective";
  position: Point;
};

export type MotionBlockEffectKind = "pan" | "zoom" | "rotate" | "perspective";

export type MotionEffectDefinition = {
  id: MotionEffectId;
  category: "motion";
  kind: MotionBlockEffectKind;
  name: string;
  label: string;
  accent: string;
  defaultDuration: number;
};

export type AdjustmentEffectParams = Record<string, unknown> & {
  every?: number;
};

export type AdjustmentEffectDefinition = {
  id: AdjustmentEffectId;
  category: "adjustment";
  name: string;
  label: string;
  accent: string;
  defaultDuration: number;
  defaultParams: AdjustmentEffectParams;
};

export type EffectDefinition = MotionEffectDefinition | AdjustmentEffectDefinition;

export type AdjustmentEffect = {
  effectId: AdjustmentEffectId;
  params?: AdjustmentEffectParams;
};

export type AdjustmentLayer = {
  id: string;
  layerId?: string;
  name: string;
  start: number;
  duration: number;
  effect: AdjustmentEffect;
};

export type CompositionClip = {
  id: string;
  name: string;
  filePath: string;
  source?: string;
  sourceMissing?: boolean;
  duration: number;
  frame: PartFrame;
  background: BackgroundLayer;
  objects: FrameObject[];
  snapshot: PartSnapshotLine[];
  motionBlocks?: MotionBlock[];
  zoomMarkers: ZoomMarker[];
  translationMarkers: TranslationMarker[];
};

/** @deprecated Use CompositionClip. */
export type Part = CompositionClip;

export type Scene = {
  id: string;
  name: string;
  compositions: CompositionClip[];
  adjustmentLayers?: AdjustmentLayer[];
};

export type CompositionDocument = CompositionClip & {
  source: string;
};

export type TimelineClip = {
  id: string;
  compositionId: string;
  motionBlocks?: MotionBlock[];
  zoomMarkers: ZoomMarker[];
  translationMarkers: TranslationMarker[];
};

export type TimelineSettings = {
  frameRate?: number;
};

export type TimelineDocument = {
  id: string;
  name: string;
  filePath?: string;
  clips: TimelineClip[];
  adjustmentLayers?: AdjustmentLayer[];
  settings?: TimelineSettings;
};

export type TimelineViewportState = {
  displacement: number;
  zoom: number;
};

export type MotionEffectKind = MotionBlockEffectKind;

/** @deprecated Motion layers are generic; effect identity lives on MotionBlock.effectId. */
export type TimelineMotionLayerKind = "empty" | "motion";

export type TimelineMotionLayerState = {
  id: string;
  kind: TimelineMotionLayerKind;
  name: string;
  hidden?: boolean;
};

export type TimelineAdjustmentLayerState = {
  id: string;
  name: string;
  hidden?: boolean;
};

export type TimelineLayerState = {
  compName?: string;
  compHidden?: boolean;
  adjustmentLayers?: TimelineAdjustmentLayerState[];
  motionLayers?: TimelineMotionLayerState[];
  rowHeights?: Record<string, number>;
};

export type TimelineMode = "edit" | "composition";

export type PreviewViewportState = {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
  zoomBarOpen: boolean;
};

export type CodeViewportState = {
  scrollLeft: number;
  scrollTop: number;
};

export type EditorState = {
  timeline: TimelineViewportState;
  timelineLayers?: TimelineLayerState;
  timelineMode: TimelineMode;
  mode?: "interactive" | "code";
  leftPanelTab?: "assets" | "tools";
  rightPanelTab?: "video" | "motion" | "agent";
  selectedSceneId?: string;
  selectedTimelineId?: string;
  selectedPartId?: string;
  selectedZoomMarker?: { partId: string; markerId: string } | null;
  selectedTranslationMarker?: { partId: string; markerId: string } | null;
  currentSceneTime?: number;
  preview?: PreviewViewportState;
  code?: Record<string, CodeViewportState>;
  fileManagerState?: FileManagerState;
};

export type AssetItem = {
  id: string;
  name: string;
  kind: "file" | "folder";
  path?: string;
  children?: AssetItem[];
};

export type FileManagerStateNode = {
  id: string;
  children?: FileManagerStateNode[];
};

export type FileManagerState = {
  tree?: FileManagerStateNode[];
  openState?: Record<string, boolean>;
};

export type ProjectManifest = {
  id: string;
  name: string;
  resolution: {
    width: typeof FRAME_WIDTH;
    height: typeof FRAME_HEIGHT;
  };
  scenes: Scene[];
  timelines?: TimelineDocument[];
  timelineOrder?: string[];
  compositions?: CompositionDocument[];
  compositionOrder?: string[];
  compositionLibrary?: CompositionClip[];
  compositionFolders?: string[];
  compositionSources?: Record<string, string>;
  assetsPath: string;
  assets?: AssetItem[];
  editorState?: EditorState;
};

export type TimelineComposition = CompositionClip & {
  start: number;
  end: number;
};

/** @deprecated Use TimelineComposition. */
export type TimelinePart = TimelineComposition;

export type SelectionPayload = {
  selectionBox: Bounds;
  coordinates: [Point, Point, Point, Point];
  objects: Array<{
    id: string;
    name: string;
    selector: string;
    bounds: Bounds;
    type: FrameObjectType;
  }>;
};
