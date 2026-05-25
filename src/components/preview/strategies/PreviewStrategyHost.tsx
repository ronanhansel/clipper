import type { RefObject } from "react";
import { FramePreviewLive } from "../FramePreviewLive";
import { PreviewRenderSchedulerProvider } from "../scheduler/PreviewRenderSchedulerContext";
import type { PreviewRenderScheduler } from "../scheduler/usePreviewRenderScheduler";
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
  void strategy;
  void currentSceneTimeRef;
  void liveDomPostProcessMaxFps;
  return (
    <PreviewRenderSchedulerProvider scheduler={scheduler}>
      <FramePreviewLive {...toFramePreviewLiveProps(framePreviewProps)} />
    </PreviewRenderSchedulerProvider>
  );
}
