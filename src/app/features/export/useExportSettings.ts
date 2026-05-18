import { useEffect, useMemo } from "react";
import { useAppSettingsStore } from "../../state/appSettingsStore";
import type { PlaybackFpsOption } from "../../state/storedAppSettings";
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
} from "../../types";

export type ExportSettingsState = {
  exportFrameRate: number;
  setExportFrameRate: (value: number) => void;
  mediaExportFormat: MediaExportFormat;
  setMediaExportFormat: (value: MediaExportFormat) => void;
  mediaExportRenderMode: MediaExportRenderMode;
  setMediaExportRenderMode: (value: MediaExportRenderMode) => void;
  exportRenderQuality: ExportRenderQuality;
  setExportRenderQuality: (value: ExportRenderQuality) => void;
  videoExportTileHeight: number;
  setVideoExportTileHeight: (value: number) => void;
  exportWorkerMapping: ExportWorkerResolutionMapping;
  setExportWorkerMapping: (mapping: ExportWorkerResolutionMapping) => void;
  exportWorkerConfigurationMode: ExportWorkerConfigurationMode;
  setExportWorkerConfigurationMode: (
    mode: ExportWorkerConfigurationMode,
  ) => void;
  exportTileMapping: ExportTileResolutionMapping;
  setExportTileMapping: (mapping: ExportTileResolutionMapping) => void;
  stableSlowGridPreset: StableSlowGridPreset;
  setStableSlowGridPreset: (preset: StableSlowGridPreset) => void;
  stableSlowValidationSamples: StableSlowValidationSamples;
  setStableSlowValidationSamples: (
    samples: StableSlowValidationSamples,
  ) => void;
  previewRenderHeight: number;
  setPreviewRenderHeight: (value: number) => void;
  playbackFpsOption: PlaybackFpsOption;
  setPlaybackFpsOption: (value: PlaybackFpsOption) => void;
  agentProvider: AgentProvider;
  setAgentProvider: (provider: AgentProvider) => void;
};

export function useExportSettings(): ExportSettingsState {
  const exportFrameRate = useAppSettingsStore((s) => s.exportFrameRate);
  const mediaExportFormat = useAppSettingsStore((s) => s.mediaExportFormat);
  const mediaExportRenderMode = useAppSettingsStore(
    (s) => s.mediaExportRenderMode,
  );
  const exportRenderQuality = useAppSettingsStore((s) => s.exportRenderQuality);
  const videoExportTileHeight = useAppSettingsStore(
    (s) => s.videoExportTileHeight,
  );
  const exportWorkerMapping = useAppSettingsStore((s) => s.exportWorkerMapping);
  const exportWorkerConfigurationMode = useAppSettingsStore(
    (s) => s.exportWorkerConfigurationMode,
  );
  const exportTileMapping = useAppSettingsStore((s) => s.exportTileMapping);
  const stableSlowGridPreset = useAppSettingsStore(
    (s) => s.stableSlowGridPreset,
  );
  const stableSlowValidationSamples = useAppSettingsStore(
    (s) => s.stableSlowValidationSamples,
  );
  const previewRenderHeight = useAppSettingsStore((s) => s.previewRenderHeight);
  const playbackFpsOption = useAppSettingsStore((s) => s.playbackFpsOption);
  const agentProvider = useAppSettingsStore((s) => s.agentProvider);
  const hydrateFromStorage = useAppSettingsStore((s) => s.hydrateFromStorage);
  const initialized = useAppSettingsStore((s) => s.initialized);
  const storeSetExportFrameRate = useAppSettingsStore(
    (s) => s.setExportFrameRate,
  );
  const storeSetMediaExportFormat = useAppSettingsStore(
    (s) => s.setMediaExportFormat,
  );
  const storeSetMediaExportRenderMode = useAppSettingsStore(
    (s) => s.setMediaExportRenderMode,
  );
  const storeSetExportRenderQuality = useAppSettingsStore(
    (s) => s.setExportRenderQuality,
  );
  const storeSetVideoExportTileHeight = useAppSettingsStore(
    (s) => s.setVideoExportTileHeight,
  );
  const storeSetExportWorkerMapping = useAppSettingsStore(
    (s) => s.setExportWorkerMapping,
  );
  const storeSetExportWorkerConfigurationMode = useAppSettingsStore(
    (s) => s.setExportWorkerConfigurationMode,
  );
  const storeSetExportTileMapping = useAppSettingsStore(
    (s) => s.setExportTileMapping,
  );
  const storeSetStableSlowGridPreset = useAppSettingsStore(
    (s) => s.setStableSlowGridPreset,
  );
  const storeSetStableSlowValidationSamples = useAppSettingsStore(
    (s) => s.setStableSlowValidationSamples,
  );
  const storeSetPreviewRenderHeight = useAppSettingsStore(
    (s) => s.setPreviewRenderHeight,
  );
  const storeSetPlaybackFpsOption = useAppSettingsStore(
    (s) => s.setPlaybackFpsOption,
  );
  const storeSetAgentProvider = useAppSettingsStore((s) => s.setAgentProvider);

  const setExportFrameRate = (value: number) => storeSetExportFrameRate(value);
  const setMediaExportFormat = (value: MediaExportFormat) =>
    storeSetMediaExportFormat(value);
  const setMediaExportRenderMode = (value: MediaExportRenderMode) =>
    storeSetMediaExportRenderMode(value);
  const setExportRenderQuality = (value: ExportRenderQuality) =>
    storeSetExportRenderQuality(value);
  const setVideoExportTileHeight = (value: number) =>
    storeSetVideoExportTileHeight(value);
  const setExportWorkerMapping = (mapping: ExportWorkerResolutionMapping) =>
    storeSetExportWorkerMapping(mapping);
  const setExportWorkerConfigurationMode = (
    mode: ExportWorkerConfigurationMode,
  ) => storeSetExportWorkerConfigurationMode(mode);
  const setExportTileMapping = (mapping: ExportTileResolutionMapping) =>
    storeSetExportTileMapping(mapping);
  const setStableSlowGridPreset = (preset: StableSlowGridPreset) =>
    storeSetStableSlowGridPreset(preset);
  const setStableSlowValidationSamples = (
    samples: StableSlowValidationSamples,
  ) => storeSetStableSlowValidationSamples(samples);
  const setPreviewRenderHeight = (value: number) =>
    storeSetPreviewRenderHeight(value);
  const setPlaybackFpsOption = (value: PlaybackFpsOption) =>
    storeSetPlaybackFpsOption(value);
  const setAgentProvider = (provider: AgentProvider) =>
    storeSetAgentProvider(provider);

  useEffect(() => {
    if (!initialized) void hydrateFromStorage();
  }, [hydrateFromStorage, initialized]);

  return {
    exportFrameRate,
    setExportFrameRate,
    mediaExportFormat,
    setMediaExportFormat,
    mediaExportRenderMode,
    setMediaExportRenderMode,
    exportRenderQuality,
    setExportRenderQuality,
    videoExportTileHeight,
    setVideoExportTileHeight,
    exportWorkerMapping,
    setExportWorkerMapping,
    exportWorkerConfigurationMode,
    setExportWorkerConfigurationMode,
    exportTileMapping,
    setExportTileMapping,
    stableSlowGridPreset,
    setStableSlowGridPreset,
    stableSlowValidationSamples,
    setStableSlowValidationSamples,
    previewRenderHeight,
    setPreviewRenderHeight,
    playbackFpsOption,
    setPlaybackFpsOption,
    agentProvider,
    setAgentProvider,
  };
}
