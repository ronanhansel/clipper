import { memo, useState } from "react";
import { Folder, Layers as LayersIcon } from "lucide-react";
import {
  segmentedTabActive,
  segmentedTabBase,
  segmentedTabInactive,
} from "../../app/config";
import { ComposeLayersPanel } from "./ComposeLayersPanel";
import { Bin, type BinProps } from "../Bin";
import type { FrameObject, Part } from "../../core/types";

type ComposeLeftPanelTab = "layers" | "assets";

type ComposeLeftPanelProps = {
  hasActiveComposition: boolean;
  part: Part;
  selectedObjectIds: string[];
  binProps: BinProps;
  onSelectObjects: (objects: FrameObject[]) => void;
  onSelectFrameSettings: () => void;
  onHoverObject: (object: FrameObject | null) => void;
  onReorderObjects: (objectIds: string[], targetIndex: number) => void;
  onToggleLayerHidden?: (layerId: string) => void;
  onToggleLayerLocked?: (layerId: string) => void;
};

export function ComposeLeftPanel(props: ComposeLeftPanelProps) {
  return <MemoizedComposeLeftPanel {...props} />;
}

const MemoizedComposeLeftPanel = memo(function ComposeLeftPanelContent({
  hasActiveComposition,
  part,
  selectedObjectIds,
  binProps,
  onSelectObjects,
  onSelectFrameSettings,
  onHoverObject,
  onReorderObjects,
  onToggleLayerHidden,
  onToggleLayerLocked,
}: ComposeLeftPanelProps) {
  const [tab, setTab] = useState<ComposeLeftPanelTab>("assets");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-4 grid shrink-0 grid-cols-2 gap-1">
        <button
          className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${tab === "assets" ? segmentedTabActive : segmentedTabInactive}`}
          onClick={() => setTab("assets")}
        >
          <Folder size={14} />
          Files
        </button>
        <button
          className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${tab === "layers" ? segmentedTabActive : segmentedTabInactive}`}
          onClick={() => setTab("layers")}
        >
          <LayersIcon size={14} />
          Layers
        </button>
      </div>
      <div
        className={`min-h-0 flex-1 overflow-hidden ${tab === "layers" ? "grid" : "hidden"}`}
        aria-hidden={tab !== "layers"}
      >
        {hasActiveComposition ? (
          <ComposeLayersPanel
            part={part}
            selectedObjectIds={selectedObjectIds}
            onSelectObjects={onSelectObjects}
            onSelectFrameSettings={onSelectFrameSettings}
            onHoverObject={onHoverObject}
            onReorderObjects={onReorderObjects}
            onToggleLayerHidden={onToggleLayerHidden}
            onToggleLayerLocked={onToggleLayerLocked}
          />
        ) : (
          <div className="grid h-full place-items-center rounded-[14px] border border-[#2d313b] bg-[#111319]/72 p-5 text-center text-sm font-bold text-[#737884]">
            Move the playhead over a composition to inspect its layers.
          </div>
        )}
      </div>
      <div
        className={`min-h-0 flex-1 overflow-hidden ${tab === "assets" ? "grid" : "hidden"}`}
        aria-hidden={tab !== "assets"}
      >
        <Bin {...binProps} />
      </div>
    </div>
  );
});
