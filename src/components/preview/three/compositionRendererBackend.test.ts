import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compositionRendererBackendStorageKey,
  readCompositionRendererBackendRequest,
  selectCompositionRendererBackend,
  webGpuCompositionRendererBlockers,
} from "./compositionRendererBackend";

describe("composition renderer backend selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to WebGL when WebGPU is unavailable", () => {
    expect(selectCompositionRendererBackend({ hasWebGpu: false })).toEqual({
      kind: "webgl",
      requested: "auto",
      reason: "webgpu-unavailable",
    });
  });

  it("keeps explicit WebGL requests on the WebGL path", () => {
    expect(
      selectCompositionRendererBackend({
        requested: "webgl",
        hasWebGpu: true,
        webGpuMaterialsReady: true,
      }),
    ).toEqual({
      kind: "webgl",
      requested: "webgl",
      reason: "requested-webgl",
    });
  });

  it("rejects explicit WebGPU while material and postprocess ports are missing", () => {
    expect(
      selectCompositionRendererBackend({
        requested: "webgpu",
        hasWebGpu: true,
        webGpuMaterialsReady: false,
      }),
    ).toEqual({
      kind: "webgl",
      requested: "webgpu",
      reason: "webgpu-materials-not-ported",
    });
  });

  it("selects WebGPU only after the renderer-facing materials are ready", () => {
    expect(
      selectCompositionRendererBackend({
        requested: "webgpu",
        hasWebGpu: true,
        webGpuMaterialsReady: true,
      }),
    ).toEqual({
      kind: "webgpu",
      requested: "webgpu",
      reason: "webgpu-ready",
    });
  });

  it("reads the backend request from the window override before storage", () => {
    vi.stubGlobal("window", {
      clipper: { compositionRendererBackend: "webgpu" },
    });

    expect(
      readCompositionRendererBackendRequest({
        getItem: (key) =>
          key === compositionRendererBackendStorageKey ? "webgl" : null,
      }),
    ).toBe("webgpu");
  });

  it("reads valid backend requests from storage", () => {
    expect(
      readCompositionRendererBackendRequest({
        getItem: (key) =>
          key === compositionRendererBackendStorageKey ? "webgl" : null,
      }),
    ).toBe("webgl");
  });

  it("ignores invalid stored backend requests", () => {
    expect(
      readCompositionRendererBackendRequest({
        getItem: () => "webgpu2",
      }),
    ).toBe("auto");
  });

  it("tracks current WebGPU blockers for the composition path", () => {
    expect(webGpuCompositionRendererBlockers).toEqual([]);
  });
});
