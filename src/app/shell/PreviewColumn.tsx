import { useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type UIEvent } from "react";
import { EditorPane } from "../../components/EditorPane";
import { FramePreview } from "../../components/preview/FramePreview";
import { FRAME_HEIGHT, FRAME_WIDTH, type TransitionLayer } from "../../core/types";
import type { RasterPreviewFrame } from "../features/preview/useRasterPreviewCache";
import type { Mode } from "../types";

type PreviewStackPart = { part: ComponentProps<typeof FramePreview>["part"]; start: number; previewTime: number };
type FramePreviewProps = ComponentProps<typeof FramePreview> & { previewParts?: PreviewStackPart[]; transitionPreviewParts?: { from: PreviewStackPart[]; to: PreviewStackPart[]; fromSceneTime: number; toSceneTime: number } | null; transitionLayers?: TransitionLayer[] };

type PreviewColumnProps = {
  blankFrameViewportStyle: CSSProperties;
  children: ReactNode;
  editorPaneProps: ComponentProps<typeof EditorPane> | null;
  framePreviewProps: FramePreviewProps | null;
  hasActiveComposition: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  rasterPreviewEnabled: boolean;
  rasterPreviewFrame: RasterPreviewFrame | null;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewKey: string;
  stageRef: ComponentProps<"div">["ref"];
};

export function PreviewColumn({ blankFrameViewportStyle, children, editorPaneProps, framePreviewProps, hasActiveComposition, mode, onModeChange, onPointerEnter, onPointerLeave, rasterPreviewEnabled, rasterPreviewFrame, onScroll, previewKey, stageRef }: PreviewColumnProps) {
  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]" data-clipper-preview-column onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="grid place-items-center border-b border-[#2d313b] px-[18px]" data-clipper-preview-toolbar>
        <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "preview" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("preview")}>Preview</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "editor" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("editor")}>Editor</button>
        </div>
      </div>

      <div ref={stageRef} className={`timeline-scrollbar relative grid min-h-0 ${mode === "preview" ? "place-items-center overflow-auto p-[22px] [scrollbar-gutter:stable]" : "items-stretch overflow-hidden"}`} data-clipper-preview-stage onScroll={onScroll}>
        {mode === "preview" && framePreviewProps ? (
          rasterPreviewEnabled
            ? <RasterFramePreview key={`raster:${previewKey}`} frame={rasterPreviewFrame} framePreviewProps={framePreviewProps} />
            : <FramePreview key={previewKey} {...framePreviewProps} />
        ) : null}
        {mode === "preview" && !hasActiveComposition ? <div className="relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)]" aria-label="Blank preview frame" data-clipper-blank-frame-preview style={blankFrameViewportStyle} /> : null}
        {mode === "editor" && editorPaneProps ? <div className="min-h-0 h-full w-full"><EditorPane {...editorPaneProps} /></div> : null}
        {mode === "editor" && !editorPaneProps ? <div className="grid place-items-center p-6 text-center text-sm font-bold text-[#9b9da7]">No file is open in the editor.</div> : null}
      </div>
      {children}
    </section>
  );
}

function RasterFramePreview({ frame, framePreviewProps }: { frame: RasterPreviewFrame | null; framePreviewProps: FramePreviewProps }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const frameScale = framePreviewProps.frameScale;
  const canvasStyle = { width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale } as CSSProperties;

  useEffect(() => {
    if (!frame) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    context.putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
    setCanvasReady(true);
  }, [frame]);

  const showingDomFallback = !canvasReady;

  return (
    <div className="relative" data-clipper-raster-frame-preview-wrapper style={canvasStyle}>
      <div className="relative" style={canvasStyle}>
        {showingDomFallback ? <div className="absolute left-0 top-0"><FramePreview {...framePreviewProps} /></div> : null}
        <canvas ref={canvasRef} className={`absolute left-0 top-0 bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${showingDomFallback ? "pointer-events-none opacity-0" : "opacity-100"}`} style={canvasStyle} data-clipper-raster-frame-preview />
      </div>
    </div>
  );
}
