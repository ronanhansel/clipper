import { clipperHost } from "../clipperHost";

const activeProjectManifestStorageKey = "clipper.activeProjectManifestPath";
const appStatePath = "clipper/app-state.json";

export async function readStoredActiveProjectManifestPath() {
  try {
    const state = JSON.parse(await clipperHost.readTextFile(appStatePath)) as { activeProjectManifestPath?: unknown };
    if (typeof state.activeProjectManifestPath === "string" && state.activeProjectManifestPath.startsWith("clipper/")) return state.activeProjectManifestPath;
  } catch {
    // New installs will not have app-state.json yet.
  }

  const localStoragePath = localStorage.getItem(activeProjectManifestStorageKey);
  if (localStoragePath) return localStoragePath;
  throw new Error("No active project path is stored.");
}

export async function writeStoredActiveProjectManifestPath(manifestPath: string) {
  localStorage.setItem(activeProjectManifestStorageKey, manifestPath);
  await clipperHost.writeTextFile(appStatePath, `${JSON.stringify({ activeProjectManifestPath: manifestPath }, null, 2)}\n`);
}

export function clipperContainerPath(manifestPath: string) {
  return manifestPath.endsWith(".clipper") ? manifestPath : manifestPath.replace(/(?:\/project)?\.json$/, ".clipper");
}
