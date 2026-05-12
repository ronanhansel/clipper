import type { GraphCompositionMode } from "./graphSockets";
import { compositionToSource } from "./compositionSource";
import type {
  AnimationGraphState,
  CompositionClip,
  ProjectManifest,
  TypedAnimationGraphState,
} from "./types";
import type { AnimationGraph as StrictAnimationGraph } from "./animationGraph/types";

type CompositionGraphState =
  | StrictAnimationGraph
  | TypedAnimationGraphState
  | AnimationGraphState;

export type CompositionGraphTransaction = {
  compositionId?: string;
  clipId?: string;
  filePath: string;
  mode: GraphCompositionMode;
  graph: CompositionGraphState;
};

const compositionGraphRevisionByGraph = new WeakMap<
  CompositionGraphState,
  number
>();
const compositionGraphRevisionBySignature = new Map<string, number>();
let compositionGraphRevisionSequence = 0;

function getCompositionGraphSignature(
  graph: CompositionGraphState | undefined,
) {
  return graph ? JSON.stringify(graph) : "";
}

function getCompositionGraph(
  composition: CompositionClip,
  _mode: GraphCompositionMode,
) {
  return composition.animationGraph;
}

function setCompositionGraph(
  composition: CompositionClip,
  _mode: GraphCompositionMode,
  graph: CompositionGraphState,
) {
  return { ...composition, animationGraph: graph as StrictAnimationGraph };
}

function getCompositionGraphRevision(graph: CompositionGraphState | undefined) {
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

function markCompositionGraphRevision(graph: CompositionGraphState) {
  const revision = ++compositionGraphRevisionSequence;
  setCompositionGraphRevision(graph, revision);
  return revision;
}

function setCompositionGraphRevision(
  graph: CompositionGraphState,
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
  if (transaction.mode !== "composition2d") return project;
  const revision = markCompositionGraphRevision(transaction.graph);
  const updatedSources = { ...(project.compositionSources ?? {}) };
  const updateComposition = (composition: CompositionClip) => {
    if (!compositionMatchesGraphTransaction(composition, transaction))
      return composition;
    setCompositionGraphRevision(transaction.graph, revision);
    const updatedComposition = setCompositionGraph(
      composition,
      transaction.mode,
      transaction.graph,
    );
    if (!updatedComposition.sourceMissing)
      updatedSources[updatedComposition.filePath] =
        compositionToSource(updatedComposition);
    return updatedComposition;
  };

  return {
    ...project,
    compositionSources: updatedSources,
    compositionLibrary: project.compositionLibrary?.map(updateComposition),
    compositions: project.compositions?.map(updateComposition),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      compositions: scene.compositions.map(updateComposition),
    })),
    timelines: project.timelines,
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
    for (const mode of ["composition2d"] as const) {
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
  const preserveComposition = (composition: CompositionClip) => {
    const currentComposition = findCurrentComposition(composition);
    if (!currentComposition) return composition;
    return (["composition2d"] as const).reduce((nextComposition, mode) => {
      const currentGraph = getCompositionGraph(currentComposition, mode);
      const nextGraph = getCompositionGraph(nextComposition, mode);
      if (
        getCompositionGraphRevision(currentGraph) <=
        getCompositionGraphRevision(nextGraph)
      )
        return nextComposition;
      return setCompositionGraph(nextComposition, mode, currentGraph!);
    }, composition);
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
    timelines: nextProject.timelines,
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
