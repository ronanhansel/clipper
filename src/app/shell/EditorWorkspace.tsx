import type { CSSProperties, PointerEvent, ReactNode } from "react";
import type { EditorPanelResizeKind } from "../features/editor-layout/useEditorPanelResize";

type EditorWorkspaceProps = {
  children: ReactNode;
  composeMode: boolean;
  style: CSSProperties;
  onPanelResizePointerDown: (event: PointerEvent<HTMLDivElement>, kind: EditorPanelResizeKind) => void;
};

export function EditorWorkspace({ children, composeMode, style, onPanelResizePointerDown }: EditorWorkspaceProps) {
  return (
    <section className="relative grid min-h-0 border-b border-[#2d313b]" data-clipper-editor-shell style={style}>
      {children}

      <div aria-label={composeMode ? "Resize compose layers panel" : "Resize left panel"} className="absolute inset-y-0 z-30 w-2 -translate-x-1 cursor-col-resize bg-transparent transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]" role="separator" style={{ left: "var(--clipper-left-panel-width)" }} onPointerDown={(event) => onPanelResizePointerDown(event, composeMode ? "compose-left" : "left")} />

      <div aria-label="Resize right panel" className="absolute inset-y-0 right-[var(--clipper-right-panel-width)] z-30 w-2 translate-x-1 cursor-col-resize bg-transparent transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]" role="separator" onPointerDown={(event) => onPanelResizePointerDown(event, "right")} />
    </section>
  );
}

type TimelineResizeHandleProps = {
  onPointerDown: (event: PointerEvent<HTMLDivElement>, kind: EditorPanelResizeKind) => void;
};

export function TimelineResizeHandle({ onPointerDown }: TimelineResizeHandleProps) {
  return <div aria-label="Resize timeline panel" className="absolute inset-x-0 bottom-[calc(var(--clipper-timeline-height)-4px)] z-40 h-2 cursor-row-resize bg-transparent transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]" role="separator" onPointerDown={(event) => onPointerDown(event, "timeline")} />;
}
