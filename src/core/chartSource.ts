export const chartSource = `export type Bounds = { x: number; y: number; width: number; height: number };
export type MotionTrack = any;

export type ChartDatum = {
  label: string;
  value?: number;
  values?: number[];
  x?: number;
  y?: number;
  size?: number;
};

export type ChartBounds = Bounds;

export type ChartType = "line" | "area" | "bar" | "horizontalBar" | "groupedBar" | "stackedBar" | "scatter" | "bubble" | "pie" | "donut" | "radar" | "radialBar" | "gauge" | "heatmap" | "waterfall";

export type ChartStyle = {
  palette?: string[];
  background?: string;
  grid?: string;
  axis?: string;
  text?: string;
  mutedText?: string;
  line?: string;
  fill?: string;
  positive?: string;
  negative?: string;
  fontFamily?: string;
};

export type ChartAnimation = {
  axisDelay?: number;
  tickDelay?: number;
  markDelay?: number;
  stagger?: number;
};

export type ChartSpec = {
  id: string;
  type: ChartType;
  bounds: ChartBounds;
  data: ChartDatum[];
  seriesLabels?: string[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  valueDomain?: [number, number];
  ticks?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  showLabels?: boolean;
  showPoints?: boolean;
  showValues?: boolean;
  innerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  style?: ChartStyle;
  animation?: ChartAnimation;
};

export type ChartGeneratedObject = {
  id: string;
  name?: string;
  kind: "text" | "rect" | "image" | "svg" | "html" | "template";
  bounds: Bounds;
  content?: string;
  template?: {
    kind: "html";
    source: string;
    static?: boolean;
  };
  style: Record<string, string | number>;
  motion?: MotionTrack;
  layoutId?: string;
};

export type ChartObject = {
  id: string;
  name?: string;
  kind: "chart";
  bounds: Bounds;
  chart: ChartSpec;
  style: Record<string, string | number>;
  motion?: MotionTrack;
  layoutId?: string;
};

export type DefinedChart = {
  object: ChartObject;
  objects: ChartObject[];
  generatedObjects: ChartGeneratedObject[];
  backgroundElements: ChartGeneratedObject[];
};

export const chartTypes: ChartType[] = ["line", "area", "bar", "horizontalBar", "groupedBar", "stackedBar", "scatter", "bubble", "pie", "donut", "radar", "radialBar", "gauge", "heatmap", "waterfall"];

export function defineChart(spec: ChartSpec): DefinedChart {
  const cleanSpec = normalizeChartSpec(spec);
  const object = chartObject(cleanSpec);
  return {
    object,
    objects: [object],
    generatedObjects: generateChartObjects(cleanSpec),
    backgroundElements: [],
  };
}

export function normalizeChartSpec(spec: ChartSpec): ChartSpec {
  return {
    ...spec,
    bounds: cleanBounds(spec.bounds),
    data: spec.data.map((datum) => ({ ...datum, values: datum.values ? [...datum.values] : undefined })),
    seriesLabels: spec.seriesLabels ? [...spec.seriesLabels] : undefined,
    xDomain: spec.xDomain ? [...spec.xDomain] as [number, number] : undefined,
    yDomain: spec.yDomain ? [...spec.yDomain] as [number, number] : undefined,
    valueDomain: spec.valueDomain ? [...spec.valueDomain] as [number, number] : undefined,
    style: spec.style ? { ...spec.style, palette: spec.style.palette ? [...spec.style.palette] : undefined } : undefined,
    animation: spec.animation ? { ...spec.animation } : undefined,
  };
}

export function chartObject(spec: ChartSpec): ChartObject {
  const cleanSpec = normalizeChartSpec(spec);
  return {
    id: cleanSpec.id,
    name: \`\${formatChartTypeLabel(cleanSpec.type)} Chart\`,
    kind: "chart",
    bounds: cleanSpec.bounds,
    chart: cleanSpec,
    style: { overflow: "visible" },
  };
}

export function generateChartObjects(spec: ChartSpec): ChartGeneratedObject[] {
  const cleanSpec = normalizeChartSpec(spec);
  if (cleanSpec.data.length === 0) return [];
  const style = chartStyle(cleanSpec.style);
  const objects: ChartGeneratedObject[] = [];
  const showAxes = cleanSpec.showAxes !== false;

  if (isCartesianChart(cleanSpec.type)) {
    const layout = cartesianLayout(cleanSpec);
    if (cleanSpec.showGrid !== false) objects.push(...gridObjects(cleanSpec, layout, style));
    if (showAxes) objects.push(...axisObjects(cleanSpec, layout, style));
    if (cleanSpec.showLabels !== false) objects.push(...tickLabelObjects(cleanSpec, layout, style));
    objects.push(...cartesianMarkObjects(cleanSpec, layout, style));
    return objects;
  }

  objects.push(...polarMarkObjects(cleanSpec, style));
  return objects;
}

export function formatChartTypeLabel(type: ChartType) {
  return type.replace(/([A-Z])/g, " \$1").replace(/^./, (letter) => letter.toUpperCase());
}

function chartStyle(style: ChartStyle | undefined) {
  return {
    palette: style?.palette ?? ["#5ad6ff", "#72f0b3", "#f7c948", "#ff8a65", "#b794f4", "#f565a3"],
    background: style?.background ?? "rgba(9,18,30,0.72)",
    grid: style?.grid ?? "rgba(255,255,255,0.07)",
    axis: style?.axis ?? "rgba(231,244,255,0.86)",
    text: style?.text ?? "rgba(247,251,255,0.9)",
    mutedText: style?.mutedText ?? "rgba(218,233,246,0.62)",
    line: style?.line ?? style?.palette?.[0] ?? "#5ad6ff",
    fill: style?.fill ?? "rgba(90,214,255,0.22)",
    positive: style?.positive ?? "#72f0b3",
    negative: style?.negative ?? "#ff6b7a",
    fontFamily: style?.fontFamily ?? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };
}

function isCartesianChart(type: ChartType) {
  return type === "line" || type === "area" || type === "bar" || type === "horizontalBar" || type === "groupedBar" || type === "stackedBar" || type === "scatter" || type === "bubble" || type === "heatmap" || type === "waterfall";
}

function cartesianLayout(spec: ChartSpec) {
  const compact = spec.bounds.width < 520 || spec.bounds.height < 320;
  const inset = compact
    ? { left: 52, right: spec.showValues ? Math.min(220, spec.bounds.width * 0.28) : 24, top: 72, bottom: 50 }
    : { left: 80, right: spec.showValues ? 320 : 26, top: 48, bottom: 76 };
  const plot = {
    x: spec.bounds.x + inset.left,
    y: spec.bounds.y + inset.top,
    width: spec.bounds.width - inset.left - inset.right,
    height: spec.bounds.height - inset.top - inset.bottom,
  };
  const values = flatValues(spec);
  const yDomain = spec.yDomain ?? spec.valueDomain ?? niceDomain(Math.min(0, ...values), Math.max(1, ...values));
  const xValues = spec.data.map((datum, index) => datum.x ?? index);
  const xDomain = spec.xDomain ?? [Math.min(...xValues), Math.max(...xValues.length > 1 ? xValues : [1])] as [number, number];
  return { plot, xDomain, yDomain, ticks: Math.max(2, spec.ticks ?? 4) };
}

function flatValues(spec: ChartSpec) {
  return spec.data.flatMap((datum) => datum.values ?? [datum.value ?? datum.y ?? 0]);
}

function niceDomain(min: number, max: number): [number, number] {
  const span = Math.max(max - min, 1);
  const padding = span * 0.08;
  return [Math.floor(min - padding), Math.ceil(max + padding)];
}

function gridObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  return range(layout.ticks + 1).map((index) => {
    const y = layout.plot.y + (layout.plot.height / layout.ticks) * index;
    return rect(\`\${spec.id}-grid-y-\${index}\`, "Grid Line", { x: layout.plot.x, y, width: layout.plot.width, height: 2 }, { background: style.grid, borderRadius: 999 }, fade(spec, 0.08 * index));
  });
}

function axisObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const delay = spec.animation?.axisDelay ?? 0.35;
  return [
    rect(\`\${spec.id}-y-axis\`, "Y Axis", { x: layout.plot.x, y: layout.plot.y, width: 4, height: layout.plot.height }, { background: style.axis, borderRadius: 999, transformOrigin: "bottom center" }, { y: [42, 0], opacity: [0, 1], duration: 0.6, delay, ease: "easeOut" }),
    rect(\`\${spec.id}-x-axis\`, "X Axis", { x: layout.plot.x, y: layout.plot.y + layout.plot.height, width: layout.plot.width, height: 4 }, { background: style.axis, borderRadius: 999, transformOrigin: "left center" }, { x: [-42, 0], opacity: [0, 1], duration: 0.65, delay: delay + 0.12, ease: "easeOut" }),
  ];
}

function tickLabelObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const delay = spec.animation?.tickDelay ?? 0.82;
  const yTicks = range(layout.ticks + 1).map((index) => {
    const progress = index / layout.ticks;
    const value = Math.round(lerp(layout.yDomain[1], layout.yDomain[0], progress));
    return text(\`\${spec.id}-y-tick-\${index}\`, "Y Tick", { x: layout.plot.x - 78, y: layout.plot.y + layout.plot.height * progress - 16, width: 58, height: 30 }, formatChartValue(value), { color: style.mutedText, fontFamily: style.fontFamily, fontSize: 20, fontWeight: 650, textAlign: "right" }, { x: [-16, 0], opacity: [0, 1], duration: 0.38, delay: delay + index * 0.06, ease: "easeOut" });
  });
  const xTicks = spec.data.map((datum, index) => text(\`\${spec.id}-x-tick-\${index}\`, "X Tick", { x: xForIndex(index, spec.data.length, layout.plot) - 34, y: layout.plot.y + layout.plot.height + 30, width: 68, height: 30 }, datum.label, { color: style.mutedText, fontFamily: style.fontFamily, fontSize: 20, fontWeight: 650, textAlign: "center" }, { y: [16, 0], opacity: [0, 1], duration: 0.38, delay: delay + index * 0.07, ease: "easeOut" }));
  return [...yTicks, ...xTicks];
}

function cartesianMarkObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  if (spec.type === "bar") return barObjects(spec, layout, style, false);
  if (spec.type === "horizontalBar") return barObjects(spec, layout, style, true);
  if (spec.type === "groupedBar") return groupedBarObjects(spec, layout, style);
  if (spec.type === "stackedBar") return stackedBarObjects(spec, layout, style);
  if (spec.type === "scatter" || spec.type === "bubble") return scatterObjects(spec, layout, style);
  if (spec.type === "heatmap") return heatmapObjects(spec, layout, style);
  if (spec.type === "waterfall") return waterfallObjects(spec, layout, style);
  return lineLikeObjects(spec, layout, style);
}

function lineLikeObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const points = spec.data.map((datum, index) => ({ x: xForIndex(index, spec.data.length, layout.plot), y: yForValue(datum.value ?? datum.y ?? 0, layout.plot, layout.yDomain), value: datum.value ?? datum.y ?? 0 }));
  const path = points.map((point, index) => \`\${index === 0 ? "M" : "L"} \${round(point.x - spec.bounds.x)} \${round(point.y - spec.bounds.y)}\`).join(" ");
  const baseline = layout.plot.y + layout.plot.height - spec.bounds.y;
  const areaPath = \`\${path} L \${round(points.at(-1)?.x ?? layout.plot.x) - spec.bounds.x} \${round(baseline)} L \${round(points[0]?.x ?? layout.plot.x) - spec.bounds.x} \${round(baseline)} Z\`;
  const markDelay = spec.animation?.markDelay ?? 1.35;
  const objects: ChartGeneratedObject[] = [];

  if (spec.type === "area") objects.push(svgObject(\`\${spec.id}-area\`, "Area Fill", spec.bounds, \`<path d="\${areaPath}" fill="\${style.fill}" />\`, fade(spec, markDelay)));
  objects.push(svgObject(\`\${spec.id}-line\`, "Line Path", spec.bounds, \`<path d="\${path}" fill="none" stroke="\${style.line}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="drop-shadow(0 0 16px \${style.line})" />\`, { opacity: [0, 1], duration: 0.45, delay: markDelay, ease: "easeOut" }));
  if (spec.showPoints !== false) objects.push(...points.map((point, index) => rect(\`\${spec.id}-point-\${index}\`, "Point", { x: point.x - 14, y: point.y - 14, width: 28, height: 28 }, { background: "#071018", border: \`7px solid \${style.line}\`, borderRadius: 999, boxShadow: \`0 0 34px \${style.line}\` }, { opacity: [0, 1], duration: 0.2, delay: markDelay + index * (spec.animation?.stagger ?? 0.18), ease: "easeOut" })));
  if (spec.showValues) objects.push(...valueReadoutObjects(spec, points.at(-1)?.value ?? 0, style));
  return objects;
}

function barObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>, horizontal: boolean): ChartGeneratedObject[] {
  const gap = 20;
  const step = horizontal ? layout.plot.height / spec.data.length : layout.plot.width / spec.data.length;
  const markDelay = spec.animation?.markDelay ?? 1.2;
  return spec.data.map((datum, index) => {
    const value = datum.value ?? 0;
    const color = style.palette[index % style.palette.length];
    if (horizontal) {
      const width = scale(value, layout.yDomain, [0, layout.plot.width]);
      return rect(\`\${spec.id}-bar-\${index}\`, "Horizontal Bar", { x: layout.plot.x, y: layout.plot.y + index * step + gap / 2, width, height: Math.max(8, step - gap) }, { background: color, borderRadius: 14, transformOrigin: "left center", boxShadow: \`0 0 24px \${color}55\` }, { x: [-30, 0], opacity: [0, 1], duration: 0.55, delay: markDelay + index * 0.08, ease: "easeOut" });
    }
    const height = scale(value, layout.yDomain, [0, layout.plot.height]);
    return rect(\`\${spec.id}-bar-\${index}\`, "Bar", { x: layout.plot.x + index * step + gap / 2, y: layout.plot.y + layout.plot.height - height, width: Math.max(8, step - gap), height }, { background: color, borderRadius: 14, transformOrigin: "bottom center", boxShadow: \`0 0 24px \${color}55\` }, { y: [34, 0], opacity: [0, 1], duration: 0.55, delay: markDelay + index * 0.08, ease: "easeOut" });
  });
}

function groupedBarObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const seriesCount = Math.max(1, ...spec.data.map((datum) => datum.values?.length ?? 1));
  const groupStep = layout.plot.width / spec.data.length;
  const barWidth = Math.max(6, (groupStep - 24) / seriesCount - 6);
  return spec.data.flatMap((datum, groupIndex) => (datum.values ?? [datum.value ?? 0]).map((value, seriesIndex) => {
    const height = scale(value, layout.yDomain, [0, layout.plot.height]);
    const color = style.palette[seriesIndex % style.palette.length];
    return rect(\`\${spec.id}-group-\${groupIndex}-\${seriesIndex}\`, spec.seriesLabels?.[seriesIndex] ?? "Grouped Bar", { x: layout.plot.x + groupIndex * groupStep + 12 + seriesIndex * (barWidth + 6), y: layout.plot.y + layout.plot.height - height, width: barWidth, height }, { background: color, borderRadius: 10, transformOrigin: "bottom center" }, { y: [28, 0], opacity: [0, 1], duration: 0.5, delay: (spec.animation?.markDelay ?? 1.2) + (groupIndex + seriesIndex) * 0.06, ease: "easeOut" });
  }));
}

function stackedBarObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const groupStep = layout.plot.width / spec.data.length;
  return spec.data.flatMap((datum, groupIndex) => {
    let previousHeight = 0;
    return (datum.values ?? [datum.value ?? 0]).map((value, seriesIndex) => {
      const height = scale(value, layout.yDomain, [0, layout.plot.height]);
      const color = style.palette[seriesIndex % style.palette.length];
      const object = rect(\`\${spec.id}-stack-\${groupIndex}-\${seriesIndex}\`, spec.seriesLabels?.[seriesIndex] ?? "Stacked Bar", { x: layout.plot.x + groupIndex * groupStep + 18, y: layout.plot.y + layout.plot.height - previousHeight - height, width: Math.max(8, groupStep - 36), height }, { background: color, borderRadius: seriesIndex === 0 ? "0 0 12px 12px" : "12px 12px 0 0" }, { opacity: [0, 1], duration: 0.45, delay: (spec.animation?.markDelay ?? 1.2) + (groupIndex + seriesIndex) * 0.06, ease: "easeOut" });
      previousHeight += height;
      return object;
    });
  });
}

function scatterObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const sizeDomain = niceDomain(0, Math.max(1, ...spec.data.map((datum) => datum.size ?? datum.value ?? 8)));
  return spec.data.map((datum, index) => {
    const size = spec.type === "bubble" ? scale(datum.size ?? datum.value ?? 8, sizeDomain, [18, 68]) : 24;
    const color = style.palette[index % style.palette.length];
    return rect(\`\${spec.id}-dot-\${index}\`, "Scatter Point", { x: scale(datum.x ?? index, layout.xDomain, [layout.plot.x, layout.plot.x + layout.plot.width]) - size / 2, y: yForValue(datum.y ?? datum.value ?? 0, layout.plot, layout.yDomain) - size / 2, width: size, height: size }, { background: color, borderRadius: 999, boxShadow: \`0 0 28px \${color}66\`, opacity: 0.9 }, { opacity: [0, 1], duration: 0.35, delay: (spec.animation?.markDelay ?? 1.15) + index * 0.05, ease: "easeOut" });
  });
}

function heatmapObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const columns = Math.ceil(Math.sqrt(spec.data.length));
  const rows = Math.ceil(spec.data.length / columns);
  const cellWidth = layout.plot.width / columns;
  const cellHeight = layout.plot.height / rows;
  const domain = spec.valueDomain ?? niceDomain(0, Math.max(1, ...spec.data.map((datum) => datum.value ?? 0)));
  return spec.data.map((datum, index) => {
    const intensity = clamp01(scale(datum.value ?? 0, domain, [0.16, 1]));
    const column = index % columns;
    const row = Math.floor(index / columns);
    return rect(\`\${spec.id}-cell-\${index}\`, "Heatmap Cell", { x: layout.plot.x + column * cellWidth + 5, y: layout.plot.y + row * cellHeight + 5, width: cellWidth - 10, height: cellHeight - 10 }, { background: withAlpha(style.line, intensity), borderRadius: 12 }, fade(spec, (spec.animation?.markDelay ?? 0.9) + index * 0.025));
  });
}

function waterfallObjects(spec: ChartSpec, layout: ReturnType<typeof cartesianLayout>, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  let total = 0;
  const totals = spec.data.map((datum) => {
    const start = total;
    total += datum.value ?? 0;
    return { start, end: total, value: datum.value ?? 0 };
  });
  const totalValues = totals.flatMap((item) => [item.start, item.end]);
  const domain = spec.yDomain ?? niceDomain(Math.min(0, ...totalValues), Math.max(0, ...totalValues));
  const step = layout.plot.width / spec.data.length;
  return totals.map((item, index) => {
    const y1 = yForValue(item.start, layout.plot, domain);
    const y2 = yForValue(item.end, layout.plot, domain);
    const y = Math.min(y1, y2);
    const height = Math.max(6, Math.abs(y2 - y1));
    const color = item.value >= 0 ? style.positive : style.negative;
    return rect(\`\${spec.id}-waterfall-\${index}\`, "Waterfall Step", { x: layout.plot.x + index * step + 16, y, width: Math.max(8, step - 32), height }, { background: color, borderRadius: 12, boxShadow: \`0 0 22px \${color}55\` }, { opacity: [0, 1], duration: 0.45, delay: (spec.animation?.markDelay ?? 1.1) + index * 0.08, ease: "easeOut" });
  });
}

function polarMarkObjects(spec: ChartSpec, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  if (spec.type === "radar") return radarObjects(spec, style);
  if (spec.type === "radialBar") return radialBarObjects(spec, style);
  if (spec.type === "gauge") return gaugeObjects(spec, style);
  return pieObjects(spec, style, spec.type === "donut");
}

function pieObjects(spec: ChartSpec, style: ReturnType<typeof chartStyle>, donut: boolean): ChartGeneratedObject[] {
  const total = Math.max(1, spec.data.reduce((sum, datum) => sum + Math.max(0, datum.value ?? 0), 0));
  const cx = spec.bounds.width / 2;
  const cy = spec.bounds.height / 2;
  const radius = Math.min(spec.bounds.width, spec.bounds.height) / 2 - 12;
  const innerRadius = donut ? radius * (spec.innerRadius ?? 0.56) : 0;
  let angle = spec.startAngle ?? -90;
  const endAngle = spec.endAngle ?? angle + 360;
  const totalSweep = endAngle - angle;
  return spec.data.map((datum, index) => {
    const sweep = ((Math.max(0, datum.value ?? 0) / total) * totalSweep);
    const path = arcPath(cx, cy, radius, innerRadius, angle, angle + sweep);
    angle += sweep;
    return svgObject(\`\${spec.id}-\${donut ? "donut" : "pie"}-\${index}\`, datum.label, spec.bounds, \`<path d="\${path}" fill="\${style.palette[index % style.palette.length]}" />\`, fade(spec, (spec.animation?.markDelay ?? 0.7) + index * 0.08));
  });
}

function radarObjects(spec: ChartSpec, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const values = spec.data.map((datum) => datum.value ?? 0);
  const domain = spec.valueDomain ?? niceDomain(0, Math.max(1, ...values));
  const cx = spec.bounds.width / 2;
  const cy = spec.bounds.height / 2;
  const radius = Math.min(spec.bounds.width, spec.bounds.height) / 2 - 48;
  const points = values.map((value, index) => polarPoint(cx, cy, scale(value, domain, [0, radius]), -90 + index * 360 / values.length));
  const polygon = points.map((point) => \`\${round(point.x)},\${round(point.y)}\`).join(" ");
  const axes = spec.data.map((_, index) => {
    const end = polarPoint(cx, cy, radius, -90 + index * 360 / values.length);
    return \`<line x1="\${cx}" y1="\${cy}" x2="\${round(end.x)}" y2="\${round(end.y)}" stroke="\${style.grid}" stroke-width="2" />\`;
  }).join("");
  return [svgObject(\`\${spec.id}-radar\`, "Radar", spec.bounds, \`\${axes}<polygon points="\${polygon}" fill="\${style.fill}" stroke="\${style.line}" stroke-width="6" />\`, fade(spec, spec.animation?.markDelay ?? 0.9))];
}

function radialBarObjects(spec: ChartSpec, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const domain = spec.valueDomain ?? niceDomain(0, Math.max(1, ...spec.data.map((datum) => datum.value ?? 0)));
  const cx = spec.bounds.width / 2;
  const cy = spec.bounds.height / 2;
  const maxRadius = Math.min(spec.bounds.width, spec.bounds.height) / 2 - 18;
  return spec.data.map((datum, index) => {
    const radius = maxRadius - index * 28;
    const end = -90 + scale(datum.value ?? 0, domain, [0, 320]);
    const color = style.palette[index % style.palette.length];
    return svgObject(\`\${spec.id}-radial-\${index}\`, datum.label, spec.bounds, \`<path d="\${arcStrokePath(cx, cy, radius, -90, end)}" fill="none" stroke="\${color}" stroke-width="18" stroke-linecap="round" />\`, fade(spec, (spec.animation?.markDelay ?? 0.7) + index * 0.08));
  });
}

function gaugeObjects(spec: ChartSpec, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  const value = spec.data[0]?.value ?? 0;
  const domain = spec.valueDomain ?? [0, 100] as [number, number];
  const cx = spec.bounds.width / 2;
  const cy = spec.bounds.height * 0.72;
  const radius = Math.min(spec.bounds.width, spec.bounds.height) * 0.38;
  const startAngle = spec.startAngle ?? -150;
  const endAngle = spec.endAngle ?? -30;
  const angle = scale(value, domain, [startAngle, endAngle]);
  const needle = polarPoint(cx, cy, radius * 0.84, angle);
  return [
    svgObject(\`\${spec.id}-gauge-track\`, "Gauge Track", spec.bounds, \`<path d="\${arcStrokePath(cx, cy, radius, startAngle, endAngle)}" fill="none" stroke="\${style.grid}" stroke-width="28" stroke-linecap="round" /><path d="\${arcStrokePath(cx, cy, radius, startAngle, angle)}" fill="none" stroke="\${style.line}" stroke-width="28" stroke-linecap="round" /><line x1="\${cx}" y1="\${cy}" x2="\${round(needle.x)}" y2="\${round(needle.y)}" stroke="\${style.text}" stroke-width="8" stroke-linecap="round" />\`, fade(spec, spec.animation?.markDelay ?? 0.7)),
    text(\`\${spec.id}-gauge-value\`, "Gauge Value", { x: spec.bounds.x + spec.bounds.width / 2 - 90, y: spec.bounds.y + spec.bounds.height * 0.68, width: 180, height: 58 }, formatChartValue(value), { color: style.text, fontFamily: style.fontFamily, fontSize: 44, fontWeight: 820, textAlign: "center" }, fade(spec, 1)),
  ];
}

function valueReadoutObjects(spec: ChartSpec, value: number, style: ReturnType<typeof chartStyle>): ChartGeneratedObject[] {
  return [
    rect(\`\${spec.id}-value-card\`, "Value Card", { x: spec.bounds.x + spec.bounds.width - 262, y: spec.bounds.y + 84, width: 238, height: 250 }, { background: style.background, border: "1px solid rgba(176,225,255,0.24)", borderRadius: 30, boxShadow: "0 28px 90px rgba(0,0,0,0.36)" }, { x: [44, 0], opacity: [0, 1], duration: 0.65, delay: 1.1, ease: "easeOut" }),
    text(\`\${spec.id}-value-primary\`, "Primary Ticking Value", { x: spec.bounds.x + spec.bounds.width - 226, y: spec.bounds.y + 146, width: 168, height: 74 }, formatChartValue(value), { color: style.text, fontFamily: style.fontFamily, fontSize: 56, fontWeight: 820, letterSpacing: -2.4, lineHeight: 1 }, undefined),
  ];
}

function xForIndex(index: number, count: number, plot: ChartBounds) {
  if (count <= 1) return plot.x + plot.width / 2;
  return plot.x + (plot.width / (count - 1)) * index;
}

function yForValue(value: number, plot: ChartBounds, domain: [number, number]) {
  return scale(value, domain, [plot.y + plot.height, plot.y]);
}

function rect(id: string, name: string, bounds: ChartBounds, style: ChartGeneratedObject["style"], motion?: MotionTrack): ChartGeneratedObject {
  return { id, name, kind: "rect", bounds: cleanBounds(bounds), style, motion };
}

function text(id: string, name: string, bounds: ChartBounds, content: string, style: ChartGeneratedObject["style"], motion?: MotionTrack): ChartGeneratedObject {
  return { id, name, kind: "text", bounds: cleanBounds(bounds), content, style, motion };
}

function svgObject(id: string, name: string, bounds: ChartBounds, content: string, motion?: MotionTrack): ChartGeneratedObject {
  return { id, name, kind: "svg", bounds: cleanBounds(bounds), content: \`<svg viewBox="0 0 \${round(bounds.width)} \${round(bounds.height)}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">\${content}</svg>\`, style: { overflow: "visible" }, motion };
}

function fade(_spec: ChartSpec, delay: number): MotionTrack {
  return { opacity: [0, 1], duration: 0.45, delay, ease: "easeOut" };
}

function cleanBounds(bounds: ChartBounds): ChartBounds {
  return { x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height) };
}

function range(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

function scale(value: number, domain: [number, number], range: [number, number]) {
  const span = domain[1] - domain[0];
  if (span === 0) return range[0];
  return lerp(range[0], range[1], (value - domain[0]) / span);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatChartValue(value: number) {
  if (Math.abs(value) >= 1000) return \`\${Math.round(value / 100) / 10}k\`;
  return String(Math.round(value));
}

function withAlpha(hex: string, alpha: number) {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) return hex;
  const full = hex.length === 4 ? \`#\${hex[1]}\${hex[1]}\${hex[2]}\${hex[2]}\${hex[3]}\${hex[3]}\` : hex;
  const r = Number.parseInt(full.slice(1, 3), 16);
  const g = Number.parseInt(full.slice(3, 5), 16);
  const b = Number.parseInt(full.slice(5, 7), 16);
  return \`rgba(\${r},\${g},\${b},\${alpha.toFixed(3)})\`;
}

function polarPoint(cx: number, cy: number, radius: number, angleDegrees: number) {
  const angle = angleDegrees * Math.PI / 180;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function arcPath(cx: number, cy: number, radius: number, innerRadius: number, startAngle: number, endAngle: number) {
  const startOuter = polarPoint(cx, cy, radius, startAngle);
  const endOuter = polarPoint(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  if (innerRadius <= 0) return \`M \${cx} \${cy} L \${round(startOuter.x)} \${round(startOuter.y)} A \${radius} \${radius} 0 \${largeArc} 1 \${round(endOuter.x)} \${round(endOuter.y)} Z\`;
  const startInner = polarPoint(cx, cy, innerRadius, startAngle);
  const endInner = polarPoint(cx, cy, innerRadius, endAngle);
  return \`M \${round(startOuter.x)} \${round(startOuter.y)} A \${radius} \${radius} 0 \${largeArc} 1 \${round(endOuter.x)} \${round(endOuter.y)} L \${round(endInner.x)} \${round(endInner.y)} A \${innerRadius} \${innerRadius} 0 \${largeArc} 0 \${round(startInner.x)} \${round(startInner.y)} Z\`;
}

function arcStrokePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return \`M \${round(start.x)} \${round(start.y)} A \${radius} \${radius} 0 \${largeArc} 1 \${round(end.x)} \${round(end.y)}\`;
}
`;
