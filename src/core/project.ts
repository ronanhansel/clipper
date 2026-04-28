import { roundTwo, sanitizeProjectNumbers } from "./math";
import { normalizeMendedZoomMarkerFocus } from "./markers";
import type { AssetItem, Part, PreviewViewportState, ProjectManifest, TimelineMode, TimelineViewportState } from "./types";

export const defaultTimelineViewportState: TimelineViewportState = { displacement: 0, zoom: 1 };
export const defaultTimelineMode: TimelineMode = "edit";
export const defaultPreviewViewportState: PreviewViewportState = { scale: 0.5, scrollLeft: 0, scrollTop: 0, zoomBarOpen: false };

function normalizeRightPanelTab(tab: unknown) {
  return tab === "motion" || tab === "agent" ? tab : "video";
}

export const defaultAssets: AssetItem[] = [
  { id: "ast_folder_media", name: "media", kind: "folder", children: [{ id: "ast_grid_ref", name: "grid-reference.png", kind: "file", path: "clipper/projects/prj_v01_sample/assets/media/grid-reference.png" }] },
  { id: "ast_folder_audio", name: "audio", kind: "folder", children: [] },
  { id: "ast_brand", name: "brand-palette.json", kind: "file", path: "clipper/projects/prj_v01_sample/assets/brand-palette.json" },
];

export function replacePartInProject(project: ProjectManifest, partId: string, updater: (part: Part) => Part): ProjectManifest {
  return {
    ...project,
    scenes: project.scenes.map((currentScene) => ({
      ...currentScene,
      parts: currentScene.parts.map((currentPart) => (currentPart.id === partId ? updater(currentPart) : currentPart)),
    })),
  };
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
