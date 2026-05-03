import { describe, expect, it } from "vitest";
import { analyzeFastCanvasExportCapability, scenePrefersTiledCapture } from "../../electron/exportSceneHeuristics";

describe("export scene heaviness heuristics", () => {
  it("detects heavy composition objects", () => {
    expect(scenePrefersTiledCapture({ compositions: [{ objects: [{ type: "html", content: "<style>@keyframes glow{}</style>" }] }] })).toBe(true);
    expect(scenePrefersTiledCapture({ compositions: [{ objects: [{ type: "svg", content: "<path />" }] }] })).toBe(true);
  });

  it("detects heavy background elements and nested children", () => {
    expect(scenePrefersTiledCapture({ compositions: [{ background: { elements: [{ type: "rect", children: [{ style: { filter: "blur(6px)" } }] }] } }] })).toBe(true);
  });

  it("detects generated chart SVG content conservatively", () => {
    expect(scenePrefersTiledCapture({ compositions: [{ objects: [{ type: "chart", chart: { kind: "bar" } }] }] })).toBe(true);
  });

  it("detects style masks, blends, shadows, and embedded SVG filters", () => {
    expect(scenePrefersTiledCapture({ compositions: [{ objects: [{ type: "rect", style: { mixBlendMode: "screen" } }] }] })).toBe(true);
    expect(scenePrefersTiledCapture({ compositions: [{ objects: [{ type: "text", style: { textShadow: "0 0 20px white" } }] }] })).toBe(true);
    expect(scenePrefersTiledCapture({ compositions: [{ objects: [{ type: "html", content: "<svg><filter id='x'><feGaussianBlur /></filter></svg>" }] }] })).toBe(true);
  });

  it("does not force tiled capture for simple rect/text scenes", () => {
    expect(scenePrefersTiledCapture({ compositions: [{ frame: { style: { background: "#000" } }, objects: [{ type: "text", content: "hello", style: { color: "white" } }] }] })).toBe(false);
  });

  it("allows fast canvas export only for simple rect/text scenes", () => {
    expect(analyzeFastCanvasExportCapability({ compositions: [{ objects: [{ type: "rect", bounds: {}, style: { background: "#000" } }, { type: "text", bounds: {}, content: "hello", style: { color: "white" } }] }] }).supported).toBe(true);
    const unsupported = analyzeFastCanvasExportCapability({ compositions: [{ objects: [{ type: "image", bounds: {}, style: {} }] }] });
    expect(unsupported.supported).toBe(false);
    expect(unsupported.reasons[0]).toContain("image objects");
  });

  it("rejects canvas-fast styles the renderer cannot faithfully paint", () => {
    const cases = [
      { style: { background: "linear-gradient(red, blue)" }, reason: "unsupported color/paint" },
      { style: { border: "1px solid white" }, reason: "style 'border'" },
      { style: { backgroundImage: "url(test.png)" }, reason: "style 'backgroundImage'" },
      { style: { textAlign: "center" }, reason: "style 'textAlign'" },
      { style: { letterSpacing: 4 }, reason: "style 'letterSpacing'" },
      { style: { color: "rgb(255, 0, 0)" }, reason: "unsupported color/paint" },
    ];
    for (const item of cases) {
      const result = analyzeFastCanvasExportCapability({ compositions: [{ objects: [{ type: "text", bounds: {}, content: "hello", style: item.style }] }] });
      expect(result.supported).toBe(false);
      expect(result.reasons.join("; ")).toContain(item.reason);
    }
  });

  it("rejects transforms and rich text segment styling for fast canvas export", () => {
    expect(analyzeFastCanvasExportCapability({ compositions: [{ objects: [{ type: "rect", bounds: {}, transform: "rotate(10deg)", style: { background: "#000" } }] }] }).reasons.join("; ")).toContain("transforms");
    expect(analyzeFastCanvasExportCapability({ compositions: [{ objects: [{ type: "text", bounds: {}, richText: [{ text: "hi", bold: true }], style: { color: "#fff" } }] }] }).reasons.join("; ")).toContain("rich text");
  });
});
