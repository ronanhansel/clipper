import { type RefObject } from "react";
import { boundsToViewport, type CameraPreviewTransform } from "./camera";
import {
  getFramePortalOverlayTransform,
  viewportBoundsToPortal,
  type FramePortalOverlayTransform,
} from "./overlayGeometry";
import { type Bounds } from "./types";

export type PortalOverlaySyncInput = {
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  portalHost: HTMLElement;
};

export function readOverlayTransform(
  input: PortalOverlaySyncInput,
): FramePortalOverlayTransform {
  const frameElement = input.frameViewportRef.current;
  if (!frameElement) return { left: 0, top: 0, scale: 1 };
  return getFramePortalOverlayTransform(
    frameElement.getBoundingClientRect(),
    input.portalHost.getBoundingClientRect(),
    input.frameScale,
  );
}

export function syncBoundsToPortalElement(
  element: HTMLElement,
  bounds: Bounds,
  input: PortalOverlaySyncInput,
) {
  const viewportBounds = boundsToViewport(
    bounds,
    input.cameraTransform,
    input.frameScale,
  );
  const overlayTransform = readOverlayTransform(input);
  const portalBounds = viewportBoundsToPortal(viewportBounds, overlayTransform);
  element.style.setProperty(
    "--clipper-selection-base-left",
    `${portalBounds.x}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-top",
    `${portalBounds.y}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-width",
    `${portalBounds.width}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-height",
    `${portalBounds.height}px`,
  );
}

export function syncViewportBoundsToPortalElement(
  element: HTMLElement,
  viewportBounds: Bounds,
  input: PortalOverlaySyncInput,
) {
  const overlayTransform = readOverlayTransform(input);
  const portalBounds = viewportBoundsToPortal(viewportBounds, overlayTransform);
  element.style.setProperty(
    "--clipper-selection-base-left",
    `${portalBounds.x}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-top",
    `${portalBounds.y}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-width",
    `${portalBounds.width}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-height",
    `${portalBounds.height}px`,
  );
}

export function syncTargetRectToPortalElement(
  element: HTMLElement,
  targetRect: DOMRect,
  hostRect: DOMRect,
  insetPx: number,
) {
  element.style.setProperty(
    "--clipper-selection-base-left",
    `${targetRect.left - hostRect.left - insetPx}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-top",
    `${targetRect.top - hostRect.top - insetPx}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-width",
    `${targetRect.width + insetPx * 2}px`,
  );
  element.style.setProperty(
    "--clipper-selection-base-height",
    `${targetRect.height + insetPx * 2}px`,
  );
}

export function clearSelectionPreviewVars(element: HTMLElement) {
  element.style.removeProperty("--clipper-selection-preview-left");
  element.style.removeProperty("--clipper-selection-preview-top");
  element.style.removeProperty("--clipper-selection-preview-width");
  element.style.removeProperty("--clipper-selection-preview-height");
}

export function startPortalSyncLoop(tick: () => void): () => void {
  let frameId = 0;
  function loop() {
    tick();
    frameId = requestAnimationFrame(loop);
  }
  loop();
  return () => cancelAnimationFrame(frameId);
}
