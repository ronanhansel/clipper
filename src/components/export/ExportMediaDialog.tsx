import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { appBarButtonBase, mutedCaps } from "../../app/config";
import type {
  ExportRenderQuality,
  MediaExportFormat,
  MediaExportRenderMode,
  VideoExportProgress,
} from "../../app/types";
import { formatTime } from "../../core/timeline";
import type { ProjectManifest } from "../../core/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

const RESOLUTION_OPTIONS: { label: string; width: number; height: number }[] = [
  { label: "1920 × 1080 (HD)", width: 1920, height: 1080 },
  { label: "2560 × 1440 (QHD)", width: 2560, height: 1440 },
  { label: "3840 × 2160 (4K)", width: 3840, height: 2160 },
];

const FRAME_RATE_OPTIONS = [24, 30, 60] as const;

const RENDER_QUALITY_OPTIONS: {
  label: string;
  value: ExportRenderQuality;
  scale: number;
}[] = [
  { label: "Standard", value: "standard", scale: 1 },
  { label: "High", value: "high", scale: 1.5 },
  { label: "Ultra", value: "ultra", scale: 2 },
];

const RENDER_MODE_OPTIONS: DropdownOption<MediaExportRenderMode>[] = [
  {
    label: "DrawElement",
    value: "renderer",
    description: "GPU/compositor capture with fallback",
    tooltip:
      "Uses the experimental canvas drawElementImage capture path first, then falls back to Clipper's adaptive full-frame or tiled capture if unsupported or unstable.",
  },
  {
    label: "Stable Slow",
    value: "stable-slow",
    description: "Validation-sampled tiled capture",
    tooltip:
      "Uses Clipper's validation-sampled tile grid for scenes that stress Chromium's compositor, such as dense SVG or heavy WebLayer compositions. It is slower, but verifies repeated captures for deterministic output.",
  },
];

const BASELINE_HD30_PIXELS_PER_SECOND = 1920 * 1080 * 30;

type DropdownOption<T extends string = string> = {
  label: string;
  value: T;
  description?: string;
  tooltip?: string;
};

export type ExportMediaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  sceneName: string;
  durationSeconds: number;
  resolution: ProjectManifest["resolution"];
  exportResolution: { width: number; height: number };
  onExportResolutionChange: (res: { width: number; height: number }) => void;
  exportFrameRate: number;
  onExportFrameRateChange: (fps: number) => void;
  exportRenderQuality: ExportRenderQuality;
  onExportRenderQualityChange: (quality: ExportRenderQuality) => void;
  mediaExportFormat: MediaExportFormat;
  onMediaExportFormatChange: (format: MediaExportFormat) => void;
  mediaExportRenderMode: MediaExportRenderMode;
  onMediaExportRenderModeChange: (mode: MediaExportRenderMode) => void;
  exporting: boolean;
  progress: string | null;
  onExport: () => void;
};

export function ExportMediaDialog({
  open,
  onOpenChange,
  projectName,
  sceneName,
  durationSeconds,
  resolution,
  exportResolution,
  onExportResolutionChange,
  exportFrameRate,
  onExportFrameRateChange,
  exportRenderQuality,
  onExportRenderQualityChange,
  mediaExportFormat,
  onMediaExportFormatChange,
  mediaExportRenderMode,
  onMediaExportRenderModeChange,
  exporting,
  progress,
  onExport,
}: ExportMediaDialogProps) {
  const mediaFormatOptions = buildMediaFormatOptions(
    exportResolution,
    exportFrameRate,
  );
  const renderQualityOptions = buildRenderQualityOptions(exportResolution);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>Render a video file.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2d313b] bg-[#171920] p-3">
            <ExportStat label="Project" value={projectName} />
            <ExportStat label="Scene" value={sceneName} />
            <ExportStat label="Duration" value={formatTime(durationSeconds)} />
            <ExportStatDropdown
              label="Resolution"
              value={`${exportResolution.width} × ${exportResolution.height}`}
              options={buildResolutionOptions(exportResolution, resolution)}
              selectedValue={formatResolutionKey(exportResolution)}
              onChange={(value) => {
                const [w, h] = value.split("x").map(Number);
                onExportResolutionChange({ width: w, height: h });
              }}
            />
            <ExportStatDropdown
              popoverMinWidth="130px"
              label="Frame rate"
              value={`${exportFrameRate} fps`}
              options={FRAME_RATE_OPTIONS.map((f) => ({
                label: `${f} fps`,
                value: String(f),
              }))}
              selectedValue={String(exportFrameRate)}
              onChange={(value) => onExportFrameRateChange(Number(value))}
            />
            <ExportStatDropdown
              popoverMinWidth="260px"
              label="Export format"
              value={
                mediaFormatOptions.find((o) => o.value === mediaExportFormat)
                  ?.label ?? "MOV ProRes 422 HQ"
              }
              options={mediaFormatOptions}
              selectedValue={mediaExportFormat}
              onChange={(value) =>
                onMediaExportFormatChange(value as MediaExportFormat)
              }
            />
            <ExportStatDropdown
              popoverMinWidth="260px"
              label="Render quality"
              value={
                renderQualityOptions.find(
                  (o) => o.value === exportRenderQuality,
                )?.label ?? "High"
              }
              options={renderQualityOptions}
              selectedValue={exportRenderQuality}
              onChange={(value) =>
                onExportRenderQualityChange(value as ExportRenderQuality)
              }
            />
            <ExportStatDropdown
              popoverMinWidth="260px"
              label="Export pipeline"
              value={
                RENDER_MODE_OPTIONS.find(
                  (o) => o.value === mediaExportRenderMode,
                )?.label ?? "DrawElement"
              }
              options={RENDER_MODE_OPTIONS}
              selectedValue={mediaExportRenderMode}
              onChange={(value) =>
                onMediaExportRenderModeChange(value as MediaExportRenderMode)
              }
            />
          </div>

          {progress ? (
            <span className="block whitespace-pre-line rounded-lg bg-[#10131a] px-3 py-2 text-xs font-bold text-[var(--clipper-accent-strong)]">
              {progress}
            </span>
          ) : null}
        </div>

        <DialogFooter>
          <button
            className={`${appBarButtonBase} w-[96px] px-3 py-2 text-sm`}
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            className="inline-flex w-[112px] items-center justify-center rounded-[9px] border border-[var(--clipper-accent)] bg-[var(--clipper-accent)] px-3 py-2 text-sm font-extrabold text-[var(--clipper-accent-foreground)] transition hover:bg-[var(--clipper-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? "Working" : "Render"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportStat({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-[#1c1f28]/70 p-2">
      <span className={mutedCaps}>{label}</span>
      <strong
        className={`mt-1 block truncate text-sm ${warning ? "text-[#ffbf66]" : "text-[#c8cdd6]"}`}
      >
        {value}
      </strong>
    </div>
  );
}

function ExportStatDropdown({
  label,
  value,
  options,
  selectedValue,
  onChange,
  popoverMinWidth = "200px",
}: {
  label: string;
  value: string;
  options: DropdownOption[];
  selectedValue: string;
  onChange: (value: string) => void;
  popoverMinWidth?: string;
}) {
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
        <strong className="mt-1 block truncate text-sm text-white">
          {value}
        </strong>
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 z-[91] mt-1 max-h-[min(320px,calc(100vh-160px))] min-w-[var(--stat-popover-min-w)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-[#2d313b] bg-[#15171e] p-1 shadow-[0_18px_60px_rgba(0,0,0,0.45)]"
            style={{ "--stat-popover-min-w": popoverMinWidth } as CSSProperties}
          >
            <TooltipProvider delayDuration={400} skipDelayDuration={100}>
              {options.map((opt) => {
                const item = (
                  <button
                    key={opt.value}
                    className={`flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-xs font-bold transition ${opt.value === selectedValue ? "text-[var(--clipper-accent-strong)]" : "text-[#dfe2ea] hover:bg-[#20232c] hover:text-white"}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="whitespace-nowrap">{opt.label}</span>
                      {opt.description ? (
                        <span className="whitespace-nowrap text-[10px] font-semibold text-[#8e929d]">
                          {opt.description}
                        </span>
                      ) : null}
                    </span>
                    {opt.value === selectedValue ? (
                      <span className="text-[var(--clipper-accent-strong)]">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );

                if (!opt.tooltip) return item;

                return (
                  <Tooltip key={opt.value}>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      align="center"
                      className="max-w-[240px]"
                    >
                      {opt.tooltip}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </>
      ) : null}
    </div>
  );
}

export type VideoExportOverlayProps = {
  progress: VideoExportProgress | null;
  isCancelling?: boolean;
  onCancel: () => void;
};

export function VideoExportOverlay({
  progress,
  isCancelling,
  onCancel,
}: VideoExportOverlayProps) {
  if (!progress) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col items-center gap-6 p-8 text-center">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">
            {isCancelling ? "Cancelling Export..." : "Exporting Media..."}
          </h2>
          <p className="text-sm text-white/60">
            {progress.status ||
              `Frame ${progress.frame} of ${progress.totalFrames}`}
          </p>
        </div>

        {!isCancelling && (
          <button
            className={
              appBarButtonBase +
              " border border-white/20 bg-white/5 px-6 py-2 text-white/80 hover:bg-white/10"
            }
            onClick={onCancel}
          >
            Cancel Export
          </button>
        )}
      </div>
    </div>
  );
}

function buildResolutionOptions(
  current: { width: number; height: number },
  project: { width: number; height: number },
): { label: string; value: string }[] {
  const seen = new Set<string>();
  const result: { label: string; value: string }[] = [];

  const add = (label: string, r: { width: number; height: number }) => {
    const key = formatResolutionKey(r);
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ label, value: key });
  };

  add(`${project.width} × ${project.height} (Project)`, project);

  for (const opt of RESOLUTION_OPTIONS) {
    add(opt.label, opt);
  }

  return result;
}

function formatResolutionKey(r: { width: number; height: number }) {
  return `${r.width}x${r.height}`;
}

function buildRenderQualityOptions(resolution: {
  width: number;
  height: number;
}): DropdownOption<ExportRenderQuality>[] {
  return RENDER_QUALITY_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
    description: `${option.scale}× supersample, internal ${Math.round(resolution.width * option.scale)} × ${Math.round(resolution.height * option.scale)}`,
  }));
}

function buildMediaFormatOptions(
  resolution: { width: number; height: number },
  frameRate: number,
): DropdownOption<MediaExportFormat>[] {
  const scale =
    (resolution.width * resolution.height * frameRate) /
    BASELINE_HD30_PIXELS_PER_SECOND;
  return [
    {
      label: "MP4 H.264 Fast",
      value: "mp4",
      description: formatEstimatedDataRate(1.5 * scale),
    },
    {
      label: "MP4 H.264 HQ",
      value: "h264-high",
      description: formatEstimatedDataRate(2.25 * scale),
    },
    {
      label: "WebM (VP9)",
      value: "webm",
      description: formatEstimatedDataRate(1.2 * scale),
    },
    {
      label: "MOV ProRes 422 HQ",
      value: "prores-422-hq",
      description: formatEstimatedDataRate(27.5 * scale),
    },
    {
      label: "MOV ProRes 4444",
      value: "prores-4444",
      description: formatEstimatedDataRate(41.25 * scale),
    },
    {
      label: "MOV DNxHR HQX",
      value: "dnxhr-hqx",
      description: formatEstimatedDataRate(27.5 * scale),
    },
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
