import { describe, expect, it, vi } from "vitest";
import { lensPostProcessKind } from "../../core/effects/postprocess/lens";
import { filmBurnTransitionPostProcessKind } from "../../core/effects/postprocess/filmBurnTransition";
import type {
  AdjustmentLayer,
  CompositionClip,
  PartFrame,
  ProjectManifest,
  Scene,
  TransitionLayer,
} from "../../core/types";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../core/types";
import {
  getExportFrameScale,
  getExportPostProcessPasses,
  getExportRasterReadinessDiagnostics,
  waitForExportSvgRastersReady,
} from "./RenderedMediaExportApp";

const frame: PartFrame = {
  width: FRAME_WIDTH,
  height: FRAME_HEIGHT,
  style: { background: "#336699" },
};
const background = {
  id: "background",
  name: "Background",
  style: { background: "#336699" },
  elements: [],
};

describe("export post-process pass derivation", () => {
  it("preserves the no-postprocess route when no pass is active", () => {
    const scene = testScene({ adjustmentLayers: [] });

    expect(getExportPostProcessPasses(testRequest(scene))).toEqual([]);
  });

  it("injects the active frame background into exported lens passes", () => {
    const scene = testScene({ adjustmentLayers: [lensLayer({ radius: 25 })] });

    const passes = getExportPostProcessPasses(testRequest(scene, 1.5));

    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      kind: lensPostProcessKind,
      uniforms: { frameBackground: { r: 0.2, g: 0.4, b: 0.6 } },
    });
  });

  it("includes transition post-process passes through the generic export path", () => {
    const scene = testScene({ transitionLayers: [filmBurnLayer()] });

    const passes = getExportPostProcessPasses(testRequest(scene, 1));

    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      kind: filmBurnTransitionPostProcessKind,
      sourceLayerId: "film-burn",
      uniforms: { progress: 0.5 },
    });
  });
});

describe("export frame scale", () => {
  it("uses selected export resolution to scale the render surface", () => {
    expect(getExportFrameScale({ exportWidth: 3840, exportHeight: 2160 })).toBe(
      2,
    );
    expect(
      getExportFrameScale({ exportWidth: 2560, exportHeight: 1440 }),
    ).toBeCloseTo(4 / 3);
  });

  it("falls back to native composition scale for invalid export sizes", () => {
    expect(getExportFrameScale({ exportWidth: 0, exportHeight: 2160 })).toBe(1);
  });
});

describe("export raster readiness", () => {
  it("rejects failed export raster markers instead of allowing raw DOM capture", async () => {
    const failed = {
      dataset: {
        clipperExportSvgRasterError:
          "Browser failed to decode SVG for export rasterization",
      },
    };
    const root = fakeRasterRoot({ failed });

    await expect(waitForExportSvgRastersReady(root)).rejects.toThrow(
      "Browser failed to decode SVG for export rasterization",
    );
  });

  it("rejects missing WebLayer flatten overrides instead of allowing raw DOM capture", async () => {
    const failedWebLayer = {
      dataset: {
        clipperExportWeblayerFlattenError:
          "Export WebLayer flatten override missing. owner=object:html:hair",
      },
    };
    const root = fakeRasterRoot({ failedWebLayer });

    await expect(waitForExportSvgRastersReady(root)).rejects.toThrow(
      "Export WebLayer flatten override missing",
    );
  });

  it("waits for ready raster images to finish decoding", async () => {
    const image = { complete: false, naturalWidth: 0 };
    const root = fakeRasterRoot({ images: [image] });
    const previousAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        image.complete = true;
        image.naturalWidth = 320;
        callback(0);
        return 1;
      },
    );

    await waitForExportSvgRastersReady(root);

    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
    globalThis.requestAnimationFrame = previousAnimationFrame;
  });

  it("reports bounded pending raster diagnostics", () => {
    const root = fakeRasterRoot({
      pendingList: [
        {
          dataset: {
            clipperExportSvgRasterDiagnostic:
              "owner=object:html:a raster=100x100",
          },
        },
        {
          dataset: {
            clipperExportSvgRasterDiagnostic:
              "owner=object:svg:b raster=200x200",
          },
        },
        {
          dataset: {
            clipperExportSvgRasterDiagnostic:
              "owner=background:html:c raster=300x300",
          },
        },
        {
          dataset: {
            clipperExportSvgRasterDiagnostic:
              "owner=object:html:d raster=400x400",
          },
        },
      ],
    });

    expect(getExportRasterReadinessDiagnostics(root)).toEqual([
      "pending1=owner=object:html:a raster=100x100",
      "pending2=owner=object:svg:b raster=200x200",
      "pending3=owner=background:html:c raster=300x300",
    ]);
  });

  it("reports bounded WebLayer image decode diagnostics", () => {
    const root = fakeRasterRoot({
      webLayerImages: [
        {
          complete: false,
          naturalWidth: 0,
          dataset: {
            clipperExportWeblayerFlattenDiagnostic:
              "owner=object:html:a capture=100x100",
          },
        },
      ],
    });

    expect(getExportRasterReadinessDiagnostics(root)).toEqual([
      "loadingWebLayer1=owner=object:html:a capture=100x100",
    ]);
  });
});

function fakeRasterRoot({
  failed = null,
  failedWebLayer = null,
  pending = null,
  pendingList = [],
  images = [],
  webLayerImages = [],
}: {
  failed?: unknown;
  failedWebLayer?: unknown;
  pending?: unknown;
  pendingList?: unknown[];
  images?: unknown[];
  webLayerImages?: unknown[];
}) {
  return {
    querySelector: (selector: string) =>
      selector.includes("weblayer") && selector.includes('="failed"')
        ? failedWebLayer
        : selector.includes('="failed"')
          ? failed
          : selector.includes('="pending"')
            ? pending
            : null,
    querySelectorAll: (selector: string) =>
      selector.includes('="pending"')
        ? pendingList
        : selector.includes("weblayer") && selector.includes('="ready"')
          ? webLayerImages
          : selector.includes('="ready"')
            ? images
            : [],
  } as unknown as HTMLElement;
}

function testRequest(scene: Scene, sceneTime = 0) {
  return { project: testProject(scene.id), scene, sceneTime, frameRate: 30 };
}

function testProject(sceneId: string): ProjectManifest {
  return {
    id: "project",
    name: "Project",
    resolution: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    assetsPath: "assets",
    scenes: [],
    timelines: [
      {
        id: sceneId,
        clips: [],
        timelineLayers: {
          adjustmentLayers: [{ id: "clipper.adjustment.lens" }],
          transitionLayers: [{ id: "clipper.transition.filmBurn" }],
        },
      },
    ],
  };
}

function testScene(overrides: Partial<Scene> = {}): Scene {
  return { id: "scene", compositions: [testComposition()], ...overrides };
}

function testComposition(): CompositionClip {
  return {
    id: "composition",
    filePath: "composition.ts",
    start: 0,
    duration: 3,
    frame,
    background,
    objects: [],
    snapshot: [],
    motionMarkers: [],
  };
}

function lensLayer(
  params: AdjustmentLayer["effect"]["params"],
): AdjustmentLayer {
  return {
    id: "lens",
    name: "Lens",
    start: 1,
    duration: 2,
    effect: { effectId: "clipper.adjustment.lens", params },
  };
}

function filmBurnLayer(): TransitionLayer {
  return {
    id: "film-burn",
    name: "Film Burn",
    start: 0,
    duration: 2,
    midPoint: 1,
    effect: {
      effectId: "clipper.transition.filmBurn",
      params: { ease: "linear" },
    },
  };
}
