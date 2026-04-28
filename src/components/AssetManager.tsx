import { ChevronDown, ChevronRight, File as FileIcon, Folder } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { ContextMenuItem, ContextMenuState } from "../app/types";
import { getParentAssetId, type AssetDropIntent, type AssetSortMode } from "../core/assetTree";
import type { AssetItem } from "../core/types";
import { Input } from "./ui/input";
import { AppContextMenu } from "./AppContextMenu";

export function AssetManager({ assets, onCopyAsset, onCreateFolder, onDeleteAsset, onDropFiles, onDuplicateAsset, onMoveAsset, onRenameAsset, onSortAssets }: { assets: AssetItem[]; onCopyAsset: (assetId: string) => void; onCreateFolder: (parentFolderId?: string) => void; onDeleteAsset: (assetId: string) => void; onDropFiles: (files: FileList, targetFolderId?: string) => void; onDuplicateAsset: (assetId: string) => void; onMoveAsset: (sourceId: string, intent: AssetDropIntent) => void; onRenameAsset: (assetId: string, name: string) => void; onSortAssets: (parentFolderId: string | null, mode: AssetSortMode) => void }) {
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<AssetDropIntent | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Record<string, true>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const assetManagerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function clearSelectionOnOutsidePointer(event: globalThis.PointerEvent) {
      if (assetManagerRef.current?.contains(event.target as Node)) return;
      setSelectedAssetId(null);
    }

    window.addEventListener("pointerdown", clearSelectionOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", clearSelectionOnOutsidePointer);
  }, []);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropIntent(null);
    if (event.dataTransfer.files.length > 0) onDropFiles(event.dataTransfer.files);
  }

  function openAssetMenu(event: ReactMouseEvent<HTMLDivElement>, item: AssetItem) {
    event.preventDefault();
    event.stopPropagation();
    const parentFolderId = item.kind === "folder" ? item.id : getParentAssetId(assets, item.id);
    setSelectedAssetId(item.id);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "Rename", action: () => startRename(item) },
        { label: "Copy path", action: () => onCopyAsset(item.id) },
        { label: "Duplicate", action: () => onDuplicateAsset(item.id) },
        { label: "New folder", action: () => createFolder(parentFolderId ?? undefined) },
        { label: "Sort by", children: getAssetSortMenuItems(parentFolderId, onSortAssets) },
        { label: "Delete", action: () => onDeleteAsset(item.id), danger: true },
      ],
    });
  }

  function openEmptyMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.currentTarget !== event.target) return;
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: "New folder", action: () => createFolder() },
        { label: "Sort by", children: getAssetSortMenuItems(null, onSortAssets) },
      ],
    });
  }

  function createFolder(parentFolderId?: string) {
    if (parentFolderId) expandFolder(parentFolderId);
    onCreateFolder(parentFolderId);
  }

  function dropFiles(files: FileList, targetFolderId?: string) {
    if (targetFolderId) expandFolder(targetFolderId);
    onDropFiles(files, targetFolderId);
  }

  function moveAsset(sourceId: string, intent: AssetDropIntent) {
    if (intent.action === "inside") expandFolder(intent.targetId);
    onMoveAsset(sourceId, intent);
  }

  function expandFolder(folderId: string) {
    setCollapsedFolderIds((current) => {
      if (!current[folderId]) return current;
      const { [folderId]: _removed, ...next } = current;
      return next;
    });
  }

  function toggleFolder(folderId: string) {
    setCollapsedFolderIds((current) => {
      if (!current[folderId]) return { ...current, [folderId]: true };
      const { [folderId]: _removed, ...next } = current;
      return next;
    });
  }

  function startRename(item: AssetItem) {
    setRenamingAssetId(item.id);
    setRenameDraft(item.name);
  }

  function commitRename() {
    if (!renamingAssetId) return;
    onRenameAsset(renamingAssetId, renameDraft);
    setRenamingAssetId(null);
  }

  return (
    <section ref={assetManagerRef} className="grid min-h-0 gap-2.5" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div className="max-h-[420px] min-h-[190px] min-w-0 overflow-auto rounded-[10px] border border-dashed border-[#2d313b] bg-[#151821] p-1.5" onClick={(event) => { if (event.currentTarget === event.target) setSelectedAssetId(null); }} onContextMenu={openEmptyMenu} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropIntent(null); }}>
        <AssetTree collapsedFolderIds={collapsedFolderIds} items={assets} depth={0} draggedAssetId={draggedAssetId} dropIntent={dropIntent} parentFolderId={null} renameDraft={renameDraft} renamingAssetId={renamingAssetId} selectedAssetId={selectedAssetId} onCommitRename={commitRename} onDragAsset={setDraggedAssetId} onDropFiles={dropFiles} onDropIntentChange={setDropIntent} onMoveAsset={moveAsset} onOpenMenu={openAssetMenu} onRenameDraftChange={setRenameDraft} onSelectAsset={setSelectedAssetId} onToggleFolder={toggleFolder} />
      </div>
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

function AssetTree({ collapsedFolderIds, items, depth, draggedAssetId, dropIntent, parentFolderId, renameDraft, renamingAssetId, selectedAssetId, onCommitRename, onDragAsset, onDropFiles, onDropIntentChange, onMoveAsset, onOpenMenu, onRenameDraftChange, onSelectAsset, onToggleFolder }: { collapsedFolderIds: Record<string, true>; items: AssetItem[]; depth: number; draggedAssetId: string | null; dropIntent: AssetDropIntent | null; parentFolderId: string | null; renameDraft: string; renamingAssetId: string | null; selectedAssetId: string | null; onCommitRename: () => void; onDragAsset: (assetId: string | null) => void; onDropFiles: (files: FileList, targetFolderId?: string) => void; onDropIntentChange: (intent: AssetDropIntent | null) => void; onMoveAsset: (sourceId: string, intent: AssetDropIntent) => void; onOpenMenu: (event: ReactMouseEvent<HTMLDivElement>, item: AssetItem) => void; onRenameDraftChange: (value: string) => void; onSelectAsset: (assetId: string) => void; onToggleFolder: (folderId: string) => void }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      {items.map((item) => {
        const isFolder = item.kind === "folder";
        const isCollapsed = Boolean(collapsedFolderIds[item.id]);
        return <div className="min-w-0" key={item.id}>
          <div
            className={`relative grid min-w-0 grid-cols-[14px_16px_minmax(0,1fr)] items-center gap-1.5 rounded-[6px] border py-0.5 pl-1.5 pr-1 transition ${draggedAssetId === item.id ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)]" : dropIntent?.targetId === item.id && dropIntent.action === "inside" ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : selectedAssetId === item.id ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "border-transparent bg-transparent hover:bg-[#20232c]"}`}
            draggable
            onClick={() => onSelectAsset(item.id)}
            onContextMenu={(event) => onOpenMenu(event, item)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
              onDragAsset(item.id);
            }}
            onDragEnd={() => {
              onDragAsset(null);
              onDropIntentChange(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              const intent = getAssetDropIntent(event, item, parentFolderId);
              event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 && intent.action === "inside" ? "copy" : "move";
              onDropIntentChange(intent);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const intent = getAssetDropIntent(event, item, parentFolderId);
              onDropIntentChange(null);
              if (event.dataTransfer.files.length > 0) {
                onDropFiles(event.dataTransfer.files, intent.action === "inside" ? item.id : undefined);
                return;
              }
              const sourceId = draggedAssetId ?? event.dataTransfer.getData("text/plain");
              if (sourceId) onMoveAsset(sourceId, intent);
            }}
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {isFolder ? <button className="grid h-4 w-4 place-items-center rounded text-current hover:bg-black/15" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${item.name}`} onClick={(event) => { event.stopPropagation(); onToggleFolder(item.id); }} type="button">{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span />}
            {isFolder ? <Folder size={15} className="text-current" /> : <FileIcon size={14} className="text-current" />}
            {renamingAssetId === item.id ? <Input autoFocus className="h-6 min-w-0 border-[var(--clipper-accent)] bg-[#171920] px-1 py-0 text-xs font-bold" value={renameDraft} onBlur={onCommitRename} onChange={(event) => onRenameDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCommitRename(); }} /> : <span className="min-w-0 select-none overflow-hidden text-ellipsis whitespace-nowrap px-1 text-xs font-bold">{item.name}</span>}
            {dropIntent?.targetId === item.id && dropIntent.action === "before" ? <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-[var(--clipper-accent)] shadow-[0_0_0_2px_rgb(var(--clipper-accent-rgb)/0.18)]" /> : null}
            {dropIntent?.targetId === item.id && dropIntent.action === "after" ? <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[var(--clipper-accent)] shadow-[0_0_0_2px_rgb(var(--clipper-accent-rgb)/0.18)]" /> : null}
          </div>
          {item.children?.length && !isCollapsed ? <AssetTree collapsedFolderIds={collapsedFolderIds} items={item.children} depth={depth + 1} draggedAssetId={draggedAssetId} dropIntent={dropIntent} parentFolderId={item.id} renameDraft={renameDraft} renamingAssetId={renamingAssetId} selectedAssetId={selectedAssetId} onCommitRename={onCommitRename} onDragAsset={onDragAsset} onDropFiles={onDropFiles} onDropIntentChange={onDropIntentChange} onMoveAsset={onMoveAsset} onOpenMenu={onOpenMenu} onRenameDraftChange={onRenameDraftChange} onSelectAsset={onSelectAsset} onToggleFolder={onToggleFolder} /> : null}
        </div>;
      })}
    </div>
  );
}

function getAssetSortMenuItems(parentFolderId: string | null, onSortAssets: (parentFolderId: string | null, mode: AssetSortMode) => void): ContextMenuItem[] {
  return [
    { label: "Folders first", action: () => onSortAssets(parentFolderId, "folders-first") },
    { label: "A to Z", action: () => onSortAssets(parentFolderId, "name-asc") },
    { label: "Z to A", action: () => onSortAssets(parentFolderId, "name-desc") },
  ];
}

function getAssetDropIntent(event: DragEvent<HTMLDivElement>, item: AssetItem, parentFolderId: string | null): AssetDropIntent {
  if (parentFolderId) return { targetId: parentFolderId, action: "inside" };

  const rect = event.currentTarget.getBoundingClientRect();
  const y = (event.clientY - rect.top) / rect.height;
  if (item.kind === "folder" && y > 0.25 && y < 0.75) return { targetId: item.id, action: "inside" };
  return { targetId: item.id, action: y < 0.5 ? "before" : "after" };
}
