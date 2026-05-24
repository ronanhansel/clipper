import type { FrameObject } from "./types";

export type MediaVideoPlaybackProps = {
  cropStart: number;
  cropEnd: number;
  speed: number;
  playing: boolean;
};

export function readMediaVideoPlaybackProps(
  object: Pick<FrameObject, "props">,
): MediaVideoPlaybackProps {
  const raw = object.props?.video;
  const video =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    cropStart: readFiniteNumber(video.cropStart, 0),
    cropEnd: readFiniteNumber(video.cropEnd, 0),
    speed: Math.max(0.01, readFiniteNumber(video.speed, 1)),
    playing: typeof video.playing === "boolean" ? video.playing : true,
  };
}

export function getMediaVideoPlayStartTime(
  object: Pick<FrameObject, "tracks">,
  localTime: number,
): number {
  const points = object.tracks?.["props.video.playing"]?.points;
  if (!points?.length) return 0;
  const sorted = [...points].sort((left, right) => left.time - right.time);
  let playStartTime = 0;
  let playing = false;
  for (const point of sorted) {
    if (point.time > localTime) break;
    if (point.value === true && !playing) playStartTime = point.time;
    playing = point.value === true;
  }
  return playing ? playStartTime : localTime;
}

export function getMediaVideoTime(
  object: Pick<FrameObject, "props" | "tracks">,
  localTime: number,
): number {
  const video = readMediaVideoPlaybackProps(object);
  if (!video.playing) return video.cropStart;
  const playStartTime = getMediaVideoPlayStartTime(object, localTime);
  const videoTime = (localTime - playStartTime) * video.speed + video.cropStart;
  if (video.cropEnd > video.cropStart) {
    return Math.min(Math.max(video.cropStart, videoTime), video.cropEnd);
  }
  return Math.max(video.cropStart, videoTime);
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
