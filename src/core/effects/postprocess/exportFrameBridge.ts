import type { PostProcessPass } from "../types";

export type ExportPostProcessFrameRequest = {
  width: number;
  height: number;
  sourceDataUrl: string;
  passes: PostProcessPass[];
};

export type ExportRawFramePixelFormat = "bgra" | "rgba";

export type ExportRawFramePayload = {
  width: number;
  height: number;
  pixelFormat: ExportRawFramePixelFormat;
  data?: ArrayBuffer | Uint8Array | number[];
  dataBase64?: string;
};

export type ExportRawPostProcessFrameRequest = {
  width: number;
  height: number;
  sourceFrame: ExportRawFramePayload;
  passes: PostProcessPass[];
};

export type ExportPostProcessFrameResult = {
  applied: boolean;
  outputDataUrl: string;
  droppedPassCount: number;
};

export type ExportRawPostProcessFrameResult = {
  applied: boolean;
  outputFrame: ExportRawFramePayload;
  droppedPassCount: number;
};

export type ExportPostProcessRenderInput<
  TPass extends PostProcessPass = PostProcessPass,
> = {
  canvas: HTMLCanvasElement;
  source: TexImageSource;
  pass: TPass;
  width: number;
  height: number;
};

export type ExportPostProcessRenderer<
  TPass extends PostProcessPass = PostProcessPass,
> = {
  kind: TPass["kind"] | string;
  maxPassesPerFrame?: number;
  unavailableMessage?: string;
  render(input: ExportPostProcessRenderInput<TPass>): boolean;
};

export function hasExportPostProcessPasses(
  passes: PostProcessPass[] | undefined,
): passes is PostProcessPass[] {
  return Boolean(passes?.length);
}

export function isPngDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/png;base64,/i.test(value);
}

export function isValidExportPostProcessFrameResult(
  result: unknown,
): result is ExportPostProcessFrameResult {
  if (!result || typeof result !== "object") return false;
  const candidate = result as Partial<ExportPostProcessFrameResult>;
  return (
    candidate.applied === true &&
    isPngDataUrl(candidate.outputDataUrl) &&
    typeof candidate.droppedPassCount === "number"
  );
}

export function isValidExportRawFramePayload(
  payload: unknown,
  width?: number,
  height?: number,
): payload is ExportRawFramePayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<ExportRawFramePayload>;
  if (
    !isPositiveInteger(candidate.width) ||
    !isPositiveInteger(candidate.height)
  )
    return false;
  if (width !== undefined && candidate.width !== width) return false;
  if (height !== undefined && candidate.height !== height) return false;
  if (candidate.pixelFormat !== "bgra" && candidate.pixelFormat !== "rgba")
    return false;
  return (
    getRawFrameByteLength(candidate) === candidate.width * candidate.height * 4
  );
}

export function isValidExportRawPostProcessFrameResult(
  result: unknown,
  width?: number,
  height?: number,
): result is ExportRawPostProcessFrameResult {
  if (!result || typeof result !== "object") return false;
  const candidate = result as Partial<ExportRawPostProcessFrameResult>;
  return (
    candidate.applied === true &&
    typeof candidate.droppedPassCount === "number" &&
    isValidExportRawFramePayload(candidate.outputFrame, width, height)
  );
}

export function bgraBytesToRgbaClamped(source: Uint8Array): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.byteLength);
  for (let index = 0; index < source.byteLength; index += 4) {
    output[index] = source[index + 2];
    output[index + 1] = source[index + 1];
    output[index + 2] = source[index];
    output[index + 3] = source[index + 3];
  }
  return output;
}

export function rgbaBytesToBgra(source: Uint8Array): Uint8Array {
  const output = new Uint8Array(source.byteLength);
  for (let index = 0; index < source.byteLength; index += 4) {
    output[index] = source[index + 2];
    output[index + 1] = source[index + 1];
    output[index + 2] = source[index];
    output[index + 3] = source[index + 3];
  }
  return output;
}

export function webGlReadPixelsRgbaToTopLeftRgba(
  source: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(source.byteLength);
  const stride = width * 4;
  for (let row = 0; row < height; row += 1) {
    output.set(
      source.subarray((height - row - 1) * stride, (height - row) * stride),
      row * stride,
    );
  }
  return output;
}

export async function applyExportPostProcessFrame(
  input: ExportPostProcessFrameRequest,
  renderers: readonly ExportPostProcessRenderer[],
): Promise<ExportPostProcessFrameResult> {
  if (!hasExportPostProcessPasses(input.passes))
    return {
      applied: false,
      outputDataUrl: input.sourceDataUrl,
      droppedPassCount: 0,
    };
  if (!isPngDataUrl(input.sourceDataUrl))
    throw new Error(
      "Export post-process requires a PNG data URL source frame.",
    );

  const registry = new Map(
    renderers.map((renderer) => [renderer.kind, renderer]),
  );
  const renderedByKind = new Map<string, number>();
  const source = await imageElementFromDataUrl(input.sourceDataUrl);
  const canvases = [
    document.createElement("canvas"),
    document.createElement("canvas"),
  ];
  let sourceFrame: TexImageSource = source;
  let outputCanvasIndex = 0;
  let renderedPassCount = 0;
  let droppedPassCount = 0;

  try {
    for (const pass of input.passes) {
      const renderer = registry.get(pass.kind);
      if (!renderer)
        throw new Error(
          `Export post-process pass kind \"${pass.kind}\" is active but has no registered export renderer.`,
        );

      const renderedForKind = renderedByKind.get(pass.kind) ?? 0;
      if (
        renderer.maxPassesPerFrame !== undefined &&
        renderedForKind >= renderer.maxPassesPerFrame
      ) {
        droppedPassCount += 1;
        continue;
      }

      const outputCanvas = canvases[outputCanvasIndex];
      outputCanvas.width = input.width;
      outputCanvas.height = input.height;
      if (
        !renderer.render({
          canvas: outputCanvas,
          source: sourceFrame,
          pass,
          width: input.width,
          height: input.height,
        })
      ) {
        throw new Error(
          renderer.unavailableMessage ??
            `Export post-process renderer is unavailable for active \"${pass.kind}\" pass.`,
        );
      }
      sourceFrame = outputCanvas;
      outputCanvasIndex = (outputCanvasIndex + 1) % canvases.length;
      renderedByKind.set(pass.kind, renderedForKind + 1);
      renderedPassCount += 1;
    }
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }

  if (renderedPassCount === 0)
    return {
      applied: false,
      outputDataUrl: input.sourceDataUrl,
      droppedPassCount,
    };

  const outputDataUrl = (sourceFrame as HTMLCanvasElement).toDataURL(
    "image/png",
  );
  if (!isPngDataUrl(outputDataUrl))
    throw new Error(
      "Export post-process WebGL readback did not produce a PNG data URL.",
    );
  return { applied: true, outputDataUrl, droppedPassCount };
}

export async function applyExportRawPostProcessFrame(
  input: ExportRawPostProcessFrameRequest,
  renderers: readonly ExportPostProcessRenderer[],
): Promise<ExportRawPostProcessFrameResult> {
  if (!hasExportPostProcessPasses(input.passes))
    return {
      applied: false,
      outputFrame: input.sourceFrame,
      droppedPassCount: 0,
    };
  if (
    !isValidExportRawFramePayload(input.sourceFrame, input.width, input.height)
  )
    throw new Error("Export post-process requires a valid raw source frame.");

  const canvases = [
    document.createElement("canvas"),
    document.createElement("canvas"),
  ];
  const sourceCanvas = createCanvasFromRawFrame(input.sourceFrame);
  const { sourceFrame, renderedPassCount, droppedPassCount } =
    renderPostProcessPasses(
      { ...input, source: sourceCanvas, canvases },
      renderers,
    );

  if (renderedPassCount === 0)
    return { applied: false, outputFrame: input.sourceFrame, droppedPassCount };

  const outputFrame = readCanvasToRawFrame(
    sourceFrame as HTMLCanvasElement,
    input.width,
    input.height,
  );
  return { applied: true, outputFrame, droppedPassCount };
}

type RenderPostProcessPassesInput = {
  width: number;
  height: number;
  passes: PostProcessPass[];
  source: TexImageSource;
  canvases: HTMLCanvasElement[];
};

function renderPostProcessPasses(
  input: RenderPostProcessPassesInput,
  renderers: readonly ExportPostProcessRenderer[],
) {
  const registry = new Map(
    renderers.map((renderer) => [renderer.kind, renderer]),
  );
  const renderedByKind = new Map<string, number>();
  let sourceFrame: TexImageSource = input.source;
  let outputCanvasIndex = 0;
  let renderedPassCount = 0;
  let droppedPassCount = 0;

  for (const pass of input.passes) {
    const renderer = registry.get(pass.kind);
    if (!renderer)
      throw new Error(
        `Export post-process pass kind \"${pass.kind}\" is active but has no registered export renderer.`,
      );

    const renderedForKind = renderedByKind.get(pass.kind) ?? 0;
    if (
      renderer.maxPassesPerFrame !== undefined &&
      renderedForKind >= renderer.maxPassesPerFrame
    ) {
      droppedPassCount += 1;
      continue;
    }

    const outputCanvas = input.canvases[outputCanvasIndex];
    outputCanvas.width = input.width;
    outputCanvas.height = input.height;
    if (
      !renderer.render({
        canvas: outputCanvas,
        source: sourceFrame,
        pass,
        width: input.width,
        height: input.height,
      })
    ) {
      throw new Error(
        renderer.unavailableMessage ??
          `Export post-process renderer is unavailable for active \"${pass.kind}\" pass.`,
      );
    }
    sourceFrame = outputCanvas;
    outputCanvasIndex = (outputCanvasIndex + 1) % input.canvases.length;
    renderedByKind.set(pass.kind, renderedForKind + 1);
    renderedPassCount += 1;
  }

  return { sourceFrame, renderedPassCount, droppedPassCount };
}

function createCanvasFromRawFrame(
  frame: ExportRawFramePayload,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Export post-process raw frame bridge requires a 2D canvas context.",
    );
  const bytes = getRawFrameBytes(frame);
  const rgba = new Uint8ClampedArray(
    frame.pixelFormat === "bgra" ? bgraBytesToRgbaClamped(bytes) : bytes,
  );
  context.putImageData(
    new ImageData(rgba, frame.width, frame.height, { colorSpace: "srgb" }),
    0,
    0,
  );
  return canvas;
}

export function readCanvasToRawFrame(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): ExportRawFramePayload {
  const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
  if (gl && !gl.isContextLost()) {
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return {
      width,
      height,
      pixelFormat: "rgba",
      data: webGlReadPixelsRgbaToTopLeftRgba(pixels, width, height),
    };
  }
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Export post-process raw frame bridge could not read processed pixels.",
    );
  return {
    width,
    height,
    pixelFormat: "rgba",
    data: new Uint8Array(context.getImageData(0, 0, width, height).data),
  };
}

function getRawFrameBytes(frame: ExportRawFramePayload): Uint8Array {
  if (ArrayBuffer.isView(frame.data))
    return new Uint8Array(
      frame.data.buffer,
      frame.data.byteOffset,
      frame.data.byteLength,
    );
  if (frame.data instanceof ArrayBuffer) return new Uint8Array(frame.data);
  if (Array.isArray(frame.data)) return new Uint8Array(frame.data);
  if (typeof frame.dataBase64 === "string")
    return base64ToBytes(frame.dataBase64);
  throw new Error("Export raw frame payload did not include pixel data.");
}

function getRawFrameByteLength(frame: Partial<ExportRawFramePayload>): number {
  if (ArrayBuffer.isView(frame.data) || frame.data instanceof ArrayBuffer)
    return frame.data.byteLength;
  if (Array.isArray(frame.data)) return frame.data.length;
  if (typeof frame.dataBase64 === "string")
    return (
      Math.floor((frame.dataBase64.length * 3) / 4) -
      (frame.dataBase64.endsWith("==")
        ? 2
        : frame.dataBase64.endsWith("=")
          ? 1
          : 0)
    );
  return -1;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function imageElementFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    image.onload = () => settle(() => resolve(image));
    image.onerror = () =>
      settle(() =>
        reject(new Error("Failed to decode export post-process source PNG.")),
      );
    image.src = dataUrl;
    if (image.complete && image.naturalWidth > 0) settle(() => resolve(image));
  });
}
