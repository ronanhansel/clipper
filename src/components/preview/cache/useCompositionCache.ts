import { useEffect, useRef } from "react";
import type { CompositionClip, ProjectManifest } from "../../../core/types";
import { useProjectStore } from "../../../app/state/projectStore";
import {
  CompositionCache,
  type CompositionCacheEntry,
} from "./compositionCache";

export type RenderIntoCache = (entry: CompositionCacheEntry) => boolean;

export type UseCompositionCacheResult = {
  cache: CompositionCache;
  getCacheKey: (compositionId: string) => number;
  invalidate: (compositionId: string) => void;
  isCached: (compositionId: string) => boolean;
  getOrRender: (
    compositionId: string,
    render: RenderIntoCache,
  ) => CompositionCacheEntry;
};

export function useCompositionCache(): UseCompositionCacheResult {
  const cacheRef = useRef<CompositionCache | null>(null);
  if (!cacheRef.current) cacheRef.current = new CompositionCache();
  const cache = cacheRef.current;

  const project = useProjectStore((store) => store.project);
  const fingerprintsRef = useRef(new Map<string, string>());

  useEffect(() => {
    const fingerprintsByComp = fingerprintsRef.current;
    const seen = new Set<string>();
    collectCompositionClips(project, (clip) => {
      seen.add(clip.id);
      const fingerprint = fingerprintComposition(clip);
      const previous = fingerprintsByComp.get(clip.id);
      if (previous !== fingerprint) {
        fingerprintsByComp.set(clip.id, fingerprint);
        if (previous !== undefined) cache.bumpVersion(clip.id);
        else cache.get(clip.id);
      }
    });
    for (const id of Array.from(fingerprintsByComp.keys())) {
      if (!seen.has(id)) {
        fingerprintsByComp.delete(id);
        cache.invalidate(id);
      }
    }
  }, [cache, project]);

  useEffect(() => {
    return () => {
      cache.destroy();
    };
  }, [cache]);

  return {
    cache,
    getCacheKey: (id) => cache.get(id).version,
    invalidate: (id) => cache.invalidate(id),
    isCached: (id) => cache.isCached(id),
    getOrRender: (id, render) => {
      const entry = cache.get(id);
      if (entry.cachedVersion === entry.version && entry.canvas) return entry;
      const ok = render(entry);
      if (ok && entry.canvas) cache.markCached(id, entry.canvas);
      return entry;
    },
  };
}

function collectCompositionClips(
  project: ProjectManifest,
  visit: (clip: CompositionClip) => void,
) {
  if (project.compositionLibrary) {
    for (const clip of project.compositionLibrary) visit(clip);
  }
  for (const scene of project.scenes ?? []) {
    for (const clip of scene.compositions ?? []) visit(clip);
  }
  if (project.compositions) {
    for (const clip of project.compositions) visit(clip);
  }
}

function fingerprintComposition(clip: CompositionClip): string {
  return JSON.stringify({
    id: clip.id,
    duration: clip.duration,
    background: clip.background,
    objects: clip.objects,
    motionMarkers: clip.motionMarkers,
    snapshot: clip.snapshot,
    frame: clip.frame,
    renderMode: clip.renderMode,
    source: clip.source,
    filePath: clip.filePath,
  });
}
