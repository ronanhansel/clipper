import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Copy, Crosshair, Download, File as FileIcon, Folder, FolderPlus, Italic, Magnet, Minus, Palette, Pipette, Plus, Pause, Play, RotateCcw, Scissors, Search, Signpost, SkipBack, SkipForward, Sparkles, StepBack, StepForward, Strikethrough, Trash2, Underline } from "lucide-react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactElement, type RefObject } from "react";
import toast, { Toaster } from "react-hot-toast";
import partApiSource from "../clipper/projects/part-api.ts?raw";
import { Checkbox } from "./components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { createAgentContext } from "./core/agentContext";
import { boundsToPoints, createSelectionPayload, framePointFromClient, normalizeBounds } from "./core/geometry";
import { partFromSource, partToSource } from "./core/partSource";
import { buildLinearTimeline, formatTime, updatePartObject, validateScene } from "./core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type AssetItem, type BackgroundLayer, type Bounds, type FrameObject, type MotionEase, type Part, type PartFrame, type Point, type ProjectManifest, type RichTextSegment, type SelectionPayload, type TimelineMode, type TimelinePart, type TimelineViewportState, type TranslationMarker, type ZoomMarker } from "./core/types";
import { sampleProject } from "./sampleProject";

type Mode = "interactive" | "code";
type LeftPanelTab = "assets" | "tools";
type RightPanelTab = "video" | "motion" | "agent";
type ProjectUpdater = ProjectManifest | ((current: ProjectManifest) => ProjectManifest);
type AssetSortMode = "folders-first" | "name-asc" | "name-desc";
type ExportDialogTab = "media" | "project";
type ProjectExportFormat = "project-package" | "scene-json";
type AssetDropIntent = { targetId: string; action: "before" | "after" | "inside" };
type ContextMenuState = { x: number; y: number; items: ContextMenuItem[] } | null;
type ContextMenuItem = { label: string; action?: () => void; children?: ContextMenuItem[]; danger?: boolean; disabled?: boolean };
type VideoExportProgress = { frame: number; totalFrames: number; percent: number; status: string };

const projectManifestPath = `clipper/projects/${sampleProject.id}/project.json`;
const videoExportFrameRate = 30;

async function readTextFile(relativePath: string) {
  if (window.clipper) return window.clipper.readTextFile(relativePath);

  const response = await fetch(`/__clipper_fs/read?path=${encodeURIComponent(relativePath)}`);
  if (!response.ok) throw new Error(await response.text() || "Unable to load composition file.");
  return response.text();
}

async function writeTextFile(relativePath: string, content: string) {
  if (window.clipper) {
    await window.clipper.writeTextFile(relativePath, content);
    return;
  }

  const response = await fetch(`/__clipper_fs/write?path=${encodeURIComponent(relativePath)}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: content,
  });

  if (!response.ok) throw new Error(await response.text() || "Unable to save composition file.");
}

async function startVideoExport(defaultFileName: string, frameRate: number, width: number, height: number) {
  if (!window.clipper?.startVideoExport) throw new Error("Video export requires the Clipper desktop app. Restart the app if this was just updated.");
  return window.clipper.startVideoExport(defaultFileName, frameRate, width, height);
}

async function renderVideoExport(exportId: string, defaultFileName: string, project: ProjectManifest, scene: ProjectManifest["scenes"][number], frameRate: number) {
  if (!window.clipper?.renderVideoExport) throw new Error("Video export requires the Clipper desktop app. Restart the app if this was just updated.");
  return window.clipper.renderVideoExport(exportId, defaultFileName, project, scene, frameRate);
}

async function cancelRenderVideoExport(exportId: string) {
  await window.clipper?.cancelRenderVideoExport?.(exportId);
}

async function writeVideoFrame(sessionId: string, frameData: Uint8ClampedArray) {
  if (!window.clipper?.writeVideoFrame) throw new Error("Video export session is unavailable.");
  await window.clipper.writeVideoFrame(sessionId, frameData);
}

async function finishVideoExport(sessionId: string) {
  if (!window.clipper?.finishVideoExport) throw new Error("Video export session is unavailable.");
  return window.clipper.finishVideoExport(sessionId);
}

async function cancelVideoExport(sessionId: string) {
  await window.clipper?.cancelVideoExport?.(sessionId);
}

const defaultFramePreviewScale = 0.5;
const appDragRegion = "[-webkit-app-region:drag] select-none";
const appNoDragRegion = "[-webkit-app-region:no-drag]";
const buttonBase = "rounded-[8px] border border-transparent bg-[#171920] px-2.5 py-1.5 text-sm text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
const appBarButtonBase = "rounded-[7px] border border-transparent bg-[#171920] px-2 py-1 text-xs text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
const appBarSaveButtonEnabled = "rounded-[7px] border border-[var(--clipper-accent-strong)] bg-[var(--clipper-accent)] px-2 py-1 text-xs font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)]";
const appBarSaveButtonDisabled = "cursor-not-allowed rounded-[7px] border border-[#2d313b] bg-[#171920] px-2 py-1 text-xs font-extrabold text-[#737884] opacity-70";
const defaultZoomDuration = 2.2;
const minimumZoomDuration = 1;
const defaultTimelinePixelsPerSecond = 126;
const maxProjectHistoryActions = 1000;
const projectHistoryCoalesceMs = 700;
const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
const defaultTimelineMode: TimelineMode = "edit";
const defaultAssets: AssetItem[] = [
  { id: "ast_folder_media", name: "media", kind: "folder", children: [{ id: "ast_grid_ref", name: "grid-reference.png", kind: "file", path: "clipper/projects/prj_v01_sample/assets/media/grid-reference.png" }] },
  { id: "ast_folder_audio", name: "audio", kind: "folder", children: [] },
  { id: "ast_brand", name: "brand-palette.json", kind: "file", path: "clipper/projects/prj_v01_sample/assets/brand-palette.json" },
];
const sectionTitle = "m-0 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#d9dbe1]";
const mutedCaps = "text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]";
const panelCard = "grid gap-[5px] rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-[13px] text-[#dfe2ea]";
const segmentedTabBase = "rounded-[8px] px-2 py-1.5 text-sm font-bold transition";
const segmentedTabActive = "bg-[#272b36] text-white";
const segmentedTabInactive = "bg-[#191c24] text-[#9b9da7] hover:text-white";
const monacoOptions = {
  automaticLayout: true,
  bracketPairColorization: { enabled: true },
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  foldingHighlight: false,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  glyphMargin: false,
  hideCursorInOverviewRuler: true,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
  minimap: { enabled: false },
  overviewRulerBorder: false,
  padding: { top: 14, bottom: 14 },
  renderLineHighlight: "all",
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: "on",
} as const;
function appBarSaveButtonClass(enabled: boolean) {
  return enabled ? appBarSaveButtonEnabled : appBarSaveButtonDisabled;
}

function replacePartInProject(project: ProjectManifest, partId: string, updater: (part: Part) => Part): ProjectManifest {
  return {
    ...project,
    scenes: project.scenes.map((currentScene) => ({
      ...currentScene,
      parts: currentScene.parts.map((currentPart) => (currentPart.id === partId ? updater(currentPart) : currentPart)),
    })),
  };
}

function normalizeProject(project: ProjectManifest): ProjectManifest {
  const timelineState = project.editorState?.timeline ?? defaultTimelineViewportState;
  const timelineMode = project.editorState?.timelineMode === "composition" ? "composition" : defaultTimelineMode;

  return sanitizeProjectNumbers({
    ...project,
    editorState: {
      ...project.editorState,
      timeline: {
        displacement: roundTwo(Math.max(timelineState.displacement, 0)),
        zoom: roundTwo(Math.min(Math.max(timelineState.zoom, 0.5), 4)),
      },
      timelineMode,
    },
    scenes: project.scenes.map((scene) => ({
      ...scene,
      parts: scene.parts.map((part) => ({
        ...part,
        background: {
          ...part.background,
          stretchToElements: part.background.stretchToElements || undefined,
          elements: part.background.elements ?? [],
        },
        zoomMarkers: normalizeMendedZoomMarkerFocus(part.zoomMarkers ?? []),
        translationMarkers: part.translationMarkers ?? [],
      })),
    })),
    assets: project.assets ?? defaultAssets,
  }) as ProjectManifest;
}

type ObjectDrag = {
  origin: Point;
  partId: string;
  objects: SelectionPayload["objects"];
};

function getClipperCssVariable(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getClipperAccent() {
  const accent = getClipperCssVariable("--clipper-accent", "var(--clipper-accent)");
  const rgb = getClipperCssVariable("--clipper-accent-rgb", "244 239 228").trim().split(/\s+/).join(",");

  return {
    accent,
    alpha: (opacity: number) => `rgba(${rgb},${opacity})`,
  };
}

type ZoomMarkerSelection = { partId: string; markerId: string };
type TranslationMarkerSelection = { partId: string; markerId: string };
type TimelineMarkerMove = { sourcePartId: string; markerId: string; targetPartId: string; start: number };

function selectionObjectFromFrameObject(object: FrameObject): SelectionPayload["objects"][number] {
  return {
    id: object.id,
    name: object.name,
    selector: object.selector,
    bounds: object.bounds,
    type: object.type,
  };
}

function getBoundsUnion(bounds: Bounds[]): Bounds {
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function App() {
  const [project, setProject] = useState(() => normalizeProject(sampleProject));
  const [savedProjectSnapshot, setSavedProjectSnapshot] = useState(() => JSON.stringify(normalizeProject(sampleProject)));
  const [partSources, setPartSources] = useState<Record<string, string>>({});
  const [savedPartSourcesSnapshot, setSavedPartSourcesSnapshot] = useState("{}");
  const [mode, setMode] = useState<Mode>("interactive");
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(() => normalizeProject(sampleProject).editorState?.timelineMode ?? defaultTimelineMode);
  const [selectedSceneId, setSelectedSceneId] = useState(project.scenes[0].id);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [editingTextObjectId, setEditingTextObjectId] = useState<string | null>(null);
  const [selectedZoomMarker, setSelectedZoomMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectedZoomMarkers, setSelectedZoomMarkers] = useState<ZoomMarkerSelection[]>([]);
  const [focusPickZoomMarker, setFocusPickZoomMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectedTranslationMarker, setSelectedTranslationMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectedTranslationMarkers, setSelectedTranslationMarkers] = useState<TranslationMarkerSelection[]>([]);
  const [positionPickTranslationMarker, setPositionPickTranslationMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectionPayload, setSelectionPayload] = useState<SelectionPayload | null>(null);
  const [framePickPreviewPoint, setFramePickPreviewPoint] = useState<Point | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragBox, setDragBox] = useState<Bounds | null>(null);
  const [currentSceneTime, setCurrentSceneTime] = useState(2.6);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frameZoomBarOpen, setFrameZoomBarOpen] = useState(false);
  const [framePreviewScale, setFramePreviewScale] = useState(defaultFramePreviewScale);
  const [scrubSnapEnabled, setScrubSnapEnabled] = useState(false);
  const [fastSelectEnabled, setFastSelectEnabled] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>("assets");
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("video");
  const [sourceStatus, setSourceStatus] = useState("Loading TypeScript composition sources...");
  const [appContextMenu, setAppContextMenu] = useState<ContextMenuState>(null);
  const [renamingProject, setRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(project.name);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDialogTab, setExportDialogTab] = useState<ExportDialogTab>("media");
  const [projectExportFormat, setProjectExportFormat] = useState<ProjectExportFormat>("project-package");
  const [exportIncludeSources, setExportIncludeSources] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [videoExportProgress, setVideoExportProgress] = useState<VideoExportProgress | null>(null);
  const [videoExportCancelling, setVideoExportCancelling] = useState(false);
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef(project);
  const projectHistoryRef = useRef<{ past: ProjectManifest[]; future: ProjectManifest[] }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const saveAllChangesRef = useRef<(() => Promise<void>) | null>(null);
  const videoExportIdRef = useRef<string | null>(null);
  const currentSceneTimeRef = useRef(currentSceneTime);
  const pendingScrubTimeRef = useRef<number | null>(null);
  const scrubFrameRef = useRef(0);
  const pendingFramePickPointRef = useRef<Point | null>(null);
  const framePickFrameRef = useRef(0);
  const dragStartRef = useRef<Point | null>(null);
  const pendingDragBoxRef = useRef<Bounds | null>(null);
  const dragBoxFrameRef = useRef(0);
  const liveDragSelectionIdsRef = useRef("");
  const objectDragRef = useRef<ObjectDrag | null>(null);
  const objectDragFrameRef = useRef(0);
  const objectDragDeltaRef = useRef<Point>({ x: 0, y: 0 });
  const centerPreviewScrollRef = useRef<HTMLDivElement | null>(null);
  const projectRenameCancelledRef = useRef(false);

  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  const assets = project.assets ?? defaultAssets;
  const timeline = useMemo(() => buildLinearTimeline(scene), [scene]);
  const sceneDurationSeconds = timeline.at(-1)?.end ?? 0;
  const activeTimelinePart = getTimelinePartAtTime(timeline, currentSceneTime) ?? timeline.find((item) => item.id === selectedPartId) ?? timeline[0];
  const part = scene.parts.find((item) => item.id === activeTimelinePart?.id) ?? scene.parts[0];
  const previewTime = clamp(currentSceneTime - (activeTimelinePart?.start ?? 0), 0, part.duration);
  const selectedObject = part.objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedZoomPart = scene.parts.find((item) => item.id === selectedZoomMarker?.partId) ?? null;
  const selectedZoom = selectedZoomPart?.zoomMarkers.find((marker) => marker.id === selectedZoomMarker?.markerId) ?? null;
  const selectedTranslationPart = scene.parts.find((item) => item.id === selectedTranslationMarker?.partId) ?? null;
  const selectedTranslation = selectedTranslationPart?.translationMarkers.find((marker) => marker.id === selectedTranslationMarker?.markerId) ?? null;
  const selectedPart = scene.parts.find((item) => item.id === selectedPartId) ?? null;
  const validationErrors = useMemo(() => validateScene(scene), [scene]);
  const agentContext = useMemo(() => createAgentContext(project, scene, part, selectionPayload), [project, scene, part, selectionPayload]);
  const projectSnapshot = useMemo(() => JSON.stringify(project), [project]);
  const partSourcesSnapshot = useMemo(() => JSON.stringify(partSources), [partSources]);
  const hasUnsavedProjectChanges = projectSnapshot !== savedProjectSnapshot;
  const hasUnsavedSourceChanges = partSourcesSnapshot !== savedPartSourcesSnapshot;
  const hasUnsavedChanges = hasUnsavedProjectChanges || hasUnsavedSourceChanges;
  const isPickingZoomFocus = Boolean(focusPickZoomMarker);
  const isPickingTranslationPosition = Boolean(positionPickTranslationMarker);
  const canSelectFrameObjects = timelineMode === "edit";
  const activeZoom = timelineMode === "composition" && !isPickingZoomFocus ? getActiveZoom(part.zoomMarkers, previewTime) : null;
  const activeTranslation = timelineMode === "composition" && !isPickingTranslationPosition ? getActiveTranslation(part.translationMarkers, previewTime) : null;
  const persistedFramePickPoint = isPickingZoomFocus && selectedZoom ? selectedZoom.focus : isPickingTranslationPosition && selectedTranslation ? cameraTranslationToFramePoint(selectedTranslation.position) : null;
  const framePickPoint = framePickPreviewPoint ?? persistedFramePickPoint;
  const zoomScale = activeZoom?.scale ?? 1;
  const currentPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === part.id).map((selection) => selection.markerId);
  const selectedZoomPartSelectedZoomIds = selectedZoomPart ? selectedZoomMarkers.filter((selection) => selection.partId === selectedZoomPart.id).map((selection) => selection.markerId) : [];
  const selectedZoomSnapMarkers = selectedZoomMarkers.flatMap((selection) => {
    const zoomPart = scene.parts.find((item) => item.id === selection.partId);
    const zoomMarker = zoomPart?.zoomMarkers.find((item) => item.id === selection.markerId);
    return zoomMarker ? [zoomMarker] : [];
  });
  const selectedZoomSnapInActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedZoom?.snapIn);
  const selectedZoomSnapOutActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedZoom?.snapOut);
  const selectedZoomMiddleSnap = getSelectedActiveMiddleMend(part.zoomMarkers, currentPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(part.zoomMarkers, currentPartSelectedZoomIds);
  const selectedZoomPartMiddleSnap = selectedZoomPart ? getSelectedActiveMiddleMend(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds) : null;
  const selectedZoomPartMiddleSnapActive = selectedZoomPart ? isZoomMiddleSnapActive(selectedZoomPart.zoomMarkers, selectedZoomPartMiddleSnap) : false;
  const selectedZoomPartMiddleTransitionMode = getMiddleTransitionMode(selectedZoomPart?.zoomMarkers ?? [], selectedZoomPartMiddleSnap);
  const zoomMiddleSnap = selectedZoomMiddleSnap ?? getZoomMiddleSnap(part.zoomMarkers, previewTime);
  const inspectorZoomMiddleSnap = selectedZoomPartMiddleSnap ?? (selectedZoomPart?.id === part.id ? zoomMiddleSnap : null);
  const currentPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === part.id).map((selection) => selection.markerId);
  const selectedTranslationPartSelectedTranslationIds = selectedTranslationPart ? selectedTranslationMarkers.filter((selection) => selection.partId === selectedTranslationPart.id).map((selection) => selection.markerId) : [];
  const selectedTranslationSnapMarkers = selectedTranslationMarkers.flatMap((selection) => {
    const translationPart = scene.parts.find((item) => item.id === selection.partId);
    const translationMarker = translationPart?.translationMarkers.find((item) => item.id === selection.markerId);
    return translationMarker ? [translationMarker] : [];
  });
  const selectedTranslationSnapInActive = selectedTranslationSnapMarkers.length > 1 ? selectedTranslationSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedTranslation?.snapIn);
  const selectedTranslationSnapOutActive = selectedTranslationSnapMarkers.length > 1 ? selectedTranslationSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedTranslation?.snapOut);
  const selectedTranslationMiddleSnap = getSelectedActiveMiddleMend(part.translationMarkers, currentPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(part.translationMarkers, currentPartSelectedTranslationIds);
  const selectedTranslationPartMiddleSnap = selectedTranslationPart ? getSelectedActiveMiddleMend(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds) : null;
  const selectedTranslationPartMiddleSnapActive = selectedTranslationPart ? isZoomMiddleSnapActive(selectedTranslationPart.translationMarkers, selectedTranslationPartMiddleSnap) : false;
  const selectedTranslationPartMiddleTransitionMode = getMiddleTransitionMode(selectedTranslationPart?.translationMarkers ?? [], selectedTranslationPartMiddleSnap);
  const translationMiddleSnap = selectedTranslationMiddleSnap ?? getZoomMiddleSnap(part.translationMarkers, previewTime);
  const inspectorTranslationMiddleSnap = selectedTranslationPartMiddleSnap ?? (selectedTranslationPart?.id === part.id ? translationMiddleSnap : null);
  function replaceProject(nextProject: ProjectManifest, options: { history?: boolean; syncSources?: boolean } = {}) {
    const normalizedProject = normalizeProject(nextProject);
    const currentProject = projectRef.current;
    if (JSON.stringify(normalizedProject) === JSON.stringify(currentProject)) return;

    if (options.history !== false) {
      const now = Date.now();
      const isCoalescedAction = now - lastProjectHistoryAtRef.current < projectHistoryCoalesceMs && projectHistoryRef.current.past.length > 0;

      projectHistoryRef.current = {
        past: isCoalescedAction ? projectHistoryRef.current.past : [...projectHistoryRef.current.past, currentProject].slice(-maxProjectHistoryActions),
        future: [],
      };
      lastProjectHistoryAtRef.current = now;
    }

    projectRef.current = normalizedProject;
    setProject(normalizedProject);
    setTimelineMode(normalizedProject.editorState?.timelineMode ?? defaultTimelineMode);
    if (options.syncSources !== false) syncPartSourcesFromProject(normalizedProject, currentProject);
  }

  function updateProject(updater: ProjectUpdater, options?: { history?: boolean }) {
    const nextProject = typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
  }

  function syncPartSourcesFromProject(nextProject: ProjectManifest, previousProject?: ProjectManifest) {
    setPartSources((currentSources) => {
      let changed = false;
      const nextSources = { ...currentSources };
      for (const nextScene of nextProject.scenes) {
        const previousScene = previousProject?.scenes.find((item) => item.id === nextScene.id);
        for (const nextPart of nextScene.parts) {
          const previousPart = previousScene?.parts.find((item) => item.id === nextPart.id);
          if (previousPart && JSON.stringify(previousPart) === JSON.stringify(nextPart)) continue;
          nextSources[nextPart.filePath] = partToSource(nextPart);
          changed = true;
        }
      }
      return changed ? nextSources : currentSources;
    });
  }

  function resetProjectHistory() {
    projectHistoryRef.current = { past: [], future: [] };
    lastProjectHistoryAtRef.current = 0;
  }

  function undoProjectChange() {
    const previousProject = projectHistoryRef.current.past.at(-1);
    if (!previousProject) return;

    projectHistoryRef.current = {
      past: projectHistoryRef.current.past.slice(0, -1),
      future: [projectRef.current, ...projectHistoryRef.current.future].slice(0, maxProjectHistoryActions),
    };
    lastProjectHistoryAtRef.current = 0;
    const currentProject = projectRef.current;
    projectRef.current = previousProject;
    setProject(previousProject);
    setTimelineMode(previousProject.editorState?.timelineMode ?? defaultTimelineMode);
    syncPartSourcesFromProject(previousProject, currentProject);
  }

  function redoProjectChange() {
    const nextProject = projectHistoryRef.current.future[0];
    if (!nextProject) return;

    projectHistoryRef.current = {
      past: [...projectHistoryRef.current.past, projectRef.current].slice(-maxProjectHistoryActions),
      future: projectHistoryRef.current.future.slice(1),
    };
    lastProjectHistoryAtRef.current = 0;
    const currentProject = projectRef.current;
    projectRef.current = nextProject;
    setProject(nextProject);
    setTimelineMode(nextProject.editorState?.timelineMode ?? defaultTimelineMode);
    syncPartSourcesFromProject(nextProject, currentProject);
  }

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    return window.clipper?.onVideoExportProgress?.((exportId, progress) => {
      if (videoExportIdRef.current !== exportId) return;
      setVideoExportProgress(progress);
    });
  }, []);

  useEffect(() => {
    currentSceneTimeRef.current = currentSceneTime;
  }, [currentSceneTime]);

  useEffect(() => () => {
    if (scrubFrameRef.current) cancelAnimationFrame(scrubFrameRef.current);
    if (framePickFrameRef.current) cancelAnimationFrame(framePickFrameRef.current);
    if (dragBoxFrameRef.current) cancelAnimationFrame(dragBoxFrameRef.current);
    if (objectDragFrameRef.current) cancelAnimationFrame(objectDragFrameRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;

    readTextFile(projectManifestPath).then((content) => {
      if (cancelled) return;
      const loadedProject = normalizeProject(JSON.parse(content) as ProjectManifest);
      resetProjectHistory();
      replaceProject(loadedProject, { history: false });
      setSavedProjectSnapshot(JSON.stringify(loadedProject));
      setSourceStatus(`Project loaded from ${projectManifestPath}.`);
    }).catch((error: unknown) => {
      if (cancelled) return;
      const fallbackProject = normalizeProject(sampleProject);
      resetProjectHistory();
      replaceProject(fallbackProject, { history: false });
      setSavedProjectSnapshot(JSON.stringify(fallbackProject));
      setSourceStatus(error instanceof Error ? `Using bundled sample project. ${error.message}` : "Using bundled sample project.");
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selectedPartId && activeTimelinePart && activeTimelinePart.id !== selectedPartId) {
      setSelectedObjectId(null);
      setSelectionPayload(null);
    }
  }, [activeTimelinePart, selectedPartId, selectedTranslationMarker, selectedZoomMarker]);

  useEffect(() => {
    if (timelineMode === "edit") {
      clearMarkerSelection();
      return;
    }

    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearObjectDrag();
    clearDragBox();
  }, [timelineMode]);

  useEffect(() => {
    function clearFrameSelectionOnOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (isCodeEditorTarget(target) || isInspectorTarget(target) || isSelectPopoverTarget(target)) return;
      if (frameViewportRef.current?.contains(event.target as Node)) return;
      setEditingTextObjectId(null);
      setSelectedObjectId(null);
      setSelectionPayload(null);
      clearObjectDrag();
      clearDragBox();
    }

    window.addEventListener("pointerdown", clearFrameSelectionOnOutsidePointer);
    return () => window.removeEventListener("pointerdown", clearFrameSelectionOnOutsidePointer);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let previousTime = performance.now();
    let frame = 0;

    function tick(now: number) {
      const deltaSeconds = (now - previousTime) / 1000;
      previousTime = now;
      setCurrentSceneTime((current) => Math.min(current + deltaSeconds, sceneDurationSeconds));
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, sceneDurationSeconds]);

  useEffect(() => {
    if (isPlaying && currentSceneTime >= sceneDurationSeconds) {
      setIsPlaying(false);
    }
  }, [currentSceneTime, isPlaying, sceneDurationSeconds]);

  useEffect(() => {
    if (!cameraRef.current) return;
    const scale = activeZoom?.scale ?? 1;
    const focus = activeZoom?.focus ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 };
    const x = (FRAME_WIDTH / 2 - focus.x) * (scale - 1) + (activeTranslation?.position.x ?? 0);
    const y = (FRAME_HEIGHT / 2 - focus.y) * (scale - 1) + (activeTranslation?.position.y ?? 0);
    const nextTransform = `translate(${x}px, ${y}px) scale(${scale})`;
    cameraRef.current.style.transform = nextTransform;
  }, [activeTranslation, activeZoom]);

  useEffect(() => {
    function switchModeShortcut(key: "1" | "2" | "3" | "4") {
      if (key === "1") setMode("interactive");
      if (key === "2") setMode("code");
      if (key === "3") updateTimelineMode("edit");
      if (key === "4") updateTimelineMode("composition");
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveAllChangesRef.current?.();
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key === "1") {
          event.preventDefault();
          switchModeShortcut("1");
          return;
        }

        if (event.key === "2") {
          event.preventDefault();
          switchModeShortcut("2");
          return;
        }

        if (event.key === "3") {
          event.preventDefault();
          switchModeShortcut("3");
          return;
        }

        if (event.key === "4") {
          event.preventDefault();
          switchModeShortcut("4");
          return;
        }
      }

      const target = event.target as HTMLElement | null;
      if (isCodeEditorTarget(target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoProjectChange();
        else undoProjectChange();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoProjectChange();
        return;
      }

      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((current) => !current);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        jumpToEnd();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepSceneTime(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        jumpToNextPart();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setIsPlaying(false);
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        setScrubSnapEnabled((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        setFastSelectEnabled((current) => !current);
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedZoomMarker) {
        event.preventDefault();
        deleteZoomMarker(selectedZoomMarker.partId, selectedZoomMarker.markerId);
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && selectedTranslationMarker) {
        event.preventDefault();
        deleteTranslationMarker(selectedTranslationMarker.partId, selectedTranslationMarker.markerId);
      }
    }

    const unsubscribeModeShortcut = window.clipper?.onModeShortcut(switchModeShortcut);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsubscribeModeShortcut?.();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedTranslationMarker, selectedZoomMarker]);

  function updateCurrentPart(nextPart: Part) {
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => {
        if (currentScene.id !== scene.id) return currentScene;
        return { ...currentScene, parts: currentScene.parts.map((item) => (item.id === nextPart.id ? nextPart : item)) };
      }),
    }));
  }

  function updateSceneParts(updater: (parts: Part[]) => Part[]) {
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => (currentScene.id === scene.id ? { ...currentScene, parts: updater(currentScene.parts) } : currentScene)),
    }));
  }

  function updateTimelineViewportState(updater: (state: TimelineViewportState) => TimelineViewportState) {
    updateProject((current) => {
      const currentTimelineState = current.editorState?.timeline ?? defaultTimelineViewportState;
      const nextTimelineState = updater(currentTimelineState);

      if (currentTimelineState.displacement === nextTimelineState.displacement && currentTimelineState.zoom === nextTimelineState.zoom) return current;

      const nextProject = {
        ...current,
        editorState: {
          ...current.editorState,
          timeline: nextTimelineState,
          timelineMode: current.editorState?.timelineMode ?? timelineMode,
        },
      };
      return nextProject;
    }, { history: false });
  }

  function updateTimelineMode(nextMode: TimelineMode) {
    setTimelineMode(nextMode);
    updateProject((current) => ({
      ...current,
      editorState: {
        ...current.editorState,
        timeline: current.editorState?.timeline ?? defaultTimelineViewportState,
        timelineMode: nextMode,
      },
    }), { history: false });
  }

  function updateObject(objectId: string, updater: (object: FrameObject) => FrameObject) {
    updateProject((current) => ({
      ...current,
      scenes: current.scenes.map((currentScene) => {
        if (currentScene.id !== scene.id) return currentScene;
        return { ...currentScene, parts: updatePartObject(currentScene.parts, part.id, objectId, updater) };
      }),
    }));
  }

  function updateSelectedObject(updater: (object: FrameObject) => FrameObject) {
    if (!selectedObjectId) return;
    updateObject(selectedObjectId, updater);
  }

  function updateTextObjectContent(objectId: string, content: string, richText?: RichTextSegment[]) {
    updateObject(objectId, (object) => (object.type === "text" ? { ...object, content, richText } : object));
  }

  function updatePartFrame(updater: (frame: PartFrame) => PartFrame) {
    updateCurrentPart({ ...part, frame: updater(part.frame) });
  }

  function updatePartBackground(updater: (background: BackgroundLayer) => BackgroundLayer) {
    updateCurrentPart({ ...part, background: updater(part.background) });
  }

  function clearMarkerSelection() {
    cancelFramePickPreview();
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function clearNodeSelection() {
    setEditingTextObjectId(null);
    setSelectedPartId("");
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
  }

  async function updatePartFromSource(basePart: Part, source: string, options: { syncSource?: boolean; history?: boolean } = {}) {
    setPartSources((current) => ({ ...current, [basePart.filePath]: source }));
    const nextPart = await partFromSource(basePart, source);
    const nextProject = replacePartInProject(projectRef.current, basePart.id, (currentPart) => ({
      ...nextPart,
      zoomMarkers: currentPart.zoomMarkers,
      translationMarkers: currentPart.translationMarkers,
      snapshot: currentPart.snapshot,
    }));

    replaceProject(nextProject, { history: options.history, syncSources: options.syncSource !== false });

    setSourceStatus(`Preview updated from ${nextPart.filePath}.`);
  }

  function recordLoadedPartSource(filePath: string, source: string) {
    const nextSources = { ...partSources, [filePath]: source };
    setPartSources(nextSources);
    setSavedPartSourcesSnapshot(JSON.stringify(nextSources));
  }

  async function saveProject(projectToSave = projectRef.current) {
    const snapshot = JSON.stringify(projectToSave);

    try {
      await writeTextFile(projectManifestPath, `${JSON.stringify(projectToSave, null, 2)}\n`);
      await Promise.all(projectToSave.scenes.flatMap((item) => item.parts).map((item) => writeTextFile(item.filePath, partSources[item.filePath] ?? partToSource(item))));
      setSavedProjectSnapshot(snapshot);
      setSavedPartSourcesSnapshot(JSON.stringify(partSources));
      setSourceStatus(`Project and composition sources saved.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save project.");
    }
  }

  async function saveAllChanges() {
    if (!hasUnsavedChanges) return;
    await saveProject(projectRef.current);
  }

  async function exportProject() {
    setIsExporting(true);

    try {
      const currentProject = projectRef.current;
      const currentScene = currentProject.scenes.find((item) => item.id === selectedSceneId) ?? currentProject.scenes[0];
      const currentTimeline = buildLinearTimeline(currentScene);
      const exportPayload = projectExportFormat === "scene-json"
        ? currentScene
        : {
            kind: "clipper-project-package",
            version: currentProject.id,
            exportedAt: new Date().toISOString(),
            project: currentProject,
            scene: currentScene,
            media: {
              resolution: currentProject.resolution,
              durationSeconds: currentTimeline.at(-1)?.end ?? 0,
              parts: currentTimeline.map((item) => ({ id: item.id, name: item.name, filePath: item.filePath, start: item.start, end: item.end, duration: item.duration })),
              assetsPath: currentProject.assetsPath,
              assets: currentProject.assets ?? defaultAssets,
            },
            validation: validateScene(currentScene),
            sources: exportIncludeSources ? Object.fromEntries(currentScene.parts.map((item) => [item.filePath, partSources[item.filePath] ?? partToSource(item)])) : undefined,
          };
      const content = `${JSON.stringify(exportPayload, null, 2)}\n`;
      const defaultFileName = `${slugifyFileName(currentProject.name)}-${slugifyFileName(currentScene.name)}.${projectExportFormat === "scene-json" ? "scene" : "project"}.json`;

      if (window.clipper?.exportMediaFile) {
        const exportPath = await window.clipper.exportMediaFile(defaultFileName, content);
        if (!exportPath) return;
        toast.success(`Exported to ${truncateMiddle(exportPath, 58)}`);
      } else {
        downloadTextFile(defaultFileName, content);
        toast.success("Export downloaded");
      }

      setExportDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export project.");
    } finally {
      setIsExporting(false);
    }
  }

  async function exportRenderedMedia() {
    setIsExporting(true);
    setExportProgress(null);
    setVideoExportCancelling(false);
    const exportId = crypto.randomUUID();
    videoExportIdRef.current = exportId;

    try {
      const currentProject = projectRef.current;
      const currentScene = currentProject.scenes.find((item) => item.id === selectedSceneId) ?? currentProject.scenes[0];
      const currentTimeline = buildLinearTimeline(currentScene);
      const durationSeconds = currentTimeline.at(-1)?.end ?? 0;
      const totalFrames = Math.max(1, Math.ceil(durationSeconds * videoExportFrameRate));
      const defaultFileName = `${slugifyFileName(currentProject.name)}-${slugifyFileName(currentScene.name)}.mp4`;
      setExportDialogOpen(false);
      setExportProgress(`Rendering ${totalFrames} frames`);
      setVideoExportProgress({ frame: 0, totalFrames, percent: 0, status: "Preparing export..." });
      const exportPath = await renderVideoExport(exportId, defaultFileName, currentProject, currentScene, videoExportFrameRate);
      if (!exportPath) return;
      toast.success(`Rendered video to ${truncateMiddle(exportPath, 58)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to render media.";
      if (!message.includes("Video export cancelled.")) toast.error(message);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      setVideoExportProgress(null);
      setVideoExportCancelling(false);
      videoExportIdRef.current = null;
    }
  }

  async function stopVideoExport() {
    const exportId = videoExportIdRef.current;
    if (!exportId) return;
    setVideoExportCancelling(true);
    await cancelRenderVideoExport(exportId);
  }

  useEffect(() => {
    saveAllChangesRef.current = saveAllChanges;
  });

  function selectPart(partId: string) {
    setSelectedPartId(partId);
    setSelectedObjectId(null);
    clearMarkerSelection();
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectZoomMarker(partId: string, markerId: string) {
    setSelectedPartId(partId);
    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectZoomMarkers(selection: ZoomMarkerSelection[]) {
    setSelectedZoomMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedZoomMarker(primarySelection);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setIsPlaying(false);
    if (primarySelection) setSelectedPartId(primarySelection.partId);
  }

  function startZoomFocusPick(partId: string, markerId: string) {
    if (focusPickZoomMarker?.partId === partId && focusPickZoomMarker.markerId === markerId) {
      setFocusPickZoomMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setFocusPickZoomMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function selectTranslationMarker(partId: string, markerId: string) {
    setSelectedPartId(partId);
    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectTranslationMarkers(selection: TranslationMarkerSelection[]) {
    setSelectedTranslationMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedTranslationMarker(primarySelection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (primarySelection) setSelectedPartId(primarySelection.partId);
  }

  function startTranslationPositionPick(partId: string, markerId: string) {
    if (positionPickTranslationMarker?.partId === partId && positionPickTranslationMarker.markerId === markerId) {
      setPositionPickTranslationMarker(null);
      setFramePickPreviewPoint(null);
      return;
    }

    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setPositionPickTranslationMarker({ partId, markerId });
    setFramePickPreviewPoint(null);
  }

  function scrubToSceneTime(time: number) {
    pendingScrubTimeRef.current = clamp(time, 0, sceneDurationSeconds);
    if (scrubFrameRef.current) return;

    scrubFrameRef.current = requestAnimationFrame(() => {
      scrubFrameRef.current = 0;
      const nextTime = pendingScrubTimeRef.current;
      pendingScrubTimeRef.current = null;
      if (nextTime === null || Math.abs(nextTime - currentSceneTimeRef.current) < 0.001) return;
      currentSceneTimeRef.current = nextTime;
      setCurrentSceneTime(nextTime);
    });
  }

  function stepSceneTime(delta: number) {
    setIsPlaying(false);
    scrubToSceneTime(currentSceneTime + delta);
  }

  function jumpToStart() {
    setIsPlaying(false);
    scrubToSceneTime(0);
  }

  function jumpToNextPart() {
    setIsPlaying(false);
    const nextPart = timeline.find((item) => item.start > currentSceneTime + 0.001);
    scrubToSceneTime(nextPart?.start ?? sceneDurationSeconds);
  }

  function jumpToEnd() {
    setIsPlaying(false);
    scrubToSceneTime(sceneDurationSeconds);
  }

  function reorderPart(sourcePartId: string, targetPartId: string) {
    if (sourcePartId === targetPartId) return;
    updateSceneParts((parts) => {
      const sourceIndex = parts.findIndex((item) => item.id === sourcePartId);
      const targetIndex = parts.findIndex((item) => item.id === targetPartId);
      if (sourceIndex < 0 || targetIndex < 0) return parts;
      const next = [...parts];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function updateZoomMarker(partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker));
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers) };
    }));
  }

  function updateZoomMarkers(partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(updater(item.zoomMarkers, item)) };
    }));
  }

  function updateZoomMarkerFocusGroup(partId: string, markerId: string, focus: Point) {
    updateZoomMarkers(partId, (markers) => {
      const markerIds = getMendedMarkerIds(markers, markerId);
      return markers.map((marker) => (markerIds.has(marker.id) ? { ...marker, focus } : marker));
    });
  }

  function updateSelectedZoomSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedZoomMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      const zoomMarkers = item.zoomMarkers.map((marker) => (selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined } : marker));
      return { ...item, zoomMarkers: normalizeMendedZoomMarkerFocus(zoomMarkers) };
    }));
  }

  function updateSelectedTranslationSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedTranslationMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      return { ...item, translationMarkers: item.translationMarkers.map((marker) => (selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined } : marker)) };
    }));
  }

  function updateTranslationMarkers(partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return { ...item, translationMarkers: updater(item.translationMarkers, item) };
    }));
  }

  function moveZoomMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number) {
    updateSceneParts((parts) => {
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const marker = sourcePart?.zoomMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !marker) return parts;

      return parts.map((item) => {
        if (item.id === sourcePartId && item.id !== targetPartId) {
          return { ...item, zoomMarkers: item.zoomMarkers.filter((current) => current.id !== markerId) };
        }

        if (item.id !== targetPartId) return item;

        const movedMarker = { ...marker, start: clamp(start, 0, Math.max(item.duration - marker.duration, 0)) };
        const existingMarkerIndex = item.zoomMarkers.findIndex((current) => current.id === markerId);
        if (existingMarkerIndex >= 0) {
          return { ...item, zoomMarkers: item.zoomMarkers.map((current) => (current.id === markerId ? movedMarker : current)) };
        }

        return { ...item, zoomMarkers: [...item.zoomMarkers, movedMarker] };
      });
    });

    if (sourcePartId !== targetPartId) setSelectedZoomMarker({ partId: targetPartId, markerId });
  }

  function moveZoomMarkers(moves: TimelineMarkerMove[]) {
    updateSceneParts((parts) => {
      const movedMarkers = new Map<string, ZoomMarker>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.zoomMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !marker) continue;

        movedMarkers.set(move.markerId, { ...marker, start: clamp(move.start, 0, Math.max(targetPart.duration - marker.duration, 0)) });
        targetMovesByPart.set(move.targetPartId, [...(targetMovesByPart.get(move.targetPartId) ?? []), move]);
        if (move.sourcePartId !== move.targetPartId) {
          removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
        }
      }

      if (movedMarkers.size === 0) return parts;

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        let zoomMarkers = removeKeys ? item.zoomMarkers.filter((current) => !removeKeys.has(current.id)) : item.zoomMarkers;

        for (const move of targetMoves) {
          const movedMarker = movedMarkers.get(move.markerId);
          if (!movedMarker) continue;
          const existingMarkerIndex = zoomMarkers.findIndex((current) => current.id === move.markerId);
          zoomMarkers = existingMarkerIndex >= 0
            ? zoomMarkers.map((current) => (current.id === move.markerId ? movedMarker : current))
            : [...zoomMarkers, movedMarker];
        }

        return zoomMarkers === item.zoomMarkers ? item : { ...item, zoomMarkers };
      });
    });

    const nextSelection = selectedZoomMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedZoomMarkers(nextSelection);
      setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedZoomMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function updateTranslationMarker(partId: string, markerId: string, updater: (marker: TranslationMarker, part: Part) => TranslationMarker) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return { ...item, translationMarkers: item.translationMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker)) };
    }));
  }

  function moveTranslationMarker(sourcePartId: string, markerId: string, targetPartId: string, start: number) {
    updateSceneParts((parts) => {
      const sourcePart = parts.find((item) => item.id === sourcePartId);
      const marker = sourcePart?.translationMarkers.find((item) => item.id === markerId);
      if (!sourcePart || !marker) return parts;

      return parts.map((item) => {
        if (item.id === sourcePartId && item.id !== targetPartId) {
          return { ...item, translationMarkers: item.translationMarkers.filter((current) => current.id !== markerId) };
        }

        if (item.id !== targetPartId) return item;

        const movedMarker = { ...marker, start: clamp(start, 0, Math.max(item.duration - marker.duration, 0)) };
        const existingMarkerIndex = item.translationMarkers.findIndex((current) => current.id === markerId);
        if (existingMarkerIndex >= 0) {
          return { ...item, translationMarkers: item.translationMarkers.map((current) => (current.id === markerId ? movedMarker : current)) };
        }

        return { ...item, translationMarkers: [...item.translationMarkers, movedMarker] };
      });
    });

    if (sourcePartId !== targetPartId) setSelectedTranslationMarker({ partId: targetPartId, markerId });
  }

  function moveTranslationMarkers(moves: TimelineMarkerMove[]) {
    updateSceneParts((parts) => {
      const movedMarkers = new Map<string, TranslationMarker>();
      const targetMovesByPart = new Map<string, TimelineMarkerMove[]>();
      const removeKeysByPart = new Map<string, Set<string>>();

      for (const move of moves) {
        const sourcePart = parts.find((item) => item.id === move.sourcePartId);
        const targetPart = parts.find((item) => item.id === move.targetPartId);
        const marker = sourcePart?.translationMarkers.find((item) => item.id === move.markerId);
        if (!sourcePart || !targetPart || !marker) continue;

        movedMarkers.set(move.markerId, { ...marker, start: clamp(move.start, 0, Math.max(targetPart.duration - marker.duration, 0)) });
        targetMovesByPart.set(move.targetPartId, [...(targetMovesByPart.get(move.targetPartId) ?? []), move]);
        if (move.sourcePartId !== move.targetPartId) {
          removeKeysByPart.set(move.sourcePartId, (removeKeysByPart.get(move.sourcePartId) ?? new Set()).add(move.markerId));
        }
      }

      if (movedMarkers.size === 0) return parts;

      return parts.map((item) => {
        const removeKeys = removeKeysByPart.get(item.id);
        const targetMoves = targetMovesByPart.get(item.id) ?? [];
        let translationMarkers = removeKeys ? item.translationMarkers.filter((current) => !removeKeys.has(current.id)) : item.translationMarkers;

        for (const move of targetMoves) {
          const movedMarker = movedMarkers.get(move.markerId);
          if (!movedMarker) continue;
          const existingMarkerIndex = translationMarkers.findIndex((current) => current.id === move.markerId);
          translationMarkers = existingMarkerIndex >= 0
            ? translationMarkers.map((current) => (current.id === move.markerId ? movedMarker : current))
            : [...translationMarkers, movedMarker];
        }

        return translationMarkers === item.translationMarkers ? item : { ...item, translationMarkers };
      });
    });

    const nextSelection = selectedTranslationMarkers.map((selection) => {
      const move = moves.find((item) => item.sourcePartId === selection.partId && item.markerId === selection.markerId);
      return move ? { partId: move.targetPartId, markerId: selection.markerId } : selection;
    });
    if (nextSelection.length > 0) {
      setSelectedTranslationMarkers(nextSelection);
      setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    } else if (moves.length === 1) {
      setSelectedTranslationMarker({ partId: moves[0].targetPartId, markerId: moves[0].markerId });
    }
  }

  function deleteZoomMarker(partId: string, markerId: string) {
    updateSceneParts((parts) => parts.map((item) => (item.id === partId ? { ...item, zoomMarkers: item.zoomMarkers.filter((marker) => marker.id !== markerId) } : item)));
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
  }

  function deleteTranslationMarker(partId: string, markerId: string) {
    updateSceneParts((parts) => parts.map((item) => (item.id === partId ? { ...item, translationMarkers: item.translationMarkers.filter((marker) => marker.id !== markerId) } : item)));
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function addZoomMarker() {
    const placement = getAvailableZoomPlacement(part.zoomMarkers, part.duration, previewTime);

    if (!placement) {
      toast.error("No room for another 1s zoom marker.");
      return;
    }

    const marker: ZoomMarker = {
      id: `zom_${Date.now().toString(36)}`,
      start: placement.start,
      duration: placement.duration,
      focus: selectedObject ? centerOf(selectedObject.bounds) : { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 },
      scale: 1.8,
    };
    updateCurrentPart({ ...part, zoomMarkers: [...part.zoomMarkers, marker] });
    setSelectedZoomMarker({ partId: part.id, markerId: marker.id });
    setSelectedZoomMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
  }

  function addTranslationMarker() {
    const placement = getAvailableZoomPlacement(part.translationMarkers, part.duration, previewTime);

    if (!placement) {
      toast.error("No room for another 1s pan marker.");
      return;
    }

    const marker: TranslationMarker = {
      id: `trn_${Date.now().toString(36)}`,
      start: placement.start,
      duration: placement.duration,
      position: selectedObject ? framePointToCameraTranslation(centerOf(selectedObject.bounds)) : { x: 0, y: 0 },
    };
    updateCurrentPart({ ...part, translationMarkers: [...part.translationMarkers, marker] });
    setSelectedTranslationMarker({ partId: part.id, markerId: marker.id });
    setSelectedTranslationMarkers([{ partId: part.id, markerId: marker.id }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
  }

  function snapZoomMiddle(targetPart = part) {
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(targetPart.zoomMarkers, snap);
    const selectedIds = new Set(targetPartSelectedZoomIds);
    const nextSelection = snap.pairs.length > 1
      ? targetPart.zoomMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => ({ partId: targetPart.id, markerId: marker.id }))
      : [{ partId: targetPart.id, markerId: snap.pairs[0].previousId }, { partId: targetPart.id, markerId: snap.pairs[0].nextId }];
    const nextBounds = new Map(targetPart.zoomMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut }]));
    const mendedIds = new Set(snap.pairs.flatMap((pair) => [pair.previousId, pair.nextId]));
    const sharedFocus = targetPart.zoomMarkers.find((marker) => marker.id === snap.pairs[0].previousId)?.focus;

    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true });
      }
    }

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        zoomMarkers: currentPart.zoomMarkers.map((marker) => {
          const bounds = nextBounds.get(marker.id);
          if (!bounds) return marker;
          return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), focus: !middleSnapActive && sharedFocus && mendedIds.has(marker.id) ? sharedFocus : marker.focus, snapIn: bounds.snapIn, snapOut: bounds.snapOut };
        }),
      };
    }));
    setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    setSelectedZoomMarkers(nextSelection);
  }

  function updateZoomMiddleTransition(targetPart: Part, mode: "instant" | "transition") {
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.zoomMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        zoomMarkers: currentPart.zoomMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker)),
      };
    }));
  }

  function updateZoomMiddleEase(targetPart: Part, ease: MotionEase | undefined) {
    const targetPartSelectedZoomIds = selectedZoomMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.zoomMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        zoomMarkers: currentPart.zoomMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleEase: ease } : marker)),
      };
    }));
  }

  function snapTranslationMiddle(targetPart = part) {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(targetPart.translationMarkers, snap);
    const selectedIds = new Set(targetPartSelectedTranslationIds);
    const nextSelection = snap.pairs.length > 1
      ? targetPart.translationMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => ({ partId: targetPart.id, markerId: marker.id }))
      : [{ partId: targetPart.id, markerId: snap.pairs[0].previousId }, { partId: targetPart.id, markerId: snap.pairs[0].nextId }];
    const nextBounds = new Map(targetPart.translationMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut }]));

    for (const pair of snap.pairs) {
      const previousBounds = nextBounds.get(pair.previousId);
      const nextMarkerBounds = nextBounds.get(pair.nextId);
      if (middleSnapActive) {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, snapOut: undefined });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, snapIn: undefined });
      } else {
        if (previousBounds) nextBounds.set(pair.previousId, { ...previousBounds, end: pair.time, snapOut: true });
        if (nextMarkerBounds) nextBounds.set(pair.nextId, { ...nextMarkerBounds, start: pair.time, snapIn: true });
      }
    }

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        translationMarkers: currentPart.translationMarkers.map((marker) => {
          const bounds = nextBounds.get(marker.id);
          if (!bounds) return marker;
          return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), snapIn: bounds.snapIn, snapOut: bounds.snapOut };
        }),
      };
    }));
    setSelectedTranslationMarker(nextSelection.at(-1) ?? null);
    setSelectedTranslationMarkers(nextSelection);
  }

  function updateTranslationMiddleTransition(targetPart: Part, mode: "instant" | "transition") {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.translationMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        translationMarkers: currentPart.translationMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleTransition: mode === "transition" ? "transition" : undefined } : marker)),
      };
    }));
  }

  function updateTranslationMiddleEase(targetPart: Part, ease: MotionEase | undefined) {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedActiveMiddleMend(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
    if (!snap || !isZoomMiddleSnapActive(targetPart.translationMarkers, snap)) return;
    const nextMarkerIds = new Set(snap.pairs.map((pair) => pair.nextId));

    updateSceneParts((parts) => parts.map((currentPart) => {
      if (currentPart.id !== targetPart.id) return currentPart;
      return {
        ...currentPart,
        translationMarkers: currentPart.translationMarkers.map((marker) => (nextMarkerIds.has(marker.id) ? { ...marker, middleEase: ease } : marker)),
      };
    }));
  }

  function getDraggedObjects(drag: ObjectDrag, delta: Point) {
    return drag.objects.map((object) => ({
      ...object,
      bounds: {
        ...object.bounds,
        x: Math.round(clamp(object.bounds.x + delta.x, -object.bounds.width, FRAME_WIDTH)),
        y: Math.round(clamp(object.bounds.y + delta.y, -object.bounds.height, FRAME_HEIGHT)),
      },
    }));
  }

  function updateObjectDragSelection(nextObjects: SelectionPayload["objects"]) {
    const selectionBox = getBoundsUnion(nextObjects.map((object) => object.bounds));
    setSelectionPayload({ selectionBox, coordinates: boundsToPoints(selectionBox), objects: nextObjects });
  }

  function getFrameObjectElement(objectId: string) {
    return frameViewportRef.current?.querySelector<HTMLElement>(`[data-object-id="${CSS.escape(objectId)}"]`) ?? null;
  }

  function getFrameSelectionBoxElement() {
    return frameViewportRef.current?.querySelector<HTMLElement>("[data-frame-selection-box]") ?? null;
  }

  function setFrameSelectionBoxDragTransform(delta: Point) {
    const element = getFrameSelectionBoxElement();
    if (!element) return;
    element.style.setProperty("--clipper-drag-x", `${delta.x}px`);
    element.style.setProperty("--clipper-drag-y", `${delta.y}px`);
  }

  function clearFrameSelectionBoxDragTransform() {
    const element = getFrameSelectionBoxElement();
    if (!element) return;
    element.style.removeProperty("--clipper-drag-x");
    element.style.removeProperty("--clipper-drag-y");
  }

  function setObjectDragTransform(objectId: string, delta: Point) {
    const element = getFrameObjectElement(objectId);
    if (!element) return;
    element.style.setProperty("--clipper-drag-x", `${delta.x}px`);
    element.style.setProperty("--clipper-drag-y", `${delta.y}px`);
  }

  function clearObjectDragTransforms(objects: SelectionPayload["objects"]) {
    for (const object of objects) {
      const element = getFrameObjectElement(object.id);
      if (!element) continue;
      element.style.removeProperty("--clipper-drag-x");
      element.style.removeProperty("--clipper-drag-y");
    }
  }

  function scheduleObjectDragPreview(delta: Point) {
    objectDragDeltaRef.current = delta;
    if (objectDragFrameRef.current) return;

    objectDragFrameRef.current = requestAnimationFrame(() => {
      objectDragFrameRef.current = 0;
      const drag = objectDragRef.current;
      if (!drag) return;

      for (const object of drag.objects) setObjectDragTransform(object.id, objectDragDeltaRef.current);
      setFrameSelectionBoxDragTransform(objectDragDeltaRef.current);
    });
  }

  function clearObjectDrag() {
    if (objectDragFrameRef.current) {
      cancelAnimationFrame(objectDragFrameRef.current);
      objectDragFrameRef.current = 0;
    }
    if (objectDragRef.current) clearObjectDragTransforms(objectDragRef.current.objects);
    clearFrameSelectionBoxDragTransform();
    objectDragRef.current = null;
    objectDragDeltaRef.current = { x: 0, y: 0 };
  }

  function finishCommittedObjectDrag(objects: SelectionPayload["objects"]) {
    objectDragRef.current = null;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    requestAnimationFrame(() => {
      clearObjectDragTransforms(objects);
      clearFrameSelectionBoxDragTransform();
    });
  }

  function scheduleDragBox(nextBounds: Bounds) {
    pendingDragBoxRef.current = nextBounds;
    if (dragBoxFrameRef.current) return;

    dragBoxFrameRef.current = requestAnimationFrame(() => {
      dragBoxFrameRef.current = 0;
      const nextDragBox = pendingDragBoxRef.current;
      setDragBox(nextDragBox);
      if (!nextDragBox) return;

      const payload = createSelectionPayload(nextDragBox, part.objects);
      const nextSelectionIds = payload.objects.map((object) => object.id).join("|");
      if (nextSelectionIds === liveDragSelectionIdsRef.current) return;

      liveDragSelectionIdsRef.current = nextSelectionIds;
      setSelectionPayload(payload.objects.length > 0 ? payload : null);
      setSelectedObjectId(payload.objects[0]?.id ?? null);
    });
  }

  function clearDragBox() {
    if (dragBoxFrameRef.current) {
      cancelAnimationFrame(dragBoxFrameRef.current);
      dragBoxFrameRef.current = 0;
    }
    dragStartRef.current = null;
    pendingDragBoxRef.current = null;
    liveDragSelectionIdsRef.current = "";
    setDragStart(null);
    setDragBox(null);
  }

  function commitObjectDrag() {
    const drag = objectDragRef.current;
    if (!drag) return;

    if (objectDragFrameRef.current) {
      cancelAnimationFrame(objectDragFrameRef.current);
      objectDragFrameRef.current = 0;
    }

    const nextObjects = getDraggedObjects(drag, objectDragDeltaRef.current);
    const nextBoundsById = new Map(nextObjects.map((object) => [object.id, object.bounds]));
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== drag.partId) return item;
      return {
        ...item,
        objects: item.objects.map((object) => {
          const nextBounds = nextBoundsById.get(object.id);
          return nextBounds ? { ...object, bounds: nextBounds } : object;
        }),
      };
    }));
    updateObjectDragSelection(nextObjects);
    finishCommittedObjectDrag(drag.objects);
  }

  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "interactive" || !cameraRef.current || objectDragRef.current) return;
    if (focusPickZoomMarker) {
      startFramePickDrag(event);
      return;
    }
    if (positionPickTranslationMarker) {
      startFramePickDrag(event);
      return;
    }
    if (!canSelectFrameObjects) return;
    if ((event.target as HTMLElement).dataset.objectId) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    dragStartRef.current = point;
    pendingDragBoxRef.current = { x: point.x, y: point.y, width: 0, height: 0 };
    liveDragSelectionIdsRef.current = "";
    setDragStart(point);
    setDragBox({ x: point.x, y: point.y, width: 0, height: 0 });
    clearNodeSelection();
  }

  function onFramePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    if (!focusPickZoomMarker && !positionPickTranslationMarker) return;
    event.stopPropagation();
    startFramePickDrag(event);
  }

  function startFramePickDrag(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFramePickFromPointer(event);
  }

  function updateFramePickFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!frameViewportRef.current) return;
    const point = framePointFromClient(event.nativeEvent, frameViewportRef.current);
    const nextPoint = { x: Math.round(clamp(point.x, 0, FRAME_WIDTH)), y: Math.round(clamp(point.y, 0, FRAME_HEIGHT)) };
    pendingFramePickPointRef.current = nextPoint;
    if (framePickFrameRef.current) return;

    framePickFrameRef.current = requestAnimationFrame(() => {
      framePickFrameRef.current = 0;
      setFramePickPreviewPoint(pendingFramePickPointRef.current);
    });
  }

  function commitFramePick() {
    const point = pendingFramePickPointRef.current ?? framePickPreviewPoint;
    if (!point) return;

    if (framePickFrameRef.current) {
      cancelAnimationFrame(framePickFrameRef.current);
      framePickFrameRef.current = 0;
    }

    if (focusPickZoomMarker) {
      updateZoomMarkerFocusGroup(focusPickZoomMarker.partId, focusPickZoomMarker.markerId, point);
    }
    if (positionPickTranslationMarker) {
      updateTranslationMarker(positionPickTranslationMarker.partId, positionPickTranslationMarker.markerId, (marker) => ({ ...marker, position: framePointToCameraTranslation(point) }));
    }
    pendingFramePickPointRef.current = null;
    requestAnimationFrame(() => setFramePickPreviewPoint(null));
  }

  function cancelFramePickPreview() {
    if (framePickFrameRef.current) {
      cancelAnimationFrame(framePickFrameRef.current);
      framePickFrameRef.current = 0;
    }
    pendingFramePickPointRef.current = null;
    setFramePickPreviewPoint(null);
  }

  function onFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (focusPickZoomMarker || positionPickTranslationMarker) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updateFramePickFromPointer(event);
      return;
    }

    const activeObjectDrag = objectDragRef.current;
    if (activeObjectDrag && canSelectFrameObjects) {
      const dx = (event.clientX - activeObjectDrag.origin.x) / (framePreviewScale * zoomScale);
      const dy = (event.clientY - activeObjectDrag.origin.y) / (framePreviewScale * zoomScale);
      scheduleObjectDragPreview({ x: dx, y: dy });
      return;
    }

    const currentDragStart = dragStartRef.current ?? dragStart;
    if (!currentDragStart || !canSelectFrameObjects) return;
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    scheduleDragBox(normalizeBounds(currentDragStart, point));
  }

  function onFramePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (focusPickZoomMarker || positionPickTranslationMarker) {
      commitFramePick();
      return;
    }

    if (objectDragRef.current) {
      commitObjectDrag();
      return;
    }

    const finalDragBox = pendingDragBoxRef.current ?? dragBox;
    if (!finalDragBox || !canSelectFrameObjects) return;
    const payload = createSelectionPayload(finalDragBox, part.objects);
    if (payload.objects.length === 0) {
      clearNodeSelection();
    } else {
      setSelectionPayload(payload);
      setSelectedObjectId(payload.objects[0]?.id ?? null);
    }
    clearMarkerSelection();
    clearDragBox();
  }

  function onFramePointerCancel(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cancelFramePickPreview();
    clearObjectDrag();
    clearDragBox();
  }

  function startObjectDrag(event: PointerEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "interactive" || !canSelectFrameObjects) return;
    if (focusPickZoomMarker || positionPickTranslationMarker) return;
    setEditingTextObjectId(null);
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const selectedObjectIds = new Set(selectionPayload?.objects.map((item) => item.id) ?? []);
    const nextSelectionObjects = selectedObjectIds.has(object.id)
      ? part.objects.filter((item) => selectedObjectIds.has(item.id)).map(selectionObjectFromFrameObject)
      : [selectionObjectFromFrameObject(object)];
    const selectionBox = getBoundsUnion(nextSelectionObjects.map((item) => item.bounds));

    setSelectedObjectId(object.id);
    clearMarkerSelection();
    setSelectionPayload({ selectionBox, coordinates: boundsToPoints(selectionBox), objects: nextSelectionObjects });
    const nextDrag = { origin: { x: event.clientX, y: event.clientY }, partId: part.id, objects: nextSelectionObjects };
    objectDragRef.current = nextDrag;
    objectDragDeltaRef.current = { x: 0, y: 0 };
    for (const item of nextSelectionObjects) setObjectDragTransform(item.id, { x: 0, y: 0 });
  }

  function startTextObjectEdit(event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "interactive" || object.type !== "text" || !canSelectFrameObjects) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedObjectId(object.id);
    clearMarkerSelection();
    setSelectionPayload({ selectionBox: object.bounds, coordinates: boundsToPoints(object.bounds), objects: [selectionObjectFromFrameObject(object)] });
    setRightPanelTab("video");
    setEditingTextObjectId(object.id);
  }

  function renameAsset(assetId: string, name: string) {
    updateProject((current) => ({ ...current, assets: updateAssetTree(current.assets ?? defaultAssets, assetId, (item) => ({ ...item, name: name.trim() || item.name })) }));
  }

  function createAssetFolder(parentFolderId?: string) {
    const folder = { id: `ast_folder_${Date.now().toString(36)}`, name: "New folder", kind: "folder" as const, children: [] };
    updateProject((current) => {
      const currentAssets = current.assets ?? defaultAssets;
      return { ...current, assets: parentFolderId ? appendAssetsToFolder(currentAssets, parentFolderId, [folder]) : [...currentAssets, folder] };
    });
  }

  function importDroppedAssets(files: FileList, targetFolderId?: string) {
    const nextFiles = Array.from(files).map((file) => ({ id: `ast_${Date.now().toString(36)}_${file.name}`, name: file.name, kind: "file" as const, path: (file as File & { path?: string }).path || file.name }));
    if (nextFiles.length === 0) return;
    updateProject((current) => {
      const currentAssets = current.assets ?? defaultAssets;
      return { ...current, assets: targetFolderId ? appendAssetsToFolder(currentAssets, targetFolderId, nextFiles) : [...currentAssets, ...nextFiles] };
    });
  }

  async function copyAssetPath(assetId: string) {
    const assetPath = getAssetPath(assets, assetId, project.assetsPath);
    if (!assetPath) return;

    try {
      await navigator.clipboard.writeText(assetPath);
      toast.success("Asset path copied");
    } catch {
      toast.error("Unable to copy asset path");
    }
  }

  function duplicateAsset(assetId: string) {
    updateProject((current) => ({ ...current, assets: duplicateAssetTree(current.assets ?? defaultAssets, assetId) }));
  }

  function deleteAsset(assetId: string) {
    updateProject((current) => ({ ...current, assets: removeAsset(current.assets ?? defaultAssets, assetId).items }));
  }

  function moveAsset(sourceId: string, intent: AssetDropIntent) {
    if (sourceId === intent.targetId) return;
    updateProject((current) => ({ ...current, assets: moveAssetTree(current.assets ?? defaultAssets, sourceId, intent) }));
  }

  function sortAssets(parentFolderId: string | null, mode: AssetSortMode) {
    updateProject((current) => ({ ...current, assets: sortAssetsInParent(current.assets ?? defaultAssets, parentFolderId, mode) }));
  }

  function openProjectTitleMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setAppContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [{ label: "Rename project", action: startProjectRename }],
    });
  }

  function startProjectRename() {
    projectRenameCancelledRef.current = false;
    setProjectNameDraft(projectRef.current.name);
    setRenamingProject(true);
  }

  function commitProjectRename() {
    if (projectRenameCancelledRef.current) {
      projectRenameCancelledRef.current = false;
      return;
    }
    const nextName = projectNameDraft.trim();
    setRenamingProject(false);
    if (!nextName || nextName === projectRef.current.name) return;
    updateProject((current) => ({ ...current, name: nextName }));
  }

  function cancelProjectRename() {
    projectRenameCancelledRef.current = true;
    setProjectNameDraft(project.name);
    setRenamingProject(false);
  }

  function updateFramePreviewScale(nextScale: number) {
    setFramePreviewScale(roundTwo(clamp(nextScale, 0.25, 1)));
  }

  function toggleFrameZoomBar() {
    setFrameZoomBarOpen((current) => {
      if (current) {
        setFramePreviewScale(defaultFramePreviewScale);
        centerPreviewScrollRef.current?.scrollTo({ left: 0, top: 0 });
      }
      return !current;
    });
  }

  return (
    <TooltipProvider delayDuration={650} skipDelayDuration={250}>
    <main className="grid h-screen grid-rows-[48px_minmax(0,1fr)_340px] bg-[#12141a] text-[#f7f7f8]">
      <header className={`${appDragRegion} grid grid-cols-[220px_1fr_360px] items-center gap-[18px] border-b border-[#2d313b] bg-[rgba(22,24,31,0.98)] px-[22px]`}>
        <div />
        <div className={`${appNoDragRegion} flex min-w-0 items-baseline justify-center gap-2 justify-self-center text-center leading-none`} onContextMenu={openProjectTitleMenu} title="Right-click to rename project">
          {renamingProject ? <Input autoFocus className="h-7 w-[240px] border-[var(--clipper-accent)] bg-[#171920] px-2 py-0 text-center text-[14px] font-bold" value={projectNameDraft} onBlur={commitProjectRename} onChange={(event) => setProjectNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commitProjectRename(); if (event.key === "Escape") cancelProjectRename(); }} /> : <strong className="truncate text-[14px] font-bold">{project.name}</strong>}
          {!renamingProject ? <span className="text-xs text-[#565b66]">/</span> : null}
          {!renamingProject ? <span className="truncate text-xs text-[#9b9da7]">{scene.name} / {part.name}</span> : null}
        </div>
        <div className={`${appNoDragRegion} flex justify-end gap-1.5`}>
          <button className={appBarButtonBase}>Presets</button>
          <button className={appBarButtonBase}>Preview</button>
          <button className={appBarButtonBase} onClick={() => setExportDialogOpen(true)}>Export</button>
          <button className={appBarSaveButtonClass(hasUnsavedChanges)} disabled={!hasUnsavedChanges} title="Save every project, timeline, inspector, and active code change (Ctrl+S or Cmd+S)" onClick={() => void saveAllChanges()}>Save</button>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[286px_minmax(640px,1fr)_350px] border-b border-[#2d313b]">
        <aside className="min-h-0 overflow-hidden border-r border-[#2d313b] bg-[#171920] p-4">
          <div className="mb-4 grid grid-cols-2 gap-1">
            <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "assets" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => setLeftPanelTab("assets")}><Folder size={14} />Assets</button>
            <button className={`${segmentedTabBase} flex items-center justify-center gap-1.5 ${leftPanelTab === "tools" ? segmentedTabActive : segmentedTabInactive}`} onClick={() => setLeftPanelTab("tools")}><Sparkles size={14} />Effects</button>
          </div>
          {leftPanelTab === "assets" ? (
            <AssetManager assets={assets} assetsPath={project.assetsPath} onCopyAsset={copyAssetPath} onCreateFolder={createAssetFolder} onDeleteAsset={deleteAsset} onDropFiles={importDroppedAssets} onDuplicateAsset={duplicateAsset} onMoveAsset={moveAsset} onRenameAsset={renameAsset} onSortAssets={sortAssets} />
          ) : (
            <ToolsPanel timelineMode={timelineMode} canSnapMiddle={Boolean(zoomMiddleSnap)} onAddTranslationMarker={addTranslationMarker} onAddZoomMarker={addZoomMarker} onSnapMiddle={() => snapZoomMiddle()} />
          )}
        </aside>

        <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgb(var(--clipper-accent-rgb)/0.10),transparent_30%),#141821]">
          <div className="grid place-items-center border-b border-[#2d313b] px-[18px]">
            <div className="flex rounded-full border border-[#2d313b] bg-[#15171e] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" aria-label="Editor mode">
              <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "interactive" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)] shadow-[0_6px_20px_rgb(var(--clipper-accent-rgb)/0.22)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => setMode("interactive")}>Interactive</button>
              <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition-all duration-200 ${mode === "code" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)] shadow-[0_6px_20px_rgb(var(--clipper-accent-rgb)/0.22)]" : "bg-transparent text-[#9b9da7] hover:text-white"}`} onClick={() => setMode("code")}>Code</button>
            </div>
          </div>

          <div ref={centerPreviewScrollRef} className={`timeline-scrollbar grid min-h-0 ${mode === "interactive" ? "place-items-center overflow-auto p-[22px] [scrollbar-gutter:stable]" : "items-stretch overflow-hidden"}`}>
            {mode === "interactive" ? (
              <FramePreview
                cameraRef={cameraRef}
                dragBox={dragBox}
                framePickPoint={framePickPoint}
                focusPicking={isPickingZoomFocus || isPickingTranslationPosition}
                canSelectObjects={canSelectFrameObjects}
                frameViewportRef={frameViewportRef}
                frameScale={framePreviewScale}
                part={part}
                previewTime={previewTime}
                selectionBox={selectionPayload?.selectionBox ?? null}
                editingTextObjectId={editingTextObjectId}
                onFramePointerCancel={onFramePointerCancel}
                onFramePointerDown={onFramePointerDown}
                onFramePointerDownCapture={onFramePointerDownCapture}
                onFramePointerMove={onFramePointerMove}
                onFramePointerUp={onFramePointerUp}
                onObjectPointerDown={startObjectDrag}
                onTextEditCommit={updateTextObjectContent}
                onTextObjectDoubleClick={startTextObjectEdit}
              />
            ) : (
              <CodePane part={part} source={partSources[part.filePath]} onSaveAll={saveAllChanges} onSourceChange={(source) => updatePartFromSource(part, source, { history: false, syncSource: false })} onSourceLoad={(source) => recordLoadedPartSource(part.filePath, source)} />
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-[#2d313b] bg-[#171920] px-7">
            <span className="justify-self-start text-[#9b9da7] tabular-nums">{formatTime(currentSceneTime)}</span>
            <div className="flex items-center justify-center gap-3">
              <QuickAccessTooltip name="Jump to start" description="Move the scrubber to the first frame of the scene." shortcut="Home"><button aria-label="Jump to start" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToStart}><SkipBack size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Back one second" description="Move the scrubber back by one second." shortcut="Left Arrow"><button aria-label="Back one second" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={() => stepSceneTime(-1)}><StepBack size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name={isPlaying ? "Pause" : "Play"} description={isPlaying ? "Pause timeline playback." : "Start timeline playback from the scrubber."} shortcut="Space"><button aria-label={isPlaying ? "Pause" : "Play"} className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[#1d212b] text-[#e9e9ec] hover:bg-[#252a36]" onClick={() => setIsPlaying((current) => !current)}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button></QuickAccessTooltip>
              <QuickAccessTooltip name="Next composition" description="Jump the scrubber to the start of the next composition." shortcut="Right Arrow"><button aria-label="Next composition" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToNextPart}><StepForward size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Jump to end" description="Move the scrubber to the end of the scene." shortcut="End"><button aria-label="Jump to end" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToEnd}><SkipForward size={17} /></button></QuickAccessTooltip>
            </div>
            <div className="flex items-center justify-end gap-3">
              <QuickAccessTooltip name="Cut" description="Pause playback and prepare the current point for a cut action." shortcut="C"><button aria-label="Cut" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={() => setIsPlaying(false)}><Scissors size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Magnetic scrub" description="Snap scrubbing to composition, zoom, and pan edges. Hold Shift for a temporary snap." shortcut="M"><button aria-label="Magnetic scrub" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${scrubSnapEnabled ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={scrubSnapEnabled} onClick={() => setScrubSnapEnabled((current) => !current)}><Magnet size={16} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Snap selector" description="Select the timeline item currently under the scrubber as you move." shortcut="S"><button aria-label="Snap selector" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${fastSelectEnabled ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={fastSelectEnabled} onClick={() => setFastSelectEnabled((current) => !current)}><Signpost size={16} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Replay" description="Return the scrubber to the beginning of the scene." shortcut="R"><button aria-label="Replay from start" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToStart}><RotateCcw size={16} /></button></QuickAccessTooltip>
              <div className="relative">
                {frameZoomBarOpen ? <FrameZoomBar scale={framePreviewScale} onScaleChange={updateFramePreviewScale} /> : null}
                <QuickAccessTooltip name="Preview zoom" description="Show or hide the frame preview zoom controls." shortcut=""><button aria-label="Toggle preview zoom controls" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${frameZoomBarOpen ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={frameZoomBarOpen} onClick={toggleFrameZoomBar}><Search size={16} /></button></QuickAccessTooltip>
              </div>
            </div>
          </div>
        </section>

        <aside className="min-h-0 overflow-auto border-l border-[#2d313b] bg-[#171920] p-4" data-inspector-panel>
          <section className="mb-3 grid gap-2.5">
            <h2 className={sectionTitle}>Inspector</h2>
             <div className="grid grid-cols-3 gap-1">{(["video", "motion", "agent"] as const).map((tab) => <button className={`${segmentedTabBase} capitalize ${rightPanelTab === tab ? segmentedTabActive : segmentedTabInactive}`} key={tab} onClick={() => setRightPanelTab(tab)}>{tab}</button>)}</div>
          </section>
          <section className="mb-5 grid gap-2.5">
            {rightPanelTab === "agent" ? <AgentPanel part={part} sourceStatus={sourceStatus} agentContext={agentContext} /> : selectedZoom && selectedZoomPart ? <ZoomInspector marker={selectedZoom} part={selectedZoomPart} selectedMarkerCount={selectedZoomSnapMarkers.length} selectedSnapInActive={selectedZoomSnapInActive} selectedSnapOutActive={selectedZoomSnapOutActive} middleSnapActive={selectedZoomPartMiddleSnapActive} middleTransitionMode={selectedZoomPartMiddleTransitionMode} pickingFocus={focusPickZoomMarker?.partId === selectedZoomPart.id && focusPickZoomMarker.markerId === selectedZoom.id} canSnapMiddle={Boolean(inspectorZoomMiddleSnap)} onChange={(updater) => updateZoomMarker(selectedZoomPart.id, selectedZoom.id, updater)} onChangeFocus={(focus) => updateZoomMarkerFocusGroup(selectedZoomPart.id, selectedZoom.id, focus)} onChangeSelectedSnap={updateSelectedZoomSnap} onChangeMiddleTransition={(mode) => updateZoomMiddleTransition(selectedZoomPart, mode)} onChangeMiddleEase={(ease) => updateZoomMiddleEase(selectedZoomPart, ease)} onDelete={() => deleteZoomMarker(selectedZoomPart.id, selectedZoom.id)} onPickFocus={() => startZoomFocusPick(selectedZoomPart.id, selectedZoom.id)} onSnapMiddle={() => snapZoomMiddle(selectedZoomPart)} /> : selectedTranslation && selectedTranslationPart ? <TranslationInspector marker={selectedTranslation} part={selectedTranslationPart} selectedMarkerCount={selectedTranslationSnapMarkers.length} selectedSnapInActive={selectedTranslationSnapInActive} selectedSnapOutActive={selectedTranslationSnapOutActive} middleSnapActive={selectedTranslationPartMiddleSnapActive} middleTransitionMode={selectedTranslationPartMiddleTransitionMode} pickingPosition={positionPickTranslationMarker?.partId === selectedTranslationPart.id && positionPickTranslationMarker.markerId === selectedTranslation.id} canSnapMiddle={Boolean(inspectorTranslationMiddleSnap)} onChange={(updater) => updateTranslationMarker(selectedTranslationPart.id, selectedTranslation.id, updater)} onChangeSelectedSnap={updateSelectedTranslationSnap} onChangeMiddleTransition={(mode) => updateTranslationMiddleTransition(selectedTranslationPart, mode)} onChangeMiddleEase={(ease) => updateTranslationMiddleEase(selectedTranslationPart, ease)} onDelete={() => deleteTranslationMarker(selectedTranslationPart.id, selectedTranslation.id)} onPickPosition={() => startTranslationPositionPick(selectedTranslationPart.id, selectedTranslation.id)} onSnapMiddle={() => snapTranslationMiddle(selectedTranslationPart)} /> : selectedObject ? <ObjectInspector object={selectedObject} onChange={updateSelectedObject} /> : selectedPart ? <FrameInspector part={selectedPart} onFrameChange={updatePartFrame} onBackgroundChange={updatePartBackground} /> : <EmptyInspector />}
          </section>
          {validationErrors.length > 0 ? <section className="mb-5 grid gap-2.5 text-[#ffbf66]"><h2 className={sectionTitle}>Validation</h2>{validationErrors.map((error) => <p key={error}>{error}</p>)}</section> : null}
        </aside>
      </section>

      <TimelinePanel
        currentSceneTime={currentSceneTime}
        fastSelectEnabled={fastSelectEnabled}
        scrubSnapEnabled={scrubSnapEnabled}
        sceneDuration={sceneDurationSeconds}
        selectedPartId={selectedPartId}
        selectedZoomMarkerPartId={selectedZoomMarker?.partId ?? null}
        selectedZoomMarkerId={selectedZoomMarker?.markerId ?? null}
        selectedZoomMarkers={selectedZoomMarkers}
        selectedTranslationMarkerPartId={selectedTranslationMarker?.partId ?? null}
        selectedTranslationMarkerId={selectedTranslationMarker?.markerId ?? null}
        selectedTranslationMarkers={selectedTranslationMarkers}
        mode={timelineMode}
        timelineViewportState={project.editorState?.timeline ?? defaultTimelineViewportState}
        timeline={timeline}
        onModeChange={updateTimelineMode}
        onTimelineViewportStateChange={updateTimelineViewportState}
        onSelectPart={selectPart}
        onSelectZoomMarker={selectZoomMarker}
        onSelectZoomMarkers={selectZoomMarkers}
        onSelectTranslationMarker={selectTranslationMarker}
        onSelectTranslationMarkers={selectTranslationMarkers}
        onReorderPart={reorderPart}
        onMoveZoomMarker={moveZoomMarker}
        onMoveZoomMarkers={moveZoomMarkers}
        onMoveTranslationMarker={moveTranslationMarker}
        onMoveTranslationMarkers={moveTranslationMarkers}
        onScrub={scrubToSceneTime}
        onUpdateZoomMarkers={updateZoomMarkers}
        onUpdateTranslationMarkers={updateTranslationMarkers}
      />
    </main>
    <ExportMediaDialog
      activeTab={exportDialogTab}
      durationSeconds={sceneDurationSeconds}
      currentTime={currentSceneTime}
      includeSources={exportIncludeSources}
      open={exportDialogOpen}
      partCount={scene.parts.length}
      progress={exportProgress}
      projectFormat={projectExportFormat}
      projectName={project.name}
      resolution={project.resolution}
      sceneName={scene.name}
      validationErrorCount={validationErrors.length}
      exporting={isExporting}
      onProjectExport={() => void exportProject()}
      onMediaExport={() => void exportRenderedMedia()}
      onProjectFormatChange={setProjectExportFormat}
      onIncludeSourcesChange={setExportIncludeSources}
      onOpenChange={setExportDialogOpen}
      onTabChange={setExportDialogTab}
    />
    {videoExportProgress ? <VideoExportOverlay cancelling={videoExportCancelling} progress={videoExportProgress} onCancel={() => void stopVideoExport()} /> : null}
    <AppContextMenu menu={appContextMenu} onClose={() => setAppContextMenu(null)} />
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 2800,
        style: {
          background: "#11141a",
          border: "1px solid #2d313b",
          borderRadius: "14px",
          boxShadow: "0 18px 60px rgba(0,0,0,0.42)",
          color: "#f7f7f8",
          fontSize: "13px",
          fontWeight: 700,
        },
        error: {
          iconTheme: { primary: "#ff6b6b", secondary: "#1a0f10" },
          style: { border: "1px solid #5c2a2d", color: "#ffb4b4" },
        },
      }}
    />
    </TooltipProvider>
  );
}

function FrameZoomBar({ scale, onScaleChange }: { scale: number; onScaleChange: (scale: number) => void }) {
  const percent = Math.round(scale * 100);
  const zoomButtonClass = "grid h-9 w-10 place-items-center rounded-[11px] border border-[#2d313b] bg-[#171920] text-[#f7f7f8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#3b4150] hover:bg-[#20232c]";

  return (
    <div className="absolute bottom-[44px] right-0 z-30 flex w-[266px] items-center gap-3 rounded-[15px] border border-[#2d313b] bg-[#12141a] p-2.5 shadow-[0_18px_58px_rgba(0,0,0,0.45)]">
      <strong className="w-[42px] text-[14px] tabular-nums text-[#f7f7f8]">{percent}%</strong>
      <input aria-label="Frame preview zoom" className="h-1.5 min-w-0 flex-1 accent-[#9b9da7] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#5a606e] [&::-webkit-slider-thumb]:bg-[#a2a7b3] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#5a606e] [&::-moz-range-thumb]:bg-[#a2a7b3]" type="range" min={0.25} max={1} step={0.05} value={scale} onChange={(event) => onScaleChange(Number(event.target.value))} />
      <button aria-label="Zoom preview out" className={zoomButtonClass} onClick={() => onScaleChange(scale - 0.05)}><Minus size={20} /></button>
      <button aria-label="Zoom preview in" className={zoomButtonClass} onClick={() => onScaleChange(scale + 0.05)}><Plus size={20} /></button>
    </div>
  );
}

function ExportMediaDialog({ activeTab, durationSeconds, exporting, includeSources, open, partCount, progress, projectFormat, projectName, resolution, sceneName, validationErrorCount, onIncludeSourcesChange, onMediaExport, onOpenChange, onProjectExport, onProjectFormatChange, onTabChange }: { activeTab: ExportDialogTab; currentTime: number; durationSeconds: number; exporting: boolean; includeSources: boolean; open: boolean; partCount: number; progress: string | null; projectFormat: ProjectExportFormat; projectName: string; resolution: ProjectManifest["resolution"]; sceneName: string; validationErrorCount: number; onIncludeSourcesChange: (includeSources: boolean) => void; onMediaExport: () => void; onOpenChange: (open: boolean) => void; onProjectExport: () => void; onProjectFormatChange: (format: ProjectExportFormat) => void; onTabChange: (tab: ExportDialogTab) => void }) {
  const tabButtonClass = (tab: ExportDialogTab) => `rounded-[8px] px-3 py-1.5 text-xs font-extrabold transition ${activeTab === tab ? "bg-[#202b37] text-white shadow-[inset_0_0_0_1px_#2d4052]" : "text-[#9b9da7] hover:bg-[#20232c] hover:text-white"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Render an MP4 video or export editable project data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-1 rounded-[10px] border border-[#2d313b] bg-[#15171e] p-1">
            <button className={tabButtonClass("media")} onClick={() => onTabChange("media")}>Render video</button>
            <button className={tabButtonClass("project")} onClick={() => onTabChange("project")}>Export project</button>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2d313b] bg-[#171920] p-3">
            <ExportStat label="Project" value={projectName} />
            <ExportStat label="Scene" value={sceneName} />
            <ExportStat label="Duration" value={formatTime(durationSeconds)} />
            <ExportStat label="Resolution" value={`${resolution.width} x ${resolution.height}`} />
            <ExportStat label={activeTab === "media" ? "Frame rate" : "Parts"} value={activeTab === "media" ? `${videoExportFrameRate} fps` : `${partCount}`} />
            <ExportStat label="Validation" value={validationErrorCount === 0 ? "Ready" : `${validationErrorCount} issue${validationErrorCount === 1 ? "" : "s"}`} warning={validationErrorCount > 0} />
          </div>

          {activeTab === "media" ? (
            <div className="grid gap-3 rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-sm text-[#dfe2ea]">
              <strong className="text-white">Rendered MP4 video</strong>
              <span className="text-xs leading-5 text-[#9b9da7]">Renders the full scene at 1920 x 1080 using the project timeline, motion, zoom, and pan markers. Export uses bundled ffmpeg so the MP4 works out of the box.</span>
              {progress ? <span className="rounded-lg bg-[#10131a] px-3 py-2 text-xs font-bold text-[var(--clipper-accent-strong)]">{progress}</span> : null}
            </div>
          ) : (
            <>
              <label className="grid gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="export-format">
                Format
                <Select value={projectFormat} onValueChange={(value) => onProjectFormatChange(value as ProjectExportFormat)}>
                  <SelectTrigger id="export-format" className="h-9">
                    <SelectValue placeholder="Choose export format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="project-package">Clipper project package (.project.json)</SelectItem>
                      <SelectItem value="scene-json">Scene JSON only (.scene.json)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-sm text-[#dfe2ea]">
                <Checkbox checked={projectFormat === "project-package" && includeSources} disabled={projectFormat === "scene-json"} onCheckedChange={(checked) => onIncludeSourcesChange(checked === true)} />
                <span className="grid gap-1 leading-5">
                  <span className="font-bold text-white">Include TypeScript part sources</span>
                  <span className="text-xs text-[#9b9da7]">Embeds source text for each composition part so exports can be audited or regenerated later.</span>
                </span>
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <button className={`${appBarButtonBase} w-[96px] px-3 py-2 text-sm`} disabled={exporting} onClick={() => onOpenChange(false)}>Cancel</button>
          <button className="inline-flex w-[112px] items-center justify-center rounded-[9px] border border-[var(--clipper-accent)] bg-[var(--clipper-accent)] px-3 py-2 text-sm font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60" disabled={exporting} onClick={activeTab === "media" ? onMediaExport : onProjectExport}>
            {exporting ? "Working" : activeTab === "media" ? "Render" : "Export"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportStat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-[#12141a] p-2">
      <span className={mutedCaps}>{label}</span>
      <strong className={`mt-1 block truncate text-sm ${warning ? "text-[#ffbf66]" : "text-white"}`}>{value}</strong>
    </div>
  );
}

function VideoExportOverlay({ cancelling, progress, onCancel }: { cancelling: boolean; progress: VideoExportProgress; onCancel: () => void }) {
  const percent = clamp(progress.percent, 0, 100);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#050609]/95 backdrop-blur-[3px] animate-[clipper-export-fade-in_180ms_ease-out_both]">
      <div className="grid w-[min(300px,calc(100vw-48px))] justify-items-center gap-3 text-center">
        <div className="grid w-full gap-2.5">
          <h2 className="m-0 text-[17px] font-extrabold tracking-[-0.03em] text-white">Exporting video • {percent}%</h2>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#242936]">
            <div className="h-full rounded-full bg-white transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs font-semibold text-[#8e929d]">{cancelling ? "Stopping export..." : progress.status}</span>
        </div>
        <button className="mt-5 rounded-[8px] border border-[#20242d] bg-[#0c0e13] px-4 py-2 text-xs font-semibold text-white transition hover:border-[#343a47] hover:bg-[#11141b] disabled:cursor-not-allowed disabled:opacity-55" disabled={cancelling} onClick={onCancel}>
          {cancelling ? "Stopping" : "Stop export"}
        </button>
      </div>
    </div>
  );
}

const FramePreview = memo(function FramePreview({ cameraRef, dragBox, framePickPoint, focusPicking, canSelectObjects, frameViewportRef, frameScale, part, previewTime, selectionBox, editingTextObjectId, onFramePointerCancel, onFramePointerDown, onFramePointerDownCapture, onFramePointerMove, onFramePointerUp, onObjectPointerDown, onTextEditCommit, onTextObjectDoubleClick }: { cameraRef: RefObject<HTMLDivElement | null>; dragBox: Bounds | null; framePickPoint: Point | null; focusPicking: boolean; canSelectObjects: boolean; frameViewportRef: RefObject<HTMLDivElement | null>; frameScale: number; part: Part; previewTime: number; selectionBox: Bounds | null; editingTextObjectId: string | null; onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void }) {
  const frameStyle = useMemo(() => ({ ...part.frame.style, width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${frameScale})` }) as CSSProperties, [frameScale, part.frame.style]);
  const viewportStyle = useMemo(() => ({ width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale }) as CSSProperties, [frameScale]);

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between text-[#dfe2ea]"><span className={mutedCaps}>{part.name}</span><strong className="text-[13px]">{FRAME_WIDTH} x {FRAME_HEIGHT}</strong></div>
      <div ref={frameViewportRef} className={`relative overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${focusPicking ? "cursor-crosshair ring-2 ring-[#37d6c2]" : ""}`} style={viewportStyle} onPointerDownCapture={onFramePointerDownCapture} onPointerDown={onFramePointerDown} onPointerMove={onFramePointerMove} onPointerUp={onFramePointerUp} onPointerCancel={onFramePointerCancel}>
        <div className="absolute left-0 top-0 origin-top-left overflow-hidden" style={frameStyle}>
          <div className="absolute inset-0 origin-center" ref={cameraRef}>
            <BackgroundLayerView background={part.background} previewTime={previewTime} />
            {part.objects.map((object) => (
              <FrameObjectView key={object.id} object={object} canSelect={canSelectObjects} editing={editingTextObjectId === object.id} focusPicking={focusPicking} previewTime={previewTime} onDoubleClick={(event) => onTextObjectDoubleClick(event, object)} onPointerDown={(event) => onObjectPointerDown(event, object)} onTextEditCommit={(content, richText) => onTextEditCommit(object.id, content, richText)} />
            ))}
            {canSelectObjects && selectionBox ? <SelectionBox bounds={selectionBox} /> : null}
          </div>
        </div>
        {dragBox ? <DragSelectionBox bounds={dragBox} frameScale={frameScale} /> : null}
        {focusPicking && framePickPoint ? <FramePickPointOverlay point={framePickPoint} frameScale={frameScale} /> : null}
      </div>
    </div>
  );
});

function FramePickPointOverlay({ point, frameScale }: { point: Point; frameScale: number }) {
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: point.x * frameScale, top: point.y * frameScale }}>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#37d6c2] shadow-[0_2px_8px_rgba(0,0,0,0.38)]" />
    </div>
  );
}

const FrameObjectView = memo(function FrameObjectView({ object, canSelect, editing, focusPicking, previewTime, onDoubleClick, onPointerDown, onTextEditCommit }: { object: FrameObject; canSelect: boolean; editing: boolean; focusPicking: boolean; previewTime: number; onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onTextEditCommit: (content: string, richText?: RichTextSegment[]) => void }) {
  const animation = getObjectPreviewAnimation(object, previewTime);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : undefined;
  const style = {
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...animation.style,
    transform: `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: "transform",
  } as CSSProperties;
  const content = animation.content ?? object.content;
  const richText = animation.content ? undefined : object.richText;
  const textSegments = useMemo(() => getRenderableTextSegments(content ?? "", richText), [content, richText]);

  useEffect(() => {
    if (!editing || !editableRef.current) return;
    const editable = editableRef.current;
    editable.replaceChildren(...textSegmentsToEditableNodes(getRenderableTextSegments(object.content ?? "", object.richText), Boolean(object.richText)));
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;

    function commitBeforeAppPointerHandling(event: globalThis.PointerEvent) {
      const editable = editableRef.current;
      if (!editable || editable.contains(event.target as Node)) return;
      commitTextEdit();
    }

    window.addEventListener("pointerdown", commitBeforeAppPointerHandling, true);
    return () => window.removeEventListener("pointerdown", commitBeforeAppPointerHandling, true);
  }, [editing, object.style]);

  function commitTextEdit() {
    if (!editableRef.current) return;
    normalizeEditableFormatting(editableRef.current);
    const richText = richTextSegmentsFromElement(editableRef.current, object.style);
    onTextEditCommit(richText.map((segment) => segment.text).join(""), shouldPersistRichText(richText, object.style) ? richText : undefined);
  }

  function onTextEditKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        toggleEditableSelectionFormat(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
        return;
      }
      if (event.key === "Enter") editableRef.current?.blur();
    }
    if (event.key === "Escape") editableRef.current?.blur();
  }

  function toggleEditableSelectionFormat(format: "bold" | "italic" | "underline") {
    if (!editableRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editableRef.current.contains(range.commonAncestorContainer)) return;

    const current = getSelectionFormatState(selection, format);
    const span = document.createElement("span");
    if (format === "bold") span.style.fontWeight = current ? "400" : "700";
    if (format === "italic") span.style.fontStyle = current ? "normal" : "italic";
    if (format === "underline") span.style.textDecorationLine = current ? "none" : "underline";
    span.appendChild(range.extractContents());
    range.insertNode(span);

    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
  }

  return (
    <div className={`absolute flex touch-none select-none flex-col justify-center overflow-hidden whitespace-pre-line ${focusPicking ? "cursor-crosshair" : editing ? "cursor-text" : "cursor-default"} ${editing ? "select-text" : ""}`} data-object-id={canSelect ? object.id : undefined} style={style} onDoubleClick={onDoubleClick} onPointerDown={onPointerDown}>
      {object.type === "text" && editing ? <div ref={editableRef} className="min-h-0 w-full whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={commitTextEdit} onKeyDown={onTextEditKeyDown} onPointerDown={(event) => event.stopPropagation()} /> : null}
      {object.type === "text" && !editing ? <div className="min-h-0 w-full whitespace-pre-wrap">{renderRichTextSegments(textSegments, Boolean(richText))}</div> : null}
      {object.type !== "text" && content ? content : null}
    </div>
  );
}, areFrameObjectPropsEqual);

function areFrameObjectPropsEqual(previous: { object: FrameObject; canSelect: boolean; editing: boolean; focusPicking: boolean; previewTime: number }, next: { object: FrameObject; canSelect: boolean; editing: boolean; focusPicking: boolean; previewTime: number }) {
  return previous.object === next.object
    && previous.canSelect === next.canSelect
    && previous.editing === next.editing
    && previous.focusPicking === next.focusPicking
    && (!isPreviewTimeSensitiveObject(next.object) || previous.previewTime === next.previewTime);
}

function areBackgroundLayerPropsEqual(previous: { background: BackgroundLayer; previewTime: number }, next: { background: BackgroundLayer; previewTime: number }) {
  const timeSensitive = Boolean(next.background.motion) || next.background.elements.some(isPreviewTimeSensitiveObject);
  return previous.background === next.background && (!timeSensitive || previous.previewTime === next.previewTime);
}

function areBackgroundElementPropsEqual(previous: { element: FrameObject; previewTime: number }, next: { element: FrameObject; previewTime: number }) {
  return previous.element === next.element && (!isPreviewTimeSensitiveObject(next.element) || previous.previewTime === next.previewTime);
}

function isPreviewTimeSensitiveObject(object: FrameObject) {
  return Boolean(object.motion);
}

function SelectionBox({ bounds }: { bounds: Bounds }) {
  return <div data-frame-selection-box className="pointer-events-none absolute border border-[var(--clipper-accent)] bg-transparent opacity-100" style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", zIndex: 2147483647 }} />;
}

function DragSelectionBox({ bounds, frameScale }: { bounds: Bounds; frameScale: number }) {
  return <div className="pointer-events-none absolute border border-[var(--clipper-accent)] bg-[rgb(var(--clipper-accent-rgb)/0.10)] opacity-100" style={{ left: bounds.x * frameScale, top: bounds.y * frameScale, width: bounds.width * frameScale, height: bounds.height * frameScale }} />;
}

function getRenderableTextSegments(content: string, richText: RichTextSegment[] | undefined) {
  if (richText && richText.map((segment) => segment.text).join("") === content) return richText;
  return [{ text: content, bold: false, italic: false, underline: false }];
}

function renderRichTextSegments(segments: RichTextSegment[], explicitFormatting: boolean) {
  const nodes: ReactElement[] = [];
  segments.forEach((segment, segmentIndex) => {
    const parts = segment.text.split("\n");
    parts.forEach((part, partIndex) => {
      if (part) nodes.push(<span key={`${segmentIndex}-${partIndex}-${part}`} style={inlineTextSegmentStyle(segment, explicitFormatting)}>{part}</span>);
      if (partIndex < parts.length - 1) nodes.push(<br key={`${segmentIndex}-${partIndex}-br`} />);
    });
  });
  return nodes;
}

function textSegmentsToEditableNodes(segments: RichTextSegment[], explicitFormatting: boolean) {
  const nodes: Node[] = [];
  segments.forEach((segment) => {
    const parts = segment.text.split("\n");
    parts.forEach((part, partIndex) => {
      if (part) {
        const span = document.createElement("span");
        const style = inlineTextSegmentStyle(segment, explicitFormatting);
        if (style.fontWeight) span.style.fontWeight = String(style.fontWeight);
        if (style.fontStyle) span.style.fontStyle = String(style.fontStyle);
        if (style.textDecorationLine) span.style.textDecorationLine = String(style.textDecorationLine);
        span.textContent = part;
        nodes.push(span);
      }
      if (partIndex < parts.length - 1) nodes.push(document.createElement("br"));
    });
  });
  return nodes.length > 0 ? nodes : [document.createTextNode("")];
}

function normalizeEditableFormatting(element: HTMLElement) {
  element.querySelectorAll("span, b, strong, i, em, u").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const style = window.getComputedStyle(node);
    node.dataset.clipperBold = Number(style.fontWeight) >= 700 ? "true" : "false";
    node.dataset.clipperItalic = style.fontStyle === "italic" ? "true" : "false";
    node.dataset.clipperUnderline = style.textDecorationLine.includes("underline") ? "true" : "false";
  });
}

function getSelectionFormatState(selection: Selection, format: "bold" | "italic" | "underline") {
  const node = selection.anchorNode;
  const element = node instanceof HTMLElement ? node : node?.parentElement;
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (format === "bold") return Number(style.fontWeight) >= 700;
  if (format === "italic") return style.fontStyle === "italic";
  return style.textDecorationLine.includes("underline");
}

function richTextSegmentsFromElement(element: HTMLElement, baseStyle: Record<string, string | number>) {
  const segments: RichTextSegment[] = [];
  const baseFormat = getBaseRichTextFormat(baseStyle);

  function visit(node: Node, format: Omit<RichTextSegment, "text">) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) segments.push({ text: node.textContent, ...format });
      return;
    }
    if (node.nodeName === "BR") {
      segments.push({ text: "\n", ...format });
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    if ((node.nodeName === "DIV" || node.nodeName === "P") && segments.length > 0) segments.push({ text: "\n", ...format });

    const explicitBold = node.dataset.clipperBold;
    const explicitItalic = node.dataset.clipperItalic;
    const explicitUnderline = node.dataset.clipperUnderline;
    const nextFormat = {
      bold: explicitBold ? explicitBold === "true" : node.nodeName === "B" || node.nodeName === "STRONG" ? true : format.bold,
      italic: explicitItalic ? explicitItalic === "true" : node.nodeName === "I" || node.nodeName === "EM" ? true : format.italic,
      underline: explicitUnderline ? explicitUnderline === "true" : node.nodeName === "U" ? true : format.underline,
    };
    node.childNodes.forEach((child) => visit(child, nextFormat));
  }

  element.childNodes.forEach((node) => visit(node, baseFormat));
  return mergeAdjacentRichTextSegments(segments);
}

function getBaseRichTextFormat(baseStyle: Record<string, string | number>) {
  return {
    bold: Number(baseStyle.fontWeight ?? 400) >= 700,
    italic: String(baseStyle.fontStyle ?? "normal") === "italic",
    underline: String(baseStyle.textDecoration ?? "none").split(" ").includes("underline"),
  };
}

function mergeAdjacentRichTextSegments(segments: RichTextSegment[]) {
  return segments.reduce<RichTextSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (previous && previous.bold === segment.bold && previous.italic === segment.italic && previous.underline === segment.underline) {
      previous.text += segment.text;
      return merged;
    }
    merged.push({ ...segment });
    return merged;
  }, []);
}

function shouldPersistRichText(segments: RichTextSegment[], baseStyle: Record<string, string | number>) {
  const baseFormat = getBaseRichTextFormat(baseStyle);
  return segments.some((segment) => segment.bold !== baseFormat.bold || segment.italic !== baseFormat.italic || segment.underline !== baseFormat.underline);
}

function inlineTextSegmentStyle(segment: RichTextSegment, explicitFormatting: boolean): CSSProperties {
  return {
    fontWeight: segment.bold ? 700 : explicitFormatting ? 400 : undefined,
    fontStyle: segment.italic ? "italic" : explicitFormatting ? "normal" : undefined,
    textDecorationLine: segment.underline ? "underline" : explicitFormatting ? "none" : undefined,
  };
}

function QuickAccessTooltip({ name, description, shortcut, children }: { name: string; description: string; shortcut: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align="center">
        <span className="flex items-center justify-between gap-3">
          <strong className="block text-[11px] font-bold text-[#f7f7f8]">{name}</strong>
          {shortcut ? <kbd className="rounded-[5px] border border-[#3b4150] bg-[#171920] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#dfe2ea]">{shortcut}</kbd> : null}
        </span>
        <span className="mt-1 block text-[10px] text-[#9b9da7]">{description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function AssetManager({ assets, assetsPath, onCopyAsset, onCreateFolder, onDeleteAsset, onDropFiles, onDuplicateAsset, onMoveAsset, onRenameAsset, onSortAssets }: { assets: AssetItem[]; assetsPath: string; onCopyAsset: (assetId: string) => void; onCreateFolder: (parentFolderId?: string) => void; onDeleteAsset: (assetId: string) => void; onDropFiles: (files: FileList, targetFolderId?: string) => void; onDuplicateAsset: (assetId: string) => void; onMoveAsset: (sourceId: string, intent: AssetDropIntent) => void; onRenameAsset: (assetId: string, name: string) => void; onSortAssets: (parentFolderId: string | null, mode: AssetSortMode) => void }) {
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<AssetDropIntent | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
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
        { label: "New folder", action: () => onCreateFolder(parentFolderId ?? undefined) },
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
        { label: "New folder", action: () => onCreateFolder() },
        { label: "Sort by", children: getAssetSortMenuItems(null, onSortAssets) },
      ],
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
      <small className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap px-1 text-[11px] font-semibold text-[#8c929f]" title={assetsPath}>{assetsPath}</small>
      <div className="max-h-[420px] min-h-[190px] min-w-0 overflow-auto rounded-[10px] border border-dashed border-[#2d313b] bg-[#151821] p-1.5" onClick={(event) => { if (event.currentTarget === event.target) setSelectedAssetId(null); }} onContextMenu={openEmptyMenu} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropIntent(null); }}>
        <AssetTree items={assets} depth={0} draggedAssetId={draggedAssetId} dropIntent={dropIntent} parentFolderId={null} renameDraft={renameDraft} renamingAssetId={renamingAssetId} selectedAssetId={selectedAssetId} onCommitRename={commitRename} onDragAsset={setDraggedAssetId} onDropFiles={onDropFiles} onDropIntentChange={setDropIntent} onMoveAsset={onMoveAsset} onOpenMenu={openAssetMenu} onRenameDraftChange={setRenameDraft} onSelectAsset={setSelectedAssetId} />
      </div>
      <AppContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </section>
  );
}

function AssetTree({ items, depth, draggedAssetId, dropIntent, parentFolderId, renameDraft, renamingAssetId, selectedAssetId, onCommitRename, onDragAsset, onDropFiles, onDropIntentChange, onMoveAsset, onOpenMenu, onRenameDraftChange, onSelectAsset }: { items: AssetItem[]; depth: number; draggedAssetId: string | null; dropIntent: AssetDropIntent | null; parentFolderId: string | null; renameDraft: string; renamingAssetId: string | null; selectedAssetId: string | null; onCommitRename: () => void; onDragAsset: (assetId: string | null) => void; onDropFiles: (files: FileList, targetFolderId?: string) => void; onDropIntentChange: (intent: AssetDropIntent | null) => void; onMoveAsset: (sourceId: string, intent: AssetDropIntent) => void; onOpenMenu: (event: ReactMouseEvent<HTMLDivElement>, item: AssetItem) => void; onRenameDraftChange: (value: string) => void; onSelectAsset: (assetId: string) => void }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      {items.map((item) => (
        <div className="min-w-0" key={item.id}>
          <div
            className={`relative grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-1.5 rounded-[6px] border py-0.5 pl-1.5 pr-1 transition ${draggedAssetId === item.id ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent-muted-surface)]" : dropIntent?.targetId === item.id && dropIntent.action === "inside" ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : selectedAssetId === item.id ? "border-[var(--clipper-accent)] bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "border-transparent bg-transparent hover:bg-[#20232c]"}`}
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
            {item.kind === "folder" ? <Folder size={15} className="text-current" /> : <FileIcon size={14} className="text-current" />}
            {renamingAssetId === item.id ? <Input autoFocus className="h-6 min-w-0 border-[var(--clipper-accent)] bg-[#171920] px-1 py-0 text-xs font-bold" value={renameDraft} onBlur={onCommitRename} onChange={(event) => onRenameDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onCommitRename(); }} /> : <span className="min-w-0 select-none overflow-hidden text-ellipsis whitespace-nowrap px-1 text-xs font-bold">{item.name}</span>}
            {dropIntent?.targetId === item.id && dropIntent.action === "inside" ? <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded bg-[var(--clipper-accent-badge)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--clipper-accent-strong)]">Drop into folder</span> : null}
            {dropIntent?.targetId === item.id && dropIntent.action === "before" ? <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-[var(--clipper-accent)] shadow-[0_0_0_2px_rgb(var(--clipper-accent-rgb)/0.18)]" /> : null}
            {dropIntent?.targetId === item.id && dropIntent.action === "after" ? <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[var(--clipper-accent)] shadow-[0_0_0_2px_rgb(var(--clipper-accent-rgb)/0.18)]" /> : null}
          </div>
          {item.children?.length ? <AssetTree items={item.children} depth={depth + 1} draggedAssetId={draggedAssetId} dropIntent={dropIntent} parentFolderId={item.id} renameDraft={renameDraft} renamingAssetId={renamingAssetId} selectedAssetId={selectedAssetId} onCommitRename={onCommitRename} onDragAsset={onDragAsset} onDropFiles={onDropFiles} onDropIntentChange={onDropIntentChange} onMoveAsset={onMoveAsset} onOpenMenu={onOpenMenu} onRenameDraftChange={onRenameDraftChange} onSelectAsset={onSelectAsset} /> : null}
        </div>
      ))}
    </div>
  );
}

function AppContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  useEffect(() => {
    if (!menu) return;
    function close() {
      onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return <ContextMenuPanel items={menu.items} position={{ x: menu.x, y: menu.y }} onClose={onClose} />;
}

function ContextMenuPanel({ items, position, anchorRect, onClose }: { items: ContextMenuItem[]; position?: { x: number; y: number }; anchorRect?: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [resolvedPosition, setResolvedPosition] = useState(position ?? { x: 0, y: 0 });

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    const gap = 6;
    const margin = 8;
    let x = position?.x ?? (anchorRect ? anchorRect.right + gap : 0);
    let y = position?.y ?? (anchorRect ? anchorRect.top : 0);

    if (anchorRect && x + rect.width > window.innerWidth - margin) x = anchorRect.left - rect.width - gap;
    if (x + rect.width > window.innerWidth - margin) x = window.innerWidth - rect.width - margin;
    if (y + rect.height > window.innerHeight - margin) y = window.innerHeight - rect.height - margin;

    setResolvedPosition({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [anchorRect, items, position]);

  return (
    <div ref={ref} className={`${appNoDragRegion} fixed z-50 min-w-[160px] rounded-lg border border-[#2d313b] bg-[#15171e] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.45)]`} style={{ left: resolvedPosition.x, top: resolvedPosition.y }} onClick={(event) => event.stopPropagation()}>
      {items.map((item) => <ContextMenuRow item={item} key={item.label} onClose={onClose} />)}
    </div>
  );
}

function ContextMenuRow({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const hasChildren = Boolean(item.children?.length);

  return (
    <div ref={rowRef} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={`flex w-full items-center justify-between gap-5 rounded-md px-2.5 py-1.5 text-left text-xs font-bold ${item.danger ? "text-[#ffb4b4] hover:bg-[#301b1d]" : "text-[#dfe2ea] hover:bg-[#20232c]"} disabled:pointer-events-none disabled:opacity-50`} disabled={item.disabled} onClick={() => { if (hasChildren) return; item.action?.(); onClose(); }}>
        <span>{item.label}</span>
        {hasChildren ? <span className="text-[#737884]">›</span> : null}
      </button>
      {hasChildren && open && rowRef.current ? <ContextMenuPanel anchorRect={rowRef.current.getBoundingClientRect()} items={item.children ?? []} onClose={onClose} /> : null}
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

function ToolsPanel({ timelineMode, canSnapMiddle, onAddTranslationMarker, onAddZoomMarker, onSnapMiddle }: { timelineMode: TimelineMode; canSnapMiddle: boolean; onAddTranslationMarker: () => void; onAddZoomMarker: () => void; onSnapMiddle: () => void }) {
  const isCompositionMode = timelineMode === "composition";

  return (
    <section className="grid gap-3">
      <button className={`${buttonBase} w-full border-[var(--clipper-accent)] text-left text-[var(--clipper-accent)]`}>Select / Move</button>
      {isCompositionMode ? <button className={`${buttonBase} w-full text-left`} onClick={onAddZoomMarker}>Add Zoom Marker</button> : null}
      {isCompositionMode ? <button className={`${buttonBase} w-full text-left`} onClick={onAddTranslationMarker}>Add Pan Marker</button> : null}
      {isCompositionMode && canSnapMiddle ? <button className={`${buttonBase} w-full border-[var(--clipper-accent-strong)] text-left text-[var(--clipper-accent)]`} title="Mend the neighboring zoom edges to the playhead" onClick={onSnapMiddle}>Mend</button> : null}
      {!isCompositionMode ? <div className={panelCard}><span>Edit mode</span><small className="text-[#9b9da7]">Scene element selection is enabled and motion lanes are hidden.</small></div> : null}
    </section>
  );
}

function AgentPanel({ part, sourceStatus, agentContext }: { part: Part; sourceStatus: string; agentContext: unknown }) {
  return <div className="grid gap-4"><section className="grid gap-2.5"><h2 className={sectionTitle}>Snapshot</h2>{part.snapshot.map((line) => <div className="grid grid-cols-[48px_1fr] gap-2.5 rounded-[11px] border border-[#2d313b] bg-[#1a1d26] p-2.5 text-xs" key={`${part.id}-${line.at}`}><strong className="text-[var(--clipper-accent)] tabular-nums">{line.at}</strong><span className="text-[#cfd2db]">{line.description}</span></div>)}</section><section className="grid gap-2.5"><h2 className={sectionTitle}>Agent Context</h2><div className="rounded-xl border border-[#2d313b] bg-[#151821] p-3 text-xs text-[#9b9da7]">{sourceStatus}</div><pre className="m-0 max-h-[260px] overflow-auto rounded-xl border border-[#2d313b] bg-[#151821] p-3 text-[11px] leading-normal text-[var(--clipper-accent)]">{JSON.stringify(agentContext, null, 2)}</pre></section></div>;
}

function ColorSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const pickerId = useRef(`clr_${Math.random().toString(36).slice(2)}`);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizeHexColor(value));
  const [hue, setHue] = useState(hexToHsv(normalizeHexColor(value)).h);
  const nextColorRef = useRef(draft);
  const nextHueRef = useRef(hue);
  const changeFrameRef = useRef(0);
  const previewFrameRef = useRef(0);

  useEffect(() => {
    const next = normalizeHexColor(value);
    setDraft(next);
    const nextHue = hexToHsv(next).h;
    setHue(nextHue);
    nextColorRef.current = next;
    nextHueRef.current = nextHue;
  }, [value]);

  useEffect(() => () => {
    if (changeFrameRef.current) cancelAnimationFrame(changeFrameRef.current);
    if (previewFrameRef.current) cancelAnimationFrame(previewFrameRef.current);
  }, []);

  useEffect(() => {
    function closeOtherPicker(event: Event) {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== pickerId.current) setOpen(false);
    }

    window.addEventListener("clipper:color-picker-open", closeOtherPicker);
    return () => window.removeEventListener("clipper:color-picker-open", closeOtherPicker);
  }, []);

  function togglePicker() {
    setOpen((current) => {
      const next = !current;
      if (next) window.dispatchEvent(new CustomEvent("clipper:color-picker-open", { detail: { id: pickerId.current } }));
      return next;
    });
  }

  function scheduleChange(next: string) {
    nextColorRef.current = next;
    if (!previewFrameRef.current) {
      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = 0;
        setDraft(nextColorRef.current);
        setHue(nextHueRef.current);
      });
    }
    if (changeFrameRef.current) return;
    changeFrameRef.current = window.requestAnimationFrame(() => {
      changeFrameRef.current = 0;
      onChange(nextColorRef.current);
    });
  }

  function pickFromBoard(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const valueLevel = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
    scheduleChange(hsvToHex(hue, saturation, valueLevel));
  }

  function pickHue(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextHue = Math.round(clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360);
    const hsv = hexToHsv(nextColorRef.current);
    nextHueRef.current = nextHue;
    scheduleChange(hsvToHex(nextHue, hsv.s, hsv.v));
  }

  async function pickFromScreen() {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) {
      toast.error("Eyedropper is not supported in this runtime.");
      return;
    }

    try {
      const result = await new EyeDropper().open();
      scheduleChange(normalizeHexColor(result.sRGBHex));
    } catch {
      // User cancelled the picker.
    }
  }

  const hsv = hexToHsv(draft);

  return <div className="relative"><div className="grid grid-cols-[1fr_38px] gap-2"><button className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2 text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)]" onClick={togglePicker}><span className="flex items-center gap-2"><span className="h-5 w-5 rounded-md border border-white/20" style={{ background: draft }} /><Palette size={14} />{draft}</span></button><button className="grid place-items-center rounded-[10px] border border-[#2d313b] bg-[#171920] text-[#dfe2ea] transition hover:border-[#37d6c2] hover:text-white" title="Sample colour from screen" onClick={() => void pickFromScreen()}><Pipette size={15} /></button></div>{open ? <div className="absolute left-0 top-[calc(100%+8px)] z-50 grid w-[246px] gap-3 rounded-2xl border border-[#2d313b] bg-[#101116] p-3 shadow-[0_20px_70px_rgba(0,0,0,0.48)]"><div className="relative h-[146px] cursor-crosshair overflow-hidden rounded-xl" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pickFromBoard(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickFromBoard(event); }}><span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} /></div><div className="relative h-4 cursor-ew-resize rounded-full bg-[linear-gradient(to_right,red,yellow,lime,cyan,blue,magenta,red)]" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pickHue(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pickHue(event); }}><span className="pointer-events-none absolute top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-black/40" style={{ left: `${hue / 360 * 100}%` }} /></div><Input value={draft} onChange={(event) => scheduleChange(normalizeHexColor(event.target.value))} /></div> : null}</div>;
}

const BackgroundLayerView = memo(function BackgroundLayerView({ background, previewTime }: { background: BackgroundLayer; previewTime: number }) {
  const layerStyle = {
    ...getMotionPreviewAnimation(background.motion, previewTime),
  } as CSSProperties;
  const fillBounds = getBackgroundLayerFillBounds(background);
  const fillStyle = {
    ...background.style,
    left: fillBounds.x,
    top: fillBounds.y,
    width: fillBounds.width,
    height: fillBounds.height,
  } as CSSProperties;

  return (
    <div className={`pointer-events-none absolute inset-0 ${background.stretchToElements ? "overflow-visible" : "overflow-hidden"}`} data-layer-id={background.id} style={layerStyle}>
      <div className="absolute" style={fillStyle} />
      {background.elements.map((element) => <BackgroundElementView element={element} key={element.id} previewTime={previewTime} />)}
    </div>
  );
}, areBackgroundLayerPropsEqual);

const BackgroundElementView = memo(function BackgroundElementView({ element, previewTime }: { element: FrameObject; previewTime: number }) {
  const animation = getObjectPreviewAnimation(element, previewTime);
  const style = {
    left: element.bounds.x,
    top: element.bounds.y,
    width: element.bounds.width,
    height: element.bounds.height,
    ...element.style,
    ...animation.style,
  } as CSSProperties;
  const content = animation.content ?? element.content;
  const textLines = useMemo(() => content?.split("\n") ?? [], [content]);

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-hidden whitespace-pre-line" data-background-element-id={element.id} style={style}>
      {element.type === "text" ? textLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>) : null}
      {element.type !== "text" && content ? content : null}
    </div>
  );
}, areBackgroundElementPropsEqual);

function FrameInspector({ part, onFrameChange, onBackgroundChange }: { part: Part; onFrameChange: (updater: (frame: PartFrame) => PartFrame) => void; onBackgroundChange: (updater: (background: BackgroundLayer) => BackgroundLayer) => void }) {
  function updateFrameBackground(value: string) {
    onFrameChange((frame) => ({ ...frame, style: { ...frame.style, background: value } }));
  }

  function updateBackgroundColor(value: string) {
    onBackgroundChange((background) => ({ ...background, style: { ...background.style, background: value } }));
  }

  function updateBackgroundStretch(checked: boolean) {
    onBackgroundChange((background) => ({ ...background, stretchToElements: checked || undefined }));
  }

  function updateBackgroundStyle(value: string) {
    try {
      const style = value.trim() ? JSON.parse(value) as BackgroundLayer["style"] : {};
      onBackgroundChange((background) => ({ ...background, style }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  function updateBackgroundMotion(value: string) {
    try {
      const motion = value.trim() ? JSON.parse(value) as BackgroundLayer["motion"] : undefined;
      onBackgroundChange((background) => ({ ...background, motion }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>Frame BG Color<ColorSelector value={String(part.frame.style.background ?? "#000000")} onChange={updateFrameBackground} /></label>
      {isHexColor(String(part.background.style.background ?? "")) ? <label className={`grid gap-1.5 ${mutedCaps}`}>Layer BG Color<ColorSelector value={String(part.background.style.background)} onChange={updateBackgroundColor} /></label> : null}
      <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]">
        <Checkbox checked={Boolean(part.background.stretchToElements)} onCheckedChange={(checked) => updateBackgroundStretch(checked === true)} />
        <span>Stretch BG</span>
      </label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background Style JSON<Textarea className="min-h-[120px] resize-y font-mono normal-case tracking-normal" value={JSON.stringify(part.background.style, null, 2)} onChange={(event) => updateBackgroundStyle(event.target.value)} /></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background Motion JSON<Textarea className="min-h-[92px] resize-y font-mono normal-case tracking-normal" value={part.background.motion ? JSON.stringify(part.background.motion, null, 2) : ""} onChange={(event) => updateBackgroundMotion(event.target.value)} /></label>
      <div className={panelCard}><span>Constant Elements</span><strong className="text-[13px]">{part.background.elements.length}</strong><small className="text-[#9b9da7]">Edit these in the composition code as background.elements.</small></div>
    </div>
  );
}

function ObjectInspector({ object, onChange }: { object: FrameObject; onChange: (updater: (object: FrameObject) => FrameObject) => void }) {
  const isText = object.type === "text";
  const colorStyleEntries = getEditableColorStyleEntries(object.style).filter(([key]) => !(isText && key === "color"));
  const textColor = isHexColor(String(object.style.color ?? "")) ? String(object.style.color) : "#FFFFFF";
  const fontFamily = String(object.style.fontFamily ?? "Inter, ui-sans-serif, system-ui, sans-serif");
  const fontSize = Number(object.style.fontSize ?? 48);
  const fontWeight = Number(object.style.fontWeight ?? 400);
  const fontStyle = String(object.style.fontStyle ?? "normal");
  const textDecoration = String(object.style.textDecoration ?? "none");
  const lineHeight = Number(object.style.lineHeight ?? 1.1);
  const letterSpacing = Number(object.style.letterSpacing ?? 0);
  const textAlign = String(object.style.textAlign ?? "left");
  const textButtonBase = "grid h-9 place-items-center rounded-[9px] border text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)]";

  function updateBounds(key: keyof Bounds, value: string) {
    onChange((current) => ({ ...current, bounds: { ...current.bounds, [key]: Number(value) || 0 } }));
  }

  function updateStyleColor(key: string, value: string) {
    onChange((current) => ({ ...current, style: { ...current.style, [key]: value } }));
  }

  function updateTextContent(value: string) {
    onChange((current) => ({ ...current, content: value, richText: undefined }));
  }

  function updateStyleValue(key: string, value: string | number) {
    onChange((current) => ({ ...current, style: { ...current.style, [key]: value } }));
  }

  function updateStyleNumber(key: string, value: string) {
    updateStyleValue(key, Number(value) || 0);
  }

  function toggleBold() {
    updateStyleValue("fontWeight", fontWeight >= 700 ? 400 : 700);
  }

  function toggleItalic() {
    updateStyleValue("fontStyle", fontStyle === "italic" ? "normal" : "italic");
  }

  function hasTextDecoration(value: "underline" | "line-through") {
    return textDecoration.split(" ").includes(value);
  }

  function toggleTextDecoration(value: "underline" | "line-through") {
    const decorations = new Set(textDecoration === "none" ? [] : textDecoration.split(" ").filter(Boolean));
    if (decorations.has(value)) decorations.delete(value);
    else decorations.add(value);
    updateStyleValue("textDecoration", decorations.size > 0 ? Array.from(decorations).join(" ") : "none");
  }

  function toggleStrikethrough() {
    toggleTextDecoration("line-through");
  }

  function toggleUnderline() {
    toggleTextDecoration("underline");
  }

  function textButtonClass(active: boolean) {
    return `${textButtonBase} ${active ? "border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] text-white" : "border-[#2d313b] bg-[#171920]"}`;
  }

  function updateMotion(value: string) {
    try {
      const motion = value.trim() ? JSON.parse(value) as FrameObject["motion"] : undefined;
      onChange((current) => ({ ...current, motion }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{key}<Input type="number" value={object.bounds[key]} onChange={(event) => updateBounds(key, event.target.value)} /></label>)}
      </div>
      {isText ? <>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Content<Textarea className="min-h-[104px] resize-y normal-case tracking-normal" value={object.content ?? ""} onChange={(event) => updateTextContent(event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Colour<ColorSelector value={textColor} onChange={(value) => updateStyleValue("color", value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Font<Select value={fontFamily} onValueChange={(value) => updateStyleValue("fontFamily", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="Inter, ui-sans-serif, system-ui, sans-serif">Inter / System</SelectItem><SelectItem value="Arial, Helvetica, sans-serif">Arial</SelectItem><SelectItem value="Georgia, serif">Georgia</SelectItem><SelectItem value="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">Monospace</SelectItem><SelectItem value="Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif">Impact</SelectItem></SelectGroup></SelectContent></Select></label>
        <div className="grid grid-cols-2 gap-2">
          <label className={`grid gap-1.5 ${mutedCaps}`}>Size<Input type="number" min={1} value={fontSize} onChange={(event) => updateStyleNumber("fontSize", event.target.value)} /></label>
          <label className={`grid gap-1.5 ${mutedCaps}`}>Weight<Input type="number" min={100} max={1000} step={10} value={fontWeight} onChange={(event) => updateStyleNumber("fontWeight", event.target.value)} /></label>
          <label className={`grid gap-1.5 ${mutedCaps}`}>Line Height<Input type="number" min={0.1} step={0.05} value={lineHeight} onChange={(event) => updateStyleNumber("lineHeight", event.target.value)} /></label>
          <label className={`grid gap-1.5 ${mutedCaps}`}>Char Spacing<Input type="number" step={0.1} value={letterSpacing} onChange={(event) => updateStyleNumber("letterSpacing", event.target.value)} /></label>
        </div>
        <div className="grid grid-cols-4 gap-2" aria-label="Text style">
          <button className={textButtonClass(fontWeight >= 700)} aria-label="Bold" aria-pressed={fontWeight >= 700} title="Bold" onClick={toggleBold}><Bold size={16} /></button>
          <button className={textButtonClass(fontStyle === "italic")} aria-label="Italic" aria-pressed={fontStyle === "italic"} title="Italic" onClick={toggleItalic}><Italic size={16} /></button>
          <button className={textButtonClass(hasTextDecoration("underline"))} aria-label="Underline" aria-pressed={hasTextDecoration("underline")} title="Underline" onClick={toggleUnderline}><Underline size={16} /></button>
          <button className={textButtonClass(hasTextDecoration("line-through"))} aria-label="Strikethrough" aria-pressed={hasTextDecoration("line-through")} title="Strikethrough" onClick={toggleStrikethrough}><Strikethrough size={16} /></button>
        </div>
        <div className="grid gap-1.5"><span className={mutedCaps}>Alignment</span><div className="grid grid-cols-4 gap-2" aria-label="Text alignment">
          <button className={textButtonClass(textAlign === "left")} aria-label="Align left" aria-pressed={textAlign === "left"} title="Align left" onClick={() => updateStyleValue("textAlign", "left")}><AlignLeft size={16} /></button>
          <button className={textButtonClass(textAlign === "center")} aria-label="Align center" aria-pressed={textAlign === "center"} title="Align center" onClick={() => updateStyleValue("textAlign", "center")}><AlignCenter size={16} /></button>
          <button className={textButtonClass(textAlign === "right")} aria-label="Align right" aria-pressed={textAlign === "right"} title="Align right" onClick={() => updateStyleValue("textAlign", "right")}><AlignRight size={16} /></button>
          <button className={textButtonClass(textAlign === "justify")} aria-label="Justify" aria-pressed={textAlign === "justify"} title="Justify" onClick={() => updateStyleValue("textAlign", "justify")}><AlignJustify size={16} /></button>
        </div></div>
      </> : null}
      {colorStyleEntries.length > 0 ? <div className="grid gap-2"><span className={mutedCaps}>Colours</span><div className="grid gap-2">{colorStyleEntries.map(([key, value]) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{formatStyleLabel(key)}<ColorSelector value={value} onChange={(nextValue) => updateStyleColor(key, nextValue)} /></label>)}</div></div> : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>Motion JSON<Textarea className="min-h-[92px] resize-y font-mono normal-case tracking-normal" value={object.motion ? JSON.stringify(object.motion, null, 2) : ""} onChange={(event) => updateMotion(event.target.value)} /></label>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className={panelCard}>
      <span>No selection</span>
      <strong className="text-[13px]">Nothing selected</strong>
      <small className="text-[#9b9da7]">Select a part, marker, or object to edit its settings.</small>
    </div>
  );
}

function ZoomInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, middleTransitionMode, pickingFocus, canSnapMiddle, onChange, onChangeFocus, onChangeSelectedSnap, onChangeMiddleTransition, onChangeMiddleEase, onDelete, onPickFocus, onSnapMiddle }: { marker: ZoomMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; middleTransitionMode: "instant" | "transition"; pickingFocus: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: ZoomMarker, part: Part) => ZoomMarker) => void; onChangeFocus: (focus: Point) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onChangeMiddleTransition: (mode: "instant" | "transition") => void; onChangeMiddleEase: (ease: MotionEase | undefined) => void; onDelete: () => void; onPickFocus: () => void; onSnapMiddle: () => void }) {
  const isMultiSelection = selectedMarkerCount > 1;
  const snapInActive = isMultiSelection ? selectedSnapInActive : Boolean(marker.snapIn);
  const snapOutActive = isMultiSelection ? selectedSnapOutActive : Boolean(marker.snapOut);
  const [draftScale, setDraftScale] = useState(() => roundTwo(clamp(marker.scale, 1, 5)));

  useEffect(() => {
    setDraftScale(roundTwo(clamp(marker.scale, 1, 5)));
  }, [marker.id, marker.scale]);
  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current, currentPart) => {
      if (key === "start") return { ...current, start: roundTenth(clamp(numeric, 0, Math.max(currentPart.duration - current.duration, 0))) };
      return { ...current, duration: roundTenth(clamp(numeric, minimumZoomDuration, currentPart.duration - current.start)) };
    });
  }

  function updateFocus(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChangeFocus({ ...marker.focus, [key]: Math.round(clamp(numeric, 0, key === "x" ? FRAME_WIDTH : FRAME_HEIGHT)) });
  }

  function commitScale(value = draftScale) {
    const nextScale = roundTwo(clamp(value, 1, 5));
    setDraftScale(nextScale);
    if (nextScale === roundTwo(marker.scale)) return;
    onChange((current) => ({ ...current, scale: nextScale }));
  }

  function updateEase(value: string) {
    onChange((current) => ({ ...current, ease: value === "easeInOut" ? undefined : value as MotionEase }));
  }

  function updateMiddleEase(value: string) {
    onChangeMiddleEase(value === "easeInOut" ? undefined : value as MotionEase);
  }

  function updateSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    if (isMultiSelection) {
      onChangeSelectedSnap(key, enabled);
      return;
    }

    onChange((current) => ({ ...current, [key]: enabled || undefined }));
  }

  function snapButtonClass(active: boolean, enabled = true) {
    if (active) return "rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] px-3 py-2.5 text-center text-xs font-bold text-[var(--clipper-accent)] transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]";
    return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
  }

  function middleTransitionButtonClass(active: boolean) {
    return `rounded-[9px] border px-3 py-2 text-xs font-bold transition ${active ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#dfe2ea] hover:border-[#37d6c2] hover:bg-[#20232c]"}`;
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Focus X<Input type="number" min={0} max={FRAME_WIDTH} step={1} value={marker.focus.x} onChange={(event) => updateFocus("x", event.target.value)} /></label>
        <div className="grid gap-1.5">
          <span className={mutedCaps}>Focus Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" min={0} max={FRAME_HEIGHT} step={1} value={marker.focus.y} onChange={(event) => updateFocus("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${pickingFocus ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick focus from frame" onClick={onPickFocus}><Crosshair size={16} /></button>
          </div>
        </div>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Scale<div className="grid grid-cols-[1fr_52px] items-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-2.5 py-2"><input aria-label="Zoom scale" className="h-1.5 min-w-0 accent-[#37d6c2] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#37d6c2] [&::-webkit-slider-thumb]:bg-[var(--clipper-accent)] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#37d6c2] [&::-moz-range-thumb]:bg-[var(--clipper-accent)]" type="range" min={1} max={5} step={0.01} value={draftScale} onChange={(event) => setDraftScale(roundTwo(Number(event.target.value) || 1))} onPointerUp={() => commitScale()} onKeyUp={() => commitScale()} onBlur={() => commitScale()} /><span className="text-right text-xs font-extrabold normal-case tracking-normal text-[#dfe2ea] tabular-nums">{draftScale.toFixed(2)}</span></div></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Ease<Select value={marker.ease ?? "easeInOut"} onValueChange={updateEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Unmend the neighboring zoom edges" : "Mend the neighboring zoom edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>{middleSnapActive ? "Unmend" : "Mend"}</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
        {middleSnapActive ? <div className="grid gap-1.5"><span className={mutedCaps}>Mend handoff</span><div className="grid grid-cols-2 gap-2"><button className={middleTransitionButtonClass(middleTransitionMode === "instant")} aria-pressed={middleTransitionMode === "instant"} onClick={() => onChangeMiddleTransition("instant")}>Instant</button><button className={middleTransitionButtonClass(middleTransitionMode === "transition")} aria-pressed={middleTransitionMode === "transition"} onClick={() => onChangeMiddleTransition("transition")}>Transition</button></div><label className={`grid gap-1.5 ${mutedCaps}`}>Mend ease<Select value={marker.middleEase ?? "easeInOut"} onValueChange={updateMiddleEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label></div> : null}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

function TranslationInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, middleTransitionMode, pickingPosition, canSnapMiddle, onChange, onChangeSelectedSnap, onChangeMiddleTransition, onChangeMiddleEase, onDelete, onPickPosition, onSnapMiddle }: { marker: TranslationMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; middleTransitionMode: "instant" | "transition"; pickingPosition: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: TranslationMarker, part: Part) => TranslationMarker) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onChangeMiddleTransition: (mode: "instant" | "transition") => void; onChangeMiddleEase: (ease: MotionEase | undefined) => void; onDelete: () => void; onPickPosition: () => void; onSnapMiddle: () => void }) {
  const isMultiSelection = selectedMarkerCount > 1;
  const snapInActive = isMultiSelection ? selectedSnapInActive : Boolean(marker.snapIn);
  const snapOutActive = isMultiSelection ? selectedSnapOutActive : Boolean(marker.snapOut);

  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current, currentPart) => {
      if (key === "start") return { ...current, start: roundTenth(clamp(numeric, 0, Math.max(currentPart.duration - current.duration, 0))) };
      return { ...current, duration: roundTenth(clamp(numeric, minimumZoomDuration, currentPart.duration - current.start)) };
    });
  }

  function updatePosition(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => ({ ...current, position: { ...current.position, [key]: Math.round(numeric) } }));
  }

  function updateEase(value: string) {
    onChange((current) => ({ ...current, ease: value === "default" ? undefined : value as MotionEase }));
  }

  function updateMiddleEase(value: string) {
    onChangeMiddleEase(value === "default" ? undefined : value as MotionEase);
  }

  function updateSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    if (isMultiSelection) {
      onChangeSelectedSnap(key, enabled);
      return;
    }

    onChange((current) => ({ ...current, [key]: enabled || undefined }));
  }

  function snapButtonClass(active: boolean, enabled = true) {
    if (active) return "rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] px-3 py-2.5 text-center text-xs font-bold text-[var(--clipper-accent)] transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]";
    return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
  }

  function middleTransitionButtonClass(active: boolean) {
    return `rounded-[9px] border px-3 py-2 text-xs font-bold transition ${active ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#dfe2ea] hover:border-[#37d6c2] hover:bg-[#20232c]"}`;
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>X<Input type="number" step={1} value={marker.position.x} onChange={(event) => updatePosition("x", event.target.value)} /></label>
        <div className="grid gap-1.5">
          <span className={mutedCaps}>Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" step={1} value={marker.position.y} onChange={(event) => updatePosition("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${pickingPosition ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick pan target from frame" onClick={onPickPosition}><Crosshair size={16} /></button>
          </div>
        </div>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Ease<Select value={marker.ease ?? "default"} onValueChange={updateEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="default">Ease in-out</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Unmend the neighboring pan edges" : "Mend the neighboring pan edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>{middleSnapActive ? "Unmend" : "Mend"}</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
        {middleSnapActive ? <div className="grid gap-1.5"><span className={mutedCaps}>Mend handoff</span><div className="grid grid-cols-2 gap-2"><button className={middleTransitionButtonClass(middleTransitionMode === "instant")} aria-pressed={middleTransitionMode === "instant"} onClick={() => onChangeMiddleTransition("instant")}>Instant</button><button className={middleTransitionButtonClass(middleTransitionMode === "transition")} aria-pressed={middleTransitionMode === "transition"} onClick={() => onChangeMiddleTransition("transition")}>Transition</button></div><label className={`grid gap-1.5 ${mutedCaps}`}>Mend ease<Select value={marker.middleEase ?? "default"} onValueChange={updateMiddleEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="default">Ease in-out</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label></div> : null}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

function CodePane({ part, source: externalSource, onSaveAll, onSourceChange, onSourceLoad }: { part: Part; source: string | undefined; onSaveAll: () => Promise<void>; onSourceChange: (source: string) => Promise<void>; onSourceLoad: (source: string) => void }) {
  const [source, setSource] = useState(externalSource ?? "");
  const [error, setError] = useState("");
  const saveAllRef = useRef<() => Promise<void>>(onSaveAll);
  const applySourceChangeRef = useRef(onSourceChange);

  useEffect(() => {
    saveAllRef.current = onSaveAll;
  }, [onSaveAll]);

  useEffect(() => {
    applySourceChangeRef.current = onSourceChange;
  }, [onSourceChange]);

  const configureMonaco: BeforeMount = (monaco) => {
    const { accent, alpha: accentAlpha } = getClipperAccent();

    monaco.editor.defineTheme("clipper-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "69707f", fontStyle: "italic" },
        { token: "keyword", foreground: "61c7ff" },
        { token: "number", foreground: "f0b35c" },
        { token: "string", foreground: "93e6b4" },
        { token: "type", foreground: "9bdcff" },
        { token: "delimiter.bracket", foreground: "d9dbe1" },
      ],
      colors: {
        "editor.background": "#12141a",
        "editor.foreground": accent,
        "editor.lineHighlightBackground": "#1a1d26",
        "editor.lineHighlightBorder": "#20232c",
        "editor.selectionBackground": accentAlpha(0.25),
        "editor.inactiveSelectionBackground": "#2d313b66",
        "editorCursor.foreground": accent,
        "editorLineNumber.foreground": "#4a5060",
        "editorLineNumber.activeForeground": "#d9dbe1",
        "editorIndentGuide.background1": "#20232c",
        "editorIndentGuide.activeBackground1": "#3b4150",
        "editorBracketHighlight.foreground1": accent,
        "editorBracketHighlight.foreground2": "#f0b35c",
        "editorBracketHighlight.foreground3": "#93e6b4",
        "editorBracketMatch.background": accentAlpha(0.14),
        "editorBracketMatch.border": accent,
        "editorGutter.background": "#151821",
        "editorWidget.background": "#11141a",
        "editorWidget.border": "#2d313b",
        "editorSuggestWidget.background": "#11141a",
        "editorSuggestWidget.border": "#2d313b",
        "editorSuggestWidget.foreground": "#dfe2ea",
        "editorSuggestWidget.highlightForeground": accent,
        "editorSuggestWidget.selectedBackground": "#20232c",
        "editorHoverWidget.background": "#11141a",
        "editorHoverWidget.border": "#2d313b",
        "scrollbarSlider.background": "#9b9da747",
        "scrollbarSlider.hoverBackground": "#d9dbe15c",
        "scrollbarSlider.activeBackground": accentAlpha(0.4),
      },
    });

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.Bundler,
      baseUrl: "file:///",
      paths: { "@clipper/*": ["clipper/projects/*"] },
      strict: true,
      target: monaco.languages.typescript.ScriptTarget.ES2022,
    });
    monaco.languages.typescript.typescriptDefaults.addExtraLib(partApiSource, "file:///clipper/projects/part-api.ts");
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
  };

  useEffect(() => {
    let cancelled = false;
    setError("");

    if (externalSource !== undefined) {
      setSource(externalSource);
      return () => { cancelled = true; };
    }

    readTextFile(part.filePath).then((content) => {
      if (cancelled) return;
      setSource(content);
      onSourceLoad(content);
    }).catch((error: unknown) => {
      if (cancelled) return;
      const fallbackSource = partToSource(part);
      setSource(fallbackSource);
      onSourceLoad(fallbackSource);
      setError(error instanceof Error ? error.message : "Unable to load composition file.");
    });

    return () => { cancelled = true; };
  }, [externalSource, onSourceLoad, part, part.filePath]);

  function updateSource(nextSource: string) {
    setSource(nextSource);
    applySourceChangeRef.current(nextSource).then(() => setError("")).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Unable to apply code changes.");
    });
  }

  const onEditorMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveAllRef.current();
    });
  };

  return <div className={`grid h-full min-h-0 w-full ${error ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]"} overflow-hidden bg-[#12141a]`}><div className="flex min-w-0 items-center border-b border-[#2d313b] bg-[#171920] px-3.5 py-3 text-xs text-[var(--clipper-accent)]"><span className="min-w-0 break-words">{part.filePath}</span></div><div className="min-h-0 border-y border-[#20232c] bg-[#12141a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"><Editor beforeMount={configureMonaco} language="typescript" onMount={onEditorMount} options={monacoOptions} path={`file:///${part.filePath}`} theme="clipper-dark" value={source} onChange={(value) => updateSource(value ?? "")} /></div>{error ? <div className="border-t border-[#3b2a2a] bg-[#1a0f10] px-3.5 py-2 text-xs text-[#ffb4b4] break-words">{error}</div> : null}</div>;
}

function isCodeEditorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest(".monaco-editor"));
}

function isInspectorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-inspector-panel]"));
}

function isSelectPopoverTarget(target: HTMLElement | null) {
  return Boolean(target?.closest("[data-radix-select-content], [data-radix-popper-content-wrapper]"));
}

type TimelinePanelProps = {
  timeline: TimelinePart[];
  timelineViewportState: TimelineViewportState;
  mode: TimelineMode;
  selectedPartId: string;
  selectedZoomMarkerPartId: string | null;
  selectedZoomMarkerId: string | null;
  selectedZoomMarkers: ZoomMarkerSelection[];
  selectedTranslationMarkerPartId: string | null;
  selectedTranslationMarkerId: string | null;
  selectedTranslationMarkers: TranslationMarkerSelection[];
  sceneDuration: number;
  currentSceneTime: number;
  fastSelectEnabled: boolean;
  scrubSnapEnabled: boolean;
  onScrub: (time: number) => void;
  onModeChange: (mode: TimelineMode) => void;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
  onSelectPart: (id: string) => void;
  onSelectZoomMarker: (partId: string, markerId: string) => void;
  onSelectZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
  onSelectTranslationMarker: (partId: string, markerId: string) => void;
  onSelectTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  onReorderPart: (sourcePartId: string, targetPartId: string) => void;
  onMoveZoomMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number) => void;
  onMoveZoomMarkers: (moves: TimelineMarkerMove[]) => void;
  onMoveTranslationMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number) => void;
  onMoveTranslationMarkers: (moves: TimelineMarkerMove[]) => void;
  onUpdateZoomMarkers: (partId: string, updater: (markers: ZoomMarker[], part: Part) => ZoomMarker[]) => void;
  onUpdateTranslationMarkers: (partId: string, updater: (markers: TranslationMarker[], part: Part) => TranslationMarker[]) => void;
};

function TimelinePanel({ timeline, timelineViewportState, mode, selectedPartId, selectedZoomMarkerPartId, selectedZoomMarkerId, selectedZoomMarkers, selectedTranslationMarkerPartId, selectedTranslationMarkerId, selectedTranslationMarkers, sceneDuration, currentSceneTime, fastSelectEnabled, scrubSnapEnabled, onScrub, onModeChange, onTimelineViewportStateChange, onSelectPart, onSelectZoomMarker, onSelectZoomMarkers, onSelectTranslationMarker, onSelectTranslationMarkers, onReorderPart, onMoveZoomMarker, onMoveZoomMarkers, onMoveTranslationMarker, onMoveTranslationMarkers, onUpdateZoomMarkers, onUpdateTranslationMarkers }: TimelinePanelProps) {
  const ticks = useMemo(() => getTimelineTicks(sceneDuration), [sceneDuration]);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const [draggedPartId, setDraggedPartId] = useState<string | null>(null);
  const [draggingZoomMarkerId, setDraggingZoomMarkerId] = useState<string | null>(null);
  const [draggingTranslationMarkerId, setDraggingTranslationMarkerId] = useState<string | null>(null);
  const [zoomSelectionDrag, setZoomSelectionDrag] = useState<{ startX: number; currentX: number } | null>(null);
  const [translationSelectionDrag, setTranslationSelectionDrag] = useState<{ startX: number; currentX: number } | null>(null);
  const scrubClientXRef = useRef<number | null>(null);
  const scrubSnapRef = useRef(false);
  const scrubAutoScrollFrameRef = useRef(0);
  const [shiftSnapActive, setShiftSnapActive] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(timelineViewportState.zoom);
  const restoredTimelineDisplacementRef = useRef<number | null>(null);
  const skipNextTimelineAutoScrollRef = useRef(true);
  const isScrubSnapActive = scrubSnapEnabled || shiftSnapActive;
  const selectedZoomKeys = useMemo(() => new Set(selectedZoomMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedZoomMarkers]);
  const selectedTranslationKeys = useMemo(() => new Set(selectedTranslationMarkers.map((selection) => `${selection.partId}:${selection.markerId}`)), [selectedTranslationMarkers]);
  const scrubSnapBoundaries = useMemo(() => getScrubSnapBoundaries(timeline), [timeline]);
  const contentWidth = Math.max(sceneDuration * defaultTimelinePixelsPerSecond * timelineZoom, 760);
  const isCompositionMode = mode === "composition";
  const laneRows = isCompositionMode ? "grid-rows-[56px_58px_58px_58px]" : "grid-rows-[56px_58px]";
  const playheadHeight = isCompositionMode ? 210 : 94;

  useEffect(() => {
    setTimelineZoom(timelineViewportState.zoom);
  }, [timelineViewportState.zoom]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport || restoredTimelineDisplacementRef.current === timelineViewportState.displacement) return;

    viewport.scrollLeft = timelineViewportState.displacement;
    restoredTimelineDisplacementRef.current = timelineViewportState.displacement;
    skipNextTimelineAutoScrollRef.current = true;
  }, [contentWidth, timelineViewportState.displacement]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport || sceneDuration <= 0 || scrubClientXRef.current !== null || restoredTimelineDisplacementRef.current !== timelineViewportState.displacement) return;

    if (skipNextTimelineAutoScrollRef.current) {
      skipNextTimelineAutoScrollRef.current = false;
      return;
    }

    const playheadX = (currentSceneTime / sceneDuration) * contentWidth;
    const margin = 48;
    const visibleLeft = viewport.scrollLeft;
    const visibleRight = visibleLeft + viewport.clientWidth;

    if (playheadX < visibleLeft + margin) viewport.scrollLeft = Math.max(playheadX - margin, 0);
    if (playheadX > visibleRight - margin) viewport.scrollLeft = playheadX - viewport.clientWidth + margin;
  }, [contentWidth, currentSceneTime, sceneDuration, timelineViewportState.displacement]);

  function updateTimelineZoom(nextZoom: number) {
    const zoom = clamp(nextZoom, 0.5, 4);
    setTimelineZoom(zoom);
    onTimelineViewportStateChange((state) => ({ ...state, zoom }));
  }

  function saveTimelineDisplacement() {
    const displacement = Math.max(Math.round(timelineViewportRef.current?.scrollLeft ?? 0), 0);
    restoredTimelineDisplacementRef.current = displacement;
    onTimelineViewportStateChange((state) => ({ ...state, displacement }));
  }

  function timeFromClientX(clientX: number, snap: boolean) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || sceneDuration <= 0) return 0;
    const rawTime = clamp(((clientX - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    if (!snap) return rawTime;

    const pixelsPerSecond = rect.width / sceneDuration;
    const snapThresholdSeconds = Math.min(0.35, Math.max(0.05, 10 / pixelsPerSecond));
    return snapScrubTimeToBoundary(rawTime, scrubSnapBoundaries, snapThresholdSeconds);
  }

  function visibleScrubClientX(clientX: number) {
    const viewport = timelineViewportRef.current;
    if (!viewport) return clientX;
    const rect = viewport.getBoundingClientRect();
    return clamp(clientX, rect.left, rect.right);
  }

  function updateScrubFromClientX(clientX: number, snap: boolean) {
    const time = timeFromClientX(visibleScrubClientX(clientX), snap);
    if (fastSelectEnabled) selectTimelineItemAtTime(time);
    onScrub(time);
  }

  function selectTimelineItemAtTime(time: number) {
    const item = getTopTimelineItemAtTime(timeline, time);
    if (!item) return;
    if (item.kind === "translation") {
      onSelectTranslationMarker(item.part.id, item.marker.id);
      return;
    }
    if (item.kind === "zoom") {
      onSelectZoomMarker(item.part.id, item.marker.id);
      return;
    }
    onSelectPart(item.part.id);
  }

  function stopScrubAutoScroll() {
    scrubClientXRef.current = null;
    if (scrubAutoScrollFrameRef.current) window.cancelAnimationFrame(scrubAutoScrollFrameRef.current);
    scrubAutoScrollFrameRef.current = 0;
  }

  function scheduleScrubAutoScroll() {
    if (scrubAutoScrollFrameRef.current) return;

    const tick = () => {
      scrubAutoScrollFrameRef.current = 0;
      const clientX = scrubClientXRef.current;
      const viewport = timelineViewportRef.current;
      if (clientX === null || !viewport) return;

      const rect = viewport.getBoundingClientRect();
      const edgeSize = 72;
      const leftDistance = rect.left + edgeSize - clientX;
      const rightDistance = clientX - (rect.right - edgeSize);
      let scrollDelta = 0;

      if (leftDistance > 0) scrollDelta = -clamp(leftDistance / 3, 5, 34);
      if (rightDistance > 0) scrollDelta = clamp(rightDistance / 3, 5, 34);

      if (scrollDelta !== 0) {
        const previousScrollLeft = viewport.scrollLeft;
        viewport.scrollLeft += scrollDelta;
        if (viewport.scrollLeft !== previousScrollLeft) updateScrubFromClientX(clientX, scrubSnapRef.current);
      }

      scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    scrubAutoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  function scrubFromPointer(event: PointerEvent<HTMLDivElement>) {
    const snap = scrubSnapEnabled || event.shiftKey;
    scrubClientXRef.current = event.clientX;
    scrubSnapRef.current = snap;
    setShiftSnapActive((current) => (current === event.shiftKey ? current : event.shiftKey));
    updateScrubFromClientX(event.clientX, snap);
    scheduleScrubAutoScroll();
  }

  function startScrub(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubFromPointer(event);
  }

  function continueScrub(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    scrubFromPointer(event);
  }

  function endScrub(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setShiftSnapActive(false);
    stopScrubAutoScroll();
  }

  function startZoomSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setZoomSelectionDrag({ startX: event.clientX, currentX: event.clientX });
  }

  function zoomSelectionFromDrag(selectionDrag: { startX: number; currentX: number }, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    return timeline.flatMap((timelinePart) => timelinePart.zoomMarkers
      .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
      .map((marker) => ({ partId: timelinePart.id, markerId: marker.id })));
  }

  function continueZoomSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!zoomSelectionDrag) return;
    const next = { ...zoomSelectionDrag, currentX: event.clientX };
    setZoomSelectionDrag(next);
    if (Math.abs(next.currentX - next.startX) >= 4) {
      const selection = zoomSelectionFromDrag(next, event.currentTarget.getBoundingClientRect());
      if (selection.length > 0) onSelectZoomMarkers(selection);
    }
  }

  function endZoomSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const selectionDrag = zoomSelectionDrag;
    setZoomSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragDistance = Math.abs(selectionDrag.currentX - selectionDrag.startX);
    if (dragDistance < 4) {
      const time = timeFromClientX(selectionDrag.currentX, scrubSnapEnabled || event.shiftKey);
      if (fastSelectEnabled) selectTimelineItemAtTime(time);
      onScrub(time);
      return;
    }

    const selection = zoomSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectZoomMarkers(selection);
  }

  function startTranslationSelection(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTranslationSelectionDrag({ startX: event.clientX, currentX: event.clientX });
  }

  function translationSelectionFromDrag(selectionDrag: { startX: number; currentX: number }, rect: DOMRect) {
    const start = clamp(((Math.min(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    const end = clamp(((Math.max(selectionDrag.startX, selectionDrag.currentX) - rect.left) / rect.width) * sceneDuration, 0, sceneDuration);
    return timeline.flatMap((timelinePart) => timelinePart.translationMarkers
      .filter((marker) => timelinePart.start + marker.start <= end && timelinePart.start + marker.start + marker.duration >= start)
      .map((marker) => ({ partId: timelinePart.id, markerId: marker.id })));
  }

  function continueTranslationSelection(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (!translationSelectionDrag) return;
    const next = { ...translationSelectionDrag, currentX: event.clientX };
    setTranslationSelectionDrag(next);
    if (Math.abs(next.currentX - next.startX) >= 4) {
      const selection = translationSelectionFromDrag(next, event.currentTarget.getBoundingClientRect());
      if (selection.length > 0) onSelectTranslationMarkers(selection);
    }
  }

  function endTranslationSelection(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const selectionDrag = translationSelectionDrag;
    setTranslationSelectionDrag(null);
    if (!selectionDrag) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragDistance = Math.abs(selectionDrag.currentX - selectionDrag.startX);
    if (dragDistance < 4) {
      const time = timeFromClientX(selectionDrag.currentX, scrubSnapEnabled || event.shiftKey);
      if (fastSelectEnabled) selectTimelineItemAtTime(time);
      onScrub(time);
      return;
    }

    const selection = translationSelectionFromDrag(selectionDrag, rect);

    if (selection.length > 0) onSelectTranslationMarkers(selection);
  }

  function onPartDragStart(event: DragEvent<HTMLButtonElement>, partId: string) {
    setDraggedPartId(partId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", partId);
  }

  function onPartDrop(event: DragEvent<HTMLButtonElement>, targetPartId: string) {
    event.preventDefault();
    const sourcePartId = draggedPartId ?? event.dataTransfer.getData("text/plain");
    if (sourcePartId) onReorderPart(sourcePartId, targetPartId);
    setDraggedPartId(null);
  }

  function selectedZoomDragItems(part: TimelinePart, marker: ZoomMarker) {
    const mendedItems = getMendedMarkerDragItems(timeline, part, marker.id, "zoom");
    if (!selectedZoomKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedZoomMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? getMendedMarkerDragItems(timeline, selectedPart, selectedMarker.id, "zoom") : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function selectedTranslationDragItems(part: TimelinePart, marker: TranslationMarker) {
    const mendedItems = getMendedMarkerDragItems(timeline, part, marker.id, "translation");
    if (!selectedTranslationKeys.has(`${part.id}:${marker.id}`)) {
      return mendedItems;
    }

    const items = selectedTranslationMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.translationMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? getMendedMarkerDragItems(timeline, selectedPart, selectedMarker.id, "translation") : [];
    });
    return uniqueTimelineDragItems(items.length > 0 ? items : mendedItems);
  }

  function blockDeltaForTimelineDrag(items: TimelineMarkerDragItem[], rawDelta: number, snapThresholdSeconds: number, snap: boolean, kind: "zoom" | "translation") {
    const constraintItems = getTimelineDragConstraintItems(items);
    const blockStart = Math.min(...constraintItems.map((item) => item.absoluteStart));
    const blockEnd = Math.max(...constraintItems.map((item) => item.absoluteStart + item.duration));
    const movingKeys = new Set(items.map((item) => `${item.partId}:${item.markerId}`));
    const deltaIntervals = constraintItems.reduce<Array<{ start: number; end: number }>>((intervals, item) => {
      const itemIntervals = getTimelineMarkerGapIntervals(timeline, kind, item.duration, item.absoluteStart, movingKeys);
      if (intervals.length === 0) return itemIntervals;

      return intervals.flatMap((interval) => itemIntervals.flatMap((itemInterval) => {
        const start = Math.max(interval.start, itemInterval.start);
        const end = Math.min(interval.end, itemInterval.end);
        return start <= end ? [{ start, end }] : [];
      }));
    }, []);
    let nextDelta = rawDelta;

    if (snap) {
      for (const boundary of timeline.flatMap((item) => [item.start, item.end])) {
        if (Math.abs(blockStart + nextDelta - boundary) <= snapThresholdSeconds) nextDelta = boundary - blockStart;
        if (Math.abs(blockEnd + nextDelta - boundary) <= snapThresholdSeconds) nextDelta = boundary - blockEnd;
      }
    }

    if (deltaIntervals.length === 0) return clamp(nextDelta, -blockStart, sceneDuration - blockEnd);
    for (const interval of deltaIntervals) {
      if (nextDelta >= interval.start && nextDelta <= interval.end) return nextDelta;
    }

    return deltaIntervals.reduce((nearest, interval) => {
      const candidate = Math.abs(nextDelta - interval.start) < Math.abs(nextDelta - interval.end) ? interval.start : interval.end;
      return Math.abs(nextDelta - candidate) < Math.abs(nextDelta - nearest) ? candidate : nearest;
    }, Math.abs(nextDelta - deltaIntervals[0].start) < Math.abs(nextDelta - deltaIntervals[0].end) ? deltaIntervals[0].start : deltaIntervals[0].end);
  }

  function exactMarkerPlacement(absoluteStart: number, duration: number) {
    const targetPart = timeline.find((timelinePart) => duration <= timelinePart.duration && absoluteStart >= timelinePart.start && absoluteStart + duration <= timelinePart.end);
    return targetPart ? { partId: targetPart.id, start: absoluteStart - targetPart.start } : null;
  }

  function updateZoomFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: ZoomMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedZoomDragItems(part, marker);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    if (!isSelectionMove) onSelectZoomMarker(part.id, marker.id);
    setDraggingZoomMarkerId(marker.id);
    const initialClientX = event.clientX;
    const initialStart = action === "move" ? part.start + marker.start : marker.start;
    const initialDuration = marker.duration;
    const initialZoomMarkers = part.zoomMarkers;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    let activePartId = part.id;
    const activePartIds = new Map(dragItems.map((item) => [item.markerId, item.partId]));
    let pendingClientX = event.clientX;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;

    function applyDrag(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (action === "move") {
        if (dragItems.length > 1) {
          const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "zoom");
          const moves = getTimelineMarkerMoves(timeline, dragItems, blockDeltaSeconds, "zoom", activePartIds, snapThresholdSeconds);
          onMoveZoomMarkers(moves);
          for (const move of moves) activePartIds.set(move.markerId, move.targetPartId);
          return;
        }

        const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "zoom");
        const nextPlacement = exactMarkerPlacement(initialStart + blockDeltaSeconds, initialDuration)
          ?? getMarkerPlacement(timeline, initialStart + blockDeltaSeconds, initialDuration, snapThresholdSeconds, false, { kind: "zoom", partId: part.id, markerId: marker.id });
        onMoveZoomMarker(activePartId, marker.id, nextPlacement.partId, nextPlacement.start);
        activePartId = nextPlacement.partId;
        return;
      }

      if (action === "start" || action === "end") {
        onUpdateZoomMarkers(part.id, (_markers, currentPart) => resizeTimelineMarkersWithPush(initialZoomMarkers, marker.id, action, deltaSeconds, currentPart.duration));
        return;
      }
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingSnap = pointerEvent.shiftKey;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      applyDrag(pendingClientX, pointerEvent.shiftKey);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraggingZoomMarkerId(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  function updateTranslationFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, marker: TranslationMarker, action: "move" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const dragItems = selectedTranslationDragItems(part, marker);
    const isSelectionMove = action === "move" && dragItems.length > 1;
    if (!isSelectionMove) onSelectTranslationMarker(part.id, marker.id);
    setDraggingTranslationMarkerId(marker.id);
    const initialClientX = event.clientX;
    const initialStart = action === "move" ? part.start + marker.start : marker.start;
    const initialDuration = marker.duration;
    const initialTranslationMarkers = part.translationMarkers;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);
    const snapThresholdSeconds = Math.max(0.08, 8 / pixelsPerSecond);
    let activePartId = part.id;
    const activePartIds = new Map(dragItems.map((item) => [item.markerId, item.partId]));
    let pendingClientX = event.clientX;
    let pendingSnap = event.shiftKey;
    let animationFrame = 0;

    function applyDrag(clientX: number, snap: boolean) {
      const deltaSeconds = (clientX - initialClientX) / pixelsPerSecond;
      if (action === "move") {
        if (dragItems.length > 1) {
          const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "translation");
          const moves = getTimelineMarkerMoves(timeline, dragItems, blockDeltaSeconds, "translation", activePartIds, snapThresholdSeconds);
          onMoveTranslationMarkers(moves);
          for (const move of moves) activePartIds.set(move.markerId, move.targetPartId);
          return;
        }

        const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap, "translation");
        const nextPlacement = exactMarkerPlacement(initialStart + blockDeltaSeconds, initialDuration)
          ?? getMarkerPlacement(timeline, initialStart + blockDeltaSeconds, initialDuration, snapThresholdSeconds, false, { kind: "translation", partId: part.id, markerId: marker.id });
        onMoveTranslationMarker(activePartId, marker.id, nextPlacement.partId, nextPlacement.start);
        activePartId = nextPlacement.partId;
        return;
      }

      if (action === "start" || action === "end") {
        onUpdateTranslationMarkers(part.id, (_markers, currentPart) => resizeTimelineMarkersWithPush(initialTranslationMarkers, marker.id, action, deltaSeconds, currentPart.duration));
        return;
      }
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      pendingClientX = pointerEvent.clientX;
      pendingSnap = pointerEvent.shiftKey;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        applyDrag(pendingClientX, pendingSnap);
      });
    }

    function up(pointerEvent: globalThis.PointerEvent) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      applyDrag(pendingClientX, pointerEvent.shiftKey);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraggingTranslationMarkerId(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  const playheadColor = isScrubSnapActive ? "#37d6c2" : "var(--clipper-accent)";
  const playheadHalo = isScrubSnapActive ? "0 0 0 4px rgba(55,214,194,0.22)" : "0 0 0 4px rgb(var(--clipper-accent-rgb)/0.2)";

  return (
    <footer className="grid min-h-0 select-none grid-rows-[34px_minmax(0,1fr)] gap-3 border-t border-[#1d2028] bg-[#141821] px-[22px] pb-[18px] pt-3.5">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]">
        <div className="flex rounded-full border border-[#2d313b] bg-[#111319] p-1 normal-case tracking-normal" aria-label="Timeline mode">
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "edit" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("edit")}>Edit</button>
          <button className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${mode === "composition" ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]" : "text-[#9b9da7] hover:text-white"}`} onClick={() => onModeChange("composition")}>Direct</button>
        </div>
        <div className="h-px bg-[#2d313b]" />
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <span className="min-w-[54px] text-center text-[12px] text-[#dfe2ea] tabular-nums">{Math.round(timelineZoom * 100)}%</span>
          <input aria-label="Timeline zoom" className="h-2 w-[168px] accent-[#737884] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#474d5b] [&::-webkit-slider-thumb]:bg-[#9b9da7] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#474d5b] [&::-moz-range-thumb]:bg-[#9b9da7]" type="range" min={0.5} max={4} step={0.05} value={timelineZoom} onChange={(event) => updateTimelineZoom(Number(event.target.value))} />
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline out" onClick={() => updateTimelineZoom(roundTenth(timelineZoom - 0.25))}><Minus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[var(--clipper-accent)]" title="Zoom timeline in" onClick={() => updateTimelineZoom(roundTenth(timelineZoom + 0.25))}><Plus size={14} /></button>
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-[72px_minmax(0,1fr)] gap-x-4 overflow-hidden">
        <div className={`grid ${laneRows} pr-1`}>
          <div />
          {isCompositionMode ? <div className={`${mutedCaps} self-center`}>Pan</div> : null}
          {isCompositionMode ? <div className={`${mutedCaps} self-center`}>Zoom</div> : null}
          <div className={`${mutedCaps} self-center`}>Comp</div>
        </div>
        <div ref={timelineViewportRef} className="timeline-scrollbar min-h-0 overflow-x-scroll overflow-y-hidden px-3 [scrollbar-gutter:stable]" onScroll={saveTimelineDisplacement}>
          <div className={`grid ${laneRows}`} style={{ width: contentWidth }}>
            <div ref={timelineRef} className="relative h-[42px] pt-3.5 text-xs text-[#777b86] tabular-nums">
              <div className="absolute inset-x-0 top-0 z-20 h-[51px]" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub} />
              {ticks.map((tick) => {
                const isStart = tick === 0;
                const isEnd = tick === sceneDuration;
                const labelAlign = isStart ? "translate-x-0 text-left after:left-0" : isEnd ? "-translate-x-full text-right after:left-full" : "-translate-x-1/2 text-center after:left-1/2";
                return <span className={`absolute bottom-0 ${labelAlign} after:absolute after:bottom-[-9px] after:h-[7px] after:w-px after:bg-[#3a3f4d] after:content-['']`} key={tick} style={{ left: `${(tick / sceneDuration) * 100}%` }}>{formatTime(tick)}</span>;
              })}
              <div className="pointer-events-none absolute top-[20px] z-30 w-px" style={{ left: `${(currentSceneTime / sceneDuration) * 100}%`, height: playheadHeight, backgroundColor: playheadColor }}><div className="absolute left-1/2 top-[-10px] h-5 w-5 -translate-x-1/2 rounded-full" style={{ backgroundColor: playheadColor, boxShadow: playheadHalo }} /></div>
            </div>
            {isCompositionMode ? <div className="relative block overflow-hidden border border-[#2d313b] bg-[#111319] transition" onPointerDown={startTranslationSelection} onPointerMove={continueTranslationSelection} onPointerUp={endTranslationSelection} onPointerCancel={endTranslationSelection}>
              {draggingTranslationMarkerId ? timeline.slice(1).map((part) => <div className="pointer-events-none absolute top-0 z-20 h-full w-px origin-top bg-[rgb(var(--clipper-accent-rgb)/0.9)] shadow-[0_0_10px_rgb(var(--clipper-accent-rgb)/0.42)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`translation-boundary-${part.id}`} style={{ left: `${(part.start / sceneDuration) * 100}%` }} />) : null}
              {translationSelectionDrag ? <div className="pointer-events-none absolute top-[6px] z-10 h-[46px] rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.13)]" style={{ left: `${(clamp((Math.min(translationSelectionDrag.startX, translationSelectionDrag.currentX) - (timelineRef.current?.getBoundingClientRect().left ?? 0)) / (timelineRef.current?.getBoundingClientRect().width ?? 1), 0, 1)) * 100}%`, width: `${Math.abs(translationSelectionDrag.currentX - translationSelectionDrag.startX) / (timelineRef.current?.getBoundingClientRect().width ?? 1) * 100}%` }} /> : null}
              {timeline.flatMap((timelinePart) => timelinePart.translationMarkers.map((marker) => (
                <div data-timeline-control className={`absolute top-[11px] h-[34px] min-w-[18px] cursor-default overflow-hidden rounded-[11px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#24b7c9,#127c8d)] px-3 py-2 text-xs font-bold text-white ${marker.snapIn ? "rounded-l-none" : ""} ${marker.snapOut ? "rounded-r-none" : ""} ${selectedTranslationKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 outline-[var(--clipper-accent)]" : marker.id === selectedTranslationMarkerId && timelinePart.id === selectedTranslationMarkerPartId ? "opacity-100 outline outline-2 outline-[var(--clipper-accent)]" : "opacity-80"}`} key={`${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `${(marker.duration / sceneDuration) * 100}%` }} onClick={() => onSelectTranslationMarker(timelinePart.id, marker.id)} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "move")}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Pan {marker.position.x}, {marker.position.y}</span>
                  <div className={`absolute left-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapIn ? "bg-[#37d6c2]" : "rounded-l-[11px] bg-white/15"}`} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "start")} />
                  <div className={`absolute right-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapOut ? "bg-[#37d6c2]" : "rounded-r-[11px] bg-white/15"}`} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "end")} />
                </div>
              )))}
            </div> : null}
            {isCompositionMode ? <div className="relative block overflow-hidden border-x border-b border-[#2d313b] bg-[#111319] transition" onPointerDown={startZoomSelection} onPointerMove={continueZoomSelection} onPointerUp={endZoomSelection} onPointerCancel={endZoomSelection}>
              {draggingZoomMarkerId ? timeline.slice(1).map((part) => <div className="pointer-events-none absolute top-0 z-20 h-full w-px origin-top bg-[rgb(var(--clipper-accent-rgb)/0.9)] shadow-[0_0_10px_rgb(var(--clipper-accent-rgb)/0.42)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`zoom-boundary-${part.id}`} style={{ left: `${(part.start / sceneDuration) * 100}%` }} />) : null}
              {zoomSelectionDrag ? <div className="pointer-events-none absolute top-[6px] z-10 h-[46px] rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.13)]" style={{ left: `${(clamp((Math.min(zoomSelectionDrag.startX, zoomSelectionDrag.currentX) - (timelineRef.current?.getBoundingClientRect().left ?? 0)) / (timelineRef.current?.getBoundingClientRect().width ?? 1), 0, 1)) * 100}%`, width: `${Math.abs(zoomSelectionDrag.currentX - zoomSelectionDrag.startX) / (timelineRef.current?.getBoundingClientRect().width ?? 1) * 100}%` }} /> : null}
              {timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.map((marker) => (
                <div data-timeline-control className={`absolute top-[11px] h-[34px] min-w-[18px] cursor-default overflow-hidden rounded-[11px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#f0c95a,#b88312)] px-3 py-2 text-xs font-bold text-[#1a1202] ${marker.snapIn ? "rounded-l-none" : ""} ${marker.snapOut ? "rounded-r-none" : ""} ${selectedZoomKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 outline-[#37d6c2]" : marker.id === selectedZoomMarkerId && timelinePart.id === selectedZoomMarkerPartId ? "opacity-100 outline outline-2 outline-[#37d6c2]" : "opacity-85"}`} key={`${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `${(marker.duration / sceneDuration) * 100}%` }} onClick={() => onSelectZoomMarker(timelinePart.id, marker.id)} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "move")}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Zoom {marker.scale}x</span>
                  <div className={`absolute left-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapIn ? "bg-[#37d6c2]" : "rounded-l-[11px] bg-white/15"}`} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "start")} />
                  <div className={`absolute right-0 top-1 bottom-1 w-1 cursor-ew-resize ${marker.snapOut ? "bg-[#37d6c2]" : "rounded-r-[11px] bg-white/15"}`} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "end")} />
                </div>
              )))}
            </div> : null}
            <div className="relative flex h-[58px] overflow-visible border-x border-b border-[#2d313b] bg-[#111319] transition" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
              {timeline.map((item) => {
                const isEmptyPart = item.objects.length === 0 && item.background.elements.length === 0;
                return (
                  <button data-timeline-control draggable key={item.id} className={`relative flex min-w-[86px] cursor-default items-end justify-between gap-2 overflow-hidden ring-1 ring-inset ring-black/55 px-3 py-2 text-left text-[13px] leading-none before:absolute before:left-1/2 before:top-2 before:-translate-x-1/2 before:text-[12px] before:font-extrabold before:text-white/25 before:content-['Clip'] ${isEmptyPart ? "bg-[linear-gradient(180deg,#2b2d35,#191b21)] text-[#8c929f] opacity-75" : "bg-[linear-gradient(180deg,#38a86d,#17603c)] text-white"} ${item.id === selectedPartId && !selectedZoomMarkerId && !selectedTranslationMarkerId ? "z-20 opacity-100 outline outline-2 outline-[var(--clipper-accent)] shadow-[0_0_0_4px_rgb(var(--clipper-accent-rgb)/0.18)]" : ""}`} style={{ width: `${(item.duration / sceneDuration) * 100}%` }} onPointerDown={() => onSelectPart(item.id)} onClick={() => onSelectPart(item.id)} onDragStart={(event) => onPartDragStart(event, item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onPartDrop(event, item.id)} onDragEnd={() => setDraggedPartId(null)}>
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{item.name}</span><small className="shrink-0 text-[12px] font-extrabold text-white/80">{item.duration}s</small>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function centerOf(bounds: Bounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function getBackgroundLayerFillBounds(background: BackgroundLayer): Bounds {
  if (!background.stretchToElements || background.elements.length === 0) return { x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT };
  return getBoundsUnion([{ x: 0, y: 0, width: FRAME_WIDTH, height: FRAME_HEIGHT }, ...background.elements.map((element) => element.bounds)]);
}

function framePointToCameraTranslation(point: Point): Point {
  return {
    x: Math.round(FRAME_WIDTH / 2 - clamp(point.x, 0, FRAME_WIDTH)),
    y: Math.round(FRAME_HEIGHT / 2 - clamp(point.y, 0, FRAME_HEIGHT)),
  };
}

function cameraTranslationToFramePoint(position: Point): Point {
  return {
    x: Math.round(clamp(FRAME_WIDTH / 2 - position.x, 0, FRAME_WIDTH)),
    y: Math.round(clamp(FRAME_HEIGHT / 2 - position.y, 0, FRAME_HEIGHT)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function sanitizeProjectNumbers(value: unknown): unknown {
  if (typeof value === "number") return Number.isInteger(value) ? value : roundTwo(value);
  if (Array.isArray(value)) return value.map(sanitizeProjectNumbers);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeProjectNumbers(entry)]));
}

function getTopTimelineItemAtTime(timeline: TimelinePart[], time: number): { kind: "translation"; part: TimelinePart; marker: TranslationMarker } | { kind: "zoom"; part: TimelinePart; marker: ZoomMarker } | { kind: "part"; part: TimelinePart } | null {
  const timelinePart = getTimelinePartAtTime(timeline, time > 0 ? time - 0.000001 : time);
  if (!timelinePart) return null;
  const translationMarker = [...timelinePart.translationMarkers].reverse().find((marker) => isMarkerAtSceneTime(timelinePart, marker, time));
  if (translationMarker) return { kind: "translation", part: timelinePart, marker: translationMarker };
  const zoomMarker = [...timelinePart.zoomMarkers].reverse().find((marker) => isMarkerAtSceneTime(timelinePart, marker, time));
  if (zoomMarker) return { kind: "zoom", part: timelinePart, marker: zoomMarker };
  return { kind: "part", part: timelinePart };
}

function isMarkerAtSceneTime(part: TimelinePart, marker: { start: number; duration: number }, time: number) {
  const markerStart = part.start + marker.start;
  return time >= markerStart && time <= markerStart + marker.duration;
}

function updateAssetTree(items: AssetItem[], assetId: string, updater: (item: AssetItem) => AssetItem): AssetItem[] {
  return items.map((item) => {
    if (item.id === assetId) return updater(item);
    if (!item.children) return item;
    return { ...item, children: updateAssetTree(item.children, assetId, updater) };
  });
}

function getAssetPath(items: AssetItem[], assetId: string, basePath: string, parents: string[] = []): string | null {
  for (const item of items) {
    const path = [...parents, item.name];
    if (item.id === assetId) return item.path ?? [basePath, ...path].join("/");
    if (item.children) {
      const childPath = getAssetPath(item.children, assetId, basePath, path);
      if (childPath) return childPath;
    }
  }
  return null;
}

function getParentAssetId(items: AssetItem[], assetId: string, parentId: string | null = null): string | null {
  for (const item of items) {
    if (item.id === assetId) return parentId;
    if (item.children) {
      const foundParentId = getParentAssetId(item.children, assetId, item.id);
      if (foundParentId !== null) return foundParentId;
    }
  }
  return null;
}

function duplicateAssetTree(items: AssetItem[], assetId: string): AssetItem[] {
  return items.flatMap((item) => {
    const nextItem = item.children ? { ...item, children: duplicateAssetTree(item.children, assetId) } : item;
    if (item.id !== assetId) return [nextItem];
    return [nextItem, duplicateAssetItem(item)];
  });
}

function duplicateAssetItem(item: AssetItem): AssetItem {
  const suffix = Date.now().toString(36);
  return {
    ...item,
    id: `${item.id}_copy_${suffix}`,
    name: `${item.name} copy`,
    children: item.children?.map(duplicateAssetItem),
  };
}

function appendAssetsToFolder(items: AssetItem[], folderId: string, assets: AssetItem[]): AssetItem[] {
  return items.map((item) => {
    if (item.id === folderId && item.kind === "folder") return { ...item, children: [...(item.children ?? []), ...assets] };
    if (!item.children) return item;
    return { ...item, children: appendAssetsToFolder(item.children, folderId, assets) };
  });
}

function moveAssetTree(items: AssetItem[], sourceId: string, intent: AssetDropIntent): AssetItem[] {
  if (sourceId === intent.targetId || assetContainsId(items, sourceId, intent.targetId)) return items;

  const removed = removeAsset(items, sourceId);
  if (!removed.removed) return items;
  if (intent.action === "inside") return appendAssetsToFolder(removed.items, intent.targetId, [removed.removed]);

  const inserted = insertAssetNear(removed.items, intent.targetId, removed.removed, intent.action);
  return inserted.inserted ? inserted.items : [...inserted.items, removed.removed];
}

function sortAssetsInParent(items: AssetItem[], parentFolderId: string | null, mode: AssetSortMode): AssetItem[] {
  if (!parentFolderId) return sortAssetItems(items, mode);
  return items.map((item) => {
    if (item.id === parentFolderId && item.kind === "folder") return { ...item, children: sortAssetItems(item.children ?? [], mode) };
    if (!item.children) return item;
    return { ...item, children: sortAssetsInParent(item.children, parentFolderId, mode) };
  });
}

function sortAssetItems(items: AssetItem[], mode: AssetSortMode): AssetItem[] {
  return [...items].sort((a, b) => {
    if (mode === "folders-first" && a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    const comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    return mode === "name-desc" ? -comparison : comparison;
  });
}

function assetContainsId(items: AssetItem[], sourceId: string, targetId: string): boolean {
  const source = findAsset(items, sourceId);
  return source?.children ? Boolean(findAsset(source.children, targetId)) : false;
}

function findAsset(items: AssetItem[], assetId: string): AssetItem | null {
  for (const item of items) {
    if (item.id === assetId) return item;
    if (item.children) {
      const found = findAsset(item.children, assetId);
      if (found) return found;
    }
  }
  return null;
}

function removeAsset(items: AssetItem[], assetId: string): { items: AssetItem[]; removed: AssetItem | null } {
  let removed: AssetItem | null = null;
  const nextItems = items.flatMap((item) => {
    if (item.id === assetId) {
      removed = item;
      return [];
    }
    if (!item.children) return [item];
    const next = removeAsset(item.children, assetId);
    if (next.removed) removed = next.removed;
    return [{ ...item, children: next.items }];
  });
  return { items: nextItems, removed };
}

function insertAssetNear(items: AssetItem[], targetId: string, asset: AssetItem, action: "before" | "after"): { items: AssetItem[]; inserted: boolean } {
  const nextItems: AssetItem[] = [];
  let inserted = false;
  for (const item of items) {
    if (item.id === targetId && action === "before") {
      nextItems.push(asset);
      inserted = true;
    }
    if (item.children) {
      const next = insertAssetNear(item.children, targetId, asset, action);
      inserted = inserted || next.inserted;
      nextItems.push({ ...item, children: next.items });
    } else {
      nextItems.push(item);
    }
    if (item.id === targetId && action === "after") {
      nextItems.push(asset);
      inserted = true;
    }
  }
  return { items: nextItems, inserted };
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const expanded = /^#[0-9a-fA-F]{3}$/.test(trimmed) ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}` : trimmed;
  return /^#[0-9a-fA-F]{6}$/.test(expanded) ? expanded.toUpperCase() : "#000000";
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{3}$/.test(value.trim()) || /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function getEditableColorStyleEntries(style: Record<string, string | number>) {
  const colorKeys = new Set(["background", "backgroundColor", "color", "borderColor", "fill", "stroke"]);
  return Object.entries(style).flatMap(([key, value]) => (colorKeys.has(key) && typeof value === "string" && isHexColor(value) ? [[key, value] as [string, string]] : []));
}

function formatStyleLabel(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function hexToHsv(hex: string) {
  const normalized = normalizeHexColor(hex).slice(1);
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0 && max === r) h = 60 * (((g - b) / delta) % 6);
  if (delta !== 0 && max === g) h = 60 * ((b - r) / delta + 2);
  if (delta !== 0 && max === b) h = 60 * ((r - g) / delta + 4);
  return { h: Math.round(h < 0 ? h + 360 : h), s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function getTimelineTicks(duration: number) {
  const step = duration <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let cursor = 0; cursor <= duration; cursor += step) ticks.push(cursor);
  if (!ticks.includes(duration)) ticks.push(duration);
  return ticks;
}

function getTimelinePartAtTime(timeline: TimelinePart[], time: number) {
  if (timeline.length === 0) return null;
  if (time >= timeline[timeline.length - 1].end) return timeline[timeline.length - 1];

  let low = 0;
  let high = timeline.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const item = timeline[middle];
    if (time < item.start) high = middle - 1;
    else if (time >= item.end) low = middle + 1;
    else return item;
  }

  return timeline[0] ?? null;
}

function snapScrubTimeToBoundary(time: number, boundaries: number[], snapThresholdSeconds: number) {
  let nearest = time;
  let nearestDistance = snapThresholdSeconds;
  let low = 0;
  let high = boundaries.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle] < time) low = middle + 1;
    else high = middle - 1;
  }

  for (const boundary of [boundaries[high], boundaries[low]]) {
    if (boundary === undefined) continue;
    const distance = Math.abs(time - boundary);
    if (distance <= nearestDistance) {
      nearest = boundary;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function getScrubSnapBoundaries(timeline: TimelinePart[]) {
  return Array.from(new Set(timeline.flatMap((part) => [
    part.start,
    part.end,
    ...part.zoomMarkers.flatMap((marker) => [part.start + marker.start, part.start + marker.start + marker.duration]),
    ...part.translationMarkers.flatMap((marker) => [part.start + marker.start, part.start + marker.start + marker.duration]),
  ]))).sort((left, right) => left - right);
}

function getMarkerSnapBoundaries(timeline: TimelinePart[], exclude: { kind: "zoom" | "translation"; partId: string; markerId: string }) {
  return Array.from(new Set(timeline.flatMap((part) => [
    part.start,
    part.end,
    ...part.zoomMarkers.flatMap((marker) => (exclude.kind === "zoom" && part.id === exclude.partId && marker.id === exclude.markerId ? [] : [part.start + marker.start, part.start + marker.start + marker.duration])),
    ...part.translationMarkers.flatMap((marker) => (exclude.kind === "translation" && part.id === exclude.partId && marker.id === exclude.markerId ? [] : [part.start + marker.start, part.start + marker.start + marker.duration])),
  ]))).sort((left, right) => left - right);
}

function getMarkerPlacement(timeline: TimelinePart[], absoluteStart: number, duration: number, snapThresholdSeconds: number, snap: boolean, exclude: { kind: "zoom" | "translation"; partId: string; markerId: string }) {
  const sceneDuration = timeline.at(-1)?.end ?? 0;
  let snappedStart = clamp(absoluteStart, 0, Math.max(sceneDuration - duration, 0));

  if (snap) {
    for (const boundary of getMarkerSnapBoundaries(timeline, exclude)) {
      if (Math.abs(snappedStart - boundary) <= snapThresholdSeconds) snappedStart = boundary;
      if (Math.abs(snappedStart + duration - boundary) <= snapThresholdSeconds) snappedStart = boundary - duration;
    }
  }

  snappedStart = clamp(snappedStart, 0, Math.max(sceneDuration - duration, 0));
  const center = snappedStart + duration / 2;
  const targetPart = timeline.find((part) => duration <= part.duration && center >= part.start && center < part.end)
    ?? timeline.find((part) => duration <= part.duration && snappedStart >= part.start && snappedStart + duration <= part.end)
    ?? timeline.find((part) => duration <= part.duration)
    ?? timeline[0];

  if (!targetPart) return { partId: "", start: 0 };

  const partStart = clamp(snappedStart, targetPart.start, Math.max(targetPart.end - duration, targetPart.start));
  return { partId: targetPart.id, start: partStart - targetPart.start };
}

type TimelineMarkerDragItem = { partId: string; markerId: string; absoluteStart: number; duration: number; groupId?: string };

function uniqueTimelineDragItems(items: TimelineMarkerDragItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.partId}:${item.markerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getTimelineDragConstraintItems(items: Array<{ absoluteStart: number; duration: number; groupId?: string }>) {
  const groupedItems = new Map<string, Array<{ absoluteStart: number; duration: number }>>();
  const ungroupedItems: Array<{ absoluteStart: number; duration: number }> = [];

  for (const item of items) {
    if (!item.groupId) {
      ungroupedItems.push(item);
      continue;
    }
    groupedItems.set(item.groupId, [...(groupedItems.get(item.groupId) ?? []), item]);
  }

  return [
    ...ungroupedItems,
    ...Array.from(groupedItems.values()).map((groupItems) => {
      const absoluteStart = Math.min(...groupItems.map((item) => item.absoluteStart));
      const absoluteEnd = Math.max(...groupItems.map((item) => item.absoluteStart + item.duration));
      return { absoluteStart, duration: absoluteEnd - absoluteStart };
    }),
  ];
}

function getTimelineMarkerGapIntervals(timeline: TimelinePart[], kind: "zoom" | "translation", duration: number, absoluteStart: number, movingKeys: Set<string>) {
  return timeline.flatMap((timelinePart) => {
    if (duration > timelinePart.duration) return [];

    const blockers = (kind === "zoom" ? timelinePart.zoomMarkers : timelinePart.translationMarkers)
      .filter((marker) => !movingKeys.has(`${timelinePart.id}:${marker.id}`))
      .map((marker) => ({ start: timelinePart.start + marker.start, end: timelinePart.start + marker.start + marker.duration }))
      .sort((left, right) => left.start - right.start);
    const gaps: Array<{ start: number; end: number }> = [];
    let cursor = timelinePart.start;

    for (const blocker of blockers) {
      if (blocker.start - cursor >= duration) gaps.push({ start: cursor, end: blocker.start });
      cursor = Math.max(cursor, blocker.end);
    }

    if (timelinePart.end - cursor >= duration) gaps.push({ start: cursor, end: timelinePart.end });

    return gaps.map((gap) => ({ start: gap.start - absoluteStart, end: gap.end - duration - absoluteStart }));
  });
}

function getTimelineMarkerMoves(timeline: TimelinePart[], items: TimelineMarkerDragItem[], delta: number, kind: "zoom" | "translation", activePartIds: Map<string, string>, snapThresholdSeconds: number): TimelineMarkerMove[] {
  const groupedItems = new Map<string, TimelineMarkerDragItem[]>();
  const moves: TimelineMarkerMove[] = [];

  for (const item of items) {
    if (!item.groupId) {
      const nextPlacement = exactMarkerPlacementInTimeline(timeline, item.absoluteStart + delta, item.duration)
        ?? getMarkerPlacement(timeline, item.absoluteStart + delta, item.duration, snapThresholdSeconds, false, { kind, partId: item.partId, markerId: item.markerId });
      moves.push({ sourcePartId: activePartIds.get(item.markerId) ?? item.partId, markerId: item.markerId, targetPartId: nextPlacement.partId, start: nextPlacement.start });
      continue;
    }

    groupedItems.set(item.groupId, [...(groupedItems.get(item.groupId) ?? []), item]);
  }

  for (const groupItems of groupedItems.values()) {
    const groupStart = Math.min(...groupItems.map((item) => item.absoluteStart));
    const groupEnd = Math.max(...groupItems.map((item) => item.absoluteStart + item.duration));
    const groupDuration = groupEnd - groupStart;
    const firstItem = groupItems[0];
    const nextPlacement = exactMarkerPlacementInTimeline(timeline, groupStart + delta, groupDuration)
      ?? getMarkerPlacement(timeline, groupStart + delta, groupDuration, snapThresholdSeconds, false, { kind, partId: firstItem.partId, markerId: firstItem.markerId });

    for (const item of groupItems) {
      moves.push({
        sourcePartId: activePartIds.get(item.markerId) ?? item.partId,
        markerId: item.markerId,
        targetPartId: nextPlacement.partId,
        start: nextPlacement.start + item.absoluteStart - groupStart,
      });
    }
  }

  return moves;
}

function exactMarkerPlacementInTimeline(timeline: TimelinePart[], absoluteStart: number, duration: number) {
  const targetPart = timeline.find((timelinePart) => duration <= timelinePart.duration && absoluteStart >= timelinePart.start && absoluteStart + duration <= timelinePart.end);
  return targetPart ? { partId: targetPart.id, start: absoluteStart - targetPart.start } : null;
}

function getMendedMarkerDragItems(timeline: TimelinePart[], part: TimelinePart, markerId: string, kind: "zoom" | "translation"): TimelineMarkerDragItem[] {
  const markers = kind === "zoom" ? part.zoomMarkers : part.translationMarkers;
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((marker) => marker.id === markerId);
  if (markerIndex < 0) return [];

  let firstIndex = markerIndex;
  let lastIndex = markerIndex;

  while (firstIndex > 0) {
    const previous = sortedMarkers[firstIndex - 1];
    const current = sortedMarkers[firstIndex];
    if (!previous.snapOut || !current.snapIn || roundTenth(previous.start + previous.duration) !== roundTenth(current.start)) break;
    firstIndex -= 1;
  }

  while (lastIndex < sortedMarkers.length - 1) {
    const current = sortedMarkers[lastIndex];
    const next = sortedMarkers[lastIndex + 1];
    if (!current.snapOut || !next.snapIn || roundTenth(current.start + current.duration) !== roundTenth(next.start)) break;
    lastIndex += 1;
  }

  const groupId = firstIndex === lastIndex ? undefined : `${kind}:${part.id}:${sortedMarkers[firstIndex].id}:${sortedMarkers[lastIndex].id}`;

  return sortedMarkers.slice(firstIndex, lastIndex + 1).map((marker) => ({
    partId: part.id,
    markerId: marker.id,
    absoluteStart: part.start + marker.start,
    duration: marker.duration,
    groupId,
  }));
}

function roundTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function getAvailableZoomPlacement(markers: Array<{ start: number; duration: number }>, partDuration: number, preferredTime: number) {
  if (partDuration < minimumZoomDuration) return null;

  const occupied = [...markers].sort((left, right) => left.start - right.start);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const marker of occupied) {
    if (marker.start - cursor >= minimumZoomDuration) gaps.push({ start: cursor, end: marker.start });
    cursor = Math.max(cursor, marker.start + marker.duration);
  }

  if (partDuration - cursor >= minimumZoomDuration) gaps.push({ start: cursor, end: partDuration });

  const preferredStart = clamp(preferredTime - 0.5, 0, Math.max(partDuration - minimumZoomDuration, 0));
  let bestPlacement: { start: number; duration: number; distance: number } | null = null;

  for (const gap of gaps) {
    const gapDuration = gap.end - gap.start;
    const duration = Math.min(defaultZoomDuration, gapDuration);
    const start = clamp(preferredStart, gap.start, gap.end - duration);
    const end = start + duration;
    const distance = preferredTime >= start && preferredTime <= end ? 0 : Math.min(Math.abs(preferredTime - start), Math.abs(preferredTime - end));

    if (!bestPlacement || distance < bestPlacement.distance) bestPlacement = { start, duration, distance };
  }

  if (!bestPlacement) return null;
  return { start: roundTenth(bestPlacement.start), duration: roundTenth(bestPlacement.duration) };
}

function getZoomMiddleSnap(markers: Array<{ id: string; start: number; duration: number }>, preferredTime: number) {
  const time = roundTenth(preferredTime);
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const tolerance = 0.12;

  for (let index = 0; index < sortedMarkers.length - 1; index += 1) {
    const previous = sortedMarkers[index];
    const next = sortedMarkers[index + 1];
    const previousEnd = previous.start + previous.duration;
    const nextStart = next.start;

    if (previousEnd > nextStart) continue;
    if (time < previousEnd - tolerance || time > nextStart + tolerance) continue;

    const snapTime = roundTenth(clamp(time, previousEnd, nextStart));
    const previousDuration = snapTime - previous.start;
    const nextDuration = next.start + next.duration - snapTime;

    if (previousDuration >= minimumZoomDuration && nextDuration >= minimumZoomDuration) {
      return { pairs: [{ previousId: previous.id, nextId: next.id, time: snapTime }] };
    }
  }

  return null;
}

function getSelectedZoomMiddleSnap(markers: Array<{ id: string; start: number; duration: number }>, selectedMarkerIds: string[]) {
  if (selectedMarkerIds.length < 2) return null;

  const selectedIds = new Set(selectedMarkerIds);
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const selectedIndexes = sortedMarkers.map((marker, index) => (selectedIds.has(marker.id) ? index : -1)).filter((index) => index >= 0);
  const tolerance = 0.12;
  if (selectedIndexes.length !== selectedIds.size) return null;

  for (let index = 1; index < selectedIndexes.length; index += 1) {
    if (selectedIndexes[index] !== selectedIndexes[index - 1] + 1) return null;
  }

  const pairs: Array<{ previousId: string; nextId: string; time: number }> = [];

  for (let index = 0; index < selectedIndexes.length - 1; index += 1) {
    const previous = sortedMarkers[selectedIndexes[index]];
    const next = sortedMarkers[selectedIndexes[index + 1]];

    const previousEnd = previous.start + previous.duration;
    const nextStart = next.start;
    if (previousEnd > nextStart + tolerance) return null;

    const snapTime = roundTenth((previousEnd + nextStart) / 2);
    const previousDuration = snapTime - previous.start;
    const nextDuration = next.start + next.duration - snapTime;

    if (previousDuration >= minimumZoomDuration - tolerance && nextDuration >= minimumZoomDuration - tolerance) {
      pairs.push({ previousId: previous.id, nextId: next.id, time: snapTime });
    }
  }

  return pairs.length === selectedIndexes.length - 1 ? { pairs } : null;
}

function getSelectedActiveMiddleMend(markers: Array<{ id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>, selectedMarkerIds: string[]) {
  if (selectedMarkerIds.length === 0) return null;
  const selectedIds = new Set(selectedMarkerIds);
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const pairs: Array<{ previousId: string; nextId: string; time: number }> = [];

  for (let index = 0; index < sortedMarkers.length - 1; index += 1) {
    const previous = sortedMarkers[index];
    const next = sortedMarkers[index + 1];
    if (!selectedIds.has(previous.id) && !selectedIds.has(next.id)) continue;
    if (!previous.snapOut || !next.snapIn) continue;
    const time = roundTenth(previous.start + previous.duration);
    if (time !== roundTenth(next.start)) continue;
    pairs.push({ previousId: previous.id, nextId: next.id, time });
  }

  return pairs.length > 0 ? { pairs } : null;
}

function isZoomMiddleSnapActive(markers: Array<{ id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>, snap: { pairs: Array<{ previousId: string; nextId: string; time: number }> } | null) {
  if (!snap) return false;
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));

  return snap.pairs.every((pair) => {
    const previous = markersById.get(pair.previousId);
    const next = markersById.get(pair.nextId);
    if (!previous || !next) return false;
    return Boolean(previous.snapOut && next.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(next.start));
  });
}

function isZoomMarkerMended(markers: Array<{ id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>, markerId: string) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);

  for (let index = 0; index < sortedMarkers.length; index += 1) {
    const marker = sortedMarkers[index];
    if (marker.id !== markerId) continue;

    const previous = sortedMarkers[index - 1];
    const next = sortedMarkers[index + 1];
    const mendedToPrevious = Boolean(previous?.snapOut && marker.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(marker.start));
    const mendedToNext = Boolean(marker.snapOut && next?.snapIn && roundTenth(marker.start + marker.duration) === roundTenth(next.start));
    return mendedToPrevious || mendedToNext;
  }

  return false;
}

function getMendedMarkerIds(markers: Array<{ id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>, markerId: string) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((marker) => marker.id === markerId);
  if (markerIndex < 0) return new Set([markerId]);

  let firstIndex = markerIndex;
  let lastIndex = markerIndex;

  while (firstIndex > 0) {
    const previous = sortedMarkers[firstIndex - 1];
    const current = sortedMarkers[firstIndex];
    if (!previous.snapOut || !current.snapIn || roundTenth(previous.start + previous.duration) !== roundTenth(current.start)) break;
    firstIndex -= 1;
  }

  while (lastIndex < sortedMarkers.length - 1) {
    const current = sortedMarkers[lastIndex];
    const next = sortedMarkers[lastIndex + 1];
    if (!current.snapOut || !next.snapIn || roundTenth(current.start + current.duration) !== roundTenth(next.start)) break;
    lastIndex += 1;
  }

  return new Set(sortedMarkers.slice(firstIndex, lastIndex + 1).map((marker) => marker.id));
}

function resizeTimelineMarkersWithPush<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(markers: T[], markerId: string, action: "start" | "end", rawDelta: number, partDuration: number): T[] {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((marker) => marker.id === markerId);
  const targetMarker = sortedMarkers[markerIndex];
  if (!targetMarker) return markers;

  if (action === "end") {
    const minDelta = minimumZoomDuration - targetMarker.duration;
    let delta = Math.max(rawDelta, minDelta);
    let layout = layoutMarkersAfterEndResize(sortedMarkers, markerIndex, delta);
    if (layout.end > partDuration) {
      delta -= layout.end - partDuration;
      layout = layoutMarkersAfterEndResize(sortedMarkers, markerIndex, Math.max(delta, minDelta));
    }
    return applyMarkerBounds(markers, layout.bounds);
  }

  const maxDelta = targetMarker.duration - minimumZoomDuration;
  let delta = Math.min(rawDelta, maxDelta);
  let layout = layoutMarkersAfterStartResize(sortedMarkers, markerIndex, delta);
  if (layout.start < 0) {
    delta -= layout.start;
    layout = layoutMarkersAfterStartResize(sortedMarkers, markerIndex, Math.min(delta, maxDelta));
  }
  return applyMarkerBounds(markers, layout.bounds);
}

function layoutMarkersAfterEndResize<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(sortedMarkers: T[], markerIndex: number, delta: number) {
  const targetMarker = sortedMarkers[markerIndex];
  const bounds = new Map<string, { start: number; duration: number }>([[targetMarker.id, { start: targetMarker.start, duration: targetMarker.duration + delta }]]);
  let previousStart = targetMarker.start;
  let previousEnd = targetMarker.start + targetMarker.duration + delta;

  for (let index = markerIndex + 1; index < sortedMarkers.length; index += 1) {
    const previous = sortedMarkers[index - 1];
    const current = sortedMarkers[index];
    const mended = Boolean(previous.snapOut && current.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(current.start));
    const nextStart = mended || current.start < previousEnd ? previousEnd : current.start;
    bounds.set(current.id, { start: nextStart, duration: current.duration });
    previousStart = nextStart;
    previousEnd = nextStart + current.duration;

    if (!mended && nextStart === current.start) break;
  }

  return { bounds, end: Math.max(previousEnd, previousStart) };
}

function layoutMarkersAfterStartResize<T extends { id: string; start: number; duration: number; snapIn?: boolean; snapOut?: boolean }>(sortedMarkers: T[], markerIndex: number, delta: number) {
  const targetMarker = sortedMarkers[markerIndex];
  const bounds = new Map<string, { start: number; duration: number }>([[targetMarker.id, { start: targetMarker.start + delta, duration: targetMarker.duration - delta }]]);
  let nextStart = targetMarker.start + delta;

  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const current = sortedMarkers[index];
    const next = sortedMarkers[index + 1];
    const mended = Boolean(current.snapOut && next.snapIn && roundTenth(current.start + current.duration) === roundTenth(next.start));
    const currentEnd = current.start + current.duration;
    const currentStart = mended || currentEnd > nextStart ? nextStart - current.duration : current.start;
    bounds.set(current.id, { start: currentStart, duration: current.duration });
    nextStart = currentStart;

    if (!mended && currentStart === current.start) break;
  }

  return { bounds, start: nextStart };
}

function applyMarkerBounds<T extends { id: string; start: number; duration: number }>(markers: T[], bounds: Map<string, { start: number; duration: number }>): T[] {
  return markers.map((marker) => {
    const nextBounds = bounds.get(marker.id);
    return nextBounds ? { ...marker, start: nextBounds.start, duration: nextBounds.duration } : marker;
  });
}

function normalizeMendedZoomMarkerFocus(markers: ZoomMarker[]) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const focusById = new Map<string, Point>();
  let sharedFocus: Point | null = null;

  for (let index = 0; index < sortedMarkers.length; index += 1) {
    const marker = sortedMarkers[index];
    const previous = sortedMarkers[index - 1];
    const mendedToPrevious = Boolean(previous?.snapOut && marker.snapIn && roundTenth(previous.start + previous.duration) === roundTenth(marker.start));
    if (!mendedToPrevious) sharedFocus = marker.focus;
    if (sharedFocus) focusById.set(marker.id, sharedFocus);
  }

  return markers.map((marker) => {
    if (!isZoomMarkerMended(markers, marker.id)) return marker;
    const focus = focusById.get(marker.id);
    return focus && (marker.focus.x !== focus.x || marker.focus.y !== focus.y) ? { ...marker, focus } : marker;
  });
}

function getMiddleTransitionMode(markers: Array<{ id: string; middleTransition?: "transition" }>, snap: { pairs: Array<{ nextId: string }> } | null): "instant" | "transition" {
  if (!snap) return "instant";
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  return snap.pairs.every((pair) => markersById.get(pair.nextId)?.middleTransition === "transition") ? "transition" : "instant";
}

function truncateMiddle(value: string, maxLength = 34) {
  if (value.length <= maxLength) return value;
  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(value.length - edgeLength)}`;
}

function slugifyFileName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "clipper-export";
}

function downloadTextFile(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadBlobFile(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function renderPartFrameToCanvas(part: Part, previewTime: number, activeZoom: ZoomMarker | null, activeTranslation: TranslationMarker | null) {
  const svg = buildFrameSvg(part, previewTime, activeZoom, activeTranslation);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to render frame SVG."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function nextAnimationFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function buildFrameSvg(part: Part, previewTime: number, activeZoom: ZoomMarker | null, activeTranslation: TranslationMarker | null) {
  const scale = activeZoom?.scale ?? 1;
  const focus = activeZoom?.focus ?? { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 };
  const x = (FRAME_WIDTH / 2 - focus.x) * (scale - 1) + (activeTranslation?.position.x ?? 0);
  const y = (FRAME_HEIGHT / 2 - focus.y) * (scale - 1) + (activeTranslation?.position.y ?? 0);
  const cameraStyle = `position:absolute;inset:0;transform-origin:center;transform:translate(${x}px,${y}px) scale(${scale});`;
  const frameStyle = cssStyle({ ...part.frame.style, position: "relative", width: FRAME_WIDTH, height: FRAME_HEIGHT, overflow: "hidden" });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" viewBox="0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="${frameStyle}"><div style="${cameraStyle}">${backgroundLayerHtml(part.background, previewTime)}${part.objects.map((object) => frameObjectHtml(object, previewTime)).join("")}</div></div></foreignObject></svg>`;
}

function backgroundLayerHtml(background: BackgroundLayer, previewTime: number) {
  const layerStyle = cssStyle({ position: "absolute", inset: 0, overflow: background.stretchToElements ? "visible" : "hidden", ...getMotionPreviewAnimation(background.motion, previewTime) });
  const fillBounds = getBackgroundLayerFillBounds(background);
  const fillStyle = cssStyle({ position: "absolute", ...background.style, left: fillBounds.x, top: fillBounds.y, width: fillBounds.width, height: fillBounds.height });
  return `<div style="${layerStyle}"><div style="${fillStyle}"></div>${background.elements.map((element) => frameObjectHtml(element, previewTime)).join("")}</div>`;
}

function frameObjectHtml(object: FrameObject, previewTime: number) {
  const animation = getObjectPreviewAnimation(object, previewTime);
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : "";
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : "";
  const content = animation.content ?? object.content ?? "";
  const style = cssStyle({
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    overflow: "hidden",
    whiteSpace: "pre-line",
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...animation.style,
    transform: `${animationTransform || objectTransform}`.trim() || undefined,
  });

  if (object.type === "text") return `<div style="${style}">${richTextHtml(getRenderableTextSegments(content, animation.content ? undefined : object.richText), Boolean(!animation.content && object.richText))}</div>`;
  return `<div style="${style}">${escapeHtml(content)}</div>`;
}

function richTextHtml(segments: RichTextSegment[], explicitFormatting: boolean) {
  return segments.map((segment) => escapeHtml(segment.text).replace(/\n/g, "<br />").replace(/^(.+)$/s, `<span style="${cssStyle({ ...inlineTextSegmentStyle(segment, explicitFormatting) })}">$1</span>`)).join("");
}

function cssStyle(style: Record<string, unknown>) {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${camelToKebab(key)}:${cssValue(key, value)};`)
    .join("");
}

function cssValue(key: string, value: unknown) {
  if (typeof value !== "number") return escapeHtml(String(value));
  if (unitlessCssProperties.has(key)) return String(value);
  return `${value}px`;
}

const unitlessCssProperties = new Set(["fontWeight", "lineHeight", "opacity", "zIndex", "flex", "flexGrow", "flexShrink", "order"]);

function camelToKebab(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getObjectPreviewAnimation(object: FrameObject, time: number): { style: CSSProperties; content?: string } {
  if (object.motion) {
    return { style: getMotionPreviewAnimation(object.motion, time) };
  }

  if (object.id === "hero-title") {
    const progress = easeOutCubic(clamp(time / 0.9, 0, 1));
    return {
      style: {
        opacity: progress,
        transform: `translateY(${Math.round((1 - progress) * 46)}px)`,
      },
    };
  }

  if (object.id === "hero-panel") {
    const progress = easeOutCubic(clamp((time - 0.45) / 1.25, 0, 1));
    const drift = Math.sin(Math.max(time - 1.7, 0) * 1.8) * 10;
    return {
      style: {
        opacity: clamp((time - 0.25) / 0.45, 0, 1),
        transform: `translateY(${Math.round((1 - progress) * -72 + drift)}px) rotate(${(-3 + progress * 3).toFixed(2)}deg)`,
      },
    };
  }

  if (object.id === "object-rule" && object.content) {
    const progress = clamp((time - 1.15) / 2.1, 0, 1);
    const visibleCharacters = Math.floor(object.content.length * progress);
    const cursor = progress < 1 && Math.floor(time * 4) % 2 === 0 ? "|" : "";
    return {
      content: `${object.content.slice(0, visibleCharacters)}${cursor}`,
      style: { opacity: time < 1.05 ? 0 : 1 },
    };
  }

  if (object.id === "inspector-card") {
    const progress = easeOutCubic(clamp((time - 0.6) / 0.6, 0, 1));
    return {
      style: {
        opacity: progress,
        transform: `translateX(${Math.round((1 - progress) * 60)}px)`,
      },
    };
  }

  if (object.id === "selector-box-demo") {
    const progress = clamp((time - 1) / 1, 0, 1);
    return {
      style: {
        opacity: progress,
        transform: `scale(${(0.98 + progress * 0.02).toFixed(3)})`,
      },
    };
  }

  return { style: {} };
}

function getMotionPreviewAnimation(motion: FrameObject["motion"] | BackgroundLayer["motion"] | undefined, time: number): CSSProperties {
  if (!motion) return {};
  const delay = motion.delay ?? 0;
  const elapsed = Math.max(time - delay, 0);
  const cycleTime = motion.loop && motion.duration > 0 ? elapsed % motion.duration : elapsed;
  const progress = easeProgress(clamp(cycleTime / motion.duration, 0, 1), motion.ease);
  const transforms: string[] = [];

  if (motion.x) transforms.push(`translateX(${Math.round(interpolate(motion.x, progress))}px)`);
  if (motion.y) transforms.push(`translateY(${Math.round(interpolate(motion.y, progress))}px)`);
  if (motion.rotate) transforms.push(`rotate(${interpolate(motion.rotate, progress).toFixed(2)}deg)`);

  return {
    opacity: motion.opacity ? interpolate(motion.opacity, progress) : undefined,
    transform: transforms.length > 0 ? transforms.join(" ") : undefined,
  };
}

function interpolate(range: readonly [number, number], progress: number) {
  return range[0] + (range[1] - range[0]) * progress;
}

function easeProgress(value: number, ease: MotionEase | undefined) {
  if (ease === "easeOut" || ease === "circOut") return easeOutCubic(value);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return easeInOutCubic(value);
  return value;
}

function cameraEaseProgress(value: number, ease: MotionEase | undefined) {
  return easeProgress(value, ease ?? "easeInOut");
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getActiveZoom(markers: ZoomMarker[], time: number) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((item) => time >= item.start && time <= item.start + item.duration);
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const middleTransitionFrom = marker.middleTransition === "transition" && marker.snapIn && previousMarker?.snapOut && roundTenth(previousMarker.start + previousMarker.duration) === roundTenth(marker.start)
    ? previousMarker
    : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(clamp(progress / 0.22, 0, 1), marker.middleEase);
    const scale = interpolate([middleTransitionFrom.scale, marker.scale] as const, easedIn);
    const focus = {
      x: Math.round(interpolate([middleTransitionFrom.focus.x, marker.focus.x] as const, easedIn)),
      y: Math.round(interpolate([middleTransitionFrom.focus.y, marker.focus.y] as const, easedIn)),
    };
    if (marker.snapOut) return { ...marker, focus, scale };
    const rampOut = cameraEaseProgress(clamp((1 - progress) / 0.22, 0, 1), marker.ease);
    return { ...marker, focus, scale: 1 + (scale - 1) * rampOut };
  }
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return { ...marker, scale: 1 + (marker.scale - 1) * eased };
}

function getActiveTranslation(markers: TranslationMarker[], time: number) {
  const sortedMarkers = [...markers].sort((left, right) => left.start - right.start);
  const markerIndex = sortedMarkers.findIndex((item) => time >= item.start && time <= item.start + item.duration);
  const marker = markerIndex >= 0 ? sortedMarkers[markerIndex] : null;
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const previousMarker = sortedMarkers[markerIndex - 1];
  const middleTransitionFrom = marker.middleTransition === "transition" && marker.snapIn && previousMarker?.snapOut && roundTenth(previousMarker.start + previousMarker.duration) === roundTenth(marker.start)
    ? previousMarker.position
    : null;
  if (middleTransitionFrom) {
    const easedIn = cameraEaseProgress(clamp(progress / 0.22, 0, 1), marker.middleEase);
    const position = {
      x: Math.round(interpolate([middleTransitionFrom.x, marker.position.x] as const, easedIn)),
      y: Math.round(interpolate([middleTransitionFrom.y, marker.position.y] as const, easedIn)),
    };
    if (marker.snapOut) return { ...marker, position };
    const rampOut = cameraEaseProgress(clamp((1 - progress) / 0.22, 0, 1), marker.ease);
    return { ...marker, position: { x: Math.round(position.x * rampOut), y: Math.round(position.y * rampOut) } };
  }
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = cameraEaseProgress(clamp(ramp, 0, 1), marker.ease);
  return { ...marker, position: { x: Math.round(marker.position.x * eased), y: Math.round(marker.position.y * eased) } };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
