import type { ProjectManifest } from "./core/types";

export const fallbackProject: ProjectManifest = {
  id: "untitled_project",
  name: "Untitled Project",
  resolution: { width: 1920, height: 1080 },
  assetsPath: "clipper/assets",
  assets: [
    { id: "ast_folder_media", name: "media", kind: "folder", children: [] },
    { id: "ast_folder_audio", name: "audio", kind: "folder", children: [] },
  ],
  editorState: {
    timeline: { displacement: 0, zoom: 1 },
    timelineMode: "composition",
    mode: "code",
    leftPanelTab: "tools",
    rightPanelTab: "video",
    selectedSceneId: "scn_untitled",
    currentSceneTime: 0,
    preview: { scale: 0.5, scrollLeft: 0, scrollTop: 0, zoomBarOpen: false },
    code: {},
  },
  scenes: [
    {
      id: "scn_untitled",
      name: "Untitled Scene",
      compositions: [
        {
          id: "cmp_untitled",
          name: "Untitled Composition",
          filePath: "clipper/compositions/cmp_untitled.ts",
          duration: 5,
          frame: { width: 1920, height: 1080, style: { background: "#050505" } },
          background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
          objects: [],
          snapshot: [],
          zoomMarkers: [],
          translationMarkers: [],
        },
      ],
    },
  ],
};
