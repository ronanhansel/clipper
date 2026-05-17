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
import { ComposeToolbar, type ComposeToolbarProps } from "./ComposeToolbar";
import { EditorPane } from "../../components/EditorPane";
import { usePreviewRenderScheduler } from "../../components/preview/scheduler/usePreviewRenderScheduler";
import { PreviewStrategyHost } from "../../components/preview/strategies/PreviewStrategyHost";
import {
  computeHasActiveLivePasses,
  computeHasLivePassCapableLayers,
  deriveAuthoringActive,
  selectPreviewStrategy,
} from "../../components/preview/strategies/selectPreviewStrategy";
import type { StrategyFramePreviewProps } from "../../components/preview/strategies/preview";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../core/types";
import type { PreviewFps } from "../../core/previewFps";
import type { PrerenderBlock } from "../features/preview/usePrerenderCache";
import type { Mode } from "../types";

type FramePreviewProps = StrategyFramePreviewProps;

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

type PreviewColumnProps = {
  blankFrameViewportStyle: CSSProperties;
  children: ReactNode;
  editorPaneProps: ComponentProps<typeof EditorPane> | null;
  framePreviewProps: FramePreviewProps | null;
  hasActiveComposition: boolean;
  liveDomPostProcessMaxFps: number;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  prerenderCacheEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  getPrerenderCacheBlockAtTime: (time: number) => PrerenderBlock | null;
  onPrerenderDisplayReadyChange: (ready: boolean) => void;
  currentSceneTimeRef: RefObject<number>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewFps: PreviewFps;
  previewKey: string;
  previewRenderScale: number;
  stageRef: ComponentProps<"div">["ref"];
  composeToolbarProps?: ComposeToolbarProps | null;
};

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
  mode,
  onModeChange,
  onPointerEnter,
  onPointerLeave,
  onPrerenderDisplayReadyChange,
  prerenderCacheBlackMissDebug,
  prerenderCacheEnabled,
  onScroll,
  previewFps,
  previewKey,
  previewRenderScale,
  stageRef,
}: PreviewColumnProps) {
  void previewKey;
  const lastActiveFramePreviewPropsRef = useRef<FramePreviewProps | null>(null);
  const isPlaying = framePreviewProps?.isPlaying ?? false;
  const scheduler = usePreviewRenderScheduler({
    fps: previewFps,
    isPlaying,
  });
  const [previewOverlayHost, setPreviewOverlayHost] =
    useState<HTMLDivElement | null>(null);
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
  const hasActiveLivePasses = renderFramePreviewProps
    ? computeHasActiveLivePasses(
        renderFramePreviewProps,
        currentSceneTimeRef.current,
      )
    : false;
  const hasLivePassCapableLayers = renderFramePreviewProps
    ? computeHasLivePassCapableLayers(renderFramePreviewProps)
    : false;
  const authoringActive = renderFramePreviewProps
    ? deriveAuthoringActive(renderFramePreviewProps)
    : false;
  const strategy = renderFramePreviewProps
    ? selectPreviewStrategy({
        framePreviewProps: renderFramePreviewProps,
        hasActiveLivePasses,
        hasLivePassCapableLayers,
        prerenderEnabled: displayPrerenderPreview,
        authoringActive,
      })
    : null;
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

      <div className="relative min-h-0 min-w-0 overflow-hidden">
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
            {renderFramePreviewProps && strategy ? (
              <div
                className="absolute left-0 top-0"
                data-clipper-fixed-preview-render
                data-clipper-preview-strategy={strategy.kind}
                data-clipper-preview-strategy-reason={strategy.reason}
                style={previewRenderStyle}
              >
                <PreviewStrategyHost
                  strategy={strategy}
                  framePreviewProps={renderFramePreviewProps}
                  currentSceneTimeRef={currentSceneTimeRef}
                  scheduler={scheduler}
                  liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
                  prerenderBlackMissDebug={prerenderCacheBlackMissDebug}
                  getPrerenderCacheBlockAtTime={getPrerenderCacheBlockAtTime}
                  onPrerenderDisplayReadyChange={onPrerenderDisplayReadyChange}
                />
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
