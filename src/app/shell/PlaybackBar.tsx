import {
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Search,
  Signpost,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
} from "lucide-react";
import type { CSSProperties, Dispatch, RefObject, SetStateAction } from "react";
import { FrameZoomBar } from "../../components/FrameZoomBar";
import { QuickAccessTooltip } from "../../components/QuickAccessTooltip";
import { clamp } from "../../core/math";
import { usePlayheadSceneTime } from "../features/playback/usePlayheadTime";

export type PlaybackBarProps = {
  fastSelectEnabled: boolean;
  framePreviewScale: number;
  frameZoomBarOpen: boolean;
  frameZoomControlRef: RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  playbackBorderScrubberRef: RefObject<HTMLInputElement | null>;
  playbackDisplayDuration: number;
  playbackTimeLabelRef: RefObject<HTMLSpanElement | null>;
  previewColumnHovered: boolean;
  scrubSnapEnabled: boolean;
  formatPlaybackTimeLabel: (time: number) => string;
  toPlaybackDisplayTime: (time: number) => number;
  jumpToEnd: () => void;
  jumpToNextPart: () => void;
  jumpToStart: () => void;
  pausePlaybackForTimelineScrub: () => void;
  pausePlaybackAtCurrentTime: () => void;
  resumePlaybackAfterTimelineScrub: () => void;
  scrubToPlaybackDisplayTime: (time: number) => void;
  setFastSelectEnabled: Dispatch<SetStateAction<boolean>>;
  setScrubSnapEnabled: Dispatch<SetStateAction<boolean>>;
  stepSceneTime: (delta: number) => void;
  toggleFrameZoomBar: () => void;
  togglePlayback: () => void;
  updateFramePreviewScale: (scale: number) => void;
};

export function PlaybackBar({
  fastSelectEnabled,
  framePreviewScale,
  frameZoomBarOpen,
  frameZoomControlRef,
  isPlaying,
  playbackBorderScrubberRef,
  playbackDisplayDuration,
  playbackTimeLabelRef,
  previewColumnHovered,
  scrubSnapEnabled,
  formatPlaybackTimeLabel,
  toPlaybackDisplayTime,
  jumpToEnd,
  jumpToNextPart,
  jumpToStart,
  pausePlaybackAtCurrentTime,
  pausePlaybackForTimelineScrub,
  resumePlaybackAfterTimelineScrub,
  scrubToPlaybackDisplayTime,
  setFastSelectEnabled,
  setScrubSnapEnabled,
  stepSceneTime,
  toggleFrameZoomBar,
  togglePlayback,
  updateFramePreviewScale,
}: PlaybackBarProps) {
  const sceneTime = usePlayheadSceneTime(!isPlaying);
  const playbackDisplayTime = clamp(
    toPlaybackDisplayTime(sceneTime),
    0,
    playbackDisplayDuration,
  );
  const playbackProgress =
    playbackDisplayDuration > 0
      ? `${clamp(playbackDisplayTime / playbackDisplayDuration, 0, 1) * 100}%`
      : "0%";
  const playbackScrubberStyle = {
    "--clipper-playback-progress": playbackProgress,
  } as CSSProperties;
  return (
    <div
      className="relative grid h-full grid-cols-[1fr_auto_1fr] items-center border-t border-[#2d313b] bg-[#171920] px-7"
      data-clipper-playback-bar
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0">
        <input
          ref={playbackBorderScrubberRef}
          aria-label="Playback scrubber"
          className={`clipper-playback-border-scrubber relative top-[-8px] w-full transition-opacity duration-200 ${isPlaying && previewColumnHovered ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
          max={Math.max(playbackDisplayDuration, 0.001)}
          min={0}
          step={0.01}
          style={playbackScrubberStyle}
          type="range"
          value={playbackDisplayTime}
          onChange={(event) =>
            scrubToPlaybackDisplayTime(Number(event.currentTarget.value))
          }
          onPointerCancel={(event) => {
            resumePlaybackAfterTimelineScrub();
            event.currentTarget.blur();
          }}
          onPointerDown={pausePlaybackForTimelineScrub}
          onPointerUp={(event) => {
            resumePlaybackAfterTimelineScrub();
            event.currentTarget.blur();
          }}
        />
      </div>
      <span
        ref={playbackTimeLabelRef}
        className="justify-self-start text-[#9b9da7] tabular-nums"
      >
        {formatPlaybackTimeLabel(sceneTime)}
      </span>
      <div className="flex items-center justify-center gap-3">
        <QuickAccessTooltip
          name="Jump to start"
          description="Move the scrubber to the first frame of the scene."
          shortcut="Home"
        >
          <button
            aria-label="Jump to start"
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]"
            onClick={jumpToStart}
          >
            <SkipBack size={17} />
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name="Back one second"
          description="Move the scrubber back by one second."
          shortcut="Left Arrow"
        >
          <button
            aria-label="Back one second"
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]"
            onClick={() => stepSceneTime(-1)}
          >
            <StepBack size={17} />
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name={isPlaying ? "Pause" : "Play"}
          description={
            isPlaying
              ? "Pause timeline playback."
              : "Start timeline playback from the scrubber."
          }
          shortcut="Space"
        >
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid h-[42px] w-[42px] place-items-center rounded-full bg-[#1d212b] text-[#e9e9ec] hover:bg-[#252a36]"
            onClick={togglePlayback}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name="Next composition"
          description="Jump the scrubber to the start of the next composition."
          shortcut="Right Arrow"
        >
          <button
            aria-label="Next composition"
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]"
            onClick={jumpToNextPart}
          >
            <StepForward size={17} />
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name="Jump to end"
          description="Move the scrubber to the end of the scene."
          shortcut="End"
        >
          <button
            aria-label="Jump to end"
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]"
            onClick={jumpToEnd}
          >
            <SkipForward size={17} />
          </button>
        </QuickAccessTooltip>
      </div>
      <div className="flex items-center justify-end gap-3">
        <QuickAccessTooltip
          name="Cut"
          description="Pause playback and prepare the current point for a cut action."
          shortcut="C"
        >
          <button
            aria-label="Cut"
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]"
            onClick={pausePlaybackAtCurrentTime}
          >
            <Scissors size={17} />
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name="Magnetic scrub"
          description="Snap scrubbing to composition, zoom, and pan edges. Hold Shift for a temporary snap."
          shortcut="M"
        >
          <button
            aria-label="Magnetic scrub"
            className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${scrubSnapEnabled ? "bg-[#159dff] text-white shadow-[0_0_0_4px_rgba(21,157,255,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`}
            aria-pressed={scrubSnapEnabled}
            onClick={() => setScrubSnapEnabled((current) => !current)}
          >
            <Magnet size={16} />
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name="Snap selector"
          description="Select the timeline item currently under the scrubber as you move."
          shortcut="S"
        >
          <button
            aria-label="Snap selector"
            className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${fastSelectEnabled ? "bg-[#159dff] text-white shadow-[0_0_0_4px_rgba(21,157,255,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`}
            aria-pressed={fastSelectEnabled}
            onClick={() => setFastSelectEnabled((current) => !current)}
          >
            <Signpost size={16} />
          </button>
        </QuickAccessTooltip>
        <QuickAccessTooltip
          name="Replay"
          description="Return the scrubber to the beginning of the scene."
          shortcut="R"
        >
          <button
            aria-label="Replay from start"
            className="grid h-[34px] w-[34px] place-items-center rounded-full text-[#e9e9ec] hover:bg-[#1d212b]"
            onClick={jumpToStart}
          >
            <RotateCcw size={16} />
          </button>
        </QuickAccessTooltip>
        <div ref={frameZoomControlRef} className="relative">
          {frameZoomBarOpen ? (
            <FrameZoomBar
              scale={framePreviewScale}
              onScaleChange={updateFramePreviewScale}
            />
          ) : null}
          <QuickAccessTooltip
            name="Preview zoom"
            description="Show or hide the frame preview zoom controls."
            shortcut=""
          >
            <button
              aria-label="Toggle preview zoom controls"
              className={`grid h-[34px] w-[34px] place-items-center rounded-full transition ${frameZoomBarOpen ? "bg-[#159dff] text-white shadow-[0_0_0_4px_rgba(21,157,255,0.14)]" : "text-[#e9e9ec] hover:bg-[#1d212b]"}`}
              aria-pressed={frameZoomBarOpen}
              onClick={toggleFrameZoomBar}
            >
              <Search size={16} />
            </button>
          </QuickAccessTooltip>
        </div>
      </div>
    </div>
  );
}
