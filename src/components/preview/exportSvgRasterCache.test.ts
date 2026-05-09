import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSvgRasterCacheKey,
  rasterizeSvgForExport,
  serializeSvgForRaster,
  shouldPreRasterizeSvgForExport,
} from "./exportSvgRasterCache";

const originalImage = globalThis.Image;
const originalDocument = globalThis.document;

afterEach(() => {
  globalThis.Image = originalImage;
  globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

describe("export SVG raster cache", () => {
  it("pre-rasterizes dense SVG at export scale", () => {
    const svg = `<svg>${"<path d='M0 0L1 1'/>".repeat(500)}</svg>`;

    expect(
      shouldPreRasterizeSvgForExport({
        svg,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        frameScale: 2,
      }),
    ).toBe(true);
  });

  it("does not rasterize small SVG previews unnecessarily", () => {
    expect(
      shouldPreRasterizeSvgForExport({
        svg: "<svg><circle r='4'/></svg>",
        bounds: { x: 0, y: 0, width: 64, height: 64 },
        frameScale: 1,
      }),
    ).toBe(false);
  });

  it("keys cache entries by content, bounds, scale, and relevant style", () => {
    const base = {
      svg: "<svg><path d='M0 0'/></svg>",
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      frameScale: 2,
    };

    expect(getSvgRasterCacheKey({ ...base, style: { color: "red" } })).not.toBe(
      getSvgRasterCacheKey({ ...base, style: { color: "blue" } }),
    );
    expect(
      getSvgRasterCacheKey({ ...base, style: { "--accent": "#f00" } }),
    ).not.toBe(
      getSvgRasterCacheKey({ ...base, style: { "--accent": "#0f0" } }),
    );
    expect(
      getSvgRasterCacheKey({ ...base, style: { fontFamily: "Inter" } }),
    ).not.toBe(
      getSvgRasterCacheKey({ ...base, style: { fontFamily: "Georgia" } }),
    );
    expect(getSvgRasterCacheKey(base)).not.toBe(
      getSvgRasterCacheKey({ ...base, frameScale: 3 }),
    );
  });

  it("applies inherited render styles to the serialized SVG root", () => {
    const svg = serializeSvgForRaster(
      "<svg viewBox='0 0 10 10' style='display:block'><text>Hi</text></svg>",
      200,
      100,
      { color: "red", fontFamily: "Inter", "--accent": "#fff" },
    );

    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
    expect(svg).toContain("viewBox='0 0 10 10'");
    expect(svg).toContain("display:block");
    expect(svg).toContain("color:red");
    expect(svg).toContain("font-family:Inter");
    expect(svg).toContain("--accent:#fff");
  });

  it("does not inject a viewBox when the source SVG has none", () => {
    const svg = serializeSvgForRaster(
      "<svg><rect width='50' height='50'/></svg>",
      200,
      100,
      undefined,
    );

    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
    expect(svg).not.toMatch(/viewBox=/i);
  });

  it("serializes cropped SVG content with a translated source surface", () => {
    const svg = serializeSvgForRaster(
      "<svg viewBox='0 0 100 50'><path d='M0 0L100 50'/></svg>",
      320,
      180,
      { color: "red" },
      "svg",
      { x: 0, y: 0, width: 1588, height: 798 },
      { x: 200, y: 100 },
      2,
    );

    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="180"');
    expect(svg).toContain('viewBox="0 0 320 180"');
    expect(svg).toContain('transform="translate(-400 -200)"');
    expect(svg).toContain('width="3176"');
    expect(svg).toContain('height="1596"');
    expect(svg).toContain("color:red");
    expect(svg).toContain(
      '<svg viewBox=\'0 0 100 50\' width="3176" height="1596"',
    );
  });

  it("normalizes viewBox-only cropped SVG roots to the full source surface", () => {
    const svg = serializeSvgForRaster(
      "<svg viewBox='0 0 100 50'><rect width='100' height='50'/></svg>",
      320,
      180,
      undefined,
      "svg",
      { x: 0, y: 0, width: 800, height: 450 },
      { x: 240, y: 120 },
      2,
    );

    expect(svg).toContain('viewBox="0 0 320 180"');
    expect(svg).toContain('transform="translate(-480 -240)"');
    expect(svg).toContain(
      '<svg viewBox=\'0 0 100 50\' width="1600" height="900"',
    );
    expect(svg).not.toContain("<svg viewBox='0 0 100 50'><rect");
  });
});
