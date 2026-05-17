export interface CompositionCacheEntry {
  compositionId: string;
  version: number;
  cachedVersion: number;
  canvas: HTMLCanvasElement | null;
}

export class CompositionCache {
  private readonly entries = new Map<string, CompositionCacheEntry>();

  get(compositionId: string): CompositionCacheEntry {
    const existing = this.entries.get(compositionId);
    if (existing) return existing;
    const entry: CompositionCacheEntry = {
      compositionId,
      version: 0,
      cachedVersion: -1,
      canvas: null,
    };
    this.entries.set(compositionId, entry);
    return entry;
  }

  invalidate(compositionId: string): void {
    const entry = this.entries.get(compositionId);
    if (!entry) return;
    entry.cachedVersion = -1;
    entry.version += 1;
  }

  invalidateAll(): void {
    for (const entry of this.entries.values()) {
      entry.cachedVersion = -1;
      entry.version += 1;
    }
  }

  bumpVersion(compositionId: string): void {
    const entry = this.get(compositionId);
    entry.version += 1;
  }

  markCached(compositionId: string, canvas: HTMLCanvasElement): void {
    const entry = this.get(compositionId);
    entry.canvas = canvas;
    entry.cachedVersion = entry.version;
  }

  isCached(compositionId: string): boolean {
    const entry = this.entries.get(compositionId);
    if (!entry) return false;
    return entry.canvas !== null && entry.cachedVersion === entry.version;
  }

  knownIds(): string[] {
    return Array.from(this.entries.keys());
  }

  destroy(): void {
    this.entries.clear();
  }
}
