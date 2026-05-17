import { useEffect, useRef, useState } from "react";
import {
  appSettingKeys,
  clampLiveDomPostProcessMaxFps,
  getInitialLiveDomPostProcessMaxFps,
  isDebugSettingsEnabledByDefault,
  isLiveDomPostProcessPreviewEnabledByDefault,
  isPrerenderCacheBlackMissDebugEnabledByDefault,
  isPrerenderCacheEnabledByDefault,
  isPrerenderCacheReuseEnabledByDefault,
  persistLiveDomPostProcessPreviewEnabled,
  readStoredAppSettings,
  readStoredBooleanSetting,
  readStoredStringSetting,
  writeStoredAppSetting,
} from "../../state/storedAppSettings";

export type PreviewLifecycleState = {
  reusePrerenderCacheForExport: boolean;
  prerenderCacheEnabled: boolean;
  debugSettingsEnabled: boolean;
  prerenderCacheBlackMissDebug: boolean;
  liveDomPostProcessPreviewEnabled: boolean;
  liveDomPostProcessMaxFps: number;
  motionEffectPreviewScrubActive: boolean;
  liveDomPostProcessRuntimeEnabled: boolean;
  liveDomPostProcessPersistError: string | null;
  prerenderDisplayReadyRef: React.MutableRefObject<boolean>;
  setReusePrerenderCacheForExport: (reuse: boolean) => void;
  setPrerenderCacheEnabled: (enabled: boolean) => void;
  setDebugSettingsEnabled: (enabled: boolean) => void;
  setPrerenderCacheBlackMissDebug: (enabled: boolean) => void;
  setLiveDomPostProcessPreviewEnabled: (enabled: boolean) => void;
  setLiveDomPostProcessMaxFps: (value: number) => void;
  setMotionEffectPreviewScrubActive: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

export function usePreviewLifecycle(): PreviewLifecycleState {
  const [reusePrerenderCacheForExport, setReusePrerenderCacheForExportState] =
    useState(isPrerenderCacheReuseEnabledByDefault);
  const [prerenderCacheEnabled, setPrerenderCacheEnabledState] = useState(
    isPrerenderCacheEnabledByDefault,
  );
  const [debugSettingsEnabled, setDebugSettingsEnabledState] = useState(
    isDebugSettingsEnabledByDefault,
  );
  const [prerenderCacheBlackMissDebug, setPrerenderCacheBlackMissDebugState] =
    useState(isPrerenderCacheBlackMissDebugEnabledByDefault);
  const [
    liveDomPostProcessPreviewEnabled,
    setLiveDomPostProcessPreviewEnabledState,
  ] = useState(isLiveDomPostProcessPreviewEnabledByDefault);
  const [motionEffectPreviewScrubActive, setMotionEffectPreviewScrubActive] =
    useState(false);
  const [liveDomPostProcessMaxFps, setLiveDomPostProcessMaxFpsState] = useState(
    getInitialLiveDomPostProcessMaxFps,
  );
  const prerenderDisplayReadyRef = useRef(false);
  const [liveDomPostProcessPersistError, setLiveDomPostProcessPersistError] =
    useState<string | null>(null);

  const liveDomPostProcessRuntimeEnabled =
    typeof window !== "undefined" &&
    Boolean(window.clipper?.experimentalHtmlCanvasPostProcess);

  useEffect(() => {
    let cancelled = false;
    void readStoredAppSettings().then((settings) => {
      if (cancelled) return;
      setReusePrerenderCacheForExportState(
        readStoredBooleanSetting(
          settings,
          appSettingKeys.reusePrerenderCacheForExport,
          true,
        ),
      );
      setPrerenderCacheEnabledState(
        readStoredBooleanSetting(
          settings,
          appSettingKeys.prerenderCache,
          false,
        ),
      );
      const debugEnabled = readStoredBooleanSetting(
        settings,
        appSettingKeys.debugSettings,
        false,
      );
      setDebugSettingsEnabledState(debugEnabled);
      setPrerenderCacheBlackMissDebugState(
        debugEnabled &&
          readStoredBooleanSetting(
            settings,
            appSettingKeys.prerenderCacheBlackMissDebug,
            false,
          ),
      );
      setLiveDomPostProcessPreviewEnabledState(
        Boolean(window.clipper?.experimentalHtmlCanvasPostProcess) ||
          readStoredBooleanSetting(
            settings,
            appSettingKeys.liveDomPostProcess,
            false,
          ),
      );
      setLiveDomPostProcessMaxFpsState(
        clampLiveDomPostProcessMaxFps(
          Number.parseInt(
            readStoredStringSetting(
              settings,
              appSettingKeys.liveDomPostProcessMaxFps,
            ) ?? "",
            10,
          ),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function setReusePrerenderCacheForExport(reuse: boolean) {
    setReusePrerenderCacheForExportState(reuse);
    writeStoredAppSetting(
      appSettingKeys.reusePrerenderCacheForExport,
      reuse ? "1" : "0",
    );
  }

  function setPrerenderCacheEnabled(enabled: boolean) {
    setPrerenderCacheEnabledState(enabled);
    writeStoredAppSetting(appSettingKeys.prerenderCache, enabled ? "1" : "0");
  }

  function setPrerenderCacheBlackMissDebug(enabled: boolean) {
    setPrerenderCacheBlackMissDebugState(enabled);
    writeStoredAppSetting(
      appSettingKeys.prerenderCacheBlackMissDebug,
      enabled ? "1" : "0",
    );
  }

  function setDebugSettingsEnabled(enabled: boolean) {
    setDebugSettingsEnabledState(enabled);
    writeStoredAppSetting(appSettingKeys.debugSettings, enabled ? "1" : "0");
    if (!enabled) setPrerenderCacheBlackMissDebug(false);
  }

  function setLiveDomPostProcessPreviewEnabled(enabled: boolean) {
    setLiveDomPostProcessPreviewEnabledState(enabled);
    writeStoredAppSetting(
      appSettingKeys.liveDomPostProcess,
      enabled ? "1" : "0",
    );
    setLiveDomPostProcessPersistError(null);
    void persistLiveDomPostProcessPreviewEnabled(enabled).then((ok) => {
      if (ok) return;
      setLiveDomPostProcessPersistError(
        "Could not save the experimental preview setting to disk. The change will not survive a restart.",
      );
    });
  }

  function setLiveDomPostProcessMaxFps(value: number) {
    const nextValue = clampLiveDomPostProcessMaxFps(value);
    setLiveDomPostProcessMaxFpsState(nextValue);
    writeStoredAppSetting(
      appSettingKeys.liveDomPostProcessMaxFps,
      String(nextValue),
    );
  }

  return {
    reusePrerenderCacheForExport,
    prerenderCacheEnabled,
    debugSettingsEnabled,
    prerenderCacheBlackMissDebug,
    liveDomPostProcessPreviewEnabled,
    liveDomPostProcessMaxFps,
    motionEffectPreviewScrubActive,
    liveDomPostProcessRuntimeEnabled,
    liveDomPostProcessPersistError,
    prerenderDisplayReadyRef,
    setReusePrerenderCacheForExport,
    setPrerenderCacheEnabled,
    setDebugSettingsEnabled,
    setPrerenderCacheBlackMissDebug,
    setLiveDomPostProcessPreviewEnabled,
    setLiveDomPostProcessMaxFps,
    setMotionEffectPreviewScrubActive,
  };
}
