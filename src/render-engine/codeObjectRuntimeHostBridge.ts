import { useEffect, useRef } from "react";
import { useProjectStore } from "../app/state/projectStore";
import { clipperHost } from "../app/clipperHost";
import { resolveBinItemByPath } from "../core/binPathResolver";
import type { ProjectBinItem, ProjectManifest } from "../core/types";
import {
  configureCodeObjectRuntime,
  type CodeImportResolution,
  type CodeSourceEntry,
  type CodeSourceLoader,
} from "./codeObjectRuntime";

type RuntimeHostBridgeState = {
  configured: boolean;
  unsubscribeFileChanges: (() => void) | null;
  sourceChangeSubscribers: Set<(sourcePath: string) => void>;
  latestProject: ProjectManifest | null;
  watchedSourcePaths: Set<string>;
  internalSourceSnapshots: Map<string, string>;
};

const bridgeState: RuntimeHostBridgeState = {
  configured: false,
  unsubscribeFileChanges: null,
  sourceChangeSubscribers: new Set(),
  latestProject: null,
  watchedSourcePaths: new Set(),
  internalSourceSnapshots: new Map(),
};

const codeSourceExtensions: CodeSourceLoader[] = ["tsx", "ts", "jsx", "js"];

function detectLoader(name: string): CodeSourceLoader {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "tsx";
  const ext = name.slice(idx + 1).toLowerCase();
  if ((codeSourceExtensions as string[]).includes(ext))
    return ext as CodeSourceLoader;
  return "tsx";
}

function hasCodeExtension(filePath: string): boolean {
  return codeSourceExtensions.some((ext) => filePath.endsWith(`.${ext}`));
}

function posixDirname(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  if (idx < 0) return "";
  return filePath.slice(0, idx);
}

function posixJoin(basePath: string, importPath: string): string {
  const segments = `${basePath}/${importPath}`.split("/");
  const normalized: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join("/");
}

async function entryFromBinItem(
  item: ProjectBinItem,
): Promise<CodeSourceEntry | null> {
  if (item.kind === "internal-file")
    return { source: item.source, loader: detectLoader(item.name) };
  if (item.kind === "external-proxy") {
    const source = await clipperHost.readTextFile(item.path);
    return { source, loader: detectLoader(item.name) };
  }
  return null;
}

function findExternalProxySourcePath(
  bin: ProjectBinItem[],
  diskPath: string,
  parents: string[] = [],
): string | null {
  for (const item of bin) {
    const path = [...parents, item.name];
    if (item.kind === "external-proxy" && item.path === diskPath)
      return path.join("/");
    if (item.kind === "folder" && item.children) {
      const found = findExternalProxySourcePath(item.children, diskPath, path);
      if (found) return found;
    }
  }
  return null;
}

function snapshotInternalSource(sourcePath: string): string | null {
  const project = bridgeState.latestProject;
  if (!project) return null;
  const item = resolveBinItemByPath(project.bin ?? [], sourcePath);
  if (!item || item.kind !== "internal-file") return null;
  return item.source;
}

function reconcileInternalSourceSnapshots(): void {
  const next = new Map<string, string>();
  for (const sourcePath of bridgeState.watchedSourcePaths) {
    const snapshot = snapshotInternalSource(sourcePath);
    if (snapshot === null) continue;
    next.set(sourcePath, snapshot);
    const previous = bridgeState.internalSourceSnapshots.get(sourcePath);
    if (previous !== undefined && previous !== snapshot) {
      for (const listener of bridgeState.sourceChangeSubscribers)
        listener(sourcePath);
    }
  }
  bridgeState.internalSourceSnapshots = next;
}

function ensureRuntimeConfigured(): void {
  if (bridgeState.configured) return;
  bridgeState.configured = true;

  const onTextFileChanged = window.clipper?.onTextFileChanged;
  if (typeof onTextFileChanged === "function") {
    bridgeState.unsubscribeFileChanges = onTextFileChanged((diskPath) => {
      const project = bridgeState.latestProject;
      if (!project) return;
      const sourcePath = findExternalProxySourcePath(
        project.bin ?? [],
        diskPath,
      );
      if (!sourcePath) return;
      for (const listener of bridgeState.sourceChangeSubscribers)
        listener(sourcePath);
    });
  }

  configureCodeObjectRuntime({
    readEntrySource: async (sourcePath) => {
      const project = bridgeState.latestProject;
      if (!project) return null;
      const item = resolveBinItemByPath(project.bin ?? [], sourcePath);
      if (!item) return null;
      return entryFromBinItem(item);
    },
    readImportSource: async (
      importPath,
      importerSourcePath,
    ): Promise<CodeImportResolution | null> => {
      const project = bridgeState.latestProject;
      if (!project) return null;
      if (!importPath.startsWith("./") && !importPath.startsWith("../"))
        return null;
      const baseDir = posixDirname(importerSourcePath);
      const joined = posixJoin(baseDir, importPath);
      const candidates = hasCodeExtension(joined)
        ? [joined]
        : codeSourceExtensions.map((ext) => `${joined}.${ext}`);
      for (const candidate of candidates) {
        const item = resolveBinItemByPath(project.bin ?? [], candidate);
        if (!item) continue;
        const entry = await entryFromBinItem(item);
        if (!entry) continue;
        return { ...entry, resolvedSourcePath: candidate };
      }
      return null;
    },
    setWatchedSources: (sourcePaths) => {
      bridgeState.watchedSourcePaths = new Set(sourcePaths);
      const project = bridgeState.latestProject;
      const diskPaths: string[] = [];
      if (project) {
        for (const sourcePath of sourcePaths) {
          const item = resolveBinItemByPath(project.bin ?? [], sourcePath);
          if (item?.kind === "external-proxy") diskPaths.push(item.path);
        }
      }
      void window.clipper?.watchTextFiles?.(diskPaths);
      reconcileInternalSourceSnapshots();
    },
    subscribeSourceChanges: (listener) => {
      bridgeState.sourceChangeSubscribers.add(listener);
      return () => {
        bridgeState.sourceChangeSubscribers.delete(listener);
      };
    },
  });
}

export function useCodeObjectRuntimeHostBridge(): void {
  const project = useProjectStore((state) => state.project);
  const projectRef = useRef(project);
  projectRef.current = project;
  bridgeState.latestProject = project;

  useEffect(() => {
    ensureRuntimeConfigured();
    bridgeState.latestProject = projectRef.current;
    reconcileInternalSourceSnapshots();
  }, []);

  useEffect(() => {
    bridgeState.latestProject = project;
    reconcileInternalSourceSnapshots();
  }, [project]);
}

export function CodeObjectRuntimeHostBridge(): null {
  useCodeObjectRuntimeHostBridge();
  return null;
}
