/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineChart, type ChartType } from "../../clipper/projects/part-api";
import { partFromSource } from "./partSource";
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

    const part = await partFromSource(basePart, `
      import { defineChart, definePart } from "@clipper/part-api";

      const chart = defineChart({
        id: "eval-chart",
        type: "bar",
        bounds: { x: 100, y: 100, width: 800, height: 480 },
        data: [{ label: "A", value: 10 }, { label: "B", value: 30 }],
      });

      export const part = definePart({
        id: "prt_chart_eval",
        duration: 4,
        frame: { width: 1920, height: 1080, style: { background: "#000" } },
        objects: chart.objects,
      });
    `);

    expect(part.objects.some((object) => object.id === "eval-chart" && object.type === "chart")).toBe(true);
    expect(part.objects.find((object) => object.id === "eval-chart")?.chart?.type).toBe("bar");
  });

  it("hydrates the chart showcase source into first-class chart objects", async () => {
    const source = await readFile(resolve("clipper/projects/prj_v01_sample/scn_opening/prt_chart_showcase.ts"), "utf8");
    const basePart: Part = {
      id: "prt_chart_showcase",
      name: "Chart Template Showcase",
      filePath: "clipper/projects/prj_v01_sample/scn_opening/prt_chart_showcase.ts",
      duration: 12,
      frame: { width: 1920, height: 1080, style: { background: "#06111c" } },
      background: { id: "background", name: "Background", style: { background: "#06111c" }, elements: [] },
      objects: [],
      snapshot: [],
      zoomMarkers: [],
      translationMarkers: [],
    };

    const part = await partFromSource(basePart, source);

    expect(part.objects.filter((object) => object.type === "chart")).toHaveLength(12);
    expect(part.objects.some((object) => object.id === "tpl-line" && object.chart?.type === "line")).toBe(true);
    expect(part.objects.some((object) => object.id === "tpl-donut" && object.chart?.type === "donut")).toBe(true);
    expect(part.objects.some((object) => object.id === "tpl-gauge" && object.chart?.type === "gauge")).toBe(true);
  });
});
