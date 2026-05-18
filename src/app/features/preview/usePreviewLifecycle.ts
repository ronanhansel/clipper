import { useEffect, useRef } from "react";
import { useAppSettingsStore } from "../../state/appSettingsStore";

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
  setMotionEffectPreviewScrubActive: (value: boolean) => void;
};

export function usePreviewLifecycle(): PreviewLifecycleState {
  const reusePrerenderCacheForExport = useAppSettingsStore(
    (state) => state.reusePrerenderCacheForExport,
  );
  const prerenderCacheEnabled = useAppSettingsStore(
    (state) => state.prerenderCacheEnabled,
  );
  const debugSettingsEnabled = useAppSettingsStore(
    (state) => state.debugSettingsEnabled,
  );
  const prerenderCacheBlackMissDebug = useAppSettingsStore(
    (state) => state.prerenderCacheBlackMissDebug,
  );
  const liveDomPostProcessMaxFps = useAppSettingsStore(
    (state) => state.liveDomPostProcessMaxFps,
  );
  const motionEffectPreviewScrubActive = useAppSettingsStore(
    (state) => state.motionEffectPreviewScrubActive,
  );
  const initialized = useAppSettingsStore((state) => state.initialized);
  const hydrateFromStorage = useAppSettingsStore(
    (state) => state.hydrateFromStorage,
  );
  const setReusePrerenderCacheForExport = useAppSettingsStore(
    (state) => state.setReusePrerenderCacheForExport,
  );
  const setPrerenderCacheEnabled = useAppSettingsStore(
    (state) => state.setPrerenderCacheEnabled,
  );
  const setDebugSettingsEnabled = useAppSettingsStore(
    (state) => state.setDebugSettingsEnabled,
  );
  const setPrerenderCacheBlackMissDebug = useAppSettingsStore(
    (state) => state.setPrerenderCacheBlackMissDebug,
  );
  const setLiveDomPostProcessMaxFps = useAppSettingsStore(
    (state) => state.setLiveDomPostProcessMaxFps,
  );
  const setMotionEffectPreviewScrubActive = useAppSettingsStore(
    (state) => state.setMotionEffectPreviewScrubActive,
  );
  const prerenderDisplayReadyRef = useRef(false);

  useEffect(() => {
    if (!initialized) void hydrateFromStorage();
  }, [hydrateFromStorage, initialized]);

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
