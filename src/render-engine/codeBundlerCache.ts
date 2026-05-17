import type { CodeComponent } from "./codeObjectRuntime";
import type { CodeDefaultSettings, CodePropsSchema } from "./codePropsSchema";

const cacheCapacity = 32;

type CacheEntry = {
  hash: string;
  component: CodeComponent;
  schema: CodePropsSchema | null;
  defaultSettings: CodeDefaultSettings | null;
};

type SourceState = {
  status: "idle" | "loading" | "loaded" | "error";
  hash: string | null;
  watchedPath: string | null;
  pendingHash: string | null;
};

const componentCache = new Map<string, CacheEntry>();
const sourceStates = new Map<string, SourceState>();

export function getCachedComponentFor(
  sourcePath: string,
): CodeComponent | null {
  const state = sourceStates.get(sourcePath);
  if (!state || state.status !== "loaded" || !state.hash) return null;
  const entry = componentCache.get(state.hash);
  if (!entry) return null;
  componentCache.delete(state.hash);
  componentCache.set(state.hash, entry);
  return entry.component;
}

export function getCachedSchemaFor(sourcePath: string): CodePropsSchema | null {
  const state = sourceStates.get(sourcePath);
  if (!state || state.status !== "loaded" || !state.hash) return null;
  const entry = componentCache.get(state.hash);
  return entry?.schema ?? null;
}

export function getCachedDefaultSettingsFor(
  sourcePath: string,
): CodeDefaultSettings | null {
  const state = sourceStates.get(sourcePath);
  if (!state || state.status !== "loaded" || !state.hash) return null;
  const entry = componentCache.get(state.hash);
  return entry?.defaultSettings ?? null;
}

export function getCachedComponentByHash(hash: string): CodeComponent | null {
  const entry = componentCache.get(hash);
  if (!entry) return null;
  componentCache.delete(hash);
  componentCache.set(hash, entry);
  return entry.component;
}

export function getCachedEntryByHash(hash: string): CacheEntry | null {
  const entry = componentCache.get(hash);
  if (!entry) return null;
  componentCache.delete(hash);
  componentCache.set(hash, entry);
  return entry;
}

export function storeCachedComponent(
  sourcePath: string,
  hash: string,
  component: CodeComponent,
  schema: CodePropsSchema | null,
  defaultSettings: CodeDefaultSettings | null,
): void {
  componentCache.set(hash, { hash, component, schema, defaultSettings });
  while (componentCache.size > cacheCapacity) {
    const oldestKey = componentCache.keys().next().value;
    if (oldestKey === undefined) break;
    componentCache.delete(oldestKey);
  }
  setSourceState(sourcePath, {
    status: "loaded",
    hash,
    watchedPath: sourceStates.get(sourcePath)?.watchedPath ?? null,
    pendingHash: null,
  });
}

export function getSourceState(sourcePath: string): SourceState | null {
  return sourceStates.get(sourcePath) ?? null;
}

export function setSourceState(sourcePath: string, state: SourceState): void {
  sourceStates.set(sourcePath, state);
}

export function clearSourceState(sourcePath: string): void {
  sourceStates.delete(sourcePath);
}

export function getAllWatchedPaths(): string[] {
  const set = new Set<string>();
  for (const state of sourceStates.values()) {
    if (state.watchedPath) set.add(state.watchedPath);
  }
  return [...set];
}

export function findSourcePathByWatchedPath(
  watchedPath: string,
): string | null {
  for (const [sourcePath, state] of sourceStates) {
    if (state.watchedPath === watchedPath) return sourcePath;
  }
  return null;
}

export function resetCodeBundlerCacheForTesting(): void {
  componentCache.clear();
  sourceStates.clear();
}
