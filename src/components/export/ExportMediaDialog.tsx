import { useRef, useState } from "react";
import { appBarButtonBase, mutedCaps } from "../../app/config";
import type { ExportDialogTab, MediaExportFormat, ProjectExportFormat, VideoExportProgress } from "../../app/types";
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

const MEDIA_FORMAT_OPTIONS: { label: string; value: MediaExportFormat }[] = [
  { label: "MOV ProRes 422 HQ", value: "prores-422-hq" },
  { label: "MOV ProRes 4444", value: "prores-4444" },
  { label: "MOV DNxHR HQX", value: "dnxhr-hqx" },
  { label: "MOV Uncompressed BGRA", value: "mov" },
  { label: "MP4 H.264 High Quality", value: "h264-high" },
  { label: "MP4 (H.264)", value: "mp4" },
  { label: "WebM (VP9)", value: "webm" },
];

export function ExportMediaDialog({ activeTab, durationSeconds, exportFrameRate, exportResolution, exporting, includeSources, mediaExportFormat, open, partCount, progress, projectFormat, projectName, resolution, reusePrerenderCache, sceneName, onExportFrameRateChange, onExportResolutionChange, onIncludeSourcesChange, onMediaExport, onMediaExportFormatChange, onOpenChange, onProjectExport, onProjectFormatChange, onReusePrerenderCacheChange, onTabChange }: { activeTab: ExportDialogTab; durationSeconds: number; exportFrameRate: number; exportResolution: { width: number; height: number }; exporting: boolean; includeSources: boolean; mediaExportFormat: MediaExportFormat; open: boolean; partCount: number; progress: string | null; projectFormat: ProjectExportFormat; projectName: string; resolution: ProjectManifest["resolution"]; reusePrerenderCache: boolean; sceneName: string; onExportFrameRateChange: (fps: number) => void; onExportResolutionChange: (res: { width: number; height: number }) => void; onIncludeSourcesChange: (includeSources: boolean) => void; onMediaExport: () => void; onMediaExportFormatChange: (format: MediaExportFormat) => void; onOpenChange: (open: boolean) => void; onProjectExport: () => void; onProjectFormatChange: (format: ProjectExportFormat) => void; onReusePrerenderCacheChange: (reuse: boolean) => void; onTabChange: (tab: ExportDialogTab) => void }) {
  const tabButtonClass = (tab: ExportDialogTab) => `rounded-[8px] px-3 py-1.5 text-xs font-extrabold transition ${activeTab === tab ? "bg-[#202b37] text-white shadow-[inset_0_0_0_1px_#2d4052]" : "text-[#9b9da7] hover:bg-[#20232c] hover:text-white"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
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
              <ExportStatDropdown popoverMinWidth="240px" label="Export format" value={MEDIA_FORMAT_OPTIONS.find((o) => o.value === mediaExportFormat)?.label ?? "MOV ProRes 422 HQ"} options={MEDIA_FORMAT_OPTIONS} selectedValue={mediaExportFormat} onChange={(value) => onMediaExportFormatChange(value as MediaExportFormat)} />
            ) : (
              <ExportStat label="Export format" value={formatProjectExportLabel(projectFormat)} />
            )}
          </div>

          {activeTab === "media" ? (
            <p className="text-[11px] font-semibold text-[#8e929d]">The composition renders at its native coordinate space; the selected export resolution scales the final video output dimensions.</p>
          ) : null}

          {activeTab === "media" ? (
            <div>
              <label className="flex w-fit items-center gap-2 text-xs font-semibold text-[#aeb3bf]">
                <Checkbox checked={reusePrerenderCache} onCheckedChange={(checked) => onReusePrerenderCacheChange(checked === true)} />
                <span>Use cached frames</span>
              </label>
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

function ExportStatDropdown({ label, value, options, selectedValue, onChange, popoverMinWidth = "200px" }: { label: string; value: string; options: { label: string; value: string }[]; selectedValue: string; onChange: (value: string) => void; popoverMinWidth?: string }) {
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 min-w-[var(--stat-popover-min-w)] max-w-[calc(100vw-2rem)] rounded-lg border border-[#2d313b] bg-[#15171e] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.45)]" style={{ "--stat-popover-min-w": popoverMinWidth } as React.CSSProperties}>
            {options.map((opt) => (
              <button
                key={opt.value}
                className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs font-bold whitespace-nowrap transition ${opt.value === selectedValue ? "text-[var(--clipper-accent-strong)]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-white"}`}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                <span className="flex-1">{opt.label}</span>
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
