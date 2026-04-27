import { Crosshair, Magnet, Minus, Plus, Pause, Play, RotateCcw, Scissors, Signpost, SkipBack, SkipForward, StepBack, StepForward, Trash2 } from "lucide-react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactElement } from "react";
import toast, { Toaster } from "react-hot-toast";
import partApiSource from "../clipper/projects/part-api.ts?raw";
import { Input } from "./components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { createAgentContext } from "./core/agentContext";
import { boundsToPoints, createSelectionPayload, framePointFromClient, normalizeBounds } from "./core/geometry";
import { partFromSource } from "./core/partSource";
import { buildLinearTimeline, formatTime, updatePartObject, validateScene } from "./core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, MAX_PART_DURATION_SECONDS, type BackgroundLayer, type Bounds, type FrameObject, type MotionEase, type Part, type PartFrame, type Point, type ProjectManifest, type SelectionPayload, type TimelinePart, type TimelineViewportState, type TranslationMarker, type ZoomMarker } from "./core/types";
import { sampleProject } from "./sampleProject";

type Mode = "interactive" | "code";
type ProjectUpdater = ProjectManifest | ((current: ProjectManifest) => ProjectManifest);

const projectManifestPath = `clipper/projects/${sampleProject.id}/project.json`;

async function readTextFile(relativePath: string) {
  if (window.clipper) return window.clipper.readTextFile(relativePath);

  const response = await fetch(`/__clipper_fs/read?path=${encodeURIComponent(relativePath)}`);
  if (!response.ok) throw new Error(await response.text() || "Unable to load part file.");
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

  if (!response.ok) throw new Error(await response.text() || "Unable to save part file.");
}

const frameScale = 0.42;
const appDragRegion = "[-webkit-app-region:drag] select-none";
const appNoDragRegion = "[-webkit-app-region:no-drag]";
const buttonBase = "rounded-[8px] border border-transparent bg-[#171920] px-2.5 py-1.5 text-sm text-[#f7f7f8] transition hover:-translate-y-px hover:border-[#3b4150] hover:bg-[#20232c]";
const saveButtonEnabled = "rounded-[8px] border border-[#7bd9ff] bg-[#0099ff] px-2.5 py-1.5 text-sm font-extrabold text-[#00131f] transition hover:bg-[#2bb0ff]";
const saveButtonDisabled = "cursor-not-allowed rounded-[8px] border border-[#2d313b] bg-[#171920] px-2.5 py-1.5 text-sm font-extrabold text-[#737884] opacity-70";
const defaultZoomDuration = 2.2;
const minimumZoomDuration = 1;
const defaultTimelinePixelsPerSecond = 126;
const maxProjectHistoryActions = 1000;
const projectHistoryCoalesceMs = 700;
const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
const sectionTitle = "m-0 text-[11px] font-semibold uppercase tracking-[0.11em] text-[#d9dbe1]";
const mutedCaps = "text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]";
const panelCard = "grid gap-[5px] rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-[13px] text-[#dfe2ea]";
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
const zoomPresets: Array<{ label: string; description: string; scale: ZoomMarker["scale"]; focus: Point; duration: number }> = [
  { label: "Gentle Center", description: "1.5x middle frame", scale: 1.5, focus: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, duration: 2.4 },
  { label: "Hero Push", description: "1.8x upper focus", scale: 1.8, focus: { x: FRAME_WIDTH / 2, y: Math.round(FRAME_HEIGHT * 0.42) }, duration: 2.6 },
  { label: "Left Detail", description: "2.2x left third", scale: 2.2, focus: { x: Math.round(FRAME_WIDTH * 0.34), y: FRAME_HEIGHT / 2 }, duration: 2.2 },
  { label: "Close Detail", description: "3.5x tight focus", scale: 3.5, focus: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2 }, duration: 1.8 },
];

function saveButtonClass(enabled: boolean) {
  return enabled ? saveButtonEnabled : saveButtonDisabled;
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

  return {
    ...project,
    editorState: {
      ...project.editorState,
      timeline: {
        displacement: Math.max(timelineState.displacement, 0),
        zoom: Math.min(Math.max(timelineState.zoom, 0.5), 4),
      },
    },
    scenes: project.scenes.map((scene) => ({
      ...scene,
      parts: scene.parts.map((part) => ({
        ...part,
        zoomMarkers: part.zoomMarkers ?? [],
        translationMarkers: part.translationMarkers ?? [],
      })),
    })),
  };
}

type ObjectDrag = {
  origin: Point;
  objects: SelectionPayload["objects"];
};

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
  const [project, setProject] = useState(sampleProject);
  const [savedProjectSnapshot, setSavedProjectSnapshot] = useState(() => JSON.stringify(sampleProject));
  const [hasUnsavedCodeChanges, setHasUnsavedCodeChanges] = useState(false);
  const [mode, setMode] = useState<Mode>("interactive");
  const [selectedSceneId, setSelectedSceneId] = useState(project.scenes[0].id);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedZoomMarker, setSelectedZoomMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectedZoomMarkers, setSelectedZoomMarkers] = useState<ZoomMarkerSelection[]>([]);
  const [focusPickZoomMarker, setFocusPickZoomMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectedTranslationMarker, setSelectedTranslationMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectedTranslationMarkers, setSelectedTranslationMarkers] = useState<TranslationMarkerSelection[]>([]);
  const [positionPickTranslationMarker, setPositionPickTranslationMarker] = useState<{ partId: string; markerId: string } | null>(null);
  const [selectionPayload, setSelectionPayload] = useState<SelectionPayload | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragBox, setDragBox] = useState<Bounds | null>(null);
  const [objectDrag, setObjectDrag] = useState<ObjectDrag | null>(null);
  const [currentSceneTime, setCurrentSceneTime] = useState(2.6);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubSnapEnabled, setScrubSnapEnabled] = useState(false);
  const [fastSelectEnabled, setFastSelectEnabled] = useState(false);
  const [sourceStatus, setSourceStatus] = useState("Loading TypeScript part sources...");
  const cameraRef = useRef<HTMLDivElement | null>(null);
  const frameViewportRef = useRef<HTMLDivElement | null>(null);
  const projectRef = useRef(project);
  const projectHistoryRef = useRef<{ past: ProjectManifest[]; future: ProjectManifest[] }>({ past: [], future: [] });
  const lastProjectHistoryAtRef = useRef(0);
  const saveActiveCodeRef = useRef<(() => Promise<boolean>) | null>(null);
  const saveAllChangesRef = useRef<(() => Promise<void>) | null>(null);

  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
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
  const selectedFrameObjectIds = useMemo(() => new Set(selectionPayload?.objects.map((object) => object.id) ?? []), [selectionPayload]);
  const validationErrors = useMemo(() => validateScene(scene), [scene]);
  const agentContext = useMemo(() => createAgentContext(project, scene, part, selectionPayload), [project, scene, part, selectionPayload]);
  const projectSnapshot = useMemo(() => JSON.stringify(project), [project]);
  const hasUnsavedProjectChanges = projectSnapshot !== savedProjectSnapshot;
  const hasUnsavedChanges = hasUnsavedProjectChanges || hasUnsavedCodeChanges;
  const isPickingZoomFocus = Boolean(focusPickZoomMarker);
  const isPickingTranslationPosition = Boolean(positionPickTranslationMarker);
  const activeZoom = isPickingZoomFocus ? null : getActiveZoom(part.zoomMarkers, previewTime);
  const activeTranslation = isPickingTranslationPosition ? null : getActiveTranslation(part.translationMarkers, previewTime);
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
  const selectedZoomMiddleSnap = getSelectedZoomMiddleSnap(part.zoomMarkers, currentPartSelectedZoomIds);
  const selectedZoomPartMiddleSnap = selectedZoomPart ? getSelectedZoomMiddleSnap(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds) : null;
  const selectedZoomPartMiddleSnapActive = selectedZoomPart ? isZoomMiddleSnapActive(selectedZoomPart.zoomMarkers, selectedZoomPartMiddleSnap) : false;
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
  const selectedTranslationMiddleSnap = getSelectedZoomMiddleSnap(part.translationMarkers, currentPartSelectedTranslationIds);
  const selectedTranslationPartMiddleSnap = selectedTranslationPart ? getSelectedZoomMiddleSnap(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds) : null;
  const selectedTranslationPartMiddleSnapActive = selectedTranslationPart ? isZoomMiddleSnapActive(selectedTranslationPart.translationMarkers, selectedTranslationPartMiddleSnap) : false;
  const translationMiddleSnap = selectedTranslationMiddleSnap ?? getZoomMiddleSnap(part.translationMarkers, previewTime);
  const inspectorTranslationMiddleSnap = selectedTranslationPartMiddleSnap ?? (selectedTranslationPart?.id === part.id ? translationMiddleSnap : null);
  const registerActiveCodeSave = useCallback((save: () => Promise<boolean>) => {
    saveActiveCodeRef.current = save;
  }, []);

  function replaceProject(nextProject: ProjectManifest, options: { history?: boolean } = {}) {
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
  }

  function updateProject(updater: ProjectUpdater, options?: { history?: boolean }) {
    const nextProject = typeof updater === "function" ? updater(projectRef.current) : updater;
    replaceProject(nextProject, options);
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
    projectRef.current = previousProject;
    setProject(previousProject);
  }

  function redoProjectChange() {
    const nextProject = projectHistoryRef.current.future[0];
    if (!nextProject) return;

    projectHistoryRef.current = {
      past: [...projectHistoryRef.current.past, projectRef.current].slice(-maxProjectHistoryActions),
      future: projectHistoryRef.current.future.slice(1),
    };
    lastProjectHistoryAtRef.current = 0;
    projectRef.current = nextProject;
    setProject(nextProject);
  }

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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
      resetProjectHistory();
      replaceProject(sampleProject, { history: false });
      setSavedProjectSnapshot(JSON.stringify(sampleProject));
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
    if (!fastSelectEnabled) return;

    const timelinePart = timeline.find((item) => currentSceneTime >= item.start && currentSceneTime <= item.end);
      if (!timelinePart) {
        setSelectedPartId("");
        clearMarkerSelection();
        return;
      }

    const zoomMarker = timelinePart.zoomMarkers.find((marker) => {
      const markerStart = timelinePart.start + marker.start;
      const markerEnd = markerStart + marker.duration;
      return currentSceneTime >= markerStart && currentSceneTime <= markerEnd;
    });

    if (zoomMarker) {
      setSelectedPartId(timelinePart.id);
      setSelectedZoomMarker({ partId: timelinePart.id, markerId: zoomMarker.id });
      setSelectedZoomMarkers([{ partId: timelinePart.id, markerId: zoomMarker.id }]);
      setSelectedTranslationMarker(null);
      setSelectedTranslationMarkers([]);
      setSelectedObjectId(null);
      setSelectionPayload(null);
      return;
    }

    const translationMarker = timelinePart.translationMarkers.find((marker) => {
      const markerStart = timelinePart.start + marker.start;
      const markerEnd = markerStart + marker.duration;
      return currentSceneTime >= markerStart && currentSceneTime <= markerEnd;
    });

    if (translationMarker) {
      setSelectedPartId(timelinePart.id);
      setSelectedTranslationMarker({ partId: timelinePart.id, markerId: translationMarker.id });
      setSelectedTranslationMarkers([{ partId: timelinePart.id, markerId: translationMarker.id }]);
      setSelectedZoomMarker(null);
      setSelectedZoomMarkers([]);
      setSelectedObjectId(null);
      setSelectionPayload(null);
      return;
    }

    setSelectedPartId(timelinePart.id);
    clearMarkerSelection();
    setSelectedObjectId(null);
    setSelectionPayload(null);
  }, [currentSceneTime, fastSelectEnabled, timeline]);

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
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void saveAllChangesRef.current?.();
        return;
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

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
        },
      };
      return nextProject;
    }, { history: false });
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

  function updatePartFrame(updater: (frame: PartFrame) => PartFrame) {
    updateCurrentPart({ ...part, frame: updater(part.frame) });
  }

  function updatePartBackground(updater: (background: BackgroundLayer) => BackgroundLayer) {
    updateCurrentPart({ ...part, background: updater(part.background) });
  }

  function clearMarkerSelection() {
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
  }

  function clearNodeSelection() {
    setSelectedPartId("");
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
  }

  async function updatePartFromSource(basePart: Part, source: string) {
    const nextPart = await partFromSource(basePart, source);
    const nextProject = replacePartInProject(projectRef.current, basePart.id, (currentPart) => ({
      ...nextPart,
      zoomMarkers: currentPart.zoomMarkers,
      translationMarkers: currentPart.translationMarkers,
      snapshot: currentPart.snapshot,
    }));

    updateProject(nextProject);

    setSourceStatus(`Preview refreshed from ${nextPart.filePath}.`);
  }

  async function saveProject(projectToSave = projectRef.current) {
    const snapshot = JSON.stringify(projectToSave);

    try {
      await writeTextFile(projectManifestPath, `${JSON.stringify(projectToSave, null, 2)}\n`);
      setSavedProjectSnapshot(snapshot);
      setSourceStatus(`Project saved to ${projectManifestPath}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save project.");
    }
  }

  async function saveAllChanges() {
    if (!hasUnsavedChanges) return;

    const codeSaved = await saveActiveCodeRef.current?.();
    if (codeSaved === false) {
      toast.error("Fix the code editor error before saving the project.");
      return;
    }

    await saveProject(projectRef.current);
  }

  useEffect(() => {
    saveAllChangesRef.current = saveAllChanges;
  });

  function selectPart(partId: string) {
    const nextPart = timeline.find((item) => item.id === partId);
    setSelectedPartId(partId);
    setSelectedObjectId(null);
    clearMarkerSelection();
    setSelectionPayload(null);
    setCurrentSceneTime(nextPart?.start ?? currentSceneTime);
    setIsPlaying(false);
  }

  function selectZoomMarker(partId: string, markerId: string) {
    const timelinePart = timeline.find((item) => item.id === partId);
    const marker = timelinePart?.zoomMarkers.find((item) => item.id === markerId);
    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (timelinePart && marker) setCurrentSceneTime(timelinePart.start + marker.start);
  }

  function selectZoomMarkers(selection: ZoomMarkerSelection[]) {
    setSelectedZoomMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    const timelinePart = timeline.find((item) => item.id === primarySelection?.partId);
    const marker = timelinePart?.zoomMarkers.find((item) => item.id === primarySelection?.markerId);
    setSelectedZoomMarker(primarySelection);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setIsPlaying(false);
    if (primarySelection) setSelectedPartId(primarySelection.partId);
    if (timelinePart && marker) setCurrentSceneTime(timelinePart.start + marker.start);
  }

  function startZoomFocusPick(partId: string, markerId: string) {
    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setFocusPickZoomMarker({ partId, markerId });
  }

  function selectTranslationMarker(partId: string, markerId: string) {
    const timelinePart = timeline.find((item) => item.id === partId);
    const marker = timelinePart?.translationMarkers.find((item) => item.id === markerId);
    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (timelinePart && marker) setCurrentSceneTime(timelinePart.start + marker.start);
  }

  function selectTranslationMarkers(selection: TranslationMarkerSelection[]) {
    setSelectedTranslationMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    const timelinePart = timeline.find((item) => item.id === primarySelection?.partId);
    const marker = timelinePart?.translationMarkers.find((item) => item.id === primarySelection?.markerId);
    setSelectedTranslationMarker(primarySelection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (primarySelection) setSelectedPartId(primarySelection.partId);
    if (timelinePart && marker) setCurrentSceneTime(timelinePart.start + marker.start);
  }

  function startTranslationPositionPick(partId: string, markerId: string) {
    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    setPositionPickTranslationMarker({ partId, markerId });
  }

  function scrubToSceneTime(time: number) {
    setCurrentSceneTime(clamp(time, 0, sceneDurationSeconds));
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

  function resizeBlankPart(partId: string, duration: number) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId || item.kind !== "blank") return item;
      return { ...item, duration: roundTenth(clamp(duration, 0.2, MAX_PART_DURATION_SECONDS)) };
    }));
  }

  function updateZoomMarker(partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) {
    updateSceneParts((parts) => parts.map((item) => {
      if (item.id !== partId) return item;
      return { ...item, zoomMarkers: item.zoomMarkers.map((marker) => (marker.id === markerId ? updater(marker, item) : marker)) };
    }));
  }

  function updateSelectedZoomSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    const selectedIdsByPart = new Map<string, Set<string>>();
    for (const selection of selectedZoomMarkers) {
      selectedIdsByPart.set(selection.partId, (selectedIdsByPart.get(selection.partId) ?? new Set()).add(selection.markerId));
    }

    updateSceneParts((parts) => parts.map((item) => {
      const selectedIds = selectedIdsByPart.get(item.id);
      if (!selectedIds) return item;
      return { ...item, zoomMarkers: item.zoomMarkers.map((marker) => (selectedIds.has(marker.id) ? { ...marker, [key]: enabled || undefined } : marker)) };
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
      toast.error("No room for another 1s translation marker.");
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
    const snap = getSelectedZoomMiddleSnap(targetPart.zoomMarkers, targetPartSelectedZoomIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.zoomMarkers, previewTime) : null);
    if (!snap) return;
    const middleSnapActive = isZoomMiddleSnapActive(targetPart.zoomMarkers, snap);
    const selectedIds = new Set(targetPartSelectedZoomIds);
    const nextSelection = snap.pairs.length > 1
      ? targetPart.zoomMarkers.filter((marker) => selectedIds.has(marker.id)).map((marker) => ({ partId: targetPart.id, markerId: marker.id }))
      : [{ partId: targetPart.id, markerId: snap.pairs[0].previousId }, { partId: targetPart.id, markerId: snap.pairs[0].nextId }];
    const nextBounds = new Map(targetPart.zoomMarkers.map((marker) => [marker.id, { start: marker.start, end: marker.start + marker.duration, snapIn: marker.snapIn, snapOut: marker.snapOut }]));

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
          return { ...marker, start: roundTenth(bounds.start), duration: roundTenth(bounds.end - bounds.start), snapIn: bounds.snapIn, snapOut: bounds.snapOut };
        }),
      };
    }));
    setSelectedZoomMarker(nextSelection.at(-1) ?? null);
    setSelectedZoomMarkers(nextSelection);
  }

  function snapTranslationMiddle(targetPart = part) {
    const targetPartSelectedTranslationIds = selectedTranslationMarkers.filter((selection) => selection.partId === targetPart.id).map((selection) => selection.markerId);
    const snap = getSelectedZoomMiddleSnap(targetPart.translationMarkers, targetPartSelectedTranslationIds) ?? (targetPart.id === part.id ? getZoomMiddleSnap(targetPart.translationMarkers, previewTime) : null);
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

  function onFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mode !== "interactive" || !cameraRef.current || objectDrag) return;
    if (focusPickZoomMarker) {
      startFramePickDrag(event);
      return;
    }
    if (positionPickTranslationMarker) {
      startFramePickDrag(event);
      return;
    }
    if ((event.target as HTMLElement).dataset.objectId) return;
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
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
    if (focusPickZoomMarker) updateZoomFocusFromPointer(event);
    if (positionPickTranslationMarker) updateTranslationPositionFromPointer(event);
  }

  function updateZoomFocusFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!focusPickZoomMarker || !frameViewportRef.current) return;
    const point = framePointFromClient(event.nativeEvent, frameViewportRef.current);
    updateZoomMarker(focusPickZoomMarker.partId, focusPickZoomMarker.markerId, (marker) => ({
      ...marker,
      focus: { x: Math.round(clamp(point.x, 0, FRAME_WIDTH)), y: Math.round(clamp(point.y, 0, FRAME_HEIGHT)) },
    }));
  }

  function updateTranslationPositionFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (!positionPickTranslationMarker || !frameViewportRef.current) return;
    const point = framePointFromClient(event.nativeEvent, frameViewportRef.current);
    updateTranslationMarker(positionPickTranslationMarker.partId, positionPickTranslationMarker.markerId, (marker) => ({
      ...marker,
      position: framePointToCameraTranslation(point),
    }));
  }

  function stopFramePickDrag() {
    if (focusPickZoomMarker) setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
  }

  function onFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (focusPickZoomMarker || positionPickTranslationMarker) {
      updateFramePickFromPointer(event);
      return;
    }

    if (objectDrag) {
      const dx = (event.clientX - objectDrag.origin.x) / (frameScale * zoomScale);
      const dy = (event.clientY - objectDrag.origin.y) / (frameScale * zoomScale);
      const nextObjects = objectDrag.objects.map((object) => ({
        ...object,
        bounds: {
          ...object.bounds,
          x: Math.round(clamp(object.bounds.x + dx, -object.bounds.width, FRAME_WIDTH)),
          y: Math.round(clamp(object.bounds.y + dy, -object.bounds.height, FRAME_HEIGHT)),
        },
      }));
      const nextBoundsById = new Map(nextObjects.map((object) => [object.id, object.bounds]));
      const selectionBox = getBoundsUnion(nextObjects.map((object) => object.bounds));

      updateSceneParts((parts) => parts.map((item) => {
        if (item.id !== part.id) return item;
        return {
          ...item,
          objects: item.objects.map((object) => {
            const nextBounds = nextBoundsById.get(object.id);
            return nextBounds ? { ...object, bounds: nextBounds } : object;
          }),
        };
      }));
      setSelectionPayload({ selectionBox, coordinates: boundsToPoints(selectionBox), objects: nextObjects });
      return;
    }

    if (!dragStart) return;
    const point = framePointFromClient(event.nativeEvent, event.currentTarget);
    setDragBox(normalizeBounds(dragStart, point));
  }

  function onFramePointerUp() {
    if (focusPickZoomMarker || positionPickTranslationMarker) {
      stopFramePickDrag();
      return;
    }

    if (objectDrag) {
      setObjectDrag(null);
      return;
    }

    if (!dragBox) return;
    const payload = createSelectionPayload(dragBox, part.objects);
    if (payload.objects.length === 0) {
      clearNodeSelection();
    } else {
      setSelectionPayload(payload);
      setSelectedObjectId(payload.objects[0]?.id ?? null);
    }
    clearMarkerSelection();
    setDragStart(null);
    setDragBox(null);
  }

  function onFramePointerCancel() {
    if (focusPickZoomMarker || positionPickTranslationMarker) stopFramePickDrag();
    setObjectDrag(null);
    setDragStart(null);
    setDragBox(null);
  }

  function startObjectDrag(event: PointerEvent<HTMLDivElement>, object: FrameObject) {
    if (mode !== "interactive") return;
    if (focusPickZoomMarker || positionPickTranslationMarker) return;
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
    setObjectDrag({ origin: { x: event.clientX, y: event.clientY }, objects: nextSelectionObjects });
  }

  return (
    <TooltipProvider delayDuration={650} skipDelayDuration={250}>
    <main className="grid h-screen grid-rows-[64px_minmax(0,1fr)_340px] bg-[#08090c] text-[#f7f7f8]">
      <header className={`${appDragRegion} grid grid-cols-[220px_1fr_360px] items-center gap-[18px] border-b border-[#2d313b] bg-[rgba(12,13,17,0.98)] px-[22px]`}>
        <div />
        <div className="justify-self-center text-center leading-[1.15]">
          <strong className="block text-[15px] font-bold">{project.name}</strong>
          <span className="text-xs text-[#9b9da7]">{scene.name} / {part.name}</span>
        </div>
        <div className={`${appNoDragRegion} flex justify-end gap-2.5`}>
          <button className={buttonBase}>Presets</button>
          <button className={buttonBase}>Preview</button>
          <button className={saveButtonClass(hasUnsavedChanges)} disabled={!hasUnsavedChanges} title="Save every project, timeline, inspector, and active code change (Ctrl+S or Cmd+S)" onClick={() => void saveAllChanges()}>Save</button>
          <button className={`${buttonBase} border-[#6d55ff] bg-[#5a3fff] font-bold`}>Export</button>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[286px_minmax(640px,1fr)_350px] border-b border-[#2d313b]">
        <aside className="min-h-0 overflow-auto border-r border-[#2d313b] bg-[#101116] p-4">
          <div className="mb-[18px] grid gap-1.5 rounded-[14px] border border-[#2d313b] bg-[linear-gradient(145deg,rgba(0,153,255,0.16),rgba(255,255,255,0.03))] p-3.5">
            <span className={mutedCaps}>Clipper v0.1</span>
            <strong className="text-lg font-bold tracking-[-0.03em]">Motion Workspace</strong>
          </div>
          <section className="mb-5 grid gap-2.5">
            <h2 className={sectionTitle}>Project</h2>
            <div className={panelCard}><span className={mutedCaps}>Frame</span><strong className="overflow-anywhere text-[13px]">{FRAME_WIDTH} x {FRAME_HEIGHT}</strong></div>
            <div className={`${panelCard} min-w-0`}><span className={mutedCaps}>Assets</span><strong className="min-w-0 overflow-hidden whitespace-nowrap text-[13px]" title={project.assetsPath}>{truncateMiddle(project.assetsPath)}</strong></div>
          </section>
          <section className="mb-5 grid gap-2.5">
            <h2 className={sectionTitle}>Scenes</h2>
            {project.scenes.map((item) => (
              <button className={`flex w-full items-center justify-between gap-3 rounded-[10px] border px-2.5 py-2 text-left text-sm ${item.id === scene.id ? "border-[#0099ff] bg-[rgba(0,153,255,0.14)]" : "border-[#2d313b] bg-[#15171e]"}`} key={item.id} onClick={() => setSelectedSceneId(item.id)}>
                <span>{item.name}</span><small className="text-[#9b9da7]">{formatTime(timeline.at(-1)?.end ?? 0)}</small>
              </button>
            ))}
          </section>
          <section className="mt-2.5 mb-5 grid gap-2.5">
            <h2 className={sectionTitle}>Tools</h2>
            <button className={`${buttonBase} w-full border-[#0099ff] text-left text-[#dff3ff]`}>Select / Move</button>
            <button className={`${buttonBase} w-full text-left`} onClick={addZoomMarker}>Add Zoom Marker</button>
            <button className={`${buttonBase} w-full text-left`} onClick={addTranslationMarker}>Add Translation Marker</button>
            {zoomMiddleSnap ? <button className={`${buttonBase} w-full border-[#7bd9ff] text-left text-[#dff3ff]`} title="Snap the neighboring zoom edges to the playhead" onClick={() => snapZoomMiddle()}>Snap Middle</button> : null}
            <button className={`${buttonBase} w-full text-left`}>Snapshot</button>
          </section>
        </aside>

        <section className="grid min-h-0 min-w-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[radial-gradient(circle_at_50%_45%,rgba(0,153,255,0.12),transparent_30%),#090a0d]">
          <div className="flex items-center justify-between gap-5 border-b border-[#2d313b] px-[18px]">
            <div className="flex rounded-[10px] border border-[#2d313b] bg-[#15171e] p-0.5" aria-label="Editor mode">
              <button className={`rounded-[8px] px-2.5 py-1.5 text-sm ${mode === "interactive" ? "bg-[#0099ff] font-extrabold text-[#00131f]" : "bg-transparent text-[#9b9da7]"}`} onClick={() => setMode("interactive")}>Interactive</button>
              <button className={`rounded-[8px] px-2.5 py-1.5 text-sm ${mode === "code" ? "bg-[#0099ff] font-extrabold text-[#00131f]" : "bg-transparent text-[#9b9da7]"}`} onClick={() => setMode("code")}>Code</button>
            </div>
            <div className="flex gap-2.5">
              <button className={buttonBase}>Auto Fit</button>
              <button className={buttonBase}>Crop</button>
              <button className={buttonBase} onClick={addZoomMarker}>Zoom</button>
              <button className={buttonBase} onClick={addTranslationMarker}>Translate</button>
              {zoomMiddleSnap ? <button className={`${buttonBase} border-[#7bd9ff] text-[#dff3ff]`} title="Snap the neighboring zoom edges to the playhead" onClick={() => snapZoomMiddle()}>Snap Middle</button> : null}
            </div>
          </div>

          <div className={`grid min-h-0 overflow-hidden ${mode === "interactive" ? "place-items-center p-[22px]" : "items-stretch"}`}>
            {mode === "interactive" ? (
              <div className="grid gap-3">
                <div className="flex items-baseline justify-between text-[#dfe2ea]"><span className={mutedCaps}>Fixed Frame</span><strong className="text-[13px]">{FRAME_WIDTH} x {FRAME_HEIGHT}</strong></div>
                <div ref={frameViewportRef} className={`relative h-[454px] w-[806px] overflow-hidden border-2 border-[rgba(0,153,255,0.86)] bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${isPickingZoomFocus || isPickingTranslationPosition ? "cursor-crosshair ring-2 ring-[#37d6c2]" : ""}`} onPointerDownCapture={onFramePointerDownCapture} onPointerDown={onFramePointerDown} onPointerMove={onFramePointerMove} onPointerUp={onFramePointerUp} onPointerCancel={onFramePointerCancel}>
                  <div className="absolute left-0 top-0 origin-top-left overflow-hidden" style={{ ...part.frame.style, width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${frameScale})` }}>
                    <div className="absolute inset-0 origin-center" ref={cameraRef}>
                      <BackgroundLayerView background={part.background} previewTime={previewTime} />
                      {part.kind === "blank" ? <div className="relative z-10 grid h-full w-full place-items-center text-[52px] tracking-[-0.04em] text-[#555]">Blank spacer part</div> : part.objects.map((object) => (
                        <FrameObjectView key={object.id} object={object} focusPicking={isPickingZoomFocus || isPickingTranslationPosition} previewTime={previewTime} selected={object.id === selectedObjectId || selectedFrameObjectIds.has(object.id)} onPointerDown={(event) => startObjectDrag(event, object)} />
                      ))}
                    </div>
                  </div>
                  {dragBox ? <SelectionBox bounds={dragBox} /> : null}
                </div>
              </div>
            ) : (
              <CodePane part={part} onDirtyChange={setHasUnsavedCodeChanges} onRegisterSave={registerActiveCodeSave} onSaveAll={saveAllChanges} onSourceSaved={(source) => updatePartFromSource(part, source)} />
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-[#2d313b] bg-[#0d0f14] px-7">
            <span className="justify-self-start text-[#9b9da7] tabular-nums">{formatTime(currentSceneTime)}</span>
            <div className="flex items-center justify-center gap-3">
              <QuickAccessTooltip name="Jump to start" description="Move the scrubber to the first frame of the scene." shortcut="Home"><button aria-label="Jump to start" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToStart}><SkipBack size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Back one second" description="Move the scrubber back by one second." shortcut="Left Arrow"><button aria-label="Back one second" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={() => stepSceneTime(-1)}><StepBack size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name={isPlaying ? "Pause" : "Play"} description={isPlaying ? "Pause timeline playback." : "Start timeline playback from the scrubber."} shortcut="Space"><button aria-label={isPlaying ? "Pause" : "Play"} className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[#1d212b] text-[#e9e9ec] hover:bg-[#252a36]" onClick={() => setIsPlaying((current) => !current)}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button></QuickAccessTooltip>
              <QuickAccessTooltip name="Next part" description="Jump the scrubber to the start of the next part." shortcut="Right Arrow"><button aria-label="Next part" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToNextPart}><StepForward size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Jump to end" description="Move the scrubber to the end of the scene." shortcut="End"><button aria-label="Jump to end" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToEnd}><SkipForward size={17} /></button></QuickAccessTooltip>
            </div>
            <div className="flex items-center justify-end gap-3">
              <QuickAccessTooltip name="Cut" description="Pause playback and prepare the current point for a cut action." shortcut="C"><button aria-label="Cut" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={() => setIsPlaying(false)}><Scissors size={17} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Magnetic scrub" description="Snap scrubbing to part, zoom, and translation edges. Hold Shift for a temporary snap." shortcut="M"><button aria-label="Magnetic scrub" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${scrubSnapEnabled ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={scrubSnapEnabled} onClick={() => setScrubSnapEnabled((current) => !current)}><Magnet size={16} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Snap selector" description="Select the timeline item currently under the scrubber as you move." shortcut="S"><button aria-label="Snap selector" className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${fastSelectEnabled ? "bg-[#37d6c2] text-[#031311] shadow-[0_0_0_4px_rgba(55,214,194,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`} aria-pressed={fastSelectEnabled} onClick={() => setFastSelectEnabled((current) => !current)}><Signpost size={16} /></button></QuickAccessTooltip>
              <QuickAccessTooltip name="Replay" description="Return the scrubber to the beginning of the scene." shortcut="R"><button aria-label="Replay from start" className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]" onClick={jumpToStart}><RotateCcw size={16} /></button></QuickAccessTooltip>
            </div>
          </div>
        </section>

        <aside className="min-h-0 overflow-auto border-l border-[#2d313b] bg-[#13151c] p-4">
          <section className="mb-3 grid gap-2.5">
            <h2 className={sectionTitle}>Inspector</h2>
             <div className="grid grid-cols-3 gap-1"><button className="rounded-[8px] bg-[#272b36] px-2 py-1.5 text-sm text-white">Video</button><button className="rounded-[8px] bg-[#191c24] px-2 py-1.5 text-sm text-[#9b9da7]">Motion</button><button className="rounded-[8px] bg-[#191c24] px-2 py-1.5 text-sm text-[#9b9da7]">Agent</button></div>
          </section>
          <section className="mb-5 grid gap-2.5">
            {selectedZoom && selectedZoomPart ? <ZoomInspector marker={selectedZoom} part={selectedZoomPart} selectedMarkerCount={selectedZoomSnapMarkers.length} selectedSnapInActive={selectedZoomSnapInActive} selectedSnapOutActive={selectedZoomSnapOutActive} middleSnapActive={selectedZoomPartMiddleSnapActive} pickingFocus={focusPickZoomMarker?.partId === selectedZoomPart.id && focusPickZoomMarker.markerId === selectedZoom.id} canSnapMiddle={Boolean(inspectorZoomMiddleSnap)} onChange={(updater) => updateZoomMarker(selectedZoomPart.id, selectedZoom.id, updater)} onChangeSelectedSnap={updateSelectedZoomSnap} onDelete={() => deleteZoomMarker(selectedZoomPart.id, selectedZoom.id)} onPickFocus={() => startZoomFocusPick(selectedZoomPart.id, selectedZoom.id)} onSnapMiddle={() => snapZoomMiddle(selectedZoomPart)} /> : selectedTranslation && selectedTranslationPart ? <TranslationInspector marker={selectedTranslation} part={selectedTranslationPart} selectedMarkerCount={selectedTranslationSnapMarkers.length} selectedSnapInActive={selectedTranslationSnapInActive} selectedSnapOutActive={selectedTranslationSnapOutActive} middleSnapActive={selectedTranslationPartMiddleSnapActive} pickingPosition={positionPickTranslationMarker?.partId === selectedTranslationPart.id && positionPickTranslationMarker.markerId === selectedTranslation.id} canSnapMiddle={Boolean(inspectorTranslationMiddleSnap)} onChange={(updater) => updateTranslationMarker(selectedTranslationPart.id, selectedTranslation.id, updater)} onChangeSelectedSnap={updateSelectedTranslationSnap} onDelete={() => deleteTranslationMarker(selectedTranslationPart.id, selectedTranslation.id)} onPickPosition={() => startTranslationPositionPick(selectedTranslationPart.id, selectedTranslation.id)} onSnapMiddle={() => snapTranslationMiddle(selectedTranslationPart)} /> : selectedObject ? <ObjectInspector object={selectedObject} onChange={updateSelectedObject} /> : selectedPart ? <FrameInspector part={selectedPart} onFrameChange={updatePartFrame} onBackgroundChange={updatePartBackground} /> : <EmptyInspector />}
          </section>
          <section className="mb-5 grid gap-2.5">
            <h2 className={sectionTitle}>Snapshot</h2>
            {part.snapshot.map((line) => <div className="grid grid-cols-[48px_1fr] gap-2.5 rounded-[11px] border border-[#2d313b] bg-[#171920] p-2.5 text-xs" key={`${part.id}-${line.at}`}><strong className="text-[#0099ff] tabular-nums">{line.at}</strong><span className="text-[#cfd2db]">{line.description}</span></div>)}
          </section>
          <section className="mb-5 grid gap-2.5">
            <h2 className={sectionTitle}>Agent Context</h2>
            <div className="rounded-xl border border-[#2d313b] bg-[#08090c] p-3 text-xs text-[#9b9da7]">{sourceStatus}</div>
            <pre className="m-0 max-h-[210px] overflow-auto rounded-xl border border-[#2d313b] bg-[#08090c] p-3 text-[11px] leading-normal text-[#d9ecff]">{JSON.stringify(agentContext, null, 2)}</pre>
          </section>
          {validationErrors.length > 0 ? <section className="mb-5 grid gap-2.5 text-[#ffbf66]"><h2 className={sectionTitle}>Validation</h2>{validationErrors.map((error) => <p key={error}>{error}</p>)}</section> : null}
        </aside>
      </section>

      <TimelinePanel
        currentSceneTime={currentSceneTime}
        scrubSnapEnabled={scrubSnapEnabled}
        sceneDuration={sceneDurationSeconds}
        selectedPartId={selectedPartId}
        selectedZoomMarkerPartId={selectedZoomMarker?.partId ?? null}
        selectedZoomMarkerId={selectedZoomMarker?.markerId ?? null}
        selectedZoomMarkers={selectedZoomMarkers}
        selectedTranslationMarkerPartId={selectedTranslationMarker?.partId ?? null}
        selectedTranslationMarkerId={selectedTranslationMarker?.markerId ?? null}
        selectedTranslationMarkers={selectedTranslationMarkers}
        timelineViewportState={project.editorState?.timeline ?? defaultTimelineViewportState}
        timeline={timeline}
        onTimelineViewportStateChange={updateTimelineViewportState}
        onSelectPart={selectPart}
        onSelectZoomMarker={selectZoomMarker}
        onSelectZoomMarkers={selectZoomMarkers}
        onSelectTranslationMarker={selectTranslationMarker}
        onSelectTranslationMarkers={selectTranslationMarkers}
        onReorderPart={reorderPart}
        onResizeBlankPart={resizeBlankPart}
        onMoveZoomMarker={moveZoomMarker}
        onMoveZoomMarkers={moveZoomMarkers}
        onMoveTranslationMarker={moveTranslationMarker}
        onMoveTranslationMarkers={moveTranslationMarkers}
        onScrub={scrubToSceneTime}
        onClearNodeSelection={clearNodeSelection}
        onUpdateZoomMarker={updateZoomMarker}
        onUpdateTranslationMarker={updateTranslationMarker}
      />
    </main>
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

function FrameObjectView({ object, selected, focusPicking, previewTime, onPointerDown }: { object: FrameObject; selected: boolean; focusPicking: boolean; previewTime: number; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void }) {
  const animation = getObjectPreviewAnimation(object, previewTime);
  const style = {
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...animation.style,
  } as CSSProperties;
  const content = animation.content ?? object.content;

  return (
    <div className={`absolute flex touch-none select-none flex-col justify-center overflow-hidden whitespace-pre-line transition-[outline,filter] duration-150 ${focusPicking ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"} ${selected ? "outline-[5px] outline-[#0099ff] saturate-[1.18]" : ""}`} data-object-id={object.id} style={style} onPointerDown={onPointerDown}>
      {object.type === "text" ? content?.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}</span>) : null}
      {object.type !== "text" && content ? content : null}
      {selected ? <><div className="absolute -left-px -top-px bg-[#0099ff] px-2.5 py-2 text-lg font-extrabold text-[#00131f]">{object.id}</div><div className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-1.5 text-sm uppercase tracking-[0.08em] text-white">move</div></> : null}
    </div>
  );
}

function SelectionBox({ bounds }: { bounds: Bounds }) {
  return <div className="pointer-events-none absolute border-2 border-dashed border-[#0099ff] bg-[rgba(0,153,255,0.14)]" style={{ left: bounds.x * frameScale, top: bounds.y * frameScale, width: bounds.width * frameScale, height: bounds.height * frameScale }} />;
}

function QuickAccessTooltip({ name, description, shortcut, children }: { name: string; description: string; shortcut: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align="center">
        <span className="flex items-center justify-between gap-3">
          <strong className="block text-[11px] font-bold text-[#f7f7f8]">{name}</strong>
          <kbd className="rounded-[5px] border border-[#3b4150] bg-[#08090c] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#dfe2ea]">{shortcut}</kbd>
        </span>
        <span className="mt-1 block text-[10px] text-[#9b9da7]">{description}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function BackgroundLayerView({ background, previewTime }: { background: BackgroundLayer; previewTime: number }) {
  const style = {
    ...background.style,
    ...getMotionPreviewAnimation(background.motion, previewTime),
  } as CSSProperties;

  return (
    <div className="pointer-events-none absolute inset-0" data-layer-id={background.id} style={style}>
      {background.elements.map((element) => <BackgroundElementView element={element} key={element.id} previewTime={previewTime} />)}
    </div>
  );
}

function BackgroundElementView({ element, previewTime }: { element: FrameObject; previewTime: number }) {
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

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-hidden whitespace-pre-line" data-background-element-id={element.id} style={style}>
      {element.type === "text" ? content?.split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}</span>) : null}
      {element.type !== "text" && content ? content : null}
    </div>
  );
}

function FrameInspector({ part, onFrameChange, onBackgroundChange }: { part: Part; onFrameChange: (updater: (frame: PartFrame) => PartFrame) => void; onBackgroundChange: (updater: (background: BackgroundLayer) => BackgroundLayer) => void }) {
  function updateFrameBackground(value: string) {
    onFrameChange((frame) => ({ ...frame, style: { ...frame.style, background: value } }));
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
      <div className={panelCard}><span>Selected Part</span><strong className="break-words text-[13px]">{part.name}</strong><small className="break-words text-[#9b9da7]">Frame and background layers</small></div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Frame BG Color<Input value={String(part.frame.style.background ?? "")} onChange={(event) => updateFrameBackground(event.target.value)} /></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background Style JSON<Textarea className="min-h-[120px] resize-y font-mono normal-case tracking-normal" value={JSON.stringify(part.background.style, null, 2)} onChange={(event) => updateBackgroundStyle(event.target.value)} /></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background Motion JSON<Textarea className="min-h-[92px] resize-y font-mono normal-case tracking-normal" value={part.background.motion ? JSON.stringify(part.background.motion, null, 2) : ""} onChange={(event) => updateBackgroundMotion(event.target.value)} /></label>
      <div className={panelCard}><span>Constant Elements</span><strong className="text-[13px]">{part.background.elements.length}</strong><small className="text-[#9b9da7]">Edit these in the part code as background.elements.</small></div>
    </div>
  );
}

function ObjectInspector({ object, onChange }: { object: FrameObject; onChange: (updater: (object: FrameObject) => FrameObject) => void }) {
  function updateBounds(key: keyof Bounds, value: string) {
    onChange((current) => ({ ...current, bounds: { ...current.bounds, [key]: Number(value) || 0 } }));
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
      <div className={panelCard}><span>Selected Object</span><strong className="break-words text-[13px]">{object.name}</strong><small className="break-words text-[#9b9da7]">{object.selector}</small></div>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{key}<Input type="number" value={object.bounds[key]} onChange={(event) => updateBounds(key, event.target.value)} /></label>)}
      </div>
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

function ZoomInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, pickingFocus, canSnapMiddle, onChange, onChangeSelectedSnap, onDelete, onPickFocus, onSnapMiddle }: { marker: ZoomMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; pickingFocus: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: ZoomMarker, part: Part) => ZoomMarker) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onDelete: () => void; onPickFocus: () => void; onSnapMiddle: () => void }) {
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

  function updateFocus(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => ({ ...current, focus: { ...current.focus, [key]: Math.round(clamp(numeric, 0, key === "x" ? FRAME_WIDTH : FRAME_HEIGHT)) } }));
  }

  function updateScale(value: string) {
    onChange((current) => ({ ...current, scale: Number(value) as ZoomMarker["scale"] }));
  }

  function updateSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    if (isMultiSelection) {
      onChangeSelectedSnap(key, enabled);
      return;
    }

    onChange((current) => ({ ...current, [key]: enabled || undefined }));
  }

  function snapButtonClass(active: boolean, enabled = true) {
    if (active) return "rounded-[10px] border border-[#7bd9ff] bg-[rgba(123,217,255,0.12)] px-3 py-2.5 text-center text-xs font-bold text-[#dff3ff] transition hover:bg-[rgba(123,217,255,0.18)]";
    return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[#7bd9ff] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
  }

  function applyPreset(preset: (typeof zoomPresets)[number]) {
    onChange((current, currentPart) => ({
      ...current,
      duration: roundTenth(clamp(preset.duration, minimumZoomDuration, currentPart.duration - current.start)),
      focus: preset.focus,
      scale: preset.scale,
    }));
  }

  return (
    <div className="grid gap-3">
      <div className={panelCard}>
        <span>Selected Zoom</span>
        <strong className="break-words text-[13px]">Zoom {marker.scale}x</strong>
        <small className="break-words text-[#9b9da7]">Contained in {part.name}</small>
      </div>
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
      <label className={`grid gap-1.5 ${mutedCaps}`}>Scale<Select value={String(marker.scale)} onValueChange={updateScale}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{([1.25, 1.5, 1.8, 2.2, 3.5, 5] as const).map((scale) => <SelectItem key={scale} value={String(scale)}>{scale}x</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Clear the neighboring middle snap" : "Snap the neighboring zoom edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>Middle</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
      </div>
      <div className="grid gap-2">
        <span className={mutedCaps}>Smooth ease presets</span>
        <div className="grid grid-cols-2 gap-2">
          {zoomPresets.map((preset) => (
            <button className="rounded-[10px] border border-[#2d313b] bg-[#171920] p-2.5 text-left transition hover:border-[#0099ff] hover:bg-[#20232c]" key={preset.label} onClick={() => applyPreset(preset)}>
              <strong className="block text-[12px] text-[#f7f7f8]">{preset.label}</strong>
              <span className="mt-1 block text-[11px] text-[#9b9da7]">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

function TranslationInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, pickingPosition, canSnapMiddle, onChange, onChangeSelectedSnap, onDelete, onPickPosition, onSnapMiddle }: { marker: TranslationMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; pickingPosition: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: TranslationMarker, part: Part) => TranslationMarker) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onDelete: () => void; onPickPosition: () => void; onSnapMiddle: () => void }) {
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

  function updateSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    if (isMultiSelection) {
      onChangeSelectedSnap(key, enabled);
      return;
    }

    onChange((current) => ({ ...current, [key]: enabled || undefined }));
  }

  function snapButtonClass(active: boolean, enabled = true) {
    if (active) return "rounded-[10px] border border-[#7bd9ff] bg-[rgba(123,217,255,0.12)] px-3 py-2.5 text-center text-xs font-bold text-[#dff3ff] transition hover:bg-[rgba(123,217,255,0.18)]";
    return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[#7bd9ff] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
  }

  return (
    <div className="grid gap-3">
      <div className={panelCard}>
        <span>Selected Translation</span>
        <strong className="break-words text-[13px]">Translate {marker.position.x}, {marker.position.y}</strong>
        <small className="break-words text-[#9b9da7]">Contained in {part.name}</small>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>X<Input type="number" step={1} value={marker.position.x} onChange={(event) => updatePosition("x", event.target.value)} /></label>
        <div className="grid gap-1.5">
          <span className={mutedCaps}>Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" step={1} value={marker.position.y} onChange={(event) => updatePosition("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${pickingPosition ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick camera target from frame" onClick={onPickPosition}><Crosshair size={16} /></button>
          </div>
        </div>
      </div>
      <div className={panelCard}>
        <span>Screen Target</span>
        <small className="break-words text-[#9b9da7]">Picking a point translates the camera so that point moves to frame center.</small>
      </div>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Clear the neighboring middle snap" : "Snap the neighboring translation edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>Middle</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

function CodePane({ part, onDirtyChange, onRegisterSave, onSaveAll, onSourceSaved }: { part: Part; onDirtyChange: (dirty: boolean) => void; onRegisterSave: (save: () => Promise<boolean>) => void; onSaveAll: () => Promise<void>; onSourceSaved: (source: string) => Promise<void> }) {
  const [source, setSource] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [error, setError] = useState("");
  const saveAllRef = useRef<() => Promise<void>>(onSaveAll);
  const hasUnsavedChanges = source !== savedSource;

  useEffect(() => {
    saveAllRef.current = onSaveAll;
  }, [onSaveAll]);

  const configureMonaco: BeforeMount = (monaco) => {
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
        "editor.background": "#050607",
        "editor.foreground": "#d9ecff",
        "editor.lineHighlightBackground": "#11141a",
        "editor.lineHighlightBorder": "#20232c",
        "editor.selectionBackground": "#0099ff40",
        "editor.inactiveSelectionBackground": "#2d313b66",
        "editorCursor.foreground": "#0099ff",
        "editorLineNumber.foreground": "#4a5060",
        "editorLineNumber.activeForeground": "#d9dbe1",
        "editorIndentGuide.background1": "#20232c",
        "editorIndentGuide.activeBackground1": "#3b4150",
        "editorBracketHighlight.foreground1": "#0099ff",
        "editorBracketHighlight.foreground2": "#f0b35c",
        "editorBracketHighlight.foreground3": "#93e6b4",
        "editorBracketMatch.background": "#0099ff24",
        "editorBracketMatch.border": "#0099ff",
        "editorGutter.background": "#08090c",
        "editorWidget.background": "#11141a",
        "editorWidget.border": "#2d313b",
        "editorSuggestWidget.background": "#11141a",
        "editorSuggestWidget.border": "#2d313b",
        "editorSuggestWidget.foreground": "#dfe2ea",
        "editorSuggestWidget.highlightForeground": "#0099ff",
        "editorSuggestWidget.selectedBackground": "#20232c",
        "editorHoverWidget.background": "#11141a",
        "editorHoverWidget.border": "#2d313b",
        "scrollbarSlider.background": "#9b9da747",
        "scrollbarSlider.hoverBackground": "#d9dbe15c",
        "scrollbarSlider.activeBackground": "#0099ff66",
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

    readTextFile(part.filePath).then((content) => {
      if (cancelled) return;
      setSource(content);
      setSavedSource(content);
    }).catch((error: unknown) => {
      if (cancelled) return;
      const fallbackSource = `export const part = ${JSON.stringify(part, null, 2)};`;
      setSource(fallbackSource);
      setSavedSource("");
      setError(error instanceof Error ? error.message : "Unable to load part file.");
    });

    return () => { cancelled = true; };
  }, [part.filePath]);

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  const save = useCallback(async () => {
    if (!hasUnsavedChanges) return true;

    try {
      await partFromSource(part, source);
      await writeTextFile(part.filePath, source);
      await onSourceSaved(source);
      setSavedSource(source);
      setError("");
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to save part file.");
      return false;
    }
  }, [hasUnsavedChanges, onSourceSaved, part, source]);

  useEffect(() => {
    onRegisterSave(save);

    return () => {
      onRegisterSave(async () => true);
      onDirtyChange(false);
    };
  }, [onDirtyChange, onRegisterSave, save]);

  const onEditorMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void saveAllRef.current();
    });
  };

  return <div className={`grid h-full min-h-0 w-full ${error ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[auto_minmax(0,1fr)]"} overflow-hidden bg-[#050607]`}><div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#2d313b] bg-[#11141a] px-3.5 py-3 text-xs text-[#0099ff]"><span className="min-w-0 break-words">{part.filePath}</span><button className={`shrink-0 ${saveButtonClass(hasUnsavedChanges)}`} disabled={!hasUnsavedChanges} title="Save code and refresh project preview (Ctrl+S or Cmd+S)" onClick={() => void save()}>Save</button></div><div className="min-h-0 border-y border-[#08090c] bg-[#050607] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"><Editor beforeMount={configureMonaco} language="typescript" onMount={onEditorMount} options={monacoOptions} path={`file:///${part.filePath}`} theme="clipper-dark" value={source} onChange={(value) => setSource(value ?? "")} /></div>{error ? <div className="border-t border-[#3b2a2a] bg-[#1a0f10] px-3.5 py-2 text-xs text-[#ffb4b4] break-words">{error}</div> : null}</div>;
}

function isCodeEditorTarget(target: HTMLElement | null) {
  return Boolean(target?.closest(".monaco-editor"));
}

type TimelinePanelProps = {
  timeline: TimelinePart[];
  timelineViewportState: TimelineViewportState;
  selectedPartId: string;
  selectedZoomMarkerPartId: string | null;
  selectedZoomMarkerId: string | null;
  selectedZoomMarkers: ZoomMarkerSelection[];
  selectedTranslationMarkerPartId: string | null;
  selectedTranslationMarkerId: string | null;
  selectedTranslationMarkers: TranslationMarkerSelection[];
  sceneDuration: number;
  currentSceneTime: number;
  scrubSnapEnabled: boolean;
  onScrub: (time: number) => void;
  onTimelineViewportStateChange: (updater: (state: TimelineViewportState) => TimelineViewportState) => void;
  onSelectPart: (id: string) => void;
  onSelectZoomMarker: (partId: string, markerId: string) => void;
  onSelectZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
  onSelectTranslationMarker: (partId: string, markerId: string) => void;
  onSelectTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  onReorderPart: (sourcePartId: string, targetPartId: string) => void;
  onResizeBlankPart: (partId: string, duration: number) => void;
  onMoveZoomMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number) => void;
  onMoveZoomMarkers: (moves: TimelineMarkerMove[]) => void;
  onMoveTranslationMarker: (sourcePartId: string, markerId: string, targetPartId: string, start: number) => void;
  onMoveTranslationMarkers: (moves: TimelineMarkerMove[]) => void;
  onClearNodeSelection: () => void;
  onUpdateZoomMarker: (partId: string, markerId: string, updater: (marker: ZoomMarker, part: Part) => ZoomMarker) => void;
  onUpdateTranslationMarker: (partId: string, markerId: string, updater: (marker: TranslationMarker, part: Part) => TranslationMarker) => void;
};

function TimelinePanel({ timeline, timelineViewportState, selectedPartId, selectedZoomMarkerPartId, selectedZoomMarkerId, selectedZoomMarkers, selectedTranslationMarkerPartId, selectedTranslationMarkerId, selectedTranslationMarkers, sceneDuration, currentSceneTime, scrubSnapEnabled, onScrub, onTimelineViewportStateChange, onSelectPart, onSelectZoomMarker, onSelectZoomMarkers, onSelectTranslationMarker, onSelectTranslationMarkers, onReorderPart, onResizeBlankPart, onMoveZoomMarker, onMoveZoomMarkers, onMoveTranslationMarker, onMoveTranslationMarkers, onClearNodeSelection, onUpdateZoomMarker, onUpdateTranslationMarker }: TimelinePanelProps) {
  const ticks = getTimelineTicks(sceneDuration);
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
  const selectedZoomKeys = new Set(selectedZoomMarkers.map((selection) => `${selection.partId}:${selection.markerId}`));
  const selectedTranslationKeys = new Set(selectedTranslationMarkers.map((selection) => `${selection.partId}:${selection.markerId}`));
  const contentWidth = Math.max(sceneDuration * defaultTimelinePixelsPerSecond * timelineZoom, 760);

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
    return snapScrubTimeToBoundary(rawTime, timeline, snapThresholdSeconds);
  }

  function visibleScrubClientX(clientX: number) {
    const viewport = timelineViewportRef.current;
    if (!viewport) return clientX;
    const rect = viewport.getBoundingClientRect();
    return clamp(clientX, rect.left, rect.right);
  }

  function updateScrubFromClientX(clientX: number, snap: boolean) {
    onScrub(timeFromClientX(visibleScrubClientX(clientX), snap));
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
    setShiftSnapActive(event.shiftKey);
    updateScrubFromClientX(event.clientX, snap);
    scheduleScrubAutoScroll();
  }

  function startScrub(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-timeline-control]")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onClearNodeSelection();
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
      else onClearNodeSelection();
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
      onClearNodeSelection();
      onScrub(timeFromClientX(selectionDrag.currentX, scrubSnapEnabled || event.shiftKey));
      return;
    }

    const selection = zoomSelectionFromDrag(selectionDrag, rect);

    onSelectZoomMarkers(selection);
    if (selection.length === 0) onClearNodeSelection();
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
      else onClearNodeSelection();
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
      onClearNodeSelection();
      onScrub(timeFromClientX(selectionDrag.currentX, scrubSnapEnabled || event.shiftKey));
      return;
    }

    const selection = translationSelectionFromDrag(selectionDrag, rect);

    onSelectTranslationMarkers(selection);
    if (selection.length === 0) onClearNodeSelection();
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
    if (!selectedZoomKeys.has(`${part.id}:${marker.id}`)) {
      return [{ partId: part.id, markerId: marker.id, absoluteStart: part.start + marker.start, duration: marker.duration }];
    }

    return selectedZoomMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.zoomMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? [{ partId: selectedPart.id, markerId: selectedMarker.id, absoluteStart: selectedPart.start + selectedMarker.start, duration: selectedMarker.duration }] : [];
    });
  }

  function selectedTranslationDragItems(part: TimelinePart, marker: TranslationMarker) {
    if (!selectedTranslationKeys.has(`${part.id}:${marker.id}`)) {
      return [{ partId: part.id, markerId: marker.id, absoluteStart: part.start + marker.start, duration: marker.duration }];
    }

    return selectedTranslationMarkers.flatMap((selection) => {
      const selectedPart = timeline.find((item) => item.id === selection.partId);
      const selectedMarker = selectedPart?.translationMarkers.find((item) => item.id === selection.markerId);
      return selectedPart && selectedMarker ? [{ partId: selectedPart.id, markerId: selectedMarker.id, absoluteStart: selectedPart.start + selectedMarker.start, duration: selectedMarker.duration }] : [];
    });
  }

  function blockDeltaForTimelineDrag(items: Array<{ absoluteStart: number; duration: number }>, rawDelta: number, snapThresholdSeconds: number, snap: boolean) {
    const blockStart = Math.min(...items.map((item) => item.absoluteStart));
    const blockEnd = Math.max(...items.map((item) => item.absoluteStart + item.duration));
    const deltaIntervals = items.reduce<Array<{ start: number; end: number }>>((intervals, item) => {
      const itemIntervals = timeline
        .filter((timelinePart) => item.duration <= timelinePart.duration)
        .map((timelinePart) => ({ start: timelinePart.start - item.absoluteStart, end: timelinePart.end - item.duration - item.absoluteStart }));
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
        if (isSelectionMove) {
          const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap);
          const moves = dragItems.map((item) => {
            const nextPlacement = exactMarkerPlacement(item.absoluteStart + blockDeltaSeconds, item.duration)
              ?? getMarkerPlacement(timeline, item.absoluteStart + blockDeltaSeconds, item.duration, snapThresholdSeconds, false, { kind: "zoom", partId: item.partId, markerId: item.markerId });
            return { sourcePartId: activePartIds.get(item.markerId) ?? item.partId, markerId: item.markerId, targetPartId: nextPlacement.partId, start: nextPlacement.start };
          });
          onMoveZoomMarkers(moves);
          for (const move of moves) activePartIds.set(move.markerId, move.targetPartId);
          return;
        }

        const nextPlacement = getMarkerPlacement(timeline, initialStart + deltaSeconds, initialDuration, snapThresholdSeconds, snap, { kind: "zoom", partId: part.id, markerId: marker.id });
        onMoveZoomMarker(activePartId, marker.id, nextPlacement.partId, nextPlacement.start);
        activePartId = nextPlacement.partId;
        return;
      }

      onUpdateZoomMarker(part.id, marker.id, (currentMarker, currentPart) => {
        if (action === "start") {
          const nextStart = clamp(initialStart + deltaSeconds, 0, initialStart + initialDuration - minimumZoomDuration);
          return { ...currentMarker, start: nextStart, duration: initialStart + initialDuration - nextStart };
        }

        return { ...currentMarker, duration: clamp(initialDuration + deltaSeconds, minimumZoomDuration, currentPart.duration - currentMarker.start) };
      });
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
        if (isSelectionMove) {
          const blockDeltaSeconds = blockDeltaForTimelineDrag(dragItems, deltaSeconds, snapThresholdSeconds, snap);
          const moves = dragItems.map((item) => {
            const nextPlacement = exactMarkerPlacement(item.absoluteStart + blockDeltaSeconds, item.duration)
              ?? getMarkerPlacement(timeline, item.absoluteStart + blockDeltaSeconds, item.duration, snapThresholdSeconds, false, { kind: "translation", partId: item.partId, markerId: item.markerId });
            return { sourcePartId: activePartIds.get(item.markerId) ?? item.partId, markerId: item.markerId, targetPartId: nextPlacement.partId, start: nextPlacement.start };
          });
          onMoveTranslationMarkers(moves);
          for (const move of moves) activePartIds.set(move.markerId, move.targetPartId);
          return;
        }

        const nextPlacement = getMarkerPlacement(timeline, initialStart + deltaSeconds, initialDuration, snapThresholdSeconds, snap, { kind: "translation", partId: part.id, markerId: marker.id });
        onMoveTranslationMarker(activePartId, marker.id, nextPlacement.partId, nextPlacement.start);
        activePartId = nextPlacement.partId;
        return;
      }

      onUpdateTranslationMarker(part.id, marker.id, (currentMarker, currentPart) => {
        if (action === "start") {
          const nextStart = clamp(initialStart + deltaSeconds, 0, initialStart + initialDuration - minimumZoomDuration);
          return { ...currentMarker, start: nextStart, duration: initialStart + initialDuration - nextStart };
        }

        return { ...currentMarker, duration: clamp(initialDuration + deltaSeconds, minimumZoomDuration, currentPart.duration - currentMarker.start) };
      });
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

  function resizeBlankPartFromPointer(event: PointerEvent<HTMLDivElement>, part: TimelinePart, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    onSelectPart(part.id);
    const initialClientX = event.clientX;
    const initialDuration = part.duration;
    const pixelsPerSecond = (timelineRef.current?.getBoundingClientRect().width ?? 1) / Math.max(sceneDuration, 1);

    function move(pointerEvent: globalThis.PointerEvent) {
      const deltaSeconds = (pointerEvent.clientX - initialClientX) / pixelsPerSecond;
      const nextDuration = edge === "start" ? initialDuration - deltaSeconds : initialDuration + deltaSeconds;
      onResizeBlankPart(part.id, nextDuration);
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  const playheadColor = isScrubSnapActive ? "#37d6c2" : "#0099ff";
  const playheadHalo = isScrubSnapActive ? "0 0 0 4px rgba(55,214,194,0.22)" : "0 0 0 4px rgba(0,153,255,0.2)";

  return (
    <footer className="grid min-h-0 select-none grid-rows-[34px_minmax(0,1fr)] gap-3 border-t border-[#1d2028] bg-[#090a0d] px-[22px] pb-[18px] pt-3.5">
      <div className="grid grid-cols-[210px_1fr_auto] items-center gap-4 text-[11px] uppercase tracking-[0.11em] text-[#9b9da7]">
        <button className={`${buttonBase} bg-[#14161c] text-left`}>3 visible timelines</button>
        <div className="h-px bg-[#2d313b]" />
        <div className="flex items-center gap-3 normal-case tracking-normal">
          <span className="min-w-[54px] text-center text-[12px] text-[#dfe2ea] tabular-nums">{Math.round(timelineZoom * 100)}%</span>
          <input aria-label="Timeline zoom" className="h-2 w-[168px] accent-[#737884] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#474d5b] [&::-webkit-slider-thumb]:bg-[#9b9da7] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#474d5b] [&::-moz-range-thumb]:bg-[#9b9da7]" type="range" min={0.5} max={4} step={0.05} value={timelineZoom} onChange={(event) => updateTimelineZoom(Number(event.target.value))} />
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[#0099ff]" title="Zoom timeline out" onClick={() => updateTimelineZoom(roundTenth(timelineZoom - 0.25))}><Minus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded-[9px] border border-[#2d313b] bg-[#14161c] text-[#dfe2ea] hover:border-[#0099ff]" title="Zoom timeline in" onClick={() => updateTimelineZoom(roundTenth(timelineZoom + 0.25))}><Plus size={14} /></button>
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-[72px_minmax(0,1fr)] gap-x-4 overflow-hidden">
        <div className="grid grid-rows-[42px_58px_58px_58px] gap-y-2.5 pr-1">
          <div />
          <div className={`${mutedCaps} self-center`}>Translate</div>
          <div className={`${mutedCaps} self-center`}>Zoom</div>
          <div className={`${mutedCaps} self-center`}>Parts</div>
        </div>
        <div ref={timelineViewportRef} className="timeline-scrollbar min-h-0 overflow-x-scroll overflow-y-hidden px-3 [scrollbar-gutter:stable]" onScroll={saveTimelineDisplacement}>
          <div className="grid grid-rows-[42px_58px_58px_58px] gap-y-2.5" style={{ width: contentWidth }}>
            <div ref={timelineRef} className="relative h-[42px] pt-3.5 text-xs text-[#777b86] tabular-nums" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
              {ticks.map((tick) => {
                const isStart = tick === 0;
                const isEnd = tick === sceneDuration;
                const labelAlign = isStart ? "translate-x-0 text-left after:left-0" : isEnd ? "-translate-x-full text-right after:left-full" : "-translate-x-1/2 text-center after:left-1/2";
                return <span className={`absolute bottom-0 ${labelAlign} after:absolute after:bottom-[-9px] after:h-[7px] after:w-px after:bg-[#3a3f4d] after:content-['']`} key={tick} style={{ left: `${(tick / sceneDuration) * 100}%` }}>{formatTime(tick)}</span>;
              })}
              <div className="pointer-events-none absolute top-[20px] z-30 h-[226px] w-px" style={{ left: `${(currentSceneTime / sceneDuration) * 100}%`, backgroundColor: playheadColor }}><div className="absolute left-1/2 top-[-10px] h-5 w-5 -translate-x-1/2 rounded-full" style={{ backgroundColor: playheadColor, boxShadow: playheadHalo }} /></div>
            </div>
            <div className="relative block overflow-hidden rounded-[14px] border border-[#2d313b] bg-[#111319] transition" onPointerDown={startTranslationSelection} onPointerMove={continueTranslationSelection} onPointerUp={endTranslationSelection} onPointerCancel={endTranslationSelection}>
              {draggingTranslationMarkerId ? timeline.slice(1).map((part) => <div className="pointer-events-none absolute top-0 z-20 h-full w-px origin-top bg-[#7bd9ff]/90 shadow-[0_0_10px_rgba(123,217,255,0.42)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`translation-boundary-${part.id}`} style={{ left: `${(part.start / sceneDuration) * 100}%` }} />) : null}
              {translationSelectionDrag ? <div className="pointer-events-none absolute top-[6px] z-10 h-[46px] rounded-[10px] border border-[#7bd9ff] bg-[rgba(123,217,255,0.13)]" style={{ left: `${(clamp((Math.min(translationSelectionDrag.startX, translationSelectionDrag.currentX) - (timelineRef.current?.getBoundingClientRect().left ?? 0)) / (timelineRef.current?.getBoundingClientRect().width ?? 1), 0, 1)) * 100}%`, width: `${Math.abs(translationSelectionDrag.currentX - translationSelectionDrag.startX) / (timelineRef.current?.getBoundingClientRect().width ?? 1) * 100}%` }} /> : null}
              {timeline.flatMap((timelinePart) => timelinePart.translationMarkers.map((marker) => (
                <div data-timeline-control className={`absolute top-[11px] h-[34px] min-w-[18px] cursor-grab overflow-hidden rounded-[11px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#24b7c9,#127c8d)] px-3 py-2 text-xs font-bold text-white active:cursor-grabbing ${marker.snapIn ? "rounded-l-none" : ""} ${marker.snapOut ? "rounded-r-none" : ""} ${selectedTranslationKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 outline-[#0099ff]" : marker.id === selectedTranslationMarkerId && timelinePart.id === selectedTranslationMarkerPartId ? "opacity-100 outline outline-2 outline-[#0099ff]" : "opacity-80"}`} key={`${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `${(marker.duration / sceneDuration) * 100}%` }} onClick={() => onSelectTranslationMarker(timelinePart.id, marker.id)} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "move")}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Translate {marker.position.x}, {marker.position.y}</span>
                  <div className={`absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/15 ${marker.snapIn ? "" : "rounded-l-[11px]"}`} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "start")} />
                  <div className={`absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/15 ${marker.snapOut ? "" : "rounded-r-[11px]"}`} onPointerDown={(event) => updateTranslationFromPointer(event, timelinePart, marker, "end")} />
                </div>
              )))}
            </div>
            <div className="relative block overflow-hidden rounded-[14px] border border-[#2d313b] bg-[#111319] transition" onPointerDown={startZoomSelection} onPointerMove={continueZoomSelection} onPointerUp={endZoomSelection} onPointerCancel={endZoomSelection}>
              {draggingZoomMarkerId ? timeline.slice(1).map((part) => <div className="pointer-events-none absolute top-0 z-20 h-full w-px origin-top bg-[#7bd9ff]/90 shadow-[0_0_10px_rgba(123,217,255,0.42)] animate-[clipper-zoom-boundary-in_180ms_ease-out_both]" key={`zoom-boundary-${part.id}`} style={{ left: `${(part.start / sceneDuration) * 100}%` }} />) : null}
              {zoomSelectionDrag ? <div className="pointer-events-none absolute top-[6px] z-10 h-[46px] rounded-[10px] border border-[#7bd9ff] bg-[rgba(123,217,255,0.13)]" style={{ left: `${(clamp((Math.min(zoomSelectionDrag.startX, zoomSelectionDrag.currentX) - (timelineRef.current?.getBoundingClientRect().left ?? 0)) / (timelineRef.current?.getBoundingClientRect().width ?? 1), 0, 1)) * 100}%`, width: `${Math.abs(zoomSelectionDrag.currentX - zoomSelectionDrag.startX) / (timelineRef.current?.getBoundingClientRect().width ?? 1) * 100}%` }} /> : null}
              {timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.map((marker) => (
                <div data-timeline-control className={`absolute top-[11px] h-[34px] min-w-[18px] cursor-grab overflow-hidden rounded-[11px] ring-1 ring-inset ring-black/55 bg-[linear-gradient(180deg,#f0c95a,#b88312)] px-3 py-2 text-xs font-bold text-[#1a1202] active:cursor-grabbing ${marker.snapIn ? "rounded-l-none" : ""} ${marker.snapOut ? "rounded-r-none" : ""} ${selectedZoomKeys.has(`${timelinePart.id}:${marker.id}`) ? "opacity-100 outline outline-2 outline-[#37d6c2]" : marker.id === selectedZoomMarkerId && timelinePart.id === selectedZoomMarkerPartId ? "opacity-100 outline outline-2 outline-[#37d6c2]" : "opacity-85"}`} key={`${timelinePart.id}-${marker.id}`} style={{ left: `${((timelinePart.start + marker.start) / sceneDuration) * 100}%`, width: `${(marker.duration / sceneDuration) * 100}%` }} onClick={() => onSelectZoomMarker(timelinePart.id, marker.id)} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "move")}>
                  <span className="pointer-events-none block overflow-hidden text-ellipsis whitespace-nowrap">Zoom {marker.scale}x</span>
                  <div className={`absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-white/15 ${marker.snapIn ? "" : "rounded-l-[11px]"}`} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "start")} />
                  <div className={`absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-white/15 ${marker.snapOut ? "" : "rounded-r-[11px]"}`} onPointerDown={(event) => updateZoomFromPointer(event, timelinePart, marker, "end")} />
                </div>
              )))}
            </div>
            <div className="relative flex h-[58px] overflow-visible rounded-[14px] border border-[#2d313b] bg-[#111319] transition" onPointerDown={startScrub} onPointerMove={continueScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>
              {timeline.map((item, index) => (
                <button data-timeline-control draggable key={item.id} className={`relative flex min-w-[86px] cursor-grab items-end justify-between gap-2 overflow-hidden ring-1 ring-inset ring-black/55 px-3 py-2 text-left text-[13px] leading-none text-white active:cursor-grabbing before:absolute before:left-1/2 before:top-2 before:-translate-x-1/2 before:text-[12px] before:font-extrabold before:text-white/25 before:content-['Clip'] ${index === 0 ? "rounded-l-[14px]" : ""} ${index === timeline.length - 1 ? "rounded-r-[14px]" : ""} ${item.kind === "blank" ? "bg-[linear-gradient(180deg,#24262e,#16181f)] text-[#a9abb3]" : "bg-[linear-gradient(180deg,#38a86d,#17603c)]"} ${item.id === selectedPartId && !selectedZoomMarkerId && !selectedTranslationMarkerId ? "z-20 opacity-100 outline outline-2 outline-[#0099ff] shadow-[0_0_0_4px_rgba(0,153,255,0.18)]" : ""}`} style={{ width: `${(item.duration / sceneDuration) * 100}%` }} onPointerDown={() => onSelectPart(item.id)} onClick={() => onSelectPart(item.id)} onDragStart={(event) => onPartDragStart(event, item.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onPartDrop(event, item.id)} onDragEnd={() => setDraggedPartId(null)}>
                  {item.kind === "blank" ? <div data-timeline-control className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize touch-none border-l-4 border-transparent transition hover:border-[#0099ff]" title="Resize spacer start" onPointerDown={(event) => resizeBlankPartFromPointer(event, item, "start")} /> : null}
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-bold">{item.name}</span><small className="shrink-0 text-[12px] font-extrabold text-white/80">{item.duration}s</small>
                  {item.kind === "blank" ? <div data-timeline-control className="absolute right-0 top-0 z-10 h-full w-2 cursor-ew-resize touch-none border-r-4 border-transparent transition hover:border-[#0099ff]" title="Resize spacer end" onPointerDown={(event) => resizeBlankPartFromPointer(event, item, "end")} /> : null}
                </button>
              ))}
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

function framePointToCameraTranslation(point: Point): Point {
  return {
    x: Math.round(FRAME_WIDTH / 2 - clamp(point.x, 0, FRAME_WIDTH)),
    y: Math.round(FRAME_HEIGHT / 2 - clamp(point.y, 0, FRAME_HEIGHT)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTimelineTicks(duration: number) {
  const step = duration <= 30 ? 5 : 10;
  const ticks: number[] = [];
  for (let cursor = 0; cursor <= duration; cursor += step) ticks.push(cursor);
  if (!ticks.includes(duration)) ticks.push(duration);
  return ticks;
}

function getTimelinePartAtTime(timeline: TimelinePart[], time: number) {
  return timeline.find((item) => time >= item.start && time < item.end) ?? timeline.at(-1) ?? null;
}

function snapScrubTimeToBoundary(time: number, timeline: TimelinePart[], snapThresholdSeconds: number) {
  const boundaries = getScrubSnapBoundaries(timeline);
  let nearest = time;
  let nearestDistance = snapThresholdSeconds;

  for (const boundary of boundaries) {
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

function truncateMiddle(value: string, maxLength = 34) {
  if (value.length <= maxLength) return value;
  const edgeLength = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, edgeLength)}...${value.slice(value.length - edgeLength)}`;
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

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function getActiveZoom(markers: ZoomMarker[], time: number) {
  const marker = markers.find((item) => time >= item.start && time <= item.start + item.duration);
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = easeInOutCubic(Math.max(0, Math.min(1, ramp)));
  return { ...marker, scale: (1 + (marker.scale - 1) * eased) as ZoomMarker["scale"] };
}

function getActiveTranslation(markers: TranslationMarker[], time: number) {
  const marker = markers.find((item) => time >= item.start && time <= item.start + item.duration);
  if (!marker) return null;
  const progress = (time - marker.start) / marker.duration;
  const rampIn = marker.snapIn ? 1 : progress / 0.22;
  const rampOut = marker.snapOut ? 1 : (1 - progress) / 0.22;
  const ramp = Math.min(rampIn, rampOut, 1);
  const eased = easeInOutCubic(Math.max(0, Math.min(1, ramp)));
  return { ...marker, position: { x: Math.round(marker.position.x * eased), y: Math.round(marker.position.y * eased) } };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}
