import type { CompositionClip } from "../../../core/types";

export function compositionMatchesIdentity(composition: Pick<CompositionClip, "id" | "filePath" | "compositionId">, identity: string) {
  return composition.id === identity || composition.compositionId === identity || composition.filePath === identity || composition.filePath.endsWith(`/${identity}`);
}

export function resolveCanonicalComposition(
  compositionLibrary: CompositionClip[],
  timelineCompositions: CompositionClip[],
  identity: string,
) {
  const timelineMatch = timelineCompositions.find((composition) => compositionMatchesIdentity(composition, identity));
  const canonicalId = timelineMatch?.compositionId ?? timelineMatch?.id ?? identity;
  return compositionLibrary.find((composition) => compositionMatchesIdentity(composition, canonicalId))
    ?? compositionLibrary.find((composition) => compositionMatchesIdentity(composition, identity))
    ?? timelineMatch
    ?? null;
}
