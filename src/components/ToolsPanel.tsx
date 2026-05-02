import { mutedCaps, panelCard } from "../app/config";
import { adjustmentEffectPackages, installedEffectPackages, motionEffectPackages, transitionEffectPackages } from "../core/effects/registry";
import type { EditorState, EffectDefinition, EffectsPanelState, TimelineMode } from "../core/types";
import { effectDragPreviewEvent, effectPointerDragEvent, startClipperPointerDrag } from "../lib/pointerDrag";
import { CardsIcon, WaveTriangleIcon } from "@phosphor-icons/react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Folder } from "lucide-react";
import type { PointerEvent } from "react";
import { NativeTree, type NativeTreeNodeRendererProps } from "./tree/NativeTree";

const defaultAdjustmentAccent = "#8f65f2";
const defaultMotionAccent = "#24b7c9";
const effectButtonClass = "grid h-8 min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-2 border border-transparent px-1.5 text-left text-[12px] font-bold leading-5 text-[#f7f7f8] transition hover:bg-[#20232c] active:bg-[#242733]";
const effectGroupClass = "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 overflow-hidden rounded-xl border border-[#2d313b] bg-[#111319] p-2.5";
const effectListClass = "timeline-scrollbar min-h-0 overflow-y-auto pt-px pr-1";

type EffectGroupNode = {
  id: string;
  name: string;
  path: string;
  children: EffectTreeNode[];
};

type EffectTreeNode = EffectGroupNode | { id: string; kind: "effect"; effect: EffectDefinition; name: string };

const effectDragLabels: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.label])),
};

const effectDragAccents: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.previewColor ?? definition.accent ?? (definition.category === "adjustment" ? defaultAdjustmentAccent : defaultMotionAccent)])),
};


function buildEffectGroupTree(effects: readonly EffectDefinition[]) {
  const root: EffectGroupNode = { id: "group:", name: "", path: "", children: [] };

  for (const effect of effects) {
    const parts = parseEffectGroups(effect);
    let node = root;

    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.children.find((childNode): childNode is EffectGroupNode => "children" in childNode && childNode.name === part);
      if (!child) {
        child = { id: `group:${path}`, name: part, path, children: [] };
        node.children.push(child);
      }
      node = child;
    }

    node.children.push({ id: effect.id, kind: "effect", effect, name: effect.label });
  }

  return root;
}

function collectEffectGroupPaths(effects: readonly EffectDefinition[]) {
  return effects.flatMap((effect) => {
    const parts = parseEffectGroups(effect);
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  });
}

function parseEffectGroups(effect: EffectDefinition) {
  const groups = effect.groups?.length ? effect.groups : effect.group.split("/");
  return groups.map((part) => part.trim()).filter(Boolean);
}

export function ToolsPanel({ effectsPanelState, timelineMode, onEffectsPanelStateChange }: { effectsPanelState?: EffectsPanelState; timelineMode: TimelineMode; onEffectsPanelStateChange: (state: NonNullable<EditorState["effectsPanelState"]>) => void }) {
  const isCompositionMode = timelineMode === "composition";
  const defaultOpenEffectGroups = new Set([...collectEffectGroupPaths(adjustmentEffectPackages), ...collectEffectGroupPaths(motionEffectPackages), ...collectEffectGroupPaths(transitionEffectPackages)]);
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
    const EffectIcon = definition.category === "motion" ? WaveTriangleIcon : definition.category === "transition" ? ArrowLeftRight : CardsIcon;
    return <button className={`${effectButtonClass} w-full cursor-grab active:cursor-grabbing`} key={definition.id} style={{ paddingLeft: 4 + depth * 18 }} onPointerDown={(event) => startEffectDrag(event, definition.id)}><EffectIcon size={14} weight="bold" className="text-[#858995]" /><span className="truncate">{definition.label}</span></button>;
  }

  function renderEffectTree(tree: EffectGroupNode) {
    const rowCount = countEffectTreeRows(tree.children, openEffectGroups);
    return <NativeTree<EffectTreeNode> data={tree.children} height={Math.max(32, rowCount * 32)} idAccessor="id" indent={18} initialOpenState={Object.fromEntries([...openEffectGroups].map((path) => [`group:${path}`, true]))} isInternal={(node) => "children" in node} movable={false} onToggle={(node) => {
      if ("children" in node.data) toggleEffectGroup(node.data.path);
    }} openByDefault={false} rowHeight={32} width="100%">{(props) => <EffectTreeRow {...props} onStartEffectDrag={startEffectDrag} />}</NativeTree>;
  }

  const adjustmentEffectTree = buildEffectGroupTree(adjustmentEffectPackages);
  const motionEffectTree = buildEffectGroupTree(motionEffectPackages);
  const transitionEffectTree = buildEffectGroupTree(transitionEffectPackages);

  return (
    <section className="grid min-h-0 flex-1 overflow-hidden">
      {isCompositionMode ? <div className="grid min-h-0 grid-rows-3 gap-2 overflow-hidden">
        <div className={effectGroupClass}>
          <span className={mutedCaps}>Transition</span>
          <div className={effectListClass}>
            {renderEffectTree(transitionEffectTree)}
          </div>
        </div>
        <div className={effectGroupClass}>
          <span className={mutedCaps}>Adjust</span>
          <div className={effectListClass}>
            {renderEffectTree(adjustmentEffectTree)}
          </div>
        </div>
        <div className={effectGroupClass}>
          <span className={mutedCaps}>Motion</span>
          <div className={effectListClass}>
            {renderEffectTree(motionEffectTree)}
          </div>
        </div>
      </div> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Compose mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}

function EffectTreeRow({ node, style, onStartEffectDrag }: NativeTreeNodeRendererProps<EffectTreeNode> & { onStartEffectDrag: (event: PointerEvent<HTMLButtonElement>, effect: string) => void }) {
  const data = node.data;
  if ("children" in data) {
    const Chevron = node.isOpen ? ChevronDown : ChevronRight;
    return <button className="grid h-full w-full min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 rounded-[7px] border border-transparent px-1 text-left text-[12px] font-black text-[#b2b6c2] transition hover:bg-[#20232c]" style={style} type="button" onClick={(event) => { event.stopPropagation(); node.toggle(); }} aria-expanded={node.isOpen}>
      <Chevron size={15} className="text-[#f1f3f7]" />
      <Folder size={17} className="text-[#dfe3ec]" />
      <span className="truncate">{data.name}</span>
    </button>;
  }

  const EffectIcon = data.effect.category === "motion" ? WaveTriangleIcon : data.effect.category === "transition" ? ArrowLeftRight : CardsIcon;
  return <button className={`${effectButtonClass} h-full w-full cursor-grab active:cursor-grabbing`} style={style} onPointerDown={(event) => onStartEffectDrag(event, data.effect.id)}><EffectIcon size={14} weight="bold" className="text-[#858995]" /><span className="truncate">{data.effect.label}</span></button>;
}

function countEffectTreeRows(nodes: EffectTreeNode[], openGroups: Set<string>): number {
  return nodes.reduce((total, node) => {
    if (!("children" in node)) return total + 1;
    return total + 1 + (openGroups.has(node.path) ? countEffectTreeRows(node.children, openGroups) : 0);
  }, 0);
}
