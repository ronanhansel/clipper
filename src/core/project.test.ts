// @ts-nocheck
import { describe, expect, it } from "vitest";
import {
  compositionFromSource,
  compositionToSource,
} from "./compositionSource";
import {
  applyCompositionGraphTransaction,
  carryCompositionGraphTransactionRevisions,
  preserveNewerCompositionGraphTransactions,
} from "./compositionGraphTransactions";
import {
  applyAnimationGraphToComposition,
  createDefaultTimelineLayerState,
  defaultTimelineLayerState,
  deleteCompositionFromProject,
  getSceneFromProject,
  normalizeAnimationGraphState,
  normalizeTypedAnimationGraphState,
  normalizeProject,
  pruneTypedAnimationGraphForObjects,
  replacePartInProject,
  serializeProjectForSave,
  withRequiredTimelineLayerTypes,
} from "./project";
import { motionBlocksToMotionMarkers } from "./motionEffects";
import { createTypedAnimationGraphNode } from "./animationGraph/nodeRegistry";
import {
  compileAnimationGraphForObject,
  planAnimationGraphProgram,
} from "./animationGraph/compiler";
import type {
  AnimationGraphEdge,
  CompositionClip,
  ProjectManifest,
  TypedAnimationGraphNode,
  TypedAnimationGraphState,
} from "./types";

const motionMarkers = motionBlocksToMotionMarkers([
  {
    id: "zoom_1",
    effectId: "clipper.motion.zoom",
    layerId: "clipper.motion.zoom",
    start: 0,
    duration: 1,
    focus: { x: 960, y: 540 },
    scale: 1.2,
    params: { focus: { x: 960, y: 540 }, scale: 1.2 },
  },
]);

const composition: CompositionClip = {
  id: "cmp_intro",
  filePath: "compositions/cmp_intro.ts",
  duration: 5,
  frame: { width: 1920, height: 1080, style: { background: "#050505" } },
  background: {
    id: "background",
    name: "Background",
    style: { background: "#050505" },
    elements: [],
  },
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
    timelines: [
      {
        id: "tl_main",
        filePath: "timelines/tl_main.timeline.json",

        clips: [
          {
            id: composition.id,
            compositionId: composition.id,
            duration: composition.duration,
            motionMarkers,
          },
        ],
        adjustmentLayers: [],
        settings: {},
      },
    ],
    compositions: [
      {
        ...composition,
        source: "export const composition = { id: 'cmp_intro' };",
      },
    ],
    compositionLibrary: [composition],
    compositionSources: {
      [composition.filePath]: "export const composition = { id: 'cmp_intro' };",
    },
  };
}

function typedNode(
  id: string,
  kind: TypedAnimationGraphNode["kind"],
  config: TypedAnimationGraphNode["config"] = {},
  label?: string,
) {
  return createTypedAnimationGraphNode(id, kind, { x: 0, y: 0 }, config, label);
}

function edge(fromNodeId: string, toNodeId: string): AnimationGraphEdge {
  return {
    id: `${fromNodeId}->${toNodeId}`,
    fromNodeId,
    fromPort: "bottom",
    toNodeId,
    toPort: "top",
  };
}

function typedGraph(
  nodes: TypedAnimationGraphNode[],
  edges: AnimationGraphEdge[],
): TypedAnimationGraphState {
  return {
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    edges,
  };
}

function simpleTypedAnimationGraph(
  objectId: string,
  property: string,
  config: Record<string, string> = { from: "0", to: "1" },
) {
  return typedGraph(
    [
      typedNode("source", "source", { objectId }, "Layer"),
      typedNode("effect", "effect", { property, ...config }, "Effect Mix"),
      typedNode("time", "time", { delay: "0s", duration: "1s" }, "Time"),
      typedNode("out", "out", {}, "Out"),
    ],
    [edge("source", "time"), edge("time", "effect"), edge("effect", "out")],
  );
}

describe("project normalization", () => {
  it("prunes strict composition2d graph when source object is removed", () => {
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 0, y: 0 },
          config: { objectId: "text" },
        },
        out: { id: "out", kind: "out", position: { x: 1, y: 0 }, config: {} },
      },
      edges: [
        {
          id: "source:text:out->out:in",
          from: { nodeId: "source:text", portId: "out" },
          to: { nodeId: "out", portId: "in" },
        },
      ],
    };

    expect(
      pruneTypedAnimationGraphForObjects(graph, [
        { ...composition.objects[0], id: "text" },
      ]),
    ).toBe(graph);
    expect(
      pruneTypedAnimationGraphForObjects(graph, [
        { ...composition.objects[0], id: "shape" },
      ]),
    ).toBeUndefined();
  });

  it("drops invalid old composition2d typed graph instead of migrating it", () => {
    const graph = typedGraph(
      [
        typedNode("source:text", "source", { objectId: "text" }),
        typedNode("out", "out"),
      ],
      [edge("source:text", "out")],
    );

    expect(normalizeTypedAnimationGraphState(graph)).toBeUndefined();
  });

  it("creates default strict composition2d graph for eligible objects", () => {
    const object = {
      id: "text",
      name: "Text",
      type: "text" as const,
      selector: "[data-object-id='text']",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
    };
    const project = normalizeProject({
      ...projectWithComposition(),
      compositionLibrary: [{ ...composition, objects: [object] }],
      compositions: [{ ...composition, objects: [object] }],
    });

    const graph = project.compositionLibrary?.[0].animationGraph;
    expect(graph).toMatchObject({
      sourceObjectId: "text",
      nodes: {
        "source:text": { kind: "source", config: { objectId: "text" } },
        "composition2d:out": { kind: "out", config: {} },
      },
      edges: [
        {
          id: "source:text:out->composition2d:out:in",
          from: { nodeId: "source:text", portId: "out" },
          to: { nodeId: "composition2d:out", portId: "in" },
        },
      ],
    });
    expect(graph?.customNodes).toBeUndefined();
    expect(graph?.parameters).toBeUndefined();
    expect(graph?.layers).toBeUndefined();
  });

  it("keeps objects visible with the default strict composition2d graph", () => {
    const object = {
      id: "text",
      name: "Text",
      type: "text" as const,
      selector: "[data-object-id='text']",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
    };
    const project = normalizeProject({
      ...projectWithComposition(),
      compositions: [{ ...composition, objects: [object] }],
    });
    const normalizedComposition = project.compositions?.[0];
    const applied = applyAnimationGraphToComposition(
      normalizedComposition,
      normalizedComposition.animationGraph,
    );

    expect(applied.objects[0].hidden).toBeUndefined();
  });

  it("normalizes timeline clips and composition documents", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.timelines).toHaveLength(1);
    expect(normalized.timelines?.[0].clips[0].motionMarkers).toEqual([]);
    expect(normalized.timelines?.[0].motionMarkers?.[0]).toMatchObject({
      id: "zoom_1",
      kind: "zoom",
      layerId: "clipper.motion.zoom",
      scale: 1.2,
    });
    expect(normalized.compositions).toHaveLength(1);
    expect(normalized.compositionSources?.[composition.filePath]).toBe(
      "export const composition = { id: 'cmp_intro' };",
    );
    expect(normalized.compositions?.[0]).not.toHaveProperty("source");
  });

  it("migrates legacy composition prerender marks onto timeline clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      compositions: [
        {
          ...composition,
          prerender: true,
          source:
            "export const composition = new Composition({\n  duration: 5,\n  prerender: true,\n});",
        },
      ],
      compositionLibrary: [{ ...composition, prerender: true }],
      compositionSources: {
        [composition.filePath]:
          "export const composition = new Composition({\n  duration: 5,\n  prerender: true,\n});",
      },
    });

    expect(normalized.timelines?.[0].clips[0].prerender).toBe(true);
    expect(normalized.scenes[0].compositions[0].prerender).toBe(true);
    expect(normalized.compositions?.[0].prerender).toBeUndefined();
    expect(normalized.compositionLibrary?.[0].prerender).toBeUndefined();
    expect(normalized.compositionSources?.[composition.filePath]).not.toContain(
      "prerender",
    );
  });

  it("preserves existing timeline file paths while syncing runtime scene clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [
        {
          id: "tl_main",
          filePath: "compositions/folder/tl_main.timeline.json",
          clips: [
            {
              id: composition.id,
              compositionId: composition.id,
              duration: composition.duration,
              motionMarkers,
            },
          ],
          adjustmentLayers: [],
          settings: { frameRate: 30 },
        },
      ],
    });

    expect(normalized.timelines?.[0].filePath).toBe(
      "compositions/folder/tl_main.timeline.json",
    );
    expect(normalized.timelines?.[0].settings).toEqual({ frameRate: 30 });
    expect(normalized.timelines?.[0].motionMarkers?.[0]).toMatchObject({
      id: "zoom_1",
      kind: "zoom",
      effectId: "clipper.motion.zoom",
    });
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
      compositions: [
        { ...baseComposition, source: compositionToSource(baseComposition) },
      ],
      compositionLibrary: [baseComposition],
      compositionSources: {
        [baseComposition.filePath]: compositionToSource(baseComposition),
      },
    });
    const editedProject = replacePartInProject(
      baseProject,
      baseComposition.id,
      (part) => ({
        ...part,
        objects: part.objects.map((item) =>
          item.id === object.id
            ? { ...item, bounds: { ...item.bounds, width: 520 } }
            : item,
        ),
      }),
    );
    const editedPart = editedProject.compositionLibrary?.find(
      (item) => item.id === baseComposition.id,
    )!;
    const normalized = normalizeProject({
      ...editedProject,
      compositionSources: {
        [baseComposition.filePath]: compositionToSource(editedPart),
      },
    });

    expect(
      getSceneFromProject(normalized, "tl_main")?.compositions[0].objects[0]
        .bounds.width,
    ).toBe(520);
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
      compositionSources: {
        [baseComposition.filePath]: compositionToSource(editedComposition),
      },
    });

    expect(
      getSceneFromProject(normalized, "tl_main")?.compositions[0].objects[0]
        .bounds.width,
    ).toBe(520);
  });

  it("does not serialize embedded composition source", () => {
    const serialized = serializeProjectForSave(projectWithComposition());

    expect(serialized.compositionSources?.[composition.filePath]).toBe(
      "export const composition = { id: 'cmp_intro' };",
    );
    expect(serialized.compositions?.[0]).not.toHaveProperty("source");
    expect(serialized.compositionLibrary?.[0]).not.toHaveProperty("source");
    expect(serialized.scenes[0]?.compositions[0]).not.toHaveProperty("source");
  });

  it("normalizes composition folder roots without preserving empty compositions or file-manager prefixes", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [],
      compositionFolders: ["compositions", "file-manager/compositions/cards"],
      compositionLibrary: [
        {
          ...composition,
          id: "compositions/title.composition.ts",
          filePath: "compositions/title.composition.ts",
        },
      ],
      compositionSources: { "compositions/title.composition.ts": "source" },
    });

    expect(normalized.compositionFolders).toEqual(["compositions/cards"]);
  });

  it("preserves an intentionally empty timeline instead of restoring old clips", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [],
          adjustmentLayers: [],
          settings: {},
        },
      ],
    });

    expect(normalized.timelines?.[0].clips).toEqual([]);
    expect(normalized.scenes[0].compositions).toEqual([]);
  });

  it("serializes clip motion markers as timeline-level motion markers", () => {
    const serialized = serializeProjectForSave(projectWithComposition());

    expect(serialized.timelines?.[0].clips[0].motionMarkers).toEqual([]);
    expect(serialized.timelines?.[0].motionMarkers?.[0]).toMatchObject({
      id: "zoom_1",
      kind: "zoom",
      effectId: "clipper.motion.zoom",
    });
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
    expect(
      normalizeProject({
        ...projectWithComposition(),
        editorState: {
          timeline: { displacement: 0, zoom: 1 },
          timelineMode: "compose",
          mode: "interactive",
        },
      }).editorState?.mode,
    ).toBe("preview");

    expect(
      normalizeProject({
        ...projectWithComposition(),
        editorState: {
          timeline: { displacement: 0, zoom: 1 },
          timelineMode: "composition",
          mode: "code",
        },
      }).editorState?.mode,
    ).toBe("editor");
  });

  it("restores compose timeline sessions in preview mode", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "compose",
        mode: "editor",
      },
    });

    expect(normalized.editorState?.timelineMode).toBe("compose");
    expect(normalized.editorState?.mode).toBe("preview");
  });

  it("preserves editor mode for direct timeline sessions", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        mode: "editor",
      },
    });

    expect(normalized.editorState?.timelineMode).toBe("composition");
    expect(normalized.editorState?.mode).toBe("editor");
  });

  it("normalizes persisted editor sessions without runtime source data", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "compose",
        editorSession: {
          tabs: [
            {
              id: composition.id,
              filePath: composition.filePath,
              language: "typescript",
              source: "runtime-only",
              isComposition: true,
            },
            {
              id: "missing",
              filePath: "compositions/missing.ts",
              language: "typescript",
              isComposition: true,
            },
            {
              id: "notes/readme.md",
              filePath: "notes/readme.md",
              language: "markdown",
              unsupportedReason: "Read-only",
              isPinned: false,
            },
            {
              id: "notes/readme.md",
              filePath: "notes/readme.md",
              language: "markdown",
            },
            { id: "plain", filePath: "notes/plain.txt", language: "" },
          ] as Array<{
            id: string;
            filePath: string;
            language: string;
            source?: string;
            unsupportedReason?: string;
            isComposition?: boolean;
          }>,
          activeTabId: "missing",
        },
      },
    });

    expect(normalized.editorState?.editorSession).toEqual({
      tabs: [
        {
          id: composition.id,
          filePath: composition.filePath,
          language: "typescript",
          isComposition: true,
          isPinned: true,
        },
        {
          id: "notes/readme.md",
          filePath: "notes/readme.md",
          language: "markdown",
          unsupportedReason: "Read-only",
          isPinned: true,
        },
        {
          id: "plain",
          filePath: "notes/plain.txt",
          language: "plaintext",
          isPinned: true,
        },
      ],
      activeTabId: composition.id,
    });
  });

  it("serializes timeline-level motion markers independently of compositions", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [],
          adjustmentLayers: [],
          motionMarkers: [
            {
              id: "scene_zoom",
              kind: "zoom",
              effectId: "clipper.motion.zoom",
              layerId: "motion",
              start: 2,
              duration: 1,
              focus: { x: 0.5, y: 0.5 },
              scale: 1.5,
            },
          ],
          settings: {},
        },
      ],
    });

    expect(serialized.timelines?.[0].motionMarkers?.[0]).toMatchObject({
      id: "scene_zoom",
      kind: "zoom",
      layerId: "motion",
    });
    expect(serialized.scenes[0].motionMarkers?.[0]).toMatchObject({
      id: "scene_zoom",
      kind: "zoom",
      layerId: "motion",
    });
  });

  it("drops stale adjustment blocks that no longer belong to a timeline row on save", () => {
    const serialized = serializeProjectForSave({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
      },
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [
            {
              id: composition.id,
              compositionId: composition.id,
              duration: composition.duration,
              motionMarkers,
            },
          ],
          timelineLayers: {
            compositionLayers: [{ id: "comp" }],
            adjustmentLayers: [{ id: "adjust" }],
            motionLayers: [{ id: "motion", kind: "empty" }],
          },
          adjustmentLayers: [
            {
              id: "live",
              name: "Live",
              layerId: "adjust",
              start: 0,
              duration: 1,
              effect: {
                effectId: "clipper.adjustment.colourGrade",
                params: {},
              },
            },
            {
              id: "stale",
              name: "Stale",
              layerId: "removed_row",
              start: 0,
              duration: 10,
              effect: {
                effectId: "clipper.adjustment.colourGrade",
                params: {},
              },
            },
          ],
          settings: {},
        },
      ],
    });

    expect(
      serialized.timelines?.[0]?.adjustmentLayers?.map((layer) => layer.id),
    ).toEqual(["live"]);
    expect(
      normalizeProject(serialized).scenes[0].adjustmentLayers!.map(
        (layer) => layer.id,
      ),
    ).toEqual(["live"]);
  });

  it("deletes a composition and preserves timeline clips as missing media", () => {
    const normalized = normalizeProject(projectWithComposition());
    const deleted = deleteCompositionFromProject(normalized, "cmp_intro");

    expect(deleted.compositions).toEqual([]);
    expect(deleted.compositionLibrary?.[0]).toMatchObject({
      id: "cmp_intro",
      sourceMissing: true,
    });
    expect(deleted.timelines?.[0].clips[0]).toMatchObject({
      compositionId: "cmp_intro",
    });
    expect(deleted.scenes[0].compositions[0]).toMatchObject({
      compositionId: "cmp_intro",
      sourceMissing: true,
    });
  });

  it("applies strict compiled graph animations to preview/export composition objects", () => {
    const applied = applyAnimationGraphToComposition(
      {
        ...composition,
        objects: [
          {
            id: "text",
            name: "Text",
            type: "text",
            selector: ".text",
            content: "a b",
            bounds: { x: 0, y: 0, width: 100, height: 40 },
            style: {},
            animations: [
              { id: "graph:old", name: "Old", keyframes: { opacity: [1, 0] } },
            ],
          },
        ],
      },
      {
        id: "graph:text",
        sourceObjectId: "text",
        nodes: {
          source: {
            id: "source",
            kind: "source",
            position: { x: 0, y: 0 },
            config: { objectId: "text" },
          },
          split: {
            id: "split",
            kind: "split",
            position: { x: 0, y: 0 },
            config: { mode: "word" },
          },
          opacity: {
            id: "opacity",
            kind: "effect:clipper.adjustment.opacity",
            position: { x: 0, y: 0 },
            config: { params: { from: 1, to: 0 } },
          },
          out: { id: "out", kind: "out", position: { x: 0, y: 0 }, config: {} },
        },
        edges: [
          {
            id: "source->split",
            from: { nodeId: "source", portId: "out" },
            to: { nodeId: "split", portId: "in" },
          },
          {
            id: "split->opacity",
            from: { nodeId: "split", portId: "tokens" },
            to: { nodeId: "opacity", portId: "in" },
          },
          {
            id: "opacity->out",
            from: { nodeId: "opacity", portId: "out" },
            to: { nodeId: "out", portId: "in" },
          },
        ],
      },
    );

    expect(applied.objects[0].animations).toHaveLength(1);
    expect(applied.objects[0].animations?.[0]).toMatchObject({
      id: "graph:opacity:effect:0",
      keyframes: { opacity: [1, 0] },
      options: { split: { tokenIndexes: [0, 1] } },
    });
  });

  it("removes stale graph animations when strict source is disconnected from Out", () => {
    const applied = applyAnimationGraphToComposition(
      {
        ...composition,
        objects: [
          {
            id: "text",
            name: "Text",
            type: "text",
            selector: ".text",
            content: "a b",
            bounds: { x: 0, y: 0, width: 100, height: 40 },
            style: {},
            animations: [
              { id: "graph:old", name: "Old", keyframes: { opacity: [1, 0] } },
            ],
          },
        ],
      },
      {
        id: "graph:text",
        sourceObjectId: "text",
        nodes: {
          source: {
            id: "source",
            kind: "source",
            position: { x: 0, y: 0 },
            config: { objectId: "text" },
          },
          out: { id: "out", kind: "out", position: { x: 0, y: 0 }, config: {} },
        },
        edges: [],
      },
    );

    expect(applied.objects[0].animations).toEqual([]);
    expect(applied.objects[0].hidden).toBe(true);
  });

  it("materializes preview/export graph animations from shared compiler adapter output", () => {
    const object = {
      id: "text",
      name: "Text",
      type: "text",
      selector: ".text",
      content: "a b",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [
        { id: "manual", name: "Manual", keyframes: { opacity: [0, 1] } },
      ],
    };
    const graph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        source: {
          id: "source",
          kind: "source",
          position: { x: 0, y: 0 },
          config: { objectId: "text" },
        },
        split: {
          id: "split",
          kind: "split",
          position: { x: 0, y: 0 },
          config: { mode: "word" },
        },
        time: {
          id: "time",
          kind: "time",
          position: { x: 0, y: 0 },
          config: { delay: 0.1, duration: 2 },
        },
        pan: {
          id: "pan",
          kind: "effect:clipper.motion.pan",
          position: { x: 0, y: 0 },
          config: { params: { x: 12, y: -4 } },
        },
        out: { id: "out", kind: "out", position: { x: 0, y: 0 }, config: {} },
      },
      edges: [
        {
          id: "source->split",
          from: { nodeId: "source", portId: "out" },
          to: { nodeId: "split", portId: "in" },
        },
        {
          id: "split->time",
          from: { nodeId: "split", portId: "tokens" },
          to: { nodeId: "time", portId: "in" },
        },
        {
          id: "time->pan",
          from: { nodeId: "time", portId: "out" },
          to: { nodeId: "pan", portId: "in" },
        },
        {
          id: "pan->out",
          from: { nodeId: "pan", portId: "out" },
          to: { nodeId: "out", portId: "in" },
        },
      ],
    };

    const compiled = compileAnimationGraphForObject(object, graph);
    const savedGraph = JSON.parse(JSON.stringify(graph));
    const savedCompiled = compileAnimationGraphForObject(object, savedGraph);
    const applied = applyAnimationGraphToComposition(
      { ...composition, objects: [object] },
      graph,
    );
    const appliedFromSaved = applyAnimationGraphToComposition(
      { ...composition, objects: [object] },
      savedGraph,
    );

    expect(compiled.diagnostics).toEqual([]);
    expect(savedCompiled.diagnostics).toEqual([]);
    expect(planAnimationGraphProgram(savedGraph)).toEqual(
      planAnimationGraphProgram(graph),
    );
    expect(savedCompiled.program).toEqual(compiled.program);
    expect(savedCompiled.streams).toEqual(compiled.streams);
    expect(savedCompiled.animations).toEqual(compiled.animations);
    expect(compiled.animations).toEqual([
      {
        id: "graph:pan:effect:0",
        name: "clipper.motion.pan",
        keyframes: { x: [0, 12], y: [0, -4] },
        options: {
          delay: 0.1,
          duration: 2,
          ease: "linear",
          type: "tween",
          repeat: undefined,
          repeatType: undefined,
          split: { mode: "word", stagger: 0, tokenIndexes: [0, 1] },
        },
      },
    ]);
    expect(applied.objects[0].animations).toEqual([
      { id: "manual", name: "Manual", keyframes: { opacity: [0, 1] } },
      ...compiled.animations,
    ]);
    expect(appliedFromSaved.objects[0].animations).toEqual(
      applied.objects[0].animations,
    );
  });

  it("bridges compiled geometry into preview/export object output without persisting it", () => {
    const object = {
      id: "shape-host",
      name: "Shape Host",
      type: "rect",
      selector: ".shape-host",
      bounds: { x: 100, y: 200, width: 400, height: 120 },
      style: {},
    };
    const graph = {
      id: "graph",
      sourceObjectId: object.id,
      nodes: {
        source: {
          id: "source",
          kind: "source",
          position: { x: 0, y: 0 },
          config: { objectId: object.id },
        },
        rect: {
          id: "rect",
          kind: "geometry:rectangle",
          position: { x: 0, y: 0 },
          config: { width: 200, height: 60, color: "#22c55e" },
        },
        out: { id: "out", kind: "out", position: { x: 0, y: 0 }, config: {} },
      },
      edges: [
        {
          id: "source->rect",
          from: { nodeId: "source", portId: "out" },
          to: { nodeId: "rect", portId: "in" },
        },
        {
          id: "rect->out",
          from: { nodeId: "rect", portId: "out" },
          to: { nodeId: "out", portId: "in" },
        },
      ],
    };

    const applied = applyAnimationGraphToComposition(
      { ...composition, objects: [object] },
      graph,
    );
    const saved = serializeProjectForSave({
      ...projectWithComposition(),
      scenes: [{ id: "scene", name: "Scene", compositions: [applied] }],
    });

    expect(applied.objects[0].generatedGeometry).toEqual([
      expect.objectContaining({ type: "shape", color: "#22c55e" }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("generatedGeometry");
  });

  it("preserves non-source object animations when strict graph targets another object", () => {
    const applied = applyAnimationGraphToComposition(
      {
        ...composition,
        objects: [
          {
            id: "text",
            name: "Text",
            type: "text",
            selector: ".text",
            content: "a b",
            bounds: { x: 0, y: 0, width: 100, height: 40 },
            style: {},
            animations: [],
          },
          {
            id: "shape",
            name: "Shape",
            type: "shape",
            selector: ".shape",
            bounds: { x: 0, y: 0, width: 100, height: 40 },
            style: {},
            animations: [
              {
                id: "manual:opacity",
                name: "Manual",
                keyframes: { opacity: [0, 1] },
              },
            ],
          },
        ],
      },
      {
        id: "graph:text",
        sourceObjectId: "text",
        nodes: {
          source: {
            id: "source",
            kind: "source",
            position: { x: 0, y: 0 },
            config: { objectId: "text" },
          },
          opacity: {
            id: "opacity",
            kind: "effect:clipper.adjustment.opacity",
            position: { x: 0, y: 0 },
            config: { params: { from: 1, to: 0 } },
          },
          out: { id: "out", kind: "out", position: { x: 0, y: 0 }, config: {} },
        },
        edges: [
          {
            id: "source->opacity",
            from: { nodeId: "source", portId: "out" },
            to: { nodeId: "opacity", portId: "in" },
          },
          {
            id: "opacity->out",
            from: { nodeId: "opacity", portId: "out" },
            to: { nodeId: "out", portId: "in" },
          },
        ],
      },
    );

    expect(
      applied.objects[0].animations?.map((animation) => animation.id),
    ).toEqual(["graph:opacity:effect:0"]);
    expect(applied.objects[1].animations).toEqual([
      { id: "manual:opacity", name: "Manual", keyframes: { opacity: [0, 1] } },
    ]);
  });

  it("keeps disconnected or unregistered group contents graph-only", () => {
    const applied = applyAnimationGraphToComposition(
      {
        ...composition,
        objects: [
          {
            id: "text",
            name: "Text",
            type: "text",
            selector: ".text",
            bounds: { x: 0, y: 0, width: 100, height: 40 },
            style: {},
            animations: [],
          },
        ],
      },
      {
        nodes: {},
        customNodes: {
          groupNode: {
            kind: "group",
            label: "Scale In",
            scopeKey: "text",
            details: { groupId: "groupA" },
          },
        },
        groups: {
          groupA: {
            id: "groupA",
            name: "Scale In",
            outNodeId: "out",
            nodes: {},
            customNodes: {
              scale: {
                kind: "effect",
                label: "Scale",
                scopeKey: "groupA",
                details: { property: "scale" },
              },
              time: { kind: "time", label: "Time", scopeKey: "groupA" },
            },
            edges: [
              {
                id: "scale->time",
                fromNodeId: "scale",
                fromPort: "bottom",
                toNodeId: "time",
                toPort: "top",
              },
            ],
            parameters: { scale: { from: "0", to: "1" } },
          },
        },
        edges: [],
      },
    );

    expect(applied.objects[0].animations).toEqual([]);
  });

  it("loads 2d effect graph state from composition source", async () => {
    const source = compositionToSource({
      ...composition,
      animationGraph: simpleTypedAnimationGraph("text", "opacity"),
      objects: [
        {
          id: "text",
          name: "Text",
          type: "text",
          selector: ".text",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
          style: {},
        },
      ],
    });

    const loaded = await compositionFromSource(composition, source);

    expect(loaded.animationGraph?.nodes.effect?.label).toBe("Effect Mix");
    expect(loaded.animationGraph?.edges.map((edge) => edge.id)).toEqual([
      "source->time",
      "time->effect",
      "effect->out",
    ]);
    expect(loaded.objects[0].animations).toBeUndefined();
  });

  it("round trips strict source to scale to out graph through composition source", async () => {
    const strictGraph = {
      id: "graph:text",
      sourceObjectId: "text",
      nodes: {
        "source:text": {
          id: "source:text",
          kind: "source",
          position: { x: 2, y: 2 },
          config: { objectId: "text" },
        },
        scale: {
          id: "scale",
          kind: "effect:clipper.motion.zoom",
          position: { x: 10, y: 2 },
          config: {
            effectId: "clipper.motion.zoom",
            params: { scale: 1.4 },
          },
        },
        "composition2d:out": {
          id: "composition2d:out",
          kind: "out",
          position: { x: 18, y: 2 },
          config: {},
        },
      },
      edges: [
        {
          id: "source:text:out->scale:in",
          from: { nodeId: "source:text", portId: "out" },
          to: { nodeId: "scale", portId: "in" },
        },
        {
          id: "scale:out->composition2d:out:in",
          from: { nodeId: "scale", portId: "out" },
          to: { nodeId: "composition2d:out", portId: "in" },
        },
      ],
    };
    const source = compositionToSource({
      ...composition,
      animationGraph: strictGraph,
      objects: [
        {
          id: "text",
          name: "Text",
          type: "text",
          selector: ".text",
          bounds: { x: 0, y: 0, width: 100, height: 40 },
          style: {},
        },
      ],
    });

    const loaded = await compositionFromSource(composition, source);

    expect(source).toContain('"effect:clipper.motion.zoom"');
    expect(loaded.animationGraph).toEqual(strictGraph);
    expect(JSON.stringify(loaded.animationGraph)).not.toMatch(
      /fromNodeId|fromPort|toNodeId|toPort|customNodes|parameters|groups|layers/,
    );
  });

  it("ignores legacy timeline clip effect graph state", () => {
    const bgText = {
      id: "bg_text",
      name: "BG Text",
      type: "text" as const,
      selector: ".bg",
      bounds: { x: 0, y: 0, width: 100, height: 40 },
      style: {},
      animations: [],
    };
    const legacyClipGraph = {
      nodes: {
        effect: { x: 0, y: 0 },
        time: { x: 0, y: 4 },
        "layer:bg_text": { x: 0, y: 8 },
      },
      customNodes: {
        effect: {
          kind: "effect" as const,
          label: "Opacity",
          scopeKey: "bg_text",
          details: { property: "opacity" },
        },
        time: {
          kind: "time" as const,
          label: "Time",
          scopeKey: "bg_text",
          details: { delay: "0s", duration: "1s" },
        },
      },
      edges: [
        {
          id: "effect->time",
          fromNodeId: "effect",
          fromPort: "bottom" as const,
          toNodeId: "time",
          toPort: "top" as const,
        },
        {
          id: "time->layer",
          fromNodeId: "time",
          fromPort: "bottom" as const,
          toNodeId: "layer:bg_text",
          toPort: "top" as const,
        },
      ],
      parameters: { effect: { from: "0", to: "1" } },
    };
    const graphComposition = {
      ...composition,
      background: { ...composition.background, elements: [bgText] },
    };
    const project = normalizeProject({
      ...projectWithComposition(),
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [
            {
              id: composition.id,
              compositionId: composition.id,
              duration: composition.duration,
              animationGraph: legacyClipGraph,
            } as any,
          ],
          adjustmentLayers: [],
          settings: {},
        },
      ],
      compositions: [
        { ...graphComposition, source: compositionToSource(graphComposition) },
      ],
      compositionLibrary: [graphComposition],
      compositionSources: {
        [graphComposition.filePath]: compositionToSource(graphComposition),
      },
    });

    expect(project.timelines?.[0].clips[0]).not.toHaveProperty(
      "animationGraph",
    );
    expect(
      getSceneFromProject(project, "tl_main")?.compositions[0].background
        .elements[0].animations ?? [],
    ).toEqual([]);
  });

  it("writes composition source in the same graph transaction", () => {
    const latestGraph = typedGraph(
      [
        createTypedAnimationGraphNode(
          "source",
          "source",
          { x: 0, y: 0 },
          { objectId: "text" },
        ),
        createTypedAnimationGraphNode(
          "scale",
          "effect",
          { x: 90, y: 120 },
          { effects: [{ property: "scale", values: {}, from: "2", to: "10" }] },
          "Scale",
        ),
        typedNode("out", "out"),
      ],
      [],
    );
    const baseProject = normalizeProject({
      ...projectWithComposition(),
      compositionLibrary: [composition],
      compositions: [composition],
      compositionSources: {
        [composition.filePath]: compositionToSource({
          ...composition,
          animationGraph: typedGraph(
            [
              typedNode("source", "source", { objectId: "text" }),
              createTypedAnimationGraphNode(
                "scale",
                "effect",
                { x: 90, y: 120 },
                {
                  effects: [
                    { property: "scale", values: {}, from: "0", to: "10" },
                  ],
                },
                "Scale",
              ),
              typedNode("out", "out"),
            ],
            [],
          ),
        }),
      },
    });

    const updated = applyCompositionGraphTransaction(baseProject, {
      clipId: composition.id,
      compositionId: composition.id,
      filePath: composition.filePath,
      graph: latestGraph,
      mode: "composition2d",
    });

    expect(updated.compositionSources?.[composition.filePath]).toContain(
      'from: "2"',
    );
    expect(updated.compositionSources?.[composition.filePath]).not.toContain(
      "outputType",
    );
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
            {
              id: "graph:effect",
              keyframes: { opacity: [0, 1] },
              options: { duration: 1, type: "tween" },
            },
            {
              id: "authored",
              keyframes: { scale: [1, 1.1] },
              options: { duration: 1, type: "tween" },
            },
          ],
        },
      ],
    });

    expect(source).not.toContain("graph:effect");
    expect(source).toContain("authored");
  });

  it("normalizes legacy live-dom compositions to dom render mode", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      compositions: [{ ...composition, renderMode: "live-dom" as any }],
      compositionLibrary: [{ ...composition, renderMode: "live-dom" as any }],
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [
            {
              id: "clip",
              compositionId: composition.id,
              renderMode: "live-dom" as any,
              duration: composition.duration,
            } as any,
          ],
          adjustmentLayers: [],
          settings: {},
        },
      ],
    });

    expect(normalized.compositions?.[0].renderMode).toBe("dom");
    expect(normalized.compositionLibrary?.[0].renderMode).toBe("dom");
    expect(normalized.timelines?.[0].clips[0].renderMode).toBe("dom");
  });

  it("remaps timeline clip composition references when composition path IDs change", () => {
    const renamedPath = "compositions/renamed_intro.composition.ts";
    const renamed = replacePartInProject(
      projectWithComposition(),
      composition.id,
      (part) => ({ ...part, id: renamedPath, filePath: renamedPath }),
    );

    expect(renamed.compositions?.[0].id).toBe(renamedPath);
    expect(renamed.compositionLibrary?.[0].id).toBe(renamedPath);
    expect(renamed.timelines?.[0].clips[0].compositionId).toBe(renamedPath);
  });

  it("creates one blank default row for each timeline category on the timeline document", () => {
    const normalized = normalizeProject(projectWithComposition());

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(normalized.timelines?.[0].timelineLayers?.compositionLayers).toEqual(
      [
        {
          id: "comp",
          name: "Composition",
          hidden: undefined,
          locked: undefined,
        },
      ],
    );
    expect(normalized.timelines?.[0].timelineLayers?.adjustmentLayers).toEqual([
      { id: "adjust", name: undefined, hidden: undefined, locked: undefined },
    ]);
    expect(normalized.timelines?.[0].timelineLayers?.motionLayers).toEqual([
      {
        id: "motion",
        kind: "empty",
        name: undefined,
        hidden: undefined,
        locked: undefined,
      },
    ]);
    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([
      {
        id: "transition",
        name: undefined,
        hidden: undefined,
        locked: undefined,
      },
    ]);
  });

  it("adds any missing timeline layer categories without replacing existing categories", () => {
    const layers = withRequiredTimelineLayerTypes({
      compositionLayers: [{ id: "legacy", name: "Legacy" }],
    });

    expect(layers.compositionLayers).toEqual([
      { id: "legacy", name: "Legacy" },
    ]);
    expect(layers.adjustmentLayers).toEqual(
      defaultTimelineLayerState.adjustmentLayers,
    );
    expect(layers.motionLayers).toEqual(defaultTimelineLayerState.motionLayers);
    expect(layers.transitionLayers).toEqual(
      defaultTimelineLayerState.transitionLayers,
    );
  });

  it("keeps only one top transition row and remaps transition markers to it", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      timelines: [
        {
          id: "tl_main",
          filePath: "timelines/tl_main.timeline.json",
          clips: [],
          timelineLayers: {
            compositionLayers: [{ id: "comp" }],
            adjustmentLayers: [{ id: "adjust" }],
            motionLayers: [{ id: "motion", kind: "empty" }],
            transitionLayers: [
              { id: "top-transition", name: "Top Transition", hidden: true },
              { id: "old-transition", name: "Old Transition" },
            ],
          },
          transitionLayers: [
            {
              id: "transition-a",
              name: "A",
              layerId: "old-transition",
              start: 0,
              duration: 2,
              midPoint: 1,
              effect: { effectId: "clipper.transition.swipe", params: {} },
            },
            {
              id: "transition-b",
              name: "B",
              layerId: "top-transition",
              start: 3,
              duration: 2,
              midPoint: 1,
              effect: { effectId: "clipper.transition.fade", params: {} },
            },
          ],
          settings: {},
        },
      ],
    });

    expect(normalized.timelines?.[0].timelineLayers?.transitionLayers).toEqual([
      {
        id: "top-transition",
        name: "Top Transition",
        hidden: undefined,
        locked: undefined,
      },
    ]);
    expect(
      normalized.timelines?.[0].transitionLayers?.map((layer) => layer.layerId),
    ).toEqual(["top-transition", "top-transition"]);
    expect(
      normalized.scenes[0].transitionLayers?.map((layer) => layer.layerId),
    ).toEqual(["top-transition", "top-transition"]);
  });

  it("creates independent default timeline layer objects for new timelines", () => {
    const first = createDefaultTimelineLayerState();
    const second = createDefaultTimelineLayerState();

    first.compositionLayers![0].name = "Edited";

    expect(second.compositionLayers![0].name).toBe("Composition");
    expect(defaultTimelineLayerState.compositionLayers![0].name).toBe(
      "Composition",
    );
  });

  it("migrates legacy editor timeline layers into existing timelines without keeping global layout state", () => {
    const normalized = normalizeProject({
      ...projectWithComposition(),
      editorState: {
        timeline: { displacement: 0, zoom: 1 },
        timelineMode: "composition",
        timelineLayers: {
          compositionLayers: [{ id: "legacy", name: "Legacy" }],
        },
      },
    });

    expect(normalized.editorState?.timelineLayers).toBeUndefined();
    expect(
      normalized.timelines?.[0].timelineLayers?.compositionLayers?.[0],
    ).toMatchObject({ id: "legacy", name: "Legacy" });
  });
});
