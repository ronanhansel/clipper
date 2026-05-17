import type { RefObject } from "react";
import { FramePreviewLive } from "../FramePreviewLive";
import type { PreviewRenderScheduler } from "../scheduler/usePreviewRenderScheduler";
import { LivePostProcessFramePreview } from "./LivePostProcessFramePreview";
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
};

export function PreviewStrategyHost({
  strategy,
  framePreviewProps,
  currentSceneTimeRef,
  scheduler,
  liveDomPostProcessMaxFps,
}: PreviewStrategyHostProps) {
  if (strategy.kind === "live-webgl") {
    return (
      <LivePostProcessFramePreview
        currentSceneTimeRef={currentSceneTimeRef}
        framePreviewProps={framePreviewProps}
        liveDomPostProcessMaxFps={liveDomPostProcessMaxFps}
        scheduler={scheduler}
      />
    );
  }
  return <FramePreviewLive {...toFramePreviewLiveProps(framePreviewProps)} />;
}
