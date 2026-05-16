import { createElement, type ReactNode } from "react";
import { bundleCodeAsset, type AssetResolver } from "./codeBundler";
import {
  clearSourceState,
  findSourcePathByWatchedPath,
  getAllWatchedPaths,
  getSourceState,
  getCachedEntryByHash,
  getCachedComponentFor,
  getCachedSchemaFor,
  setSourceState,
  storeCachedComponent,
} from "./codeBundlerCache";
import { parseCodePropsSchema, type CodePropsSchema } from "./codePropsSchema";

export type CodeComponentArgs = {
  time: number;
  props: Record<string, unknown>;
  size: { width: number; height: number };
};

export type CodeComponent = (args: CodeComponentArgs) => ReactNode;

export type CodeObjectError = {
  message: string;
  stack?: string;
  location?: { file: string; line: number; column: number };
};

export type CodeSourceLoader = "tsx" | "ts" | "jsx" | "js";

export type CodeSourceEntry = {
  source: string;
  loader: CodeSourceLoader;
};

export type CodeImportResolution = CodeSourceEntry & {
  resolvedSourcePath: string;
};

export type CodeObjectRuntimeHost = {
  readEntrySource: (sourcePath: string) => Promise<CodeSourceEntry | null>;
  readImportSource: (
    importPath: string,
    importerSourcePath: string,
  ) => Promise<CodeImportResolution | null>;
  setWatchedSources: (sourcePaths: string[]) => void;
  subscribeSourceChanges: (
    listener: (sourcePath: string) => void,
  ) => () => void;
};

const errors = new Map<string, CodeObjectError>();
const errorSubscribers = new Set<() => void>();
const componentSubscribers = new Set<() => void>();
const retainCounts = new Map<string, number>();

let runtimeHost: CodeObjectRuntimeHost | null = null;
let unsubscribeSourceChanges: (() => void) | null = null;
let componentTick = 0;

export function configureCodeObjectRuntime(
  host: CodeObjectRuntimeHost,
): () => void {
  runtimeHost = host;
  unsubscribeSourceChanges?.();
  unsubscribeSourceChanges = host.subscribeSourceChanges((sourcePath) => {
    handleSourceChange(sourcePath);
  });
  refreshWatchList();
  return () => {
    if (runtimeHost === host) {
      unsubscribeSourceChanges?.();
      unsubscribeSourceChanges = null;
      runtimeHost = null;
    }
  };
}

export function loadCodeComponent(
  sourcePath: string | null,
): CodeComponent | null {
  if (!sourcePath) return createUnsetPlaceholder(null);
  const cached = getCachedComponentFor(sourcePath);
  if (cached) return cached;
  ensureBundleStarted(sourcePath);
  const state = getSourceState(sourcePath);
  if (state?.status === "error") return createErrorPlaceholder(sourcePath);
  return createLoadingPlaceholder(sourcePath);
}

export function loadCodePropsSchema(
  sourcePath: string | null,
): CodePropsSchema | null {
  if (!sourcePath) return null;
  return getCachedSchemaFor(sourcePath);
}

export function retainCodeSource(sourcePath: string): void {
  if (!sourcePath) return;
  retainCounts.set(sourcePath, (retainCounts.get(sourcePath) ?? 0) + 1);
  refreshWatchList();
  ensureBundleStarted(sourcePath);
}

export function releaseCodeSource(sourcePath: string): void {
  if (!sourcePath) return;
  const previous = retainCounts.get(sourcePath) ?? 0;
  if (previous <= 1) {
    retainCounts.delete(sourcePath);
    clearSourceState(sourcePath);
  } else {
    retainCounts.set(sourcePath, previous - 1);
  }
  refreshWatchList();
}

export function getCodeObjectError(objectId: string): CodeObjectError | null {
  return errors.get(objectId) ?? null;
}

export function setCodeObjectError(
  objectId: string,
  error: CodeObjectError,
): void {
  errors.set(objectId, error);
  notifyErrorSubscribers();
}

export function clearCodeObjectError(objectId: string): void {
  if (!errors.has(objectId)) return;
  errors.delete(objectId);
  notifyErrorSubscribers();
}

export function subscribeCodeObjectErrors(listener: () => void): () => void {
  errorSubscribers.add(listener);
  return () => {
    errorSubscribers.delete(listener);
  };
}

export function subscribeCodeObjectComponents(
  listener: () => void,
): () => void {
  componentSubscribers.add(listener);
  return () => {
    componentSubscribers.delete(listener);
  };
}

export function getCodeObjectComponentTick(): number {
  return componentTick;
}

function ensureBundleStarted(sourcePath: string): void {
  if (!runtimeHost) return;
  const state = getSourceState(sourcePath);
  if (state?.status === "loading" || state?.status === "loaded") return;
  void runBundleForSource(sourcePath);
}

async function runBundleForSource(sourcePath: string): Promise<void> {
  const host = runtimeHost;
  if (!host) return;

  const tick = Symbol("bundle-attempt");
  setSourceState(sourcePath, {
    status: "loading",
    hash: getSourceState(sourcePath)?.hash ?? null,
    watchedPath: getSourceState(sourcePath)?.watchedPath ?? sourcePath,
    pendingHash: tick.toString(),
  });

  let entry: CodeSourceEntry | null;
  try {
    entry = await host.readEntrySource(sourcePath);
  } catch (error) {
    setSourceState(sourcePath, {
      status: "error",
      hash: null,
      watchedPath: sourcePath,
      pendingHash: null,
    });
    setCodeObjectError(codeBundlerErrorKey(sourcePath), {
      message:
        error instanceof Error
          ? error.message
          : `Unable to read code source ${sourcePath}.`,
    });
    refreshWatchList();
    notifyComponentSubscribers();
    return;
  }

  if (!entry) {
    setSourceState(sourcePath, {
      status: "error",
      hash: null,
      watchedPath: sourcePath,
      pendingHash: null,
    });
    setCodeObjectError(codeBundlerErrorKey(sourcePath), {
      message: `Code source not found: ${sourcePath}`,
    });
    refreshWatchList();
    notifyComponentSubscribers();
    return;
  }

  const visitedPaths = new Set<string>();
  visitedPaths.add(sourcePath);

  const resolveImport: AssetResolver = async (importPath, importer) => {
    const importerSourcePath = importer ?? sourcePath;
    const resolved = await host.readImportSource(
      importPath,
      importerSourcePath,
    );
    if (!resolved) return null;
    visitedPaths.add(resolved.resolvedSourcePath);
    return {
      absolutePath: resolved.resolvedSourcePath,
      source: resolved.source,
      loader: resolved.loader,
    };
  };

  const result = await bundleCodeAsset(
    {
      absolutePath: sourcePath,
      source: entry.source,
      loader: entry.loader,
    },
    resolveImport,
  );

  if (!result.ok) {
    setSourceState(sourcePath, {
      status: "error",
      hash: null,
      watchedPath: sourcePath,
      pendingHash: null,
    });
    setCodeObjectError(codeBundlerErrorKey(sourcePath), {
      message: result.message,
      location: result.location,
    });
    setSourceWatchedPathsFor(sourcePath, [...visitedPaths]);
    refreshWatchList();
    notifyComponentSubscribers();
    return;
  }

  const cachedEntry = getCachedEntryByHash(result.hash);
  if (cachedEntry) {
    storeCachedComponent(
      sourcePath,
      result.hash,
      cachedEntry.component,
      cachedEntry.schema,
    );
    setSourceWatchedPathsFor(sourcePath, [...visitedPaths]);
    clearCodeObjectError(codeBundlerErrorKey(sourcePath));
    refreshWatchList();
    notifyComponentSubscribers();
    return;
  }

  let module: { default?: unknown; propsSchema?: unknown };
  try {
    module = await importBundleAsModule(result.code);
  } catch (error) {
    setSourceState(sourcePath, {
      status: "error",
      hash: null,
      watchedPath: sourcePath,
      pendingHash: null,
    });
    setCodeObjectError(codeBundlerErrorKey(sourcePath), {
      message:
        error instanceof Error ? error.message : "Module evaluation failed.",
      stack: error instanceof Error ? error.stack : undefined,
    });
    setSourceWatchedPathsFor(sourcePath, [...visitedPaths]);
    refreshWatchList();
    notifyComponentSubscribers();
    return;
  }

  const candidate = module.default;
  if (typeof candidate !== "function") {
    setSourceState(sourcePath, {
      status: "error",
      hash: null,
      watchedPath: sourcePath,
      pendingHash: null,
    });
    setCodeObjectError(codeBundlerErrorKey(sourcePath), {
      message: "Default export is not a function.",
    });
    setSourceWatchedPathsFor(sourcePath, [...visitedPaths]);
    refreshWatchList();
    notifyComponentSubscribers();
    return;
  }

  const schema = parseCodePropsSchema(module.propsSchema);
  storeCachedComponent(
    sourcePath,
    result.hash,
    candidate as CodeComponent,
    schema,
  );
  setSourceWatchedPathsFor(sourcePath, [...visitedPaths]);
  clearCodeObjectError(codeBundlerErrorKey(sourcePath));
  refreshWatchList();
  notifyComponentSubscribers();
}

const sourceMultiPathRegistry = new Map<string, string[]>();

function setSourceWatchedPathsFor(sourcePath: string, paths: string[]): void {
  sourceMultiPathRegistry.set(sourcePath, paths);
}

function refreshWatchList(): void {
  if (!runtimeHost) return;
  const reachable = new Set<string>(getAllWatchedPaths());
  for (const [sourcePath, paths] of sourceMultiPathRegistry) {
    if (!retainCounts.has(sourcePath)) continue;
    for (const path of paths) reachable.add(path);
  }
  for (const sourcePath of retainCounts.keys()) {
    const state = getSourceState(sourcePath);
    if (state?.watchedPath) reachable.add(state.watchedPath);
  }
  runtimeHost.setWatchedSources([...reachable]);
}

function handleSourceChange(sourcePath: string): void {
  const direct = findSourcePathByWatchedPath(sourcePath);
  const dependents = new Set<string>();
  if (direct) dependents.add(direct);
  for (const [owner, paths] of sourceMultiPathRegistry) {
    if (paths.includes(sourcePath)) dependents.add(owner);
  }
  if (dependents.size === 0) return;
  for (const owner of dependents) {
    const state = getSourceState(owner);
    if (state?.watchedPath)
      setSourceState(owner, {
        ...state,
        status: "loading",
      });
    void runBundleForSource(owner);
  }
}

async function importBundleAsModule(code: string): Promise<{
  default?: unknown;
  propsSchema?: unknown;
}> {
  if (typeof URL === "undefined" || typeof Blob === "undefined")
    throw new Error("Module loading not supported in this environment.");
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    return (await import(/* @vite-ignore */ url)) as {
      default?: unknown;
      propsSchema?: unknown;
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function notifyErrorSubscribers(): void {
  for (const listener of errorSubscribers) listener();
}

function notifyComponentSubscribers(): void {
  componentTick += 1;
  for (const listener of componentSubscribers) listener();
}

function codeBundlerErrorKey(sourcePath: string): string {
  return `__code-source:${sourcePath}`;
}

export function getCodeSourceBundlerErrorKey(sourcePath: string): string {
  return codeBundlerErrorKey(sourcePath);
}

function createUnsetPlaceholder(sourcePath: string | null): CodeComponent {
  return ({ size }) =>
    createElement(
      "div",
      {
        style: placeholderStyle(size, "#cbd5f5"),
      },
      `code: ${sourcePath ?? "unset"}`,
    );
}

function createLoadingPlaceholder(sourcePath: string): CodeComponent {
  return ({ size }) =>
    createElement(
      "div",
      {
        style: placeholderStyle(size, "#9aa3b2"),
      },
      `code: compiling ${sourcePath}`,
    );
}

function createErrorPlaceholder(sourcePath: string): CodeComponent {
  return ({ size }) =>
    createElement(
      "div",
      {
        style: {
          ...placeholderStyle(size, "#ffb4b4"),
          background: "rgba(70, 16, 24, 0.85)",
          borderColor: "#5a2a2a",
        },
      },
      `code error: ${sourcePath}`,
    );
}

function placeholderStyle(
  size: { width: number; height: number },
  color: string,
): Record<string, string | number> {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: Math.max(
      16,
      Math.min(48, Math.min(size.width, size.height) / 12),
    ),
    color,
    background: "rgba(20, 22, 29, 0.85)",
    border: "1px dashed #3a3f4d",
    letterSpacing: "0.02em",
    textAlign: "center",
    padding: 16,
    boxSizing: "border-box",
  };
}
