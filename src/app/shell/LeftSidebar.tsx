import { memo } from "react";
import { Folder, Sparkles } from "lucide-react";
import {
  segmentedTabActive,
  segmentedTabBase,
  segmentedTabInactive,
} from "../config";
import { ComposeLayersPanel } from "../../components/compose/ComposeLayersPanel";
import {
  OsFileManager,
  type OsFileManagerProps,
} from "../../components/OsFileManager";
import { ToolsPanel } from "../../components/ToolsPanel";
import type {
  EditorState,
  FrameObject,
  Part,
  TimelineMode,
} from "../../core/types";
import type { LeftPanelTab } from "../types";

type LeftSidebarProps = {
  composeMode: boolean;
  effectsPanelState: EditorState["effectsPanelState"];
  hasActiveComposition: boolean;
  isPlaying: boolean;
  leftPanelTab: LeftPanelTab;
  osFileManagerProps: OsFileManagerProps;
  part: Part;
  selectedObjectIds: string[];
  timelineMode: TimelineMode;
  onEffectsPanelStateChange: (
    state: NonNullable<EditorState["effectsPanelState"]>,
  ) => void;
  onLeftPanelTabChange: (tab: LeftPanelTab) => void;
  onReorderComposeObjects: (objectIds: string[], targetIndex: number) => void;
  onReorderGraphFrameOutputs?: (objectId: string, edgeIds: string[]) => void;
  onSelectComposeLayerObjects: (objects: FrameObject[]) => void;
  onSelectComposeFrameSettings: () => void;
  onToggleComposeLayerHidden?: (layerId: string) => void;
  onToggleComposeLayerLocked?: (layerId: string) => void;
};

const noopHoverObject = () => undefined;

export function LeftSidebar(props: LeftSidebarProps) {
  return <MemoizedLeftSidebar {...props} />;
}

const MemoizedLeftSidebar = memo(
  function LeftSidebarContent({
    composeMode,
    effectsPanelState,
    hasActiveComposition,
    leftPanelTab,
    osFileManagerProps,
    part,
    selectedObjectIds,
    timelineMode,
    onEffectsPanelStateChange,
    onLeftPanelTabChange,
    onReorderComposeObjects,
    onReorderGraphFrameOutputs,
    onSelectComposeLayerObjects,
    onSelectComposeFrameSettings,
    onToggleComposeLayerHidden,
    onToggleComposeLayerLocked,
  }: LeftSidebarProps) {
    return (
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#2d313b] bg-[#171920] p-4">
        <div
          className={`min-h-0 flex-1 overflow-hidden ${composeMode ? "grid" : "pointer-events-none hidden"}`}
          aria-hidden={!composeMode}
        >
          {hasActiveComposition ? (
            <ComposeLayersPanel
              part={part}
              selectedObjectIds={selectedObjectIds}
              onSelectObjects={onSelectComposeLayerObjects}
              onSelectFrameSettings={onSelectComposeFrameSettings}
              onHoverObject={noopHoverObject}
              onReorderObjects={onReorderComposeObjects}
              onReorderGraphFrameOutputs={onReorderGraphFrameOutputs}
              onToggleLayerHidden={onToggleComposeLayerHidden}
              onToggleLayerLocked={onToggleComposeLayerLocked}
            />
          ) : (
            <div className="grid h-full place-items-center rounded-[14px] border border-[#2d313b] bg-[#111319]/72 p-5 text-center text-sm font-bold text-[#737884]">
              Move the playhead over a composition to inspect its layers.
            </div>
          )}
        </div>
        <div
          className={`min-h-0 flex-1 overflow-hidden ${composeMode ? "pointer-events-none hidden" : "flex flex-col"}`}
          aria-hidden={composeMode}
        >
          <div className="mb-4 grid shrink-0 grid-cols-2 gap-1">
            <button
              className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "assets" ? segmentedTabActive : segmentedTabInactive}`}
              onClick={() => onLeftPanelTabChange("assets")}
            >
              <Folder size={14} />
              Assets
            </button>
            <button
              className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "tools" ? segmentedTabActive : segmentedTabInactive}`}
              onClick={() => onLeftPanelTabChange("tools")}
            >
              <Sparkles size={14} />
              Effects
            </button>
          </div>
          <div
            className={`min-h-0 flex-1 overflow-hidden ${leftPanelTab === "assets" ? "grid" : "hidden"}`}
            aria-hidden={leftPanelTab !== "assets"}
          >
            <OsFileManager {...osFileManagerProps} />
          </div>
          <div
            className={`min-h-0 flex-1 overflow-hidden ${leftPanelTab === "tools" ? "grid" : "hidden"}`}
            aria-hidden={leftPanelTab !== "tools"}
          >
            <ToolsPanel
              effectsPanelState={effectsPanelState}
              timelineMode={timelineMode}
              onEffectsPanelStateChange={onEffectsPanelStateChange}
            />
          </div>
        </div>
      </aside>
    );
  },
  (prev, next) => {
    if (!prev.isPlaying || !next.isPlaying) return false;
    if (
      prev.composeMode !== next.composeMode ||
      prev.hasActiveComposition !== next.hasActiveComposition ||
      prev.leftPanelTab !== next.leftPanelTab ||
      prev.timelineMode !== next.timelineMode
    )
      return false;
    if (prev.composeMode)
      return (
        prev.part === next.part &&
        prev.selectedObjectIds === next.selectedObjectIds
      );
    return (
      prev.effectsPanelState === next.effectsPanelState &&
      prev.osFileManagerProps === next.osFileManagerProps
    );
  },
);
