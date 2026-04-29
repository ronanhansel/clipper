/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { defineChart, type ChartType } from "../../clipper/projects/composition-api";
import { compositionFromSource, compositionToSource } from "./compositionSource";
import type { Part } from "./types";

const chartTypes: ChartType[] = ["line", "area", "bar", "horizontalBar", "groupedBar", "stackedBar", "scatter", "bubble", "pie", "donut", "radar", "radialBar", "gauge", "heatmap", "waterfall"];

describe("defineChart", () => {
  it("generates objects for every built-in chart type", () => {
    for (const type of chartTypes) {
      const chart = defineChart({
        id: `chart-${type}`,
        type,
        bounds: { x: 100, y: 100, width: 800, height: 480 },
        data: [
          { label: "A", value: 18, values: [18, 12], x: 0, y: 18, size: 8 },
          { label: "B", value: 42, values: [24, 18], x: 1, y: 42, size: 18 },
          { label: "C", value: 28, values: [16, 28], x: 2, y: 28, size: 14 },
        ],
        yDomain: [0, 80],
        valueDomain: [0, 80],
      });

      expect(chart.object.kind, type).toBe("chart");
      expect(chart.objects).toEqual([chart.object]);
      expect(chart.generatedObjects.length, type).toBeGreaterThan(0);
      expect(chart.generatedObjects.every((object) => object.id.startsWith(`chart-${type}`))).toBe(true);
    }
  });

  it("is available inside evaluated composition sources", async () => {
    const basePart: Part = {
      id: "prt_chart_eval",
      name: "Chart Eval",
      filePath: "clipper/projects/test/prt_chart_eval.ts",
      duration: 4,
      frame: { width: 1920, height: 1080, style: { background: "#000" } },
      background: { id: "background", name: "Background", style: { background: "#000" }, elements: [] },
      objects: [],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    };

    const part = await compositionFromSource(basePart, `
      import { Chart, Composition, defineChart } from "@clipper/composition-api";

      const chart = defineChart({
        id: "eval-chart",
        type: "bar",
        bounds: { x: 100, y: 100, width: 800, height: 480 },
        data: [{ label: "A", value: 10 }, { label: "B", value: 30 }],
      });

      export const composition = new Composition({
        id: "prt_chart_eval",
        duration: 4,
        frame: { width: 1920, height: 1080, style: { background: "#000" } },
        render() {
          return [new Chart({ id: chart.object.id, bounds: chart.object.bounds, chart: chart.object.chart, style: chart.object.style })];
        },
      });
    `);

    expect(part.objects.some((object) => object.id === "eval-chart" && object.type === "chart")).toBe(true);
    expect(part.objects.find((object) => object.id === "eval-chart")?.chart?.type).toBe("bar");
  });

  it("hydrates class-based component compositions into first-class objects", async () => {
    const basePart: Part = {
      id: "prt_component_eval",
      name: "Component Eval",
      filePath: "clipper/projects/test/prt_component_eval.ts",
      duration: 4,
      frame: { width: 1920, height: 1080, style: { background: "#000" } },
      background: { id: "background", name: "Background", style: { background: "#000" }, elements: [] },
      objects: [],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    };

    const part = await compositionFromSource(basePart, `
      import { Component, Composition, Group, Rect, Text } from "@clipper/composition-api";

      class HeroTitle extends Component {
        render(ctx) {
          return [
            new Text({
              id: "hero-title",
              bounds: { x: 100, y: 120, width: 800, height: 160 },
              text: "Component Title",
              transform: { x: 12, y: 20, rotate: 3, scale: 1.2 },
              style: { color: "#fff", fontSize: 72 },
            }),
          ];
        }
      }

      export const composition = new Composition({
        id: "prt_component_eval",
        duration: 4,
        frame: { width: 1920, height: 1080, style: { background: "#000" } },
        render() {
          return [
            new Group({ transform: { scale: 0.9 }, children: [
              new Rect({ id: "panel", bounds: { x: 80, y: 90, width: 880, height: 240 }, style: { background: "#111" } }),
              new HeroTitle(),
            ] }),
          ];
        },
      });
    `);

    expect(part.objects.map((object) => object.id)).toEqual(["panel", "hero-title"]);
    expect(part.objects.find((object) => object.id === "hero-title")?.type).toBe("text");
    expect(part.objects.find((object) => object.id === "hero-title")?.style.transform).toBe("scale(0.9) translate3d(12px, 20px, 0px) rotate(3deg) scale(1.2)");
  });

  it("rejects non-current part exports", async () => {
    const basePart: Part = {
      id: "prt_invalid_export_eval",
      name: "Invalid Export Eval",
      filePath: "clipper/projects/test/prt_invalid_export_eval.ts",
      duration: 4,
      frame: { width: 1920, height: 1080, style: { background: "#000" } },
      background: { id: "background", name: "Background", style: { background: "#000" }, elements: [] },
      objects: [],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    };

    await expect(compositionFromSource(basePart, `
      import { Composition } from "@clipper/composition-api";

      export const part = new Composition({
        id: "prt_invalid_export_eval",
        duration: 4,
        frame: { width: 1920, height: 1080, style: { background: "#000" } },
        render() { return []; },
      });
    `)).rejects.toThrow("Composition source must export a composition object");
  });

  it("rejects plain object renderables", async () => {
    const basePart: Part = {
      id: "prt_plain_object_eval",
      name: "Plain Object Eval",
      filePath: "clipper/projects/test/prt_plain_object_eval.ts",
      duration: 4,
      frame: { width: 1920, height: 1080, style: { background: "#000" } },
      background: { id: "background", name: "Background", style: { background: "#000" }, elements: [] },
      objects: [],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    };

    await expect(compositionFromSource(basePart, `
      import { Composition } from "@clipper/composition-api";

      export const composition = new Composition({
        id: "prt_plain_object_eval",
        duration: 4,
        frame: { width: 1920, height: 1080, style: { background: "#000" } },
        render() {
          return [{ id: "plain-object", kind: "rect", bounds: { x: 0, y: 0, width: 100, height: 100 }, style: {} }];
        },
      });
    `)).rejects.toThrow("Plain object renderables are no longer supported");
  });

  it("generates component-authored source", () => {
    const source = compositionToSource({
      id: "prt_generated_eval",
      name: "Generated Eval",
      filePath: "clipper/projects/test/prt_generated_eval.ts",
      duration: 4,
      frame: { width: 1920, height: 1080, style: { background: "#000" } },
      background: { id: "background", name: "Background", style: { background: "#000" }, elements: [] },
      objects: [
        { id: "generated-panel", name: "Generated Panel", type: "rect", selector: "[data-object-id='generated-panel']", bounds: { x: 0, y: 0, width: 100, height: 100 }, style: { background: "#111" } },
      ],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    });

    expect(source).toContain("class GeneratedCompositionObjects extends Component");
    expect(source).toContain("return [new GeneratedCompositionObjects()]");
    expect(source).not.toContain("defineComposition");
    expect(source).not.toContain('"id":');
  });
});
