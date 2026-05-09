import {
  lensPostProcessKind,
  withLensFrameBackground,
  type LensPostProcessPass,
} from "./lens";
import {
  createLensExportPostProcessRenderer,
  createLensPostProcessRenderer,
  type LensPostProcessRenderer,
} from "./lensWebGlRenderer";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import type { WebGlPostProcessRenderer } from "./webGlRenderer";
import type { PostProcessPass } from "../types";

export type PostProcessRenderer = WebGlPostProcessRenderer<PostProcessPass>;

export type PostProcessPackage<
  TPass extends PostProcessPass = PostProcessPass,
> = {
  kind: TPass["kind"] | string;
  createRenderer: () => PostProcessRenderer;
  createExportRenderer: (
    renderer: PostProcessRenderer,
  ) => ExportPostProcessRenderer<TPass>;
  withFrameBackground?: (pass: TPass, background: unknown) => TPass;
};

const defaultPostProcessPackages: readonly PostProcessPackage[] = [
  {
    kind: lensPostProcessKind,
    createRenderer: () =>
      createLensPostProcessRenderer() as PostProcessRenderer,
    createExportRenderer: (renderer) =>
      createLensExportPostProcessRenderer(
        renderer as LensPostProcessRenderer,
      ) as ExportPostProcessRenderer,
    withFrameBackground: (pass, background) =>
      withLensFrameBackground(
        pass as LensPostProcessPass,
        background,
      ) as PostProcessPass,
  },
];

export function getDefaultPostProcessPackages(): readonly PostProcessPackage[] {
  return defaultPostProcessPackages;
}

export function createDefaultPostProcessRenderer(
  kind: string,
): PostProcessRenderer | null {
  return (
    getDefaultPostProcessPackages()
      .find((definition) => definition.kind === kind)
      ?.createRenderer() ?? null
  );
}

export function createDefaultExportPostProcessRenderers(
  renderers: Map<string, PostProcessRenderer>,
): ExportPostProcessRenderer[] {
  return getDefaultPostProcessPackages().map((definition) => {
    let renderer = renderers.get(definition.kind);
    if (!renderer) {
      renderer = definition.createRenderer();
      renderers.set(definition.kind, renderer);
    }
    return definition.createExportRenderer(renderer);
  });
}

export function decoratePostProcessPassFrameBackground(
  pass: PostProcessPass,
  background: unknown,
): PostProcessPass {
  const definition = getDefaultPostProcessPackages().find(
    (candidate) => candidate.kind === pass.kind,
  );
  return definition?.withFrameBackground
    ? definition.withFrameBackground(pass, background)
    : pass;
}
