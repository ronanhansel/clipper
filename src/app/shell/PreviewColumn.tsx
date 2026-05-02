import type { ComponentProps, CSSProperties, ReactNode, UIEvent } from "react";
import { CodePane } from "../../components/CodePane";
import { FramePreview } from "../../components/preview/FramePreview";
import type { TransitionLayer } from "../../core/types";
import type { Mode } from "../types";

type FramePreviewProps = ComponentProps<typeof FramePreview> & { transitionLayers?: TransitionLayer[] };

type PreviewColumnProps = {
  blankFrameViewportStyle: CSSProperties;
  children: ReactNode;
  codePaneProps: ComponentProps<typeof CodePane> | null;
  framePreviewProps: FramePreviewProps | null;
  hasActiveComposition: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  previewKey: string;
  stageRef: ComponentProps<"div">["ref"];
};

export function PreviewColumn({ blankFrameViewportStyle, children, codePaneProps, framePreviewProps, hasActiveComposition, mode, onModeChange, onPointerEnter, onPointerLeave, onScroll, previewKey, stageRef }: PreviewColumnProps) {
  return (
    <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]" data-clipper-preview-column onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="grid place-items-center border-b border-[#2d313b] px-[18px]" data-clipper-preview-toolbar>
        <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "interactive" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("interactive")}>Interactive</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "code" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("code")}>Code</button>
        </div>
      </div>

      <div ref={stageRef} className={`timeline-scrollbar relative grid min-h-0 ${mode === "interactive" ? "place-items-center overflow-auto p-[22px] [scrollbar-gutter:stable]" : "items-stretch overflow-hidden"}`} data-clipper-preview-stage onScroll={onScroll}>
        {mode === "interactive" && framePreviewProps ? <FramePreview key={previewKey} {...framePreviewProps} /> : null}
        {mode === "interactive" && !hasActiveComposition ? <div className="relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)]" aria-label="Blank preview frame" data-clipper-blank-frame-preview style={blankFrameViewportStyle} /> : null}
        {mode === "code" && codePaneProps ? <div className="min-h-0 h-full w-full"><CodePane key={previewKey} {...codePaneProps} /></div> : null}
        {mode === "code" && !hasActiveComposition ? <div className="grid place-items-center p-6 text-center text-sm font-bold text-[#9b9da7]">No composition source is active for this timeline.</div> : null}
      </div>
      {children}
    </section>
  );
}
