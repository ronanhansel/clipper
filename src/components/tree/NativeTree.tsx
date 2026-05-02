import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ForwardedRef, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";

const ROOT_ID = "__NATIVE_TREE_ROOT__";

export type NativeTreeDropTarget = { dragIds: string[]; parentId: string | null; index: number };

export type NativeTreeApi<T> = {
  hasFocus: boolean;
  openState: Record<string, boolean>;
  selectedNodes: NativeTreeNodeApi<T>[];
  visibleNodes: NativeTreeNodeApi<T>[];
  deselectAll: () => void;
  endDrag: () => void;
  hideCursor: () => void;
  onBlur: () => void;
  open: (id: string) => void;
  select: (id: string, options?: { align?: "auto" }) => void;
  setSelection: (selection: { ids: string[]; anchor?: string | null; mostRecent?: string | null }) => void;
};

export type NativeTreeNodeApi<T> = {
  id: string;
  data: T;
  level: number;
  childIndex: number;
  parent: NativeTreeNodeApi<T> | null;
  prev: NativeTreeNodeApi<T> | null;
  next: NativeTreeNodeApi<T> | null;
  children?: NativeTreeNodeApi<T>[];
  isClosed: boolean;
  isDragging: boolean;
  isEditing: boolean;
  isFocused: boolean;
  isInternal: boolean;
  isLeaf: boolean;
  isOpen: boolean;
  isRoot: false;
  isSelected: boolean;
  rowIndex: number;
  tree: NativeTreeApi<T>;
  willReceiveDrop: boolean;
  willReceiveDropBlockEnd: boolean;
  willReceiveDropBlockStart: boolean;
  willReceiveDropWithin: boolean;
  edit: () => void;
  isAncestorOf: (node: NativeTreeNodeApi<T>) => boolean;
  reset: () => void;
  submit: (name: string) => void;
  toggle: () => void;
};

export type NativeTreeNodeRendererProps<T> = {
  dragHandle: (element: HTMLDivElement | null) => void;
  node: NativeTreeNodeApi<T>;
  style: CSSProperties;
};

export type NativeTreeDragPreviewProps = {
  id: string | null;
  isDragging: boolean;
  mouse: { x: number; y: number } | null;
};

export type NativeTreeDisableDropArgs<T> = {
  parentNode: NativeTreeNodeApi<T> | { id: typeof ROOT_ID; data: null; isRoot: true };
  dragNodes: NativeTreeNodeApi<T>[];
  index: number;
};

export type NativeTreeGetDropTargetArgs<T> = {
  dragIds: string[];
  localX: number;
  localY: number;
  tree: NativeTreeApi<T>;
  width: number;
};

export type NativeTreeProps<T> = {
  data: T[];
  height: number;
  idAccessor: keyof T | ((node: T) => string);
  indent: number;
  initialOpenState?: Record<string, boolean>;
  isInternal?: (node: T) => boolean;
  movable?: boolean;
  openByDefault?: boolean;
  paddingBottom?: number;
  paddingTop?: number;
  rowHeight: number;
  width?: number | string;
  disableDrop?: (args: NativeTreeDisableDropArgs<T>) => boolean;
  getDropTarget?: (args: NativeTreeGetDropTargetArgs<T>) => NativeTreeDropTarget | null;
  onActivate?: (node: NativeTreeNodeApi<T>) => void;
  onMove?: (target: NativeTreeDropTarget) => void;
  onRename?: (args: { id: string; name: string }) => void;
  onSelect?: (nodes: NativeTreeNodeApi<T>[]) => void;
  onToggle?: (node: NativeTreeNodeApi<T>) => void;
  renderDragPreview?: (props: NativeTreeDragPreviewProps) => ReactNode;
  children: (props: NativeTreeNodeRendererProps<T>) => ReactNode;
};

export const NativeTree = forwardRef(function NativeTree<T>(props: NativeTreeProps<T>, ref: ForwardedRef<NativeTreeApi<T> | undefined>) {
  const {
    data,
    height,
    idAccessor,
    indent,
    initialOpenState,
    isInternal: isInternalAccessor,
    movable = false,
    openByDefault = false,
    paddingBottom = 0,
    paddingTop = 0,
    rowHeight,
    width = "100%",
    disableDrop,
    getDropTarget,
    onActivate,
    onMove,
    onRename,
    onSelect,
    onToggle,
    renderDragPreview,
    children,
  } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const openStateInitializedRef = useRef(false);
  const [openState, setOpenState] = useState<Record<string, boolean>>(() => initialOpenState ?? {});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ ids: string[]; primaryId: string; mouse: { x: number; y: number } | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<NativeTreeDropTarget | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const finishDrag = useCallback(() => {
    flushSync(() => {
      setDropTarget(null);
      setDragState(null);
    });
  }, []);

  useEffect(() => {
    if (openStateInitializedRef.current) return;
    if (initialOpenState) setOpenState(initialOpenState);
    openStateInitializedRef.current = true;
  }, [initialOpenState]);

  const getId = (node: T) => typeof idAccessor === "function" ? idAccessor(node) : String(node[idAccessor]);
  const getChildren = (node: T): T[] => {
    const childrenValue = (node as { children?: T[] }).children;
    return Array.isArray(childrenValue) ? childrenValue : [];
  };

  const apiRef = useRef<NativeTreeApi<T>>(null as unknown as NativeTreeApi<T>);
  const visibleNodes = useMemo(() => {
    const nodes: NativeTreeNodeApi<T>[] = [];
    const selectedSet = new Set(selectedIds);
    const draggingSet = new Set(dragState?.ids ?? []);

    function pushTree(items: T[], level: number, parent: NativeTreeNodeApi<T> | null) {
      const siblingNodes: NativeTreeNodeApi<T>[] = [];
      items.forEach((item, childIndex) => {
        const id = getId(item);
        const rawChildren = getChildren(item);
        const isInternal = isInternalAccessor ? isInternalAccessor(item) : rawChildren.length > 0;
        const isOpen = isInternal && (openState[id] ?? openByDefault);
        const node: NativeTreeNodeApi<T> = {
          id,
          data: item,
          level,
          childIndex,
          parent,
          prev: null,
          next: null,
          children: undefined,
          isClosed: isInternal && !isOpen,
          isDragging: draggingSet.has(id),
          isEditing: editingId === id,
          isFocused: focusedId === id,
          isInternal,
          isLeaf: !isInternal,
          isOpen,
          isRoot: false as const,
          isSelected: selectedSet.has(id),
          rowIndex: nodes.length,
          tree: apiRef.current,
          willReceiveDrop: dropTarget?.parentId === id,
          willReceiveDropBlockEnd: false,
          willReceiveDropBlockStart: false,
          willReceiveDropWithin: false,
          edit: () => setEditingId(id),
          isAncestorOf: (candidate: NativeTreeNodeApi<T>) => {
            let current = candidate.parent;
            while (current) {
              if (current.id === id) return true;
              current = current.parent;
            }
            return false;
          },
          reset: () => setEditingId(null),
          submit: (name: string) => {
            setEditingId(null);
            onRename?.({ id, name });
          },
          toggle: () => {
            if (!isInternal) return;
            setOpenState((current) => ({ ...current, [id]: !(current[id] ?? openByDefault) }));
            onToggle?.(node);
          },
        };
        siblingNodes.push(node);
        nodes.push(node);
        if (isInternal && isOpen) node.children = pushTree(rawChildren, level + 1, node);
      });
      siblingNodes.forEach((node, index) => {
        node.prev = index > 0 ? siblingNodes[index - 1] : null;
        node.next = index < siblingNodes.length - 1 ? siblingNodes[index + 1] : null;
      });
      return siblingNodes;
    }

    pushTree(data, 0, null);
    const dropBlock = getDropBlock(dropTarget?.parentId ?? null, dropTarget ? nodes : []);
    for (let index = 0; index < nodes.length; index += 1) {
      nodes[index].rowIndex = index;
      nodes[index].prev = index > 0 ? nodes[index - 1] : null;
      nodes[index].next = index < nodes.length - 1 ? nodes[index + 1] : null;
      nodes[index].willReceiveDropWithin = Boolean(dropBlock && index >= dropBlock.start && index <= dropBlock.end);
      nodes[index].willReceiveDropBlockStart = Boolean(dropBlock && index === dropBlock.start);
      nodes[index].willReceiveDropBlockEnd = Boolean(dropBlock && index === dropBlock.end);
    }
    return nodes;
  }, [data, dragState?.ids, dropTarget?.parentId, editingId, focusedId, idAccessor, isInternalAccessor, onRename, onToggle, openByDefault, openState, selectedIds]);

  const selectedNodes = useMemo(() => selectedIds.flatMap((id) => visibleNodes.find((node) => node.id === id) ?? []), [selectedIds, visibleNodes]);

  const api = useMemo<NativeTreeApi<T>>(() => ({
    get hasFocus() { return focusedId !== null; },
    get openState() { return openState; },
    get selectedNodes() { return selectedNodes; },
    get visibleNodes() { return visibleNodes; },
    deselectAll: () => updateSelection([]),
    endDrag: finishDrag,
    hideCursor: () => setDropTarget(null),
    onBlur: () => setFocusedId(null),
    open: (id: string) => setOpenState((current) => ({ ...current, [id]: true })),
    select: (id: string) => updateSelection([id], id),
    setSelection: (selection) => updateSelection(selection.ids, selection.mostRecent ?? selection.anchor ?? selection.ids[0] ?? null),
  }), [finishDrag, focusedId, openState, selectedNodes, visibleNodes]);
  apiRef.current = api;
  useImperativeHandle(ref, () => api, [api]);

  function updateSelection(nextIds: string[], focusId = nextIds[0] ?? null) {
    setSelectedIds(nextIds);
    setFocusedId(focusId);
    window.setTimeout(() => onSelect?.(nextIds.flatMap((id) => apiRef.current.visibleNodes.find((node) => node.id === id) ?? [])), 0);
  }

  function selectNode(event: MouseEvent<HTMLDivElement>, node: NativeTreeNodeApi<T>) {
    if (editingId) return;
    let nextIds = [node.id];
    if (event.metaKey || event.ctrlKey) nextIds = selectedIdsRef.current.includes(node.id) ? selectedIdsRef.current.filter((id) => id !== node.id) : [...selectedIdsRef.current, node.id];
    if (event.shiftKey && selectedIdsRef.current.length) {
      const anchor = visibleNodes.findIndex((item) => item.id === selectedIdsRef.current[0]);
      const target = visibleNodes.findIndex((item) => item.id === node.id);
      if (anchor >= 0 && target >= 0) nextIds = visibleNodes.slice(Math.min(anchor, target), Math.max(anchor, target) + 1).map((item) => item.id);
    }
    updateSelection(nextIds, node.id);
    onActivate?.(node);
  }

  function getNodeDragIds(node: NativeTreeNodeApi<T>) {
    return selectedIdsRef.current.includes(node.id) ? selectedIdsRef.current : [node.id];
  }

  function getDropBlock(parentId: string | null, nodes: NativeTreeNodeApi<T>[]) {
    if (!parentId) return null;
    const start = nodes.findIndex((node) => node.id === parentId);
    if (start < 0) return null;
    let end = start;
    for (let index = start + 1; index < nodes.length; index += 1) {
      if (!nodes[start].isAncestorOf(nodes[index])) break;
      end = index;
    }
    return { start, end };
  }

  function handleDragStart(event: globalThis.DragEvent, node: NativeTreeNodeApi<T>) {
    if (!movable || editingId) {
      event.preventDefault();
      return;
    }
    const ids = getNodeDragIds(node);
    if (!selectedIdsRef.current.includes(node.id)) updateSelection(ids, node.id);
    event.dataTransfer?.setData("text/plain", node.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = event.dataTransfer.types.includes("application/x-clipper-composition") ? "copyMove" : "move";
    setDragState({ ids, primaryId: node.id, mouse: { x: event.clientX, y: event.clientY } });
  }

  function getDefaultDropTarget(localY: number): NativeTreeDropTarget | null {
    if (!dragState?.ids.length || !visibleNodes.length) return null;
    const rowIndex = Math.max(0, Math.min(visibleNodes.length - 1, Math.floor((localY - paddingTop) / rowHeight)));
    const node = visibleNodes[rowIndex];
    if (!node) return null;
    const yInRow = localY - paddingTop - rowIndex * rowHeight;
    if (node.isInternal && yInRow > rowHeight * 0.25 && yInRow < rowHeight * 0.75) return { dragIds: dragState.ids, parentId: node.id, index: 0 };
    return { dragIds: dragState.ids, parentId: node.parent?.id ?? null, index: node.childIndex + (yInRow >= rowHeight / 2 ? 1 : 0) };
  }

  function getCurrentDropTarget(event: Pick<globalThis.DragEvent, "clientX" | "clientY">) {
    if (!movable || !dragState) return null;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const target = getDropTarget?.({ dragIds: dragState.ids, localX, localY, tree: apiRef.current, width: rect.width }) ?? getDefaultDropTarget(localY);
    if (!target) return null;
    const rootNode: { id: typeof ROOT_ID; data: null; isRoot: true } = { id: ROOT_ID, data: null, isRoot: true };
    const parentNode = target.parentId ? visibleNodes.find((node) => node.id === target.parentId) : rootNode;
    const dragNodes = target.dragIds.flatMap((id) => visibleNodes.find((node) => node.id === id) ?? []);
    if (!parentNode || dragNodes.length !== target.dragIds.length || disableDrop?.({ parentNode, dragNodes, index: target.index })) return null;
    return target;
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!movable || !dragState) return;
    const target = getCurrentDropTarget(event);
    if (!target) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragState((current) => current ? { ...current, mouse: { x: event.clientX, y: event.clientY } } : current);
    setDropTarget(target);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!movable || !dragState) return;
    const target = getCurrentDropTarget(event);
    if (!target) {
      finishDrag();
      return;
    }
    event.preventDefault();
    finishDrag();
    onMove?.(target);
  }

  function handleDragEnd() {
    finishDrag();
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!movable || !dragState) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDropTarget(null);
  }

  useEffect(() => {
    if (!dragState) return;
    function updateMouse(event: globalThis.DragEvent) {
      setDragState((current) => current ? { ...current, mouse: { x: event.clientX, y: event.clientY } } : current);
    }
    function cleanupDragState() {
      finishDrag();
    }
    function preventSnapBack(event: globalThis.DragEvent) {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    }
    
    window.addEventListener("dragover", updateMouse, true);
    window.addEventListener("dragover", preventSnapBack);
    window.addEventListener("drop", cleanupDragState);
    window.addEventListener("dragend", cleanupDragState, true);
    return () => {
      window.removeEventListener("dragover", updateMouse, true);
      window.removeEventListener("dragover", preventSnapBack);
      window.removeEventListener("drop", cleanupDragState);
      window.removeEventListener("dragend", cleanupDragState, true);
    };
  }, [dragState, finishDrag]);

  return <div ref={containerRef} className="relative overflow-hidden" style={{ height, width, paddingTop, paddingBottom }} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
    <div style={{ height: visibleNodes.length * rowHeight }}>
      {visibleNodes.map((node) => {
        const style: CSSProperties = { height: rowHeight, paddingLeft: node.level * indent };
        const dragHandle = (element: HTMLDivElement | null) => {
          if (!element) return;
          element.draggable = movable;
          element.ondragstart = (event) => handleDragStart(event, node);
          element.ondragend = handleDragEnd;
        };
        return <div key={node.id} style={{ height: rowHeight }} onClick={(event) => selectNode(event, node)}>
          {children({ dragHandle, node, style })}
        </div>;
      })}
    </div>
    {renderDragPreview?.({ id: dragState?.primaryId ?? null, isDragging: Boolean(dragState), mouse: dragState?.mouse ?? null })}
  </div>;
}) as <T>(props: NativeTreeProps<T> & { ref?: ForwardedRef<NativeTreeApi<T> | undefined> }) => ReactNode;
