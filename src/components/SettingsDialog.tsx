import { RotateCcw } from "lucide-react";
import { appBarButtonBase, defaultLiveDomPostProcessMaxFps, defaultNewMarkerDurationSeconds, defaultPausePlaybackOnScrub, defaultPrerenderBlockDurationMs, defaultScrubCommitThrottleMs, defaultTimelineEndPaddingFraction, defaultTimelinePrecision, defaultVideoExportTileHeight, maxLiveDomPostProcessMaxFps, maxPrerenderBlockDurationMs, maxVideoExportTileHeight, minLiveDomPostProcessMaxFps, minPrerenderBlockDurationMs, minVideoExportTileHeight } from "../app/config";
import type { SettingsSection } from "../app/types";
import { clamp } from "../core/math";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

export function SettingsDialog({ activeSection, debugSettingsEnabled, liveDomPostProcessPreviewEnabled, liveDomPostProcessRuntimeEnabled, liveDomPostProcessMaxFps, open, pausePlaybackOnScrub, prerenderCacheBlackMissDebug, prerenderCacheEnabled, prerenderBlockDurationMs, scrubCommitThrottleMs, defaultNewMarkerDurationSeconds: markerDurationSeconds, timelineEndPaddingFraction, timelinePrecision, videoExportTileHeight, onActiveSectionChange, onDebugSettingsEnabledChange, onLiveDomPostProcessPreviewEnabledChange, onLiveDomPostProcessMaxFpsChange, onOpenChange, onPausePlaybackOnScrubChange, onPrerenderCacheBlackMissDebugChange, onPrerenderCacheEnabledChange, onPrerenderBlockDurationMsChange, onClearAllPrerenderCaches, onScrubCommitThrottleMsChange, onDefaultNewMarkerDurationSecondsChange, onTimelineEndPaddingFractionChange, onTimelinePrecisionChange, onVideoExportTileHeightChange }: { activeSection: SettingsSection; debugSettingsEnabled: boolean; liveDomPostProcessPreviewEnabled: boolean; liveDomPostProcessRuntimeEnabled: boolean; liveDomPostProcessMaxFps: number; open: boolean; pausePlaybackOnScrub: boolean; prerenderCacheBlackMissDebug: boolean; prerenderCacheEnabled: boolean; prerenderBlockDurationMs: number; scrubCommitThrottleMs: number; defaultNewMarkerDurationSeconds: number; timelineEndPaddingFraction: number; timelinePrecision: number; videoExportTileHeight: number; onActiveSectionChange: (section: SettingsSection) => void; onDebugSettingsEnabledChange: (enabled: boolean) => void; onLiveDomPostProcessPreviewEnabledChange: (enabled: boolean) => void; onLiveDomPostProcessMaxFpsChange: (value: number) => void; onOpenChange: (open: boolean) => void; onPausePlaybackOnScrubChange: (enabled: boolean) => void; onPrerenderCacheBlackMissDebugChange: (enabled: boolean) => void; onPrerenderCacheEnabledChange: (enabled: boolean) => void; onPrerenderBlockDurationMsChange: (value: number) => void; onClearAllPrerenderCaches: () => void; onScrubCommitThrottleMsChange: (value: number) => void; onDefaultNewMarkerDurationSecondsChange: (value: number) => void; onTimelineEndPaddingFractionChange: (value: number) => void; onTimelinePrecisionChange: (value: number) => void; onVideoExportTileHeightChange: (value: number) => void }) {
  const navItems: Array<{ id: SettingsSection; label: string }> = [
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

  function updatePrerenderBlockDuration(value: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    onPrerenderBlockDurationMsChange(Math.round(clamp(parsed, minPrerenderBlockDurationMs, maxPrerenderBlockDurationMs)));
  }

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
                <p className="mt-1 text-xs text-[#8f939d]">{activeSection === "playback" ? "Control preview and playback diagnostics." : activeSection === "timeline" ? "Tune timeline interaction responsiveness." : activeSection === "export" ? "Tune video rendering and capture behavior." : "Configure experimental and developer-facing editor behavior."}</p>
              </div>
              <button className={`${appBarButtonBase} px-3 py-1.5`} onClick={() => onOpenChange(false)}>Close</button>
            </header>

            <div className="settings-scrollbar min-h-0 overflow-y-auto overflow-x-hidden p-5 [scrollbar-gutter:stable]">
              {activeSection === "playback" ? (
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
                    <strong className="text-sm text-white">Capture tile height</strong>
                    <p className="text-xs leading-5 text-[#8f939d]">Controls the fixed vertical tile height used when reading frames from the hidden export renderer. Lower values create more readbacks; higher values create fewer, larger readbacks.</p>
                  </div>
                  <label className="grid max-w-[260px] gap-1.5 text-xs font-bold text-[#dfe2ea]" htmlFor="video-export-tile-height">
                    Tile height (px)
                    <span className="relative">
                      <Input id="video-export-tile-height" className="pr-10" min={minVideoExportTileHeight} max={maxVideoExportTileHeight} step={1} type="number" value={videoExportTileHeight} onChange={(event) => updateVideoExportTileHeight(event.target.value)} />
                      <button aria-label={`Reset export tile height to ${defaultVideoExportTileHeight}px`} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#8f939d] transition hover:bg-[#252a34] hover:text-white" type="button" onClick={() => onVideoExportTileHeightChange(defaultVideoExportTileHeight)}>
                        <RotateCcw size={14} />
                      </button>
                    </span>
                  </label>
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
                      <span className="font-medium leading-5 text-[#8f939d]">Enables the experimental Canvas Draw Element path for live Lense previews on supported Chromium/Canary builds. Unsupported builds keep the normal DOM/cached fallback.</span>
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
