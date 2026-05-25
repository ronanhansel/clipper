export type CompositionRendererBackendKind = "webgpu" | "disabled";

export type CompositionRendererBackendRequest = "webgpu" | "auto";

export type CompositionRendererBackendSelection = {
  kind: CompositionRendererBackendKind;
  requested: CompositionRendererBackendRequest;
  reason: string;
};

export const compositionRendererBackendStorageKey =
  "clipper:composition-renderer-backend";

export const webGpuCompositionRendererBlockers = [] as const;

export function readCompositionRendererBackendRequest(
  storage: Pick<Storage, "getItem"> | null = getBrowserLocalStorage(),
): CompositionRendererBackendRequest {
  const override = getWindowBackendOverride();
  if (override) return override;
  const stored = storage?.getItem(compositionRendererBackendStorageKey);
  if (stored === "webgpu" || stored === "auto") {
    return stored;
  }
  return "auto";
}

export function selectCompositionRendererBackend(input: {
  requested?: CompositionRendererBackendRequest;
  hasWebGpu?: boolean;
  webGpuMaterialsReady?: boolean;
}): CompositionRendererBackendSelection {
  const requested = input.requested ?? "auto";
  const hasWebGpu = input.hasWebGpu ?? hasBrowserWebGpu();
  const webGpuMaterialsReady = input.webGpuMaterialsReady ?? false;

  if (!hasWebGpu) {
    return { kind: "disabled", requested, reason: "webgpu-unavailable" };
  }
  if (!webGpuMaterialsReady) {
    return {
      kind: "disabled",
      requested,
      reason: "webgpu-materials-not-ported",
    };
  }
  return { kind: "webgpu", requested, reason: "webgpu-ready" };
}

function getBrowserLocalStorage(): Pick<Storage, "getItem"> | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getWindowBackendOverride(): CompositionRendererBackendRequest | null {
  if (typeof window === "undefined") return null;
  const clipper = window.clipper as
    | (typeof window.clipper & {
        compositionRendererBackend?: unknown;
      })
    | undefined;
  const value = clipper?.compositionRendererBackend;
  if (value === "webgpu" || value === "auto") {
    return value;
  }
  return null;
}

function hasBrowserWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
