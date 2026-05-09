import { describe, expect, it, vi } from "vitest";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type ProjectManifest,
} from "../../core/types";

const hostMocks = vi.hoisted(() => ({
  renderVideoExport: vi.fn(),
}));

vi.mock("../clipperHost", () => ({
  clipperHost: {
    renderVideoExport: hostMocks.renderVideoExport,
  },
}));

const frame = {
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  style: { background: "#000000" },
} as const;
const background = {
  id: "background",
  name: "Background",
  style: { background: "#000000" },
  elements: [],
};

describe("export service", () => {
  it("prepares rendered media from preview timeline truth without legacy prefiltering", async () => {
    const project: ProjectManifest = {
      id: "project",
      name: "Export Project",
      resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      assetsPath: "assets",
      scenes: [],
      compositionLibrary: [
        {
          id: "clip",
          filePath: "clip.ts",
          duration: 2,
          frame,
          background,
          objects: [],
          snapshot: [],
          motionMarkers: [],
        },
      ],
      timelines: [
        {
          id: "scene",
          clips: [
            {
              id: "visible-clip",
              compositionId: "clip",
              start: 0,
              duration: 2,
              layerId: "visible",
            },
            {
              id: "hidden-clip",
              compositionId: "clip",
              start: 2,
              duration: 8,
              layerId: "hidden",
            },
          ],
          timelineLayers: {
            compositionLayers: [
              { id: "visible" },
              { id: "hidden", hidden: true },
            ],
          },
        },
      ],
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: {
          compositionLayers: [
            { id: "visible", hidden: true },
            { id: "hidden" },
          ],
        },
      },
    };
    const { exportService } = await import("./exportService");

    const prepared = exportService.prepareRenderedMediaExport({
      project,
      sceneId: "scene",
    });
    hostMocks.renderVideoExport.mockResolvedValue("/tmp/export.mp4");
    await exportService.renderVideoExport(
      "export-id",
      prepared.defaultFileName,
      project,
      "clipper/projects/export/project.json",
      prepared.scene,
      prepared.durationSeconds,
      270,
      true,
    );

    expect(
      prepared.scene.compositions.map((composition) => composition.id),
    ).toEqual(["visible-clip", "hidden-clip"]);
    expect(prepared.durationSeconds).toBe(2);
    expect(prepared.totalFrames).toBe(60);
    expect(hostMocks.renderVideoExport).toHaveBeenLastCalledWith(
      "export-id",
      "export-project-scene.mp4",
      expect.any(Object),
      "clipper/projects/export/project.json",
      expect.objectContaining({
        compositions: expect.arrayContaining([
          expect.objectContaining({ id: "hidden-clip" }),
        ]),
      }),
      30,
      2,
      270,
      true,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "mp4",
      "high",
      undefined,
      undefined,
      "renderer",
      "safe",
      1,
    );
  });

  it("prepares rendered media with mp4 extension when format is mp4", async () => {
    const project: ProjectManifest = {
      id: "project",
      name: "MP4 Project",
      resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      assetsPath: "assets",
      scenes: [],
      compositionLibrary: [
        {
          id: "clip",
          filePath: "clip.ts",
          duration: 1,
          frame,
          background,
          objects: [],
          snapshot: [],
          motionMarkers: [],
        },
      ],
      timelines: [
        {
          id: "scene",
          clips: [
            {
              id: "c1",
              compositionId: "clip",
              start: 0,
              duration: 1,
              layerId: "l1",
            },
          ],
          timelineLayers: { compositionLayers: [{ id: "l1" }] },
        },
      ],
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: { compositionLayers: [{ id: "l1" }] },
      },
    };
    const { exportService } = await import("./exportService");

    const prepared = exportService.prepareRenderedMediaExport({
      project,
      sceneId: "scene",
      mediaExportFormat: "mp4",
    });
    expect(prepared.defaultFileName).toMatch(/\.mp4$/);
  });

  it("prepares rendered media with webm extension when format is webm", async () => {
    const project: ProjectManifest = {
      id: "project",
      name: "WebM Project",
      resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
      assetsPath: "assets",
      scenes: [],
      compositionLibrary: [
        {
          id: "clip",
          filePath: "clip.ts",
          duration: 1,
          frame,
          background,
          objects: [],
          snapshot: [],
          motionMarkers: [],
        },
      ],
      timelines: [
        {
          id: "scene",
          clips: [
            {
              id: "c1",
              compositionId: "clip",
              start: 0,
              duration: 1,
              layerId: "l1",
            },
          ],
          timelineLayers: { compositionLayers: [{ id: "l1" }] },
        },
      ],
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: { compositionLayers: [{ id: "l1" }] },
      },
    };
    const { exportService } = await import("./exportService");

    const prepared = exportService.prepareRenderedMediaExport({
      project,
      sceneId: "scene",
      mediaExportFormat: "webm",
    });
    expect(prepared.defaultFileName).toMatch(/\.webm$/);
    hostMocks.renderVideoExport.mockResolvedValue("/tmp/export.webm");
    await exportService.renderVideoExport(
      "export-id",
      prepared.defaultFileName,
      project,
      "clipper/projects/export/project.json",
      prepared.scene,
      prepared.durationSeconds,
      270,
      true,
      undefined,
      undefined,
      "webm",
    );
    expect(hostMocks.renderVideoExport).toHaveBeenLastCalledWith(
      "export-id",
      expect.stringMatching(/\.webm$/),
      expect.any(Object),
      "clipper/projects/export/project.json",
      expect.any(Object),
      30,
      expect.any(Number),
      270,
      true,
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "webm",
      "high",
      undefined,
      undefined,
      "renderer",
      "safe",
      1,
    );
  });
});
