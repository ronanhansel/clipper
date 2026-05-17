import type { RefObject } from "react";
import { FramePreviewLive } from "../FramePreviewLive";
import type { PrerenderBlock } from "../../../app/features/preview/usePrerenderCache";
import type { PreviewRenderScheduler } from "../scheduler/usePreviewRenderScheduler";
import { LivePostProcessFramePreview } from "./LivePostProcessFramePreview";
import { PrerenderVideoPreview } from "./PrerenderVideoPreview";
import { toFramePreviewLiveProps } from "./preview";
import type {
  PreviewStrategy,
  StrategyFramePreviewProps,
} from "./selectPreviewStrategy";

export type PreviewStrategyHostProps = {
  strategy: PreviewStrategy;
  framePreviewProps: StrategyFramePreviewProps;
  currentSceneTimeRef: RefObject<number>;
  scheduler: PreviewRenderScheduler;
  liveDomPostProcessMaxFps: number;
  livePostProcessEnabled: boolean;
  prerenderBlackMissDebug: boolean;
  getPrerenderCacheBlockAtTime: (time: number) => PrerenderBlock | null;
  onPrerenderDisplayReadyChange: (ready: boolean) => void;
};

export function PreviewStrategyHost({
  strategy,
  framePreviewProps,
  currentSceneTimeRef,
  scheduler,
  liveDomPostProcessMaxFps,
  livePostProcessEnabled,
  prerenderBlackMissDebug,
  getPrerenderCacheBlockAtTime,
  onPrerenderDisplayReadyChange,
}: PreviewStrategyHostProps) {
  if (strategy.kind === "live-webgl") {
    return (
      <LivePostProcessFramePreview
        currentSceneTimeRef={currentSceneTimeRef}
        framePreviewProps={framePreviewProps}
        liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
        livePostProcessEnabled={livePostProcessEnabled}
        scheduler={scheduler}
      />
    );
  }
  if (strategy.kind === "prerender") {
    return (
      <PrerenderVideoPreview
        blackMissDebug={prerenderBlackMissDebug}
        currentSceneTimeRef={currentSceneTimeRef}
        framePreviewProps={framePreviewProps}
        getBlockAtTime={getPrerenderCacheBlockAtTime}
        liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
        livePostProcessPreviewEnabled={livePostProcessEnabled}
        onPrerenderDisplayReadyChange={onPrerenderDisplayReadyChange}
        scheduler={scheduler}
      />
    );
  }
  return <FramePreviewLive {...toFramePreviewLiveProps(framePreviewProps)} />;
}
