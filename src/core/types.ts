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
  | "template"
  | "null"
  | "camera"
  | "custom-renderer"
  | "pattern2d"
  | "code";

export type MotionEase =
  | "linear"
  | "snap"
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

export type AnimationTrackProperty =
  | "opacity"
  | "x"
  | "y"
  | "width"
  | "height"
  | "z"
  | "scale"
  | "scaleX"
  | "scaleY"
  | "rotate"
  | "rotateX"
  | "rotateY"
  | "rotateZ"
  | "skewX"
  | "skewY"
  | "transformPerspective"
  | "blur"
  | "backgroundColor"
  | "color"
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "fontFamily"
  | "pathOffset"
  | "pathLength"
  | "pathSpacing";

export type AnimationTrackValueType = "number" | "color";

export type KeyframePoint = {
  id: string;
  time: number;
  value: number | string;
  easingToNext?: MotionEase | readonly [number, number, number, number];
  hold?: boolean;
};

export type AnimationTrack = {
  property: AnimationTrackProperty;
  valueType: AnimationTrackValueType;
  points: KeyframePoint[];
};

export type PropertyTrackValueType =
  | "number"
  | "length"
  | "color"
  | "boolean"
  | "string"
  | "discrete"
  | "custom";

export type PropertyKeyframePoint = {
  id?: string;
  time: number;
  value: JsonValue;
  easingToNext?:
    | MotionEase
    | string
    | readonly [number, number, number, number];
  hold?: boolean;
};

export type PropertyTrack = {
  valueType: PropertyTrackValueType;
  points: PropertyKeyframePoint[];
};

export type AnimationPlaybackOptions = {
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
    mode: "word" | "character" | "line";
    stagger?: number;
    order?: "forward" | "reverse" | "center" | "random";
    repeatScope?: "sequence" | "item";
    tokenDelays?: Record<number, number>;
    tokenIndexes?: number[];
    seed?: number;
    shape?: "square" | "rampUp" | "rampDown" | "triangle" | "round" | "smooth";
    start?: number;
    end?: number;
    offset?: number;
    easeHigh?: number;
    easeLow?: number;
    anchor?: "token" | "word" | "line" | "all";
  };
};

export type LayerAnimation = {
  id: string;
  name?: string;
  target?: "self" | "children";
  tracks: AnimationTrack[];
  options: AnimationPlaybackOptions;
  enabled?: boolean;
};

export type LayerAnimationMode =
  | "low-code-motion"
  | "custom-html"
  | "css-animation"
  | "code-driven-motion"
  | "static";

export type ShadowEffect = {
  enabled?: boolean;
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  color?: string;
  alpha?: number;
};

export type StrokePosition = "outside" | "center" | "inside";

export type StrokeStyle = "solid" | "dashed" | "dotted" | "dashDot";

export type StrokeEffect = {
  enabled?: boolean;
  width?: number;
  color?: string;
  alpha?: number;
  position?: StrokePosition;
  start?: number;
  end?: number;
  style?: StrokeStyle;
  spacing?: number;
};

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
  transform?: Record<string, JsonValue> | string;
  filter?: Record<string, JsonValue>;
  shadow?: ShadowEffect;
  stroke?: StrokeEffect;
  layoutId?: string;
  parentId?: string;
  hidden?: boolean;
  locked?: boolean;
  /**
   * AE-style "3D Layer" toggle. When true, the object opts into 3D
   * positioning (translateZ, rotateX/Y/Z keyframable transforms) and
   * the inspector renders a 3D position/rotation layout. Geometry is
   * unchanged — a rect remains flat; threeD only controls authoring
   * affordances and how the camera sees it.
   */
  threeD?: boolean;
  animations?: LayerAnimation[];
  tracks?: Record<string, PropertyTrack>;
  props?: Record<string, JsonValue>;
  source?: {
    kind: "file";
    path: string;
  };
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

export type CameraSensor = {
  /** mm, default 36 (full-frame width) */
  width: number;
  /** mm, default 24 (full-frame height) */
  height: number;
};

export type CameraDepthOfField = {
  enabled: boolean;
  /** Scene units (matches camera position.z). */
  focusDistance: number;
  /** f-number (e.g. 2.8). 0 disables DoF. */
  fNumber: number;
  /** Upper clamp for DoF blur, in source pixels. */
  maxBlurPx: number;
};

export const CAMERA_DOF_MIN_F_NUMBER = 1.5;
export const CAMERA_DOF_MAX_F_NUMBER = 64;
export const CAMERA_DOF_MAX_BLUR_PX = 300;

export type CameraLensDistortion = {
  enabled: boolean;
  /** -1..1. Positive = barrel, negative = pincushion. 0 = no distortion. */
  amount: number;
};

export type CameraLensChromaticAberration = {
  enabled: boolean;
  /** Per-channel offset in source pixels. Typical 0..10. */
  amountPx: number;
};

export type CameraLensVignette = {
  enabled: boolean;
  /** Darkening strength at edges. 0..1. */
  amount: number;
  /** Edge softness. 0..1, larger = softer falloff. */
  feather: number;
};

export type CameraLens = {
  distortion: CameraLensDistortion;
  chromaticAberration: CameraLensChromaticAberration;
  vignette: CameraLensVignette;
};

export type CameraPostExposure = {
  enabled: boolean;
  /** EV stops. -3..+3 typical. */
  ev: number;
};

export type CameraTonemapMode = "reinhard" | "aces" | "filmic";

export type CameraPostTonemap = {
  enabled: boolean;
  mode: CameraTonemapMode;
};

export type CameraPostGrade = {
  enabled: boolean;
  /** Lift: shadows. -1..1. 0 = neutral. */
  lift: number;
  /** Gamma: midtones. 0.1..3. 1 = neutral. */
  gamma: number;
  /** Gain: highlights. 0..3. 1 = neutral. */
  gain: number;
};

export type CameraPostGrain = {
  enabled: boolean;
  /** Strength. 0..1. */
  amount: number;
  /** Grain cell size in source pixels. 0.5..3. */
  size: number;
};

export type CameraPost = {
  exposure: CameraPostExposure;
  tonemap: CameraPostTonemap;
  grade: CameraPostGrade;
  grain: CameraPostGrain;
};

export type CameraAutoOrient = "off" | "along-path";

/**
 * Props stored on a `FrameObject` whose `type === "camera"`. The composition
 * may contain zero or more camera objects in `part.objects`. The first
 * non-hidden camera (in array order) is the active viewpoint; additional
 * cameras are inactive but persisted (matching After Effects layer model).
 *
 * Position uses Clipper's frame coordinate space (y-down). Rotations are
 * degrees applied in XYZ Euler order.
 *
 * `sensor` describes the physical sensor size (mm) used to convert focal
 * length to FOV. `dof` carries the optional depth-of-field block (focus
 * distance, f-number, blur level, max blur clamp). `autoOrient` lets the
 * camera follow its position track tangent ("along-path"), matching AE's
 * Auto-Orient → Orient Along Path. `lens` carries optical artefacts
 * (distortion, chromatic aberration, vignette). `post` carries
 * tone/colour post stages (exposure, tonemap, lift/gamma/gain grade,
 * grain).
 */
export type CameraObjectProps = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  fov: number;
  near: number;
  far: number;
  sensor: CameraSensor;
  dof: CameraDepthOfField;
  autoOrient: CameraAutoOrient;
  lens: CameraLens;
  post: CameraPost;
};

export const DEFAULT_CAMERA_SENSOR: CameraSensor = { width: 36, height: 24 };

export const DEFAULT_CAMERA_DOF: CameraDepthOfField = {
  enabled: false,
  focusDistance: 1158,
  fNumber: 2.8,
  maxBlurPx: CAMERA_DOF_MAX_BLUR_PX,
};

export const DEFAULT_CAMERA_LENS: CameraLens = {
  distortion: { enabled: false, amount: 0 },
  chromaticAberration: { enabled: false, amountPx: 1.5 },
  vignette: { enabled: false, amount: 0.4, feather: 0.5 },
};

export const DEFAULT_CAMERA_POST: CameraPost = {
  exposure: { enabled: false, ev: 0 },
  tonemap: { enabled: false, mode: "aces" },
  grade: { enabled: false, lift: 0, gamma: 1, gain: 1 },
  grain: { enabled: false, amount: 0.1, size: 1 },
};

export const DEFAULT_CAMERA_OBJECT_PROPS: CameraObjectProps = {
  position: { x: 0, y: 0, z: 1158 },
  rotation: { x: 0, y: 0, z: 0 },
  fov: 50,
  near: 1,
  far: 5000,
  sensor: { ...DEFAULT_CAMERA_SENSOR },
  dof: { ...DEFAULT_CAMERA_DOF },
  autoOrient: "off",
  lens: {
    ...DEFAULT_CAMERA_LENS,
    distortion: { ...DEFAULT_CAMERA_LENS.distortion },
    chromaticAberration: { ...DEFAULT_CAMERA_LENS.chromaticAberration },
    vignette: { ...DEFAULT_CAMERA_LENS.vignette },
  },
  post: {
    ...DEFAULT_CAMERA_POST,
    exposure: { ...DEFAULT_CAMERA_POST.exposure },
    tonemap: { ...DEFAULT_CAMERA_POST.tonemap },
    grade: { ...DEFAULT_CAMERA_POST.grade },
    grain: { ...DEFAULT_CAMERA_POST.grain },
  },
};

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

export type CompositionClip = TimelineMarkerMetadata & {
  id: string;
  compositionId?: string;
  filePath: string;
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
  renderMode?: CompositionRenderMode;
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

export type TimelineSettings = {
  frameRate?: number;
  previewFps?: 24 | 30 | 60;
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

export type TimelineMode = "compose" | "direct";

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

export type ProjectBinItem =
  | {
      id: string;
      kind: "folder";
      name: string;
      children?: ProjectBinItem[];
    }
  | {
      id: string;
      kind: "internal-file";
      name: string;
      language: string;
      source: string;
    }
  | {
      id: string;
      kind: "composition";
      name: string;
      compositionId: string;
    }
  | {
      id: string;
      kind: "timeline";
      name: string;
      timelineId: string;
    }
  | {
      id: string;
      kind: "external-proxy";
      name: string;
      path: string;
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
  bin?: ProjectBinItem[];
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
