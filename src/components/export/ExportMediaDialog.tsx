import { appBarButtonBase, mutedCaps, videoExportFrameRate } from "../../app/config";
import type { ExportDialogTab, ProjectExportFormat, VideoExportProgress } from "../../app/types";
import { clamp } from "../../core/math";
import { formatTime } from "../../core/timeline";
import type { ProjectManifest } from "../../core/types";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function ExportMediaDialog({ activeTab, durationSeconds, exporting, includeSources, open, partCount, progress, projectFormat, projectName, resolution, sceneName, validationErrorCount, onIncludeSourcesChange, onMediaExport, onOpenChange, onProjectExport, onProjectFormatChange, onTabChange }: { activeTab: ExportDialogTab; durationSeconds: number; exporting: boolean; includeSources: boolean; open: boolean; partCount: number; progress: string | null; projectFormat: ProjectExportFormat; projectName: string; resolution: ProjectManifest["resolution"]; sceneName: string; validationErrorCount: number; onIncludeSourcesChange: (includeSources: boolean) => void; onMediaExport: () => void; onOpenChange: (open: boolean) => void; onProjectExport: () => void; onProjectFormatChange: (format: ProjectExportFormat) => void; onTabChange: (tab: ExportDialogTab) => void }) {
  const tabButtonClass = (tab: ExportDialogTab) => `rounded-[8px] px-3 py-1.5 text-xs font-extrabold transition ${activeTab === tab ? "bg-[#202b37] text-white shadow-[inset_0_0_0_1px_#2d4052]" : "text-[#9b9da7] hover:bg-[#20232c] hover:text-white"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Render an MP4 video or export editable project data.
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
            <ExportStat label="Resolution" value={`${resolution.width} x ${resolution.height}`} />
            <ExportStat label={activeTab === "media" ? "Frame rate" : "Compositions"} value={activeTab === "media" ? `${videoExportFrameRate} fps` : `${partCount}`} />
            <ExportStat label="Validation" value={validationErrorCount === 0 ? "Ready" : `${validationErrorCount} issue${validationErrorCount === 1 ? "" : "s"}`} warning={validationErrorCount > 0} />
          </div>

          {activeTab === "media" ? (
            <div className="grid gap-3 rounded-xl border border-[#2d313b] bg-[#171920] p-3 text-sm text-[#dfe2ea]">
              <strong className="text-white">Rendered MP4 video</strong>
              <span className="text-xs leading-5 text-[#9b9da7]">Renders the full scene at 1920 x 1080 using the project timeline, motion, zoom, and pan markers. Export uses bundled ffmpeg so the MP4 works out of the box.</span>
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
    <div className="min-w-0 rounded-lg bg-[#12141a] p-2">
      <span className={mutedCaps}>{label}</span>
      <strong className={`mt-1 block truncate text-sm ${warning ? "text-[#ffbf66]" : "text-white"}`}>{value}</strong>
    </div>
  );
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
