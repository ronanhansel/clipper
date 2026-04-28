import { roundTwo, sanitizeProjectNumbers } from "./math";
import { normalizeMendedZoomMarkerFocus } from "./markers";
import type { AssetItem, CodeViewportState, CompositionClip, PreviewViewportState, ProjectManifest, Scene, TimelineMode, TimelineViewportState } from "./types";

export const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
export const defaultTimelineMode: TimelineMode = "edit";
export const defaultPreviewViewportState: PreviewViewportState = { scale: 0.5, scrollLeft: 0, scrollTop: 0, zoomBarOpen: false };

function normalizeRightPanelTab(tab: unknown) {
  return tab === "motion" || tab === "agent" ? tab : "video";
}

function normalizeCodeViewportState(state: CodeViewportState | undefined): CodeViewportState {
  return {
    scrollLeft: roundTwo(Math.max(state?.scrollLeft ?? 0, 0)),
    scrollTop: roundTwo(Math.max(state?.scrollTop ?? 0, 0)),
  };
}

function normalizeCodeViewportStates(states: Record<string, CodeViewportState> | undefined) {
  if (!states) return {};
  return Object.fromEntries(Object.entries(states).map(([filePath, state]) => [filePath, normalizeCodeViewportState(state)]));
}

export const defaultAssets: AssetItem[] = [
  { id: "ast_folder_media", name: "media", kind: "folder", children: [] },
  { id: "ast_folder_audio", name: "audio", kind: "folder", children: [] },
];

export function replacePartInProject(project: ProjectManifest, compositionId: string, updater: (composition: CompositionClip) => CompositionClip): ProjectManifest {
  return {
    ...project,
    scenes: project.scenes.map((currentScene) => ({
      ...currentScene,
      compositions: currentScene.compositions.map((currentComposition) => (currentComposition.id === compositionId ? updater(currentComposition) : currentComposition)),
    })),
  };
}

type LegacyScene = Omit<Scene, "compositions"> & { parts?: CompositionClip[]; compositions?: CompositionClip[] };

function getSceneCompositions(scene: Scene | LegacyScene): CompositionClip[] {
  return scene.compositions ?? ("parts" in scene ? scene.parts ?? [] : []);
}

export function normalizeProject(project: ProjectManifest): ProjectManifest {
  const timelineState = project.editorState?.timeline ?? defaultTimelineViewportState;
  const timelineMode = project.editorState?.timelineMode === "composition" ? "composition" : defaultTimelineMode;
  const previewState = project.editorState?.preview ?? defaultPreviewViewportState;

  return sanitizeProjectNumbers({
    ...project,
    editorState: {
      ...project.editorState,
      timeline: {
        displacement: roundTwo(Math.max(timelineState.displacement, 0)),
        zoom: roundTwo(Math.min(Math.max(timelineState.zoom, 0.5), 4)),
      },
      timelineMode,
      mode: project.editorState?.mode === "code" ? "code" : "interactive",
      leftPanelTab: project.editorState?.leftPanelTab === "tools" ? "tools" : "assets",
      rightPanelTab: normalizeRightPanelTab(project.editorState?.rightPanelTab),
      selectedSceneId: project.scenes.some((scene) => scene.id === project.editorState?.selectedSceneId) ? project.editorState?.selectedSceneId : project.scenes[0]?.id,
      currentSceneTime: roundTwo(Math.max(project.editorState?.currentSceneTime ?? 2.6, 0)),
      preview: {
        scale: roundTwo(Math.min(Math.max(previewState.scale, 0.25), 1)),
        scrollLeft: roundTwo(Math.max(previewState.scrollLeft, 0)),
        scrollTop: roundTwo(Math.max(previewState.scrollTop, 0)),
        zoomBarOpen: Boolean(previewState.zoomBarOpen),
      },
      code: normalizeCodeViewportStates(project.editorState?.code),
    },
    scenes: project.scenes.map((scene) => ({
      ...scene,
      adjustmentLayers: (scene.adjustmentLayers ?? []).map((layer) => ({
        ...layer,
        start: roundTwo(Math.max(layer.start, 0)),
        duration: roundTwo(Math.max(layer.duration, 0.1)),
        effect: layer.effect.kind === "frameSkip" ? { kind: "frameSkip", every: Math.max(1, Math.round(layer.effect.every || 1)) } : layer.effect,
      })),
      compositions: getSceneCompositions(scene).map((composition) => ({
        ...composition,
        background: {
          ...composition.background,
          stretchToElements: composition.background.stretchToElements || undefined,
          elements: composition.background.elements ?? [],
        },
        zoomMarkers: normalizeMendedZoomMarkerFocus(composition.zoomMarkers ?? []),
        translationMarkers: composition.translationMarkers ?? [],
      })),
    })),
    assets: project.assets ?? defaultAssets,
  }) as ProjectManifest;
}
