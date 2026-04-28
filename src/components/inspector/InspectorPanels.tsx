import DataEditor, { GridCellKind, type EditableGridCell, type GridCell, type GridColumn, type Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Crosshair, Database, Italic, Strikethrough, Trash2, Underline } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { chartTypes, formatChartTypeLabel, type ChartDatum, type ChartSpec, type ChartStyle, type ChartType } from "../../core/chart";
import { MAX_PART_DURATION_SECONDS, FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type FrameObject, type MotionEase, type Part, type PartFrame, type Point, type TranslationMarker, type ZoomMarker } from "../../core/types";
import { clamp, roundTenth, roundTwo } from "../../core/math";
import { minimumZoomDuration, mutedCaps, panelCard } from "../../app/config";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { ColorSelector, formatStyleLabel, getEditableColorStyleEntries, isHexColor } from "../ColorSelector";
import { clipperHost } from "../../app/clipperHost";

const defaultFontFamily = "Inter, ui-sans-serif, system-ui, sans-serif";
const defaultFontOption = { value: defaultFontFamily, label: "Inter / System" };

type FontOption = { value: string; label: string };

let cachedSystemFontOptions: FontOption[] | null = null;
let systemFontOptionsRequest: Promise<FontOption[]> | null = null;

function loadSystemFontOptions() {
  if (cachedSystemFontOptions) return Promise.resolve(cachedSystemFontOptions);
  systemFontOptionsRequest ??= clipperHost.listSystemFonts()
    .then((fonts) => fonts.map((font) => ({ value: font, label: font })))
    .catch((error) => {
      console.warn("Unable to load system fonts.", error);
      return [];
    });
  return systemFontOptionsRequest.then((options) => {
    cachedSystemFontOptions = options;
    return options;
  });
}

function formatFontValueLabel(value: string) {
  if (value === defaultFontFamily) return defaultFontOption.label;
  return value.split(",")[0]?.trim().replace(/^['"]|['"]$/g, "") || value;
}

export function FrameInspector({ part, onDurationChange, onFrameChange, onBackgroundChange }: { part: Part; onDurationChange: (duration: number) => void; onFrameChange: (updater: (frame: PartFrame) => PartFrame) => void; onBackgroundChange: (updater: (background: BackgroundLayer) => BackgroundLayer) => void }) {
  const markerEnd = Math.max(0, ...part.zoomMarkers.map((marker) => marker.start + marker.duration), ...part.translationMarkers.map((marker) => marker.start + marker.duration));
  const minimumDuration = roundTenth(Math.max(0.1, markerEnd));

  function updateDuration(value: string) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    onDurationChange(roundTenth(clamp(numeric, minimumDuration, MAX_PART_DURATION_SECONDS)));
  }

  function updateFrameBackground(value: string) {
    onFrameChange((frame) => ({ ...frame, style: { ...frame.style, background: value } }));
  }

  function updateBackgroundColor(value: string) {
    onBackgroundChange((background) => ({ ...background, style: { ...background.style, background: value } }));
  }

  function updateBackgroundStretch(checked: boolean) {
    onBackgroundChange((background) => ({ ...background, stretchToElements: checked || undefined }));
  }

  function updateBackgroundStyle(value: string) {
    try {
      const style = value.trim() ? JSON.parse(value) as BackgroundLayer["style"] : {};
      onBackgroundChange((background) => ({ ...background, style }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  function updateBackgroundMotion(value: string) {
    try {
      const motion = value.trim() ? JSON.parse(value) as BackgroundLayer["motion"] : undefined;
      onBackgroundChange((background) => ({ ...background, motion }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumDuration} max={MAX_PART_DURATION_SECONDS} step={0.1} value={part.duration} onChange={(event) => updateDuration(event.target.value)} /></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Frame BG Color<ColorSelector value={String(part.frame.style.background ?? "#000000")} onChange={updateFrameBackground} /></label>
      {isHexColor(String(part.background.style.background ?? "")) ? <label className={`grid gap-1.5 ${mutedCaps}`}>Layer BG Color<ColorSelector value={String(part.background.style.background)} onChange={updateBackgroundColor} /></label> : null}
      <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]">
        <Checkbox checked={Boolean(part.background.stretchToElements)} onCheckedChange={(checked) => updateBackgroundStretch(checked === true)} />
        <span>Stretch BG</span>
      </label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background Style JSON<Textarea className="min-h-[120px] resize-y font-mono normal-case tracking-normal" value={JSON.stringify(part.background.style, null, 2)} onChange={(event) => updateBackgroundStyle(event.target.value)} /></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background Motion JSON<Textarea className="min-h-[92px] resize-y font-mono normal-case tracking-normal" value={part.background.motion ? JSON.stringify(part.background.motion, null, 2) : ""} onChange={(event) => updateBackgroundMotion(event.target.value)} /></label>
      <div className={panelCard}><span>Constant Elements</span><strong className="text-[13px]">{part.background.elements.length}</strong><small className="text-[#9b9da7]">Edit these in the composition code as background.elements.</small></div>
    </div>
  );
}

export function ChartInspector({ object, onChange }: { object: FrameObject; onChange: (updater: (object: FrameObject) => FrameObject) => void }) {
  const [dataEditorOpen, setDataEditorOpen] = useState(false);
  const chart = object.chart;
  if (!chart) return <EmptyInspector />;
  const style = chart.style ?? {};
  const paletteDraft = (style.palette ?? []).join(", ");
  const relevant = getRelevantChartSettings(chart.type);

  function updateChart(updater: (chart: ChartSpec) => ChartSpec) {
    onChange((current) => {
      if (current.type !== "chart" || !current.chart) return current;
      const nextChart = updater({ ...current.chart, bounds: current.bounds });
      return { ...current, name: `${formatChartTypeLabel(nextChart.type)} Chart`, bounds: nextChart.bounds, chart: nextChart };
    });
  }

  function updateBounds(key: keyof Bounds, value: string) {
    const numeric = Number(value) || 0;
    updateChart((current) => ({ ...current, bounds: { ...current.bounds, [key]: numeric } }));
  }

  function updateType(value: string) {
    updateChart((current) => ({ ...current, type: value as ChartType }));
  }

  function updateOptionalNumber(key: "ticks" | "innerRadius" | "startAngle" | "endAngle", value: string) {
    updateChart((current) => ({ ...current, [key]: value.trim() ? Number(value) || 0 : undefined }));
  }

  function updateBoolean(key: "showGrid" | "showAxes" | "showLabels" | "showPoints" | "showValues", checked: boolean) {
    updateChart((current) => ({ ...current, [key]: key === "showValues" ? checked || undefined : checked ? undefined : false }));
  }

  function updateStyleColor(key: keyof ChartStyle, value: string) {
    updateChart((current) => ({ ...current, style: { ...current.style, [key]: value } }));
  }

  function updateStyleText(key: keyof ChartStyle, value: string) {
    updateChart((current) => ({ ...current, style: { ...current.style, [key]: value.trim() || undefined } }));
  }

  function updatePalette(value: string) {
    const palette = value.split(",").map((item) => item.trim()).filter(Boolean);
    updateChart((current) => ({ ...current, style: { ...current.style, palette: palette.length > 0 ? palette : undefined } }));
  }

  function updateSeriesLabels(value: string) {
    const seriesLabels = value.split(",").map((item) => item.trim()).filter(Boolean);
    updateChart((current) => ({ ...current, seriesLabels: seriesLabels.length > 0 ? seriesLabels : undefined }));
  }

  function updateDomain(key: "xDomain" | "yDomain" | "valueDomain", value: string) {
    try {
      const domain = value.trim() ? JSON.parse(value) as [number, number] : undefined;
      if (domain && (!Array.isArray(domain) || domain.length !== 2 || domain.some((item) => typeof item !== "number"))) return;
      updateChart((current) => ({ ...current, [key]: domain }));
    } catch {
      // Keep domain fields editable while JSON is incomplete.
    }
  }

  function updateAnimation(value: string) {
    try {
      const animation = value.trim() ? JSON.parse(value) as ChartSpec["animation"] : undefined;
      updateChart((current) => ({ ...current, animation }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  function updateData(data: ChartDatum[]) {
    updateChart((current) => ({ ...current, data }));
  }

  return (
    <div className="grid gap-3">
      <div className={panelCard}>
        <span>Chart Object</span>
        <strong className="text-[13px]">{formatChartTypeLabel(chart.type)}</strong>
        <small className="text-[#9b9da7]">Selects and moves as one chart; axes and marks are render-only internals.</small>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Type<Select value={chart.type} onValueChange={updateType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{chartTypes.map((type) => <SelectItem key={type} value={type}>{formatChartTypeLabel(type)}</SelectItem>)}</SelectGroup></SelectContent></Select></label>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{key}<Input type="number" value={chart.bounds[key]} onChange={(event) => updateBounds(key, event.target.value)} /></label>)}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.2)]" onClick={() => setDataEditorOpen(true)}><Database size={16} />Edit Data</button>
      {relevant.numberControls.length > 0 ? <div className="grid grid-cols-2 gap-2">
        {relevant.numberControls.includes("ticks") ? <label className={`grid gap-1.5 ${mutedCaps}`}>Ticks<Input type="number" min={2} value={chart.ticks ?? ""} onChange={(event) => updateOptionalNumber("ticks", event.target.value)} /></label> : null}
        {relevant.numberControls.includes("innerRadius") ? <label className={`grid gap-1.5 ${mutedCaps}`}>Inner Radius<Input type="number" min={0} max={1} step={0.01} value={chart.innerRadius ?? ""} onChange={(event) => updateOptionalNumber("innerRadius", event.target.value)} /></label> : null}
        {relevant.numberControls.includes("startAngle") ? <label className={`grid gap-1.5 ${mutedCaps}`}>Start Angle<Input type="number" step={1} value={chart.startAngle ?? ""} onChange={(event) => updateOptionalNumber("startAngle", event.target.value)} /></label> : null}
        {relevant.numberControls.includes("endAngle") ? <label className={`grid gap-1.5 ${mutedCaps}`}>End Angle<Input type="number" step={1} value={chart.endAngle ?? ""} onChange={(event) => updateOptionalNumber("endAngle", event.target.value)} /></label> : null}
      </div> : null}
      {relevant.toggles.length > 0 ? <div className="grid grid-cols-2 gap-2">
        {relevant.toggles.map((key) => <label className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-xs font-bold text-[#dfe2ea]" key={key}><Checkbox checked={key === "showValues" ? Boolean(chart.showValues) : chart[key] !== false} onCheckedChange={(checked) => updateBoolean(key, checked === true)} /><span>{formatStyleLabel(key)}</span></label>)}
      </div> : null}
      {relevant.showSeriesLabels ? <label className={`grid gap-1.5 ${mutedCaps}`}>Series Labels<Input value={(chart.seriesLabels ?? []).join(", ")} onChange={(event) => updateSeriesLabels(event.target.value)} placeholder="Series A, Series B" /></label> : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>Palette<Input value={paletteDraft} onChange={(event) => updatePalette(event.target.value)} placeholder="#5ad6ff, #72f0b3" /></label>
      {relevant.styleKeys.length > 0 ? <div className="grid gap-2"><span className={mutedCaps}>Chart Colours</span>{relevant.styleKeys.map((key) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{formatStyleLabel(key)}<ColorSelector value={String(style[key] ?? defaultChartStyleValue(key))} onChange={(value) => updateStyleColor(key, value)} /></label>)}</div> : null}
      <FontSelector value={String(style.fontFamily ?? defaultFontFamily)} onChange={(value) => updateStyleText("fontFamily", value)} />
      {relevant.domains.length > 0 ? <div className={`grid gap-2 ${relevant.domains.length === 1 ? "grid-cols-1" : relevant.domains.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {relevant.domains.includes("xDomain") ? <label className={`grid gap-1.5 ${mutedCaps}`}>X Domain<Input value={chart.xDomain ? JSON.stringify(chart.xDomain) : ""} placeholder="[0, 10]" onChange={(event) => updateDomain("xDomain", event.target.value)} /></label> : null}
        {relevant.domains.includes("yDomain") ? <label className={`grid gap-1.5 ${mutedCaps}`}>Y Domain<Input value={chart.yDomain ? JSON.stringify(chart.yDomain) : ""} placeholder="[0, 100]" onChange={(event) => updateDomain("yDomain", event.target.value)} /></label> : null}
        {relevant.domains.includes("valueDomain") ? <label className={`grid gap-1.5 ${mutedCaps}`}>Value<Input value={chart.valueDomain ? JSON.stringify(chart.valueDomain) : ""} placeholder="[0, 100]" onChange={(event) => updateDomain("valueDomain", event.target.value)} /></label> : null}
      </div> : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>Animation JSON<Textarea className="min-h-[92px] resize-y font-mono normal-case tracking-normal" value={chart.animation ? JSON.stringify(chart.animation, null, 2) : ""} onChange={(event) => updateAnimation(event.target.value)} /></label>
      <ChartDataDialog chart={chart} open={dataEditorOpen} onOpenChange={setDataEditorOpen} onDataChange={updateData} />
    </div>
  );
}

function ChartDataDialog({ chart, open, onOpenChange, onDataChange }: { chart: ChartSpec; open: boolean; onOpenChange: (open: boolean) => void; onDataChange: (data: ChartDatum[]) => void }) {
  const spreadsheetRows = Math.max(200, chart.data.length + 100);
  const seriesCount = Math.max(0, ...chart.data.map((datum) => datum.values?.length ?? 0));
  const editableColumns = useMemo(() => getEditableChartDataColumns(chart), [chart.type]);
  const columns = useMemo<GridColumn[]>(() => [
    dataGridColumn("Label", 150, editableColumns.has(0)),
    dataGridColumn("Value", 110, editableColumns.has(1)),
    dataGridColumn("X", 88, editableColumns.has(2)),
    dataGridColumn("Y", 88, editableColumns.has(3)),
    dataGridColumn("Size", 88, editableColumns.has(4)),
    ...Array.from({ length: Math.max(seriesCount, 2) }, (_, index) => dataGridColumn(chart.seriesLabels?.[index] ?? `Series ${index + 1}`, 110, editableColumns.has(5 + index))),
  ], [chart.seriesLabels, editableColumns, seriesCount]);

  function getCellContent([column, row]: Item): GridCell {
    const datum = chart.data[row];
    const editable = editableColumns.has(column);
    if (!datum) return textCell("", editable);
    if (column === 0) return textCell(datum.label, editable);
    if (column === 1) return textCell(formatOptionalNumber(datum.value), editable);
    if (column === 2) return textCell(formatOptionalNumber(datum.x), editable);
    if (column === 3) return textCell(formatOptionalNumber(datum.y), editable);
    if (column === 4) return textCell(formatOptionalNumber(datum.size), editable);
    return textCell(formatOptionalNumber(datum.values?.[column - 5]), editable);
  }

  function editCell([column, row]: Item, nextCell: EditableGridCell) {
    if (!editableColumns.has(column)) return;
    const text = "data" in nextCell ? String(nextCell.data ?? "") : "";
    const nextData = Array.from({ length: Math.max(chart.data.length, row + 1) }, (_, index) => chart.data[index] ?? emptyChartDatum()).map((datum, index) => (index === row ? updateDatumCell(datum, column, text) : datum));
    onDataChange(normalizeChartData(nextData));
  }

  function updateOpen(nextOpen: boolean) {
    if (!nextOpen) onDataChange(normalizeChartData(chart.data));
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={updateOpen}>
      <DialogContent className="grid-rows-[auto_1fr] gap-0 h-[min(720px,calc(100vh-48px))] w-[min(1120px,calc(100vw-48px))] p-0" data-inspector-panel>
        <DialogHeader className="border-b border-[#2d313b] px-5 py-4">
          <DialogTitle>Edit Chart Data</DialogTitle>
          <DialogDescription>Spreadsheet cells map to label, value, x/y/size, and multi-series values for grouped or stacked charts.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-rows-[1fr_auto] gap-3 px-5 py-5">
          <div className="min-h-0 overflow-hidden rounded-xl border border-[#2d313b] bg-[#0f1117]">
            <DataEditor
              columns={columns}
              rows={spreadsheetRows}
              getCellContent={getCellContent}
              onCellEdited={editCell}
              rowMarkers="number"
              smoothScrollX
              smoothScrollY
              width="100%"
              height="100%"
              theme={{
                accentColor: "#37d6c2",
                accentFg: "#031311",
                accentLight: "rgba(55,214,194,0.14)",
                bgCell: "#12141a",
                bgCellMedium: "#171920",
                bgHeader: "#1d212b",
                bgHeaderHovered: "#252a36",
                bgHeaderHasFocus: "#12312d",
                borderColor: "#2d313b",
                textDark: "#f7f7f8",
                textMedium: "#dfe2ea",
                textLight: "#9b9da7",
                textHeader: "#dfe2ea",
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#737884]">{chart.data.length} data rows</span>
            <span className="text-xs font-semibold text-[#737884]">Empty rows are ignored automatically.</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function dataGridColumn(title: string, width: number, editable: boolean): GridColumn {
  return {
    title,
    width,
    themeOverride: editable ? undefined : disabledDataGridTheme,
  };
}

function textCell(data: string, editable: boolean): GridCell {
  return {
    kind: GridCellKind.Text,
    allowOverlay: editable,
    data,
    displayData: data,
    readonly: !editable,
    style: editable ? "normal" : "faded",
    themeOverride: editable ? undefined : disabledDataGridTheme,
  };
}

const disabledDataGridTheme = {
  bgCell: "#0b0d12",
  bgCellMedium: "#10131a",
  bgHeader: "#141821",
  textDark: "#5f6674",
  textMedium: "#697181",
  textHeader: "#737884",
};

function getEditableChartDataColumns(chart: ChartSpec) {
  const columns = new Set<number>([0]);
  if (chart.type === "groupedBar" || chart.type === "stackedBar") {
    const seriesCount = Math.max(2, ...chart.data.map((datum) => datum.values?.length ?? 0));
    for (let index = 0; index < seriesCount; index += 1) columns.add(5 + index);
    return columns;
  }
  if (chart.type === "scatter") {
    columns.add(2);
    columns.add(3);
    return columns;
  }
  if (chart.type === "bubble") {
    columns.add(2);
    columns.add(3);
    columns.add(4);
    return columns;
  }
  columns.add(1);
  return columns;
}

function updateDatumCell(datum: ChartDatum, column: number, value: string): ChartDatum {
  if (column === 0) return { ...datum, label: value };
  if (column === 1) return { ...datum, value: parseOptionalNumber(value) };
  if (column === 2) return { ...datum, x: parseOptionalNumber(value) };
  if (column === 3) return { ...datum, y: parseOptionalNumber(value) };
  if (column === 4) return { ...datum, size: parseOptionalNumber(value) };
  const values = [...(datum.values ?? [])];
  values[column - 5] = parseOptionalNumber(value) ?? 0;
  while (values.length > 0 && values[values.length - 1] === 0) values.pop();
  return { ...datum, values: values.length > 0 ? values : undefined };
}

function emptyChartDatum(): ChartDatum {
  return { label: "" };
}

function normalizeChartData(data: ChartDatum[]) {
  return data.filter((datum) => !isEmptyChartDatum(datum));
}

function isEmptyChartDatum(datum: ChartDatum) {
  return !datum.label.trim()
    && datum.value === undefined
    && datum.x === undefined
    && datum.y === undefined
    && datum.size === undefined
    && (!datum.values || datum.values.length === 0);
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formatOptionalNumber(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function defaultChartStyleValue(key: keyof ChartStyle) {
  if (key === "background") return "#09121e";
  if (key === "grid") return "#2d4050";
  if (key === "axis") return "#dfe2ea";
  if (key === "text") return "#f7fbff";
  if (key === "mutedText") return "#9b9da7";
  if (key === "line") return "#5ad6ff";
  if (key === "fill") return "#5ad6ff";
  if (key === "positive") return "#72f0b3";
  if (key === "negative") return "#ff6b7a";
  return "#ffffff";
}

type ChartNumberControl = "ticks" | "innerRadius" | "startAngle" | "endAngle";
type ChartToggleControl = "showGrid" | "showAxes" | "showLabels" | "showPoints" | "showValues";
type ChartDomainControl = "xDomain" | "yDomain" | "valueDomain";

function getRelevantChartSettings(type: ChartType): {
  numberControls: ChartNumberControl[];
  toggles: ChartToggleControl[];
  domains: ChartDomainControl[];
  styleKeys: Array<keyof ChartStyle>;
  showSeriesLabels: boolean;
} {
  if (type === "line" || type === "area") {
    return {
      numberControls: ["ticks"],
      toggles: ["showGrid", "showAxes", "showLabels", "showPoints", "showValues"],
      domains: ["yDomain"],
      styleKeys: type === "area" ? ["background", "grid", "axis", "text", "mutedText", "line", "fill"] : ["background", "grid", "axis", "text", "mutedText", "line"],
      showSeriesLabels: false,
    };
  }

  if (type === "bar" || type === "horizontalBar") {
    return {
      numberControls: ["ticks"],
      toggles: ["showGrid", "showAxes", "showLabels"],
      domains: ["yDomain"],
      styleKeys: ["grid", "axis", "text", "mutedText"],
      showSeriesLabels: false,
    };
  }

  if (type === "groupedBar" || type === "stackedBar") {
    return {
      numberControls: ["ticks"],
      toggles: ["showGrid", "showAxes", "showLabels"],
      domains: ["yDomain"],
      styleKeys: ["grid", "axis", "text", "mutedText"],
      showSeriesLabels: true,
    };
  }

  if (type === "scatter" || type === "bubble") {
    return {
      numberControls: ["ticks"],
      toggles: ["showGrid", "showAxes", "showLabels"],
      domains: ["xDomain", "yDomain"],
      styleKeys: ["grid", "axis", "text", "mutedText"],
      showSeriesLabels: false,
    };
  }

  if (type === "heatmap") {
    return {
      numberControls: ["ticks"],
      toggles: ["showGrid", "showAxes", "showLabels"],
      domains: ["valueDomain"],
      styleKeys: ["grid", "axis", "text", "mutedText", "line"],
      showSeriesLabels: false,
    };
  }

  if (type === "waterfall") {
    return {
      numberControls: ["ticks"],
      toggles: ["showGrid", "showAxes", "showLabels"],
      domains: ["yDomain"],
      styleKeys: ["grid", "axis", "text", "mutedText", "positive", "negative"],
      showSeriesLabels: false,
    };
  }

  if (type === "pie") {
    return {
      numberControls: ["startAngle", "endAngle"],
      toggles: [],
      domains: [],
      styleKeys: ["text"],
      showSeriesLabels: false,
    };
  }

  if (type === "donut") {
    return {
      numberControls: ["innerRadius", "startAngle", "endAngle"],
      toggles: [],
      domains: [],
      styleKeys: ["text"],
      showSeriesLabels: false,
    };
  }

  if (type === "radar") {
    return {
      numberControls: [],
      toggles: [],
      domains: ["valueDomain"],
      styleKeys: ["grid", "line", "fill"],
      showSeriesLabels: false,
    };
  }

  if (type === "radialBar") {
    return {
      numberControls: [],
      toggles: [],
      domains: ["valueDomain"],
      styleKeys: ["text"],
      showSeriesLabels: false,
    };
  }

  return {
    numberControls: ["startAngle", "endAngle"],
    toggles: [],
    domains: ["valueDomain"],
    styleKeys: ["grid", "line", "text"],
    showSeriesLabels: false,
  };
}

function FontSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [systemFontOptions, setSystemFontOptions] = useState<FontOption[]>(cachedSystemFontOptions ?? []);
  const fontOptions = useMemo(() => {
    const merged = [defaultFontOption, ...systemFontOptions];
    if (value && !merged.some((option) => option.value === value)) {
      merged.splice(1, 0, { value, label: formatFontValueLabel(value) });
    }
    return merged;
  }, [systemFontOptions, value]);

  useEffect(() => {
    let active = true;
    void loadSystemFontOptions().then((options) => {
      if (active) setSystemFontOptions(options);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <label className={`grid gap-1.5 ${mutedCaps}`}>Font
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {fontOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

export function ObjectInspector({ object, onChange }: { object: FrameObject; onChange: (updater: (object: FrameObject) => FrameObject) => void }) {
  const isText = object.type === "text";
  const colorStyleEntries = getEditableColorStyleEntries(object.style).filter(([key]) => !(isText && key === "color"));
  const textColor = isHexColor(String(object.style.color ?? "")) ? String(object.style.color) : "#FFFFFF";
  const fontFamily = String(object.style.fontFamily ?? defaultFontFamily);
  const fontSize = Number(object.style.fontSize ?? 48);
  const fontWeight = Number(object.style.fontWeight ?? 400);
  const fontStyle = String(object.style.fontStyle ?? "normal");
  const textDecoration = String(object.style.textDecoration ?? "none");
  const lineHeight = Number(object.style.lineHeight ?? 1.1);
  const letterSpacing = Number(object.style.letterSpacing ?? 0);
  const textAlign = String(object.style.textAlign ?? "left");
  const textButtonBase = "grid h-9 place-items-center rounded-[9px] border text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)]";

  function updateBounds(key: keyof Bounds, value: string) {
    onChange((current) => ({ ...current, bounds: { ...current.bounds, [key]: Number(value) || 0 } }));
  }

  function updateStyleColor(key: string, value: string) {
    onChange((current) => ({ ...current, style: { ...current.style, [key]: value } }));
  }

  function updateTextContent(value: string) {
    onChange((current) => ({ ...current, content: value, richText: undefined }));
  }

  function updateStyleValue(key: string, value: string | number) {
    onChange((current) => ({ ...current, style: { ...current.style, [key]: value } }));
  }

  function updateStyleNumber(key: string, value: string) {
    updateStyleValue(key, Number(value) || 0);
  }

  function toggleBold() {
    updateStyleValue("fontWeight", fontWeight >= 700 ? 400 : 700);
  }

  function toggleItalic() {
    updateStyleValue("fontStyle", fontStyle === "italic" ? "normal" : "italic");
  }

  function hasTextDecoration(value: "underline" | "line-through") {
    return textDecoration.split(" ").includes(value);
  }

  function toggleTextDecoration(value: "underline" | "line-through") {
    const decorations = new Set(textDecoration === "none" ? [] : textDecoration.split(" ").filter(Boolean));
    if (decorations.has(value)) decorations.delete(value);
    else decorations.add(value);
    updateStyleValue("textDecoration", decorations.size > 0 ? Array.from(decorations).join(" ") : "none");
  }

  function toggleStrikethrough() {
    toggleTextDecoration("line-through");
  }

  function toggleUnderline() {
    toggleTextDecoration("underline");
  }

  function textButtonClass(active: boolean) {
    return `${textButtonBase} ${active ? "border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] text-white" : "border-[#2d313b] bg-[#171920]"}`;
  }

  function updateMotion(value: string) {
    try {
      const motion = value.trim() ? JSON.parse(value) as FrameObject["motion"] : undefined;
      onChange((current) => ({ ...current, motion }));
    } catch {
      // Keep the textarea editable while the user is midway through JSON syntax.
    }
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{key}<Input type="number" value={object.bounds[key]} onChange={(event) => updateBounds(key, event.target.value)} /></label>)}
      </div>
      {isText ? <>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Content<Textarea className="min-h-[104px] resize-y normal-case tracking-normal" value={object.content ?? ""} onChange={(event) => updateTextContent(event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Colour<ColorSelector value={textColor} onChange={(value) => updateStyleValue("color", value)} /></label>
        <FontSelector value={fontFamily} onChange={(value) => updateStyleValue("fontFamily", value)} />
        <div className="grid grid-cols-2 gap-2">
          <label className={`grid gap-1.5 ${mutedCaps}`}>Size<Input type="number" min={1} value={fontSize} onChange={(event) => updateStyleNumber("fontSize", event.target.value)} /></label>
          <label className={`grid gap-1.5 ${mutedCaps}`}>Weight<Input type="number" min={100} max={1000} step={10} value={fontWeight} onChange={(event) => updateStyleNumber("fontWeight", event.target.value)} /></label>
          <label className={`grid gap-1.5 ${mutedCaps}`}>Line Height<Input type="number" min={0.1} step={0.05} value={lineHeight} onChange={(event) => updateStyleNumber("lineHeight", event.target.value)} /></label>
          <label className={`grid gap-1.5 ${mutedCaps}`}>Char Spacing<Input type="number" step={0.1} value={letterSpacing} onChange={(event) => updateStyleNumber("letterSpacing", event.target.value)} /></label>
        </div>
        <div className="grid grid-cols-4 gap-2" aria-label="Text style">
          <button className={textButtonClass(fontWeight >= 700)} aria-label="Bold" aria-pressed={fontWeight >= 700} title="Bold" onClick={toggleBold}><Bold size={16} /></button>
          <button className={textButtonClass(fontStyle === "italic")} aria-label="Italic" aria-pressed={fontStyle === "italic"} title="Italic" onClick={toggleItalic}><Italic size={16} /></button>
          <button className={textButtonClass(hasTextDecoration("underline"))} aria-label="Underline" aria-pressed={hasTextDecoration("underline")} title="Underline" onClick={toggleUnderline}><Underline size={16} /></button>
          <button className={textButtonClass(hasTextDecoration("line-through"))} aria-label="Strikethrough" aria-pressed={hasTextDecoration("line-through")} title="Strikethrough" onClick={toggleStrikethrough}><Strikethrough size={16} /></button>
        </div>
        <div className="grid gap-1.5"><span className={mutedCaps}>Alignment</span><div className="grid grid-cols-4 gap-2" aria-label="Text alignment">
          <button className={textButtonClass(textAlign === "left")} aria-label="Align left" aria-pressed={textAlign === "left"} title="Align left" onClick={() => updateStyleValue("textAlign", "left")}><AlignLeft size={16} /></button>
          <button className={textButtonClass(textAlign === "center")} aria-label="Align center" aria-pressed={textAlign === "center"} title="Align center" onClick={() => updateStyleValue("textAlign", "center")}><AlignCenter size={16} /></button>
          <button className={textButtonClass(textAlign === "right")} aria-label="Align right" aria-pressed={textAlign === "right"} title="Align right" onClick={() => updateStyleValue("textAlign", "right")}><AlignRight size={16} /></button>
          <button className={textButtonClass(textAlign === "justify")} aria-label="Justify" aria-pressed={textAlign === "justify"} title="Justify" onClick={() => updateStyleValue("textAlign", "justify")}><AlignJustify size={16} /></button>
        </div></div>
      </> : null}
      {colorStyleEntries.length > 0 ? <div className="grid gap-2"><span className={mutedCaps}>Colours</span><div className="grid gap-2">{colorStyleEntries.map(([key, value]) => <label className={`grid gap-1.5 ${mutedCaps}`} key={key}>{formatStyleLabel(key)}<ColorSelector value={value} onChange={(nextValue) => updateStyleColor(key, nextValue)} /></label>)}</div></div> : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>Motion JSON<Textarea className="min-h-[92px] resize-y font-mono normal-case tracking-normal" value={object.motion ? JSON.stringify(object.motion, null, 2) : ""} onChange={(event) => updateMotion(event.target.value)} /></label>
    </div>
  );
}

export function AdjustmentInspector({ layer, sceneDuration, onChange, onDelete }: { layer: AdjustmentLayer; sceneDuration: number; onChange: (updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void; onDelete: () => void }) {
  function updateText(key: "name", value: string) {
    onChange((current) => ({ ...current, [key]: value }));
  }

  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => {
      if (key === "start") return { ...current, start: roundTenth(clamp(numeric, 0, Math.max(sceneDuration - current.duration, 0))) };
      return { ...current, duration: roundTenth(clamp(numeric, 0.1, Math.max(sceneDuration - current.start, 0.1))) };
    });
  }

  function updateFrameStep(value: string) {
    const every = Math.max(1, Math.round(Number(value) || 1));
    onChange((current) => ({ ...current, effect: { kind: "frameSkip", every } }));
  }

  return (
    <div className="grid gap-3">
      <div className={panelCard}>
        <span>Adjustment Node</span>
        <strong className="text-[13px]">Frame Skip</strong>
        <small className="text-[#9b9da7]">Behaves like a timeline node and quantizes animation time beneath it.</small>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Name<Input value={layer.name} onChange={(event) => updateText("name", event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={sceneDuration - layer.duration} step={0.1} value={layer.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={0.1} max={sceneDuration - layer.start} step={0.1} value={layer.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Frame Step<Input type="number" min={1} step={1} value={layer.effect.every} onChange={(event) => updateFrameStep(event.target.value)} /></label>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

export function EmptyInspector() {
  return (
    <div className={panelCard}>
      <span>No selection</span>
      <strong className="text-[13px]">Nothing selected</strong>
      <small className="text-[#9b9da7]">Select a composition, marker, or object to edit its settings.</small>
    </div>
  );
}

export function ZoomInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, middleTransitionMode, pickingFocus, canSnapMiddle, onChange, onScalePreview, onScalePreviewEnd, onChangeFocus, onChangeSelectedSnap, onChangeMiddleTransition, onChangeMiddleEase, onDelete, onPickFocus, onSnapMiddle }: { marker: ZoomMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; middleTransitionMode: "instant" | "transition"; pickingFocus: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: ZoomMarker, part: Part) => ZoomMarker) => void; onScalePreview: (scale: number) => void; onScalePreviewEnd: () => void; onChangeFocus: (focus: Point) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onChangeMiddleTransition: (mode: "instant" | "transition") => void; onChangeMiddleEase: (ease: MotionEase | undefined) => void; onDelete: () => void; onPickFocus: () => void; onSnapMiddle: () => void }) {
  const isMultiSelection = selectedMarkerCount > 1;
  const snapInActive = isMultiSelection ? selectedSnapInActive : Boolean(marker.snapIn);
  const snapOutActive = isMultiSelection ? selectedSnapOutActive : Boolean(marker.snapOut);
  const [draftScale, setDraftScale] = useState(() => roundTwo(clamp(marker.scale, 1, 5)));

  useEffect(() => {
    setDraftScale(roundTwo(clamp(marker.scale, 1, 5)));
  }, [marker.id, marker.scale]);
  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current, currentPart) => {
      if (key === "start") return { ...current, start: roundTenth(clamp(numeric, 0, Math.max(currentPart.duration - current.duration, 0))) };
      return { ...current, duration: roundTenth(clamp(numeric, minimumZoomDuration, currentPart.duration - current.start)) };
    });
  }

  function updateFocus(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChangeFocus({ ...marker.focus, [key]: Math.round(clamp(numeric, 0, key === "x" ? FRAME_WIDTH : FRAME_HEIGHT)) });
  }

  function commitScale(value = draftScale) {
    const nextScale = roundTwo(clamp(value, 1, 5));
    setDraftScale(nextScale);
    onScalePreviewEnd();
    if (nextScale === roundTwo(marker.scale)) return;
    onChange((current) => ({ ...current, scale: nextScale }));
  }

  function updateDraftScale(value: string) {
    const nextScale = roundTwo(clamp(Number(value) || 1, 1, 5));
    setDraftScale(nextScale);
    onScalePreview(nextScale);
  }

  function updateEase(value: string) {
    onChange((current) => ({ ...current, ease: value === "easeInOut" ? undefined : value as MotionEase }));
  }

  function updateMiddleEase(value: string) {
    onChangeMiddleEase(value === "easeInOut" ? undefined : value as MotionEase);
  }

  function updateSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    if (isMultiSelection) {
      onChangeSelectedSnap(key, enabled);
      return;
    }

    onChange((current) => ({ ...current, [key]: enabled || undefined }));
  }

  function snapButtonClass(active: boolean, enabled = true) {
    if (active) return "rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] px-3 py-2.5 text-center text-xs font-bold text-[var(--clipper-accent)] transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]";
    return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
  }

  function middleTransitionButtonClass(active: boolean) {
    return `rounded-[9px] border px-3 py-2 text-xs font-bold transition ${active ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#dfe2ea] hover:border-[#37d6c2] hover:bg-[#20232c]"}`;
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Focus X<Input type="number" min={0} max={FRAME_WIDTH} step={1} value={marker.focus.x} onChange={(event) => updateFocus("x", event.target.value)} /></label>
        <div className="grid gap-1.5">
          <span className={mutedCaps}>Focus Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" min={0} max={FRAME_HEIGHT} step={1} value={marker.focus.y} onChange={(event) => updateFocus("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${pickingFocus ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick focus from frame" onClick={onPickFocus}><Crosshair size={16} /></button>
          </div>
        </div>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Scale<div className="grid grid-cols-[1fr_52px] items-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-2.5 py-2"><input aria-label="Zoom scale" className="h-1.5 min-w-0 accent-[#37d6c2] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#37d6c2] [&::-webkit-slider-thumb]:bg-[var(--clipper-accent)] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#37d6c2] [&::-moz-range-thumb]:bg-[var(--clipper-accent)]" type="range" min={1} max={5} step={0.01} value={draftScale} onChange={(event) => updateDraftScale(event.target.value)} onPointerUp={() => commitScale()} onKeyUp={() => commitScale()} onBlur={() => commitScale()} /><span className="text-right text-xs font-extrabold normal-case tracking-normal text-[#dfe2ea] tabular-nums">{draftScale.toFixed(2)}</span></div></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Ease<Select value={marker.ease ?? "easeInOut"} onValueChange={updateEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Unmend the neighboring zoom edges" : "Mend the neighboring zoom edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>{middleSnapActive ? "Unmend" : "Mend"}</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
        {middleSnapActive ? <div className="grid gap-1.5"><span className={mutedCaps}>Mend handoff</span><div className="grid grid-cols-2 gap-2"><button className={middleTransitionButtonClass(middleTransitionMode === "instant")} aria-pressed={middleTransitionMode === "instant"} onClick={() => onChangeMiddleTransition("instant")}>Instant</button><button className={middleTransitionButtonClass(middleTransitionMode === "transition")} aria-pressed={middleTransitionMode === "transition"} onClick={() => onChangeMiddleTransition("transition")}>Transition</button></div><label className={`grid gap-1.5 ${mutedCaps}`}>Mend ease<Select value={marker.middleEase ?? "easeInOut"} onValueChange={updateMiddleEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label></div> : null}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

export function TranslationInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, middleTransitionMode, pickingPosition, pickingTracker, canSnapMiddle, onChange, onChangeSelectedSnap, onChangeMiddleTransition, onChangeMiddleEase, onDelete, onPickPosition, onPickTracker, onSnapMiddle }: { marker: TranslationMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; middleTransitionMode: "instant" | "transition"; pickingPosition: boolean; pickingTracker: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: TranslationMarker, part: Part) => TranslationMarker) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onChangeMiddleTransition: (mode: "instant" | "transition") => void; onChangeMiddleEase: (ease: MotionEase | undefined) => void; onDelete: () => void; onPickPosition: () => void; onPickTracker: () => void; onSnapMiddle: () => void }) {
  const isMultiSelection = selectedMarkerCount > 1;
  const snapInActive = isMultiSelection ? selectedSnapInActive : Boolean(marker.snapIn);
  const snapOutActive = isMultiSelection ? selectedSnapOutActive : Boolean(marker.snapOut);

  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current, currentPart) => {
      if (key === "start") return { ...current, start: roundTenth(clamp(numeric, 0, Math.max(currentPart.duration - current.duration, 0))) };
      return { ...current, duration: roundTenth(clamp(numeric, minimumZoomDuration, currentPart.duration - current.start)) };
    });
  }

  function updatePosition(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => ({ ...current, position: { ...current.position, [key]: Math.round(numeric) } }));
  }

  function updateRotation(value: string) {
    onChange((current) => ({ ...current, rotation: Math.round(Number(value) || 0) }));
  }

  function updateFollowId(value: string) {
    const followId = value.trim();
    onChange((current) => ({ ...current, followId: followId || undefined }));
  }

  function updateEase(value: string) {
    onChange((current) => ({ ...current, ease: value === "default" ? undefined : value as MotionEase }));
  }

  function updateMiddleEase(value: string) {
    onChangeMiddleEase(value === "default" ? undefined : value as MotionEase);
  }

  function updateSnap(key: "snapIn" | "snapOut", enabled: boolean) {
    if (isMultiSelection) {
      onChangeSelectedSnap(key, enabled);
      return;
    }

    onChange((current) => ({ ...current, [key]: enabled || undefined }));
  }

  function snapButtonClass(active: boolean, enabled = true) {
    if (active) return "rounded-[10px] border border-[var(--clipper-accent-strong)] bg-[rgb(var(--clipper-accent-rgb)/0.12)] px-3 py-2.5 text-center text-xs font-bold text-[var(--clipper-accent)] transition hover:bg-[rgb(var(--clipper-accent-rgb)/0.18)]";
    return `rounded-[10px] border border-[#2d313b] bg-[#171920] px-3 py-2.5 text-center text-xs font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent-strong)] hover:bg-[#20232c] ${enabled ? "" : "cursor-not-allowed opacity-45 hover:border-[#2d313b] hover:bg-[#171920]"}`;
  }

  function middleTransitionButtonClass(active: boolean) {
    return `rounded-[9px] border px-3 py-2 text-xs font-bold transition ${active ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#dfe2ea] hover:border-[#37d6c2] hover:bg-[#20232c]"}`;
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        {marker.kind === "rotate" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Rotation<Input type="number" step={1} value={marker.rotation ?? 0} onChange={(event) => updateRotation(event.target.value)} /></label> : <label className={`grid gap-1.5 ${mutedCaps}`}>X<Input type="number" step={1} value={marker.position.x} onChange={(event) => updatePosition("x", event.target.value)} /></label>}
        {marker.kind === "rotate" ? null : <div className="grid gap-1.5">
          <span className={mutedCaps}>Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" step={1} value={marker.position.y} onChange={(event) => updatePosition("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${pickingPosition ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick pan target from frame" onClick={onPickPosition}><Crosshair size={16} /></button>
          </div>
        </div>}
      </div>
      {marker.kind !== "rotate" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Tracker<div className="grid grid-cols-[1fr_40px] gap-2"><Input value={marker.followId ?? ""} placeholder="object-id" onChange={(event) => updateFollowId(event.target.value)} /><button className={`grid place-items-center rounded-[9px] border px-2 ${pickingTracker ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick tracker target from frame" type="button" onClick={onPickTracker}><Crosshair size={16} /></button></div></label> : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>Ease<Select value={marker.ease ?? "default"} onValueChange={updateEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="default">Ease in-out</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Unmend the neighboring pan edges" : "Mend the neighboring pan edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>{middleSnapActive ? "Unmend" : "Mend"}</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
        {middleSnapActive ? <div className="grid gap-1.5"><span className={mutedCaps}>Mend handoff</span><div className="grid grid-cols-2 gap-2"><button className={middleTransitionButtonClass(middleTransitionMode === "instant")} aria-pressed={middleTransitionMode === "instant"} onClick={() => onChangeMiddleTransition("instant")}>Instant</button><button className={middleTransitionButtonClass(middleTransitionMode === "transition")} aria-pressed={middleTransitionMode === "transition"} onClick={() => onChangeMiddleTransition("transition")}>Transition</button></div><label className={`grid gap-1.5 ${mutedCaps}`}>Mend ease<Select value={marker.middleEase ?? "default"} onValueChange={updateMiddleEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="default">Ease in-out</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="easeIn">Ease in</SelectItem><SelectItem value="easeOut">Ease out</SelectItem><SelectItem value="easeInOut">Ease in-out</SelectItem><SelectItem value="circOut">Circ out</SelectItem></SelectGroup></SelectContent></Select></label></div> : null}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}
