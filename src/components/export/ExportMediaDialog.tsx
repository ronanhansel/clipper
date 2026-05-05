import { useRef, useState } from "react";
import { appBarButtonBase, mutedCaps } from "../../app/config";
import type { ExportDialogTab, ExportRenderQuality, MediaExportFormat, ProjectExportFormat, VideoExportProgress } from "../../app/types";
import { clamp } from "../../core/math";
import { formatTime } from "../../core/timeline";
import type { ProjectManifest } from "../../core/types";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

const RESOLUTION_OPTIONS: { label: string; width: number; height: number }[] = [
  { label: "1920 × 1080 (HD)", width: 1920, height: 1080 },
  { label: "2560 × 1440 (QHD)", width: 2560, height: 1440 },
  { label: "3840 × 2160 (4K)", width: 3840, height: 2160 },
];

const FRAME_RATE_OPTIONS = [24, 30, 60] as const;

const BASELINE_HD30_PIXELS_PER_SECOND = 1920 * 1080 * 30;
const RENDER_QUALITY_OPTIONS: { label: string; value: ExportRenderQuality; scale: number }[] = [
  { label: "Standard", value: "standard", scale: 1 },
  { label: "High", value: "high", scale: 2 },
  { label: "Ultra", value: "ultra", scale: 3 },
];

export function ExportMediaDialog({ activeTab, durationSeconds, exportFrameRate, exportRenderQuality, exportResolution, exporting, includeSources, mediaExportFormat, open, partCount, progress, projectFormat, projectName, resolution, sceneName, onExportFrameRateChange, onExportRenderQualityChange, onExportResolutionChange, onIncludeSourcesChange, onMediaExport, onMediaExportFormatChange, onOpenChange, onProjectExport, onProjectFormatChange, onTabChange }: { activeTab: ExportDialogTab; durationSeconds: number; exportFrameRate: number; exportRenderQuality: ExportRenderQuality; exportResolution: { width: number; height: number }; exporting: boolean; includeSources: boolean; mediaExportFormat: MediaExportFormat; open: boolean; partCount: number; progress: string | null; projectFormat: ProjectExportFormat; projectName: string; resolution: ProjectManifest["resolution"]; sceneName: string; onExportFrameRateChange: (fps: number) => void; onExportRenderQualityChange: (quality: ExportRenderQuality) => void; onExportResolutionChange: (res: { width: number; height: number }) => void; onIncludeSourcesChange: (includeSources: boolean) => void; onMediaExport: () => void; onMediaExportFormatChange: (format: MediaExportFormat) => void; onOpenChange: (open: boolean) => void; onProjectExport: () => void; onProjectFormatChange: (format: ProjectExportFormat) => void; onTabChange: (tab: ExportDialogTab) => void }) {
  const tabButtonClass = (tab: ExportDialogTab) => `rounded-[8px] px-3 py-1.5 text-xs font-extrabold transition ${activeTab === tab ? "bg-[#202b37] text-white shadow-[inset_0_0_0_1px_#2d4052]" : "text-[#9b9da7] hover:bg-[#20232c] hover:text-white"}`;
  const mediaFormatOptions = buildMediaFormatOptions(exportResolution, exportFrameRate);
  const renderQualityOptions = buildRenderQualityOptions(exportResolution);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Render a video or export editable project data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-1 rounded-[10px] border border-[#2d313b] bg-[#15171e] p-1">
            <button className={tabButtonClass("media")} onClick={() => onTabChange("media")}>Render video</button>
            <button className={tabButtonClass("project")} onClick={() => onTabChange("project")}>Export project</button>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2d313b] bg-[#171920] p-3">
            <ExportStat label="Project" value={projectName} />
            <ExportStat label="Scene" value={sceneName} />
            <ExportStat label="Duration" value={formatTime(durationSeconds)} />
            {activeTab === "media" ? (
              <ExportStatDropdown label="Resolution" value={`${exportResolution.width} × ${exportResolution.height}`} options={buildResolutionOptions(exportResolution, resolution)} selectedValue={formatResolutionKey(exportResolution)} onChange={(value) => { const [w, h] = value.split("x").map(Number); onExportResolutionChange({ width: w, height: h }); }} />
            ) : (
              <ExportStat label="Resolution" value={`${resolution.width} × ${resolution.height}`} />
            )}
            {activeTab === "media" ? (
              <ExportStatDropdown popoverMinWidth="130px" label="Frame rate" value={`${exportFrameRate} fps`} options={FRAME_RATE_OPTIONS.map((f) => ({ label: `${f} fps`, value: String(f) }))} selectedValue={String(exportFrameRate)} onChange={(value) => onExportFrameRateChange(Number(value))} />
            ) : (
              <ExportStat label="Compositions" value={`${partCount}`} />
            )}
            {activeTab === "media" ? (
              <ExportStatDropdown popoverMinWidth="260px" label="Export format" value={mediaFormatOptions.find((o) => o.value === mediaExportFormat)?.label ?? "MOV ProRes 422 HQ"} options={mediaFormatOptions} selectedValue={mediaExportFormat} onChange={(value) => onMediaExportFormatChange(value as MediaExportFormat)} />
            ) : (
              <ExportStat label="Export format" value={formatProjectExportLabel(projectFormat)} />
            )}
            {activeTab === "media" ? (
              <ExportStatDropdown popoverMinWidth="260px" label="Render quality" value={renderQualityOptions.find((o) => o.value === exportRenderQuality)?.label ?? "High"} options={renderQualityOptions} selectedValue={exportRenderQuality} onChange={(value) => onExportRenderQualityChange(value as ExportRenderQuality)} />
            ) : null}
          </div>

          {activeTab === "media" ? (
            <div>
              {progress ? <span className="rounded-lg bg-[#10131a] px-3 py-2 text-xs font-bold text-[var(--clipper-accent-strong)]">{progress}</span> : null}
            </div>
          ) : (
            <>
              <label className="grid gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="export-format">
                Format
                <Select value={projectFormat} onValueChange={(value) => onProjectFormatChange(value as ProjectExportFormat)}>
                  <SelectTrigger id="export-format" className="h-9">
                    <SelectValue placeholder="Choose export format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="project-package">Clipper project package (.project.json)</SelectItem>
                      <SelectItem value="scene-json">Scene JSON only (.scene.json)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-sm text-[#dfe2ea]">
                <Checkbox checked={projectFormat === "project-package" && includeSources} disabled={projectFormat === "scene-json"} onCheckedChange={(checked) => onIncludeSourcesChange(checked === true)} />
                <span className="grid gap-1 leading-5">
                  <span className="font-bold text-white">Include TypeScript part sources</span>
                  <span className="text-xs text-[#9b9da7]">Embeds source text for each composition part so exports can be audited or regenerated later.</span>
                </span>
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <button className={`${appBarButtonBase} w-[96px] px-3 py-2 text-sm`} disabled={exporting} onClick={() => onOpenChange(false)}>Cancel</button>
          <button className="inline-flex w-[112px] items-center justify-center rounded-[9px] border border-[var(--clipper-accent)] bg-[var(--clipper-accent)] px-3 py-2 text-sm font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60" disabled={exporting} onClick={activeTab === "media" ? onMediaExport : onProjectExport}>
            {exporting ? "Working" : activeTab === "media" ? "Render" : "Export"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportStat({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-[#1c1f28]/70 p-2">
      <span className={mutedCaps}>{label}</span>
      <strong className={`mt-1 block truncate text-sm ${warning ? "text-[#ffbf66]" : "text-[#c8cdd6]"}`}>{value}</strong>
    </div>
  );
}

type DropdownOption<T extends string = string> = { label: string; value: T; description?: string };

function ExportStatDropdown({ label, value, options, selectedValue, onChange, popoverMinWidth = "200px" }: { label: string; value: string; options: DropdownOption[]; selectedValue: string; onChange: (value: string) => void; popoverMinWidth?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        className="min-w-0 w-full rounded-lg bg-[#12141a] p-2 text-left transition hover:bg-[#1a1d27] cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className={mutedCaps}>{label}</span>
        <strong className="mt-1 block truncate text-sm text-white">{value}</strong>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-[91] mt-1 max-h-[min(320px,calc(100vh-160px))] min-w-[var(--stat-popover-min-w)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-[#2d313b] bg-[#15171e] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.45)]" style={{ "--stat-popover-min-w": popoverMinWidth } as React.CSSProperties}>
            {options.map((opt) => (
              <button
                key={opt.value}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${opt.value === selectedValue ? "text-[var(--clipper-accent-strong)]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-white"}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="whitespace-nowrap">{opt.label}</span>
                  {opt.description ? <span className="whitespace-nowrap text-[10px] font-semibold text-[#8e929d]">{opt.description}</span> : null}
                </span>
                {opt.value === selectedValue ? <span className="text-[var(--clipper-accent-strong)]">✓</span> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function buildResolutionOptions(current: { width: number; height: number }, project: ProjectManifest["resolution"]): { label: string; value: string }[] {
  const projectKey = formatResolutionKey(project);
  const seen = new Set<string>();
  const result: { label: string; value: string }[] = [];

  const add = (label: string, r: { width: number; height: number }) => {
    const key = formatResolutionKey(r);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ label, value: key });
  };

  // Fixed order: project resolution first, then presets (1080p, 1440p, 4K).
  add(`${project.width} × ${project.height} (Project)`, project);

  for (const opt of RESOLUTION_OPTIONS) {
    const key = formatResolutionKey(opt);
    if (seen.has(key)) continue;
    add(opt.label, opt);
  }

  return result;
}

function formatResolutionKey(r: { width: number; height: number }) {
  return `${r.width}x${r.height}`;
}

function buildRenderQualityOptions(resolution: { width: number; height: number }): DropdownOption<ExportRenderQuality>[] {
  return RENDER_QUALITY_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
    description: `${option.scale}× supersample, internal ${Math.round(resolution.width * option.scale)} × ${Math.round(resolution.height * option.scale)}`,
  }));
}

function buildMediaFormatOptions(resolution: { width: number; height: number }, frameRate: number): DropdownOption<MediaExportFormat>[] {
  const scale = (resolution.width * resolution.height * frameRate) / BASELINE_HD30_PIXELS_PER_SECOND;
  return [
    { label: "MOV ProRes 422 HQ", value: "prores-422-hq", description: formatEstimatedDataRate(27.5 * scale) },
    { label: "MOV ProRes 4444", value: "prores-4444", description: formatEstimatedDataRate(41.25 * scale) },
    { label: "MOV DNxHR HQX", value: "dnxhr-hqx", description: formatEstimatedDataRate(27.5 * scale) },
    { label: "MOV Uncompressed BGRA", value: "mov", description: formatEstimatedDataRate((resolution.width * resolution.height * 4 * frameRate) / 1_000_000) },
    { label: "MP4 H.264 High Quality", value: "h264-high", description: "CRF 12, variable MB/s" },
    { label: "MP4 (H.264)", value: "mp4", description: formatEstimatedDataRate(1.5) },
    { label: "WebM (VP9)", value: "webm", description: "CRF 30, variable MB/s" },
  ];
}

function formatEstimatedDataRate(mbPerSecond: number) {
  const mbPerMinute = mbPerSecond * 60;
  return `~${formatDataAmount(mbPerSecond)}/s, ${formatDataAmount(mbPerMinute)}/min`;
}

function formatDataAmount(mb: number) {
  if (mb >= 1000) return `${formatCompactNumber(mb / 1000)} GB`;
  return `${formatCompactNumber(mb)} MB`;
}

function formatCompactNumber(value: number) {
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatProjectExportLabel(format: ProjectExportFormat) {
  return format === "scene-json" ? "Scene JSON" : "Project package";
}

export function VideoExportOverlay({ cancelling, progress, onCancel }: { cancelling: boolean; progress: VideoExportProgress; onCancel: () => void }) {
  const percent = clamp(progress.percent, 0, 100);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#050609]/95 backdrop-blur-[3px] animate-[clipper-export-fade-in_180ms_ease-out_both]">
      <div className="grid w-[min(300px,calc(100vw-48px))] justify-items-center gap-3 text-center">
        <div className="grid w-full gap-2.5">
          <h2 className="m-0 text-[17px] font-extrabold text-white">Exporting video • {percent}%</h2>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#242936]">
            <div className="h-full rounded-full bg-white transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs font-semibold text-[#8e929d]">{cancelling ? "Stopping export..." : progress.status}</span>
        </div>
        <button className="mt-5 rounded-[8px] border border-[#20242d] bg-[#0c0e13] px-4 py-2 text-xs font-semibold text-white transition hover:border-[#343a47] hover:bg-[#11141b] disabled:cursor-not-allowed disabled:opacity-55" disabled={cancelling} onClick={onCancel}>
          {cancelling ? "Stopping" : "Stop export"}
        </button>
      </div>
    </div>
  );
}
