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

export function applyCompositionGraphTransaction(
  project: ProjectManifest,
  transaction: CompositionGraphTransaction,
): ProjectManifest {
  const updateComposition = (composition: CompositionClip) => {
    if (!compositionMatchesGraphTransaction(composition, transaction))
      return composition;
    if (transaction.mode === "composition3d")
      return {
        ...composition,
        renderMode: "webgl" as const,
        composition3dGraph: transaction.graph as Composition3dGraphState,
      };
    if (transaction.mode === "background")
      return { ...composition, bgGraph: transaction.graph };
    return { ...composition, animationGraph: transaction.graph };
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

function compositionMatchesGraphTransaction(
  composition: CompositionClip,
  transaction: CompositionGraphTransaction,
) {
  return Boolean(
    (transaction.compositionId && composition.id === transaction.compositionId) ||
      (transaction.clipId && composition.id === transaction.clipId) ||
      composition.filePath === transaction.filePath,
  );
}
