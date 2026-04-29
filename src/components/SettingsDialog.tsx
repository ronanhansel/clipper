import { RotateCcw } from "lucide-react";
import { appBarButtonBase, defaultNewMarkerDurationSeconds, defaultScrubCommitThrottleMs, defaultTimelineEndPaddingFraction } from "../app/config";
import type { SettingsSection } from "../app/types";
import { clamp } from "../core/math";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";

export function SettingsDialog({ activeSection, open, scrubCommitThrottleMs, defaultNewMarkerDurationSeconds: markerDurationSeconds, timelineEndPaddingFraction, onActiveSectionChange, onOpenChange, onScrubCommitThrottleMsChange, onDefaultNewMarkerDurationSecondsChange, onTimelineEndPaddingFractionChange }: { activeSection: SettingsSection; open: boolean; scrubCommitThrottleMs: number; defaultNewMarkerDurationSeconds: number; timelineEndPaddingFraction: number; onActiveSectionChange: (section: SettingsSection) => void; onOpenChange: (open: boolean) => void; onScrubCommitThrottleMsChange: (value: number) => void; onDefaultNewMarkerDurationSecondsChange: (value: number) => void; onTimelineEndPaddingFractionChange: (value: number) => void }) {
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
                <p className="mt-1 text-xs text-[#8f939d]">{activeSection === "timeline" ? "Tune timeline interaction responsiveness." : "Settings for this section will be added as the editor grows."}</p>
              </div>
              <button className={`${appBarButtonBase} px-3 py-1.5`} onClick={() => onOpenChange(false)}>Close</button>
            </header>

            <div className="settings-scrollbar min-h-0 overflow-y-auto overflow-x-hidden p-5 [scrollbar-gutter:stable]">
              {activeSection === "timeline" ? (
                <div className="grid gap-4 rounded-xl border border-[#363b47] bg-[#1b1e26] p-4">
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
                </div>
              ) : <div className="grid h-full place-items-center rounded-xl border border-dashed border-[#363b47] bg-[#1b1e26] text-center">
                <div className="max-w-[320px] px-6">
                  <strong className="text-sm text-white">No controls yet</strong>
                  <p className="mt-2 text-xs leading-5 text-[#8f939d]">Preview caching controls were removed. This settings shell is ready for future editor, export, and diagnostic preferences.</p>
                </div>
              </div>}
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
