import { describe, expect, it } from "vitest";
import { scenePrefersTiledCapture } from "../../electron/exportSceneHeuristics";

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
});
