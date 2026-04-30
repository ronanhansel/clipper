import DataEditor, { GridCellKind, type EditableGridCell, type GridCell, type GridColumn, type Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Crosshair, Database, Italic, Strikethrough, Trash2, Underline } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { chartTypes, formatChartTypeLabel, type ChartDatum, type ChartSpec, type ChartStyle, type ChartType } from "../../core/chart";
import { MAX_PART_DURATION_SECONDS, FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type FrameObject, type MotionEase, type Part, type PartFrame, type Point, type TranslationMarker, type ZoomMarker } from "../../core/types";
import { clamp, roundTenth, roundTwo } from "../../core/math";
import { getAdjustmentEffectPackage, getMotionEffectPackage } from "../../core/effects/registry";
import type { AdjustmentEffectDisableCondition, AdjustmentEffectParamControl, AdjustmentEffectPointControl } from "../../core/effects/types";
import { getMotionBlockEffectKind, getMotionMarkerViews } from "../../core/motionEffects";
import { minimumZoomDuration, mutedCaps, panelCard } from "../../app/config";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Textarea } from "../ui/textarea";
import { ColorSelector, formatStyleLabel, getEditableColorStyleEntries, isHexColor } from "../ColorSelector";
import { clipperHost } from "../../app/clipperHost";

const defaultFontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const defaultFontOption = { value: defaultFontFamily, label: "System" };
const defaultMotionEaseSelectValue = "default";
const easePreviewHoverDelayMs = 600;
const easePreviewSkipDelayMs = 900;
const easePreviewDuration = "1.45s";
const easePreviewItems = [
  { value: defaultMotionEaseSelectValue, label: "Ease in-out", ease: "easeInOut" as const },
  { value: "linear", label: "Linear", ease: "linear" as const },
  { value: "easeIn", label: "Ease in", ease: "easeIn" as const },
  { value: "easeOut", label: "Ease out", ease: "easeOut" as const },
  { value: "circOut", label: "Circ out", ease: "circOut" as const },
];
const explicitEasePreviewItems = easePreviewItems.map((item) => item.ease === "easeInOut" ? { ...item, value: "easeInOut" } : item);

let lastEasePreviewOpenTime = 0;

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

function motionEaseSelectValue(ease: MotionEase | undefined) {
  return ease && ease !== "easeInOut" ? ease : defaultMotionEaseSelectValue;
}

function easePreviewProgress(value: number, ease: MotionEase) {
  if (ease === "easeOut" || ease === "circOut") return 1 - Math.pow(1 - value, 3);
  if (ease === "easeIn") return value * value * value;
  if (ease === "easeInOut") return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  return value;
}

function easePreviewPath(ease: MotionEase) {
  const width = 132;
  const height = 72;
  const segments = 96;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const x = index / segments;
    const y = 1 - easePreviewProgress(x, ease);
    return `${index === 0 ? "M" : "L"} ${(x * width).toFixed(2)} ${(y * height).toFixed(2)}`;
  }).join(" ");
}

function easePreviewSampleValues(ease: MotionEase, map: (time: number, progress: number) => number) {
  const segments = 80;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const time = index / segments;
    return map(time, easePreviewProgress(time, ease)).toFixed(2);
  }).join(";");
}

function easePreviewKeyTimes() {
  const segments = 80;
  return Array.from({ length: segments + 1 }, (_, index) => (index / segments).toFixed(3)).join(";");
}

function EaseSelectItem({ value, label, ease }: { value: string; label: string; ease: MotionEase }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const path = easePreviewPath(ease);
  const graphKeyTimes = easePreviewKeyTimes();
  const graphXValues = easePreviewSampleValues(ease, (time) => time * 132);
  const graphYValues = easePreviewSampleValues(ease, (_time, progress) => (1 - progress) * 72);
  const railXValues = easePreviewSampleValues(ease, (_time, progress) => 6 + progress * 142);

  function clearPreviewTimer() {
    if (!previewTimerRef.current) return;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
  }

  function openPreviewAfterDelay() {
    clearPreviewTimer();
    if (Date.now() - lastEasePreviewOpenTime <= easePreviewSkipDelayMs) {
      setPreviewOpen(true);
      lastEasePreviewOpenTime = Date.now();
      return;
    }

    previewTimerRef.current = setTimeout(() => {
      setPreviewOpen(true);
      lastEasePreviewOpenTime = Date.now();
      previewTimerRef.current = null;
    }, easePreviewHoverDelayMs);
  }

  function closePreview() {
    clearPreviewTimer();
    setPreviewOpen(false);
  }

  useEffect(() => closePreview, []);

  return (
    <Tooltip open={previewOpen}>
      <TooltipTrigger asChild>
        <SelectItem value={value} onPointerEnter={openPreviewAfterDelay} onPointerLeave={closePreview} onPointerDown={closePreview}>{label}</SelectItem>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={16} className="w-[190px] max-w-none overflow-hidden rounded-[8px] border-[#343946] bg-[#10131a] p-0 shadow-[0_22px_70px_rgba(0,0,0,0.54)] data-[state=instant-open]:animate-[clipper-tooltip-in_160ms_cubic-bezier(0.16,1,0.3,1)_forwards]">
        <div className="border-b border-[#252a35] bg-[radial-gradient(circle_at_72%_0%,rgb(var(--clipper-accent-rgb)/0.18),transparent_42%),linear-gradient(180deg,#171b24,#10131a)] px-3 py-2">
          <strong className="block text-[11px] font-extrabold text-white">{label}</strong>
          <span className="mt-0.5 block text-[10px] font-medium text-[#8d94a3]">Timing preview</span>
        </div>
        <div className="grid gap-3 px-3 py-3">
          <svg viewBox="0 0 132 72" className="h-[82px] w-full overflow-visible" aria-hidden="true">
            <path d="M 0 72 L 132 0" stroke="#2d3340" strokeDasharray="3 5" strokeWidth="1.2" />
            <path d="M 0 72 L 0 0 M 0 72 L 132 72" stroke="#3a404c" strokeWidth="1" />
            <path d={path} fill="none" stroke="var(--clipper-accent)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            <circle r="4.5" fill="#37d6c2" filter="drop-shadow(0 0 8px rgba(55,214,194,0.75))">
              <animate attributeName="cx" dur={easePreviewDuration} repeatCount="indefinite" keyTimes={graphKeyTimes} values={graphXValues} />
              <animate attributeName="cy" dur={easePreviewDuration} repeatCount="indefinite" keyTimes={graphKeyTimes} values={graphYValues} />
            </circle>
          </svg>
          <svg viewBox="0 0 154 12" className="h-3 w-full overflow-visible" aria-hidden="true">
            <line x1="6" y1="6" x2="148" y2="6" stroke="#252a35" strokeLinecap="round" strokeWidth="4" />
            <circle cx="6" cy="6" r="6" fill="var(--clipper-accent)" filter="drop-shadow(0 0 10px rgb(var(--clipper-accent-rgb)/0.45))">
              <animate attributeName="cx" dur={easePreviewDuration} repeatCount="indefinite" keyTimes={graphKeyTimes} values={railXValues} />
            </circle>
          </svg>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function EaseSelectItems({ includeLinear = true, defaultInOut = false }: { includeLinear?: boolean; defaultInOut?: boolean }) {
  const items = defaultInOut ? easePreviewItems : explicitEasePreviewItems;
  return <>{items.filter((item) => includeLinear || item.value !== "linear").map((item) => <EaseSelectItem key={item.value} {...item} />)}</>;
}

export function FrameInspector({ part, onDurationChange, onFrameChange, onBackgroundChange }: { part: Part; onDurationChange: (duration: number) => void; onFrameChange: (updater: (frame: PartFrame) => PartFrame) => void; onBackgroundChange: (updater: (background: BackgroundLayer) => BackgroundLayer) => void }) {
  const motionViews = getMotionMarkerViews(part);
  const markerEnd = Math.max(0, ...motionViews.zoomMarkers.map((marker) => marker.start + marker.duration), ...motionViews.translationMarkers.map((marker) => marker.start + marker.duration));
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
      <label className={`grid gap-1.5 ${mutedCaps}`}>Frame background color<ColorSelector value={String(part.frame.style.background ?? "#000000")} onChange={updateFrameBackground} /></label>
      {isHexColor(String(part.background.style.background ?? "")) ? <label className={`grid gap-1.5 ${mutedCaps}`}>Layer background color<ColorSelector value={String(part.background.style.background)} onChange={updateBackgroundColor} /></label> : null}
      <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-[#2d313b] bg-[#171920] p-3 text-sm font-bold text-[#dfe2ea] transition hover:border-[var(--clipper-accent)] hover:bg-[#20232c]">
        <Checkbox checked={Boolean(part.background.stretchToElements)} onCheckedChange={(checked) => updateBackgroundStretch(checked === true)} />
        <span>Stretch background</span>
      </label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background style JSON<Textarea className="min-h-[120px] resize-y font-mono" value={JSON.stringify(part.background.style, null, 2)} onChange={(event) => updateBackgroundStyle(event.target.value)} /></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Background motion JSON<Textarea className="min-h-[92px] resize-y font-mono" value={part.background.motion ? JSON.stringify(part.background.motion, null, 2) : ""} onChange={(event) => updateBackgroundMotion(event.target.value)} /></label>
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
      <label className={`grid gap-1.5 ${mutedCaps}`}>Animation JSON<Textarea className="min-h-[92px] resize-y font-mono" value={chart.animation ? JSON.stringify(chart.animation, null, 2) : ""} onChange={(event) => updateAnimation(event.target.value)} /></label>
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
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-[#737884]">{chart.data.length} data rows</span>
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
        <label className={`grid gap-1.5 ${mutedCaps}`}>Content<Textarea className="min-h-[104px] resize-y" value={object.content ?? ""} onChange={(event) => updateTextContent(event.target.value)} /></label>
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
      <label className={`grid gap-1.5 ${mutedCaps}`}>Motion JSON<Textarea className="min-h-[92px] resize-y font-mono" value={object.motion ? JSON.stringify(object.motion, null, 2) : ""} onChange={(event) => updateMotion(event.target.value)} /></label>
    </div>
  );
}

export function AdjustmentInspector({ layer, sceneDuration, pickingPointKey, onChange, onDelete, onPickPoint }: { layer: AdjustmentLayer; sceneDuration: number; pickingPointKey?: string | null; onChange: (updater: (layer: AdjustmentLayer) => AdjustmentLayer) => void; onDelete: () => void; onPickPoint?: (control: AdjustmentEffectPointControl) => void }) {
  const effect = getAdjustmentEffectPackage(layer.effect.effectId);

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

  function getParamValue(control: AdjustmentEffectParamControl) {
    const value = layer.effect.params?.[control.key];
    if (control.type === "select") return typeof value === "string" ? value : control.defaultValue;
    return typeof value === "number" && Number.isFinite(value) ? value : control.defaultValue;
  }

  function updateParam(control: AdjustmentEffectParamControl, value: string) {
    if (isAdjustmentControlDisabled(layer, control.disabledWhen)) return;
    if (control.type === "select") {
      onChange((current) => ({ ...current, effect: { ...current.effect, params: { ...current.effect.params, [control.key]: value } } }));
      return;
    }

    const fallback = control.defaultValue;
    let numeric = Number(value);
    if (!Number.isFinite(numeric)) numeric = fallback;
    if (typeof control.min === "number") numeric = Math.max(control.min, numeric);
    if (typeof control.max === "number") numeric = Math.min(control.max, numeric);
    if (control.step && Number.isInteger(control.step)) numeric = Math.round(numeric);
    onChange((current) => ({ ...current, effect: { ...current.effect, params: { ...current.effect.params, [control.key]: numeric } } }));
  }

  function getPointValue(control: AdjustmentEffectPointControl, axis: "x" | "y") {
    const key = axis === "x" ? control.xKey : control.yKey;
    const fallback = axis === "x" ? control.xDefault : control.yDefault;
    const value = Number(layer.effect.params?.[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  function updatePointParam(control: AdjustmentEffectPointControl, axis: "x" | "y", value: string) {
    if (isAdjustmentControlDisabled(layer, control.disabledWhen)) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const key = axis === "x" ? control.xKey : control.yKey;
    const max = control.coordinateSpace === "percent" ? 100 : axis === "x" ? FRAME_WIDTH : FRAME_HEIGHT;
    onChange((current) => ({ ...current, effect: { ...current.effect, params: { ...current.effect.params, [key]: roundTwo(clamp(numeric, 0, max)) } } }));
  }

  return (
    <div className="grid gap-3">
      <label className={`grid gap-1.5 ${mutedCaps}`}>Name<Input value={layer.name} onChange={(event) => updateText("name", event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={sceneDuration - layer.duration} step={0.1} value={layer.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={0.1} max={sceneDuration - layer.start} step={0.1} value={layer.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Effect<Input value={effect?.label ?? layer.effect.effectId} readOnly /></label>
      {effect?.paramControls?.map((control) => {
        const disabledReason = getAdjustmentControlDisabledReason(layer, control.disabledWhen);
        return <label className={`grid gap-1.5 ${mutedCaps} ${disabledReason ? "opacity-50" : ""}`} key={control.key} title={disabledReason}>{control.label}{control.type === "select" ? <Select value={String(getParamValue(control))} onValueChange={(value) => updateParam(control, value)} disabled={Boolean(disabledReason)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{control.options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select> : <Input type={control.type} min={control.min} max={control.max} step={control.step} value={getParamValue(control)} resetValue={control.defaultValue} numberScrubMode="continuous" numberScrubCommitThrottleMs={16} disabled={Boolean(disabledReason)} onChange={(event) => updateParam(control, event.target.value)} />}</label>;
      })}
      {effect?.pointControls?.map((control) => <AdjustmentPointControlField control={control} disabledReason={getAdjustmentControlDisabledReason(layer, control.disabledWhen)} key={`${control.xKey}:${control.yKey}`} picking={pickingPointKey === `${control.xKey}:${control.yKey}`} xValue={getPointValue(control, "x")} yValue={getPointValue(control, "y")} onPick={() => onPickPoint?.(control)} onValueChange={(axis, value) => updatePointParam(control, axis, value)} />)}
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

function AdjustmentPointControlField({ control, disabledReason, picking, xValue, yValue, onPick, onValueChange }: { control: AdjustmentEffectPointControl; disabledReason?: string; picking: boolean; xValue: number; yValue: number; onPick: () => void; onValueChange: (axis: "x" | "y", value: string) => void }) {
  const percentSpace = control.coordinateSpace === "percent";
  const disabled = Boolean(disabledReason);

  return (
    <div className={`grid gap-1.5 ${disabled ? "opacity-50" : ""}`} title={disabledReason}>
      <span className={mutedCaps}>{control.label}</span>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-end gap-2">
        <label className={`grid gap-1 ${mutedCaps}`}>{control.xLabel ?? "X"}<Input type="number" min={0} max={percentSpace ? 100 : FRAME_WIDTH} step={percentSpace ? 0.5 : 1} value={xValue} resetValue={control.xDefault} numberScrubMode="continuous" numberScrubCommitThrottleMs={16} aria-label={control.xLabel ?? `${control.label} X`} disabled={disabled} onChange={(event) => onValueChange("x", event.target.value)} /></label>
        <label className={`grid gap-1 ${mutedCaps}`}>{control.yLabel ?? "Y"}<Input type="number" min={0} max={percentSpace ? 100 : FRAME_HEIGHT} step={percentSpace ? 0.5 : 1} value={yValue} resetValue={control.yDefault} numberScrubMode="continuous" numberScrubCommitThrottleMs={16} aria-label={control.yLabel ?? `${control.label} Y`} disabled={disabled} onChange={(event) => onValueChange("y", event.target.value)} /></label>
        <button className={`grid h-8 w-10 place-items-center rounded-[9px] border ${disabled ? "cursor-not-allowed border-[#2d313b] bg-[#171920] text-[#6f7480]" : picking ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} disabled={disabled} title={disabledReason ?? control.pickLabel ?? `Pick ${control.label.toLowerCase()} from frame`} type="button" onClick={onPick}><Crosshair size={16} /></button>
      </div>
    </div>
  );
}

function getAdjustmentControlDisabledReason(layer: AdjustmentLayer, condition: AdjustmentEffectDisableCondition | undefined) {
  if (!condition) return undefined;
  const value = layer.effect.params?.[condition.key];
  const disabled = "equals" in condition ? value === condition.equals : condition.truthy ? Boolean(value) : !value;
  return disabled ? condition.reason ?? "Disabled by current settings." : undefined;
}

function isAdjustmentControlDisabled(layer: AdjustmentLayer, condition: AdjustmentEffectDisableCondition | undefined) {
  return Boolean(getAdjustmentControlDisabledReason(layer, condition));
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
  const defaultName = getMotionEffectPackage(marker.effectId ?? "clipper.motion.zoom")?.label ?? "Zoom";
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

  function updateName(value: string) {
    onChange((current) => ({ ...current, name: value.trim() || undefined }));
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
      <label className={`grid gap-1.5 ${mutedCaps}`}>Name<Input value={marker.name ?? ""} placeholder={defaultName} disabled={isMultiSelection} title={isMultiSelection ? "Rename one selected marker at a time." : undefined} onChange={(event) => updateName(event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} resetValue={0} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} resetValue={1} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Focus X<Input type="number" min={0} max={FRAME_WIDTH} resetValue={FRAME_WIDTH / 2} step={1} value={marker.focus.x} onChange={(event) => updateFocus("x", event.target.value)} /></label>
        <div className="grid gap-1.5">
          <span className={mutedCaps}>Focus Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" min={0} max={FRAME_HEIGHT} resetValue={FRAME_HEIGHT / 2} step={1} value={marker.focus.y} onChange={(event) => updateFocus("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${pickingFocus ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick focus from frame" onClick={onPickFocus}><Crosshair size={16} /></button>
          </div>
        </div>
      </div>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Scale<div className="grid grid-cols-[1fr_52px] items-center gap-2 rounded-[10px] border border-[#2d313b] bg-[#171920] px-2.5 py-2"><input aria-label="Zoom scale" className="h-1.5 min-w-0 accent-[#37d6c2] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#37d6c2] [&::-webkit-slider-thumb]:bg-[var(--clipper-accent)] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#37d6c2] [&::-moz-range-thumb]:bg-[var(--clipper-accent)]" type="range" min={1} max={5} step={0.01} value={draftScale} onChange={(event) => updateDraftScale(event.target.value)} onPointerUp={() => commitScale()} onKeyUp={() => commitScale()} onBlur={() => commitScale()} /><span className="text-right text-xs font-extrabold text-[#dfe2ea] tabular-nums">{draftScale.toFixed(2)}</span></div></label>
      <label className={`grid gap-1.5 ${mutedCaps}`}>Ease<Select value={marker.ease ?? "easeInOut"} onValueChange={updateEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><TooltipProvider delayDuration={1000} skipDelayDuration={0}><SelectGroup><EaseSelectItems includeLinear={false} /></SelectGroup></TooltipProvider></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Unmend the neighboring zoom edges" : "Mend the neighboring zoom edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>{middleSnapActive ? "Unmend" : "Mend"}</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
        {middleSnapActive ? <div className="grid gap-1.5"><span className={mutedCaps}>Mend handoff</span><div className="grid grid-cols-2 gap-2"><button className={middleTransitionButtonClass(middleTransitionMode === "instant")} aria-pressed={middleTransitionMode === "instant"} onClick={() => onChangeMiddleTransition("instant")}>Instant</button><button className={middleTransitionButtonClass(middleTransitionMode === "transition")} aria-pressed={middleTransitionMode === "transition"} onClick={() => onChangeMiddleTransition("transition")}>Transition</button></div><label className={`grid gap-1.5 ${mutedCaps}`}>Mend ease<Select value={marker.middleEase ?? "easeInOut"} onValueChange={updateMiddleEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><TooltipProvider delayDuration={1000} skipDelayDuration={0}><SelectGroup><EaseSelectItems includeLinear={false} /></SelectGroup></TooltipProvider></SelectContent></Select></label></div> : null}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}

export function TranslationInspector({ marker, part, selectedMarkerCount, selectedSnapInActive, selectedSnapOutActive, middleSnapActive, middleTransitionMode, pickingPosition, pickingTracker, canSnapMiddle, onChange, onChangeSelectedSnap, onChangeMiddleTransition, onChangeMiddleEase, onDelete, onPickPosition, onPickTracker, onSnapMiddle }: { marker: TranslationMarker; part: Part; selectedMarkerCount: number; selectedSnapInActive: boolean; selectedSnapOutActive: boolean; middleSnapActive: boolean; middleTransitionMode: "instant" | "transition"; pickingPosition: boolean; pickingTracker: boolean; canSnapMiddle: boolean; onChange: (updater: (marker: TranslationMarker, part: Part) => TranslationMarker) => void; onChangeSelectedSnap: (key: "snapIn" | "snapOut", enabled: boolean) => void; onChangeMiddleTransition: (mode: "instant" | "transition") => void; onChangeMiddleEase: (ease: MotionEase | undefined) => void; onDelete: () => void; onPickPosition: () => void; onPickTracker: () => void; onSnapMiddle: () => void }) {
  const isMultiSelection = selectedMarkerCount > 1;
  const markerKind = getMotionBlockEffectKind(marker);
  const effectId = marker.effectId ?? (markerKind === "rotate" ? "clipper.motion.rotate" : markerKind === "perspective" ? "clipper.motion.perspective" : "clipper.motion.pan");
  const defaultName = getMotionEffectPackage(effectId)?.label ?? "Motion";
  const snapInActive = isMultiSelection ? selectedSnapInActive : Boolean(marker.snapIn);
  const snapOutActive = isMultiSelection ? selectedSnapOutActive : Boolean(marker.snapOut);
  const positionDisabledReason = marker.followId ? "Pan position is controlled by the tracker." : undefined;

  function updateNumber(key: "start" | "duration", value: string) {
    const numeric = Number(value) || 0;
    onChange((current, currentPart) => {
      if (key === "start") return { ...current, start: roundTenth(clamp(numeric, 0, Math.max(currentPart.duration - current.duration, 0))) };
      return { ...current, duration: roundTenth(clamp(numeric, minimumZoomDuration, currentPart.duration - current.start)) };
    });
  }

  function updateName(value: string) {
    onChange((current) => ({ ...current, name: value.trim() || undefined }));
  }

  function updatePosition(key: keyof Point, value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => ({ ...current, position: { ...current.position, [key]: Math.round(numeric) } }));
  }

  function updateRotation(value: string) {
    onChange((current) => ({ ...current, rotation: Math.round(Number(value) || 0) }));
  }

  function updatePerspective(key: "z" | "rotateX" | "rotateY", value: string) {
    const numeric = Number(value) || 0;
    onChange((current) => {
      const perspective = { ...current.perspective, [key]: Math.round(numeric) };
      return { ...current, perspective, params: { ...current.params, perspective } };
    });
  }

  function updateFollowId(value: string) {
    const followId = value.trim();
    onChange((current) => ({ ...current, followId: followId || undefined }));
  }

  function updateEase(value: string) {
    onChange((current) => ({ ...current, ease: value === defaultMotionEaseSelectValue ? undefined : value as MotionEase }));
  }

  function updateMiddleEase(value: string) {
    onChangeMiddleEase(value === defaultMotionEaseSelectValue ? undefined : value as MotionEase);
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
      <label className={`grid gap-1.5 ${mutedCaps}`}>Name<Input value={marker.name ?? ""} placeholder={defaultName} disabled={isMultiSelection} title={isMultiSelection ? "Rename one selected marker at a time." : undefined} onChange={(event) => updateName(event.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={`grid gap-1.5 ${mutedCaps}`}>Start<Input type="number" min={0} max={part.duration - marker.duration} resetValue={0} step={0.1} value={marker.start} onChange={(event) => updateNumber("start", event.target.value)} /></label>
        <label className={`grid gap-1.5 ${mutedCaps}`}>Duration<Input type="number" min={minimumZoomDuration} max={part.duration - marker.start} resetValue={1} step={0.1} value={marker.duration} onChange={(event) => updateNumber("duration", event.target.value)} /></label>
        {markerKind === "rotate" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Rotation<Input type="number" resetValue={15} step={1} value={marker.rotation ?? 0} onChange={(event) => updateRotation(event.target.value)} /></label> : markerKind === "perspective" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Z<Input type="number" numberScrubMode="continuous" numberScrubCommitThrottleMs={16} resetValue={0} step={1} value={marker.perspective?.z ?? 0} onChange={(event) => updatePerspective("z", event.target.value)} /></label> : <label className={`grid gap-1.5 ${mutedCaps} ${positionDisabledReason ? "opacity-50" : ""}`} title={positionDisabledReason}>X<Input type="number" resetValue={0} step={1} value={marker.position.x} disabled={Boolean(positionDisabledReason)} onChange={(event) => updatePosition("x", event.target.value)} /></label>}
        {markerKind === "rotate" ? null : markerKind === "perspective" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Tilt X<Input type="number" numberScrubMode="continuous" numberScrubCommitThrottleMs={16} resetValue={8} step={1} value={marker.perspective?.rotateX ?? 0} onChange={(event) => updatePerspective("rotateX", event.target.value)} /></label> : <div className={`grid gap-1.5 ${positionDisabledReason ? "opacity-50" : ""}`} title={positionDisabledReason}>
          <span className={mutedCaps}>Y</span>
          <div className="grid grid-cols-[1fr_40px] gap-2">
            <Input type="number" resetValue={0} step={1} value={marker.position.y} disabled={Boolean(positionDisabledReason)} onChange={(event) => updatePosition("y", event.target.value)} />
            <button className={`grid place-items-center rounded-[9px] border px-2 ${positionDisabledReason ? "cursor-not-allowed border-[#2d313b] bg-[#171920] text-[#6f7480]" : pickingPosition ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} disabled={Boolean(positionDisabledReason)} title={positionDisabledReason ?? "Pick pan target from frame"} onClick={onPickPosition}><Crosshair size={16} /></button>
          </div>
        </div>}
      </div>
      {markerKind === "perspective" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Tilt Y<Input type="number" numberScrubMode="continuous" numberScrubCommitThrottleMs={16} resetValue={0} step={1} value={marker.perspective?.rotateY ?? 0} onChange={(event) => updatePerspective("rotateY", event.target.value)} /></label> : null}
      {markerKind !== "rotate" && markerKind !== "perspective" ? <label className={`grid gap-1.5 ${mutedCaps}`}>Tracker<div className="grid grid-cols-[1fr_40px] gap-2"><Input value={marker.followId ?? ""} placeholder="object-id" onChange={(event) => updateFollowId(event.target.value)} /><button className={`grid place-items-center rounded-[9px] border px-2 ${pickingTracker ? "border-[#37d6c2] bg-[#12312d] text-white" : "border-[#2d313b] bg-[#171920] text-[#d9dbe1] hover:border-[#37d6c2]"}`} title="Pick tracker target from frame" type="button" onClick={onPickTracker}><Crosshair size={16} /></button></div></label> : null}
      <label className={`grid gap-1.5 ${mutedCaps}`}>Ease<Select value={motionEaseSelectValue(marker.ease)} onValueChange={updateEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><TooltipProvider delayDuration={1000} skipDelayDuration={0}><SelectGroup><EaseSelectItems defaultInOut /></SelectGroup></TooltipProvider></SelectContent></Select></label>
      <div className="grid gap-2">
        <span className={mutedCaps}>Snap</span>
        <div className="grid grid-cols-3 gap-2">
          <button className={snapButtonClass(snapInActive)} aria-pressed={snapInActive} onClick={() => updateSnap("snapIn", !snapInActive)}>In</button>
          <button className={snapButtonClass(middleSnapActive, canSnapMiddle)} disabled={!canSnapMiddle} title={middleSnapActive ? "Unmend the neighboring pan edges" : "Mend the neighboring pan edges"} aria-pressed={middleSnapActive} onClick={onSnapMiddle}>{middleSnapActive ? "Unmend" : "Mend"}</button>
          <button className={snapButtonClass(snapOutActive)} aria-pressed={snapOutActive} onClick={() => updateSnap("snapOut", !snapOutActive)}>Out</button>
        </div>
        {middleSnapActive ? <div className="grid gap-1.5"><span className={mutedCaps}>Mend handoff</span><div className="grid grid-cols-2 gap-2"><button className={middleTransitionButtonClass(middleTransitionMode === "instant")} aria-pressed={middleTransitionMode === "instant"} onClick={() => onChangeMiddleTransition("instant")}>Instant</button><button className={middleTransitionButtonClass(middleTransitionMode === "transition")} aria-pressed={middleTransitionMode === "transition"} onClick={() => onChangeMiddleTransition("transition")}>Transition</button></div><label className={`grid gap-1.5 ${mutedCaps}`}>Mend ease<Select value={motionEaseSelectValue(marker.middleEase)} onValueChange={updateMiddleEase}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><TooltipProvider delayDuration={1000} skipDelayDuration={0}><SelectGroup><EaseSelectItems defaultInOut /></SelectGroup></TooltipProvider></SelectContent></Select></label></div> : null}
      </div>
      <button className="flex items-center justify-center gap-2 rounded-[10px] border border-[#3b2a2a] bg-[#231516] px-[13px] py-[9px] text-sm font-medium text-[#ffb4b4] transition hover:border-[#6b3838] hover:bg-[#301b1d]" onClick={onDelete}><Trash2 size={15} />Delete</button>
    </div>
  );
}
