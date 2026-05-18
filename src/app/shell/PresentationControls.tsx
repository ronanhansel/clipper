import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from "lucide-react";
import { memo, type CSSProperties } from "react";
import { formatTime } from "../../core/timeline";
import { clamp } from "../../core/math";
import { usePlayheadSceneTime } from "../features/playback/usePlayheadTime";

type PresentationControlsProps = {
  controlsVisible: boolean;
  isPlaying: boolean;
  sceneDurationSeconds: number;
  jumpToEnd: () => void;
  jumpToStart: () => void;
  pausePlaybackForPresentationScrub: () => void;
  resumePlaybackAfterPresentationScrub: () => void;
  scrubPresentationTime: (time: number) => void;
  stepSceneTime: (delta: number) => void;
  togglePlayback: () => void;
};

export const PresentationControls = memo(function PresentationControls({
  controlsVisible,
  isPlaying,
  sceneDurationSeconds,
  jumpToEnd,
  jumpToStart,
  pausePlaybackForPresentationScrub,
  resumePlaybackAfterPresentationScrub,
  scrubPresentationTime,
  stepSceneTime,
  togglePlayback,
}: PresentationControlsProps) {
  const time = usePlayheadSceneTime();
  const presentationProgress =
    sceneDurationSeconds > 0
      ? `${clamp(time / sceneDurationSeconds, 0, 1) * 100}%`
      : "0%";
  const scrubberStyle = {
    "--clipper-presentation-progress": presentationProgress,
  } as CSSProperties;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-8 z-[2147483647] flex justify-center px-6 transition-opacity duration-200 ${controlsVisible ? "opacity-100" : "opacity-0"}`}
      data-clipper-presentation-controls
    >
      <div className="pointer-events-auto grid w-full max-w-[600px] gap-2.5 rounded-2xl border border-white/12 bg-black/72 px-4 py-3 text-white shadow-[0_18px_64px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 text-[11px] font-bold tabular-nums text-white/72">
          <span>{formatTime(time)}</span>
          <span>{formatTime(sceneDurationSeconds)}</span>
        </div>
        <input
          aria-label="Presentation scrubber"
          className="clipper-presentation-scrubber w-full"
          max={Math.max(sceneDurationSeconds, 0.001)}
          min={0}
          step={0.01}
          style={scrubberStyle}
          type="range"
          value={clamp(time, 0, sceneDurationSeconds)}
          onChange={(event) =>
            scrubPresentationTime(Number(event.currentTarget.value))
          }
          onPointerCancel={(event) => {
            resumePlaybackAfterPresentationScrub();
            event.currentTarget.blur();
          }}
          onPointerDown={pausePlaybackForPresentationScrub}
          onPointerUp={(event) => {
            resumePlaybackAfterPresentationScrub();
            event.currentTarget.blur();
          }}
        />
        <div className="flex items-center justify-center gap-2">
          <button
            aria-label="Jump to start"
            className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white"
            onClick={jumpToStart}
          >
            <SkipBack size={16} />
          </button>
          <button
            aria-label="Back one second"
            className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white"
            onClick={() => stepSceneTime(-1)}
          >
            <StepBack size={16} />
          </button>
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid h-11 w-11 place-items-center rounded-full bg-white text-black transition hover:bg-white/88"
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            aria-label="Forward one second"
            className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white"
            onClick={() => stepSceneTime(1)}
          >
            <StepForward size={16} />
          </button>
          <button
            aria-label="Jump to end"
            className="grid h-9 w-9 place-items-center rounded-full text-white/82 transition hover:bg-white/12 hover:text-white"
            onClick={jumpToEnd}
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});
