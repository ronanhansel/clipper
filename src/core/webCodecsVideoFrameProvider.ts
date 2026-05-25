import {
  createFile,
  DataStream,
  Endianness,
  type ISOFile,
  type Movie,
  type Sample,
  type Track,
} from "mp4box";

export type DecodedVideoFrame = {
  frame: VideoFrame;
  time: number;
  duration: number;
};

export type WebCodecsVideoFrameProvider = {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  getFrameAt(mediaTimeSeconds: number): DecodedVideoFrame | null;
  dispose(): void;
};

type SampleEntryWithCodecConfig = {
  avcC?: { write(stream: DataStream): void };
  hvcC?: { write(stream: DataStream): void };
  vpcC?: { write(stream: DataStream): void };
  av1C?: { write(stream: DataStream): void };
};

const providerCache = new Map<string, Promise<WebCodecsVideoFrameProvider>>();

export function getWebCodecsVideoFrameProvider(
  src: string,
): Promise<WebCodecsVideoFrameProvider> {
  const existing = providerCache.get(src);
  if (existing) return existing;
  const next = decodeVideoSource(src).catch((error) => {
    providerCache.delete(src);
    throw error;
  });
  providerCache.set(src, next);
  return next;
}

export function clearWebCodecsVideoFrameProviderCacheForTests(): void {
  for (const promise of providerCache.values()) {
    void promise.then(
      (p) => p.dispose(),
      () => undefined,
    );
  }
  providerCache.clear();
}

async function decodeVideoSource(
  src: string,
): Promise<WebCodecsVideoFrameProvider> {
  if (typeof VideoDecoder === "undefined") {
    throw new Error("WebCodecs VideoDecoder is not available");
  }
  if (typeof EncodedVideoChunk === "undefined") {
    throw new Error("WebCodecs EncodedVideoChunk is not available");
  }

  const response = await fetch(src);
  if (!response.ok) throw new Error(`Unable to fetch video source: ${src}`);
  const sourceBuffer = await response.arrayBuffer();

  const file = createFile() as ISOFile;
  const frames: DecodedVideoFrame[] = [];
  let decoder: VideoDecoder | null = null;
  let selectedTrack: Track | null = null;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: unknown) => void) | null = null;
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  file.onError = (_module, message) => readyReject?.(new Error(message));
  file.onReady = (info) => {
    const track = info.videoTracks[0];
    if (!track) {
      readyReject?.(new Error("MP4 contains no video track"));
      return;
    }
    selectedTrack = track;
    decoder = new VideoDecoder({
      output(frame) {
        frames.push({
          frame,
          time: frame.timestamp / 1_000_000,
          duration: (frame.duration ?? 0) / 1_000_000,
        });
      },
      error(error) {
        readyReject?.(error);
      },
    });
    decoder.configure({
      codec: normalizeCodec(track.codec),
      codedWidth: track.video?.width ?? track.track_width,
      codedHeight: track.video?.height ?? track.track_height,
      description: readCodecDescription(file, track),
    });
    file.setExtractionOptions(track.id, undefined, { nbSamples: 1000 });
    file.start();
    readyResolve?.();
  };
  file.onSamples = (_id, _user, samples) => {
    if (!decoder) return;
    for (const sample of samples) {
      if (!sample.data) continue;
      decoder.decode(
        new EncodedVideoChunk({
          type: sample.is_sync ? "key" : "delta",
          timestamp: (sample.cts * 1_000_000) / sample.timescale,
          duration: (sample.duration * 1_000_000) / sample.timescale,
          data: sample.data,
        }),
      );
    }
  };

  const mp4Buffer = sourceBuffer as ArrayBuffer & { fileStart: number };
  mp4Buffer.fileStart = 0;
  file.appendBuffer(mp4Buffer, true);
  await readyPromise;
  file.flush();
  const track = requireValue<Track>(selectedTrack, "Video track not found");
  const configuredDecoder = requireValue<VideoDecoder>(
    decoder,
    "Video decoder was not configured",
  );
  await configuredDecoder.flush();
  configuredDecoder.close();
  frames.sort((left, right) => left.time - right.time);
  if (!frames.length) throw new Error("Video decoder produced no frames");
  const timeOrigin = frames[0].time;
  for (const frame of frames) frame.time -= timeOrigin;

  const duration = Math.max(
    ...frames.map((f) => f.time + Math.max(f.duration, 0)),
  );
  return createFrameProvider(
    frames,
    track.video?.width ?? track.track_width,
    track.video?.height ?? track.track_height,
    duration,
  );
}

function requireValue<T>(value: T | null, message: string): T {
  if (value === null) throw new Error(message);
  return value;
}

function createFrameProvider(
  frames: DecodedVideoFrame[],
  width: number,
  height: number,
  duration: number,
): WebCodecsVideoFrameProvider {
  let disposed = false;
  return {
    width,
    height,
    duration,
    getFrameAt(mediaTimeSeconds) {
      if (disposed) return null;
      const index = findFrameIndex(frames, mediaTimeSeconds);
      return index < 0 ? null : frames[index];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const decoded of frames) decoded.frame.close();
      frames.length = 0;
    },
  };
}

function normalizeCodec(codec: string): string {
  return codec.startsWith("vp08") ? "vp8" : codec;
}

function readCodecDescription(
  file: ISOFile,
  track: Track,
): Uint8Array<ArrayBuffer> {
  const trak = file.getTrackById(track.id) as
    | { mdia?: { minf?: { stbl?: { stsd?: { entries?: unknown[] } } } } }
    | undefined;
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries ?? [];
  for (const entry of entries as SampleEntryWithCodecConfig[]) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (!box) continue;
    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
    box.write(stream);
    return new Uint8Array(stream.buffer.slice(8));
  }
  throw new Error("No supported codec description box found");
}

function findFrameIndex(frames: DecodedVideoFrame[], time: number): number {
  if (!frames.length) return -1;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (frames[mid].time <= time) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(frames.length - 1, hi));
}
