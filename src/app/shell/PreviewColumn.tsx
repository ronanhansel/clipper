import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from "react";
import {
  ChevronDown,
  MoveDiagonal2,
  MousePointer2 as PointerIcon,
  PenTool,
  Pencil,
  Type,
  Waypoints,
} from "lucide-react";
import {
  ArrowIcon,
  EllipseIcon,
  LineIcon,
  NullObjectIcon,
  Pattern2DIcon,
  PolygonIcon,
  RectIcon,
  StarIcon,
} from "../../components/ShapeIcons";
import { EditorPane } from "../../components/EditorPane";
import { FramePreview } from "../../components/preview/FramePreview";
import {
  FramePreviewLive,
  type FramePreviewLiveProps,
} from "../../components/preview/FramePreviewLive";
import {
  buildAdjustmentExecutionPlan,
  filterAdjustmentExecutionPlan,
  getVisualStyleForAdjustmentPlan,
} from "../../core/adjustments";
import {
  getLiveDomPostProcessPreflight,
  type LiveDomPostProcessCapability,
} from "../../core/effects/postprocess/liveDomCapability";
import { LiveDomPostProcessRenderer } from "../../core/effects/postprocess/liveDomRenderer";
import { measurePreviewPerf } from "../../core/effects/postprocess/perf";
import {
  selectLiveDomPostProcessPasses,
  withPostProcessFrameBackground,
} from "../../core/effects/postprocess/passes";
import {
  createDefaultPostProcessRenderer,
  type PostProcessRenderer,
} from "../../core/effects/postprocess/registry";
import type {
  AdjustmentVisualOverlay,
  AdjustmentVisualStyle,
  PostProcessPass,
} from "../../core/effects/types";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type TransitionLayer,
} from "../../core/types";
import type { PrerenderCacheBlock } from "../features/preview/usePrerenderCache";
import type { Mode } from "../types";

type PreviewStackPart = {
  part: ComponentProps<typeof FramePreview>["part"];
  start: number;
  previewTime: number;
};
// FramePreviewLive computes time-derived props internally from the live
// playhead. To switch the editor preview path to FramePreviewLive, AppContent
// supplies the live-extras (previewSceneContext, composeFilePart, etc.) on the
// same prop bag — the time-derived fields below are still present (kept for
// non-live FramePreview consumers in this file) but FramePreviewLive ignores
// them via its destructure.
type FramePreviewLiveExtras = Pick<
  FramePreviewLiveProps,
  | "previewSceneContext"
  | "timelineMode"
  | "composeMode"
  | "hasPreviewComposition"
  | "activeCompositionHidden"
  | "composeFilePart"
  | "selectedPart"
>;
type FramePreviewProps = ComponentProps<typeof FramePreview> & {
  previewParts?: PreviewStackPart[];
  transitionPreviewParts?: {
    from: PreviewStackPart[];
    to: PreviewStackPart[];
    fromSceneTime: number;
    toSceneTime: number;
    postProcessPasses: PostProcessPass[];
  } | null;
  transitionLayers?: TransitionLayer[];
} & FramePreviewLiveExtras;
type CachedPreviewDisplayMode = "dom" | "canvas2d" | "webgl";
const cachedMissGraceMs = 220;
const domFallbackReadyToleranceSeconds = 1 / 60;
function requiresDomOverlayPreview(props: FramePreviewProps): boolean {
  return (
    props.canSelectObjects ||
    props.focusPicking ||
    props.trackerPicking ||
    props.pickingTranslationPosition ||
    props.pickingZoomFocus ||
    props.framePickPoint !== null ||
    props.dragBox !== null ||
    props.marqueeDragging ||
    props.selectedObjects.length > 0 ||
    props.editingTextObjectId !== null
  );
}

function getPreviewPostProcessPasses(
  plan: ReturnType<typeof buildAdjustmentExecutionPlan>,
  props: FramePreviewProps,
) {
  return [
    ...plan.steps.flatMap((step) => step.postProcessPasses ?? []),
    ...(props.transitionPreviewParts?.postProcessPasses ?? []),
  ];
}

// Strip the time-derived fields FramePreviewLive owns. The remaining bag is
// the FramePreviewLiveProps shape AppContent supplies via PreviewColumn.
function toFramePreviewLiveProps(
  props: FramePreviewProps,
): FramePreviewLiveProps {
  const {
    part: _part,
    partStart: _partStart,
    previewParts: _previewParts,
    transitionPreviewParts: _transitionPreviewParts,
    previewTime: _previewTime,
    sceneTime: _sceneTime,
    motionLayers: _motionLayers,
    hiddenMotionLayerIds: _hiddenMotionLayerIds,
    adjustmentLayers: _adjustmentLayers,
    transitionLayers: _transitionLayers,
    compHidden: _compHidden,
    ...rest
  } = props;
  void _part;
  void _partStart;
  void _previewParts;
  void _transitionPreviewParts;
  void _previewTime;
  void _sceneTime;
  void _motionLayers;
  void _hiddenMotionLayerIds;
  void _adjustmentLayers;
  void _transitionLayers;
  void _compHidden;
  return rest as FramePreviewLiveProps;
}

type PreviewColumnProps = {
  blankFrameViewportStyle: CSSProperties;
  children: ReactNode;
  editorPaneProps: ComponentProps<typeof EditorPane> | null;
  framePreviewProps: FramePreviewProps | null;
  hasActiveComposition: boolean;
  liveDomPostProcessMaxFps: number;
  livePostProcessPreviewEnabled: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  prerenderCacheEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  getPrerenderCacheBlockAtTime: (time: number) => PrerenderCacheBlock | null;
  onCachedPreviewDisplayReadyChange: (ready: boolean) => void;
  currentSceneTimeRef: RefObject<number>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewKey: string;
  previewRenderScale: number;
  stageRef: ComponentProps<"div">["ref"];
  composeToolbarProps?: ComposeToolbarProps | null;
};

type ComposeToolbarProps = {
  activeTool: ComposeDrawTool | null;
  onAddNullObject: () => void;
  onActiveToolChange: (tool: ComposeDrawTool | null) => void;
  resizeMode: "resize" | "scale";
  onResizeModeChange: (mode: "resize" | "scale") => void;
};

type ComposeDrawTool =
  | "rect"
  | "line"
  | "arrow"
  | "ellipse"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "text"
  | "textPath"
  | "pattern2d"
  | "null";

type ToolbarTool = {
  tool: ComposeDrawTool;
  label: string;
  shortcut?: string;
  icon: ReactNode;
};

type CursorToolbarTool = {
  mode: "resize" | "scale";
  label: string;
  shortcut: string;
  icon: ReactNode;
};

const cursorTools: CursorToolbarTool[] = [
  {
    mode: "resize",
    label: "Select",
    shortcut: "V",
    icon: <PointerIcon size={17} />,
  },
  {
    mode: "scale",
    label: "Scale",
    shortcut: "K",
    icon: <MoveDiagonal2 size={15} />,
  },
];

const shapeTools: ToolbarTool[] = [
  {
    tool: "rect",
    label: "Rectangle",
    shortcut: "R",
    icon: <RectIcon size={17} />,
  },
  { tool: "line", label: "Line", shortcut: "L", icon: <LineIcon size={18} /> },
  {
    tool: "arrow",
    label: "Arrow",
    shortcut: "Shift L",
    icon: <ArrowIcon size={18} />,
  },
  {
    tool: "ellipse",
    label: "Ellipse",
    shortcut: "O",
    icon: <EllipseIcon size={17} />,
  },
  { tool: "polygon", label: "Polygon", icon: <PolygonIcon size={18} /> },
  { tool: "star", label: "Star", icon: <StarIcon size={18} /> },
];

const penTools: ToolbarTool[] = [
  { tool: "pen", label: "Pen", shortcut: "P", icon: <PenTool size={18} /> },
  {
    tool: "pencil",
    label: "Pencil",
    shortcut: "Shift P",
    icon: <Pencil size={18} />,
  },
];

const textTools: ToolbarTool[] = [
  { tool: "text", label: "Text", shortcut: "T", icon: <Type size={19} /> },
  { tool: "textPath", label: "Text on path", icon: <Waypoints size={18} /> },
];

const nullObjectTool: ToolbarTool = {
  tool: "null",
  label: "Null object",
  shortcut: "N",
  icon: <NullObjectIcon size={18} />,
};

const pattern2dTool: ToolbarTool = {
  tool: "pattern2d",
  label: "2D pattern",
  shortcut: "G",
  icon: <Pattern2DIcon size={18} />,
};

function ShortcutHint({ shortcut }: { shortcut?: string }) {
  if (!shortcut) return <span />;
  return (
    <span className="flex items-center gap-0.5 justify-self-end">
      {shortcut.split(" ").map((key) => (
        <kbd
          key={key}
          className="min-w-4 rounded-[4px] border border-[#343a47] bg-[#1a1e27] px-1 py-0.5 text-center text-[10px] font-bold leading-none text-[#aeb4c3] shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

export function PreviewColumn({
  blankFrameViewportStyle,
  children,
  composeToolbarProps,
  currentSceneTimeRef,
  editorPaneProps,
  framePreviewProps,
  getPrerenderCacheBlockAtTime,
  hasActiveComposition,
  liveDomPostProcessMaxFps,
  livePostProcessPreviewEnabled,
  mode,
  onModeChange,
  onPointerEnter,
  onPointerLeave,
  onCachedPreviewDisplayReadyChange,
  prerenderCacheBlackMissDebug,
  prerenderCacheEnabled,
  onScroll,
  previewKey,
  previewRenderScale,
  stageRef,
}: PreviewColumnProps) {
  const lastActiveFramePreviewPropsRef = useRef<FramePreviewProps | null>(null);
  const [previewOverlayHost, setPreviewOverlayHost] =
    useState<HTMLDivElement | null>(null);
  // Stabilize prerender renderer choice across mode switches: only
  // sync from prerenderCacheEnabled while in preview mode so the
  // active preview subtree (PrerenderVideoPreview vs FramePreview)
  // does not swap when the parent toggles prerender off in editor mode.
  const [displayPrerenderPreview, setDisplayPrerenderPreview] = useState(
    prerenderCacheEnabled,
  );
  useEffect(() => {
    if (mode === "preview") {
      setDisplayPrerenderPreview(prerenderCacheEnabled);
    }
  }, [mode, prerenderCacheEnabled]);

  if (framePreviewProps && hasActiveComposition)
    lastActiveFramePreviewPropsRef.current = framePreviewProps;
  const stableFramePreviewProps =
    hasActiveComposition || !lastActiveFramePreviewPropsRef.current
      ? framePreviewProps
      : framePreviewProps
        ? {
            ...lastActiveFramePreviewPropsRef.current,
            frameScale: framePreviewProps.frameScale,
            isPlaying: framePreviewProps.isPlaying,
            playbackClock: framePreviewProps.playbackClock,
            sceneTime: framePreviewProps.sceneTime,
          }
        : lastActiveFramePreviewPropsRef.current;
  const displayScale = stableFramePreviewProps
    ? stableFramePreviewProps.frameScale / previewRenderScale
    : 1;
  const activePreviewOverlayHost =
    mode === "preview" ? previewOverlayHost : null;
  const renderFramePreviewProps = stableFramePreviewProps
    ? {
        ...stableFramePreviewProps,
        frameScale: previewRenderScale,
        previewOverlayHost: activePreviewOverlayHost,
        selectionOverlayScale: displayScale,
      }
    : null;
  const renderDirectFramePreview =
    renderFramePreviewProps?.timelineMode === "compose";
  const livePostProcessRequired = renderFramePreviewProps
    ? !renderDirectFramePreview &&
      hasActiveLivePostProcessPass(
        renderFramePreviewProps,
        currentSceneTimeRef.current,
      )
    : false;
  const effectiveLivePostProcessPreviewEnabled =
    livePostProcessPreviewEnabled || livePostProcessRequired;
  const previewDisplayStyle = stableFramePreviewProps
    ? ({
        width: FRAME_WIDTH * stableFramePreviewProps.frameScale,
        height: FRAME_HEIGHT * stableFramePreviewProps.frameScale,
      } as CSSProperties)
    : undefined;
  const allowsDomOverlayOverflow = stableFramePreviewProps
    ? requiresDomOverlayPreview(stableFramePreviewProps)
    : false;
  const previewRenderStyle = stableFramePreviewProps
    ? ({
        backfaceVisibility: "hidden",
        contain: allowsDomOverlayOverflow ? undefined : "paint",
        filter: displayScale === 1 ? undefined : "blur(0)",
        left: 0,
        top: 0,
        width: FRAME_WIDTH * previewRenderScale,
        height: FRAME_HEIGHT * previewRenderScale,
        transform:
          displayScale === 1
            ? undefined
            : `translateZ(0) scale(${displayScale})`,
        transformOrigin: "top left",
        willChange: displayScale === 1 ? undefined : "transform",
      } as CSSProperties)
    : undefined;

  return (
    <section
      className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]"
      data-clipper-preview-column
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div
        className="grid place-items-center border-b border-[#2d313b] px-[18px]"
        data-clipper-preview-toolbar
      >
        <div
          className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          aria-label="Editor mode"
        >
          <button
            className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "preview" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`}
            onClick={() => onModeChange("preview")}
          >
            Preview
          </button>
          <button
            className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "editor" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`}
            onClick={() => onModeChange("editor")}
          >
            Editor
          </button>
        </div>
      </div>

      {/* Outer positioning container — NOT the scroll viewport, no stageRef */}
      <div className="relative min-h-0 min-w-0 overflow-hidden">
        {/* Preview scroll viewport — stageRef, onScroll, data-clipper-preview-stage live here */}
        <div
          ref={stageRef}
          className={`timeline-scrollbar absolute inset-0 grid place-items-center p-[22px] ${mode === "preview" ? "overflow-auto [scrollbar-gutter:stable]" : "invisible pointer-events-none overflow-hidden"}`}
          data-clipper-preview-stage
          onScroll={onScroll}
        >
          <div
            className="relative"
            data-clipper-fixed-preview-display
            style={previewDisplayStyle}
          >
            {renderFramePreviewProps ? (
              <div
                className="absolute left-0 top-0"
                data-clipper-fixed-preview-render
                style={previewRenderStyle}
              >
                {renderDirectFramePreview ? (
                  <FramePreviewLive
                    {...toFramePreviewLiveProps(renderFramePreviewProps)}
                  />
                ) : displayPrerenderPreview ? (
                  <PrerenderVideoPreview
                    blackMissDebug={prerenderCacheBlackMissDebug}
                    currentSceneTimeRef={currentSceneTimeRef}
                    framePreviewProps={renderFramePreviewProps}
                    getBlockAtTime={getPrerenderCacheBlockAtTime}
                    liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
                    livePostProcessPreviewEnabled={
                      effectiveLivePostProcessPreviewEnabled
                    }
                    onCachedPreviewDisplayReadyChange={
                      onCachedPreviewDisplayReadyChange
                    }
                  />
                ) : (
                  <LivePostProcessFramePreview
                    currentSceneTimeRef={currentSceneTimeRef}
                    framePreviewProps={renderFramePreviewProps}
                    liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
                    livePostProcessEnabled={
                      effectiveLivePostProcessPreviewEnabled
                    }
                  />
                )}
                {!hasActiveComposition &&
                !(mode === "editor" && !editorPaneProps) ? (
                  <div
                    className="pointer-events-none absolute left-0 top-0 z-[2147483647] bg-black"
                    data-clipper-stable-blank-preview-overlay
                    style={{
                      width: FRAME_WIDTH * previewRenderScale,
                      height: FRAME_HEIGHT * previewRenderScale,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          {!hasActiveComposition &&
          !renderFramePreviewProps &&
          !(mode === "editor" && !editorPaneProps) ? (
            <div
              className="relative overflow-hidden bg-black"
              aria-label="Blank preview frame"
              data-clipper-blank-frame-preview
              style={blankFrameViewportStyle}
            />
          ) : null}
        </div>

        {/* Editor overlay — sibling of scroll viewport, not inside it. Not affected by preview scrollTop/scrollLeft. */}
        {mode === "editor" && editorPaneProps ? (
          <div className="absolute inset-0 z-10">
            <EditorPane {...editorPaneProps} />
          </div>
        ) : null}
        {mode === "editor" && !editorPaneProps ? (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#12141a] p-6 text-center text-sm font-bold text-[#9b9da7]">
            No file is open in the editor.
          </div>
        ) : null}
        {mode === "preview" ? (
          <div
            ref={setPreviewOverlayHost}
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            data-clipper-preview-overlay-host
          />
        ) : null}
      </div>
      <div className="relative h-full">
        {mode === "preview" && composeToolbarProps ? (
          <ComposeToolbar {...composeToolbarProps} />
        ) : null}
        {children}
      </div>
    </section>
  );
}

function hasActiveLivePostProcessPass(
  framePreviewProps: FramePreviewProps,
  sceneTime: number,
) {
  const plan = buildAdjustmentExecutionPlan(
    sceneTime,
    framePreviewProps.adjustmentLayers,
    undefined,
    { width: FRAME_WIDTH, height: FRAME_HEIGHT },
  );
  return Boolean(
    selectLiveDomPostProcessPasses(
      getPreviewPostProcessPasses(plan, framePreviewProps),
    ).length,
  );
}

function ComposeToolbar({
  activeTool,
  onAddNullObject,
  onActiveToolChange,
  resizeMode,
  onResizeModeChange,
}: ComposeToolbarProps) {
  const [openMenu, setOpenMenu] = useState<
    "cursor" | "shapes" | "pen" | "text" | null
  >(null);
  const [lastShapeTool, setLastShapeTool] = useState<ComposeDrawTool>("rect");
  const [lastPenTool, setLastPenTool] = useState<ComposeDrawTool>("pen");
  const [lastTextTool, setLastTextTool] = useState<ComposeDrawTool>("text");
  const activeShapeTool = shapeTools.find((item) => item.tool === activeTool);
  const activePenTool = penTools.find((item) => item.tool === activeTool);
  const activeTextTool = textTools.find((item) => item.tool === activeTool);
  const currentShapeTool =
    activeShapeTool ?? shapeTools.find((item) => item.tool === lastShapeTool)!;
  const currentPenTool =
    activePenTool ?? penTools.find((item) => item.tool === lastPenTool)!;
  const currentTextTool =
    activeTextTool ?? textTools.find((item) => item.tool === lastTextTool)!;
  const currentCursorTool =
    cursorTools.find((item) => item.mode === resizeMode) ?? cursorTools[0];
  const cursorActive = activeTool === null;

  const toolButtonClass = (active: boolean) =>
    `grid h-8 w-8 place-items-center rounded-[7px] outline-none transition focus-visible:ring-2 focus-visible:ring-[rgb(var(--clipper-accent-rgb)/0.32)] ${active ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)] shadow-[0_0_0_3px_rgb(var(--clipper-accent-rgb)/0.12)]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-white"}`;
  const menuButtonClass = (active: boolean) =>
    `grid h-8 w-4 place-items-center rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-[rgb(var(--clipper-accent-rgb)/0.32)] ${active ? "bg-[#252a35] text-white" : "text-[#9b9da7] hover:bg-[#20232c] hover:text-white"}`;

  function selectTool(tool: ToolbarTool) {
    if (shapeTools.some((item) => item.tool === tool.tool))
      setLastShapeTool(tool.tool);
    if (penTools.some((item) => item.tool === tool.tool))
      setLastPenTool(tool.tool);
    if (textTools.some((item) => item.tool === tool.tool))
      setLastTextTool(tool.tool);
    onActiveToolChange(tool.tool);
    setOpenMenu(null);
  }

  function selectCursorMode(mode: "resize" | "scale") {
    onActiveToolChange(null);
    onResizeModeChange(mode);
    setOpenMenu(null);
  }

  function renderCursorMenu() {
    if (openMenu !== "cursor") return null;
    return (
      <div className="absolute bottom-full left-0 mb-2 w-[168px] rounded-[10px] border border-[#2d313b] bg-[#11141a] p-1.5 text-[#f7f7f8] shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
        <div className="grid gap-0.5">
          {cursorTools.map((item) => (
            <button
              key={item.mode}
              className="grid h-7 grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11px] font-semibold leading-none text-[#dfe2ea] outline-none transition hover:bg-[#20232c] hover:text-white focus-visible:bg-[#20232c] focus-visible:text-white"
              onClick={() => selectCursorMode(item.mode)}
            >
              <span className="grid place-items-center text-[11px] text-[var(--clipper-accent)]">
                {cursorActive && resizeMode === item.mode ? "✓" : null}
              </span>
              <span className="grid place-items-center [&_svg]:size-4">
                {item.icon}
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
              <ShortcutHint shortcut={item.shortcut} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderMenu(
    menu: "shapes" | "pen" | "text",
    tools: ToolbarTool[],
    widthClass: string,
  ) {
    if (openMenu !== menu) return null;
    return (
      <div
        className={`absolute bottom-full left-0 mb-2 rounded-[10px] border border-[#2d313b] bg-[#11141a] p-1.5 text-[#f7f7f8] shadow-[0_18px_60px_rgba(0,0,0,0.42)] ${widthClass}`}
      >
        <div className="grid gap-0.5">
          {tools.map((item) => (
            <button
              key={item.tool}
              className="grid h-7 grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[6px] px-1.5 text-left text-[11px] font-semibold leading-none text-[#dfe2ea] outline-none transition hover:bg-[#20232c] hover:text-white focus-visible:bg-[#20232c] focus-visible:text-white"
              onClick={() => selectTool(item)}
            >
              <span className="grid place-items-center text-[11px] text-[var(--clipper-accent)]">
                {activeTool === item.tool ? "✓" : null}
              </span>
              <span className="grid place-items-center [&_svg]:size-4">
                {item.icon}
              </span>
              <span className="min-w-0 truncate">{item.label}</span>
              <ShortcutHint shortcut={item.shortcut} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-[10px] border border-[#2d313b] bg-[#151820]/95 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur">
        <div className="relative flex items-center gap-1">
          {renderCursorMenu()}
          <button
            className={toolButtonClass(cursorActive)}
            title={currentCursorTool.label}
            aria-pressed={cursorActive}
            onClick={() => selectCursorMode(resizeMode)}
          >
            {currentCursorTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "cursor")}
            title="Cursor tools"
            onClick={() => setOpenMenu(openMenu === "cursor" ? null : "cursor")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="mx-1 h-6 w-px bg-[#313744]" />
        <div className="relative flex items-center gap-1">
          {renderMenu("shapes", shapeTools, "w-[224px]")}
          <button
            className={toolButtonClass(Boolean(activeShapeTool))}
            title={`Draw ${currentShapeTool.label.toLowerCase()}`}
            aria-pressed={Boolean(activeShapeTool)}
            onClick={() => selectTool(currentShapeTool)}
          >
            {currentShapeTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "shapes")}
            title="Shape tools"
            onClick={() => setOpenMenu(openMenu === "shapes" ? null : "shapes")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="relative flex items-center gap-1">
          {renderMenu("pen", penTools, "w-[188px]")}
          <button
            className={toolButtonClass(Boolean(activePenTool))}
            title={currentPenTool.label}
            aria-pressed={Boolean(activePenTool)}
            onClick={() => selectTool(currentPenTool)}
          >
            {currentPenTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "pen")}
            title="Pen tools"
            onClick={() => setOpenMenu(openMenu === "pen" ? null : "pen")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="relative flex items-center gap-1">
          {renderMenu("text", textTools, "w-[196px]")}
          <button
            className={toolButtonClass(Boolean(activeTextTool))}
            title={currentTextTool.label}
            aria-pressed={Boolean(activeTextTool)}
            onClick={() => selectTool(currentTextTool)}
          >
            {currentTextTool.icon}
          </button>
          <button
            className={menuButtonClass(openMenu === "text")}
            title="Text tools"
            onClick={() => setOpenMenu(openMenu === "text" ? null : "text")}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        <div className="mx-1 h-6 w-px bg-[#313744]" />
        <button
          className={toolButtonClass(activeTool === "pattern2d")}
          title={pattern2dTool.label}
          aria-pressed={activeTool === "pattern2d"}
          onClick={() => selectTool(pattern2dTool)}
        >
          {pattern2dTool.icon}
        </button>
        <button
          className={toolButtonClass(false)}
          title={nullObjectTool.label}
          aria-pressed={false}
          onClick={() => {
            onAddNullObject();
            setOpenMenu(null);
          }}
        >
          {nullObjectTool.icon}
        </button>
      </div>
    </div>
  );
}

function PrerenderVideoPreview({
  blackMissDebug,
  currentSceneTimeRef,
  framePreviewProps,
  getBlockAtTime,
  liveDomPostProcessMaxFps,
  livePostProcessPreviewEnabled,
  onCachedPreviewDisplayReadyChange,
}: {
  blackMissDebug: boolean;
  currentSceneTimeRef: RefObject<number>;
  framePreviewProps: FramePreviewProps;
  getBlockAtTime: (time: number) => PrerenderCacheBlock | null;
  liveDomPostProcessMaxFps: number;
  livePostProcessPreviewEnabled: boolean;
  onCachedPreviewDisplayReadyChange: (ready: boolean) => void;
}) {
  const canvas2dRef = useRef<HTMLCanvasElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglScratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const postProcessRenderersRef = useRef<Map<string, PostProcessRenderer>>(
    new Map(),
  );
  const lastFrameKeyRef = useRef("");
  const cachedVisualStyleKeyRef = useRef("");
  const firstMissAtRef = useRef<number | null>(null);
  const displayReadyRef = useRef(false);
  const initialDisplayMode = framePreviewProps.isPlaying ? "canvas2d" : "dom";
  const displayModeRef = useRef<CachedPreviewDisplayMode>(initialDisplayMode);
  const [displayMode, setDisplayMode] =
    useState<CachedPreviewDisplayMode>(initialDisplayMode);
  const frameScale = framePreviewProps.frameScale;
  const previewStyle = {
    width: FRAME_WIDTH * frameScale,
    height: FRAME_HEIGHT * frameScale,
  } as CSSProperties;
  const cachedCanvasStyle = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    transform: `scale(${frameScale})`,
    transformOrigin: "top left",
  } as CSSProperties;
  const [cachedVisualStyle, setCachedVisualStyle] =
    useState<AdjustmentVisualStyle>({});
  const cachedCanvasFilterStyle = cachedVisualStyle.filter
    ? ({ filter: cachedVisualStyle.filter } as CSSProperties)
    : undefined;

  function updateDisplayMode(nextMode: CachedPreviewDisplayMode) {
    if (displayModeRef.current === nextMode) return;
    displayModeRef.current = nextMode;
    setDisplayMode(nextMode);
  }

  function updateDisplayReady(ready: boolean) {
    if (displayReadyRef.current === ready) return;
    displayReadyRef.current = ready;
    onCachedPreviewDisplayReadyChange(ready);
  }

  function updateCachedVisualStyle(style: AdjustmentVisualStyle) {
    const key = JSON.stringify(style);
    if (cachedVisualStyleKeyRef.current === key) return;
    cachedVisualStyleKeyRef.current = key;
    setCachedVisualStyle(style);
  }

  useEffect(() => {
    for (const canvas of [canvas2dRef.current, webglCanvasRef.current]) {
      if (!canvas) continue;
      canvas.width = FRAME_WIDTH;
      canvas.height = FRAME_HEIGHT;
    }
  }, []);

  useEffect(() => {
    let frameId = 0;
    const sync = () => {
      drawCachedFrameAtTime(currentSceneTimeRef.current);
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [currentSceneTimeRef, framePreviewProps.adjustmentLayers, getBlockAtTime]);

  useEffect(
    () => () => {
      destroyCachedPostProcessRenderer();
      updateDisplayReady(false);
    },
    [],
  );

  function getPostProcessRenderer(kind: string) {
    const existing = postProcessRenderersRef.current.get(kind);
    if (existing) return existing;
    const renderer = createDefaultPostProcessRenderer(kind);
    if (renderer) postProcessRenderersRef.current.set(kind, renderer);
    return renderer;
  }

  function destroyCachedPostProcessRenderer() {
    for (const renderer of postProcessRenderersRef.current.values())
      renderer.destroy();
    postProcessRenderersRef.current.clear();
  }

  function drawCachedFrameAtTime(sceneTime: number) {
    if (requiresDomOverlayPreview(framePreviewProps)) {
      showDomFallback();
      return;
    }

    const block = getBlockAtTime(sceneTime);
    const frame = block ? getFrameForTime(block, sceneTime) : null;
    if (!block || !frame) {
      showTransientMiss(sceneTime);
      return;
    }

    firstMissAtRef.current = null;
    const plan = measurePreviewPerf("cached.buildAdjustmentExecutionPlan", () =>
      buildAdjustmentExecutionPlan(
        sceneTime,
        framePreviewProps.adjustmentLayers,
        undefined,
        { width: block.width, height: block.height },
      ),
    );
    const postProcessPasses = getPreviewPostProcessPasses(
      plan,
      framePreviewProps,
    );
    const webGlPostProcessPasses =
      selectLiveDomPostProcessPasses(postProcessPasses);
    const lastWebGlPass = webGlPostProcessPasses.at(-1);
    const cachedVisualStyle = lastWebGlPass
      ? getVisualStyleForAdjustmentPlan(
          filterAdjustmentExecutionPlan(
            plan,
            "after",
            lastWebGlPass.sourceLayerId,
          ),
        )
      : getVisualStyleForAdjustmentPlan(plan);
    if (
      webGlPostProcessPasses.length > 0 &&
      getVisualStyleForAdjustmentPlan(
        filterAdjustmentExecutionPlan(
          plan,
          "before",
          webGlPostProcessPasses[0]?.sourceLayerId,
        ),
      ).filter
    ) {
      showDomFallback();
      return;
    }
    updateCachedVisualStyle(cachedVisualStyle);
    const targetDisplayMode: CachedPreviewDisplayMode =
      webGlPostProcessPasses.length > 0 ? "webgl" : "canvas2d";
    const frameKey = `${targetDisplayMode}:${block.startTime}:${frame.sceneTime}:${JSON.stringify(postProcessPasses)}`;
    if (lastFrameKeyRef.current !== frameKey) {
      if (webGlPostProcessPasses.length > 0) {
        const canvas = webglCanvasRef.current;
        if (!canvas) {
          showDomFallback();
          return;
        }
        const rendered = renderCachedPostProcessPasses({
          canvas,
          source: frame.bitmap,
          passes: webGlPostProcessPasses.map((pass) =>
            withPostProcessFrameBackground(
              pass,
              framePreviewProps.part.frame.style.backgroundColor,
            ),
          ),
          width: block.width,
          height: block.height,
        });
        if (!rendered) {
          showDomFallback();
          return;
        }
      } else {
        const canvas = canvas2dRef.current;
        if (!canvas) {
          showDomFallback();
          return;
        }
        const context = canvas.getContext("2d", {
          alpha: true,
          colorSpace: "srgb",
        });
        if (!context) {
          showDomFallback();
          return;
        }
        measurePreviewPerf("cached.canvas2d.drawFrameImage", () =>
          drawFrameImage(context, frame.bitmap, block.width, block.height),
        );
      }
      lastFrameKeyRef.current = frameKey;
    }
    updateDisplayMode(targetDisplayMode);
    updateDisplayReady(true);
  }

  function renderCachedPostProcessPasses(input: {
    canvas: HTMLCanvasElement;
    source: TexImageSource;
    passes: ReturnType<typeof selectLiveDomPostProcessPasses>;
    width: number;
    height: number;
  }) {
    let sourceFrame = input.source;
    webglScratchCanvasRef.current ??= document.createElement("canvas");
    const scratchCanvases = [
      canvas2dRef.current,
      webglScratchCanvasRef.current,
    ].filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas));
    for (let index = 0; index < input.passes.length; index += 1) {
      const pass = input.passes[index];
      const renderer = getPostProcessRenderer(pass.kind);
      if (!renderer) return false;
      const isLast = index === input.passes.length - 1;
      const outputCanvas = isLast
        ? input.canvas
        : (scratchCanvases[index % scratchCanvases.length] ?? input.canvas);
      const rendered = measurePreviewPerf("cached.webgl.render", () =>
        renderer.render(
          outputCanvas,
          sourceFrame,
          pass,
          input.width,
          input.height,
        ),
      );
      if (!rendered) return false;
      sourceFrame = outputCanvas;
    }
    return true;
  }

  function showDomFallback() {
    updateDisplayReady(false);
    lastFrameKeyRef.current = "";
    firstMissAtRef.current = null;
    if (displayModeRef.current === "dom") return;
    updateDisplayMode("dom");
  }

  function showTransientMiss(sceneTime: number) {
    const now = performance.now();
    firstMissAtRef.current ??= now;
    updateDisplayReady(false);
    if (
      displayModeRef.current !== "dom" &&
      lastFrameKeyRef.current &&
      now - firstMissAtRef.current < cachedMissGraceMs
    )
      return;
    if (!isDomFallbackReady(sceneTime) && lastFrameKeyRef.current) {
      updateDisplayMode(
        displayModeRef.current === "webgl" ? "webgl" : "canvas2d",
      );
      return;
    }
    if (blackMissDebug || framePreviewProps.isPlaying) showBlackMiss();
    else showDomFallback();
  }

  function showBlackMiss() {
    const canvas = canvas2dRef.current;
    if (canvas && lastFrameKeyRef.current !== "black") {
      const context = canvas.getContext("2d", {
        alpha: true,
        colorSpace: "srgb",
      });
      if (context) {
        context.fillStyle = "#000";
        context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
      }
      lastFrameKeyRef.current = "black";
    }
    updateDisplayMode("canvas2d");
    updateDisplayReady(false);
  }

  function isDomFallbackReady(sceneTime: number) {
    return (
      Math.abs(framePreviewProps.sceneTime - sceneTime) <=
      domFallbackReadyToleranceSeconds
    );
  }

  const showingCachedCanvas = displayMode !== "dom";
  const showingCanvas2d = displayMode === "canvas2d";
  const showingWebgl = displayMode === "webgl";

  return (
    <div
      className="relative"
      data-clipper-prerender-video-preview-wrapper
      style={previewStyle}
    >
      <div
        className="relative"
        data-clipper-prerender-video-preview-stage
        style={previewStyle}
      >
        <div
          className={`absolute left-0 top-0 ${showingCachedCanvas ? "pointer-events-none opacity-0 invisible" : "opacity-100 visible"}`}
          aria-hidden={showingCachedCanvas}
        >
          <LivePostProcessFramePreview
            currentSceneTimeRef={currentSceneTimeRef}
            framePreviewProps={framePreviewProps}
            liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
            livePostProcessEnabled={
              livePostProcessPreviewEnabled && displayMode === "dom"
            }
          />
        </div>
        <canvas
          ref={canvas2dRef}
          className={`absolute left-0 top-0 bg-black ${showingCanvas2d ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ ...cachedCanvasStyle, ...cachedCanvasFilterStyle }}
          data-clipper-prerender-canvas-preview="2d"
        />
        <canvas
          ref={webglCanvasRef}
          className={`absolute left-0 top-0 bg-black ${showingWebgl ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ ...cachedCanvasStyle, ...cachedCanvasFilterStyle }}
          data-clipper-prerender-canvas-preview="webgl"
        />
        {showingCachedCanvas ? (
          <LiveVisualOverlays overlays={cachedVisualStyle.overlays} />
        ) : null}
      </div>
    </div>
  );
}

function LivePostProcessFramePreview({
  currentSceneTimeRef,
  framePreviewProps,
  liveDomPostProcessMaxFps,
  livePostProcessEnabled,
}: {
  currentSceneTimeRef: RefObject<number>;
  framePreviewProps: FramePreviewProps;
  liveDomPostProcessMaxFps: number;
  livePostProcessEnabled: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const normalPreviewRef = useRef<HTMLDivElement | null>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceElementRef = useRef<HTMLDivElement | null>(null);
  const sourceCameraRef = useRef<HTMLDivElement | null>(null);
  const sourceFrameViewportRef = useRef<HTMLDivElement | null>(null);
  const sourceDragSelectionBoxRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<LiveDomPostProcessRenderer | null>(null);
  const previewLayersRef = useRef<AdjustmentLayer[] | null>(null);
  const missingTextureUploadRef = useRef(false);
  const diagnosticReasonRef = useRef<
    LiveDomPostProcessCapability["reason"] | null
  >(null);
  const showLiveCanvasRef = useRef(false);
  const activeLiveSourceRequiredRef = useRef(false);
  const activeLivePostProcessPassRef = useRef(false);
  const liveVisualStyleKeyRef = useRef("");
  const lastLiveRenderAtRef = useRef(0);
  const hasValidLiveFrameRef = useRef(false);
  const hasActivatedLiveCanvasRef = useRef(false);
  const liveRenderDirtyRef = useRef(true);
  const lastStoppedSceneTimeRef = useRef<number | null>(null);
  const [showLiveCanvas, setShowLiveCanvas] = useState(false);
  const [activeLiveSourceRequired, setActiveLiveSourceRequired] =
    useState(false);
  const [liveVisualStyle, setLiveVisualStyle] = useState<AdjustmentVisualStyle>(
    {},
  );
  const [diagnosticReason, setDiagnosticReason] = useState<
    LiveDomPostProcessCapability["reason"] | null
  >(null);
  const frameScale = framePreviewProps.frameScale;
  const livePostProcessMinFrameIntervalMs =
    1000 / Math.max(1, liveDomPostProcessMaxFps);
  const previewStyle = {
    width: FRAME_WIDTH * frameScale,
    height: FRAME_HEIGHT * frameScale,
  } as CSSProperties;
  const liveCanvasStyle = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    transform: `scale(${frameScale})`,
    transformOrigin: "top left",
  } as CSSProperties;
  const sourceCanvasStyle = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    left: 0,
    top: 0,
    overflow: "hidden",
  } as CSSProperties;
  const sourceFramePreviewProps: FramePreviewProps = {
    ...framePreviewProps,
    cameraRef: sourceCameraRef,
    canSelectObjects: false,
    dragBox: null,
    dragSelectionBoxRef: sourceDragSelectionBoxRef,
    editingTextObjectId: null,
    focusPicking: false,
    framePickPoint: null,
    frameScale: 1,
    frameViewportRef: sourceFrameViewportRef,
    marqueeDragging: false,
    pickingTranslationPosition: false,
    pickingZoomFocus: false,
    selectedObjects: [],
    trackerPicking: false,
    onFramePointerCancel: noopFramePointer,
    onFramePointerDown: noopFramePointer,
    onFramePointerDownCapture: noopFramePointer,
    onFramePointerMove: noopFramePointer,
    onFramePointerUp: noopFramePointer,
    onObjectPointerDown: noopObjectPointerDown,
    onObjectResizePointerDown: noopObjectResizePointerDown,
    onTextEditCommit: noopTextEditCommit,
    onTextObjectDoubleClick: noopTextObjectDoubleClick,
    onTrackerTargetPick: noopTrackerTargetPick,
  };

  function updateDiagnosticReason(
    reason: LiveDomPostProcessCapability["reason"] | null,
  ) {
    if (diagnosticReasonRef.current === reason) return;
    diagnosticReasonRef.current = reason;
    setDiagnosticReason(reason);
  }

  function updateShowLiveCanvas(value: boolean) {
    const changed = showLiveCanvasRef.current !== value;
    showLiveCanvasRef.current = value;
    if (renderCanvasRef.current) {
      renderCanvasRef.current.style.opacity = "1";
      renderCanvasRef.current.style.visibility = "visible";
      renderCanvasRef.current.style.pointerEvents = "none";
    }
    if (normalPreviewRef.current) {
      normalPreviewRef.current.style.opacity = value ? "0" : "1";
      normalPreviewRef.current.style.visibility = value ? "hidden" : "visible";
      normalPreviewRef.current.style.pointerEvents = value ? "none" : "";
    }
    if (!changed) return;
    setShowLiveCanvas(value);
  }

  function hideLiveCanvas() {
    hasValidLiveFrameRef.current = false;
    hasActivatedLiveCanvasRef.current = false;
    liveRenderDirtyRef.current = true;
    lastStoppedSceneTimeRef.current = null;
    updateShowLiveCanvas(false);
  }

  function clearInactiveLivePreview(
    reason: LiveDomPostProcessCapability["reason"] | null,
  ) {
    activeLivePostProcessPassRef.current = false;
    hideLiveCanvas();
    missingTextureUploadRef.current = false;
    updateDiagnosticReason(reason);
    rendererRef.current?.destroy();
    rendererRef.current = null;
  }

  function keepLastLiveFrameIfAvailable() {
    updateShowLiveCanvas(
      hasActivatedLiveCanvasRef.current && hasValidLiveFrameRef.current,
    );
  }

  function renderLiveFrame() {
    const canvas = renderCanvasRef.current;
    const layers =
      previewLayersRef.current ?? framePreviewProps.adjustmentLayers;
    const sceneTime = currentSceneTimeRef.current;
    const plan = measurePreviewPerf("live.collectRequirement", () =>
      buildAdjustmentExecutionPlan(sceneTime, layers, undefined, {
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
      }),
    );
    const passes = getPreviewPostProcessPasses(plan, framePreviewProps);
    const livePasses = selectLiveDomPostProcessPasses(passes);
    const optIn = livePostProcessEnabled;
    if (!canvas || !livePasses.length || !livePostProcessEnabled || !optIn) {
      updateActiveLiveSourceRequired(
        passes.some((pass) => pass.requiresLiveDomSource),
      );
      clearInactiveLivePreview(
        !livePostProcessEnabled || !optIn ? "not-opted-in" : null,
      );
      return false;
    }
    const source =
      sourceElementRef.current ??
      sourceCanvasRef.current?.querySelector<Element>(
        ":scope > [data-clipper-frame-content]",
      ) ??
      null;
    if (!source) {
      keepLastLiveFrameIfAvailable();
      updateDiagnosticReason("missing-source");
      return false;
    }
    const preflight = measurePreviewPerf("live.preflight", () =>
      getLiveDomPostProcessPreflight({
        optIn,
        sourceElement: source,
        canvas: sourceCanvasRef.current ?? canvas,
      }),
    );
    if (!preflight.supported) {
      keepLastLiveFrameIfAvailable();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      updateDiagnosticReason(preflight.reason);
      return preflight.reason !== "missing-source";
    }
    if (missingTextureUploadRef.current) {
      keepLastLiveFrameIfAvailable();
      updateDiagnosticReason("missing-draw-element-image");
      return true;
    }

    rendererRef.current ??= new LiveDomPostProcessRenderer();
    const result = measurePreviewPerf("live.renderer.render", () =>
      rendererRef.current!.render({
        canvas,
        sourceCanvas: sourceCanvasRef.current ?? canvas,
        sourceElement: source,
        passes: livePasses.map((pass) =>
          withPostProcessFrameBackground(
            pass,
            framePreviewProps.part.frame.style.backgroundColor,
          ),
        ),
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        optIn,
      }),
    );
    if (result.rendered) {
      hasValidLiveFrameRef.current = true;
      hasActivatedLiveCanvasRef.current = true;
      updateShowLiveCanvas(true);
    } else {
      keepLastLiveFrameIfAvailable();
    }
    updateDiagnosticReason(result.rendered ? null : result.capability.reason);
    if (!result.rendered) {
      if (result.capability.reason === "missing-draw-element-image") {
        missingTextureUploadRef.current = true;
      } else {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    }
    return true;
  }

  function updateActiveLiveSourceRequired(value: boolean) {
    if (activeLiveSourceRequiredRef.current === value) return;
    activeLiveSourceRequiredRef.current = value;
    setActiveLiveSourceRequired(value);
  }

  function updateLiveVisualStyle(style: AdjustmentVisualStyle) {
    const key = JSON.stringify(style);
    if (liveVisualStyleKeyRef.current === key) return;
    liveVisualStyleKeyRef.current = key;
    setLiveVisualStyle(style);
  }

  useEffect(() => {
    const handlePreview = (event: Event) => {
      const layers =
        (event as CustomEvent<{ layers?: AdjustmentLayer[] | null }>).detail
          ?.layers ?? null;
      previewLayersRef.current = layers;
      liveRenderDirtyRef.current = true;
      if (!livePostProcessEnabled) {
        clearInactiveLivePreview("not-opted-in");
        return;
      }
      const plan = measurePreviewPerf("live.event.collectRequirement", () =>
        buildAdjustmentExecutionPlan(
          currentSceneTimeRef.current,
          layers ?? framePreviewProps.adjustmentLayers,
          undefined,
          { width: FRAME_WIDTH, height: FRAME_HEIGHT },
        ),
      );
      const livePasses = selectLiveDomPostProcessPasses(
        getPreviewPostProcessPasses(plan, framePreviewProps),
      );
      if (!livePasses.length) clearInactiveLivePreview(null);
    };
    window.addEventListener(
      "clipper:preview-postprocess-adjustment",
      handlePreview,
    );
    return () =>
      window.removeEventListener(
        "clipper:preview-postprocess-adjustment",
        handlePreview,
      );
  }, [
    currentSceneTimeRef,
    framePreviewProps.adjustmentLayers,
    livePostProcessEnabled,
  ]);

  useEffect(() => {
    previewLayersRef.current = null;
    liveRenderDirtyRef.current = true;
    const plan = measurePreviewPerf("live.effect.collectRequirement", () =>
      buildAdjustmentExecutionPlan(
        currentSceneTimeRef.current,
        framePreviewProps.adjustmentLayers,
        undefined,
        { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      ),
    );
    const livePasses = selectLiveDomPostProcessPasses(
      getPreviewPostProcessPasses(plan, framePreviewProps),
    );
    if (!livePostProcessEnabled || !livePasses.length)
      clearInactiveLivePreview(!livePostProcessEnabled ? "not-opted-in" : null);
  }, [framePreviewProps.adjustmentLayers]);

  useEffect(() => {
    liveRenderDirtyRef.current = true;
    if (!livePostProcessEnabled) clearInactiveLivePreview("not-opted-in");
  }, [livePostProcessEnabled]);

  useEffect(() => {
    liveRenderDirtyRef.current = true;
    hideLiveCanvas();
  }, [framePreviewProps.part]);

  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (!canvas || canvas.hasAttribute("layoutsubtree")) return;
    canvas.setAttribute("layoutsubtree", "");
  }, [activeLiveSourceRequired, showLiveCanvas]);

  useEffect(() => {
    let frameId = 0;
    const sync = (now: number) => {
      if (requiresDomOverlayPreview(framePreviewProps)) {
        clearInactiveLivePreview("not-opted-in");
        frameId = requestAnimationFrame(sync);
        return;
      }
      const canvas = renderCanvasRef.current;
      const layers =
        previewLayersRef.current ?? framePreviewProps.adjustmentLayers;
      const sceneTime = currentSceneTimeRef.current;
      const plan = measurePreviewPerf("live.raf.collectRequirement", () =>
        buildAdjustmentExecutionPlan(sceneTime, layers, undefined, {
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
        }),
      );
      const passes = getPreviewPostProcessPasses(plan, framePreviewProps);
      const livePasses = selectLiveDomPostProcessPasses(passes);
      const lastLivePass = livePasses.at(-1);
      const optIn = livePostProcessEnabled;
      if (!canvas || !livePasses.length || !livePostProcessEnabled || !optIn) {
        updateActiveLiveSourceRequired(
          passes.some((pass) => pass.requiresLiveDomSource),
        );
        clearInactiveLivePreview(
          !livePostProcessEnabled || !optIn ? "not-opted-in" : null,
        );
        frameId = requestAnimationFrame(sync);
        return;
      }
      const enteringLivePostProcess = !activeLivePostProcessPassRef.current;
      activeLivePostProcessPassRef.current = true;
      if (enteringLivePostProcess) liveRenderDirtyRef.current = true;
      updateActiveLiveSourceRequired(
        passes.some((pass) => pass.requiresLiveDomSource),
      );
      const visualStyle = measurePreviewPerf(
        "live.applyAdjustmentLayersToVisualStyle",
        () =>
          getVisualStyleForAdjustmentPlan(
            filterAdjustmentExecutionPlan(
              plan,
              "after",
              lastLivePass?.sourceLayerId,
            ),
          ),
      );
      updateLiveVisualStyle(visualStyle);
      keepLastLiveFrameIfAvailable();
      if (
        !framePreviewProps.isPlaying &&
        lastStoppedSceneTimeRef.current !== sceneTime
      ) {
        liveRenderDirtyRef.current = true;
        lastStoppedSceneTimeRef.current = sceneTime;
      }
      const minFrameIntervalMs = framePreviewProps.isPlaying
        ? livePostProcessMinFrameIntervalMs
        : 1000 / 30;
      const elapsedSinceRender = now - lastLiveRenderAtRef.current;
      const shouldRender =
        framePreviewProps.isPlaying || liveRenderDirtyRef.current;
      if (!shouldRender) {
        frameId = requestAnimationFrame(sync);
        return;
      }
      if (
        framePreviewProps.isPlaying &&
        !enteringLivePostProcess &&
        elapsedSinceRender < minFrameIntervalMs
      ) {
        frameId = requestAnimationFrame(sync);
        return;
      }
      lastLiveRenderAtRef.current = now;
      const renderAttemptComplete = renderLiveFrame();
      if (renderAttemptComplete && !framePreviewProps.isPlaying)
        liveRenderDirtyRef.current = false;
      if (renderAttemptComplete && framePreviewProps.isPlaying)
        liveRenderDirtyRef.current = false;
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => {
      cancelAnimationFrame(frameId);
      rendererRef.current?.destroy();
      rendererRef.current = null;
      showLiveCanvasRef.current = false;
      activeLivePostProcessPassRef.current = false;
      hasValidLiveFrameRef.current = false;
      hasActivatedLiveCanvasRef.current = false;
      liveRenderDirtyRef.current = true;
      lastStoppedSceneTimeRef.current = null;
      if (normalPreviewRef.current) {
        normalPreviewRef.current.style.opacity = "1";
        normalPreviewRef.current.style.visibility = "visible";
        normalPreviewRef.current.style.pointerEvents = "";
      }
    };
  }, [
    currentSceneTimeRef,
    framePreviewProps.adjustmentLayers,
    livePostProcessEnabled,
  ]);

  const outputRequiresLiveSource =
    livePostProcessEnabled && activeLiveSourceRequired;
  const liveCanvasFilterStyle = liveVisualStyle.filter
    ? ({ filter: liveVisualStyle.filter } as CSSProperties)
    : undefined;
  const sourcePlan = livePostProcessEnabled
    ? buildAdjustmentExecutionPlan(
        currentSceneTimeRef.current,
        previewLayersRef.current ?? framePreviewProps.adjustmentLayers,
        undefined,
        { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      )
    : null;
  const sourceLayerId = sourcePlan
    ? selectLiveDomPostProcessPasses(
        getPreviewPostProcessPasses(sourcePlan, framePreviewProps),
      )[0]?.sourceLayerId
    : undefined;
  const sourceAdjustmentLayers =
    sourcePlan && sourceLayerId
      ? filterAdjustmentExecutionPlan(sourcePlan, "before", sourceLayerId)
          .activeLayers
      : framePreviewProps.adjustmentLayers;

  return (
    <div
      className="relative overflow-hidden bg-black"
      data-clipper-live-postprocess-preview-wrapper
      data-clipper-live-postprocess-status={diagnosticReason ?? "ready"}
      ref={wrapperRef}
      style={previewStyle}
    >
      <div
        className="absolute inset-0 z-10 overflow-hidden"
        aria-hidden={showLiveCanvas}
        ref={normalPreviewRef}
        style={{
          opacity: showLiveCanvas ? 0 : 1,
          pointerEvents: showLiveCanvas ? "none" : undefined,
          visibility: showLiveCanvas ? "hidden" : "visible",
        }}
      >
        <FramePreviewLive {...toFramePreviewLiveProps(framePreviewProps)} />
      </div>
      {livePostProcessEnabled ? (
        <canvas
          aria-hidden="true"
          ref={sourceCanvasRef}
          className="pointer-events-none absolute left-0 top-0 -z-10 block opacity-0"
          data-clipper-live-postprocess-source-canvas="draw-element-image-alpha"
          height={FRAME_HEIGHT}
          style={sourceCanvasStyle}
          width={FRAME_WIDTH}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute"
            data-clipper-live-postprocess-source
            inert={true}
            ref={sourceElementRef}
            style={sourceCanvasStyle}
          >
            <FramePreviewLive
              {...toFramePreviewLiveProps(sourceFramePreviewProps)}
              adjustmentLayersOverride={sourceAdjustmentLayers}
            />
          </div>
        </canvas>
      ) : null}
      {livePostProcessEnabled || showLiveCanvas ? (
        <canvas
          aria-hidden="true"
          ref={renderCanvasRef}
          className="pointer-events-none absolute left-0 top-0 z-0 block bg-black"
          data-clipper-live-postprocess-canvas="webgl-output"
          height={FRAME_HEIGHT}
          style={{
            ...liveCanvasStyle,
            ...liveCanvasFilterStyle,
            opacity: 1,
            visibility: "visible",
          }}
          width={FRAME_WIDTH}
        />
      ) : null}
      {showLiveCanvas ? (
        <LiveVisualOverlays overlays={liveVisualStyle.overlays} />
      ) : null}
    </div>
  );
}

function LiveVisualOverlays({
  overlays,
}: {
  overlays: AdjustmentVisualOverlay[] | undefined;
}) {
  return (
    <>
      {overlays?.map((overlay) => (
        <div
          className="pointer-events-none absolute inset-0"
          key={overlay.id}
          style={{ zIndex: 2147483647, ...overlay.style }}
        />
      ))}
    </>
  );
}

const noopFramePointer: FramePreviewProps["onFramePointerDown"] = () => {};
const noopObjectPointerDown: FramePreviewProps["onObjectPointerDown"] =
  () => {};
const noopObjectResizePointerDown: FramePreviewProps["onObjectResizePointerDown"] =
  () => {};
const noopTextEditCommit: FramePreviewProps["onTextEditCommit"] = () => {};
const noopTextObjectDoubleClick: FramePreviewProps["onTextObjectDoubleClick"] =
  () => {};
const noopTrackerTargetPick: FramePreviewProps["onTrackerTargetPick"] =
  () => {};

function drawFrameImage(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
) {
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0);
}

function getFrameForTime(block: PrerenderCacheBlock, sceneTime: number) {
  const sceneFrameIndex = Math.round(sceneTime * block.frameRate);
  const blockStartFrameIndex = Math.round(block.startTime * block.frameRate);
  const frameIndex = sceneFrameIndex - blockStartFrameIndex;
  if (frameIndex < 0 || frameIndex >= block.frames.length) return null;
  return block.frames[frameIndex] ?? null;
}
