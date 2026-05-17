import { useEffect, useState } from "react";
import { videoExportFrameRate } from "../../config";
import {
  appSettingKeys,
  clampAgentProvider,
  clampExportTileMapping,
  clampExportWorkerMapping,
  clampPlaybackFpsOption,
  clampPreviewRenderHeight,
  clampStableSlowGridPreset,
  clampStableSlowValidationSamples,
  clampVideoExportTileHeight,
  getInitialAgentProvider,
  getInitialExportTileMapping,
  getInitialExportWorkerConfigurationMode,
  getInitialExportWorkerMapping,
  getInitialPlaybackFpsOption,
  getInitialPreviewRenderHeight,
  getInitialStableSlowGridPreset,
  getInitialStableSlowValidationSamples,
  getInitialVideoExportTileHeight,
  readStoredAppSettings,
  readStoredJsonSetting,
  readStoredStringSetting,
  writeStoredAppSetting,
  type PlaybackFpsOption,
} from "../../state/storedAppSettings";
import {
  defaultExportTileMapping,
  defaultExportWorkerMapping,
} from "../../config";
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
  setExportFrameRate: React.Dispatch<React.SetStateAction<number>>;
  mediaExportFormat: MediaExportFormat;
  setMediaExportFormat: React.Dispatch<React.SetStateAction<MediaExportFormat>>;
  mediaExportRenderMode: MediaExportRenderMode;
  setMediaExportRenderMode: React.Dispatch<
    React.SetStateAction<MediaExportRenderMode>
  >;
  exportRenderQuality: ExportRenderQuality;
  setExportRenderQuality: React.Dispatch<
    React.SetStateAction<ExportRenderQuality>
  >;
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
  const [exportFrameRate, setExportFrameRate] = useState(videoExportFrameRate);
  const [mediaExportFormat, setMediaExportFormat] =
    useState<MediaExportFormat>("mp4");
  const [mediaExportRenderMode, setMediaExportRenderMode] =
    useState<MediaExportRenderMode>("renderer");
  const [exportRenderQuality, setExportRenderQuality] =
    useState<ExportRenderQuality>("high");
  const [videoExportTileHeight, setVideoExportTileHeightState] = useState(
    getInitialVideoExportTileHeight,
  );
  const [exportWorkerMapping, setExportWorkerMappingState] = useState(
    getInitialExportWorkerMapping,
  );
  const [exportWorkerConfigurationMode, setExportWorkerConfigurationModeState] =
    useState<ExportWorkerConfigurationMode>(
      getInitialExportWorkerConfigurationMode,
    );
  const [exportTileMapping, setExportTileMappingState] = useState(
    getInitialExportTileMapping,
  );
  const [stableSlowGridPreset, setStableSlowGridPresetState] =
    useState<StableSlowGridPreset>(getInitialStableSlowGridPreset);
  const [stableSlowValidationSamples, setStableSlowValidationSamplesState] =
    useState<StableSlowValidationSamples>(
      getInitialStableSlowValidationSamples,
    );
  const [previewRenderHeight, setPreviewRenderHeightState] = useState(
    getInitialPreviewRenderHeight,
  );
  const [playbackFpsOption, setPlaybackFpsOptionState] =
    useState<PlaybackFpsOption>(getInitialPlaybackFpsOption);
  const [agentProvider, setAgentProviderState] = useState<AgentProvider>(
    getInitialAgentProvider,
  );

  useEffect(() => {
    let cancelled = false;
    void readStoredAppSettings().then((settings) => {
      if (cancelled) return;
      setVideoExportTileHeightState(
        clampVideoExportTileHeight(
          Number.parseInt(
            readStoredStringSetting(
              settings,
              appSettingKeys.videoExportTileHeight,
            ) ?? "",
            10,
          ),
        ),
      );
      setExportWorkerMappingState(
        readStoredJsonSetting(
          settings,
          appSettingKeys.exportWorkerMapping,
          clampExportWorkerMapping,
          defaultExportWorkerMapping,
        ),
      );
      setExportWorkerConfigurationModeState(
        readStoredStringSetting(
          settings,
          appSettingKeys.exportWorkerConfigurationMode,
        ) === "unified"
          ? "unified"
          : "separate",
      );
      setExportTileMappingState(
        readStoredJsonSetting(
          settings,
          appSettingKeys.exportTileMapping,
          clampExportTileMapping,
          defaultExportTileMapping,
        ),
      );
      setStableSlowGridPresetState(
        clampStableSlowGridPreset(
          readStoredStringSetting(
            settings,
            appSettingKeys.stableSlowGridPreset,
          ),
        ),
      );
      setStableSlowValidationSamplesState(
        clampStableSlowValidationSamples(
          Number.parseInt(
            readStoredStringSetting(
              settings,
              appSettingKeys.stableSlowValidationSamples,
            ) ?? "",
            10,
          ),
        ),
      );
      setPreviewRenderHeightState(
        clampPreviewRenderHeight(
          Number.parseInt(
            readStoredStringSetting(
              settings,
              appSettingKeys.previewRenderHeight,
            ) ?? "",
            10,
          ),
        ),
      );
      setPlaybackFpsOptionState(
        clampPlaybackFpsOption(
          readStoredStringSetting(settings, appSettingKeys.playbackFps),
        ),
      );
      setAgentProviderState(
        clampAgentProvider(
          readStoredStringSetting(settings, appSettingKeys.agentProvider),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setVideoExportTileHeight(value: number) {
    const nextValue = clampVideoExportTileHeight(value);
    setVideoExportTileHeightState(nextValue);
    writeStoredAppSetting(
      appSettingKeys.videoExportTileHeight,
      String(nextValue),
    );
  }
  function setExportWorkerMapping(mapping: ExportWorkerResolutionMapping) {
    const nextMapping = clampExportWorkerMapping(mapping);
    setExportWorkerMappingState(nextMapping);
    writeStoredAppSetting(
      appSettingKeys.exportWorkerMapping,
      JSON.stringify(nextMapping),
    );
  }
  function setExportWorkerConfigurationMode(
    mode: ExportWorkerConfigurationMode,
  ) {
    setExportWorkerConfigurationModeState(mode);
    writeStoredAppSetting(appSettingKeys.exportWorkerConfigurationMode, mode);
  }
  function setExportTileMapping(mapping: ExportTileResolutionMapping) {
    const nextMapping = clampExportTileMapping(mapping);
    setExportTileMappingState(nextMapping);
    writeStoredAppSetting(
      appSettingKeys.exportTileMapping,
      JSON.stringify(nextMapping),
    );
  }
  function setStableSlowGridPreset(preset: StableSlowGridPreset) {
    const nextPreset = clampStableSlowGridPreset(preset);
    setStableSlowGridPresetState(nextPreset);
    writeStoredAppSetting(appSettingKeys.stableSlowGridPreset, nextPreset);
  }
  function setStableSlowValidationSamples(
    samples: StableSlowValidationSamples,
  ) {
    const nextSamples = clampStableSlowValidationSamples(samples);
    setStableSlowValidationSamplesState(nextSamples);
    writeStoredAppSetting(
      appSettingKeys.stableSlowValidationSamples,
      String(nextSamples),
    );
  }
  function setPreviewRenderHeight(value: number) {
    const nextValue = clampPreviewRenderHeight(value);
    setPreviewRenderHeightState(nextValue);
    writeStoredAppSetting(
      appSettingKeys.previewRenderHeight,
      String(nextValue),
    );
  }
  function setPlaybackFpsOption(value: PlaybackFpsOption) {
    const nextValue = clampPlaybackFpsOption(value);
    setPlaybackFpsOptionState(nextValue);
    writeStoredAppSetting(appSettingKeys.playbackFps, String(nextValue));
  }
  function setAgentProvider(provider: AgentProvider) {
    const nextProvider = clampAgentProvider(provider);
    setAgentProviderState(nextProvider);
    writeStoredAppSetting(appSettingKeys.agentProvider, nextProvider);
  }

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
