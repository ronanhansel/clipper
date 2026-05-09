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
import { vhsTrackingPostProcessKind } from "./vhsTracking";
import {
  createVhsTrackingExportPostProcessRenderer,
  createVhsTrackingPostProcessRenderer,
  type VhsTrackingPostProcessRenderer,
} from "./vhsTrackingWebGlRenderer";
import type { ExportPostProcessRenderer } from "./exportFrameBridge";
import type { PostProcessRenderer } from "./registry";
import type { PostProcessPass } from "../types";
import type { PostProcessPackage } from "./registry";

export const builtInPostProcessPackages = [
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
  {
    kind: vhsTrackingPostProcessKind,
    createRenderer: () =>
      createVhsTrackingPostProcessRenderer() as PostProcessRenderer,
    createExportRenderer: (renderer) =>
      createVhsTrackingExportPostProcessRenderer(
        renderer as VhsTrackingPostProcessRenderer,
      ) as ExportPostProcessRenderer,
  },
] as const satisfies readonly PostProcessPackage<PostProcessPass>[];
