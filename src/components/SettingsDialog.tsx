import { RotateCcw } from "lucide-react";
import { appBarButtonBase, defaultExportTileMapping, defaultExportWorkerMapping, defaultLiveDomPostProcessMaxFps, defaultNewMarkerDurationSeconds, defaultPausePlaybackOnScrub, defaultPrerenderBlockDurationMs, defaultPreviewRenderHeight, defaultScrubCommitThrottleMs, defaultStableSlowGridPreset, defaultStableSlowValidationSamples, defaultTimelineEndPaddingFraction, defaultTimelinePrecision, defaultVideoExportTileHeight, maxExportTileCount, maxExportWorkerCount, maxLiveDomPostProcessMaxFps, maxPrerenderBlockDurationMs, maxStableSlowValidationSamples, maxVideoExportTileHeight, minExportTileCount, minExportWorkerCount, minLiveDomPostProcessMaxFps, minPrerenderBlockDurationMs, minStableSlowValidationSamples, minVideoExportTileHeight, previewRenderHeightOptions } from "../app/config";
import type { AppUpdateStatus, ExportTileResolutionMapping, ExportWorkerConfigurationMode, ExportWorkerResolutionMapping, SettingsSection, StableSlowGridPreset, StableSlowValidationSamples } from "../app/types";
import { clamp } from "../core/math";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";

const previewRenderResolutionLabels = new Map(previewRenderHeightOptions.map((height) => [height, `${Math.round(height * 16 / 9)}x${height}`]));
const stableSlowGridPresetDescriptions: Record<StableSlowGridPreset, string> = {
  relaxed: "Tile sizes tried in order after failures; full means full-width strips: fullx540 -> fullx360 -> fullx270 -> fullx180 -> 3840x180 -> 2560x135 -> 2048x90.",
  balanced: "Tile sizes tried in order after failures; starts full-width then narrows: fullx270 -> fullx180 -> 2560x180 -> 2048x135 -> 1536x90 -> 1024x54 -> 768x36.",
  safe: "Tile sizes tried in order after failures; grid-first for heavy exports: 2048x135 -> 1536x90 -> 1024x54 -> 768x36 -> 512x24 -> 384x16. Default.",
  extreme: "Tile sizes tried in order after failures; smallest grids for low-memory exports: 1024x54 -> 768x36 -> 512x24 -> 384x16 -> 256x12.",
};

type SettingsDialogProps = {
  activeSection: SettingsSection;
  autoDownloadUpdates: boolean;
  debugSettingsEnabled: boolean;
  exportTileMapping: ExportTileResolutionMapping;
  exportWorkerConfigurationMode: ExportWorkerConfigurationMode;
  exportWorkerMapping: ExportWorkerResolutionMapping;
  stableSlowGridPreset: StableSlowGridPreset;
  stableSlowValidationSamples: StableSlowValidationSamples;
  liveDomPostProcessPreviewEnabled: boolean;
  liveDomPostProcessRuntimeEnabled: boolean;
  liveDomPostProcessMaxFps: number;
  open: boolean;
  pausePlaybackOnScrub: boolean;
  prerenderCacheBlackMissDebug: boolean;
  prerenderCacheEnabled: boolean;
  prerenderBlockDurationMs: number;
  previewRenderHeight: number;
  scrubCommitThrottleMs: number;
  defaultNewMarkerDurationSeconds: number;
  timelineEndPaddingFraction: number;
  timelinePrecision: number;
  updateStatus: AppUpdateStatus;
  videoExportTileHeight: number;
  onActiveSectionChange: (section: SettingsSection) => void;
  onAutoDownloadUpdatesChange: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onDebugSettingsEnabledChange: (enabled: boolean) => void;
  onExportTileMappingChange: (mapping: ExportTileResolutionMapping) => void;
  onExportWorkerConfigurationModeChange: (mode: ExportWorkerConfigurationMode) => void;
  onExportWorkerMappingChange: (mapping: ExportWorkerResolutionMapping) => void;
  onStableSlowGridPresetChange: (preset: StableSlowGridPreset) => void;
  onStableSlowValidationSamplesChange: (samples: StableSlowValidationSamples) => void;
  onInstallUpdate: () => void;
  onLiveDomPostProcessPreviewEnabledChange: (enabled: boolean) => void;
  onLiveDomPostProcessMaxFpsChange: (value: number) => void;
  onOpenChange: (open: boolean) => void;
  onPausePlaybackOnScrubChange: (enabled: boolean) => void;
  onPrerenderCacheBlackMissDebugChange: (enabled: boolean) => void;
  onPrerenderCacheEnabledChange: (enabled: boolean) => void;
  onPrerenderBlockDurationMsChange: (value: number) => void;
  onPreviewRenderHeightChange: (value: number) => void;
  onClearAllPrerenderCaches: () => void;
  onScrubCommitThrottleMsChange: (value: number) => void;
  onDefaultNewMarkerDurationSecondsChange: (value: number) => void;
  onTimelineEndPaddingFractionChange: (value: number) => void;
  onTimelinePrecisionChange: (value: number) => void;
  onVideoExportTileHeightChange: (value: number) => void;
};

export function SettingsDialog({ activeSection, autoDownloadUpdates, debugSettingsEnabled, exportTileMapping, exportWorkerConfigurationMode, exportWorkerMapping, stableSlowGridPreset, stableSlowValidationSamples, liveDomPostProcessPreviewEnabled, liveDomPostProcessRuntimeEnabled, liveDomPostProcessMaxFps, open, pausePlaybackOnScrub, prerenderCacheBlackMissDebug, prerenderCacheEnabled, prerenderBlockDurationMs, previewRenderHeight, scrubCommitThrottleMs, defaultNewMarkerDurationSeconds: markerDurationSeconds, timelineEndPaddingFraction, timelinePrecision, updateStatus, videoExportTileHeight, onActiveSectionChange, onAutoDownloadUpdatesChange, onCheckForUpdates, onDownloadUpdate, onDebugSettingsEnabledChange, onExportTileMappingChange, onExportWorkerConfigurationModeChange, onExportWorkerMappingChange, onStableSlowGridPresetChange, onStableSlowValidationSamplesChange, onInstallUpdate, onLiveDomPostProcessPreviewEnabledChange, onLiveDomPostProcessMaxFpsChange, onOpenChange, onPausePlaybackOnScrubChange, onPrerenderCacheBlackMissDebugChange, onPrerenderCacheEnabledChange, onPrerenderBlockDurationMsChange, onPreviewRenderHeightChange, onClearAllPrerenderCaches, onScrubCommitThrottleMsChange, onDefaultNewMarkerDurationSecondsChange, onTimelineEndPaddingFractionChange, onTimelinePrecisionChange, onVideoExportTileHeightChange }: SettingsDialogProps) {
  const navItems: Array<{ id: SettingsSection; label: string }> = [
    { id: "general", label: "General" },
    { id: "playback", label: "Playback" },
    { id: "timeline", label: "Timeline" },
    { id: "export", label: "Export" },
    { id: "advanced", label: "Advanced" },
  ];

  function updateScrubCommitThrottle(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onScrubCommitThrottleMsChange(Math.round(clamp(parsed, 16, 500)));
  }

  function updateMarkerDuration(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onDefaultNewMarkerDurationSecondsChange(Math.round(clamp(parsed, 0.1, 60) * 10) / 10);
  }

  function updateTimelineEndPaddingFraction(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onTimelineEndPaddingFractionChange(Math.round(clamp(parsed, 0, 2) * 100) / 100);
  }

  function updateTimelinePrecision(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onTimelinePrecisionChange(Math.round(clamp(parsed, 1, 6)));
  }

  function updateLiveDomPostProcessMaxFps(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onLiveDomPostProcessMaxFpsChange(Math.round(clamp(parsed, minLiveDomPostProcessMaxFps, maxLiveDomPostProcessMaxFps)));
  }

  function updateVideoExportTileHeight(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onVideoExportTileHeightChange(Math.round(clamp(parsed, minVideoExportTileHeight, maxVideoExportTileHeight)));
  }

  function updateStableSlowValidationSamples(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onStableSlowValidationSamplesChange(Math.round(clamp(parsed, minStableSlowValidationSamples, maxStableSlowValidationSamples)) as StableSlowValidationSamples);
  }

  function updateExportWorkerCount(key: keyof ExportWorkerResolutionMapping, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onExportWorkerMappingChange({ ...exportWorkerMapping, [key]: Math.round(clamp(parsed, minExportWorkerCount, maxExportWorkerCount)) });
  }

  function updateUnifiedExportWorkerCount(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const workerCount = Math.round(clamp(parsed, minExportWorkerCount, maxExportWorkerCount));
    onExportWorkerMappingChange({ hd: workerCount, qhd: workerCount, uhd: workerCount });
  }

  function updateExportTileCount(key: keyof ExportTileResolutionMapping, value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onExportTileMappingChange({ ...exportTileMapping, [key]: Math.round(clamp(parsed, minExportTileCount, maxExportTileCount)) });
  }

  function updatePrerenderBlockDuration(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onPrerenderBlockDurationMsChange(Math.round(clamp(parsed, minPrerenderBlockDurationMs, maxPrerenderBlockDurationMs)));
  }

  const updateActionLabel = updateStatus.kind === "downloaded" ? "Install and restart" : "Download";
  const updateActionEnabled = updateStatus.kind === "available" || updateStatus.kind === "downloaded";
  const runUpdateAction = updateStatus.kind === "downloaded" ? onInstallUpdate : onDownloadUpdate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(680px,calc(100vh-56px))] w-[min(980px,calc(100vw-42px))] gap-0 overflow-hidden p-0" showCloseButton={false}>
        <div className="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)] bg-[#101116]">
          <aside className="border-r border-[#2d313b] bg-[#15171e] p-3">
            <nav className="grid gap-1" aria-label="Settings sections">
              {navItems.map((item) => (
                <button key={item.id} className={`rounded-[9px] px-3 py-2.5 text-left text-xs font-extrabold transition ${activeSection === item.id ? "bg-[#0f1117] text-white" : "text-[#9297a3] hover:bg-[#1e222c] hover:text-[#dfe2ea]"}`} onClick={() => onActiveSectionChange(item.id)}>
                  <span className="text-xs font-extrabold">{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="grid min-h-0 grid-rows-[58px_minmax(0,1fr)_58px] bg-[#202229]">
            <header className="flex items-center justify-between border-b border-[#14161c] px-5">
              <div>
                <h2 className="text-sm font-extrabold text-white">{navItems.find((item) => item.id === activeSection)?.label}</h2>
                <p className="mt-1 text-xs text-[#8f939d]">{activeSection === "general" ? "Manage app-wide behavior and updates." : activeSection === "playback" ? "Control preview and playback diagnostics." : activeSection === "timeline" ? "Tune timeline interaction responsiveness." : activeSection === "export" ? "Tune video rendering and capture behavior." : "Configure experimental and developer-facing editor behavior."}</p>
              </div>
              <button className={`${appBarButtonBase} px-3 py-1.5`} onClick={() => onOpenChange(false)}>Close</button>
            </header>

            <div className="settings-scrollbar min-h-0 overflow-y-auto overflow-x-hidden p-5 [scrollbar-gutter:stable]">
              {activeSection === "general" ? (
                <div className="grid gap-4 rounded-xl border border-[#363b47] bg-[#1b1e26] p-4">
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Automatic updates</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Clipper can check GitHub releases in packaged builds and download available updates automatically.</p>
                  </div>
                  <label className="flex w-full items-start justify-between gap-5 text-xs font-bold text-[#dfe2ea]" htmlFor="auto-download-updates-toggle">
                    <span className="grid gap-1">
                      <span>Download updates automatically</span>
                      <span className="font-medium leading-5 text-[#8f939d]">When enabled, available updates download after a successful check. You can still install after download when ready.</span>
                    </span>
                    <Switch id="auto-download-updates-toggle" className="mt-0.5" checked={autoDownloadUpdates} onCheckedChange={onAutoDownloadUpdatesChange} />
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="flex w-full items-start justify-between gap-5">
                    <span className="grid gap-1 text-xs">
                      <strong className="text-sm text-white">Update status</strong>
                      <span className="font-medium leading-5 text-[#8f939d]">{updateStatus.message}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button className="rounded-[8px] border border-[#5b6270] bg-transparent px-3 py-2 text-xs font-extrabold text-[#f7f7f8] transition hover:border-[#dfe2ea] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={updateStatus.kind === "checking" || updateStatus.kind === "downloading"} onClick={onCheckForUpdates}>Check now</button>
                      <button className="rounded-[8px] border border-[var(--clipper-accent)] bg-[var(--clipper-accent)] px-3 py-2 text-xs font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)] disabled:cursor-not-allowed disabled:border-[#3b4150] disabled:bg-[#252a34] disabled:text-[#7f8490]" type="button" disabled={!updateActionEnabled} onClick={runUpdateAction}>{updateActionLabel}</button>
                    </div>
                  </div>
                </div>
              ) : activeSection === "playback" ? (
                <div className="grid gap-4 rounded-xl border border-[#363b47] bg-[#1b1e26] p-4">
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Prerender cache</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls whether Clipper prerenders frames around the playhead for smoother playback.</p>
                  </div>
                  <label className="flex w-full items-start justify-between gap-5 text-xs font-bold text-[#dfe2ea]" htmlFor="prerender-cache-toggle">
                    <span className="grid gap-1">
                      <span>Prerender frames around the playhead</span>
                      <span className="font-medium leading-5 text-[#8f939d]">Saves nearby preview frames in the project `.cache` folder for smoother playback.</span>
                    </span>
                    <Switch id="prerender-cache-toggle" className="mt-0.5" checked={prerenderCacheEnabled} onCheckedChange={onPrerenderCacheEnabledChange} />
                  </label>
                  {debugSettingsEnabled ? <label className="flex w-full items-start justify-between gap-5 text-xs font-bold text-[#dfe2ea]" htmlFor="prerender-cache-black-miss-debug-toggle">
                    <span className="grid gap-1">
                      <span className="flex items-center gap-2">Show black for uncached frames <span className="rounded-full border border-[#6f7684] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[#c5cad3]">Debug</span></span>
                      <span className="font-medium leading-5 text-[#8f939d]">Disables DOM fallback while prerender cache is enabled, making cache misses visible as black frames for stutter debugging.</span>
                    </span>
                    <Switch id="prerender-cache-black-miss-debug-toggle" className="mt-0.5" checked={prerenderCacheBlackMissDebug} onCheckedChange={onPrerenderCacheBlackMissDebugChange} />
                  </label> : null}
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Prerender block size</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls the time span rendered per cache block. Changing this clears the existing prerender cache.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="prerender-block-duration">
                    Block duration (ms)
                    <span className="relative">
                      <Input id="prerender-block-duration" className="pr-10" min={minPrerenderBlockDurationMs} max={maxPrerenderBlockDurationMs} step={10} type="number" value={prerenderBlockDurationMs} onChange={(event) => updatePrerenderBlockDuration(event.target.value)} />
                      <button aria-label={`Reset prerender block duration to ${defaultPrerenderBlockDurationMs}ms`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onPrerenderBlockDurationMsChange(defaultPrerenderBlockDurationMs)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Preview render resolution</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Keeps the actual preview render surface fixed while zoom controls only scale the displayed result. 1080 renders at 1920x1080.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="preview-render-resolution">
                    Render resolution
                    <span className="flex items-center gap-2">
                      <Select value={String(previewRenderHeight)} onValueChange={(value) => onPreviewRenderHeightChange(Number(value))}>
                        <SelectTrigger id="preview-render-resolution" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {previewRenderHeightOptions.map((height) => <SelectItem key={height} value={String(height)}>{previewRenderResolutionLabels.get(height)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button aria-label={`Reset preview render height to ${defaultPreviewRenderHeight}px`} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[#2d313b] text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onPreviewRenderHeightChange(defaultPreviewRenderHeight)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="flex w-full items-center justify-between gap-5">
                    <span className="grid gap-1 text-xs">
                      <strong className="text-sm text-white">All project caches</strong>
                      <span className="font-medium leading-5 text-[#8f939d]">Delete prerender cache folders for every project in the local projects directory.</span>
                    </span>
                    <button className="rounded-[8px] border border-[#5b6270] bg-transparent px-3 py-2 text-xs font-extrabold text-[#f7f7f8] transition hover:border-[#dfe2ea] hover:bg-white/10" type="button" onClick={onClearAllPrerenderCaches}>Clear all caches</button>
                  </div>
                </div>
              ) : activeSection === "timeline" ? (
                <div className="grid gap-4 rounded-xl border border-[#363b47] bg-[#1b1e26] p-4">
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Scrub playback behavior</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls whether dragging the timeline scrubber stops playback when released. Timeline clicks keep playback running.</p>
                  </div>
                  <label className="flex w-full items-start justify-between gap-5 text-xs font-bold text-[#dfe2ea]" htmlFor="pause-playback-on-scrub-toggle">
                    <span className="grid gap-1">
                      <span>Pause playback after scrubbing</span>
                      <span className="font-medium leading-5 text-[#8f939d]">When enabled, drag-scrubbing stops playback at the release time. Default: {defaultPausePlaybackOnScrub ? "on" : "off"}.</span>
                    </span>
                    <Switch id="pause-playback-on-scrub-toggle" className="mt-0.5" checked={pausePlaybackOnScrub} onCheckedChange={onPausePlaybackOnScrubChange} />
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">New marker duration</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Sets the default length for new motion markers dragged onto the timeline.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="new-marker-duration">
                    Duration (seconds)
                    <span className="relative">
                      <Input id="new-marker-duration" className="pr-10" min={0.1} max={60} step={0.1} type="number" value={markerDurationSeconds} onChange={(event) => updateMarkerDuration(event.target.value)} />
                      <button aria-label={`Reset new marker duration to ${defaultNewMarkerDurationSeconds}s`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onDefaultNewMarkerDurationSecondsChange(defaultNewMarkerDurationSeconds)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">End padding</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls how much blank timeline space appears after the scene. A value of 0.5 keeps the current 50% extra space.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="timeline-end-padding">
                    Padding fraction
                    <span className="relative">
                      <Input id="timeline-end-padding" className="pr-10" min={0} max={2} step={0.05} type="number" value={timelineEndPaddingFraction} onChange={(event) => updateTimelineEndPaddingFraction(event.target.value)} />
                      <button aria-label={`Reset timeline end padding to ${defaultTimelineEndPaddingFraction}`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onTimelineEndPaddingFractionChange(defaultTimelineEndPaddingFraction)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Scrub commit throttle</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls how often timeline scrubbing commits editor state while dragging. The playhead still follows the cursor immediately.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="scrub-commit-throttle">
                    Commit interval (ms)
                    <span className="relative">
                      <Input id="scrub-commit-throttle" className="pr-10" min={16} max={500} step={10} type="number" value={scrubCommitThrottleMs} onChange={(event) => updateScrubCommitThrottle(event.target.value)} />
                      <button aria-label={`Reset scrub commit throttle to ${defaultScrubCommitThrottleMs}ms`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onScrubCommitThrottleMsChange(defaultScrubCommitThrottleMs)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                  {liveDomPostProcessPreviewEnabled ? <>
                    <div className="h-px bg-[#363b47]" />
                    <div className="grid gap-1.5">
                      <strong className="text-sm text-white">Live DOM render throttle</strong>
                      <p className="text-xs leading-5 text-[#8f939d]">Because HTML-in-Canvas is unstable and still in Canary, throttle live rendering so the app stays usable and other features do not stall.</p>
                    </div>
                    <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="live-dom-postprocess-max-fps">
                      Max rendered FPS
                      <span className="relative">
                        <Input id="live-dom-postprocess-max-fps" className="pr-10" min={minLiveDomPostProcessMaxFps} max={maxLiveDomPostProcessMaxFps} step={1} type="number" value={liveDomPostProcessMaxFps} onChange={(event) => updateLiveDomPostProcessMaxFps(event.target.value)} />
                        <button aria-label={`Reset live DOM render throttle to ${defaultLiveDomPostProcessMaxFps}fps`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onLiveDomPostProcessMaxFpsChange(defaultLiveDomPostProcessMaxFps)}>
                          <RotateCcw size={14} />
                        </button>
                      </span>
                    </label>
                  </> : null}
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Position precision</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Sets the number of decimal places used when rounding marker and block positions. Higher values give finer control.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="timeline-precision">
                    Decimal places
                    <span className="relative">
                      <Input id="timeline-precision" className="pr-10" min={1} max={6} step={1} type="number" value={timelinePrecision} onChange={(event) => updateTimelinePrecision(event.target.value)} />
                      <button aria-label={`Reset timeline precision to ${defaultTimelinePrecision}`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onTimelinePrecisionChange(defaultTimelinePrecision)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                </div>
              ) : activeSection === "export" ? (
                <div className="grid gap-4 rounded-xl border border-[#363b47] bg-[#1b1e26] p-4">
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Stable slow fallback</strong>
                    <p className="max-w-full text-xs leading-5 text-[#8f939d]">Controls Stable slow grid capture. Smaller grids are slower but survive heavier 4K/8K DOM and SVG scenes.</p>
                  </div>
                  <label className="grid gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="stable-slow-grid-preset">
                    Grid fallback preset
                    <span className="grid max-w-[260px] grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2">
                      <Select value={stableSlowGridPreset} onValueChange={(value) => onStableSlowGridPresetChange(value as StableSlowGridPreset)}>
                        <SelectTrigger id="stable-slow-grid-preset" className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="relaxed">Relaxed</SelectItem>
                          <SelectItem value="balanced">Balanced</SelectItem>
                          <SelectItem value="safe">Safe</SelectItem>
                          <SelectItem value="extreme">Extreme</SelectItem>
                        </SelectContent>
                      </Select>
                      <button aria-label={`Reset stable slow grid fallback to ${defaultStableSlowGridPreset}`} className="grid h-9 w-9 place-items-center rounded-md border border-[#2d313b] text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onStableSlowGridPresetChange(defaultStableSlowGridPreset)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                    <span className="block max-w-full font-medium leading-5 text-[#8f939d]">{stableSlowGridPresetDescriptions[stableSlowGridPreset]}</span>
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="stable-slow-validation-samples">
                    Validation samples
                    <span className="relative block w-[260px] max-w-[260px]">
                      <Input id="stable-slow-validation-samples" className="pr-10" min={minStableSlowValidationSamples} max={maxStableSlowValidationSamples} step={1} type="number" value={stableSlowValidationSamples} onChange={(event) => updateStableSlowValidationSamples(event.target.value)} />
                      <button aria-label={`Reset stable slow validation samples to ${defaultStableSlowValidationSamples}`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onStableSlowValidationSamplesChange(defaultStableSlowValidationSamples)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                    <span className="block max-w-full font-medium leading-5 text-[#8f939d]">Repeated captures of each tile at the same pinned time; higher numbers catch unstable Chromium readback or animation drift.</span>
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Prerender capture tile height</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls prerender/cache capture only. Stable slow media export uses the grid fallback preset above, not this strip height.</p>
                  </div>
                  <label className="grid w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="video-export-tile-height">
                    Tile height (px)
                    <span className="relative">
                      <Input id="video-export-tile-height" className="pr-10" min={minVideoExportTileHeight} max={maxVideoExportTileHeight} step={1} type="number" value={videoExportTileHeight} onChange={(event) => updateVideoExportTileHeight(event.target.value)} />
                      <button aria-label={`Reset export tile height to ${defaultVideoExportTileHeight}px`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onVideoExportTileHeightChange(defaultVideoExportTileHeight)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Adaptive renderer tiles</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls the default Renderer pipeline for very large outputs. Stable slow ignores these counts and uses validated grid capture instead.</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <TileCountField id="export-tiles-hd" label="1920x1080 and below" value={exportTileMapping.hd} defaultValue={defaultExportTileMapping.hd} onChange={(value) => updateExportTileCount("hd", value)} onReset={() => onExportTileMappingChange({ ...exportTileMapping, hd: defaultExportTileMapping.hd })} />
                    <TileCountField id="export-tiles-qhd" label="2560x1440 and below" value={exportTileMapping.qhd} defaultValue={defaultExportTileMapping.qhd} onChange={(value) => updateExportTileCount("qhd", value)} onReset={() => onExportTileMappingChange({ ...exportTileMapping, qhd: defaultExportTileMapping.qhd })} />
                    <TileCountField id="export-tiles-uhd" label="3840x2160 and above" value={exportTileMapping.uhd} defaultValue={defaultExportTileMapping.uhd} onChange={(value) => updateExportTileCount("uhd", value)} onReset={() => onExportTileMappingChange({ ...exportTileMapping, uhd: defaultExportTileMapping.uhd })} />
                  </div>
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Renderer workers</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls hidden renderer processes for media export. Heavy 8K scenes should use fewer UHD workers; higher values are faster but multiply CPU, RAM, and Chromium tile memory.</p>
                  </div>
                  <label className="grid w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="export-worker-configuration-mode">
                    Configuration mode
                    <Select value={exportWorkerConfigurationMode} onValueChange={(value) => onExportWorkerConfigurationModeChange(value as ExportWorkerConfigurationMode)}>
                      <SelectTrigger id="export-worker-configuration-mode" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="separate">Separate</SelectItem>
                        <SelectItem value="unified">Unified</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  {exportWorkerConfigurationMode === "unified" ? (
                    <div className="grid w-[260px] gap-3">
                      <WorkerCountField id="export-workers-unified" label="All export resolutions" value={exportWorkerMapping.hd} defaultValue={defaultExportWorkerMapping.hd} onChange={updateUnifiedExportWorkerCount} onReset={() => onExportWorkerMappingChange({ hd: defaultExportWorkerMapping.hd, qhd: defaultExportWorkerMapping.hd, uhd: defaultExportWorkerMapping.hd })} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <WorkerCountField id="export-workers-hd" label="1920x1080 and below" value={exportWorkerMapping.hd} defaultValue={defaultExportWorkerMapping.hd} onChange={(value) => updateExportWorkerCount("hd", value)} onReset={() => onExportWorkerMappingChange({ ...exportWorkerMapping, hd: defaultExportWorkerMapping.hd })} />
                      <WorkerCountField id="export-workers-qhd" label="2560x1440 and below" value={exportWorkerMapping.qhd} defaultValue={defaultExportWorkerMapping.qhd} onChange={(value) => updateExportWorkerCount("qhd", value)} onReset={() => onExportWorkerMappingChange({ ...exportWorkerMapping, qhd: defaultExportWorkerMapping.qhd })} />
                      <WorkerCountField id="export-workers-uhd" label="3840x2160 and above" value={exportWorkerMapping.uhd} defaultValue={defaultExportWorkerMapping.uhd} onChange={(value) => updateExportWorkerCount("uhd", value)} onReset={() => onExportWorkerMappingChange({ ...exportWorkerMapping, uhd: defaultExportWorkerMapping.uhd })} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 rounded-xl border border-[#363b47] bg-[#1b1e26] p-4">
                  <div className="grid gap-1.5">
                    <strong className="text-sm text-white">Experimental preview</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls draft browser features used for live complex WebGL adjustment previews.</p>
                  </div>
                  <label className="flex w-full items-start justify-between gap-5 text-xs font-bold text-[#dfe2ea]" htmlFor="live-dom-postprocess-toggle">
                    <span className="grid gap-1">
                      <span>Use HTML-in-Canvas live post-process preview</span>
                        <span className="font-medium leading-5 text-[#8f939d]">Enables the experimental Canvas Draw Element path for live post-process previews on supported Chromium/Canary builds. Unsupported builds keep the normal DOM/cached fallback.</span>
                    </span>
                    <Switch id="live-dom-postprocess-toggle" className="mt-0.5" checked={liveDomPostProcessPreviewEnabled} onCheckedChange={onLiveDomPostProcessPreviewEnabledChange} />
                  </label>
                  {liveDomPostProcessPreviewEnabled !== liveDomPostProcessRuntimeEnabled ? <p className="rounded-lg border border-[#594531] bg-[#211a13] px-3 py-2 text-xs leading-5 text-[#dec39e]">Restart to apply settings.</p> : null}
                  <div className="h-px bg-[#363b47]" />
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <strong className="text-sm text-white">Debug settings</strong>
                      <p className="text-xs leading-5 text-[#8f939d]">Shows developer-only diagnostic controls in their relevant settings sections.</p>
                    </div>
                    <label className="flex w-full items-start justify-between gap-5 text-xs font-bold text-[#dfe2ea]" htmlFor="debug-settings-toggle">
                      <span className="grid gap-1">
                        <span>Enable debug settings</span>
                        <span className="font-medium leading-5 text-[#8f939d]">When turned off, debug controls are hidden and reset to their default values.</span>
                      </span>
                      <Switch id="debug-settings-toggle" className="mt-0.5" checked={debugSettingsEnabled} onCheckedChange={onDebugSettingsEnabledChange} />
                    </label>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-[#14161c] bg-[#202229] px-5">
              <span className="text-xs text-[#7f8490]">Shortcut: Cmd/Ctrl + ,</span>
              <button className="rounded-[9px] border border-[var(--clipper-accent)] bg-[var(--clipper-accent)] px-4 py-2 text-sm font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)]" onClick={() => onOpenChange(false)}>Save</button>
            </footer>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkerCountField({ id, label, value, defaultValue, onChange, onReset }: { id: string; label: string; value: number; defaultValue: number; onChange: (value: string) => void; onReset: () => void }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor={id}>
      {label}
      <span className="relative">
        <Input id={id} className="pr-10" min={minExportWorkerCount} max={maxExportWorkerCount} step={1} type="number" value={value} onChange={(event) => onChange(event.target.value)} />
        <button aria-label={`Reset ${label} workers to ${defaultValue}`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={onReset}>
          <RotateCcw size={14} />
        </button>
      </span>
    </label>
  );
}

function TileCountField({ id, label, value, defaultValue, onChange, onReset }: { id: string; label: string; value: number; defaultValue: number; onChange: (value: string) => void; onReset: () => void }) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor={id}>
      {label}
      <span className="relative">
        <Input id={id} className="pr-10" min={minExportTileCount} max={maxExportTileCount} step={1} type="number" value={value} onChange={(event) => onChange(event.target.value)} />
        <button aria-label={`Reset ${label} tiles to ${defaultValue}`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={onReset}>
          <RotateCcw size={14} />
        </button>
      </span>
    </label>
  );
}
