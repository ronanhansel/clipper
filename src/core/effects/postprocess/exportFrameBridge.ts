import type { PostProcessPass } from "../types";

export type ExportPostProcessFrameRequest = {
  width: number;
  height: number;
  sourceDataUrl: string;
  passes: PostProcessPass[];
};

export type ExportPostProcessFrameResult = {
  applied: boolean;
  outputDataUrl: string;
  droppedPassCount: number;
};

export type ExportPostProcessRenderInput<TPass extends PostProcessPass = PostProcessPass> = {
  canvas: HTMLCanvasElement;
  source: TexImageSource;
  pass: TPass;
  width: number;
  height: number;
};

export type ExportPostProcessRenderer<TPass extends PostProcessPass = PostProcessPass> = {
  kind: TPass["kind"] | string;
  maxPassesPerFrame?: number;
  unavailableMessage?: string;
  render(input: ExportPostProcessRenderInput<TPass>): boolean;
};

export function hasExportPostProcessPasses(passes: PostProcessPass[] | undefined): passes is PostProcessPass[] {
  return Boolean(passes?.length);
}

export function isPngDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/png;base64,/i.test(value);
}

export function isValidExportPostProcessFrameResult(result: unknown): result is ExportPostProcessFrameResult {
  if (!result || typeof result !== "object") return false;
  const candidate = result as Partial<ExportPostProcessFrameResult>;
  return candidate.applied === true && isPngDataUrl(candidate.outputDataUrl) && typeof candidate.droppedPassCount === "number";
}

export async function applyExportPostProcessFrame(input: ExportPostProcessFrameRequest, renderers: readonly ExportPostProcessRenderer[]): Promise<ExportPostProcessFrameResult> {
  if (!hasExportPostProcessPasses(input.passes)) return { applied: false, outputDataUrl: input.sourceDataUrl, droppedPassCount: 0 };
  if (!isPngDataUrl(input.sourceDataUrl)) throw new Error("Export post-process requires a PNG data URL source frame.");

  const registry = new Map(renderers.map((renderer) => [renderer.kind, renderer]));
  const renderedByKind = new Map<string, number>();
  const source = await imageElementFromDataUrl(input.sourceDataUrl);
  const canvases = [document.createElement("canvas"), document.createElement("canvas")];
  let sourceFrame: TexImageSource = source;
  let outputCanvasIndex = 0;
  let renderedPassCount = 0;
  let droppedPassCount = 0;

  try {
    for (const pass of input.passes) {
      const renderer = registry.get(pass.kind);
      if (!renderer) throw new Error(`Export post-process pass kind \"${pass.kind}\" is active but has no registered export renderer.`);

      const renderedForKind = renderedByKind.get(pass.kind) ?? 0;
      if (renderer.maxPassesPerFrame !== undefined && renderedForKind >= renderer.maxPassesPerFrame) {
        droppedPassCount += 1;
        continue;
      }

      const outputCanvas = canvases[outputCanvasIndex];
      outputCanvas.width = input.width;
      outputCanvas.height = input.height;
      if (!renderer.render({ canvas: outputCanvas, source: sourceFrame, pass, width: input.width, height: input.height })) {
        throw new Error(renderer.unavailableMessage ?? `Export post-process renderer is unavailable for active \"${pass.kind}\" pass.`);
      }
      sourceFrame = outputCanvas;
      outputCanvasIndex = (outputCanvasIndex + 1) % canvases.length;
      renderedByKind.set(pass.kind, renderedForKind + 1);
      renderedPassCount += 1;
    }
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }

  if (renderedPassCount === 0) return { applied: false, outputDataUrl: input.sourceDataUrl, droppedPassCount };

  const outputDataUrl = (sourceFrame as HTMLCanvasElement).toDataURL("image/png");
  if (!isPngDataUrl(outputDataUrl)) throw new Error("Export post-process WebGL readback did not produce a PNG data URL.");
  return { applied: true, outputDataUrl, droppedPassCount };
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
    image.onerror = () => settle(() => reject(new Error("Failed to decode export post-process source PNG.")));
    image.src = dataUrl;
    if (image.complete && image.naturalWidth > 0) settle(() => resolve(image));
  });
}
