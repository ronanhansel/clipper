import { describe, expect, it } from "vitest";
import { summarizeChildRenderOutput } from "./renderer.js";

describe("supervised export child output summary", () => {
  it("preserves export diagnostics while bounding native warning noise", () => {
    const summary = summarizeChildRenderOutput([
      "[123:tile_manager.cc:997] WARNING: tile memory limits exceeded, some content may not draw",
      "Download the React DevTools for a better development experience",
      "CLIPPER_EXPORT_DIAGNOSTIC kind=raster-failed Export SVG rasterization failed: Browser failed to decode SVG for export rasterization. owner=object:html:web-layer name=\"Web Layer\" markup=html raster=1200x800 bounds=0,0,600,400 tile=0,0,320,180 sourceOffset=0,0",
    ].join("\n"));

    expect(summary).toContain("native tile-memory warning(s) omitted");
    expect(summary).toContain("CLIPPER_EXPORT_DIAGNOSTIC kind=raster-failed");
    expect(summary).toContain("owner=object:html:web-layer");
    expect(summary).not.toContain("React DevTools");
  });
});
