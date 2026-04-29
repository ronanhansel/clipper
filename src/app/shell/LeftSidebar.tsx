import { Folder, Sparkles } from "lucide-react";
import { segmentedTabActive, segmentedTabBase, segmentedTabInactive } from "../config";
import { ComposeLayersPanel } from "../../components/compose/ComposeLayersPanel";
import { ToolsPanel } from "../../components/ToolsPanel";
import { FileManagerWorkspace, type FileManagerWorkspaceProps } from "../features/file-manager/FileManagerWorkspace";
import type { EditorState, FrameObject, Part, TimelineMode } from "../../core/types";
import type { LeftPanelTab } from "../types";

type LeftSidebarProps = {
  composeMode: boolean;
  effectsPanelState: EditorState["effectsPanelState"];
  fileManagerProps: FileManagerWorkspaceProps;
  hasActiveComposition: boolean;
  leftPanelTab: LeftPanelTab;
  part: Part;
  selectedObjectIds: string[];
  timelineMode: TimelineMode;
  onEffectsPanelStateChange: (state: NonNullable<EditorState["effectsPanelState"]>) => void;
  onLeftPanelTabChange: (tab: LeftPanelTab) => void;
  onReorderComposeObjects: (objectIds: string[], targetIndex: number) => void;
  onSelectComposeLayerObjects: (objects: FrameObject[]) => void;
};

export function LeftSidebar({ composeMode, effectsPanelState, fileManagerProps, hasActiveComposition, leftPanelTab, part, selectedObjectIds, timelineMode, onEffectsPanelStateChange, onLeftPanelTabChange, onReorderComposeObjects, onSelectComposeLayerObjects }: LeftSidebarProps) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#2d313b] bg-[#171920] p-4">
      {composeMode ? (
        hasActiveComposition
          ? <ComposeLayersPanel part={part} selectedObjectIds={selectedObjectIds} onSelectObjects={onSelectComposeLayerObjects} onHoverObject={() => undefined} onReorderObjects={onReorderComposeObjects} />
          : <div className="grid h-full place-items-center rounded-[14px] border border-[#2d313b] bg-[#111319]/72 p-5 text-center text-sm font-bold text-[#737884]">Move the playhead over a composition to inspect its layers.</div>
      ) : <>
        <div className="mb-4 grid shrink-0 grid-cols-2 gap-1">
          <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "assets" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => onLeftPanelTabChange("assets")}><Folder size={14} />Assets</button>
          <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "tools" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => onLeftPanelTabChange("tools")}><Sparkles size={14} />Effects</button>
        </div>
        <div className={`min-h-0 flex-1 overflow-hidden ${leftPanelTab === "assets" ? "grid" : "hidden"}`} aria-hidden={leftPanelTab !== "assets"}>
          <FileManagerWorkspace {...fileManagerProps} />
        </div>
        <div className={`min-h-0 flex-1 overflow-hidden ${leftPanelTab === "tools" ? "grid" : "hidden"}`} aria-hidden={leftPanelTab !== "tools"}>
          <ToolsPanel effectsPanelState={effectsPanelState} timelineMode={timelineMode} onEffectsPanelStateChange={onEffectsPanelStateChange} />
        </div>
      </>}
    </aside>
  );
}
