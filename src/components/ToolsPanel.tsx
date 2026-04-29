import { mutedCaps, panelCard } from "../app/config";
import { adjustmentEffectPackages, installedEffectPackages, motionEffectPackages } from "../core/effects/registry";
import type { EditorState, EffectDefinition, EffectsPanelState, TimelineMode } from "../core/types";
import { effectDragPreviewEvent, effectPointerDragEvent, startClipperPointerDrag } from "../lib/pointerDrag";
import { CardsIcon, WaveTriangleIcon } from "@phosphor-icons/react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import type { PointerEvent } from "react";

const defaultAdjustmentAccent = "#8f65f2";
const defaultMotionAccent = "#24b7c9";
const effectButtonClass = "grid h-8 min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-2 border border-transparent px-1.5 text-left text-[12px] font-bold leading-5 text-[#f7f7f8] transition hover:bg-[#20232c] active:bg-[#242733]";
const effectGroupClass = "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 overflow-hidden rounded-xl border border-[#2d313b] bg-[#111319] p-2.5";
const effectListClass = "timeline-scrollbar grid min-h-0 content-start gap-0.5 overflow-y-auto pt-px pr-1";
const effectFolderButtonClass = "grid h-8 min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 rounded-[7px] border border-transparent px-1 text-left text-[12px] font-black text-[#b2b6c2] transition hover:bg-[#20232c]";

type EffectGroupNode = {
  name: string;
  path: string;
  groups: EffectGroupNode[];
  effects: EffectDefinition[];
};

const effectDragLabels: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.label])),
};

const effectDragAccents: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.previewColor ?? definition.accent ?? (definition.category === "adjustment" ? defaultAdjustmentAccent : defaultMotionAccent)])),
};


function buildEffectGroupTree(effects: readonly EffectDefinition[]) {
  const root: EffectGroupNode = { name: "", path: "", groups: [], effects: [] };

  for (const effect of effects) {
    const parts = effect.group.split("/").map((part) => part.trim()).filter(Boolean);
    let node = root;

    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.groups.find((group) => group.name === part);
      if (!child) {
        child = { name: part, path, groups: [], effects: [] };
        node.groups.push(child);
      }
      node = child;
    }

    node.effects.push(effect);
  }

  return root;
}

function collectEffectGroupPaths(effects: readonly EffectDefinition[]) {
  return effects.flatMap((effect) => {
    const parts = effect.group.split("/").map((part) => part.trim()).filter(Boolean);
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  });
}

export function ToolsPanel({ effectsPanelState, timelineMode, onEffectsPanelStateChange }: { effectsPanelState?: EffectsPanelState; timelineMode: TimelineMode; onEffectsPanelStateChange: (state: NonNullable<EditorState["effectsPanelState"]>) => void }) {
  const isCompositionMode = timelineMode === "composition";
  const defaultOpenEffectGroups = new Set([...collectEffectGroupPaths(adjustmentEffectPackages), ...collectEffectGroupPaths(motionEffectPackages)]);
  const openEffectGroups = new Set(Object.entries(effectsPanelState?.openGroups ?? Object.fromEntries([...defaultOpenEffectGroups].map((path) => [path, true]))).filter((entry) => entry[1]).map((entry) => entry[0]));

  function startEffectDrag(event: PointerEvent<HTMLButtonElement>, effect: string) {
    startClipperPointerDrag({
      accent: effectDragAccents[effect] ?? defaultAdjustmentAccent,
      eventName: effectPointerDragEvent,
      label: effectDragLabels[effect] ?? effect,
      payload: { effect },
      pointerEvent: event,
      previewEventName: effectDragPreviewEvent,
    });
  }

  function toggleEffectGroup(path: string) {
    const next = { ...Object.fromEntries([...defaultOpenEffectGroups].map((groupPath) => [groupPath, true])), ...(effectsPanelState?.openGroups ?? {}) };
    next[path] = !openEffectGroups.has(path);
    onEffectsPanelStateChange({ openGroups: next });
  }

  function renderEffectButton(definition: EffectDefinition, depth: number) {
    const EffectIcon = definition.category === "motion" ? WaveTriangleIcon : CardsIcon;
    return <button className={`${effectButtonClass} w-full cursor-grab active:cursor-grabbing`} key={definition.id} style={{ paddingLeft: 4 + depth * 18 }} onPointerDown={(event) => startEffectDrag(event, definition.id)}><EffectIcon size={14} weight="bold" className="text-[#858995]" /><span className="truncate">{definition.label}</span></button>;
  }

  function renderEffectFolder(node: EffectGroupNode, depth = 0) {
    const isOpen = openEffectGroups.has(node.path);
    const Chevron = isOpen ? ChevronDown : ChevronRight;

    return <div className="grid gap-1" key={node.path}>
      <button className={effectFolderButtonClass} style={{ paddingLeft: 4 + depth * 18 }} type="button" onClick={() => toggleEffectGroup(node.path)} aria-expanded={isOpen}>
        <Chevron size={15} className="text-[#f1f3f7]" />
        <Folder size={17} className="text-[#dfe3ec]" />
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen ? <div className="grid gap-0.5">
        {node.groups.map((group) => renderEffectFolder(group, depth + 1))}
        {node.effects.map((definition) => renderEffectButton(definition, depth + 1))}
      </div> : null}
    </div>;
  }

  const adjustmentEffectTree = buildEffectGroupTree(adjustmentEffectPackages);
  const motionEffectTree = buildEffectGroupTree(motionEffectPackages);

  return (
    <section className="grid min-h-0 flex-1 overflow-hidden">
      {isCompositionMode ? <div className="grid min-h-0 grid-rows-2 gap-2 overflow-hidden">
        <div className={effectGroupClass}>
          <span className={mutedCaps}>Adjust</span>
          <div className={effectListClass}>
            {adjustmentEffectTree.groups.map((group) => renderEffectFolder(group))}
            {adjustmentEffectTree.effects.map((definition) => renderEffectButton(definition, 0))}
          </div>
        </div>
        <div className={effectGroupClass}>
          <span className={mutedCaps}>Motion</span>
          <div className={effectListClass}>
            {motionEffectTree.groups.map((group) => renderEffectFolder(group))}
            {motionEffectTree.effects.map((definition) => renderEffectButton(definition, 0))}
          </div>
        </div>
      </div> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Edit mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}
