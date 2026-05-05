import { contextBridge } from "electron";

// ═══════════════════════════════════════════════════════════════════════════
// Export Window Preload — narrow post-process MessagePort bridge
//
// Receives a MessagePort from main process via webContents.postMessage,
// relays raw frame data (ArrayBuffer) to the page world for WebGL
// post-processing, and returns the processed result to main.
//
// With contextIsolation enabled the preload world has access to the real
// window and its event system.  window.postMessage between the preload
// and page worlds is the standard way to exchange messages (including
// ArrayBuffer transfers) across Electron's context isolation boundary.
// ═══════════════════════════════════════════════════════════════════════════

// ── Minimal DOM type declarations (preload runs in a renderer context
//    but tsconfig.node.json does not include "DOM" lib). ─────────────────

declare const window: {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown, targetOrigin: string, transfer?: ArrayBuffer[]): void;
};
declare class MessagePort {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  start(): void;
}
declare class MessageEvent {
  readonly data: unknown;
  readonly ports: readonly MessagePort[];
}

// ═══════════════════════════════════════════════════════════════════════════

let framePort: MessagePort | null = null;

// ── Receive port from main process ─────────────────────────────────────

window.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as { type?: string } | null;
  if (msg?.type !== "clipper:export-postprocess-init") return;
  const port = event.ports[0];
  if (!port) return;

  framePort = port;

  framePort.addEventListener("message", (msgEvent: MessageEvent) => {
    const { requestId, width, height, pixelFormat, passes, sourceData } =
      msgEvent.data as {
        requestId: string;
        width: number;
        height: number;
        pixelFormat: string;
        passes: unknown[];
        sourceData: ArrayBuffer;
      };

    // Relay frame data to the page world via window.postMessage.
    // The ArrayBuffer is included in both the message payload and the
    // transfer list so ownership moves (zero-copy when supported).
    try {
      window.postMessage(
        {
          type: "clipper:export-postprocess-frame",
          requestId,
          width,
          height,
          pixelFormat,
          passes,
          sourceData,
        },
        "*",
        [sourceData],
      );
    } catch {
      // If transfer fails (unlikely but possible in some Electron
      // builds), fall back to a plain structured-clone copy.
      window.postMessage(
        {
          type: "clipper:export-postprocess-frame",
          requestId,
          width,
          height,
          pixelFormat,
          passes,
          sourceData,
        },
        "*",
      );
    }
  });

  framePort.start();

  // ── Relay result from page world back to main ─────────────────────────

  window.addEventListener("message", (resultEvent: MessageEvent) => {
    const resultMsg = resultEvent.data as { type?: string } | null;
    if (resultMsg?.type !== "clipper:export-postprocess-result") return;
    if (!framePort) return;

    const {
      requestId,
      applied,
      pixelFormat: resultPixelFormat,
      droppedPassCount,
      resultData,
    } = resultEvent.data as {
      requestId: string;
      applied: boolean;
      pixelFormat: string;
      droppedPassCount: number;
      resultData: ArrayBuffer;
    };

    try {
      framePort.postMessage(
        {
          type: "clipper:export-postprocess-result",
          requestId,
          applied,
          pixelFormat: resultPixelFormat,
          droppedPassCount,
          resultData,
        },
        [resultData],
      );
    } catch {
      framePort.postMessage({
        type: "clipper:export-postprocess-result",
        requestId,
        applied,
        pixelFormat: resultPixelFormat,
        droppedPassCount,
        resultData,
      });
    }
  });
});

// ── Expose narrow availability flag to page world ──────────────────────

contextBridge.exposeInMainWorld("clipperExportPostProcess", {
  /** `true` once the main process has delivered the MessagePort. */
  isReady: (): boolean => framePort !== null,
});
