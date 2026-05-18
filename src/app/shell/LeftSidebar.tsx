import { memo, useRef } from "react";
import { Folder, Sparkles } from "lucide-react";
import {
  segmentedTabActive,
  segmentedTabBase,
  segmentedTabInactive,
} from "../config";
import { ComposeLeftPanel } from "../../components/compose/ComposeLeftPanel";
import { Bin, type BinProps } from "../../components/Bin";
import { ToolsPanel } from "../../components/ToolsPanel";
import type { EditorState, FrameObject, Part } from "../../core/types";
import {
  useEditorStore,
  useSelectionEditorState,
  useShellEditorState,
} from "../state/editorStore";

type LeftSidebarProps = {
  effectsPanelState: EditorState["effectsPanelState"];
  hasActiveComposition: boolean;
  binProps: BinProps;
  part: Part;
  onEffectsPanelStateChange: (
    state: NonNullable<EditorState["effectsPanelState"]>,
  ) => void;
  onReorderComposeObjects: (objectIds: string[], targetIndex: number) => void;
  onSelectComposeLayerObjects: (objects: FrameObject[]) => void;
  onSelectComposeFrameSettings: () => void;
  onToggleComposeLayerHidden?: (layerId: string) => void;
  onToggleComposeLayerLocked?: (layerId: string) => void;
};

const noopHoverObject = () => undefined;

export function LeftSidebar(props: LeftSidebarProps) {
  const { leftPanelTab, setLeftPanelTab } = useShellEditorState();
  const timelineMode = useEditorStore((s) => s.timelineMode);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const { selectedComposeObjectIds } = useSelectionEditorState();
  const composeMode = timelineMode === "compose";

  const playbackFreezeRef = useRef({
    part: props.part,
    selectedComposeObjectIds,
  });
  if (!isPlaying)
    playbackFreezeRef.current = {
      part: props.part,
      selectedComposeObjectIds,
    };
  const part = isPlaying ? playbackFreezeRef.current.part : props.part;
  const selectedObjectIds = isPlaying
    ? playbackFreezeRef.current.selectedComposeObjectIds
    : selectedComposeObjectIds;

  return (
    <MemoizedLeftSidebar
      {...props}
      composeMode={composeMode}
      isPlaying={isPlaying}
      leftPanelTab={leftPanelTab}
      onLeftPanelTabChange={setLeftPanelTab}
      part={part}
      selectedObjectIds={selectedObjectIds}
      timelineMode={timelineMode}
    />
  );
}

type MemoizedLeftSidebarProps = LeftSidebarProps & {
  composeMode: boolean;
  isPlaying: boolean;
  leftPanelTab: ReturnType<typeof useShellEditorState>["leftPanelTab"];
  onLeftPanelTabChange: ReturnType<
    typeof useShellEditorState
  >["setLeftPanelTab"];
  selectedObjectIds: string[];
  timelineMode: ReturnType<typeof useShellEditorState>["timelineMode"];
};

const MemoizedLeftSidebar = memo(
  function LeftSidebarContent({
    composeMode,
    effectsPanelState,
    hasActiveComposition,
    leftPanelTab,
    binProps,
    part,
    selectedObjectIds,
    timelineMode,
    onEffectsPanelStateChange,
    onLeftPanelTabChange,
    onReorderComposeObjects,
    onSelectComposeLayerObjects,
    onSelectComposeFrameSettings,
    onToggleComposeLayerHidden,
    onToggleComposeLayerLocked,
  }: MemoizedLeftSidebarProps) {
    return (
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[#2d313b] bg-[#171920] p-4">
        <div
          className={`min-h-0 flex-1 overflow-hidden ${composeMode ? "flex flex-col" : "pointer-events-none hidden"}`}
          aria-hidden={!composeMode}
        >
          <ComposeLeftPanel
            hasActiveComposition={hasActiveComposition}
            part={part}
            selectedObjectIds={selectedObjectIds}
            binProps={binProps}
            onSelectObjects={onSelectComposeLayerObjects}
            onSelectFrameSettings={onSelectComposeFrameSettings}
            onHoverObject={noopHoverObject}
            onReorderObjects={onReorderComposeObjects}
            onToggleLayerHidden={onToggleComposeLayerHidden}
            onToggleLayerLocked={onToggleComposeLayerLocked}
          />
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
              Files
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
            <Bin {...binProps} />
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
        prev.selectedObjectIds === next.selectedObjectIds &&
        prev.binProps === next.binProps
      );
    return (
      prev.effectsPanelState === next.effectsPanelState &&
      prev.binProps === next.binProps
    );
  },
);
