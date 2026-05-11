import type { AnimationGraph as StrictAnimationGraph } from "./animationGraph/types";

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

export type FrameObjectType =
  | "rect"
  | "text"
  | "image"
  | "svg"
  | "html"
  | "template";

export type MotionEase =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "inAndOut"
  | "expoIn"
  | "expoOut"
  | "circOut"
  | "backOut";

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

export type LayerAnimation = {
  id: string;
  name?: string;
  target?: "self" | "children";
  keyframes: {
    opacity?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    x?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    y?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    z?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    scale?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    scaleX?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    scaleY?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    rotate?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    rotateX?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    rotateY?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    rotateZ?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    skewX?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    skewY?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    transformPerspective?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    blur?:
      | readonly [number, number]
      | readonly [number, number, number, ...number[]];
    backgroundColor?: readonly [string, string] | readonly string[];
    color?: readonly [string, string] | readonly string[];
    pathOffset?: readonly [number, number];
    pathLength?: readonly [number, number];
    pathSpacing?: readonly [number, number];
  };
  options: {
    delay?: number;
    duration: number;
    ease?: MotionEase | readonly [number, number, number, number];
    type?: "tween" | "spring" | "inertia";
    repeat?: number;
    repeatType?: "loop" | "reverse" | "mirror";
    repeatDelay?: number;
    bounce?: number;
    stiffness?: number;
    damping?: number;
    mass?: number;
    velocity?: number;
    split?: {
      mode: "word" | "character";
      stagger?: number;
      order?: "forward" | "reverse" | "center";
      repeatScope?: "sequence" | "item";
      tokenDelays?: Record<number, number>;
      tokenIndexes?: number[];
    };
  };
  enabled?: boolean;
};

export type LayerAnimationMode =
  | "low-code-motion"
  | "custom-html"
  | "css-animation"
  | "code-driven-motion"
  | "static";

export type FrameObject = {
  id: string;
  name: string;
  type: FrameObjectType;
  selector: string;
  bounds: Bounds;
  content?: string;
  template?: FrameTemplate;
  richText?: RichTextSegment[];
  style: Record<string, string | number>;
  layoutId?: string;
  hidden?: boolean;
  locked?: boolean;
  animations?: LayerAnimation[];
  generatedGeometry?: import("./animationGraph/types").GeneratedGeometry[];
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
  hidden?: boolean;
  locked?: boolean;
  animations?: LayerAnimation[];
  elements: FrameObject[];
};

export type PartSnapshotLine = {
  at: string;
  description: string;
};

export type CompositionRenderMode = "dom" | "webgl";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type EffectCategory = "motion" | "adjustment" | "transition";

export type EffectId = `${string}.${string}`;

export type EffectManifestTag = "blocksMending" | "blocksOverlap";

export type MotionEffectId = EffectId;

export type AdjustmentEffectId = EffectId;

export type TransitionEffectId = EffectId;

export type MotionBlockParams = Record<string, unknown> & {
  ease?: MotionEase;
  focus?: Point;
  followId?: string;
  middleEase?: MotionEase;
  middleTransition?: "transition";
  mendInId?: string;
  mendOutId?: string;
  perspective?: PerspectiveSettings;
  position?: Point;
  rotation?: number;
  scale?: number;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type TimelineMarkerMetadata = {
  mendInId?: string;
  mendOutId?: string;
  snapIn?: boolean;
  snapOut?: boolean;
};

export type TimelineMarkerTag =
  | {
      kind: "text";
      label: string;
      title?: string;
    }
  | {
      kind: "icon";
      icon: string;
      label?: string;
      title?: string;
    };

export type MotionBlock = TimelineMarkerMetadata & {
  id: string;
  name?: string;
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
};

export type MotionBlockEffectKind = "pan" | "zoom" | "rotate" | "perspective";

export type MotionMarker = MotionBlock & {
  kind: MotionBlockEffectKind;
  effectId: MotionEffectId;
};

export type MotionEffectDefinition = {
  id: MotionEffectId;
  category: "motion";
  kind: MotionBlockEffectKind;
  name: string;
  label: string;
  group: string;
  groups?: readonly string[];
  tags?: readonly EffectManifestTag[];
  timelineTags?: readonly TimelineMarkerTag[];
  defaultDuration: number;
};

export type EffectTimelineGradient = {
  from: string;
  to: string;
  text?: string;
};

export type AdjustmentEffectParams = Record<string, unknown> & {
  amount?: number;
  brightness?: number;
  contrast?: number;
  density?: number;
  drift?: number;
  degrees?: number;
  every?: number;
  focusX?: number;
  focusY?: number;
  hue?: number;
  intensity?: number;
  chromaticAberration?: number;
  dimAmount?: number;
  distortion?: number;
  magnification?: number;
  rimOpacity?: number;
  rimWidth?: number;
  softness?: number;
  radius?: number;
  saturation?: number;
  speed?: number;
  target?: "frame" | "camera";
  warmth?: number;
  window?: number;
  dust?: number;
  dustShape?: number;
  dustSize?: number;
  fade?: number;
  flicker?: number;
  gateWeave?: number;
  grain?: number;
  grainSize?: number;
  grainSpeed?: number;
  halation?: number;
  motionSpeed?: number;
  scratches?: number;
  scratchLength?: number;
  scratchRoughness?: number;
  scratchSpeed?: number;
  seed?: number;
  stock?: string;
  vignette?: number;
  dustSpeed?: number;
  flickerSpeed?: number;
  weaveSpeed?: number;
  chromaticAberrationUseMask?: boolean;
  chromaticAberrationMaskPreview?: boolean;
  chromaticAberrationMaskInvert?: boolean;
  chromaticAberrationMaskShape?: "circular" | "ellipsoid";
  chromaticAberrationMaskFocusX?: number;
  chromaticAberrationMaskFocusY?: number;
  chromaticAberrationMaskRadius?: number;
  chromaticAberrationMaskRadiusX?: number;
  chromaticAberrationMaskRadiusY?: number;
  chromaticAberrationMaskFeather?: number;
};

export type AdjustmentEffectDefinition = {
  id: AdjustmentEffectId;
  category: "adjustment";
  name: string;
  label: string;
  group: string;
  groups?: readonly string[];
  tags?: readonly EffectManifestTag[];
  timelineTags?: readonly TimelineMarkerTag[];
  defaultDuration: number;
  defaultParams: AdjustmentEffectParams;
};

export type EffectDefinition =
  | MotionEffectDefinition
  | AdjustmentEffectDefinition
  | TransitionEffectDefinition;

export type AdjustmentEffect = {
  effectId: AdjustmentEffectId;
  params?: AdjustmentEffectParams;
};

export type AdjustmentLayer = TimelineMarkerMetadata & {
  id: string;
  layerId?: string;
  name: string;
  start: number;
  duration: number;
  effect: AdjustmentEffect;
};

export type TransitionEffectParams = Record<string, unknown> & {
  ease?: MotionEase;
  transitionTime?: number;
  bandCount?: number;
  drift?: number;
  flicker?: number;
  intensity?: number;
  seed?: number;
  softness?: number;
  warmth?: number;
};

export type TransitionEffectDefinition = {
  id: TransitionEffectId;
  category: "transition";
  name: string;
  label: string;
  group: string;
  groups?: readonly string[];
  tags?: readonly EffectManifestTag[];
  timelineTags?: readonly TimelineMarkerTag[];
  defaultDuration: number;
  defaultParams: TransitionEffectParams;
};

export type TransitionEffect = {
  effectId: TransitionEffectId;
  params?: TransitionEffectParams;
};

export type TransitionLayer = TimelineMarkerMetadata & {
  id: string;
  layerId?: string;
  name: string;
  start: number;
  duration: number;
  midPoint: number;
  effect: TransitionEffect;
};

export type Composition3dGraphState = {
  nodes: Record<string, AnimationGraphNodePosition>;
  edges: AnimationGraphEdge[];
  customNodes?: Record<string, AnimationGraphCustomNode>;
  parameters?: Record<string, Record<string, string>>;
};

export type CompositionClip = TimelineMarkerMetadata & {
  id: string;
  compositionId?: string;
  filePath: string;
  sourceHash?: string;
  source?: string;
  prerender?: boolean;
  sourceMissing?: boolean;
  compositionError?: string;
  start?: number;
  trimStart?: number;
  layerId?: string;
  duration: number;
  frame: PartFrame;
  background: BackgroundLayer;
  objects: FrameObject[];
  snapshot: PartSnapshotLine[];
  motionMarkers: MotionMarker[];
  animationGraph?: StrictAnimationGraph;
  bgGraph?: AnimationGraphState;
  threeBackgrounds?: Record<string, unknown>;
  renderMode?: CompositionRenderMode;
  composition3dGraph?: Composition3dGraphState;
};

export type Part = CompositionClip;

export type Scene = {
  id: string;
  compositions: CompositionClip[];
  adjustmentLayers?: AdjustmentLayer[];
  motionMarkers?: MotionMarker[];
  transitionLayers?: TransitionLayer[];
};

export type CompositionDocument = CompositionClip;

export type TimelineClip = {
  id: string;
  compositionId: string;
  start?: number;
  trimStart?: number;
  layerId?: string;
  duration?: number;
  prerender?: boolean;
  motionMarkers?: MotionMarker[];
  renderMode?: CompositionRenderMode;
};

export type AnimationGraphPort = "top" | "right" | "bottom" | "left";

export type AnimationGraphNodePosition = {
  x: number;
  y: number;
};

export type AnimationGraphEdge = {
  id: string;
  fromNodeId: string;
  fromPort: AnimationGraphPort;
  toNodeId: string;
  toPort: AnimationGraphPort;
  fromSocket?: string;
  toSocket?: string;
};

export type AnimationGraphValueType =
  | "Structure.Shape"
  | "Structure.TextObject"
  | "Structure.RichTextObject"
  | "Structure.TextTokens"
  | "Structure.Object"
  | "Value.String"
  | "Value.Number"
  | "Value.Color"
  | "Value.Boolean"
  | "Value.StringArray"
  | "Value.NumberArray"
  | "Effect.CSSEffect"
  | "AnimationController"
  | "CompiledAnimation";

export type TypedAnimationGraphSocket = {
  id: string;
  label: string;
  type: AnimationGraphValueType;
  accepts?: readonly AnimationGraphValueType[];
};

export type AnimationGraphTimeConfig = {
  delay: number;
  duration: number;
  ease: MotionEase;
  repeat?: number;
  repeatType?: "loop" | "reverse" | "mirror";
  schedule: "relative" | "absolute";
};

export type AnimationGraphSplitConfig = {
  mode: "word" | "character" | "pattern";
  pattern?: string;
  stagger: number;
  order: "forward" | "reverse" | "center";
  repeatScope: "sequence" | "item";
};

export type AnimationGraphConditionRule = {
  target: "value" | "type";
  operator: "equals" | "contains" | "notContains" | "gt" | "lt" | "gte" | "lte";
  value: string | number;
  action: "setDelay" | "sendToOutput" | "duplicateToOutput";
  output: string;
  delay?: number;
};

export type LegacyAnimationGraphConditionConfig = {
  rules: AnimationGraphConditionRule[];
};

export type AnimationGraphCssEffectConfig = {
  property: string;
  from?: string | number;
  to?: string | number;
  values: Record<string, string | number | boolean>;
};

export type AnimationGraphAnimationConfig = {
  effects: AnimationGraphCssEffectConfig[];
};

export type TypedAnimationGraphNodeBase<Kind extends string, Config> = {
  id: string;
  kind: Kind;
  label: string;
  position: AnimationGraphNodePosition;
  x: number;
  y: number;
  inputs: readonly TypedAnimationGraphSocket[];
  outputs: readonly TypedAnimationGraphSocket[];
  config: Config;
};

export type AnimationGraphSourceNode = TypedAnimationGraphNodeBase<
  "source",
  { objectId: string }
>;
export type AnimationGraphTimeNode = TypedAnimationGraphNodeBase<
  "time",
  AnimationGraphTimeConfig
>;
export type AnimationGraphSplitNode = TypedAnimationGraphNodeBase<
  "split",
  AnimationGraphSplitConfig
>;
export type AnimationGraphConditionNode = TypedAnimationGraphNodeBase<
  "condition",
  LegacyAnimationGraphConditionConfig
>;
export type AnimationGraphAnimationNode = TypedAnimationGraphNodeBase<
  "effect",
  AnimationGraphAnimationConfig
>;
export type AnimationGraphGroupNode = TypedAnimationGraphNodeBase<
  "group",
  { groupId: string }
>;
export type AnimationGraphOutNode = TypedAnimationGraphNodeBase<"out", {}>;

export type TypedAnimationGraphNode =
  | AnimationGraphSourceNode
  | AnimationGraphTimeNode
  | AnimationGraphSplitNode
  | AnimationGraphConditionNode
  | AnimationGraphAnimationNode
  | AnimationGraphGroupNode
  | AnimationGraphOutNode;

export type TypedAnimationGraphLayerState = {
  id: string;
  nodes: Record<string, TypedAnimationGraphNode>;
  edges: AnimationGraphEdge[];
  customNodes?: Record<string, AnimationGraphCustomNode>;
  parameters?: Record<string, Record<string, string>>;
  groups?: Record<string, AnimationGraphGroup>;
};

export type TypedAnimationGraphState = {
  /** Compatibility shell. Composition2d graph data is owned by `layers`. */
  nodes: Record<string, TypedAnimationGraphNode>;
  edges: AnimationGraphEdge[];
  layers?: TypedAnimationGraphLayerState[];
  customNodes?: Record<string, AnimationGraphCustomNode>;
  parameters?: Record<string, Record<string, string>>;
  groups?: Record<string, AnimationGraphGroup>;
  viewport?: AnimationGraphState["viewport"];
  viewports?: AnimationGraphState["viewports"];
};

export type AnimationGraphCustomNode = {
  kind:
    | "effect"
    | "effectMix"
    | "time"
    | "split"
    | "condition"
    | "group"
    | "bgSolid"
    | "bgGradient"
    | "bgPattern"
    | "bgPaper"
    | "bgThreeCode"
    | "oscillate";
  label: string;
  scopeKey: string;
  details?: Record<string, string>;
};

export type AnimationGraphGroup = {
  id: string;
  name: string;
  nodes: Record<string, AnimationGraphNodePosition>;
  edges: AnimationGraphEdge[];
  customNodes?: Record<string, AnimationGraphCustomNode>;
  parameters?: Record<string, Record<string, string>>;
  inNodeId?: string;
  outNodeId: string;
};

export type AnimationGraphState = {
  nodes: Record<string, AnimationGraphNodePosition>;
  edges: AnimationGraphEdge[];
  customNodes?: Record<string, AnimationGraphCustomNode>;
  groups?: Record<string, AnimationGraphGroup>;
  parameters?: Record<string, Record<string, string>>;
  /** Legacy shared graph viewport. New graph views should use per-layer `viewports`. */
  viewport?: {
    scrollLeft: number;
    scrollTop: number;
    zoom?: number;
  };
  viewports?: Record<
    string,
    {
      scrollLeft: number;
      scrollTop: number;
      zoom?: number;
    }
  >;
};

export type TimelineSettings = {
  frameRate?: number;
};

export type TimelineDocument = {
  id: string;
  filePath?: string;
  clips: TimelineClip[];
  adjustmentLayers?: AdjustmentLayer[];
  motionMarkers?: MotionMarker[];
  transitionLayers?: TransitionLayer[];
  timelineLayers?: TimelineLayerState;
  settings?: TimelineSettings;
};

export type TimelineViewportState = {
  displacement: number;
  zoom: number;
};

export type MotionEffectKind = MotionBlockEffectKind;

export type TimelineMotionLayerKind = "empty" | "motion";

export type TimelineMotionLayerState = {
  id: string;
  kind: TimelineMotionLayerKind;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
};

export type TimelineAdjustmentLayerState = {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
};

export type TimelineTransitionLayerState = {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
};

export type TimelineCompositionLayerState = {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
};

export type TimelineLayerState = {
  compHidden?: boolean;
  compositionLayers?: TimelineCompositionLayerState[];
  adjustmentLayers?: TimelineAdjustmentLayerState[];
  motionLayers?: TimelineMotionLayerState[];
  transitionLayers?: TimelineTransitionLayerState[];
  rowHeights?: Record<string, number>;
};

export type TimelineMode = "compose" | "composition";

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

export type EditorLayoutState = {
  leftPanelWidth: number;
  rightPanelWidth: number;
  timelineHeight: number;
};

export type ComposeLayoutState = {
  leftPanelWidth: number;
};

export type EffectsPanelState = {
  openGroups?: Record<string, boolean>;
};

export type PersistedEditorTab = {
  id: string;
  filePath: string;
  language: string;
  unsupportedReason?: string;
  isComposition?: boolean;
  isPinned?: boolean;
};

export type EditorSessionState = {
  tabs: PersistedEditorTab[];
  activeTabId?: string | null;
};

export type EditorState = {
  timeline: TimelineViewportState;
  composeTimeline?: TimelineViewportState;
  /** Legacy global timeline layout. New timeline layout belongs to TimelineDocument.timelineLayers. */
  timelineLayers?: TimelineLayerState;
  timelineMode: TimelineMode;
  mode?: "preview" | "editor" | "interactive" | "code";
  leftPanelTab?: "assets" | "tools";
  rightPanelTab?: "video" | "motion" | "animation" | "agent";
  selectedSceneId?: string;
  selectedTimelineId?: string;
  selectedPartId?: string;
  selectedComposeObjectIds?: string[];
  selectedMotionMarker?: { partId: string; markerId: string } | null;
  currentSceneTime?: number;
  defaultNewMarkerDurationSeconds?: number;
  timelineEndPaddingFraction?: number;
  timelinePrecision?: number;
  pausePlaybackOnScrub?: boolean;
  layout?: EditorLayoutState;
  composeLayout?: ComposeLayoutState;
  preview?: PreviewViewportState;
  editor?: Record<string, CodeViewportState>;
  /** Legacy editor viewport state key. New projects should use editor. */
  code?: Record<string, CodeViewportState>;
  fileManagerState?: FileManagerState;
  effectsPanelState?: EffectsPanelState;
  editorSession?: EditorSessionState;
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
  filePath?: string;
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

export type TimelinePart = TimelineComposition;

export type SelectionPayload = {
  selectionBox: Bounds;
  coordinates: [Point, Point, Point, Point];
  objects: Array<{
    id: string;
    name: string;
    selector: string;
    bounds: Bounds;
    type: FrameObjectType | "background";
  }>;
};
