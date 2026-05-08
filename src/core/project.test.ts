import { describe, expect, it } from "vitest";
import { compositionToSource } from "./compositionSource";
import { applyAnimationGraphToComposition, createDefaultTimelineLayerState, defaultTimelineLayerState, deleteCompositionFromProject, getSceneFromProject, normalizeAnimationGraphState, normalizeProject, replacePartInProject, serializeProjectForSave, withRequiredTimelineLayerTypes } from "./project";
import { motionBlocksToMotionMarkers } from "./motionEffects";
import type { CompositionClip, ProjectManifest } from "./types";

const motionMarkers = motionBlocksToMotionMarkers([{ id: "zoom_1", effectId: "clipper.motion.zoom", layerId: "clipper.motion.zoom", start: 0, duration: 1, focus: { x: 960, y: 540 }, scale: 1.2, params: { focus: { x: 960, y: 540 }, scale: 1.2 } }]);

const composition: CompositionClip = {
  id: "cmp_intro",
  filePath: "compositions/cmp_intro.ts",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  motionMarkers,
};

function projectWithComposition(): ProjectManifest {
  return {
    id: "proj_test",
    name: "Test Project",
    resolution: { width: 1920, height: 1080 },
    assetsPath: "assets",
    scenes: [],
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",

      clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionMarkers }],
      adjustmentLayers: [],
      settings: {},
    }],
    compositions: [{ ...composition, source: "export const composition = { id: 'cmp_intro' };" }],
    compositionLibrary: [composition],
    compositionSources: {
      [composition.filePath]: "export const composition = { id: 'cmp_intro' };",
    },
  };
}

describe("project normalization", () => {
  it("normalizes timeline clips and composition documents", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.timelines).toHaveLength(1);
    expect(normalized.timelines?.[0].clips[0].motionMarkers).toEqual([]);
    expect(normalized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "zoom_1", kind: "zoom", layerId: "clipper.motion.zoom", scale: 1.2 });
    expect(normalized.compositions).toHaveLength(1);
    expect(normalized.compositionSources?.[composition.filePath]).toBe("export const composition = { id: 'cmp_intro' };");
    expect(normalized.compositions?.[0]).not.toHaveProperty("source");
  });

  it("migrates legacy composition prerender marks onto timeline clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      compositions: [{ ...composition, prerender: true, source: "export const composition = new Composition({\n  duration: 5,\n  prerender: true,\n});" }],
      compositionLibrary: [{ ...composition, prerender: true }],
      compositionSources: {
        [composition.filePath]: "export const composition = new Composition({\n  duration: 5,\n  prerender: true,\n});",
      },
    });

    expect(normalized.timelines?.[0].clips[0].prerender).toBe(true);
    expect(normalized.scenes[0].compositions[0].prerender).toBe(true);
    expect(normalized.compositions?.[0].prerender).toBeUndefined();
    expect(normalized.compositionLibrary?.[0].prerender).toBeUndefined();
    expect(normalized.compositionSources?.[composition.filePath]).not.toContain("prerender");
  });

  it("preserves existing timeline file paths while syncing runtime scene clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "compositions/folder/tl_main.timeline.json",
        clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionMarkers }],
        adjustmentLayers: [],
        settings: { frameRate: 30 },
      }],
    });

    expect(normalized.timelines?.[0].filePath).toBe("compositions/folder/tl_main.timeline.json");
    expect(normalized.timelines?.[0].settings).toEqual({ frameRate: 30 });
    expect(normalized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "zoom_1", kind: "zoom", effectId: "clipper.motion.zoom" });
  });

  it("uses synced source when normalizing geometry-only composition edits", () => {
    const object = {
      id: "title",
      name: "Title",
      type: "text" as const,
      selector: "[data-object-id='title']",
      bounds: { x: 100, y: 100, width: 300, height: 80 },
      content: "Hello",
      style: {},
    };
    const baseComposition = { ...composition, objects: [object] };
    const baseProject = normalizeProject({
      ...projectWithComposition(),
      compositions: [{ ...baseComposition, source: compositionToSource(baseComposition) }],
      compositionLibrary: [baseComposition],
      compositionSources: { [baseComposition.filePath]: compositionToSource(baseComposition) },
    });
    const editedProject = replacePartInProject(baseProject, baseComposition.id, (part) => ({
      ...part,
      objects: part.objects.map((item) => (item.id === object.id ? { ...item, bounds: { ...item.bounds, width: 520 } } : item)),
    }));
    const editedPart = editedProject.compositionLibrary?.find((item) => item.id === baseComposition.id)!;
    const normalized = normalizeProject({
      ...editedProject,
      compositionSources: { [baseComposition.filePath]: compositionToSource(editedPart) },
    });

    expect(getSceneFromProject(normalized, "tl_main")?.compositions[0].objects[0].bounds.width).toBe(520);
  });

  it("uses compositionSources as canonical source over stale embedded source", () => {
    const object = {
      id: "title",
      name: "Title",
      type: "text" as const,
      selector: "[data-object-id='title']",
      bounds: { x: 100, y: 100, width: 300, height: 80 },
      content: "Hello",
      style: {},
    };
    const baseComposition = { ...composition, objects: [object] };
    const baseSource = compositionToSource(baseComposition);
    const editedComposition = {
      ...baseComposition,
      source: baseSource,
      objects: [{ ...object, bounds: { ...object.bounds, width: 520 } }],
    };
    const normalized = normalizeProject({
      ...projectWithComposition(),
      compositions: [editedComposition],
      compositionLibrary: [editedComposition],
      compositionSources: { [baseComposition.filePath]: compositionToSource(editedComposition) },
    });

    expect(getSceneFromProject(normalized, "tl_main")?.compositions[0].objects[0].bounds.width).toBe(520);
  });

  it("does not serialize embedded composition source", () => {
    const serialized = serializeProjectForSave(projectWithComposition());

    expect(serialized.compositionSources?.[composition.filePath]).toBe("export const composition = { id: 'cmp_intro' };");
    expect(serialized.compositions?.[0]).not.toHaveProperty("source");
    expect(serialized.compositionLibrary?.[0]).not.toHaveProperty("source");
    expect(serialized.scenes[0]?.compositions[0]).not.toHaveProperty("source");
  });

  it("normalizes composition folder roots without preserving empty compositions or file-manager prefixes", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [],
      compositionFolders: ["compositions", "file-manager/compositions/cards"],
      compositionLibrary: [{ ...composition, id: "compositions/title.composition.ts", filePath: "compositions/title.composition.ts" }],
      compositionSources: { "compositions/title.composition.ts": "source" },
    });

    expect(normalized.compositionFolders).toEqual(["compositions/cards"]);
  });

  it("preserves an intentionally empty timeline instead of restoring old clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        settings: {},
      }],
    });

    expect(normalized.timelines?.[0].clips).toEqual([]);
    expect(normalized.scenes[0].compositions).toEqual([]);
  });

  it("serializes clip motion markers as timeline-level motion markers", () => {
    const serialized = serializeProjectForSave(projectWithComposition());

    expect(serialized.timelines?.[0].clips[0].motionMarkers).toEqual([]);
    expect(serialized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "zoom_1", kind: "zoom", effectId: "clipper.motion.zoom" });
  });

  it("migrates the old edit timeline mode to compose", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "edit",
      } as ProjectManifest["editorState"] & { timelineMode: "edit" },
    });

    expect(normalized.editorState?.timelineMode).toBe("compose");
  });

  it("normalizes legacy editor modes to preview/editor values", () => {
    expect(normalizeProject({
      ...projectWithComposition(),
      editorState: { timeline: { displacement: 0, zoom: 1 }, timelineMode: "compose", mode: "interactive" },
    }).editorState?.mode).toBe("preview");

    expect(normalizeProject({
      ...projectWithComposition(),
      editorState: { timeline: { displacement: 0, zoom: 1 }, timelineMode: "compose", mode: "code" },
    }).editorState?.mode).toBe("editor");
  });

  it("normalizes persisted editor sessions without runtime source data", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "compose",
        editorSession: {
          tabs: [
            { id: composition.id, filePath: composition.filePath, language: "typescript", source: "runtime-only", isComposition: true },
            { id: "missing", filePath: "compositions/missing.ts", language: "typescript", isComposition: true },
            { id: "notes/readme.md", filePath: "notes/readme.md", language: "markdown", unsupportedReason: "Read-only", isPinned: false },
            { id: "notes/readme.md", filePath: "notes/readme.md", language: "markdown" },
            { id: "plain", filePath: "notes/plain.txt", language: "" },
          ] as Array<{ id: string; filePath: string; language: string; source?: string; unsupportedReason?: string; isComposition?: boolean }>,
          activeTabId: "missing",
        },
      },
    });

    expect(normalized.editorState?.editorSession).toEqual({
      tabs: [
        { id: composition.id, filePath: composition.filePath, language: "typescript", isComposition: true, isPinned: true },
        { id: "notes/readme.md", filePath: "notes/readme.md", language: "markdown", unsupportedReason: "Read-only", isPinned: true },
        { id: "plain", filePath: "notes/plain.txt", language: "plaintext", isPinned: true },
      ],
      activeTabId: composition.id,
    });
  });

  it("serializes timeline-level motion markers independently of compositions", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        adjustmentLayers: [],
        motionMarkers: [{ id: "scene_zoom", kind: "zoom", effectId: "clipper.motion.zoom", layerId: "motion", start: 2, duration: 1, focus: { x: 0.5, y: 0.5 }, scale: 1.5 }],
        settings: {},
      }],
    });

    expect(serialized.timelines?.[0].motionMarkers?.[0]).toMatchObject({ id: "scene_zoom", kind: "zoom", layerId: "motion" });
    expect(serialized.scenes[0].motionMarkers?.[0]).toMatchObject({ id: "scene_zoom", kind: "zoom", layerId: "motion" });
  });

  it("drops stale adjustment blocks that no longer belong to a timeline row on save", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
      },
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, motionMarkers }],
        timelineLayers: {
          compositionLayers: [{ id: "comp" }],
          adjustmentLayers: [{ id: "adjust" }],
          motionLayers: [{ id: "motion", kind: "empty" }],
        },
        adjustmentLayers: [
          { id: "live", name: "Live", layerId: "adjust", start: 0, duration: 1, effect: { effectId: "clipper.adjustment.colourGrade", params: {} } },
          { id: "stale", name: "Stale", layerId: "removed_row", start: 0, duration: 10, effect: { effectId: "clipper.adjustment.colourGrade", params: {} } },
        ],
        settings: {},
      }],
    });

    expect(serialized.timelines?.[0]?.adjustmentLayers?.map((layer) => layer.id)).toEqual(["live"]);
    expect(normalizeProject(serialized).scenes[0].adjustmentLayers!.map((layer) => layer.id)).toEqual(["live"]);
  });

  it("deletes a composition and preserves timeline clips as missing media", () => {
    const normalized = normalizeProject(projectWithComposition());
    const deleted = deleteCompositionFromProject(normalized, "cmp_intro");

    expect(deleted.compositions).toEqual([]);
    expect(deleted.compositionLibrary?.[0]).toMatchObject({ id: "cmp_intro", sourceMissing: true });
    expect(deleted.timelines?.[0].clips[0]).toMatchObject({ compositionId: "cmp_intro" });
    expect(deleted.scenes[0].compositions[0]).toMatchObject({ compositionId: "cmp_intro", sourceMissing: true });
  });

  it("applies graph animations to background elements", () => {
    const applied = applyAnimationGraphToComposition({
      ...composition,
      background: {
        ...composition.background,
        elements: [{ id: "bg_text", name: "BG Text", type: "text", selector: ".bg", bounds: { x: 0, y: 0, width: 100, height: 40 }, style: {}, animations: [] }],
      },
    }, {
      nodes: {},
      customNodes: {
        effect: { kind: "animation", label: "Opacity", scopeKey: "bg_text", details: { property: "opacity" } },
        time: { kind: "time", label: "Time", scopeKey: "bg_text", details: { delay: "0s", duration: "1s" } },
      },
      edges: [
        { id: "effect->time", fromNodeId: "effect", fromPort: "bottom", toNodeId: "time", toPort: "top" },
        { id: "time->layer", fromNodeId: "time", fromPort: "bottom", toNodeId: "layer:bg_text", toPort: "top" },
      ],
      parameters: { effect: { from: "0", to: "1" } },
    });

    expect(applied.background.elements[0].animations?.[0]).toMatchObject({ id: "graph:effect", keyframes: { opacity: [0, 1] } });
  });

  it("normalizes graph deleted node tombstones", () => {
    const normalized = normalizeAnimationGraphState({
      nodes: { "animation:text:anim:opacity:opacity": { x: 1, y: 2 } },
      customNodes: { "animation:text:anim:opacity:opacity": { kind: "animation", label: "Opacity", scopeKey: "text", details: { property: "opacity" } } },
      edges: [{ id: "deleted->layer", fromNodeId: "animation:text:anim:opacity:opacity", fromPort: "bottom", toNodeId: "layer:text", toPort: "top" }],
      parameters: { "animation:text:anim:opacity:opacity": { from: "0", to: "1" } },
      deletedNodeIds: ["animation:text:anim:opacity:opacity", "animation:text:anim:opacity:opacity", ""],
    });

    expect(normalized).toMatchObject({ nodes: {}, edges: [], deletedNodeIds: ["animation:text:anim:opacity:opacity"] });
    expect(normalized?.customNodes).toBeUndefined();
    expect(normalized?.parameters).toBeUndefined();
  });

  it("materializes graph-authored position parameters", () => {
    const applied = applyAnimationGraphToComposition({
      ...composition,
      objects: [{ id: "text", name: "Text", type: "text", selector: ".text", bounds: { x: 0, y: 0, width: 100, height: 40 }, style: {}, animations: [] }],
    }, {
      nodes: {},
      customNodes: {
        effect: { kind: "animation", label: "Position", scopeKey: "text", details: { property: "position" } },
        time: { kind: "time", label: "Time", scopeKey: "text", details: { delay: "0s", duration: "1s" } },
      },
      edges: [
        { id: "effect->time", fromNodeId: "effect", fromPort: "bottom", toNodeId: "time", toPort: "top" },
        { id: "time->layer", fromNodeId: "time", fromPort: "bottom", toNodeId: "layer:text", toPort: "top" },
      ],
      parameters: { effect: { "x from": "10", "x to": "20", "y from": "30", "y to": "40" } },
    });

    expect(applied.objects[0].animations?.[0]).toMatchObject({ id: "graph:effect", keyframes: { x: [10, 20], y: [30, 40] } });
  });

  it("materializes connected group subgraph animations through fixed Out registration", () => {
    const applied = applyAnimationGraphToComposition({
      ...composition,
      objects: [{ id: "text", name: "Text", type: "text", selector: ".text", bounds: { x: 0, y: 0, width: 100, height: 40 }, style: {}, animations: [] }],
    }, {
      nodes: {},
      customNodes: {
        groupNode: { kind: "group", label: "Scale In", scopeKey: "text", details: { groupId: "groupA" } },
        parentTime: { kind: "time", label: "Time", scopeKey: "text", details: { delay: "0s", duration: "1s" } },
      },
      groups: {
        groupA: {
          id: "groupA",
          name: "Scale In",
          outNodeId: "out",
          nodes: {},
          customNodes: {
            scale: { kind: "animation", label: "Scale", scopeKey: "groupA", details: { property: "scale" } },
            time: { kind: "time", label: "Time", scopeKey: "groupA", details: { delay: "0s", duration: "0.7s" } },
          },
          edges: [
            { id: "scale->time", fromNodeId: "scale", fromPort: "bottom", toNodeId: "time", toPort: "top" },
            { id: "time->out", fromNodeId: "time", fromPort: "bottom", toNodeId: "out", toPort: "top" },
          ],
          parameters: { scale: { from: "0", to: "1" } },
        },
      },
      edges: [
        { id: "group->time", fromNodeId: "groupNode", fromPort: "bottom", toNodeId: "parentTime", toPort: "top" },
        { id: "time->layer", fromNodeId: "parentTime", fromPort: "bottom", toNodeId: "layer:text", toPort: "top" },
      ],
    });

    expect(applied.objects[0].animations?.[0]).toMatchObject({ id: "graph:groupNode:scale", keyframes: { scale: [0, 1] } });
  });

  it("keeps disconnected or unregistered group contents graph-only", () => {
    const applied = applyAnimationGraphToComposition({
      ...composition,
      objects: [{ id: "text", name: "Text", type: "text", selector: ".text", bounds: { x: 0, y: 0, width: 100, height: 40 }, style: {}, animations: [] }],
    }, {
      nodes: {},
      customNodes: { groupNode: { kind: "group", label: "Scale In", scopeKey: "text", details: { groupId: "groupA" } } },
      groups: { groupA: { id: "groupA", name: "Scale In", outNodeId: "out", nodes: {}, customNodes: { scale: { kind: "animation", label: "Scale", scopeKey: "groupA", details: { property: "scale" } }, time: { kind: "time", label: "Time", scopeKey: "groupA" } }, edges: [{ id: "scale->time", fromNodeId: "scale", fromPort: "bottom", toNodeId: "time", toPort: "top" }], parameters: { scale: { from: "0", to: "1" } } } },
      edges: [],
    });

    expect(applied.objects[0].animations).toEqual([]);
  });

  it("does not replace unsupported position-like keyframes from stale detected graph nodes", () => {
    const applied = applyAnimationGraphToComposition({
      ...composition,
      objects: [{
        id: "text",
        name: "Text",
        type: "text",
        selector: ".text",
        bounds: { x: 0, y: 0, width: 100, height: 40 },
        style: {},
        animations: [{ id: "z_move", keyframes: { z: [0, 100] }, options: { duration: 1, type: "tween" } }],
      }],
    }, {
      nodes: {},
      customNodes: {
        effect: { kind: "animation", label: "Position", scopeKey: "text", details: { property: "position" } },
        "animation:text:anim:z_move:position": { kind: "animation", label: "Position", scopeKey: "text", details: { property: "position" } },
        time: { kind: "time", label: "Time", scopeKey: "text", details: { delay: "0s", duration: "1s" } },
      },
      edges: [
        { id: "effect->time", fromNodeId: "effect", fromPort: "bottom", toNodeId: "time", toPort: "top" },
        { id: "time->layer", fromNodeId: "time", fromPort: "bottom", toNodeId: "layer:text", toPort: "top" },
      ],
      parameters: { effect: { "x from": "10", "x to": "20", "y from": "30", "y to": "40" } },
    });

    expect(applied.objects[0].animations?.find((animation) => animation.id === "z_move")?.keyframes).toEqual({ z: [0, 100] });
    expect(applied.objects[0].animations?.find((animation) => animation.id === "graph:effect")?.keyframes).toEqual({ x: [10, 20], y: [30, 40] });
  });

  it("serializes graph-authored animation only as timeline graph state", () => {
    const bgText = { id: "bg_text", name: "BG Text", type: "text" as const, selector: ".bg", bounds: { x: 0, y: 0, width: 100, height: 40 }, style: {}, animations: [] };
    const animationGraph = {
      nodes: {
        effect: { x: 0, y: 0 },
        time: { x: 0, y: 4 },
        "layer:bg_text": { x: 0, y: 8 },
      },
      customNodes: {
        effect: { kind: "animation" as const, label: "Opacity", scopeKey: "bg_text", details: { property: "opacity" } },
        time: { kind: "time" as const, label: "Time", scopeKey: "bg_text", details: { delay: "0s", duration: "1s" } },
      },
      edges: [
        { id: "effect->time", fromNodeId: "effect", fromPort: "bottom" as const, toNodeId: "time", toPort: "top" as const },
        { id: "time->layer", fromNodeId: "time", fromPort: "bottom" as const, toNodeId: "layer:bg_text", toPort: "top" as const },
      ],
      parameters: { effect: { from: "0", to: "1" } },
    };
    const graphComposition = {
      ...composition,
      background: { ...composition.background, elements: [bgText] },
    };
    const project = {
      ...projectWithComposition(),
      timelines: [{ id: "tl_main", filePath: "timelines/tl_main.timeline.json", clips: [{ id: composition.id, compositionId: composition.id, duration: composition.duration, animationGraph }], adjustmentLayers: [], settings: {} }],
      compositions: [{ ...graphComposition, source: compositionToSource(graphComposition) }],
      compositionLibrary: [graphComposition],
      compositionSources: { [graphComposition.filePath]: compositionToSource(graphComposition) },
    };

    expect(getSceneFromProject(project, "tl_main")?.compositions[0].background.elements[0].animations?.[0].id).toBe("graph:effect");

    const serialized = serializeProjectForSave(project);
    expect(serialized.timelines?.[0].clips[0].animationGraph).toBeDefined();
    expect(serialized.scenes[0].compositions[0].background.elements[0].animations).toBeUndefined();
  });

  it("omits graph-generated animations from editable composition source", () => {
    const source = compositionToSource({
      ...composition,
      objects: [
        {
          id: "text",
          name: "Text",
          type: "text",
          selector: ".text",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
          style: {},
          animations: [
            { id: "graph:effect", keyframes: { opacity: [0, 1] }, options: { duration: 1, type: "tween" } },
            { id: "authored", keyframes: { scale: [1, 1.1] }, options: { duration: 1, type: "tween" } },
          ],
        },
      ],
    });

    expect(source).not.toContain("graph:effect");
    expect(source).toContain("authored");
  });

  it("persists 3d graph state into editable composition source", () => {
    const source = compositionToSource({
      ...composition,
      renderMode: "webgl",
      composition3dGraph: {
        nodes: { "composition3d:time": { x: 4, y: 5 } },
        edges: [],
        customNodes: { "composition3d:time": { kind: "animation", label: "Time", scopeKey: "composition3d", details: { packageId: "composition3d:time" } } },
      },
    });

    expect(source).toContain("new Composition3D");
    expect(source).not.toContain('renderMode: "webgl"');
    expect(source).toContain("composition3dGraph");
    expect(source).toContain('packageId: "composition3d:time"');
  });

  it("uses source-authored 3d graph over stale empty timeline clip graph", () => {
    const sourceGraph = {
      nodes: { "composition3d:time": { x: 4, y: 5 } },
      edges: [],
      customNodes: { "composition3d:time": { kind: "animation" as const, label: "Time", scopeKey: "composition3d", details: { packageId: "composition3d:time" } } },
    };
    const project = normalizeProject({
      ...projectWithComposition(),
      compositions: [{ ...composition, renderMode: "webgl", composition3dGraph: sourceGraph }],
      compositionLibrary: [{ ...composition, renderMode: "webgl", composition3dGraph: sourceGraph }],
      compositionSources: { [composition.filePath]: compositionToSource({ ...composition, renderMode: "webgl", composition3dGraph: sourceGraph }) },
      timelines: [{ id: "tl_main", filePath: "timelines/tl_main.timeline.json", clips: [{ id: "clip", compositionId: composition.id, renderMode: "webgl", duration: composition.duration, composition3dGraph: { nodes: {}, edges: [] } } as any], adjustmentLayers: [], settings: {} }],
    });

    const scenePart = getSceneFromProject(project, "tl_main")?.compositions[0];
    expect(scenePart?.composition3dGraph?.customNodes?.["composition3d:time"]?.label).toBe("Time");
  });

  it("remaps timeline clip composition references when composition path IDs change", () => {
    const renamedPath = "compositions/renamed_intro.composition.ts";
    const renamed = replacePartInProject(projectWithComposition(), composition.id, (part) => ({ ...part, id: renamedPath, filePath: renamedPath }));

    expect(renamed.compositions?.[0].id).toBe(renamedPath);
    expect(renamed.compositionLibrary?.[0].id).toBe(renamedPath);
    expect(renamed.timelines?.[0].clips[0].compositionId).toBe(renamedPath);
  });

  it("creates one blank default row for each timeline category on the timeline document", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(normalized.timelines?.[0].timelineLayers?.compositionLayers).toEqual([{ id: "comp", name: "Composition", hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].timelineLayers?.adjustmentLayers).toEqual([{ id: "adjust", name: undefined, hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].timelineLayers?.motionLayers).toEqual([{ id: "motion", kind: "empty", name: undefined, hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([{ id: "transition", name: undefined, hidden: undefined, locked: undefined }]);
  });

  it("adds any missing timeline layer categories without replacing existing categories", () => {
    const layers = withRequiredTimelineLayerTypes({ compositionLayers: [{ id: "legacy", name: "Legacy" }] });

    expect(layers.compositionLayers).toEqual([{ id: "legacy", name: "Legacy" }]);
    expect(layers.adjustmentLayers).toEqual(defaultTimelineLayerState.adjustmentLayers);
    expect(layers.motionLayers).toEqual(defaultTimelineLayerState.motionLayers);
    expect(layers.transitionLayers).toEqual(defaultTimelineLayerState.transitionLayers);
  });

  it("keeps only one top transition row and remaps transition markers to it", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [{
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",
        clips: [],
        timelineLayers: {
          compositionLayers: [{ id: "comp" }],
          adjustmentLayers: [{ id: "adjust" }],
          motionLayers: [{ id: "motion", kind: "empty" }],
          transitionLayers: [{ id: "top-transition", name: "Top Transition", hidden: true }, { id: "old-transition", name: "Old Transition" }],
        },
        transitionLayers: [
          { id: "transition-a", name: "A", layerId: "old-transition", start: 0, duration: 2, midPoint: 1, effect: { effectId: "clipper.transition.swipe", params: {} } },
          { id: "transition-b", name: "B", layerId: "top-transition", start: 3, duration: 2, midPoint: 1, effect: { effectId: "clipper.transition.fade", params: {} } },
        ],
        settings: {},
      }],
    });

    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([{ id: "top-transition", name: "Top Transition", hidden: undefined, locked: undefined }]);
    expect(normalized.timelines?.[0].transitionLayers?.map((layer) => layer.layerId)).toEqual(["top-transition", "top-transition"]);
    expect(normalized.scenes[0].transitionLayers?.map((layer) => layer.layerId)).toEqual(["top-transition", "top-transition"]);
  });

  it("creates independent default timeline layer objects for new timelines", () => {
    const first = createDefaultTimelineLayerState();
    const second = createDefaultTimelineLayerState();

    first.compositionLayers![0].name = "Edited";

    expect(second.compositionLayers![0].name).toBe("Composition");
    expect(defaultTimelineLayerState.compositionLayers![0].name).toBe("Composition");
  });

  it("migrates legacy editor timeline layers into existing timelines without keeping global layout state", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: { compositionLayers: [{ id: "legacy", name: "Legacy" }] },
      },
    });

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(normalized.timelines?.[0].timelineLayers?.compositionLayers?.[0]).toMatchObject({ id: "legacy", name: "Legacy" });
  });
});
