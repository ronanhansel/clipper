import { cameraDofPostProcessKind } from "./cameraDof";
import {
  createCameraDofExportPostProcessRenderer,
  createCameraDofPostProcessRenderer,
  type CameraDofPostProcessRenderer,
} from "./cameraDofWebGlRenderer";
import { filmBurnTransitionPostProcessKind } from "./filmBurnTransition";
import {
  createFilmBurnTransitionExportPostProcessRenderer,
  createFilmBurnTransitionPostProcessRenderer,
  type FilmBurnTransitionPostProcessRenderer,
} from "./filmBurnTransitionWebGlRenderer";
import {
  lensPostProcessKind,
  withLensFrameBackground,
  type LensPostProcessPass,
} from "./lens";
import { lightLeakBandsTransitionPostProcessKind } from "./lightLeakBandsTransition";
import {
  createLightLeakBandsTransitionExportPostProcessRenderer,
  createLightLeakBandsTransitionPostProcessRenderer,
  type LightLeakBandsTransitionPostProcessRenderer,
} from "./lightLeakBandsTransitionWebGlRenderer";
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
    kind: cameraDofPostProcessKind,
    createRenderer: () =>
      createCameraDofPostProcessRenderer() as PostProcessRenderer,
    createExportRenderer: (renderer) =>
      createCameraDofExportPostProcessRenderer(
        renderer as CameraDofPostProcessRenderer,
      ) as ExportPostProcessRenderer,
  },
  {
    kind: filmBurnTransitionPostProcessKind,
    createRenderer: () =>
      createFilmBurnTransitionPostProcessRenderer() as PostProcessRenderer,
    createExportRenderer: (renderer) =>
      createFilmBurnTransitionExportPostProcessRenderer(
        renderer as FilmBurnTransitionPostProcessRenderer,
      ) as ExportPostProcessRenderer,
  },
  {
    kind: lightLeakBandsTransitionPostProcessKind,
    createRenderer: () =>
      createLightLeakBandsTransitionPostProcessRenderer() as PostProcessRenderer,
    createExportRenderer: (renderer) =>
      createLightLeakBandsTransitionExportPostProcessRenderer(
        renderer as LightLeakBandsTransitionPostProcessRenderer,
      ) as ExportPostProcessRenderer,
  },
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
