import { describe, expect, it } from "vitest";
import {
  applyExportRawPostProcessFrame,
  isValidExportRawFramePayload,
  isValidExportRawPostProcessFrameResult,
  bgraBytesToRgbaClamped,
  rgbaBytesToBgra,
  type ExportRawFramePayload,
} from "./exportFrameBridge";

describe("raw frame export post-process bridge (transferable data path)", () => {
  const bgraFrame = (data: Uint8Array): ExportRawFramePayload => ({
    width: 2,
    height: 2,
    pixelFormat: "bgra",
    data,
  });

  const rgbaFrame = (data: Uint8Array): ExportRawFramePayload => ({
    width: 2,
    height: 2,
    pixelFormat: "rgba",
    data,
  });

  it("accepts raw ArrayBuffer payloads (the transferable port format)", () => {
    const buffer = new ArrayBuffer(16);
    new Uint8Array(buffer).set([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);

    const payload: ExportRawFramePayload = {
      width: 2,
      height: 2,
      pixelFormat: "bgra",
      data: buffer,
    };

    expect(isValidExportRawFramePayload(payload, 2, 2)).toBe(true);
  });

  it("accepts raw Uint8Array payloads (the structured-clone format)", () => {
    const payload = bgraFrame(new Uint8Array(16));

    expect(isValidExportRawFramePayload(payload, 2, 2)).toBe(true);
  });

  it("rejects undersized ArrayBuffer payloads", () => {
    const payload: ExportRawFramePayload = {
      width: 2,
      height: 2,
      pixelFormat: "bgra",
      data: new ArrayBuffer(8),
    };

    expect(isValidExportRawFramePayload(payload, 2, 2)).toBe(false);
  });

  it("rejects non-matching dimensions in validation", () => {
    const payload = bgraFrame(new Uint8Array(16));

    expect(isValidExportRawFramePayload(payload, 4, 2)).toBe(false);
    expect(isValidExportRawFramePayload(payload, 2, 4)).toBe(false);
  });

  it("validates bridge result format", () => {
    const outputFrame = rgbaFrame(new Uint8Array(16));

    expect(
      isValidExportRawPostProcessFrameResult(
        { applied: true, outputFrame, droppedPassCount: 0 },
        2,
        2,
      ),
    ).toBe(true);
    expect(
      isValidExportRawPostProcessFrameResult(
        { applied: false, outputFrame, droppedPassCount: 0 },
        2,
        2,
      ),
    ).toBe(false);
    expect(
      isValidExportRawPostProcessFrameResult(
        {
          applied: true,
          outputFrame: { ...outputFrame, pixelFormat: "rgb" as const },
          droppedPassCount: 0,
        },
        2,
        2,
      ),
    ).toBe(false);
  });

  it("preserves no-pass direct route for raw payloads", async () => {
    const sourceFrame = bgraFrame(new Uint8Array(16));

    await expect(
      applyExportRawPostProcessFrame(
        { width: 2, height: 2, sourceFrame, passes: [] },
        [],
      ),
    ).resolves.toEqual({
      applied: false,
      outputFrame: sourceFrame,
      droppedPassCount: 0,
    });
  });

  it("converts BGRA ↔ RGBA without row changes", () => {
    const bgra = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128]);
    const rgba = bgraBytesToRgbaClamped(bgra);
    const back = rgbaBytesToBgra(new Uint8Array(rgba));

    expect([...rgba]).toEqual([30, 20, 10, 255, 60, 50, 40, 128]);
    expect([...back]).toEqual([...bgra]);
  });

  it("rejects payloads with unsupported pixel formats", () => {
    const payload: ExportRawFramePayload = {
      width: 2,
      height: 2,
      pixelFormat: "rgba" as const,
      data: new Uint8Array(16),
    };

    // RGBA is valid
    expect(isValidExportRawFramePayload(payload, 2, 2)).toBe(true);

    // bogus format
    const bad = {
      ...payload,
      pixelFormat: "rgb",
    } as unknown as ExportRawFramePayload;
    expect(isValidExportRawFramePayload(bad)).toBe(false);
  });
});
