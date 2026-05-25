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

export function getMediaVideoTime(
  object: Pick<FrameObject, "props" | "tracks">,
  localTime: number,
): number {
  const video = readMediaVideoPlaybackProps(object);
  const videoTime =
    getMediaVideoPlayElapsedTime(object, localTime, video) + video.cropStart;
  if (video.cropEnd > video.cropStart) {
    return Math.min(Math.max(video.cropStart, videoTime), video.cropEnd);
  }
  return Math.max(video.cropStart, videoTime);
}

function getMediaVideoPlayElapsedTime(
  object: Pick<FrameObject, "tracks">,
  localTime: number,
  video: MediaVideoPlaybackProps,
): number {
  if (localTime <= 0) return 0;
  const points = object.tracks?.["props.video.playing"]?.points;
  if (!points?.length) return video.playing ? localTime * video.speed : 0;
  const sorted = points
    .filter(
      (point) =>
        Number.isFinite(point.time) && typeof point.value === "boolean",
    )
    .sort((left, right) => left.time - right.time);
  if (!sorted.length) return video.playing ? localTime * video.speed : 0;

  let elapsed = 0;
  let playing = sorted[0].value === true;
  let previousTime = 0;

  for (const point of sorted) {
    if (point.time <= 0) {
      playing = point.value === true;
      previousTime = 0;
      continue;
    }

    const boundary = Math.min(point.time, localTime);
    if (playing && boundary > previousTime) {
      elapsed += (boundary - previousTime) * video.speed;
    }
    if (point.time > localTime) return elapsed;

    playing = point.value === true;
    previousTime = point.time;
  }

  if (playing && localTime > previousTime) {
    elapsed += (localTime - previousTime) * video.speed;
  }
  return elapsed;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
