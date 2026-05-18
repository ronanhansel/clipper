import { panelCard } from "../app/config";
import {
  getEffectCategoryAccent,
  getEffectCategoryIcon,
  getEffectLibrarySections,
  getEffectPackage,
} from "../core/effects/registry";
import type {
  EditorState,
  EffectDefinition,
  EffectsPanelState,
  TimelineMode,
} from "../core/types";
import {
  effectDragPreviewEvent,
  effectPointerDragEvent,
  startClipperPointerDrag,
} from "../lib/pointerDrag";
import { CardsIcon, WaveTriangleIcon } from "@phosphor-icons/react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { PointerEvent } from "react";
import {
  NativeTree,
  type NativeTreeNodeRendererProps,
} from "./tree/NativeTree";

const EFFECT_ROW_HEIGHT = 30;
const EFFECT_TREE_INDENT = 24;
const effectButtonClass =
  "grid min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 border border-transparent px-1.5 text-left text-[13px] text-[#f7f7f8] transition hover:bg-[#20232c] active:bg-[#242733]";
const effectGroupClass =
  "grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5 overflow-hidden rounded-[14px] border border-dashed border-[#303646] bg-[#151821] p-3";
const effectListClass = "timeline-scrollbar min-h-0 overflow-y-auto pt-px pr-1";
const effectGroupLabelClass = "text-[12px] text-[#9b9da7]";

type EffectGroupNode = {
  id: string;
  name: string;
  path: string;
  children: EffectTreeNode[];
};

type EffectTreeNode =
  | EffectGroupNode
  | { id: string; kind: "effect"; effect: EffectDefinition; name: string };
function buildEffectGroupTree(effects: readonly EffectDefinition[]) {
  const root: EffectGroupNode = {
    id: "group:",
    name: "",
    path: "",
    children: [],
  };

  for (const effect of effects) {
    const parts = parseEffectGroups(effect);
    let node = root;

    for (const part of parts) {
      const path = node.path ? `${node.path}/${part}` : part;
      let child = node.children.find(
        (childNode): childNode is EffectGroupNode =>
          "children" in childNode && childNode.name === part,
      );
      if (!child) {
        child = { id: `group:${path}`, name: part, path, children: [] };
        node.children.push(child);
      }
      node = child;
    }

    node.children.push({
      id: effect.id,
      kind: "effect",
      effect,
      name: effect.label,
    });
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
  const groups = effect.groups?.length
    ? effect.groups
    : effect.group.split("/");
  return groups.map((part) => part.trim()).filter(Boolean);
}

export function ToolsPanel({
  effectsPanelState,
  timelineMode,
  onEffectsPanelStateChange,
}: {
  effectsPanelState?: EffectsPanelState;
  timelineMode: TimelineMode;
  onEffectsPanelStateChange: (
    state: NonNullable<EditorState["effectsPanelState"]>,
  ) => void;
}) {
  const isDirectMode = timelineMode === "direct";
  const effectLibrarySections = getEffectLibrarySections();
  const defaultOpenEffectGroups = new Set(
    effectLibrarySections.flatMap((section) =>
      collectEffectGroupPaths(section.packages),
    ),
  );
  const openEffectGroups = new Set(
    Object.entries(
      effectsPanelState?.openGroups ??
        Object.fromEntries(
          [...defaultOpenEffectGroups].map((path) => [path, true]),
        ),
    )
      .filter((entry) => entry[1])
      .map((entry) => entry[0]),
  );

  function startEffectDrag(
    event: PointerEvent<HTMLButtonElement>,
    effect: string,
  ) {
    const definition = getEffectPackage(effect);
    startClipperPointerDrag({
      accent: definition
        ? getEffectCategoryAccent(definition.category)
        : getEffectCategoryAccent("adjustment"),
      eventName: effectPointerDragEvent,
      label: definition?.label ?? effect,
      payload: { effect },
      pointerEvent: event,
      previewEventName: effectDragPreviewEvent,
    });
  }

  function toggleEffectGroup(path: string) {
    const next = {
      ...Object.fromEntries(
        [...defaultOpenEffectGroups].map((groupPath) => [groupPath, true]),
      ),
      ...(effectsPanelState?.openGroups ?? {}),
    };
    next[path] = !openEffectGroups.has(path);
    onEffectsPanelStateChange({ openGroups: next });
  }

  function renderEffectTree(tree: EffectGroupNode) {
    const rowCount = countEffectTreeRows(tree.children, openEffectGroups);
    return (
      <NativeTree<EffectTreeNode>
        data={tree.children as EffectTreeNode[]}
        height={Math.max(EFFECT_ROW_HEIGHT, rowCount * EFFECT_ROW_HEIGHT)}
        idAccessor="id"
        indent={EFFECT_TREE_INDENT}
        initialOpenState={Object.fromEntries(
          [...openEffectGroups].map((path) => [`group:${path}`, true]),
        )}
        isInternal={(node) => "children" in node}
        movable={false}
        onToggle={(node) => {
          if ("children" in node.data) toggleEffectGroup(node.data.path);
        }}
        openByDefault={false}
        rowHeight={EFFECT_ROW_HEIGHT}
        width="100%"
      >
        {(props) => (
          <EffectTreeRow {...props} onStartEffectDrag={startEffectDrag} />
        )}
      </NativeTree>
    );
  }

  const effectSectionTrees = effectLibrarySections.map((section) => ({
    ...section,
    tree: buildEffectGroupTree(section.packages),
  }));

  return (
    <section className="grid min-h-0 flex-1 overflow-hidden">
      {isDirectMode ? (
        <div
          className="grid min-h-0 gap-2 overflow-hidden"
          style={{
            gridTemplateRows: `repeat(${effectSectionTrees.length}, minmax(0, 1fr))`,
          }}
        >
          {effectSectionTrees.map((section) => (
            <div className={effectGroupClass} key={section.category}>
              <span className={effectGroupLabelClass}>{section.label}</span>
              <div className={effectListClass}>
                {renderEffectTree(section.tree)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!isDirectMode ? (
        <div className={panelCard}>
          <span>Compose mode</span>
          <small className="text-[#9b9da7]">
            Scene element selection is enabled and motion lanes are hidden.
          </small>
        </div>
      ) : null}
    </section>
  );
}

function EffectTreeRow({
  node,
  style,
  onStartEffectDrag,
}: NativeTreeNodeRendererProps<EffectTreeNode> & {
  onStartEffectDrag: (
    event: PointerEvent<HTMLButtonElement>,
    effect: string,
  ) => void;
}) {
  const data = node.data;
  if ("children" in data) {
    const Chevron = node.isOpen ? ChevronDown : ChevronRight;
    const FolderIcon = node.isOpen ? FolderOpen : Folder;
    return (
      <button
        className="grid h-full w-full min-w-0 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1.5 border border-transparent px-1.5 text-left text-[13px] text-current transition hover:bg-[#20232c]"
        style={style}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          node.toggle();
        }}
        aria-expanded={node.isOpen}
      >
        <Chevron size={14} className="text-current" />
        <FolderIcon size={17} className="text-current" />
        <span className="truncate px-1">{data.name}</span>
      </button>
    );
  }

  const EffectIcon = getEffectIconComponent(
    getEffectCategoryIcon(data.effect.category),
  );
  return (
    <button
      className={`${effectButtonClass} h-full w-full cursor-grab active:cursor-grabbing`}
      style={style}
      onPointerDown={(event) => onStartEffectDrag(event, data.effect.id)}
    >
      <span />
      <EffectIcon size={14} weight="bold" className="text-[#858995]" />
      <span className="truncate px-1">{data.effect.label}</span>
    </button>
  );
}

function getEffectIconComponent(icon: string) {
  if (icon === "motion") return WaveTriangleIcon;
  if (icon === "transition") return ArrowLeftRight;
  return CardsIcon;
}

function countEffectTreeRows(
  nodes: Array<{ path?: string; children?: unknown[] } | object>,
  openGroups: Set<string>,
): number {
  return nodes.reduce((total, node) => {
    if (!("children" in node)) return total + 1;
    return (
      total +
      1 +
      ("path" in node &&
      typeof node.path === "string" &&
      openGroups.has(node.path)
        ? countEffectTreeRows(
            (node.children ?? []) as Array<
              { path?: string; children?: unknown[] } | object
            >,
            openGroups,
          )
        : 0)
    );
  }, 0);
}
