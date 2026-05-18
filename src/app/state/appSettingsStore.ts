import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import {
  appSettingKeys,
  clampAgentProvider,
  clampExportTileMapping,
  clampExportWorkerMapping,
  clampLiveDomPostProcessMaxFps,
  clampPlaybackFpsOption,
  clampPreviewRenderHeight,
  clampStableSlowGridPreset,
  clampStableSlowValidationSamples,
  clampVideoExportTileHeight,
  getInitialAgentProvider,
  getInitialExportTileMapping,
  getInitialExportWorkerConfigurationMode,
  getInitialExportWorkerMapping,
  getInitialLiveDomPostProcessMaxFps,
  getInitialPlaybackFpsOption,
  getInitialPreviewRenderHeight,
  getInitialStableSlowGridPreset,
  getInitialStableSlowValidationSamples,
  getInitialVideoExportTileHeight,
  isDebugSettingsEnabledByDefault,
  isPrerenderCacheBlackMissDebugEnabledByDefault,
  isPrerenderCacheEnabledByDefault,
  isPrerenderCacheReuseEnabledByDefault,
  readStoredAppSettings,
  readStoredBooleanSetting,
  readStoredJsonSetting,
  readStoredStringSetting,
  writeStoredAppSetting,
} from "./storedAppSettings";
import {
  defaultExportTileMapping,
  defaultExportWorkerMapping,
  defaultPrerenderBlockDurationMs,
  videoExportFrameRate,
} from "../config";
import type {
  AgentProvider,
  ExportRenderQuality,
  ExportTileResolutionMapping,
  ExportWorkerConfigurationMode,
  ExportWorkerResolutionMapping,
  MediaExportFormat,
  MediaExportRenderMode,
  StableSlowGridPreset,
  StableSlowValidationSamples,
} from "../types";
import type { PlaybackFpsOption } from "./storedAppSettings";

type AppSettingsState = {
  reusePrerenderCacheForExport: boolean;
  prerenderCacheEnabled: boolean;
  debugSettingsEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  liveDomPostProcessMaxFps: number;
  motionEffectPreviewScrubActive: boolean;
  exportFrameRate: number;
  mediaExportFormat: MediaExportFormat;
  mediaExportRenderMode: MediaExportRenderMode;
  exportRenderQuality: ExportRenderQuality;
  videoExportTileHeight: number;
  exportWorkerMapping: ExportWorkerResolutionMapping;
  exportWorkerConfigurationMode: ExportWorkerConfigurationMode;
  exportTileMapping: ExportTileResolutionMapping;
  stableSlowGridPreset: StableSlowGridPreset;
  stableSlowValidationSamples: StableSlowValidationSamples;
  previewRenderHeight: number;
  playbackFpsOption: PlaybackFpsOption;
  agentProvider: AgentProvider;
  prerenderBlockDurationMs: number;
  prerenderCacheResetToken: number;
  initialized: boolean;
  setReusePrerenderCacheForExport: (value: boolean) => void;
  setPrerenderCacheEnabled: (value: boolean) => void;
  setDebugSettingsEnabled: (value: boolean) => void;
  setPrerenderCacheBlackMissDebug: (value: boolean) => void;
  setLiveDomPostProcessMaxFps: (value: number) => void;
  setMotionEffectPreviewScrubActive: (value: boolean) => void;
  setExportFrameRate: (value: number) => void;
  setMediaExportFormat: (value: MediaExportFormat) => void;
  setMediaExportRenderMode: (value: MediaExportRenderMode) => void;
  setExportRenderQuality: (value: ExportRenderQuality) => void;
  setVideoExportTileHeight: (value: number) => void;
  setExportWorkerMapping: (value: ExportWorkerResolutionMapping) => void;
  setExportWorkerConfigurationMode: (
    value: ExportWorkerConfigurationMode,
  ) => void;
  setExportTileMapping: (value: ExportTileResolutionMapping) => void;
  setStableSlowGridPreset: (value: StableSlowGridPreset) => void;
  setStableSlowValidationSamples: (value: StableSlowValidationSamples) => void;
  setPreviewRenderHeight: (value: number) => void;
  setPlaybackFpsOption: (value: PlaybackFpsOption) => void;
  setAgentProvider: (value: AgentProvider) => void;
  setPrerenderBlockDurationMs: (value: number) => void;
  resetPrerenderCache: () => void;
  hydrateFromStorage: () => Promise<void>;
};

export const useAppSettingsStore = create<AppSettingsState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        reusePrerenderCacheForExport: isPrerenderCacheReuseEnabledByDefault(),
        prerenderCacheEnabled: isPrerenderCacheEnabledByDefault(),
        debugSettingsEnabled: isDebugSettingsEnabledByDefault(),
        prerenderCacheBlackMissDebug:
          isPrerenderCacheBlackMissDebugEnabledByDefault(),
        liveDomPostProcessMaxFps: getInitialLiveDomPostProcessMaxFps(),
        motionEffectPreviewScrubActive: false,
        exportFrameRate: videoExportFrameRate,
        mediaExportFormat: "mp4",
        mediaExportRenderMode: "renderer",
        exportRenderQuality: "high",
        videoExportTileHeight: getInitialVideoExportTileHeight(),
        exportWorkerMapping: getInitialExportWorkerMapping(),
        exportWorkerConfigurationMode:
          getInitialExportWorkerConfigurationMode(),
        exportTileMapping: getInitialExportTileMapping(),
        stableSlowGridPreset: getInitialStableSlowGridPreset(),
        stableSlowValidationSamples: getInitialStableSlowValidationSamples(),
        previewRenderHeight: getInitialPreviewRenderHeight(),
        playbackFpsOption: getInitialPlaybackFpsOption(),
        agentProvider: getInitialAgentProvider(),
        prerenderBlockDurationMs: defaultPrerenderBlockDurationMs,
        prerenderCacheResetToken: 0,
        initialized: false,
        setReusePrerenderCacheForExport(value) {
          set({ reusePrerenderCacheForExport: value });
          writeStoredAppSetting(
            appSettingKeys.reusePrerenderCacheForExport,
            value ? "1" : "0",
          );
        },
        setPrerenderCacheEnabled(value) {
          set({ prerenderCacheEnabled: value });
          writeStoredAppSetting(
            appSettingKeys.prerenderCache,
            value ? "1" : "0",
          );
        },
        setDebugSettingsEnabled(value) {
          set((current) => ({
            debugSettingsEnabled: value,
            prerenderCacheBlackMissDebug: value
              ? current.prerenderCacheBlackMissDebug
              : false,
          }));
          writeStoredAppSetting(
            appSettingKeys.debugSettings,
            value ? "1" : "0",
          );
          if (!value)
            writeStoredAppSetting(
              appSettingKeys.prerenderCacheBlackMissDebug,
              "0",
            );
        },
        setPrerenderCacheBlackMissDebug(value) {
          set({ prerenderCacheBlackMissDebug: value });
          writeStoredAppSetting(
            appSettingKeys.prerenderCacheBlackMissDebug,
            value ? "1" : "0",
          );
        },
        setLiveDomPostProcessMaxFps(value) {
          const nextValue = clampLiveDomPostProcessMaxFps(value);
          set({ liveDomPostProcessMaxFps: nextValue });
          writeStoredAppSetting(
            appSettingKeys.liveDomPostProcessMaxFps,
            String(nextValue),
          );
        },
        setMotionEffectPreviewScrubActive(value) {
          set({ motionEffectPreviewScrubActive: value });
        },
        setExportFrameRate(value) {
          set({ exportFrameRate: value });
        },
        setMediaExportFormat(value) {
          set({ mediaExportFormat: value });
        },
        setMediaExportRenderMode(value) {
          set({ mediaExportRenderMode: value });
        },
        setExportRenderQuality(value) {
          set({ exportRenderQuality: value });
        },
        setVideoExportTileHeight(value) {
          const nextValue = clampVideoExportTileHeight(value);
          set({ videoExportTileHeight: nextValue });
          writeStoredAppSetting(
            appSettingKeys.videoExportTileHeight,
            String(nextValue),
          );
        },
        setExportWorkerMapping(value) {
          const nextValue = clampExportWorkerMapping(value);
          set({ exportWorkerMapping: nextValue });
          writeStoredAppSetting(
            appSettingKeys.exportWorkerMapping,
            JSON.stringify(nextValue),
          );
        },
        setExportWorkerConfigurationMode(value) {
          set({ exportWorkerConfigurationMode: value });
          writeStoredAppSetting(
            appSettingKeys.exportWorkerConfigurationMode,
            value,
          );
        },
        setExportTileMapping(value) {
          const nextValue = clampExportTileMapping(value);
          set({ exportTileMapping: nextValue });
          writeStoredAppSetting(
            appSettingKeys.exportTileMapping,
            JSON.stringify(nextValue),
          );
        },
        setStableSlowGridPreset(value) {
          const nextValue = clampStableSlowGridPreset(value);
          set({ stableSlowGridPreset: nextValue });
          writeStoredAppSetting(appSettingKeys.stableSlowGridPreset, nextValue);
        },
        setStableSlowValidationSamples(value) {
          const nextValue = clampStableSlowValidationSamples(value);
          set({ stableSlowValidationSamples: nextValue });
          writeStoredAppSetting(
            appSettingKeys.stableSlowValidationSamples,
            String(nextValue),
          );
        },
        setPreviewRenderHeight(value) {
          const nextValue = clampPreviewRenderHeight(value);
          set({ previewRenderHeight: nextValue });
          writeStoredAppSetting(
            appSettingKeys.previewRenderHeight,
            String(nextValue),
          );
        },
        setPlaybackFpsOption(value) {
          const nextValue = clampPlaybackFpsOption(value);
          set({ playbackFpsOption: nextValue });
          writeStoredAppSetting(appSettingKeys.playbackFps, String(nextValue));
        },
        setAgentProvider(value) {
          const nextValue = clampAgentProvider(value);
          set({ agentProvider: nextValue });
          writeStoredAppSetting(appSettingKeys.agentProvider, nextValue);
        },
        setPrerenderBlockDurationMs(value) {
          const nextValue = Math.max(1, Math.round(value));
          set({ prerenderBlockDurationMs: nextValue });
          writeStoredAppSetting(
            appSettingKeys.prerenderBlockDurationMs,
            String(nextValue),
          );
          get().resetPrerenderCache();
        },
        resetPrerenderCache() {
          set((current) => ({
            prerenderCacheResetToken: current.prerenderCacheResetToken + 1,
          }));
        },
        async hydrateFromStorage() {
          const settings = await readStoredAppSettings();
          set({
            reusePrerenderCacheForExport: readStoredBooleanSetting(
              settings,
              appSettingKeys.reusePrerenderCacheForExport,
              true,
            ),
            prerenderCacheEnabled: readStoredBooleanSetting(
              settings,
              appSettingKeys.prerenderCache,
              false,
            ),
            debugSettingsEnabled: readStoredBooleanSetting(
              settings,
              appSettingKeys.debugSettings,
              false,
            ),
            prerenderCacheBlackMissDebug: readStoredBooleanSetting(
              settings,
              appSettingKeys.prerenderCacheBlackMissDebug,
              false,
            ),
            liveDomPostProcessMaxFps: clampLiveDomPostProcessMaxFps(
              Number.parseInt(
                readStoredStringSetting(
                  settings,
                  appSettingKeys.liveDomPostProcessMaxFps,
                ) ?? "",
                10,
              ),
            ),
            videoExportTileHeight: clampVideoExportTileHeight(
              Number.parseInt(
                readStoredStringSetting(
                  settings,
                  appSettingKeys.videoExportTileHeight,
                ) ?? "",
                10,
              ),
            ),
            exportWorkerMapping: readStoredJsonSetting(
              settings,
              appSettingKeys.exportWorkerMapping,
              clampExportWorkerMapping,
              defaultExportWorkerMapping,
            ),
            exportWorkerConfigurationMode:
              readStoredStringSetting(
                settings,
                appSettingKeys.exportWorkerConfigurationMode,
              ) === "unified"
                ? "unified"
                : "separate",
            exportTileMapping: readStoredJsonSetting(
              settings,
              appSettingKeys.exportTileMapping,
              clampExportTileMapping,
              defaultExportTileMapping,
            ),
            stableSlowGridPreset: clampStableSlowGridPreset(
              readStoredStringSetting(
                settings,
                appSettingKeys.stableSlowGridPreset,
              ),
            ),
            stableSlowValidationSamples: clampStableSlowValidationSamples(
              Number.parseInt(
                readStoredStringSetting(
                  settings,
                  appSettingKeys.stableSlowValidationSamples,
                ) ?? "",
                10,
              ),
            ),
            previewRenderHeight: clampPreviewRenderHeight(
              Number.parseInt(
                readStoredStringSetting(
                  settings,
                  appSettingKeys.previewRenderHeight,
                ) ?? "",
                10,
              ),
            ),
            playbackFpsOption: clampPlaybackFpsOption(
              readStoredStringSetting(settings, appSettingKeys.playbackFps),
            ),
            agentProvider: clampAgentProvider(
              readStoredStringSetting(settings, appSettingKeys.agentProvider),
            ),
          });
          set({ initialized: true });
        },
      }),
      {
        name: "clipper-app-settings",
        partialize: (state) => ({
          reusePrerenderCacheForExport: state.reusePrerenderCacheForExport,
          prerenderCacheEnabled: state.prerenderCacheEnabled,
          debugSettingsEnabled: state.debugSettingsEnabled,
          prerenderCacheBlackMissDebug: state.prerenderCacheBlackMissDebug,
          liveDomPostProcessMaxFps: state.liveDomPostProcessMaxFps,
          videoExportTileHeight: state.videoExportTileHeight,
          exportWorkerMapping: state.exportWorkerMapping,
          exportWorkerConfigurationMode: state.exportWorkerConfigurationMode,
          exportTileMapping: state.exportTileMapping,
          stableSlowGridPreset: state.stableSlowGridPreset,
          stableSlowValidationSamples: state.stableSlowValidationSamples,
          previewRenderHeight: state.previewRenderHeight,
          playbackFpsOption: state.playbackFpsOption,
          agentProvider: state.agentProvider,
        }),
      },
    ),
  ),
);
