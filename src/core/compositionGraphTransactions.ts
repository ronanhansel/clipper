import type { GraphCompositionMode } from "./graphSockets";
import type {
  AnimationGraphState,
  Composition3dGraphState,
  CompositionClip,
  ProjectManifest,
} from "./types";

export type CompositionGraphTransaction = {
  compositionId?: string;
  clipId?: string;
  filePath: string;
  mode: GraphCompositionMode;
  graph: AnimationGraphState;
};

const compositionGraphRevisionByGraph = new WeakMap<
  AnimationGraphState,
  number
>();
const compositionGraphRevisionBySignature = new Map<string, number>();
let compositionGraphRevisionSequence = 0;

function getCompositionGraphSignature(graph: AnimationGraphState | undefined) {
  return graph ? JSON.stringify(graph) : "";
}

function getCompositionGraph(
  composition: CompositionClip,
  mode: GraphCompositionMode,
) {
  if (mode === "composition3d")
    return composition.composition3dGraph as AnimationGraphState | undefined;
  if (mode === "background") return composition.bgGraph;
  return composition.animationGraph;
}

function setCompositionGraph(
  composition: CompositionClip,
  mode: GraphCompositionMode,
  graph: AnimationGraphState,
) {
  if (mode === "composition3d")
    return {
      ...composition,
      renderMode: "webgl" as const,
      composition3dGraph: graph as Composition3dGraphState,
    };
  if (mode === "background") return { ...composition, bgGraph: graph };
  return { ...composition, animationGraph: graph };
}

function getCompositionGraphRevision(graph: AnimationGraphState | undefined) {
  if (!graph) return 0;
  const graphRevision = compositionGraphRevisionByGraph.get(graph);
  if (graphRevision) return graphRevision;
  const signatureRevision = compositionGraphRevisionBySignature.get(
    getCompositionGraphSignature(graph),
  );
  if (signatureRevision)
    compositionGraphRevisionByGraph.set(graph, signatureRevision);
  return signatureRevision ?? 0;
}

function markCompositionGraphRevision(graph: AnimationGraphState) {
  const revision = ++compositionGraphRevisionSequence;
  setCompositionGraphRevision(graph, revision);
  return revision;
}

function setCompositionGraphRevision(
  graph: AnimationGraphState,
  revision: number,
) {
  compositionGraphRevisionByGraph.set(graph, revision);
  compositionGraphRevisionBySignature.set(
    getCompositionGraphSignature(graph),
    revision,
  );
}

export function applyCompositionGraphTransaction(
  project: ProjectManifest,
  transaction: CompositionGraphTransaction,
): ProjectManifest {
  const revision = markCompositionGraphRevision(transaction.graph);
  const updateComposition = (composition: CompositionClip) => {
    if (!compositionMatchesGraphTransaction(composition, transaction))
      return composition;
    setCompositionGraphRevision(transaction.graph, revision);
    return setCompositionGraph(
      composition,
      transaction.mode,
      transaction.graph,
    );
  };

  return {
    ...project,
    compositionLibrary: project.compositionLibrary?.map(updateComposition),
    compositions: project.compositions?.map(updateComposition),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      compositions: scene.compositions.map(updateComposition),
    })),
    timelines: project.timelines?.map((timeline) => ({
      ...timeline,
      clips: timeline.clips.map((clip) =>
        clip.id === transaction.clipId && transaction.mode === "composition3d"
          ? { ...clip, renderMode: "webgl" as const }
          : clip,
      ),
    })),
  };
}

export function carryCompositionGraphTransactionRevisions(
  sourceProject: ProjectManifest,
  targetProject: ProjectManifest,
) {
  const sourceCompositions = [
    ...(sourceProject.compositionLibrary ?? []),
    ...(sourceProject.compositions ?? []),
    ...sourceProject.scenes.flatMap((scene) => scene.compositions),
  ];
  const findSourceComposition = (composition: CompositionClip) =>
    sourceCompositions.find(
      (source) =>
        source.id === composition.id ||
        source.filePath === composition.filePath,
    );
  const carryComposition = (composition: CompositionClip) => {
    const sourceComposition = findSourceComposition(composition);
    if (!sourceComposition) return;
    for (const mode of [
      "composition2d",
      "background",
      "composition3d",
    ] as const) {
      const revision = getCompositionGraphRevision(
        getCompositionGraph(sourceComposition, mode),
      );
      const targetGraph = getCompositionGraph(composition, mode);
      if (revision && targetGraph)
        setCompositionGraphRevision(targetGraph, revision);
    }
  };
  targetProject.compositionLibrary?.forEach(carryComposition);
  targetProject.compositions?.forEach(carryComposition);
  targetProject.scenes.forEach((scene) =>
    scene.compositions.forEach(carryComposition),
  );
}

export function preserveNewerCompositionGraphTransactions(
  currentProject: ProjectManifest,
  nextProject: ProjectManifest,
): ProjectManifest {
  const currentCompositions = [
    ...(currentProject.compositionLibrary ?? []),
    ...(currentProject.compositions ?? []),
    ...currentProject.scenes.flatMap((scene) => scene.compositions),
  ];
  const findCurrentComposition = (composition: CompositionClip) =>
    currentCompositions.find(
      (current) =>
        current.id === composition.id ||
        current.filePath === composition.filePath,
    );
  const graphWasPreserved = new Set<string>();
  const preserveComposition = (composition: CompositionClip) => {
    const currentComposition = findCurrentComposition(composition);
    if (!currentComposition) return composition;
    return (["composition2d", "background", "composition3d"] as const).reduce(
      (nextComposition, mode) => {
        const currentGraph = getCompositionGraph(currentComposition, mode);
        const nextGraph = getCompositionGraph(nextComposition, mode);
        if (
          getCompositionGraphRevision(currentGraph) <=
          getCompositionGraphRevision(nextGraph)
        )
          return nextComposition;
        graphWasPreserved.add(`${composition.id}:${mode}`);
        graphWasPreserved.add(`${composition.filePath}:${mode}`);
        return setCompositionGraph(nextComposition, mode, currentGraph!);
      },
      composition,
    );
  };

  return {
    ...nextProject,
    compositionLibrary:
      nextProject.compositionLibrary?.map(preserveComposition),
    compositions: nextProject.compositions?.map(preserveComposition),
    scenes: nextProject.scenes.map((scene) => ({
      ...scene,
      compositions: scene.compositions.map(preserveComposition),
    })),
    timelines: nextProject.timelines?.map((timeline) => ({
      ...timeline,
      clips: timeline.clips.map((clip) =>
        clip.compositionId &&
        graphWasPreserved.has(`${clip.compositionId}:composition3d`)
          ? { ...clip, renderMode: "webgl" as const }
          : clip,
      ),
    })),
  };
}

function compositionMatchesGraphTransaction(
  composition: CompositionClip,
  transaction: CompositionGraphTransaction,
) {
  return Boolean(
    (transaction.compositionId &&
      composition.id === transaction.compositionId) ||
    composition.filePath === transaction.filePath,
  );
}
