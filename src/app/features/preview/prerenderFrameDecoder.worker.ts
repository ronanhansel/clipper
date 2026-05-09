type DecodePrerenderFramesRequest = {
  id: number;
  frames: Array<{
    sceneTime: number;
    data: ArrayBuffer;
  }>;
};

type DecodePrerenderFramesResponse = {
  id: number;
  frames: Array<{
    sceneTime: number;
    data: ArrayBuffer;
  }>;
};

type WorkerScope = {
  onmessage:
    | ((event: MessageEvent<DecodePrerenderFramesRequest>) => void)
    | null;
  postMessage: (
    message: DecodePrerenderFramesResponse,
    transfer: Transferable[],
  ) => void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = (event: MessageEvent<DecodePrerenderFramesRequest>) => {
  const decodedFrames = event.data.frames.map((frame) => {
    const decoded = bgraToRgbaClamped(new Uint8Array(frame.data));
    return { sceneTime: frame.sceneTime, data: decoded.buffer };
  });
  workerScope.postMessage(
    {
      id: event.data.id,
      frames: decodedFrames,
    } satisfies DecodePrerenderFramesResponse,
    decodedFrames.map((frame) => frame.data),
  );
};

function bgraToRgbaClamped(source: Uint8Array) {
  const bytes = new Uint8ClampedArray(source.byteLength);
  let hasTransparency = false;
  for (let index = 3; index < source.byteLength; index += 4) {
    if (source[index] !== 255) {
      hasTransparency = true;
      break;
    }
  }
  for (let index = 0; index < source.byteLength; index += 4) {
    const alpha = source[index + 3];
    bytes[index] = hasTransparency
      ? unpremultiplyColorChannel(source[index + 2], alpha)
      : source[index + 2];
    bytes[index + 1] = hasTransparency
      ? unpremultiplyColorChannel(source[index + 1], alpha)
      : source[index + 1];
    bytes[index + 2] = hasTransparency
      ? unpremultiplyColorChannel(source[index], alpha)
      : source[index];
    bytes[index + 3] = alpha;
  }
  return bytes;
}

function unpremultiplyColorChannel(value: number, alpha: number) {
  if (alpha === 0 || alpha === 255) return value;
  return Math.min(Math.round((value * 255) / alpha), 255);
}
