import { useRef } from "react";
import { applyAdjustmentLayersToVisualStyle } from "../../../core/adjustments";
import type { AdjustmentVisualOverlay } from "../../../core/effects/types";
import type { AdjustmentLayer, TransitionLayer } from "../../../core/types";

type UsePostProcessLayerPreviewParams = {
  currentSceneTimeRef: { current: number };
  frameViewportRef: React.RefObject<HTMLDivElement | null>;
  visibleSceneAdjustmentLayers: AdjustmentLayer[];
  visibleSceneTransitionLayers: TransitionLayer[];
  setPreviewTransitionLayers: (layers: TransitionLayer[] | null) => void;
};

function syncAdjustmentPreviewOverlays(
  frameViewportRef: React.RefObject<HTMLDivElement | null>,
  target: "frame" | "camera",
  overlays: AdjustmentVisualOverlay[] | undefined,
) {
  const container = frameViewportRef.current?.querySelector<HTMLElement>(
    `[data-clipper-visual-adjustment-overlays="${target}"]`,
  );
  if (!container) return;
  container.replaceChildren(
    ...(overlays ?? []).map((overlay) => {
      const element = document.createElement("div");
      element.className = "pointer-events-none absolute inset-0";
      element.style.zIndex = "2147483647";
      Object.assign(element.style, overlay.style);
      return element;
    }),
  );
}

function applyAdjustmentPreviewDom(
  frameViewportRef: React.RefObject<HTMLDivElement | null>,
  style: ReturnType<typeof applyAdjustmentLayersToVisualStyle>,
) {
  const visualElement = frameViewportRef.current?.querySelector<HTMLElement>(
    "[data-clipper-visual-adjustments]",
  );
  if (visualElement) {
    if (style.filter) visualElement.style.filter = style.filter;
    else visualElement.style.removeProperty("filter");
  }
  syncAdjustmentPreviewOverlays(
    frameViewportRef,
    "frame",
    style.overlays?.filter((overlay) => overlay.target === "frame"),
  );
  syncAdjustmentPreviewOverlays(
    frameViewportRef,
    "camera",
    style.overlays?.filter(
      (overlay) => (overlay.target ?? "camera") === "camera",
    ),
  );
}

export function usePostProcessLayerPreview({
  currentSceneTimeRef,
  frameViewportRef,
  visibleSceneAdjustmentLayers,
  visibleSceneTransitionLayers,
  setPreviewTransitionLayers,
}: UsePostProcessLayerPreviewParams) {
  const pendingAdjustmentPreviewRef = useRef<AdjustmentLayer[] | null>(null);
  const adjustmentPreviewFrameRef = useRef(0);
  const pendingTransitionPreviewRef = useRef<TransitionLayer[] | null>(null);
  const transitionPreviewFrameRef = useRef(0);
  function previewAdjustmentLayer(
    layerId: string,
    updater: (layer: AdjustmentLayer) => AdjustmentLayer,
  ) {
    const nextLayers = visibleSceneAdjustmentLayers.map((layer) =>
      layer.id === layerId ? updater(layer) : layer,
    );
    pendingAdjustmentPreviewRef.current = nextLayers;
    if (adjustmentPreviewFrameRef.current) return;
    adjustmentPreviewFrameRef.current = requestAnimationFrame(() => {
      adjustmentPreviewFrameRef.current = 0;
      const layers = pendingAdjustmentPreviewRef.current;
      if (!layers) return;
      window.dispatchEvent(
        new CustomEvent("clipper:preview-postprocess-adjustment", {
          detail: { layers },
        }),
      );
      applyAdjustmentPreviewDom(
        frameViewportRef,
        applyAdjustmentLayersToVisualStyle(currentSceneTimeRef.current, layers),
      );
    });
  }

  function clearAdjustmentPreview() {
    pendingAdjustmentPreviewRef.current = null;
    window.dispatchEvent(
      new CustomEvent("clipper:preview-postprocess-adjustment", {
        detail: { layers: null },
      }),
    );
    if (adjustmentPreviewFrameRef.current) {
      cancelAnimationFrame(adjustmentPreviewFrameRef.current);
      adjustmentPreviewFrameRef.current = 0;
    }
  }

  function previewTransitionLayer(
    layerId: string,
    updater: (layer: TransitionLayer) => TransitionLayer,
  ) {
    const nextLayers = visibleSceneTransitionLayers.map((layer) =>
      layer.id === layerId ? updater(layer) : layer,
    );
    pendingTransitionPreviewRef.current = nextLayers;
    if (transitionPreviewFrameRef.current) return;
    transitionPreviewFrameRef.current = requestAnimationFrame(() => {
      transitionPreviewFrameRef.current = 0;
      const layers = pendingTransitionPreviewRef.current;
      if (!layers) return;
      setPreviewTransitionLayers(layers);
    });
  }

  function clearTransitionPreview() {
    pendingTransitionPreviewRef.current = null;
    setPreviewTransitionLayers(null);
    if (transitionPreviewFrameRef.current) {
      cancelAnimationFrame(transitionPreviewFrameRef.current);
      transitionPreviewFrameRef.current = 0;
    }
  }

  return {
    previewAdjustmentLayer,
    clearAdjustmentPreview,
    previewTransitionLayer,
    clearTransitionPreview,
  };
}
