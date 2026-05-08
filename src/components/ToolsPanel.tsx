import { panelCard } from "../app/config";
import { builtInComposition3dPackages, type Composition3dPackageDefinition } from "../core/composition3dPackages";
import { adjustmentEffectPackages, installedEffectPackages, motionEffectPackages, transitionEffectPackages } from "../core/effects/registry";
import { getComposition3dNodeKindFromPackageId, getComposition3dSocketDefinition, graphSocketColors } from "../core/graphSockets";
import type { EditorState, EffectDefinition, EffectsPanelState, TimelineMode } from "../core/types";
import { composition3dPackageDragPreviewEvent, composition3dPackagePointerDragEvent, effectDragPreviewEvent, effectPointerDragEvent, startClipperPointerDrag } from "../lib/pointerDrag";
import { CardsIcon, WaveTriangleIcon } from "@phosphor-icons/react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import type { PointerEvent } from "react";
import { NativeTree, type NativeTreeNodeRendererProps } from "./tree/NativeTree";

const defaultEffectAccent = "#6f7684";
const transitionEffectAccent = "#ff8c42";
const adjustmentEffectAccent = "#a78bfa";
const motionEffectAccent = "#1bb8c9";
const EFFECT_ROW_HEIGHT = 30;
const EFFECT_TREE_INDENT = 24;
const effectButtonClass = "grid min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 border border-transparent px-1.5 text-left text-[13px] text-[#f7f7f8] transition hover:bg-[#20232c] active:bg-[#242733]";
const effectGroupClass = "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 overflow-hidden rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3";
const effectListClass = "timeline-scrollbar min-h-0 overflow-y-auto pt-px pr-1";
const effectGroupLabelClass = "text-[12px] text-[#9b9da7]";

type EffectGroupNode = {
  id: string;
  name: string;
  path: string;
  children: EffectTreeNode[];
};

type EffectTreeNode = EffectGroupNode | { id: string; kind: "effect"; effect: EffectDefinition; name: string };
type Composition3dGroupNode = Omit<EffectGroupNode, "children"> & { children: Composition3dTreeNode[] };
type Composition3dTreeNode = Composition3dGroupNode | { id: string; kind: "composition3d"; pkg: Composition3dPackageDefinition; name: string };

const effectDragLabels: Record<string, string> = {
  ...Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.label])),
};

const effectDragAccents: Record<string, string> = Object.fromEntries(installedEffectPackages.map((definition) => [definition.id, definition.category === "transition" ? transitionEffectAccent : definition.category === "motion" ? motionEffectAccent : definition.category === "adjustment" ? adjustmentEffectAccent : defaultEffectAccent]));
const defaultOpenComposition3dGroupPaths = new Set(["Scene", "Scene/Camera", "Scene/Geometry", "Scene/Materials", "Scene/Lights", "Scene/Lighting", "TSL", "TSL/Inputs", "TSL/Color", "TSL/Math", "TSL/Texture", "Render", "Render/Post"]);

function startComposition3dPackageDrag(event: PointerEvent<HTMLButtonElement>, packageId: string) {
  const libraryColor = muteComposition3dLibraryColor(getComposition3dPackageSocketColor(packageId));
  startClipperPointerDrag({
    accent: libraryColor,
    eventName: composition3dPackagePointerDragEvent,
    label: builtInComposition3dPackages.find((pkg) => pkg.id === packageId)?.label ?? packageId,
    payload: { packageId },
    pointerEvent: event,
    previewEventName: composition3dPackageDragPreviewEvent,
    textColor: libraryColor,
  });
}

export function Composition3dLibraryPanel() {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="timeline-scrollbar min-h-0 flex-1 overflow-y-auto rounded-[14px] border border-[#2d313b] bg-[#111319]/72 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <Composition3dLibraryTree />
      </div>
    </section>
  );
}

function Composition3dLibraryTree() {
  const composition3dTree = buildComposition3dGroupTree(builtInComposition3dPackages);
  return (
    <NativeTree<Composition3dTreeNode>
      data={composition3dTree.children as Composition3dTreeNode[]}
      height={Math.max(EFFECT_ROW_HEIGHT, countEffectTreeRows(composition3dTree.children, defaultOpenComposition3dGroupPaths) * EFFECT_ROW_HEIGHT)}
      idAccessor="id"
      indent={EFFECT_TREE_INDENT}
      initialOpenState={Object.fromEntries([...defaultOpenComposition3dGroupPaths].map((path) => [`group:composition3d/${path}`, true]))}
      isInternal={(node) => "children" in node}
      movable={false}
      openByDefault
      rowHeight={EFFECT_ROW_HEIGHT}
      width="100%"
    >
      {(props) => <Composition3dTreeRow {...props} onStartPackageDrag={startComposition3dPackageDrag} />}
    </NativeTree>
  );
}

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

function buildComposition3dGroupTree(packages: readonly Composition3dPackageDefinition[]) {
  const root: Composition3dGroupNode = { id: "group:composition3d", name: "", path: "", children: [] };
  for (const pkg of packages) {
    const parts = parsePackageGroups(pkg);
    let node = root;
    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.children.find((childNode): childNode is Composition3dGroupNode => "children" in childNode && childNode.name === part);
      if (!child) {
        child = { id: `group:composition3d/${path}`, name: part, path, children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.children.push({ id: pkg.id, kind: "composition3d", pkg, name: pkg.label } as Composition3dTreeNode);
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

function parsePackageGroups(pkg: Composition3dPackageDefinition) {
  const groups = pkg.groups?.length ? pkg.groups : pkg.group.split("/");
  return groups.map((part) => part.trim()).filter(Boolean);
}

export function ToolsPanel({ effectsPanelState, timelineMode, onEffectsPanelStateChange }: { effectsPanelState?: EffectsPanelState; timelineMode: TimelineMode; onEffectsPanelStateChange: (state: NonNullable<EditorState["effectsPanelState"]>) => void }) {
  const isCompositionMode = timelineMode === "composition";
  const defaultOpenEffectGroups = new Set([...collectEffectGroupPaths(adjustmentEffectPackages), ...collectEffectGroupPaths(motionEffectPackages), ...collectEffectGroupPaths(transitionEffectPackages)]);
  const openEffectGroups = new Set(Object.entries(effectsPanelState?.openGroups ?? Object.fromEntries([...defaultOpenEffectGroups].map((path) => [path, true]))).filter((entry) => entry[1]).map((entry) => entry[0]));

  function startEffectDrag(event: PointerEvent<HTMLButtonElement>, effect: string) {
    startClipperPointerDrag({
      accent: effectDragAccents[effect] ?? defaultEffectAccent,
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

  function renderEffectTree(tree: EffectGroupNode) {
    const rowCount = countEffectTreeRows(tree.children, openEffectGroups);
    return <NativeTree<EffectTreeNode> data={tree.children as EffectTreeNode[]} height={Math.max(EFFECT_ROW_HEIGHT, rowCount * EFFECT_ROW_HEIGHT)} idAccessor="id" indent={EFFECT_TREE_INDENT} initialOpenState={Object.fromEntries([...openEffectGroups].map((path) => [`group:${path}`, true]))} isInternal={(node) => "children" in node} movable={false} onToggle={(node) => {
      if ("children" in node.data) toggleEffectGroup(node.data.path);
    }} openByDefault={false} rowHeight={EFFECT_ROW_HEIGHT} width="100%">{(props) => <EffectTreeRow {...props} onStartEffectDrag={startEffectDrag} />}</NativeTree>;
  }

  const adjustmentEffectTree = buildEffectGroupTree(adjustmentEffectPackages);
  const motionEffectTree = buildEffectGroupTree(motionEffectPackages);
  const transitionEffectTree = buildEffectGroupTree(transitionEffectPackages);

  return (
    <section className="grid min-h-0 flex-1 overflow-hidden">
      {isCompositionMode ? <div className="grid min-h-0 grid-rows-3 gap-2 overflow-hidden">
        <div className={effectGroupClass}>
          <span className={effectGroupLabelClass}>Transition</span>
          <div className={effectListClass}>
            {renderEffectTree(transitionEffectTree)}
          </div>
        </div>
        <div className={effectGroupClass}>
          <span className={effectGroupLabelClass}>Adjust</span>
          <div className={effectListClass}>
            {renderEffectTree(adjustmentEffectTree)}
          </div>
        </div>
        <div className={effectGroupClass}>
          <span className={effectGroupLabelClass}>Motion</span>
          <div className={effectListClass}>
            {renderEffectTree(motionEffectTree)}
          </div>
        </div>
      </div> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Compose mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}

function Composition3dTreeRow({ node, style, onStartPackageDrag }: NativeTreeNodeRendererProps<Composition3dTreeNode> & { onStartPackageDrag: (event: PointerEvent<HTMLButtonElement>, packageId: string) => void }) {
  const data = node.data;
  if ("children" in data) {
    const Chevron = node.isOpen ? ChevronDown : ChevronRight;
    const FolderIcon = node.isOpen ? FolderOpen : Folder;
    return <button className="grid h-full w-full min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 border border-transparent px-1.5 text-left text-[13px] text-current transition hover:bg-[#20232c]" style={style} type="button" onClick={(event) => { event.stopPropagation(); node.toggle(); }} aria-expanded={node.isOpen}>
      <Chevron size={14} className="text-current" />
      <FolderIcon size={17} className="text-current" />
      <span className="truncate px-1">{data.name}</span>
    </button>;
  }

  const socketColor = getComposition3dPackageSocketColor(data.pkg.id);
  const libraryColor = muteComposition3dLibraryColor(socketColor);
  return <button className={`${effectButtonClass} h-full w-full cursor-grab active:cursor-grabbing`} draggable style={style} onDragStart={(event) => { event.dataTransfer.setData("application/x-clipper-composition3d-package", data.pkg.id); event.dataTransfer.setData("text/plain", data.pkg.id); event.dataTransfer.effectAllowed = "copy"; }} onPointerDown={(event) => onStartPackageDrag(event, data.pkg.id)}><span /><CardsIcon size={14} weight="bold" style={{ color: libraryColor }} /><span className="truncate px-1" style={{ color: libraryColor }}>{data.pkg.label}</span></button>;
}

function getComposition3dPackageSocketColor(packageId: string) {
  const kind = getComposition3dNodeKindFromPackageId(packageId);
  const socket = getComposition3dSocketDefinition(kind)?.output;
  return graphSocketColors[socket ?? "any"];
}

function muteComposition3dLibraryColor(color: string) {
  return blendHexColors("#8f96a4", color, 0.46);
}

function blendHexColors(baseHex: string, accentHex: string, amount: number) {
  const base = hexToRgb(baseHex);
  const accent = hexToRgb(accentHex);
  return `rgb(${Math.round(base.red + (accent.red - base.red) * amount)}, ${Math.round(base.green + (accent.green - base.green) * amount)}, ${Math.round(base.blue + (accent.blue - base.blue) * amount)})`;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

function EffectTreeRow({ node, style, onStartEffectDrag }: NativeTreeNodeRendererProps<EffectTreeNode> & { onStartEffectDrag: (event: PointerEvent<HTMLButtonElement>, effect: string) => void }) {
  const data = node.data;
  if ("children" in data) {
    const Chevron = node.isOpen ? ChevronDown : ChevronRight;
    const FolderIcon = node.isOpen ? FolderOpen : Folder;
    return <button className="grid h-full w-full min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 border border-transparent px-1.5 text-left text-[13px] text-current transition hover:bg-[#20232c]" style={style} type="button" onClick={(event) => { event.stopPropagation(); node.toggle(); }} aria-expanded={node.isOpen}>
      <Chevron size={14} className="text-current" />
      <FolderIcon size={17} className="text-current" />
      <span className="truncate px-1">{data.name}</span>
    </button>;
  }

  const EffectIcon = data.effect.category === "motion" ? WaveTriangleIcon : data.effect.category === "transition" ? ArrowLeftRight : CardsIcon;
  return <button className={`${effectButtonClass} h-full w-full cursor-grab active:cursor-grabbing`} style={style} onPointerDown={(event) => onStartEffectDrag(event, data.effect.id)}><span /><EffectIcon size={14} weight="bold" className="text-[#858995]" /><span className="truncate px-1">{data.effect.label}</span></button>;
}

function countEffectTreeRows(nodes: Array<{ path?: string; children?: unknown[] } | object>, openGroups: Set<string>): number {
  return nodes.reduce((total, node) => {
    if (!("children" in node)) return total + 1;
    return total + 1 + ("path" in node && typeof node.path === "string" && openGroups.has(node.path) ? countEffectTreeRows((node.children ?? []) as Array<{ path?: string; children?: unknown[] } | object>, openGroups) : 0);
  }, 0);
}
