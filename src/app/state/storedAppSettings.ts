import {
  defaultExportTileMapping,
  defaultExportWorkerMapping,
  defaultLiveDomPostProcessMaxFps,
  defaultPrerenderBlockDurationMs,
  defaultPreviewRenderHeight,
  defaultStableSlowGridPreset,
  defaultStableSlowValidationSamples,
  defaultVideoExportTileHeight,
  maxExportTileCount,
  maxExportWorkerCount,
  maxLiveDomPostProcessMaxFps,
  maxPrerenderBlockDurationMs,
  maxPreviewRenderHeight,
  maxStableSlowValidationSamples,
  maxVideoExportTileHeight,
  minExportTileCount,
  minExportWorkerCount,
  minLiveDomPostProcessMaxFps,
  minPrerenderBlockDurationMs,
  minPreviewRenderHeight,
  minStableSlowValidationSamples,
  minVideoExportTileHeight,
  playbackFpsOptions,
  previewRenderHeightOptions,
} from "../config";
import type {
  AgentProvider,
  ExportTileResolutionMapping,
  ExportWorkerConfigurationMode,
  ExportWorkerResolutionMapping,
  StableSlowGridPreset,
  StableSlowValidationSamples,
} from "../types";

export const appSettingKeys = {
  reusePrerenderCacheForExport: "clipper:reuse-prerender-cache-export",
  prerenderCache: "clipper:prerender-cache",
  debugSettings: "clipper:debug-settings",
  prerenderCacheBlackMissDebug: "clipper:prerender-cache-black-miss-debug",
  liveDomPostProcessMaxFps: "clipper:live-dom-postprocess-max-fps",
  videoExportTileHeight: "clipper:video-export-tile-height",
  exportWorkerMapping: "clipper:export-worker-mapping",
  exportWorkerConfigurationMode: "clipper:export-worker-configuration-mode",
  exportTileMapping: "clipper:export-tile-mapping",
  stableSlowGridPreset: "clipper:stable-slow-grid-preset",
  stableSlowValidationSamples: "clipper:stable-slow-validation-samples",
  prerenderBlockDurationMs: "clipper:prerender-block-duration-ms",
  previewRenderHeight: "clipper:preview-render-height",
  playbackFps: "clipper:playback-fps",
  agentProvider: "clipper:agent-provider",
} as const;

export type AppSettingKey =
  (typeof appSettingKeys)[keyof typeof appSettingKeys];

export function clampLiveDomPostProcessMaxFps(value: number) {
  if (!Number.isFinite(value)) return defaultLiveDomPostProcessMaxFps;
  return Math.min(
    Math.max(Math.round(value), minLiveDomPostProcessMaxFps),
    maxLiveDomPostProcessMaxFps,
  );
}

export function isPrerenderCacheReuseEnabledByDefault() {
  if (typeof window === "undefined") return true;
  return (
    window.localStorage.getItem(appSettingKeys.reusePrerenderCacheForExport) !==
    "0"
  );
}

export function isPrerenderCacheEnabledByDefault() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(appSettingKeys.prerenderCache) === "1";
}

export function isDebugSettingsEnabledByDefault() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(appSettingKeys.debugSettings) === "1";
}

export function isPrerenderCacheBlackMissDebugEnabledByDefault() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(appSettingKeys.debugSettings) !== "1")
    return false;
  return (
    window.localStorage.getItem(appSettingKeys.prerenderCacheBlackMissDebug) ===
    "1"
  );
}

export function getInitialLiveDomPostProcessMaxFps() {
  if (typeof window === "undefined") return defaultLiveDomPostProcessMaxFps;
  const storedValue = Number.parseInt(
    window.localStorage.getItem(appSettingKeys.liveDomPostProcessMaxFps) ?? "",
    10,
  );
  return clampLiveDomPostProcessMaxFps(storedValue);
}

export async function readStoredAppSettings(): Promise<
  Record<string, unknown>
> {
  const settings: Record<string, unknown> = {};
  if (typeof window === "undefined") return settings;

  for (const key of Object.values(appSettingKeys)) {
    const value = window.localStorage.getItem(key);
    if (value !== null) settings[key] = value;
  }

  try {
    const appState = await window.clipper?.readAppState?.();
    const persistedSettings = appState?.settings;
    if (persistedSettings && typeof persistedSettings === "object")
      return { ...settings, ...(persistedSettings as Record<string, unknown>) };
  } catch {
    // localStorage remains the browser/dev fallback.
  }

  return settings;
}

export function writeStoredAppSetting(key: AppSettingKey, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
  void window.clipper
    ?.writeAppState?.({ settings: { [key]: value } })
    .catch(() => {});
}

export function readStoredStringSetting(
  settings: Record<string, unknown>,
  key: AppSettingKey,
) {
  const value = settings[key];
  return typeof value === "string" ? value : null;
}

export function readStoredBooleanSetting(
  settings: Record<string, unknown>,
  key: AppSettingKey,
  fallback: boolean,
) {
  const value = readStoredStringSetting(settings, key);
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

export function readStoredJsonSetting<T>(
  settings: Record<string, unknown>,
  key: AppSettingKey,
  clampValue: (value: unknown) => T,
  fallback: T,
) {
  const value = readStoredStringSetting(settings, key);
  if (!value) return fallback;
  try {
    return clampValue(JSON.parse(value));
  } catch {
    return fallback;
  }
}

export function clampVideoExportTileHeight(value: number) {
  if (!Number.isFinite(value)) return defaultVideoExportTileHeight;
  return Math.min(
    Math.max(Math.round(value), minVideoExportTileHeight),
    maxVideoExportTileHeight,
  );
}

export function clampPreviewRenderHeight(value: number) {
  if (!Number.isFinite(value)) return defaultPreviewRenderHeight;
  const rounded = Math.min(
    Math.max(Math.round(value), minPreviewRenderHeight),
    maxPreviewRenderHeight,
  );
  return previewRenderHeightOptions.reduce(
    (closest, height) =>
      Math.abs(height - rounded) < Math.abs(closest - rounded)
        ? height
        : closest,
    defaultPreviewRenderHeight,
  );
}

function clampExportWorkerCount(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    Math.max(Math.round(numeric), minExportWorkerCount),
    maxExportWorkerCount,
  );
}

function clampExportTileCount(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    Math.max(Math.round(numeric), minExportTileCount),
    maxExportTileCount,
  );
}

export function clampExportWorkerMapping(
  value: unknown,
): ExportWorkerResolutionMapping {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof ExportWorkerResolutionMapping, unknown>>)
      : {};
  return {
    hd: clampExportWorkerCount(candidate.hd, defaultExportWorkerMapping.hd),
    qhd: clampExportWorkerCount(candidate.qhd, defaultExportWorkerMapping.qhd),
    uhd: clampExportWorkerCount(candidate.uhd, defaultExportWorkerMapping.uhd),
  };
}

export function clampExportTileMapping(
  value: unknown,
): ExportTileResolutionMapping {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof ExportTileResolutionMapping, unknown>>)
      : {};
  return {
    hd: clampExportTileCount(candidate.hd, defaultExportTileMapping.hd),
    qhd: clampExportTileCount(candidate.qhd, defaultExportTileMapping.qhd),
    uhd: clampExportTileCount(candidate.uhd, defaultExportTileMapping.uhd),
  };
}

export function clampStableSlowGridPreset(
  value: unknown,
): StableSlowGridPreset {
  return value === "relaxed" || value === "balanced" || value === "extreme"
    ? value
    : defaultStableSlowGridPreset;
}

export function clampStableSlowValidationSamples(
  value: unknown,
): StableSlowValidationSamples {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return defaultStableSlowValidationSamples;
  const clamped = Math.min(
    Math.max(Math.round(numeric), minStableSlowValidationSamples),
    maxStableSlowValidationSamples,
  );
  return (
    clamped === 2 || clamped === 3 ? clamped : 1
  ) as StableSlowValidationSamples;
}

export function clampAgentProvider(value: unknown): AgentProvider {
  return value === "codex" ||
    value === "claude" ||
    value === "gemini" ||
    value === "opencode"
    ? value
    : "opencode";
}

export function clampPrerenderBlockDurationMs(value: number) {
  if (!Number.isFinite(value)) return defaultPrerenderBlockDurationMs;
  return Math.min(
    Math.max(Math.round(value), minPrerenderBlockDurationMs),
    maxPrerenderBlockDurationMs,
  );
}

export function getInitialVideoExportTileHeight() {
  if (typeof window === "undefined") return defaultVideoExportTileHeight;
  const storedValue = Number.parseInt(
    window.localStorage.getItem(appSettingKeys.videoExportTileHeight) ?? "",
    10,
  );
  return clampVideoExportTileHeight(storedValue);
}

export function getInitialExportWorkerMapping(): ExportWorkerResolutionMapping {
  if (typeof window === "undefined") return defaultExportWorkerMapping;
  try {
    return clampExportWorkerMapping(
      JSON.parse(
        window.localStorage.getItem(appSettingKeys.exportWorkerMapping) ??
          "null",
      ),
    );
  } catch {
    return defaultExportWorkerMapping;
  }
}

export function getInitialExportWorkerConfigurationMode(): ExportWorkerConfigurationMode {
  if (typeof window === "undefined") return "separate";
  return window.localStorage.getItem(
    appSettingKeys.exportWorkerConfigurationMode,
  ) === "unified"
    ? "unified"
    : "separate";
}

export function getInitialExportTileMapping(): ExportTileResolutionMapping {
  if (typeof window === "undefined") return defaultExportTileMapping;
  try {
    return clampExportTileMapping(
      JSON.parse(
        window.localStorage.getItem(appSettingKeys.exportTileMapping) ?? "null",
      ),
    );
  } catch {
    return defaultExportTileMapping;
  }
}

export function getInitialStableSlowGridPreset(): StableSlowGridPreset {
  if (typeof window === "undefined") return defaultStableSlowGridPreset;
  return clampStableSlowGridPreset(
    window.localStorage.getItem(appSettingKeys.stableSlowGridPreset),
  );
}

export function getInitialStableSlowValidationSamples(): StableSlowValidationSamples {
  if (typeof window === "undefined") return defaultStableSlowValidationSamples;
  return clampStableSlowValidationSamples(
    Number.parseInt(
      window.localStorage.getItem(appSettingKeys.stableSlowValidationSamples) ??
        "",
      10,
    ),
  );
}

export function getInitialAgentProvider(): AgentProvider {
  if (typeof window === "undefined") return "opencode";
  return clampAgentProvider(
    window.localStorage.getItem(appSettingKeys.agentProvider),
  );
}

export function getInitialPrerenderBlockDurationMs() {
  if (typeof window === "undefined") return defaultPrerenderBlockDurationMs;
  const storedValue = Number.parseInt(
    window.localStorage.getItem(appSettingKeys.prerenderBlockDurationMs) ?? "",
    10,
  );
  return clampPrerenderBlockDurationMs(storedValue);
}

export function getInitialPreviewRenderHeight() {
  if (typeof window === "undefined") return defaultPreviewRenderHeight;
  const storedValue = Number.parseInt(
    window.localStorage.getItem(appSettingKeys.previewRenderHeight) ?? "",
    10,
  );
  return clampPreviewRenderHeight(storedValue);
}

export type PlaybackFpsOption = (typeof playbackFpsOptions)[number] | "follow";

export function clampPlaybackFpsOption(value: unknown): PlaybackFpsOption {
  if (value === "follow") return "follow";
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return "follow";
  return playbackFpsOptions.find((option) => option === numeric) ?? "follow";
}

export function getInitialPlaybackFpsOption(): PlaybackFpsOption {
  if (typeof window === "undefined") return "follow";
  return clampPlaybackFpsOption(
    window.localStorage.getItem(appSettingKeys.playbackFps),
  );
}
