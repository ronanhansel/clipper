import { useEffect } from "react";
import toast from "react-hot-toast";
import { useAppSettingsStore } from "../../state/appSettingsStore";
import { clipperHost } from "../../clipperHost";
import {
  compositionMatchesIdentity,
  resolveCanonicalComposition,
} from "../file-manager/compositionIdentity";
import type { CompositionClip, ProjectManifest } from "../../../core/types";

type UpdateProject = (
  updater: ProjectManifest | ((current: ProjectManifest) => ProjectManifest),
  options?: { history?: boolean },
) => void;

type UsePrerenderSettingsParams = {
  activeProjectManifestPath: string;
};

type UsePrerenderCompositionActionsParams = {
  compositionLibrary: CompositionClip[];
  scene: {
    id: string;
    compositions: CompositionClip[];
  };
  manualPrerenderCompositionIds: Set<string>;
  prerenderCache: {
    prerenderComposition: (compositionId: string) => Promise<{
      visibleRanges: number;
      queuedBlocks: number;
      completed: boolean;
    }>;
  };
  implicitFileOperation: <T extends unknown[]>(
    fn: (...args: T) => void,
  ) => (...args: T) => void;
  updateProject: UpdateProject;
};

export function usePrerenderSettings({
  activeProjectManifestPath,
}: UsePrerenderSettingsParams) {
  const prerenderBlockDurationMs = useAppSettingsStore(
    (state) => state.prerenderBlockDurationMs,
  );
  const prerenderCacheResetToken = useAppSettingsStore(
    (state) => state.prerenderCacheResetToken,
  );
  const setPrerenderBlockDurationMs = useAppSettingsStore(
    (state) => state.setPrerenderBlockDurationMs,
  );
  const resetPrerenderCache = useAppSettingsStore(
    (state) => state.resetPrerenderCache,
  );

  function clearAllPrerenderCaches() {
    void (async () => {
      try {
        const result = await clipperHost.clearAllPrerenderCaches();
        await clipperHost.clearPrerenderCache(activeProjectManifestPath);
        resetPrerenderCache();
        toast.success(
          `Cleared prerender caches for ${result.clearedCount} project${result.clearedCount === 1 ? "" : "s"}.`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to clear prerender caches.",
        );
      }
    })();
  }

  return {
    prerenderBlockDurationMs,
    prerenderCacheResetToken,
    setPrerenderBlockDurationMs,
    clearAllPrerenderCaches,
    resetPrerenderCache,
  };
}

function compositionMatchesManualPrerenderId(
  composition: CompositionClip,
  targetId: string,
) {
  return (
    composition.id === targetId ||
    composition.compositionId === targetId ||
    (composition.compositionId &&
      compositionMatchesIdentity(composition, targetId))
  );
}

export function usePrerenderCompositionActions({
  compositionLibrary,
  scene,
  manualPrerenderCompositionIds,
  prerenderCache,
  implicitFileOperation,
  updateProject,
}: UsePrerenderCompositionActionsParams) {
  async function togglePrerenderCompositionFromLibrary(compositionId: string) {
    const isTimelineClipTarget = scene.compositions.some(
      (composition) => composition.id === compositionId,
    );
    const sourceComposition = resolveCanonicalComposition(
      compositionLibrary,
      scene.compositions,
      compositionId,
    );
    const sourceId =
      sourceComposition?.compositionId ??
      sourceComposition?.id ??
      compositionId;
    const matchingTimelineClips = scene.compositions.filter((composition) =>
      compositionMatchesManualPrerenderId(composition, compositionId),
    );
    const currentlyMarked =
      matchingTimelineClips.length > 0
        ? matchingTimelineClips.every((composition) => composition.prerender)
        : manualPrerenderCompositionIds.has(sourceId);
    if (currentlyMarked) {
      implicitFileOperation(setCompositionPrerenderMark)(
        compositionId,
        false,
        isTimelineClipTarget ? compositionId : undefined,
      );
      return;
    }
    implicitFileOperation(setCompositionPrerenderMark)(
      compositionId,
      true,
      isTimelineClipTarget ? compositionId : undefined,
    );
    const result = await prerenderCache.prerenderComposition(compositionId);
    if (
      result.visibleRanges === 0 ||
      result.queuedBlocks === 0 ||
      !result.completed
    )
      return;
  }

  function setCompositionPrerenderMark(
    compositionId: string,
    marked: boolean,
    timelineClipId?: string,
  ) {
    updateProject(
      (current) => ({
        ...current,
        timelines: (current.timelines ?? []).map((timeline) =>
          timeline.id === scene.id
            ? {
                ...timeline,
                clips: timeline.clips.map((clip) => {
                  const matchesClip = timelineClipId
                    ? clip.id === timelineClipId
                    : clip.compositionId === compositionId ||
                      clip.id === compositionId;
                  return matchesClip
                    ? { ...clip, prerender: marked || undefined }
                    : clip;
                }),
              }
            : timeline,
        ),
      }),
      { history: true },
    );
  }

  return { togglePrerenderCompositionFromLibrary };
}
