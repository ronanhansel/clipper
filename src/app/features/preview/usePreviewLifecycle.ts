import { useEffect, useRef, useState } from "react";
import {
  appSettingKeys,
  clampLiveDomPostProcessMaxFps,
  getInitialLiveDomPostProcessMaxFps,
  isDebugSettingsEnabledByDefault,
  isPrerenderCacheBlackMissDebugEnabledByDefault,
  isPrerenderCacheEnabledByDefault,
  isPrerenderCacheReuseEnabledByDefault,
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
  liveDomPostProcessMaxFps: number;
  motionEffectPreviewScrubActive: boolean;
  prerenderDisplayReadyRef: React.MutableRefObject<boolean>;
  setReusePrerenderCacheForExport: (reuse: boolean) => void;
  setPrerenderCacheEnabled: (enabled: boolean) => void;
  setDebugSettingsEnabled: (enabled: boolean) => void;
  setPrerenderCacheBlackMissDebug: (enabled: boolean) => void;
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
  const [motionEffectPreviewScrubActive, setMotionEffectPreviewScrubActive] =
    useState(false);
  const [liveDomPostProcessMaxFps, setLiveDomPostProcessMaxFpsState] = useState(
    getInitialLiveDomPostProcessMaxFps,
  );
  const prerenderDisplayReadyRef = useRef(false);

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
    liveDomPostProcessMaxFps,
    motionEffectPreviewScrubActive,
    prerenderDisplayReadyRef,
    setReusePrerenderCacheForExport,
    setPrerenderCacheEnabled,
    setDebugSettingsEnabled,
    setPrerenderCacheBlackMissDebug,
    setLiveDomPostProcessMaxFps,
    setMotionEffectPreviewScrubActive,
  };
}
