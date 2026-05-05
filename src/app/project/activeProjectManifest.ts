import { clipperHost } from "../clipperHost";

const activeProjectManifestStorageKey = "clipper.activeProjectManifestPath";
const appStatePath = "clipper/app-state.json";

export type RecentProject = {
  path: string;
  name: string;
};

async function readAppState(): Promise<Record<string, unknown>> {
  try {
    const state = JSON.parse(await clipperHost.readTextFile(appStatePath)) as Record<string, unknown>;
    return typeof state === "object" && state !== null ? state : {};
  } catch {
    return {};
  }
}

async function writeAppState(updates: Record<string, unknown>) {
  const state = await readAppState();
  const merged = { ...state, ...updates };
  await clipperHost.writeTextFile(appStatePath, `${JSON.stringify(merged, null, 2)}\n`);
}

export async function readStoredActiveProjectManifestPath(): Promise<string | null> {
  try {
    const state = await readAppState();
    const path = state.activeProjectManifestPath;
    if (typeof path === "string" && path.startsWith("clipper/") && path.endsWith(".json")) {
      return path;
    }
  } catch {
    // New installs will not have app-state.json yet.
  }

  const localStoragePath = localStorage.getItem(activeProjectManifestStorageKey);
  if (localStoragePath?.endsWith(".json")) return localStoragePath;

  return null;
}

export async function writeStoredActiveProjectManifestPath(manifestPath: string) {
  localStorage.setItem(activeProjectManifestStorageKey, manifestPath);
  await writeAppState({ activeProjectManifestPath: manifestPath });
}

export async function clearStoredActiveProjectManifestPath() {
  localStorage.removeItem(activeProjectManifestStorageKey);
  await writeAppState({ activeProjectManifestPath: undefined });
}

export async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const state = await readAppState();
    if (Array.isArray(state.recentProjects)) {
      return (state.recentProjects as RecentProject[]).filter(
        (r) => r && typeof r.path === "string" && r.path.endsWith(".json") && typeof r.name === "string"
      ).slice(0, 10);
    }
  } catch { /* ignore */ }
  return [];
}

export async function addRecentProject(path: string, name: string) {
  let projects = await readRecentProjects();
  projects = projects.filter((r) => r.path !== path);
  projects.unshift({ path, name });
  if (projects.length > 10) projects = projects.slice(0, 10);
  await writeAppState({ recentProjects: projects });
}

export async function removeRecentProject(path: string) {
  let projects = await readRecentProjects();
  projects = projects.filter((r) => r.path !== path);
  await writeAppState({ recentProjects: projects });
}
